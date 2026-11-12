-- V4.445 · الدفعة 2أ: تقارير وشاشات قراءة الحسابات العامة ⇒ Postgres (نفس مخرجات Accounts.gs حرفياً).
-- الميزانية · قائمة الدخل · الربحية · التدفق النقدي · أعمار الديون · الدفعات · سجل كشوف الحساب · سجل القيد · الأرصدة الافتتاحية
-- · القيود المكررة المعرّف (المفتاح الأساسي يمنعها في Postgres ⇒ قائمة فارغة) · السطور اليتيمة.
-- المصدر: gl_lines.raw/gl_entries.raw (005) + gl_aux.accounts + gl_settings + store_rows (gl_batches/gl_statements) + audit_log (065).
-- يتطلب: 002 · 003 · 004 · 005 · 065.

-- = _glPostedLines_ (سطور «مرحّل» مع نوع القيد ومفتاح التاريخ)
create or replace function _glr_lines() returns table (ord bigint, eid text, k text, acc text, cur text, d float8, c float8, bd float8, bc float8, trip text, company text, client text, etype text)
language sql stable set search_path = public as
$$ select l.ord, _glx_str(l.raw -> 0), _glx_dkey(_glx_date(l.raw -> 2)), _glx_str(l.raw -> 4), _glx_cur(l.raw -> 7), _glx_num(l.raw -> 5), _glx_num(l.raw -> 6), _glx_num(l.raw -> 9), _glx_num(l.raw -> 10),
          _glx_str(l.raw -> 11), _glx_str(l.raw -> 12), _glx_str(l.raw -> 13), coalesce(_glx_str(e.raw -> 3), '')
     from gl_lines l left join gl_entries e on e.entry_id = l.entry_id
    where l.status = 'مرحّل' $$;
create or replace function _glr_k(s text) returns text language sql stable as $$ select _glx_dkey(_glx_date(to_jsonb(coalesce(s, '')))) $$;
create or replace function _glr_kd(k text) returns text language sql immutable as $$ select case when coalesce(k, '') = '' then '' else substr(k, 7, 2) || '/' || substr(k, 5, 2) || '/' || substr(k, 1, 4) end $$;
create or replace function _glr_cobj(e float8, s float8, u float8) returns jsonb language sql immutable as $$ select jsonb_build_object('EGP', _glx_r2(coalesce(e, 0)), 'SAR', _glx_r2(coalesce(s, 0)), 'USD', _glx_r2(coalesce(u, 0))) $$;

-- ===== الميزانية العمومية =====
create or replace function rx2_glbalancesheet(a jsonb, u text) returns jsonb language plpgsql stable set search_path = public as
$$ declare tk text := _glr_k(a ->> 1); v_acc jsonb; pl float8; ta float8; tl float8; te float8; begin
  perform _glx_need('rep'); perform _glx_guard();
  with l as (select * from _glr_lines() where tk = '' or k <= tk)
  select (select coalesce(jsonb_object_agg(acc, jsonb_build_object('base', b, 'cur', _glr_cobj(ce, cs, cu))), '{}'::jsonb)
            from (select acc, _glx_acc(bd, bc order by ord) b, _glx_acc(d, c order by ord) filter (where cur = 'EGP') ce, _glx_acc(d, c order by ord) filter (where cur = 'SAR') cs,
                    _glx_acc(d, c order by ord) filter (where cur = 'USD') cu from l where acc !~ '^[45]' group by acc) x),
         coalesce((select -sum(bd - bc order by ord) from l where acc ~ '^[45]'), 0)
    into v_acc, pl;
  select coalesce(sum((v ->> 'base')::float8) filter (where left(k, 1) = '1'), 0), coalesce(-sum((v ->> 'base')::float8) filter (where left(k, 1) = '2'), 0), coalesce(-sum((v ->> 'base')::float8) filter (where left(k, 1) = '3'), 0)
    into ta, tl, te from jsonb_each(v_acc) q(k, v);
  pl := _glx_r2(pl);
  return jsonb_build_object('success', true, 'accounts', v_acc, 'profit', pl, 'assets', _glx_r2(ta), 'liabs', _glx_r2(tl), 'equity', _glx_r2(te + pl), 'balanced', abs(_glx_r2(ta - tl - te - pl)) < 0.1); end $$;

-- ===== قائمة الدخل =====
create or replace function rx2_glincomestatement(a jsonb, u text) returns jsonb language plpgsql stable set search_path = public as
$$ declare fk text := _glr_k(a ->> 1); tk text := _glr_k(a ->> 2); f jsonb := coalesce(a -> 3, '{}'::jsonb); v_acc jsonb; rv float8; ex float8; trs jsonb; cos jsonb; begin
  perform _glx_need('rep'); perform _glx_guard();
  with t as (select * from _glr_lines() where acc ~ '^[45]' and etype <> 'قيد إقفال')
  select (select coalesce(jsonb_agg(trip order by trip collate "C"), '[]'::jsonb) from (select distinct trip from t where trip <> '') z),
         (select coalesce(jsonb_agg(company order by company collate "C"), '[]'::jsonb) from (select distinct company from t where company <> '') z),
         (select coalesce(jsonb_object_agg(acc, jsonb_build_object('base', b, 'cur', _glr_cobj(ce, cs, cu))), '{}'::jsonb) from (
            select acc, _glx_acc(case when left(acc, 1) = '4' then bc else bd end, case when left(acc, 1) = '4' then bd else bc end order by ord) b,
                   _glx_acc(case when left(acc, 1) = '4' then c else d end, case when left(acc, 1) = '4' then d else c end order by ord) filter (where cur = 'EGP') ce,
                   _glx_acc(case when left(acc, 1) = '4' then c else d end, case when left(acc, 1) = '4' then d else c end order by ord) filter (where cur = 'SAR') cs,
                   _glx_acc(case when left(acc, 1) = '4' then c else d end, case when left(acc, 1) = '4' then d else c end order by ord) filter (where cur = 'USD') cu
              from t where (fk = '' or k >= fk) and (tk = '' or k <= tk)
               and (coalesce(f ->> 'trip', '') = '' or trip = f ->> 'trip') and (coalesce(f ->> 'company', '') = '' or company = f ->> 'company') and (coalesce(f ->> 'client', '') = '' or client = f ->> 'client')
             group by acc) x)
    into trs, cos, v_acc;
  select coalesce(sum((v ->> 'base')::float8) filter (where left(k, 1) = '4'), 0), coalesce(sum((v ->> 'base')::float8) filter (where left(k, 1) <> '4'), 0) into rv, ex from jsonb_each(v_acc) q(k, v);
  return jsonb_build_object('success', true, 'accounts', v_acc, 'revenue', _glx_r2(rv), 'expenses', _glx_r2(ex), 'net', _glx_r2(rv - ex), 'trips', trs, 'companies', cos); end $$;

-- ===== الربحية حسب الرحلة/الشركة/العميل =====
create or replace function rx2_glprofitability(a jsonb, u text) returns jsonb language plpgsql stable set search_path = public as
$$ declare fk text := _glr_k(a ->> 1); tk text := _glr_k(a ->> 2); by_ text := case when a ->> 3 in ('company', 'client') then a ->> 3 else 'trip' end;
  disc text := coalesce(nullif(_glw_setting('auto_acc_disc'), ''), '4199'); rows_ jsonb; begin
  perform _glx_need('rep'); perform _glx_guard();
  with l as (select case by_ when 'company' then company when 'client' then client else trip end g, acc, bc - bd b from _glr_lines()
              where acc ~ '^[45]' and etype <> 'قيد إقفال' and (fk = '' or k >= fk) and (tk = '' or k <= tk)),
       s as (select g, sum(b) filter (where left(acc, 1) = '4' and acc <> '46' and acc <> disc) rev, -sum(b) filter (where left(acc, 1) = '4' and acc = disc and acc <> '46') disc_,
                    -sum(b) filter (where left(acc, 1) <> '4' and acc like '51%') dir, -sum(b) filter (where (left(acc, 1) = '4' and acc = '46') or (left(acc, 1) <> '4' and acc not like '51%')) oth
               from l group by g),
       ba as (select g, jsonb_object_agg(acc, v) m from (select g, acc, _glx_r2(sum(case when left(acc, 1) = '4' then b else -b end)) v from l group by g, acc) z group by g),
       o as (select s.g, _glx_r2(coalesce(rev, 0)) rev, _glx_r2(coalesce(disc_, 0)) disc_, _glx_r2(coalesce(dir, 0)) dir, _glx_r2(coalesce(oth, 0)) oth, ba.m from s join ba using (g))
  select coalesce(jsonb_agg(jsonb_build_object('key', g, 'rev', rev, 'disc', disc_, 'direct', dir, 'other', oth, 'byAcc', m, 'netRev', _glx_r2(rev - disc_), 'gross', _glx_r2(_glx_r2(rev - disc_) - dir),
           'net', _glx_r2(_glx_r2(_glx_r2(rev - disc_) - dir) - oth), 'margin', case when _glx_r2(rev - disc_) <> 0 then (round((_glx_r2(_glx_r2(rev - disc_) - dir) / _glx_r2(rev - disc_) * 1000)::numeric) / 10)::float8 else 0 end)
         order by _glx_r2(rev - disc_) desc), '[]'::jsonb) into rows_ from o;
  return jsonb_build_object('success', true, 'by', by_, 'rows', rows_); end $$;

-- ===== التدفق النقدي =====
create or replace function _glr_cat(code text) returns text language sql immutable as
$$ select coalesce((select n from (values (1, '12', 'تحصيلات من العملاء'), (2, '1103', 'تسويات دفعات شاشات البرنامج'), (3, '16', 'رسوم الغرفة'), (4, '14', 'دفعات مقدمة'), (5, '21', 'مدفوعات الوكلاء والموردين'),
     (6, '22', 'مستحقات أخرى'), (7, '23', 'دفعات مقدمة من العملاء'), (8, '24', 'خصوم أخرى'), (9, '3', 'الشركاء ورأس المال'), (10, '4', 'إيرادات أخرى'), (11, '51', 'تكاليف مباشرة'), (12, '52', 'مصروفات عمومية وإدارية'),
     (13, '53', 'فروق عملة'), (14, '5', 'مصروفات أخرى'), (15, '15', 'تحويل العملات والأصول الأخرى'), (16, '1', 'أصول أخرى'), (17, '2', 'خصوم أخرى')) v(o, p, n) where starts_with(code, p) order by o limit 1), 'أخرى') $$;
create or replace function rx2_glcashflow(a jsonb, u text) returns jsonb language plpgsql stable set search_path = public as
$$ declare fk text := _glr_k(a ->> 1); tk text := _glr_k(a ->> 2); accs jsonb := _glx_aux('accounts'); bx jsonb; ct jsonb; begin
  perform _glx_need('rep'); perform _glx_guard();
  with cf as materialized (select l.*, coalesce(not coalesce((accs -> l.acc ->> 'isGroup')::boolean, false) and accs -> l.acc ->> 'kind' in ('safe', 'bank', 'custody'), false) cash
                             from _glr_lines() l where tk = '' or l.k <= tk),
       bxs as (select acc, cur, coalesce(sum(d - c order by ord) filter (where fk <> '' and k < fk), 0) op, coalesce(sum(d order by ord) filter (where not (fk <> '' and k < fk)), 0) i,
                      coalesce(sum(c order by ord) filter (where not (fk <> '' and k < fk)), 0) o from cf where cash group by acc, cur),
       p as (select * from cf where not (fk <> '' and k < fk)),
       e as (select eid, sum(bd - bc) filter (where cash) cn, sum(bc - bd) filter (where not cash) ot, count(*) filter (where not cash) no from p group by eid),
       sh as (select _glr_cat(p.acc) cat, case when abs(e.ot) > 0.005 then (p.bc - p.bd) / e.ot * e.cn else e.cn / e.no end s
                from p join e using (eid) where not p.cash and abs(coalesce(e.cn, 0)) >= 0.005 and e.no > 0),
       g as (select cat, _glx_r2(coalesce(sum(s) filter (where s >= 0), 0)) i, _glx_r2(coalesce(-sum(s) filter (where s < 0), 0)) o from sh group by cat)
  select (select coalesce(jsonb_agg(jsonb_build_object('account', acc, 'currency', cur, 'open', _glx_r2(op), 'inn', _glx_r2(i), 'out', _glx_r2(o), 'close', _glx_r2(_glx_r2(op) + _glx_r2(i) - _glx_r2(o)),
           'name', coalesce(accs -> acc ->> 'name', acc), 'kind', coalesce(accs -> acc ->> 'kind', '')) order by acc collate "C"), '[]'::jsonb) from bxs),
         (select coalesce(jsonb_agg(jsonb_build_object('cat', cat, 'inn', i, 'out', o, 'net', _glx_r2(i - o)) order by abs(_glx_r2(i - o)) desc), '[]'::jsonb) from g)
    into bx, ct;
  return jsonb_build_object('success', true, 'boxes', bx, 'cats', ct); end $$;

-- ===== أعمار الديون (FIFO مع الدفعات المقدمة) =====
create or replace function rx2_glaging(a jsonb, u text) returns jsonb language plpgsql stable set search_path = public as
$$ declare kd text := case when a ->> 2 = 'agent' then 'agent' else 'client' end; tk text := coalesce(nullif(_glr_k(a ->> 1), ''), to_char(now() at time zone 'Africa/Cairo', 'YYYYMMDD'));
  asd date := to_date(tk, 'YYYYMMDD'); accs jsonb := _glx_aux('accounts'); g record; l record; sg float8 := case when kd = 'client' then 1 else -1 end;
  opk text[]; opa float8[]; adv float8; x float8; pay float8; uu float8; bk float8[]; tot float8; i int; dd int; rows_ jsonb := '[]'::jsonb; begin
  perform _glx_need('stmt'); perform _glx_guard();
  for g in select acc, cur from _glr_lines() where k <= tk and accs ? acc and ((kd = 'client' and acc like '12%' and accs -> acc ->> 'kind' = 'client') or (kd = 'agent' and acc like '21%')) group by acc, cur loop
    opk := '{}'; opa := '{}'; adv := 0;
    for l in select k, d, c from _glr_lines() where acc = g.acc and cur = g.cur and k <= tk order by k collate "C", ord loop
      x := sg * (l.d - l.c);
      if x > 0 then
        if adv > 0 then uu := least(adv, x); adv := adv - uu; x := x - uu; end if;
        if x > 0.004 then opk := opk || l.k; opa := opa || x; end if;
      elsif x < 0 then
        pay := -x;
        while pay > 0.004 and coalesce(array_length(opa, 1), 0) > 0 loop
          uu := least(opa[1], pay); opa[1] := opa[1] - uu; pay := pay - uu;
          if opa[1] <= 0.004 then opa := opa[2:]; opk := opk[2:]; end if;
        end loop;
        if pay > 0.004 then adv := adv + pay; end if;
      end if;
    end loop;
    bk := array[0, 0, 0, 0, 0]::float8[]; tot := 0;
    for i in 1 .. coalesce(array_length(opa, 1), 0) loop
      dd := asd - to_date(opk[i], 'YYYYMMDD');
      bk[case when dd <= 30 then 1 when dd <= 60 then 2 when dd <= 90 then 3 when dd <= 180 then 4 else 5 end] := bk[case when dd <= 30 then 1 when dd <= 60 then 2 when dd <= 90 then 3 when dd <= 180 then 4 else 5 end] + opa[i];
      tot := tot + opa[i];
    end loop;
    tot := _glx_r2(tot - adv);
    if abs(tot) < 0.005 and adv < 0.005 then continue; end if;
    rows_ := rows_ || jsonb_build_array(jsonb_build_object('account', g.acc, 'name', coalesce(accs -> g.acc ->> 'name', g.acc), 'currency', g.cur, 'total', tot,
      'buckets', jsonb_build_array(_glx_r2(bk[1]), _glx_r2(bk[2]), _glx_r2(bk[3]), _glx_r2(bk[4]), _glx_r2(bk[5])), 'advance', _glx_r2(adv),
      'oldest', case when coalesce(array_length(opk, 1), 0) > 0 then _glr_kd(opk[1]) else '' end));
  end loop;
  select coalesce(jsonb_agg(r order by (r ->> 'total')::float8 desc), '[]'::jsonb) into rows_ from jsonb_array_elements(rows_) r;
  return jsonb_build_object('success', true, 'kind', kd, 'asOf', _glr_kd(tk), 'rows', rows_, 'labels', jsonb_build_array('0–30 يوم', '31–60', '61–90', '91–180', 'أكثر من 180')); end $$;

-- ===== الدفعات · سجل كشوف الحساب · سجل القيد =====
create or replace function rx2_gllistbatches(a jsonb, u text) returns jsonb language plpgsql stable set search_path = public as
$$ begin
  perform _glx_need('');
  return jsonb_build_object('success', true, 'batches', coalesce((select jsonb_agg(jsonb_build_object('id', _glx_str(_rx_c(raw, 0)), 'type', _glx_str(_rx_c(raw, 1)), 'note', _glx_str(_rx_c(raw, 2)),
    'count', _rx_c(raw, 3), 'status', _glx_str(_rx_c(raw, 4)), 'by', _glx_str(_rx_c(raw, 5)), 'at', _glx_str(_rx_c(raw, 6))) order by rn desc) from _rx_rows('gl_batches')), '[]'::jsonb)); end $$;
create or replace function rx2_glstmtlog(a jsonb, u text) returns jsonb language plpgsql stable set search_path = public as
$$ declare cd text := _glx_trim(coalesce(a ->> 1, '')); begin
  perform _glx_need('stmt');
  return jsonb_build_object('success', true, 'rows', coalesce((select jsonb_agg(o order by rn desc) from (select rn, jsonb_build_object('serial', _glx_str(_rx_c(raw, 0)), 'at', _glx_str(_rx_c(raw, 1)), 'by', _glx_str(_rx_c(raw, 2)),
    'code', _glx_str(_rx_c(raw, 3)), 'name', _glx_str(_rx_c(raw, 4)), 'from', _glx_str(_rx_c(raw, 5)), 'to', _glx_str(_rx_c(raw, 6)), 'balances', _glx_str(_rx_c(raw, 7)), 'output', _glx_str(_rx_c(raw, 8))) o
    from _rx_rows('gl_statements') where cd = '' or _glx_str(_rx_c(raw, 3)) = cd order by rn desc limit 300) z), '[]'::jsonb)); end $$;
create or replace function rx2_glentryhistory(a jsonb, u text) returns jsonb language plpgsql stable set search_path = public as
$$ begin
  perform _glx_need('');
  return jsonb_build_object('success', true, 'rows', coalesce((select jsonb_agg(jsonb_build_object('timestamp', coalesce(ts, ''), 'username', coalesce(nullif(who, ''), '-'), 'action', coalesce(nullif(act, ''), '-'),
    'field', coalesce(nullif(fld, ''), '-'), 'oldValue', coalesce(nullif(ov, ''), '-'), 'newValue', coalesce(nullif(nv, ''), '-')) order by t desc) from _aud_hist('GL:' || _glx_trim(coalesce(a ->> 1, '')))), '[]'::jsonb)); end $$;

-- ===== الأرصدة الافتتاحية لحساب =====
create or replace function rx2_glopeninginfo(a jsonb, u text) returns jsonb language plpgsql stable set search_path = public as
$$ declare cd text := _glx_trim(coalesce(a ->> 1, '')); ac jsonb := _glx_aux('accounts') -> _glx_trim(coalesce(a ->> 1, '')); begin
  perform _glx_need(''); perform _glx_guard();
  if ac is null or coalesce((ac ->> 'isGroup')::boolean, false) then raise exception 'اختر حساباً فرعياً' using errcode = 'P0001'; end if;
  return jsonb_build_object('success', true, 'account', jsonb_build_object('code', ac ->> 'code', 'name', ac ->> 'name', 'kind', coalesce(ac ->> 'kind', ''), 'currency', coalesce(ac ->> 'currency', '')),
    'startDate', _glw_setting('startDate'), 'lockDate', _glw_setting('lockDate'), 'diffAcc', '34',
    'lines', coalesce((select jsonb_agg(jsonb_build_object('id', _glx_str(e.raw -> 0), 'date', _glx_date(e.raw -> 2), 'status', _glx_str(e.raw -> 5), 'auto', _glx_str(e.raw -> 6) like 'AUTO:%', 'sk', _glx_str(e.raw -> 6),
        'desc', _glx_clean(coalesce(nullif(_glx_str(l.raw -> 15), ''), _glx_str(e.raw -> 4))), 'debit', _glx_num(l.raw -> 5), 'credit', _glx_num(l.raw -> 6), 'cur', _glx_cur(l.raw -> 7),
        'rate', coalesce(nullif(_glx_num(l.raw -> 8), 0), 1), 'base', _glx_r2(_glx_num(l.raw -> 9) - _glx_num(l.raw -> 10))) order by l.ord, l.line_no)
      from gl_lines l join gl_entries e on e.entry_id = l.entry_id
     where _glx_str(e.raw -> 3) = 'قيد افتتاحي' and _glx_str(e.raw -> 5) <> 'ملغى' and _glx_str(l.raw -> 4) = cd), '[]'::jsonb)); end $$;

-- ===== صيانة: معرّفات مكررة (مستحيلة بالمفتاح الأساسي) · سطور يتيمة =====
create or replace function rx2_glfinddupentryids(a jsonb, u text) returns jsonb language plpgsql stable as
$$ begin if not app_has('admin') then raise exception 'هذا الإجراء للمدير فقط (إعدادات / استيراد / مزامنة خارجية / عملية مؤثرة)' using errcode = '42501'; end if;
  return jsonb_build_object('success', true, 'dups', '[]'::jsonb); end $$;
create or replace function rx2_glfindorphanentries(a jsonb, u text) returns jsonb language plpgsql stable set search_path = public as
$$ declare accs jsonb := _glx_aux('accounts'); begin
  if not app_has('admin') then raise exception 'هذا الإجراء للمدير فقط (إعدادات / استيراد / مزامنة خارجية / عملية مؤثرة)' using errcode = '42501'; end if;
  return jsonb_build_object('success', true, 'orphans', coalesce((select jsonb_agg(o - 'dk' order by o ->> 'dk') from (
    select jsonb_build_object('id', id, 'date', (array_agg(_glx_date(l.raw -> 2) order by coalesce(_glx_num(l.raw -> 1), 0)))[1], 'dk', (array_agg(_glx_dkey(_glx_date(l.raw -> 2)) order by coalesce(_glx_num(l.raw -> 1), 0)))[1],
             'status', (select s from (select coalesce(nullif(_glx_str(x.raw -> 3), ''), 'مرحّل') s, count(*) n, min(x.ord) f from gl_lines x where _glx_str(x.raw -> 0) = id group by 1) q order by n desc, f limit 1),
             'lines', count(*), 'totalBase', _glx_r2(sum(_glx_num(l.raw -> 9))), 'balanced', abs(_glx_r2(sum(_glx_num(l.raw -> 9)) - sum(_glx_num(l.raw -> 10)))) < 0.05,
             'accounts', (select jsonb_agg(n order by f) from (select coalesce(accs -> _glx_str(y.raw -> 4) ->> 'name', _glx_str(y.raw -> 4)) n, min(y.ord * 1000 + coalesce(y.line_no, 0)) f from gl_lines y where _glx_str(y.raw -> 0) = id group by 1) w)) o
      from (select _glx_str(raw -> 0) id, raw, ord from gl_lines) l
     where id <> '' and not exists (select 1 from gl_entries e where e.entry_id = l.id) group by id) z), '[]'::jsonb)); end $$;

do $$ declare r record; begin
  for r in select p.oid::regprocedure::text sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and (p.proname like '\_glr\_%' or p.proname in ('rx2_glbalancesheet','rx2_glincomestatement','rx2_glprofitability','rx2_glcashflow','rx2_glaging','rx2_gllistbatches',
              'rx2_glstmtlog','rx2_glentryhistory','rx2_glopeninginfo','rx2_glfinddupentryids','rx2_glfindorphanentries')) loop
    execute format('revoke all on function %s from public, anon, authenticated', r.sig);
    execute format('grant execute on function %s to service_role', r.sig);
  end loop;
end $$;

-- ===== (الجزء 2) القيد الواحد · المرفقات · الحسابات المقابلة · قيود ERP المحتفظ بها · سجل صف القيد =====
create or replace function _glr_ovr(k text) returns jsonb language sql stable set search_path = public as
$$ with r as (select rn, _glx_str(_rx_c(raw, 1)) t, raw from _rx_rows('gl_auto_override') where _glx_str(_rx_c(raw, 0)) = k and _glx_str(_rx_c(raw, 1)) <> '')
   select case when not exists (select 1 from r) then null else jsonb_build_object(
     'acc', coalesce((select jsonb_agg(jsonb_build_object('from', _glx_str(_rx_c(raw, 3)), 'to', _glx_str(_rx_c(raw, 4)), 'cur', _glx_cur(coalesce(nullif(_rx_c(raw, 5), '""'::jsonb), '"EGP"')),
              'side', case when _glx_str(_rx_c(raw, 6)) = 'C' then 'C' else 'D' end, 'by', _glx_str(_rx_c(raw, 9)), 'at', _glx_str(_rx_c(raw, 10))) order by rn) from r where t = 'acc'), '[]'::jsonb),
     'hdr', (select coalesce(_rx_json(coalesce(nullif(_glx_str(_rx_c(raw, 8)), ''), '{}')), '{}'::jsonb) from r where t = 'hdr' order by rn desc limit 1),
     'freeze', (select jsonb_build_object('by', _glx_str(_rx_c(raw, 9)), 'at', _glx_str(_rx_c(raw, 10))) from r where t = 'freeze' order by rn desc limit 1),
     'vd', (select jsonb_build_object('by', _glx_str(_rx_c(raw, 9)), 'at', _glx_str(_rx_c(raw, 10)), 'note', _glx_str(_rx_c(raw, 8))) from r where t = 'void' order by rn desc limit 1),
     'keep', (select jsonb_build_object('by', _glx_str(_rx_c(raw, 9)), 'at', _glx_str(_rx_c(raw, 10))) from r where t = 'keep' order by rn desc limit 1)) end $$;
create or replace function rx2_glgetentry(a jsonb, u text) returns jsonb language plpgsql stable set search_path = public as
$$ declare id_ text := _glx_trim(coalesce(a ->> 1, '')); e jsonb; sk text; ov jsonb; pk jsonb; pc jsonb; begin
  perform _glx_need('');
  e := glx_get_entries_bulk_raw(jsonb_build_array(id_)) -> 'entries' -> 0;
  if e is null then raise exception 'القيد غير موجود' using errcode = 'P0001'; end if;
  e := e || jsonb_build_object('due', coalesce(_glx_aux('due') ->> id_, ''), 'ver', gl_entry_ver_raw(id_));
  sk := coalesce(e ->> 'sourceKey', '');
  if sk ~ '^(AUTO|CUST):' then ov := _glr_ovr(case when sk like 'CUST:%' then sk || '#' || id_ else sk end); if ov is not null then e := e || jsonb_build_object('ovr', ov); end if; end if;
  select raw into pk from _rx_rows('gl_pending') where sk like 'AUTO:%' and _glx_str(_rx_c(raw, 0)) = sk order by rn desc limit 1;
  select raw into pc from _rx_rows('gl_pending') where _glx_str(_rx_c(raw, 0)) = 'CCY:' || id_ order by rn desc limit 1;
  if pk is not null then e := e || jsonb_build_object('pend', jsonb_build_object('kind', _glx_str(_rx_c(pk, 2)), 'hash', _glx_str(_rx_c(pk, 7)), 'at', _glx_str(_rx_c(pk, 8)),
    'rejected', _glx_str(_rx_c(pk, 9)) = 'مرفوض', 'newAmt', _glx_str(_rx_c(pk, 13)), 'diff', left(_glx_str(_rx_c(pk, 14)), 1500))); end if;
  if pc is not null then e := e || jsonb_build_object('ccyPend', jsonb_build_object('amt', _glx_str(_rx_c(pc, 13)), 'note', _glx_str(_rx_c(pc, 14)))); end if;
  return jsonb_build_object('success', true, 'entry', e); end $$;
create or replace function rx2_glattachlist(a jsonb, u text) returns jsonb language plpgsql stable set search_path = public as
$$ begin perform _glx_need(''); return jsonb_build_object('success', true, 'files', coalesce(_glx_aux('att') -> _glx_trim(coalesce(a ->> 1, '')), '[]'::jsonb)); end $$;
create or replace function rx2_acccounteraccounts(a jsonb, u text) returns jsonb language plpgsql stable set search_path = public as
$$ begin
  if not app_has('accounts.view') then raise exception 'لا تملك صلاحية عرض حسابات العملاء' using errcode = '42501'; end if;
  return jsonb_build_object('success', true, 'accounts', coalesce((select jsonb_agg(jsonb_build_object('code', v ->> 'code', 'name', v ->> 'name', 'currency', coalesce(v ->> 'currency', ''), 'kind', coalesce(v ->> 'kind', ''))
      order by coalesce((v ->> '_row')::int, 0), k collate "C")
    from jsonb_each(_glx_aux('accounts')) q(k, v)
   where not coalesce((v ->> 'isGroup')::boolean, false) and coalesce(v ->> 'active', '') <> 'false' and coalesce(v ->> 'kind', '') not in ('fx', 'trip', 'hbrev')), '[]'::jsonb)); end $$;
create or replace function rx2_glhbkeeplist(a jsonb, u text) returns jsonb language plpgsql stable set search_path = public as
$$ begin
  perform _glx_need('hb');
  return jsonb_build_object('success', true, 'rows', coalesce((select jsonb_agg(jsonb_build_object('key', _glx_str(_rx_c(k.raw, 0)), 'erp', _glx_str(_rx_c(k.raw, 1)),
      'erpDesc', case when e.raw is null then '(قيد الـ ERP غير موجود)' else _glx_str(e.raw -> 4) end, 'erpDate', case when e.raw is null then '' else _glx_date(e.raw -> 2) end,
      'hbDesc', _glx_str(_rx_c(k.raw, 2)), 'by', _glx_str(_rx_c(k.raw, 3)), 'at', _glx_str(_rx_c(k.raw, 4))) order by k.rn desc)
    from _rx_rows('gl_hb_keep_erp') k left join gl_entries e on e.entry_id = _glx_str(_rx_c(k.raw, 1)) where _glx_str(_rx_c(k.raw, 0)) <> ''), '[]'::jsonb)); end $$;
create or replace function rx2_glrowhistory(a jsonb, u text) returns jsonb language plpgsql stable set search_path = public as
$$ declare id_ text := _glx_trim(coalesce(a ->> 1, '')); er jsonb; sk text; v_src text; sid text; lbl text; keys jsonb; rn_ text; ct jsonb; rows_ jsonb; p text[];
  lbls jsonb := '{"CP":"دفعة العميل","CI":"بنود العميل بالرحلة","TRIP":"بنود العميل بالرحلة","AP":"دفعة الوكيل","AI":"بند حساب الوكيل","VZ":"مجموعة التأشيرات","MF":"ملف المراجعة","RF":"إيصال رسوم الغرفة","TR":"تشغيلة النقل","HB":"حجز الفنادق","HBP":"دفعة الحجوزات","OPEN":"الأرصدة الافتتاحية","CAT":"اتفاقية الإعاشة"}'; begin
  perform _glx_need('');
  select raw into er from gl_entries where entry_id = id_;
  if er is null then raise exception 'القيد غير موجود' using errcode = 'P0001'; end if;
  sk := _glx_str(er -> 6); keys := jsonb_build_object('GL:' || id_, 'القيد ' || id_);
  p := regexp_match(sk, '^AUTO:([A-Z]+):(.*)$');
  if p is not null then
    v_src := p[1]; sid := regexp_replace(p[2], '#\d+$', ''); lbl := coalesce(lbls ->> v_src, 'المصدر');
    if v_src in ('AP', 'AI', 'VZ', 'MF') then keys := keys || jsonb_build_object(v_src || ':' || sid, lbl);
    elsif v_src in ('TR', 'RF') then keys := keys || jsonb_build_object(sid, lbl); rn_ := (regexp_match(_glx_str(er -> 4), 'إيصال\s+(\S+)'))[1]; if rn_ is not null and rn_ <> '—' then keys := keys || jsonb_build_object(rn_, lbl); end if;
    elsif v_src in ('TRIP', 'CI') then ct := jsonb_build_object('client', split_part(sid, '|', 1), 'trip', coalesce(nullif(split_part(sid, '|', 2), ''), 'عام'), 'rx', '', 'lbl', lbl);
    elsif v_src = 'CP' then select jsonb_build_object('client', _rx_trim(_rx_s(_rx_c(raw, 1))), 'trip', coalesce(nullif(_rx_trim(_rx_s(_rx_c(raw, 2))), ''), 'عام'), 'rx', 'دفعة|تحويل', 'lbl', 'دفعات العميل بالرحلة')
                            into ct from _rx_rows('acc_payments') where _rx_s(_rx_c(raw, 0)) = sid order by rn limit 1; end if;
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('timestamp', coalesce(ts_str, ''), 'username', coalesce(nullif(username, ''), '-'), 'action', coalesce(nullif(action, ''), '-'),
      'recordId', coalesce(keys ->> record_id, ct ->> 'lbl'), 'field', coalesce(nullif(field, ''), '-'), 'oldValue', coalesce(nullif(old_value, ''), '-'), 'newValue', coalesce(nullif(new_value, ''), '-')) order by t_ms desc, rn desc), '[]'::jsonb)
    into rows_ from audit_log
   where src in ('main', 'pg') and (keys ? record_id or (ct is not null and record_id = ct ->> 'client' and field = ct ->> 'trip' and (ct ->> 'rx' = '' or action ~ (ct ->> 'rx'))));
  return jsonb_build_object('success', true, 'rows', rows_, 'source', case when p is null then '' else coalesce(lbls ->> v_src, v_src) end, 'auto', p is not null); end $$;
do $$ declare r record; begin
  for r in select p.oid::regprocedure::text sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname in ('_glr_ovr','rx2_glgetentry','rx2_glattachlist','rx2_acccounteraccounts','rx2_glhbkeeplist','rx2_glrowhistory') loop
    execute format('revoke all on function %s from public, anon, authenticated', r.sig);
    execute format('grant execute on function %s to service_role', r.sig);
  end loop;
end $$;

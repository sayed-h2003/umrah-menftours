-- 019_client_account.sql — (V4.383) getClientAccount من Postgres: إحصاءات الرحلات + البنود + الدفعات + meta + تنبيهات + دمج + أكواد + روابط القيود + دفعات بانتظار الاعتماد
-- نفس JSON الدالة بـ Code.gs. للقراءة فقط: مزامنة حجوزات الفنادق (_accHbMirror_) تُشغَّل بالخلفية من المتصفح (clientAccountBg).
-- أي حالة غير مؤكدة (مجموعة دمج بلا معرف، خطأ بجداول GL) ⇒ استثناء ⇒ المتصفح يرجع لـ Apps Script. يتطلب 006+007+010+012. آمن لإعادة التشغيل.
create or replace function _ca_gnorm(s text) returns text language sql immutable as $$ select translate(lower(_ac_norm(s)), 'ؤئ', 'وي') $$;
create or replace function _ca_dstr(c jsonb) returns text language sql immutable as    -- Date ⇒ dd/MM/yyyy وإلا String(v||'')
$$ select case when jsonb_typeof(c) = 'object' and c ? '$d' then to_char(to_timestamp(floor((c ->> '$d')::float8 / 1000.0)) at time zone 'Africa/Cairo', 'DD/MM/YYYY') else _rx_s(c) end $$;
create or replace function _ca_hbkey(d text) returns text language plpgsql immutable as
$$ declare m text[]; x text; begin
  m := regexp_match(coalesce(d, ''), '⟦src:HB\.([A-Za-z0-9_-]+)⟧'); if m is null then return ''; end if;
  x := translate(m[1], '-_', '+/'); while length(x) % 4 <> 0 loop x := x || '='; end loop;
  return convert_from(decode(x, 'base64'), 'UTF8'); exception when others then return ''; end $$;
-- _rowVer_: base64url(md5(JSON.stringify(صف نصوص)))[0..12) — التاريخ 'D'+ms
create or replace function _ca_ver(raw jsonb, n int) returns text language sql immutable as
$$ select left(translate(encode(decode(md5('[' || coalesce(string_agg(to_json(case when jsonb_typeof(c) = 'object' and c ? '$d' then 'D' || (c ->> '$d')
                 when c is null or jsonb_typeof(c) = 'null' then '' else _rx_s(c) end)::text, ',' order by i), '') || ']'), 'hex'), 'base64'), '+/', '-_'), 12)
     from (select i, raw -> (i - 1) c from generate_series(1, n) i) q $$;

create or replace function rx2_getclientaccount(a jsonb, u text) returns jsonb language plpgsql stable set search_path = public as
$$ #variable_conflict use_column
declare cl text := _rx_trim(_rx_s(a -> 1)); pm jsonb := _rx_map('pilgrims', _rx_h_pil()); tm jsonb := _rx_map('trips', _rx_h_trips());
  rows_ jsonb; st jsonb; notrip int; items_ jsonb; pays_ jsonb; meta_ jsonb := '{}'::jsonb; alerts_ jsonb := '{}'::jsonb; mg jsonb; refs jsonb := '{}'::jsonb;
  tripmode boolean := false; ledger_on boolean := true; gl_ jsonb := null; lp jsonb := null; m record; old jsonb; cur text; r record; pre text; preci text; out jsonb; gm text[];
  tmode text; lc text; begin
  perform _acc_perm_view();
  if cl = '' then raise exception 'اسم العميل مطلوب'; end if;
  -- ===== إحصاءات الرحلات =====
  with pl as (select rn, _rx_trim(_rx_s(_rx_c(raw, _rx_ix(pm, 'اسم الرحلة')))) trip, _rx_trim(_rx_s(_rx_c(raw, _rx_ix(pm, 'النوع')))) ty,
                     _rx_trim(_rx_s(_rx_c(raw, _rx_ix(pm, 'فندق المدينة')))) hm, _rx_trim(_rx_s(_rx_c(raw, _rx_ix(pm, 'فندق مكة')))) hk, _rx_trim(_rx_s(_rx_c(raw, _rx_ix(pm, 'طبيعة التسكين')))) ac,
                     _rx_trim(_rx_s(_rx_c(raw, _rx_ix(pm, 'العميل')))) c0, _rx_trim(_rx_s(_rx_c(raw, _rx_ix(pm, 'اسم المعتمر')))) nm
                from _rx_rows('pilgrims')),
       mine as (select * from pl where c0 = cl and nm <> ''),
       nt as (select count(*) n from mine where trip = ''),
       mt as (select * from mine where trip <> ''),
       hk_ as (select trip, k, count(*) n, min(rn) f from (select trip, rn, 'M:' || hm k from mt where hm <> '' union all select trip, rn, 'K:' || hk from mt where hk <> '') x group by trip, k),
       ac_ as (select trip, ac k, count(*) n, min(rn) f from mt where ac <> '' group by trip, ac),
       tt as (select trip, count(*) filter (where ty = 'طفل') c, count(*) filter (where ty = 'رضيع') i, count(*) filter (where ty not in ('طفل', 'رضيع')) a, count(*) t, min(rn) f from mt group by trip),
       trl as (select distinct on (n) n, _rx_s(_rx_c(raw, _rx_ix(tm, 'الشركة المصرية'))) co, _rx_s(_rx_c(raw, _rx_ix(tm, 'الوكيل السعودي'))) ag,
                     _bk_date(_rx_c(raw, _rx_ix(tm, 'تاريخ الذهاب'))) dd, _bk_date(_rx_c(raw, _rx_ix(tm, 'تاريخ العودة'))) rd
                from (select _rx_trim(_rx_s(_rx_c(raw, _rx_ix(tm, 'اسم الرحلة')))) n, raw, rn from _rx_rows('trips')) q where n <> '' order by n, rn desc)
  select (select n from nt), coalesce(jsonb_agg(jsonb_build_object('trip', tt.trip, 'a', tt.a, 'c', tt.c, 'i', tt.i, 't', tt.t,
         'h', coalesce((select jsonb_object_agg(k, n) from hk_ where hk_.trip = tt.trip), '{}'::jsonb), 'm', coalesce((select jsonb_object_agg(k, n) from ac_ where ac_.trip = tt.trip), '{}'::jsonb),
         'hs', '{' || coalesce((select string_agg(to_json(k)::text || ':' || n, ',' order by f) from hk_ where hk_.trip = tt.trip), '') || '}',
         'ms', '{' || coalesce((select string_agg(to_json(k)::text || ':' || n, ',' order by f) from ac_ where ac_.trip = tt.trip), '') || '}', 'firstrn', tt.f,
         'company', coalesce(trl.co, ''), 'agent', coalesce(trl.ag, ''), 'dep', coalesce(trl.dd, ''), 'ret', coalesce(trl.rd, '')) order by tt.f), '[]'::jsonb)
    into notrip, st from tt left join trl on trl.n = tt.trip;
  select coalesce(jsonb_object_agg(n, rf), '{}'::jsonb) into refs from (select distinct on (n) n, rf from (
      select _rx_trim(_rx_s(_rx_c(raw, _rx_ix(tm, 'اسم الرحلة')))) n, _rx_trim(_rx_s(_rx_c(raw, _rx_ix(tm, 'الرقم المرجعي')))) rf, rn from _rx_rows('trips')) z where n <> '' and rf <> '' order by n, rn desc) y;
  select coalesce(jsonb_agg(jsonb_build_object('trip', e ->> 'trip', 'company', e ->> 'company', 'agent', e ->> 'agent', 'tripRef', coalesce(refs ->> (e ->> 'trip'), ''), 'departDate', e ->> 'dep', 'returnDate', e ->> 'ret',
            'adults', e -> 'a', 'children', e -> 'c', 'infants', e -> 'i', 'total', e -> 't', 'hotels', e -> 'h', 'accom', e -> 'm')
         order by (case when e ->> 'dep' ~ '^\d{1,2}/\d{1,2}/\d{4}$' then (to_date(split_part(e ->> 'dep', '/', 3) || '-' || split_part(e ->> 'dep', '/', 2) || '-' || split_part(e ->> 'dep', '/', 1), 'YYYY-MM-DD') - date '1970-01-01') else 99999999 end),
                  (case when e ->> 'trip' ~ '^(0|[1-9][0-9]{0,9})$' and (e ->> 'trip')::bigint <= 4294967294 then 0 else 1 end),
                  (case when e ->> 'trip' ~ '^(0|[1-9][0-9]{0,9})$' and (e ->> 'trip')::bigint <= 4294967294 then (e ->> 'trip')::bigint end), (e ->> 'firstrn')::int), '[]'::jsonb)
    into rows_ from jsonb_array_elements(st) e;
  -- ===== البنود =====
  select coalesce(jsonb_agg(o order by hbf, ord, rn), '[]'::jsonb) into items_ from (
    select rn, case when _ca_hbkey(_rx_s(_rx_c(raw, 3))) <> '' then 1 else 0 end hbf, _ac_num(_rx_c(raw, 18)) ord,
           jsonb_build_object('id', _rx_s(_rx_c(raw, 0)), 'trip', _rx_s(_rx_c(raw, 2)), 'desc', _rx_s(_rx_c(raw, 3)), 'cat', _rx_s(_rx_c(raw, 4)), 'currency', coalesce(nullif(_rx_s(_rx_c(raw, 5)), ''), 'EGP'),
             'count', _ac_num(_rx_c(raw, 6)), 'price', _ac_num(_rx_c(raw, 7)), 'value', _ac_num(_rx_c(raw, 8)), 'isDiscount', _vz_s(_rx_c(raw, 9)) = 'نعم', 'notes', _rx_s(_rx_c(raw, 10)),
             'nights', _ac_num(_rx_c(raw, 15)), 'company', _rx_s(_rx_c(raw, 16)), 'auto', _rx_s(_rx_c(raw, 17)), 'order', _ac_num(_rx_c(raw, 18)), 'isDirect', _vz_s(_rx_c(raw, 19)) = 'نعم')
           || case when _ca_hbkey(_rx_s(_rx_c(raw, 3))) <> '' then jsonb_build_object('hbKey', _ca_hbkey(_rx_s(_rx_c(raw, 3)))) else '{}'::jsonb end o
      from _rx_rows('acc_items') where _rx_trim(_rx_s(_rx_c(raw, 1))) = cl) x;
  -- ===== الدفعات =====
  select coalesce(jsonb_agg(o order by rn), '[]'::jsonb) into pays_ from (
    select rn, jsonb_build_object('id', _rx_s(_rx_c(raw, 0)), 'trip', _rx_s(_rx_c(raw, 2)), 'ptype', coalesce(nullif(_rx_s(_rx_c(raw, 3)), ''), 'دفعة'), 'date', _ca_dstr(_rx_c(raw, 4)),
             'amount', _ac_num(_rx_c(raw, 5)), 'currency', coalesce(nullif(_rx_s(_rx_c(raw, 6)), ''), 'EGP'), 'rate', _ac_num(_rx_c(raw, 7)),
             'desc', case when _rx_s(_rx_c(raw, 8)) ~ '⟦src:gl-[^⟧]+⟧' then _rx_trim(regexp_replace(_rx_s(_rx_c(raw, 8)), '\s*⟦src:gl-[^⟧]+⟧\s*', ' ', 'g')) else _rx_s(_rx_c(raw, 8)) end, 'serial', '', 'ver', _ca_ver(raw, 12))
           || case when _rx_s(_rx_c(raw, 8)) ~ '⟦src:gl-[^⟧]+⟧' then jsonb_build_object('glId', (regexp_match(_rx_s(_rx_c(raw, 8)), '⟦src:gl-([^⟧]+)⟧'))[1]) else '{}'::jsonb end o
      from _rx_rows('acc_payments') where _rx_trim(_rx_s(_rx_c(raw, 1))) = cl) x;
  -- ===== meta =====
  select coalesce(jsonb_object_agg(k, v), '{}'::jsonb) into meta_ from (select distinct on (k) k, v from (
       select _rx_s(_rx_c(raw, 1)) k, rn, jsonb_build_object('mode', coalesce(nullif(_rx_s(_rx_c(raw, 2)), ''), 'برنامج'), 'snapshot', _rx_s(_rx_c(raw, 3)),
         'readHash', _rx_s(_rx_c(raw, 4)), 'displayName', _rx_s(_rx_c(raw, 7)), 'rowNum', rn) v
         from _rx_rows('acc_meta') where _rx_trim(_rx_s(_rx_c(raw, 0))) = cl) y order by k, rn desc) z;
  -- ===== التنبيهات =====
  for r in select e ->> 'trip' trip, (e ->> 'a')::int a, (e ->> 'c')::int c, (e ->> 'i')::int i, (e ->> 't')::int t, e -> 'h' h, e -> 'm' m, e ->> 'hs' hs, e ->> 'ms' ms from jsonb_array_elements(st) e loop
    if not (meta_ ? r.trip) or coalesce(meta_ -> r.trip ->> 'snapshot', '') = '' then continue; end if;
    begin old := (meta_ -> r.trip ->> 'snapshot')::jsonb; exception when others then old := null; end;
    cur := '{"a":' || r.a || ',"c":' || r.c || ',"i":' || r.i || ',"t":' || r.t || ',"hotels":' || r.hs || ',"accom":' || r.ms || '}';
    if old is not null and jsonb_typeof(old) = 'object' and not (old ? 'hotels') then
      meta_ := jsonb_set(meta_, array[r.trip, 'snapshot'], to_jsonb(cur)); continue; end if;   -- ترقية صامتة (الكتابة بالشيت تُترك لـ Apps Script)
    if meta_ -> r.trip ->> 'snapshot' <> cur and meta_ -> r.trip ->> 'readHash' <> cur then
      alerts_ := alerts_ || jsonb_build_object(r.trip, jsonb_build_object('old', old, 'cur', jsonb_build_object('a', r.a, 'c', r.c, 'i', r.i, 't', r.t, 'hotels', r.h, 'accom', r.m),
        'countsChanged', old is null or jsonb_typeof(old) <> 'object' or (old -> 'a') is distinct from to_jsonb(r.a) or (old -> 'c') is distinct from to_jsonb(r.c) or (old -> 'i') is distinct from to_jsonb(r.i)));
    end if;
  end loop;
  -- ===== مجموعات الدمج =====
  if exists (select 1 from _rx_rows('acc_merge_groups') where _rx_trim(_rx_s(_rx_c(raw, 0))) = cl and _rx_trim(_rx_s(_rx_c(raw, 4))) = ''
               and jsonb_typeof(_rx_json(_rx_s(_rx_c(raw, 1)))) = 'array' and jsonb_array_length(_rx_json(_rx_s(_rx_c(raw, 1)))) > 0) then
    raise exception 'مجموعة دمج بلا معرف — يُصلحها Apps Script' using errcode = '0A000'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', coalesce(nullif(nm, ''), 'مجموعة ' || n), 'trips', tr, 'by', by_, 'at', at_) order by rn), '[]'::jsonb) into mg from (
    select rn, row_number() over (order by rn) n, _rx_trim(_rx_s(_rx_c(raw, 4))) id, _rx_trim(_rx_s(_rx_c(raw, 5))) nm, _rx_s(_rx_c(raw, 2)) by_,
           case when jsonb_typeof(_rx_c(raw, 3)) = 'object' and _rx_c(raw, 3) ? '$d' then to_char(to_timestamp(floor((_rx_c(raw, 3) ->> '$d')::float8 / 1000.0)) at time zone 'Africa/Cairo', 'DD/MM/YYYY HH24:MI') else _rx_s(_rx_c(raw, 3)) end at_,
           (select jsonb_agg(to_jsonb(_rx_trim(t))) from jsonb_array_elements_text(_rx_json(_rx_s(_rx_c(raw, 1)))) t where _rx_trim(t) <> '') tr
      from _rx_rows('acc_merge_groups') where _rx_trim(_rx_s(_rx_c(raw, 0))) = cl and jsonb_typeof(_rx_json(_rx_s(_rx_c(raw, 1)))) = 'array') g where tr is not null;
  -- أكواد رحلات البنود/الدفعات
  select refs into refs;  -- (refs كاملة؛ نُبقي فقط رحلات الكشف/البنود/الدفعات)
  select coalesce(jsonb_object_agg(k, refs ->> k), '{}'::jsonb) into refs from (
    select e ->> 'trip' k from jsonb_array_elements(st) e union select e ->> 'trip' from jsonb_array_elements(items_) e union select e ->> 'trip' from jsonb_array_elements(pays_) e) q where k is not null and k <> '' and k <> 'عام' and refs ? k;
  -- ===== روابط القيود + الدفعات بانتظار الاعتماد (GL) =====
  begin
    select coalesce((select value from gl_settings where key = 'trip_mode'), '') = 'نعم' into tripmode;
    ledger_on := coalesce((select value from gl_settings where key = 'ledger_central'), '') <> 'لا';
    pre := 'AUTO:TRIP:' || cl || '|'; preci := 'AUTO:CI:' || cl || '|';
    gl_ := jsonb_build_object('__tm', tripmode, '__pay', '{}'::jsonb, '__hb', '{}'::jsonb, '__ct', '{}'::jsonb);
    -- دفعات/بنود العميل
    for r in select e ->> 'id' id, e ->> 'glId' gid from jsonb_array_elements(pays_) e loop
      if r.gid is not null then gl_ := jsonb_set(gl_, array['__pay', r.id], jsonb_build_object('id', r.gid, 'pending', false, 'src', 1)); end if;
    end loop;
    for r in select e.k, e.ord, ge.entry_id, ge.status, ge.source_key from (
               select 'AUTO:CP:' || (e ->> 'id') k, e ->> 'id' ord from jsonb_array_elements(pays_) e where e ->> 'glId' is null
               union all select 'AUTO:HB:' || (e ->> 'hbKey'), e ->> 'hbKey' from jsonb_array_elements(items_) e where e ->> 'hbKey' is not null) e
             join gl_entries ge on ge.source_key = e.k and coalesce(ge.status, '') <> 'ملغى' order by ge.seq loop
      null; end loop;
    for r in select ge.entry_id, ge.source_key k, (select (p.raw -> 9) #>> '{}' from _rx_rows('gl_pending') p where _rx_trim(_rx_s(_rx_c(p.raw, 0))) = ge.source_key limit 1) pst,
                    exists (select 1 from _rx_rows('gl_pending') p where _rx_trim(_rx_s(_rx_c(p.raw, 0))) = ge.source_key) haspend
               from gl_entries ge where coalesce(ge.status, '') <> 'ملغى' and (starts_with(ge.source_key, preci) or starts_with(ge.source_key, pre)
                 or ge.source_key in (select 'AUTO:CP:' || (e ->> 'id') from jsonb_array_elements(pays_) e where e ->> 'glId' is null)
                 or ge.source_key in (select 'AUTO:HB:' || (e ->> 'hbKey') from jsonb_array_elements(items_) e where e ->> 'hbKey' is not null)) order by ge.seq loop
      declare isp boolean := r.haspend and coalesce(r.pst, '') <> 'مرفوض'; o jsonb := jsonb_build_object('id', r.entry_id, 'pending', isp); begin
        if starts_with(r.k, preci) then gl_ := jsonb_set(gl_, array['__ct', substr(r.k, length(preci) + 1)], o); end if;
        if starts_with(r.k, pre) then gl_ := jsonb_set(gl_, array['__ct', substr(r.k, length(pre) + 1)], o); end if;
        if tripmode and starts_with(r.k, pre) then gl_ := jsonb_set(gl_, array[substr(r.k, length(pre) + 1)], o);
        elsif starts_with(r.k, 'AUTO:CP:') and exists (select 1 from jsonb_array_elements(pays_) e where e ->> 'id' = substr(r.k, 9)) then gl_ := jsonb_set(gl_, array['__pay', substr(r.k, 9)], o);
        elsif starts_with(r.k, 'AUTO:HB:') then gl_ := jsonb_set(gl_, array['__hb', substr(r.k, 9)], o); end if;
      end; end loop;
    -- رقم السند والطرف المقابل لكل دفعة
    if jsonb_array_length(pays_) > 0 then
      select coalesce(jsonb_agg(case when x.eid is null or x.eid = '' then p else p || jsonb_build_object('glVch', coalesce(x.vch, ''), 'glCp', coalesce(x.cp, '')) end order by x.ord), pays_) into pays_ from (
        select p, ord, eid,
               (select case when ge.source_key ~ '^VCH:.+$' then substr(ge.source_key, 5) else '' end from gl_entries ge where ge.entry_id = eid limit 1) vch,
               (select string_agg(z.nm, '، ' order by z.mn) from (select l2.ac, min(l2.line_no) mn, coalesce(max(ga.name), l2.ac) nm from (select l.account_code ac, l.line_no from gl_lines l where l.entry_id = eid) l2
                    left join gl_accounts ga on ga.code = l2.ac
                   where not (ga.category = 'client' and coalesce(ga.link, '') <> '' and _ca_gnorm(ga.link) = _ca_gnorm(cl)) group by l2.ac) z) cp
          from (select p, ord, coalesce(nullif(p ->> 'glId', ''), nullif(gl_ -> '__pay' -> (p ->> 'id') ->> 'id', ''),
                         (select entry from (select _rx_s(_rx_c(raw, 1)) entry, _rx_s(_rx_c(raw, 2)) kind from _rx_rows('gl_recon_links') where _rx_trim(_rx_s(_rx_c(raw, 0))) = 'cp:' || (p ->> 'id') order by rn desc limit 1) rl where coalesce(nullif(kind, ''), 'link') = 'link' and entry <> ''),
                         (select ge.entry_id from gl_entries ge where ge.source_key = 'AUTO:CP:' || (p ->> 'id') and coalesce(ge.status, '') <> 'ملغى' order by ge.seq limit 1)) eid
                  from jsonb_array_elements(pays_) with ordinality t(p, ord)) q) x;
    end if;
    if ledger_on then
      select coalesce(jsonb_agg(jsonb_build_object('id', _rx_s(_rx_c(raw, 0)), 'trip', _rx_s(_rx_c(raw, 3)), 'date', _ca_dstr(_rx_c(raw, 4)), 'amount', _ac_num(_rx_c(raw, 5)), 'cur', _rx_s(_rx_c(raw, 6)),
               'maker', _rx_s(_rx_c(raw, 7)), 'voucher', _rx_s(_rx_c(raw, 14)), 'counter', _rx_s(_rx_c(raw, 15)), 'dup', _rx_s(_rx_c(raw, 9))) order by rn), '[]'::jsonb) into lp
        from _rx_rows('gl_maker_checker') where _rx_trim(_rx_s(_rx_c(raw, 10))) = 'بانتظار الاعتماد' and _rx_trim(_rx_s(_rx_c(raw, 1))) = 'cp' and _ca_gnorm(_rx_s(_rx_c(raw, 2))) = _ca_gnorm(cl);
    end if;
  exception when others then raise exception 'تعذّر قراءة بيانات الحسابات العامة: %', sqlerrm using errcode = '0A000'; end;
  return jsonb_build_object('success', true, 'client', cl, 'trips', rows_, 'noTripCount', notrip, 'items', items_, 'payments', pays_, 'meta', meta_, 'alerts', alerts_,
     'mergeTrips', case when jsonb_array_length(mg) > 0 then mg -> 0 -> 'trips' else null end, 'mergeGroups', mg, 'tripRefs', refs, 'gl', gl_, 'ledgerPend', lp);
end $$;
grant execute on function _ca_gnorm(text), _ca_dstr(jsonb), _ca_hbkey(text), _ca_ver(jsonb, int), rx2_getclientaccount(jsonb, text) to service_role;
notify pgrst, 'reload schema';

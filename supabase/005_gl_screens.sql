-- 005_gl_screens.sql — (V4.374 / المرحلة 3) قراءات شاشات الحسابات من Postgres مباشرة (المتصفح ← RPC ← jsonb)
-- كل دالة تُرجع jsonb بنفس شكل دالة Apps Script المقابلة حرفياً (أسماء الحقول/الأنواع/الترتيب/تقريب _glR2_/تواريخ dd/MM/yyyy):
--   glListEntries → glx_list_entries · glGetEntriesBulk → glx_get_entries_bulk · glLedger → glx_ledger · glStatement({fast:true}) → glx_statement
--   glTreasury → glx_treasury · glTrialBalance → glx_trial_balance · glPartyBalances → glx_party_balances · glBankPending → glx_bank_pending
--   glPendingList → glx_pending_list
-- المصدر: gl_lines.raw / gl_entries.raw (خلايا الشيت حرفياً — تكتبها GlStore.gs) ⇒ نفس التحويلات _glStr_/_glNum_/_glDate_/_glCur_ هنا.
-- الحسابات والمرفقات والاعتماد والاستحقاق وخريطة أسماء الحجوزات والرحلات تأتي من gl_aux (يرفعها SupaSync.gs عند تغيّر GL_DATA_VER).
-- الأعداد float8 (نفس حساب JS المزدوج) والتقريب floor(x*100+0.5)/100 = Math.round — فالنتائج متطابقة بت-ببت.
-- دوال *_raw (بلا فحص صلاحية، تأخذ «اليوم» كمعامل) للخادم/الاختبار فقط؛ الدوال العامة تفحص JWT بنفس _glPerm_. آمن لإعادة التشغيل.
-- يتطلب 001 + 002 (app_has/gl_can) + 003 (gl_can_cap) + 004 (أعمدة raw/ord).

-- ===== 0) جدول المساعد + فهارس =====
create table if not exists gl_aux (
  key text primary key,            -- accounts | att | pend | due | hbnames | trips | pendlist
  data jsonb not null,
  ver text,                        -- GL_DATA_VER لحظة البناء
  updated_at timestamptz not null default now()
);
alter table gl_aux enable row level security;      -- بلا سياسات ⇒ لا وصول مباشر للمتصفح (الدوال security definer فقط)
revoke all on gl_aux from anon, authenticated;
grant all on gl_aux to service_role;
create index if not exists gl_lines_noraw_idx on gl_lines (entry_id) where raw is null;
create index if not exists gl_entries_noraw_idx on gl_entries (entry_id) where raw is null;

-- ===== 1) أدوات تحويل الخلايا (تطابق Accounts.gs) =====
create or replace function _glx_trim(s text) returns text language sql immutable as
$$ select btrim(s, E' \t\n\r\f\x0b                 　﻿') $$;

-- Date من الشيت ⇒ {"$d": ms} (ترميز GlStore) ⇒ نص بتوقيت القاهرة
create or replace function _glx_fmt_dt(ms float8, with_time boolean) returns text language sql stable as
$$ select to_char(t, 'DD/MM/YYYY') || case when with_time and to_char(t, 'HH24:MI:SS') <> '00:00:00' then ' ' || to_char(t, 'HH24:MI:SS') else '' end
     from (select (to_timestamp(floor(ms / 1000.0)) at time zone 'Africa/Cairo') as t) x $$;

create or replace function _glx_str(c jsonb) returns text language sql stable as   -- _glStr_
$$ select case jsonb_typeof(c)
     when 'string' then _glx_trim(c #>> '{}')
     when 'number' then c #>> '{}'
     when 'boolean' then c #>> '{}'
     when 'object' then case when c ? '$d' then _glx_fmt_dt((c ->> '$d')::float8, true) else '' end
     else '' end $$;

create or replace function _glx_pf(s text) returns float8 language plpgsql immutable as   -- parseFloat بعد حذف الفواصل والمسافات وتحويل الأرقام العربية
$$ declare t text; m text; begin
  t := translate(regexp_replace(coalesce(s, ''), '[,٬\s ﻿]', '', 'g'), '٠١٢٣٤٥٦٧٨٩', '0123456789');
  m := substring(t from '^[+-]?(?:[0-9]+\.?[0-9]*|\.[0-9]+)(?:[eE][+-]?[0-9]+)?');
  if m is null then return 0; end if;
  return m::float8;
exception when others then return 0; end $$;

create or replace function _glx_num(c jsonb) returns float8 language sql stable as   -- _glNum_
$$ select case jsonb_typeof(c) when 'number' then (c #>> '{}')::float8 when 'string' then _glx_pf(c #>> '{}') else 0 end $$;

-- Number(v) بالطرح (ترتيب seq/lineNo): نص فارغ ⇒ 0 · غير رقمي ⇒ 0
create or replace function _glx_jsnum(c jsonb) returns float8 language plpgsql stable as
$$ declare t text; begin
  case jsonb_typeof(c)
    when 'number' then return (c #>> '{}')::float8;
    when 'string' then
      t := _glx_trim(c #>> '{}');
      if t = '' then return 0; end if;
      if t ~ '^[+-]?([0-9]+\.?[0-9]*|\.[0-9]+)([eE][+-]?[0-9]+)?$' then return t::float8; end if;
      return 0;
    else return 0;
  end case;
exception when others then return 0; end $$;

create or replace function _glx_r2(n float8) returns float8 language sql immutable as   -- _glR2_ = Math.round(x*100)/100
$$ select floor(coalesce(n, 0) * 100 + 0.5) / 100 $$;

create or replace function _glx_cur(c jsonb) returns text language plpgsql stable as   -- _glCur_
$$ declare v text := upper(_glx_str(c)); begin
  if v = 'جنيه' then return 'EGP'; end if;
  if v = 'ريال' then return 'SAR'; end if;
  if v = 'دولار' then return 'USD'; end if;
  return case when v in ('EGP', 'SAR', 'USD') then v else 'EGP' end;
end $$;

create or replace function _glx_date_slow(c jsonb) returns text language plpgsql stable as   -- _glDate_ (المسار العام: تواريخ Date/ISO/عربية/سنة بخانتين)
$$ declare s text; m text[]; begin
  if jsonb_typeof(c) = 'object' and c ? '$d' then return _glx_fmt_dt((c ->> '$d')::float8, false); end if;
  s := translate(_glx_str(c), '٠١٢٣٤٥٦٧٨٩', '0123456789');
  m := regexp_match(s, '^([0-9]{1,2})[/.-]([0-9]{1,2})[/.-]([0-9]{4})$');
  if m is not null then return lpad(m[1], 2, '0') || '/' || lpad(m[2], 2, '0') || '/' || m[3]; end if;
  m := regexp_match(s, '^([0-9]{4})[/.-]([0-9]{1,2})[/.-]([0-9]{1,2})');
  if m is not null then return lpad(m[3], 2, '0') || '/' || lpad(m[2], 2, '0') || '/' || m[1]; end if;
  m := regexp_match(s, '^([0-9]{1,2})[/.-]([0-9]{1,2})[/.-]([0-9]{2})$');
  if m is not null then return lpad(m[1], 2, '0') || '/' || lpad(m[2], 2, '0') || '/20' || m[3]; end if;
  return '';
end $$;

-- المسار السريع (الغالب: نص dd/MM/yyyy جاهز) بلا استدعاء plpgsql ⇒ أسرع ~15 مرة على الدفاتر الكبيرة
create or replace function _glx_date(c jsonb) returns text language sql stable as   -- _glDate_
$$ select case when jsonb_typeof(c) = 'string' and (c #>> '{}') ~ '^[0-9]{2}/[0-9]{2}/[0-9]{4}$' then c #>> '{}' else _glx_date_slow(c) end $$;

create or replace function _glx_dkey(d text) returns text language sql immutable as   -- _glDKey_ (yyyymmdd)
$$ select case when d ~ '^[0-9]{2}/[0-9]{2}/[0-9]{4}$' then substr(d, 7, 4) || substr(d, 4, 2) || substr(d, 1, 2) else '' end $$;

-- يوم (Date.UTC/864e5) من نص dd/MM/yyyy؛ غير مطابق ⇒ 0
create or replace function _glx_day(d text) returns float8 language plpgsql immutable as
$$ declare m text[]; begin
  m := regexp_match(coalesce(d, ''), '^([0-9]{2})/([0-9]{2})/([0-9]{4})$');
  if m is null then return 0; end if;
  return (make_date(m[3]::int, m[2]::int, m[1]::int) - date '1970-01-01')::float8;
exception when others then return 0; end $$;

create or replace function _glx_norm(s text) returns text language sql stable as   -- _glNorm_ (+ _normalizeArabicName_)
$$ select btrim(regexp_replace(translate(lower(btrim(regexp_replace(translate(regexp_replace(coalesce(s, ''), '[ً-ْٰ]', '', 'g'), 'أإآية', 'ااايه'), '\s+', ' ', 'g'),
        E' \t\n\r\f\x0b ﻿')), 'ؤئ', 'وي'), '\s+', ' ', 'g'), E' \t\n\r\f\x0b ﻿') $$;

create or replace function _glx_clean(s text) returns text language sql immutable as   -- _glCleanDesc_
$$ select btrim(regexp_replace(regexp_replace(coalesce(s, ''), '\s*⟦(?:cf|src):[^⟧]+⟧\s*', ' ', 'gi'), '\s+', ' ', 'g'), E' \t\n\r\f\x0b ﻿') $$;

-- تجميع بالتقريب خطوة-خطوة: r2(s + d - c) كما تفعل حلقات JS (يُستعمل مرتّباً ORDER BY ord وكنافذة تراكمية)
create or replace function _glx_acc_f(s float8, d float8, c float8) returns float8 language sql immutable as
$$ select _glx_r2(coalesce(s, 0) + coalesce(d, 0) - coalesce(c, 0)) $$;
do $$ begin
  if not exists (select 1 from pg_aggregate a join pg_proc p on p.oid = a.aggfnoid where p.proname = '_glx_acc') then
    create aggregate _glx_acc(float8, float8) (sfunc = _glx_acc_f, stype = float8, initcond = '0');
  end if;
end $$;

-- كائنا السطر والقيد كما في _glLineObj_ / _glEntryObj_
create or replace function _glx_lineobj(r jsonb) returns jsonb language sql stable as
$$ select jsonb_build_object('entryId', _glx_str(r -> 0), 'lineNo', r -> 1, 'date', _glx_date(r -> 2), 'status', _glx_str(r -> 3), 'account', _glx_str(r -> 4),
     'debit', _glx_num(r -> 5), 'credit', _glx_num(r -> 6), 'currency', _glx_cur(r -> 7), 'rate', coalesce(nullif(_glx_num(r -> 8), 0), 1),
     'bDebit', _glx_num(r -> 9), 'bCredit', _glx_num(r -> 10), 'trip', _glx_str(r -> 11), 'company', _glx_str(r -> 12),
     'client', _glx_str(r -> 13), 'agent', _glx_str(r -> 14), 'desc', _glx_str(r -> 15)) $$;

create or replace function _glx_eo(r jsonb) returns jsonb language sql stable as
$$ select jsonb_build_object('id', _glx_str(r -> 0), 'seq', r -> 1, 'date', _glx_date(r -> 2), 'type', _glx_str(r -> 3), 'desc', _glx_str(r -> 4), 'status', _glx_str(r -> 5),
     'sourceKey', _glx_str(r -> 6), 'batchId', _glx_str(r -> 7), 'totalBase', _glx_num(r -> 8), 'ref', _glx_str(r -> 9), 'trip', _glx_str(r -> 10), 'company', _glx_str(r -> 11),
     'createdBy', _glx_str(r -> 12), 'createdAt', _glx_str(r -> 13), 'postedBy', _glx_str(r -> 14), 'postedAt', _glx_str(r -> 15),
     'updatedBy', _glx_str(r -> 16), 'updatedAt', _glx_str(r -> 17), 'voidReason', _glx_str(r -> 18),
     'voucherNo', coalesce((regexp_match(_glx_str(r -> 6), '^VCH:([^\n\r]+)$'))[1], '')) $$;

-- ===== 2) حراسة + بيانات gl_aux + الصلاحيات =====
create or replace function _glx_guard() returns void language plpgsql stable as
$$ begin
  if exists (select 1 from gl_lines where raw is null limit 1) or exists (select 1 from gl_entries where raw is null limit 1) then
    raise exception 'GL_STORE: صفوف بلا raw — شغّل glStoreCutover() أولاً' using errcode = '55000';
  end if;
end $$;

create or replace function _glx_aux(k text) returns jsonb language plpgsql stable as
$$ declare v jsonb; begin
  select data into v from gl_aux where key = k;
  if v is null then raise exception 'gl_aux(%) غير موجود — بانتظار مزامنة SupaSync', k using errcode = '55000'; end if;
  return v;
end $$;

create or replace function _glx_need(sub text) returns void language plpgsql stable as   -- _glPerm_(authToken,'view',sub)
$$ begin
  if not gl_can_cap(sub, 'view') then raise exception 'لا تملك صلاحية عرض الحسابات العامة' using errcode = '42501'; end if;
end $$;

create or replace function _glx_today() returns text language sql stable as
$$ select to_char(now() at time zone 'Africa/Cairo', 'DD/MM/YYYY') $$;

-- اسم الطرف المقابل: link || name (أو الكود لحساب مجهول)
create or replace function _glx_cname(accs jsonb, code text) returns text language sql immutable as
$$ select case when accs -> code is null then code else coalesce(nullif(accs -> code ->> 'link', ''), accs -> code ->> 'name', '') end $$;

-- أسماء الأطراف المقابلة لقيد (سطور مرحّلة بحسابات أخرى) بترتيب أول ظهور وبلا تكرار؛ want_fx ⇒ حسابات «وسيط العملات» فقط
create or replace function _glx_counters(accs jsonb, eid text, v_code text, want_fx boolean) returns jsonb language sql stable as
$$ select coalesce(jsonb_agg(n order by fo), '[]'::jsonb)
     from (select n, min(rn) fo
             from (select _glx_cname(accs, _glx_str(o2.raw -> 4)) n, row_number() over (order by o2.ord nulls first, o2.line_no) rn,
                          coalesce(accs -> _glx_str(o2.raw -> 4) ->> 'kind', '') = 'fx' isfx
                     from gl_lines o2
                    where o2.entry_id = eid and o2.status = 'مرحّل' and _glx_str(o2.raw -> 4) <> v_code) q
            where isfx = want_fx group by n) z $$;

-- ===== 3) قائمة القيود: glListEntries =====
create or replace function glx_list_entries_raw(f jsonb default '{}'::jsonb) returns jsonb language plpgsql stable as
$$ declare
  v_fromk text := _glx_dkey(_glx_date(f -> 'from'));
  v_tok text := _glx_dkey(_glx_date(f -> 'to'));
  v_q text := _glx_norm(_glx_str(f -> 'q'));
  v_acc text := _glx_str(f -> 'account');
  v_type text := coalesce(f ->> 'type', '');
  v_stat text := coalesce(f ->> 'status', '');
  v_batch text := coalesce(f ->> 'batch', '');
  v_cap int := case when case coalesce(jsonb_typeof(f -> 'all'), 'null') when 'boolean' then (f ->> 'all') = 'true' when 'number' then (f ->> 'all')::numeric <> 0
                          when 'string' then (f ->> 'all') <> '' when 'null' then false else true end then 2500 else 400 end;   -- f.all ? 2500 : 400 (صدق JS)
  res jsonb;
begin
  perform _glx_guard();
  with e as materialized (
    select ge.ord, ge.entry_id, ge.raw r, _glx_dkey(_glx_date(ge.raw -> 2)) k, _glx_jsnum(ge.raw -> 1) seqn
      from gl_entries ge),
  fl as (
    select e.*, ls.h
      from e left join lateral (
        select string_agg(_glx_str(l.raw -> 15) || ' ' || _glx_str(l.raw -> 13) || ' ' || _glx_str(l.raw -> 14) || ' ' || _glx_str(l.raw -> 11), ' ' order by l.ord, l.line_no) h
          from gl_lines l where v_q <> '' and l.entry_id = e.entry_id) ls on true
     where not (v_fromk <> '' and e.k collate "C" < v_fromk) and not (v_tok <> '' and e.k collate "C" > v_tok)
       and (v_type = '' or _glx_str(e.r -> 3) = v_type) and (v_stat = '' or _glx_str(e.r -> 5) = v_stat) and (v_batch = '' or _glx_str(e.r -> 7) = v_batch)
       and (v_acc = '' or exists (select 1 from gl_lines l where l.entry_id = e.entry_id and starts_with(_glx_str(l.raw -> 4), v_acc)))
       and (v_q = '' or position(v_q in _glx_norm(concat_ws(' ', _glx_str(e.r -> 0), coalesce((regexp_match(_glx_str(e.r -> 6), '^VCH:([^\n\r]+)$'))[1], ''), _glx_str(e.r -> 4), _glx_str(e.r -> 9),
                                  _glx_str(e.r -> 3), _glx_str(e.r -> 10), _glx_str(e.r -> 11), coalesce(ls.h, '')))) > 0)),
  tot as (select count(*) n from fl),
  pk as (select fl.* from fl order by fl.k collate "C" desc, fl.seqn desc, fl.ord asc nulls first, fl.entry_id limit v_cap)
  select jsonb_build_object('success', true, 'total', (select n from tot), 'truncated', (select n from tot) > v_cap,
      'entries', coalesce((select jsonb_agg(_glx_eo(pk.r) || jsonb_build_object('_k', pk.k, 'lines', (
            select coalesce(jsonb_agg(_glx_lineobj(l.raw) order by _glx_jsnum(l.raw -> 1), l.ord nulls first, l.line_no), '[]'::jsonb) from gl_lines l where l.entry_id = pk.entry_id))
            order by pk.k collate "C" desc, pk.seqn desc, pk.ord asc nulls first, pk.entry_id) from pk), '[]'::jsonb))
    into res;
  return res;
end $$;

-- ===== 4) قراءة عدة قيود كاملة: glGetEntriesBulk =====
create or replace function glx_get_entries_bulk_raw(ids jsonb) returns jsonb language plpgsql stable as
$$ declare v_att jsonb; res jsonb; begin
  perform _glx_guard();
  v_att := _glx_aux('att');
  select jsonb_build_object('success', true, 'entries', coalesce(jsonb_agg(
           _glx_eo(ge.raw) || jsonb_build_object('lines', (select coalesce(jsonb_agg(_glx_lineobj(l.raw) order by _glx_jsnum(l.raw -> 1), l.ord nulls first, l.line_no), '[]'::jsonb) from gl_lines l where l.entry_id = ge.entry_id),
                                                 'attachments', coalesce(v_att -> ge.entry_id, '[]'::jsonb)) order by x.n), '[]'::jsonb))
    into res
    from (select _glx_trim(v) id, n from jsonb_array_elements_text(case when jsonb_typeof(ids) = 'array' then ids else '[]'::jsonb end) with ordinality t(v, n)) x
    join gl_entries ge on ge.entry_id = x.id;
  return res;
end $$;

-- ===== 5) ميزان المراجعة: glTrialBalance =====
create or replace function glx_trial_balance_raw(p_from text default '', p_to text default '') returns jsonb language plpgsql stable as
$$ declare v_fromk text := _glx_dkey(_glx_date(to_jsonb(coalesce(p_from, '')))); v_tok text := _glx_dkey(_glx_date(to_jsonb(coalesce(p_to, '')))); res jsonb; begin
  perform _glx_guard();
  with ln as materialized (
    select l.ord, _glx_str(l.raw -> 4) acc, _glx_dkey(_glx_date(l.raw -> 2)) k, _glx_cur(l.raw -> 7) cur,
           _glx_num(l.raw -> 5) d, _glx_num(l.raw -> 6) c, _glx_num(l.raw -> 9) bd, _glx_num(l.raw -> 10) bc
      from gl_lines l where l.status = 'مرحّل'),
  f as (select * from ln where not (v_tok <> '' and k collate "C" > v_tok)),
  g as (
    select acc,
           sum(bd order by ord) filter (where v_fromk <> '' and k collate "C" < v_fromk) od,
           sum(bc order by ord) filter (where v_fromk <> '' and k collate "C" < v_fromk) oc,
           sum(bd order by ord) filter (where not (v_fromk <> '' and k collate "C" < v_fromk)) pd,
           sum(bc order by ord) filter (where not (v_fromk <> '' and k collate "C" < v_fromk)) pc,
           _glx_acc(d, c order by ord) filter (where cur = 'EGP') ce,
           _glx_acc(d, c order by ord) filter (where cur = 'SAR') cs,
           _glx_acc(d, c order by ord) filter (where cur = 'USD') cu
      from f group by acc)
  select jsonb_build_object('success', true, 'rows', coalesce(jsonb_object_agg(acc, jsonb_build_object('openD', _glx_r2(coalesce(od, 0)), 'openC', _glx_r2(coalesce(oc, 0)),
            'perD', _glx_r2(coalesce(pd, 0)), 'perC', _glx_r2(coalesce(pc, 0)), 'cur', jsonb_build_object('EGP', ce, 'SAR', cs, 'USD', cu))), '{}'::jsonb)) into res from g;
  return res;
end $$;

-- ===== 6) دفتر الأستاذ: glLedger =====
create or replace function glx_ledger_raw(p_code text, p_from text default '', p_to text default '') returns jsonb language plpgsql stable as
$$ declare
  v_code text := _glx_trim(p_code);
  v_acc jsonb := _glx_aux('accounts') -> _glx_trim(p_code);
  v_fromk text := _glx_dkey(_glx_date(to_jsonb(coalesce(p_from, ''))));
  v_tok text := _glx_dkey(_glx_date(to_jsonb(coalesce(p_to, ''))));
  res jsonb;
begin
  perform _glx_guard();
  if v_acc is null then raise exception 'اختر حساباً'; end if;
  with ln as materialized (
    select l.ord, l.entry_id, l.line_no, _glx_lineobj(l.raw) lo, _glx_dkey(_glx_date(l.raw -> 2)) k, _glx_cur(l.raw -> 7) cur,
           _glx_num(l.raw -> 5) d, _glx_num(l.raw -> 6) c, _glx_num(l.raw -> 9) bd, _glx_num(l.raw -> 10) bc, _glx_jsnum(l.raw -> 1) lno
      from gl_lines l where l.status = 'مرحّل' and starts_with(l.account_code, v_code)),
  inr as (select * from ln where not (v_tok <> '' and k collate "C" > v_tok)),
  opn as (
    select coalesce(_glx_acc(d, c order by ord) filter (where cur = 'EGP'), 0) egp, coalesce(_glx_acc(d, c order by ord) filter (where cur = 'SAR'), 0) sar,
           coalesce(_glx_acc(d, c order by ord) filter (where cur = 'USD'), 0) usd, coalesce(_glx_acc(bd, bc order by ord), 0) base
      from inr where v_fromk <> '' and k collate "C" < v_fromk),
  o as (select coalesce((select egp from opn), 0) egp, coalesce((select sar from opn), 0) sar, coalesce((select usd from opn), 0) usd, coalesce((select base from opn), 0) base),
  rw as (
    select i.*, ge.raw er, coalesce(ge.raw -> 1, '0'::jsonb) seqj, case when ge.raw is null then 0 else _glx_jsnum(ge.raw -> 1) end seqn
      from inr i left join gl_entries ge on ge.entry_id = i.entry_id
     where not (v_fromk <> '' and i.k collate "C" < v_fromk)),
  srt as (select rw.*, row_number() over (order by k collate "C", seqn, lno, ord nulls first, entry_id, line_no) rn from rw),
  seed as (
    select 0::bigint rn, 'EGP' cur, o.egp d, 0::float8 c, 0::float8 bd, 0::float8 bc, true cflag, false bflag from o
    union all select 0, 'SAR', o.sar, 0, 0, 0, true, false from o
    union all select 0, 'USD', o.usd, 0, 0, 0, true, false from o
    union all select 0, '', 0, 0, o.base, 0, false, true from o),
  allr as (
    select rn, cur, d, c, bd, bc, true cflag, true bflag from srt
    union all select * from seed),
  run as (
    select rn, cur,
           _glx_acc(d, c) filter (where cflag) over (partition by cur order by rn rows between unbounded preceding and current row) bal_cur,
           _glx_acc(bd, bc) filter (where bflag) over (order by rn rows between unbounded preceding and current row) bal_base
      from allr),
  fin as (select s.*, r.bal_cur, r.bal_base from srt s join run r on r.rn = s.rn and r.cur = s.cur)
  select jsonb_build_object('success', true, 'account', v_acc,
      'opening', (select jsonb_build_object('EGP', egp, 'SAR', sar, 'USD', usd, 'base', base) from o),
      'closing', (select jsonb_build_object(
           'EGP', coalesce((select bal_cur from fin where cur = 'EGP' order by rn desc limit 1), o.egp), 'SAR', coalesce((select bal_cur from fin where cur = 'SAR' order by rn desc limit 1), o.sar),
           'USD', coalesce((select bal_cur from fin where cur = 'USD' order by rn desc limit 1), o.usd), 'base', coalesce((select bal_base from fin order by rn desc limit 1), o.base)) from o),
      'rows', coalesce((select jsonb_agg(fin.lo || jsonb_build_object('_k', fin.k, 'seq', fin.seqj, 'type', case when fin.er is null then '' else _glx_str(fin.er -> 3) end,
             'entryDesc', case when fin.er is null then '' else _glx_str(fin.er -> 4) end)
             || case when fin.er is null then '{}'::jsonb else jsonb_build_object(
                  'voucherNo', _glx_eo(fin.er) ->> 'voucherNo',
                  'ref', case when _glx_str(fin.er -> 9) ~ '^h:' then '' else _glx_str(fin.er -> 9) end,
                  'mod', case when _glx_str(fin.er -> 16) <> '' then _glx_str(fin.er -> 16) || ' — ' || _glx_str(fin.er -> 17)
                              when _glx_str(fin.er -> 14) <> '' then _glx_str(fin.er -> 14) || ' — ' || _glx_str(fin.er -> 15)
                              else _glx_str(fin.er -> 12) || ' — ' || _glx_str(fin.er -> 13) end) end
             || jsonb_build_object('balCur', fin.bal_cur, 'balBase', fin.bal_base) order by fin.rn) from fin), '[]'::jsonb))
    into res;
  return res;
end $$;

-- ===== 7) أعمار الديون (FIFO): _glAging_ =====
-- p_lines: [{"cur":"EGP","d":debit,"c":credit,"day":n}] بترتيب التاريخ · sign=+1 عميل / -1 مورد
create or replace function _glx_aging(p_lines jsonb, p_sign float8, p_asof text) returns jsonb language plpgsql immutable as
$$ declare
  now_d float8 := _glx_day(p_asof);
  cur text; qd float8[]; qv float8[]; qh int; qn int; adv float8; anyl boolean; ln jsonb; v float8; u float8; pay float8; t float8; age float8;
  b30 float8; b60 float8; b90 float8; b90p float8; tot float8; out jsonb := '{}'::jsonb; i int;
begin
  foreach cur in array array['EGP', 'SAR', 'USD'] loop
    qd := '{}'; qv := '{}'; qh := 1; qn := 0; adv := 0; anyl := false;
    for ln in select x from jsonb_array_elements(p_lines) x loop
      if ln ->> 'cur' <> cur then continue; end if;
      anyl := true;
      v := _glx_r2(p_sign * ((ln ->> 'd')::float8 - (ln ->> 'c')::float8));
      if v > 0 then
        if adv > 0 then u := least(adv, v); adv := _glx_r2(adv - u); v := _glx_r2(v - u); end if;
        if v > 0 then qn := qn + 1; qd[qn] := (ln ->> 'day')::float8; qv[qn] := v; end if;
      elsif v < 0 then
        pay := -v;
        while pay > 0.004 and qh <= qn loop
          t := least(pay, qv[qh]); qv[qh] := _glx_r2(qv[qh] - t); pay := _glx_r2(pay - t);
          if qv[qh] <= 0.004 then qh := qh + 1; end if;
        end loop;
        adv := _glx_r2(adv + pay);
      end if;
    end loop;
    if not anyl then continue; end if;
    b30 := 0; b60 := 0; b90 := 0; b90p := 0; tot := 0;
    for i in qh..qn loop
      age := now_d - qd[i];
      if age <= 30 then b30 := _glx_r2(b30 + qv[i]); elsif age <= 60 then b60 := _glx_r2(b60 + qv[i]); elsif age <= 90 then b90 := _glx_r2(b90 + qv[i]); else b90p := _glx_r2(b90p + qv[i]); end if;
      tot := _glx_r2(tot + qv[i]);
    end loop;
    if tot <> 0 or adv <> 0 then
      out := out || jsonb_build_object(cur, jsonb_build_object('d30', b30, 'd60', b60, 'd90', b90, 'd90p', b90p, 'adv', adv, 'total', tot));
    end if;
  end loop;
  return out;
end $$;

-- ===== 8) كشف الحساب: glStatement({fast:true}) =====
create or replace function glx_statement_raw(p_code text, p_from text default '', p_to text default '', p_opts jsonb default '{}'::jsonb, p_today text default null) returns jsonb language plpgsql stable as
$$ declare
  v_code text := _glx_trim(p_code);
  v_today text := coalesce(p_today, _glx_today());
  v_todayk text := _glx_dkey(coalesce(p_today, _glx_today()));
  v_accs jsonb; v_acc jsonb; v_pend jsonb; v_att jsonb; v_trips jsonb; v_hbnames jsonb;
  v_fromk text := _glx_dkey(_glx_date(to_jsonb(coalesce(p_from, ''))));
  v_tok text := _glx_dkey(_glx_date(to_jsonb(coalesce(p_to, ''))));
  v_role text; v_kind text; v_hbn jsonb; v_hbrole text; v_asof text; v_sgn float8; res jsonb; v_agl jsonb;
begin
  perform _glx_guard();
  if not coalesce((p_opts ->> 'fast')::boolean, false) then raise exception 'glx_statement: الوضع السريع فقط' using errcode = '0A000'; end if;
  v_accs := _glx_aux('accounts'); v_pend := _glx_aux('pend'); v_att := _glx_aux('att'); v_trips := _glx_aux('trips'); v_hbnames := _glx_aux('hbnames');
  v_acc := v_accs -> v_code;
  if v_acc is null then raise exception 'الحساب غير موجود: %', v_code; end if;
  if (v_acc ->> 'isGroup')::boolean then raise exception 'كشف الحساب للحسابات الفرعية — استخدم دفتر الأستاذ للأقسام'; end if;
  v_kind := v_acc ->> 'kind';
  v_role := case when v_kind = 'client' then 'client' when v_kind in ('agent', 'supplier') then 'supplier' when v_kind in ('safe', 'bank', 'custody') then 'cash'
                 when v_acc ->> 'type' = 'LIAB' then 'supplier' when left(v_code, 2) = '12' then 'client' else 'other' end;
  v_hbn := coalesce(v_hbnames -> v_code, '[]'::jsonb);
  v_hbrole := case when exists (select 1 from jsonb_array_elements(v_hbn) x where x ->> 'type' ~ 'مورد|شارت') then 'مورد سكن'
                   when exists (select 1 from jsonb_array_elements(v_hbn) x where x ->> 'type' ~ '^عميل$') or left(v_code, 4) = '1203' then 'عميل سكن' else '' end;
  v_sgn := case v_role when 'client' then 1 when 'supplier' then -1 else 0 end;
  v_asof := case when coalesce(p_to, '') <> '' then _glx_date(to_jsonb(p_to)) else v_today end;

  with ln as materialized (
    select l.ord, l.entry_id, l.line_no, _glx_lineobj(l.raw) lo, _glx_dkey(_glx_date(l.raw -> 2)) k, _glx_cur(l.raw -> 7) cur,
           _glx_num(l.raw -> 5) d, _glx_num(l.raw -> 6) c, _glx_num(l.raw -> 9) bd, _glx_num(l.raw -> 10) bc, _glx_jsnum(l.raw -> 1) lno
      from gl_lines l where l.status = 'مرحّل' and l.account_code = v_code),
  tdy as (
    select coalesce(_glx_acc(d, c order by ord) filter (where cur = 'EGP'), 0) egp, coalesce(_glx_acc(d, c order by ord) filter (where cur = 'SAR'), 0) sar,
           coalesce(_glx_acc(d, c order by ord) filter (where cur = 'USD'), 0) usd
      from ln where k collate "C" <= v_todayk),
  inr as (select * from ln where not (v_tok <> '' and k collate "C" > v_tok)),
  opn as (
    select coalesce(_glx_acc(d, c order by ord) filter (where cur = 'EGP'), 0) egp, coalesce(_glx_acc(d, c order by ord) filter (where cur = 'SAR'), 0) sar,
           coalesce(_glx_acc(d, c order by ord) filter (where cur = 'USD'), 0) usd, coalesce(_glx_acc(bd, bc order by ord), 0) base
      from inr where v_fromk <> '' and k collate "C" < v_fromk),
  o as (select coalesce((select egp from opn), 0) egp, coalesce((select sar from opn), 0) sar, coalesce((select usd from opn), 0) usd, coalesce((select base from opn), 0) base),
  rw as (
    select i.*, _glx_eo(ge.raw) eo, coalesce(ge.raw -> 1, '0'::jsonb) seqj, case when ge.raw is null then 0 else _glx_jsnum(ge.raw -> 1) end seqn
      from inr i left join gl_entries ge on ge.entry_id = i.entry_id
     where not (v_fromk <> '' and i.k collate "C" < v_fromk)),
  x as (
    select rw.*, coalesce(rw.eo ->> 'sourceKey', '') sk,
           _glx_counters(v_accs, rw.entry_id, v_code, false) cn
      from rw),
  srt as (select x.*, row_number() over (order by k collate "C", seqn, lno, ord nulls first, entry_id, line_no) rn from x),
  seed as (
    select 0::bigint rn, 'EGP' cur, o.egp d, 0::float8 c, 0::float8 bd, 0::float8 bc, true cflag, false bflag from o
    union all select 0, 'SAR', o.sar, 0, 0, 0, true, false from o
    union all select 0, 'USD', o.usd, 0, 0, 0, true, false from o
    union all select 0, '', 0, 0, o.base, 0, false, true from o),
  allr as (select rn, cur, d, c, bd, bc, true cflag, true bflag from srt union all select * from seed),
  run as (
    select rn, cur,
           _glx_acc(d, c) filter (where cflag) over (partition by cur order by rn rows between unbounded preceding and current row) bal_cur,
           _glx_acc(bd, bc) filter (where bflag) over (order by rn rows between unbounded preceding and current row) bal_base,
           _glx_acc(d, 0) filter (where cflag and rn > 0) over (partition by cur order by rn rows between unbounded preceding and current row) cum_dr,
           _glx_acc(c, 0) filter (where cflag and rn > 0) over (partition by cur order by rn rows between unbounded preceding and current row) cum_cr
      from allr),
  fin as (select s.*, r.bal_cur, r.bal_base, r.cum_dr, r.cum_cr from srt s join run r on r.rn = s.rn and r.cur = s.cur),
  rowsj as (
    select fin.rn, fin.cur, fin.cum_dr, fin.cum_cr, fin.bal_cur, fin.bal_base, fin.sk,
           jsonb_build_object(
             'entryId', fin.lo -> 'entryId', 'lineNo', fin.lo -> 'lineNo', 'date', fin.lo -> 'date', '_k', fin.k, 'seq', fin.seqj, 'currency', fin.cur,
             'debit', fin.lo -> 'debit', 'credit', fin.lo -> 'credit', 'bDebit', fin.lo -> 'bDebit', 'bCredit', fin.lo -> 'bCredit', 'rate', fin.lo -> 'rate',
             'desc', _glx_clean(coalesce(nullif(fin.lo ->> 'desc', ''), fin.eo ->> 'desc', '')), 'entryDesc', _glx_clean(coalesce(fin.eo ->> 'desc', '')), 'type', coalesce(fin.eo ->> 'type', ''),
             'voucherNo', coalesce(nullif(fin.eo ->> 'voucherNo', ''), (regexp_match(coalesce(fin.eo ->> 'ref', ''), '^((?:REC|PAY)-[0-9]+)$'))[1], ''),
             'ref', case when coalesce(fin.eo ->> 'ref', '') ~ '^h:|^cs:' then '' else coalesce(fin.eo ->> 'ref', '') end,
             'trip', coalesce(nullif(fin.lo ->> 'trip', ''), fin.eo ->> 'trip', ''), 'company', coalesce(nullif(fin.lo ->> 'company', ''), fin.eo ->> 'company', ''),
             'counter', case when jsonb_array_length(fin.cn) > 3 then 'متعدد (' || jsonb_array_length(fin.cn) || ')'
                             else coalesce((select string_agg(v, ' + ' order by o3) from jsonb_array_elements_text(fin.cn) with ordinality t(v, o3)), '') end,
             'auto', fin.sk ~ '^AUTO:', 'src', coalesce((regexp_match(fin.sk, '^AUTO:([A-Z]+)'))[1], ''),
             'att', coalesce(jsonb_array_length(v_att -> fin.entry_id), 0), 'pending', coalesce(v_pend ->> fin.entry_id, ''), 'bal', fin.bal_cur, 'balBase', fin.bal_base)
           || case when fin.sk ~ '^AUTO:HB:' then jsonb_build_object('hbKey', substr(fin.sk, 9)) else '{}'::jsonb end rj
      from fin),
  rowsagg as (select coalesce(jsonb_agg(rj order by rn), '[]'::jsonb) arr, count(*) filter (where rj ->> 'pending' <> '') pendn, coalesce(bool_or(sk ~ '^AUTO:HB:'), false) has_hb from rowsj),
  agl as (
    select coalesce(jsonb_agg(jsonb_build_object('cur', cur, 'd', d, 'c', c, 'day', _glx_day(lo ->> 'date')) order by k collate "C", ord nulls first, entry_id, line_no), '[]'::jsonb) a from inr)
  select jsonb_build_object('success', true,
      'account', jsonb_build_object('code', v_acc -> 'code', 'name', v_acc -> 'name', 'kind', v_acc -> 'kind', 'type', v_acc -> 'type', 'link', v_acc -> 'link', 'currency', v_acc -> 'currency',
                                    'parent', v_acc -> 'parent', 'parentName', coalesce(v_accs -> (v_acc ->> 'parent') ->> 'name', '')),
      'role', v_role, 'hbRole', v_hbrole, 'from', _glx_date(to_jsonb(coalesce(p_from, ''))), 'to', _glx_date(to_jsonb(coalesce(p_to, ''))), 'asOf', v_asof,
      'opening', (select jsonb_build_object('EGP', egp, 'SAR', sar, 'USD', usd) from o), 'openingBase', (select base from o),
      'closing', (select jsonb_build_object(
           'EGP', coalesce((select bal_cur from rowsj where cur = 'EGP' order by rn desc limit 1), o.egp), 'SAR', coalesce((select bal_cur from rowsj where cur = 'SAR' order by rn desc limit 1), o.sar),
           'USD', coalesce((select bal_cur from rowsj where cur = 'USD' order by rn desc limit 1), o.usd)) from o),
      'closingBase', (select coalesce((select bal_base from rowsj order by rn desc limit 1), o.base) from o),
      'totals', jsonb_build_object(
          'EGP', jsonb_build_object('dr', coalesce((select cum_dr from rowsj where cur = 'EGP' order by rn desc limit 1), 0), 'cr', coalesce((select cum_cr from rowsj where cur = 'EGP' order by rn desc limit 1), 0)),
          'SAR', jsonb_build_object('dr', coalesce((select cum_dr from rowsj where cur = 'SAR' order by rn desc limit 1), 0), 'cr', coalesce((select cum_cr from rowsj where cur = 'SAR' order by rn desc limit 1), 0)),
          'USD', jsonb_build_object('dr', coalesce((select cum_dr from rowsj where cur = 'USD' order by rn desc limit 1), 0), 'cr', coalesce((select cum_cr from rowsj where cur = 'USD' order by rn desc limit 1), 0))),
      'today', (select jsonb_build_object('EGP', egp, 'SAR', sar, 'USD', usd) from tdy),
      'rows', (select arr from rowsagg), 'unpriced', '[]'::jsonb,
      'hbLater', (select has_hb from rowsagg) or jsonb_array_length(v_hbn) > 0,
      'trips', coalesce((select jsonb_object_agg(tt, coalesce(v_trips -> tt, '{}'::jsonb)) from (select distinct (rj ->> 'trip') tt from rowsj) y where tt <> ''), '{}'::jsonb),
      'pending', (select pendn from rowsagg), 'aging', '{}'::jsonb),
    (select a from agl)
    into res, v_agl;
  if v_sgn <> 0 then res := jsonb_set(res, '{aging}', _glx_aging(v_agl, v_sgn, v_asof)); end if;
  return res;
end $$;

-- ===== 9) متابعة الخزينة: glTreasury =====
create or replace function glx_treasury_raw(p_code text, p_from text default '', p_to text default '') returns jsonb language plpgsql stable as
$$ declare
  v_code text := _glx_trim(p_code);
  v_accs jsonb; v_acc jsonb; v_att jsonb; v_due jsonb;
  v_fromk text := _glx_dkey(_glx_date(to_jsonb(coalesce(p_from, ''))));
  v_tok text := _glx_dkey(_glx_date(to_jsonb(coalesce(p_to, ''))));
  res jsonb;
begin
  perform _glx_guard();
  v_accs := _glx_aux('accounts'); v_att := _glx_aux('att'); v_due := _glx_aux('due');
  v_acc := v_accs -> v_code;
  if v_acc is null or (v_acc ->> 'isGroup')::boolean then raise exception 'اختر خزينة أو بنكاً أو عهدة'; end if;
  with ln as materialized (
    select l.ord, l.entry_id, l.line_no, _glx_lineobj(l.raw) lo, _glx_dkey(_glx_date(l.raw -> 2)) k, _glx_cur(l.raw -> 7) cur,
           _glx_num(l.raw -> 5) d, _glx_num(l.raw -> 6) c, _glx_jsnum(l.raw -> 1) lno
      from gl_lines l where l.status = 'مرحّل' and l.account_code = v_code),
  inr as (select * from ln where not (v_tok <> '' and k collate "C" > v_tok)),
  opn as (
    select coalesce(_glx_acc(d, c order by ord) filter (where cur = 'EGP'), 0) egp, coalesce(_glx_acc(d, c order by ord) filter (where cur = 'SAR'), 0) sar,
           coalesce(_glx_acc(d, c order by ord) filter (where cur = 'USD'), 0) usd
      from inr where v_fromk <> '' and k collate "C" < v_fromk),
  o as (select coalesce((select egp from opn), 0) egp, coalesce((select sar from opn), 0) sar, coalesce((select usd from opn), 0) usd),
  rw as (
    select i.*, _glx_eo(ge.raw) eo, coalesce(ge.raw -> 1, '0'::jsonb) seqj, case when ge.raw is null then 0 else _glx_jsnum(ge.raw -> 1) end seqn
      from inr i left join gl_entries ge on ge.entry_id = i.entry_id
     where not (v_fromk <> '' and i.k collate "C" < v_fromk)),
  x as (
    select rw.*, _glx_counters(v_accs, rw.entry_id, v_code, false) nm, _glx_counters(v_accs, rw.entry_id, v_code, true) fx from rw),
  srt as (select x.*, row_number() over (order by k collate "C", seqn, lno, ord nulls first, entry_id, line_no) rn from x),
  allr as (
    select rn, cur, d, c from srt
    union all select 0, 'EGP', o.egp, 0 from o union all select 0, 'SAR', o.sar, 0 from o union all select 0, 'USD', o.usd, 0 from o),
  run as (
    select rn, cur,
           _glx_acc(d, c) filter (where cur = 'EGP') over (order by rn, cur rows between unbounded preceding and current row) r_egp,
           _glx_acc(d, c) filter (where cur = 'SAR') over (order by rn, cur rows between unbounded preceding and current row) r_sar,
           _glx_acc(d, c) filter (where cur = 'USD') over (order by rn, cur rows between unbounded preceding and current row) r_usd
      from allr),
  fin as (select s.*, r.r_egp, r.r_sar, r.r_usd from srt s join run r on r.rn = s.rn and r.cur = s.cur),
  rowsj as (
    select fin.rn, fin.cur, fin.d, fin.c, fin.r_egp, fin.r_sar, fin.r_usd,
           jsonb_build_object('entryId', fin.lo -> 'entryId', 'due', case when v_acc ->> 'kind' = 'bank' then coalesce(v_due ->> (fin.lo ->> 'entryId'), '') else '' end,
             'voucherNo', coalesce(nullif(fin.eo ->> 'voucherNo', ''), (regexp_match(coalesce(fin.eo ->> 'ref', ''), '^((?:REC|PAY)-[0-9]+)$'))[1], ''),
             'type', coalesce(fin.eo ->> 'type', ''), 'date', fin.lo -> 'date', '_k', fin.k, 'seq', fin.seqj, 'lineNo', fin.lo -> 'lineNo', 'currency', fin.cur,
             'inAmt', fin.lo -> 'debit', 'outAmt', fin.lo -> 'credit',
             'counter', (select case when jsonb_array_length(a) > 3 then 'قيد متعدد الأطراف (' || jsonb_array_length(a) || ' حسابات)'
                                     else coalesce((select string_agg(v, ' + ' order by o3) from jsonb_array_elements_text(a) with ordinality t(v, o3)), '') end
                           from (select case when jsonb_array_length(fin.nm) > 0 then fin.nm else fin.fx end a) z),
             'desc', coalesce(nullif(fin.lo ->> 'desc', ''), fin.eo ->> 'desc', ''), 'entryDesc', coalesce(fin.eo ->> 'desc', ''), 'createdBy', coalesce(fin.eo ->> 'createdBy', ''),
             'auto', coalesce(fin.eo ->> 'sourceKey', '') ~ '^AUTO:', 'att', coalesce(jsonb_array_length(v_att -> (fin.lo ->> 'entryId')), 0),
             'snap', jsonb_build_object('EGP', fin.r_egp, 'SAR', fin.r_sar, 'USD', fin.r_usd)) rj
      from fin),
  lastk as (select max(k collate "C") filter (where k <> '') m from ln)
  select jsonb_build_object('success', true, 'account', v_acc,
      'opening', (select jsonb_build_object('EGP', egp, 'SAR', sar, 'USD', usd) from o),
      'current', (select jsonb_build_object(
          'EGP', coalesce((select r_egp from rowsj order by rn desc limit 1), o.egp),
          'SAR', coalesce((select r_sar from rowsj order by rn desc limit 1), o.sar),
          'USD', coalesce((select r_usd from rowsj order by rn desc limit 1), o.usd)) from o),
      'totals', jsonb_build_object(
          'EGP', jsonb_build_object('in', coalesce((select _glx_acc(d, 0 order by rn) from rowsj where cur = 'EGP'), 0), 'out', coalesce((select _glx_acc(c, 0 order by rn) from rowsj where cur = 'EGP'), 0)),
          'SAR', jsonb_build_object('in', coalesce((select _glx_acc(d, 0 order by rn) from rowsj where cur = 'SAR'), 0), 'out', coalesce((select _glx_acc(c, 0 order by rn) from rowsj where cur = 'SAR'), 0)),
          'USD', jsonb_build_object('in', coalesce((select _glx_acc(d, 0 order by rn) from rowsj where cur = 'USD'), 0), 'out', coalesce((select _glx_acc(c, 0 order by rn) from rowsj where cur = 'USD'), 0))),
      'rows', coalesce((select jsonb_agg(rj order by rn) from rowsj), '[]'::jsonb),
      'lastActivity', coalesce((select substr(m, 7, 2) || '/' || substr(m, 5, 2) || '/' || substr(m, 1, 4) from lastk where m is not null), ''))
    into res;
  return res;
end $$;

-- ===== 10) أعلى الأرصدة: glPartyBalances =====
create or replace function glx_party_balances_raw(p_groups jsonb, p_today text default null) returns jsonb language plpgsql stable as
$$ declare
  v_today text := coalesce(p_today, _glx_today());
  v_todayk text := _glx_dkey(coalesce(p_today, _glx_today()));
  v_accs jsonb; res jsonb;
begin
  perform _glx_guard();
  v_accs := _glx_aux('accounts');
  with g0 as (
    select x, n from jsonb_array_elements(case when jsonb_typeof(p_groups) = 'array' then p_groups else '[]'::jsonb end) with ordinality t(x, n) where n <= 10),
  g as (
    select coalesce(x ->> 'k', '') gk,
           left(regexp_replace(coalesce(x ->> 'prefix', ''), '[^0-9]', '', 'g'), 12) prefix,
           case when x ->> 'dir' = 'cr' then -1 else 1 end sg,
           greatest(1, least(50, coalesce(nullif(substring(btrim(coalesce(x ->> 'n', '')) from '^[+-]?[0-9]+')::int, 0), 10))) gn, n ord0
      from g0 where left(regexp_replace(coalesce(x ->> 'prefix', ''), '[^0-9]', '', 'g'), 12) <> ''),
  al as (   -- الحسابات الورقية بترتيب Object.keys في JS: مفاتيح الفهرس الصحيحة تصاعدياً رقمياً ثم الباقي بترتيب الكود
    select a.key code, a.value ->> 'name' nm,
           case when a.key ~ '^(0|[1-9][0-9]{0,9})$' and a.key::bigint < 4294967295 then 0 else 1 end grp,
           case when a.key ~ '^(0|[1-9][0-9]{0,9})$' and a.key::bigint < 4294967295 then a.key::bigint else 0 end numk
      from jsonb_each(v_accs) a where not coalesce((a.value ->> 'isGroup')::boolean, false)
       and exists (select 1 from g where left(a.key, length(g.prefix)) = g.prefix)),
  alr as (select al.*, row_number() over (order by grp, numk, code collate "C") ord_k from al),
  ln as materialized (
    select l.ord, _glx_str(l.raw -> 4) code, _glx_dkey(_glx_date(l.raw -> 2)) k, _glx_cur(l.raw -> 7) cur,
           _glx_num(l.raw -> 5) - _glx_num(l.raw -> 6) dr, _glx_num(l.raw -> 9) - _glx_num(l.raw -> 10) bs
      from gl_lines l where l.status = 'مرحّل' and l.account_code in (select code from al)),
  sm as (
    select code,
           coalesce(sum(dr order by ord) filter (where cur = 'EGP'), 0) fe, coalesce(sum(dr order by ord) filter (where cur = 'SAR'), 0) fs,
           coalesce(sum(dr order by ord) filter (where cur = 'USD'), 0) fu, coalesce(sum(bs order by ord), 0) fb,
           coalesce(sum(dr order by ord) filter (where cur = 'EGP' and k collate "C" <= v_todayk), 0) te, coalesce(sum(dr order by ord) filter (where cur = 'SAR' and k collate "C" <= v_todayk), 0) ts,
           coalesce(sum(dr order by ord) filter (where cur = 'USD' and k collate "C" <= v_todayk), 0) tu, coalesce(sum(bs order by ord) filter (where k collate "C" <= v_todayk), 0) tb
      from ln group by code),
  pr as (
    select g.gk, g.gn, g.ord0, alr.ord_k, alr.code, alr.nm, g.sg, sm.fe, sm.fs, sm.fu, sm.fb, sm.te, sm.ts, sm.tu, sm.tb
      from g join alr on left(alr.code, length(g.prefix)) = g.prefix join sm on sm.code = alr.code
     where g.sg * sm.tb > 0.004 or g.sg * sm.fb > 0.004),
  rk as (select pr.*, row_number() over (partition by ord0 order by _glx_r2(sg * tb) desc, ord_k) rnk, count(*) over (partition by ord0) tot from pr)
  select jsonb_build_object('success', true, 'asOf', v_today, 'groups', coalesce((
      select jsonb_object_agg(gg.gk, coalesce((
          select jsonb_build_object('total', coalesce(max(rk.tot), 0), 'rows', coalesce(jsonb_agg(jsonb_build_object('code', rk.code, 'name', coalesce(nullif(rk.nm, ''), rk.code),
                   'today', jsonb_build_object('EGP', _glx_r2(rk.sg * rk.te), 'SAR', _glx_r2(rk.sg * rk.ts), 'USD', _glx_r2(rk.sg * rk.tu), 'base', _glx_r2(rk.sg * rk.tb)),
                   'fin', jsonb_build_object('EGP', _glx_r2(rk.sg * rk.fe), 'SAR', _glx_r2(rk.sg * rk.fs), 'USD', _glx_r2(rk.sg * rk.fu), 'base', _glx_r2(rk.sg * rk.fb))) order by rk.rnk), '[]'::jsonb))
            from rk where rk.ord0 = gg.ord0 and rk.rnk <= gg.gn), jsonb_build_object('total', 0, 'rows', '[]'::jsonb)) order by gg.ord0) from g gg), '{}'::jsonb))
    into res;
  return res;
end $$;

-- ===== 11) المعلّق لكل بنك: glBankPending (+ V4.378: ما بعد اليوم لكل عهدة «custFut» ليعرض الأرصدة «الرصيد اليوم» للعهد = الكامل − custFut) =====
create or replace function glx_bank_pending_raw(p_today text default null) returns jsonb language plpgsql stable as
$$ declare v_today text := coalesce(p_today, _glx_today()); v_todayk text := _glx_dkey(coalesce(p_today, _glx_today())); v_accs jsonb; v_due jsonb; res jsonb; begin
  perform _glx_guard();
  v_accs := _glx_aux('accounts'); v_due := _glx_aux('due');
  with ln as materialized (
    select l.ord, _glx_str(l.raw -> 4) code, _glx_cur(l.raw -> 7) cur, _glx_num(l.raw -> 5) d, _glx_num(l.raw -> 6) c,
           coalesce(nullif(_glx_dkey(v_due ->> _glx_str(l.raw -> 0)), ''), _glx_dkey(_glx_date(l.raw -> 2))) dk
      from gl_lines l where l.status = 'مرحّل' and l.account_code in (select a.key from jsonb_each(v_accs) a where a.value ->> 'kind' = 'bank')),
  f as (select * from ln where dk <> '' and dk collate "C" > v_todayk),
  g as (
    select code, coalesce(_glx_acc(d, c order by ord) filter (where cur = 'EGP'), 0) e, coalesce(_glx_acc(d, c order by ord) filter (where cur = 'SAR'), 0) s,
           coalesce(_glx_acc(d, c order by ord) filter (where cur = 'USD'), 0) u from f group by code),
  cl as materialized (   -- 👜 العهد: سطور مرحّلة بتاريخ السطر (لا الاستحقاق) بعد اليوم
    select l.ord, _glx_str(l.raw -> 4) code, _glx_cur(l.raw -> 7) cur, _glx_num(l.raw -> 5) d, _glx_num(l.raw -> 6) c,
           _glx_num(l.raw -> 9) bd, _glx_num(l.raw -> 10) bc, _glx_dkey(_glx_date(l.raw -> 2)) k
      from gl_lines l where l.status = 'مرحّل' and l.account_code in (select a.key from jsonb_each(v_accs) a where a.value ->> 'kind' = 'custody')),
  cf as (select * from cl where k <> '' and k collate "C" > v_todayk),
  cg as (
    select code, coalesce(_glx_acc(d, c order by ord) filter (where cur = 'EGP'), 0) e, coalesce(_glx_acc(d, c order by ord) filter (where cur = 'SAR'), 0) s,
           coalesce(_glx_acc(d, c order by ord) filter (where cur = 'USD'), 0) u, coalesce(_glx_acc(bd, bc order by ord), 0) b from cf group by code)
  select jsonb_build_object('success', true,
      'pending', coalesce((select jsonb_object_agg(code, jsonb_build_object('EGP', e, 'SAR', s, 'USD', u)) from g), '{}'::jsonb),
      'custFut', coalesce((select jsonb_object_agg(code, jsonb_build_object('EGP', e, 'SAR', s, 'USD', u, 'base', b)) from cg), '{}'::jsonb),
      'asOf', v_today) into res;
  return res;
end $$;

-- ===== 12) قائمة الاعتماد: glPendingList (من gl_aux.pendlist) =====
create or replace function glx_pending_list_raw(p_can_approve boolean) returns jsonb language plpgsql stable as
$$ declare pl jsonb; begin
  pl := _glx_aux('pendlist');
  return jsonb_build_object('success', true, 'rows', coalesce(pl -> 'rows', '[]'::jsonb), 'canApprove', coalesce(p_can_approve, false), 'cust', coalesce(pl -> 'cust', '[]'::jsonb));
end $$;

-- ===== 13) الدوال العامة (JWT): فحص الصلاحية ثم *_raw =====
create or replace function glx_list_entries(f jsonb default '{}'::jsonb) returns jsonb language plpgsql stable security definer set search_path = public as
$$ begin perform _glx_need('je'); return glx_list_entries_raw(f); end $$;
create or replace function glx_get_entries_bulk(ids jsonb) returns jsonb language plpgsql stable security definer set search_path = public as
$$ begin perform _glx_need(''); return glx_get_entries_bulk_raw(ids); end $$;
create or replace function glx_trial_balance(p_from text default '', p_to text default '') returns jsonb language plpgsql stable security definer set search_path = public as
$$ begin perform _glx_need('rep'); return glx_trial_balance_raw(p_from, p_to); end $$;
create or replace function glx_ledger(p_code text, p_from text default '', p_to text default '') returns jsonb language plpgsql stable security definer set search_path = public as
$$ begin perform _glx_need('stmt'); return glx_ledger_raw(p_code, p_from, p_to); end $$;
create or replace function glx_statement(p_code text, p_from text default '', p_to text default '', p_opts jsonb default '{}'::jsonb) returns jsonb language plpgsql stable security definer set search_path = public as
$$ begin perform _glx_need('stmt'); return glx_statement_raw(p_code, p_from, p_to, p_opts, null); end $$;
create or replace function glx_treasury(p_code text, p_from text default '', p_to text default '') returns jsonb language plpgsql stable security definer set search_path = public as
$$ declare v_kind text; v_sub text; begin
  select data -> _glx_trim(p_code) ->> 'kind' into v_kind from gl_aux where key = 'accounts';
  v_sub := coalesce(nullif(case v_kind when 'bank' then 'bank' when 'custody' then 'cust' when 'safe' then 'safe' else '' end, ''), 'safe');   -- _glSubOfAcc_(code) || 'safe'
  perform _glx_need(v_sub);
  return glx_treasury_raw(p_code, p_from, p_to);
end $$;
create or replace function glx_party_balances(p_groups jsonb) returns jsonb language plpgsql stable security definer set search_path = public as
$$ begin perform _glx_need(''); return glx_party_balances_raw(p_groups, null); end $$;
create or replace function glx_bank_pending() returns jsonb language plpgsql stable security definer set search_path = public as
$$ begin perform _glx_need(''); return glx_bank_pending_raw(null); end $$;
create or replace function glx_pending_list() returns jsonb language plpgsql stable security definer set search_path = public as
$$ begin perform _glx_need('auto'); return glx_pending_list_raw(app_has('admin') or app_has('gl.approve')); end $$;

-- *_raw وأدوات الداخل: للخادم فقط · الدوال العامة: للمستخدم المسجَّل
do $$ declare r record; begin
  for r in select p.oid::regprocedure::text sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and (p.proname like '\_glx\_%' or p.proname like 'glx\_%\_raw') loop
    execute format('revoke all on function %s from public, anon, authenticated', r.sig);
    execute format('grant execute on function %s to service_role', r.sig);
  end loop;
  for r in select p.oid::regprocedure::text sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname like 'glx\_%' and p.proname not like '%\_raw' loop
    execute format('revoke all on function %s from public, anon', r.sig);
    execute format('grant execute on function %s to authenticated, service_role', r.sig);
  end loop;
end $$;

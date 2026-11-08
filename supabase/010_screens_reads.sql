-- 010_screens_reads.sql — (V4.378) قراءات الوزارة (getMinistryBootstrap · getMinistryTripLinks) من Postgres + البنية المشتركة لبقية الشاشات
-- الهدف: نفس JSON الذي تُرجعه دالة Apps Script حرفياً (الأسماء/الأنواع/القيم/التواريخ dd/MM/yyyy بتوقيت القاهرة) بلا تمرير على الشيت.
-- المصدر: store_rows.raw (خلايا الشيت حرفياً) + store_meta.hdr كما 007. أعمدة ملفات الوزارة/الإيصالات/المشرفين تُقرأ بالموضع (كما MF_HEADERS بالخادم)،
--         والرحلات بالاسم (_robustColMap_ ⇒ _rx_map). الإعدادات التي تعيش بخصائص السكربت (ACC_PRICING · MF_EXEC_POLICY · NOTIF_TOGGLES) تُنسخ إلى app_kv
--         (Store.gs: storeKvPush_/storeKvBackfill) — غيابها (لم تُنسخ بعد) ⇒ الدالة تفشل بـ55000 فيرجع المتصفح لـ Apps Script تلقائياً (لا قيم افتراضية مخمَّنة).
-- نقطة الدخول: rx_call2(fn, args) ⇒ {success, d, dv} — تُوجِّه إلى rx2_<fn> (اسم صغير) وتفحص الصلاحية داخلها كما الخادم. لا تعدّل rx_call بـ007.
-- يتطلب 001 + 006 + 007 (أدوات _rx_*) + 008 (data_versions). آمن لإعادة التشغيل. لا يكتب أي شيء بجداول البيانات.
-- تاريخ اليوم: Africa/Cairo (يمكن تثبيته للاختبار بـ set app.today = 'YYYY-MM-DD').

-- ===== 1) app_kv: نسخة قراءة لخصائص السكربت التي تحتاجها الحسابات =====
create table if not exists app_kv (
  k text primary key,
  v text not null default '',          -- نص الخاصية حرفياً ('' = غير موجودة وقت النسخ)
  updated_at timestamptz not null default now()
);
alter table app_kv enable row level security;
revoke all on app_kv from anon, authenticated;
grant all on app_kv to service_role;

-- يكتبها Apps Script (service_role) بعد كل حفظ للإعداد. p = {"ACC_PRICING": "...", ...}
create or replace function kv_set(p jsonb) returns jsonb language plpgsql volatile set search_path = public as
$$ declare e record; n int := 0; begin
  for e in select j.key as jk, j.value as jv from jsonb_each(coalesce(p, '{}'::jsonb)) j loop
    insert into app_kv as t (k, v, updated_at) values (e.jk, case when jsonb_typeof(e.jv) = 'string' then e.jv #>> '{}' else coalesce(e.jv::text, '') end, now())
    on conflict (k) do update set v = excluded.v, updated_at = now(); n := n + 1;
  end loop;
  return jsonb_build_object('set', n); end $$;

-- قيمة خاصية منسوخة؛ لم تُنسخ بعد (لا صف) ⇒ 55000 ⇒ المتصفح يرجع لـ Apps Script
create or replace function _sx_kv(p_key text) returns text language plpgsql stable set search_path = public as
$$ declare r text; ok boolean; begin
  select v into r from app_kv where k = p_key;
  if not found then
    select true into ok from app_kv where k = '__seeded';
    if ok is null then raise exception 'إعدادات % لم تُنسخ إلى Supabase بعد (شغّل storeKvBackfill من محرر Apps Script)', p_key using errcode = '55000'; end if;
    return '';
  end if;
  return r; end $$;

-- ===== 2) أدوات الخلايا بدلالات _mfStr_/_mfNum_/_mfDate_ =====
-- يوم/سنة اليوم (Cairo) — قابل للتثبيت بالاختبار
create or replace function _mf_today_date() returns date language sql stable as
$$ select coalesce(nullif(current_setting('app.today', true), '')::date, (now() at time zone 'Africa/Cairo')::date) $$;
create or replace function _mf_today() returns text language sql stable as $$ select to_char(_mf_today_date(), 'DD/MM/YYYY') $$;

-- تاريخ الشيت {"$d":ms} ⇒ dd/MM/yyyy[ HH:mm] (_fmtCellDate_)
create or replace function _mf_celldate(c jsonb) returns text language sql immutable as
$$ select to_char(to_timestamp(floor((c ->> '$d')::float8 / 1000.0)) at time zone 'Africa/Cairo', 'DD/MM/YYYY')
        || case when to_char(to_timestamp(floor((c ->> '$d')::float8 / 1000.0)) at time zone 'Africa/Cairo', 'HH24:MI') = '00:00' then ''
                else ' ' || to_char(to_timestamp(floor((c ->> '$d')::float8 / 1000.0)) at time zone 'Africa/Cairo', 'HH24:MI') end $$;

-- _mfLatin_: String(s == null ? '' : s) + تطبيع الأرقام العربية/الفارسية والفاصلتين
create or replace function _mf_latin(c jsonb) returns text language sql immutable as
$$ select case jsonb_typeof(c)
     when 'string' then translate(c #>> '{}', '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹٫٬', '01234567890123456789.,')
     when 'number' then c #>> '{}'
     when 'boolean' then c #>> '{}'
     when 'object' then case when c ? '$d' then _mf_celldate(c) else '[object Object]' end
     else '' end $$;
create or replace function _mf_str(c jsonb) returns text language sql immutable as $$ select _rx_trim(_mf_latin(c)) $$;
create or replace function _mf_strt(s text) returns text language sql immutable as   -- _mfStr_ لنص (بعد التطبيع)
$$ select _rx_trim(translate(coalesce(s, ''), '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹٫٬', '01234567890123456789.,')) $$;

-- parseFloat (بلا NaN: يرجع null) على نص
create or replace function _mf_pf(s text) returns float8 language plpgsql immutable as
$$ declare m text; begin
  m := substring(s from '^[ \t\n\r\f\v   -     　﻿]*([+-]?(?:[0-9]+\.?[0-9]*|\.[0-9]+)(?:[eE][+-]?[0-9]+)?)');
  if m is null then return null; end if;
  return m::float8; end $$;
-- _mfNum_: Date ⇒ 0 · parseFloat(latin(v).replace(/,/g,'')) · NaN ⇒ 0
create or replace function _mf_num(c jsonb) returns float8 language sql immutable as
$$ select case when jsonb_typeof(c) = 'object' then 0 else coalesce(_mf_pf(replace(_mf_latin(c), ',', '')), 0) end $$;
-- _accNum_: parseFloat(v) (بلا تطبيع) NaN ⇒ 0
create or replace function _ac_num(c jsonb) returns float8 language sql immutable as
$$ select case jsonb_typeof(c) when 'number' then (c #>> '{}')::float8 when 'string' then coalesce(_mf_pf(c #>> '{}'), 0) else 0 end $$;

-- طباعة رقم JS (عدد صحيح بلا .0)
create or replace function _mf_n2t(x float8) returns text language sql immutable as
$$ select case when x = trunc(x) and abs(x) < 1e15 then trunc(x)::bigint::text else x::text end $$;

-- dd/MM/yyyy (نمط 2/2/4 صارم) ⇒ تاريخ مع التفاف الشهر/اليوم الزائد (new Date(y, m-1, d)) · سنة < 100 ⇒ +1900
create or replace function _mf_dmy_date(s text) returns date language plpgsql immutable as
$$ declare m text[]; y int; begin
  m := regexp_match(coalesce(s, ''), '^(\d{2})/(\d{2})/(\d{4})$');
  if m is null then return null; end if;
  y := m[3]::int; if y < 100 then y := y + 1900; end if;
  return (make_date(y, 1, 1) + make_interval(months => m[2]::int - 1))::date + (m[1]::int - 1);
end $$;
-- _mfMs_: منتصف الليل المحلي بالميلي ثانية (NaN ⇒ null)
create or replace function _mf_ms(s text) returns float8 language sql immutable as
$$ select extract(epoch from (_mf_dmy_date(s)::timestamp at time zone 'Africa/Cairo')) * 1000 $$;
create or replace function _mf_dow(s text) returns int language sql immutable as $$ select extract(dow from _mf_dmy_date(s))::int $$;

-- _mfDate_: Date ⇒ dd/MM/yyyy · نص بأي فاصل (- . \ /) · السنة الناقصة = السنة الحالية · سنتان ⇒ 20xx
create or replace function _mf_date(c jsonb) returns text language plpgsql stable as
$$ declare s text; p text[]; d text; m text; y text; begin
  if jsonb_typeof(c) = 'object' and c ? '$d' then
    return to_char(to_timestamp(floor((c ->> '$d')::float8 / 1000.0)) at time zone 'Africa/Cairo', 'DD/MM/YYYY');
  end if;
  s := translate(_mf_str(c), '-.\', '///');
  if s = '' then return ''; end if;
  p := array(select x from unnest(string_to_array(s, '/')) x where x <> '');
  if coalesce(array_length(p, 1), 0) < 2 then return ''; end if;
  d := regexp_replace(p[1], '\D', '', 'g'); m := regexp_replace(p[2], '\D', '', 'g'); y := regexp_replace(coalesce(p[3], ''), '\D', '', 'g');
  if d = '' or m = '' then return ''; end if;
  if y = '' then y := to_char(_mf_today_date(), 'YYYY');
  elsif length(y) = 2 then y := '20' || y; end if;
  if length(y) <> 4 then return ''; end if;
  if length(d) = 1 then d := '0' || d; end if;
  if length(m) = 1 then m := '0' || m; end if;
  return d || '/' || m || '/' || y; end $$;
-- نفس _mf_date لنص جاهز
create or replace function _mf_datet(s text) returns text language sql stable as $$ select _mf_date(to_jsonb(coalesce(s, ''))) $$;

-- _mfDateTime_: Date ⇒ dd/MM/yyyy HH:mm · نص «Tue Sep 08 2026 23:57:00 GMT+0300 …» ⇒ صيغة موحدة · وإلا نفسه
create or replace function _mf_datetime(c jsonb) returns text language plpgsql stable as
$$ declare s text; m text[]; ts timestamptz; begin
  if jsonb_typeof(c) = 'object' and c ? '$d' then
    return to_char(to_timestamp(floor((c ->> '$d')::float8 / 1000.0)) at time zone 'Africa/Cairo', 'DD/MM/YYYY HH24:MI');
  end if;
  s := _mf_str(c);
  if s = '' then return ''; end if;
  if s ~ '^[A-Za-z]{3}\s+[A-Za-z]{3}\s+\d' then
    m := regexp_match(s, '^[A-Za-z]{3}\s+([A-Za-z]{3})\s+(\d{1,2})\s+(\d{4})\s+(\d{2}):(\d{2}):(\d{2})\s+GMT([+-]\d{4})');
    if m is not null then
      begin
        ts := (m[3] || '-' || m[1] || '-' || m[2] || ' ' || m[4] || ':' || m[5] || ':' || m[6] || ' ' || substr(m[7], 1, 3) || ':' || substr(m[7], 4, 2))::timestamptz;
        return to_char(ts at time zone 'Africa/Cairo', 'DD/MM/YYYY HH24:MI');
      exception when others then return s; end;
    end if;
  end if;
  return s; end $$;
-- _mfTime_: Date ⇒ hh:mm a · نص كما هو
create or replace function _mf_time(c jsonb) returns text language sql stable as
$$ select case when jsonb_typeof(c) = 'object' and c ? '$d'
     then to_char(to_timestamp(floor((c ->> '$d')::float8 / 1000.0)) at time zone 'Africa/Cairo', 'HH12:MI AM') else _mf_str(c) end $$;

-- _mfJson_(v, fb): JSON.parse(String(v||'')) والنتيجة الزائفة ⇒ fb
create or replace function _mf_json(c jsonb, fb jsonb) returns jsonb language plpgsql immutable as
$$ declare r jsonb := _rx_json(_rx_s(c)); begin
  if r is null or r = 'null'::jsonb or r = 'false'::jsonb or r = '0'::jsonb or r = '""'::jsonb then return fb; end if;
  return r; end $$;
create or replace function _mf_parse_arr(c jsonb) returns jsonb language plpgsql immutable as   -- _mfParseJsonArr_
$$ declare t text := _mf_str(c); r jsonb; begin
  if t = '' then return '[]'::jsonb; end if;
  r := _rx_json(t); if jsonb_typeof(r) = 'array' then return r; end if; return '[]'::jsonb; end $$;
create or replace function _mf_arr(j jsonb) returns jsonb language sql immutable as   -- Array.isArray(x) ? x : []
$$ select case when jsonb_typeof(j) = 'array' then j else '[]'::jsonb end $$;

-- _normalizeArabicName_ + toLowerCase + مطابقة الاسم (_accNameMatch_)
create or replace function _ac_norm(s text) returns text language sql immutable as
$$ select _rx_trim(regexp_replace(translate(regexp_replace(coalesce(s, ''), '[ً-ْٰ]', '', 'g'), 'أإآىة', 'اااية'),
        '[\s ﻿    -   　]+', ' ', 'g')) $$;
create or replace function _ac_name_match(b text, c text) returns boolean language sql immutable as
$$ select case when _ac_norm(b) = '' or _ac_norm(c) = '' then false
     else lower(_ac_norm(b)) = lower(_ac_norm(c)) or left(lower(_ac_norm(b)), length(lower(_ac_norm(c))) + 3) = lower(_ac_norm(c)) || ' - ' end $$;

-- ===== 3) إعدادات من app_kv =====
-- _accPricing_ (ACC_PRICING)
create or replace function _sx_acc_pricing() returns jsonb language plpgsql stable set search_path = public as
$$ declare raw text := _sx_kv('ACC_PRICING'); c jsonb;
        d jsonb := '{"roomFeePeriods":[],"supRoomFee":200,"barcodePeriods":[],"vipSurcharge":100,"vipRoomFee":3100}'::jsonb; begin
  if raw is null or raw = '' then return d; end if;
  c := _rx_json(raw);
  if c is null or c = 'null'::jsonb then return d; end if;          -- JSON غير صالح/null ⇒ الافتراضي (catch بالخادم)
  if jsonb_typeof(c) <> 'object' then return c; end if;             -- رقم/نص/مصفوفة صالحة: يرجع كما هو (كالخادم)
  if jsonb_typeof(c -> 'roomFeePeriods') is distinct from 'array' then c := c || '{"roomFeePeriods":[]}'; end if;
  if jsonb_typeof(c -> 'barcodePeriods') is distinct from 'array' then c := c || '{"barcodePeriods":[]}'; end if;
  if not c ? 'supRoomFee' then c := c || jsonb_build_object('supRoomFee', d -> 'supRoomFee'); end if;
  if not c ? 'vipSurcharge' then c := c || jsonb_build_object('vipSurcharge', d -> 'vipSurcharge'); end if;
  if not c ? 'vipRoomFee' then c := c || jsonb_build_object('vipRoomFee', d -> 'vipRoomFee'); end if;
  return c; end $$;
-- _mfExecPolicy_ (MF_EXEC_POLICY)
create or replace function _sx_exec_policy() returns jsonb language plpgsql stable set search_path = public as
$$ declare raw text := _sx_kv('MF_EXEC_POLICY'); a jsonb; begin
  if raw is null or raw = '' then return '[]'::jsonb; end if;
  a := _rx_json(raw);
  if jsonb_typeof(a) is distinct from 'array' then return '[]'::jsonb; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('kind', case when e ->> 'kind' = 'client' then 'client' else 'company' end,
                     'name', _rx_trim(_rx_s_raw(e -> 'name')), 'from', _rx_trim(_rx_s_raw(e -> 'from'))) order by n)
                    from jsonb_array_elements(a) with ordinality x(e, n)
                   where jsonb_typeof(e) = 'object' and _rx_truthy(e -> 'name') and _rx_truthy(e -> 'from')), '[]'::jsonb); end $$;
-- _alertOn_(key) (NOTIF_TOGGLES): الافتراضي مفعَّل إلا لو false صراحةً
create or replace function _sx_alert_on(p_key text) returns boolean language plpgsql stable set search_path = public as
$$ declare raw text := _sx_kv('NOTIF_TOGGLES'); c jsonb; begin
  if raw is null or raw = '' then return true; end if;
  c := _rx_json(raw);
  if jsonb_typeof(c) is distinct from 'object' then return true; end if;
  return (c -> p_key) is distinct from 'false'::jsonb; end $$;

-- ===== 4) ملفات الوزارة =====
create or replace function _mf_exec_eff(o jsonb, pol jsonb) returns boolean language plpgsql immutable as
$$ declare ov text := _mf_str(o -> 'execFeeOverride'); rd float8; comp text; cl text[]; p jsonb; fm float8; begin
  if ov = 'نعم' then return true; end if;
  if ov = 'لا' then return false; end if;
  if jsonb_array_length(pol) = 0 or _mf_str(o -> 'reviewDate') = '' then return false; end if;
  rd := _mf_ms(o ->> 'reviewDate'); if rd is null then return false; end if;
  comp := _mf_str(o -> 'company');
  cl := array(select _mf_str(b -> 'name') from jsonb_array_elements(_mf_arr(o -> 'breakdown')) b where jsonb_typeof(b) = 'object');
  if _mf_str(o -> 'clientLabel') <> '' then cl := cl || _mf_str(o -> 'clientLabel'); end if;
  for p in select * from jsonb_array_elements(pol) loop
    fm := _mf_ms(p ->> 'from'); if fm is null or rd < fm then continue; end if;
    if p ->> 'kind' = 'company' then
      if _ac_name_match(comp, p ->> 'name') then return true; end if;
    else
      if exists (select 1 from unnest(cl) x where _ac_name_match(x, p ->> 'name')) then return true; end if;
    end if;
  end loop;
  return false; end $$;

create or replace function _mf_row_obj(r jsonb, pol jsonb) returns jsonb language plpgsql stable as
$$ declare o jsonb; begin
  o := jsonb_build_object(
    'id', _mf_str(_rx_c(r, 0)), 'seq', _mf_num(_rx_c(r, 1)), 'fileNo', _mf_str(_rx_c(r, 2)),
    'approved', _mf_str(_rx_c(r, 3)) = 'نعم', 'eInvoice', _mf_str(_rx_c(r, 4)), 'ref', _mf_str(_rx_c(r, 5)),
    'company', _mf_str(_rx_c(r, 6)), 'agent', _mf_str(_rx_c(r, 7)),
    'reviewDate', _mf_date(_rx_c(r, 8)), 'reviewType', coalesce(nullif(_mf_str(_rx_c(r, 9)), ''), 'عادية'), 'vipReason', _mf_str(_rx_c(r, 10)),
    'travelMode', coalesce(nullif(_mf_str(_rx_c(r, 11)), ''), 'طيران'),
    'clientLabel', _mf_str(_rx_c(r, 12)), 'breakdown', _mf_json(_rx_c(r, 13), '[]'), 'tripName', _mf_str(_rx_c(r, 14)),
    'goDate', _mf_date(_rx_c(r, 15)), 'retDate', _mf_date(_rx_c(r, 16)),
    'pilgrims', _mf_num(_rx_c(r, 17)), 'supCount', _mf_num(_rx_c(r, 18)), 'sups', _mf_json(_rx_c(r, 19), '[]'))
  || jsonb_build_object(
    'progPrice', _mf_num(_rx_c(r, 20)), 'ticket', _mf_num(_rx_c(r, 21)), 'roomFee', _mf_num(_rx_c(r, 22)),
    'adminFee', _mf_num(_rx_c(r, 23)), 'pct', _mf_num(_rx_c(r, 24)), 'fxRate', _mf_num(_rx_c(r, 25)),
    'madinahHotel', _mf_str(_rx_c(r, 26)), 'madinahIn', _mf_date(_rx_c(r, 27)), 'madinahOut', _mf_date(_rx_c(r, 28)),
    'makkahHotel', _mf_str(_rx_c(r, 29)), 'makkahIn', _mf_date(_rx_c(r, 30)), 'makkahOut', _mf_date(_rx_c(r, 31)),
    'transport', _mf_str(_rx_c(r, 32)), 'notes', _mf_str(_rx_c(r, 33)), 'selected', _mf_json(_rx_c(r, 34), '[]'),
    'createdBy', _mf_str(_rx_c(r, 35)), 'createdAt', _mf_datetime(_rx_c(r, 36)),
    'updatedBy', _mf_str(_rx_c(r, 37)), 'updatedAt', _mf_datetime(_rx_c(r, 38)),
    'fileType', _mf_str(_rx_c(r, 39)), 'extraTrips', _mf_str(_rx_c(r, 40)), 'execFeeOverride', _mf_str(_rx_c(r, 41)),
    'manualType', _mf_str(_rx_c(r, 42)) = 'نعم');
  return o || jsonb_build_object('execFee', _mf_exec_eff(o, pol)); end $$;

-- _mfReadAll_: صفوف بمعرّف غير فارغ بترتيب الشيت
create or replace function _mf_files_raw(pol jsonb) returns table (rn int, f jsonb) language sql stable as
$$ select r.rn, _mf_row_obj(r.raw, pol) from _rx_rows('mf_files') r where _mf_str(_rx_c(r.raw, 0)) <> '' order by r.rn $$;

-- _tripListSplit_ على نص (known = مجموعة أسماء الرحلات المقصوصة)
create or replace function _mf_trip_split(s0 text, known jsonb) returns text[] language plpgsql immutable as
$$ declare s text := _mf_strt(s0); parts text[]; begin
  if s = '' then return '{}'; end if;
  if s ~ E'\n' then return array(select t from (select _mf_strt(x) t from unnest(regexp_split_to_array(s, E'\r?\n')) x) y where t <> ''); end if;
  if s !~ '[،,]|[\s ﻿    -   　]-[\s ﻿    -   　]' then return array[s]; end if;
  if known ? s then return array[s]; end if;
  parts := array(select t from (select _mf_strt(x) t from unnest(regexp_split_to_array(s,
      '[\s ﻿    -   　]*[،,][\s ﻿    -   　]*|[\s ﻿    -   　]+-[\s ﻿    -   　]+')) x) y where t <> '');
  if coalesce(array_length(parts, 1), 0) > 1 and not exists (select 1 from unnest(parts) p where not (known ? p)) then return parts; end if;
  return array[s]; end $$;
-- _tripNamesSet_
create or replace function _mf_trip_names() returns jsonb language plpgsql stable as
$$ declare tm jsonb := _rx_map('trips', _rx_h_trips()); ci int := _rx_ix(tm, 'اسم الرحلة'); begin
  return coalesce((select jsonb_object_agg(n, 1) from (select _mf_str(_rx_c(raw, ci)) n from _rx_rows('trips')) x where n <> ''), '{}'::jsonb); end $$;
-- _mfTripsOf_: رحلات الملف (الأساسية + الإضافية) فريدة
create or replace function _mf_trips_of(tn text, et text, known jsonb) returns text[] language sql immutable as
$$ select coalesce(array_agg(t order by m), '{}') from (select t, min(o) m from unnest(_mf_trip_split(tn, known) || _mf_trip_split(et, known)) with ordinality x(t, o) where t <> '' group by t) y $$;

-- المرافق: s.type يحوي «مرافق» · المحسوب بهذا الملف (بلا elsewhere)
create or replace function _mf_ismur(e jsonb) returns boolean language sql immutable as
$$ select position('مرافق' in case when jsonb_typeof(e) = 'object' then _rx_s(e -> 'type') else '' end) > 0 $$;
create or replace function _mf_counted(e jsonb) returns boolean language sql immutable as
$$ select _mf_ismur(e) and _mf_str(case when jsonb_typeof(e) = 'object' then e -> 'elsewhere' end) = '' $$;
create or replace function _mf_supkey(e jsonb) returns text language sql immutable as   -- _mfSupKey_(s.name)
$$ select _rx_trim(regexp_replace(_ac_norm(_rx_s(case when jsonb_typeof(e) = 'object' then e -> 'name' end)), '[\s ﻿    -   　]+', ' ', 'g')) $$;

-- مفتاح busy[s.name] بالاسم الخام: String(s.name) (غائب ⇒ 'undefined')
create or replace function _mf_namekey(e jsonb) returns text language sql immutable as
$$ select case jsonb_typeof(e -> 'name') when 'string' then e ->> 'name' when 'number' then e ->> 'name' when 'boolean' then e ->> 'name' when 'null' then 'null' else 'undefined' end $$;

-- _mfBarcodeFeeAt_
create or replace function _mf_barcode_fee(d text, cfg jsonb) returns float8 language plpgsql stable as
$$ declare t float8 := _mf_ms(_mf_datet(d)); p jsonb; fm float8; tm float8; begin
  if t is null then return 0; end if;
  for p in select * from jsonb_array_elements(_mf_arr(cfg -> 'barcodePeriods')) loop
    fm := _mf_ms(_mf_date(p -> 'from')); if fm is null then continue; end if;
    tm := case when _rx_truthy(p -> 'to') then _mf_ms(_mf_date(p -> 'to')) else 8640000000000000 end;
    if tm is null then tm := 8640000000000000; end if;
    if t >= fm and t <= tm then return _mf_num(p -> 'price'); end if;
  end loop;
  return 0; end $$;

-- _mfCompute_ — exempt/elsewhere محسوبتان من قائمة كل الملفات (يمرّرهما المنسّق)
create or replace function _mf_compute(f jsonb, cfg jsonb, exempt jsonb, elsewhere jsonb) returns jsonb language plpgsql stable as
$$ declare N float8 := _mf_num(f -> 'pilgrims'); sups jsonb := _mf_arr(f -> 'sups'); murafiq int; O float8; heads float8;
  vipByCount boolean; S float8; supFee float8; R float8; T float8; V float8; AC float8; barcode float8; Q float8; W float8; mfee int; X float8; Z float8; U float8 := 0; Y float8; AA float8; AB float8; AL float8;
  manual boolean := coalesce((f -> 'manualType') = 'true'::jsonb, false); rt text := f ->> 'reviewType'; begin
  select count(*) into murafiq from jsonb_array_elements(sups) e where _mf_counted(e);
  O := murafiq; heads := N + O;
  vipByCount := (N > 0 and N < 4 and rt is distinct from 'تجديد باركود' and (f ->> 'fileType') is distinct from 'مجموعات' and not manual);
  S := case when manual then _mf_num(f -> 'roomFee')
            when rt = 'VIP' or vipByCount then coalesce(nullif(_mf_num(cfg -> 'vipRoomFee'), 0), 3100) else _mf_num(f -> 'roomFee') end;
  supFee := coalesce(nullif(_mf_num(cfg -> 'supRoomFee'), 0), 200);
  R := _mf_num(f -> 'ticket'); T := _mf_num(f -> 'adminFee'); V := _mf_num(f -> 'fxRate'); AC := _mf_num(f -> 'pct') / 100;
  barcode := case when rt = 'تجديد باركود' then _mf_barcode_fee(f ->> 'reviewDate', cfg) * N else 0 end;
  Q := N * _mf_num(f -> 'progPrice'); W := R * heads;
  mfee := greatest(0, murafiq - jsonb_array_length(exempt));
  X := (N * S) + (mfee * supFee); Z := T * heads;
  if heads > 0 and V > 0 then U := floor((Q - W - X - Z - (Q * AC) - barcode) / heads / V + 0.5); end if;
  Y := U * heads; AA := (Y * V) + W + X + Z + barcode; AB := Q - AA; AL := case when N > 0 then AB / N else 0 end;
  return jsonb_build_object('heads', heads, 'murafiq', murafiq, 'murafiqFee', mfee, 'supExempt', exempt, 'supElsewhere', elsewhere,
    'roomFeeEffective', S, 'supRoomFee', supFee, 'barcodeFee', barcode, 'vipByCount', vipByCount,
    'revenue', Q, 'totalTickets', W, 'totalRoomFee', X, 'otherExp', Z, 'clearanceSAR', U, 'totalSAR', Y,
    'totalExp', floor(AA + 0.5), 'margin', floor(AB + 0.5), 'perPersonMargin', floor(AL + 0.5)); end $$;

-- ===== 5) المنسّق: ملفات + حساباتها + أعلامها + الأرصدة =====
-- يرجع {files:[...], balances:{...}} — files بنفس ترتيب الشيت مع calc/flags وعناصر sups المُثرَاة بـ busyTo
create or replace function _mf_all(p_pol jsonb, p_cfg jsonb, p_today text) returns jsonb language plpgsql stable set search_path = public as
$$ #variable_conflict use_column
declare
  fa jsonb[]; fid text[]; fseq float8[]; fkeys jsonb[]; fc text[]; ft float8[]; fr boolean[]; n int; i int; j int; k int; f jsonb; g text; rt text; sups jsonb; e jsonb; nm text; mySeq float8; os float8; ownSeq float8; owner int; oe jsonb; same boolean; earlier boolean;
  didx jsonb; idfirst jsonb; idlast jsonb; busy jsonb; ids text[]; ex jsonb; el jsonb; calcs jsonb[]; flags jsonb; bal jsonb; supsum jsonb; res jsonb[] := '{}'; ent jsonb; nsups jsonb; peer jsonb; pk text; arr jsonb;
  todayMs float8 := _mf_ms(p_today); sName text; total float8; selfIdx int; selfF jsonb; hasno boolean; reviewed boolean; agentName text; g_ms float8; r_ms float8; i_ms float8; o_ms float8; b_ms float8; busyTo text; days float8; cmp jsonb; bd jsonb; sm float8; balv float8; c jsonb;
begin
  fa := array(select x.f from _mf_files_raw(p_pol) x order by x.rn);
  n := coalesce(array_length(fa, 1), 0);
  if n = 0 then return jsonb_build_object('files', '[]'::jsonb, 'balances', '{}'::jsonb); end if;
  -- فهرس التاريخين: "go|ret" ⇒ [فهارس] (ملفات لهما تاريخا ذهاب وعودة) · أول/آخر فهرس لكل id
  select coalesce(jsonb_object_agg(k, ix), '{}') into didx from (select (f ->> 'goDate') || '|' || (f ->> 'retDate') k, jsonb_agg(i order by i) ix
        from unnest(fa) with ordinality a(f, i) where (f ->> 'goDate') <> '' and (f ->> 'retDate') <> '' group by 1) q;
  select coalesce(jsonb_object_agg(id, i), '{}') into idfirst from (select distinct on (id) id, i from (select f ->> 'id' id, i from unnest(fa) with ordinality a(f, i)) z order by id, i) q;
  select coalesce(jsonb_object_agg(id, i), '{}') into idlast from (select distinct on (id) id, i from (select f ->> 'id' id, i from unnest(fa) with ordinality a(f, i)) z order by id, i desc) q;
  -- أحدث تاريخ عودة لكل مشرف (_mfSupBusy_): أول ملف بأعلى ms
  select coalesce(jsonb_object_agg(nm, d), '{}') into busy from (
    select distinct on (nm) nm, d from (
      select _mf_str(e -> 'name') nm, f ->> 'retDate' d, _mf_ms(_rx_trim(f ->> 'retDate')) ms, i, o
        from unnest(fa) with ordinality a(f, i), jsonb_array_elements(_mf_arr(f -> 'sups')) with ordinality b(e, o)
       where jsonb_typeof(e) = 'object') x
     where nm <> '' and ms is not null order by nm, ms desc, i, o) q;
  -- فهرس أحمال المشرفين (_mfSupIdx_.sums)
  select coalesce(jsonb_object_agg(k, s), '{}') into supsum from (
    select (_mf_str(to_jsonb(f ->> 'goDate'))) || '|' || (_mf_str(to_jsonb(f ->> 'retDate'))) || '|' || _mf_str(e -> 'name') k, sum(_mf_num(f -> 'pilgrims') order by i, o) s
      from unnest(fa) with ordinality a(f, i), jsonb_array_elements(_mf_arr(f -> 'sups')) with ordinality b(e, o)
     where jsonb_typeof(e) = 'object' group by 1) q;
  fid := array(select x ->> 'id' from unnest(fa) x);
  fseq := array(select coalesce(nullif(_mf_num(x -> 'seq'), 0), 'Infinity'::float8) from unnest(fa) x);
  fkeys := array(select coalesce((select jsonb_agg(_mf_supkey(e)) from jsonb_array_elements(_mf_arr(x -> 'sups')) e where _mf_counted(e) and _mf_supkey(e) <> ''), '[]'::jsonb) from unnest(fa) x);
  calcs := array_fill('{}'::jsonb, array[n]); fc := array_fill(''::text, array[n]); ft := array_fill(0::float8, array[n]); fr := array_fill(false, array[n]);
  -- حسابات كل ملف (بعد إثراء sups بـ busyTo؛ calc لا يعتمد عليه)
  for i in 1 .. n loop
    f := fa[i]; sups := _mf_arr(f -> 'sups');
    -- إثراء busyTo: busy[s.name] بالاسم الخام
    if jsonb_typeof(f -> 'sups') = 'array' and jsonb_array_length(sups) > 0 and busy <> '{}'::jsonb then
      nsups := coalesce((select jsonb_agg(case when jsonb_typeof(s) = 'object' and (busy -> _mf_namekey(s)) is not null then s || jsonb_build_object('busyTo', busy -> _mf_namekey(s)) else s end order by o)
                           from jsonb_array_elements(sups) with ordinality t(s, o)), '[]'::jsonb);
      fa[i] := jsonb_set(f, '{sups}', nsups); f := fa[i]; sups := nsups;
    end if;
    -- supExempt
    ex := '[]'::jsonb;
    if (f ->> 'goDate') <> '' and (f ->> 'retDate') <> '' then
      mySeq := fseq[i];
      for e in select * from jsonb_array_elements(sups) loop
        if not _mf_counted(e) then continue; end if;
        nm := _mf_supkey(e); if nm = '' then continue; end if;
        owner := null; ownSeq := 'Infinity'::float8;
        for j in select (x #>> '{}')::int from jsonb_array_elements(coalesce(didx -> ((f ->> 'goDate') || '|' || (f ->> 'retDate')), '[]'::jsonb)) x loop
          if fid[j] = (f ->> 'id') then continue; end if;
          if not (fkeys[j] ? nm) then continue; end if;
          os := fseq[j];
          earlier := os < mySeq or (os = mySeq and fid[j] collate "C" < (f ->> 'id') collate "C");
          if earlier and (os < ownSeq or owner is null) then owner := j; ownSeq := os; end if;
        end loop;
        if owner is not null then
          peer := fa[owner];
          ex := ex || jsonb_build_array(jsonb_build_object('name', e -> 'name', 'fileNo', coalesce(nullif(peer ->> 'fileNo', ''), ''),
                 'seq', case when _mf_num(peer -> 'seq') = 0 then '""'::jsonb else peer -> 'seq' end, 'id', peer -> 'id'));
        end if;
      end loop;
    end if;
    -- supElsewhere
    el := coalesce((select jsonb_agg(jsonb_build_object('name', e -> 'name', 'id', e -> 'elsewhere',
                 'fileNo', case when jsonb_typeof(e -> 'elsewhere') = 'string' and idfirst ? (e ->> 'elsewhere') then coalesce(nullif(fa[(idfirst ->> (e ->> 'elsewhere'))::int] ->> 'fileNo', ''), '') else '' end,
                 'seq', case when jsonb_typeof(e -> 'elsewhere') = 'string' and idfirst ? (e ->> 'elsewhere')
                             then case when _mf_num(fa[(idfirst ->> (e ->> 'elsewhere'))::int] -> 'seq') = 0 then '""'::jsonb else fa[(idfirst ->> (e ->> 'elsewhere'))::int] -> 'seq' end
                             else '""'::jsonb end) order by o)
                 from jsonb_array_elements(sups) with ordinality t(e, o) where _mf_ismur(e) and _mf_str(e -> 'elsewhere') <> ''), '[]'::jsonb);
    calcs[i] := _mf_compute(f, p_cfg, ex, el);
    fc[i] := _mf_str(to_jsonb(f ->> 'company')); ft[i] := (calcs[i] ->> 'totalRoomFee')::float8; fr[i] := _mf_str(to_jsonb(f ->> 'reviewDate')) <> '';
  end loop;
  -- الأرصدة (_mfBalances_): الإيداعات بترتيب الإيصالات ثم الملفات (مجاميع مرتَّبة ⇒ نفس ترتيب الجمع الفاسد بالنقطة العائمة)
  select coalesce(jsonb_object_agg(c, jsonb_build_object('company', c, 'deposits', dep, 'withdrawn', wd, 'balance', dep - wd, 'pending', pd)), '{}') into bal from (
    select c.c, coalesce(d.s, 0)::float8 dep, coalesce(w.s, 0)::float8 wd, coalesce(p.s, 0)::float8 pd
      from (select distinct c from (select _mf_str(_rx_c(raw, 3)) c from _rx_rows('mf_receipts') where _mf_str(_rx_c(raw, 0)) <> '' or _mf_str(_rx_c(raw, 3)) <> ''
            union all select unnest(fc)) u) c
      left join (select _mf_str(_rx_c(raw, 3)) c, sum(_mf_num(_rx_c(raw, 5)) order by rn) s from _rx_rows('mf_receipts')
                  where _mf_str(_rx_c(raw, 0)) <> '' or _mf_str(_rx_c(raw, 3)) <> '' group by 1) d on d.c = c.c
      left join (select fc[i] c, sum(ft[i] order by i) s from generate_series(1, n) i where fr[i] group by 1) w on w.c = c.c
      left join (select fc[i] c, sum(ft[i] order by i) s from generate_series(1, n) i where not fr[i] group by 1) p on p.c = c.c) b;
  -- القواعد والإخراج
  for i in 1 .. n loop
    f := fa[i]; c := calcs[i]; sups := _mf_arr(f -> 'sups'); flags := '[]'::jsonb;
    reviewed := _mf_str(f -> 'reviewDate') <> ''; hasno := _mf_str(f -> 'fileNo') <> ''; agentName := _mf_str(f -> 'agent');
    -- 1) حد المشرف المرافق 50
    selfIdx := (idlast ->> (f ->> 'id'))::int; selfF := fa[selfIdx];
    for e in select * from jsonb_array_elements(sups) loop
      if position('مرافق' in _rx_s(e -> 'type')) = 0 then continue; end if;
      if agentName <> '' and _mf_str(e -> 'name') = agentName then continue; end if;
      sName := _mf_str(e -> 'name');
      total := coalesce((supsum ->> (_mf_str(f -> 'goDate') || '|' || _mf_str(f -> 'retDate') || '|' || sName))::float8, 0);
      if selfF is not null and _mf_str(selfF -> 'goDate') = _mf_str(f -> 'goDate') and _mf_str(selfF -> 'retDate') = _mf_str(f -> 'retDate') then
        select total - coalesce(sum(_mf_num(selfF -> 'pilgrims')), 0) into total from jsonb_array_elements(_mf_arr(selfF -> 'sups')) so where _mf_str(so -> 'name') = sName;
      end if;
      total := total + _mf_num(f -> 'pilgrims');
      if total > 50 then
        flags := flags || jsonb_build_array(jsonb_build_object('level', 'warn', 'code', 'SUP50',
          'msg', 'المشرف «' || coalesce(_rx_s_raw(e -> 'name'), '') || '» (مرافق) مُسند إليه ' || _mf_n2t(total) || ' معتمر على الملفات المتطابقة في تاريخي السفر والعودة — الحد الأقصى 50 معتمر إجمالاً.'));
      end if;
    end loop;
    -- 2) مشرف الاستقبال
    for e in select * from jsonb_array_elements(sups) loop
      if position('استقبال' in _rx_s(e -> 'type')) = 0 then continue; end if;
      if agentName <> '' and _mf_str(e -> 'name') = agentName then continue; end if;
      busyTo := _mf_str(e -> 'busyTo'); if busyTo = '' then continue; end if;
      g_ms := _mf_ms(_mf_str(f -> 'goDate')); b_ms := _mf_ms(busyTo);
      if g_ms is not null and b_ms is not null and g_ms < b_ms then
        flags := flags || jsonb_build_array(jsonb_build_object('level', 'warn', 'code', 'RECEP',
          'msg', 'مشرف الاستقبال «' || coalesce(_rx_s_raw(e -> 'name'), '') || '» لم يعد بعد من رحلته الحالية (عودته ' || busyTo || ') وتاريخ سفر هذا الملف ' || (f ->> 'goDate') || '.'));
      end if;
    end loop;
    -- 3) منطقية تواريخ السكن
    g_ms := _mf_ms(_mf_str(f -> 'goDate')); r_ms := _mf_ms(_mf_str(f -> 'retDate'));
    for k in 1 .. 2 loop
      nm := case when k = 1 then 'المدينة' else 'مكة' end;
      i_ms := _mf_ms(_mf_str(f -> case when k = 1 then 'madinahIn' else 'makkahIn' end)); o_ms := _mf_ms(_mf_str(f -> case when k = 1 then 'madinahOut' else 'makkahOut' end));
      if i_ms is not null and o_ms is not null and o_ms <= i_ms then
        flags := flags || jsonb_build_array(jsonb_build_object('level', 'warn', 'code', 'HDATE', 'msg', 'تاريخ الخروج من سكن ' || nm || ' يجب أن يكون بعد تاريخ الدخول.'));
      end if;
      for j in 1 .. 2 loop
        sm := case when j = 1 then i_ms else o_ms end;
        if sm is null then continue; end if;
        if g_ms is not null and sm < g_ms then flags := flags || jsonb_build_array(jsonb_build_object('level', 'warn', 'code', 'HRANGE', 'msg', 'تاريخ ' || case when j = 1 then 'دخول' else 'خروج' end || ' سكن ' || nm || ' قبل تاريخ الذهاب.')); end if;
        if r_ms is not null and sm > r_ms then flags := flags || jsonb_build_array(jsonb_build_object('level', 'warn', 'code', 'HRANGE', 'msg', 'تاريخ ' || case when j = 1 then 'دخول' else 'خروج' end || ' سكن ' || nm || ' بعد تاريخ العودة.')); end if;
      end loop;
    end loop;
    -- 4) مطابقة إجمالي بنود العميل
    bd := f -> 'breakdown';
    if jsonb_typeof(bd) = 'array' and jsonb_array_length(bd) > 0 then
      select coalesce(sum(_mf_num(case when jsonb_typeof(b) = 'object' then b -> 'count' end) order by o), 0) into sm from jsonb_array_elements(bd) with ordinality t(b, o);
      if sm <> _mf_num(f -> 'pilgrims') then
        flags := flags || jsonb_build_array(jsonb_build_object('level', 'warn', 'code', 'CLISUM', 'msg', 'إجمالي بنود العميل (' || _mf_n2t(sm) || ') لا يطابق عدد المعتمرين (' || _mf_n2t(_mf_num(f -> 'pilgrims')) || ').'));
      end if;
    end if;
    -- 5) رصيد رسوم الغرفة
    if hasno and not reviewed then
      balv := _mf_num(bal -> (_mf_str(f -> 'company')) -> 'balance');
      if (c ->> 'totalRoomFee')::float8 > balv then
        flags := flags || jsonb_build_array(jsonb_build_object('level', 'warn', 'code', 'NOBAL',
          'msg', 'رصيد رسوم الغرفة لشركة «' || (f ->> 'company') || '» (' || _mf_n2t(balv) || ') لا يكفي المطلوب لهذا الملف (' || _mf_n2t((c ->> 'totalRoomFee')::float8) || ') — تنبيه غير مانع، السحب يتم عند تسجيل تاريخ المراجعة.'));
      end if;
    end if;
    -- 6) سفر خلال 3 أيام ولم تتم المراجعة
    if not reviewed and g_ms is not null then
      days := ceil((g_ms - todayMs) / 86400000.0);
      if days <= 3 and days >= 0 then
        flags := flags || jsonb_build_array(jsonb_build_object('level', 'warn', 'code', 'URGENT',
          'msg', 'السفر بعد ' || _mf_n2t(days) || ' يوم ولم تتم المراجعة بعد' || case when days <= 2 then ' — نوع المراجعة الافتراضي VIP.' else ' — تبقّى يوم قبل أن تصبح المراجعة VIP تلقائياً (يومان أو أقل).' end));
      end if;
    end if;
    res := res || (f || jsonb_build_object('calc', c, 'flags', flags));
  end loop;
  return jsonb_build_object('files', to_jsonb(res), 'balances', bal);
end $$;

-- _mfReadReceipts_ (مع _row)
create or replace function _mf_receipts() returns jsonb language sql stable as
$$ select coalesce(jsonb_agg(jsonb_build_object('receiptNo', _mf_str(_rx_c(raw, 0)), 'date', _mf_date(_rx_c(raw, 1)), 'time', _mf_time(_rx_c(raw, 2)),
     'company', _mf_str(_rx_c(raw, 3)), 'licence', _mf_str(_rx_c(raw, 4)), 'amount', _mf_num(_rx_c(raw, 5)), 'depositor', _mf_str(_rx_c(raw, 6)),
     'source', coalesce(nullif(_mf_str(_rx_c(raw, 7)), ''), 'يدوي'), 'notes', _mf_str(_rx_c(raw, 8)), 'createdBy', _mf_str(_rx_c(raw, 9)),
     'createdAt', _mf_datetime(_rx_c(raw, 10)), '_row', rn) order by rn), '[]'::jsonb)
   from _rx_rows('mf_receipts') where _mf_str(_rx_c(raw, 0)) <> '' or _mf_str(_rx_c(raw, 3)) <> '' $$;
-- _mfReadSupervisors_ (مع _row)
create or replace function _mf_supervisors() returns jsonb language sql stable as
$$ select coalesce(jsonb_agg(jsonb_build_object('name', _mf_str(_rx_c(raw, 0)), 'type', coalesce(nullif(_mf_str(_rx_c(raw, 1)), ''), 'مرافق'), 'home', _mf_str(_rx_c(raw, 2)),
     'shared', case when _mf_str(_rx_c(raw, 3)) <> '' then coalesce((select jsonb_agg(t order by o) from (select _rx_trim(x) t, o from unnest(regexp_split_to_array(_mf_str(_rx_c(raw, 3)), '[،,]')) with ordinality a(x, o)) y where t <> ''), '[]'::jsonb) else '[]'::jsonb end,
     'mobile', _mf_str(_rx_c(raw, 4)), 'notes', _mf_str(_rx_c(raw, 5)), 'createdBy', _mf_str(_rx_c(raw, 6)), 'createdAt', _mf_str(_rx_c(raw, 7)), '_row', rn) order by rn), '[]'::jsonb)
   from _rx_rows('mf_supervisors') where _mf_str(_rx_c(raw, 0)) <> '' $$;

-- _mfBuildRefListsRaw_: الشركات + الرحلات + العملاء
create or replace function _mf_reflists() returns jsonb language plpgsql stable set search_path = public as
$$ declare tm jsonb := _rx_map('trips', _rx_h_trips()); comp jsonb; trips jsonb; cli jsonb; begin
  select coalesce(jsonb_agg(jsonb_build_object('row', rn, 'agent', _mf_str(_rx_c(raw, 0)), 'company', _mf_str(_rx_c(raw, 1)), 'logoUrl', _mf_str(_rx_c(raw, 2)), 'licence', _mf_str(_rx_c(raw, 3))) order by rn), '[]'::jsonb)
    into comp from _rx_rows('companies') where _mf_str(_rx_c(raw, 1)) <> '';
  select coalesce(jsonb_agg(jsonb_build_object('name', nm, 'company', _mf_str(_rx_c(raw, _rx_ix(tm, 'الشركة المصرية'))), 'agent', _mf_str(_rx_c(raw, _rx_ix(tm, 'الوكيل السعودي'))),
      'supervisor', _mf_str(_rx_c(raw, _rx_ix(tm, 'المشرف'))), 'supervisorRole', _mf_str(_rx_c(raw, _rx_ix(tm, 'دور المشرف'))),
      'goDate', _mf_date(_rx_c(raw, _rx_ix(tm, 'تاريخ الذهاب'))), 'retDate', _mf_date(_rx_c(raw, _rx_ix(tm, 'تاريخ العودة'))),
      'madinahHotel', _mf_str(_rx_c(raw, _rx_ix(tm, 'سكن المدينة'))), 'madinahIn', _mf_date(_rx_c(raw, _rx_ix(tm, 'تاريخ دخول المدينة'))), 'madinahOut', _mf_date(_rx_c(raw, _rx_ix(tm, 'تاريخ الخروج من المدينة'))),
      'makkahHotel', _mf_str(_rx_c(raw, _rx_ix(tm, 'سكن مكة'))), 'makkahIn', _mf_date(_rx_c(raw, _rx_ix(tm, 'تاريخ دخول مكة'))), 'makkahOut', _mf_date(_rx_c(raw, _rx_ix(tm, 'تاريخ الخروج من مكة'))),
      'madinahExtra', _mf_parse_arr(_rx_c(raw, _rx_ix(tm, 'فنادق إضافية - المدينة (JSON)'))), 'makkahExtra', _mf_parse_arr(_rx_c(raw, _rx_ix(tm, 'فنادق إضافية - مكة (JSON)'))),
      'madinahNights', _mf_num(_rx_c(raw, _rx_ix(tm, 'ليالي المدينة'))), 'makkahNights', _mf_num(_rx_c(raw, _rx_ix(tm, 'ليالي مكة'))),
      'airline', _mf_str(_rx_c(raw, _rx_ix(tm, 'الخطوط'))), 'direction', _mf_str(_rx_c(raw, _rx_ix(tm, 'اتجاه الإقامة'))),
      'tripRef', _mf_str(_rx_c(raw, _rx_ix(tm, 'الرقم المرجعي'))), 'seats', _mf_num(_rx_c(raw, _rx_ix(tm, 'عدد الأماكن المحجوزة')))) order by rn), '[]'::jsonb)
    into trips from (select rn, raw, _mf_str(_rx_c(raw, _rx_ix(tm, 'اسم الرحلة'))) nm from _rx_rows('trips')) t where nm <> '';
  select coalesce(jsonb_agg(n order by m), '[]'::jsonb) into cli from (select n, min(rn) m from (select rn, _mf_str(_rx_c(raw, 0)) n from _rx_rows('clients')) x where n <> '' group by n) y;
  return jsonb_build_object('companies', comp, 'trips', trips, 'clients', cli); end $$;

-- ===== 6) الدوال المعروضة =====
create or replace function rx2_getministrybootstrap(a jsonb, u text) returns jsonb language plpgsql stable set search_path = public as
$$ declare pol jsonb; cfg jsonb; core jsonb; ref jsonb; tdy text := _mf_today(); begin
  if not app_has('ministry.view') then raise exception 'لا تملك صلاحية عرض مراجعة ملفات الوزارة' using errcode = '42501'; end if;
  cfg := _sx_acc_pricing(); pol := _sx_exec_policy();
  core := _mf_all(pol, cfg, tdy); ref := _mf_reflists();
  return jsonb_build_object('files', core -> 'files', 'receipts', _mf_receipts(), 'supervisors', _mf_supervisors(),
    'companies', ref -> 'companies', 'trips', ref -> 'trips', 'clients', ref -> 'clients', 'balances', core -> 'balances', 'cfg', cfg, 'today', tdy,
    'success', true, 'user', u,
    'can', jsonb_build_object('add', app_has('ministry.add'), 'edit', app_has('ministry.edit'), 'del', app_has('ministry.delete'), 'approve', app_has('ministry.approve'), 'admin', app_has('admin')),
    'execPolicy', pol, 'dataVer', 0, 'stale', false,
    'perf', jsonb_build_object('cache', 'sb', 'serverMs', 0, 'files', jsonb_array_length(core -> 'files'))); end $$;

create or replace function rx2_getministrytriplinks(a jsonb, u text) returns jsonb language plpgsql stable set search_path = public as
$$ declare tm jsonb := _rx_map('trips', _rx_h_trips()); known jsonb; links jsonb; alerts jsonb := '[]'::jsonb; tinfo jsonb; byb jsonb; pol jsonb; todayMs float8 := _mf_ms(_mf_today()); begin
  if not (app_has('ministry.view') or app_has('trips.view')) then return jsonb_build_object('success', true, 'links', '{}'::jsonb, 'alerts', '[]'::jsonb); end if;
  pol := _sx_exec_policy(); known := _mf_trip_names();
  with fl as materialized (select rn, f from _mf_files_raw(pol)),
       ent as (select rn, f, jsonb_build_object('id', f -> 'id', 'fileNo', f -> 'fileNo', 'seq', f -> 'seq', 'reviewDate', f -> 'reviewDate', 'reviewed', (f ->> 'reviewDate') <> '',
                 'approved', f -> 'approved', 'pilgrims', f -> 'pilgrims', 'clientLabel', f -> 'clientLabel', 'company', f -> 'company', 'ref', f -> 'ref', 'createdAt', f -> 'createdAt',
                 'selected', _mf_arr(f -> 'selected')) e from fl),
       lk as (select t, jsonb_agg(e order by rn) arr from ent, unnest(_mf_trips_of(f ->> 'tripName', f ->> 'extraTrips', known)) t group by t)
  select (select coalesce(jsonb_object_agg(t, arr), '{}'::jsonb) from lk),
         case when _sx_alert_on('mf_urgent') then
           (select coalesce(jsonb_agg(jsonb_build_object('id', f -> 'id', 'tripName', f -> 'tripName', 'client', f -> 'clientLabel', 'goDate', f -> 'goDate',
                'days', ceil((_mf_ms(_mf_str(f -> 'goDate')) - todayMs) / 86400000.0), 'linked', _mf_str(f -> 'tripName') <> '', 'fileNo', f -> 'fileNo') order by rn), '[]'::jsonb)
              from fl where (f ->> 'reviewDate') = '' and _mf_ms(_mf_str(f -> 'goDate')) is not null
               and ceil((_mf_ms(_mf_str(f -> 'goDate')) - todayMs) / 86400000.0) between 0 and 3) else '[]'::jsonb end
    into links, alerts;
  select coalesce(jsonb_object_agg(nm, jsonb_build_object('bookingId', bk, 'tripRef', rf)), '{}'::jsonb) into tinfo from (
    select rn, _mf_str(_rx_c(raw, _rx_ix(tm, 'اسم الرحلة'))) nm, _mf_str(_rx_c(raw, _rx_ix(tm, 'رقم الإشعار المرتبط'))) bk, _mf_str(_rx_c(raw, _rx_ix(tm, 'الرقم المرجعي'))) rf
      from _rx_rows('trips') order by rn) x where nm <> '';
  select coalesce(jsonb_object_agg(bk, nm), '{}'::jsonb) into byb from (
    select rn, _mf_str(_rx_c(raw, _rx_ix(tm, 'اسم الرحلة'))) nm, _mf_str(_rx_c(raw, _rx_ix(tm, 'رقم الإشعار المرتبط'))) bk from _rx_rows('trips') order by rn) x where nm <> '' and bk <> '';
  return jsonb_build_object('success', true, 'links', links, 'alerts', alerts, 'tripInfo', tinfo, 'byBooking', byb); end $$;

-- ===== 7) نقطة الدخول rx_call2 (توجيه ديناميكي إلى rx2_<fn>) =====
create or replace function rx_call2(p_fn text, p_args jsonb default '[]'::jsonb) returns jsonb language plpgsql stable security definer set search_path = public as
$$ declare d jsonb; a jsonb := case when jsonb_typeof(p_args) = 'array' then p_args else '[]'::jsonb end; dv jsonb; u text := app_user(); p regprocedure; begin
  if u is null then raise exception 'غير مصرّح' using errcode = '42501'; end if;
  if p_fn !~ '^[A-Za-z]{3,60}$' then raise exception 'دالة غير مدعومة: %', p_fn using errcode = '0A000'; end if;
  p := to_regprocedure('public.rx2_' || lower(p_fn) || '(jsonb,text)');
  if p is null then raise exception 'دالة غير مدعومة: %', p_fn using errcode = '0A000'; end if;
  select coalesce(jsonb_object_agg(group_name, token), '{}'::jsonb) into dv from data_versions;   -- قبل القراءة (لقطة متسقة)
  execute format('select %s($1, $2)', p::regproc::text) into d using a, u;
  return jsonb_build_object('success', true, 'd', d, 'dv', dv);
end $$;

-- ===== 8) الصلاحيات =====
do $$ declare r record; begin
  for r in select p.oid::regprocedure::text sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and (p.proname like '\_mf\_%' or p.proname like '\_sx\_%' or p.proname like '\_ac\_%' or p.proname like 'rx2\_%' or p.proname like '\_vz\_%' or p.proname = 'kv_set') loop
    execute format('revoke all on function %s from public, anon, authenticated', r.sig);
    execute format('grant execute on function %s to service_role', r.sig);
  end loop;
end $$;
revoke all on function rx_call2(text, jsonb) from public, anon;
grant execute on function rx_call2(text, jsonb) to authenticated, service_role;

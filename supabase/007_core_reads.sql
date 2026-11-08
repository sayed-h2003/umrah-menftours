-- 007_core_reads.sql — (V4.377 / المرحلة 4) قراءات الرحلات والمعتمرين والحركات والعملاء من Postgres مباشرة (المتصفح ← RPC ← jsonb)
-- كل دالة rx_*_raw تُرجع نفس JSON الذي تُرجعه دالة Apps Script المقابلة حرفياً (الأسماء/الأنواع/القيم/التواريخ dd/MM/yyyy بتوقيت القاهرة):
--   getTripsList → rx_trips_list_raw · getTripPilgrims → rx_trip_pilgrims_raw · getGlobalPilgrimsRegistry → rx_registry_raw
--   getAllMovementsAuth → rx_movements_raw · loadDropdownsData → rx_dropdowns_raw · getClientsDirectory → rx_clients_dir_raw
--   getKnownClientNames → rx_known_clients_raw · getTripDraft → rx_trip_draft_raw · getTripHotelsList → rx_trip_hotels_raw
--   getTripPricing → rx_trip_pricing_raw (الصلاحية pricing.view من JWT) · getMyUiPrefs → rx_ui_prefs_raw (للمستخدم صاحب الرمز فقط)
-- المصدر: store_rows.raw (خلايا الشيت حرفياً بترتيب الصفوف — تكتبها Store.gs) + store_meta.hdr (ترويسة الشيت). نفس منطق قراءة الأعمدة بالاسم
-- (_robustColMap_: الموضع الفعلي بالاسم وإلا الموضع القانوني) فتتطابق النتائج حتى لو أُعيد ترتيب الأعمدة.
-- الدالة العامة rx_call(fn, args) هي نقطة الدخول الوحيدة للمتصفح: تفحص الصلاحية من JWT ثم تُرجع {success, d, dv} (dv = بصمات المجموعات لحظة القراءة).
-- يتطلب 001 (app_has/data_versions) + 006 (store_rows/store_meta). آمن لإعادة التشغيل. لا يكتب أي شيء.
-- ملاحظات تطابق: التوقيت Africa/Cairo (كبقية الملفات) · Number("abc")=NaN ⇒ null · تاريخ بخلية نصية يمر كما هو.

-- ===== 1) أدوات الخلايا =====
create or replace function _rx_trim(s text) returns text language sql immutable as
$$ select btrim(s, E' \t\n\r\f\x0b                 　﻿') $$;

-- String(c || "") — صفر/false/null/'' ⇒ ''
create or replace function _rx_s(c jsonb) returns text language sql immutable as
$$ select case jsonb_typeof(c)
     when 'string' then c #>> '{}'
     when 'number' then case when (c #>> '{}')::numeric = 0 then '' else c #>> '{}' end
     when 'boolean' then case when c = 'true'::jsonb then 'true' else '' end
     else '' end $$;

create or replace function _rx_s_raw(c jsonb) returns text language sql immutable as   -- String(c) لخلية truthy (رقم ⇒ نصه)
$$ select case jsonb_typeof(c) when 'string' then c #>> '{}' when 'number' then c #>> '{}' when 'boolean' then c #>> '{}' else '' end $$;

create or replace function _rx_truthy(c jsonb) returns boolean language sql immutable as
$$ select case jsonb_typeof(c)
     when 'string' then (c #>> '{}') <> ''
     when 'number' then (c #>> '{}')::numeric <> 0
     when 'boolean' then c = 'true'::jsonb
     when 'object' then true when 'array' then true
     else false end $$;

-- خلية بالفهرس (null/خارج الصف ⇒ "")
-- String(c||"").trim() <> "" لخلية قد تكون تاريخاً (التاريخ ⇒ نص غير فارغ)
create or replace function _rx_dnz(c jsonb) returns boolean language sql immutable as
$$ select case when jsonb_typeof(c) = 'object' and c ? '$d' then true else _rx_trim(_rx_s(c)) <> '' end $$;

create or replace function _rx_c(raw jsonb, idx int) returns jsonb language sql immutable as
$$ select coalesce(raw -> idx, '""'::jsonb) $$;

create or replace function _rx_json(t text) returns jsonb language plpgsql immutable as
$$ begin return t::jsonb; exception when others then return null; end $$;

-- Number(s): نص ⇒ رقم أو NaN (null)
create or replace function _rx_jsnum(s text) returns float8 language plpgsql immutable as
$$ declare t text := _rx_trim(s); begin
  if t = '' then return 0; end if;
  if t ~ '^[+-]?([0-9]+\.?[0-9]*|\.[0-9]+)([eE][+-]?[0-9]+)?$' then return t::float8; end if;
  return null; end $$;
create or replace function _rx_numc(c jsonb) returns float8 language sql immutable as
$$ select case jsonb_typeof(c) when 'number' then (c #>> '{}')::float8 when 'string' then _rx_jsnum(c #>> '{}')
     when 'boolean' then case when c = 'true'::jsonb then 1 else 0 end
     when 'object' then case when c ? '$d' then (c ->> '$d')::float8 else null end else 0 end $$;

-- تاريخ الشيت {"$d": ms} ⇒ dd/MM/yyyy (القاهرة) · وإلا val ? String(val) : ""
create or replace function _rx_fdate(c jsonb) returns text language sql immutable as
$$ select case when jsonb_typeof(c) = 'object' and c ? '$d'
     then to_char(to_timestamp(floor((c ->> '$d')::float8 / 1000.0)) at time zone 'Africa/Cairo', 'DD/MM/YYYY')
     else _rx_s(c) end $$;

-- _tripFormatTime_ (بلا مسار new Date(نص) للنصوص غير HH:mm)
create or replace function _rx_ftime(c jsonb) returns text language plpgsql immutable as
$$ declare s text; begin
  if jsonb_typeof(c) = 'object' and c ? '$d' then
    return to_char(to_timestamp(floor((c ->> '$d')::float8 / 1000.0)) at time zone 'Africa/Cairo', 'HH24:MI');
  end if;
  s := _rx_trim(_rx_s(c));
  if s = '' then return ''; end if;
  if s ~ '^[0-9]{1,2}:[0-9]{2}' and s !~ '\y(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\y' then
    return right('0' || substring(s from '^([0-9]{1,2}):'), 2) || ':' || substring(s from '^[0-9]{1,2}:([0-9]{2})');
  end if;
  return s; end $$;

-- _parseDmy_ (نص dd/MM/yyyy ⇒ تاريخ؛ الشهر/اليوم الزائد يلتفّ كما new Date(y, m-1, d))
create or replace function _rx_dmy(s text) returns date language plpgsql immutable as
$$ declare m text[]; begin
  m := regexp_match(coalesce(s, ''), '^(\d{1,2})/(\d{1,2})/(\d{4})$');
  if m is null then return null; end if;
  return (make_date(m[3]::int, 1, 1) + make_interval(months => m[2]::int - 1))::date + (m[1]::int - 1);
end $$;

-- ترويسة الشيت
create or replace function _rx_hdr(p_tbl text) returns jsonb language sql stable as
$$ select coalesce((select hdr from store_meta where tbl = p_tbl), '[]'::jsonb) $$;
-- صفوف البيانات بأرقام صفوف الشيت (الصف 2 فصاعداً). الصفوف الفارغة بعد آخر صف غير فارغ تُهمَل (كما getLastRow)
create or replace function _rx_rows(p_tbl text) returns table (rn int, raw jsonb) language sql stable as
$$ with x as (select (row_number() over (order by ord, rid) + 1)::int rn, raw,
                     exists (select 1 from jsonb_array_elements(raw) c where c not in ('""'::jsonb, 'null'::jsonb)) nb
                from store_rows where tbl = p_tbl)
   select rn, raw from x where rn <= coalesce((select max(rn) from x where nb), 1) $$;

-- فهرس أول عمود بنص مطابق تماماً (bHeaders.indexOf) أو null
create or replace function _rx_idx(hdr jsonb, nm text) returns int language sql immutable as
$$ select (min(o) - 1)::int from jsonb_array_elements(hdr) with ordinality a(v, o) where jsonb_typeof(v) = 'string' and (v #>> '{}') = nm $$;

-- _robustColMap_: {عنوان: فهرس} — الموضع الفعلي بالاسم وإلا الموضع القانوني + أي عناوين فعلية إضافية
create or replace function _rx_map(p_tbl text, canon text[]) returns jsonb language sql stable as
$$ with h as (select o, _rx_trim(_rx_s(v)) t from jsonb_array_elements(_rx_hdr(p_tbl)) with ordinality a(v, o)),
        act as (select t, min(o) - 1 idx from h where t <> '' group by t)
   select coalesce(jsonb_object_agg(k, idx), '{}'::jsonb)
     from (select c.k, coalesce((select idx from act where act.t = c.k), c.i - 1) idx from unnest(canon) with ordinality c(k, i)
           union all select t, idx from act where t <> all (canon)) x $$;

create or replace function _rx_h_trips() returns text[] language sql immutable as $$ select array['اسم الرحلة','الشركة المصرية','الوكيل السعودي','المشرف','تاريخ الذهاب','تاريخ العودة','الخطوط','سكن المدينة','تاريخ دخول المدينة','تاريخ الخروج من المدينة','ليالي المدينة','سكن مكة','تاريخ دخول مكة','تاريخ الخروج من مكة','ليالي مكة','رقم الإشعار المرتبط','تاريخ الإنشاء','عدد الأماكن المحجوزة','اتجاه الإقامة','رابط تذكرة الرحلة','معرف تذكرة الرحلة','مسودة الإشعار (JSON)','دور المشرف','الرقم المرجعي','فنادق إضافية - المدينة (JSON)','فنادق إضافية - مكة (JSON)','منفذ الوصول','منفذ المغادرة','ساعة الوصول','ساعة المغادرة','رقم رحلة الوصول','رقم رحلة المغادرة','المشرفون (JSON)','رمز مشاركة العميل','أرقام جوالات المشرف'] $$;
create or replace function _rx_h_pil() returns text[] language sql immutable as $$ select array['مسلسل','اسم المعتمر','رقم الجواز','النوع','العميل','طبيعة التسكين','رقم الغرفة','ملاحظات','اسم الرحلة','رقم الإشعار','الاسم بالإنجليزية','تاريخ الميلاد','تاريخ إصدار الجواز','تاريخ انتهاء الجواز','معرف المعتمر','معرف المحرم','علاقة المحرم','فندق المدينة','فندق مكة','مجموعة الغرفة','مستبعد من التسكين','رقم غرفة المدينة','رقم غرفة مكة','مستبعد من تسكين المدينة','مستبعد من تسكين مكة'] $$;
create or replace function _rx_h_bk() returns text[] language sql immutable as $$ select array['مراجعة واعتماد','رقم الإشعار','الوكيل السعودي','الشركة المصرية','أرقام المجموعات','العميل','العدد','المشرف','وسيلة السفر','منفذ الوصول','تاريخ الوصول','ساعة الوصول','رقم رحلة الوصول','تاريخ المغادرة','رقم رحلة المغادرة','ساعة المغادرة','منفذ المغادرة','شركة النقل الداخلي','رقم التشغيلة','عدد الباصات','اتجاه الإقامة','عدد ليالي المدينة','عدد ليالي مكة','سكن المدينة','دخول المدينة','خروج المدينة','سكن مكة','دخول مكة','خروج مكة','extraMovements','ملاحظات الإشعار','رابط تذكرة الطيران','معرّف ملف التذكرة','سعر الباص','قيمة التشغيلة','اسم الرحلة','تاريخ التحرك الداخلي الأساسي','توقيت التحرك الداخلي الأساسي','اسم المجموعة','مقاطع نقل إضافية','مرفقات إضافية (JSON)','مجموعات التأشيرات','ملفات الوزارة','إرفاق أسماء المعتمرين'] $$;

create or replace function _rx_ix(m jsonb, k text) returns int language sql immutable as $$ select (m ->> k)::int $$;

-- _parseSupervisorsRow_
create or replace function _rx_sups(r jsonb, ji int, ni int, ri int) returns jsonb language plpgsql stable as
$$ declare txt text := _rx_trim(_rx_s(case when ji is null then null else r -> ji end)); arr jsonb; o jsonb; nm text; begin
  if txt <> '' then
    arr := _rx_json(txt);
    if jsonb_typeof(arr) = 'array' then
      select coalesce(jsonb_agg(x.o order by x.n), '[]'::jsonb) into o from (
        select n, jsonb_build_object('name', _rx_trim(_rx_s(case when jsonb_typeof(e) = 'object' then e -> 'name' end)),
                 'role', coalesce(nullif(_rx_s(case when jsonb_typeof(e) = 'object' then e -> 'role' end), ''), 'مرافق'),
                 'mobile', _rx_trim(_rx_s(case when jsonb_typeof(e) = 'object' then e -> 'mobile' end))) o
          from jsonb_array_elements(arr) with ordinality a(e, n)) x
        where (x.o ->> 'name') <> '';
      if jsonb_array_length(o) > 0 then return o; end if;
    end if;
  end if;
  nm := _rx_trim(_rx_s(case when ni is null then null else r -> ni end));
  if nm = '' then return '[]'::jsonb; end if;
  return jsonb_build_array(jsonb_build_object('name', nm, 'role', coalesce(nullif(_rx_s(case when ri is null then null else r -> ri end), ''), 'مرافق')));
end $$;

create or replace function _rx_sups_disp(l jsonb) returns text language sql immutable as
$$ select coalesce(string_agg((s ->> 'name') || case when (s ->> 'role') = 'استقبال فقط' then ' (استقبال)' else '' end
                    || case when coalesce(s ->> 'mobile', '') <> '' then ' — ' || (s ->> 'mobile') else '' end, ' / ' order by n), '')
     from jsonb_array_elements(l) with ordinality a(s, n) $$;
create or replace function _rx_sup_seats(l jsonb) returns int language sql immutable as
$$ select count(*)::int from jsonb_array_elements(l) s where (s ->> 'role') <> 'استقبال فقط' $$;

-- ===== 2) قائمة الرحلات =====
create or replace function rx_trips_list_raw(p_today date) returns jsonb language plpgsql stable set search_path = public as
$$ declare tm jsonb := _rx_map('trips', _rx_h_trips()); pm jsonb := _rx_map('pilgrims', _rx_h_pil());
  bh jsonb := _rx_hdr('bookings'); b_trip int := _rx_idx(bh, 'اسم الرحلة'); b_tick int := _rx_idx(bh, 'رابط التذكرة'); b_id int := _rx_idx(bh, 'رقم الإشعار');
  b_dep int := _rx_idx(bh, 'تاريخ المغادرة'); b_cnt int := _rx_idx(bh, 'العدد');
  t0ms float8 := extract(epoch from (p_today::timestamp at time zone 'Africa/Cairo')) * 1000; res jsonb;
  c_tn int := _rx_ix(pm, 'اسم الرحلة'); c_pn int := _rx_ix(pm, 'اسم المعتمر'); c_ty int := _rx_ix(pm, 'النوع'); c_cl int := _rx_ix(pm, 'العميل'); c_rm int := _rx_ix(pm, 'رقم الغرفة');
begin
  if not exists (select 1 from store_rows where tbl = 'trips') then return '[]'::jsonb; end if;
  with pl as (
    select _rx_trim(_rx_s(raw -> c_tn)) tn, _rx_trim(_rx_s(raw -> c_pn)) pn, _rx_trim(_rx_s(raw -> c_ty)) ty, _rx_trim(_rx_s(raw -> c_cl)) cl, _rx_trim(_rx_s(raw -> c_rm)) rm
      from store_rows where tbl = 'pilgrims'),
  pc as (select tn, count(*)::int cnt, (count(*) filter (where ty = 'رضيع'))::int inf, (count(*) filter (where starts_with(cl, 'المشرف')))::int sup, bool_or(rm <> '') hous
           from pl where tn <> '' and pn <> '' group by tn),
  bk as (select rn, raw, _rx_trim(_rx_s(case when b_trip is null then null else raw -> b_trip end)) tn from _rx_rows('bookings')),
  bkt as (select * from bk where tn <> '' and b_trip is not null),
  bflag as (select distinct tn from bkt),
  bid as (select distinct on (tn) tn, _rx_s_raw(raw -> b_id) v from bkt where b_id is not null and _rx_truthy(raw -> b_id) order by tn, rn desc),
  btick as (select distinct tn from bkt where b_tick is not null and _rx_trim(_rx_s(raw -> b_tick)) <> ''),
  btid as (select distinct _rx_trim(_rx_s_raw(raw -> b_id)) v from bkt where b_tick is not null and b_id is not null and _rx_trim(_rx_s(raw -> b_tick)) <> '' and _rx_truthy(raw -> b_id)),
  bdep as (select distinct on (tn) tn, _rx_fdate(raw -> b_dep) v from bkt where b_dep is not null and _rx_truthy(raw -> b_dep) and _rx_fdate(raw -> b_dep) <> '' order by tn, rn desc),
  bcnt as (select distinct on (tn) tn, _rx_numc(raw -> b_cnt) v from bkt where b_cnt is not null and raw -> b_cnt is not null and (raw -> b_cnt) not in ('""'::jsonb, 'null'::jsonb) and _rx_numc(raw -> b_cnt) > 0 order by tn, rn desc),
  priced as (select distinct _rx_trim(_rx_s(raw -> 0)) tn from store_rows where tbl = 'acc_trip_prices'
              and jsonb_typeof(_rx_json(_rx_s(raw -> 1))) = 'object' and _rx_truthy(_rx_json(_rx_s(raw -> 1)) -> 'applied')),
  tr as (select rn, raw from _rx_rows('trips')),
  cur as (
    select t.rn, t.raw, _rx_trim(_rx_s(_rx_c(t.raw, _rx_ix(tm, 'اسم الرحلة')))) name,
           _rx_c(t.raw, _rx_ix(tm, 'تاريخ العودة')) ret, _rx_c(t.raw, _rx_ix(tm, 'عدد الأماكن المحجوزة')) bs,
           _rx_s(_rx_c(t.raw, _rx_ix(tm, 'رقم الإشعار المرتبط'))) linked,
           _rx_sups(t.raw, _rx_ix(tm, 'المشرفون (JSON)'), _rx_ix(tm, 'المشرف'), _rx_ix(tm, 'دور المشرف')) sups
      from tr t),
  cur2 as (
    select c.*, coalesce(pc.cnt, 0) pcnt, coalesce(pc.inf, 0) inf, coalesce(pc.sup, 0) sup, coalesce(pc.hous, false) hous,
           (coalesce(pc.cnt, 0) - coalesce(pc.sup, 0) - coalesce(pc.inf, 0)) + _rx_sup_seats(c.sups) seats,
           case when jsonb_typeof(c.ret) = 'object' and c.ret ? '$d' then (c.ret ->> '$d')::float8 < t0ms
                else coalesce(_rx_dmy(_rx_fdate(c.ret)) < p_today, false) end arch
      from cur c left join pc on pc.tn = c.name where c.name <> ''),
  cur3 as (
    select c.*, case when c.bs in ('""'::jsonb, 'null'::jsonb) then '""'::jsonb else coalesce(to_jsonb(_rx_numc(c.bs)), 'null'::jsonb) end bs0 from cur2 c),
  cur4 as (
    select c.*, case when c.arch and c.bs0 = '""'::jsonb and c.seats > 0 then to_jsonb(c.seats) else c.bs0 end bsf from cur3 c)
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'row', c.rn, 'name', c.name,
      'company', _rx_s(_rx_c(c.raw, _rx_ix(tm, 'الشركة المصرية'))), 'agent', _rx_s(_rx_c(c.raw, _rx_ix(tm, 'الوكيل السعودي'))), 'supervisor', _rx_s(_rx_c(c.raw, _rx_ix(tm, 'المشرف'))),
      'departDate', _rx_fdate(_rx_c(c.raw, _rx_ix(tm, 'تاريخ الذهاب'))), 'returnDate', _rx_fdate(c.ret), 'airline', _rx_s(_rx_c(c.raw, _rx_ix(tm, 'الخطوط'))),
      'madinahHotel', _rx_s(_rx_c(c.raw, _rx_ix(tm, 'سكن المدينة'))), 'madinahCheckIn', _rx_fdate(_rx_c(c.raw, _rx_ix(tm, 'تاريخ دخول المدينة'))),
      'madinahCheckOut', _rx_fdate(_rx_c(c.raw, _rx_ix(tm, 'تاريخ الخروج من المدينة'))),
      'madinahNights', case when _rx_c(c.raw, _rx_ix(tm, 'ليالي المدينة')) in ('""'::jsonb, 'null'::jsonb) then '""'::jsonb else coalesce(to_jsonb(_rx_numc(_rx_c(c.raw, _rx_ix(tm, 'ليالي المدينة')))), 'null'::jsonb) end,
      'makkahHotel', _rx_s(_rx_c(c.raw, _rx_ix(tm, 'سكن مكة'))), 'makkahCheckIn', _rx_fdate(_rx_c(c.raw, _rx_ix(tm, 'تاريخ دخول مكة'))),
      'makkahCheckOut', _rx_fdate(_rx_c(c.raw, _rx_ix(tm, 'تاريخ الخروج من مكة'))),
      'makkahNights', case when _rx_c(c.raw, _rx_ix(tm, 'ليالي مكة')) in ('""'::jsonb, 'null'::jsonb) then '""'::jsonb else coalesce(to_jsonb(_rx_numc(_rx_c(c.raw, _rx_ix(tm, 'ليالي مكة')))), 'null'::jsonb) end,
      'linkedBookingId', case when c.linked <> '' then c.linked else coalesce((select v from bid where bid.tn = c.name), '') end,
      'pricingApplied', exists (select 1 from priced p where p.tn = c.name),
      'pilgrimCount', c.pcnt, 'infantCount', c.inf, 'supervisors', c.sups, 'supervisorsDisplay', _rx_sups_disp(c.sups),
      'supervisorPhones', _rx_s(_rx_c(c.raw, _rx_ix(tm, 'أرقام جوالات المشرف'))), 'seatsOccupied', c.seats,
      'bookedSeats', c.bsf, 'direction', _rx_s(_rx_c(c.raw, _rx_ix(tm, 'اتجاه الإقامة')))
    ) || jsonb_build_object(
      'ticketUrl', _rx_s(_rx_c(c.raw, _rx_ix(tm, 'رابط تذكرة الرحلة'))), 'ticketFileId', _rx_s(_rx_c(c.raw, _rx_ix(tm, 'معرف تذكرة الرحلة'))),
      'availableSeats', case when c.bsf = '""'::jsonb then '""'::jsonb when c.bsf = 'null'::jsonb then 'null'::jsonb else to_jsonb((c.bsf #>> '{}')::float8 - c.seats) end,
      'hasDraft', _rx_trim(_rx_s(_rx_c(c.raw, _rx_ix(tm, 'مسودة الإشعار (JSON)')))) <> '',
      'supervisorRole', coalesce(nullif(_rx_s(_rx_c(c.raw, _rx_ix(tm, 'دور المشرف'))), ''), 'مرافق'),
      'tripRef', _rx_s(_rx_c(c.raw, _rx_ix(tm, 'الرقم المرجعي'))),
      'ruleCount', greatest(0, c.pcnt - c.inf - c.sup),
      'bookingReturnDate', coalesce((select v from bdep where bdep.tn = c.name), ''),
      'bookingCount', coalesce((select to_jsonb(v) from bcnt where bcnt.tn = c.name), '0'::jsonb),
      'archived', c.arch,
      'arrivalPort', _rx_s(_rx_c(c.raw, _rx_ix(tm, 'منفذ الوصول'))), 'departurePort', _rx_s(_rx_c(c.raw, _rx_ix(tm, 'منفذ المغادرة'))),
      'arrivalTime', _rx_ftime(_rx_c(c.raw, _rx_ix(tm, 'ساعة الوصول'))), 'departureTime', _rx_ftime(_rx_c(c.raw, _rx_ix(tm, 'ساعة المغادرة'))),
      'arrivalFlight', _rx_s(_rx_c(c.raw, _rx_ix(tm, 'رقم رحلة الوصول'))), 'departureFlight', _rx_s(_rx_c(c.raw, _rx_ix(tm, 'رقم رحلة المغادرة'))),
      'readiness', jsonb_build_object(
        'manifest', c.pcnt > 0, 'housing', c.hous,
        'booking', exists (select 1 from bflag f where f.tn = c.name) or _rx_trim(c.linked) <> '',
        'ticket', exists (select 1 from btick k where k.tn = c.name) or _rx_trim(_rx_s(_rx_c(c.raw, _rx_ix(tm, 'رابط تذكرة الرحلة')))) <> ''
                  or exists (select 1 from unnest(regexp_split_to_array(c.linked, '[,،\s]+')) x where x <> '' and exists (select 1 from btid i where i.v = _rx_trim(x))))
    ) order by c.rn desc), '[]'::jsonb) into res from cur4 c;
  return res;
end $$;

-- ===== 3) معتمرو الرحلة =====
create or replace function _rx_pil_obj(raw jsonb, rn int, pm jsonb) returns jsonb language sql stable as
$$ select jsonb_build_object(
    'row', rn,
    'serial', case when jsonb_typeof(_rx_c(raw, _rx_ix(pm, 'مسلسل'))) = 'object' then to_jsonb(to_char(to_timestamp(floor((_rx_c(raw, _rx_ix(pm, 'مسلسل')) ->> '$d')::float8 / 1000.0)) at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS".000Z"')) else _rx_c(raw, _rx_ix(pm, 'مسلسل')) end,
    'name', _rx_s(_rx_c(raw, _rx_ix(pm, 'اسم المعتمر'))), 'passport', _rx_s(_rx_c(raw, _rx_ix(pm, 'رقم الجواز'))), 'type', _rx_s(_rx_c(raw, _rx_ix(pm, 'النوع'))),
    'client', _rx_s(_rx_c(raw, _rx_ix(pm, 'العميل'))), 'accommodation', _rx_s(_rx_c(raw, _rx_ix(pm, 'طبيعة التسكين'))), 'roomNo', _rx_s(_rx_c(raw, _rx_ix(pm, 'رقم الغرفة'))),
    'notes', _rx_s(_rx_c(raw, _rx_ix(pm, 'ملاحظات'))), 'bookingId', _rx_s(_rx_c(raw, _rx_ix(pm, 'رقم الإشعار'))), 'latinName', _rx_s(_rx_c(raw, _rx_ix(pm, 'الاسم بالإنجليزية'))),
    'birthDate', _rx_fdate(_rx_c(raw, _rx_ix(pm, 'تاريخ الميلاد'))), 'issueDate', _rx_fdate(_rx_c(raw, _rx_ix(pm, 'تاريخ إصدار الجواز'))),
    'expiryDate', _rx_fdate(_rx_c(raw, _rx_ix(pm, 'تاريخ انتهاء الجواز'))), 'pid', _rx_s(_rx_c(raw, _rx_ix(pm, 'معرف المعتمر'))),
    'mahramPid', _rx_s(_rx_c(raw, _rx_ix(pm, 'معرف المحرم'))), 'mahramRel', _rx_s(_rx_c(raw, _rx_ix(pm, 'علاقة المحرم'))),
    'hotelMadinah', _rx_s(_rx_c(raw, _rx_ix(pm, 'فندق المدينة'))), 'hotelMakkah', _rx_s(_rx_c(raw, _rx_ix(pm, 'فندق مكة'))),
    'roomGroup', _rx_s(_rx_c(raw, _rx_ix(pm, 'مجموعة الغرفة'))), 'housingExcluded', _rx_s(_rx_c(raw, _rx_ix(pm, 'مستبعد من التسكين'))) = '1',
    'roomNoMadinah', _rx_s(_rx_c(raw, _rx_ix(pm, 'رقم غرفة المدينة'))), 'roomNoMakkah', _rx_s(_rx_c(raw, _rx_ix(pm, 'رقم غرفة مكة'))),
    'housingExcludedMadinah', _rx_s(_rx_c(raw, _rx_ix(pm, 'مستبعد من تسكين المدينة'))) = '1',
    'housingExcludedMakkah', _rx_s(_rx_c(raw, _rx_ix(pm, 'مستبعد من تسكين مكة'))) = '1') $$;

create or replace function rx_trip_pilgrims_raw(p_trip text) returns jsonb language plpgsql stable set search_path = public as
$$ declare pm jsonb := _rx_map('pilgrims', _rx_h_pil()); t text := _rx_trim(coalesce(p_trip, '')); c_tn int := _rx_ix(pm, 'اسم الرحلة'); begin
  if t = '' then return '[]'::jsonb; end if;
  return coalesce((select jsonb_agg(_rx_pil_obj(r.raw, r.rn, pm) order by r.rn) from _rx_rows('pilgrims') r where _rx_trim(_rx_s(r.raw -> c_tn)) = t), '[]'::jsonb);
end $$;

-- ===== 4) السجل العام للمعتمرين =====
create or replace function rx_registry_raw(p_today date) returns jsonb language plpgsql stable set search_path = public as
$$ declare pm jsonb := _rx_map('pilgrims', _rx_h_pil()); tm jsonb := _rx_map('trips', _rx_h_trips()); res jsonb; begin
  with pr as (
    select rn, _rx_trim(_rx_s(_rx_c(raw, _rx_ix(pm, 'اسم المعتمر')))) name, _rx_trim(_rx_s(_rx_c(raw, _rx_ix(pm, 'رقم الجواز')))) passport,
           _rx_s(_rx_c(raw, _rx_ix(pm, 'النوع'))) ty, _rx_s(_rx_c(raw, _rx_ix(pm, 'العميل'))) cl, _rx_s(_rx_c(raw, _rx_ix(pm, 'ملاحظات'))) nt,
           _rx_s(_rx_c(raw, _rx_ix(pm, 'الاسم بالإنجليزية'))) ln, _rx_c(raw, _rx_ix(pm, 'تاريخ الميلاد')) bd, _rx_c(raw, _rx_ix(pm, 'تاريخ إصدار الجواز')) idt,
           _rx_c(raw, _rx_ix(pm, 'تاريخ انتهاء الجواز')) ed, _rx_s(_rx_c(raw, _rx_ix(pm, 'معرف المعتمر'))) pid,
           _rx_trim(_rx_s(_rx_c(raw, _rx_ix(pm, 'اسم الرحلة')))) trip, _rx_trim(_rx_s(_rx_c(raw, _rx_ix(pm, 'رقم الإشعار')))) bid
      from _rx_rows('pilgrims')),
  pk as (select *, case when passport <> '' then 'P:' || passport else 'N:' || name end k from pr where name <> ''),
  td as (select distinct on (n) n, _rx_fdate(_rx_c(raw, _rx_ix(tm, 'تاريخ الذهاب'))) dep, _rx_fdate(_rx_c(raw, _rx_ix(tm, 'تاريخ العودة'))) ret,
                _rx_trim(_rx_s(_rx_c(raw, _rx_ix(tm, 'رقم الإشعار المرتبط')))) bkid, _rx_trim(_rx_s(_rx_c(raw, _rx_ix(tm, 'الرقم المرجعي')))) ref
           from (select raw, rn, _rx_trim(_rx_s(_rx_c(raw, _rx_ix(tm, 'اسم الرحلة')))) n from _rx_rows('trips')) x where n <> '' order by n, rn desc),
  trips_first as (select distinct on (k, trip) k, trip, bid, rn from pk where trip <> '' order by k, trip, rn),
  tj as (select f.k, f.rn, jsonb_build_object('name', f.trip, 'depart', coalesce(d.dep, ''), 'ret', coalesce(d.ret, ''),
              'active', coalesce(_rx_dmy(d.dep) <= p_today and p_today <= _rx_dmy(d.ret), false),
              'bookingId', case when f.bid <> '' then f.bid else coalesce(d.bkid, '') end, 'tripRef', coalesce(d.ref, '')) o
           from trips_first f left join td d on d.n = f.trip),
  grp as (select k, min(rn) first_rn,
            (array_agg(name order by rn))[count(*)] name, (array_agg(passport order by rn))[1] passport,
            (array_agg(ty order by rn) filter (where _rx_trim(ty) <> ''))[count(*) filter (where _rx_trim(ty) <> '')] ty,
            (array_agg(cl order by rn) filter (where _rx_trim(cl) <> ''))[count(*) filter (where _rx_trim(cl) <> '')] cl,
            (array_agg(nt order by rn) filter (where _rx_trim(nt) <> ''))[count(*) filter (where _rx_trim(nt) <> '')] nt,
            (array_agg(ln order by rn) filter (where _rx_trim(ln) <> ''))[count(*) filter (where _rx_trim(ln) <> '')] ln,
            (array_agg(_rx_fdate(bd) order by rn) filter (where _rx_dnz(bd)))[count(*) filter (where _rx_dnz(bd))] bd,
            (array_agg(_rx_fdate(idt) order by rn) filter (where _rx_dnz(idt)))[count(*) filter (where _rx_dnz(idt))] idt,
            (array_agg(_rx_fdate(ed) order by rn) filter (where _rx_dnz(ed)))[count(*) filter (where _rx_dnz(ed))] ed,
            (array_agg(pid order by rn) filter (where _rx_trim(pid) <> ''))[count(*) filter (where _rx_trim(pid) <> '')] pid
          from pk group by k),
  lst as (select jsonb_build_object('name', g.name, 'passport', g.passport, 'type', coalesce(g.ty, ''), 'client', coalesce(g.cl, ''), 'notes', coalesce(g.nt, ''),
              'latinName', coalesce(g.ln, ''), 'birthDate', coalesce(g.bd, ''), 'issueDate', coalesce(g.idt, ''), 'expiryDate', coalesce(g.ed, ''), 'pid', coalesce(g.pid, ''),
              'trips', coalesce((select jsonb_agg(t.o order by t.rn) from tj t where t.k = g.k), '[]'::jsonb)) o, g.first_rn from grp g)
  select jsonb_build_object('pilgrims', coalesce(jsonb_agg(o order by first_rn), '[]'::jsonb), 'total', count(*)) into res from lst;
  return res;
end $$;

-- ===== 5) التحركات =====
create or replace function _rx_cmt(c jsonb) returns text language plpgsql immutable as   -- cleanMovementTime_
$$ declare s text; m text[]; begin
  if not _rx_truthy(c) then return '00:00'; end if;
  if jsonb_typeof(c) = 'string' then
    s := c #>> '{}'; m := regexp_match(s, '(\d{1,2}):(\d{2})');
    if m is not null then return right('0' || m[1], 2) || ':' || m[2]; end if;
    return s;
  end if;
  if jsonb_typeof(c) = 'object' and c ? '$d' then return to_char(to_timestamp(floor((c ->> '$d')::float8 / 1000.0)) at time zone 'Africa/Cairo', 'HH24:MI'); end if;
  return '00:00'; end $$;
create or replace function _rx_ts(c jsonb) returns text language sql immutable as   -- c ? c.toString() : ""
$$ select case when not _rx_truthy(c) then '' else _rx_s_raw(c) end $$;

create or replace function rx_movements_raw() returns jsonb language plpgsql stable set search_path = public as
$$ declare bh jsonb := _rx_hdr('bookings'); bm jsonb := _rx_map('bookings', _rx_h_bk()); res jsonb;
  b_id int := _rx_ix(bm, 'رقم الإشعار'); b_tc int := _rx_ix(bm, 'شركة النقل الداخلي'); b_bc int := _rx_ix(bm, 'عدد الباصات'); begin
  with bk as (select distinct on (v) v, tc, bc from (
                select rn, _rx_s_raw(raw -> b_id) v, _rx_trim(_rx_ts(_rx_c(raw, b_tc))) tc, _rx_trim(_rx_ts(_rx_c(raw, b_bc))) bc
                  from _rx_rows('bookings') where _rx_truthy(raw -> b_id)) x order by v, rn),
  mv as (select rn, raw from _rx_rows('movements') where _rx_truthy(raw -> 1))
  select coalesce(jsonb_agg(jsonb_build_object(
      'status', _rx_ts(_rx_c(raw, 0)), 'bookingId', _rx_s_raw(raw -> 1),
      'movementDate', case when not _rx_truthy(_rx_c(raw, 2)) then '' when jsonb_typeof(raw -> 2) = 'object' then _rx_fdate(raw -> 2) else _rx_trim(_rx_s_raw(raw -> 2)) end,
      'movementTime', _rx_cmt(_rx_c(raw, 3)), 'movementType', _rx_trim(_rx_ts(_rx_c(raw, 4))),
      'agent', _rx_ts(_rx_c(raw, 5)), 'company', _rx_ts(_rx_c(raw, 6)), 'client', _rx_ts(_rx_c(raw, 7)),
      'count', case when _rx_truthy(_rx_c(raw, 8)) then _rx_s_raw(raw -> 8) else '0' end,
      'supervisor', _rx_ts(_rx_c(raw, 9)), 'buses', _rx_ts(_rx_c(raw, 10)),
      'hasTransport', coalesce((select not (b.tc = '' or b.tc like '%بمعرفة العميل%' or b.bc like '%بمعرفة العميل%') from bk b where b.v = _rx_s_raw(raw -> 1)), true)
    ) order by rn), '[]'::jsonb) into res from mv;
  return res;
end $$;

-- ===== 6) القوائم المنسدلة · دليل العملاء · أسماء العملاء · مسودة الرحلة · فنادق الرحلة · تسعير الرحلة · تفضيلات الواجهة =====
create or replace function rx_dropdowns_raw() returns jsonb language sql stable set search_path = public as
$$ with r as (select rn, raw from _rx_rows('companies')),
        a as (select _rx_trim(_rx_s_raw(raw -> 0)) v, rn from r where _rx_truthy(raw -> 0)),
        c as (select _rx_trim(_rx_s_raw(raw -> 1)) v, rn from r where _rx_truthy(raw -> 1))
   select jsonb_build_object('agents', coalesce((select jsonb_agg(v order by m) from (select v, min(rn) m from a group by v) x), '[]'::jsonb),
                             'companies', coalesce((select jsonb_agg(v order by m) from (select v, min(rn) m from c group by v) x), '[]'::jsonb)) $$;

create or replace function rx_clients_dir_raw() returns jsonb language sql stable set search_path = public as
$$ select coalesce(jsonb_agg(jsonb_build_object('name', n, 'mobile', mo, 'notes', nt, 'row', rn) order by n collate "C", rn), '[]'::jsonb)
     from (select rn, _rx_trim(_rx_s(_rx_c(raw, 0))) n, _rx_trim(_rx_s(_rx_c(raw, 1))) mo, _rx_trim(_rx_s(_rx_c(raw, 2))) nt from _rx_rows('clients')) x where n <> '' $$;

create or replace function rx_known_clients_raw() returns jsonb language sql stable set search_path = public as
$$ select coalesce(jsonb_agg(n order by n collate "C"), '[]'::jsonb)
     from (select distinct _rx_trim(_rx_s(_rx_c(raw, 4))) n from _rx_rows('pilgrims')) x where n <> '' and n <> 'المشرف' $$;

create or replace function rx_trip_draft_raw(p_trip text) returns jsonb language plpgsql stable set search_path = public as
$$ declare tm jsonb := _rx_map('trips', _rx_h_trips()); t text := _rx_trim(coalesce(p_trip, '')); r record; draft jsonb; raw_txt text; mx jsonb; kx jsonb; sups jsonb;
  g text := null; begin
  for r in select rn, raw from _rx_rows('trips') where _rx_trim(_rx_s(_rx_c(raw, _rx_ix(tm, 'اسم الرحلة')))) = t order by rn limit 1 loop
    raw_txt := _rx_trim(_rx_s(_rx_c(r.raw, _rx_ix(tm, 'مسودة الإشعار (JSON)'))));
    draft := null;
    if raw_txt <> '' then draft := _rx_json(raw_txt); if draft is not null and not _rx_truthy(draft) then draft := null; end if; end if;
    mx := coalesce(_rx_json(coalesce(nullif(_rx_s(_rx_c(r.raw, _rx_ix(tm, 'فنادق إضافية - المدينة (JSON)'))), ''), '[]')), '[]'::jsonb);
    kx := coalesce(_rx_json(coalesce(nullif(_rx_s(_rx_c(r.raw, _rx_ix(tm, 'فنادق إضافية - مكة (JSON)'))), ''), '[]')), '[]'::jsonb);
    if _rx_json(coalesce(nullif(_rx_s(_rx_c(r.raw, _rx_ix(tm, 'فنادق إضافية - المدينة (JSON)'))), ''), '[]')) is null then mx := '[]'::jsonb; end if;
    if _rx_json(coalesce(nullif(_rx_s(_rx_c(r.raw, _rx_ix(tm, 'فنادق إضافية - مكة (JSON)'))), ''), '[]')) is null then kx := '[]'::jsonb; end if;
    sups := _rx_sups(r.raw, _rx_ix(tm, 'المشرفون (JSON)'), _rx_ix(tm, 'المشرف'), _rx_ix(tm, 'دور المشرف'));
    if draft is not null then
      if jsonb_typeof(draft) = 'object' then draft := draft || jsonb_build_object('madinahHotelsExtra', mx, 'makkahHotelsExtra', kx, 'supervisors', sups); end if;
    else
      draft := jsonb_build_object('tripName', t, 'company', _rx_s(_rx_c(r.raw, _rx_ix(tm, 'الشركة المصرية'))), 'agent', _rx_s(_rx_c(r.raw, _rx_ix(tm, 'الوكيل السعودي'))),
        'supervisor', _rx_s(_rx_c(r.raw, _rx_ix(tm, 'المشرف'))),
        'arrivalDate', _rx_fdate(_rx_c(r.raw, _rx_ix(tm, 'تاريخ الذهاب'))), 'departureDate', _rx_fdate(_rx_c(r.raw, _rx_ix(tm, 'تاريخ العودة'))),
        'madinahHotel', _rx_s(_rx_c(r.raw, _rx_ix(tm, 'سكن المدينة'))), 'madinahCheckIn', _rx_fdate(_rx_c(r.raw, _rx_ix(tm, 'تاريخ دخول المدينة'))),
        'madinahCheckOut', _rx_fdate(_rx_c(r.raw, _rx_ix(tm, 'تاريخ الخروج من المدينة'))), 'madinahNights', _rx_s(_rx_c(r.raw, _rx_ix(tm, 'ليالي المدينة'))),
        'makkahHotel', _rx_s(_rx_c(r.raw, _rx_ix(tm, 'سكن مكة'))), 'makkahCheckIn', _rx_fdate(_rx_c(r.raw, _rx_ix(tm, 'تاريخ دخول مكة'))),
        'makkahCheckOut', _rx_fdate(_rx_c(r.raw, _rx_ix(tm, 'تاريخ الخروج من مكة'))), 'makkahNights', _rx_s(_rx_c(r.raw, _rx_ix(tm, 'ليالي مكة'))),
        'count', _rx_s(_rx_c(r.raw, _rx_ix(tm, 'عدد الأماكن المحجوزة'))), 'direction', _rx_s(_rx_c(r.raw, _rx_ix(tm, 'اتجاه الإقامة'))),
        'ticketUrl', _rx_s(_rx_c(r.raw, _rx_ix(tm, 'رابط تذكرة الرحلة'))), 'ticketFileId', _rx_s(_rx_c(r.raw, _rx_ix(tm, 'معرف تذكرة الرحلة'))),
        'madinahHotelsExtra', mx, 'makkahHotelsExtra', kx);
    end if;
    return jsonb_build_object('draft', draft, 'supervisorRole', coalesce(nullif(_rx_s(_rx_c(r.raw, _rx_ix(tm, 'دور المشرف'))), ''), 'مرافق'), 'supervisors', sups,
                              'linkedBooking', _rx_s(_rx_c(r.raw, _rx_ix(tm, 'رقم الإشعار المرتبط'))));
  end loop;
  return null;
end $$;

create or replace function rx_trip_hotels_raw(p_trip text) returns jsonb language plpgsql stable set search_path = public as
$$ declare res jsonb := rx_trip_draft_raw(p_trip); d jsonb; mm jsonb; kk jsonb; begin
  if res is null then return jsonb_build_object('madinah', '[]'::jsonb, 'makkah', '[]'::jsonb); end if;
  d := coalesce(res -> 'draft', '{}'::jsonb);
  if jsonb_typeof(d) <> 'object' then d := '{}'::jsonb; end if;
  return jsonb_build_object('madinah', _rx_hotels(d -> 'madinahHotel', d -> 'madinahHotelsExtra'), 'makkah', _rx_hotels(d -> 'makkahHotel', d -> 'makkahHotelsExtra'));
end $$;
create or replace function _rx_hotels(h jsonb, extra jsonb) returns jsonb language sql immutable as
$$ with parts as (select _rx_trim(p) v, 1 g, o from regexp_split_to_table(_rx_s(h), ' / ') with ordinality a(p, o)),
        ex as (select case when jsonb_typeof(e) = 'string' then e #>> '{}' else e::text end v, 2 g, o from jsonb_array_elements(case when jsonb_typeof(extra) = 'array' then extra else '[]'::jsonb end) with ordinality a(e, o) where _rx_truthy(e)),
        allh as (select v, g, o from parts where v <> '' union all select v, g, o from ex),
        d as (select v, min(g * 100000 + o) m from allh group by v)
   select coalesce(jsonb_agg(v order by m), '[]'::jsonb) from d $$;

create or replace function rx_trip_pricing_raw(p_trip text) returns jsonb language plpgsql stable set search_path = public as
$$ declare t text := _rx_trim(coalesce(p_trip, '')); r jsonb; begin
  if t = '' then raise exception 'اسم الرحلة مطلوب' using errcode = 'P0001'; end if;
  select coalesce(_rx_json(_rx_s(_rx_c(raw, 1))), 'null'::jsonb) into r from _rx_rows('acc_trip_prices') where _rx_trim(_rx_s(_rx_c(raw, 0))) = t order by rn limit 1;
  return jsonb_build_object('success', true, 'pricing', coalesce(r, 'null'::jsonb));
end $$;

create or replace function rx_ui_prefs_raw(p_user text) returns jsonb language sql stable set search_path = public as
$$ select jsonb_build_object('success', true, 'prefs', coalesce((select jsonb_object_agg(k, v) from (
      select distinct on (k) k, v from (select rn, _rx_trim(_rx_s(_rx_c(raw, 1))) k, _rx_json(_rx_s(_rx_c(raw, 2))) v
          from _rx_rows('user_ui_prefs') where _rx_trim(_rx_s(_rx_c(raw, 0))) = p_user) y where k <> '' and v is not null order by k, rn desc) z), '{}'::jsonb)) $$;

-- ===== 7) نقطة الدخول للمتصفح =====
-- الصلاحية كما بالخادم: requireAuth_ فقط (أي رمز صالح) إلا getTripPricing ⇒ pricing.view.
create or replace function rx_call(p_fn text, p_args jsonb default '[]'::jsonb) returns jsonb language plpgsql stable security definer set search_path = public as
$$ declare d jsonb; a jsonb := case when jsonb_typeof(p_args) = 'array' then p_args else '[]'::jsonb end; today date := (now() at time zone 'Africa/Cairo')::date; dv jsonb; u text := app_user(); begin
  if u is null then raise exception 'غير مصرّح' using errcode = '42501'; end if;
  select coalesce(jsonb_object_agg(group_name, token), '{}'::jsonb) into dv from data_versions;   -- قبل القراءة (لقطة متسقة)
  case p_fn
    when 'getTripsList' then d := rx_trips_list_raw(today);
    when 'getTripPilgrims' then d := rx_trip_pilgrims_raw(_rx_s(a -> 1));
    when 'getGlobalPilgrimsRegistry' then d := rx_registry_raw(today);
    when 'getAllMovementsAuth' then d := rx_movements_raw();
    when 'loadDropdownsData' then d := rx_dropdowns_raw();
    when 'getClientsDirectory' then d := rx_clients_dir_raw();
    when 'getKnownClientNames' then d := rx_known_clients_raw();
    when 'getTripDraft' then d := rx_trip_draft_raw(_rx_s(a -> 1));
    when 'getTripHotelsList' then d := rx_trip_hotels_raw(_rx_s(a -> 1));
    when 'getTripPricing' then
      if not app_has('pricing.view') then raise exception 'لا تملك صلاحية عرض تسعير الرحلات' using errcode = '42501'; end if;
      d := rx_trip_pricing_raw(_rx_s(a -> 1));
    when 'getMyUiPrefs' then d := rx_ui_prefs_raw(u);
    else raise exception 'دالة غير مدعومة: %', p_fn using errcode = '0A000';
  end case;
  return jsonb_build_object('success', true, 'd', d, 'dv', dv);
end $$;

-- ===== 8) الصلاحيات =====
do $$ declare r record; begin
  for r in select p.oid::regprocedure::text sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and (p.proname like '\_rx\_%' or p.proname like 'rx\_%\_raw') loop
    execute format('revoke all on function %s from public, anon, authenticated', r.sig);
    execute format('grant execute on function %s to service_role', r.sig);
  end loop;
end $$;
revoke all on function rx_call(text, jsonb) from public, anon;
grant execute on function rx_call(text, jsonb) to authenticated, service_role;

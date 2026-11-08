-- 009_boot_config.sql — (V4.378) التهيئة والدخول من Supabase: إعدادات النظام + نداء الإقلاع + قراءات صغيرة + سجل التعديلات + حالة القيود + حفظ تفضيلات الواجهة
-- • app_config(key,value)  : مرآة لإعدادات Script properties (تعدّلها Apps Script عبر SupaSync.gs عند تغيّر الإعداد + المشغّل كل دقيقة):
--       app_version · notif_settings (= ناتج getNotifSettings حرفياً) · session_cfg (= getSessionDurationConfig) · sort_mode (= getBookingsSortDefault)
--       · gl_kick {pending, csPend, autoAt, at} (عدّادات الحسابات للنبضة) · audit_meta {lastRow} (آخر صف سجل مرفوع)
-- • audit_log              : نسخة append-only من شيت AuditLog (آخر 6000 صف) + تغييرات برنامج الحجوزات (src='hb')، يرفعها المشغّل بنفس دوال Apps Script (الشاشة/التسمية محسوبة هناك)
-- • rx_boot(fn,args)       : getNotifSettings · getSessionDurationConfig · getBookingsSortDefault · getTripNamesList · listTripPricings · getHousingNote · checkTripConflictsPreview · getAuditLog
--                            الرد {success, d, dv} كـ rx_call (007) — ملف مستقل كي لا يتعارض مع توسعات rx_call
-- • app_boot()             : ≡ getAppBootstrap (parts: sortMode/sessionCfg/notif/uiPrefs/dropdowns/online/version/movements/trips) — الأجزاء غير المتاحة تُحذف فتُطلب بنداءاتها الأصلية
-- • app_gl_kick(since)     : جزء «حالة القيود» من appPulse (pending/csPend/now) — من لقطة المشغّل (autoAt>since ⇒ الواجهة تسأل Apps Script عن «recent»)
-- • app_save_ui_pref(...)  : ≡ saveUiPref بمعاملة ذرّية على store_rows (نفس قفل store_put) + مرآة user_ui_prefs المنمّطة بأفضل جهد
-- الأخطاء: 42501 غير مصرّح/صلاحية · 55000 الإعداد لم يُرفع بعد (الواجهة تعود لـ Apps Script) · 0A000 دالة غير مدعومة · P0001 رسالة عمل.
-- يتطلب 001 + 006 + 007 + 008. آمن لإعادة التشغيل. لا يلمس 007/008.

-- ===== 1) الجداول =====
create table if not exists app_config (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now()
);
alter table app_config enable row level security;      -- بلا سياسات: الدوال security definer فقط
revoke all on app_config from anon, authenticated;
grant all on app_config to service_role;

create table if not exists audit_log (
  src          text   not null,            -- 'main' (AuditLog: rn = رقم صف الشيت) | 'hb' (سجل الحجوزات: rn تسلسلي)
  rn           bigint not null,
  ts_str       text   not null default '-',
  ts_ms        float8,                      -- ms إن كانت الخلية Date (فلاتر التاريخ تُطبَّق على هذا فقط كما بالخادم)
  t_ms         float8 not null default 0,   -- مفتاح الترتيب عند دمج سجل الحجوزات
  username     text   not null default '-',
  action       text   not null default '-',
  record_id    text   not null default '-',
  field        text   not null default '-',
  old_value    text   not null default '-',
  new_value    text   not null default '-',
  screen       text   not null default 'other',
  screen_label text   not null default 'أخرى',
  primary key (src, rn)
);
alter table audit_log enable row level security;
revoke all on audit_log from anon, authenticated;
grant all on audit_log to service_role;

-- ===== 2) أدوات =====
create or replace function _rx_cfg(p_key text) returns jsonb language plpgsql stable set search_path = public as
$$ declare v jsonb; begin
  select value into v from app_config where key = p_key;
  if v is null then raise exception 'الإعداد % لم يُرفع بعد إلى Supabase', p_key using errcode = '55000'; end if;
  return v; end $$;

-- parseFloat(v) || 0 (_accNum_): رقم ⇒ نفسه · نص ⇒ البادئة الرقمية · غيره 0
create or replace function _rx_pf(c jsonb) returns float8 language plpgsql immutable as
$$ declare m text[]; begin
  if jsonb_typeof(c) = 'number' then return (c #>> '{}')::float8; end if;
  if jsonb_typeof(c) = 'string' then
    m := regexp_match(regexp_replace(c #>> '{}', '^[\s ﻿]+', ''), '^([+-]?([0-9]+\.?[0-9]*|\.[0-9]+)([eE][+-]?[0-9]+)?)');
    if m is not null then return m[1]::float8; end if;
  end if;
  return 0; end $$;

-- _normalizeArabicName_ ثم _namesLikelySame_
create or replace function _rx_nname(s text) returns text language sql immutable as
$$ select _rx_trim(regexp_replace(replace(replace(replace(replace(replace(regexp_replace(coalesce(s, ''), '[ً-ْٰ]', '', 'g'), 'أ', 'ا'), 'إ', 'ا'), 'آ', 'ا'), 'ى', 'ي'), 'ة', 'ه'),
        E'[ \t\n\r\f\x0b   -     　﻿]+', ' ', 'g')) $$;
create or replace function _rx_same_norm(a text, b text) returns boolean language plpgsql immutable as   -- _namesLikelySame_ على اسمين مطبَّعين مسبقاً
$$ declare ta text[]; tb text[]; s text[]; l text[]; i int; j int := 1; begin
  if a = '' or b = '' then return false; end if;
  if a = b then return true; end if;
  ta := string_to_array(a, ' '); tb := string_to_array(b, ' ');
  if array_length(ta, 1) <= array_length(tb, 1) then s := ta; l := tb; else s := tb; l := ta; end if;
  if array_length(s, 1) < 2 then return false; end if;
  for i in 1 .. array_length(l, 1) loop
    exit when j > array_length(s, 1);
    if l[i] = s[j] then j := j + 1; end if;
  end loop;
  return j > array_length(s, 1); end $$;
create or replace function _rx_same_name(a0 text, b0 text) returns boolean language sql immutable as
$$ select _rx_same_norm(_rx_nname(a0), _rx_nname(b0)) $$;

-- تاريخ خلية الرحلة (Date أو نص dd/MM/yyyy) كما _checkTripConflicts_: Date ⇒ يوم القاهرة · وإلا _dmyToDate_(_tripFormatDate_)
create or replace function _rx_cdate(c jsonb) returns date language sql immutable as
$$ select case when jsonb_typeof(c) = 'object' and c ? '$d' then (to_timestamp(floor((c ->> '$d')::float8 / 1000.0)) at time zone 'Africa/Cairo')::date
               else _rx_dmy(_rx_s(c)) end $$;

-- yyyy-mm-dd صالح ⇒ تاريخ، وإلا null (new Date(نص غير صالح) ⇒ مقارنات خاطئة ⇒ لا فلترة)
create or replace function _rx_dparse(s text) returns date language plpgsql immutable as
$$ begin
  if s !~ '^\d{4}-\d{2}-\d{2}$' then return null; end if;
  return s::date; exception when others then return null; end $$;

-- ===== 3) قراءات صغيرة =====
-- getTripNamesList: أسماء الرحلات (العمود الأول مقصوصة، غير الفارغة) مرتّبة
create or replace function rx_trip_names_raw() returns jsonb language sql stable set search_path = public as
$$ select coalesce(jsonb_agg(n order by n collate "C"), '[]'::jsonb) from (select _rx_trim(_rx_s(_rx_c(raw, 0))) n from _rx_rows('trips')) x where n <> '' $$;

-- listTripPricings (pricing.view من JWT)
create or replace function rx_trip_pricings_raw() returns jsonb language sql stable set search_path = public as
$$ with x as (
     select rn, _rx_trim(_rx_s(_rx_c(raw, 0))) t, _rx_json(_rx_s(_rx_c(raw, 1))) p from _rx_rows('acc_trip_prices')),
   y as (
     select rn, t, p, case jsonb_typeof(p -> 'hotels') when 'object' then (select count(*) from jsonb_object_keys(p -> 'hotels'))
                                                        when 'array' then jsonb_array_length(p -> 'hotels')
                                                        when 'string' then char_length(p -> 'hotels' #>> '{}') else 0 end lv
       from x where t <> '' and p is not null and jsonb_typeof(p) = 'object')
   select jsonb_build_object('success', true, 'trips', coalesce((select jsonb_agg(jsonb_build_object('trip', t, 'levels', lv, 'applied', _rx_truthy(p -> 'applied')) order by rn)
            from y where lv > 0 or _rx_pf(p -> 'child') <> 0 or _rx_pf(p -> 'infant') <> 0), '[]'::jsonb)) $$;

-- getHousingNote(tripNames, city): المفتاح city + '::' + tripNames مرتّبة مضمومة بـ |
create or replace function rx_housing_note_raw(p_trips jsonb, p_city jsonb) returns jsonb language plpgsql stable set search_path = public as
$$ declare k text; r jsonb; at_ text; begin
  k := _rx_s(p_city) || '::' || case when jsonb_typeof(p_trips) = 'array'
        then coalesce((select string_agg(coalesce(v, ''), '|' order by coalesce(v, '') collate "C") from jsonb_array_elements_text(p_trips) v), '') else '' end;
  select raw into r from _rx_rows('housing_notes') where _rx_s_raw(_rx_c(raw, 0)) = k order by rn limit 1;
  if r is null then return jsonb_build_object('success', true, 'note', ''); end if;
  at_ := case when jsonb_typeof(_rx_c(r, 4)) = 'object' and _rx_c(r, 4) ? '$d'
              then to_char(to_timestamp(floor((_rx_c(r, 4) ->> '$d')::float8 / 1000.0)) at time zone 'Africa/Cairo', 'DD/MM/YYYY HH24:MI')
              else _rx_s(_rx_c(r, 4)) end;
  return jsonb_build_object('success', true, 'note', _rx_s(_rx_c(r, 3)), 'by', _rx_s(_rx_c(r, 5)), 'at', at_); end $$;

-- checkTripConflictsPreview(tripName, pilgrims): نفس _checkTripConflicts_ (جواز · اسم جزئي · مشرف) — تُرجع مصفوفة التعارضات
-- التنفيذ مجموعاتي (set-based): تقاطعات (معتمر بالطلب × صف معتمر برحلة أخرى متقاطعة) ثم إزالة التكرار بنفس مفاتيح seenConflictKey (أول ظهور بترتيب التكرار الأصلي:
-- معتمر ثم جواز قبل اسم ثم ترتيب الصف) — 60 معتمراً × 10 آلاف صف < 0.5 ث.
create or replace function rx_trip_conflicts_raw(p_trip jsonb, p_pil jsonb) returns jsonb language plpgsql stable set search_path = public as
$$ declare
  tn text := case when jsonb_typeof(p_trip) = 'string' then p_trip #>> '{}' else null end;
  out jsonb := '[]'::jsonb; cgo date; cret date; csup text; crole text; ci int;
  t_nm text[]; t_go date[]; t_ret date[]; t_sup text[]; t_role text[]; i int;
begin
  if tn is null or jsonb_typeof(p_pil) <> 'array' then return out; end if;
  -- كل الرحلات: آخر صف لكل اسم يفوز · الترتيب بأول ظهور
  select array_agg(nm order by fr), array_agg(go order by fr), array_agg(ret order by fr), array_agg(sup order by fr), array_agg(role order by fr)
    into t_nm, t_go, t_ret, t_sup, t_role
    from (select nm, (array_agg(go order by rn desc))[1] go, (array_agg(ret order by rn desc))[1] ret, (array_agg(sup order by rn desc))[1] sup, (array_agg(role order by rn desc))[1] role, min(rn) fr
            from (select rn, _rx_trim(_rx_s(_rx_c(raw, 0))) nm, _rx_cdate(_rx_c(raw, 4)) go, _rx_cdate(_rx_c(raw, 5)) ret, _rx_trim(_rx_s(_rx_c(raw, 3))) sup,
                         case when _rx_truthy(_rx_c(raw, 22)) then _rx_s_raw(_rx_c(raw, 22)) else 'مرافق' end role from _rx_rows('trips')) t
           where nm <> '' group by nm) g;
  if t_nm is null then return out; end if;
  ci := array_position(t_nm, tn);
  if ci is null or t_go[ci] is null or t_ret[ci] is null then return out; end if;
  cgo := t_go[ci]; cret := t_ret[ci]; csup := t_sup[ci]; crole := t_role[ci];
  with pil as (
         select ord, _rx_trim(_rx_s(e -> 'passport')) pass, _rx_trim(_rx_s(e -> 'name')) pname, _rx_trim(_rx_s(e -> 'client')) pcli,
                _rx_nname(_rx_trim(_rx_s(e -> 'name'))) pn, string_to_array(_rx_nname(_rx_trim(_rx_s(e -> 'name'))), ' ') pw
           from jsonb_array_elements(p_pil) with ordinality t(e, ord)),
       oth as (
         select q.rn, q.trip, q.name, q.pass, q.cli, _rx_nname(q.name) nn, string_to_array(_rx_nname(q.name), ' ') nw
           from (select rn, _rx_trim(_rx_s(_rx_c(raw, 8))) trip, _rx_s(_rx_c(raw, 1)) name, _rx_trim(_rx_s(_rx_c(raw, 2))) pass, _rx_s(_rx_c(raw, 4)) cli from _rx_rows('pilgrims')) q
           join unnest(t_nm, t_go, t_ret) as t(nm, go, ret) on t.nm = q.trip
          where q.trip <> '' and q.trip <> tn and t.go is not null and t.ret is not null and t.go <= cret and cgo <= t.ret),
       m1 as (
         select pil.ord, 0 kind, o.rn, pil.pass || '|' || o.trip k,
                jsonb_build_object('kind', 'passport', 'passport', pil.pass, 'pilgrimName', pil.pname, 'otherTrip', o.trip,
                  'message', '🛂 ' || pil.pname || ' (جواز ' || pil.pass || ') مسجَّل أيضاً في رحلة "' || o.trip || '" المتقاطعة التواريخ') j
           from pil join oth o on o.pass = pil.pass where pil.pass <> ''),
       m2 as (
         select pil.ord, 1 kind, o.rn, 'N:' || pil.pname || '|' || o.trip k,
                jsonb_build_object('kind', 'passport', 'passport', case when pil.pass <> '' then pil.pass when o.pass <> '' then o.pass else '' end,
                  'pilgrimName', pil.pname, 'otherTrip', o.trip,
                  'message', '👥 ' || pil.pname || ' يُطابق "' || o.name || '" المسجَّل في رحلة "' || o.trip || '" المتقاطعة التواريخ (اسم كامل/جزئي لنفس الشخص)') j
           from pil join oth o on (o.nw @> pil.pw or pil.pw @> o.nw)   -- شرط لازم سريع قبل الفحص الدقيق بالترتيب
          where pil.pname <> '' and pil.pn <> '' and not (pil.pass <> '' and o.pass <> '' and pil.pass = o.pass)
            and _rx_same_norm(pil.pn, o.nn) and not (pil.pcli <> '' and o.cli <> '' and pil.pcli <> o.cli)),
       u as (select * from m1 union all select * from m2),
       d as (select distinct on (k) * from u order by k, ord, kind, rn)
  select coalesce(jsonb_agg(j order by ord, kind, rn), '[]'::jsonb) into out from d;
  if csup <> '' and crole <> 'استقبال فقط' and crole <> 'الوكيل' then
    for i in 1 .. array_length(t_nm, 1) loop
      if t_nm[i] = tn then continue; end if;
      if t_sup[i] = csup and t_role[i] <> 'استقبال فقط' and t_role[i] <> 'الوكيل' and t_go[i] is not null and t_ret[i] is not null and t_go[i] <= cret and cgo <= t_ret[i] then
        out := out || jsonb_build_array(jsonb_build_object('kind', 'supervisor', 'otherTrip', t_nm[i],
          'message', '🧑‍✈️ المشرف "' || csup || '" مُسند أيضاً لرحلة "' || t_nm[i] || '" المتقاطعة التواريخ (يمكن ضبط إحداهما "استقبال فقط")'));
      end if;
    end loop;
  end if;
  return out;
end $$;

-- getAuditLog(filters): الفلترة والدمج بنفس منطق الخادم فوق audit_log (الحقول المشتقة محسوبة مسبقاً بـ Apps Script)
create or replace function rx_audit_raw(p_f jsonb) returns jsonb language plpgsql stable set search_path = public as
$$ declare
  f jsonb := case when jsonb_typeof(p_f) = 'object' then p_f else '{}'::jsonb end;
  last_row bigint := coalesce((_rx_cfg('audit_meta') ->> 'lastRow')::bigint, 0);
  frid text := _rx_trim(_rx_s(f -> 'recordId')); fusr text := _rx_trim(_rx_s(f -> 'username')); fact text := _rx_trim(_rx_s(f -> 'action'));
  fscr text := _rx_trim(_rx_s(f -> 'screen')); fent text := _rx_trim(_rx_s(f -> 'entity')); ffrom text := _rx_trim(_rx_s(f -> 'fromDate')); fto text := _rx_trim(_rx_s(f -> 'toDate'));
  show_ll boolean := _rx_truthy(f -> 'showLoginLogout');
  max_rows int; start_row bigint; df float8 := null; dt float8 := null; res jsonb; hb_ok boolean := false;
begin
  max_rows := case when frid <> '' or fusr <> '' or fact <> '' or fscr <> '' or fent <> '' or ffrom <> '' or fto <> '' then 6000 else 500 end;
  if _rx_dparse(ffrom) is not null then df := extract(epoch from (_rx_dparse(ffrom))::timestamp at time zone 'UTC') * 1000; end if;
  if _rx_dparse(fto) is not null then dt := extract(epoch from ((_rx_dparse(fto))::timestamp + interval '23 hours 59 minutes 59 seconds') at time zone 'Africa/Cairo') * 1000; end if;
  if last_row < 2 then return '[]'::jsonb; end if;
  start_row := greatest(2, last_row - max_rows + 1);
  hb_ok := (fscr = '' or fscr = 'hotels');
  with m as (
    select t_ms t, 0 src, -rn sq, jsonb_build_object('timestamp', ts_str, 'username', username, 'action', action, 'recordId', record_id, 'field', field, 'oldValue', old_value, 'newValue', new_value, 'screen', screen, 'screenLabel', screen_label) j
      from audit_log
     where src = 'main' and rn >= start_row and rn <= last_row
       and (show_ll or action not in ('تسجيل دخول', 'تسجيل خروج'))
       and (fscr = '' or screen = fscr or (fscr = 'gl*' and screen ~ '^gl'))
       and (frid = '' or position(frid in record_id) > 0) and (fusr = '' or position(fusr in username) > 0) and (fact = '' or position(fact in action) > 0)
       and (fent = '' or position(fent in record_id || ' ' || field || ' ' || old_value || ' ' || new_value) > 0)
       and not (ts_ms is not null and ((df is not null and ts_ms < df) or (dt is not null and ts_ms > dt)))
     order by rn desc limit 500),
  h as (
    select t_ms t, 1 src, rn sq, jsonb_build_object('timestamp', ts_str, 'username', username, 'action', action, 'recordId', record_id, 'field', field, 'oldValue', old_value, 'newValue', new_value, 'screen', screen, 'screenLabel', screen_label) j
      from (select * from audit_log where src = 'hb' and hb_ok order by rn desc limit max_rows) hh
     where (frid = '' or position(frid in record_id) > 0) and (fusr = '' or position(fusr in username) > 0) and (fact = '' or position(fact in action) > 0)
       and (fent = '' or position(fent in record_id || ' ' || field || ' ' || old_value || ' ' || new_value) > 0)
       and not (ts_ms is not null and ((df is not null and ts_ms < df) or (dt is not null and ts_ms > dt)))),
  hc as (select count(*) c from h)
  select case when (select c from hc) > 0
              then (select jsonb_agg(j order by t desc, src, sq) from (select * from (select * from m union all select * from h) u order by t desc, src, sq limit 500) z)
              else (select jsonb_agg(j order by sq) from m) end into res;
  return coalesce(res, '[]'::jsonb);
end $$;

-- ===== 4) نقطة الدخول للقراءات الصغيرة =====
create or replace function rx_boot(p_fn text, p_args jsonb default '[]'::jsonb) returns jsonb language plpgsql stable security definer set search_path = public as
$$ declare d jsonb; a jsonb := case when jsonb_typeof(p_args) = 'array' then p_args else '[]'::jsonb end; dv jsonb; u text := app_user(); begin
  if u is null then raise exception 'غير مصرّح' using errcode = '42501'; end if;
  select coalesce(jsonb_object_agg(group_name, token), '{}'::jsonb) into dv from data_versions;
  case p_fn
    when 'getNotifSettings' then d := _rx_cfg('notif_settings');
    when 'getSessionDurationConfig' then d := _rx_cfg('session_cfg');
    when 'getBookingsSortDefault' then d := _rx_cfg('sort_mode');
    when 'getTripNamesList' then d := rx_trip_names_raw();
    when 'listTripPricings' then
      if not app_has('pricing.view') then raise exception 'لا تملك صلاحية عرض تسعير الرحلات' using errcode = '42501'; end if;
      d := rx_trip_pricings_raw();
    when 'getHousingNote' then d := rx_housing_note_raw(a -> 1, a -> 2);
    when 'checkTripConflictsPreview' then d := rx_trip_conflicts_raw(a -> 1, case when a -> 2 is null or a -> 2 = 'null'::jsonb then '[]'::jsonb else a -> 2 end);
    when 'getAuditLog' then
      if not app_has('audit.view') then raise exception 'هذه الشاشة متاحة فقط لمستخدم بصلاحية سجل التعديلات أو admin' using errcode = '42501'; end if;
      d := rx_audit_raw(a -> 1);
    else raise exception 'دالة غير مدعومة: %', p_fn using errcode = '0A000';
  end case;
  return jsonb_build_object('success', true, 'd', d, 'dv', dv);
end $$;

-- ===== 5) نداء الإقلاع الموحّد (getAppBootstrap) =====
create or replace function app_boot() returns jsonb language plpgsql volatile security definer set search_path = public as
$$ declare parts jsonb := '{}'::jsonb; u text := app_user(); v jsonb; today date := (now() at time zone 'Africa/Cairo')::date; t0 timestamptz := clock_timestamp(); dv0 jsonb; begin
  if u is null then raise exception 'غير مصرّح' using errcode = '42501'; end if;
  dv0 := _rx_dv();   -- البصمات قبل القراءة (كما rx_call): تغيير يصل أثناء القراءة يُلتقط بالنبضة التالية ولا يُعدّ «محدَّثاً» خطأً
  begin parts := parts || jsonb_build_object('sortMode', _rx_cfg('sort_mode')); exception when others then null; end;
  begin parts := parts || jsonb_build_object('sessionCfg', _rx_cfg('session_cfg')); exception when others then null; end;
  begin parts := parts || jsonb_build_object('notif', _rx_cfg('notif_settings')); exception when others then null; end;
  begin parts := parts || jsonb_build_object('uiPrefs', rx_ui_prefs_raw(u)); exception when others then null; end;
  begin parts := parts || jsonb_build_object('dropdowns', rx_dropdowns_raw()); exception when others then null; end;
  begin
    perform _rx_touch(u, coalesce(auth.jwt() ->> 'name', u));
    parts := parts || jsonb_build_object('online', jsonb_build_object('success', true, 'count', _rx_online_count()));
  exception when others then null; end;
  begin v := _rx_cfg('app_version');
    parts := parts || jsonb_build_object('version', jsonb_build_object('version', v ->> 'version', 'serverTime', to_char(clock_timestamp() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'), 'pg', true));
  exception when others then null; end;
  begin parts := parts || jsonb_build_object('movements', rx_movements_raw()); exception when others then null; end;
  begin parts := parts || jsonb_build_object('trips', rx_trips_list_raw(today)); exception when others then null; end;
  return jsonb_build_object('success', true, 'parts', parts, 'serverMs', (extract(epoch from clock_timestamp() - t0) * 1000)::int, 'dv', dv0);
end $$;

-- ===== 6) حالة القيود للنبضة =====
create or replace function app_gl_kick(p_since text default '') returns jsonb language plpgsql stable security definer set search_path = public as
$$ declare v jsonb; o jsonb; begin
  if app_user() is null then raise exception 'غير مصرّح' using errcode = '42501'; end if;
  v := _rx_cfg('gl_kick');
  o := jsonb_build_object('now', coalesce(v ->> 'at', ''));
  if app_has('gl.view') then o := o || jsonb_build_object('pending', coalesce((v ->> 'pending')::int, 0), 'csPend', coalesce((v ->> 'csPend')::int, 0)); end if;
  return jsonb_build_object('success', true, 'gl', o, 'autoAt', coalesce(v ->> 'autoAt', ''));
end $$;

-- ===== 7) saveUiPref =====
create or replace function app_save_ui_pref(p_screen text, p_prefs jsonb) returns jsonb language plpgsql volatile security definer set search_path = public as
$$ declare u text := app_user(); sc text := _rx_trim(coalesce(p_screen, '')); pj jsonb := p_prefs; js text; stamp text; rid_ text; ord_ bigint; prefs jsonb; begin
  if u is null then raise exception 'غير مصرّح' using errcode = '42501'; end if;
  if sc = '' then return jsonb_build_object('success', false, 'error', 'معرِّف الشاشة مفقود'); end if;
  if pj is null or pj in ('null'::jsonb, 'false'::jsonb, '0'::jsonb, '""'::jsonb) then pj := '{}'::jsonb; end if;   -- JSON.stringify(prefsObj || {})
  js := pj::text;
  perform 1 from store_meta where tbl = 'user_ui_prefs';
  if not found then raise exception 'user_ui_prefs غير مخزَّن بعد' using errcode = '55000'; end if;
  perform pg_advisory_xact_lock(hashtextextended('store:put:user_ui_prefs', 0));   -- نفس قفل store_put
  stamp := to_char(now() at time zone 'Africa/Cairo', 'DD/MM/YYYY HH24:MI');
  select r.rid into rid_ from store_rows r where r.tbl = 'user_ui_prefs' and _rx_trim(_rx_s(_rx_c(r.raw, 0))) = u and _rx_trim(_rx_s(_rx_c(r.raw, 1))) = sc order by r.ord, r.rid limit 1;
  if rid_ is not null then
    update store_rows set raw = jsonb_build_array(_rx_c(raw, 0), _rx_c(raw, 1), to_jsonb(js), to_jsonb(stamp)) where tbl = 'user_ui_prefs' and rid = rid_;
  else
    select coalesce(max(ord), 0) + 1 into ord_ from store_rows where tbl = 'user_ui_prefs';
    rid_ := substr(replace(gen_random_uuid()::text, '-', ''), 1, 20);
    insert into store_rows (tbl, rid, ord, raw) values ('user_ui_prefs', rid_, ord_, jsonb_build_array(to_jsonb(u), to_jsonb(sc), to_jsonb(js), to_jsonb(stamp)));
  end if;
  update store_meta set ver = ver + 1, updated_at = now() where tbl = 'user_ui_prefs';
  if to_regclass('public.user_ui_prefs') is not null then   -- مرآة منمّطة بأفضل جهد (كما Store.gs): الفشل لا يُفشل الحفظ
    begin
      prefs := case when jsonb_typeof(pj) = 'object' then pj else '{}'::jsonb end;
      insert into user_ui_prefs (username, screen, prefs, updated_at) values (u, sc, prefs, now())
        on conflict (username, screen) do update set prefs = excluded.prefs, updated_at = excluded.updated_at;
    exception when others then
      insert into store_mirror_errors (tbl, rid, err) values ('user_ui_prefs', rid_, 'ui_pref: ' || left(sqlerrm, 300));
    end;
  end if;
  return jsonb_build_object('success', true);
end $$;

-- ===== 8) الصلاحيات =====
do $$ declare r record; begin
  for r in select p.oid::regprocedure::text sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and (p.proname like '\_rx\_%' or p.proname like 'rx\_%\_raw') loop
    execute format('revoke all on function %s from public, anon, authenticated', r.sig);
    execute format('grant execute on function %s to service_role', r.sig);
  end loop;
end $$;
revoke all on function rx_boot(text, jsonb), app_boot(), app_gl_kick(text), app_save_ui_pref(text, jsonb) from public, anon;
grant execute on function rx_boot(text, jsonb), app_boot(), app_gl_kick(text), app_save_ui_pref(text, jsonb) to authenticated, service_role;

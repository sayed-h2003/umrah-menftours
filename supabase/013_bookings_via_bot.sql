-- 013_bookings_via_bot.sql — (V4.378) getAllBookingsAuth من Postgres + وسم viaBot بلا الاعتماد على شيت AuditLog
-- • bookings_via_bot(booking_id): إشعارات أنشأها بوت تليجرام (الخادم يكتبها لحظة الإنشاء بـ bot_mark من Code.gs وتُعبَّأ بأثر رجعي من شيت AuditLog بـ storeBotsBackfill() — Store.gs).
--   بديل صريح لقراءة AuditLog (غير موجود بـ Postgres كاملاً: audit_log يحفظ آخر 6000 صف فقط ⇒ لا يصلح لوسم بأثر رجعي).
-- • rx2_getallbookingsauth: نفس getAllBookings_ (الأعمدة بالاسم _robustColMap_، التواريخ dd/MM/yyyy والأوقات HH:mm بتوقيت القاهرة، الترتيب مقلوب) + viaBot.
--   لا تعمل قبل تعبئة العلامة '__bots_seeded' بـ app_kv (storeBotsBackfill) وإلا 55000 ⇒ المتصفح يرجع لـ Apps Script.
-- يتطلب 006 + 007 + 010. آمن لإعادة التشغيل.
create table if not exists bookings_via_bot (booking_id text primary key, at timestamptz not null default now());
alter table bookings_via_bot enable row level security;
revoke all on bookings_via_bot from anon, authenticated;
grant all on bookings_via_bot to service_role;

create or replace function bot_mark(p_ids jsonb) returns jsonb language plpgsql volatile set search_path = public as
$$ declare n int := 0; x text; begin
  for x in select jsonb_array_elements_text(coalesce(p_ids, '[]'::jsonb)) loop
    insert into bookings_via_bot (booking_id) values (x) on conflict do nothing; n := n + 1;
  end loop;
  return jsonb_build_object('marked', n); end $$;

-- «Mon Dec 30 1899 01:35:00 GMT+0205» ⇒ timestamptz (new Date(s)) أو null
create or replace function _bk_jsdate(s text) returns timestamptz language plpgsql immutable as
$$ declare m text[]; begin
  m := regexp_match(s, '([A-Za-z]{3})\s+(\d{1,2})\s+(\d{4})\s+(\d{2}):(\d{2}):(\d{2})\s+GMT([+-]\d{4})');
  if m is null then return null; end if;
  return (m[3] || '-' || m[1] || '-' || m[2] || ' ' || m[4] || ':' || m[5] || ':' || m[6] || ' ' || substr(m[7], 1, 3) || ':' || substr(m[7], 4, 2))::timestamptz;
exception when others then return null; end $$;

-- formatDateString / formatTimeString (لغة sql لسرعة ≥20 ألف صف)
create or replace function _bk_date_s(s text) returns text language sql immutable as
$$ select case when s ~ '\m(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\M' then coalesce(to_char(_bk_jsdate(s) at time zone 'Africa/Cairo', 'DD/MM/YYYY'), s) else s end $$;
create or replace function _bk_date(c jsonb) returns text language sql immutable as
$$ select case when not _rx_truthy(c) then ''
     when jsonb_typeof(c) = 'object' then case when c ? '$d' then to_char(to_timestamp(floor((c ->> '$d')::float8 / 1000.0)) at time zone 'Africa/Cairo', 'DD/MM/YYYY') else '' end
     else _bk_date_s(_rx_trim(_rx_s_raw(c))) end $$;
create or replace function _bk_time_s(s text) returns text language sql immutable as
$$ select case when s ~ '^\d{1,2}:\d{2}' and s !~ '\m(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\M' then right('0' || substring(s from '^(\d{1,2}):'), 2) || ':' || substring(s from '^\d{1,2}:(\d{2})')
     else coalesce(to_char(_bk_jsdate(s) at time zone 'Africa/Cairo', 'HH24:MI'), s) end $$;
create or replace function _bk_time(c jsonb) returns text language sql immutable as
$$ select case when not _rx_truthy(c) then ''
     when jsonb_typeof(c) = 'object' then case when c ? '$d' then to_char(to_timestamp(floor((c ->> '$d')::float8 / 1000.0)) at time zone 'Africa/Cairo', 'HH24:MI') else '' end
     else _bk_time_s(_rx_trim(_rx_s_raw(c))) end $$;
create or replace function _bk_s(c jsonb, d text) returns text language sql immutable as   -- c ? c.toString() : d
$$ select case when _rx_truthy(c) then _rx_s_raw(c) else d end $$;

create or replace function rx2_getallbookingsauth(a jsonb, u text) returns jsonb language plpgsql stable set search_path = public as
$$ declare bm jsonb := _rx_map('bookings', _rx_h_bk()); ix int[]; bots text[] := array(select booking_id from bookings_via_bot); res jsonb; ok text; begin
  ix := array(select _rx_ix(bm, h) from unnest(_rx_h_bk()) with ordinality t(h, o) order by o);
  select v into ok from app_kv where k = '__bots_seeded';
  if ok is null then raise exception 'وسم إشعارات البوت لم يُعبَّأ بعد (شغّل storeBotsBackfill من محرر Apps Script)' using errcode = '55000'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
      'status', _bk_s(cl[1], ''), 'id', _bk_s(cl[2], ''), 'agent', _bk_s(cl[3], ''), 'company', _bk_s(cl[4], ''), 'groupNumbers', _bk_s(cl[5], ''), 'client', _bk_s(cl[6], ''),
      'count', _bk_s(cl[7], '0'), 'supervisor', _bk_s(cl[8], ''), 'travelMethod', _bk_s(cl[9], ''), 'arrivalPort', _bk_s(cl[10], ''), 'arrivalDate', _bk_date(cl[11]), 'arrivalTime', _bk_time(cl[12]),
      'arrivalFlight', _bk_s(cl[13], ''), 'departureDate', _bk_date(cl[14]), 'departureFlight', _bk_s(cl[15], ''), 'departureTime', _bk_time(cl[16]), 'departurePort', _bk_s(cl[17], ''),
      'transportCompany', _bk_s(cl[18], ''), 'operationNo', _bk_s(cl[19], ''), 'busCount', _bk_s(cl[20], ''), 'direction', _bk_s(cl[21], ''), 'madinahNights', _bk_s(cl[22], '0'), 'makkahNights', _bk_s(cl[23], '0'),
      'madinahHotel', _bk_s(cl[24], ''), 'madinahCheckIn', _bk_date(cl[25]), 'madinahCheckOut', _bk_date(cl[26]), 'makkahHotel', _bk_s(cl[27], ''), 'makkahCheckIn', _bk_date(cl[28]), 'makkahCheckOut', _bk_date(cl[29]))
    || jsonb_build_object(
      'internalTransferDate', _bk_date(cl[37]), 'internalTransferTime', _bk_time(cl[38]), 'extraMovements', _bk_s(cl[30], '[]'), 'notes', _bk_s(cl[31], ''), 'ticketUrl', _bk_s(cl[32], ''), 'ticketFileId', _bk_s(cl[33], ''),
      'busPrice', case when cl[34] is null or cl[34] = '""'::jsonb then '""'::jsonb else coalesce(to_jsonb(_rx_numc(cl[34])), 'null'::jsonb) end,
      'operationValue', case when cl[35] is null or cl[35] = '""'::jsonb then '""'::jsonb else coalesce(to_jsonb(_rx_numc(cl[35])), 'null'::jsonb) end,
      'tripName', _bk_s(cl[36], ''), 'groupName', _bk_s(cl[39], ''), 'attachmentsJson', _bk_s(cl[41], '[]'), 'visaGroups', _bk_s(cl[42], ''), 'mfFiles', _bk_s(cl[43], ''), 'attachNames', _bk_s(cl[44], 'لا'))
    || case when _bk_s(cl[2], '') = any (bots) then '{"viaBot":true}'::jsonb else '{}'::jsonb end
    order by rn desc), '[]'::jsonb) into res
  from (select rn, raw from _rx_rows('bookings')) r,
       lateral (select array(select coalesce(r.raw -> i, '""'::jsonb) from unnest(ix) with ordinality t(i, o) order by o) cl) z
  where _rx_truthy(cl[2]);
  return res; end $$;

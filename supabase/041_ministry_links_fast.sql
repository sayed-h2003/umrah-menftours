-- V4.415: تسريع getMinistryTripLinks (قراءة واحدة للرحلات) — يعيد تعريف الدالة فقط، نفس المخرجات.
create or replace function rx2_getministrytriplinks(a jsonb, u text) returns jsonb language plpgsql stable set search_path = public as
$$ declare tm jsonb := _rx_map('trips', _rx_h_trips()); known jsonb; links jsonb; alerts jsonb := '[]'::jsonb; tinfo jsonb; byb jsonb; pol jsonb; todayMs float8 := _mf_ms(_mf_today()); ixn int; ixb int; ixr int; begin
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
  ixn := _rx_ix(tm, 'اسم الرحلة'); ixb := _rx_ix(tm, 'رقم الإشعار المرتبط'); ixr := _rx_ix(tm, 'الرقم المرجعي');
  -- (V4.415) قراءة واحدة لجدول الرحلات بدل اثنتين + فهارس الأعمدة تُحسب مرة واحدة
  with t as materialized (select rn, _mf_str(_rx_c(raw, ixn)) nm, _mf_str(_rx_c(raw, ixb)) bk, _mf_str(_rx_c(raw, ixr)) rf from _rx_rows('trips'))
  select (select coalesce(jsonb_object_agg(nm, jsonb_build_object('bookingId', bk, 'tripRef', rf)), '{}'::jsonb) from (select * from t where nm <> '' order by rn) x),
         (select coalesce(jsonb_object_agg(bk, nm), '{}'::jsonb) from (select * from t where nm <> '' and bk <> '' order by rn) y) into tinfo, byb;
  return jsonb_build_object('success', true, 'links', links, 'alerts', alerts, 'tripInfo', tinfo, 'byBooking', byb); end $$;

revoke all on function rx2_getministrytriplinks(jsonb, text) from public, anon, authenticated;
grant execute on function rx2_getministrytriplinks(jsonb, text) to service_role;

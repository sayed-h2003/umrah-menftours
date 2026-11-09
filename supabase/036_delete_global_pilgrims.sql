-- 036: deleteGlobalPilgrims من Postgres — الحذف المجمّع من السجل العام للمعتمرين (كل صفوفهم بكل رحلاتهم).
-- بديل _backupSpreadsheet_ (نسخة الملف كله): الصفوف المحذوفة تذهب لسلة المحذوفات (035) وتُستعاد منها بصلاحية recycle.edit. يتطلب 034 و035.
create or replace function rw2_deleteglobalpilgrims(a jsonb, u text) returns jsonb language plpgsql volatile set search_path = public as
$$ declare
  who text := coalesce(u, app_user(), '-'); keys text[]; ix jsonb := _pm_ix(); i_ps int := (ix ->> 'passport')::int; i_nm int := (ix ->> 'name')::int; rids text[]; nms text[]; n int;
begin
  if not app_has('registry.delete') then raise exception 'الحذف المجمّع متاح فقط لصاحب صلاحية DELETE أو admin' using errcode = '42501'; end if;
  select coalesce(array_agg(distinct k), '{}') into keys from (select btrim(case when jsonb_typeof(x) = 'string' then x #>> '{}' else x::text end) k from jsonb_array_elements(case when jsonb_typeof(a -> 1) = 'array' then a -> 1 else '[]'::jsonb end) x) z where k <> '';
  if array_length(keys, 1) is null then return jsonb_build_object('success', false, 'error', 'لا يوجد اختيار'); end if;
  perform pg_advisory_xact_lock(hashtextextended('store:put:pilgrims', 0));
  select array_agg(r.rid), array_agg(distinct _rx_trim(_rx_s(_rx_c(r.raw, i_nm)))) into rids, nms from store_rows r
   where r.tbl = 'pilgrims' and (_rx_trim(_rx_s(_rx_c(r.raw, i_ps))) = any(keys) or (_rx_trim(_rx_s(_rx_c(r.raw, i_ps))) = '' and _rx_trim(_rx_s(_rx_c(r.raw, i_nm))) = any(keys)));
  n := coalesce(array_length(rids, 1), 0);
  if n = 0 then return jsonb_build_object('success', true, 'removed', 0); end if;
  perform _rb_on('pilgrims', n || ' صف معتمر (حذف مجمّع من السجل العام)', left(array_to_string(nms, '، '), 500), who);
  delete from store_rows where tbl = 'pilgrims' and rid = any(rids);
  update store_meta set ver = ver + 1, updated_at = now() where tbl = 'pilgrims';
  insert into app_outbox (kind, payload) values ('audit', jsonb_build_object('user', who, 'action', 'حذف مجمّع من سجل المعتمرين', 'record', array_to_string(keys, '، '), 'field', 'معتمر', 'old', '-', 'new', 'صفوف: ' || n));
  perform _w_dv_bump(array['pilgrims', 'trips', 'bookings']);
  return jsonb_build_object('success', true, 'removed', n); end $$;

revoke all on function rw2_deleteglobalpilgrims(jsonb, text) from public, anon, authenticated;
grant execute on function rw2_deleteglobalpilgrims(jsonb, text) to service_role;

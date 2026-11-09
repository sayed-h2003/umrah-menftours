-- 025: deleteBookingRecord + toggleApprovalStatus (إلغاء الاعتماد فقط) من Postgres — تكمل 024. تفعيلها بنفس supaWriteOnBookings() (مجموعة wbk).
-- الاعتماد («معتمد») يعيد فحص الحقول الإلزامية والتحركات على بيانات مخزَّنة ⇒ يبقى على Apps Script (0A000 ⇒ رجوع تلقائي).
create or replace function rw2_deletebookingrecord(a jsonb, u text) returns jsonb language plpgsql volatile set search_path = public as
$$ declare id text := btrim(coalesce(a ->> 1, '')); m jsonb; ixid int; ixc int; ixcl int; oldrid text; oldraw jsonb; who text := coalesce(u, app_user(), '-'); co text; cl text; begin
  if not app_has('bookings.delete') then return jsonb_build_object('success', false, 'error', 'لا تملك صلاحية حذف الإشعارات'); end if;
  if id = '' then raise exception 'رقم الإشعار مطلوب' using errcode = 'P0001'; end if;
  perform pg_advisory_xact_lock(hashtextextended('store:put:bookings', 0));
  m := _rx_map('bookings', _bk_canon());
  ixid := (m ->> 'رقم الإشعار')::int; ixc := (m ->> 'الشركة المصرية')::int; ixcl := (m ->> 'العميل')::int;
  if ixid is null then raise exception 'غير مدعوم: عمود رقم الإشعار' using errcode = '0A000'; end if;
  select rid, raw into oldrid, oldraw from store_rows where tbl = 'bookings' and btrim(_rx_s(raw -> ixid)) = id limit 1;
  if oldrid is null then return jsonb_build_object('success', false, 'error', 'الإشعار غير موجود'); end if;
  co := _rx_s(oldraw -> ixc); cl := _rx_s(oldraw -> ixcl);
  perform _rb_on('booking', 'إشعار ' || id, co || ' - ' || cl, who);   -- (035) سلة المحذوفات: الإشعار + تحركاته
  delete from store_rows where tbl = 'bookings' and rid = oldrid;
  update store_meta set ver = ver + 1, updated_at = now() where tbl = 'bookings';
  if exists (select 1 from store_meta where tbl = 'movements') then
    delete from store_rows where tbl = 'movements' and btrim(_rx_s(raw -> 1)) = id;
    update store_meta set ver = ver + 1, updated_at = now() where tbl = 'movements';
  end if;
  perform _w_dv_bump(array['bookings', 'movements', 'trips', 'visa', 'ministry']);
  insert into app_outbox (kind, payload) values ('audit', jsonb_build_object('user', who, 'action', 'حذف إشعار', 'record', id, 'field', '-', 'old', '-',
    'new', 'تم حذف إشعار الوصول رقم ' || id || ' (' || co || ' - ' || cl || ') نهائياً مع كل تحركاته'));
  return jsonb_build_object('success', true);
end $$;

create or replace function rw2_toggleapprovalstatus(a jsonb, u text) returns jsonb language plpgsql volatile set search_path = public as
$$ declare id text := btrim(coalesce(a ->> 1, '')); st jsonb := a -> 2; m jsonb; ixid int; ixs int; oldrid text; begin
  if st is null or jsonb_typeof(st) <> 'string' or (st #>> '{}') = 'معتمد' then raise exception 'غير مدعوم: الاعتماد يمر ببوابة التحقق' using errcode = '0A000'; end if;
  if id = '' then raise exception 'رقم الإشعار مطلوب' using errcode = 'P0001'; end if;
  perform pg_advisory_xact_lock(hashtextextended('store:put:bookings', 0));
  m := _rx_map('bookings', _bk_canon());
  ixid := (m ->> 'رقم الإشعار')::int; ixs := (m ->> 'مراجعة واعتماد')::int;
  if ixid is null or ixs is null then raise exception 'غير مدعوم: أعمدة الإشعارات' using errcode = '0A000'; end if;
  select rid into oldrid from store_rows where tbl = 'bookings' and btrim(_rx_s(raw -> ixid)) = id limit 1;
  if oldrid is null then return jsonb_build_object('success', false, 'error', 'الإشعار غير موجود'); end if;
  update store_rows set raw = jsonb_set(raw, array[ixs::text], st) where tbl = 'bookings' and rid = oldrid;
  update store_meta set ver = ver + 1, updated_at = now() where tbl = 'bookings';
  perform _w_dv_bump(array['bookings', 'movements', 'trips', 'visa', 'ministry']);
  return jsonb_build_object('success', true);
end $$;

do $$ declare r record; begin
  for r in select p.oid::regprocedure::text sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname in ('rw2_deletebookingrecord', 'rw2_toggleapprovalstatus') loop
    execute format('revoke all on function %s from public, anon, authenticated', r.sig);
    execute format('grant execute on function %s to service_role', r.sig);
  end loop;
end $$;

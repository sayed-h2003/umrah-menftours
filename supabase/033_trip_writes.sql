-- 033: ترحيل الأرصدة (carryForwardTripBalance) · حذف رحلة · ملاحظة/ترتيب التسكين المدموج · اعتماد الإشعار («معتمد») من Postgres — يكمل 025/029.
-- الاعتماد: المتصفح يفحص أولاً (الحقول الإلزامية + منطق التحركات بنفس كود الخادم BKSRV_ على نسخة الإشعار المحمّلة)؛ أي نقص ⇒ يرجع لـ Apps Script ليعرض كل الأخطاء بنصوصها. Postgres يعيد فحص الحقول الإلزامية القابلة للمطابقة بأعمدة الإشعار بإعداد app_config الحالي.
-- ترحيل الرصيد: أي من الرحلتين بلا صف meta للعميل ⇒ 0A000 ⇒ Apps Script.
create or replace function _bk_colmap() returns jsonb language sql immutable as $$ select jsonb_build_object('status', 'مراجعة واعتماد', 'id', 'رقم الإشعار', 'agent', 'الوكيل السعودي', 'company', 'الشركة المصرية', 'groupNumbers', 'أرقام المجموعات', 'client', 'العميل', 'count', 'العدد', 'supervisor', 'المشرف', 'travelMethod', 'وسيلة السفر', 'arrivalPort', 'منفذ الوصول', 'arrivalDate', 'تاريخ الوصول', 'arrivalTime', 'ساعة الوصول', 'arrivalFlight', 'رقم رحلة الوصول', 'departureDate', 'تاريخ المغادرة', 'departureFlight', 'رقم رحلة المغادرة', 'departureTime', 'ساعة المغادرة', 'departurePort', 'منفذ المغادرة', 'transportCompany', 'شركة النقل الداخلي', 'operationNo', 'رقم التشغيلة', 'busCount', 'عدد الباصات', 'direction', 'اتجاه الإقامة', 'madinahNights', 'عدد ليالي المدينة', 'makkahNights', 'عدد ليالي مكة', 'madinahHotel', 'سكن المدينة', 'madinahCheckIn', 'دخول المدينة', 'madinahCheckOut', 'خروج المدينة', 'makkahHotel', 'سكن مكة', 'makkahCheckIn', 'دخول مكة', 'makkahCheckOut', 'خروج مكة', 'extraMovements', 'extraMovements', 'internalTransferDate', 'تاريخ التحرك الداخلي الأساسي', 'internalTransferTime', 'توقيت التحرك الداخلي الأساسي', 'notes', 'ملاحظات الإشعار', 'ticketUrl', 'رابط تذكرة الطيران', 'ticketFileId', 'معرّف ملف التذكرة', 'busPrice', 'سعر الباص', 'operationValue', 'قيمة التشغيلة', 'tripName', 'اسم الرحلة', 'groupName', 'اسم المجموعة', 'transportSegments', 'مقاطع نقل إضافية', 'attachmentsJson', 'مرفقات إضافية (JSON)', 'visaGroups', 'مجموعات التأشيرات', 'mfFiles', 'ملفات الوزارة', 'attachNames', 'إرفاق أسماء المعتمرين') $$;

-- ===== carryForwardTripBalance =====
create or replace function rw2_carryforwardtripbalance(a jsonb, u text) returns jsonb language plpgsql volatile set search_path = public as
$$ declare client text := _rx_trim(coalesce(a ->> 1, '')); ft text := _rx_trim(coalesce(a ->> 2, '')); tt text := _rx_trim(coalesce(a ->> 3, '')); who text := coalesce(u, app_user(), '-');
  items jsonb; pays jsonb; t jsonb; netE float8; netS float8; nowj jsonb := jsonb_build_object('$d', (extract(epoch from clock_timestamp()) * 1000)::bigint); nowstr text := to_char(now() at time zone 'Africa/Cairo', 'DD/MM/YYYY');
  cc record; cur text; amt float8; marker text; oi jsonb := '[]'::jsonb; op jsonb := '[]'::jsonb; id text; a_ float8; begin
  if not app_has('accounts.edit') then raise exception 'لا تملك صلاحية' using errcode = '42501'; end if;
  if client = '' or ft = '' or tt = '' then return jsonb_build_object('success', false, 'error', 'بيانات ناقصة'); end if;
  if ft = tt then return jsonb_build_object('success', false, 'error', 'اختر رحلتين مختلفتين'); end if;
  perform pg_advisory_xact_lock(hashtextextended('store:put:acc_items', 0)); perform pg_advisory_xact_lock(hashtextextended('store:put:acc_payments', 0));
  select coalesce(jsonb_agg(jsonb_build_object('value', _ac_num(_rx_c(raw, 8)), 'currency', coalesce(nullif(_rx_s(_rx_c(raw, 5)), ''), 'EGP'), 'isDiscount', _vz_s(_rx_c(raw, 9)) = 'نعم') order by rn), '[]'::jsonb) into items
    from _rx_rows('acc_items') where _rx_trim(_rx_s(_rx_c(raw, 1))) = client and _rx_trim(_rx_s(_rx_c(raw, 2))) = ft;
  select coalesce(jsonb_agg(jsonb_build_object('ptype', coalesce(nullif(_rx_s(_rx_c(raw, 3)), ''), 'دفعة'), 'date', _rx_s(_rx_c(raw, 4)), 'amount', _ac_num(_rx_c(raw, 5)), 'currency', coalesce(nullif(_rx_s(_rx_c(raw, 6)), ''), 'EGP'), 'rate', _ac_num(_rx_c(raw, 7))) order by rn), '[]'::jsonb) into pays
    from _rx_rows('acc_payments') where _rx_trim(_rx_s(_rx_c(raw, 1))) = client and _rx_trim(_rx_s(_rx_c(raw, 2))) = ft;
  t := _acc_calc(items, pays); netE := _gs_r2((t ->> 'netE')::float8); netS := _gs_r2((t ->> 'netS')::float8);
  if netE = 0 and netS = 0 then return jsonb_build_object('success', false, 'error', 'لا يوجد رصيد لترحيله من هذه الرحلة (مُقفلة أو بلا حساب)'); end if;
  if not exists (select 1 from store_rows where tbl = 'acc_meta' and btrim(_rx_s(raw -> 0)) = client and btrim(_rx_s(raw -> 1)) = ft)
     or not exists (select 1 from store_rows where tbl = 'acc_meta' and btrim(_rx_s(raw -> 0)) = client and btrim(_rx_s(raw -> 1)) = tt) then
    raise exception 'غير مدعوم: لا صف meta' using errcode = '0A000'; end if;
  for cc in select * from (values ('EGP', netE), ('SAR', netS)) v(cur_, amt_) loop
    cur := cc.cur_; amt := cc.amt_; if amt = 0 then continue; end if;
    marker := 'cf' || _w_b36((extract(epoch from clock_timestamp()) * 1000)::bigint) || _w_b36((random() * 10000)::int);
    if amt > 0 then
      id := 'P' || _w_b36((extract(epoch from clock_timestamp()) * 1000)::bigint) || _w_b36((random() * 10000)::int);
      insert into store_rows (tbl, rid, ord, raw) select 'acc_payments', substr(md5(random()::text || clock_timestamp()::text), 1, 20), coalesce(max(ord), 0) + 1,
        jsonb_build_array(id, client, ft, 'دفعة', nowstr, amt, cur, '', 'رصيد مرحّل إلى رحلة ' || tt || ' ⟦cf:' || marker || '⟧', who, nowj) from store_rows where tbl = 'acc_payments';
      op := op || jsonb_build_array(jsonb_build_object('id', id, 'trip', ft, 'ptype', 'دفعة', 'date', nowstr, 'amount', amt, 'currency', cur, 'rate', 0, 'desc', 'رصيد مرحّل إلى رحلة ' || tt || ' ⟦cf:' || marker || '⟧', 'serial', ''));
      id := 'I' || _w_b36((extract(epoch from clock_timestamp()) * 1000)::bigint) || _w_b36((random() * 10000)::int);
      insert into store_rows (tbl, rid, ord, raw) select 'acc_items', substr(md5(random()::text || clock_timestamp()::text), 1, 20), coalesce(max(ord), 0) + 1,
        jsonb_build_array(id, client, tt, 'رصيد مرحّل من رحلة ' || ft || ' ⟦cf:' || marker || '⟧', 'أخرى', cur, 1, amt, amt, 'لا', '', who, nowj, '', '', '', '', '') from store_rows where tbl = 'acc_items';
      oi := oi || jsonb_build_array(jsonb_build_object('id', id, 'trip', tt, 'desc', 'رصيد مرحّل من رحلة ' || ft || ' ⟦cf:' || marker || '⟧', 'cat', 'أخرى', 'currency', cur, 'count', 1, 'price', amt, 'value', amt, 'isDiscount', false, 'notes', '', 'nights', 0, 'company', '', 'auto', '', 'order', 0, 'isDirect', false));
    else
      a_ := -amt;
      id := 'I' || _w_b36((extract(epoch from clock_timestamp()) * 1000)::bigint) || _w_b36((random() * 10000)::int);
      insert into store_rows (tbl, rid, ord, raw) select 'acc_items', substr(md5(random()::text || clock_timestamp()::text), 1, 20), coalesce(max(ord), 0) + 1,
        jsonb_build_array(id, client, ft, 'ترحيل رصيد إلى رحلة ' || tt || ' ⟦cf:' || marker || '⟧', 'أخرى', cur, 1, a_, a_, 'لا', '', who, nowj, '', '', '', '', '') from store_rows where tbl = 'acc_items';
      oi := oi || jsonb_build_array(jsonb_build_object('id', id, 'trip', ft, 'desc', 'ترحيل رصيد إلى رحلة ' || tt || ' ⟦cf:' || marker || '⟧', 'cat', 'أخرى', 'currency', cur, 'count', 1, 'price', a_, 'value', a_, 'isDiscount', false, 'notes', '', 'nights', 0, 'company', '', 'auto', '', 'order', 0, 'isDirect', false));
      id := 'P' || _w_b36((extract(epoch from clock_timestamp()) * 1000)::bigint) || _w_b36((random() * 10000)::int);
      insert into store_rows (tbl, rid, ord, raw) select 'acc_payments', substr(md5(random()::text || clock_timestamp()::text), 1, 20), coalesce(max(ord), 0) + 1,
        jsonb_build_array(id, client, tt, 'دفعة', nowstr, a_, cur, '', 'رصيد مرحّل من رحلة ' || ft || ' ⟦cf:' || marker || '⟧', who, nowj) from store_rows where tbl = 'acc_payments';
      op := op || jsonb_build_array(jsonb_build_object('id', id, 'trip', tt, 'ptype', 'دفعة', 'date', nowstr, 'amount', a_, 'currency', cur, 'rate', 0, 'desc', 'رصيد مرحّل من رحلة ' || ft || ' ⟦cf:' || marker || '⟧', 'serial', ''));
    end if;
  end loop;
  update store_meta set ver = ver + 1, updated_at = now() where tbl in ('acc_items', 'acc_payments');
  insert into app_outbox (kind, payload) values ('audit', jsonb_build_object('user', who, 'action', 'ترحيل رصيد بين رحلتين', 'record', client, 'field', ft || ' → ' || tt, 'old', '-', 'new', 'جنيه ' || netE::text || ' / ريال ' || netS::text));
  perform _w_dv_bump(_acc_dvs());
  return jsonb_build_object('success', true, 'netE', netE, 'netS', netS, 'createdItems', oi, 'createdPayments', op); end $$;

-- ===== deleteTrip (targetRow = رقم صف الشيت) =====
create or replace function rw2_deletetrip(a jsonb, u text) returns jsonb language plpgsql volatile set search_path = public as
$$ declare n int := coalesce(_bk_pf(a -> 1), 0)::int; rid_ text; raw_ jsonb; nm text; who text := coalesce(u, app_user(), '-'); begin
  if not app_has('trips.delete') then raise exception 'حذف الرحلات متاح فقط لصاحب صلاحية DELETE أو admin' using errcode = '42501'; end if;
  if n < 2 then raise exception 'غير مدعوم: رقم صف' using errcode = '0A000'; end if;
  perform pg_advisory_xact_lock(hashtextextended('store:put:trips', 0));
  select rid, raw into rid_, raw_ from store_rows where tbl = 'trips' order by ord, rid offset (n - 2) limit 1;
  if rid_ is null then raise exception 'غير مدعوم: الصف غير موجود' using errcode = '0A000'; end if;
  nm := _rx_trim(_rx_s(_rx_c(raw_, 0)));
  delete from store_rows where tbl = 'trips' and rid = rid_;
  update store_meta set ver = ver + 1, updated_at = now() where tbl = 'trips';
  insert into app_outbox (kind, payload) values ('audit', jsonb_build_object('user', who, 'action', 'حذف', 'record', nm, 'field', 'حذف رحلة', 'old', nm, 'new', '-'));
  perform _w_dv_bump(array['bookings', 'movements', 'trips', 'pilgrims', 'visa', 'ministry', 'dropdowns']);
  return jsonb_build_object('success', true); end $$;

-- ===== ملاحظة التسكين / الترتيب المدموج =====
create or replace function _mh_key(trips jsonb, city text) returns text language sql immutable as
$$ select coalesce(city, '') || '::' || case when jsonb_typeof(trips) = 'array' then coalesce((select string_agg(x, '|' order by x collate "C") from jsonb_array_elements_text(trips) x), '') else '' end $$;
create or replace function _mh_trips_json(trips jsonb) returns text language sql immutable as
$$ select '[' || coalesce((select string_agg(to_json(x)::text, ',' order by o) from jsonb_array_elements_text(case when jsonb_typeof(trips) = 'array' then trips else '[]'::jsonb end) with ordinality t(x, o)), '') || ']' $$;

create or replace function _mh_upsert(p_tbl text, p_key text, p_trips jsonb, p_city text, p_val text, p_user text) returns void language plpgsql volatile set search_path = public as
$$ declare rid_ text; nowj jsonb := jsonb_build_object('$d', (extract(epoch from clock_timestamp()) * 1000)::bigint); row_ jsonb := jsonb_build_array(p_key, _mh_trips_json(p_trips), coalesce(p_city, ''), p_val, nowj, coalesce(p_user, '')); begin
  perform pg_advisory_xact_lock(hashtextextended('store:put:' || p_tbl, 0));
  select rid into rid_ from store_rows where tbl = p_tbl and _rx_s(_rx_c(raw, 0)) = p_key order by ord limit 1;
  if rid_ is null then
    insert into store_rows (tbl, rid, ord, raw) select p_tbl, substr(md5(random()::text || clock_timestamp()::text), 1, 20), coalesce(max(ord), 0) + 1, row_ from store_rows where tbl = p_tbl;
  else update store_rows set raw = row_ where tbl = p_tbl and rid = rid_; end if;
  update store_meta set ver = ver + 1, updated_at = now() where tbl = p_tbl; end $$;

create or replace function rw2_savehousingnote(a jsonb, u text) returns jsonb language plpgsql volatile set search_path = public as
$$ declare txt text := left(coalesce(a ->> 3, ''), 4000); begin
  if not exists (select 1 from store_meta where tbl = 'housing_notes') then raise exception 'غير مدعوم: لا جدول' using errcode = '0A000'; end if;
  perform _mh_upsert('housing_notes', _mh_key(a -> 1, a ->> 2), a -> 1, a ->> 2, txt, coalesce(u, app_user(), ''));
  perform _w_dv_bump(array['trips']);
  return jsonb_build_object('success', true, 'note', txt); end $$;

create or replace function rw2_savemergedhousing(a jsonb, u text) returns jsonb language plpgsql volatile set search_path = public as
$$ begin
  if not exists (select 1 from store_meta where tbl = 'merged_housing') or jsonb_typeof(a -> 3) is distinct from 'string' then raise exception 'غير مدعوم' using errcode = '0A000'; end if;
  perform _mh_upsert('merged_housing', _mh_key(a -> 1, a ->> 2), a -> 1, a ->> 2, a ->> 3, coalesce(u, app_user(), ''));
  perform _w_dv_bump(array['trips']);
  return jsonb_build_object('success', true); end $$;

-- ===== اعتماد الإشعار «معتمد» (يستبدل تعريف 025) =====
create or replace function rw2_toggleapprovalstatus(a jsonb, u text) returns jsonb language plpgsql volatile set search_path = public as
$$ declare id text := btrim(coalesce(a ->> 1, '')); st jsonb := a -> 2; m jsonb; ixid int; ixs int; oldrid text; oldraw jsonb; cfg jsonb; req text; cm jsonb := _bk_colmap(); ix int; val jsonb; miss text[] := '{}'; lbl jsonb; dir text; begin
  if st is null or jsonb_typeof(st) <> 'string' then raise exception 'غير مدعوم' using errcode = '0A000'; end if;
  if (st #>> '{}') = 'معتمد' and (a -> 3 ->> 'v') is distinct from 'c1' then raise exception 'غير مدعوم: الاعتماد يمر ببوابة التحقق' using errcode = '0A000'; end if;
  if id = '' then raise exception 'رقم الإشعار مطلوب' using errcode = 'P0001'; end if;
  perform pg_advisory_xact_lock(hashtextextended('store:put:bookings', 0));
  m := _rx_map('bookings', _bk_canon());
  ixid := (m ->> 'رقم الإشعار')::int; ixs := (m ->> 'مراجعة واعتماد')::int;
  if ixid is null or ixs is null then raise exception 'غير مدعوم: أعمدة الإشعارات' using errcode = '0A000'; end if;
  select rid, raw into oldrid, oldraw from store_rows where tbl = 'bookings' and btrim(_rx_s(raw -> ixid)) = id limit 1;
  if oldrid is null then return jsonb_build_object('success', false, 'error', 'الإشعار غير موجود'); end if;
  if (st #>> '{}') = 'معتمد' then
    -- إعادة فحص الحقول الإلزامية على الصف المخزَّن بإعداد app_config الحالي (ما لا يطابق عموداً يغطيه فحص المتصفح)
    cfg := _rx_cfg('required_fields'); dir := btrim(_rx_s(oldraw -> (m ->> 'اتجاه الإقامة')::int));
    select coalesce(jsonb_object_agg(f ->> 'id', f ->> 'label'), '{}'::jsonb) into lbl from jsonb_array_elements(coalesce(cfg -> 'catalog', '[]'::jsonb)) f;
    for req in select jsonb_array_elements_text(coalesce(cfg -> 'required', '[]'::jsonb)) loop
      if (dir = 'مكة فقط' and req = 'madinahHotel') or (dir = 'المدينة فقط' and req = 'makkahHotel') then continue; end if;
      if not (cm ? req) then continue; end if;
      ix := (m ->> (cm ->> req))::int; if ix is null then continue; end if;
      val := _rx_c(oldraw, ix);
      if val is null or jsonb_typeof(val) = 'null' or btrim(case when jsonb_typeof(val) = 'string' then val #>> '{}' else val::text end) = '' then miss := miss || coalesce(lbl ->> req, req); end if;
    end loop;
    if array_length(miss, 1) > 0 then raise exception 'غير مدعوم: حقول إلزامية ناقصة' using errcode = '0A000'; end if;
  end if;
  update store_rows set raw = jsonb_set(raw, array[ixs::text], st) where tbl = 'bookings' and rid = oldrid;
  update store_meta set ver = ver + 1, updated_at = now() where tbl = 'bookings';
  perform _w_dv_bump(array['bookings', 'movements', 'trips', 'visa', 'ministry']);
  return jsonb_build_object('success', true); end $$;

do $$ declare r record; begin
  for r in select p.oid::regprocedure::text sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname in ('rw2_carryforwardtripbalance', 'rw2_deletetrip', 'rw2_savehousingnote', 'rw2_savemergedhousing', 'rw2_toggleapprovalstatus', '_mh_upsert') loop
    execute format('revoke all on function %s from public, anon, authenticated', r.sig);
    execute format('grant execute on function %s to service_role', r.sig);
  end loop;
end $$;

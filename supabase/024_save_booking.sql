-- 024: saveBookingToServer من Postgres (rw_call) — حفظ/تعديل الإشعار مباشرة بـ store_rows بلا Apps Script (7.8–10.8 ث ⇒ <1 ث)
-- التحقق من منطق التحركات وبناء صفوف التحركات يجريهما المتصفح بنفس كود الخادم حرفياً (اختبار تطابق بالمستودع)؛ أي خطأ تحقق ⇒ المتصفح يرجع لـ Apps Script ليعرض الرسالة المهيكلة نفسها.
-- هنا: الحقول الإلزامية · رقم الإشعار (أقصى رقم+1 بقفل) · بناء الصف بأسماء الأعمدة · كتابة bookings+movements · بصمات dv · أثر التدقيق بصندوق الإخراج (bkdiff).
-- المؤجَّل لـ Apps Script بالخلفية (bookingAfterSaveBg): مزامنة الإشعار→الرحلة · تسعير دورة النقل. غير المدعوم هنا (0A000 ⇒ Apps Script): تذكرة مؤقتة بـDrive · بوت تليجرام.
-- يتطلب 006+007+009+016(+023). التفعيل: supaWriteOn('bk') من محرر Apps Script.

create or replace function _bk_canon() returns text[] language sql immutable as $$ select array['مراجعة واعتماد','رقم الإشعار','الوكيل السعودي','الشركة المصرية','أرقام المجموعات','العميل','العدد','المشرف','وسيلة السفر','منفذ الوصول','تاريخ الوصول','ساعة الوصول','رقم رحلة الوصول','تاريخ المغادرة','رقم رحلة المغادرة','ساعة المغادرة','منفذ المغادرة','شركة النقل الداخلي','رقم التشغيلة','عدد الباصات','اتجاه الإقامة','عدد ليالي المدينة','عدد ليالي مكة','سكن المدينة','دخول المدينة','خروج المدينة','سكن مكة','دخول مكة','خروج مكة','extraMovements','ملاحظات الإشعار','رابط تذكرة الطيران','معرّف ملف التذكرة','سعر الباص','قيمة التشغيلة','اسم الرحلة','تاريخ التحرك الداخلي الأساسي','توقيت التحرك الداخلي الأساسي','اسم المجموعة','مقاطع نقل إضافية','مرفقات إضافية (JSON)','مجموعات التأشيرات','ملفات الوزارة','إرفاق أسماء المعتمرين'] $$;

-- قيمة JS «||»: القيمة إن كانت truthy وإلا الافتراضي
create or replace function _bk_or(v jsonb, dflt jsonb) returns jsonb language sql immutable as
$$ select case when v is null or v = 'null'::jsonb or v = '""'::jsonb or v = '0'::jsonb or v = 'false'::jsonb then dflt else v end $$;

-- parseFloat: أول رقم بالنص أو null (NaN)
create or replace function _bk_pf(v jsonb) returns float8 language sql immutable as
$$ select case when v is null or jsonb_typeof(v) = 'null' then null
               when jsonb_typeof(v) = 'number' then (v #>> '{}')::float8
               else (select (regexp_match(btrim(v #>> '{}'), '^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?'))[1]::float8 end) end $$;

create or replace function rw2_savebookingtoserver(a jsonb, u text) returns jsonb language plpgsql volatile set search_path = public as
$$ #variable_conflict use_column
declare
  d jsonb := a -> 1; x jsonb := coalesce(a -> 2, '{}'::jsonb); mv jsonb := coalesce(x -> 'movements', '[]'::jsonb);
  m jsonb; w int; mx int; ixid int; oldrid text; oldraw jsonb; newrow jsonb; fid jsonb; fids text; isnew boolean;
  cfg jsonb; req text; lbl jsonb := '{}'::jsonb; miss text[] := '{}'; dir text; r jsonb; val jsonb;
  bp float8; bc float8; opv float8; tkurl jsonb; vals jsonb; k text; ix int; mrid text; mord bigint; i int; who text := coalesce(u, app_user(), '-'); mvr jsonb;
  maxid bigint; strs jsonb := coalesce(x -> 'strs', '{}'::jsonb); cnt jsonb;
begin
  if jsonb_typeof(d) is distinct from 'object' then raise exception 'بيانات الإشعار مطلوبة' using errcode = 'P0001'; end if;
  if (x ->> 'v') is distinct from 'c1' or jsonb_typeof(mv) <> 'array' or not (strs ? 'extraMovements' and strs ? 'transportSegments' and strs ? 'attachmentsJson') then
    raise exception 'غير مدعوم: نسخة الواجهة' using errcode = '0A000'; end if;
  if (d ->> '__fromTelegramBot__') = 'true' or ((d ->> 'ticketTemporary') = 'true' and btrim(coalesce(d ->> 'ticketFileId', '')) <> '') then
    raise exception 'غير مدعوم: بوت/تذكرة مؤقتة' using errcode = '0A000'; end if;

  -- الحقول الإلزامية (= validateRequiredFields_)
  cfg := _rx_cfg('required_fields');
  select coalesce(jsonb_object_agg(f ->> 'id', f ->> 'label'), '{}'::jsonb) into lbl from jsonb_array_elements(coalesce(cfg -> 'catalog', '[]'::jsonb)) f;
  dir := btrim(coalesce(d ->> 'direction', ''));
  for req in select jsonb_array_elements_text(coalesce(cfg -> 'required', '[]'::jsonb)) loop
    if (dir = 'مكة فقط' and req = 'madinahHotel') or (dir = 'المدينة فقط' and req = 'makkahHotel') then continue; end if;
    val := d -> req;
    if val is null or jsonb_typeof(val) = 'null' or btrim(case when jsonb_typeof(val) = 'string' then val #>> '{}' else val::text end) = '' then miss := miss || coalesce(lbl ->> req, req); end if;
  end loop;
  if array_length(miss, 1) > 0 then
    return jsonb_build_object('success', false, 'error', 'يجب تعبئة الحقول الإلزامية التالية قبل الحفظ: ' || array_to_string(miss, '، '));
  end if;

  perform pg_advisory_xact_lock(hashtextextended('store:put:bookings', 0));
  m := _rx_map('bookings', _bk_canon());
  ixid := (m ->> 'رقم الإشعار')::int;
  if ixid is null then raise exception 'غير مدعوم: عمود رقم الإشعار' using errcode = '0A000'; end if;

  fid := d -> 'id'; fids := btrim(coalesce(d ->> 'id', ''));
  if fids <> '' and fid <> 'null'::jsonb then
    select rid, raw into oldrid, oldraw from store_rows where tbl = 'bookings' and btrim(_rx_s(raw -> ixid)) = fids limit 1;
  else
    fid := null;
  end if;
  isnew := oldrid is null;
  if fid is null then
    select coalesce(max((regexp_match(_rx_s(raw -> ixid), '^\s*(\d+)'))[1]::bigint), 0) + 1 into maxid from store_rows where tbl = 'bookings';
    fid := to_jsonb(maxid);
  end if;

  tkurl := coalesce(nullif(d -> 'ticketUrl', '""'::jsonb), '""'::jsonb);
  if jsonb_typeof(tkurl) = 'null' then tkurl := '""'::jsonb; end if;
  if not isnew and tkurl = '""'::jsonb then tkurl := coalesce(oldraw -> (m ->> 'رابط تذكرة الطيران')::int, '""'::jsonb); end if;

  bp := coalesce(_bk_pf(d -> 'busPrice'), 0);
  bc := _bk_pf(_bk_or(d -> 'busCount', d -> 'buses'));
  opv := case when bc is null then 0 else bp * bc end;

  vals := jsonb_build_object(
    'مراجعة واعتماد', _bk_or(d -> 'status', '"قيد المراجعة"'), 'رقم الإشعار', fid,
    'الوكيل السعودي', _bk_or(d -> 'agent', '""'), 'الشركة المصرية', _bk_or(d -> 'company', '""'), 'أرقام المجموعات', _bk_or(d -> 'groupNumbers', '""'),
    'العميل', _bk_or(d -> 'client', '""'), 'العدد', _bk_or(d -> 'count', '"0"'), 'المشرف', _bk_or(d -> 'supervisor', '""'),
    'وسيلة السفر', _bk_or(d -> 'travelMethod', '""'), 'منفذ الوصول', _bk_or(d -> 'arrivalPort', '""'), 'تاريخ الوصول', _bk_or(d -> 'arrivalDate', '""'),
    'ساعة الوصول', _bk_or(d -> 'arrivalTime', '""'), 'رقم رحلة الوصول', _bk_or(d -> 'arrivalFlight', '""'),
    'تاريخ المغادرة', _bk_or(d -> 'departureDate', '""'), 'رقم رحلة المغادرة', _bk_or(d -> 'departureFlight', '""'), 'ساعة المغادرة', _bk_or(d -> 'departureTime', '""'),
    'منفذ المغادرة', _bk_or(d -> 'departurePort', '""'), 'شركة النقل الداخلي', _bk_or(d -> 'transportCompany', '""'), 'رقم التشغيلة', _bk_or(d -> 'operationNo', '""'),
    'عدد الباصات', _bk_or(_bk_or(d -> 'busCount', d -> 'buses'), '""'), 'اتجاه الإقامة', _bk_or(d -> 'direction', '""'));
  vals := vals || jsonb_build_object(
    'عدد ليالي المدينة', _bk_or(d -> 'madinahNights', '"0"'), 'عدد ليالي مكة', _bk_or(d -> 'makkahNights', '"0"'),
    'سكن المدينة', _bk_or(d -> 'madinahHotel', '""'), 'دخول المدينة', _bk_or(d -> 'madinahCheckIn', '""'), 'خروج المدينة', _bk_or(d -> 'madinahCheckOut', '""'),
    'سكن مكة', _bk_or(d -> 'makkahHotel', '""'), 'دخول مكة', _bk_or(d -> 'makkahCheckIn', '""'), 'خروج مكة', _bk_or(d -> 'makkahCheckOut', '""'),
    'تاريخ التحرك الداخلي الأساسي', coalesce(to_jsonb(nullif(_bk_nojunk(d ->> 'internalTransferDate'), '')), '""'), 'توقيت التحرك الداخلي الأساسي', _bk_or(d -> 'internalTransferTime', '""'),
    'extraMovements', strs -> 'extraMovements', 'ملاحظات الإشعار', _bk_or(d -> 'notes', '""'), 'رابط تذكرة الطيران', tkurl,
    'معرّف ملف التذكرة', _bk_or(d -> 'ticketFileId', '""'), 'سعر الباص', to_jsonb(bp), 'قيمة التشغيلة', to_jsonb(opv),
    'اسم الرحلة', _bk_or(d -> 'tripName', '""'), 'اسم المجموعة', _bk_or(d -> 'groupName', '""'), 'مقاطع نقل إضافية', strs -> 'transportSegments',
    'مرفقات إضافية (JSON)', strs -> 'attachmentsJson', 'مجموعات التأشيرات', _bk_or(d -> 'visaGroups', '""'), 'ملفات الوزارة', _bk_or(d -> 'mfFiles', '""'),
    'إرفاق أسماء المعتمرين', case when (d ->> 'attachNames') in ('نعم', 'true') then '"نعم"'::jsonb else '"لا"'::jsonb end);

  mx := array_length(_bk_canon(), 1);
  select greatest(mx, coalesce(max((m ->> n)::int + 1), 0)) into w from unnest(_bk_canon()) n where m ? n;
  select jsonb_agg('""'::jsonb) into newrow from generate_series(1, w);
  for k in select jsonb_object_keys(vals) loop
    ix := (m ->> k)::int;
    if ix is not null then newrow := jsonb_set(newrow, array[ix::text], vals -> k); end if;
  end loop;
  if oldraw is not null and jsonb_array_length(oldraw) > w then   -- أعمدة فعلية بعد القانونية تبقى كما هي
    select newrow || coalesce(jsonb_agg(c order by o), '[]'::jsonb) into newrow from jsonb_array_elements(oldraw) with ordinality t(c, o) where o > w;
  end if;

  if isnew then
    insert into store_rows (tbl, rid, ord, raw)
      select 'bookings', substr(md5(random()::text || clock_timestamp()::text), 1, 20), coalesce(max(ord), 0) + 1, newrow from store_rows where tbl = 'bookings';
  else
    update store_rows set raw = newrow where tbl = 'bookings' and rid = oldrid;
  end if;
  update store_meta set ver = ver + 1, updated_at = now() where tbl = 'bookings';

  -- التحركات: حذف القديمة لهذا الإشعار ثم إدراج الجديدة (= deleteBookingMovements_ + setValues)
  if exists (select 1 from store_meta where tbl = 'movements') then
    delete from store_rows where tbl = 'movements' and btrim(_rx_s(raw -> 1)) = btrim(_rx_s(fid));
    select coalesce(max(ord), 0) into mord from store_rows where tbl = 'movements';
    i := 0;
    for mvr in select * from jsonb_array_elements(mv) loop
      i := i + 1;
      insert into store_rows (tbl, rid, ord, raw) values ('movements', substr(md5(random()::text || clock_timestamp()::text || i), 1, 20), mord + i,
        jsonb_build_array(_bk_or(d -> 'status', '"قيد المراجعة"'), fid, _bk_or(mvr -> 'date', '""'), _bk_or(mvr -> 'time', '"00:00"'), _bk_or(mvr -> 'type', '""'),
          _bk_or(d -> 'agent', '""'), _bk_or(d -> 'company', '""'), _bk_or(d -> 'client', '""'), _bk_or(d -> 'count', '"0"'), _bk_or(d -> 'supervisor', '""'),
          _bk_or(_bk_or(mvr -> 'buses', d -> 'busCount'), '""')));
    end loop;
    update store_meta set ver = ver + 1, updated_at = now() where tbl = 'movements';
  end if;

  perform _w_dv_bump(array['bookings', 'movements', 'trips', 'visa', 'ministry']);
  insert into app_outbox (kind, payload) values ('bkdiff', jsonb_build_object('user', who, 'id', fid, 'isNew', isnew, 'old', oldraw, 'new', newrow));

  return jsonb_build_object('success', true, 'id', fid);
end $$;

create or replace function _bk_nojunk(t text) returns text language sql immutable as
$$ select case when btrim(coalesce(t, '')) in ('[]', '{}', 'null', 'undefined', '-') then '' else btrim(coalesce(t, '')) end $$;

do $$ declare r record; begin
  for r in select p.oid::regprocedure::text sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'rw2_savebookingtoserver' loop
    execute format('revoke all on function %s from public, anon, authenticated', r.sig);
    execute format('grant execute on function %s to service_role', r.sig);
  end loop;
end $$;

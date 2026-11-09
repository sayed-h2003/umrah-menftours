-- 037: saveTripPilgrims من Postgres — حفظ كشف الرحلة (استبدال معتمري الرحلة بالقائمة الجديدة) بنفس منطق Code.gs:
-- • اسم العميل إلزامي · الحذف الفعلي يتطلب kashf.delete · المحذوفون من الكشف يتحوّلون لصفوف «بدون رحلة» (يبقون بالسجل العام) ما لم يكونوا برحلة أخرى
-- • صفوف الرحلات الأخرى لا تُمس؛ صفوف هذه الرحلة تنتقل لآخر الجدول (كما كان بالشيت) ثم صفوف «بدون رحلة» الجديدة
-- • الآثار الجانبية (سجل الفروق · المشرفون · التنبيهات · مزامنة حسابات العملاء · دليل العملاء) بوظيفة kashfsave تنفذها Apps Script بنفس دوالها:
--   المتصفح بنداء kashfAfterSaveBg فوراً، وإلا يتولاها _outboxDrain_ بعد ~دقيقتين. اللقطات tripsnap من هنا. يتطلب 034 (+_pm_ix/_ts_state) و006+007+009.
create or replace function _stp_set(r jsonb, ixh jsonb, k text, v jsonb) returns jsonb language sql immutable as
$$ select case when (ixh ->> k) is null then r else jsonb_set(r, array[(ixh ->> k)], v) end $$;

create or replace function _stp_row(ixh jsonb, w int, p jsonb, idx int, trip text) returns jsonb language plpgsql immutable as
$$ declare r jsonb; ty text := coalesce(p ->> 'type', ''); begin
  select jsonb_agg('""'::jsonb) into r from generate_series(1, w);
  r := _stp_set(r, ixh, 'مسلسل', to_jsonb(idx));
  r := _stp_set(r, ixh, 'اسم المعتمر', to_jsonb(btrim(coalesce(p ->> 'name', ''))));
  r := _stp_set(r, ixh, 'رقم الجواز', to_jsonb(btrim(coalesce(p ->> 'passport', ''))));
  r := _stp_set(r, ixh, 'النوع', to_jsonb(ty));
  r := _stp_set(r, ixh, 'العميل', to_jsonb(coalesce(p ->> 'client', '')));
  r := _stp_set(r, ixh, 'طبيعة التسكين', to_jsonb(case when ty = 'رضيع' then '' else coalesce(p ->> 'accommodation', '') end));
  r := _stp_set(r, ixh, 'رقم الغرفة', to_jsonb(coalesce(p ->> 'roomNo', '')));
  r := _stp_set(r, ixh, 'ملاحظات', to_jsonb(coalesce(p ->> 'notes', '')));
  r := _stp_set(r, ixh, 'اسم الرحلة', to_jsonb(trip));
  r := _stp_set(r, ixh, 'رقم الإشعار', to_jsonb(coalesce(p ->> 'bookingId', '')));
  r := _stp_set(r, ixh, 'الاسم بالإنجليزية', to_jsonb(btrim(coalesce(p ->> 'latinName', ''))));
  r := _stp_set(r, ixh, 'تاريخ الميلاد', to_jsonb(btrim(coalesce(p ->> 'birthDate', ''))));
  r := _stp_set(r, ixh, 'تاريخ إصدار الجواز', to_jsonb(btrim(coalesce(p ->> 'issueDate', ''))));
  r := _stp_set(r, ixh, 'تاريخ انتهاء الجواز', to_jsonb(btrim(coalesce(p ->> 'expiryDate', ''))));
  r := _stp_set(r, ixh, 'معرف المعتمر', to_jsonb(btrim(coalesce(p ->> 'pid', ''))));
  r := _stp_set(r, ixh, 'معرف المحرم', to_jsonb(btrim(coalesce(p ->> 'mahramPid', ''))));
  r := _stp_set(r, ixh, 'علاقة المحرم', to_jsonb(btrim(coalesce(p ->> 'mahramRel', ''))));
  r := _stp_set(r, ixh, 'فندق المدينة', to_jsonb(btrim(coalesce(p ->> 'hotelMadinah', ''))));
  r := _stp_set(r, ixh, 'فندق مكة', to_jsonb(btrim(coalesce(p ->> 'hotelMakkah', ''))));
  r := _stp_set(r, ixh, 'مجموعة الغرفة', to_jsonb(btrim(coalesce(p ->> 'roomGroup', ''))));
  r := _stp_set(r, ixh, 'مستبعد من التسكين', to_jsonb(case when _gs_truthy(p -> 'housingExcluded') then '1' else '' end));
  r := _stp_set(r, ixh, 'رقم غرفة المدينة', to_jsonb(btrim(coalesce(p ->> 'roomNoMadinah', ''))));
  r := _stp_set(r, ixh, 'رقم غرفة مكة', to_jsonb(btrim(coalesce(p ->> 'roomNoMakkah', ''))));
  r := _stp_set(r, ixh, 'مستبعد من تسكين المدينة', to_jsonb(case when _gs_truthy(p -> 'housingExcludedMadinah') then '1' else '' end));
  r := _stp_set(r, ixh, 'مستبعد من تسكين مكة', to_jsonb(case when _gs_truthy(p -> 'housingExcludedMakkah') then '1' else '' end));
  return r; end $$;

create or replace function rw2_savetrippilgrims(a jsonb, u text) returns jsonb language plpgsql volatile set search_path = public as
$$ declare
  who text := coalesce(u, app_user(), '-'); trip text := _rx_trim(coalesce(a ->> 1, '')); pil jsonb := case when jsonb_typeof(a -> 2) = 'array' then a -> 2 else '[]'::jsonb end;
  ix jsonb := _pm_ix(); ixh jsonb := _rx_map('pilgrims', _rx_h_pil()); i_tr int := (ix ->> 'tripName')::int; i_ps int := (ix ->> 'passport')::int; i_nm int := (ix ->> 'name')::int; i_pid int := (ix ->> 'pid')::int;
  i_rm int := (ix ->> 'roomNo')::int; i_bk int := (ix ->> 'bookingId')::int; i_hm int := (ix ->> 'hotelMadinah')::int; i_hk int := (ix ->> 'hotelMakkah')::int;
  w int := greatest(jsonb_array_length(_rx_hdr('pilgrims')), (select max(v::int) + 1 from jsonb_each_text(ixh) e(k, v)));
  nocl text[]; oldrows jsonb; oldkeys text[]; newkeys text[]; p jsonb; idx int := 0; base_ord bigint; kept jsonb := '{}'::jsonb; rec record; pass text; pid text; nm text; kk text; nt jsonb; jid bigint; conf jsonb; chk jsonb; row_ jsonb; n_new int := 0;
begin
  if trip = '' then raise exception 'اسم الرحلة مطلوب' using errcode = 'P0001'; end if;
  select array_agg(btrim(x ->> 'name')) into nocl from jsonb_array_elements(pil) x where btrim(coalesce(x ->> 'name', '')) <> '' and btrim(coalesce(x ->> 'client', '')) = '';
  if nocl is not null then raise exception 'اسم العميل مطلوب لكل معتمر — أكمِل العميل لهؤلاء المعتمرين قبل الحفظ: %', array_to_string(nocl[1:12], '، ') || case when array_length(nocl, 1) > 12 then ' …' else '' end using errcode = 'P0001'; end if;
  perform pg_advisory_xact_lock(hashtextextended('store:put:pilgrims', 0));
  select coalesce(jsonb_agg(raw order by ord, rid), '[]'::jsonb) into oldrows from store_rows where tbl = 'pilgrims' and _rx_trim(_rx_s(_rx_c(raw, i_tr))) = trip;
  -- فحص الحذف (نفس _keyOf_: pid ثم جواز ثم اسم)
  select coalesce(array_agg(distinct coalesce(nullif(_rx_trim(_rx_s(_rx_c(o, i_pid))), ''), nullif(_rx_trim(_rx_s(_rx_c(o, i_ps))), ''), _rx_trim(_rx_s(_rx_c(o, i_nm))))), '{}') into oldkeys from jsonb_array_elements(oldrows) o;
  select coalesce(array_agg(distinct coalesce(nullif(btrim(coalesce(x ->> 'pid', '')), ''), nullif(btrim(coalesce(x ->> 'passport', '')), ''), btrim(coalesce(x ->> 'name', '')))), '{}') into newkeys from jsonb_array_elements(pil) x;
  if exists (select 1 from unnest(oldkeys) ok_ where ok_ <> '' and not (ok_ = any(newkeys))) and not app_has('kashf.delete') then
    raise exception 'لا تملك صلاحية حذف معتمرين من الكشف — يمكنك إضافة/تعديل البيانات، لكن الحذف متاح فقط لصاحب صلاحية DELETE أو admin' using errcode = '42501'; end if;
  -- لقطة الأساس قبل أول تعديل مُلتقَط
  insert into app_outbox (kind, payload) values ('tripsnap', jsonb_build_object('trip', trip, 'user', who, 'action', 'خط الأساس (قبل أول تعديل مُلتقَط)', 'state', _ts_state(trip), 'base', true));
  -- مفاتيح «المتبقين» (رحلات أخرى) لمنع تكرار المحوَّلين لبدون رحلة
  select coalesce(jsonb_object_agg(k, true), '{}'::jsonb) into kept from (
    select 'P:' || _rx_trim(_rx_s(_rx_c(raw, i_ps))) k from store_rows where tbl = 'pilgrims' and _rx_trim(_rx_s(_rx_c(raw, i_tr))) <> trip and _rx_trim(_rx_s(_rx_c(raw, i_ps))) <> ''
    union select 'N:' || _rx_trim(_rx_s(_rx_c(raw, i_nm))) from store_rows where tbl = 'pilgrims' and _rx_trim(_rx_s(_rx_c(raw, i_tr))) <> trip and _rx_trim(_rx_s(_rx_c(raw, i_nm))) <> '') z;
  delete from store_rows where tbl = 'pilgrims' and _rx_trim(_rx_s(_rx_c(raw, i_tr))) = trip;
  select coalesce(max(ord), 0) into base_ord from store_rows where tbl = 'pilgrims';
  for p in select * from jsonb_array_elements(pil) loop
    idx := idx + 1;
    if btrim(coalesce(p ->> 'name', '')) = '' then continue; end if;
    n_new := n_new + 1; base_ord := base_ord + 1;
    row_ := _stp_row(ixh, w, p, idx, trip);
    insert into store_rows (tbl, rid, ord, raw) values ('pilgrims', substr(md5(random()::text || clock_timestamp()::text || idx::text), 1, 20), base_ord, row_);
    if btrim(coalesce(p ->> 'passport', '')) <> '' then kept := kept || jsonb_build_object('P:' || btrim(p ->> 'passport'), true); end if;
    kept := kept || jsonb_build_object('N:' || btrim(p ->> 'name'), true);
  end loop;
  -- المحذوفون من الكشف ⇒ صفوف «بدون رحلة»
  for rec in select o from jsonb_array_elements(oldrows) o loop
    pass := _rx_trim(_rx_s(_rx_c(rec.o, i_ps))); pid := _rx_trim(_rx_s(_rx_c(rec.o, i_pid))); nm := _rx_trim(_rx_s(_rx_c(rec.o, i_nm)));
    if nm = '' then continue; end if;
    kk := coalesce(nullif(pass, ''), nullif(pid, ''), nm);
    if kk = any(newkeys) then continue; end if;
    if (pass <> '' and kept ? ('P:' || pass)) or (pass = '' and kept ? ('N:' || nm)) then continue; end if;
    nt := rec.o;
    nt := jsonb_set(nt, array[i_tr::text], '""'); nt := jsonb_set(nt, array[i_rm::text], '""'); nt := jsonb_set(nt, array[i_bk::text], '""'); nt := jsonb_set(nt, array[i_hm::text], '""'); nt := jsonb_set(nt, array[i_hk::text], '""');
    base_ord := base_ord + 1;
    insert into store_rows (tbl, rid, ord, raw) values ('pilgrims', substr(md5(random()::text || clock_timestamp()::text || nm), 1, 20), base_ord, nt);
    kept := kept || jsonb_build_object(case when pass <> '' then 'P:' || pass else 'N:' || nm end, true);
  end loop;
  update store_meta set ver = ver + 1, updated_at = now() where tbl = 'pilgrims';
  select coalesce(jsonb_agg(jsonb_build_object('name', x ->> 'name', 'passport', coalesce(x ->> 'passport', ''))), '[]'::jsonb) into chk from jsonb_array_elements(pil) x;
  conf := rx_trip_conflicts_raw(to_jsonb(trip), chk);
  insert into app_outbox (kind, payload) values ('kashfsave', jsonb_build_object('trip', trip, 'user', who, 'old', oldrows, 'pilgrims', pil, 'at', extract(epoch from now()))) returning id into jid;
  insert into app_outbox (kind, payload) values ('tripsnap', jsonb_build_object('trip', trip, 'user', who, 'action', 'حفظ الكشف', 'state', _ts_state(trip)));
  perform _w_dv_bump(array['pilgrims', 'trips']);
  return jsonb_build_object('success', true, 'count', jsonb_array_length(pil), 'conflicts', coalesce(conf, '[]'::jsonb), 'job', jid); end $$;

revoke all on function _stp_set(jsonb, jsonb, text, jsonb), _stp_row(jsonb, int, jsonb, int, text), rw2_savetrippilgrims(jsonb, text) from public, anon, authenticated;
grant execute on function _stp_set(jsonb, jsonb, text, jsonb), _stp_row(jsonb, int, jsonb, int, text), rw2_savetrippilgrims(jsonb, text) to service_role;

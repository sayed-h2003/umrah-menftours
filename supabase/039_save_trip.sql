-- 039: saveTrip من Postgres — إنشاء/تعديل رحلة (+ انتشار بيانات الرحلة للإشعار المرتبط _propagateTripChangesToBooking_) بنفس منطق Code.gs.
-- • تغيير اسم الرحلة (إعادة تسمية) ⇒ 0A000 ⇒ Apps Script (الانتشار الكامل لكشف المعتمرين/الإشعارات/كل شيتات الحسابات والتسعير والوزارة) — يُنقل بإصدار مستقل.
-- • سجل التعديلات ⇒ audit_log(pg)+السجل المحصّن · لقطات الرحلة (tripsnap) · الكاش لا حاجة له. يتطلب 034 (_ts_state/_pm_ix) و037 (_stp_set/_stp_aud) و024 (_bk_canon/_bk_or).
create or replace function _st_diffdays(a text, b text) returns int language plpgsql immutable as
$$ declare ma text[]; mb text[]; d int; begin
  ma := regexp_match(coalesce(a, ''), '^(\d{1,2})/(\d{1,2})/(\d{4})$'); mb := regexp_match(coalesce(b, ''), '^(\d{1,2})/(\d{1,2})/(\d{4})$');
  if ma is null or mb is null then return null; end if;
  d := make_date(mb[3]::int, mb[2]::int, mb[1]::int) - make_date(ma[3]::int, ma[2]::int, ma[1]::int);
  return case when d >= 0 then d else null end;
exception when others then return null; end $$;

create or replace function _st_mobile(v text) returns text language plpgsql immutable as
$$ declare t text := translate(coalesce(v, ''), '٠١٢٣٤٥٦٧٨٩', '0123456789'); begin
  t := regexp_replace(t, '[^\d+]', '', 'g'); t := regexp_replace(t, '^\+?00?966', '0'); t := regexp_replace(t, '^\+966', '0');
  if t ~ '^5\d{8}$' then t := '0' || t; end if; return t; end $$;

-- = _buildSupervisorsList_
create or replace function _st_suplist(d jsonb) returns jsonb language plpgsql immutable as
$$ declare lst jsonb := '[]'::jsonb; s jsonb; nm text; begin
  if jsonb_typeof(d -> 'supervisors') = 'array' and jsonb_array_length(d -> 'supervisors') > 0 then
    for s in select * from jsonb_array_elements(d -> 'supervisors') loop
      nm := btrim(coalesce(s ->> 'name', ''));
      if nm <> '' then lst := lst || jsonb_build_object('name', nm, 'role', coalesce(nullif(s ->> 'role', ''), 'مرافق'), 'mobile', _st_mobile(s ->> 'mobile')); end if;
    end loop;
    if jsonb_array_length(lst) > 0 then return lst; end if;
  end if;
  nm := btrim(coalesce(d ->> 'supervisor', ''));
  if nm <> '' then lst := lst || jsonb_build_object('name', nm, 'role', coalesce(nullif(d ->> 'supervisorRole', ''), 'مرافق'), 'mobile', _st_mobile(d ->> 'supervisorMobile')); end if;
  if jsonb_typeof(d -> 'supervisorsExtra') = 'array' then
    for s in select * from jsonb_array_elements(d -> 'supervisorsExtra') loop
      nm := btrim(coalesce(s ->> 'name', ''));
      if nm <> '' then lst := lst || jsonb_build_object('name', nm, 'role', coalesce(nullif(s ->> 'role', ''), 'مرافق'), 'mobile', _st_mobile(s ->> 'mobile')); end if;
    end loop;
  end if;
  return lst; end $$;

-- JSON.stringify([{name,role,mobile}])
create or replace function _st_supjson(l jsonb) returns text language sql immutable as
$$ select '[' || coalesce((select string_agg('{"name":' || to_json(x ->> 'name')::text || ',"role":' || to_json(coalesce(x ->> 'role', 'مرافق'))::text || ',"mobile":' || to_json(coalesce(x ->> 'mobile', ''))::text || '}', ',' order by o)
                           from jsonb_array_elements(l) with ordinality t(x, o)), '') || ']' $$;

-- = _supervisorsDisplay_(_parseSupervisorsRow_(row))
create or replace function _st_supdisplay(js text, nm text, role_ text) returns text language plpgsql immutable as
$$ declare arr jsonb; out_ text; begin
  begin arr := nullif(btrim(coalesce(js, '')), '')::jsonb; exception when others then arr := null; end;
  if jsonb_typeof(arr) = 'array' then
    select string_agg(n || case when r = 'استقبال فقط' then ' (استقبال)' else '' end || case when m <> '' then ' — ' || m else '' end, ' / ' order by o) into out_ from (
      select btrim(coalesce(x ->> 'name', '')) n, coalesce(nullif(x ->> 'role', ''), 'مرافق') r, btrim(coalesce(x ->> 'mobile', '')) m, o from jsonb_array_elements(arr) with ordinality t(x, o)) z where n <> '';
    if out_ is not null then return out_; end if;
  end if;
  if btrim(coalesce(nm, '')) = '' then return ''; end if;
  return btrim(nm) || case when coalesce(nullif(role_, ''), 'مرافق') = 'استقبال فقط' then ' (استقبال)' else '' end; end $$;

-- = _propagateTripChangesToBooking_
create or replace function _st_propagate(trip text) returns boolean language plpgsql volatile set search_path = public as
$$ declare
  th jsonb := _rx_hdr('trips'); tx jsonb := _rx_map('trips', _rx_h_trips()); bm jsonb := _rx_map('bookings', _bk_canon()); trid text; traw jsonb; link_ text; brid text; braw jsonb; bid text; i_bid int := (bm ->> 'رقم الإشعار')::int; i_btr int := (bm ->> 'اسم الرحلة')::int;
  pr text[][] := array[['الشركة المصرية','الشركة المصرية'],['الوكيل السعودي','الوكيل السعودي'],['رابط تذكرة الرحلة','رابط تذكرة الطيران'],['معرف تذكرة الرحلة','معرّف ملف التذكرة'],['منفذ الوصول','منفذ الوصول'],['منفذ المغادرة','منفذ المغادرة'],
    ['ساعة الوصول','ساعة الوصول'],['ساعة المغادرة','ساعة المغادرة'],['رقم رحلة الوصول','رقم رحلة الوصول'],['رقم رحلة المغادرة','رقم رحلة المغادرة'],['تاريخ الذهاب','تاريخ الوصول'],['تاريخ العودة','تاريخ المغادرة'],
    ['تاريخ دخول المدينة','دخول المدينة'],['تاريخ الخروج من المدينة','خروج المدينة'],['تاريخ دخول مكة','دخول مكة'],['تاريخ الخروج من مكة','خروج مكة'],['اتجاه الإقامة','اتجاه الإقامة']];
  np text[][] := array[['ليالي المدينة','عدد ليالي المدينة'],['ليالي مكة','عدد ليالي مكة']]; i int; v jsonb; sup text; mh jsonb; kh jsonb; hot text; extra jsonb;
begin
  select rid, raw into trid, traw from store_rows where tbl = 'trips' and _rx_trim(_rx_s(_rx_c(raw, (tx ->> 'اسم الرحلة')::int))) = trip order by ord, rid limit 1;
  if trid is null then return false; end if;
  link_ := _rx_trim(_rx_s(_rx_c(traw, (tx ->> 'رقم الإشعار المرتبط')::int)));
  perform pg_advisory_xact_lock(hashtextextended('store:put:bookings', 0));
  select rid, raw into brid, braw from store_rows where tbl = 'bookings' and i_bid is not null and (
      (link_ <> '' and btrim(_rx_s(_rx_c(raw, i_bid))) = link_) or (not (link_ <> '' and btrim(_rx_s(_rx_c(raw, i_bid))) = link_) and i_btr is not null and btrim(_rx_s(_rx_c(raw, i_btr))) = trip)) order by ord, rid limit 1;
  if brid is null then return false; end if;
  bid := btrim(_rx_s(_rx_c(braw, i_bid)));
  if link_ = '' and bid <> '' and (tx ->> 'رقم الإشعار المرتبط') is not null then
    update store_rows set raw = jsonb_set(raw, array[(tx ->> 'رقم الإشعار المرتبط')], to_jsonb(bid)) where tbl = 'trips' and rid = trid;
    update store_meta set ver = ver + 1, updated_at = now() where tbl = 'trips';
  end if;
  for i in 1 .. array_length(pr, 1) loop
    v := _rx_c(traw, (tx ->> pr[i][1])::int);
    if _gs_truthy(v) and (bm ->> pr[i][2]) is not null then braw := jsonb_set(braw, array[(bm ->> pr[i][2])], v); end if;
  end loop;
  for i in 1 .. array_length(np, 1) loop
    v := _rx_c(traw, (tx ->> np[i][1])::int);
    if v is not null and v <> '""'::jsonb and v <> 'null'::jsonb and (bm ->> np[i][2]) is not null then braw := jsonb_set(braw, array[(bm ->> np[i][2])], v); end if;
  end loop;
  sup := _st_supdisplay(_rx_s(_rx_c(traw, (tx ->> 'المشرفون (JSON)')::int)), _rx_s(_rx_c(traw, (tx ->> 'المشرف')::int)), _rx_s(_rx_c(traw, (tx ->> 'دور المشرف')::int)));
  if sup <> '' and (bm ->> 'المشرف') is not null then braw := jsonb_set(braw, array[(bm ->> 'المشرف')], to_jsonb(sup)); end if;
  -- الفنادق: الأساسي + الإضافية
  foreach hot in array array['المدينة', 'مكة'] loop
    begin extra := nullif(_rx_s(_rx_c(traw, (tx ->> ('فنادق إضافية - ' || hot || ' (JSON)'))::int)), '')::jsonb; exception when others then extra := null; end;
    sup := array_to_string(array(select h from (select _rx_s(_rx_c(traw, (tx ->> ('سكن ' || hot))::int)) h union all select _rx_s(e) from jsonb_array_elements(case when jsonb_typeof(extra) = 'array' then extra else '[]'::jsonb end) e) z where btrim(coalesce(h, '')) <> ''), ' / ');
    if sup <> '' and (bm ->> ('سكن ' || hot)) is not null then braw := jsonb_set(braw, array[(bm ->> ('سكن ' || hot))], to_jsonb(sup)); end if;
  end loop;
  update store_rows set raw = braw where tbl = 'bookings' and rid = brid;
  update store_meta set ver = ver + 1, updated_at = now() where tbl = 'bookings';
  return true; end $$;

create or replace function rw2_savetrip(a jsonb, u text) returns jsonb language plpgsql volatile set search_path = public as
$$ declare
  who text := coalesce(u, app_user(), '-'); td jsonb := case when jsonb_typeof(a -> 2) = 'object' then a -> 2 else '{}'::jsonb end; nm text := btrim(coalesce(td ->> 'name', '')); tr_ int := coalesce(_bk_pf(a -> 1), 0)::int; edit boolean := coalesce(_bk_pf(a -> 1), 0) > 0;
  tx jsonb := _rx_map('trips', _rx_h_trips()); w int := greatest(jsonb_array_length(_rx_hdr('trips')), (select max(v::int) + 1 from jsonb_each_text(_rx_map('trips', _rx_h_trips())) e(k, v)));
  trid text; traw jsonb; oldname text; mn int; kn int; r jsonb; sl jsonb; ph text; k text; nowj jsonb := jsonb_build_object('$d', (extract(epoch from clock_timestamp()) * 1000)::bigint);
  fields text[][] := array[['company','الشركة المصرية'],['agent','الوكيل السعودي'],['supervisor','المشرف'],['departDate','تاريخ الذهاب'],['returnDate','تاريخ العودة'],['airline','الخطوط'],['madinahHotel','سكن المدينة'],['madinahCheckIn','تاريخ دخول المدينة'],
    ['madinahCheckOut','تاريخ الخروج من المدينة'],['makkahHotel','سكن مكة'],['makkahCheckIn','تاريخ دخول مكة'],['makkahCheckOut','تاريخ الخروج من مكة'],['direction','اتجاه الإقامة'],['ticketUrl','رابط تذكرة الرحلة'],['ticketFileId','معرف تذكرة الرحلة']];
  itin text[][] := array[['arrivalPort','منفذ الوصول'],['departurePort','منفذ المغادرة'],['arrivalTime','ساعة الوصول'],['departureTime','ساعة المغادرة'],['arrivalFlight','رقم رحلة الوصول'],['departureFlight','رقم رحلة المغادرة'],['supervisorPhones','أرقام جوالات المشرف']];
  i int; v jsonb; before_ jsonb;
begin
  if nm = '' then raise exception 'اسم الرحلة مطلوب' using errcode = 'P0001'; end if;
  perform pg_advisory_xact_lock(hashtextextended('store:put:trips', 0));
  if edit then
    select rid, raw into trid, traw from store_rows where tbl = 'trips' order by ord, rid offset (tr_ - 2) limit 1;
    if trid is null then raise exception 'غير مدعوم: صف الرحلة غير موجود' using errcode = '0A000'; end if;
    oldname := _rx_trim(_rx_s(_rx_c(traw, (tx ->> 'اسم الرحلة')::int)));
    if oldname <> nm then raise exception 'غير مدعوم: إعادة تسمية رحلة (انتشار كامل)' using errcode = '0A000'; end if;
  end if;
  if exists (select 1 from store_rows where tbl = 'trips' and _rx_trim(_rx_s(_rx_c(raw, (tx ->> 'اسم الرحلة')::int))) = nm and (trid is null or rid <> trid)) then
    raise exception 'يوجد رحلة أخرى بنفس الاسم بالفعل: %', nm using errcode = 'P0001'; end if;
  if edit then before_ := _ts_state(nm); insert into app_outbox (kind, payload) values ('tripsnap', jsonb_build_object('trip', nm, 'user', who, 'action', 'خط الأساس (قبل أول تعديل مُلتقَط)', 'state', before_, 'base', true)); end if;
  if edit then r := traw; else select jsonb_agg('""'::jsonb) into r from generate_series(1, w); end if;
  r := _stp_set(r, tx, 'اسم الرحلة', to_jsonb(nm));
  for i in 1 .. array_length(fields, 1) loop r := _stp_set(r, tx, fields[i][2], _bk_or(td -> fields[i][1], '""'::jsonb)); end loop;
  mn := _st_diffdays(td ->> 'madinahCheckIn', td ->> 'madinahCheckOut'); kn := _st_diffdays(td ->> 'makkahCheckIn', td ->> 'makkahCheckOut');
  r := _stp_set(r, tx, 'ليالي المدينة', case when mn is null then '""'::jsonb else to_jsonb(mn) end);
  r := _stp_set(r, tx, 'ليالي مكة', case when kn is null then '""'::jsonb else to_jsonb(kn) end);
  r := _stp_set(r, tx, 'رقم الإشعار المرتبط', case when _gs_truthy(td -> 'linkedBookingId') then td -> 'linkedBookingId' when edit then to_jsonb(_rx_s(_rx_c(traw, (tx ->> 'رقم الإشعار المرتبط')::int))) else '""'::jsonb end);
  if not edit then r := _stp_set(r, tx, 'تاريخ الإنشاء', nowj); end if;
  r := _stp_set(r, tx, 'عدد الأماكن المحجوزة', case when td ? 'bookedSeats' and td -> 'bookedSeats' <> '""'::jsonb then to_jsonb(coalesce(_bk_pf(td -> 'bookedSeats'), 0)) else '""'::jsonb end);
  -- حقول خط السير: تُكتب فقط لو أُرسلت
  for i in 1 .. array_length(itin, 1) loop
    if td ? itin[i][1] then r := _stp_set(r, tx, itin[i][2], _bk_or(td -> itin[i][1], '""'::jsonb)); end if;
  end loop;
  -- المشرفون
  if td ? 'supervisors' or td ? 'supervisor' or td ? 'supervisorRole' then
    sl := _st_suplist(td);
    r := _stp_set(r, tx, 'المشرفون (JSON)', to_jsonb(_st_supjson(sl)));
    if not (td ? 'supervisorPhones') then
      select string_agg(m, ' / ' order by o) into ph from (select btrim(coalesce(x ->> 'mobile', '')) m, o from jsonb_array_elements(sl) with ordinality t(x, o)) z where m <> '';
      if coalesce(ph, '') <> '' then r := _stp_set(r, tx, 'أرقام جوالات المشرف', to_jsonb(ph)); end if;
    end if;
    if jsonb_array_length(sl) > 0 then
      r := _stp_set(r, tx, 'المشرف', to_jsonb(sl -> 0 ->> 'name')); r := _stp_set(r, tx, 'دور المشرف', to_jsonb(sl -> 0 ->> 'role'));
    else r := _stp_set(r, tx, 'دور المشرف', to_jsonb(coalesce(nullif(td ->> 'supervisorRole', ''), 'مرافق'))); end if;
  end if;
  if edit then update store_rows set raw = r where tbl = 'trips' and rid = trid;
  else insert into store_rows (tbl, rid, ord, raw) select 'trips', substr(md5(random()::text || clock_timestamp()::text), 1, 20), coalesce(max(ord), 0) + 1, r from store_rows where tbl = 'trips'; end if;
  update store_meta set ver = ver + 1, updated_at = now() where tbl = 'trips';
  perform _st_propagate(nm);
  perform _stp_aud(who, jsonb_build_array(jsonb_build_object('action', case when edit then 'تعديل رحلة' else 'إنشاء رحلة' end, 'recordId', nm, 'field', case when edit then 'بيانات الرحلة' else 'رحلة جديدة' end,
    'oldVal', case when edit then oldname else '-' end, 'newVal', nm)), 'trips', 'الرحلات');
  insert into app_outbox (kind, payload) values ('tripsnap', jsonb_build_object('trip', nm, 'user', who, 'action', case when edit then 'تعديل بيانات الرحلة' else 'إنشاء الرحلة' end, 'state', _ts_state(nm)));
  perform _w_dv_bump(array['trips', 'bookings']);
  return jsonb_build_object('success', true, 'madinahNights', mn, 'makkahNights', kn); end $$;

do $$ declare r record; begin
  for r in select p.oid::regprocedure::text sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and (p.proname like '\_st\_%' or p.proname = 'rw2_savetrip') loop
    execute format('revoke all on function %s from public, anon, authenticated', r.sig); execute format('grant execute on function %s to service_role', r.sig); end loop; end $$;

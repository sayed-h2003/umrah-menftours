-- V4.434: (1) بند «تأشيرات» يظهر دائماً بنمط «بنود»: بعدد المجموعات المطابقة، أو بلا عدد (غير محدَّد) حين لا تطابق أي مجموعة — كان يختفي كلياً (سلوك قديم منذ V4.203 بـApps Script أيضاً)
--          البند بلا عدد لا يُحدَّد تلقائياً للإدراج. (2) ae_mf_check: ملفات الوزارة المرتبطة برحلة (للتشخيص — service_role فقط)
create or replace function _ae_bonds(client text, trip text, ad int, ch int, inf int, tot int, company text, depart text, sups int, names text[], excl boolean, cfg jsonb, visa_pils jsonb) returns jsonb
language plpgsql stable set search_path = public as
$$ declare cp jsonb := _ae_json_row('acc_client_prices', client); items jsonb := '[]'::jsonb; hz jsonb := _ae_housing(client, trip); mf jsonb := _ae_mf_fees(client, trip); vz jsonb := _ae_vz_groups(client, trip);
  hc jsonb := _ae_hb_city_actual(client, trip); here jsonb := _ae_hb_here(client, trip); k text; a jsonb; v float8; vp jsonb; route text; tkd text; stay text; act jsonb; ck text; roomfee float8 := _w_roomfee_at(depart, cfg);
  base text[] := array['رسوم غرفة','رسوم غرفة المشرف','رسوم غرفة VIP','تجديد باركود','تأشيرة وباركود','إشراف','تذاكر','تذاكر الأطفال','تذاكر الرضع','تأشيرات','نقل سعودي','سكن المدينة','سكن مكة','بدلات المشرف','تأشيرة المشرف','شركة','ضرائب','رسوم التنفيذ','الإعاشة'];
  supfee float8 := coalesce(nullif(_ae_num(cfg -> 'supRoomFee'), 0), 200); city_key text; ent record;
begin
  if mf ->> 'any' = 'true' then
    foreach k in array array['رسوم غرفة', 'رسوم غرفة VIP', 'رسوم غرفة المشرف', 'تجديد باركود'] loop
      a := mf -> 'agg' -> k; if a is null or (a ->> 'count')::float8 = 0 then continue; end if;
      items := items || _ae_item(k || case when jsonb_array_length(a -> 'refs') > 0 then ' — ملف ' || (select string_agg(x, '،' || ' ' order by o) from jsonb_array_elements_text(a -> 'refs') with ordinality t(x, o)) else '' end,
        case when k = 'رسوم غرفة المشرف' then 'مشرف' else 'كبير' end, 'EGP', (a ->> 'count')::float8, coalesce(_ae_price_at(cp, k, depart), (a ->> 'cost')::float8, 0), 0, company, '', false);
    end loop;
  else
    items := items || _ae_item('رسوم غرفة', 'كبير', 'EGP', ad + ch, coalesce(_ae_price_at(cp, 'رسوم غرفة', depart), roomfee, 0), 0, company, '', false)
                   || _ae_item('رسوم غرفة المشرف', 'مشرف', 'EGP', case when excl then sups else 1 end, coalesce(_ae_price_at(cp, 'رسوم غرفة المشرف', depart), supfee), 0, company, '', false);
  end if;
  items := items || _ae_item('إشراف', 'كبير', 'EGP', ad + ch, coalesce(_ae_price_at(cp, 'إشراف', depart), 0), 0, '', '', false);
  route := (hz ->> 'arrRoute') || case when (hz ->> 'depRoute') <> '' then ' - ' || (hz ->> 'depRoute') else '' end;
  tkd := case when route <> '' then 'تذاكر ' || case when (hz ->> 'airline') <> '' then (hz ->> 'airline') || ' ' else '' end || route else 'تذاكر طيران' end;
  if ad > 0 then items := items || _ae_item(tkd, 'كبير', 'EGP', ad, coalesce(_ae_price_at(cp, 'تذاكر', depart), 0), 0, '', '', false); end if;
  if ch > 0 then items := items || _ae_item('تذاكر الأطفال', 'طفل بسرير', 'EGP', ch, coalesce(_ae_price_at(cp, 'تذاكر الأطفال', depart), 0), 0, '', '', false); end if;
  if inf > 0 then items := items || _ae_item('تذاكر الرضع', 'رضيع', 'EGP', inf, coalesce(_ae_price_at(cp, 'تذاكر الرضع', depart), 0), 0, '', '', false); end if;
  if (vz ->> 'count')::float8 > 0 then items := items || _ae_item(vz ->> 'desc', 'كبير', 'SAR', (vz ->> 'count')::float8, coalesce(_ae_price_at(cp, 'تأشيرات', depart), 0), 0, '', '', false);
  else items := items || _ae_item('تأشيرات', 'كبير', 'SAR', 0, coalesce(_ae_price_at(cp, 'تأشيرات', depart), 0), 0, '', '', false);   -- (V4.434) البند يظهر دائماً (بلا عدد) حين لا توجد مجموعة «تم إصدار الموفا» مطابقة لاسم العميل×الرحلة
  end if;
  for vp in select * from jsonb_array_elements(visa_pils) loop
    items := items || _ae_item('تأشيرة ' || (vp ->> 'name') || ' (' || (vp ->> 'notes') || ')', 'كبير', 'SAR', 1, 0, 0, '', '', false);
  end loop;
  items := items || _ae_item('تأشيرة وباركود', 'كبير', 'EGP', tot, coalesce(_ae_price_at(cp, 'تأشيرة وباركود', depart), 0), 0, '', '', false);
  if excl then items := items || _ae_item('تأشيرة المشرف', 'مشرف', 'SAR', sups, coalesce(_ae_price_at(cp, 'تأشيرة المشرف', depart), 0), 0, '', array_to_string(names, '، '), false); end if;
  items := items || _ae_item('نقل سعودي', 'أخرى', 'SAR', 1, coalesce(_ae_price_at(cp, 'نقل سعودي', depart), 0), 0, '', '', false);
  -- السكن: حجز فعلي من نسخة الحجوزات إن وُجد (وإلا تقدير الإشعار/الرحلة)
  for ent in select * from (values ('سكن المدينة', 'المدينة', 'mad', 1), ('سكن مكة', 'مكة', 'mak', 2)) q(key_, city_, p, o) order by o loop
    act := hc -> ent.city_;
    if here ? ent.city_ or (act is not null and coalesce((act ->> 'value')::float8, 0) <> 0 and _ae_hb_posted_all(act -> 'keys')) then continue; end if;
    if act is not null and coalesce((act ->> 'value')::float8, 0) <> 0 then
      items := items || _ae_item(ent.key_, 'أخرى', 'SAR', 1, (act ->> 'value')::float8, 0, (select string_agg(x, ' + ' order by o2) from jsonb_array_elements_text(act -> 'hotels') with ordinality t(x, o2)) || _ae_stay(act ->> 'ci', act ->> 'co'), '', true);
    else
      stay := case when (hz ->> (ent.p || 'Hotel')) <> '' then (hz ->> (ent.p || 'Hotel')) || _ae_stay(hz ->> (ent.p || 'CheckIn'), hz ->> (ent.p || 'CheckOut')) else '' end;
      items := items || _ae_item(ent.key_, 'أخرى', 'SAR', (hz ->> (ent.p || 'Rooms'))::float8, coalesce(_ae_price_at(cp, ent.key_, depart), 0), (hz ->> (ent.p || 'Nights'))::float8, stay, '', false);
    end if;
  end loop;
  items := items || _ae_item('بدلات المشرف', 'مشرف', 'SAR', 1, coalesce(_ae_price_at(cp, 'بدلات المشرف', depart), 0), 0, '', '', false)
                 || _ae_item('شركة', 'كبير', 'EGP', tot, coalesce(_ae_price_at(cp, 'شركة', depart), 0), 0, '', '', false)
                 || _ae_item('ضرائب', 'كبير', 'EGP', tot, coalesce(_ae_price_at(cp, 'ضرائب', depart), 0), 0, '', '', false)
                 || _ae_item('الإعاشة', 'كبير', 'SAR', tot, coalesce(_ae_price_at(cp, 'الإعاشة', depart), 0), 0, '', '', false);
  -- بنود مخصصة مسعّرة للعميل (خارج الأساسية) سارية بتاريخ الرحلة — بعدد 1 (ترتيبها حسب مفتاح JSON لا ترتيب الإدخال)
  if cp is not null and jsonb_typeof(cp -> 'items') = 'object' then
    for k in select jk from jsonb_object_keys(cp -> 'items') jk loop
      if k = any (base) then continue; end if;
      v := _ae_price_at(cp, k, depart); if v is null then continue; end if;
      items := items || _ae_item(k, 'أخرى', case when cp -> 'items' -> k ->> 'currency' = 'SAR' then 'SAR' else 'EGP' end, 1, v, 0, '', '', false);
    end loop;
  end if;
  return items; end $$;

create or replace function rx2_accgeneratedraft(a jsonb, u text) returns jsonb language plpgsql stable set search_path = public as
$$ declare
  client text := _rx_trim(translate(coalesce(a ->> 1, ''), '٠١٢٣٤٥٦٧٨٩', '0123456789')); trip text := _rx_trim(translate(coalesce(a ->> 2, ''), '٠١٢٣٤٥٦٧٨٩', '0123456789')); mode_ text := coalesce(a ->> 3, '');
  ix jsonb := _pm_ix(); i_tr int := (ix ->> 'tripName')::int; i_cl int := (ix ->> 'client')::int; i_nm int := (ix ->> 'name')::int; i_ty int := (ix ->> 'type')::int; i_nt int := (_rx_map('pilgrims', _rx_h_pil()) ->> 'ملاحظات')::int;
  ad int := 0; ch int := 0; inf int := 0; tot int := 0; r record; ty text; cfg jsonb; tp jsonb; br jsonb; g jsonb; items jsonb := '[]'; sups int := 0; names text[] := '{}'; mine int := 0; other boolean := false; cl text; nm text; nt text; discn int := 0;
  company text; tx jsonb := _rx_map('trips', _rx_h_trips()); have jsonb := '{}'; tomb jsonb := '{}'; k text; it jsonb; excl boolean; vp record; sup_fee float8;
  push_ jsonb; dep text := ''; vpils jsonb := '[]'::jsonb;
begin
  if not app_has('accounts.add') then raise exception 'لا تملك صلاحية إضافة حسابات العملاء' using errcode = '42501'; end if;
  for r in select raw from store_rows where tbl = 'pilgrims' order by ord, rid loop
    if _rx_trim(_rx_s(_rx_c(r.raw, i_cl))) <> client or _rx_trim(_rx_s(_rx_c(r.raw, i_tr))) <> trip or _rx_trim(_rx_s(_rx_c(r.raw, i_nm))) = '' then continue; end if;
    ty := _rx_trim(_rx_s(_rx_c(r.raw, i_ty)));
    if ty = 'طفل' then ch := ch + 1; elsif ty = 'رضيع' then inf := inf + 1; else ad := ad + 1; end if; tot := tot + 1;
  end loop;
  if tot = 0 then return jsonb_build_object('success', false, 'error', 'لا يوجد معتمرون مسجَّلون لهذا العميل في هذه الرحلة'); end if;
  cfg := _sx_acc_pricing(); sup_fee := coalesce(nullif(_ae_num(cfg -> 'supRoomFee'), 0), 200);
  select _rx_trim(_rx_s(_rx_c(raw, (tx ->> 'الشركة المصرية')::int))) into company from store_rows where tbl = 'trips' and _rx_trim(_rx_s(_rx_c(raw, (tx ->> 'اسم الرحلة')::int))) = trip order by ord, rid limit 1;
  company := coalesce(company, '');
  if mode_ <> 'بنود' then tp := _ae_trip_pricing(trip); br := _ae_breakdown(client, trip); end if;
  -- مشرفو الرحلة (= _accTripSupsForClient_)
  for r in select raw from store_rows where tbl = 'pilgrims' order by ord, rid loop
    if _rx_trim(_rx_s(_rx_c(r.raw, i_tr))) <> trip then continue; end if;
    cl := _rx_trim(_rx_s(_rx_c(r.raw, i_cl))); nm := _rx_trim(_rx_s(_rx_c(r.raw, i_nm)));
    if cl = 'مشرف' or position('المشرف' in cl) = 1 then if nm <> '' then sups := sups + 1; names := names || nm; end if; continue; end if;
    if cl = client then mine := mine + 1; elsif cl <> '' then other := true; end if;
  end loop;
  excl := sups > 0 and mine > 0 and not other;
  if mode_ = 'بنود' then
    select _ae_dfmt(_rx_c(t.raw, (tx ->> 'تاريخ الذهاب')::int)) into dep from _rx_rows('trips') t where _rx_trim(_rx_s(_rx_c(t.raw, (tx ->> 'اسم الرحلة')::int))) = trip order by t.rn limit 1;
    dep := coalesce(dep, '');
    select coalesce(jsonb_agg(jsonb_build_object('name', _rx_trim(_rx_s(_rx_c(p.raw, i_nm))), 'notes', _rx_trim(_rx_s(_rx_c(p.raw, i_nt)))) order by p.rn), '[]'::jsonb) into vpils
      from _rx_rows('pilgrims') p where _rx_trim(_rx_s(_rx_c(p.raw, i_cl))) = client and _rx_trim(_rx_s(_rx_c(p.raw, i_tr))) = trip and _rx_trim(_rx_s(_rx_c(p.raw, i_nt))) <> '' and _ae_normar(_rx_trim(_rx_s(_rx_c(p.raw, i_nt)))) ~ 'تاشير|فيزا|visa';
    items := _ae_bonds(client, trip, ad, ch, inf, tot, company, dep, sups, names, excl, cfg, vpils);
  else
  -- أسطر البرنامج
  if jsonb_array_length(br) > 0 then
    for g in select * from jsonb_array_elements(br) loop
      items := items || jsonb_build_object('desc', g ->> 'desc', 'cat', g ->> 'cat', 'currency', 'EGP', 'count', (g ->> 'count')::int, 'price', coalesce(_ae_price_for(tp, g), 0), 'nights', 0, 'company', '', 'notes', '', 'isDirect', false);
      discn := discn + (g ->> 'count')::int;
    end loop;
  else
    if ad > 0 then items := items || jsonb_build_object('desc', 'برنامج الرحلة - كبار', 'cat', 'كبير', 'currency', 'EGP', 'count', ad, 'price', 0, 'nights', 0, 'company', '', 'notes', '', 'isDirect', false); end if;
    if ch > 0 then items := items || jsonb_build_object('desc', 'برنامج الرحلة - أطفال', 'cat', 'طفل بسرير', 'currency', 'EGP', 'count', ch, 'price', 0, 'nights', 0, 'company', '', 'notes', '', 'isDirect', false); end if;
    if inf > 0 then items := items || jsonb_build_object('desc', 'برنامج الرحلة - رضع', 'cat', 'رضيع', 'currency', 'EGP', 'count', inf, 'price', 0, 'nights', 0, 'company', '', 'notes', '', 'isDirect', false); end if;
  end if;
  if discn = 0 then discn := tot; end if;
  if discn > 0 then items := items || jsonb_build_object('desc', 'خصم', 'cat', 'خصم', 'currency', 'EGP', 'count', discn, 'price', 0, 'nights', 0, 'company', '', 'notes', '', 'isDirect', false); end if;
  -- خصم تأشيرة لمن ملاحظته تذكر تأشيرة/فيزا
  for r in select raw from store_rows where tbl = 'pilgrims' order by ord, rid loop
    if _rx_trim(_rx_s(_rx_c(r.raw, i_cl))) <> client or _rx_trim(_rx_s(_rx_c(r.raw, i_tr))) <> trip then continue; end if;
    nt := _rx_trim(_rx_s(_rx_c(r.raw, i_nt)));
    if nt <> '' and _ae_normar(nt) ~ 'تاشير|فيزا|visa' then
      items := items || jsonb_build_object('desc', 'خصم تأشيرة - ' || _rx_trim(_rx_s(_rx_c(r.raw, i_nm))) || ' (' || nt || ')', 'cat', 'خصم', 'currency', 'EGP', 'count', 1, 'price', 0, 'nights', 0, 'company', '', 'notes', '', 'isDirect', false); end if;
  end loop;
  if excl then
    items := items || jsonb_build_object('desc', 'رسوم غرفة المشرف', 'cat', 'مشرف', 'currency', 'EGP', 'count', sups, 'price', sup_fee, 'nights', 0, 'company', company, 'notes', array_to_string(names, '، '), 'isDirect', false)
                   || jsonb_build_object('desc', 'تأشيرة المشرف', 'cat', 'مشرف', 'currency', 'SAR', 'count', sups, 'price', 0, 'nights', 0, 'company', '', 'notes', array_to_string(names, '، '), 'isDirect', false);
  end if;
  end if;
  -- وسم كل بند: exists / removed / sel
  select coalesce(jsonb_object_agg(_acc_bond_key(_rx_s(_rx_c(raw, 3))), 1), '{}'::jsonb) into have from store_rows where tbl = 'acc_items' and _rx_trim(_rx_s(_rx_c(raw, 1))) = client and _rx_trim(_rx_s(_rx_c(raw, 2))) = trip;
  select coalesce(jsonb_object_agg(_rx_trim(_rx_s(_rx_c(raw, 2))), 1), '{}'::jsonb) into tomb from store_rows where tbl = 'acc_removed' and _rx_trim(_rx_s(_rx_c(raw, 0))) = client and _rx_trim(_rx_s(_rx_c(raw, 1))) = trip and _rx_trim(_rx_s(_rx_c(raw, 2))) <> '';
  select coalesce(jsonb_agg(x || jsonb_build_object('exists', have ? _acc_bond_key(x ->> 'desc'), 'removed', tomb ? _acc_bond_key(x ->> 'desc'), 'sel', not (have ? _acc_bond_key(x ->> 'desc')) and not (tomb ? _acc_bond_key(x ->> 'desc')) and (mode_ <> 'بنود' or (coalesce((x ->> 'price')::float8, 0) > 0 and coalesce((x ->> 'count')::float8, 0) > 0))) order by o), '[]'::jsonb) into items
    from jsonb_array_elements(items) with ordinality t(x, o);
  return jsonb_build_object('success', true, 'items', items, 'counts', jsonb_build_object('a', ad, 'c', ch, 'i', inf, 't', tot)); end $$;

create or replace function ae_mf_check(p_trip text) returns jsonb language plpgsql stable security definer set search_path = public as
$$ declare core jsonb := _mf_all(_sx_exec_policy(), _sx_acc_pricing(), _mf_today()); known jsonb := _mf_trip_names(); f jsonb; out_ jsonb := '[]'::jsonb; begin
  for f in select * from jsonb_array_elements(coalesce(core -> 'files', '[]'::jsonb)) loop
    if not (p_trip = any (_mf_trips_of(f ->> 'tripName', f ->> 'extraTrips', known))) then continue; end if;
    out_ := out_ || jsonb_build_array(jsonb_build_object('fileNo', f -> 'fileNo', 'reviewDate', f -> 'reviewDate', 'reviewType', f -> 'reviewType', 'roomFee', f -> 'calc' -> 'roomFeeEffective',
      'names', (select coalesce(jsonb_agg(b -> 'name'), '[]'::jsonb) from jsonb_array_elements(case when jsonb_typeof(f -> 'breakdown') = 'array' then f -> 'breakdown' else '[]'::jsonb end) b where jsonb_typeof(b) = 'object')));
  end loop;
  return out_; end $$;
revoke all on function ae_mf_check(text) from public, anon, authenticated;
grant execute on function ae_mf_check(text) to service_role;

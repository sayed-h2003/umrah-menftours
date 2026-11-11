-- V4.444 · الدفعة 1 (مجال الوكلاء والنقل كاملاً) ⇒ Postgres. منطق كل دالة = نظيرتها بـ Code.gs.
-- بنود ودفعات حساب الوكيل (حفظ/لصق/حذف/جماعي/ترحيل اتفاقية) · أسعار الوكلاء (تأشيرات/نقل) وتطبيقها جماعياً · حسابات الشركات للوكلاء
-- · كشف النقل السعودي (القراءة/التعديل/الحذف/الأزواج) · إحصاء التأشيرات لكل حساب · الوكيل حسب الشركة · سجل السطر.
-- (getAgentAccountExtras = مراجع القيود والسندات من الحسابات العامة ⇒ تنتقل مع الدفعة 2.)
-- يتطلب: 011 · 028 · 067 · 068.

create or replace function _vz_fin() returns void language plpgsql stable as
$$ begin if not app_has('visas.finance') then raise exception 'لا تملك صلاحية الجانب المالي في متابعة التأشيرات والوكلاء' using errcode = '42501'; end if; end $$;
create or replace function _vz_in_acct(p_agent text, p_company text, p_key text, am jsonb) returns boolean language sql immutable as
$$ select _mf_strt(p_agent) <> '' and (_mf_strt(p_agent) = p_key or _vz_key_calc(p_agent, p_company, am) = p_key) $$;
create or replace function _vz_gl_src(notes text) returns text language sql immutable as $$ select coalesce((regexp_match(coalesce(notes, ''), '⟦src:gl-([^⟧]+)⟧'))[1], '') $$;
create or replace function _vz_gl_msg(eid text) returns text language sql immutable as
$$ select 'هذا السطر منسوخ تلقائياً من القيد ' || eid || ' بالحسابات العامة — عدّله أو ألغِه من القيد نفسه وسيتحدّث هنا تلقائياً' $$;

-- ===== كشف النقل السعودي (= _taReadRowsRaw_ + _taOverrides_) =====
create or replace function _ta_ovr() returns jsonb language sql stable set search_path = public as
$$ select coalesce(jsonb_object_agg(id, o), '{}'::jsonb) from (select distinct on (id) id, jsonb_build_object('id', id, 'supplier', _mf_str(_rx_c(raw, 1)), 'desc', _mf_str(_rx_c(raw, 2)),
     'notes', _mf_str(_rx_c(raw, 3)), 'entryNo', _mf_str(_rx_c(raw, 6))) o from (select rn, raw, _mf_str(_rx_c(raw, 0)) id from _rx_rows('transport_overrides')) z where id <> '' order by id, rn desc) y $$;
create or replace function _ta_rows() returns jsonb language plpgsql stable set search_path = public as
$$ declare bm jsonb := _rx_map('bookings', _bk_canon()); ovr jsonb := _ta_ovr(); tp jsonb := _vz_prices('vz_transport_prices'); r record; out_ jsonb := '[]'::jsonb;
  tc text; sup text; bp float8; ov float8; pdef boolean; arr text; gn text; ds text; seg jsonb; s jsonb; bid text; o jsonb; cm boolean;
  g text := 'شركة النقل الداخلي'; begin
  for r in select raw from _rx_rows('bookings') order by rn loop
    tc := _rx_trim(_rx_s(_rx_c(r.raw, (bm ->> g)::int))); if tc = '' then continue; end if;
    cm := tc = 'النقل بمعرفة العميل';
    sup := case when tc = 'الوكيل' then _rx_s(_rx_c(r.raw, (bm ->> 'الوكيل السعودي')::int)) when not cm then tc else '' end;
    bp := coalesce(_mf_pf(_rx_s(_rx_c(r.raw, (bm ->> 'سعر الباص')::int))), 0); ov := coalesce(_mf_pf(_rx_s(_rx_c(r.raw, (bm ->> 'قيمة التشغيلة')::int))), 0);
    arr := _ae_dfmt(_rx_c(r.raw, (bm ->> 'تاريخ الوصول')::int)); pdef := false;
    if bp = 0 and tc = 'الوكيل' and sup <> '' then
      bp := coalesce(_vz_price_at(sup, arr, tp), 0); pdef := bp <> 0;
      if pdef and ov = 0 then ov := bp * coalesce(_mf_pf(_rx_s(_rx_c(r.raw, (bm ->> 'عدد الباصات')::int))), 0); end if;
    end if;
    gn := _rx_trim(_rx_s(_rx_c(r.raw, (bm ->> 'اسم المجموعة')::int)));
    ds := case when gn <> '' then gn || ' + ' else '' end || 'دورة نقل ' || coalesce(nullif(_ta_port(_rx_s(_rx_c(r.raw, (bm ->> 'منفذ الوصول')::int)), true), ''), '؟') || ' - ' ||
          coalesce(nullif(_ta_port(_rx_s(_rx_c(r.raw, (bm ->> 'منفذ المغادرة')::int)), false), ''), '؟');
    seg := _rx_json(coalesce(nullif(_rx_s(_rx_c(r.raw, (bm ->> 'مقاطع نقل إضافية')::int)), ''), '[]'));
    if jsonb_typeof(seg) = 'array' then
      for s in select * from jsonb_array_elements(seg) loop
        if _w_str(s -> 'desc') <> '' then ds := ds || ' + ' || _w_str(s -> 'desc'); end if;
        ov := ov + coalesce(_mf_pf(s ->> 'value'), 0);
      end loop;
    end if;
    bid := _rx_s(_rx_c(r.raw, (bm ->> 'رقم الإشعار')::int)); o := ovr -> bid;
    if o is not null then if _w_str(o -> 'supplier') <> '' then sup := o ->> 'supplier'; end if; if _w_str(o -> 'desc') <> '' then ds := o ->> 'desc'; end if; end if;
    out_ := out_ || jsonb_build_array(jsonb_build_object('edited', o is not null, 'editNotes', coalesce(o ->> 'notes', ''), 'entryNo', coalesce(o ->> 'entryNo', ''), 'id', bid,
      'operationNo', _rx_s(_rx_c(r.raw, (bm ->> 'رقم التشغيلة')::int)), 'client', _rx_s(_rx_c(r.raw, (bm ->> 'العميل')::int)), 'company', _rx_s(_rx_c(r.raw, (bm ->> 'الشركة المصرية')::int)),
      'agent', _rx_s(_rx_c(r.raw, (bm ->> 'الوكيل السعودي')::int)), 'arrivalDate', arr, 'departureDate', _ae_dfmt(_rx_c(r.raw, (bm ->> 'تاريخ المغادرة')::int)),
      'transportCompany', tc, 'isClientManaged', cm, 'supplier', sup, 'desc', ds, 'busCount', _rx_c(r.raw, (bm ->> 'عدد الباصات')::int), 'busPrice', bp, 'priceIsDefault', pdef,
      'operationValue', ov, 'tripName', _rx_s(_rx_c(r.raw, (bm ->> 'اسم الرحلة')::int))));
  end loop;
  return out_; end $$;
create or replace function rx2_gettransportaccountsdata(a jsonb, u text) returns jsonb language plpgsql stable set search_path = public as
$$ begin perform _x_perm('transport.view', 'هذه الشاشة متاحة فقط لمستخدم بصلاحية حسابات النقل أو admin'); return _ta_rows(); end $$;
create or replace function rx2_gettransportagentcompanypairs(a jsonb, u text) returns jsonb language plpgsql stable set search_path = public as
$$ begin perform _vz_fin();
  return jsonb_build_object('success', true, 'pairs', coalesce((select jsonb_agg(jsonb_build_object('agent', s, 'company', c) order by f) from (
    select x ->> 'supplier' s, x ->> 'company' c, min(o) f from jsonb_array_elements(_ta_rows()) with ordinality t(x, o) where coalesce(x ->> 'supplier', '') <> '' and coalesce(x ->> 'company', '') <> '' group by 1, 2) z), '[]'::jsonb)); end $$;
create or replace function rw2_savetransportrowedit(a jsonb, u text) returns jsonb language plpgsql volatile set search_path = public as
$$ declare d jsonb := coalesce(a -> 1, '{}'::jsonb); who text := coalesce(u, app_user(), '-'); id_ text := _w_str(d -> 'id'); old jsonb; rid_ text; row_ jsonb; bm jsonb := _rx_map('bookings', _bk_canon());
  brid text; braw jsonb; np float8; op text; pc text := ''; ip int; iv int; ic int; begin
  perform _x_perm('transport.view', 'هذه الشاشة متاحة فقط لمستخدم بصلاحية حسابات النقل أو admin');
  if id_ = '' then return jsonb_build_object('success', false, 'error', 'رقم الإشعار مطلوب'); end if;
  perform _x_lock('transport_overrides');
  old := coalesce(_ta_ovr() -> id_, '{}'::jsonb);
  row_ := jsonb_build_array(id_, case when d ? 'supplier' then _w_str(d -> 'supplier') else coalesce(old ->> 'supplier', '') end,
    case when d ? 'desc' then _w_str(d -> 'desc') else coalesce(old ->> 'desc', '') end, case when d ? 'notes' then _w_str(d -> 'notes') else coalesce(old ->> 'notes', '') end,
    who, _w_stamp(), case when d ? 'entryNo' then _w_str(d -> 'entryNo') else coalesce(old ->> 'entryNo', '') end);
  select rid into rid_ from store_rows where tbl = 'transport_overrides' and _mf_str(_rx_c(raw, 0)) = id_ order by ord desc limit 1;
  if rid_ is not null then update store_rows set raw = row_ where tbl = 'transport_overrides' and rid = rid_; else perform _x_append('transport_overrides', row_); end if;
  perform _x_bump('transport_overrides');
  if d ? 'busPrice' and coalesce(d ->> 'busPrice', '') <> '' then
    ip := (bm ->> 'سعر الباص')::int; iv := (bm ->> 'قيمة التشغيلة')::int; ic := (bm ->> 'عدد الباصات')::int;
    perform _x_lock('bookings');
    select rid, raw into brid, braw from store_rows where tbl = 'bookings' and _rx_trim(_rx_s(_rx_c(raw, (bm ->> 'رقم الإشعار')::int))) = id_ order by ord limit 1;
    if brid is not null and ip is not null then
      np := coalesce(_ac_num(d -> 'busPrice'), 0); op := coalesce(_rx_s(_rx_c(braw, ip)), '');
      braw := jsonb_set(_x_pad(braw, greatest(ip, coalesce(iv, 0)) + 1), array[ip::text], to_jsonb(np));
      if iv is not null and ic is not null then braw := jsonb_set(braw, array[iv::text], to_jsonb(coalesce(_ac_num(_rx_c(braw, ic)), 0) * np)); end if;
      update store_rows set raw = braw where tbl = 'bookings' and rid = brid;
      perform _x_bump('bookings'); pc := op || ' ← ' || _mf_n2t(np);
    end if;
  end if;
  perform _w_dv_bump(array['visa', 'bookings']);
  perform _x_aud(who, 'تعديل صف كشف النقل السعودي', 'إشعار ' || id_, 'مورد/بيان/سعر', coalesce(nullif(pc, ''), '-'), _w_str(d -> 'supplier') || ' — ' || _w_str(d -> 'desc'));
  return jsonb_build_object('success', true); end $$;
create or replace function rw2_deletetransportrowedit(a jsonb, u text) returns jsonb language plpgsql volatile set search_path = public as
$$ begin
  perform _x_perm('transport.view', 'هذه الشاشة متاحة فقط لمستخدم بصلاحية حسابات النقل أو admin');
  perform _x_lock('transport_overrides');
  delete from store_rows where tbl = 'transport_overrides' and _mf_str(_rx_c(raw, 0)) = _w_str(a -> 1);
  if found then perform _x_bump('transport_overrides'); perform _w_dv_bump(array['visa']); end if;
  return jsonb_build_object('success', true); end $$;
create or replace function rw2_applytransportpricetoruns(a jsonb, u text) returns jsonb language plpgsql volatile set search_path = public as
$$ declare who text := coalesce(u, app_user(), '-'); ag text := _w_str(a -> 1); pr float8 := coalesce(_mf_num(a -> 2), 0); fm float8 := _mf_ms(_mf_datet(a ->> 3)); tm_ float8 := _mf_ms(_mf_datet(a ->> 4));
  am jsonb := _vz_am(); tg text[]; bm jsonb := _rx_map('bookings', _bk_canon()); ip int; iv int; ic int; n int := 0; begin
  perform _vz_fin();
  if ag = '' then return jsonb_build_object('success', false, 'error', 'اسم الوكيل مطلوب'); end if;
  if pr = 0 then return jsonb_build_object('success', false, 'error', 'السعر مطلوب'); end if;
  select coalesce(array_agg(x ->> 'id'), '{}') into tg from jsonb_array_elements(_ta_rows()) x
   where coalesce(_ac_num(x -> 'busPrice'), 0) = 0 and _vz_in_acct(x ->> 'supplier', x ->> 'company', ag, am)
     and _mf_ms(x ->> 'arrivalDate') is not null and _mf_ms(x ->> 'arrivalDate') >= coalesce(fm, -8.64e15) and _mf_ms(x ->> 'arrivalDate') <= coalesce(tm_, 8.64e15);
  if coalesce(array_length(tg, 1), 0) = 0 then return jsonb_build_object('success', true, 'count', 0); end if;
  ip := (bm ->> 'سعر الباص')::int; iv := (bm ->> 'قيمة التشغيلة')::int; ic := (bm ->> 'عدد الباصات')::int;
  if ip is null then return jsonb_build_object('success', false, 'error', 'أعمدة السعر غير موجودة بشيت الإشعارات'); end if;
  perform _x_lock('bookings');
  update store_rows set raw = case when iv is not null and ic is not null
        then jsonb_set(jsonb_set(_x_pad(raw, greatest(ip, iv) + 1), array[ip::text], to_jsonb(pr)), array[iv::text], to_jsonb(coalesce(_ac_num(_rx_c(raw, ic)), 0) * pr))
        else jsonb_set(_x_pad(raw, ip + 1), array[ip::text], to_jsonb(pr)) end
   where tbl = 'bookings' and _rx_trim(_rx_s(_rx_c(raw, (bm ->> 'رقم الإشعار')::int))) = any (tg);
  get diagnostics n = row_count;
  if n > 0 then perform _x_bump('bookings'); perform _w_dv_bump(array['visa', 'bookings']); end if;
  perform _x_aud(who, 'تطبيق تسعير دورات النقل', ag, 'عدد الدورات', '-', n || ' دورة بسعر ' || _mf_n2t(pr) || ' من ' || coalesce(nullif(_mf_datet(a ->> 3), ''), 'البداية') || ' إلى ' || coalesce(nullif(_mf_datet(a ->> 4), ''), 'الآن'));
  return jsonb_build_object('success', true, 'count', n); end $$;

-- ===== أسعار الوكلاء =====
create or replace function rw2_applyagentpricetogroups(a jsonb, u text) returns jsonb language plpgsql volatile set search_path = public as
$$ declare who text := coalesce(u, app_user(), '-'); ag text := _w_str(a -> 1); pr float8 := coalesce(_mf_num(a -> 2), 0); fm float8; tm_ float8; am jsonb := _vz_am(); r record; f jsonb; n int := 0; begin
  perform _vz_fin();
  if ag = '' then return jsonb_build_object('success', false, 'error', 'اسم الوكيل مطلوب'); end if;
  if pr = 0 then return jsonb_build_object('success', false, 'error', 'السعر مطلوب'); end if;
  fm := case when coalesce(a ->> 3, '') <> '' then _mf_ms(_mf_datet(a ->> 3)) else -8.64e15 end; tm_ := case when coalesce(a ->> 4, '') <> '' then _mf_ms(_mf_datet(a ->> 4)) else 8.64e15 end;
  perform _x_lock('vz_files');
  for r in select rid, raw from store_rows where tbl = 'vz_files' loop
    f := _vz_row_obj(r.raw);
    if coalesce(f ->> 'id', '') = '' or not _vz_in_acct(f ->> 'agent', f ->> 'company', ag, am) then continue; end if;
    if _mf_ms(f ->> 'date') is null or _mf_ms(f ->> 'date') < fm or _mf_ms(f ->> 'date') > tm_ then continue; end if;
    if coalesce(_mf_num(f -> 'price'), 0) = pr then continue; end if;
    update store_rows set raw = jsonb_set(_x_pad(r.raw, 12), '{11}', to_jsonb(pr)) where tbl = 'vz_files' and rid = r.rid;
    perform _x_aud(who, 'تطبيق سعر جماعي', 'VZ:' || (f ->> 'id'), 'السعر', coalesce(f ->> 'price', '0'), _mf_n2t(pr)); n := n + 1;
  end loop;
  if n > 0 then perform _x_bump('vz_files'); perform _w_dv_bump(array['visa']); end if;
  return jsonb_build_object('success', true, 'count', n); end $$;
create or replace function _vz_save_prices(p_tbl text, a jsonb, u text, p_lbl text) returns jsonb language plpgsql volatile set search_path = public as
$$ declare who text := coalesce(u, app_user(), '-'); ag text := _w_str(a -> 1); p jsonb; n int := 0; st text := _w_stamp(); keep jsonb; begin
  perform _vz_fin();
  if ag = '' then return jsonb_build_object('success', false, 'error', 'اسم الوكيل مطلوب'); end if;
  perform _x_lock(p_tbl);
  select coalesce(jsonb_agg(jsonb_build_array(x ->> 'agent', (x ->> 'price')::float8, x ->> 'from', x ->> 'to', '', '') order by (x ->> '_row')::int), '[]'::jsonb) into keep
    from jsonb_array_elements(_vz_prices(p_tbl)) x where x ->> 'agent' <> ag;
  delete from store_rows where tbl = p_tbl;
  for p in select * from jsonb_array_elements(keep) loop perform _x_append(p_tbl, p); end loop;
  for p in select * from jsonb_array_elements(case when jsonb_typeof(a -> 2) = 'array' then a -> 2 else '[]'::jsonb end) loop
    if _mf_datet(p ->> 'from') = '' then continue; end if;
    perform _x_append(p_tbl, jsonb_build_array(ag, coalesce(_mf_num(p -> 'price'), 0), _mf_datet(p ->> 'from'), _mf_datet(p ->> 'to'), who, st)); n := n + 1;
  end loop;
  perform _x_bump(p_tbl); perform _w_dv_bump(array['visa']);
  perform _x_aud(who, p_lbl, ag, 'عدد الفترات', '-', n::text);
  return jsonb_build_object('success', true, 'count', n); end $$;
create or replace function rw2_savevisaagentprices(a jsonb, u text) returns jsonb language sql volatile set search_path = public as $$ select _vz_save_prices('vz_agent_prices', a, u, 'تسعير وكيل تأشيرات') $$;
create or replace function rw2_savevisaagenttransportprices(a jsonb, u text) returns jsonb language sql volatile set search_path = public as $$ select _vz_save_prices('vz_transport_prices', a, u, 'تسعير وكيل دورات نقل') $$;

-- ===== حسابات الشركات للوكلاء =====
create or replace function rx2_getagentcompanyaccounts(a jsonb, u text) returns jsonb language plpgsql stable set search_path = public as
$$ begin
  perform _x_perm('visas.view', 'لا تملك صلاحية عرض متابعة التأشيرات والوكلاء');
  return jsonb_build_object('success', true, 'modes', '["عام","منفصل","مشترك"]'::jsonb, 'rows', coalesce((select jsonb_agg(jsonb_build_object('agent', _mf_str(_rx_c(raw, 0)), 'company', _mf_str(_rx_c(raw, 1)),
    'mode', coalesce(nullif(_mf_str(_rx_c(raw, 2)), ''), 'عام'), 'mainCompany', _mf_str(_rx_c(raw, 3)), 'notes', _mf_str(_rx_c(raw, 4)), 'active', _mf_str(_rx_c(raw, 7)) <> 'لا') order by rn)
    from _rx_rows('agent_company_accounts') where _mf_str(_rx_c(raw, 0)) <> '' and _mf_str(_rx_c(raw, 1)) <> ''), '[]'::jsonb)); end $$;
create or replace function rw2_saveagentcompanyaccounts(a jsonb, u text) returns jsonb language plpgsql volatile set search_path = public as
$$ declare who text := coalesce(u, app_user(), '-'); r jsonb; n int := 0; st text := _w_stamp(); m text; begin
  perform _vz_fin();
  perform _x_lock('agent_company_accounts');
  delete from store_rows where tbl = 'agent_company_accounts';
  for r in select * from jsonb_array_elements(case when jsonb_typeof(a -> 1) = 'array' then a -> 1 else '[]'::jsonb end) loop
    if _w_str(r -> 'agent') = '' or _w_str(r -> 'company') = '' then continue; end if;
    m := _w_str(r -> 'mode'); if m not in ('عام', 'منفصل', 'مشترك') then m := 'عام'; end if;
    perform _x_append('agent_company_accounts', jsonb_build_array(_w_str(r -> 'agent'), _w_str(r -> 'company'), m, _w_str(r -> 'mainCompany'), _w_str(r -> 'notes'), who, st,
      case when r ->> 'active' = 'false' then 'لا' else 'نعم' end)); n := n + 1;
  end loop;
  perform _x_bump('agent_company_accounts'); perform _w_dv_bump(array['visa']);
  perform _x_aud(who, 'حفظ حسابات الشركات للوكلاء', '-', 'عدد الروابط', '-', n::text);
  return jsonb_build_object('success', true, 'count', n); end $$;
create or replace function rx2_getagentbycompany(a jsonb, u text) returns jsonb language plpgsql stable set search_path = public as
$$ begin
  if app_user() is null then raise exception 'غير مصرّح' using errcode = '42501'; end if;
  if _w_str(a -> 1) = '' then return to_jsonb(''::text); end if;
  return to_jsonb(coalesce((select _rx_s(_rx_c(raw, 0)) from _rx_rows('companies') where _rx_trim(_rx_s(_rx_c(raw, 1))) = _w_str(a -> 1) order by rn limit 1), '')); end $$;

-- ===== بنود ودفعات حساب الوكيل =====
create or replace function rw2_saveagentaccitem(a jsonb, u text) returns jsonb language plpgsql volatile set search_path = public as
$$ declare it jsonb := coalesce(a -> 1, '{}'::jsonb); who text := coalesce(u, app_user(), '-'); ag text := _w_str(it -> 'agent'); id_ text := _w_str(it -> 'id'); rid_ text; hraw jsonb; row_ jsonb; st text := _w_stamp(); dt text; begin
  perform _vz_fin();
  if ag = '' or _w_str(it -> 'desc') = '' then return jsonb_build_object('success', false, 'error', 'الوكيل والبيان مطلوبان'); end if;
  perform _x_lock('vz_items');
  if id_ <> '' then
    select rid, raw into rid_, hraw from store_rows where tbl = 'vz_items' and _mf_str(_rx_c(raw, 0)) = id_ order by ord limit 1;
    if rid_ is null then return jsonb_build_object('success', false, 'error', 'البند غير موجود'); end if;
    if _vz_gl_src(_mf_str(_rx_c(hraw, 6))) <> '' then return jsonb_build_object('success', false, 'error', _vz_gl_msg(_vz_gl_src(_mf_str(_rx_c(hraw, 6))))); end if;
  end if;
  dt := coalesce(nullif(_mf_datet(it ->> 'date'), ''), case when hraw is not null then nullif(_mf_date(_rx_c(hraw, 11)), '') end, _mf_today());
  row_ := jsonb_build_array(coalesce(nullif(id_, ''), _x_id('AI')), ag, _w_str(it -> 'desc'), coalesce(nullif(_w_str(it -> 'currency'), ''), 'SAR'), coalesce(_ac_num(it -> 'value'), 0),
    case when coalesce((it ->> 'isCredit')::boolean, false) then 'نعم' else 'لا' end, _w_str(it -> 'notes'), coalesce(_ac_num(it -> 'order'), 0),
    case when hraw is not null then coalesce(nullif(_mf_str(_rx_c(hraw, 8)), ''), who) else who end, case when hraw is not null then coalesce(nullif(_mf_str(_rx_c(hraw, 9)), ''), st) else st end,
    _w_str(it -> 'entryNo'), dt);
  if rid_ is not null then update store_rows set raw = row_ where tbl = 'vz_items' and rid = rid_; else perform _x_append('vz_items', row_); end if;
  perform _x_bump('vz_items'); perform _w_dv_bump(array['visa']);
  perform _x_aud(who, case when rid_ is not null then 'تعديل بند حساب وكيل' else 'إضافة بند حساب وكيل' end, 'AI:' || (row_ ->> 0), _w_str(it -> 'desc'), '-',
    _mf_n2t(coalesce(_ac_num(it -> 'value'), 0)) || ' ' || coalesce(nullif(_w_str(it -> 'currency'), ''), 'SAR') || case when coalesce((it ->> 'isCredit')::boolean, false) then ' (مدين)' else ' (دائن)' end);
  return jsonb_build_object('success', true); end $$;
create or replace function rw2_saveagentaccitemsbatch(a jsonb, u text) returns jsonb language plpgsql volatile set search_path = public as
$$ declare who text := coalesce(u, app_user(), '-'); ag text := _w_str(a -> 1); cr boolean := coalesce((a ->> 2)::boolean, false); r jsonb; n int := 0; st text := _w_stamp(); id_ text; begin
  perform _vz_fin();
  if ag = '' then return jsonb_build_object('success', false, 'error', 'اسم الوكيل مطلوب'); end if;
  if not exists (select 1 from jsonb_array_elements(case when jsonb_typeof(a -> 3) = 'array' then a -> 3 else '[]'::jsonb end) x where _w_str(x -> 'desc') <> '' and coalesce(_ac_num(x -> 'value'), 0) <> 0) then
    return jsonb_build_object('success', false, 'error', 'لا توجد بنود صالحة بالبيانات الملصقة'); end if;
  perform _x_lock('vz_items');
  for r in select * from jsonb_array_elements(a -> 3) loop
    if _w_str(r -> 'desc') = '' or coalesce(_ac_num(r -> 'value'), 0) = 0 then continue; end if;
    id_ := _x_id('AI');
    perform _x_append('vz_items', jsonb_build_array(id_, ag, _w_str(r -> 'desc'), 'SAR', _ac_num(r -> 'value'), case when cr then 'نعم' else 'لا' end, '', 0, who, st, _w_str(r -> 'entryNo'),
      coalesce(nullif(_mf_datet(r ->> 'date'), ''), _mf_today())));
    perform _x_aud(who, 'إضافة بند حساب وكيل (لصق بنود)', 'AI:' || id_, _w_str(r -> 'desc'), '-', _mf_n2t(_ac_num(r -> 'value')) || ' ريال' || case when cr then ' (مدين)' else ' (دائن)' end);
    n := n + 1;
  end loop;
  perform _x_bump('vz_items'); perform _w_dv_bump(array['visa']);
  return jsonb_build_object('success', true, 'count', n); end $$;
create or replace function rw2_postagreementtoagentaccount(a jsonb, u text) returns jsonb language plpgsql volatile set search_path = public as
$$ declare p jsonb := coalesce(a -> 1, '{}'::jsonb); ag jsonb; acct text; v float8 := coalesce(_ac_num(p -> 'value'), 0); gi jsonb; g jsonb; x jsonb; refs text[] := '{}'; trips text[] := '{}'; cls text[] := '{}'; c text; parts text[]; who_ text; begin
  perform _vz_fin();
  select z into ag from jsonb_array_elements(_vz_ha_all()) z where z ->> 'id' = _w_str(p -> 'agrId');
  if ag is null then return jsonb_build_object('success', false, 'error', 'الاتفاقية غير موجودة'); end if;
  acct := coalesce(nullif(_w_str(p -> 'agent'), ''), _w_str(ag -> 'supplier'));
  if acct = '' then return jsonb_build_object('success', false, 'error', 'حدّد حساب الوكيل'); end if;
  if v <= 0 then return jsonb_build_object('success', false, 'error', 'أدخل قيمة أكبر من صفر'); end if;
  select coalesce(jsonb_object_agg(z ->> 'ref', z), '{}'::jsonb) into gi from jsonb_array_elements(_vz_group_index()) z;
  for x in select z from jsonb_array_elements(_vz_alloc_all()) z where z ->> 'agrId' = ag ->> 'id' loop
    refs := refs || (x ->> 'groupRef');
    g := _vz_gidx_multi(gi, x ->> 'groupRef'); if g is null then continue; end if;
    if coalesce(g ->> 'tripName', '') <> '' and not ((g ->> 'tripName') = any (trips)) then trips := trips || (g ->> 'tripName'); end if;
    for c in select jsonb_array_elements_text(coalesce(g -> 'clients', '[]'::jsonb)) loop if c <> '' and not (c = any (cls)) then cls := cls || c; end if; end loop;
  end loop;
  parts := array['اتفاقية ' || coalesce(ag ->> 'kind', 'سكن') || ' رقم ' || (ag ->> 'agrNo')];
  if coalesce(ag ->> 'hotel', '') <> '' then parts := parts || (ag ->> 'hotel'); end if;
  if coalesce(ag ->> 'city', '') <> '' then parts := parts || (ag ->> 'city'); end if;
  who_ := coalesce(nullif(array_to_string(cls, '، '), ''), array_to_string(trips, '، ')); if who_ <> '' then parts := parts || who_; end if;
  if array_length(refs, 1) > 0 then parts := parts || ('مجموعة ' || array_to_string(refs, '، ')); end if;
  return rw2_saveagentaccitem(jsonb_build_array(null, jsonb_build_object('agent', acct, 'desc', coalesce(nullif(_w_str(p -> 'desc'), ''), array_to_string(parts, ' - ')),
    'currency', coalesce(nullif(_w_str(p -> 'currency'), ''), 'SAR'), 'value', v, 'isCredit', true, 'notes', coalesce(nullif(_w_str(p -> 'notes'), ''), 'مُرحَّل من اتفاقية ' || (ag ->> 'agrNo')))), u); end $$;
create or replace function _vz_del_lines(p_tbl text, ids text[], who text, p_one boolean) returns jsonb language plpgsql volatile set search_path = public as
$$ declare r record; n int := 0; gl int := 0; isitem boolean := p_tbl = 'vz_items'; begin
  perform _x_lock(p_tbl);
  for r in select rid, raw from store_rows where tbl = p_tbl and _mf_str(_rx_c(raw, 0)) = any (ids) order by ord desc loop
    if _vz_gl_src(_mf_str(_rx_c(r.raw, case when isitem then 6 else 5 end))) <> '' then
      if p_one then return jsonb_build_object('success', false, 'error', _vz_gl_msg(_vz_gl_src(_mf_str(_rx_c(r.raw, case when isitem then 6 else 5 end))))); end if;
      gl := gl + 1; continue; end if;
    if isitem then
      perform _rb_on('agent_item', 'بند حساب وكيل ' || _mf_str(_rx_c(r.raw, 1)), _mf_str(_rx_c(r.raw, 2)), who);
      perform _x_aud(who, case when p_one then 'حذف بند حساب وكيل' else 'حذف بند حساب وكيل (جماعي)' end, 'AI:' || _mf_str(_rx_c(r.raw, 0)), _mf_str(_rx_c(r.raw, 2)), '-', '-');
    else
      insert into app_outbox (kind, payload) values ('snaprow', jsonb_build_object('sheet', 'AgentAccounts_Payments', 'key', _mf_str(_rx_c(r.raw, 0)), 'row', r.raw,
        'action', case when p_one then 'قبل حذف دفعة وكيل' else 'قبل حذف جماعي لدفعات وكيل' end, 'user', who));
      perform _rb_on('agent_payment', 'دفعة وكيل ' || _mf_str(_rx_c(r.raw, 1)), _mf_n2t(coalesce(_ac_num(_rx_c(r.raw, 3)), 0)) || ' ' || _mf_str(_rx_c(r.raw, 4)), who);
      perform _x_aud(who, case when p_one then 'حذف دفعة وكيل' else 'حذف دفعة وكيل (جماعي)' end, 'AP:' || _mf_str(_rx_c(r.raw, 0)),
        _mf_n2t(coalesce(_ac_num(_rx_c(r.raw, 3)), 0)) || ' ' || _mf_str(_rx_c(r.raw, 4)), '-', '-');
    end if;
    delete from store_rows where tbl = p_tbl and rid = r.rid; n := n + 1;
  end loop;
  if p_one and n = 0 then return jsonb_build_object('success', false, 'error', case when isitem then 'البند غير موجود' else 'الدفعة غير موجودة' end); end if;
  if n > 0 then perform _x_bump(p_tbl); perform _w_dv_bump(array['visa']); end if;
  return jsonb_build_object('success', true, 'count', n, 'glSkipped', gl); end $$;
create or replace function rw2_deleteagentaccitem(a jsonb, u text) returns jsonb language plpgsql volatile set search_path = public as
$$ begin perform _vz_fin(); return _vz_del_lines('vz_items', array[_w_str(a -> 1)], coalesce(u, app_user(), '-'), true) - 'count' - 'glSkipped'; end $$;
create or replace function rw2_deleteagentpayment(a jsonb, u text) returns jsonb language plpgsql volatile set search_path = public as
$$ begin perform _vz_fin(); return _vz_del_lines('vz_payments', array[_w_str(a -> 1)], coalesce(u, app_user(), '-'), true) - 'count' - 'glSkipped'; end $$;
create or replace function rw2_deleteagentaccitemsbatch(a jsonb, u text) returns jsonb language plpgsql volatile set search_path = public as
$$ declare ids text[]; begin perform _vz_fin();
  select coalesce(array_agg(_w_str(x)) filter (where _w_str(x) <> ''), '{}') into ids from jsonb_array_elements(case when jsonb_typeof(a -> 1) = 'array' then a -> 1 else '[]'::jsonb end) x;
  if coalesce(array_length(ids, 1), 0) = 0 then return jsonb_build_object('success', false, 'error', 'لم تُحدَّد أي بنود'); end if;
  return _vz_del_lines('vz_items', ids, coalesce(u, app_user(), '-'), false); end $$;
create or replace function rw2_deleteagentpaymentsbatch(a jsonb, u text) returns jsonb language plpgsql volatile set search_path = public as
$$ declare ids text[]; begin perform _vz_fin();
  select coalesce(array_agg(_w_str(x)) filter (where _w_str(x) <> ''), '{}') into ids from jsonb_array_elements(case when jsonb_typeof(a -> 1) = 'array' then a -> 1 else '[]'::jsonb end) x;
  if coalesce(array_length(ids, 1), 0) = 0 then return jsonb_build_object('success', false, 'error', 'لم تُحدَّد أي دفعات'); end if;
  return _vz_del_lines('vz_payments', ids, coalesce(u, app_user(), '-'), false); end $$;

-- ===== قراءات =====
create or replace function rx2_getagentaccrowhistory(a jsonb, u text) returns jsonb language plpgsql stable set search_path = public as
$$ declare k text := case a ->> 1 when 'item' then 'AI:' when 'pay' then 'AP:' when 'group' then 'VZ:' when 'transport' then 'إشعار ' end; begin
  perform _x_perm('visas.view', 'لا تملك صلاحية عرض متابعة التأشيرات والوكلاء');
  if k is null or _w_str(a -> 2) = '' then return jsonb_build_object('success', true, 'entries', '[]'::jsonb); end if;
  return jsonb_build_object('success', true, 'entries', coalesce((select jsonb_agg(jsonb_build_object('when', ts, 'who', who, 'action', act, 'field', fld, 'oldVal', ov, 'newVal', nv) order by t desc)
    from _aud_hist(k || _w_str(a -> 2))), '[]'::jsonb)); end $$;
create or replace function rx2_getagentacctvisastats(a jsonb, u text) returns jsonb language plpgsql stable set search_path = public as
$$ declare fl jsonb := coalesce(a -> 1, '{}'::jsonb); fm float8 := _mf_ms(_mf_datet(fl ->> 'from')); tm_ float8 := _mf_ms(_mf_datet(fl ->> 'to')); openp boolean; am jsonb := _vz_am();
  comps text[]; accf text[]; listed jsonb; rows_ jsonb := '{}'::jsonb; ord text[] := '{}'; unl jsonb := '{}'::jsonb; oth_f int := 0; oth_v float8 := 0; oth_s text[] := '{}';
  f jsonb; k text; n float8; st text; uk text; ac jsonb; tot jsonb; res jsonb; sent text := replace(regexp_replace('تم الإرسال', '[إأآٱ]', 'ا', 'g'), ' ', ''); mofa text := replace(regexp_replace('تم إصدار الموفا', '[إأآٱ]', 'ا', 'g'), ' ', ''); begin
  perform _x_perm('visas.view', 'لا تملك صلاحية عرض متابعة التأشيرات والوكلاء');
  openp := fm is null and tm_ is null;
  select coalesce(array_agg(_w_str(x)) filter (where _w_str(x) <> ''), '{}') into comps from jsonb_array_elements(case when jsonb_typeof(fl -> 'companies') = 'array' then fl -> 'companies' else '[]'::jsonb end) x;
  select coalesce(array_agg(_w_str(x)) filter (where _w_str(x) <> ''), '{}') into accf from jsonb_array_elements(case when jsonb_typeof(fl -> 'accounts') = 'array' then fl -> 'accounts' else '[]'::jsonb end) x;
  listed := coalesce(rx2_getvisabootstrap(jsonb_build_array(null), u) -> 'accounts', '[]'::jsonb);
  for ac in select * from jsonb_array_elements(listed) loop
    if array_length(accf, 1) > 0 and not ((ac ->> 'key') = any (accf)) then continue; end if;
    if rows_ ? (ac ->> 'key') then continue; end if;
    rows_ := rows_ || jsonb_build_object(ac ->> 'key', jsonb_build_object('acct', ac ->> 'key', 'kind', ac ->> 'kind', 'companies', coalesce(ac -> 'companies', '[]'::jsonb), 'mofa', 0, 'sent', 0, 'total', 0, 'files', 0));
    ord := ord || (ac ->> 'key');
  end loop;
  for f in select q.f from _vz_files() q order by q.rn loop
    if _mf_ms(f ->> 'date') is not null and (_mf_ms(f ->> 'date') < coalesce(fm, -8.64e15) or _mf_ms(f ->> 'date') > coalesce(tm_, 8.64e15)) then continue; end if;
    if _mf_ms(f ->> 'date') is null and not openp then continue; end if;
    if array_length(comps, 1) > 0 and not (coalesce(f ->> 'company', '') = any (comps)) then continue; end if;
    k := _vz_key_calc(f ->> 'agent', f ->> 'company', am); n := coalesce(_mf_num(f -> 'visaCount'), 0);
    if k = '' or not exists (select 1 from jsonb_array_elements(listed) l where l ->> 'key' = k) then
      if array_length(accf, 1) > 0 then continue; end if;
      uk := coalesce(f ->> 'agent', '') || '|' || coalesce(f ->> 'company', '');
      if not unl ? uk then unl := unl || jsonb_build_object(uk, jsonb_build_object('agent', coalesce(nullif(f ->> 'agent', ''), '(بلا وكيل)'), 'company', coalesce(f ->> 'company', ''), 'files', 0, 'visas', 0)); end if;
      unl := jsonb_set(unl, array[uk], (unl -> uk) || jsonb_build_object('files', (unl -> uk ->> 'files')::int + 1, 'visas', (unl -> uk ->> 'visas')::float8 + n));
      continue;
    end if;
    if not rows_ ? k then continue; end if;
    st := replace(regexp_replace(regexp_replace(coalesce(f ->> 'status', ''), '[ً-ْـ]', '', 'g'), '[إأآٱ]', 'ا', 'g'), ' ', '');
    if st = mofa then rows_ := jsonb_set(rows_, array[k, 'mofa'], to_jsonb((rows_ -> k ->> 'mofa')::float8 + n));
    elsif st = sent then rows_ := jsonb_set(rows_, array[k, 'sent'], to_jsonb((rows_ -> k ->> 'sent')::float8 + n));
    else oth_f := oth_f + 1; oth_v := oth_v + n; if not (coalesce(nullif(f ->> 'status', ''), '(بلا حالة)') = any (oth_s)) then oth_s := oth_s || coalesce(nullif(f ->> 'status', ''), '(بلا حالة)'); end if; continue; end if;
    rows_ := jsonb_set(rows_, array[k, 'files'], to_jsonb((rows_ -> k ->> 'files')::int + 1));
  end loop;
  select coalesce(jsonb_agg(o || jsonb_build_object('total', (o ->> 'mofa')::float8 + (o ->> 'sent')::float8) order by (o ->> 'mofa')::float8 + (o ->> 'sent')::float8 desc, o ->> 'acct'), '[]'::jsonb) into res
    from (select rows_ -> k2 o from unnest(ord) k2) z;
  select jsonb_build_object('mofa', coalesce(sum((o ->> 'mofa')::float8), 0), 'sent', coalesce(sum((o ->> 'sent')::float8), 0), 'total', coalesce(sum((o ->> 'total')::float8), 0), 'files', coalesce(sum((o ->> 'files')::int), 0))
    into tot from jsonb_array_elements(res) o;
  return jsonb_build_object('success', true, 'statusLabels', jsonb_build_object('mofa', 'تم إصدار الموفا', 'sent', 'تم الإرسال'), 'rows', res, 'totals', tot,
    'unlisted', coalesce((select jsonb_agg(v order by (v ->> 'visas')::float8 desc) from jsonb_each(unl) e(k3, v)), '[]'::jsonb),
    'other', jsonb_build_object('files', oth_f, 'visas', oth_v, 'statuses', to_jsonb(oth_s))); end $$;

do $$ declare r record; begin
  for r in select p.oid::regprocedure::text sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname in ('_vz_fin','_vz_in_acct','_vz_gl_src','_vz_gl_msg','_ta_ovr','_ta_rows','rx2_gettransportaccountsdata','rx2_gettransportagentcompanypairs',
              'rw2_savetransportrowedit','rw2_deletetransportrowedit','rw2_applytransportpricetoruns','rw2_applyagentpricetogroups','_vz_save_prices','rw2_savevisaagentprices','rw2_savevisaagenttransportprices',
              'rx2_getagentcompanyaccounts','rw2_saveagentcompanyaccounts','rx2_getagentbycompany','rw2_saveagentaccitem','rw2_saveagentaccitemsbatch','rw2_postagreementtoagentaccount','_vz_del_lines',
              'rw2_deleteagentaccitem','rw2_deleteagentpayment','rw2_deleteagentaccitemsbatch','rw2_deleteagentpaymentsbatch','rx2_getagentaccrowhistory','rx2_getagentacctvisastats') loop
    execute format('revoke all on function %s from public, anon, authenticated', r.sig);
    execute format('grant execute on function %s to service_role', r.sig);
  end loop;
end $$;

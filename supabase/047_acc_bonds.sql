-- V4.421: توليد بنود حسابات عملاء العمرة (نمط «بنود») من Postgres — كان 0A000 ⇒ Apps Script (≈30 ث).
-- مطابق لـ accGenerateDraft(mode='بنود') في Code.gs: رسوم الغرفة من ملفات الوزارة المراجَعة · الإشراف · التذاكر · التأشيرات (مجموعات الموفا الصادرة + ملاحظات المعتمرين) ·
-- تأشيرة وباركود · المشرف الخاص · نقل سعودي · السكن (حجز فعلي من نسخة 046 أو تقدير الإشعار/الرحلة) · بدلات المشرف · شركة/ضرائب/إعاشة · بنود العميل المخصصة المسعّرة.
-- يتطلب: 010 (_mf_*) و011 (_vz_*) و016 (_w_roomfee_at) و040 (rx2_accgeneratedraft/_ae_*) و043 (glx) و046 (hbx_read_raw) ومخازن gl_hb_map/gl_hb_trip (مجموعة glaux).

create or replace function _ae_shortdm(s text) returns text language plpgsql immutable as
$$ declare m text[]; begin
  s := btrim(coalesce(s, ''));
  m := regexp_match(s, '^(\d{1,2})/(\d{1,2})/(\d{4})$'); if m is not null then return (m[1]::int) || '-' || (m[2]::int); end if;
  m := regexp_match(s, '^(\d{4})-(\d{1,2})-(\d{1,2})'); if m is not null then return (m[3]::int) || '-' || (m[2]::int); end if;
  return ''; end $$;
create or replace function _ae_stay(ci text, co text) returns text language plpgsql immutable as
$$ declare a text := _ae_shortdm(ci); b text := _ae_shortdm(co); begin
  if a = '' and b = '' then return ''; end if;
  return ' من ' || coalesce(nullif(a, ''), '؟') || ' الى ' || coalesce(nullif(b, ''), '؟'); end $$;
create or replace function _ae_ddiff(a text, b text) returns int language plpgsql immutable as
$$ declare x float8 := _ae_dmy_ms(a); y float8 := _ae_dmy_ms(b); begin
  if x is null or y is null then return 0; end if; return greatest(0, floor((y - x) / 86400 + 0.5))::int; end $$;
create or replace function _ae_item(d text, cat text, cur text, cnt float8, price float8, nights float8, company text, notes text, direct boolean) returns jsonb language sql immutable as
$$ select jsonb_build_object('desc', d, 'cat', cat, 'currency', cur, 'count', cnt, 'price', coalesce(price, 0), 'nights', coalesce(nights, 0), 'company', coalesce(company, ''), 'notes', coalesce(notes, ''), 'isDirect', coalesce(direct, false)) $$;

-- = _accClientHousing_
create or replace function _ae_housing(client text, trip text) returns jsonb language plpgsql stable set search_path = public as
$$ #variable_conflict use_column
declare pm jsonb := _rx_map('pilgrims', _rx_h_pil()); ix jsonb := _pm_ix(); tm jsonb := _rx_map('trips', _rx_h_trips()); bm jsonb := _rx_map('bookings', _bk_canon());
  i_cl int := (ix ->> 'client')::int; i_tr int := (ix ->> 'tripName')::int; i_hm int := (pm ->> 'فندق المدينة')::int; i_hk int := (pm ->> 'فندق مكة')::int; i_rm int := (pm ->> 'رقم غرفة المدينة')::int; i_rk int := (pm ->> 'رقم غرفة مكة')::int;
  mh text := ''; kh text := ''; mr int := 0; kr int := 0; mn int := 0; kn int := 0; mi text := ''; mo text := ''; ki text := ''; ko text := ''; arr text := ''; dep text := ''; al text := '';
  nb jsonb; fl text; r record; t jsonb; x text; tmn int := (tm ->> 'اسم الرحلة')::int;
begin
  select h into mh from (select _rx_trim(_rx_s(_rx_c(raw, i_hm))) h, count(*) c, min(rn) f from _rx_rows('pilgrims') p where _rx_trim(_rx_s(_rx_c(raw, i_cl))) = client and _rx_trim(_rx_s(_rx_c(raw, i_tr))) = trip group by 1) q where h <> '' order by c desc, f asc limit 1;
  select h into kh from (select _rx_trim(_rx_s(_rx_c(raw, i_hk))) h, count(*) c, min(rn) f from _rx_rows('pilgrims') p where _rx_trim(_rx_s(_rx_c(raw, i_cl))) = client and _rx_trim(_rx_s(_rx_c(raw, i_tr))) = trip group by 1) q where h <> '' order by c desc, f asc limit 1;
  mh := coalesce(mh, ''); kh := coalesce(kh, '');
  select count(distinct _rx_trim(_rx_s(_rx_c(raw, i_rm)))) filter (where _rx_trim(_rx_s(_rx_c(raw, i_rm))) <> ''), count(distinct _rx_trim(_rx_s(_rx_c(raw, i_rk)))) filter (where _rx_trim(_rx_s(_rx_c(raw, i_rk))) <> '') into mr, kr
    from _rx_rows('pilgrims') where _rx_trim(_rx_s(_rx_c(raw, i_cl))) = client and _rx_trim(_rx_s(_rx_c(raw, i_tr))) = trip;
  -- إشعار الوصول المرتبط بالرحلة (أول إشعار بهذا اسم الرحلة وله رقم)
  select raw into nb from _rx_rows('bookings') where _rx_trim(_rx_s(_rx_c(raw, (bm ->> 'اسم الرحلة')::int))) = trip and _rx_trim(_rx_s(_rx_c(raw, (bm ->> 'رقم الإشعار')::int))) <> '' order by rn limit 1;
  if nb is not null then
    x := _rx_trim(_rx_s(_rx_c(nb, (bm ->> 'سكن المدينة')::int))); if x <> '' then mh := x; end if;
    x := _rx_trim(_rx_s(_rx_c(nb, (bm ->> 'سكن مكة')::int))); if x <> '' then kh := x; end if;
    mi := _ae_dfmt(_rx_c(nb, (bm ->> 'دخول المدينة')::int)); mo := _ae_dfmt(_rx_c(nb, (bm ->> 'خروج المدينة')::int));
    ki := _ae_dfmt(_rx_c(nb, (bm ->> 'دخول مكة')::int)); ko := _ae_dfmt(_rx_c(nb, (bm ->> 'خروج مكة')::int));
    mn := _ae_ddiff(mi, mo); kn := _ae_ddiff(ki, ko);
    arr := btrim(regexp_replace(regexp_replace(_rx_trim(_rx_s(_rx_c(nb, (bm ->> 'منفذ الوصول')::int))), 'مطار\s*', '', 'g'), '\s*→\s*', '/', 'g'));
    dep := btrim(regexp_replace(regexp_replace(_rx_trim(_rx_s(_rx_c(nb, (bm ->> 'منفذ المغادرة')::int))), 'مطار\s*', '', 'g'), '\s*→\s*', '/', 'g'));
    fl := substr(regexp_replace(upper(_rx_s(_rx_c(nb, (bm ->> 'رقم رحلة الوصول')::int))), '[^A-Z]', '', 'g'), 1, 2);
    al := case fl when 'MS' then 'مصر للطيران' when 'SV' then 'الخطوط السعودية' when 'SM' then 'سما' when 'NP' then 'النيل للطيران' when 'XY' then 'طيران ناس' when 'F3' then 'طيران أديل' when 'AT' then 'العربية' else '' end;
  end if;
  -- كشف الرحلات: يكمّل ما ينقص (ترتيب الصفوف كما بالأصل)
  for r in select raw from _rx_rows('trips') where _rx_trim(_rx_s(_rx_c(raw, tmn))) = trip order by rn loop
    if al = '' then al := _rx_trim(_rx_s(_rx_c(r.raw, (tm ->> 'الخطوط')::int))); end if;
    if mn = 0 then mn := _ae_ddiff(_ae_dfmt(_rx_c(r.raw, (tm ->> 'تاريخ دخول المدينة')::int)), _ae_dfmt(_rx_c(r.raw, (tm ->> 'تاريخ الخروج من المدينة')::int))); end if;
    if kn = 0 then kn := _ae_ddiff(_ae_dfmt(_rx_c(r.raw, (tm ->> 'تاريخ دخول مكة')::int)), _ae_dfmt(_rx_c(r.raw, (tm ->> 'تاريخ الخروج من مكة')::int))); end if;
    if mh = '' then mh := _rx_trim(_rx_s(_rx_c(r.raw, (tm ->> 'سكن المدينة')::int))); end if;
    if kh = '' then kh := _rx_trim(_rx_s(_rx_c(r.raw, (tm ->> 'سكن مكة')::int))); end if;
    if mi = '' then mi := _ae_dfmt(_rx_c(r.raw, (tm ->> 'تاريخ دخول المدينة')::int)); end if;
    if mo = '' then mo := _ae_dfmt(_rx_c(r.raw, (tm ->> 'تاريخ الخروج من المدينة')::int)); end if;
    if ki = '' then ki := _ae_dfmt(_rx_c(r.raw, (tm ->> 'تاريخ دخول مكة')::int)); end if;
    if ko = '' then ko := _ae_dfmt(_rx_c(r.raw, (tm ->> 'تاريخ الخروج من مكة')::int)); end if;
  end loop;
  return jsonb_build_object('madHotel', mh, 'makHotel', kh, 'madRooms', mr, 'makRooms', kr, 'madNights', mn, 'makNights', kn, 'madCheckIn', mi, 'madCheckOut', mo, 'makCheckIn', ki, 'makCheckOut', ko,
    'arrRoute', arr, 'depRoute', dep, 'airline', al); end $$;

-- = _accMfFeesAgg_ (ملفات الوزارة المراجَعة لعميل×رحلة) ⇒ {any, agg:{مفتاح:{count,cost,refs[]}}}
create or replace function _ae_mf_fees(client text, trip text) returns jsonb language plpgsql stable set search_path = public as
$$ #variable_conflict use_column
declare cfg jsonb := _sx_acc_pricing(); core jsonb; f jsonb; b jsonb; c jsonb; known jsonb := _mf_trip_names(); tm jsonb := _rx_map('trips', _rx_h_trips()); tset jsonb;
  n float8; sp float8; nm text; rt text; lines jsonb; l jsonb; agg jsonb := '{}'::jsonb; anyf boolean := false; k text; fno text; a jsonb; mfee float8;
begin
  select coalesce(jsonb_object_agg(_ac_norm(t), 1), '{}'::jsonb) into tset from (select _mf_str(_rx_c(raw, (tm ->> 'اسم الرحلة')::int)) t from _rx_rows('trips')) z where t <> '';
  core := _mf_all(_sx_exec_policy(), cfg, _mf_today());
  for f in select * from jsonb_array_elements(coalesce(core -> 'files', '[]'::jsonb)) loop
    if _mf_str(f -> 'reviewDate') = '' then continue; end if;
    if not (trip = any (_mf_trips_of(f ->> 'tripName', f ->> 'extraTrips', known))) then continue; end if;
    n := 0; sp := 0;
    for b in select * from jsonb_array_elements(case when jsonb_typeof(f -> 'breakdown') = 'array' then f -> 'breakdown' else '[]'::jsonb end) loop
      if jsonb_typeof(b) <> 'object' then continue; end if;
      nm := _rx_s(b -> 'name');
      if tset ? _ac_norm(nm) then continue; end if;
      if not _ac_name_match(nm, client) then continue; end if;
      n := n + _mf_num(b -> 'count'); sp := sp + _mf_num(b -> 'sups');
    end loop;
    if n = 0 and sp = 0 then continue; end if;
    c := f -> 'calc'; rt := f ->> 'reviewType'; lines := '[]'::jsonb; fno := _mf_str(f -> 'fileNo');
    if coalesce(f ->> 'execFee', '') in ('true', 't', '1', 'نعم') then
      if n <> 0 then anyf := true; end if;      -- رسوم التنفيذ: تُحتسب «وجود ملفات» فقط (لا بند رسوم غرفة)
      continue;
    end if;
    if rt = 'تجديد باركود' then
      if n <> 0 then lines := lines || jsonb_build_array(jsonb_build_object('key', 'تجديد باركود', 'count', n, 'cost', _mf_barcode_fee(f ->> 'reviewDate', cfg))); end if;
    elsif rt = 'VIP' or coalesce((c ->> 'vipByCount')::boolean, false) then
      if n <> 0 then lines := lines || jsonb_build_array(jsonb_build_object('key', 'رسوم غرفة VIP', 'count', n, 'cost', _mf_num(c -> 'roomFeeEffective'))); end if;
    elsif n <> 0 then lines := lines || jsonb_build_array(jsonb_build_object('key', 'رسوم غرفة', 'count', n, 'cost', _mf_num(c -> 'roomFeeEffective')));
    end if;
    mfee := _mf_num(c -> 'murafiqFee');
    if sp <> 0 and mfee <> 0 then lines := lines || jsonb_build_array(jsonb_build_object('key', 'رسوم غرفة المشرف', 'count', least(sp, mfee), 'cost', _mf_num(c -> 'supRoomFee'))); end if;
    if jsonb_array_length(lines) = 0 then continue; end if;
    anyf := true;
    for l in select * from jsonb_array_elements(lines) loop
      k := l ->> 'key'; a := coalesce(agg -> k, jsonb_build_object('count', 0, 'cost', (l ->> 'cost')::float8, 'refs', '[]'::jsonb));
      a := jsonb_set(a, '{count}', to_jsonb((a ->> 'count')::float8 + (l ->> 'count')::float8));
      if fno <> '' and not (a -> 'refs') ? fno then a := jsonb_set(a, '{refs}', (a -> 'refs') || to_jsonb(fno)); end if;
      agg := jsonb_set(agg, array[k], a);
    end loop;
  end loop;
  return jsonb_build_object('any', anyf, 'agg', agg); end $$;

-- = _accVisaGroupsFor_ (مجموعات التأشيرات «تم إصدار الموفا» لعميل×رحلة)
create or replace function _ae_vz_groups(client text, trip text) returns jsonb language plpgsql stable set search_path = public as
$$ declare known jsonb := _mf_trip_names(); f jsonb; b jsonb; n float8; cnt float8 := 0; refs text[] := '{}'; ags text[] := '{}'; begin
  for f in select vf.f from _vz_files() vf order by vf.rn loop
    if btrim(coalesce(f ->> 'status', '')) <> 'تم إصدار الموفا' then continue; end if;
    if not (trip = any (_mf_trips_of(f ->> 'tripName', f ->> 'extraTrips', known))) then continue; end if;
    n := 0;
    for b in select * from jsonb_array_elements(case when jsonb_typeof(f -> 'breakdown') = 'array' then f -> 'breakdown' else '[]'::jsonb end) loop
      if jsonb_typeof(b) = 'object' and _ac_name_match(_rx_s(b -> 'name'), client) then n := n + _mf_num(b -> 'count'); end if;
    end loop;
    if n = 0 then continue; end if;
    cnt := cnt + n;
    if coalesce(f ->> 'ref', '') <> '' and not (f ->> 'ref') = any (refs) then refs := refs || (f ->> 'ref'); end if;
    if coalesce(f ->> 'agent', '') <> '' and not (f ->> 'agent') = any (ags) then ags := ags || (f ->> 'agent'); end if;
  end loop;
  return jsonb_build_object('count', cnt, 'desc', case when cnt = 0 then '' else 'تأشيرات' || case when array_length(refs, 1) > 0 then ' — مجموعة ' || array_to_string(refs, '، ') else '' end
      || case when array_length(ags, 1) > 0 then ' (الوكيل: ' || array_to_string(ags, '، ') || ')' else '' end end); end $$;

-- مدن حجوزات الفنادق المنقولة لحساب العميل×الرحلة (علامة ⟦src:HB.<base64url>⟧ ببيان البند) = _accHbCitiesIn_
create or replace function _ae_hb_here(client text, trip text) returns jsonb language plpgsql stable set search_path = public as
$$ declare o jsonb := '{}'::jsonb; r record; enc text; k text; begin
  for r in select _rx_s(_rx_c(raw, 3)) d from _rx_rows('acc_items') where _rx_trim(_rx_s(_rx_c(raw, 1))) = client and coalesce(nullif(_rx_trim(_rx_s(_rx_c(raw, 2))), ''), 'عام') = trip loop
    enc := (regexp_match(r.d, '⟦src:HB\.([A-Za-z0-9_-]+)⟧'))[1];
    if enc is null then continue; end if;
    begin k := convert_from(decode(rpad(translate(enc, '-_', '+/'), (ceil(length(enc) / 4.0) * 4)::int, '='), 'base64'), 'UTF8'); exception when others then k := null; end;
    if k is null or k = '' then continue; end if;
    o := o || jsonb_build_object(split_part(k, '|', 1), true);
  end loop;
  return o; end $$;

-- كل حجوزات المدينة لها قيد AUTO:HB مرحّل؟ = _accHbPostedAll_
create or replace function _ae_hb_posted_all(keys jsonb) returns boolean language plpgsql stable set search_path = public as
$$ declare k jsonb; st text; begin
  if keys is null or jsonb_typeof(keys) <> 'array' or jsonb_array_length(keys) = 0 then return false; end if;
  for k in select * from jsonb_array_elements(keys) loop
    select _glx_str(ge.raw -> 5) into st from gl_entries ge where _glx_str(ge.raw -> 6) = 'AUTO:HB:' || (k #>> '{}') order by ge.ord desc limit 1;
    if st is distinct from 'مرحّل' then return false; end if;
  end loop;
  return true; end $$;

create or replace function _hbx_day(d text) returns float8 language plpgsql immutable as
$$ declare m text[] := regexp_match(coalesce(d, ''), '^(\d{2})/(\d{2})/(\d{4})$'); begin
  if m is null then return null; end if; return floor(extract(epoch from make_date(m[3]::int, m[2]::int, m[1]::int)) / 86400 + 0.5);
exception when others then return null; end $$;

-- = _glHbCityActual_ (حجوزات السكن الفعلية بقيمة بيعها لعميل×رحلة، مجمّعة بالمدينة) من نسخة 046 + خريطة الأطراف ⇒ null إن لم يُربط البرنامج
create or replace function _ae_hb_city_actual(client text, trip text) returns jsonb language plpgsql stable set search_path = public as
$$ #variable_conflict use_column
declare hbr jsonb; b jsonb; mapj jsonb; ovj jsonb; tripsj jsonb; byc jsonb; accs jsonb; ck text := _hbx_key(client); mk text; cm jsonb; a jsonb; nm text; tr text; ov text; res jsonb := null;
  city text; c jsonb; tm jsonb := _rx_map('trips', _rx_h_trips()); ix jsonb := _pm_ix(); i_cl int := (ix ->> 'client')::int; i_tr int := (ix ->> 'tripName')::int;
  cands jsonb; t text; T_ jsonb; d float8; av float8; zv float8; best text; bd float8; v float8; isMk boolean;
begin
  if client = '' or trip = '' then return null; end if;
  if coalesce(_glw_setting('hb_ss_id'), '') = '' then return null; end if;
  if exists (select 1 from unnest(array['gl_hb_map', 'gl_hb_trip', 'pilgrims', 'trips']) s where not exists (select 1 from store_meta m where m.tbl = s)) then
    raise exception 'مخازن الربط غير جاهزة' using errcode = '55000'; end if;
  hbr := hbx_read_raw();
  if coalesce((hbr ->> 'ageSec')::int, 99999) > 300 then raise exception 'نسخة الحجوزات قديمة' using errcode = '55000'; end if;
  accs := _glx_aux('accounts');
  select coalesce(jsonb_object_agg(k, o), '{}'::jsonb) into mapj from (select distinct on (k) k, jsonb_build_object('name', nm, 'type', ty, 'code', cd, 'link', lk) o
      from (select rn, _hbx_key(_glx_str(raw -> 0)) k, _glx_str(raw -> 0) nm, _glx_str(raw -> 1) ty, _glx_str(raw -> 2) cd, _glx_str(raw -> 3) lk from _rx_rows('gl_hb_map')) z where nm <> '' order by k, rn desc) y;
  select coalesce(jsonb_object_agg(k, v), '{}'::jsonb) into ovj from (select distinct on (k) k, v from (select rn, _glx_str(raw -> 0) k, _glx_str(raw -> 1) v from _rx_rows('gl_hb_trip')) z where k <> '' order by k, rn desc) y;
  select coalesce(jsonb_object_agg(nm, o), '{}'::jsonb) into tripsj from (select distinct on (nm) nm, jsonb_build_object('go', _hbx_autodate(_rx_c(raw, (tm ->> 'تاريخ الذهاب')::int)), 'back', _hbx_autodate(_rx_c(raw, (tm ->> 'تاريخ العودة')::int)),
      'mdIn', _hbx_autodate(_rx_c(raw, (tm ->> 'تاريخ دخول المدينة')::int)), 'mdOut', _hbx_autodate(_rx_c(raw, (tm ->> 'تاريخ الخروج من المدينة')::int)),
      'mkIn', _hbx_autodate(_rx_c(raw, (tm ->> 'تاريخ دخول مكة')::int)), 'mkOut', _hbx_autodate(_rx_c(raw, (tm ->> 'تاريخ الخروج من مكة')::int))) o
      from (select rn, raw, _glx_str(_rx_c(raw, (tm ->> 'اسم الرحلة')::int)) nm from _rx_rows('trips')) z where nm <> '' order by nm, rn desc) y;
  select coalesce(jsonb_object_agg(ck2, ts), '{}'::jsonb) into byc from (select ck2, jsonb_agg(t order by f) ts from (select ck2, t, min(rn) f from (
      select rn, _hbx_key(_glx_str(_rx_c(raw, i_cl))) ck2, _glx_str(_rx_c(raw, i_tr)) t from _rx_rows('pilgrims')) p where ck2 <> '' and t <> '' group by ck2, t) q group by ck2) w;
  for b in select * from jsonb_array_elements(hbr -> 'bookings') loop
    if b ->> 'status' = 'لاغي' or coalesce(b ->> 'client', '') = '' or not coalesce((b -> 'sale' ->> 'hasPrice')::boolean, false) or coalesce((b -> 'sale' ->> 'value')::float8, 0) = 0 then continue; end if;
    mk := _hbx_key(b ->> 'client'); cm := mapj -> mk;
    if cm is null or cm ->> 'type' <> 'عميل عمرة' then continue; end if;
    a := case when coalesce(cm ->> 'code', '') <> '' then accs -> (cm ->> 'code') end;
    nm := coalesce(nullif(a ->> 'link', ''), cm ->> 'name');
    if _hbx_key(nm) <> ck then continue; end if;
    -- _glHbTripOf_ : تجاوز يدوي ثم تحديد تلقائي بنافذة السكن (±2 يوم)
    if ovj ? (b ->> 'key') then ov := ovj ->> (b ->> 'key'); tr := case when ov = '-' then '' else ov end;
    else
      tr := ''; best := ''; bd := 1e9; d := _hbx_day(b ->> 'ci'); isMk := b ->> 'city' = 'مكة';
      for cands in select * from jsonb_array_elements(coalesce(byc -> _hbx_key(nm), '[]'::jsonb)) loop
        t := cands #>> '{}'; T_ := tripsj -> t; if T_ is null then continue; end if;
        av := _hbx_day(T_ ->> case when isMk then 'mkIn' else 'mdIn' end); zv := _hbx_day(T_ ->> case when isMk then 'mkOut' else 'mdOut' end);
        if av is null then av := _hbx_day(T_ ->> 'go'); zv := _hbx_day(T_ ->> 'back'); end if;
        if av is null then continue; end if;
        if zv is null then zv := av + 30; end if;
        if d >= av - 2 and d <= zv and abs(d - av) < bd then bd := abs(d - av); best := t; end if;
      end loop;
      tr := best;
    end if;
    if tr <> trip then continue; end if;
    res := coalesce(res, '{}'::jsonb); city := b ->> 'city';
    c := coalesce(res -> city, jsonb_build_object('value', 0, 'hotels', '[]'::jsonb, 'ci', null, 'co', null, 'keys', '[]'::jsonb));
    v := _glx_r2((c ->> 'value')::float8 + (b -> 'sale' ->> 'value')::float8);
    c := jsonb_set(c, '{value}', to_jsonb(v));
    if coalesce(b ->> 'hotel', '') <> '' and not (c -> 'hotels') ? (b ->> 'hotel') then c := jsonb_set(c, '{hotels}', (c -> 'hotels') || to_jsonb(b ->> 'hotel')); end if;
    if c ->> 'ci' is null or (b ->> 'ci') collate "C" < (c ->> 'ci') collate "C" then c := jsonb_set(c, '{ci}', to_jsonb(b ->> 'ci')); end if;
    if c ->> 'co' is null or (b ->> 'co') collate "C" > (c ->> 'co') collate "C" then c := jsonb_set(c, '{co}', to_jsonb(b ->> 'co')); end if;
    c := jsonb_set(c, '{keys}', (c -> 'keys') || to_jsonb(b ->> 'key'));
    res := jsonb_set(res, array[city], c);
  end loop;
  return res; end $$;

-- = مقطع mode==='بنود' من accGenerateDraft
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
  if (vz ->> 'count')::float8 > 0 then items := items || _ae_item(vz ->> 'desc', 'كبير', 'SAR', (vz ->> 'count')::float8, coalesce(_ae_price_at(cp, 'تأشيرات', depart), 0), 0, '', '', false); end if;
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

-- ===== accGenerateDraft بعد إضافة نمط «بنود» (= 040 + المقطع الجديد) =====
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
  select coalesce(jsonb_agg(x || jsonb_build_object('exists', have ? _acc_bond_key(x ->> 'desc'), 'removed', tomb ? _acc_bond_key(x ->> 'desc'), 'sel', not (have ? _acc_bond_key(x ->> 'desc')) and not (tomb ? _acc_bond_key(x ->> 'desc')) and (mode_ <> 'بنود' or coalesce((x ->> 'price')::float8, 0) > 0)) order by o), '[]'::jsonb) into items
    from jsonb_array_elements(items) with ordinality t(x, o);
  return jsonb_build_object('success', true, 'items', items, 'counts', jsonb_build_object('a', ad, 'c', ch, 'i', inf, 't', tot)); end $$;

do $$ declare r record; begin
  for r in select p.oid::regprocedure::text sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and (p.proname in ('_ae_shortdm','_ae_stay','_ae_ddiff','_ae_item','_ae_housing','_ae_mf_fees','_ae_vz_groups','_ae_hb_here','_ae_hb_posted_all','_hbx_day','_ae_hb_city_actual','_ae_bonds','rx2_accgeneratedraft')) loop
    execute format('revoke all on function %s from public, anon, authenticated', r.sig);
    execute format('grant execute on function %s to service_role', r.sig);
  end loop;
end $$;

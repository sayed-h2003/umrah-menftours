-- 028: getAgentAccount (كشف حساب الوكيل بشاشة الوكلاء) من Postgres — files + items + payments + transportRuns + balance + companies بنفس شكل Code.gs.
-- ⚠️ ما لا يُحسب هنا (يحتاج جداول الحسابات العامة): ledgerPend وحقول glEntry/glVch/glCp ⇒ تعود null/غائبة، والمتصفح يكمّلها بنداء خلفي getAgentAccountExtras (Apps Script) فتظهر أعمدة رقم القيد بعد لحظات.
-- يتطلب 006+007+010+011+019 (_ca_ver). صلاحية visas.finance. أي حالة غير متوقعة ⇒ استثناء ⇒ المتصفح يرجع لـ Apps Script.
create or replace function _vz_am() returns jsonb language sql stable as
$$ select coalesce(jsonb_agg(jsonb_build_object('k', ag || '|' || co, 'agent', ag, 'company', co, 'mode', mo, 'mainCompany', mc, 'active', act) order by first_rn), '[]'::jsonb) from (
    select distinct on (ag, co) ag, co, mo, mc, act, min(rn) over (partition by ag, co) first_rn
      from (select rn, _mf_str(_rx_c(raw, 0)) ag, _mf_str(_rx_c(raw, 1)) co, coalesce(nullif(_mf_str(_rx_c(raw, 2)), ''), 'عام') mo, _mf_str(_rx_c(raw, 3)) mc, _mf_str(_rx_c(raw, 7)) <> 'لا' act
              from _rx_rows('agent_company_accounts')) z where ag <> '' and co <> '' order by ag, co, rn desc) y $$;

-- _mfMs_(_mfDate_(x)) كتاريخ (null = NaN)
create or replace function _vz_d(s text) returns date language plpgsql immutable as
$$ begin if s ~ '^\d{2}/\d{2}/\d{4}$' then return to_date(s, 'DD/MM/YYYY'); end if; return null; exception when others then return null; end $$;

create or replace function _ta_port(v text, isarr boolean) returns text language plpgsql immutable as
$$ declare s text := _rx_trim(regexp_replace(coalesce(v, ''), 'مطار\s*', '', 'g')); parts text[]; begin
  parts := array(select x from unnest(regexp_split_to_array(s, '\s*(?:→|/)\s*')) x where x <> '');
  if coalesce(array_length(parts, 1), 0) >= 2 then return case when isarr then parts[array_length(parts, 1)] else parts[1] end; end if;
  return s; end $$;

create or replace function _ta_segdesc(txt text) returns text language plpgsql immutable as
$$ declare j jsonb; e jsonb; o text := ''; sd text; begin
  if coalesce(txt, '') = '' or _rx_trim(txt) = '' then return ''; end if;
  begin j := txt::jsonb; exception when others then return ''; end;
  if j is null or jsonb_typeof(j) = 'null' then return ''; end if;
  if jsonb_typeof(j) <> 'array' then raise exception 'مقاطع نقل غير صالحة' using errcode = '0A000'; end if;
  for e in select * from jsonb_array_elements(j) loop
    sd := case when jsonb_typeof(e) = 'object' then _rx_trim(_rx_s(e -> 'desc')) else '' end;
    if sd <> '' then o := o || ' + ' || sd; end if;
  end loop;
  return o; end $$;

-- _taReadRowsRaw_ + _vzTransportRunsFor_ : كل دورات نقل الحساب (بلا فلاتر تاريخ/شركة)
create or replace function _vz_runs(p_agent text, am jsonb, tprices jsonb) returns jsonb language plpgsql stable set search_path = public as
$$ #variable_conflict use_column
declare bi jsonb := _rx_map('bookings', _bk_canon()); agpart text := split_part(p_agent, ' - ', 1); res jsonb;
  i_id int := (bi ->> 'رقم الإشعار')::int; i_cl int := (bi ->> 'العميل')::int; i_co int := (bi ->> 'الشركة المصرية')::int; i_tr int := (bi ->> 'اسم الرحلة')::int; i_arr int := (bi ->> 'تاريخ الوصول')::int;
  i_bc int := (bi ->> 'عدد الباصات')::int; i_bp int := (bi ->> 'سعر الباص')::int; i_ag int := (bi ->> 'الوكيل السعودي')::int; i_tc int := (bi ->> 'شركة النقل الداخلي')::int; i_gn int := (bi ->> 'اسم المجموعة')::int;
  i_pa int := (bi ->> 'منفذ الوصول')::int; i_pd int := (bi ->> 'منفذ المغادرة')::int; i_sg int := (bi ->> 'مقاطع نقل إضافية')::int; ovr jsonb;
begin
  select coalesce(jsonb_object_agg(id, jsonb_build_object('sup', sup, 'dsc', dsc, 'notes', notes, 'entryno', entryno)), '{}'::jsonb) into ovr from (
    select distinct on (id) id, sup, dsc, notes, entryno from (
      select rn, _rx_trim(_rx_s(_rx_c(raw, 0))) id, _rx_trim(_rx_s(_rx_c(raw, 1))) sup, _rx_trim(_rx_s(_rx_c(raw, 2))) dsc, _rx_trim(_rx_s(_rx_c(raw, 3))) notes, _rx_trim(_rx_s(_rx_c(raw, 6))) entryno
        from _rx_rows('transport_overrides')) w where id <> '' order by id, rn desc) y;
  with b as (
    select r.rn, r.raw, _rx_trim(_rx_s(_rx_c(r.raw, i_tc))) tc, _rx_s(_rx_c(r.raw, i_id)) bid,
           case when jsonb_typeof(_rx_c(r.raw, i_arr)) = 'object' then to_char(to_timestamp(floor(((_rx_c(r.raw, i_arr)) ->> '$d')::float8 / 1000.0)) at time zone 'Africa/Cairo', 'DD/MM/YYYY') else _rx_s(_rx_c(r.raw, i_arr)) end arr
      from _rx_rows('bookings') r),
  c as (
    select b.*, case when tc = 'الوكيل' then _rx_s(_rx_c(raw, i_ag)) when tc = 'النقل بمعرفة العميل' then '' else tc end sup0, coalesce(_vz_pf(_rx_c(raw, i_bp)), 0) bp0 from b where tc <> ''),
  d as (
    select c.*, (case when bp0 = 0 and tc = 'الوكيل' and sup0 <> '' then coalesce(_vz_price_at(sup0, arr, tprices), 0) else 0 end) dflt from c),
  e as (
    select d.*, (case when dflt <> 0 then dflt else bp0 end) bp1, (dflt <> 0) pdef0,
           (case when _rx_trim(_rx_s(_rx_c(raw, i_gn))) <> '' then _rx_trim(_rx_s(_rx_c(raw, i_gn))) || ' + ' else '' end) || 'دورة نقل ' || coalesce(nullif(_ta_port(_rx_s(_rx_c(raw, i_pa)), true), ''), '؟') || ' - '
             || coalesce(nullif(_ta_port(_rx_s(_rx_c(raw, i_pd)), false), ''), '؟') || _ta_segdesc(_rx_s(_rx_c(raw, i_sg))) dsc0,
           ovr -> bid ov from d),
  f as (
    select e.rn, e.bid, e.arr, _rx_s(_rx_c(raw, i_cl)) cl, _rx_s(_rx_c(raw, i_co)) co, _rx_s(_rx_c(raw, i_tr)) trip, _mf_num(_rx_c(raw, i_bc)) bc,
           coalesce(nullif(ov ->> 'sup', ''), sup0) sup, coalesce(nullif(ov ->> 'dsc', ''), dsc0) dsc, coalesce(ov ->> 'notes', '') notes, coalesce(ov ->> 'entryno', '') entryno, bp1, pdef0 from e),
  g as (
    select f.*, (case when bp1 = 0 then coalesce(_vz_price_at(agpart, arr, tprices), 0) else bp1 end) bp2,
           (case when bp1 = 0 then coalesce(_vz_price_at(agpart, arr, tprices), 0) <> 0 else pdef0 end) pdef2 from f
     where _mf_strt(sup) <> '' and (_mf_strt(sup) = p_agent or _vz_key_calc(_mf_strt(sup), co, am) = p_agent))
  select coalesce(jsonb_agg(jsonb_build_object('unpriced', (bp2 = 0 and bc > 0), 'id', bid, 'date', arr, 'groupRef', 'نقل ' || bid, 'entryNo', entryno,
           'desc', 'دورة نقل ' || (case when trip <> '' then trip when cl <> '' then cl else '—' end) || ' (' || bc::text || ' × ' || bp2::text || ')' || case when pdef2 then ' — سعر افتراضي' else '' end
                   || case when (bp2 = 0 and bc > 0) then ' — ⚠️ بلا سعر (سجّل فترة تسعير النقل للوكيل)' else '' end,
           'busCount', bc, 'busPrice', bp2, 'priceIsDefault', pdef2, 'value', bc * bp2, 'client', cl, 'tripName', trip, 'company', co, 'supplier', sup, 'rawDesc', dsc, 'notes', notes) order by rn), '[]'::jsonb) into res from g;
  return res; end $$;

create or replace function rx2_getagentaccount(a jsonb, u text) returns jsonb language plpgsql stable set search_path = public as
$$ #variable_conflict use_column
declare
  agent text := _mf_strt(_rx_s(a -> 1)); fl jsonb := case when jsonb_typeof(a -> 2) = 'object' then a -> 2 else '{}'::jsonb end;
  am jsonb := _vz_am(); tprices jsonb := _vz_prices('vz_transport_prices'); keys text[]; subs text[]; k text;
  d_from date := _vz_d(_mf_date(to_jsonb(coalesce(fl ->> 'from', '')))); d_to date := _vz_d(_mf_date(to_jsonb(coalesce(fl ->> 'to', ''))));
  compf text := _mf_str(to_jsonb(coalesce(fl ->> 'company', ''))); statf text := _mf_str(to_jsonb(coalesce(fl ->> 'status', '')));
  files jsonb; items jsonb; pays jsonb; runs jsonb; comps jsonb; tdeb float8; vis float8; dueS float8; dueE float8 := 0; credS float8 := 0; credE float8 := 0; paidS float8 := 0; paidE float8 := 0; e jsonb; v float8;
begin
  if not app_has('visas.finance') then raise exception 'لا تملك صلاحية الحسابات المالية' using errcode = '42501'; end if;
  if agent = '' then return jsonb_build_object('success', false, 'error', 'اسم الوكيل مطلوب'); end if;
  keys := array[agent];
  if position(' - ' in agent) = 0 then
    select coalesce(array_agg(key), '{}') into subs from (
      select distinct _vz_key_calc(e ->> 'agent', e ->> 'company', am) key from jsonb_array_elements(am) e
       where (e ->> 'mode') <> 'عام' and (e ->> 'agent') = agent
         and exists (select 1 from jsonb_array_elements(am) e2 where (e2 ->> 'mode') <> 'عام' and (e2 ->> 'active') = 'true'
                        and _vz_key_calc(e2 ->> 'agent', e2 ->> 'company', am) = _vz_key_calc(e ->> 'agent', e ->> 'company', am))) q;
    foreach k in array subs loop if not (k = any(keys)) then keys := keys || k; end if; end loop;
  end if;

  select coalesce(jsonb_agg(f || jsonb_build_object('clientsLabel', (select coalesce(string_agg((b ->> 'name') || case when _gs_truthy(b -> 'count') then ' (' || _rx_s(b -> 'count') || ')' else '' end, '، ' order by o), '')
                                                                 from jsonb_array_elements(f -> 'breakdown') with ordinality t(b, o)))
                      order by (case when _vz_d(f ->> 'date') is null then 0 else (_vz_d(f ->> 'date') - date '1970-01-01') end), rn), '[]'::jsonb) into files
    from _vz_files() v(rn, f)
   where (f ->> 'agent') <> '' and ((f ->> 'agent') = agent or _vz_key_calc(f ->> 'agent', f ->> 'company', am) = agent)
     and (case when _vz_d(f ->> 'date') is null then (d_from is null and d_to is null) else ((d_from is null or _vz_d(f ->> 'date') >= d_from) and (d_to is null or _vz_d(f ->> 'date') <= d_to)) end)
     and (compf = '' or (f ->> 'company') = compf) and (statf = '' or (f ->> 'status') = statf);

  select coalesce(jsonb_agg(o order by rn), '[]'::jsonb) into items from (
    select rn, jsonb_build_object('id', _mf_str(_rx_c(raw, 0)), 'agent', _mf_str(_rx_c(raw, 1)), 'desc', _mf_str(_rx_c(raw, 2)), 'currency', coalesce(nullif(_mf_str(_rx_c(raw, 3)), ''), 'SAR'),
             'value', _ac_num(_rx_c(raw, 4)), 'isCredit', _mf_str(_rx_c(raw, 5)) = 'نعم', 'notes', n2, 'order', _ac_num(_rx_c(raw, 7)), 'createdBy', _mf_str(_rx_c(raw, 8)),
             'createdAt', _mf_datetime(_rx_c(raw, 9)), 'entryNo', _mf_str(_rx_c(raw, 10)),
             'date', coalesce(nullif(_mf_date(_rx_c(raw, 11)), ''), _mf_date(to_jsonb(split_part(coalesce(_mf_datetime(_rx_c(raw, 9)), ''), ' ', 1)))))
           || case when g <> '' then jsonb_build_object('glId', g) else '{}'::jsonb end o
      from (select rn, raw, (regexp_match(_mf_str(_rx_c(raw, 6)), '⟦src:gl-([^⟧]+)⟧'))[1] g0 from _rx_rows('vz_items')) r
      cross join lateral (select coalesce(g0, '') g, case when g0 is not null then _rx_trim(regexp_replace(_mf_str(_rx_c(raw, 6)), '\s*⟦src:gl-[^⟧]+⟧\s*', ' ', 'g')) else _mf_str(_rx_c(raw, 6)) end n2) z
     where _mf_str(_rx_c(raw, 0)) <> '' and _mf_str(_rx_c(raw, 1)) = any(keys)) q;

  select coalesce(jsonb_agg(o order by (case when _vz_d(o ->> 'date') is null then 0 else (_vz_d(o ->> 'date') - date '1970-01-01') end), rn), '[]'::jsonb) into pays from (
    select rn, jsonb_build_object('id', _mf_str(_rx_c(raw, 0)), 'agent', _mf_str(_rx_c(raw, 1)), 'date', _mf_date(_rx_c(raw, 2)), 'amount', _ac_num(_rx_c(raw, 3)), 'currency', coalesce(nullif(_mf_str(_rx_c(raw, 4)), ''), 'SAR'),
             'notes', n2, 'createdBy', _mf_str(_rx_c(raw, 6)), 'createdAt', _mf_str(_rx_c(raw, 7)), 'entryNo', _mf_str(_rx_c(raw, 8)),
             'ver', _ca_ver(jsonb_build_array(_mf_str(_rx_c(raw, 0)), _mf_str(_rx_c(raw, 1)), _mf_date(_rx_c(raw, 2)), (_ac_num(_rx_c(raw, 3)))::text, coalesce(nullif(_mf_str(_rx_c(raw, 4)), ''), 'SAR'), _mf_str(_rx_c(raw, 5)), _mf_str(_rx_c(raw, 8))), 7))
           || case when g <> '' then jsonb_build_object('glId', g) else '{}'::jsonb end o
      from (select rn, raw, (regexp_match(_mf_str(_rx_c(raw, 5)), '⟦src:gl-([^⟧]+)⟧'))[1] g0 from _rx_rows('vz_payments')) r
      cross join lateral (select coalesce(g0, '') g, case when g0 is not null then _rx_trim(regexp_replace(_mf_str(_rx_c(raw, 5)), '\s*⟦src:gl-[^⟧]+⟧\s*', ' ', 'g')) else _mf_str(_rx_c(raw, 5)) end n2) z
     where _mf_str(_rx_c(raw, 0)) <> '' and _mf_str(_rx_c(raw, 1)) = any(keys)
       and (case when _vz_d(_mf_date(_rx_c(raw, 2))) is null then (d_from is null and d_to is null) else ((d_from is null or _vz_d(_mf_date(_rx_c(raw, 2))) >= d_from) and (d_to is null or _vz_d(_mf_date(_rx_c(raw, 2))) <= d_to)) end)) q;

  select coalesce(jsonb_agg(c order by c collate "C"), '[]'::jsonb) into comps from (select distinct f ->> 'company' c from jsonb_array_elements(files) f where (f ->> 'company') <> '') z;
  runs := _vz_runs(agent, am, tprices);
  select coalesce(sum((r ->> 'value')::float8), 0) into tdeb from jsonb_array_elements(runs) r
   where (compf = '' or (r ->> 'company') = compf)
     and (case when _vz_d(r ->> 'date') is null then (d_from is null and d_to is null) else ((d_from is null or _vz_d(r ->> 'date') >= d_from) and (d_to is null or _vz_d(r ->> 'date') <= d_to)) end);
  select coalesce(sum((f ->> 'visaCount')::float8 * (f ->> 'price')::float8), 0) into vis from jsonb_array_elements(files) f;
  dueS := vis + tdeb;
  for e in select * from jsonb_array_elements(items) loop
    v := (e ->> 'value')::float8;
    if (e ->> 'isCredit') = 'true' then if (e ->> 'currency') <> 'EGP' then credS := credS + v; else credE := credE + v; end if;
    else if (e ->> 'currency') <> 'EGP' then dueS := dueS + v; else dueE := dueE + v; end if; end if;
  end loop;
  for e in select * from jsonb_array_elements(pays) loop
    v := (e ->> 'amount')::float8; if (e ->> 'currency') = 'EGP' then paidE := paidE + v; else paidS := paidS + v; end if;
  end loop;
  return jsonb_build_object('success', true, 'agent', agent, 'files', files, 'items', items, 'payments', pays, 'transportRuns', runs, 'companies', comps, 'statuses', '["تم الإرسال","تم إصدار الموفا"]'::jsonb,
    'filters', jsonb_build_object('from', _mf_date(to_jsonb(coalesce(fl ->> 'from', ''))), 'to', _mf_date(to_jsonb(coalesce(fl ->> 'to', ''))), 'company', compf, 'status', statf),
    'balance', jsonb_build_object('visaDueS', vis, 'transportDueS', tdeb, 'dueS', dueS, 'dueE', dueE, 'credS', credS, 'credE', credE, 'paidS', paidS, 'paidE', paidE,
                'netS', _gs_r2(dueS - credS - paidS), 'netE', _gs_r2(dueE - credE - paidE)),
    'ledgerPend', null, 'glExtras', true);
end $$;
revoke all on function rx2_getagentaccount(jsonb, text), _vz_runs(text, jsonb, jsonb) from public, anon, authenticated;
grant execute on function rx2_getagentaccount(jsonb, text), _vz_runs(text, jsonb, jsonb), _vz_am(), _vz_d(text), _ta_port(text, boolean), _ta_segdesc(text) to service_role;

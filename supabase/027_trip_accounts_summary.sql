-- 027: getTripAccountsSummary (كشف الرحلة — ملخص حسابات عملاء رحلة) من Postgres — نفس JSON الدالة بـ Code.gs (بيان الحساب + الأرصدة + شلال الحسابات المدمجة).
-- للقراءة فقط. يتطلب 006+007+012. أي حالة غير متوقعة ⇒ استثناء ⇒ المتصفح يرجع لـ Apps Script.
create or replace function _gs_truthy(c jsonb) returns boolean language sql immutable as
$$ select c is not null and c <> 'null'::jsonb and c <> '""'::jsonb and c <> '0'::jsonb and c <> 'false'::jsonb $$;
create or replace function _gs_r2(x float8) returns float8 language sql immutable as $$ select floor(x * 100 + 0.5) / 100 $$;

-- _accTripStatement_(rawItems): items = [{desc,currency,count(raw),price(raw),value,isDiscount,isDirect,nights,order}] بترتيب الشيت
create or replace function _acc_trip_statement(items jsonb) returns text language plpgsql immutable as
$$ declare out_ text := ''; e record; cur text; nt text; qty text; txt text; dn text; first_ boolean := true; begin
  for e in
    select x, i from jsonb_array_elements(items) with ordinality t(x, i)
     where not ((x ->> 'isDiscount') = 'true' and coalesce((x ->> 'value')::float8, 0) = 0)
     order by ((x ->> 'isDiscount') = 'true'), coalesce((x ->> 'order')::float8, 0), i
  loop
    -- ترتيب _accOrderStatementItems_: غير الخصم بترتيب order ثم الخصم بترتيب order (فرز مستقر)
    cur := case when (e.x ->> 'currency') = 'SAR' then 'ريال' else 'جنيه' end;
    nt := case when coalesce((e.x ->> 'nights')::float8, 0) > 0 then ' × ' || ((e.x ->> 'nights')::float8)::text || ' ليلة' else '' end;
    qty := case when (e.x ->> 'isDirect') <> 'true' and _gs_truthy(e.x -> 'count')
                then _rx_s(e.x -> 'count') || nt || case when _gs_truthy(e.x -> 'price') then ' × ' || _rx_s(e.x -> 'price') else '' end else '' end;
    if qty <> '' then txt := (e.x ->> 'desc') || ' ' || qty || ' ' || cur;
    elsif _gs_truthy(e.x -> 'price') then txt := (e.x ->> 'desc') || ' ' || _rx_s(e.x -> 'price') || ' ' || cur;
    else txt := (e.x ->> 'desc') || ' ' || ((e.x ->> 'value')::float8)::text || ' ' || cur; end if;
    dn := regexp_replace(coalesce(e.x ->> 'desc', ''), E'^[\\s‎‏؜\\-–—]+', '');
    if (e.x ->> 'isDiscount') = 'true' and dn !~ E'^خصم($|[\\s:،.\\-–—])' then txt := 'خصم ' || txt; end if;
    out_ := out_ || case when first_ then '' when (e.x ->> 'isDiscount') = 'true' then ' − ' else ' + ' end || txt;
    first_ := false;
  end loop;
  return out_; end $$;

create or replace function rx2_gettripaccountssummary(a jsonb, u text) returns jsonb language plpgsql stable set search_path = public as
$$ #variable_conflict use_column
declare
  tn text := _rx_trim(_rx_s(a -> 1)); pm jsonb := _rx_map('pilgrims', _rx_h_pil()); tm jsonb := _rx_map('trips', _rx_h_trips());
  merged jsonb := '{}'::jsonb; mgs jsonb; td jsonb; c record; mt record; r jsonb; availE float8; availS float8; allocE float8; allocS float8; dE float8; dS float8; pE float8; pS float8; res jsonb; pooled jsonb; allp jsonb;
begin
  perform _acc_perm_view();
  if tn = '' then return jsonb_build_object('success', false, 'error', 'اسم الرحلة مطلوب'); end if;

  select coalesce(jsonb_agg(jsonb_build_object('cl', cl, 'trips', trips) order by cl), '[]'::jsonb) into mgs from (
    select distinct on (cl) cl, trips from (
      select rn, _rx_trim(_rx_s(_rx_c(raw, 0))) cl, _rx_json(_rx_s(_rx_c(raw, 1))) trips from _rx_rows('acc_merge_groups')) q
     where cl <> '' and jsonb_typeof(trips) = 'array' and trips ? tn order by cl, rn desc) w;

  -- الحسابات المدمجة: شلال توزيع الدفعات على رحلات المجموعة بترتيب تاريخ السفر
  for c in select x ->> 'cl' cl, x -> 'trips' trips from jsonb_array_elements(mgs) x loop
    select coalesce(jsonb_agg(jsonb_build_object('trip', t, 'dueE', de, 'dueS', ds, 'frn', frn, 'dep', coalesce((
              select max(case when jsonb_typeof(_rx_c(raw, _rx_ix(tm, 'تاريخ الذهاب'))) = 'object' then ((_rx_c(raw, _rx_ix(tm, 'تاريخ الذهاب'))) ->> '$d')::float8
                              else _acc_parse_d(_rx_s(_rx_c(raw, _rx_ix(tm, 'تاريخ الذهاب')))) end)
                from _rx_rows('trips') where _rx_trim(_rx_s(_rx_c(raw, _rx_ix(tm, 'اسم الرحلة')))) = g.t), 0))), '[]'::jsonb) into td
      from (select t, sum(case when cur = 'SAR' then 0 else sv end) de, sum(case when cur = 'SAR' then sv else 0 end) ds, min(rn) frn
              from (select rn, _rx_trim(_rx_s(_rx_c(raw, 2))) t, coalesce(nullif(_rx_s(_rx_c(raw, 5)), ''), 'EGP') cur,
                           (case when _vz_s(_rx_c(raw, 9)) = 'نعم' then -1 else 1 end) * _ac_num(_rx_c(raw, 8)) sv
                      from _rx_rows('acc_items') where _rx_trim(_rx_s(_rx_c(raw, 1))) = c.cl) z
             where c.trips ? t group by t) g;
    select coalesce(jsonb_agg(x), '[]'::jsonb) into pooled from (
      select jsonb_build_object('value', abs((e ->> 'dueE')::float8), 'currency', 'EGP', 'isDiscount', (e ->> 'dueE')::float8 < 0) x from jsonb_array_elements(td) e where (e ->> 'dueE')::float8 <> 0
      union all select jsonb_build_object('value', abs((e ->> 'dueS')::float8), 'currency', 'SAR', 'isDiscount', (e ->> 'dueS')::float8 < 0) from jsonb_array_elements(td) e where (e ->> 'dueS')::float8 <> 0) q;
    -- الدفعات: هذه الرحلة ثم العامة ثم رحلات المجموعة الأخرى (كل مجموعة بترتيب الشيت)
    select coalesce(jsonb_agg(o order by g, rn), '[]'::jsonb) into allp from (
      select (case when pt = tn then 1 when pt = 'عام' then 2 else 3 end) g, rn, o from (
        select rn, _rx_trim(_rx_s(_rx_c(raw, 2))) pt, jsonb_build_object('ptype', coalesce(nullif(_rx_s(_rx_c(raw, 3)), ''), 'دفعة'), 'date', _rx_s(_rx_c(raw, 4)), 'amount', _ac_num(_rx_c(raw, 5)),
               'currency', coalesce(nullif(_rx_s(_rx_c(raw, 6)), ''), 'EGP'), 'rate', _ac_num(_rx_c(raw, 7))) o
          from _rx_rows('acc_payments') where _rx_trim(_rx_s(_rx_c(raw, 1))) = c.cl) z
       where pt = tn or pt = 'عام' or c.trips ? pt) q;
    r := _acc_calc(pooled, allp);
    availE := _gs_r2((r ->> 'paidE')::float8 - (r ->> 'fxE')::float8);
    availS := _gs_r2((r ->> 'paidS')::float8 + (r ->> 'fxS')::float8);
    dE := 0; dS := 0; pE := 0; pS := 0;
    for mt in select e ->> 'trip' trip, (e ->> 'dueE')::float8 dueE, (e ->> 'dueS')::float8 dueS from jsonb_array_elements(td) e order by (e ->> 'dep')::float8, (e ->> 'frn')::int loop
      allocE := greatest(0, least(availE, mt.dueE)); availE := _gs_r2(availE - allocE);
      allocS := greatest(0, least(availS, mt.dueS)); availS := _gs_r2(availS - allocS);
      if mt.trip = tn then dE := mt.dueE; dS := mt.dueS; pE := allocE; pS := allocS; end if;
    end loop;
    merged := merged || jsonb_build_object(c.cl, jsonb_build_object('dueE', _gs_r2(dE), 'dueS', _gs_r2(dS), 'paidE', pE, 'paidS', pS));
  end loop;

  with it as (select rn, _rx_trim(_rx_s(_rx_c(raw, 1))) cl, raw from _rx_rows('acc_items') where _rx_trim(_rx_s(_rx_c(raw, 2))) = tn and _rx_trim(_rx_s(_rx_c(raw, 1))) <> ''),
       py as (select rn, _rx_trim(_rx_s(_rx_c(raw, 1))) cl, raw from _rx_rows('acc_payments') where _rx_trim(_rx_s(_rx_c(raw, 2))) = tn and _rx_trim(_rx_s(_rx_c(raw, 1))) <> ''),
       pl as (select _rx_trim(_rx_s(_rx_c(raw, _rx_ix(pm, 'العميل')))) cl, _rx_trim(_rx_s(_rx_c(raw, _rx_ix(pm, 'النوع')))) ty
                from _rx_rows('pilgrims') where _rx_trim(_rx_s(_rx_c(raw, _rx_ix(pm, 'اسم الرحلة')))) = tn),
       cn as (select cl, count(*) filter (where ty = 'ذكر') men, count(*) filter (where ty = 'أنثى') women, count(*) filter (where ty = 'طفل') children, count(*) filter (where ty = 'رضيع') infants
                from pl where cl <> '' and left(cl, 6) <> 'المشرف' group by cl),
       ia as (select cl, jsonb_agg(jsonb_build_object('desc', regexp_replace(_rx_s(_rx_c(raw, 3)), E'\\s*⟦(?:cf|src):[^⟧]+⟧\\s*$', '', 'i'), 'currency', coalesce(nullif(_rx_s(_rx_c(raw, 5)), ''), 'EGP'),
                      'count', _rx_c(raw, 6), 'price', _rx_c(raw, 7), 'value', _ac_num(_rx_c(raw, 8)), 'isDiscount', _vz_s(_rx_c(raw, 9)) = 'نعم', 'isDirect', _vz_s(_rx_c(raw, 19)) = 'نعم',
                      'nights', coalesce(nullif(_ac_num(_rx_c(raw, 15)), 0), 0), 'order', _ac_num(_rx_c(raw, 18))) order by rn) a from it group by cl),
       pa as (select cl, jsonb_agg(jsonb_build_object('ptype', coalesce(nullif(_rx_s(_rx_c(raw, 3)), ''), 'دفعة'), 'date', _rx_s(_rx_c(raw, 4)), 'amount', _ac_num(_rx_c(raw, 5)),
                      'currency', coalesce(nullif(_rx_s(_rx_c(raw, 6)), ''), 'EGP'), 'rate', _ac_num(_rx_c(raw, 7))) order by rn) a from py group by cl),
       allc as (select cl from cn union select cl from ia union select cl from pa),
       rows as (select allc.cl, coalesce(cn.men, 0) men, coalesce(cn.women, 0) women, coalesce(cn.children, 0) children, coalesce(cn.infants, 0) infants,
                       coalesce(ia.a, '[]'::jsonb) items, coalesce(pa.a, '[]'::jsonb) pays
                  from allc left join cn using (cl) left join ia using (cl) left join pa using (cl)),
       fin as (select cl, men, women, children, infants, items, pays, (jsonb_array_length(items) > 0 or jsonb_array_length(pays) > 0) has, (merged ? cl) mg,
                      case when jsonb_array_length(items) > 0 or jsonb_array_length(pays) > 0 then _acc_calc(items, pays) end t from rows)
  select coalesce(jsonb_agg(jsonb_build_object('client', cl, 'men', men, 'women', women, 'children', children, 'infants', infants,
           'statementText', _acc_trip_statement(items), 'hasAccount', has, 'merged', mg,
           'dueE', case when not has then 0 when mg then (merged -> cl ->> 'dueE')::float8 else _gs_r2((t ->> 'dueE')::float8 - (t ->> 'discE')::float8 + (t ->> 'fxE')::float8) end,
           'dueS', case when not has then 0 when mg then (merged -> cl ->> 'dueS')::float8 else _gs_r2((t ->> 'dueS')::float8 - (t ->> 'discS')::float8) end,
           'paidE', case when not has then 0 when mg then (merged -> cl ->> 'paidE')::float8 else _gs_r2((t ->> 'paidE')::float8) end,
           'paidS', case when not has then 0 when mg then (merged -> cl ->> 'paidS')::float8 else _gs_r2((t ->> 'paidS')::float8 + (t ->> 'fxS')::float8) end,
           'netE', case when not has then 0 when mg then _gs_r2(_gs_r2((merged -> cl ->> 'dueE')::float8) - (merged -> cl ->> 'paidE')::float8) else _gs_r2((t ->> 'netE')::float8) end,
           'netS', case when not has then 0 when mg then _gs_r2(_gs_r2((merged -> cl ->> 'dueS')::float8) - (merged -> cl ->> 'paidS')::float8) else _gs_r2((t ->> 'netS')::float8) end)
         order by cl collate "C"), '[]'::jsonb) into res from fin;
  return jsonb_build_object('success', true, 'trip', tn, 'rows', res);
end $$;
revoke all on function rx2_gettripaccountssummary(jsonb, text), _acc_trip_statement(jsonb) from public, anon, authenticated;
grant execute on function rx2_gettripaccountssummary(jsonb, text), _acc_trip_statement(jsonb), _gs_truthy(jsonb), _gs_r2(float8) to service_role;

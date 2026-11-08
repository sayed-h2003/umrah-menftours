-- 011_visa_reads.sql — (V4.378) قراءات التأشيرات والوكلاء من Postgres: getVisaBootstrap · getVisaTripLinks
-- نفس JSON الذي ترجعه getVisaBootstrap/getVisaTripLinks بـ Code.gs حرفياً:
--   • files (+dueSAR) · prices · transportPrices · companies/trips/clients (القوائم المرجعية نفسها لبوتستراب الوزارة = _mf_reflists)
--   • agents (مرتَّبة) · accounts (_vzAcctKeys_) · acctRows · agentBalances (_vzAgentBalance_ لكل مفتاح حساب، شاملةً دورات النقل
--     _vzTransportRunsFor_ بسعر الدورة اليدوي أو سعر فترة تسعير النقل السارية بتاريخ الوصول) · cateringByGroup · housingByGroup · today
--   • الجانب المالي (visas.finance): بدونه prices/transportPrices فارغتان وagentBalances {} وprice/dueSAR = 0 بكل ملف — كالخادم.
-- أعمدة VisaFiles/الأسعار/البنود/الدفعات/الحسابات/الاتفاقيات تُقرأ بالموضع (كالخادم)؛ شيت Bookings (دورات النقل) بالاسم (idx[h] = آخر ظهور للعنوان كـ _taReadRowsRaw_).
-- يتطلب 006 + 007 + 008 + 010 (rx_call2 و _mf_* و app_kv). آمن لإعادة التشغيل. لا يكتب شيئاً.

-- ===== أدوات =====
create or replace function _vz_ws() returns text language sql immutable as $$ select '[\s ﻿    -   　]+' $$;

-- JSON.parse(_mfStr_(x) || '[]') ⇒ مصفوفة وإلا []  (يُطبَّع الرقم العربي داخل النص كما _mfStr_)
create or replace function _vz_arr(c jsonb) returns jsonb language plpgsql immutable as
$$ declare t text := _mf_str(c); r jsonb; begin
  if t = '' then return '[]'::jsonb; end if;
  r := _rx_json(t); if jsonb_typeof(r) = 'array' then return r; end if; return '[]'::jsonb; end $$;
create or replace function _vz_status(c jsonb) returns text language sql immutable as
$$ select case when _mf_str(c) = '' or _mf_str(c) = 'تم السداد' then 'تم الإرسال' else _mf_str(c) end $$;

create or replace function _vz_row_obj(r jsonb) returns jsonb language sql stable as
$$ select jsonb_build_object('id', _mf_str(_rx_c(r, 0)), 'seq', _mf_num(_rx_c(r, 1)), 'ref', _mf_str(_rx_c(r, 2)), 'status', _vz_status(_rx_c(r, 3)),
    'date', _mf_date(_rx_c(r, 4)), 'company', _mf_str(_rx_c(r, 5)), 'agent', _mf_str(_rx_c(r, 6)), 'tripName', _mf_str(_rx_c(r, 7)),
    'breakdown', _vz_arr(_rx_c(r, 8)), 'selected', _vz_arr(_rx_c(r, 9)), 'visaCount', _mf_num(_rx_c(r, 10)), 'price', _mf_num(_rx_c(r, 11)), 'notes', _mf_str(_rx_c(r, 12)),
    'createdBy', _mf_str(_rx_c(r, 13)), 'createdAt', _mf_datetime(_rx_c(r, 14)), 'updatedBy', _mf_str(_rx_c(r, 15)), 'updatedAt', _mf_datetime(_rx_c(r, 16)))
  || jsonb_build_object('payStatus', case when _mf_str(_rx_c(r, 17)) = 'تم السداد' then '' else _mf_str(_rx_c(r, 17)) end,
    'makkahIn', _mf_date(_rx_c(r, 18)), 'makkahOut', _mf_date(_rx_c(r, 19)), 'madinahIn', _mf_date(_rx_c(r, 20)), 'madinahOut', _mf_date(_rx_c(r, 21)),
    'makkahHousingAgr', _mf_str(_rx_c(r, 22)), 'madinahHousingAgr', _mf_str(_rx_c(r, 23)), 'makkahCateringAgr', _mf_str(_rx_c(r, 24)), 'madinahCateringAgr', _mf_str(_rx_c(r, 25)),
    'housing', _vz_arr(_rx_c(r, 26)), 'entryNo', _mf_str(_rx_c(r, 27)), 'extraTrips', _mf_str(_rx_c(r, 28))) $$;

-- _vzReadAll_ (+dueSAR كما بوتستراب التأشيرات؛ بلا _row)
create or replace function _vz_files() returns table (rn int, f jsonb) language sql stable as
$$ select r.rn, o.f || jsonb_build_object('dueSAR', (o.f ->> 'visaCount')::float8 * (o.f ->> 'price')::float8)
     from _rx_rows('vz_files') r cross join lateral (select _vz_row_obj(r.raw) f) o where _mf_str(_rx_c(r.raw, 0)) <> '' order by r.rn $$;

-- أسعار الوكلاء/النقل (مع _row)
create or replace function _vz_prices(p_tbl text) returns jsonb language sql stable as
$$ select coalesce(jsonb_agg(jsonb_build_object('agent', _mf_str(_rx_c(raw, 0)), 'price', _mf_num(_rx_c(raw, 1)), 'from', _mf_date(_rx_c(raw, 2)), 'to', _mf_date(_rx_c(raw, 3)), '_row', rn) order by rn), '[]'::jsonb)
     from _rx_rows(p_tbl) where _mf_str(_rx_c(raw, 0)) <> '' $$;
-- _vzPriceAt_/_vzTransportPriceAt_: أحدث فترة تحتوي التاريخ (>= عند التعادل ⇒ الأخير)، وإلا 0
create or replace function _vz_price_at(p_agent text, p_date text, prices jsonb) returns float8 language plpgsql immutable as
$$ declare a text := _mf_strt(p_agent); t float8 := _mf_ms(_mf_datet(p_date)); p jsonb; fm float8; tm float8; best float8; bf float8 := -1; begin
  if a = '' or t is null then return 0; end if;
  for p in select * from jsonb_array_elements(prices) loop
    if _mf_strt(p ->> 'agent') <> a then continue; end if;
    fm := _mf_ms(p ->> 'from'); if fm is null then continue; end if;
    tm := case when coalesce(p ->> 'to', '') <> '' then _mf_ms(p ->> 'to') else 8640000000000000 end; if tm is null then tm := 8640000000000000; end if;
    if t >= fm and t <= tm and fm >= bf then best := (p ->> 'price')::float8; bf := fm; end if;
  end loop;
  return coalesce(best, 0); end $$;

-- مفتاح الحساب لزوج (وكيل، شركة): am = [{k, agent, company, mode, mainCompany, active}] بترتيب أول ظهور (آخر صف يغلب القيم)
create or replace function _vz_key_calc(p_agent text, p_company text, am jsonb) returns text language plpgsql immutable as
$$ declare ag text := _mf_strt(p_agent); co text := _mf_strt(p_company); c jsonb; e jsonb; nc text; ncfg text; begin
  if ag = '' then return ''; end if;
  select x into c from jsonb_array_elements(am) x where x ->> 'k' = ag || '|' || co limit 1;
  if c is null then
    nc := regexp_replace(co, _vz_ws(), '', 'g');
    if nc <> '' then
      for e in select * from jsonb_array_elements(am) loop
        if (e ->> 'agent') <> ag or (e ->> 'company') = '' then continue; end if;
        ncfg := regexp_replace(e ->> 'company', _vz_ws(), '', 'g');
        if ncfg <> '' and (position(ncfg in nc) > 0 or position(nc in ncfg) > 0) then c := e; exit; end if;
      end loop;
    end if;
  end if;
  if c is null or (c ->> 'mode') = 'عام' then return ag; end if;
  if (c ->> 'mode') = 'مشترك' then return ag || ' - ' || coalesce(nullif(c ->> 'mainCompany', ''), c ->> 'company'); end if;
  return ag || ' - ' || (c ->> 'company'); end $$;

-- _agrNosSplit_: String(s).split(/[،,\/\s\-–—+&]+/).map(_mfStr_).filter(String)
create or replace function _vz_agr_split(s text) returns text[] language sql immutable as
$$ select coalesce(array_agg(t order by o), '{}') from (select _mf_strt(x) t, o from unnest(regexp_split_to_array(coalesce(s, ''), '[،,/\s\-–—+&]+')) with ordinality a(x, o)) y where t <> '' $$;
create or replace function _vz_s(c jsonb) returns text language sql immutable as   -- String(c == null ? '' : c)
$$ select case jsonb_typeof(c) when 'string' then c #>> '{}' when 'number' then c #>> '{}' when 'boolean' then c #>> '{}' else '' end $$;

-- _vzCateringByGroup_ (CateringContracts موضعياً: رقم الاتفاقية 0 · منطقة الخدمة 2 · رقم المجموعة 11)
create or replace function _vz_catering_by_group() returns jsonb language sql stable as
$$ with x as (select r.rn, g, _mf_str(_rx_c(r.raw, 0)) no,
                case when position('مكة' in _mf_str(_rx_c(r.raw, 2))) > 0 or position('مكه' in _mf_str(_rx_c(r.raw, 2))) > 0 then 'makkah'
                     when position('مدين' in _mf_str(_rx_c(r.raw, 2))) > 0 then 'madinah' else 'other' end city
                from _rx_rows('catering_contracts') r, unnest(_vz_agr_split(_vz_s(_rx_c(r.raw, 11)))) with ordinality gg(g, o)
               where _mf_str(_rx_c(r.raw, 0)) <> ''),
   u as (select g, city, no, min(rn) m from x group by g, city, no),
   gc as (select g, city, jsonb_agg(no order by m) arr from u group by g, city)
   select coalesce(jsonb_object_agg(g, o), '{}'::jsonb) from (
     select g, jsonb_build_object('makkah', coalesce((array_agg(arr) filter (where city = 'makkah'))[1], '[]'::jsonb),
            'madinah', coalesce((array_agg(arr) filter (where city = 'madinah'))[1], '[]'::jsonb),
            'other', coalesce((array_agg(arr) filter (where city = 'other'))[1], '[]'::jsonb)) o from gc group by g) z $$;

-- _vzHousingAgrByGroup_: اتفاقيات السكن/الإعاشة المخصَّصة لكل مجموعة (HousingAgreements + HousingAllocations)
create or replace function _vz_housing_by_group() returns jsonb language sql stable as
$$ with ag as (select distinct on (id) id, case when _mf_str(_rx_c(raw, 3)) = 'المدينة' then 'madinah' else 'makkah' end city,
                  case when coalesce(nullif(_mf_str(_rx_c(raw, 15)), ''), 'سكن') = 'إعاشة' then 'catering' else 'housing' end kind,
                  _mf_str(_rx_c(raw, 2)) agr_no, _mf_str(_rx_c(raw, 4)) hotel, _mf_str(_rx_c(raw, 14)) supplier
                from (select raw, rn, _mf_str(_rx_c(raw, 0)) id from _rx_rows('vz_housing_agreements')) z where id <> '' order by id, rn desc),
   al as (select r.rn, o, g, a.city, a.kind, a.agr_no, a.hotel, a.supplier, _mf_num(_rx_c(r.raw, 3)) cnt, _mf_date(_rx_c(r.raw, 4)) dfrom, _mf_date(_rx_c(r.raw, 5)) dto
            from _rx_rows('vz_housing_allocations') r join ag a on a.id = _mf_str(_rx_c(r.raw, 1)),
                 unnest(_vz_agr_split(_mf_str(_rx_c(r.raw, 2)))) with ordinality gg(g, o)
           where _mf_str(_rx_c(r.raw, 0)) <> ''),
   bk as (select *, case when kind = 'catering' then city || 'Catering' else city end bucket from al),
   dd as (select distinct on (g, bucket, agr_no) g, bucket, agr_no, rn, o, hotel, supplier, cnt, dfrom, dto from bk order by g, bucket, agr_no, rn, o),
   gb as (select g, bucket, jsonb_agg(jsonb_build_object('agrNo', agr_no, 'hotel', hotel, 'supplier', supplier, 'count', cnt, 'from', dfrom, 'to', dto) order by rn, o) arr from dd group by g, bucket)
   select coalesce(jsonb_object_agg(g, o), '{}'::jsonb) from (
     select g, jsonb_build_object('makkah', coalesce((array_agg(arr) filter (where bucket = 'makkah'))[1], '[]'::jsonb), 'madinah', coalesce((array_agg(arr) filter (where bucket = 'madinah'))[1], '[]'::jsonb),
            'makkahCatering', coalesce((array_agg(arr) filter (where bucket = 'makkahCatering'))[1], '[]'::jsonb), 'madinahCatering', coalesce((array_agg(arr) filter (where bucket = 'madinahCatering'))[1], '[]'::jsonb)) o
       from gb group by g) z $$;

-- ===== دورات النقل (_taReadRowsRaw_ + _vzTransportRunsFor_ كما يحتاجها البوتستراب) =====
-- آخر ظهور لعنوان بالاسم (idx[h] = i يطغى الأخير)
create or replace function _vz_lidx(hdr jsonb, nm text) returns int language sql immutable as
$$ select (max(o) - 1)::int from jsonb_array_elements(hdr) with ordinality a(v, o) where jsonb_typeof(v) = 'string' and (v #>> '{}') = nm $$;
create or replace function _vz_cell(raw jsonb, i int) returns jsonb language sql immutable as $$ select case when i is null then null else raw -> i end $$;
create or replace function _vz_pf(c jsonb) returns float8 language sql immutable as   -- parseFloat(cell) || 0
$$ select coalesce(case jsonb_typeof(c) when 'number' then (c #>> '{}')::float8 when 'string' then _mf_pf(c #>> '{}') else null end, 0) $$;

-- صفوف النقل: (rn, supplier, company, arr(تاريخ الوصول نصاً), cnt(_mfNum_(busCount)), price0(سعر الباص أو الافتراضي بفترة التسعير للوكيل))
create or replace function _vz_transport_rows(tprices jsonb) returns table (rn int, supplier text, company text, arr text, cnt float8, price0 float8) language plpgsql stable set search_path = public as
$$ #variable_conflict use_column
declare bh jsonb := _rx_hdr('bookings'); i_tc int := _vz_lidx(bh, 'شركة النقل الداخلي'); i_ag int := _vz_lidx(bh, 'الوكيل السعودي'); i_bp int := _vz_lidx(bh, 'سعر الباص');
  i_arr int := _vz_lidx(bh, 'تاريخ الوصول'); i_id int := _vz_lidx(bh, 'رقم الإشعار'); i_co int := _vz_lidx(bh, 'الشركة المصرية'); i_bc int := _vz_lidx(bh, 'عدد الباصات'); ovr jsonb; begin
  select coalesce(jsonb_object_agg(id, sup), '{}'::jsonb) into ovr from (
    select distinct on (id) id, sup from (select rn, _rx_trim(_rx_s(_rx_c(raw, 0))) id, _rx_trim(_rx_s(_rx_c(raw, 1))) sup from _rx_rows('transport_overrides')) z where id <> '' order by id, rn desc) y;
  return query
  with b as (select r.rn, r.raw, _rx_trim(_rx_s(_vz_cell(r.raw, i_tc))) tc from _rx_rows('bookings') r),
       c as (select b.rn, b.raw, b.tc, case when b.tc = 'الوكيل' then _rx_s(_vz_cell(b.raw, i_ag)) when b.tc = 'النقل بمعرفة العميل' then '' else b.tc end sup0,
                    _vz_pf(_vz_cell(b.raw, i_bp)) bp,
                    case when jsonb_typeof(_vz_cell(b.raw, i_arr)) = 'object' and _vz_cell(b.raw, i_arr) ? '$d' then to_char(to_timestamp(floor((_vz_cell(b.raw, i_arr) ->> '$d')::float8 / 1000.0)) at time zone 'Africa/Cairo', 'DD/MM/YYYY') else _rx_s(_vz_cell(b.raw, i_arr)) end arr
               from b where b.tc <> '')
  select c.rn, coalesce(nullif(ovr ->> _rx_s(_vz_cell(c.raw, i_id)), ''), c.sup0), _rx_s(_vz_cell(c.raw, i_co)), c.arr, _mf_num(_vz_cell(c.raw, i_bc)),
         case when c.bp = 0 and c.tc = 'الوكيل' and c.sup0 <> '' then _vz_price_at(c.sup0, c.arr, tprices) else c.bp end
    from c order by c.rn;
end $$;

-- ===== getVisaBootstrap =====
create or replace function rx2_getvisabootstrap(a jsonb, u text) returns jsonb language plpgsql stable set search_path = public as
$$ #variable_conflict use_column
declare tdy text := _mf_today(); fin boolean := app_has('visas.finance'); files jsonb; prices jsonb; tprices jsonb; ref jsonb; agents text[]; am jsonb; acctRows jsonb; accounts jsonb; balances jsonb;
  e jsonb; k text; subs jsonb := '{}'::jsonb; subord text[] := '{}'; hasSub jsonb := '{}'::jsonb; key text; ag text; items int;
begin
  if not app_has('visas.view') then raise exception 'لا تملك صلاحية عرض متابعة التأشيرات والوكلاء' using errcode = '42501'; end if;
  select coalesce(jsonb_agg(f order by rn), '[]'::jsonb) into files from _vz_files();
  prices := _vz_prices('vz_agent_prices'); tprices := _vz_prices('vz_transport_prices'); ref := _mf_reflists();
  -- حسابات الوكلاء مع الشركات (AgentCompanyAccounts) — am بترتيب أول ظهور وقيم آخر صف
  select coalesce(jsonb_agg(jsonb_build_object('agent', ag, 'company', co, 'mode', mo, 'mainCompany', mc, 'notes', nt, 'active', act) order by rn), '[]'::jsonb) into acctRows from (
    select rn, _mf_str(_rx_c(raw, 0)) ag, _mf_str(_rx_c(raw, 1)) co, coalesce(nullif(_mf_str(_rx_c(raw, 2)), ''), 'عام') mo, _mf_str(_rx_c(raw, 3)) mc, _mf_str(_rx_c(raw, 4)) nt, _mf_str(_rx_c(raw, 7)) <> 'لا' act
      from _rx_rows('agent_company_accounts')) z where ag <> '' and co <> '';
  select coalesce(jsonb_agg(jsonb_build_object('k', ag || '|' || co, 'agent', ag, 'company', co, 'mode', mo, 'mainCompany', mc, 'active', act) order by first_rn), '[]'::jsonb) into am from (
    select distinct on (ag, co) ag, co, mo, mc, act, min(rn) over (partition by ag, co) first_rn
      from (select rn, _mf_str(_rx_c(raw, 0)) ag, _mf_str(_rx_c(raw, 1)) co, coalesce(nullif(_mf_str(_rx_c(raw, 2)), ''), 'عام') mo, _mf_str(_rx_c(raw, 3)) mc, _mf_str(_rx_c(raw, 7)) <> 'لا' act
              from _rx_rows('agent_company_accounts')) z where ag <> '' and co <> '' order by ag, co, rn desc) y;
  -- مجموعة الوكلاء (_vzAgentsSet_) بترتيب الإدراج: شركات المرجع ثم المجموعات ثم البنود ثم الدفعات
  select coalesce(array_agg(x order by m), '{}') into agents from (
    select x, min(m) m from (
      select a ->> 'agent' x, 100000000 + o m from jsonb_array_elements(ref -> 'companies') with ordinality t(a, o) where (a ->> 'agent') <> ''
      union all select f ->> 'agent', 200000000 + o from jsonb_array_elements(files) with ordinality t(f, o) where (f ->> 'agent') <> ''
      union all select _mf_str(_rx_c(raw, 1)), 300000000 + rn from _rx_rows('vz_items') where _mf_str(_rx_c(raw, 0)) <> '' and _mf_str(_rx_c(raw, 1)) <> ''
      union all select _mf_str(_rx_c(raw, 1)), 400000000 + rn from _rx_rows('vz_payments') where _mf_str(_rx_c(raw, 0)) <> '' and _mf_str(_rx_c(raw, 1)) <> '') u group by x) w;
  -- _vzAcctKeys_
  for e in select * from jsonb_array_elements(am) loop
    if (e ->> 'mode') = 'عام' then continue; end if;
    hasSub := hasSub || jsonb_build_object(e ->> 'agent', true);
    key := _vz_key_calc(e ->> 'agent', e ->> 'company', am);
    if not subs ? key then
      subs := subs || jsonb_build_object(key, jsonb_build_object('key', key, 'agent', e ->> 'agent', 'company', substr(key, length(e ->> 'agent') + 4), 'kind', e ->> 'mode', 'companies', '[]'::jsonb, 'active', false));
      subord := subord || key;
    end if;
    if not (subs -> key -> 'companies') @> to_jsonb(e ->> 'company') then
      subs := jsonb_set(subs, array[key, 'companies'], (subs -> key -> 'companies') || to_jsonb(e ->> 'company'));
    end if;
    if (e ->> 'active') = 'true' then subs := jsonb_set(subs, array[key, 'active'], 'true'::jsonb); end if;
  end loop;
  select coalesce(jsonb_agg(o order by k collate "C", src, ord), '[]'::jsonb) into accounts from (
    select ag k, 0 src, o ord, jsonb_build_object('key', ag, 'agent', ag, 'company', '', 'kind', 'عام') o from unnest(agents) with ordinality t(ag, o) where not (hasSub ? ag)
    union all select s, 1, o, subs -> s from unnest(subord) with ordinality t(s, o) where (subs -> s ->> 'active') = 'true') z;
  -- أرصدة الوكلاء لكل مفتاح حساب
  with pr as (select distinct ag, co from (select f ->> 'agent' ag, f ->> 'company' co from jsonb_array_elements(files) f where (f ->> 'agent') <> '') z),
       tr as materialized (select t.rn, _mf_strt(t.supplier) ag, _mf_strt(t.company) co, t.arr, t.cnt, t.price0 from _vz_transport_rows(tprices) t),
       pr2 as (select ag, co from pr union select ag, co from tr where ag <> ''),
       pk as (select ag, co, _vz_key_calc(ag, co, am) k2 from pr2),
       ac as (select distinct x ->> 'key' key from jsonb_array_elements(accounts) x),
       fl as (select o rn, f ->> 'agent' ag, k2, (f ->> 'visaCount')::float8 * (f ->> 'price')::float8 due
                from jsonb_array_elements(files) with ordinality t(f, o) join pk on pk.ag = (f ->> 'agent') and pk.co = (f ->> 'company') where (f ->> 'agent') <> ''),
       it as (select rn, _mf_str(_rx_c(raw, 1)) ag, coalesce(nullif(_mf_str(_rx_c(raw, 3)), ''), 'SAR') cur, _ac_num(_rx_c(raw, 4)) v, _mf_str(_rx_c(raw, 5)) = 'نعم' cr
                from _rx_rows('vz_items') where _mf_str(_rx_c(raw, 0)) <> ''),
       py as (select rn, _mf_str(_rx_c(raw, 1)) ag, coalesce(nullif(_mf_str(_rx_c(raw, 4)), ''), 'SAR') cur, _ac_num(_rx_c(raw, 3)) amt
                from _rx_rows('vz_payments') where _mf_str(_rx_c(raw, 0)) <> ''),
       td as (select ac.key, coalesce(sum(t.cnt * (case when t.price0 <> 0 then t.price0 else _vz_price_at(split_part(ac.key, ' - ', 1), t.arr, tprices) end) order by t.rn), 0)::float8 s
                from ac left join (select tr.*, pk.k2 from tr join pk on pk.ag = tr.ag and pk.co = tr.co where tr.ag <> '') t on (t.ag = ac.key or t.k2 = ac.key) group by ac.key),
       vd as (select ac.key, coalesce(sum(fl.due order by fl.rn), 0)::float8 s from ac left join fl on (fl.ag = ac.key or fl.k2 = ac.key) group by ac.key),
       ia as (select ac.key, coalesce(sum(it.v order by it.rn) filter (where not it.cr and it.cur <> 'EGP'), 0)::float8 dueS, coalesce(sum(it.v order by it.rn) filter (where not it.cr and it.cur = 'EGP'), 0)::float8 dueE,
                     coalesce(sum(it.v order by it.rn) filter (where it.cr and it.cur <> 'EGP'), 0)::float8 credS, coalesce(sum(it.v order by it.rn) filter (where it.cr and it.cur = 'EGP'), 0)::float8 credE
                from ac left join it on it.ag = ac.key group by ac.key),
       pa as (select ac.key, coalesce(sum(py.amt order by py.rn) filter (where py.cur <> 'EGP'), 0)::float8 paidS, coalesce(sum(py.amt order by py.rn) filter (where py.cur = 'EGP'), 0)::float8 paidE
                from ac left join py on py.ag = ac.key group by ac.key),
       ds as (select ac.key, (select sum(x order by o) from (select vd.s + td.s x, 0::bigint o union all select it.v, it.rn from it where it.ag = ac.key and not it.cr and it.cur <> 'EGP') q)::float8 s   -- dueS = (فيزا+نقل) ثم += كل بند مدين بالترتيب
                from ac join vd on vd.key = ac.key join td on td.key = ac.key)
  select coalesce(jsonb_object_agg(vd.key, jsonb_build_object('visaDueS', vd.s, 'transportDueS', td.s, 'dueS', ds.s, 'dueE', ia.dueE, 'credS', ia.credS, 'credE', ia.credE, 'paidS', pa.paidS, 'paidE', pa.paidE,
            'netS', floor(((ds.s - ia.credS) - pa.paidS) * 100 + 0.5) / 100, 'netE', floor(((ia.dueE - ia.credE) - pa.paidE) * 100 + 0.5) / 100)), '{}'::jsonb) into balances
    from vd join td using (key) join ia using (key) join pa using (key) join ds using (key);
  if not fin then
    prices := '[]'::jsonb; tprices := '[]'::jsonb; balances := '{}'::jsonb;
    select coalesce(jsonb_agg(f || '{"price":0,"dueSAR":0}'::jsonb order by o), '[]'::jsonb) into files from jsonb_array_elements(files) with ordinality t(f, o);
  end if;
  return jsonb_build_object('files', files, 'prices', case when fin then _vz_prices('vz_agent_prices') else '[]'::jsonb end, 'transportPrices', case when fin then _vz_prices('vz_transport_prices') else '[]'::jsonb end,
    'companies', ref -> 'companies', 'trips', ref -> 'trips', 'clients', ref -> 'clients',
    'agents', to_jsonb(array(select x from unnest(agents) x order by x collate "C")), 'statuses', '["تم الإرسال","تم إصدار الموفا"]'::jsonb, 'payStatuses', '["","تم إصدار الموقّع","تم الإرسال"]'::jsonb,
    'accounts', accounts, 'acctRows', acctRows, 'acctModes', '["عام","منفصل","مشترك"]'::jsonb, 'agentBalances', balances,
    'cateringByGroup', _vz_catering_by_group(), 'housingByGroup', _vz_housing_by_group(), 'today', tdy,
    'success', true, 'user', u, 'dataVer', 0, 'stale', false,
    'perf', jsonb_build_object('cache', 'sb', 'serverMs', 0, 'files', jsonb_array_length(files)),
    'can', jsonb_build_object('add', app_has('visas.add'), 'edit', app_has('visas.edit'), 'del', app_has('visas.delete'), 'finance', fin));
end $$;

-- ===== getVisaTripLinks =====
create or replace function rx2_getvisatriplinks(a jsonb, u text) returns jsonb language plpgsql stable set search_path = public as
$$ declare known jsonb; links jsonb; begin
  if not (app_has('visas.view') or app_has('registry.view') or app_has('trips.view')) then return jsonb_build_object('success', true, 'links', '{}'::jsonb); end if;
  known := _mf_trip_names();
  with fl as materialized (select rn, f from _vz_files()),
       ent as (select rn, f, jsonb_build_object('id', f -> 'id', 'ref', f -> 'ref', 'seq', f -> 'seq', 'status', f -> 'status', 'date', f -> 'date', 'agent', f -> 'agent', 'company', f -> 'company',
                  'clients', coalesce((select jsonb_agg(_mf_str(case when jsonb_typeof(b) = 'object' then b -> 'name' end) order by o) from jsonb_array_elements(f -> 'breakdown') with ordinality t(b, o)), '[]'::jsonb),
                  'selected', _mf_arr(f -> 'selected')) e from fl),
       lk as (select t, jsonb_agg(e order by rn) arr from ent, unnest(_mf_trips_of(f ->> 'tripName', f ->> 'extraTrips', known)) t group by t)
  select coalesce(jsonb_object_agg(t, arr), '{}'::jsonb) into links from lk;
  return jsonb_build_object('success', true, 'links', links); end $$;

-- ===== الصلاحيات =====
do $$ declare r record; begin
  for r in select p.oid::regprocedure::text sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and (p.proname like '\_vz\_%' or p.proname like '\_mf\_%' or p.proname like '\_sx\_%' or p.proname like '\_ac\_%' or p.proname like 'rx2\_%') loop
    execute format('revoke all on function %s from public, anon, authenticated', r.sig);
    execute format('grant execute on function %s to service_role', r.sig);
  end loop;
end $$;

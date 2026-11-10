-- V4.437: المهام اللاحقة لحفظ ملفات الوزارة ومجموعات التأشيرات من Postgres (كانت Apps Script ≈12 ث بعد كل حفظ)
--  • _xc_*: مطابقة الشركة المصرية والوكيل السعودي بين الرحلة ومجموعات التأشيرات وملفات الوزارة (= _xcCheck_ بـCode.gs حرفياً)
--  • rx2_mfaftersavebg: أرصدة رسوم الغرفة لكل شركة + فحص المطابقة · rx2_vzaftersavebg: فحص المطابقة + أرصدة الوكلاء المطلوبة
--    (مزامنة اتفاقيات السكن syncHousing تبقى مؤقتاً على Apps Script — الواجهة توجّه هذا النداء وحده إليه)
--  • rx2_xcchecktrips: xcCheckTrips (الفحص اليدوي)
-- يتطلب: 010 (_mf_*) و011 (_vz_*).

create or replace function _xc_n(s text) returns text language sql immutable as
$$ select btrim(regexp_replace(translate(regexp_replace(coalesce(s, ''), '[ً-ْٰ]', '', 'g'), 'أإآىة', 'ااايه'), '\s+', ' ', 'g')) $$;
create or replace function _xc_ns(s text) returns text language sql immutable as $$ select replace(_xc_n(s), ' ', '') $$;
create or replace function _xc_like(a text, b text) returns boolean language sql immutable as
$$ select case when _xc_ns(a) = '' or _xc_ns(b) = '' then false
     else _xc_ns(a) = _xc_ns(b) or (least(length(_xc_ns(a)), length(_xc_ns(b))) >= 3 and (position(_xc_ns(b) in _xc_ns(a)) > 0 or position(_xc_ns(a) in _xc_ns(b)) > 0)) end $$;
-- صفوف حسابات الوكلاء بالشركات (= _vzAcctRead_): [{agent, company, mode, mainCompany}] بترتيب الشيت
create or replace function _xc_acct() returns jsonb language sql stable set search_path = public as
$$ select coalesce(jsonb_agg(jsonb_build_object('agent', ag, 'company', co, 'mode', mo, 'mainCompany', mc) order by rn), '[]'::jsonb) from (
     select rn, _mf_str(_rx_c(raw, 0)) ag, _mf_str(_rx_c(raw, 1)) co, coalesce(nullif(_mf_str(_rx_c(raw, 2)), ''), 'عام') mo, _mf_str(_rx_c(raw, 3)) mc from _rx_rows('agent_company_accounts')) z
   where ag <> '' and co <> '' $$;
create or replace function _xc_cfg(agent text, company text, rows_ jsonb) returns jsonb language sql immutable as
$$ select r from jsonb_array_elements(rows_) with ordinality t(r, o) where _xc_n(r ->> 'agent') = _xc_n(agent) and _xc_like(r ->> 'company', company) order by o limit 1 $$;
create or replace function _xc_company_eq(a text, b text, agent text, rows_ jsonb) returns boolean language plpgsql immutable as
$$ declare ca jsonb; cb jsonb; ma text := ''; mb text := ''; begin
  if _xc_like(a, b) then return true; end if;
  ca := _xc_cfg(agent, a, rows_); cb := _xc_cfg(agent, b, rows_);
  if ca is not null and ca ->> 'mode' = 'مشترك' then ma := coalesce(nullif(ca ->> 'mainCompany', ''), ca ->> 'company'); end if;
  if cb is not null and cb ->> 'mode' = 'مشترك' then mb := coalesce(nullif(cb ->> 'mainCompany', ''), cb ->> 'company'); end if;
  return (ma <> '' and mb <> '' and _xc_like(ma, mb)) or (ma <> '' and _xc_like(ma, b)) or (mb <> '' and _xc_like(mb, a)); end $$;
create or replace function _xc_parse(agent text, company text, rows_ jsonb) returns jsonb language plpgsql immutable as
$$ declare ag text := _mf_strt(agent); co text := _mf_strt(company); i int; a0 text; c0 text; out_ jsonb; begin
  out_ := jsonb_build_object('agent', ag, 'company', co, 'part', '');
  i := position(' - ' in ag);
  if i > 1 then
    a0 := btrim(substr(ag, 1, i - 1)); c0 := btrim(substr(ag, i + 3));
    if exists (select 1 from jsonb_array_elements(rows_) r where _xc_n(r ->> 'agent') = _xc_n(a0)) then out_ := jsonb_build_object('agent', a0, 'company', co, 'part', c0); end if;
  end if;
  return out_; end $$;
create or replace function _xc_rows_eq(x jsonb, y jsonb, rows_ jsonb) returns boolean language plpgsql immutable as
$$ declare cx text[]; cy text[]; a text; b text; begin
  if _xc_n(x ->> 'agent') <> _xc_n(y ->> 'agent') then return false; end if;
  cx := array_remove(array[x ->> 'company', x ->> 'part'], ''); cy := array_remove(array[y ->> 'company', y ->> 'part'], '');
  if coalesce(array_length(cx, 1), 0) = 0 and coalesce(array_length(cy, 1), 0) = 0 then return true; end if;
  if coalesce(array_length(cx, 1), 0) = 0 or coalesce(array_length(cy, 1), 0) = 0 then return false; end if;
  foreach a in array cx loop foreach b in array cy loop if _xc_company_eq(a, b, x ->> 'agent', rows_) then return true; end if; end loop; end loop;
  return false; end $$;

-- = _xcCheck_(tripNames) ⇒ [{trip, anchor, rows:[{src,id,label,company,agent,diff}]}]
create or replace function _xc_check(p_trips jsonb) returns jsonb language plpgsql stable set search_path = public as
$$ declare acct jsonb := _xc_acct(); known jsonb := _mf_trip_names(); tm jsonb := _rx_map('trips', _rx_h_trips()); t text; rows_ jsonb; ti record; anchor jsonb; bad boolean; r jsonb;
  out_ jsonb := '[]'::jsonb; outr jsonb; d boolean; names text[] := '{}'; vz jsonb; mf jsonb; begin
  select coalesce(array_agg(x order by o), '{}') into names from (select x, min(o) o from jsonb_array_elements_text(case when jsonb_typeof(p_trips) = 'array' then p_trips else '[]'::jsonb end) with ordinality q(x, o)
    where _mf_strt(x) <> '' group by x) z;
  if coalesce(array_length(names, 1), 0) = 0 then return '[]'::jsonb; end if;
  select coalesce(jsonb_agg(f order by rn), '[]'::jsonb) into vz from _vz_files();
  select coalesce(jsonb_agg(f order by rn), '[]'::jsonb) into mf from _mf_files_raw(_sx_exec_policy());
  foreach t in array names[1:30] loop
    rows_ := '[]'::jsonb;
    select _mf_str(_rx_c(raw, (tm ->> 'الشركة المصرية')::int)) co, _mf_str(_rx_c(raw, (tm ->> 'الوكيل السعودي')::int)) ag into ti
      from _rx_rows('trips') where _rx_trim(_rx_s(_rx_c(raw, (tm ->> 'اسم الرحلة')::int))) = t order by rn desc limit 1;
    if found then rows_ := rows_ || jsonb_build_array(jsonb_build_object('src', 'trip', 'id', t, 'label', 'الرحلة', 'company', ti.co, 'agent', ti.ag, 'p', _xc_parse(ti.ag, ti.co, acct))); end if;
    select rows_ || coalesce(jsonb_agg(jsonb_build_object('src', 'vz', 'id', f ->> 'id', 'label', 'مجموعة تأشيرات ' || case when coalesce(f ->> 'ref', '') <> '' then 'رقم ' || (f ->> 'ref') else '#' || coalesce(f ->> 'seq', '') end,
             'company', f ->> 'company', 'agent', f ->> 'agent', 'p', _xc_parse(f ->> 'agent', f ->> 'company', acct)) order by o), '[]'::jsonb) into rows_
      from jsonb_array_elements(vz) with ordinality q(f, o) where t = any (_mf_trips_of(f ->> 'tripName', f ->> 'extraTrips', known));
    select rows_ || coalesce(jsonb_agg(jsonb_build_object('src', 'mf', 'id', f ->> 'id', 'label', 'ملف وزارة ' || case when coalesce(f ->> 'fileNo', '') <> '' then 'رقم ' || (f ->> 'fileNo') else '#' || coalesce(f ->> 'seq', '') end,
             'company', f ->> 'company', 'agent', f ->> 'agent', 'p', _xc_parse(f ->> 'agent', f ->> 'company', acct)) order by o), '[]'::jsonb) into rows_
      from jsonb_array_elements(mf) with ordinality q(f, o) where t = any (_mf_trips_of(f ->> 'tripName', f ->> 'extraTrips', known));
    if jsonb_array_length(rows_) < 2 then continue; end if;
    anchor := rows_ -> 0; bad := false; outr := '[]'::jsonb;
    for r in select x from jsonb_array_elements(rows_) with ordinality q(x, o) order by o loop
      d := (r <> anchor) and not _xc_rows_eq(anchor -> 'p', r -> 'p', acct);
      if d then bad := true; end if;
      outr := outr || jsonb_build_array(jsonb_build_object('src', r ->> 'src', 'id', r ->> 'id', 'label', r ->> 'label', 'company', coalesce(r ->> 'company', ''), 'agent', coalesce(r ->> 'agent', ''), 'diff', d));
    end loop;
    if not bad then continue; end if;
    out_ := out_ || jsonb_build_array(jsonb_build_object('trip', t, 'anchor', case when anchor ->> 'src' = 'trip' then 'trip' else (anchor ->> 'src') || ':' || (anchor ->> 'id') end, 'rows', outr));
  end loop;
  return out_; end $$;

create or replace function rx2_mfaftersavebg(a jsonb, u text) returns jsonb language plpgsql stable set search_path = public as
$$ declare p jsonb := coalesce(a -> 1, '{}'::jsonb); out_ jsonb := jsonb_build_object('success', true, 'xcheck', '[]'::jsonb); x jsonb; begin
  if not (app_has('ministry.add') or app_has('ministry.edit')) then raise exception 'لا تملك صلاحية إضافة/تعديل مراجعة ملفات الوزارة' using errcode = '42501'; end if;
  if coalesce(p ->> 'bal', 'true') <> 'false' then out_ := out_ || jsonb_build_object('mfBalances', coalesce(_mf_all(_sx_exec_policy(), _sx_acc_pricing(), _mf_today()) -> 'balances', '{}'::jsonb)); end if;
  if jsonb_typeof(p -> 'trips') = 'array' and jsonb_array_length(p -> 'trips') > 0 then
    x := _xc_check(p -> 'trips'); if jsonb_array_length(x) > 0 then out_ := jsonb_set(out_, '{xcheck}', x); end if; end if;
  return out_; end $$;

create or replace function rx2_vzaftersavebg(a jsonb, u text) returns jsonb language plpgsql stable set search_path = public as
$$ declare p jsonb := case when jsonb_typeof(a -> 1) = 'array' then jsonb_build_object('agents', a -> 1) else coalesce(a -> 1, '{}'::jsonb) end; out_ jsonb := jsonb_build_object('success', true, 'xcheck', '[]'::jsonb);
  x jsonb; boot jsonb; bal jsonb; begin
  if not (app_has('visas.add') or app_has('visas.edit')) then raise exception 'لا تملك صلاحية إضافة/تعديل متابعة التأشيرات والوكلاء' using errcode = '42501'; end if;
  if coalesce(p ->> 'syncHousing', '') <> '' then raise exception 'غير مدعوم: مزامنة السكن' using errcode = '0A000'; end if;
  if jsonb_typeof(p -> 'trips') = 'array' and jsonb_array_length(p -> 'trips') > 0 then
    x := _xc_check(p -> 'trips'); if jsonb_array_length(x) > 0 then out_ := jsonb_set(out_, '{xcheck}', x); end if; end if;
  if jsonb_typeof(p -> 'agents') = 'array' and jsonb_array_length(p -> 'agents') > 0 and app_has('visas.finance') then
    boot := rx2_getvisabootstrap(jsonb_build_array(null), u);
    select coalesce(jsonb_object_agg(k, v), '{}'::jsonb) into bal from jsonb_each(coalesce(boot -> 'agentBalances', '{}'::jsonb)) e(k, v)
      where exists (select 1 from jsonb_array_elements_text(p -> 'agents') ag where k = ag or left(k, length(ag) + 3) = ag || ' - ');
    out_ := out_ || jsonb_build_object('agentBalances', bal);
  end if;
  return out_; end $$;

create or replace function rx2_xcchecktrips(a jsonb, u text) returns jsonb language plpgsql stable set search_path = public as
$$ begin return jsonb_build_object('success', true, 'issues', _xc_check(case when jsonb_typeof(a -> 1) = 'array' then a -> 1 else '[]'::jsonb end)); end $$;

do $$ declare r record; begin
  for r in select p.oid::regprocedure::text sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and (p.proname like '\_xc\_%' or p.proname in ('rx2_mfaftersavebg', 'rx2_vzaftersavebg', 'rx2_xcchecktrips')) loop
    execute format('revoke all on function %s from public, anon, authenticated', r.sig);
    execute format('grant execute on function %s to service_role', r.sig);
  end loop;
end $$;

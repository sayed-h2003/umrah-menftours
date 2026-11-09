-- 026: saveAccItem (إضافة/تعديل بند حساب عميل) من Postgres. يعمل لمفتاح supaWriteOnBookings() نفسه (wbk) — لا مفتاح جديد.
-- حالات تبقى على Apps Script (0A000 ⇒ رجوع تلقائي): بند حجز فندقي ⟦src:HB.…⟧ · عميل×رحلة بلا صف meta (يحتاج لقطة أعداد من getClientTripStats).
-- (الدفعات/الحذف/الجماعي لم تُنقل: لها لقطات استرجاع وشواهد حذف وروابط ترحيل رصيد).
create or replace function rw2_saveaccitem(a jsonb, u text) returns jsonb language plpgsql volatile set search_path = public as
$$ declare
  it jsonb := a -> 1; isedit boolean; client text; trip text; dsc text; cnt float8; prc float8; ngt float8; val float8; cur text; disc boolean; direct boolean;
  oldrid text; oldraw jsonb; newraw jsonb; id text; who text := coalesce(u, app_user(), '-'); nowj jsonb := jsonb_build_object('$d', (extract(epoch from clock_timestamp()) * 1000)::bigint);
  newd text; cfm text; changed boolean; onlyprice boolean; od text; ocur text; auto text; mx bigint; meta_ok boolean;
begin
  if jsonb_typeof(it) is distinct from 'object' then raise exception 'بيانات البند مطلوبة' using errcode = 'P0001'; end if;
  isedit := btrim(coalesce(it ->> 'id', '')) <> '';
  if not app_has('accounts.' || case when isedit then 'edit' else 'add' end) then raise exception 'لا تملك صلاحية' using errcode = '42501'; end if;
  client := btrim(coalesce(it ->> 'client', '')); trip := btrim(coalesce(it ->> 'trip', ''));
  if client = '' or trip = '' then return jsonb_build_object('success', false, 'error', 'العميل والرحلة مطلوبان'); end if;
  dsc := coalesce(it ->> 'desc', '');
  if btrim(dsc) = '' then return jsonb_build_object('success', false, 'error', 'البيان مطلوب'); end if;
  if dsc ~ '⟦src:HB\.' then raise exception 'غير مدعوم: بند حجز فندقي' using errcode = '0A000'; end if;
  cnt := coalesce(_bk_pf(it -> 'count'), 0); prc := coalesce(_bk_pf(it -> 'price'), 0); ngt := coalesce(_bk_pf(it -> 'nights'), 0);
  val := floor((cnt * prc * (case when ngt > 0 then ngt else 1 end) * 100) + 0.5) / 100;
  cur := case when it ->> 'currency' = 'SAR' then 'SAR' else 'EGP' end;
  disc := (it ->> 'isDiscount') = 'true' or (it ->> 'cat') = 'خصم';
  direct := (it ->> 'isDirect') = 'true';
  perform pg_advisory_xact_lock(hashtextextended('store:put:acc_items', 0));

  if isedit then
    select rid, raw into oldrid, oldraw from store_rows where tbl = 'acc_items' and _rx_s(raw -> 0) = (it ->> 'id') limit 1;
    if oldrid is null then return jsonb_build_object('success', false, 'error', 'البند غير موجود'); end if;
    od := _rx_s(oldraw -> 3);
    if od ~ '⟦src:HB\.' then raise exception 'غير مدعوم: بند حجز فندقي' using errcode = '0A000'; end if;
    changed := od <> dsc or coalesce(_bk_pf(oldraw -> 6), 0) <> cnt or coalesce(_bk_pf(oldraw -> 7), 0) <> prc or coalesce(nullif(_rx_s(oldraw -> 5), ''), 'EGP') <> cur or coalesce(_bk_pf(oldraw -> 15), 0) <> ngt;
    onlyprice := od = dsc and coalesce(_bk_pf(oldraw -> 6), 0) = cnt and coalesce(nullif(_rx_s(oldraw -> 5), ''), 'EGP') = cur and coalesce(_bk_pf(oldraw -> 15), 0) = ngt;
    auto := _rx_s(oldraw -> 17);
    if auto = 'نعم' and changed and not (onlyprice and btrim(od) = 'خصم' and _rx_s(oldraw -> 9) = 'نعم') then auto := 'معدّل'; end if;
    cfm := (regexp_match(od, '⟦(?:cf|src):[^⟧]+⟧', 'i'))[1];
    newd := dsc;
    if cfm is not null and position('⟦' in newd) = 0 then newd := newd || ' ' || cfm; end if;
    newraw := oldraw;
    newraw := jsonb_set(newraw, '{3}', to_jsonb(newd));
    newraw := jsonb_set(newraw, '{4}', to_jsonb(coalesce(nullif(it ->> 'cat', ''), '')));
    newraw := jsonb_set(newraw, '{5}', to_jsonb(cur));
    newraw := jsonb_set(newraw, '{6}', to_jsonb(cnt));
    newraw := jsonb_set(newraw, '{7}', to_jsonb(prc));
    newraw := jsonb_set(newraw, '{8}', to_jsonb(val));
    newraw := jsonb_set(newraw, '{9}', to_jsonb(case when disc then 'نعم' else 'لا' end));
    newraw := jsonb_set(newraw, '{10}', to_jsonb(coalesce(it ->> 'notes', '')));
    newraw := jsonb_set(newraw, '{13}', to_jsonb(who));
    newraw := jsonb_set(newraw, '{14}', nowj);
    newraw := jsonb_set(newraw, '{15}', case when ngt <> 0 then to_jsonb(ngt) else '""'::jsonb end);
    newraw := jsonb_set(newraw, '{16}', to_jsonb(coalesce(it ->> 'company', '')));
    newraw := jsonb_set(newraw, '{17}', to_jsonb(auto));
    newraw := jsonb_set(newraw, '{19}', to_jsonb(case when direct then 'نعم' else 'لا' end));
    update store_rows set raw = newraw where tbl = 'acc_items' and rid = oldrid;
    ocur := case when coalesce(nullif(_rx_s(oldraw -> 5), ''), 'EGP') = 'SAR' then 'ريال' else 'جنيه' end;
    insert into app_outbox (kind, payload) values ('audit', jsonb_build_object('user', who, 'action', 'تعديل بند حساب', 'record', client, 'field', trip,
      'old', regexp_replace(od, '\s*⟦(?:cf|src):[^⟧]+⟧\s*$', '', 'i') || ' = ' || coalesce(nullif(_bk_pf(oldraw -> 8), 0), 0)::text || ' ' || ocur,
      'new', (it ->> 'desc') || ' = ' || val::text || ' ' || cur));
    update store_meta set ver = ver + 1, updated_at = now() where tbl = 'acc_items';
    perform _w_dv_bump(array['bookings', 'movements', 'trips', 'pilgrims', 'visa', 'ministry', 'dropdowns', 'hb', 'gl']);   -- = بصمات تفريغ المخزن (Store.gs) لأي كتابة
    return jsonb_build_object('success', true, 'id', it ->> 'id', 'value', val);
  end if;

  select exists (select 1 from store_rows where tbl = 'acc_meta' and btrim(_rx_s(raw -> 0)) = client and btrim(_rx_s(raw -> 1)) = trip) into meta_ok;
  if not meta_ok then raise exception 'غير مدعوم: لا صف meta' using errcode = '0A000'; end if;
  id := 'I' || _w_b36((extract(epoch from clock_timestamp()) * 1000)::bigint) || _w_b36((random() * 10000)::int);
  newraw := jsonb_build_array(id, client, trip, coalesce(it ->> 'desc', ''), coalesce(nullif(it ->> 'cat', ''), ''), cur, cnt, prc, val, case when disc then 'نعم' else 'لا' end,
    coalesce(it ->> 'notes', ''), who, nowj, '', '', case when ngt <> 0 then to_jsonb(ngt) else '""'::jsonb end, coalesce(it ->> 'company', ''), '', '', case when direct then 'نعم' else 'لا' end);
  insert into store_rows (tbl, rid, ord, raw)
    select 'acc_items', substr(md5(random()::text || clock_timestamp()::text), 1, 20), coalesce(max(ord), 0) + 1, newraw from store_rows where tbl = 'acc_items';
  update store_meta set ver = ver + 1, updated_at = now() where tbl = 'acc_items';
  insert into app_outbox (kind, payload) values ('audit', jsonb_build_object('user', who, 'action', 'إضافة بند حساب', 'record', client, 'field', trip, 'old', '-', 'new', (it ->> 'desc') || ' = ' || val::text || ' ' || cur));
  perform _w_dv_bump(array['bookings', 'movements', 'trips', 'pilgrims', 'visa', 'ministry', 'dropdowns', 'hb', 'gl']);   -- = بصمات تفريغ المخزن (Store.gs) لأي كتابة
  return jsonb_build_object('success', true, 'id', id, 'value', val);
end $$;

do $$ declare r record; begin
  for r in select p.oid::regprocedure::text sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'rw2_saveaccitem' loop
    execute format('revoke all on function %s from public, anon, authenticated', r.sig);
    execute format('grant execute on function %s to service_role', r.sig);
  end loop;
end $$;

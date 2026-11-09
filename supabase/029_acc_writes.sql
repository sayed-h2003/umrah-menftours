-- 029: كتابات حسابات العملاء المتبقية البسيطة من Postgres — deleteAccPayment · deleteAccItem · deleteAccItemsBulk · saveAccPayment (تعديل + تحويل عملة جديد). مفتاح التفعيل نفسه supaWriteOnBookings() (wbk).
-- تبقى على Apps Script (0A000 ⇒ رجوع تلقائي): دفعة «جديدة» عادية (تتحول لسند مسودة بالحسابات العامة) · الحذف من الشاشة فقط (screenOnly) · بند/دفعة بعلامة ترحيل رصيد ⟦cf:⟧ (حذف الطرف المقابل) · بند حجز فندقي.
-- لقطات الاسترجاع (قبل حذف/تعديل دفعة) وسجل التعديلات تُنفَّذ بالخلفية عبر صندوق الإخراج (snaprow/audit) بنفس دوال Apps Script؛ شاهد الحذف (acc_removed) يُكتب هنا بنفس الجلسة كي لا تعيد المزامنة البند.
create or replace function _acc_bond_key(desc_ text) returns text language plpgsql immutable as
$$ declare d text := _rx_trim(regexp_replace(coalesce(desc_, ''), '\s*⟦(?:cf|src):[^⟧]+⟧\s*$', '', 'i')); begin
  if d = any(array['رسوم غرفة','رسوم غرفة المشرف','رسوم غرفة VIP','تجديد باركود','تأشيرة وباركود','إشراف','تذاكر','تذاكر الأطفال','تذاكر الرضع','تأشيرات','نقل سعودي','سكن المدينة','سكن مكة','بدلات المشرف','تأشيرة المشرف','شركة','ضرائب','رسوم التنفيذ','الإعاشة']) then return d; end if;
  if starts_with(d, 'تأشيرات') then return 'تأشيرات'; end if;
  if starts_with(d, 'رسوم غرفة المشرف') then return 'رسوم غرفة المشرف'; end if;
  if starts_with(d, 'رسوم غرفة VIP') then return 'رسوم غرفة VIP'; end if;
  if starts_with(d, 'رسوم غرفة') then return 'رسوم غرفة'; end if;
  if starts_with(d, 'رسوم التنفيذ') then return 'رسوم التنفيذ'; end if;
  if starts_with(d, 'تجديد باركود') then return 'تجديد باركود'; end if;
  if starts_with(d, 'تذاكر الأطفال') then return 'تذاكر الأطفال'; end if;
  if starts_with(d, 'تذاكر الرضع') then return 'تذاكر الرضع'; end if;
  if starts_with(d, 'تذاكر') then return 'تذاكر'; end if;
  if starts_with(d, 'سكن المدينة') then return 'سكن المدينة'; end if;
  if starts_with(d, 'سكن مكة') then return 'سكن مكة'; end if;
  return d; end $$;

-- شاهد حذف (= _accTombAdd_ لصف واحد): لا شيء للعام/الترحيل/الفنادق/الفارغ، ولا تكرار
create or replace function _acc_tomb_add(p_client text, p_trip text, p_desc text, p_user text) returns void language plpgsql volatile set search_path = public as
$$ declare k text; begin
  if coalesce(p_client, '') = '' or coalesce(p_trip, '') = '' or p_trip = 'عام' or _rx_trim(coalesce(p_desc, '')) = '' then return; end if;
  if p_desc ~* '⟦cf:([a-z0-9]+)⟧' or p_desc ~ '⟦src:HB\.' then return; end if;
  k := _acc_bond_key(p_desc); if k = '' then return; end if;
  if exists (select 1 from store_rows where tbl = 'acc_removed' and _rx_trim(_rx_s(_rx_c(raw, 0))) = p_client and _rx_trim(_rx_s(_rx_c(raw, 1))) = p_trip and _rx_trim(_rx_s(_rx_c(raw, 2))) = k) then return; end if;
  insert into store_rows (tbl, rid, ord, raw)
    select 'acc_removed', substr(md5(random()::text || clock_timestamp()::text), 1, 20), coalesce(max(ord), 0) + 1,
           jsonb_build_array(p_client, p_trip, k, left(regexp_replace(p_desc, '\s*⟦(?:cf|src):[^⟧]+⟧\s*$', '', 'i'), 200), coalesce(p_user, ''), jsonb_build_object('$d', (extract(epoch from clock_timestamp()) * 1000)::bigint))
      from store_rows where tbl = 'acc_removed';
  update store_meta set ver = ver + 1, updated_at = now() where tbl = 'acc_removed'; end $$;

create or replace function _acc_dvs() returns text[] language sql immutable as $$ select array['bookings', 'movements', 'trips', 'pilgrims', 'visa', 'ministry', 'dropdowns', 'hb', 'gl'] $$;

-- ===== deleteAccPayment =====
create or replace function rw2_deleteaccpayment(a jsonb, u text) returns jsonb language plpgsql volatile set search_path = public as
$$ declare id text := _rx_s(a -> 1); who text := coalesce(u, app_user(), '-'); rid_ text; raw_ jsonb; begin
  if not app_has('accounts.delete') then raise exception 'لا تملك صلاحية' using errcode = '42501'; end if;
  if _gs_truthy(a -> 2) then raise exception 'غير مدعوم: حذف من الشاشة فقط' using errcode = '0A000'; end if;
  perform pg_advisory_xact_lock(hashtextextended('store:put:acc_payments', 0));
  select rid, raw into rid_, raw_ from store_rows where tbl = 'acc_payments' and _rx_s(_rx_c(raw, 0)) = id limit 1;
  if rid_ is null then return jsonb_build_object('success', false, 'error', 'السجل غير موجود'); end if;
  if _rx_s(_rx_c(raw_, 8)) ~* '⟦cf:([a-z0-9]+)⟧' then raise exception 'غير مدعوم: ترحيل رصيد' using errcode = '0A000'; end if;
  insert into app_outbox (kind, payload) values ('snaprow', jsonb_build_object('sheet', 'ClientAccounts_Payments', 'key', id, 'row', raw_, 'action', 'قبل حذف دفعة', 'user', who));
  insert into app_outbox (kind, payload) values ('audit', jsonb_build_object('user', who, 'action', 'حذف ' || case when _rx_s(_rx_c(raw_, 3)) = 'تحويل' then 'تحويل عملة' else 'دفعة حساب' end,
    'record', _rx_s(_rx_c(raw_, 1)), 'field', _rx_s(_rx_c(raw_, 2)), 'old', coalesce(raw_ ->> 5, '') || ' ' || coalesce(raw_ ->> 6, ''), 'new', '-'));
  delete from store_rows where tbl = 'acc_payments' and rid = rid_;
  update store_meta set ver = ver + 1, updated_at = now() where tbl = 'acc_payments';
  perform _w_dv_bump(_acc_dvs());
  return jsonb_build_object('success', true, 'cfLinked', false, 'cfDeletedIds', '[]'::jsonb); end $$;

-- ===== deleteAccItem =====
create or replace function rw2_deleteaccitem(a jsonb, u text) returns jsonb language plpgsql volatile set search_path = public as
$$ declare id text := _rx_s(a -> 1); who text := coalesce(u, app_user(), '-'); rid_ text; raw_ jsonb; d text; begin
  if not app_has('accounts.delete') then raise exception 'لا تملك صلاحية' using errcode = '42501'; end if;
  if _gs_truthy(a -> 2) then raise exception 'غير مدعوم: حذف من الشاشة فقط' using errcode = '0A000'; end if;
  if not exists (select 1 from store_meta where tbl = 'acc_removed') then raise exception 'غير مدعوم: لا جدول شواهد' using errcode = '0A000'; end if;
  perform pg_advisory_xact_lock(hashtextextended('store:put:acc_items', 0));
  select rid, raw into rid_, raw_ from store_rows where tbl = 'acc_items' and _rx_s(_rx_c(raw, 0)) = id limit 1;
  if rid_ is null then return jsonb_build_object('success', false, 'error', 'البند غير موجود'); end if;
  d := _rx_s(_rx_c(raw_, 3));
  if d ~ '⟦src:HB\.' or d ~* '⟦cf:([a-z0-9]+)⟧' then raise exception 'غير مدعوم: حجز فندقي/ترحيل رصيد' using errcode = '0A000'; end if;
  insert into app_outbox (kind, payload) values ('audit', jsonb_build_object('user', who, 'action', 'حذف بند حساب', 'record', _rx_s(_rx_c(raw_, 1)), 'field', _rx_s(_rx_c(raw_, 2)),
    'old', regexp_replace(d, '\s*⟦(?:cf|src):[^⟧]+⟧\s*$', '', 'i') || ' = ' || coalesce(raw_ ->> 8, '') || ' ' || coalesce(raw_ ->> 5, ''), 'new', '-'));
  perform _acc_tomb_add(_rx_trim(_rx_s(_rx_c(raw_, 1))), _rx_trim(_rx_s(_rx_c(raw_, 2))), d, who);
  delete from store_rows where tbl = 'acc_items' and rid = rid_;
  update store_meta set ver = ver + 1, updated_at = now() where tbl = 'acc_items';
  perform _w_dv_bump(_acc_dvs());
  return jsonb_build_object('success', true, 'cfLinked', false, 'cfDeletedIds', '[]'::jsonb); end $$;

-- ===== deleteAccItemsBulk =====
create or replace function rw2_deleteaccitemsbulk(a jsonb, u text) returns jsonb language plpgsql volatile set search_path = public as
$$ declare ids jsonb := a -> 1; who text := coalesce(u, app_user(), '-'); r record; n int := 0; hb int := 0; cl text := ''; tr text := ''; rids text[] := '{}'; idset text[]; begin
  if not app_has('accounts.delete') then raise exception 'لا تملك صلاحية' using errcode = '42501'; end if;
  if jsonb_typeof(ids) is distinct from 'array' or jsonb_array_length(ids) = 0 then return jsonb_build_object('success', false, 'error', 'لا توجد بنود محددة'); end if;
  if not exists (select 1 from store_meta where tbl = 'acc_removed') then raise exception 'غير مدعوم: لا جدول شواهد' using errcode = '0A000'; end if;
  select array_agg(case when jsonb_typeof(x) = 'string' then x #>> '{}' else x::text end) into idset from jsonb_array_elements(ids) x;
  perform pg_advisory_xact_lock(hashtextextended('store:put:acc_items', 0));
  if not exists (select 1 from store_rows where tbl = 'acc_items') then return jsonb_build_object('success', false, 'error', 'لا توجد بنود'); end if;
  for r in select rid, raw from store_rows where tbl = 'acc_items' order by ord, rid loop
    if not (_rx_s(_rx_c(r.raw, 0)) = any(idset)) then continue; end if;
    if _rx_s(_rx_c(r.raw, 3)) ~ '⟦src:HB\.' then hb := hb + 1; continue; end if;
    rids := rids || r.rid; n := n + 1;
    cl := coalesce(nullif(_rx_s(_rx_c(r.raw, 1)), ''), cl); tr := coalesce(nullif(_rx_s(_rx_c(r.raw, 2)), ''), tr);
    perform _acc_tomb_add(_rx_trim(_rx_s(_rx_c(r.raw, 1))), _rx_trim(_rx_s(_rx_c(r.raw, 2))), _rx_s(_rx_c(r.raw, 3)), who);
  end loop;
  if n = 0 then return jsonb_build_object('success', false, 'error', case when hb > 0 then 'هذا البند حجز فندقي من برنامج الحجوزات (له قيده بالحسابات العامة) — يُعدَّل من شاشة الحجوزات، ويمكن نقله لرحلة بزر 🔀' else 'البنود غير موجودة' end); end if;
  delete from store_rows where tbl = 'acc_items' and rid = any(rids);
  update store_meta set ver = ver + 1, updated_at = now() where tbl = 'acc_items';
  insert into app_outbox (kind, payload) values ('audit', jsonb_build_object('user', who, 'action', 'حذف بنود حساب دفعة واحدة', 'record', cl, 'field', tr, 'old', n || ' بند', 'new', '-'));
  perform _w_dv_bump(_acc_dvs());
  return jsonb_build_object('success', true, 'count', n, 'hbSkipped', hb); end $$;

-- ===== saveAccPayment (تعديل دفعة + تحويل عملة جديد فقط) =====
create or replace function rw2_saveaccpayment(a jsonb, u text) returns jsonb language plpgsql volatile set search_path = public as
$$ declare
  p jsonb := a -> 1; isedit boolean; client text; trip text; amt float8; ptype text; cur text; rate float8; dsc text; who text := coalesce(u, app_user(), '-');
  rid_ text; oldraw jsonb; newraw jsonb; od text; cfm text; nd text; srcm text; oamt float8; id text; nowj jsonb := jsonb_build_object('$d', (extract(epoch from clock_timestamp()) * 1000)::bigint); src text; dst text; fxop text;
begin
  if jsonb_typeof(p) is distinct from 'object' then raise exception 'بيانات الدفعة مطلوبة' using errcode = 'P0001'; end if;
  isedit := btrim(coalesce(p ->> 'id', '')) <> '';
  ptype := case when (p ->> 'ptype') = 'تحويل' then 'تحويل' else 'دفعة' end;
  if not isedit and ptype <> 'تحويل' then raise exception 'غير مدعوم: دفعة جديدة (سند مسودة)' using errcode = '0A000'; end if;
  if not app_has('accounts.' || case when isedit then 'edit' else 'add' end) then raise exception 'لا تملك صلاحية' using errcode = '42501'; end if;
  client := btrim(coalesce(p ->> 'client', '')); trip := btrim(coalesce(p ->> 'trip', ''));
  if client = '' or trip = '' then return jsonb_build_object('success', false, 'error', 'العميل والرحلة مطلوبان'); end if;
  amt := coalesce(_bk_pf(p -> 'amount'), 0);
  if amt <= 0 then return jsonb_build_object('success', false, 'error', 'المبلغ غير صالح'); end if;
  cur := case when (p ->> 'currency') = 'SAR' then 'SAR' else 'EGP' end;
  rate := coalesce(_bk_pf(p -> 'rate'), 0);
  if ptype = 'تحويل' and rate <= 0 then return jsonb_build_object('success', false, 'error', 'سعر الصرف مطلوب للتحويل'); end if;
  dsc := btrim(coalesce(p ->> 'desc', ''));
  if ptype = 'تحويل' and dsc = '' then
    src := case when cur = 'SAR' then 'ريال' else 'جنيه' end; dst := case when cur = 'SAR' then 'جنيه' else 'ريال' end; fxop := case when cur = 'SAR' then '×' else '/' end;
    dsc := 'قيمة تحويل ' || floor(amt + 0.5)::bigint::text || ' ' || src || ' ' || fxop || ' ' || rate::text || ' الى المعادل بال' || dst;
  end if;
  perform pg_advisory_xact_lock(hashtextextended('store:put:acc_payments', 0));

  if isedit then
    select rid, raw into rid_, oldraw from store_rows where tbl = 'acc_payments' and _rx_s(_rx_c(raw, 0)) = (p ->> 'id') limit 1;
    if rid_ is null then return jsonb_build_object('success', false, 'error', 'الدفعة غير موجودة'); end if;
    if btrim(coalesce(p ->> 'baseVer', '')) <> '' and (p ->> 'baseVer') <> _ca_ver(oldraw, 12) then
      return jsonb_build_object('success', false, 'conflict', true, 'error', '⚠️ عدّل مستخدم آخر هذا السجل بعد فتحك له — أعد فتحه لترى التعديل ثم أعد تعديلك'); end if;
    od := _rx_s(_rx_c(oldraw, 8));
    cfm := (regexp_match(od, '⟦cf:[a-z0-9]+⟧', 'i'))[1];
    nd := dsc || case when cfm is not null and position('⟦cf:' in dsc) = 0 then ' ' || cfm else '' end;
    srcm := (regexp_match(od, '⟦src:gl-[^⟧]+⟧'))[1];
    if srcm is not null and position('⟦src:gl-' in nd) = 0 then nd := btrim(nd || ' ' || srcm); end if;
    insert into app_outbox (kind, payload) values ('snaprow', jsonb_build_object('sheet', 'ClientAccounts_Payments', 'key', p ->> 'id', 'row', oldraw, 'action', 'قبل تعديل دفعة', 'user', who));
    oamt := coalesce(_bk_pf(_rx_c(oldraw, 5)), 0);
    newraw := oldraw;
    newraw := jsonb_set(newraw, '{3}', to_jsonb(ptype));
    newraw := jsonb_set(newraw, '{4}', to_jsonb(coalesce(p ->> 'date', '')));
    newraw := jsonb_set(newraw, '{5}', to_jsonb(amt));
    newraw := jsonb_set(newraw, '{6}', to_jsonb(cur));
    newraw := jsonb_set(newraw, '{7}', case when ptype = 'تحويل' then to_jsonb(rate) else '""'::jsonb end);
    newraw := jsonb_set(newraw, '{8}', to_jsonb(nd));
    update store_rows set raw = newraw where tbl = 'acc_payments' and rid = rid_;
    update store_meta set ver = ver + 1, updated_at = now() where tbl = 'acc_payments';
    insert into app_outbox (kind, payload) values ('audit', jsonb_build_object('user', who, 'action', 'تعديل دفعة حساب', 'record', client, 'field', trip,
      'old', oamt::text || ' ' || case when coalesce(nullif(_rx_s(_rx_c(oldraw, 6)), ''), 'EGP') = 'SAR' then 'ريال' else 'جنيه' end || ' — ' || regexp_replace(od, '\s*⟦cf:[a-z0-9]+⟧\s*$', '', 'i'),
      'new', amt::text || ' ' || cur || ' — ' || dsc));
    perform _w_dv_bump(_acc_dvs());
    return jsonb_build_object('success', true, 'id', p ->> 'id', 'ver', _ca_ver(newraw, 12));
  end if;

  -- تحويل عملة جديد
  if trip <> 'عام' and not exists (select 1 from store_rows where tbl = 'acc_meta' and btrim(_rx_s(raw -> 0)) = client and btrim(_rx_s(raw -> 1)) = trip) then
    raise exception 'غير مدعوم: لا صف meta' using errcode = '0A000'; end if;
  id := 'P' || _w_b36((extract(epoch from clock_timestamp()) * 1000)::bigint) || _w_b36((random() * 10000)::int);
  newraw := jsonb_build_array(id, client, trip, 'تحويل', coalesce(p ->> 'date', ''), amt, cur, rate, dsc, who, nowj, '');
  insert into store_rows (tbl, rid, ord, raw)
    select 'acc_payments', substr(md5(random()::text || clock_timestamp()::text), 1, 20), coalesce(max(ord), 0) + 1, newraw from store_rows where tbl = 'acc_payments';
  update store_meta set ver = ver + 1, updated_at = now() where tbl = 'acc_payments';
  insert into app_outbox (kind, payload) values ('audit', jsonb_build_object('user', who, 'action', 'تحويل عملة بحساب', 'record', client, 'field', trip, 'old', '-',
    'new', amt::text || ' ' || cur || ' × ' || rate::text || ' = ' || _gs_r2(amt * rate)::text || ' ' || (case when cur = 'SAR' then 'EGP' else 'SAR' end) || ' — ' || dsc));
  perform _w_dv_bump(_acc_dvs());
  return jsonb_build_object('success', true, 'id', id, 'serial', ''); end $$;

do $$ declare r record; begin
  for r in select p.oid::regprocedure::text sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname in ('rw2_deleteaccpayment', 'rw2_deleteaccitem', 'rw2_deleteaccitemsbulk', 'rw2_saveaccpayment', '_acc_tomb_add') loop
    execute format('revoke all on function %s from public, anon, authenticated', r.sig);
    execute format('grant execute on function %s to service_role', r.sig);
  end loop;
end $$;

-- V4.436: سلامة أسماء العملاء والرحلات — منع جذري + أداة تدقيق وإصلاح لكل العملاء
--  (1) حفظ كشف المعتمرين يُرفض إن كانت الرحلة غير موجودة بكشف الرحلات (كشف مفتوح باسم قديم كان يُنشئ معتمرين «يتامى» ⇒ رحلة وهمية بحساب العميل)
--      أو كان فيه عميل غير مسجَّل بدليل العملاء (كان الاسم المكتوب خطأً يُسجَّل تلقائياً عميلاً جديداً بلا تأكيد).
--  (2) لا تُحذف رحلة بكشفها معتمرون.
--  (3) rx2_accdataaudit: الرحلات غير الموجودة بحسابات العملاء + أسماء العملاء غير المسجَّلة بالدليل (كل العملاء).
--  (4) rw2_accorphanfix: نقل بنود/دفعات/معتمري رحلة غير موجودة إلى رحلة حقيقية، أو حذفها (لسلة المحذوفات).
--  (5) rw2_clientmergename: دمج اسم عميل خطأ في العميل الصحيح بكل الجداول (الكشوف · الحسابات · التسعير · الإشعارات · الوزارة · التأشيرات).
-- يتطلب: 035 (سلة المحذوفات) و037 (حفظ الكشف) و033 (حذف رحلة).

create or replace function _stp_guard(trip text, pil jsonb) returns void language plpgsql stable set search_path = public as
$$ declare have jsonb; bad text[] := '{}'; r jsonb; cl text; nk text; seen jsonb := '{}'::jsonb; begin
  if exists (select 1 from store_rows where tbl = 'trips') and not (_mf_trip_names() ? trip) then
    raise exception '🚫 الرحلة «%» غير موجودة بكشف الرحلات (ربما أُعيدت تسميتها أو حُذفت) — أغلق الكشف وافتحه من شاشة الرحلات ثم احفظ. لم يُحفظ شيء.', trip using errcode = 'P0001'; end if;
  if not exists (select 1 from store_rows where tbl = 'clients') then return; end if;
  select coalesce(jsonb_object_agg(_stp_cnorm(_rx_s(_rx_c(raw, 0))), 1), '{}'::jsonb) into have from store_rows where tbl = 'clients' and btrim(_rx_s(_rx_c(raw, 0))) <> '';
  for r in select * from jsonb_array_elements(pil) loop
    if btrim(coalesce(r ->> 'name', '')) = '' then continue; end if;
    cl := btrim(coalesce(r ->> 'client', ''));
    if cl = '' or cl = 'مشرف' or position('المشرف' in cl) = 1 then continue; end if;
    nk := _stp_cnorm(cl); if have ? nk or seen ? nk then continue; end if;
    seen := seen || jsonb_build_object(nk, 1); bad := bad || cl;
  end loop;
  if array_length(bad, 1) > 0 then
    raise exception '🚫 عملاء غير مسجَّلين بدليل العملاء: % — اختر العميل الصحيح من القائمة، أو سجّله أولاً كعميل جديد (لا يُسجَّل عميل تلقائياً). لم يُحفظ شيء.',
      array_to_string(bad[1:8], '، ') || case when array_length(bad, 1) > 8 then ' …' else '' end using errcode = 'P0001'; end if;
end $$;

create or replace function _dt_guard(nm text) returns void language plpgsql stable set search_path = public as
$$ declare ix jsonb := _pm_ix(); n int; begin
  select count(*) into n from store_rows where tbl = 'pilgrims' and _rx_trim(_rx_s(_rx_c(raw, (ix ->> 'tripName')::int))) = nm and _rx_trim(_rx_s(_rx_c(raw, (ix ->> 'name')::int))) <> '';
  if nm <> '' and n > 0 then raise exception '🚫 لا يمكن حذف الرحلة «%» وبكشفها % معتمر — انقلهم لرحلة أخرى أو احذفهم من الكشف أولاً.', nm, n using errcode = 'P0001'; end if; end $$;

-- حقن الحارس في حفظ الكشف (037) وحذف الرحلة (033) دون نسخ جسميهما
do $$ declare d text; begin
  d := pg_get_functiondef('rw2_savetrippilgrims(jsonb,text)'::regprocedure);
  if position('_stp_guard' in d) = 0 then
    d := replace(d, 'perform pg_advisory_xact_lock(hashtextextended(''store:put:pilgrims'', 0));',
                    'perform _stp_guard(trip, pil); perform pg_advisory_xact_lock(hashtextextended(''store:put:pilgrims'', 0));');
    if position('_stp_guard' in d) = 0 then raise exception '059: لم يُعثر على موضع الحارس بـ rw2_savetrippilgrims'; end if;
    execute d;
  end if;
  d := pg_get_functiondef('rw2_deletetrip(jsonb,text)'::regprocedure);
  if position('_dt_guard' in d) = 0 then
    d := replace(d, 'nm := _rx_trim(_rx_s(_rx_c(raw_, 0)));', 'nm := _rx_trim(_rx_s(_rx_c(raw_, 0))); perform _dt_guard(nm);');
    if position('_dt_guard' in d) = 0 then raise exception '059: لم يُعثر على موضع الحارس بـ rw2_deletetrip'; end if;
    execute d;
  end if;
end $$;

-- ===== (3) التدقيق: rx2_accdataaudit(a=[token]) =====
create or replace function rx2_accdataaudit(a jsonb, u text) returns jsonb language plpgsql stable set search_path = public as
$$ declare ix jsonb := _pm_ix(); i_cl int := (ix ->> 'client')::int; i_tr int := (ix ->> 'tripName')::int; i_nm int := (ix ->> 'name')::int;
  tn jsonb := _mf_trip_names(); dir jsonb; orph jsonb; stray jsonb; mfh jsonb := _rx_hdr('mf_files'); i_mfb int; begin
  if not (app_has('accounts.view') or app_has('accounts.edit')) then raise exception 'لا تملك صلاحية عرض حسابات العملاء' using errcode = '42501'; end if;
  i_mfb := _rx_idx(mfh, 'بنود العميل (JSON)');
  select coalesce(jsonb_object_agg(_stp_cnorm(n), n), '{}'::jsonb) into dir from (select btrim(_rx_s(_rx_c(raw, 0))) n from store_rows where tbl = 'clients') z where n <> '';
  -- رحلات غير موجودة بكشف الرحلات لكنها مرتبطة بعميل (معتمرون/بنود/دفعات/نمط حساب)
  with o as (
      select _rx_trim(_rx_s(_rx_c(raw, i_cl))) cl, _rx_trim(_rx_s(_rx_c(raw, i_tr))) tr, 'pil' k from store_rows where tbl = 'pilgrims' and _rx_trim(_rx_s(_rx_c(raw, i_nm))) <> ''
      union all select _rx_trim(_rx_s(_rx_c(raw, 1))), _rx_trim(_rx_s(_rx_c(raw, 2))), 'items' from store_rows where tbl = 'acc_items'
      union all select _rx_trim(_rx_s(_rx_c(raw, 1))), _rx_trim(_rx_s(_rx_c(raw, 2))), 'pays' from store_rows where tbl = 'acc_payments'
      union all select _rx_trim(_rx_s(_rx_c(raw, 0))), _rx_trim(_rx_s(_rx_c(raw, 1))), 'meta' from store_rows where tbl = 'acc_meta')
  select coalesce(jsonb_agg(jsonb_build_object('client', cl, 'trip', tr, 'pil', pil, 'items', it, 'pays', py, 'meta', mt) order by cl, tr), '[]'::jsonb) into orph from (
    select cl, tr, count(*) filter (where k = 'pil') pil, count(*) filter (where k = 'items') it, count(*) filter (where k = 'pays') py, count(*) filter (where k = 'meta') mt
      from o where cl <> '' and tr <> '' and tr <> 'عام' and not (tn ? tr) and not (cl = 'مشرف' or position('المشرف' in cl) = 1) group by cl, tr) q;
  -- أسماء عملاء مستخدمة وغير مسجَّلة بدليل العملاء
  with n as (
      select _rx_trim(_rx_s(_rx_c(raw, i_cl))) nm, 'pil' k from store_rows where tbl = 'pilgrims' and _rx_trim(_rx_s(_rx_c(raw, i_nm))) <> ''
      union all select _rx_trim(_rx_s(_rx_c(raw, 1))), 'acc' from store_rows where tbl = 'acc_items'
      union all select _rx_trim(_rx_s(_rx_c(raw, 1))), 'acc' from store_rows where tbl = 'acc_payments'
      union all select _rx_trim(_rx_s(_rx_c(raw, 0))), 'acc' from store_rows where tbl = 'acc_client_prices'
      union all select _rx_trim(_rx_s(b -> 'name')), 'mf' from store_rows s, jsonb_array_elements(case when jsonb_typeof(_rx_json(_rx_s(_rx_c(s.raw, coalesce(i_mfb, -1))))) = 'array' then _rx_json(_rx_s(_rx_c(s.raw, coalesce(i_mfb, -1)))) else '[]'::jsonb end) b
        where s.tbl = 'mf_files' and i_mfb is not null and jsonb_typeof(b) = 'object'
      union all select _rx_trim(_rx_s(b -> 'name')), 'vz' from store_rows s, jsonb_array_elements(case when jsonb_typeof(_rx_json(_rx_s(_rx_c(s.raw, 8)))) = 'array' then _rx_json(_rx_s(_rx_c(s.raw, 8))) else '[]'::jsonb end) b
        where s.tbl = 'vz_files' and jsonb_typeof(b) = 'object')
  select coalesce(jsonb_agg(jsonb_build_object('name', nm, 'pil', pil, 'acc', acc, 'mf', mf, 'vz', vz) order by nm), '[]'::jsonb) into stray from (
    select nm, count(*) filter (where k = 'pil') pil, count(*) filter (where k = 'acc') acc, count(*) filter (where k = 'mf') mf, count(*) filter (where k = 'vz') vz
      from n where nm <> '' and not (nm = 'مشرف' or position('المشرف' in nm) = 1) and not (dir ? _stp_cnorm(nm)) and not (tn ? nm) group by nm) q;
  return jsonb_build_object('success', true, 'orphanTrips', orph, 'strayClients', stray,
    'clients', coalesce((select jsonb_agg(v order by v) from jsonb_each_text(dir) e(k, v)), '[]'::jsonb),
    'trips', coalesce((select jsonb_agg(k order by k) from jsonb_object_keys(tn) k), '[]'::jsonb)); end $$;

-- ===== (4) إصلاح رحلة غير موجودة لعميل: a=[token, {client, trip, action:'move'|'delete', target}] =====
create or replace function rw2_accorphanfix(a jsonb, u text) returns jsonb language plpgsql volatile set search_path = public as
$$ declare p jsonb := coalesce(a -> 1, '{}'::jsonb); cl text := _rx_trim(_rx_s(p -> 'client')); tr text := _rx_trim(_rx_s(p -> 'trip')); act text := _rx_s(p -> 'action');
  tg text := _rx_trim(_rx_s(p -> 'target')); who text := coalesce(u, app_user(), '-'); ix jsonb := _pm_ix(); i_cl int := (ix ->> 'client')::int; i_tr int := (ix ->> 'tripName')::int;
  i_ps int := (ix ->> 'passport')::int; n_it int := 0; n_py int := 0; n_mt int := 0; n_pm int := 0; n_pd int := 0; tgp jsonb; r record; begin
  if not app_has('accounts.edit') then raise exception 'لا تملك صلاحية تعديل حسابات العملاء' using errcode = '42501'; end if;
  if cl = '' or tr = '' or tr = 'عام' then return jsonb_build_object('success', false, 'error', 'بيانات ناقصة'); end if;
  if _mf_trip_names() ? tr then return jsonb_build_object('success', false, 'error', 'الرحلة «' || tr || '» موجودة بكشف الرحلات — ليست رحلة يتيمة'); end if;
  perform pg_advisory_xact_lock(hashtextextended('store:put:pilgrims', 0));
  perform pg_advisory_xact_lock(hashtextextended('store:put:acc_items', 0)); perform pg_advisory_xact_lock(hashtextextended('store:put:acc_payments', 0));
  perform pg_advisory_xact_lock(hashtextextended('store:put:acc_meta', 0));
  if act = 'move' then
    if tg = '' or not (_mf_trip_names() ? tg) then return jsonb_build_object('success', false, 'error', 'اختر رحلة موجودة بكشف الرحلات'); end if;
    perform _rb_on('acc_orphan', 'نقل رحلة يتيمة ' || cl || ' — ' || tr || ' ⇒ ' || tg, 'معتمرون مكررون بالرحلة الهدف', who);
    update store_rows set raw = jsonb_set(raw, '{2}', to_jsonb(tg)) where tbl = 'acc_items' and _rx_trim(_rx_s(_rx_c(raw, 1))) = cl and _rx_trim(_rx_s(_rx_c(raw, 2))) = tr;
    get diagnostics n_it = row_count;
    update store_rows set raw = jsonb_set(raw, '{2}', to_jsonb(tg)) where tbl = 'acc_payments' and _rx_trim(_rx_s(_rx_c(raw, 1))) = cl and _rx_trim(_rx_s(_rx_c(raw, 2))) = tr;
    get diagnostics n_py = row_count;
    if exists (select 1 from store_rows where tbl = 'acc_meta' and _rx_trim(_rx_s(_rx_c(raw, 0))) = cl and _rx_trim(_rx_s(_rx_c(raw, 1))) = tg) then
      delete from store_rows where tbl = 'acc_meta' and _rx_trim(_rx_s(_rx_c(raw, 0))) = cl and _rx_trim(_rx_s(_rx_c(raw, 1))) = tr;
    else update store_rows set raw = jsonb_set(raw, '{1}', to_jsonb(tg)) where tbl = 'acc_meta' and _rx_trim(_rx_s(_rx_c(raw, 0))) = cl and _rx_trim(_rx_s(_rx_c(raw, 1))) = tr; end if;
    get diagnostics n_mt = row_count;
    -- المعتمرون: المكرَّر بنفس الجواز بالرحلة الهدف يُحذف (لسلة المحذوفات) · غير المكرَّر يُنقل للرحلة الهدف
    select coalesce(jsonb_object_agg(k, 1), '{}'::jsonb) into tgp from (select distinct _ae_pkey(_rx_s(_rx_c(raw, i_ps))) k from store_rows where tbl = 'pilgrims' and _rx_trim(_rx_s(_rx_c(raw, i_tr))) = tg) z where k <> '';
    delete from store_rows where tbl = 'pilgrims' and _rx_trim(_rx_s(_rx_c(raw, i_cl))) = cl and _rx_trim(_rx_s(_rx_c(raw, i_tr))) = tr and _ae_pkey(_rx_s(_rx_c(raw, i_ps))) <> '' and tgp ? _ae_pkey(_rx_s(_rx_c(raw, i_ps)));
    get diagnostics n_pd = row_count;
    update store_rows set raw = jsonb_set(raw, array[i_tr::text], to_jsonb(tg)) where tbl = 'pilgrims' and _rx_trim(_rx_s(_rx_c(raw, i_cl))) = cl and _rx_trim(_rx_s(_rx_c(raw, i_tr))) = tr;
    get diagnostics n_pm = row_count;
    insert into app_outbox (kind, payload) values ('audit', jsonb_build_object('user', who, 'action', 'نقل رحلة غير موجودة بحساب العميل', 'record', cl, 'field', tr,
      'old', tr, 'new', tg || ' (بنود ' || n_it || ' · دفعات ' || n_py || ' · معتمرون نُقلوا ' || n_pm || ' · مكرَّرون حُذفوا ' || n_pd || ')'));
  elsif act = 'delete' then
    if not app_has('accounts.delete') then raise exception 'لا تملك صلاحية حذف بنود/دفعات الحسابات' using errcode = '42501'; end if;
    if exists (select 1 from store_rows where tbl = 'pilgrims' and _rx_trim(_rx_s(_rx_c(raw, i_cl))) = cl and _rx_trim(_rx_s(_rx_c(raw, i_tr))) = tr) and not app_has('kashf.delete') then
      raise exception 'لا تملك صلاحية حذف معتمرين' using errcode = '42501'; end if;
    if exists (select 1 from store_rows where tbl in ('acc_items', 'acc_payments') and _rx_trim(_rx_s(_rx_c(raw, 1))) = cl and _rx_trim(_rx_s(_rx_c(raw, 2))) = tr
                 and (raw::text ~ '⟦src:gl-' or raw::text ~* '⟦cf:')) then
      return jsonb_build_object('success', false, 'error', 'بهذه الرحلة دفعات/بنود مرتبطة بسندات الحسابات العامة أو بترحيل رصيد — استخدم «نقل إلى رحلة» بدل الحذف'); end if;
    perform _rb_on('acc_orphan', 'حذف رحلة يتيمة ' || cl || ' — ' || tr, 'بنود/دفعات/نمط/معتمرون', who);
    delete from store_rows where tbl = 'acc_items' and _rx_trim(_rx_s(_rx_c(raw, 1))) = cl and _rx_trim(_rx_s(_rx_c(raw, 2))) = tr; get diagnostics n_it = row_count;
    delete from store_rows where tbl = 'acc_payments' and _rx_trim(_rx_s(_rx_c(raw, 1))) = cl and _rx_trim(_rx_s(_rx_c(raw, 2))) = tr; get diagnostics n_py = row_count;
    delete from store_rows where tbl = 'acc_meta' and _rx_trim(_rx_s(_rx_c(raw, 0))) = cl and _rx_trim(_rx_s(_rx_c(raw, 1))) = tr; get diagnostics n_mt = row_count;
    delete from store_rows where tbl = 'pilgrims' and _rx_trim(_rx_s(_rx_c(raw, i_cl))) = cl and _rx_trim(_rx_s(_rx_c(raw, i_tr))) = tr; get diagnostics n_pd = row_count;
    insert into app_outbox (kind, payload) values ('audit', jsonb_build_object('user', who, 'action', 'حذف رحلة غير موجودة من حساب العميل', 'record', cl, 'field', tr,
      'old', 'بنود ' || n_it || ' · دفعات ' || n_py || ' · معتمرون ' || n_pd, 'new', '-'));
  else return jsonb_build_object('success', false, 'error', 'إجراء غير معروف'); end if;
  update store_meta set ver = ver + 1, updated_at = now() where tbl in ('acc_items', 'acc_payments', 'acc_meta', 'pilgrims');
  perform _w_dv_bump(_acc_dvs());
  return jsonb_build_object('success', true, 'items', n_it, 'pays', n_py, 'meta', n_mt, 'pilMoved', n_pm, 'pilDeleted', n_pd); end $$;

-- ===== (5) دمج اسم عميل في آخر: a=[token, من, إلى] =====
create or replace function _cm_json_ren(t text, f text, tt text) returns text language plpgsql immutable as
$$ declare j jsonb := _rx_json(t); begin
  if jsonb_typeof(j) <> 'array' then return t; end if;
  if not exists (select 1 from jsonb_array_elements(j) b where jsonb_typeof(b) = 'object' and btrim(coalesce(b ->> 'name', '')) = f) then return t; end if;
  return (select jsonb_agg(case when jsonb_typeof(b) = 'object' and btrim(coalesce(b ->> 'name', '')) = f then jsonb_set(b, '{name}', to_jsonb(tt)) else b end order by o) from jsonb_array_elements(j) with ordinality x(b, o))::text; end $$;
create or replace function rw2_clientmergename(a jsonb, u text) returns jsonb language plpgsql volatile set search_path = public as
$$ declare f text := _rx_trim(_rx_s(a -> 1)); tt text := _rx_trim(_rx_s(a -> 2)); who text := coalesce(u, app_user(), '-'); ix jsonb := _pm_ix(); i_cl int := (ix ->> 'client')::int;
  n int; tot jsonb := '{}'::jsonb; c int; bh jsonb := _rx_hdr('bookings'); mh jsonb := _rx_hdr('mf_files'); i_b int; i_m int; i_mb int; begin
  if not app_has('accounts.edit') then raise exception 'لا تملك صلاحية تعديل حسابات العملاء' using errcode = '42501'; end if;
  if f = '' or tt = '' or f = tt then return jsonb_build_object('success', false, 'error', 'اختر الاسم الخطأ والعميل الصحيح'); end if;
  if not exists (select 1 from store_rows where tbl = 'clients' and btrim(_rx_s(_rx_c(raw, 0))) = tt) then return jsonb_build_object('success', false, 'error', 'العميل «' || tt || '» غير مسجَّل بدليل العملاء'); end if;
  perform pg_advisory_xact_lock(hashtextextended('store:put:pilgrims', 0));
  perform _rb_on('client_merge', 'دمج العميل «' || f || '» في «' || tt || '»', 'صفوف مكرَّرة حُذفت أثناء الدمج', who);
  update store_rows set raw = jsonb_set(raw, array[i_cl::text], to_jsonb(tt)) where tbl = 'pilgrims' and _rx_trim(_rx_s(_rx_c(raw, i_cl))) = f; get diagnostics n = row_count; tot := tot || jsonb_build_object('pilgrims', n);
  update store_rows set raw = jsonb_set(raw, '{1}', to_jsonb(tt)) where tbl in ('acc_items', 'acc_payments') and _rx_trim(_rx_s(_rx_c(raw, 1))) = f; get diagnostics n = row_count; tot := tot || jsonb_build_object('acc', n);
  -- نمط الحساب: لو للعميل الصحيح صف لنفس الرحلة يُحذف صف الاسم الخطأ
  delete from store_rows m where m.tbl = 'acc_meta' and _rx_trim(_rx_s(_rx_c(m.raw, 0))) = f
    and exists (select 1 from store_rows x where x.tbl = 'acc_meta' and _rx_trim(_rx_s(_rx_c(x.raw, 0))) = tt and _rx_trim(_rx_s(_rx_c(x.raw, 1))) = _rx_trim(_rx_s(_rx_c(m.raw, 1))));
  update store_rows set raw = jsonb_set(raw, '{0}', to_jsonb(tt)) where tbl in ('acc_meta', 'acc_merge_groups') and _rx_trim(_rx_s(_rx_c(raw, 0))) = f;
  -- التسعير: يبقى تسعير العميل الصحيح إن وُجد
  if exists (select 1 from store_rows where tbl = 'acc_client_prices' and _rx_trim(_rx_s(_rx_c(raw, 0))) = tt) then
    delete from store_rows where tbl = 'acc_client_prices' and _rx_trim(_rx_s(_rx_c(raw, 0))) = f;
  else update store_rows set raw = jsonb_set(raw, '{0}', to_jsonb(tt)) where tbl = 'acc_client_prices' and _rx_trim(_rx_s(_rx_c(raw, 0))) = f; end if;
  i_b := _rx_idx(bh, 'العميل');
  if i_b is not null then update store_rows set raw = jsonb_set(raw, array[i_b::text], to_jsonb(tt)) where tbl = 'bookings' and _rx_trim(_rx_s(_rx_c(raw, i_b))) = f; end if;
  i_m := _rx_idx(mh, 'العميل'); i_mb := _rx_idx(mh, 'بنود العميل (JSON)');
  if i_m is not null then update store_rows set raw = jsonb_set(raw, array[i_m::text], to_jsonb(tt)) where tbl = 'mf_files' and _rx_trim(_rx_s(_rx_c(raw, i_m))) = f; end if;
  if i_mb is not null then update store_rows set raw = jsonb_set(raw, array[i_mb::text], to_jsonb(_cm_json_ren(_rx_s(_rx_c(raw, i_mb)), f, tt)))
    where tbl = 'mf_files' and _rx_s(_rx_c(raw, i_mb)) like '%' || f || '%'; get diagnostics n = row_count; tot := tot || jsonb_build_object('mf', n); end if;
  update store_rows set raw = jsonb_set(raw, '{8}', to_jsonb(_cm_json_ren(_rx_s(_rx_c(raw, 8)), f, tt))) where tbl = 'vz_files' and _rx_s(_rx_c(raw, 8)) like '%' || f || '%';
  get diagnostics n = row_count; tot := tot || jsonb_build_object('vz', n);
  -- صف الاسم الخطأ بدليل العملاء (إن وُجد) ⇒ سلة المحذوفات
  delete from store_rows where tbl = 'clients' and btrim(_rx_s(_rx_c(raw, 0))) = f;
  update store_meta set ver = ver + 1, updated_at = now() where tbl in ('pilgrims', 'acc_items', 'acc_payments', 'acc_meta', 'acc_merge_groups', 'acc_client_prices', 'bookings', 'mf_files', 'vz_files', 'clients');
  insert into app_outbox (kind, payload) values ('audit', jsonb_build_object('user', who, 'action', 'دمج اسم عميل', 'record', tt, 'field', 'اسم العميل', 'old', f, 'new', tt || ' ' || tot::text));
  perform _w_dv_bump(array['bookings', 'trips', 'pilgrims', 'visa', 'ministry', 'dropdowns'] || _acc_dvs());
  return jsonb_build_object('success', true, 'counts', tot); end $$;

do $$ declare r record; begin
  for r in select p.oid::regprocedure::text sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname in ('_stp_guard', '_dt_guard', 'rx2_accdataaudit', 'rw2_accorphanfix', '_cm_json_ren', 'rw2_clientmergename') loop
    execute format('revoke all on function %s from public, anon, authenticated', r.sig);
    execute format('grant execute on function %s to service_role', r.sig);
  end loop;
end $$;

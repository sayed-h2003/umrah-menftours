-- V4.444 · الدفعة 1 (مجال الرحلات والمعتمرين والإشعارات) ⇒ Postgres. منطق كل دالة = نظيرتها بـ Code.gs.
-- دليل العملاء (إضافة/تعديل مع انتشار الاسم/حذف) · إعدادات الشركات · روابط العميل · الرحلة بالاسم · مستويات التسكين · تسعير الرحلة
-- · مقارنة/اعتماد بيانات الإشعار · اقتراحات الربط · أسماء معتمري الإشعار · إشعارات بلا رحلة · المعتمر بالسجل العام · مسودة الرحلة
-- (مع إعادة التسمية والانتشار الكامل) · المهام الخلفية بعد حفظ الإشعار/الكشف · المطابقة لمرة واحدة.
-- لقطات التراجع (TripSnapshots) ورقة خارج طبقة التخزين ⇒ getTripSnapshots يبقى مع الدفعة 5 (تُنقل الورقة نفسها).
-- يتطلب: 007 · 011 · 013 · 024 · 034 · 037 · 039 · 059 · 067 · 070.

create or replace function _ix(m jsonb, k text) returns int language sql immutable as $$ select (m ->> k)::int $$;
-- String(v || '') بالنسخة النصية
create or replace function _td_s(v jsonb) returns jsonb language sql immutable as
$$ select case when _gs_truthy(v) then to_jsonb(v #>> '{}') else '""'::jsonb end $$;
create or replace function _row_rid(p_tbl text, p_row int) returns text language sql stable as
$$ select rid from store_rows where tbl = p_tbl order by ord, rid offset greatest(coalesce(p_row, 0) - 2, 0) limit 1 $$;
create or replace function _norm_l(s text) returns text language sql immutable as $$ select lower(_ac_norm(coalesce(s, ''))) $$;

-- ===== انتشار إعادة التسمية (= _cascadeClientRename_ / _cascadeTripRename_ + كشف المعتمرين والإشعارات) =====
create or replace function _ren_col(p_tbl text, p_idx int, o text, n text) returns int language plpgsql volatile set search_path = public as
$$ declare c int; begin
  if p_idx is null then return 0; end if;
  update store_rows set raw = jsonb_set(_x_pad(raw, p_idx + 1), array[p_idx::text], to_jsonb(n)) where tbl = p_tbl and _rx_trim(_rx_s(_rx_c(raw, p_idx))) = o;
  get diagnostics c = row_count; if c > 0 then perform _x_bump(p_tbl); end if; return c; end $$;
create or replace function _ren_jarr(p_tbl text, p_idx int, o text, n text) returns int language plpgsql volatile set search_path = public as
$$ declare c int; begin
  if p_idx is null then return 0; end if;
  update store_rows set raw = jsonb_set(raw, array[p_idx::text], to_jsonb((select jsonb_agg(case when jsonb_typeof(e) = 'string' and btrim(e #>> '{}') = o then to_jsonb(n) else e end order by k) from jsonb_array_elements(_rx_json(_rx_s(_rx_c(raw, p_idx)))) with ordinality q(e, k))::text))
   where tbl = p_tbl and jsonb_typeof(_rx_json(_rx_s(_rx_c(raw, p_idx)))) = 'array'
     and exists (select 1 from jsonb_array_elements(_rx_json(_rx_s(_rx_c(raw, p_idx)))) e where jsonb_typeof(e) = 'string' and btrim(e #>> '{}') = o);
  get diagnostics c = row_count; if c > 0 then perform _x_bump(p_tbl); end if; return c; end $$;
create or replace function _client_ren(o text, n text) returns int language plpgsql volatile set search_path = public as
$$ declare t int := 0; mh jsonb := _rx_hdr('mf_files'); i_mb int := _rx_idx(_rx_hdr('mf_files'), 'بنود العميل (JSON)'); c int; begin
  t := t + _ren_col('pilgrims', _ix(_pm_ix(), 'client'), o, n);
  t := t + _ren_col('acc_items', 1, o, n) + _ren_col('acc_payments', 1, o, n) + _ren_col('acc_meta', 0, o, n) + _ren_col('acc_client_prices', 0, o, n) + _ren_col('acc_merge_groups', 0, o, n);
  t := t + _ren_col('bookings', _rx_idx(_rx_hdr('bookings'), 'العميل'), o, n) + _ren_col('mf_files', _rx_idx(mh, 'العميل'), o, n);
  if i_mb is not null then
    update store_rows set raw = jsonb_set(raw, array[i_mb::text], to_jsonb(_cm_json_ren(_rx_s(_rx_c(raw, i_mb)), o, n))) where tbl = 'mf_files' and _rx_s(_rx_c(raw, i_mb)) like '%' || o || '%'
       and _cm_json_ren(_rx_s(_rx_c(raw, i_mb)), o, n) is distinct from _rx_s(_rx_c(raw, i_mb));
    get diagnostics c = row_count; t := t + c; if c > 0 then perform _x_bump('mf_files'); end if;
  end if;
  update store_rows set raw = jsonb_set(raw, '{8}', to_jsonb(_cm_json_ren(_rx_s(_rx_c(raw, 8)), o, n))) where tbl = 'vz_files' and _rx_s(_rx_c(raw, 8)) like '%' || o || '%'
     and _cm_json_ren(_rx_s(_rx_c(raw, 8)), o, n) is distinct from _rx_s(_rx_c(raw, 8));
  get diagnostics c = row_count; t := t + c; if c > 0 then perform _x_bump('vz_files'); end if;
  perform _w_dv_bump(array['bookings', 'trips', 'pilgrims', 'visa', 'ministry', 'dropdowns'] || _acc_dvs());
  return t; end $$;
create or replace function _trip_ren(o text, n text) returns int language plpgsql volatile set search_path = public as
$$ declare t int := 0; begin
  t := t + _ren_col('pilgrims', _ix(_pm_ix(), 'tripName'), o, n) + _ren_col('bookings', _rx_idx(_rx_hdr('bookings'), 'اسم الرحلة'), o, n);
  t := t + _ren_col('acc_items', 2, o, n) + _ren_col('acc_payments', 2, o, n) + _ren_col('acc_meta', 1, o, n) + _ren_col('acc_trip_prices', 0, o, n);
  t := t + _ren_col('mf_files', _rx_idx(_rx_hdr('mf_files'), 'الرحلة المرتبطة'), o, n) + _ren_col('housing_notes', 1, o, n) + _ren_jarr('acc_merge_groups', 1, o, n);
  insert into app_outbox (kind, payload) values ('tripren', jsonb_build_object('old', o, 'new', n));   -- لقطات التراجع (ورقة) ⇒ Apps Script
  perform _w_dv_bump(array['bookings', 'movements', 'trips', 'pilgrims', 'visa', 'ministry', 'dropdowns'] || _acc_dvs());
  return t; end $$;

-- ===== دليل العملاء =====
create or replace function rw2_addclientrecord(a jsonb, u text) returns jsonb language plpgsql volatile set search_path = public as
$$ declare who text := coalesce(u, app_user(), '-'); nm text := _w_str(a -> 1); mo text := _w_str(a -> 2); nt text := _w_str(a -> 3); ex text; begin
  if app_user() is null then raise exception 'غير مصرّح' using errcode = '42501'; end if;
  if nm = '' then raise exception 'اسم العميل مطلوب' using errcode = 'P0001'; end if;
  perform _x_lock('clients');
  if not coalesce((a ->> 4)::boolean, false) then
    select _rx_trim(_rx_s(_rx_c(raw, 0))) into ex from _rx_rows('clients') where _rx_trim(_rx_s(_rx_c(raw, 0))) <> '' and _norm_l(_rx_trim(_rx_s(_rx_c(raw, 0)))) = _norm_l(nm) order by rn limit 1;
    if ex is not null then raise exception '%', 'هذا العميل مسجَّل بالفعل باسم مطابق أو مقارب: «' || ex || '» — اختره من القائمة بدل إضافة تكرار جديد' using errcode = 'P0001'; end if;
  end if;
  perform _x_append('clients', jsonb_build_array(nm, mo, nt)); perform _x_bump('clients');
  perform _w_dv_bump(array['dropdowns']);
  return jsonb_build_object('success', true, 'client', jsonb_build_object('name', nm, 'mobile', mo, 'notes', nt)); end $$;
create or replace function rw2_updateclientrecord(a jsonb, u text) returns jsonb language plpgsql volatile set search_path = public as
$$ declare rw int := coalesce(_bk_pf(a -> 1), 0)::int; nm text := _w_str(a -> 2); rid_ text; old text; ex text; n int := 0; begin
  if app_user() is null then raise exception 'غير مصرّح' using errcode = '42501'; end if;
  if rw < 2 then raise exception 'سجل غير صالح' using errcode = 'P0001'; end if;
  if nm = '' then raise exception 'اسم العميل مطلوب' using errcode = 'P0001'; end if;
  perform _x_lock('clients');
  if rw - 1 > (select count(*) from store_rows where tbl = 'clients') then raise exception 'السجل غير موجود' using errcode = 'P0001'; end if;
  rid_ := _row_rid('clients', rw);
  select _rx_trim(_rx_s(_rx_c(raw, 0))) into old from store_rows where tbl = 'clients' and rid = rid_;
  select _rx_trim(_rx_s(_rx_c(raw, 0))) into ex from store_rows where tbl = 'clients' and rid <> rid_ and _rx_trim(_rx_s(_rx_c(raw, 0))) <> '' and _norm_l(_rx_trim(_rx_s(_rx_c(raw, 0)))) = _norm_l(nm) limit 1;
  if ex is not null then raise exception '%', 'اسم آخر مطابق أو مقارب مسجَّل بالفعل: ' || ex using errcode = 'P0001'; end if;
  update store_rows set raw = jsonb_set(jsonb_set(jsonb_set(_x_pad(raw, 3), '{0}', to_jsonb(nm)), '{1}', to_jsonb(_w_str(a -> 3))), '{2}', to_jsonb(_w_str(a -> 4))) where tbl = 'clients' and rid = rid_;
  perform _x_bump('clients');
  if coalesce(old, '') <> '' and old <> nm then perform _x_lock('pilgrims'); n := _client_ren(old, nm); end if;
  perform _w_dv_bump(array['dropdowns', 'visa', 'ministry']);
  return jsonb_build_object('success', true, 'renamedCount', n); end $$;
create or replace function rw2_deleteclientrecord(a jsonb, u text) returns jsonb language plpgsql volatile set search_path = public as
$$ declare who text := coalesce(u, app_user(), '-'); rw int := coalesce(_bk_pf(a -> 1), 0)::int; rid_ text; nm text; ix jsonb := _pm_ix(); wt int; nd int; begin
  if app_user() is null then raise exception 'غير مصرّح' using errcode = '42501'; end if;
  if rw < 2 then raise exception 'سجل غير صالح' using errcode = 'P0001'; end if;
  perform _x_lock('clients'); perform _x_lock('pilgrims');
  rid_ := case when rw - 1 <= (select count(*) from store_rows where tbl = 'clients') then _row_rid('clients', rw) end;
  select _rx_trim(_rx_s(_rx_c(raw, 0))) into nm from store_rows where tbl = 'clients' and rid = rid_;
  if coalesce(nm, '') = '' then raise exception 'السجل غير موجود' using errcode = 'P0001'; end if;
  select count(*) into wt from store_rows where tbl = 'pilgrims' and _rx_trim(_rx_s(_rx_c(raw, _ix(ix, 'client')))) = nm and _rx_trim(_rx_s(_rx_c(raw, _ix(ix, 'tripName')))) <> '';
  if wt > 0 then return jsonb_build_object('success', false, 'error', 'لا يمكن حذف العميل «' || nm || '» — له ' || wt || ' معتمر مسجَّل على رحلات فعلية. انقل أو احذف معتمريه من الرحلات أولاً.'); end if;
  perform _rb_on('pilgrims', 'معتمر بلا رحلة (حُذف مع عميله ' || nm || ')', '', who);
  delete from store_rows where tbl = 'pilgrims' and _rx_trim(_rx_s(_rx_c(raw, _ix(ix, 'client')))) = nm and _rx_trim(_rx_s(_rx_c(raw, _ix(ix, 'tripName')))) = '';
  get diagnostics nd = row_count; if nd > 0 then perform _x_bump('pilgrims'); end if;
  perform _rb_on('client', 'عميل', '', who);
  delete from store_rows where tbl = 'clients' and rid = rid_; perform _x_bump('clients');
  perform _w_dv_bump(array['bookings', 'movements', 'trips', 'pilgrims', 'visa', 'ministry', 'dropdowns']);
  perform _x_aud(who, 'حذف عميل', nm, '-', '-', case when nd > 0 then 'حُذف معه ' || nd || ' معتمر بدون رحلة' else '-' end);
  return jsonb_build_object('success', true, 'deletedPilgrims', nd); end $$;

-- ===== إعدادات الشركات/الوكلاء (Agents_Settings: الوكيل · الشركة · الشعار · رقم الترخيص) =====
create or replace function rx2_getcompaniessettings(a jsonb, u text) returns jsonb language plpgsql stable set search_path = public as
$$ begin
  perform _x_perm('settings_basic', 'هذه الإعدادات متاحة فقط لمستخدم بصلاحية «الإعدادات الأساسية» أو ALL');
  return coalesce((select jsonb_agg(jsonb_build_object('row', rn, 'agent', _rx_s(_rx_c(raw, 0)), 'company', _rx_s(_rx_c(raw, 1)), 'logoUrl', _rx_s(_rx_c(raw, 2)), 'licence', _rx_trim(_rx_s(_rx_c(raw, 3)))) order by rn)
     from _rx_rows('companies') where _gs_truthy(_rx_c(raw, 0)) or _gs_truthy(_rx_c(raw, 1))), '[]'::jsonb); end $$;
create or replace function rw2_savecompanysetting(a jsonb, u text) returns jsonb language plpgsql volatile set search_path = public as
$$ declare who text := coalesce(u, app_user(), '-'); rw int := coalesce(_bk_pf(a -> 1), 0)::int; ag text := coalesce(a ->> 2, ''); co text := coalesce(a ->> 3, ''); lg text := coalesce(a ->> 4, '');
  lic text := btrim(coalesce(a ->> 5, '')); rid_ text; old jsonb; begin
  perform _x_perm('settings_basic', 'هذه الإعدادات متاحة فقط لمستخدم بصلاحية «الإعدادات الأساسية» أو ALL');
  if co = '' then raise exception 'اسم الشركة مطلوب' using errcode = 'P0001'; end if;
  perform _x_lock('companies');
  if rw >= 2 then
    rid_ := _row_rid('companies', rw); select _x_pad(raw, 4) into old from store_rows where tbl = 'companies' and rid = rid_;
    if old is null then raise exception 'السجل غير موجود' using errcode = 'P0001'; end if;
    if jsonb_array_length(a) <= 5 or jsonb_typeof(a -> 5) = 'null' then lic := _rx_trim(_rx_s(old -> 3)); end if;
    update store_rows set raw = jsonb_set(jsonb_set(jsonb_set(jsonb_set(old, '{0}', to_jsonb(ag)), '{1}', to_jsonb(co)), '{2}', to_jsonb(lg)), '{3}', to_jsonb(lic)) where tbl = 'companies' and rid = rid_;
    perform _x_aud(who, 'تعديل شركة', co, 'بيانات الشركة', jsonb_build_object('agent', old -> 0, 'logoUrl', old -> 2, 'licence', old -> 3)::text, jsonb_build_object('agent', ag, 'logoUrl', lg, 'licence', lic)::text);
  else
    perform _x_append('companies', jsonb_build_array(ag, co, lg, lic));
    perform _x_aud(who, 'إضافة شركة جديدة', co, '-', '-', co || ' / ' || ag);
  end if;
  perform _x_bump('companies'); perform _w_dv_bump(array['dropdowns', 'visa', 'ministry']);
  return jsonb_build_object('success', true); end $$;
create or replace function rw2_deletecompanysetting(a jsonb, u text) returns jsonb language plpgsql volatile set search_path = public as
$$ declare who text := coalesce(u, app_user(), '-'); rw int := coalesce(_bk_pf(a -> 1), 0)::int; rid_ text; begin
  perform _x_perm('settings_basic', 'هذه الإعدادات متاحة فقط لمستخدم بصلاحية «الإعدادات الأساسية» أو ALL');
  if rw < 2 then raise exception 'بيانات غير مكتملة' using errcode = 'P0001'; end if;
  perform _x_lock('companies'); rid_ := _row_rid('companies', rw);
  perform _rb_on('company', 'إعدادات شركة/وكيل', '', who);
  delete from store_rows where tbl = 'companies' and rid = rid_; perform _x_bump('companies');
  perform _x_aud(who, 'حذف شركة', coalesce(nullif(a ->> 2, ''), '-'), '-', coalesce(nullif(a ->> 2, ''), '-'), '-');
  perform _w_dv_bump(array['dropdowns', 'visa', 'ministry']);
  return jsonb_build_object('success', true); end $$;

-- ===== روابط العميل (ClientLinks: الرمز · الرحلة · العميل · الإنشاء · أنشأه · نشط) =====
create or replace function _cl_perm() returns void language plpgsql stable as
$$ begin if not (app_has('admin') or app_has('trips.client_link')) then raise exception 'لا تملك صلاحية إنشاء/إلغاء روابط العميل' using errcode = '42501'; end if; end $$;
create or replace function _cl_base() returns text language sql stable set search_path = public as $$ select coalesce((select v from app_kv where k = 'WEBAPP_URL'), '') $$;
create or replace function _trip_clients(t text) returns jsonb language sql stable set search_path = public as
$$ select coalesce(jsonb_agg(c order by c collate "C"), '[]'::jsonb) from (select distinct _rx_trim(_rx_s(_rx_c(raw, _ix(_pm_ix(), 'client')))) c from _rx_rows('pilgrims')
     where _rx_trim(_rx_s(_rx_c(raw, _ix(_pm_ix(), 'tripName')))) = t) z where c <> '' $$;
create or replace function rw2_createtripclientlink(a jsonb, u text) returns jsonb language plpgsql volatile set search_path = public as
$$ declare who text := coalesce(u, app_user(), '-'); t text := _w_str(a -> 1); tok text := replace(gen_random_uuid()::text, '-', ''); b text := _cl_base(); begin
  perform _cl_perm();
  if t = '' then raise exception 'اسم الرحلة مطلوب' using errcode = 'P0001'; end if;
  perform _x_lock('client_links');
  perform _x_append('client_links', jsonb_build_array(tok, t, _w_str(a -> 2), to_char(now() at time zone 'Africa/Cairo', 'DD/MM/YYYY HH24:MI'), who, true)); perform _x_bump('client_links');
  return jsonb_build_object('success', true, 'token', tok, 'url', case when b <> '' then b || '?view=trip&t=' || tok else '' end); end $$;
create or replace function rw2_revoketripclientlink(a jsonb, u text) returns jsonb language plpgsql volatile set search_path = public as
$$ declare tok text := _w_str(a -> 1); begin
  perform _cl_perm();
  if tok = '' then raise exception 'رمز الرابط مطلوب' using errcode = 'P0001'; end if;
  perform _x_lock('client_links');
  update store_rows set raw = jsonb_set(_x_pad(raw, 6), '{5}', 'false') where tbl = 'client_links' and _rx_s(_rx_c(raw, 0)) = tok and rid = (select rid from store_rows where tbl = 'client_links' and _rx_s(_rx_c(raw, 0)) = tok order by ord limit 1);
  if not found then raise exception 'الرابط غير موجود' using errcode = 'P0001'; end if;
  perform _x_bump('client_links');
  return jsonb_build_object('success', true, 'message', '✅ أُلغي الرابط'); end $$;
create or replace function rx2_gettripclientlinksinfo(a jsonb, u text) returns jsonb language plpgsql stable set search_path = public as
$$ declare t text := _w_str(a -> 1); b text := _cl_base(); begin
  if app_user() is null then raise exception 'غير مصرّح' using errcode = '42501'; end if;
  if t = '' then raise exception 'اسم الرحلة مطلوب' using errcode = 'P0001'; end if;
  return jsonb_build_object('clients', _trip_clients(t), 'links', coalesce((select jsonb_agg(jsonb_build_object('token', _rx_s(_rx_c(raw, 0)), 'client', _rx_s(_rx_c(raw, 2)), 'createdAt', _rx_s(_rx_c(raw, 3)),
      'createdBy', _rx_s(_rx_c(raw, 4)), 'active', _rx_c(raw, 5) = 'true'::jsonb or lower(_rx_s(_rx_c(raw, 5))) = 'true', 'url', case when b <> '' then b || '?view=trip&t=' || _rx_s(_rx_c(raw, 0)) else '' end, 'row', rn) order by rn desc)
    from _rx_rows('client_links') where _rx_trim(_rx_s(_rx_c(raw, 1))) = t), '[]'::jsonb)); end $$;

-- ===== قراءات الرحلة =====
create or replace function rx2_gettripbyname(a jsonb, u text) returns jsonb language plpgsql stable set search_path = public as
$$ declare t text := _w_str(a -> 1); r jsonb; begin
  if app_user() is null then raise exception 'غير مصرّح' using errcode = '42501'; end if;
  if t = '' then return 'null'::jsonb; end if;
  select x into r from jsonb_array_elements(rx_trips_list_raw(_mf_today_date())) x where x ->> 'name' = t limit 1;
  if r is null then return 'null'::jsonb; end if;
  return r || jsonb_build_object('totalCount', coalesce((r ->> 'pilgrimCount')::int, 0) + case when _gs_truthy(r -> 'supervisor') then 1 else 0 end); end $$;
create or replace function rx2_gettripaccommodationlevels(a jsonb, u text) returns jsonb language plpgsql stable set search_path = public as
$$ declare t text := _w_str(a -> 1); m jsonb := _rx_map('pilgrims', _rx_h_pil()); lv jsonb; pr jsonb; begin
  perform _x_perm('ministry.view', 'لا تملك صلاحية عرض ملفات الوزارة');
  if t = '' then return jsonb_build_object('success', true, 'levels', '[]'::jsonb); end if;
  with p as (select rn, _rx_trim(_rx_s(_rx_c(raw, _ix(m, 'فندق مكة')))) mh, _rx_trim(_rx_s(_rx_c(raw, _ix(m, 'فندق المدينة')))) dh,
                    case when _rx_trim(_rx_s(_rx_c(raw, _ix(m, 'طبيعة التسكين')))) in ('', 'رباعي', 'خماسي', 'سداسي', 'رباعي أسرة', 'خماسي أسرة') then 'عادي' else _rx_trim(_rx_s(_rx_c(raw, _ix(m, 'طبيعة التسكين')))) end ac
               from _rx_rows('pilgrims') where _rx_trim(_rx_s(_rx_c(raw, _ix(m, 'اسم الرحلة')))) = t and _rx_trim(_rx_s(_rx_c(raw, _ix(m, 'اسم المعتمر')))) <> ''
                and _rx_trim(_rx_s(_rx_c(raw, _ix(m, 'النوع')))) <> 'رضيع'),
       g as (select coalesce(nullif(mh, ''), dh) h, ac, count(*) n, min(rn) f, (array_agg(dh order by rn))[1] dh, (array_agg(mh order by rn))[1] mh from p group by 1, 2)
  select jsonb_agg(jsonb_build_object('h', h, 'ac', ac, 'n', n, 'dh', dh, 'mh', mh) order by f) into lv from g;
  if lv is null or jsonb_array_length(lv) < 2 then return jsonb_build_object('success', true, 'levels', '[]'::jsonb); end if;
  pr := rx_trip_pricing_raw(t);
  return jsonb_build_object('success', true, 'levels', (select jsonb_agg(jsonb_build_object('key', (x ->> 'h') || '|' || (x ->> 'ac'), 'label', case when x ->> 'h' <> '' then (x ->> 'h') || ' ' else '' end || (x ->> 'ac'),
    'count', x -> 'n', 'madinahHotel', x -> 'dh', 'makkahHotel', x -> 'mh', 'price', coalesce(_ac_num(pr -> 'hotels' -> (x ->> 'h') -> (x ->> 'ac')), 0)) order by o) from jsonb_array_elements(lv) with ordinality q(x, o))); end $$;
create or replace function rw2_applytrippricing(a jsonb, u text) returns jsonb language plpgsql volatile set search_path = public as
$$ declare who text := coalesce(u, app_user(), '-'); t text := _w_str(a -> 1); p jsonb := coalesce(a -> 2, '{}'::jsonb); prev jsonb; cl jsonb; hs jsonb := '{}'::jsonb; h text; row_ jsonb; k text; v float8; rid_ text; sy jsonb := null;
  nowj jsonb := jsonb_build_object('$d', (extract(epoch from clock_timestamp()) * 1000)::bigint); begin
  perform _x_perm('pricing.edit', 'لا تملك صلاحية تعديل تسعير الرحلات');
  if t = '' then raise exception 'اسم الرحلة مطلوب' using errcode = 'P0001'; end if;
  prev := coalesce(nullif(rx_trip_pricing_raw(t), 'null'::jsonb), '{}'::jsonb);
  for h in select jsonb_object_keys(case when jsonb_typeof(p -> 'hotels') = 'object' then p -> 'hotels' else '{}'::jsonb end) loop
    row_ := '{}'::jsonb;
    foreach k in array array['سنجل', 'دابل', 'ثلاثي', 'عادي'] loop v := coalesce(_ac_num(p -> 'hotels' -> h -> k), 0); if v <> 0 then row_ := row_ || jsonb_build_object(k, v); end if; end loop;
    if row_ <> '{}'::jsonb then hs := hs || jsonb_build_object(btrim(h), row_); end if;
  end loop;
  cl := jsonb_build_object('hotels', hs, 'child', coalesce(_ac_num(p -> 'child'), 0), 'infant', coalesce(_ac_num(p -> 'infant'), 0), 'applied', coalesce((prev ->> 'applied')::boolean, false) or coalesce((a ->> 3)::boolean, false));
  if hs = '{}'::jsonb and (cl ->> 'child')::float8 = 0 and (cl ->> 'infant')::float8 = 0 then return jsonb_build_object('success', false, 'error', 'أدخل سعراً واحداً على الأقل قبل الحفظ'); end if;
  perform _x_lock('acc_trip_prices');
  select rid into rid_ from store_rows where tbl = 'acc_trip_prices' and _rx_trim(_rx_s(_rx_c(raw, 0))) = t order by ord limit 1;
  if rid_ is not null then update store_rows set raw = jsonb_set(jsonb_set(jsonb_set(_x_pad(raw, 4), '{1}', to_jsonb(cl::text)), '{2}', to_jsonb(who)), '{3}', nowj) where tbl = 'acc_trip_prices' and rid = rid_;
  else perform _x_append('acc_trip_prices', jsonb_build_array(t, cl::text, who, nowj)); end if;
  perform _x_bump('acc_trip_prices');
  perform _x_aud(who, 'حفظ تسعير رحلة', t, 'ClientAccounts_TripPrices', '-', (select count(*) from jsonb_object_keys(hs)) || ' مستوى، طفل ' || _mf_n2t((cl ->> 'child')::float8) || '، رضيع ' || _mf_n2t((cl ->> 'infant')::float8)
    || case when (cl ->> 'applied')::boolean then ' — مفعّل' else '' end);
  if (cl ->> 'applied')::boolean then sy := _acc_sync(t, who); end if;
  perform _w_dv_bump(_acc_dvs());
  return jsonb_build_object('success', true, 'applied', (cl ->> 'applied')::boolean, 'sync', sy); end $$;

-- ===== الإشعار ↔ الرحلة =====
create or replace function _bk_of_trip(t text) returns table (brid text, braw jsonb) language sql stable set search_path = public as
$$ with tm as (select _rx_map('trips', _rx_h_trips()) m), bm as (select _rx_map('bookings', _bk_canon()) m),
        lk as (select _rx_trim(_rx_s(_rx_c(raw, _ix((select m from tm), 'رقم الإشعار المرتبط')))) l from store_rows where tbl = 'trips' and _rx_trim(_rx_s(_rx_c(raw, _ix((select m from tm), 'اسم الرحلة')))) = t order by ord limit 1)
   select rid, raw from store_rows, bm where tbl = 'bookings' and (
     (coalesce((select l from lk), '') <> '' and btrim(_rx_s(_rx_c(raw, _ix(bm.m, 'رقم الإشعار')))) = (select l from lk))
     or (not (coalesce((select l from lk), '') <> '' and btrim(_rx_s(_rx_c(raw, _ix(bm.m, 'رقم الإشعار')))) = (select l from lk)) and btrim(_rx_s(_rx_c(raw, _ix(bm.m, 'اسم الرحلة')))) = t))
   order by ord limit 1 $$;
create or replace function rx2_gettripbookingcompare(a jsonb, u text) returns jsonb language plpgsql stable set search_path = public as
$$ declare t text := _w_str(a -> 1); tm jsonb := _rx_map('trips', _rx_h_trips()); bm jsonb := _rx_map('bookings', _bk_canon()); tr jsonb; br jsonb; f text[][] := array[
    ['arrivalPort','منفذ الوصول','منفذ الوصول','s'],['arrivalDate','تاريخ الذهاب','تاريخ الوصول','d'],['arrivalTime','ساعة الوصول','ساعة الوصول','s'],['arrivalFlight','رقم رحلة الوصول','رقم رحلة الوصول','s'],
    ['departurePort','منفذ المغادرة','منفذ المغادرة','s'],['departureDate','تاريخ العودة','تاريخ المغادرة','d'],['departureTime','ساعة المغادرة','ساعة المغادرة','s'],['departureFlight','رقم رحلة المغادرة','رقم رحلة المغادرة','s'],
    ['madinahHotel','سكن المدينة','سكن المدينة','s'],['madinahCheckIn','تاريخ دخول المدينة','دخول المدينة','d'],['madinahCheckOut','تاريخ الخروج من المدينة','خروج المدينة','d'],['madinahNights','ليالي المدينة','عدد ليالي المدينة','s'],
    ['makkahHotel','سكن مكة','سكن مكة','s'],['makkahCheckIn','تاريخ دخول مكة','دخول مكة','d'],['makkahCheckOut','تاريخ الخروج من مكة','خروج مكة','d'],['makkahNights','ليالي مكة','عدد ليالي مكة','s']];
  i int; ot jsonb := '{}'::jsonb; ob jsonb := '{}'::jsonb; begin
  if app_user() is null then raise exception 'غير مصرّح' using errcode = '42501'; end if;
  if t = '' then return jsonb_build_object('success', false, 'error', 'اسم الرحلة مطلوب'); end if;
  if not exists (select 1 from store_rows where tbl = 'trips') then return jsonb_build_object('success', false, 'error', 'لا توجد رحلات'); end if;
  select raw into tr from store_rows where tbl = 'trips' and _rx_trim(_rx_s(_rx_c(raw, _ix(tm, 'اسم الرحلة')))) = t order by ord limit 1;
  if tr is null then return jsonb_build_object('success', false, 'error', 'الرحلة غير موجودة'); end if;
  select braw into br from _bk_of_trip(t);
  if br is null then return jsonb_build_object('success', false, 'error', 'لا يوجد إشعار مرتبط بهذه الرحلة بعد'); end if;
  for i in 1 .. array_length(f, 1) loop
    ot := ot || jsonb_build_object(f[i][1], case when f[i][4] = 'd' then coalesce(_bk_date(_rx_c(tr, _ix(tm, f[i][2]))), '') else _rx_s(_rx_c(tr, _ix(tm, f[i][2]))) end);
    ob := ob || jsonb_build_object(f[i][1], case when f[i][4] = 'd' then coalesce(_bk_date(_rx_c(br, _ix(bm, f[i][3]))), '') else _rx_s(_rx_c(br, _ix(bm, f[i][3]))) end);
  end loop;
  return jsonb_build_object('success', true, 'trip', ot, 'booking', ob, 'bookingId', _rx_s(_rx_c(br, _ix(bm, 'رقم الإشعار')))); end $$;
create or replace function rw2_adoptbookinggrouptotrip(a jsonb, u text) returns jsonb language plpgsql volatile set search_path = public as
$$ declare who text := coalesce(u, app_user(), '-'); t text := _w_str(a -> 1); g text := _w_str(a -> 2); c jsonb; b jsonb; tm jsonb := _rx_map('trips', _rx_h_trips()); rid_ text; r jsonb; mp text[][]; i int; begin
  perform _x_perm('trips.edit', 'لا تملك صلاحية تعديل الرحلات');
  c := rx2_gettripbookingcompare(jsonb_build_array(null, t), u);
  if not (c ->> 'success')::boolean then return c; end if;
  b := c -> 'booking';
  mp := case g when 'arrival' then array[['arrivalPort','منفذ الوصول'],['arrivalDate','تاريخ الذهاب'],['arrivalTime','ساعة الوصول'],['arrivalFlight','رقم رحلة الوصول']]
              when 'departure' then array[['departurePort','منفذ المغادرة'],['departureDate','تاريخ العودة'],['departureTime','ساعة المغادرة'],['departureFlight','رقم رحلة المغادرة']]
              when 'madinah' then array[['madinahHotel','سكن المدينة'],['madinahCheckIn','تاريخ دخول المدينة'],['madinahCheckOut','تاريخ الخروج من المدينة'],['madinahNights','ليالي المدينة']]
              when 'makkah' then array[['makkahHotel','سكن مكة'],['makkahCheckIn','تاريخ دخول مكة'],['makkahCheckOut','تاريخ الخروج من مكة'],['makkahNights','ليالي مكة']] end;
  if mp is null then return jsonb_build_object('success', false, 'error', 'مجموعة غير معروفة'); end if;
  perform _x_lock('trips');
  select rid, raw into rid_, r from store_rows where tbl = 'trips' and _rx_trim(_rx_s(_rx_c(raw, _ix(tm, 'اسم الرحلة')))) = t order by ord limit 1;
  for i in 1 .. array_length(mp, 1) loop if coalesce(b ->> mp[i][1], '') <> '' then r := _stp_set(r, tm, mp[i][2], to_jsonb(b ->> mp[i][1])); end if; end loop;
  update store_rows set raw = r where tbl = 'trips' and rid = rid_; perform _x_bump('trips');
  perform _w_dv_bump(array['trips', 'pilgrims', 'bookings', 'movements', 'visa', 'ministry', 'dropdowns']);
  perform _x_aud(who, 'اعتماد بيانات إشعار على رحلة', t, g, '-', 'من الإشعار #' || (c ->> 'bookingId'));
  return jsonb_build_object('success', true); end $$;
create or replace function rw2_synctripbookingbyname(a jsonb, u text) returns jsonb language plpgsql volatile set search_path = public as
$$ begin
  if app_user() is null then raise exception 'غير مصرّح' using errcode = '42501'; end if;
  if _st_propagate(_w_str(a -> 1)) then perform _w_dv_bump(array['bookings', 'movements', 'trips']); return jsonb_build_object('success', true, 'synced', true); end if;
  return jsonb_build_object('success', false, 'synced', false, 'error', 'لا يوجد إشعار مرتبط بهذه الرحلة بعد — أنشئ الإشعار من زر ✈️ إشعار وصول أولاً'); end $$;
-- = _propagateBookingChangesToTrip_
create or replace function _bk_to_trip(d jsonb) returns boolean language plpgsql volatile set search_path = public as
$$ declare t text := btrim(coalesce(d ->> 'tripName', '')); tm jsonb := _rx_map('trips', _rx_h_trips()); rid_ text; r jsonb; sl jsonb; begin
  if t = '' then return false; end if;
  perform _x_lock('trips');
  select rid, raw into rid_, r from store_rows where tbl = 'trips' and _rx_trim(_rx_s(_rx_c(raw, _ix(tm, 'اسم الرحلة')))) = t order by ord limit 1;
  if rid_ is null then return false; end if;
  if _gs_truthy(d -> 'company') then r := _stp_set(r, tm, 'الشركة المصرية', d -> 'company'); end if;
  if _gs_truthy(d -> 'agent') then r := _stp_set(r, tm, 'الوكيل السعودي', d -> 'agent'); end if;
  sl := _st_suplist(d);
  if jsonb_array_length(sl) > 0 then
    r := _stp_set(r, tm, 'المشرفون (JSON)', to_jsonb(_st_supjson(sl))); r := _stp_set(r, tm, 'المشرف', to_jsonb(sl -> 0 ->> 'name')); r := _stp_set(r, tm, 'دور المشرف', to_jsonb(sl -> 0 ->> 'role'));
  elsif _gs_truthy(d -> 'supervisor') then r := _stp_set(r, tm, 'المشرف', d -> 'supervisor'); end if;
  r := _stp_set(r, tm, 'منفذ الوصول', _td_s(d -> 'arrivalPort')); r := _stp_set(r, tm, 'منفذ المغادرة', _td_s(d -> 'departurePort'));
  r := _stp_set(r, tm, 'ساعة الوصول', _td_s(d -> 'arrivalTime')); r := _stp_set(r, tm, 'ساعة المغادرة', _td_s(d -> 'departureTime'));
  r := _stp_set(r, tm, 'رقم رحلة الوصول', _td_s(d -> 'arrivalFlight')); r := _stp_set(r, tm, 'رقم رحلة المغادرة', _td_s(d -> 'departureFlight'));
  if _gs_truthy(d -> 'arrivalDate') then r := _stp_set(r, tm, 'تاريخ الذهاب', d -> 'arrivalDate'); end if;
  if _gs_truthy(d -> 'departureDate') then r := _stp_set(r, tm, 'تاريخ العودة', d -> 'departureDate'); end if;
  if _gs_truthy(d -> 'direction') then r := _stp_set(r, tm, 'اتجاه الإقامة', d -> 'direction'); end if;
  update store_rows set raw = r where tbl = 'trips' and rid = rid_; perform _x_bump('trips');
  return true; end $$;
create or replace function rw2_bookingaftersavebg(a jsonb, u text) returns jsonb language plpgsql volatile set search_path = public as
$$ declare id_ text := coalesce(a ->> 1, ''); d jsonb := case when jsonb_typeof(a -> 2) = 'object' then a -> 2 else '{}'::jsonb end; tc text := _w_str(d -> 'transportCompany'); sp text; cnt float8; pr float8; src text; info jsonb;
  o jsonb := jsonb_build_object('success', true, 'id', a -> 1); begin
  if app_user() is null then raise exception 'غير مصرّح' using errcode = '42501'; end if;
  begin perform _bk_to_trip(d); exception when others then null; end;
  if tc <> '' and tc <> 'النقل بمعرفة العميل' then
    sp := case when tc = 'الوكيل' then _w_str(d -> 'agent') else tc end;
    cnt := coalesce(_bk_pf(case when _gs_truthy(d -> 'busCount') then d -> 'busCount' else d -> 'buses' end), 0); pr := coalesce(_bk_pf(d -> 'busPrice'), 0);
    src := case when pr <> 0 then 'manual' else 'none' end;
    if pr = 0 and sp <> '' then pr := coalesce(_vz_price_at(sp, d ->> 'arrivalDate', _vz_prices('vz_transport_prices')), 0); if pr <> 0 then src := 'default'; end if; end if;
    info := jsonb_build_object('id', id_, 'agent', sp, 'busCount', cnt, 'busPrice', pr, 'value', cnt * pr, 'priceSource', src, 'warning',
      case when pr = 0 and cnt > 0 then case when sp <> '' then '⚠️ دورة النقل بالإشعار #' || id_ || ' أُدرجت بكشف حساب «' || sp || '» بلا سعر — لا فترة تسعير نقل ساريّة بتاريخ الوصول؛ سجّل أسعار النقل للوكيل'
                                             else '⚠️ دورة النقل بالإشعار #' || id_ || ' بلا مورد/وكيل محدد — لن تظهر بكشف أي وكيل' end else '' end);
    o := o || jsonb_build_object('transport', info); if info ->> 'warning' <> '' then o := o || jsonb_build_object('transportWarning', info ->> 'warning'); end if;
  end if;
  perform _w_dv_bump(array['bookings', 'movements', 'trips', 'visa', 'ministry']);
  return o; end $$;
create or replace function rw2_bookingcachebustbg(a jsonb, u text) returns jsonb language plpgsql volatile as
$$ begin if app_user() is null then raise exception 'غير مصرّح' using errcode = '42501'; end if; perform _w_dv_bump(array['bookings', 'movements', 'trips', 'visa', 'ministry']); return jsonb_build_object('success', true); end $$;
create or replace function rw2_cachebustbg(a jsonb, u text) returns jsonb language plpgsql volatile as
$$ declare s text := coalesce(a ->> 1, ''); begin
  if app_user() is null then raise exception 'غير مصرّح' using errcode = '42501'; end if;
  if s = 'pilgrims' then perform _w_dv_bump(array['pilgrims', 'trips']);
  elsif s = 'booking' then perform _w_dv_bump(array['bookings', 'movements', 'trips', 'visa', 'ministry']);
  elsif s = 'trips' then perform _w_dv_bump(array['bookings', 'movements', 'trips', 'pilgrims', 'visa', 'ministry', 'dropdowns']); end if;
  return jsonb_build_object('success', true); end $$;
create or replace function rx2_checkbuspricecolumnsexist(a jsonb, u text) returns jsonb language plpgsql stable set search_path = public as
$$ declare h jsonb := _rx_hdr('bookings'); begin
  if app_user() is null then raise exception 'غير مصرّح' using errcode = '42501'; end if;
  return jsonb_build_object('exists', _rx_idx(h, 'سعر الباص') is not null and _rx_idx(h, 'قيمة التشغيلة') is not null and _rx_idx(h, 'اسم الرحلة') is not null); end $$;
-- = kashfAfterSaveBg: مزامنة حسابات الرحلة بمحرك 040 (نمط «بنود» ⇒ accsync) ثم تعليم البند منجزاً
create or replace function rw2_kashfaftersavebg(a jsonb, u text) returns jsonb language plpgsql volatile set search_path = public as
$$ declare j record; s jsonb; begin
  if app_user() is null then raise exception 'غير مصرّح' using errcode = '42501'; end if;
  select id, payload into j from app_outbox where id::text = coalesce(a ->> 1, '') and kind = 'kashfsave' and done_at is null for update skip locked;
  if j.id is null then return jsonb_build_object('success', true, 'already', true); end if;
  s := _acc_sync(j.payload ->> 'trip', coalesce(u, app_user(), j.payload ->> 'user', '-'));
  update app_outbox set done_at = now() where id = j.id;
  perform _w_dv_bump(_acc_dvs());
  return jsonb_build_object('success', true, 'accSync', s); end $$;

-- ===== اقتراحات الربط · أسماء معتمري الإشعار · إشعارات بلا رحلة =====
create or replace function rx2_getbookinglinksuggestions(a jsonb, u text) returns jsonb language plpgsql stable set search_path = public as
$$ declare t text := _mf_str(a -> 1); known jsonb; gs jsonb := '[]'::jsonb; ms jsonb := '[]'::jsonb; begin
  if app_user() is null then raise exception 'غير مصرّح' using errcode = '42501'; end if;
  if t = '' then return jsonb_build_object('success', true, 'groups', gs, 'mfFiles', ms); end if;
  if app_has('visas.view') or app_has('trips.view') or app_has('registry.view') then
    known := _mf_trip_names();
    select coalesce(jsonb_agg(jsonb_build_object('ref', _mf_str(f -> 'ref'), 'seq', coalesce(_mf_num(f -> 'seq'), 0), 'id', _mf_str(f -> 'id'),
        'clients', (select coalesce(jsonb_agg(_mf_str(b -> 'name')), '[]'::jsonb) from jsonb_array_elements(case when jsonb_typeof(f -> 'breakdown') = 'array' then f -> 'breakdown' else '[]'::jsonb end) b),
        'count', coalesce(_mf_num(f -> 'visaCount'), 0)) order by rn), '[]'::jsonb) into gs
      from _vz_files() q(rn, f) where t = any (_mf_trips_of(f ->> 'tripName', f ->> 'extraTrips', known));
  end if;
  if app_has('ministry.view') or app_has('trips.view') then
    select coalesce(jsonb_agg(jsonb_build_object('fileNo', _mf_str(f -> 'fileNo'), 'clientLabel', _mf_str(f -> 'clientLabel'))), '[]'::jsonb) into ms
      from jsonb_array_elements(coalesce(_mf_core() -> 'files', '[]'::jsonb)) f where _mf_str(f -> 'tripName') = t;
  end if;
  return jsonb_build_object('success', true, 'groups', gs, 'mfFiles', ms); end $$;
create or replace function rx2_getbookingpilgrimnames(a jsonb, u text) returns jsonb language plpgsql stable set search_path = public as
$$ declare refs text[]; known jsonb := _mf_trip_names(); m jsonb := _rx_map('pilgrims', _rx_h_pil()); g record; rows_ jsonb := '[]'::jsonb; sel jsonb; cls jsonb; trs text[]; seq int := 0; p record; begin
  if app_user() is null then raise exception 'غير مصرّح' using errcode = '42501'; end if;
  refs := array(select _mf_str(x) from jsonb_array_elements(case when jsonb_typeof(a -> 1) = 'array' then a -> 1 else (select coalesce(jsonb_agg(s), '[]'::jsonb) from unnest(string_to_array(coalesce(a ->> 1, ''), ' - ')) s) end) x where _mf_str(x) <> '');
  if coalesce(array_length(refs, 1), 0) = 0 then return jsonb_build_object('success', true, 'rows', rows_); end if;
  for g in select q.f from _vz_files() q where _mf_str(q.f -> 'ref') = any (refs) order by q.rn loop
    select coalesce(jsonb_object_agg(k, 1), '{}'::jsonb) into sel from (select _mf_str(to_jsonb(regexp_replace(coalesce(s #>> '{}', ''), '^P:', ''))) k from jsonb_array_elements(case when jsonb_typeof(g.f -> 'selected') = 'array' then g.f -> 'selected' else '[]'::jsonb end) s) z where k <> '';
    select coalesce(jsonb_object_agg(k, 1), '{}'::jsonb) into cls from (select _mf_str(b -> 'name') k from jsonb_array_elements(case when jsonb_typeof(g.f -> 'breakdown') = 'array' then g.f -> 'breakdown' else '[]'::jsonb end) b where jsonb_typeof(b) = 'object') z where k <> '';
    trs := _mf_trips_of(g.f ->> 'tripName', g.f ->> 'extraTrips', known);
    for p in select _rx_trim(_rx_s(_rx_c(raw, _ix(m, 'اسم المعتمر')))) nm, _mf_str(_rx_c(raw, _ix(m, 'رقم الجواز'))) pp, _rx_trim(_rx_s(_rx_c(raw, _ix(m, 'اسم الرحلة')))) tr, _rx_trim(_rx_s(_rx_c(raw, _ix(m, 'العميل')))) cl
               from _rx_rows('pilgrims') order by rn loop
      if p.nm = '' and p.pp = '' then continue; end if;
      if (sel <> '{}'::jsonb and p.pp <> '' and sel ? p.pp) or (sel = '{}'::jsonb and p.tr = any (trs) and cls ? p.cl) then
        seq := seq + 1; rows_ := rows_ || jsonb_build_array(jsonb_build_object('seq', seq, 'group', _mf_str(g.f -> 'ref'), 'name', p.nm, 'passport', p.pp)); end if;
    end loop;
  end loop;
  return jsonb_build_object('success', true, 'rows', rows_); end $$;
create or replace function rx2_getrule70bookings(a jsonb, u text) returns jsonb language plpgsql stable set search_path = public as
$$ declare bm jsonb := _rx_map('bookings', _bk_canon()); tm jsonb := _rx_map('trips', _rx_h_trips()); begin
  if app_user() is null then raise exception 'غير مصرّح' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', id_, 'company', _rx_trim(_rx_s(_rx_c(raw, _ix(bm, 'الشركة المصرية')))), 'client', _rx_trim(_rx_s(_rx_c(raw, _ix(bm, 'العميل')))),
      'count', coalesce(_bk_pf(_rx_c(raw, _ix(bm, 'العدد'))), 0), 'arrivalDate', coalesce(_bk_date(_rx_c(raw, _ix(bm, 'تاريخ الوصول'))), ''), 'departureDate', coalesce(_bk_date(_rx_c(raw, _ix(bm, 'تاريخ المغادرة'))), '')) order by rn)
    from (select rn, raw, _rx_trim(_rx_s(_rx_c(raw, _ix(bm, 'رقم الإشعار')))) id_ from _rx_rows('bookings')) b
   where id_ <> '' and _rx_trim(_rx_s(_rx_c(raw, _ix(bm, 'اسم الرحلة')))) = ''
     and not exists (select 1 from _rx_rows('trips') t where _rx_trim(_rx_s(_rx_c(t.raw, _ix(tm, 'رقم الإشعار المرتبط')))) = b.id_)), '[]'::jsonb); end $$;

-- ===== المعتمر بالسجل العام =====
create or replace function rw2_saveglobalpilgrim(a jsonb, u text) returns jsonb language plpgsql volatile set search_path = public as
$$ declare who text := coalesce(u, app_user(), '-'); p jsonb := case when jsonb_typeof(a -> 1) = 'object' then a -> 1 else '{}'::jsonb end; nm text := _w_str(p -> 'name'); pp text := _w_str(p -> 'passport');
  m jsonb := _rx_map('pilgrims', _rx_h_pil()); w int := greatest(jsonb_array_length(_rx_hdr('pilgrims')), (select max(v::int) + 1 from jsonb_each_text(_rx_map('pilgrims', _rx_h_pil())) e(k, v)));
  ks text[][] := array[['name','اسم المعتمر'],['passport','رقم الجواز'],['type','النوع'],['client','العميل'],['notes','ملاحظات'],['latinName','الاسم بالإنجليزية'],['birthDate','تاريخ الميلاد'],['issueDate','تاريخ إصدار الجواز'],['expiryDate','تاريخ انتهاء الجواز']];
  i int; n int := 0; r jsonb; x record; v text; begin
  if app_user() is null then raise exception 'غير مصرّح' using errcode = '42501'; end if;
  if nm = '' then raise exception 'اسم المعتمر مطلوب' using errcode = 'P0001'; end if;
  perform _x_lock('pilgrims');
  for x in select rid, raw from store_rows where tbl = 'pilgrims' and ((pp <> '' and _rx_trim(_rx_s(_rx_c(raw, _ix(m, 'رقم الجواز')))) = pp)
             or (pp = '' and _rx_trim(_rx_s(_rx_c(raw, _ix(m, 'رقم الجواز')))) = '' and _rx_trim(_rx_s(_rx_c(raw, _ix(m, 'اسم المعتمر')))) = nm)) loop
    r := x.raw;
    for i in 1 .. array_length(ks, 1) loop v := case when ks[i][1] in ('name', 'passport') then case ks[i][1] when 'name' then nm else pp end else coalesce(p ->> ks[i][1], '') end;
      if v <> '' then r := _stp_set(r, m, ks[i][2], to_jsonb(v)); end if; end loop;
    update store_rows set raw = r where tbl = 'pilgrims' and rid = x.rid; n := n + 1;
  end loop;
  if n > 0 then
    perform _x_bump('pilgrims'); perform _w_dv_bump(array['pilgrims', 'trips']);
    perform _x_aud(who, 'تحديث معتمر (السجل العام)', nm, 'معتمر', '-', 'عدد الصفوف: ' || n);
    return jsonb_build_object('success', true, 'existed', true, 'updatedRows', n);
  end if;
  select jsonb_agg('""'::jsonb) into r from generate_series(1, w);
  for i in 1 .. array_length(ks, 1) loop r := _stp_set(r, m, ks[i][2], to_jsonb(case ks[i][1] when 'name' then nm when 'passport' then pp else coalesce(p ->> ks[i][1], '') end)); end loop;
  r := _stp_set(r, m, 'معرف المعتمر', to_jsonb(_x_id('P')));
  perform _x_append('pilgrims', r); perform _x_bump('pilgrims'); perform _w_dv_bump(array['pilgrims', 'trips']);
  perform _x_aud(who, 'تسجيل معتمر بالسجل العام', nm, 'معتمر', '-', 'بدون رحلة');
  return jsonb_build_object('success', true, 'existed', false); end $$;

-- ===== مسودة الرحلة (= saveTripDraft؛ التحقق من منطق التحركات يجريه المتصفح بنفس كود الخادم قبل النداء) =====
create or replace function rw2_savetripdraft(a jsonb, u text) returns jsonb language plpgsql volatile set search_path = public as
$$ declare who text := coalesce(u, app_user(), '-'); d jsonb := case when jsonb_typeof(a -> 1) = 'object' then a -> 1 else '{}'::jsonb end; nm text := _w_str(d -> 'tripName'); org text := _w_str(d -> 'originalTripName');
  tm jsonb := _rx_map('trips', _rx_h_trips()); w int := greatest(jsonb_array_length(_rx_hdr('trips')), (select max(v::int) + 1 from jsonb_each_text(_rx_map('trips', _rx_h_trips())) e(k, v)));
  rid_ text; ex jsonb; r jsonb; sl jsonb; ph text; i int; ref_ text; ren boolean := false;
  dr text[][] := array[['company','الشركة المصرية'],['agent','الوكيل السعودي'],['supervisor','المشرف'],['arrivalDate','تاريخ الذهاب'],['departureDate','تاريخ العودة'],['madinahHotel','سكن المدينة'],
    ['madinahCheckIn','تاريخ دخول المدينة'],['madinahCheckOut','تاريخ الخروج من المدينة'],['madinahNights','ليالي المدينة'],['makkahHotel','سكن مكة'],['makkahCheckIn','تاريخ دخول مكة'],['makkahCheckOut','تاريخ الخروج من مكة'],
    ['makkahNights','ليالي مكة'],['direction','اتجاه الإقامة']];
  keep text[][] := array[['airline','الخطوط'],['ticketUrl','رابط تذكرة الرحلة'],['ticketFileId','معرف تذكرة الرحلة'],['arrivalPort','منفذ الوصول'],['departurePort','منفذ المغادرة'],['arrivalTime','ساعة الوصول'],
    ['departureTime','ساعة المغادرة'],['arrivalFlight','رقم رحلة الوصول'],['departureFlight','رقم رحلة المغادرة']];
  ex_ jsonb; begin
  if app_user() is null then raise exception 'غير مصرّح' using errcode = '42501'; end if;
  if nm = '' then raise exception 'اسم الرحلة مطلوب' using errcode = 'P0001'; end if;
  perform _x_lock('trips');
  select rid, raw into rid_, ex from store_rows where tbl = 'trips' and _rx_trim(_rx_s(_rx_c(raw, _ix(tm, 'اسم الرحلة')))) = nm order by ord limit 1;
  if rid_ is null and org <> '' and org <> nm then
    select rid, raw into rid_, ex from store_rows where tbl = 'trips' and _rx_trim(_rx_s(_rx_c(raw, _ix(tm, 'اسم الرحلة')))) = org order by ord limit 1;
    ren := rid_ is not null;
  end if;
  if rid_ is not null and not app_has('trips.edit') then raise exception 'لا تملك صلاحية تعديل بيانات الرحلات — تواصل مع مدير النظام إن كنت تحتاج هذه الصلاحية' using errcode = '42501'; end if;
  if rid_ is null and not app_has('trips.add') then raise exception 'لا تملك صلاحية إضافة رحلات جديدة — تواصل مع مدير النظام إن كنت تحتاج هذه الصلاحية' using errcode = '42501'; end if;
  if ren then perform _x_lock('pilgrims'); perform _trip_ren(org, nm); end if;
  if rid_ is not null then r := _x_pad(ex, w); else select jsonb_agg('""'::jsonb) into r from generate_series(1, w); end if;
  ex_ := coalesce(ex, '[]'::jsonb);
  r := _stp_set(r, tm, 'اسم الرحلة', to_jsonb(nm));
  for i in 1 .. array_length(dr, 1) loop r := _stp_set(r, tm, dr[i][2], _td_s(d -> dr[i][1])); end loop;
  for i in 1 .. array_length(keep, 1) loop r := _stp_set(r, tm, keep[i][2], case when _gs_truthy(d -> keep[i][1]) then _td_s(d -> keep[i][1]) else _td_s(_rx_c(ex_, _ix(tm, keep[i][2]))) end); end loop;
  r := _stp_set(r, tm, 'رقم الإشعار المرتبط', _td_s(_rx_c(ex_, _ix(tm, 'رقم الإشعار المرتبط'))));
  r := _stp_set(r, tm, 'تاريخ الإنشاء', case when _gs_truthy(_rx_c(ex_, _ix(tm, 'تاريخ الإنشاء'))) then _rx_c(ex_, _ix(tm, 'تاريخ الإنشاء')) else jsonb_build_object('$d', (extract(epoch from clock_timestamp()) * 1000)::bigint) end);
  r := _stp_set(r, tm, 'عدد الأماكن المحجوزة', case when _gs_truthy(d -> 'count') then _td_s(d -> 'count') else _td_s(_rx_c(ex_, _ix(tm, 'عدد الأماكن المحجوزة'))) end);
  r := _stp_set(r, tm, 'مسودة الإشعار (JSON)', to_jsonb(d::text));
  r := _stp_set(r, tm, 'دور المشرف', to_jsonb(coalesce(nullif(_w_str(d -> 'supervisorRole'), ''), nullif(_rx_s(_rx_c(ex_, _ix(tm, 'دور المشرف'))), ''), 'مرافق')));
  ref_ := _rx_s(_rx_c(ex_, _ix(tm, 'الرقم المرجعي')));
  if ref_ = '' then select 'TRP-' || lpad((coalesce(max((regexp_match(_rx_s(_rx_c(raw, _ix(tm, 'الرقم المرجعي'))), '^TRP-(\d+)$'))[1]::int), 0) + 1)::text, 4, '0') into ref_ from store_rows where tbl = 'trips'; end if;
  r := _stp_set(r, tm, 'الرقم المرجعي', to_jsonb(ref_));
  r := _stp_set(r, tm, 'فنادق إضافية - المدينة (JSON)', to_jsonb((select coalesce(jsonb_agg(x), '[]'::jsonb) from jsonb_array_elements(case when jsonb_typeof(d -> 'madinahHotelsExtra') = 'array' then d -> 'madinahHotelsExtra' else '[]'::jsonb end) x where _gs_truthy(x))::text));
  r := _stp_set(r, tm, 'فنادق إضافية - مكة (JSON)', to_jsonb((select coalesce(jsonb_agg(x), '[]'::jsonb) from jsonb_array_elements(case when jsonb_typeof(d -> 'makkahHotelsExtra') = 'array' then d -> 'makkahHotelsExtra' else '[]'::jsonb end) x where _gs_truthy(x))::text));
  sl := _st_suplist(d);
  r := _stp_set(r, tm, 'المشرفون (JSON)', case when jsonb_array_length(sl) > 0 then to_jsonb(_st_supjson(sl)) else _td_s(_rx_c(ex_, _ix(tm, 'المشرفون (JSON)'))) end);
  if jsonb_array_length(sl) > 0 then
    r := _stp_set(r, tm, 'المشرف', to_jsonb(coalesce(sl -> 0 ->> 'name', ''))); r := _stp_set(r, tm, 'دور المشرف', to_jsonb(coalesce(nullif(sl -> 0 ->> 'role', ''), 'مرافق')));
    select string_agg(mo, ' / ' order by o) into ph from (select btrim(coalesce(x ->> 'mobile', '')) mo, o from jsonb_array_elements(sl) with ordinality t(x, o)) z where mo <> '';
    if coalesce(ph, '') <> '' and _w_str(d -> 'supervisorPhones') = '' then r := _stp_set(r, tm, 'أرقام جوالات المشرف', to_jsonb(ph)); end if;
  end if;
  if rid_ is not null then update store_rows set raw = r where tbl = 'trips' and rid = rid_; else perform _x_append('trips', r); end if;
  perform _x_bump('trips');
  perform _x_aud(who, case when rid_ is null then 'إنشاء رحلة (مسودة)' else 'تحديث رحلة (مسودة)' end, nm, 'رحلة', '-', '-');
  begin perform _st_propagate(nm); exception when others then null; end;
  perform _w_dv_bump(array['trips', 'pilgrims', 'bookings', 'movements', 'visa', 'ministry', 'dropdowns']);
  return jsonb_build_object('success', true, 'tripName', nm); end $$;

-- ===== المطابقة لمرة واحدة (= runOneTimeReconciliation؛ للمدير) =====
create or replace function rw2_runonetimereconciliation(a jsonb, u text) returns jsonb language plpgsql volatile set search_path = public as
$$ declare tm jsonb := _rx_map('trips', _rx_h_trips()); bm jsonb := _rx_map('bookings', _bk_canon()); t record; br jsonb; lk text; bp text; tu int := 0; bu int := 0; cf jsonb := '[]'::jsonb; begin
  perform _x_admin();
  for t in select _rx_trim(_rx_s(_rx_c(raw, _ix(tm, 'اسم الرحلة')))) nm, _rx_trim(_rx_s(_rx_c(raw, _ix(tm, 'رقم الإشعار المرتبط')))) lk, _rx_trim(_rx_s(_rx_c(raw, _ix(tm, 'منفذ الوصول')))) ap
             from _rx_rows('trips') order by rn loop
    if t.nm = '' then continue; end if;
    lk := coalesce(nullif(t.lk, ''), (select _rx_trim(_rx_s(_rx_c(raw, _ix(bm, 'رقم الإشعار')))) from _rx_rows('bookings') where _rx_trim(_rx_s(_rx_c(raw, _ix(bm, 'اسم الرحلة')))) = t.nm order by rn limit 1), '');
    if lk = '' then continue; end if;
    select raw into br from _rx_rows('bookings') where _rx_trim(_rx_s(_rx_c(raw, _ix(bm, 'رقم الإشعار')))) = lk order by rn limit 1;
    if br is null then continue; end if;
    bp := _rx_trim(_rx_s(_rx_c(br, _ix(bm, 'منفذ الوصول'))));
    if bp <> '' and bp <> t.ap then
      perform _bk_to_trip(jsonb_build_object('tripName', t.nm, 'arrivalPort', _rx_c(br, _ix(bm, 'منفذ الوصول')), 'departurePort', _rx_c(br, _ix(bm, 'منفذ المغادرة')), 'arrivalTime', _rx_c(br, _ix(bm, 'ساعة الوصول')),
        'departureTime', _rx_c(br, _ix(bm, 'ساعة المغادرة')), 'arrivalFlight', _rx_c(br, _ix(bm, 'رقم رحلة الوصول')), 'departureFlight', _rx_c(br, _ix(bm, 'رقم رحلة المغادرة')),
        'arrivalDate', _rx_c(br, _ix(bm, 'تاريخ الوصول')), 'departureDate', _rx_c(br, _ix(bm, 'تاريخ المغادرة'))));
      tu := tu + 1; cf := cf || jsonb_build_array(jsonb_build_object('trip', t.nm, 'bookingId', lk, 'resolvedFrom', 'booking', 'field', 'منفذ الوصول'));
    elsif bp = '' and t.ap <> '' then
      perform _st_propagate(t.nm); bu := bu + 1; cf := cf || jsonb_build_array(jsonb_build_object('trip', t.nm, 'bookingId', lk, 'resolvedFrom', 'trip', 'field', 'منفذ الوصول'));
    end if;
  end loop;
  perform _w_dv_bump(array['bookings', 'movements', 'trips', 'pilgrims', 'visa', 'ministry', 'dropdowns']);
  return jsonb_build_object('tripsUpdated', tu, 'bookingsUpdated', bu, 'conflicts', cf); end $$;

do $$ declare r record; begin
  for r in select p.oid::regprocedure::text sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname in ('_ix','_td_s','_row_rid','_norm_l','_ren_col','_ren_jarr','_client_ren','_trip_ren','rw2_addclientrecord','rw2_updateclientrecord','rw2_deleteclientrecord',
              'rx2_getcompaniessettings','rw2_savecompanysetting','rw2_deletecompanysetting','_cl_perm','_cl_base','_trip_clients','rw2_createtripclientlink','rw2_revoketripclientlink','rx2_gettripclientlinksinfo',
              'rx2_gettripbyname','rx2_gettripaccommodationlevels','rw2_applytrippricing','_bk_of_trip','rx2_gettripbookingcompare','rw2_adoptbookinggrouptotrip','rw2_synctripbookingbyname','_bk_to_trip',
              'rw2_bookingaftersavebg','rw2_bookingcachebustbg','rw2_cachebustbg','rx2_checkbuspricecolumnsexist','rw2_kashfaftersavebg','rx2_getbookinglinksuggestions','rx2_getbookingpilgrimnames',
              'rx2_getrule70bookings','rw2_saveglobalpilgrim','rw2_savetripdraft','rw2_runonetimereconciliation') loop
    execute format('revoke all on function %s from public, anon, authenticated', r.sig);
    execute format('grant execute on function %s to service_role', r.sig);
  end loop;
end $$;

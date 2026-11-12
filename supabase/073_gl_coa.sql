-- V4.445 · الدفعة 2ب: دليل الحسابات وإعدادات الحسابات العامة ⇒ Postgres (= Accounts.gs).
-- إضافة/تعديل/حذف حساب · إعدادات الحسابات (تاريخ البداية/الأسعار/وسيط العملات/فروق الإعاشة/قاعدة العملة/بيانات السندات) · إقفال الفترات
-- · تخصيص صلاحيات شاشة الأرصدة · إعادة ضبط الكاش.
-- يتطلب تفعيل مجموعة التخزين glcore (storeCutoverGlCoreApply) — قبلها ترفض الدوال بـ 0A000 فتعمل من Apps Script كما كانت.
-- كل كتابة تحدّث معاً: store_rows (المصدر) + الجدول المنمّط gl_accounts/gl_settings (يقرؤه مسار حفظ القيود 003/051) + gl_aux.accounts (شاشات القراءة)
-- + gl_outbox 'gl:bump' (يبطل كاش Apps Script للحسابات والإعدادات فوراً).
-- يتطلب: 003 · 005 · 035 · 067.

create or replace function _glk_on() returns void language plpgsql stable as
$$ begin
  if not exists (select 1 from store_meta where tbl = 'gl_accounts') or not exists (select 1 from store_meta where tbl = 'gl_settings') then
    raise exception 'غير مدعوم: دليل الحسابات ما زال بالشيت (فعّل glcore)' using errcode = '0A000'; end if; end $$;
create or replace function _glk_admin(msg text) returns void language plpgsql stable as
$$ begin if not app_has('admin') then raise exception '%', msg using errcode = '42501'; end if; end $$;
create or replace function _glk_now() returns text language sql stable as $$ select to_char(now() at time zone 'Africa/Cairo', 'DD/MM/YYYY HH24:MI:SS') $$;
create or replace function _glk_bump() returns void language plpgsql volatile as
$$ begin perform _glw_outbox('gl:bump', '{}'::jsonb); perform _glw_dv_bump(array['gl', 'hb']); end $$;

-- ===== الإعدادات =====
create or replace function _glk_settings() returns jsonb language sql stable set search_path = public as
$$ select '{"startDate":"01/07/2026","baseCurrency":"EGP","rate_SAR":"13.3","rate_USD":"50"}'::jsonb
       || coalesce((select jsonb_object_agg(k, v) from (select _glx_str(_rx_c(raw, 0)) k, _glx_str(_rx_c(raw, 1)) v, rn from _rx_rows('gl_settings') order by rn) z where k <> ''), '{}'::jsonb) $$;
create or replace function _glk_set(k text, v text) returns void language plpgsql volatile set search_path = public as
$$ declare rid_ text; begin
  perform _x_lock('gl_settings');
  select rid into rid_ from store_rows where tbl = 'gl_settings' and _glx_str(_rx_c(raw, 0)) = k order by ord limit 1;
  if rid_ is not null then update store_rows set raw = jsonb_set(_x_pad(raw, 2), '{1}', to_jsonb(coalesce(v, ''))) where tbl = 'gl_settings' and rid = rid_;
  else perform _x_append('gl_settings', jsonb_build_array(k, coalesce(v, ''))); end if;
  perform _x_bump('gl_settings');
  insert into gl_settings (key, value) values (k, coalesce(v, '')) on conflict (key) do update set value = excluded.value;
end $$;
create or replace function _glk_brand_def() returns jsonb language sql immutable as
$$ select jsonb_build_object('vch_name_ar', 'شركة منف للسياحة الدولية', 'vch_name_en', 'Menf International Tours', 'vch_tagline', 'رحلات حج وعمرة - تذاكر سفر - برامج سياحية',
     'vch_address', '32 شارع الفلكي - باب اللوق - القاهرة', 'vch_phone', '+002 02 27926054', 'vch_email', 'mt@menftours.net', 'vch_logo_company', '',
     'vch_note', 'لا يعتد بهذا الإيصال بعد انتهاء الرحلة أو بعد مرور 30 يوماً من تاريخ الإيصال', 'vch_companies', '[]') $$;
create or replace function _glk_settings_out() returns jsonb language sql stable set search_path = public as
$$ select s || jsonb_build_object('vchBrand', (select jsonb_object_agg(k, case when coalesce(s ->> k, '') <> '' then s -> k else d end) from jsonb_each(_glk_brand_def()) q(k, d)))
     from (select _glk_settings() s) z $$;
create or replace function _glk_rates() returns jsonb language sql stable set search_path = public as
$$ select jsonb_build_object('EGP', 1, 'SAR', coalesce(nullif(_glx_pf(_glk_settings() ->> 'rate_SAR'), 0), 13.3), 'USD', coalesce(nullif(_glx_pf(_glk_settings() ->> 'rate_USD'), 0), 50)) $$;

-- ===== الحسابات =====
create or replace function _glk_obj(raw jsonb, rn int) returns jsonb language sql stable as
$$ select jsonb_build_object('code', _glx_str(raw -> 0), 'name', _glx_str(raw -> 1), 'type', coalesce(nullif(_glx_str(raw -> 2), ''), 'ASSET'), 'parent', _glx_str(raw -> 3),
     'isGroup', _glx_str(raw -> 4) = 'نعم', 'currency', _glx_str(raw -> 5), 'kind', _glx_str(raw -> 6), 'link', _glx_str(raw -> 7), 'active', _glx_str(raw -> 8) <> 'لا',
     'notes', _glx_str(raw -> 9), 'legacyId', _glx_str(raw -> 12), '_row', rn) $$;
create or replace function _glk_accs() returns table (rid text, rn int, code text, o jsonb) language sql stable set search_path = public as
$$ select r.rid, r.rn, _glx_str(r.raw -> 0), _glk_obj(r.raw, r.rn) from (select rid, row_number() over (order by ord, rid)::int + 1 rn, raw from store_rows where tbl = 'gl_accounts') r
    where _glx_str(r.raw -> 0) <> '' $$;
-- مرآة الحساب: الجدول المنمّط + gl_aux.accounts
create or replace function _glk_mirror(c text) returns void language plpgsql volatile set search_path = public as
$$ declare r jsonb; o jsonb; rn_ int; begin
  select raw, rn into r, rn_ from (select raw, row_number() over (order by ord, rid)::int + 1 rn from store_rows where tbl = 'gl_accounts') z where _glx_str(raw -> 0) = c limit 1;
  if r is null then
    delete from gl_accounts where code = c;
    update gl_aux set data = data - c, updated_at = now() where key = 'accounts';
    return;
  end if;
  o := _glk_obj(r, rn_);
  insert into gl_accounts (code, name, acc_type, parent_code, is_group, currency, category, link, active, notes, legacy_id, created_by, created_at)
  values (c, o ->> 'name', o ->> 'type', nullif(o ->> 'parent', ''), (o ->> 'isGroup')::boolean, nullif(o ->> 'currency', ''), nullif(o ->> 'kind', ''), nullif(o ->> 'link', ''), (o ->> 'active')::boolean,
          nullif(o ->> 'notes', ''), nullif(o ->> 'legacyId', ''), nullif(_glx_str(r -> 10), ''), now())
  on conflict (code) do update set name = excluded.name, acc_type = excluded.acc_type, parent_code = excluded.parent_code, is_group = excluded.is_group, currency = excluded.currency,
    category = excluded.category, link = excluded.link, active = excluded.active, notes = excluded.notes;
  update gl_aux set data = jsonb_set(data, array[c], o), updated_at = now() where key = 'accounts';
end $$;
-- = _glFreeChildCode_ (أكواد المحذوفة متقاعدة · لا تعارض بادئات)
create or replace function _glk_free_code(p text) returns text language plpgsql stable set search_path = public as
$$ declare codes text[]; w int := case length(p) when 1 then 1 when 2 then 2 else 3 end; n int; c text; dl jsonb; begin
  begin dl := coalesce((_glk_settings() ->> 'acc_deleted')::jsonb -> 'codes', '{}'::jsonb); exception when others then dl := '{}'::jsonb; end;
  codes := array(select code from _glk_accs()) || array(select jsonb_object_keys(dl));
  for n in 1 .. (10 ^ w)::int - 1 loop
    c := p || lpad(n::text, w, '0');
    if not exists (select 1 from unnest(codes) x where x = c or (length(x) > length(c) and starts_with(x, c)) or (length(x) < length(c) and starts_with(c, x) and not starts_with(p, x))) then return c; end if;
  end loop;
  for n in 1 .. 999 loop
    c := p || lpad('0', w, '0') || lpad(n::text, 3, '0');
    if not exists (select 1 from unnest(codes) x where x = c or (length(x) > length(c) and starts_with(x, c)) or (length(x) < length(c) and starts_with(c, x) and not starts_with(p, x))) then return c; end if;
  end loop;
  raise exception 'امتلأت أكواد الحسابات تحت %', p using errcode = 'P0001'; end $$;
-- = _glAccNotesMerge_
create or replace function _glk_notes_merge(old_ text, new_ text, tl jsonb) returns text language plpgsql stable as
$$ declare keep text[] := '{}'; m text[]; vis text; seen jsonb := '{}'::jsonb; n text; has_tl boolean := jsonb_typeof(tl) = 'array'; begin
  for m in select regexp_matches(coalesce(old_, ''), '⟦alias:([^|⟧]*)\|([^⟧]+)⟧', 'g') loop
    if not (has_tl and m[1] = 'trip') then keep := keep || ('⟦alias:' || m[1] || '|' || m[2] || '⟧'); end if; end loop;
  vis := btrim(regexp_replace(coalesce(new_, ''), '⟦alias:([^|⟧]*)\|([^⟧]+)⟧', '', 'g'));
  if not has_tl then for m in select regexp_matches(coalesce(new_, ''), '⟦alias:([^|⟧]*)\|([^⟧]+)⟧', 'g') loop
    if not ('⟦alias:' || m[1] || '|' || m[2] || '⟧') = any (keep) then keep := keep || ('⟦alias:' || m[1] || '|' || m[2] || '⟧'); end if; end loop; end if;
  if has_tl then for n in select btrim(x) from jsonb_array_elements_text(tl) x loop
    if n <> '' and not seen ? _glx_norm(n) then seen := seen || jsonb_build_object(_glx_norm(n), 1); keep := keep || ('⟦alias:trip|' || n || '⟧'); end if; end loop; end if;
  return btrim(vis || case when array_length(keep, 1) > 0 then ' ' || array_to_string(keep, '') else '' end); end $$;
-- = _glAccTripUnlinkOthers_
create or replace function _glk_trip_unlink(self_ text, tl jsonb) returns void language plpgsql volatile set search_path = public as
$$ declare x record; nn text; want text[]; begin
  if jsonb_typeof(tl) <> 'array' or jsonb_array_length(tl) = 0 then return; end if;
  want := array(select _glx_norm(e) from jsonb_array_elements_text(tl) e);
  for x in select a.rid, a.code, a.o ->> 'notes' nt from _glk_accs() a where a.code <> self_ and position('⟦alias:trip|' in coalesce(a.o ->> 'notes', '')) > 0 loop
    nn := x.nt;
    select string_agg(case when _glx_norm(t[1]) = any (want) then '' else '⟦alias:trip|' || t[1] || '⟧' end, '') into nn from regexp_matches(x.nt, '⟦alias:trip\|([^⟧]+)⟧', 'g') t;
    nn := btrim(regexp_replace(x.nt, '⟦alias:trip\|[^⟧]+⟧', '', 'g') || coalesce(nn, ''));
    if nn is distinct from x.nt then
      update store_rows set raw = jsonb_set(_x_pad(raw, 13), '{9}', to_jsonb(nn)) where tbl = 'gl_accounts' and rid = x.rid;
      perform _glk_mirror(x.code);
    end if;
  end loop; end $$;

create or replace function rw2_glsaveaccount(a jsonb, u text) returns jsonb language plpgsql volatile set search_path = public as
$$ declare who text := coalesce(u, app_user(), '-'); d jsonb := coalesce(a -> 1, '{}'::jsonb); cd text := _glx_trim(coalesce(d ->> 'code', '')); x record; p record; dup text; nc text; r jsonb; edit boolean; begin
  perform _glk_on();
  perform _x_lock('gl_accounts');
  select * into x from _glk_accs() where code = cd;
  edit := cd <> '' and x.code is not null and coalesce((d ->> 'isEdit')::boolean, false);
  if not gl_can_cap('coa', case when edit then 'edit' else 'add' end) then raise exception 'لا تملك صلاحية % بدليل الحسابات', case when edit then 'التعديل' else 'الإضافة' end using errcode = '42501'; end if;
  if _glx_trim(coalesce(d ->> 'name', '')) = '' then raise exception 'اسم الحساب مطلوب' using errcode = 'P0001'; end if;
  if edit then
    select raw into r from store_rows where tbl = 'gl_accounts' and rid = x.rid;
    r := _x_pad(r, 13);
    r := jsonb_set(r, '{1}', to_jsonb(_glx_trim(d ->> 'name')));
    r := jsonb_set(r, '{5}', to_jsonb(case when _gs_truthy(d -> 'currency') then _glx_cur(d -> 'currency') else '' end));
    r := jsonb_set(r, '{6}', to_jsonb(_glx_trim(coalesce(nullif(d ->> 'kind', ''), x.o ->> 'kind', ''))));
    r := jsonb_set(r, '{7}', to_jsonb(_glx_trim(case when d ? 'link' then coalesce(d ->> 'link', '') else x.o ->> 'link' end)));
    r := jsonb_set(r, '{8}', to_jsonb(case when d -> 'active' = 'false'::jsonb then 'لا' else 'نعم' end));
    r := jsonb_set(r, '{9}', to_jsonb(_glk_notes_merge(x.o ->> 'notes', d ->> 'notes', d -> 'tripLinks')));
    update store_rows set raw = r where tbl = 'gl_accounts' and rid = x.rid;
    perform _x_bump('gl_accounts'); perform _glk_mirror(cd);
    perform _glk_trip_unlink(cd, d -> 'tripLinks');
    perform _glk_bump();
    perform _x_aud(who, 'تعديل حساب بالدليل', 'GL:' || cd, 'اسم الحساب', x.o ->> 'name', d ->> 'name');
    return jsonb_build_object('success', true, 'account', (select o from _glk_accs() where code = cd));
  end if;
  select * into p from _glk_accs() where code = _glx_trim(coalesce(d ->> 'parent', ''));
  if p.code is null then raise exception 'الحساب الأب غير موجود: %', coalesce(d ->> 'parent', '') using errcode = 'P0001'; end if;
  if not (p.o ->> 'isGroup')::boolean then raise exception 'لا يمكن إضافة حساب تحت حساب غير تجميعي: %', p.o ->> 'name' using errcode = 'P0001'; end if;
  select code into dup from _glk_accs() where o ->> 'parent' = p.code and _glx_norm(o ->> 'name') = _glx_norm(d ->> 'name') limit 1;
  if dup is not null then return jsonb_build_object('success', true, 'account', (select o from _glk_accs() where code = dup)); end if;
  nc := _glk_free_code(p.code);
  perform _x_append('gl_accounts', jsonb_build_array(nc, _glx_trim(d ->> 'name'), p.o ->> 'type', p.code, case when coalesce((d ->> 'isGroup')::boolean, false) then 'نعم' else 'لا' end,
    case when _gs_truthy(d -> 'currency') then _glx_cur(d -> 'currency') else '' end, coalesce(nullif(d ->> 'kind', ''), p.o ->> 'kind', ''), _glx_trim(coalesce(d ->> 'link', '')), 'نعم',
    _glk_notes_merge('', d ->> 'notes', d -> 'tripLinks'), who, _glk_now(), ''));
  perform _x_bump('gl_accounts'); perform _glk_mirror(nc);
  perform _glk_trip_unlink(nc, d -> 'tripLinks');
  perform _glk_bump();
  perform _x_aud(who, 'إضافة حساب بالدليل', 'GL:' || nc, '-', '-', nc || ' — ' || _glx_trim(d ->> 'name'));
  return jsonb_build_object('success', true, 'account', (select o from _glk_accs() where code = nc)); end $$;

create or replace function rw2_gldeleteaccount(a jsonb, u text) returns jsonb language plpgsql volatile set search_path = public as
$$ declare who text := coalesce(u, app_user(), '-'); cd text := _glx_trim(coalesce(a ->> 1, '')); x record; begin
  perform _glk_on();
  if not gl_can_cap('coa', 'delete') then raise exception 'لا تملك صلاحية الحذف بدليل الحسابات' using errcode = '42501'; end if;
  perform _x_lock('gl_accounts');
  select * into x from _glk_accs() where code = cd;
  if x.code is null then raise exception 'الحساب غير موجود' using errcode = 'P0001'; end if;
  if exists (select 1 from _glk_accs() where o ->> 'parent' = cd) then raise exception 'لا يمكن حذف حساب له حسابات فرعية' using errcode = 'P0001'; end if;
  if exists (select 1 from gl_lines where _glx_str(raw -> 4) = cd) then raise exception 'لا يمكن حذف حساب عليه قيود — يمكنك إيقافه بدل الحذف' using errcode = 'P0001'; end if;
  perform _rb_on('gl_account', 'حساب من الدليل', '', who);
  delete from store_rows where tbl = 'gl_accounts' and rid = x.rid;
  perform _x_bump('gl_accounts'); perform _glk_mirror(cd); perform _glk_bump();
  perform _x_aud(who, 'حذف حساب من الدليل', 'GL:' || cd, x.o ->> 'name', cd, '-');
  return jsonb_build_object('success', true); end $$;

create or replace function rw2_glsavesettings(a jsonb, u text) returns jsonb language plpgsql volatile set search_path = public as
$$ declare who text := coalesce(u, app_user(), '-'); s jsonb := coalesce(a -> 1, '{}'::jsonb); dd text; fa text; k text; begin
  perform _glk_on(); perform _glk_admin('إعدادات الحسابات متاحة للمدير فقط');
  if s ? 'startDate' then dd := _glx_date(s -> 'startDate'); if coalesce(dd, '') = '' then raise exception 'تاريخ البداية غير صالح' using errcode = 'P0001'; end if; perform _glk_set('startDate', dd); end if;
  if s ? 'rate_SAR' then perform _glk_set('rate_SAR', coalesce(nullif(_glx_num(s -> 'rate_SAR'), 0), 13.3)::text); end if;
  if s ? 'rate_USD' then perform _glk_set('rate_USD', coalesce(nullif(_glx_num(s -> 'rate_USD'), 0), 50)::text); end if;
  if s ? 'fx_bridge' then perform _glk_set('fx_bridge', case when _glw_truthy(s -> 'fx_bridge') then 'نعم' else 'لا' end); end if;
  if s ? 'fx_bridge_acc' then
    fa := _glx_trim(coalesce(s ->> 'fx_bridge_acc', ''));
    if fa <> '' and not exists (select 1 from _glk_accs() where code = fa and not (o ->> 'isGroup')::boolean) then raise exception 'حساب وسيط العملات غير صالح' using errcode = 'P0001'; end if;
    perform _glk_set('fx_bridge_acc', fa);
  end if;
  if s ? 'auto_acc_cat_diff' then
    fa := _glx_trim(coalesce(s ->> 'auto_acc_cat_diff', ''));
    if fa <> '' and not exists (select 1 from _glk_accs() where code = fa and not (o ->> 'isGroup')::boolean) then raise exception 'حساب فروق اتفاقيات الإعاشة غير صالح' using errcode = 'P0001'; end if;
    if fa <> '' then perform _glk_set('auto_acc_cat_diff', fa); end if;
  end if;
  if s ? 'ccy_def_rule' then fa := _glx_trim(coalesce(s ->> 'ccy_def_rule', '')); if fa !~ '^(all|hb|fixed)$' then raise exception 'قاعدة العملة غير صالحة' using errcode = 'P0001'; end if; perform _glk_set('ccy_def_rule', fa); end if;
  for k in select jsonb_object_keys(_glk_brand_def()) loop if s ? k then perform _glk_set(k, _glx_trim(coalesce(s ->> k, ''))); end if; end loop;
  perform _glk_bump();
  perform _x_aud(who, 'تعديل إعدادات الحسابات العامة', 'GL:settings', '-', '-', s::text);
  return jsonb_build_object('success', true, 'settings', _glk_settings_out(), 'rates', _glk_rates()); end $$;
create or replace function rw2_glsetlockdate(a jsonb, u text) returns jsonb language plpgsql volatile set search_path = public as
$$ declare who text := coalesce(u, app_user(), '-'); raw_ text := _glx_trim(coalesce(a ->> 1, '')); dd text := ''; old text; begin
  perform _glk_on(); perform _glk_admin('إقفال الفترات للمدير فقط');
  if raw_ <> '' then dd := coalesce(_glx_date(a -> 1), ''); if dd = '' then raise exception 'تاريخ غير صالح' using errcode = 'P0001'; end if; end if;
  old := coalesce(_glk_settings() ->> 'lockDate', '');
  perform _glk_set('lockDate', dd); perform _glk_bump();
  perform _x_aud(who, case when dd <> '' then 'إقفال الفترات حتى تاريخ' else 'فتح كل الفترات' end, 'GL:lock', 'تاريخ الإقفال', coalesce(nullif(old, ''), '-'), coalesce(nullif(dd, ''), '-'));
  return jsonb_build_object('success', true, 'lockDate', dd); end $$;
create or replace function rw2_glbalusercustset(a jsonb, u text) returns jsonb language plpgsql volatile set search_path = public as
$$ declare who text := coalesce(u, app_user(), '-'); on_ boolean := _glw_truthy(a -> 1); begin
  perform _glk_on(); perform _glk_admin('هذا الإعداد للمدير فقط');
  perform _glk_set('bal_user_cust', case when on_ then 'نعم' else 'لا' end); perform _glk_bump();
  perform _x_aud(who, 'تخصيص الصلاحيات لشاشة الأرصدة', 'GL:bal_user_cust', '-', '-', case when on_ then 'مفعَّل' else 'موقوف' end);
  return jsonb_build_object('success', true, 'on', on_); end $$;
create or replace function rw2_glcachereset(a jsonb, u text) returns jsonb language plpgsql volatile set search_path = public as
$$ begin
  perform _glk_admin('هذا الإجراء للمدير فقط (إعدادات / استيراد / مزامنة خارجية / عملية مؤثرة)');
  perform _glk_bump();
  return jsonb_build_object('success', true, 'ver', to_char(clock_timestamp(), 'YYYYMMDDHH24MISSMS')); end $$;

do $$ declare r record; begin
  for r in select p.oid::regprocedure::text sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and (p.proname like '\_glk\_%' or p.proname in ('rw2_glsaveaccount','rw2_gldeleteaccount','rw2_glsavesettings','rw2_glsetlockdate','rw2_glbalusercustset','rw2_glcachereset')) loop
    execute format('revoke all on function %s from public, anon, authenticated', r.sig);
    execute format('grant execute on function %s to service_role', r.sig);
  end loop;
end $$;

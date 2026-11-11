-- V4.444 · الدفعة 1 (مجال ملفات الوزارة كاملاً): كل وظائف شاشة مراجعة ملفات الوزارة المتبقية من Apps Script ⇒ Postgres.
-- المشرفون (حفظ/جماعي/مشاركة/حذف/اقتراح) · الإيصالات (حفظ/حذف/كشف رسوم الغرفة) · ترحيل الحصص · الاعتماد · نوع الملف الجماعي
-- · الحذف الجماعي · الاستيراد · التعديل الجماعي · سياسة رسوم التنفيذ · مرشحو «فردي» وإحصاء الحصص · مستويات تسكين المختارين.
-- منطق كل دالة = نظيرتها بـ Code.gs حرفياً. الحذف ⇒ سلة المحذوفات (035). السجل ⇒ صندوق الإخراج (065 ينسخه لسجل التعديلات فوراً).
-- يتطلب: 010 · 016 · 035 · 040 · 065.

-- ===== أدوات مشتركة لكل دفعات النقل =====
create or replace function _x_bump(p_tbl text) returns void language sql volatile set search_path = public as
$$ update store_meta set ver = ver + 1, updated_at = now() where tbl = p_tbl $$;
create or replace function _x_append(p_tbl text, p_raw jsonb) returns text language plpgsql volatile set search_path = public as
$$ declare r text := substr(md5(random()::text || clock_timestamp()::text || p_raw::text), 1, 20); begin
  insert into store_rows (tbl, rid, ord, raw) select p_tbl, r, coalesce(max(ord), 0) + 1, p_raw from store_rows where tbl = p_tbl;
  return r; end $$;
create or replace function _x_aud(p_user text, p_action text, p_record text, p_field text, p_old text, p_new text) returns void language sql volatile set search_path = public as
$$ insert into app_outbox (kind, payload) values ('audit', jsonb_build_object('user', coalesce(p_user, '-'), 'action', p_action, 'record', coalesce(p_record, '-'),
     'field', coalesce(p_field, '-'), 'old', coalesce(p_old, '-'), 'new', coalesce(p_new, '-'))) $$;
create or replace function _x_lock(p_tbl text) returns void language sql volatile as $$ select pg_advisory_xact_lock(hashtextextended('store:put:' || p_tbl, 0)) $$;
create or replace function _x_id(p_prefix text) returns text language sql volatile as   -- = _accId_
$$ select p_prefix || _w_b36((extract(epoch from clock_timestamp()) * 1000)::bigint) || _w_b36(floor(random() * 10000)::bigint) $$;
create or replace function _x_admin() returns void language plpgsql stable as
$$ begin if not app_has('admin') then raise exception 'هذه العملية للمدير فقط' using errcode = '42501'; end if; end $$;
create or replace function _x_perm(p text, msg text) returns void language plpgsql stable as
$$ begin if not app_has(p) then raise exception '%', msg using errcode = '42501'; end if; end $$;
create or replace function _x_pad(r jsonb, n int) returns jsonb language plpgsql immutable as
$$ begin r := coalesce(r, '[]'::jsonb); while jsonb_array_length(r) < n loop r := r || to_jsonb(''::text); end loop; return r; end $$;
create or replace function _x_fmt0(n float8) returns text language sql immutable as $$ select to_char(round(coalesce(n, 0)), 'FM999,999,999,990') $$;
-- رفع إعداد لـ app_kv + نفس الخاصية بـ Apps Script عبر صندوق الإخراج (kvset)
create or replace function _x_kv(p_key text, p_val text) returns void language plpgsql volatile set search_path = public as
$$ begin
  insert into app_kv (k, v, updated_at) values (p_key, coalesce(p_val, ''), now()) on conflict (k) do update set v = excluded.v, updated_at = now();
  insert into app_outbox (kind, payload) values ('kvset', jsonb_build_object('kv', jsonb_build_object(p_key, coalesce(p_val, ''))));
end $$;

-- ===== قراءات مساعدة للوزارة =====
create or replace function _mf_qt_month(c jsonb) returns text language plpgsql stable as
$$ declare s text; p text[]; y text := ''; m text := ''; begin
  if jsonb_typeof(c) = 'object' and c ? '$d' then return to_char(to_timestamp((c ->> '$d')::float8 / 1000) at time zone 'Asia/Riyadh', 'YYYY-MM'); end if;
  s := _mf_str(c); if s = '' then return ''; end if;
  p := array_remove(regexp_split_to_array(s, '[-/.\s]+'), '');
  if array_length(p, 1) = 2 then if length(p[1]) = 4 then y := p[1]; m := p[2]; else m := p[1]; y := p[2]; end if;
  elsif array_length(p, 1) >= 3 then if length(p[1]) = 4 then y := p[1]; m := p[2]; else m := p[2]; y := p[3]; end if; end if;
  if y !~ '^\d{4}$' or m !~ '^\d{1,2}$' then return s; end if;
  return y || '-' || lpad(m, 2, '0'); end $$;
create or replace function _mf_quota_transfers() returns jsonb language sql stable set search_path = public as
$$ select coalesce(jsonb_agg(jsonb_build_object('id', _mf_str(_rx_c(raw, 0)), 'company', _mf_str(_rx_c(raw, 1)), 'fromMonth', _mf_qt_month(_rx_c(raw, 2)), 'toMonth', _mf_qt_month(_rx_c(raw, 3)),
     'amount', _mf_num(_rx_c(raw, 4)), 'notes', _mf_str(_rx_c(raw, 5)), 'createdBy', _mf_str(_rx_c(raw, 6)), 'createdAt', _mf_str(_rx_c(raw, 7)), '_row', rn) order by rn), '[]'::jsonb)
   from _rx_rows('mf_quota_transfers') where _mf_str(_rx_c(raw, 0)) <> '' $$;
create or replace function _mf_core() returns jsonb language sql stable set search_path = public as $$ select _mf_all(_sx_exec_policy(), _sx_acc_pricing(), _mf_today()) $$;
create or replace function _mf_month_key(d text) returns text language sql stable as
$$ select coalesce((select m[3] || '-' || m[2] from regexp_match(_mf_datet(d), '^(\d{2})/(\d{2})/(\d{4})$') m), '') $$;
create or replace function _mf_sup_row(s jsonb, who text, stamp text, old jsonb) returns jsonb language sql stable as
$$ select jsonb_build_array(_w_str(s -> 'name'), coalesce(nullif(_w_str(s -> 'type'), ''), 'مرافق'), _w_str(s -> 'home'),
     coalesce((select string_agg(_w_str(x), '، ' order by o) from jsonb_array_elements(case when jsonb_typeof(s -> 'shared') = 'array' then s -> 'shared' else '[]'::jsonb end) with ordinality t(x, o) where _w_str(x) <> ''), ''),
     _w_str(s -> 'mobile'), _w_str(s -> 'notes'), case when old is null then who else old ->> 'createdBy' end, case when old is null then stamp else old ->> 'createdAt' end, who, stamp) $$;

-- ===== المشرفون =====
create or replace function rw2_saveministrysupervisor(a jsonb, u text) returns jsonb language plpgsql volatile set search_path = public as
$$ declare s jsonb := coalesce(a -> 1, '{}'::jsonb); who text := coalesce(u, app_user(), '-'); nm text := _w_str(s -> 'name'); home text := _w_str(s -> 'home'); old jsonb; rid_ text; row_ jsonb; begin
  perform _x_perm('ministry.edit', 'لا تملك صلاحية تعديل مراجعة ملفات الوزارة');
  if nm = '' then return jsonb_build_object('success', false, 'error', 'اسم المشرف مطلوب'); end if;
  if home = '' then return jsonb_build_object('success', false, 'error', 'الشركة الأساسية مطلوبة'); end if;
  perform _x_lock('mf_supervisors');
  select x into old from jsonb_array_elements(_mf_supervisors()) x where x ->> 'name' = coalesce(nullif(_w_str(s -> '_origName'), ''), nm) limit 1;
  row_ := _mf_sup_row(s, who, _w_stamp(), old);
  if old is not null then
    select rid into rid_ from store_rows where tbl = 'mf_supervisors' and _mf_str(_rx_c(raw, 0)) = old ->> 'name' order by ord limit 1;
    update store_rows set raw = row_ where tbl = 'mf_supervisors' and rid = rid_;
    perform _x_aud(who, 'تعديل مشرف', nm, 'بيانات المشرف', (old ->> 'type') || ' / ' || (old ->> 'home'), (row_ ->> 1) || ' / ' || home);
  else
    if exists (select 1 from jsonb_array_elements(_mf_supervisors()) x where x ->> 'name' = nm) then return jsonb_build_object('success', false, 'error', 'المشرف مسجَّل من قبل'); end if;
    perform _x_append('mf_supervisors', row_);
    perform _x_aud(who, 'إضافة مشرف', nm, '-', '-', (row_ ->> 1) || ' / ' || home);
  end if;
  perform _x_bump('mf_supervisors'); perform _w_dv_bump(array['ministry']);
  return jsonb_build_object('success', true); end $$;

create or replace function rw2_bulksaveministrysupervisors(a jsonb, u text) returns jsonb language plpgsql volatile set search_path = public as
$$ declare who text := coalesce(u, app_user(), '-'); r jsonb; nm text; home text; old jsonb; added text[] := '{}'; upd text[] := '{}'; skp text[] := '{}'; rid_ text; row_ jsonb; st text := _w_stamp(); sups jsonb; begin
  perform _x_perm('ministry.edit', 'لا تملك صلاحية تعديل مراجعة ملفات الوزارة');
  perform _x_lock('mf_supervisors');
  for r in select * from jsonb_array_elements(case when jsonb_typeof(a -> 1) = 'array' then a -> 1 else '[]'::jsonb end) loop
    nm := _w_str(r -> 'name'); home := _w_str(r -> 'home');
    if nm = '' or home = '' then skp := skp || coalesce(nullif(nm, ''), '(بلا اسم)'); continue; end if;
    sups := _mf_supervisors();
    select x into old from jsonb_array_elements(sups) x where x ->> 'name' = nm limit 1;
    row_ := _mf_sup_row(r, who, st, old);
    if old is not null then
      select rid into rid_ from store_rows where tbl = 'mf_supervisors' and _mf_str(_rx_c(raw, 0)) = nm order by ord limit 1;
      update store_rows set raw = row_ where tbl = 'mf_supervisors' and rid = rid_;
      if not (nm = any (added)) and not (nm = any (upd)) then upd := upd || nm; end if;
    else perform _x_append('mf_supervisors', row_); added := added || nm; end if;
  end loop;
  if array_length(added, 1) > 0 or array_length(upd, 1) > 0 then
    perform _x_aud(who, 'تسجيل مجمَّع لمشرفين', array_to_string(added || upd, '، '), '-', '-', 'أُضيف ' || coalesce(array_length(added, 1), 0) || ' وحُدِّث ' || coalesce(array_length(upd, 1), 0));
    perform _x_bump('mf_supervisors'); perform _w_dv_bump(array['ministry']);
  end if;
  return jsonb_build_object('success', true, 'added', to_jsonb(added), 'updated', to_jsonb(upd), 'skipped', to_jsonb(skp)); end $$;

create or replace function rw2_bulkshareministrysupervisors(a jsonb, u text) returns jsonb language plpgsql volatile set search_path = public as
$$ declare who text := coalesce(u, app_user(), '-'); nm text; c text; hit jsonb; sh jsonb; added boolean; out_ jsonb := '[]'::jsonb; rid_ text; comps text[]; begin
  perform _x_perm('ministry.edit', 'لا تملك صلاحية تعديل مراجعة ملفات الوزارة');
  select coalesce(array_agg(_w_str(x)) filter (where _w_str(x) <> ''), '{}') into comps from jsonb_array_elements(case when jsonb_typeof(a -> 2) = 'array' then a -> 2 else '[]'::jsonb end) x;
  if jsonb_array_length(coalesce(a -> 1, '[]'::jsonb)) = 0 then return jsonb_build_object('success', false, 'error', 'اختر مشرفاً واحداً على الأقل'); end if;
  if coalesce(array_length(comps, 1), 0) = 0 then return jsonb_build_object('success', false, 'error', 'اختر شركة واحدة على الأقل'); end if;
  perform _x_lock('mf_supervisors');
  for nm in select _w_str(x) from jsonb_array_elements(a -> 1) x loop
    select x into hit from jsonb_array_elements(_mf_supervisors()) x where x ->> 'name' = nm limit 1;
    if hit is null then continue; end if;
    sh := coalesce(hit -> 'shared', '[]'::jsonb); added := false;
    foreach c in array comps loop if not sh @> to_jsonb(c) then sh := sh || to_jsonb(c); added := true; end if; end loop;
    if not added then continue; end if;
    select rid into rid_ from store_rows where tbl = 'mf_supervisors' and _mf_str(_rx_c(raw, 0)) = nm order by ord limit 1;
    update store_rows set raw = _mf_sup_row(hit || jsonb_build_object('shared', sh), who, _w_stamp(), hit) where tbl = 'mf_supervisors' and rid = rid_;
    perform _x_aud(who, 'مشاركة جماعية لمشرف', nm, 'شركات المشاركة', coalesce(nullif((select string_agg(x #>> '{}', '، ') from jsonb_array_elements(hit -> 'shared') x), ''), '-'),
      (select string_agg(x #>> '{}', '، ') from jsonb_array_elements(sh) x));
    out_ := out_ || jsonb_build_array(jsonb_build_object('name', nm, 'shared', sh));
  end loop;
  perform _x_bump('mf_supervisors'); perform _w_dv_bump(array['ministry']);
  return jsonb_build_object('success', true, 'updated', out_); end $$;

create or replace function rw2_deleteministrysupervisor(a jsonb, u text) returns jsonb language plpgsql volatile set search_path = public as
$$ declare who text := coalesce(u, app_user(), '-'); nm text := _w_str(a -> 1); rid_ text; begin
  perform _x_perm('ministry.delete', 'لا تملك صلاحية الحذف من مراجعة ملفات الوزارة');
  perform _x_lock('mf_supervisors');
  select rid into rid_ from store_rows where tbl = 'mf_supervisors' and _mf_str(_rx_c(raw, 0)) = nm order by ord limit 1;
  if rid_ is null then return jsonb_build_object('success', false, 'error', 'المشرف غير موجود'); end if;
  perform _rb_on('supervisor', 'مشرف وزارة ' || nm, '', who);
  delete from store_rows where tbl = 'mf_supervisors' and rid = rid_;
  perform _x_aud(who, 'حذف مشرف', nm, '-', nm, '-');
  perform _x_bump('mf_supervisors'); perform _w_dv_bump(array['ministry']);
  return jsonb_build_object('success', true); end $$;

create or replace function rx2_getministrysupervisorsonly(a jsonb, u text) returns jsonb language plpgsql stable set search_path = public as
$$ begin
  perform _x_perm('ministry.view', 'لا تملك صلاحية عرض مراجعة ملفات الوزارة');
  return jsonb_build_object('success', true, 'supervisors', _mf_supervisors(), 'companies', coalesce((_mf_reflists() -> 'companies'), '[]'::jsonb)); end $$;

create or replace function rx2_suggestministrysupervisors(a jsonb, u text) returns jsonb language plpgsql stable set search_path = public as
$$ declare o jsonb := coalesce(a -> 1, '{}'::jsonb); comp text := _w_str(o -> 'company'); go text := _mf_datet(o ->> 'goDate'); ret text := _mf_datet(o ->> 'retDate');
  cnt float8 := coalesce(_mf_num(o -> 'pilgrims'), 0); showall boolean := coalesce((o ->> 'showAll')::boolean, false); ex text := _w_str(o -> 'excludeId');
  files jsonb; s jsonb; ok boolean; why text; ld float8; bms float8; bdate text; allowed boolean; out_ jsonb := '[]'::jsonb; begin
  perform _x_perm('ministry.view', 'لا تملك صلاحية عرض مراجعة ملفات الوزارة');
  select coalesce(jsonb_agg(f), '[]'::jsonb) into files from _mf_files_raw(_sx_exec_policy());
  for s in select * from jsonb_array_elements(_mf_supervisors()) loop
    allowed := (s ->> 'home') = comp or (s ->> 'home') = 'الكل' or coalesce(s -> 'shared', '[]'::jsonb) @> to_jsonb(comp);
    select coalesce(sum(_mf_num(f -> 'pilgrims') * (select count(*) from jsonb_array_elements(case when jsonb_typeof(f -> 'sups') = 'array' then f -> 'sups' else '[]'::jsonb end) x where _w_str(x -> 'name') = s ->> 'name')), 0)
      into ld from jsonb_array_elements(files) f
     where (ex = '' or f ->> 'id' <> ex) and (go = '' or _mf_str(f -> 'goDate') = go) and (ret = '' or _mf_str(f -> 'retDate') = ret);
    select _mf_ms(_mf_str(f -> 'retDate')), f ->> 'retDate' into bms, bdate from jsonb_array_elements(files) f
     where exists (select 1 from jsonb_array_elements(case when jsonb_typeof(f -> 'sups') = 'array' then f -> 'sups' else '[]'::jsonb end) x where _w_str(x -> 'name') = s ->> 'name')
       and _mf_ms(_mf_str(f -> 'retDate')) is not null
     order by _mf_ms(_mf_str(f -> 'retDate')) desc limit 1;
    ok := false; why := '';
    if comp = '' then why := 'اختر الشركة أولاً';
    elsif not allowed then why := 'غير مسجّل بالشركة ولا مُشارَك فيها';
    elsif position('مرافق' in s ->> 'type') > 0 and (ld + cnt) > 50 then why := 'عبؤه الحالي ' || _mf_n2t(ld) || ' + ' || _mf_n2t(cnt) || ' يتجاوز الحد الأقصى 50 معتمر';
    elsif position('استقبال' in s ->> 'type') > 0 and bms is not null and go <> '' and _mf_ms(go) < bms then why := 'لم يعد بعد من رحلته الحالية (عودته ' || bdate || ')';
    else ok := true;
      why := case when (s ->> 'home') = comp then 'مسجّل بالشركة' when (s ->> 'home') = 'الكل' then 'متاح لكل الشركات' else 'مُشارَك في الشركة' end ||
             case when position('مرافق' in s ->> 'type') > 0 then ' · متاح له ' || _mf_n2t(greatest(0, 50 - ld)) || ' معتمر' else ' · بدون رسوم غرفة ولا مخالصة' end;
    end if;
    if ok or showall then out_ := out_ || jsonb_build_array(jsonb_build_object('name', s ->> 'name', 'type', s ->> 'type', 'home', s ->> 'home', 'shared', s -> 'shared', 'load', ld,
      'eligible', ok, 'reason', why, 'busyTo', coalesce(case when bms is not null then bdate end, ''))); end if;
    bms := null; bdate := null;
  end loop;
  return jsonb_build_object('success', true, 'list', out_); end $$;

-- ===== إيصالات رسوم الغرفة =====
create or replace function rw2_saveroomfeereceipt(a jsonb, u text) returns jsonb language plpgsql volatile set search_path = public as
$$ declare r jsonb := coalesce(a -> 1, '{}'::jsonb); who text := coalesce(u, app_user(), '-'); no_ text := _w_str(r -> 'receiptNo'); comp text := _w_str(r -> 'company');
  amt float8 := coalesce(_mf_num(r -> 'amount'), 0); dup jsonb; row_ jsonb; rid_ text; begin
  perform _x_perm('ministry.add', 'لا تملك صلاحية الإضافة بمراجعة ملفات الوزارة');
  if no_ = '' then return jsonb_build_object('success', false, 'error', 'رقم الإيصال مطلوب'); end if;
  if comp = '' then return jsonb_build_object('success', false, 'error', 'اسم الشركة مطلوب'); end if;
  if amt <= 0 then return jsonb_build_object('success', false, 'error', 'المبلغ يجب أن يكون أكبر من صفر'); end if;
  perform _x_lock('mf_receipts');
  select x into dup from jsonb_array_elements(_mf_receipts()) x where x ->> 'receiptNo' = no_ limit 1;
  row_ := jsonb_build_array(no_, coalesce(nullif(_mf_datet(r ->> 'date'), ''), _mf_today()), _w_str(r -> 'time'), comp, _w_str(r -> 'licence'), amt, _w_str(r -> 'depositor'),
            coalesce(nullif(_w_str(r -> 'source'), ''), 'يدوي'), _w_str(r -> 'notes'), who, _w_stamp());
  if dup is not null then
    if not coalesce((r ->> '_allowUpdate')::boolean, false) then return jsonb_build_object('success', false, 'error', 'رقم الإيصال ' || no_ || ' مسجَّل من قبل لشركة ' || (dup ->> 'company')); end if;
    select rid into rid_ from store_rows where tbl = 'mf_receipts' and _mf_str(_rx_c(raw, 0)) = no_ order by ord limit 1;
    update store_rows set raw = row_ where tbl = 'mf_receipts' and rid = rid_;
    perform _x_aud(who, 'تعديل إيصال رسوم غرفة', no_, 'المبلغ', dup ->> 'amount', _mf_n2t(amt));
  else
    perform _x_append('mf_receipts', row_);
    perform _x_aud(who, 'تسجيل إيصال رسوم غرفة', no_, comp, '-', _mf_n2t(amt) || ' ج');
  end if;
  perform _x_bump('mf_receipts'); perform _w_dv_bump(array['ministry']);
  return jsonb_build_object('success', true); end $$;

create or replace function rw2_deleteroomfeereceipt(a jsonb, u text) returns jsonb language plpgsql volatile set search_path = public as
$$ declare who text := coalesce(u, app_user(), '-'); no_ text := _w_str(a -> 1); hit jsonb; rid_ text; begin
  perform _x_perm('ministry.delete', 'لا تملك صلاحية الحذف من مراجعة ملفات الوزارة');
  perform _x_lock('mf_receipts');
  select x into hit from jsonb_array_elements(_mf_receipts()) x where x ->> 'receiptNo' = no_ limit 1;
  if hit is null then return jsonb_build_object('success', false, 'error', 'الإيصال غير موجود'); end if;
  select rid into rid_ from store_rows where tbl = 'mf_receipts' and _mf_str(_rx_c(raw, 0)) = no_ order by ord limit 1;
  perform _rb_on('receipt', 'إيصال رسوم غرفة ' || no_, hit ->> 'company', who);
  delete from store_rows where tbl = 'mf_receipts' and rid = rid_;
  perform _x_aud(who, 'حذف إيصال رسوم غرفة', no_, hit ->> 'company', hit ->> 'amount', '-');
  perform _x_bump('mf_receipts'); perform _w_dv_bump(array['ministry']);
  return jsonb_build_object('success', true); end $$;

-- = getRoomFeeLedger: حركات الإيداع (الإيصالات) والسحب (الملفات المراجَعة) برصيد جارٍ لكل شركة
create or replace function rx2_getroomfeeledger(a jsonb, u text) returns jsonb language plpgsql stable set search_path = public as
$$ declare comp text := _w_str(a -> 1); core jsonb := _mf_core(); mv jsonb; begin
  perform _x_perm('ministry.view', 'لا تملك صلاحية عرض مراجعة ملفات الوزارة');
  with m as (
    select x ->> 'date' d, _mf_ms(x ->> 'date') ms, x ->> 'company' c, 'إيداع إيصال رقم ' || (x ->> 'receiptNo') || case when coalesce(x ->> 'depositor', '') <> '' then ' — ' || (x ->> 'depositor') else '' end ds,
           null::text dt, (x ->> 'amount')::float8 inn, 0::float8 outv, 0 k, o
      from jsonb_array_elements(_mf_receipts()) with ordinality t(x, o)
    union all
    select f ->> 'reviewDate', _mf_ms(f ->> 'reviewDate'), f ->> 'company',
           'سحب رسوم غرفة — ملف رقم ' || coalesce(nullif(f ->> 'fileNo', ''), '—') || case when coalesce(f ->> 'clientLabel', '') <> '' then ' (' || (f ->> 'clientLabel') || ')' else '' end,
           _mf_fee_detail(f), 0, coalesce((f -> 'calc' ->> 'totalRoomFee')::float8, 0), 1, o
      from jsonb_array_elements(coalesce(core -> 'files', '[]'::jsonb)) with ordinality t(f, o) where _mf_str(f -> 'reviewDate') <> ''),
  f as (select * from m where comp = '' or comp = 'الكل' or c = comp),
  r as (select *, sum(inn - outv) over (partition by c order by coalesce(ms, 0), k, o rows unbounded preceding) bal from f)
  select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object('date', d, 'ms', ms, 'company', c, 'desc', ds, 'detail', dt, 'inn', inn, 'out', outv, 'balance', bal)) order by coalesce(ms, 0), k, o), '[]'::jsonb) into mv from r;
  return jsonb_build_object('success', true, 'moves', mv); end $$;
create or replace function _mf_fee_detail(f jsonb) returns text language plpgsql immutable as
$$ declare c jsonb := f -> 'calc'; n float8 := coalesce(_mf_num(f -> 'pilgrims'), 0); p text[] := '{}'; x jsonb; begin
  if n > 0 then p := p || (_mf_n2t(n) || ' × ' || _x_fmt0((c ->> 'roomFeeEffective')::float8) || ' ج' ||
       case when f ->> 'reviewType' = 'VIP' then ' (سعر VIP)' when coalesce((c ->> 'vipByCount')::boolean, false) then ' (سعر VIP — أقل من 4 أفراد)' else '' end); end if;
  if coalesce((c ->> 'murafiqFee')::float8, 0) > 0 then p := p || (_mf_n2t((c ->> 'murafiqFee')::float8) || ' مشرف × ' || _x_fmt0((c ->> 'supRoomFee')::float8) || ' ج'); end if;
  for x in select * from jsonb_array_elements(coalesce(c -> 'supExempt', '[]'::jsonb)) loop
    p := p || ('المرافق ' || (x ->> 'name') || ' محسوب بملف ' || coalesce(nullif(x ->> 'fileNo', ''), '#' || (x ->> 'seq'))); end loop;
  for x in select * from jsonb_array_elements(coalesce(c -> 'supElsewhere', '[]'::jsonb)) loop
    p := p || ('المرافق ' || (x ->> 'name') || ' (عدد ورسوم) محسوب بملف ' || coalesce(nullif(x ->> 'fileNo', ''), case when coalesce(x ->> 'seq', '') <> '' then '#' || (x ->> 'seq') else 'آخر' end)); end loop;
  if coalesce((c ->> 'barcodeFee')::float8, 0) > 0 then p := p || (_mf_n2t(n) || ' باركود × ' || _x_fmt0((c ->> 'barcodeFee')::float8 / greatest(n, 1)) || ' ج'); end if;
  return array_to_string(p, ' + '); end $$;

-- ===== ترحيل حصص «فردي» =====
create or replace function rw2_savemfquotatransfer(a jsonb, u text) returns jsonb language plpgsql volatile set search_path = public as
$$ declare d jsonb := coalesce(a -> 1, '{}'::jsonb); who text := coalesce(u, app_user(), '-'); comp text := _w_str(d -> 'company'); fm text := _mf_qt_month(d -> 'fromMonth'); tm text := _mf_qt_month(d -> 'toMonth');
  amt float8 := coalesce(_mf_num(d -> 'amount'), 0); outsum float8; id_ text; begin
  perform _x_perm('ministry.edit', 'لا تملك صلاحية تعديل مراجعة ملفات الوزارة');
  if comp = '' then return jsonb_build_object('success', false, 'error', 'اختر الشركة'); end if;
  if fm !~ '^\d{4}-\d{2}$' or tm !~ '^\d{4}-\d{2}$' then return jsonb_build_object('success', false, 'error', 'حدِّد الشهرين بصيغة صحيحة'); end if;
  if fm = tm then return jsonb_build_object('success', false, 'error', 'لا يمكن ترحيل حصة لنفس الشهر'); end if;
  if amt <= 0 then return jsonb_build_object('success', false, 'error', 'أدخل عدداً صحيحاً أكبر من صفر'); end if;
  perform _x_lock('mf_quota_transfers');
  select coalesce(sum((x ->> 'amount')::float8), 0) into outsum from jsonb_array_elements(_mf_quota_transfers()) x where x ->> 'company' = comp and x ->> 'fromMonth' = fm;
  if outsum + amt > 36 then return jsonb_build_object('success', false, 'error', 'لا يمكن ترحيل أكثر من إجمالي حصة الشهر المرحَّل منه (36 فرد) — المتبقي القابل للترحيل من ' || fm || ': ' || _mf_n2t(36 - outsum) || ' فرد'); end if;
  id_ := _x_id('MFQT');
  perform _x_append('mf_quota_transfers', jsonb_build_array(id_, comp, fm, tm, amt, _w_str(d -> 'notes'), who, _w_stamp()));
  perform _x_bump('mf_quota_transfers'); perform _w_dv_bump(array['ministry']);
  perform _x_aud(who, 'ترحيل حصة أفراد شهرية', comp, 'الترحيل', '-', fm || ' → ' || tm || ' (' || _mf_n2t(amt) || ' فرد)');
  return jsonb_build_object('success', true, 'id', id_); end $$;
create or replace function rw2_deletemfquotatransfer(a jsonb, u text) returns jsonb language plpgsql volatile set search_path = public as
$$ declare who text := coalesce(u, app_user(), '-'); id_ text := _w_str(a -> 1); hit jsonb; begin
  perform _x_perm('ministry.edit', 'لا تملك صلاحية تعديل مراجعة ملفات الوزارة');
  perform _x_lock('mf_quota_transfers');
  select x into hit from jsonb_array_elements(_mf_quota_transfers()) x where x ->> 'id' = id_ limit 1;
  if hit is null then return jsonb_build_object('success', false, 'error', 'سجل الترحيل غير موجود'); end if;
  perform _rb_on('quota', 'ترحيل حصة وزارة ' || (hit ->> 'company'), (hit ->> 'fromMonth') || ' → ' || (hit ->> 'toMonth'), who);
  delete from store_rows where tbl = 'mf_quota_transfers' and _mf_str(_rx_c(raw, 0)) = id_;
  perform _x_bump('mf_quota_transfers'); perform _w_dv_bump(array['ministry']);
  perform _x_aud(who, 'حذف ترحيل حصة أفراد شهرية', hit ->> 'company', 'الترحيل', (hit ->> 'fromMonth') || ' → ' || (hit ->> 'toMonth') || ' (' || (hit ->> 'amount') || ' فرد)', '-');
  return jsonb_build_object('success', true); end $$;

create or replace function rx2_getmfindividualquotastats(a jsonb, u text) returns jsonb language plpgsql stable set search_path = public as
$$ declare mk text := coalesce(nullif(_w_str(a -> 1), ''), _mf_month_key(_mf_today())); files jsonb; tr jsonb := _mf_quota_transfers(); res jsonb; begin
  perform _x_perm('ministry.view', 'لا تملك صلاحية عرض مراجعة ملفات الوزارة');
  select coalesce(jsonb_agg(f), '[]'::jsonb) into files from _mf_files_raw(_sx_exec_policy()) where f ->> 'fileType' = 'فردي' and _mf_month_key(f ->> 'goDate') = mk;
  with fc as (select coalesce(nullif(f ->> 'company', ''), '—') c, f from jsonb_array_elements(files) f),
       cl as (select c, nm, sum(n) n from (
                select c, coalesce(nullif(_w_str(b -> 'name'), ''), coalesce(nullif(f ->> 'clientLabel', ''), 'غير محدد')) nm, coalesce(_mf_num(b -> 'count'), 0) n
                  from fc, jsonb_array_elements(f -> 'breakdown') b where jsonb_typeof(f -> 'breakdown') = 'array' and jsonb_array_length(f -> 'breakdown') > 0
                union all select c, coalesce(nullif(f ->> 'clientLabel', ''), 'غير محدد'), coalesce(_mf_num(f -> 'pilgrims'), 0)
                  from fc where not (jsonb_typeof(f -> 'breakdown') = 'array' and jsonb_array_length(f -> 'breakdown') > 0)) z group by c, nm),
       g as (select c, sum(coalesce(_mf_num(f -> 'pilgrims'), 0)) p, count(*) n from fc group by c),
       comps as (select c from g union select x ->> 'company' from jsonb_array_elements(tr) x where x ->> 'fromMonth' = mk or x ->> 'toMonth' = mk),
       t as (select c, coalesce((select sum((x ->> 'amount')::float8) from jsonb_array_elements(tr) x where x ->> 'company' = c and x ->> 'fromMonth' = mk), 0) tout,
                    coalesce((select sum((x ->> 'amount')::float8) from jsonb_array_elements(tr) x where x ->> 'company' = c and x ->> 'toMonth' = mk), 0) tin from comps)
  select coalesce(jsonb_agg(o order by (o ->> 'pilgrims')::float8 desc), '[]'::jsonb) into res from (
    select jsonb_build_object('company', t.c, 'pilgrims', coalesce(g.p, 0), 'files', coalesce(g.n, 0),
      'clients', coalesce((select jsonb_agg(jsonb_build_object('name', nm, 'count', n)) from cl where cl.c = t.c), '[]'::jsonb),
      'limit', 36 - t.tout + t.tin, 'transferOut', t.tout, 'transferIn', t.tin,
      'transfersOut', coalesce((select jsonb_agg(x) from jsonb_array_elements(tr) x where x ->> 'company' = t.c and x ->> 'fromMonth' = mk), '[]'::jsonb),
      'transfersIn', coalesce((select jsonb_agg(x) from jsonb_array_elements(tr) x where x ->> 'company' = t.c and x ->> 'toMonth' = mk), '[]'::jsonb),
      'nearLimit', coalesce(g.p, 0) >= (36 - t.tout + t.tin - 5)) o from t left join g on g.c = t.c) z;
  return jsonb_build_object('success', true, 'monthKey', mk, 'monthlyLimit', 36, 'perFileLimit', 9, 'companies', res); end $$;

create or replace function rx2_getmfindividualfilecandidates(a jsonb, u text) returns jsonb language plpgsql stable set search_path = public as
$$ declare res jsonb; nos text[] := array[_w_norm('الوكيل السعودي'), _w_norm('بدون مشرف')]; begin
  perform _x_perm('ministry.view', 'لا تملك صلاحية عرض مراجعة ملفات الوزارة');
  select coalesce(jsonb_agg(jsonb_build_object('id', f ->> 'id', 'fileNo', f ->> 'fileNo', 'company', f ->> 'company', 'agent', f ->> 'agent', 'clientLabel', f ->> 'clientLabel',
      'pilgrims', _mf_num(f -> 'pilgrims'), 'tripName', f ->> 'tripName', 'goDate', f ->> 'goDate', 'retDate', f ->> 'retDate',
      'supNames', coalesce(nullif((select string_agg(_w_str(s -> 'name'), '، ') from jsonb_array_elements(case when jsonb_typeof(f -> 'sups') = 'array' then f -> 'sups' else '[]'::jsonb end) s where _w_str(s -> 'name') <> ''), ''), 'بدون مشرف'),
      'approved', coalesce((f ->> 'approved')::boolean, false), 'ref', f ->> 'ref') order by rn), '[]'::jsonb) into res
    from _mf_files_raw(_sx_exec_policy())
   where coalesce(f ->> 'fileType', '') <> 'فردي' and coalesce(_mf_num(f -> 'pilgrims'), 0) between 1 and 9
     and not exists (select 1 from jsonb_array_elements(case when jsonb_typeof(f -> 'sups') = 'array' then f -> 'sups' else '[]'::jsonb end) s
                      where _w_str(s -> 'name') <> '' and _w_norm(_w_str(s -> 'name')) <> _w_norm(coalesce(f ->> 'agent', '')) and not (_w_norm(_w_str(s -> 'name')) = any (nos)));
  return jsonb_build_object('success', true, 'candidates', res); end $$;

-- = getMfHousingForSelectedPilgrims: مستويات (فندق × تسكين) للمعتمرين المختارين + سعر المستوى من تسعير الرحلة
create or replace function rx2_getmfhousingforselectedpilgrims(a jsonb, u text) returns jsonb language plpgsql stable set search_path = public as
$$ declare trip text := _w_str(a -> 1); keys jsonb := case when jsonb_typeof(a -> 2) = 'array' then a -> 2 else '[]'::jsonb end; ix jsonb := _pm_ix(); pr jsonb := _ae_trip_pricing(_w_str(a -> 1)); res jsonb; begin
  perform _x_perm('ministry.view', 'لا تملك صلاحية عرض مراجعة ملفات الوزارة');
  if trip = '' or jsonb_array_length(keys) = 0 then return jsonb_build_object('success', true, 'levels', '[]'::jsonb); end if;
  with p as (select rn, _rx_trim(_rx_s(_rx_c(raw, (ix ->> 'passport')::int))) ps, _rx_trim(_rx_s(_rx_c(raw, (ix ->> 'type')::int))) ty,
                    _rx_trim(_rx_s(_rx_c(raw, (ix ->> 'accommodation')::int))) ac, _rx_trim(_rx_s(_rx_c(raw, (ix ->> 'hotelMakkah')::int))) mk, _rx_trim(_rx_s(_rx_c(raw, (ix ->> 'hotelMadinah')::int))) md
               from _rx_rows('pilgrims') where _rx_trim(_rx_s(_rx_c(raw, (ix ->> 'tripName')::int))) = trip),
       q as (select *, coalesce(nullif(ps, ''), 'idx:' || (row_number() over (order by rn) - 1)) k from p),
       s as (select coalesce(nullif(mk, ''), md) h, case when ac = any (array['رباعي', 'خماسي', 'سداسي', 'رباعي أسرة', 'خماسي أسرة']) or ac = '' then 'عادي' else ac end lv, mk, md, rn
               from q where keys ? k and ty <> 'رضيع'),
       g as (select h, lv, count(*) n, min(rn) f, (array_agg(md order by rn))[1] md, (array_agg(mk order by rn))[1] mk from s group by h, lv)
  select coalesce(jsonb_agg(jsonb_build_object('key', h || '|' || lv, 'label', case when h <> '' then h || ' ' else '' end || lv, 'count', n, 'madinahHotel', md, 'makkahHotel', mk,
      'price', coalesce(_ac_num(pr -> 'hotels' -> h -> lv), 0)) order by f), '[]'::jsonb) into res from g;
  return jsonb_build_object('success', true, 'levels', res); end $$;

-- ===== الملفات: اعتماد · نوع جماعي · حذف جماعي · استيراد · تعديل جماعي =====
create or replace function rw2_setministryfileapproved(a jsonb, u text) returns jsonb language plpgsql volatile set search_path = public as
$$ declare who text := coalesce(u, app_user(), '-'); id_ text := _w_str(a -> 1); ap boolean := coalesce((a ->> 2)::boolean, false); rid_ text; raw_ jsonb; was boolean; ref_ text; fno text; begin
  perform _x_perm('ministry.edit', 'لا تملك صلاحية تعديل مراجعة ملفات الوزارة');
  perform _x_lock('mf_files');
  select rid, raw into rid_, raw_ from store_rows where tbl = 'mf_files' and _mf_str(_rx_c(raw, 0)) = id_ order by ord limit 1;
  if rid_ is null then return jsonb_build_object('success', false, 'error', 'الملف غير موجود'); end if;
  was := _mf_str(_rx_c(raw_, 3)) = 'نعم'; ref_ := _mf_str(_rx_c(raw_, 5)); fno := _mf_str(_rx_c(raw_, 2));
  if ap and ref_ = '' and not was and not app_has('ministry.approve') then return jsonb_build_object('success', false, 'error', 'لا تملك صلاحية اعتماد ملفات مراجعة الوزارة'); end if;
  if was = ap then return jsonb_build_object('success', true, 'approved', ap, 'unchanged', true); end if;
  update store_rows set raw = jsonb_set(jsonb_set(jsonb_set(_x_pad(raw_, 39), '{3}', to_jsonb(case when ap then 'نعم' else 'لا' end)), '{37}', to_jsonb(who)), '{38}', to_jsonb(_w_stamp()))
   where tbl = 'mf_files' and rid = rid_;
  perform _x_bump('mf_files'); perform _w_dv_bump(array['ministry', 'trips']);
  perform _x_aud(who, case when ap then 'اعتماد ملف مراجعة' else 'إلغاء اعتماد ملف مراجعة' end, 'MF:' || id_, 'معتمد' || case when fno <> '' then ' — ملف ' || fno else '' end,
    case when was then 'نعم' else 'لا' end, case when ap then 'نعم' else 'لا' end);
  return jsonb_build_object('success', true, 'approved', ap); end $$;

create or replace function rw2_bulksetmffiletype(a jsonb, u text) returns jsonb language plpgsql volatile set search_path = public as
$$ declare who text := coalesce(u, app_user(), '-'); ft text := case when _w_str(a -> 2) = 'فردي' then 'فردي' else 'مجموعات' end; ids text[]; r record; n int := 0; core jsonb; begin
  perform _x_perm('ministry.edit', 'لا تملك صلاحية تعديل مراجعة ملفات الوزارة');
  select coalesce(array_agg(_w_str(x)) filter (where _w_str(x) <> ''), '{}') into ids from jsonb_array_elements(case when jsonb_typeof(a -> 1) = 'array' then a -> 1 else '[]'::jsonb end) x;
  if coalesce(array_length(ids, 1), 0) = 0 then return jsonb_build_object('success', false, 'error', 'لم يُحدَّد أي ملف'); end if;
  perform _x_lock('mf_files');
  for r in select rid, raw from store_rows where tbl = 'mf_files' and _mf_str(_rx_c(raw, 0)) = any (ids) loop
    if _mf_str(_rx_c(r.raw, 39)) = ft then continue; end if;
    update store_rows set raw = jsonb_set(jsonb_set(jsonb_set(_x_pad(r.raw, 40), '{39}', to_jsonb(ft)), '{37}', to_jsonb(who)), '{38}', to_jsonb(_w_stamp()))
     where tbl = 'mf_files' and rid = r.rid;
    perform _x_aud(who, 'تعديل مجمَّع لنوع الملف', 'MF:' || _mf_str(_rx_c(r.raw, 0)), 'نوع الملف', coalesce(nullif(_mf_str(_rx_c(r.raw, 39)), ''), '-'), ft);
    n := n + 1;
  end loop;
  if n > 0 then perform _x_bump('mf_files'); perform _w_dv_bump(array['ministry', 'trips']); end if;
  core := _mf_core();
  return jsonb_build_object('success', true, 'balances', core -> 'balances',
    'files', coalesce((select jsonb_agg(f) from jsonb_array_elements(core -> 'files') f where f ->> 'id' = any (ids)), '[]'::jsonb)); end $$;

create or replace function rw2_deleteministryfilesbatch(a jsonb, u text) returns jsonb language plpgsql volatile set search_path = public as
$$ declare who text := coalesce(u, app_user(), '-'); ids text[]; r record; gone text[] := '{}'; begin
  perform _x_perm('ministry.delete', 'لا تملك صلاحية الحذف من مراجعة ملفات الوزارة');
  select coalesce(array_agg(_w_str(x)) filter (where _w_str(x) <> ''), '{}') into ids from jsonb_array_elements(case when jsonb_typeof(a -> 1) = 'array' then a -> 1 else '[]'::jsonb end) x;
  if coalesce(array_length(ids, 1), 0) = 0 then return jsonb_build_object('success', false, 'error', 'لم تُحدَّد أي ملفات'); end if;
  perform _x_lock('mf_files');
  perform _rb_on('ministry_file', 'حذف جماعي لـ ' || array_length(ids, 1) || ' ملف وزارة', '', who);
  for r in select raw from store_rows where tbl = 'mf_files' and _mf_str(_rx_c(raw, 0)) = any (ids) loop
    perform _x_aud(who, 'حذف ملف مراجعة وزارة (جماعي)', 'MF:' || _mf_str(_rx_c(r.raw, 0)), '-',
      case when _mf_str(_rx_c(r.raw, 2)) <> '' then 'ملف رقم ' || _mf_str(_rx_c(r.raw, 2)) else 'بدون رقم' end || ' — ' || _mf_str(_rx_c(r.raw, 12)), '-');
    gone := gone || _mf_str(_rx_c(r.raw, 0));
  end loop;
  delete from store_rows where tbl = 'mf_files' and _mf_str(_rx_c(raw, 0)) = any (ids);
  perform _x_bump('mf_files'); perform _w_dv_bump(array['ministry', 'trips']);
  return jsonb_build_object('success', true, 'count', coalesce(array_length(gone, 1), 0), 'removedIds', to_jsonb(gone)); end $$;

create or replace function rw2_importministryfilesbatch(a jsonb, u text) returns jsonb language plpgsql volatile set search_path = public as
$$ declare who text := coalesce(u, app_user(), '-'); r jsonb; ex jsonb := '{}'::jsonb; sig text; skipped int := 0; nos text[] := '{}'; n int := 0; seq float8; f jsonb; p float8; sc float8; cl text; pct float8; st text := _w_stamp(); begin
  perform _x_admin();
  if jsonb_array_length(coalesce(a -> 1, '[]'::jsonb)) = 0 then return jsonb_build_object('success', false, 'error', 'لا توجد صفوف صالحة للاستيراد'); end if;
  perform _x_lock('mf_files');
  select coalesce(jsonb_object_agg(k, 1), '{}'::jsonb) into ex from (
    select case when _mf_str(q.f -> 'fileNo') <> '' then 'F|' || _mf_str(q.f -> 'fileNo') else 'C|' || _mf_str(q.f -> 'company') || '|' || _mf_str(q.f -> 'goDate') || '|' || _mf_n2t(_mf_num(q.f -> 'pilgrims')) || '|' || _mf_n2t(_mf_num(q.f -> 'progPrice')) end k
      from _mf_files_raw(_sx_exec_policy()) q) z;
  select coalesce(max(_mf_num(_rx_c(raw, 1))), 0) into seq from store_rows where tbl = 'mf_files';
  for r in select * from jsonb_array_elements(a -> 1) loop
    sig := case when _w_str(r -> 'fileNo') <> '' then 'F|' || _w_str(r -> 'fileNo') else 'C|' || _w_str(r -> 'company') || '|' || _mf_datet(r ->> 'goDate') || '|' || _mf_n2t(coalesce(_mf_num(r -> 'pilgrims'), 0)) || '|' || _mf_n2t(coalesce(_mf_num(r -> 'progPrice'), 0)) end;
    if ex ? sig then skipped := skipped + 1; if array_length(nos, 1) is null or array_length(nos, 1) < 25 then if _w_str(r -> 'fileNo') <> '' then nos := nos || _w_str(r -> 'fileNo'); end if; end if; continue; end if;
    ex := ex || jsonb_build_object(sig, 1);
    p := coalesce(_mf_num(r -> 'pilgrims'), 0); sc := coalesce(_mf_num(r -> 'supCount'), 0);
    cl := coalesce(nullif(_w_str(r -> 'clientLabel'), ''), 'مستورد — ملف ' || _w_str(r -> 'fileNo'));
    pct := coalesce(_mf_num(r -> 'pct'), 0); if pct <> 0 and pct < 1 then pct := pct * 100; end if;
    seq := seq + 1;
    f := jsonb_build_object('id', _x_id('MF'), 'seq', seq, 'fileNo', _w_str(r -> 'fileNo'), 'approved', coalesce((r ->> 'approved')::boolean, false), 'eInvoice', _w_str(r -> 'eInvoice'), 'ref', _w_str(r -> 'ref'),
      'company', _w_str(r -> 'company'), 'agent', _w_str(r -> 'agent'), 'reviewDate', _mf_datet(r ->> 'reviewDate'), 'reviewType', 'عادية', 'vipReason', '',
      'travelMode', coalesce(nullif(_w_str(r -> 'travelMode'), ''), 'طيران'), 'clientLabel', cl,
      'breakdown', case when p <> 0 then jsonb_build_array(jsonb_build_object('name', cl, 'count', p, 'sups', sc, 'note', 'مستورد من إكسيل — يحتاج ربط يدوي بالرحلة')) else '[]'::jsonb end,
      'tripName', '', 'goDate', _mf_datet(r ->> 'goDate'), 'retDate', _mf_datet(r ->> 'retDate'), 'pilgrims', p, 'supCount', sc,
      'sups', case when _w_str(r -> 'supName') <> '' then jsonb_build_array(jsonb_build_object('name', _w_str(r -> 'supName'), 'type', 'مرافق', 'directTo', '')) else '[]'::jsonb end,
      'progPrice', coalesce(_mf_num(r -> 'progPrice'), 0), 'ticket', coalesce(_mf_num(r -> 'ticket'), 0), 'roomFee', coalesce(_mf_num(r -> 'roomFee'), 0),
      'adminFee', coalesce(_mf_num(r -> 'adminFee'), 0), 'pct', pct, 'fxRate', coalesce(_mf_num(r -> 'fxRate'), 0),
      'madinahHotel', _w_str(r -> 'madinahHotel'), 'madinahIn', _mf_datet(r ->> 'madinahIn'), 'madinahOut', _mf_datet(r ->> 'madinahOut'),
      'makkahHotel', _w_str(r -> 'makkahHotel'), 'makkahIn', _mf_datet(r ->> 'makkahIn'), 'makkahOut', _mf_datet(r ->> 'makkahOut'),
      'transport', _w_str(r -> 'transport'), 'notes', case when _w_str(r -> 'notes') <> '' then _w_str(r -> 'notes') || ' — ' else '' end || '📤 مستورد من إكسيل قديم — بحاجة لربط يدوي بالرحلة',
      'selected', '[]'::jsonb, 'createdBy', who, 'createdAt', st, 'updatedBy', who, 'updatedAt', st, 'fileType', '', 'extraTrips', '', 'execFeeOverride', '', 'manualType', false);
    perform _x_append('mf_files', _w_mf_raw(f)); n := n + 1;
  end loop;
  if n > 0 then perform _x_bump('mf_files'); perform _w_dv_bump(array['ministry', 'trips']); end if;
  perform _x_aud(who, 'استيراد ملفات مراجعة من إكسيل', '-', 'عدد الصفوف', '-', n::text || case when skipped > 0 then ' (تُخطّي ' || skipped || ' مكرَّر)' else '' end);
  return jsonb_build_object('success', true, 'imported', n, 'skipped', skipped, 'skippedNos', to_jsonb(nos)); end $$;

-- = saveMinistryFilesBulk: لكل ملف ⇒ rw2_saveministryfile نفسه (كل التحقق والآثار) بعد دمج الحقول المسموحة فوق قيمته الحالية
create or replace function rw2_saveministryfilesbulk(a jsonb, u text) returns jsonb language plpgsql volatile set search_path = public as
$$ declare it jsonb; id_ text; cur jsonb; d jsonb; k text; res jsonb; out_ jsonb := '[]'::jsonb; ok int := 0; tr text[] := '{}'; t text; known jsonb := _mf_trip_names();
  editable text[] := array['fileNo','ref','company','agent','reviewDate','notes','tripName','extraTrips','selected','breakdown','pilgrims','clientLabel']; begin
  perform _x_perm('ministry.edit', 'لا تملك صلاحية تعديل مراجعة ملفات الوزارة');
  for it in select * from jsonb_array_elements(case when jsonb_typeof(a -> 1) = 'array' then a -> 1 else '[]'::jsonb end) loop
    id_ := _w_str(it -> 'id'); if id_ = '' then continue; end if;
    begin
      select f into cur from _mf_files_raw(_sx_exec_policy()) where f ->> 'id' = id_ limit 1;
      if cur is null then raise exception 'الملف غير موجود'; end if;
      if it ? 'selected' and jsonb_typeof(it -> 'selected') <> 'array' then raise exception 'قائمة المعتمرين غير صالحة'; end if;
      if it ? 'breakdown' and jsonb_typeof(it -> 'breakdown') <> 'array' then raise exception 'بنود العميل غير صالحة'; end if;
      d := cur;
      foreach k in array editable loop if it ? k then d := jsonb_set(d, array[k], it -> k); end if; end loop;
      if it ? 'selected' then d := jsonb_set(d, '{selected}', coalesce((select jsonb_agg(_w_str(x)) from jsonb_array_elements(it -> 'selected') x where _w_str(x) <> ''), '[]'::jsonb)); end if;
      d := d || jsonb_build_object('_manualType', coalesce((cur ->> 'manualType')::boolean, false));
      res := rw2_saveministryfile(jsonb_build_array(null, d), u);
      if not coalesce((res ->> 'success')::boolean, false) then raise exception '%', coalesce(res ->> 'error', 'فشل الحفظ'); end if;
      ok := ok + 1;
      out_ := out_ || jsonb_build_array(jsonb_build_object('id', id_, 'success', true, 'file', res -> 'file', 'balances', res -> 'balances', 'others', res -> 'others', 'syncTrips', res -> 'syncTrips'));
      foreach t in array _mf_trips_of(res -> 'file' ->> 'tripName', res -> 'file' ->> 'extraTrips', known) loop if not (t = any (tr)) then tr := tr || t; end if; end loop;
    exception when others then out_ := out_ || jsonb_build_array(jsonb_build_object('id', id_, 'success', false, 'error', sqlerrm)); end;
  end loop;
  return jsonb_build_object('success', true, 'done', ok, 'total', jsonb_array_length(coalesce(a -> 1, '[]'::jsonb)), 'results', out_)
    || case when ok > 0 or array_length(tr, 1) > 0 then jsonb_build_object('lfAfter', jsonb_build_object('fn', 'mfAfterSaveBg', 'args', jsonb_build_array(null, jsonb_build_object('trips', to_jsonb(tr), 'bal', ok > 0)))) else '{}'::jsonb end; end $$;

-- = saveMfExecPolicy (للمدير): سياسة رسوم التنفيذ ⇒ app_kv + خاصية Apps Script
create or replace function rw2_savemfexecpolicy(a jsonb, u text) returns jsonb language plpgsql volatile set search_path = public as
$$ declare who text := coalesce(u, app_user(), '-'); p jsonb; clean jsonb := '[]'::jsonb; nm text; fr text; begin
  perform _x_admin();
  for p in select * from jsonb_array_elements(case when jsonb_typeof(a -> 1) = 'array' then a -> 1 else '[]'::jsonb end) loop
    nm := _w_str(p -> 'name'); fr := _mf_datet(p ->> 'from');
    if nm = '' or fr !~ '^\d{1,2}/\d{1,2}/\d{4}$' then continue; end if;
    clean := clean || jsonb_build_array(jsonb_build_object('kind', case when p ->> 'kind' = 'client' then 'client' else 'company' end, 'name', nm, 'from', fr));
  end loop;
  perform _x_kv('MF_EXEC_POLICY', clean::text);
  perform _w_dv_bump(array['ministry']);
  perform _x_aud(who, 'تعديل سياسة رسوم التنفيذ', '-', 'MF_EXEC_POLICY', '-', jsonb_array_length(clean) || ' جهة');
  return jsonb_build_object('success', true, 'policy', clean); end $$;

do $$ declare r record; begin
  for r in select p.oid::regprocedure::text sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and (p.proname like '\_x\_%' or p.proname in ('_mf_qt_month', '_mf_quota_transfers', '_mf_core', '_mf_month_key', '_mf_sup_row', '_mf_fee_detail',
              'rw2_saveministrysupervisor', 'rw2_bulksaveministrysupervisors', 'rw2_bulkshareministrysupervisors', 'rw2_deleteministrysupervisor', 'rx2_getministrysupervisorsonly',
              'rx2_suggestministrysupervisors', 'rw2_saveroomfeereceipt', 'rw2_deleteroomfeereceipt', 'rx2_getroomfeeledger', 'rw2_savemfquotatransfer', 'rw2_deletemfquotatransfer',
              'rx2_getmfindividualquotastats', 'rx2_getmfindividualfilecandidates', 'rx2_getmfhousingforselectedpilgrims', 'rw2_setministryfileapproved', 'rw2_bulksetmffiletype',
              'rw2_deleteministryfilesbatch', 'rw2_importministryfilesbatch', 'rw2_saveministryfilesbulk', 'rw2_savemfexecpolicy')) loop
    execute format('revoke all on function %s from public, anon, authenticated', r.sig);
    execute format('grant execute on function %s to service_role', r.sig);
  end loop;
end $$;

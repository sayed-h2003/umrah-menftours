-- V4.435: مولّد البنود — ربط مجموعات التأشيرات وملفات الوزارة بحساب العميل×الرحلة لا يعتمد على تطابق الأسماء حرفياً:
--  (1) اسم الرحلة يُقارَن بعد التطبيع (مسافات مكررة/ي/ى/ة/همزات) بدل المطابقة الحرفية.
--  (2) لو لم يطابق اسم العميل/الرحلة: المطابقة برقم الجواز — المعتمرون المختارون بالمجموعة/الملف (selected) ∩ معتمري هذا العميل×الرحلة.
--      لا يُطبَّق على ملف/مجموعة كل بنودها أسماء رحلات (مصروف رحلة لا عميل).
--  (3) ae_pil_diag: مقارنة أعداد المعتمرين (عميل×رحلة) في Postgres لنص بحث — لكشف أي اختلاف عن الشيت.

-- مفتاح جواز موحَّد (P: بادئة قديمة بمفاتيح الاختيار · المسافات · حالة الأحرف)
create or replace function _ae_pkey(s text) returns text language sql immutable as
$$ select upper(regexp_replace(regexp_replace(coalesce(s, ''), '^P:', ''), '[\s ﻿]+', '', 'g')) $$;

-- جوازات معتمري العميل×الرحلة {جواز:1}
create or replace function _ae_pass_set(client text, trip text) returns jsonb language plpgsql stable set search_path = public as
$$ declare ix jsonb := _pm_ix(); i_cl int := (ix ->> 'client')::int; i_tr int := (ix ->> 'tripName')::int; i_ps int := (ix ->> 'passport')::int; o jsonb; begin
  select coalesce(jsonb_object_agg(k, 1), '{}'::jsonb) into o from (
    select distinct _ae_pkey(_rx_s(_rx_c(raw, i_ps))) k from _rx_rows('pilgrims')
     where _rx_trim(_rx_s(_rx_c(raw, i_cl))) = client and _ac_norm(_rx_s(_rx_c(raw, i_tr))) = _ac_norm(trip)) z where k <> '';
  return o; end $$;

-- عدد المختارين (selected) الموجودين بمجموعة الجوازات
create or replace function _ae_sel_hits(sel jsonb, pset jsonb) returns int language sql immutable as
$$ select count(distinct _ae_pkey(x))::int from jsonb_array_elements_text(case when jsonb_typeof(sel) = 'array' then sel else '[]'::jsonb end) x
    where _ae_pkey(x) <> '' and left(_ae_pkey(x), 1) <> '#' and left(_ae_pkey(x), 4) <> 'IDX:' and pset ? _ae_pkey(x) $$;

-- هل الرحلة trip ضمن رحلات الملف (بعد التطبيع)؟
create or replace function _ae_trip_in(trips text[], trip text) returns boolean language sql immutable as
$$ select exists (select 1 from unnest(coalesce(trips, '{}')) t where _ac_norm(t) = _ac_norm(trip)) $$;

-- هل للملف بند واحد على الأقل ليس اسم رحلة؟
create or replace function _ae_has_client_line(bd jsonb, tset jsonb) returns boolean language sql immutable as
$$ select exists (select 1 from jsonb_array_elements(case when jsonb_typeof(bd) = 'array' then bd else '[]'::jsonb end) b
    where jsonb_typeof(b) = 'object' and _ac_norm(_rx_s(b -> 'name')) <> '' and not (tset ? _ac_norm(_rx_s(b -> 'name')))) $$;

create or replace function _ae_trip_nset() returns jsonb language sql stable set search_path = public as
$$ select coalesce(jsonb_object_agg(n, 1), '{}'::jsonb) from (select distinct _ac_norm(k) n from jsonb_object_keys(_mf_trip_names()) k) z where n <> '' $$;

-- = _accMfFeesAgg_ (+ مطابقة الجواز)
create or replace function _ae_mf_fees(client text, trip text) returns jsonb language plpgsql stable set search_path = public as
$$ #variable_conflict use_column
declare cfg jsonb := _sx_acc_pricing(); core jsonb; f jsonb; b jsonb; c jsonb; known jsonb := _mf_trip_names(); tset jsonb := _ae_trip_nset(); pset jsonb := _ae_pass_set(client, trip);
  n float8; sp float8; nm text; rt text; lines jsonb; l jsonb; agg jsonb := '{}'::jsonb; anyf boolean := false; k text; fno text; a jsonb; mfee float8; tin boolean; hits int;
begin
  core := _mf_all(_sx_exec_policy(), cfg, _mf_today());
  for f in select * from jsonb_array_elements(coalesce(core -> 'files', '[]'::jsonb)) loop
    if _mf_str(f -> 'reviewDate') = '' then continue; end if;
    tin := _ae_trip_in(_mf_trips_of(f ->> 'tripName', f ->> 'extraTrips', known), trip);
    n := 0; sp := 0;
    if tin then
      for b in select * from jsonb_array_elements(case when jsonb_typeof(f -> 'breakdown') = 'array' then f -> 'breakdown' else '[]'::jsonb end) loop
        if jsonb_typeof(b) <> 'object' then continue; end if;
        nm := _rx_s(b -> 'name');
        if tset ? _ac_norm(nm) then continue; end if;
        if not _ac_name_match(nm, client) then continue; end if;
        n := n + _mf_num(b -> 'count'); sp := sp + _mf_num(b -> 'sups');
      end loop;
    end if;
    if n = 0 and sp = 0 and pset <> '{}'::jsonb and _ae_has_client_line(f -> 'breakdown', tset) then
      hits := _ae_sel_hits(f -> 'selected', pset); n := hits;
    end if;
    if n = 0 and sp = 0 then continue; end if;
    c := f -> 'calc'; rt := f ->> 'reviewType'; lines := '[]'::jsonb; fno := _mf_str(f -> 'fileNo');
    if coalesce(f ->> 'execFee', '') in ('true', 't', '1', 'نعم') then
      if n <> 0 then anyf := true; end if;
      continue;
    end if;
    if rt = 'تجديد باركود' then
      if n <> 0 then lines := lines || jsonb_build_array(jsonb_build_object('key', 'تجديد باركود', 'count', n, 'cost', _mf_barcode_fee(f ->> 'reviewDate', cfg))); end if;
    elsif rt = 'VIP' or coalesce((c ->> 'vipByCount')::boolean, false) then
      if n <> 0 then lines := lines || jsonb_build_array(jsonb_build_object('key', 'رسوم غرفة VIP', 'count', n, 'cost', _mf_num(c -> 'roomFeeEffective'))); end if;
    elsif n <> 0 then lines := lines || jsonb_build_array(jsonb_build_object('key', 'رسوم غرفة', 'count', n, 'cost', _mf_num(c -> 'roomFeeEffective')));
    end if;
    mfee := _mf_num(c -> 'murafiqFee');
    if sp <> 0 and mfee <> 0 then lines := lines || jsonb_build_array(jsonb_build_object('key', 'رسوم غرفة المشرف', 'count', least(sp, mfee), 'cost', _mf_num(c -> 'supRoomFee'))); end if;
    if jsonb_array_length(lines) = 0 then continue; end if;
    anyf := true;
    for l in select * from jsonb_array_elements(lines) loop
      k := l ->> 'key'; a := coalesce(agg -> k, jsonb_build_object('count', 0, 'cost', (l ->> 'cost')::float8, 'refs', '[]'::jsonb));
      a := jsonb_set(a, '{count}', to_jsonb((a ->> 'count')::float8 + (l ->> 'count')::float8));
      if fno <> '' and not (a -> 'refs') ? fno then a := jsonb_set(a, '{refs}', (a -> 'refs') || to_jsonb(fno)); end if;
      agg := jsonb_set(agg, array[k], a);
    end loop;
  end loop;
  return jsonb_build_object('any', anyf, 'agg', agg); end $$;

-- = _accVisaGroupsFor_ (+ مطابقة الجواز)
create or replace function _ae_vz_groups(client text, trip text) returns jsonb language plpgsql stable set search_path = public as
$$ declare known jsonb := _mf_trip_names(); tset jsonb := _ae_trip_nset(); pset jsonb := _ae_pass_set(client, trip); f jsonb; b jsonb; n float8; cnt float8 := 0; refs text[] := '{}'; ags text[] := '{}'; begin
  for f in select vf.f from _vz_files() vf order by vf.rn loop
    if btrim(coalesce(f ->> 'status', '')) <> 'تم إصدار الموفا' then continue; end if;
    n := 0;
    if _ae_trip_in(_mf_trips_of(f ->> 'tripName', f ->> 'extraTrips', known), trip) then
      for b in select * from jsonb_array_elements(case when jsonb_typeof(f -> 'breakdown') = 'array' then f -> 'breakdown' else '[]'::jsonb end) loop
        if jsonb_typeof(b) = 'object' and _ac_name_match(_rx_s(b -> 'name'), client) then n := n + _mf_num(b -> 'count'); end if;
      end loop;
    end if;
    if n = 0 and pset <> '{}'::jsonb and (jsonb_array_length(case when jsonb_typeof(f -> 'breakdown') = 'array' then f -> 'breakdown' else '[]'::jsonb end) = 0 or _ae_has_client_line(f -> 'breakdown', tset)) then
      n := _ae_sel_hits(f -> 'selected', pset);
    end if;
    if n = 0 then continue; end if;
    cnt := cnt + n;
    if coalesce(f ->> 'ref', '') <> '' and not (f ->> 'ref') = any (refs) then refs := refs || (f ->> 'ref'); end if;
    if coalesce(f ->> 'agent', '') <> '' and not (f ->> 'agent') = any (ags) then ags := ags || (f ->> 'agent'); end if;
  end loop;
  return jsonb_build_object('count', cnt, 'desc', case when cnt = 0 then '' else 'تأشيرات' || case when array_length(refs, 1) > 0 then ' — مجموعة ' || array_to_string(refs, '، ') else '' end
      || case when array_length(ags, 1) > 0 then ' (الوكيل: ' || array_to_string(ags, '، ') || ')' else '' end end); end $$;

-- تشخيص: أعداد المعتمرين لكل (عميل × رحلة) في Postgres حيث يحوي العميل أو الرحلة النص p_sub — للمقارنة مع الشيت
create or replace function ae_pil_diag(p_sub text) returns jsonb language plpgsql stable security definer set search_path = public as
$$ declare ix jsonb := _pm_ix(); i_cl int := (ix ->> 'client')::int; i_tr int := (ix ->> 'tripName')::int; i_nm int := (ix ->> 'name')::int; i_ps int := (ix ->> 'passport')::int; o jsonb; begin
  select coalesce(jsonb_agg(jsonb_build_object('client', cl, 'trip', tr, 'n', n, 'pass', ps) order by tr, cl), '[]'::jsonb) into o from (
    select _rx_trim(_rx_s(_rx_c(raw, i_cl))) cl, _rx_trim(_rx_s(_rx_c(raw, i_tr))) tr, count(*) n,
           string_agg(distinct _ae_pkey(_rx_s(_rx_c(raw, i_ps))), ',') ps
      from _rx_rows('pilgrims') where _rx_trim(_rx_s(_rx_c(raw, i_nm))) <> ''
       and (position(p_sub in _rx_s(_rx_c(raw, i_cl))) > 0 or position(p_sub in _rx_s(_rx_c(raw, i_tr))) > 0) group by 1, 2) z;
  return o; end $$;
revoke all on function ae_pil_diag(text) from public, anon, authenticated;
grant execute on function ae_pil_diag(text) to service_role;

do $$ declare r record; begin
  for r in select p.oid::regprocedure::text sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname in ('_ae_pkey','_ae_pass_set','_ae_sel_hits','_ae_trip_in','_ae_has_client_line','_ae_trip_nset','_ae_mf_fees','_ae_vz_groups') loop
    execute format('revoke all on function %s from public, anon, authenticated', r.sig);
    execute format('grant execute on function %s to service_role', r.sig);
  end loop;
end $$;

-- ===== (V4.435) accResolveAlert من Postgres: اعتماد لقطة أعداد الحساب / تعليم التنبيه كمقروء (= Code.gs accResolveAlert) =====
-- اللقطة بنفس نص _accStatsHash_ حرفياً (نفس بناء rx2_getclientaccount: الفنادق/التسكين بترتيب أول ظهور)
create or replace function _ac_stats_hash(cl text, tr text) returns text language plpgsql stable set search_path = public as
$$ declare pm jsonb := _rx_map('pilgrims', _rx_h_pil()); h text; begin
  with mt as (select rn, _rx_trim(_rx_s(_rx_c(raw, _rx_ix(pm, 'النوع')))) ty, _rx_trim(_rx_s(_rx_c(raw, _rx_ix(pm, 'فندق المدينة')))) hm, _rx_trim(_rx_s(_rx_c(raw, _rx_ix(pm, 'فندق مكة')))) hk,
                     _rx_trim(_rx_s(_rx_c(raw, _rx_ix(pm, 'طبيعة التسكين')))) ac
                from _rx_rows('pilgrims') where _rx_trim(_rx_s(_rx_c(raw, _rx_ix(pm, 'العميل')))) = cl and _rx_trim(_rx_s(_rx_c(raw, _rx_ix(pm, 'اسم الرحلة')))) = tr
                  and _rx_trim(_rx_s(_rx_c(raw, _rx_ix(pm, 'اسم المعتمر')))) <> ''),
       hk_ as (select k, count(*) n, min(rn) f from (select rn, 'M:' || hm k from mt where hm <> '' union all select rn, 'K:' || hk from mt where hk <> '') x group by k),
       ac_ as (select ac k, count(*) n, min(rn) f from mt where ac <> '' group by ac)
  select case when count(*) = 0 then '' else
           '{"a":' || count(*) filter (where ty not in ('طفل', 'رضيع')) || ',"c":' || count(*) filter (where ty = 'طفل') || ',"i":' || count(*) filter (where ty = 'رضيع') || ',"t":' || count(*)
           || ',"hotels":{' || coalesce((select string_agg(to_json(k)::text || ':' || n, ',' order by f) from hk_), '') || '}'
           || ',"accom":{' || coalesce((select string_agg(to_json(k)::text || ':' || n, ',' order by f) from ac_), '') || '}}' end
    into h from mt;
  return coalesce(h, ''); end $$;
create or replace function _ac_hash_label(h text) returns text language plpgsql immutable as
$$ declare o jsonb; begin
  if coalesce(h, '') = '' then return '-'; end if;
  begin o := h::jsonb; exception when others then return '-'; end;
  return 'رجال ' || coalesce(o ->> 'a', '0') || '، أطفال ' || coalesce(o ->> 'c', '0') || '، رضّع ' || coalesce(o ->> 'i', '0'); end $$;
create or replace function rw2_accresolvealert(a jsonb, u text) returns jsonb language plpgsql volatile set search_path = public as
$$ declare cl text := _rx_trim(_rx_s(a -> 1)); tr text := _rx_trim(_rx_s(a -> 2)); act text := _rx_s(a -> 3); who text := coalesce(u, app_user(), '-');
  rid_ text; raw_ jsonb; cur text; nowj jsonb := jsonb_build_object('$d', (extract(epoch from clock_timestamp()) * 1000)::bigint); begin
  if not app_has('accounts.edit') then raise exception 'لا تملك صلاحية تعديل حسابات العملاء' using errcode = '42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended('store:put:acc_meta', 0));
  select rid, raw into rid_, raw_ from store_rows where tbl = 'acc_meta' and btrim(_rx_s(_rx_c(raw, 0))) = cl and btrim(_rx_s(_rx_c(raw, 1))) = tr order by ord, rid limit 1;
  if rid_ is null then return jsonb_build_object('success', false, 'error', 'لا يوجد حساب محفوظ لهذه الرحلة بعد'); end if;
  while jsonb_array_length(raw_) < 8 loop raw_ := raw_ || to_jsonb(''::text); end loop;
  cur := _ac_stats_hash(cl, tr);
  if act = 'apply' then
    insert into app_outbox (kind, payload) values ('audit', jsonb_build_object('user', who, 'action', 'اعتماد لقطة أعداد الحساب', 'record', cl, 'field', tr, 'old', _ac_hash_label(_rx_s(_rx_c(raw_, 3))), 'new', _ac_hash_label(cur)));
    raw_ := jsonb_set(jsonb_set(raw_, '{3}', to_jsonb(cur)), '{4}', to_jsonb(''::text));
  else
    insert into app_outbox (kind, payload) values ('audit', jsonb_build_object('user', who, 'action', 'تعليم تنبيه حساب كمقروء', 'record', cl, 'field', tr, 'old', '-', 'new', _ac_hash_label(cur)));
    raw_ := jsonb_set(raw_, '{4}', to_jsonb(cur));
  end if;
  raw_ := jsonb_set(jsonb_set(raw_, '{5}', to_jsonb(who)), '{6}', nowj);
  update store_rows set raw = raw_ where tbl = 'acc_meta' and rid = rid_;
  update store_meta set ver = ver + 1, updated_at = now() where tbl = 'acc_meta';
  perform _w_dv_bump(_acc_dvs());
  return jsonb_build_object('success', true); end $$;
do $$ declare r record; begin
  for r in select p.oid::regprocedure::text sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname in ('_ac_stats_hash', '_ac_hash_label', 'rw2_accresolvealert') loop
    execute format('revoke all on function %s from public, anon, authenticated', r.sig);
    execute format('grant execute on function %s to service_role', r.sig);
  end loop;
end $$;

-- (V4.435) تقارير الحسابات الثقيلة (كشف حساب بحجوزات الفنادق/الخزينة) كانت تُقطع عند مهلة الاستعلام الافتراضية (57014) فترتدّ لـApps Script
-- (18–32 ث). المتصفح ينتظرها الآن حتى 24 ث ⇒ مهلة الاستعلام لدور المستخدمين 25 ث.
alter role authenticated set statement_timeout = '25s';
notify pgrst, 'reload config';

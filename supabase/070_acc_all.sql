-- V4.444 · الدفعة 1 (مجال حسابات العملاء) ⇒ Postgres. منطق كل دالة = نظيرتها بـ Code.gs.
-- نمط الحساب واسم العرض · توليد/تعديل البنود جماعياً · بنود الوزارة والتأشيرات غير المرتبطة (قراءة/إدراج) · تسعير الحسابات العام
-- · مجموعات دمج الرحلات (حفظ/حذف/فك) · إحصاءات رحلات العميل · خرائط معتمري الرحلات · معالجة حساب خارج الكشوف · المزامنات الخلفية
-- (accSyncBg/syncTripAccountsBg/accAfterMovedBg بمحرك 040؛ نمط «بنود» المعتمد على حجوزات الفنادق يبقى عبر accsync حتى الدفعتين 2 و3).
-- مرتبطة بالحسابات العامة ⇒ الدفعة 2: accHbSyncAll · clientAccountBg · ccAccountsLite · ccQuickAccount · saveGeneralPaymentsBulk.
-- يتطلب: 019 · 029 · 040 · 067.

create or replace function _acc_sync(p_trip text, who text) returns jsonb language plpgsql volatile set search_path = public as
$$ declare r jsonb; begin
  if coalesce(p_trip, '') in ('', 'عام') then return null; end if;
  r := _ae_sync_trip(p_trip, who);
  if coalesce((r ->> 'needsAs')::boolean, false) then
    insert into app_outbox (kind, payload) values ('accsync', jsonb_build_object('trips', jsonb_build_array(p_trip), 'user', who, 'at', extract(epoch from now())));
    perform set_config('app.needs_as', '1', true);   -- rw_call يعلنها ⇒ المتصفح ينفّذ الصادر فوراً (accAsKick)
  end if;
  return r; end $$;
create or replace function _acc_perm(cap text) returns void language plpgsql stable as
$$ begin if not app_has('accounts.' || cap) then
  raise exception '%', 'لا تملك صلاحية ' || case cap when 'view' then 'عرض' when 'add' then 'إضافة' when 'edit' then 'تعديل' when 'delete' then 'حذف' else cap end || ' حسابات العملاء' using errcode = '42501'; end if; end $$;
create or replace function _acc_meta_set(cl text, tr text, idx int, val jsonb, who text) returns boolean language plpgsql volatile set search_path = public as
$$ declare rid_ text; raw_ jsonb; begin
  perform _ae_ensure_meta(cl, tr, who);
  perform _x_lock('acc_meta');
  select rid, raw into rid_, raw_ from store_rows where tbl = 'acc_meta' and _rx_trim(_rx_s(_rx_c(raw, 0))) = cl and _rx_trim(_rx_s(_rx_c(raw, 1))) = tr order by ord limit 1;
  if rid_ is null then return false; end if;
  raw_ := jsonb_set(jsonb_set(jsonb_set(_x_pad(raw_, 8), array[idx::text], val), '{5}', to_jsonb(who)), '{6}', jsonb_build_object('$d', (extract(epoch from clock_timestamp()) * 1000)::bigint));
  update store_rows set raw = raw_ where tbl = 'acc_meta' and rid = rid_;
  perform _x_bump('acc_meta'); return true; end $$;

-- ===== نمط الحساب واسم العرض =====
create or replace function rw2_setaccdisplayname(a jsonb, u text) returns jsonb language plpgsql volatile set search_path = public as
$$ declare who text := coalesce(u, app_user(), '-'); cl text := _w_str(a -> 1); tr text := _w_str(a -> 2); dn text := _w_str(a -> 3); begin
  perform _acc_perm('edit');
  if not _acc_meta_set(cl, tr, 7, to_jsonb(dn), who) then return jsonb_build_object('success', false, 'error', 'تعذر الوصول لبيانات الحساب'); end if;
  perform _w_dv_bump(_acc_dvs());
  perform _x_aud(who, 'تغيير اسم عرض رحلة بحساب عميل', cl, tr, '-', coalesce(nullif(dn, ''), '(رجوع للافتراضي)'));
  return jsonb_build_object('success', true, 'displayName', dn); end $$;
create or replace function rw2_setaccmode(a jsonb, u text) returns jsonb language plpgsql volatile set search_path = public as
$$ declare who text := coalesce(u, app_user(), '-'); cl text := _w_str(a -> 1); tr text := _w_str(a -> 2); m text := _w_str(a -> 3); old text; begin
  perform _acc_perm('edit');
  if m not in ('بنود', 'تأشيرة وباركود') then m := 'برنامج'; end if;
  perform _ae_ensure_meta(cl, tr, who);
  select _rx_s(_rx_c(raw, 2)) into old from store_rows where tbl = 'acc_meta' and _rx_trim(_rx_s(_rx_c(raw, 0))) = cl and _rx_trim(_rx_s(_rx_c(raw, 1))) = tr order by ord limit 1;
  if not _acc_meta_set(cl, tr, 2, to_jsonb(m), who) then return jsonb_build_object('success', false, 'error', 'تعذر الوصول لبيانات الحساب'); end if;
  perform _x_aud(who, 'تغيير نمط حساب رحلة', cl, tr, coalesce(old, ''), m);
  if m = 'تأشيرة وباركود' or old = 'تأشيرة وباركود' then perform _acc_sync(tr, who); perform _w_dv_bump(_acc_dvs()); return jsonb_build_object('success', true, 'reload', true); end if;
  perform _w_dv_bump(_acc_dvs());
  return jsonb_build_object('success', true); end $$;

-- ===== بنود الحساب: توليد/تعديل جماعي =====
create or replace function rw2_saveaccitemsbulk(a jsonb, u text) returns jsonb language plpgsql volatile set search_path = public as
$$ declare who text := coalesce(u, app_user(), '-'); cl text := _w_str(a -> 1); tr text := _w_str(a -> 2); asauto boolean := (a ->> 4) = 'true'; it jsonb; cnt float8; pr float8; nt float8; val float8;
  cur text; dis boolean; id_ text; isauto boolean; created jsonb := '[]'::jsonb; n int := 0; keys text[] := '{}'; nowj jsonb := jsonb_build_object('$d', (extract(epoch from clock_timestamp()) * 1000)::bigint); begin
  perform _acc_perm('add');
  if cl = '' or tr = '' or jsonb_typeof(a -> 3) <> 'array' or jsonb_array_length(a -> 3) = 0 then return jsonb_build_object('success', false, 'error', 'لا توجد بنود'); end if;
  perform _x_lock('acc_items');
  for it in select * from jsonb_array_elements(a -> 3) loop
    if _w_str(it -> 'desc') = '' then continue; end if;
    cnt := coalesce(_ac_num(it -> 'count'), 0); pr := coalesce(_ac_num(it -> 'price'), 0); nt := coalesce(_ac_num(it -> 'nights'), 0);
    val := round((cnt * pr * case when nt > 0 then nt else 1 end * 100)::numeric) / 100;
    cur := case when it ->> 'currency' = 'SAR' then 'SAR' else 'EGP' end; dis := it ->> 'cat' = 'خصم';
    isauto := asauto and (not dis or _w_str(it -> 'desc') = 'خصم');
    id_ := _x_id('I');
    perform _x_append('acc_items', jsonb_build_array(id_, cl, tr, it ->> 'desc', coalesce(it ->> 'cat', ''), cur, cnt, pr, val, case when dis then 'نعم' else 'لا' end, coalesce(it ->> 'notes', ''),
      who, nowj, '', '', case when nt <> 0 then to_jsonb(nt) else '""'::jsonb end, coalesce(it ->> 'company', ''), case when isauto then 'نعم' else '' end,
      case when it ? 'order' and jsonb_typeof(it -> 'order') <> 'null' then it -> 'order' else '""'::jsonb end, case when (it ->> 'isDirect') = 'true' then 'نعم' else 'لا' end));
    keys := keys || _acc_bond_key(regexp_replace(it ->> 'desc', '\s*⟦(?:cf|src):[^⟧]+⟧\s*$', '', 'i'));
    created := created || jsonb_build_array(jsonb_build_object('id', id_, 'value', val, 'isDiscount', dis, 'trip', tr, 'desc', it ->> 'desc', 'cat', coalesce(it ->> 'cat', ''), 'currency', cur,
      'count', cnt, 'price', pr, 'notes', coalesce(it ->> 'notes', ''), 'nights', nt, 'company', coalesce(it ->> 'company', ''), 'auto', case when isauto then 'نعم' else '' end,
      'order', coalesce(_ac_num(it -> 'order'), 0), 'isDirect', (it ->> 'isDirect') = 'true'));
    n := n + 1;
  end loop;
  if n = 0 then return jsonb_build_object('success', false, 'error', 'لا توجد بنود صالحة'); end if;
  perform _x_bump('acc_items');
  delete from store_rows where tbl = 'acc_removed' and _rx_trim(_rx_s(_rx_c(raw, 0))) = cl and _rx_trim(_rx_s(_rx_c(raw, 1))) = tr and _rx_trim(_rx_s(_rx_c(raw, 2))) = any (keys);
  if found then perform _x_bump('acc_removed'); end if;
  perform _ae_ensure_meta(cl, tr, who);
  perform _w_dv_bump(_acc_dvs());
  perform _x_aud(who, 'توليد بنود حساب', cl, tr, '-', n || ' بند مولَّد');
  return jsonb_build_object('success', true, 'count', n, 'created', created); end $$;
create or replace function rw2_updateaccitemsbulk(a jsonb, u text) returns jsonb language plpgsql volatile set search_path = public as
$$ declare who text := coalesce(u, app_user(), '-'); cl text := _w_str(a -> 1); tr text := _w_str(a -> 2); it jsonb; rid_ text; r jsonb; cnt float8; pr float8; nt float8; val float8; cur text; dis boolean;
  chg boolean; onlyp boolean; nd text; mk text; n int := 0; upd jsonb := '[]'::jsonb; nowj jsonb := jsonb_build_object('$d', (extract(epoch from clock_timestamp()) * 1000)::bigint); begin
  perform _acc_perm('edit');
  perform _x_lock('acc_items');
  for it in select * from jsonb_array_elements(case when jsonb_typeof(a -> 3) = 'array' then a -> 3 else '[]'::jsonb end) loop
    select rid, raw into rid_, r from store_rows where tbl = 'acc_items' and _rx_s(_rx_c(raw, 0)) = _w_str(it -> 'id') order by ord limit 1;
    if rid_ is null or _w_str(it -> 'desc') = '' then continue; end if;
    r := _x_pad(r, 20);
    if _rx_s(_rx_c(r, 3)) ~ '⟦src:HB\.[A-Za-z0-9_-]+⟧' then
      if it ? 'order' and jsonb_typeof(it -> 'order') <> 'null' then update store_rows set raw = jsonb_set(r, '{18}', it -> 'order') where tbl = 'acc_items' and rid = rid_; n := n + 1; end if;
      upd := upd || jsonb_build_array(jsonb_build_object('id', _w_str(it -> 'id'), 'value', coalesce(_ac_num(_rx_c(r, 8)), 0), 'isDiscount', false));
      rid_ := null; continue;
    end if;
    cnt := coalesce(_ac_num(it -> 'count'), 0); pr := coalesce(_ac_num(it -> 'price'), 0); nt := coalesce(_ac_num(it -> 'nights'), 0);
    val := round((cnt * pr * case when nt > 0 then nt else 1 end * 100)::numeric) / 100; cur := case when it ->> 'currency' = 'SAR' then 'SAR' else 'EGP' end; dis := it ->> 'cat' = 'خصم';
    upd := upd || jsonb_build_array(jsonb_build_object('id', _w_str(it -> 'id'), 'value', val, 'isDiscount', dis));
    if _rx_s(_rx_c(r, 17)) = 'نعم' then
      chg := _rx_s(_rx_c(r, 3)) <> (it ->> 'desc') or coalesce(_ac_num(_rx_c(r, 6)), 0) <> cnt or coalesce(_ac_num(_rx_c(r, 7)), 0) <> pr
             or coalesce(nullif(_rx_s(_rx_c(r, 5)), ''), 'EGP') <> cur or coalesce(_ac_num(_rx_c(r, 15)), 0) <> nt;
      onlyp := _rx_s(_rx_c(r, 3)) = (it ->> 'desc') and coalesce(_ac_num(_rx_c(r, 6)), 0) = cnt and coalesce(nullif(_rx_s(_rx_c(r, 5)), ''), 'EGP') = cur and coalesce(_ac_num(_rx_c(r, 15)), 0) = nt;
      if chg and not (onlyp and _rx_trim(_rx_s(_rx_c(r, 3))) = 'خصم' and _rx_s(_rx_c(r, 9)) = 'نعم') then r := jsonb_set(r, '{17}', to_jsonb('معدّل'::text)); end if;
    end if;
    nd := it ->> 'desc'; mk := (regexp_match(_rx_s(_rx_c(r, 3)), '⟦(?:cf|src):[^⟧]+⟧', 'i'))[1];
    if mk is null then mk := substring(_rx_s(_rx_c(r, 3)) from '⟦(?:cf|src):[^⟧]+⟧'); end if;
    if mk is not null and position('⟦' in nd) = 0 then nd := nd || ' ' || mk; end if;
    r := jsonb_set(jsonb_set(jsonb_set(jsonb_set(jsonb_set(jsonb_set(jsonb_set(jsonb_set(r, '{3}', to_jsonb(nd)), '{4}', to_jsonb(coalesce(it ->> 'cat', ''))), '{5}', to_jsonb(cur)), '{6}', to_jsonb(cnt)),
         '{7}', to_jsonb(pr)), '{8}', to_jsonb(val)), '{9}', to_jsonb(case when dis then 'نعم' else 'لا' end)), '{10}', to_jsonb(coalesce(it ->> 'notes', '')));
    r := jsonb_set(jsonb_set(jsonb_set(jsonb_set(r, '{13}', to_jsonb(who)), '{14}', nowj), '{15}', case when nt <> 0 then to_jsonb(nt) else '""'::jsonb end), '{16}', to_jsonb(coalesce(it ->> 'company', '')));
    if it ? 'order' and jsonb_typeof(it -> 'order') <> 'null' then r := jsonb_set(r, '{18}', it -> 'order'); end if;
    update store_rows set raw = r where tbl = 'acc_items' and rid = rid_;
    n := n + 1; rid_ := null;
  end loop;
  if n = 0 then return jsonb_build_object('success', false, 'error', 'لم يُعدَّل أي بند'); end if;
  perform _x_bump('acc_items'); perform _w_dv_bump(_acc_dvs());
  perform _x_aud(who, 'تعديل بنود حساب دفعة واحدة', cl, tr, '-', n || ' بند');
  return jsonb_build_object('success', true, 'count', n, 'updated', upd); end $$;

-- ===== بنود الوزارة والتأشيرات غير المرتبطة برحلات =====
create or replace function _acc_unlinked(cl text) returns jsonb language plpgsql stable set search_path = public as
$$ declare core jsonb := _mf_core(); cfg jsonb := _sx_acc_pricing(); known jsonb := _mf_trip_names(); tset jsonb := _ae_trip_nset(); f jsonb; b jsonb; n float8; sp float8; c jsonb; rows_ jsonb := '[]'::jsonb;
  ln jsonb; vp jsonb := _vz_prices('vz_agent_prices'); d text; cost float8; begin
  for f in select * from jsonb_array_elements(coalesce(core -> 'files', '[]'::jsonb)) loop
    if _mf_str(f -> 'reviewDate') = '' or array_length(_mf_trips_of(f ->> 'tripName', f ->> 'extraTrips', known), 1) > 0 then continue; end if;
    n := 0; sp := 0;
    for b in select * from jsonb_array_elements(case when jsonb_typeof(f -> 'breakdown') = 'array' then f -> 'breakdown' else '[]'::jsonb end) loop
      if jsonb_typeof(b) <> 'object' or tset ? _ac_norm(_rx_s(b -> 'name')) or not _ac_name_match(_rx_s(b -> 'name'), cl) then continue; end if;
      n := n + coalesce(_mf_num(b -> 'count'), 0); sp := sp + coalesce(_mf_num(b -> 'sups'), 0);
    end loop;
    if n = 0 and sp = 0 then continue; end if;
    c := f -> 'calc'; ln := '[]'::jsonb;
    if coalesce(f ->> 'execFee', '') in ('true', 't', '1', 'نعم') then
      if n <> 0 then ln := jsonb_build_array(jsonb_build_object('key', 'رسوم التنفيذ', 'count', n, 'cost', 0)); end if;
    else
      if f ->> 'reviewType' = 'تجديد باركود' then
        if n <> 0 then ln := ln || jsonb_build_array(jsonb_build_object('key', 'تجديد باركود', 'count', n, 'cost', _mf_barcode_fee(f ->> 'reviewDate', cfg))); end if;
      elsif f ->> 'reviewType' = 'VIP' or coalesce((c ->> 'vipByCount')::boolean, false) then
        if n <> 0 then ln := ln || jsonb_build_array(jsonb_build_object('key', 'رسوم غرفة VIP', 'count', n, 'cost', _mf_num(c -> 'roomFeeEffective'),
          'note', case when f ->> 'reviewType' = 'VIP' then 'مراجعة VIP' else 'VIP لأن الملف أقل من 4 معتمرين' end)); end if;
      elsif n <> 0 then ln := ln || jsonb_build_array(jsonb_build_object('key', 'رسوم غرفة', 'count', n, 'cost', _mf_num(c -> 'roomFeeEffective'))); end if;
      if sp <> 0 and coalesce(_mf_num(c -> 'murafiqFee'), 0) <> 0 then ln := ln || jsonb_build_array(jsonb_build_object('key', 'رسوم غرفة المشرف', 'count', least(sp, _mf_num(c -> 'murafiqFee')), 'cost', _mf_num(c -> 'supRoomFee'))); end if;
    end if;
    for b in select * from jsonb_array_elements(ln) loop
      rows_ := rows_ || jsonb_build_array(jsonb_build_object('kind', 'mf', 'id', f ->> 'id', 'date', f ->> 'reviewDate', 'ref', coalesce(f ->> 'fileNo', ''), 'key', b ->> 'key', 'count', b -> 'count',
        'cost', b -> 'cost', 'note', b ->> 'note'));
    end loop;
  end loop;
  for f in select q.f from _vz_files() q order by q.rn loop
    if btrim(coalesce(f ->> 'status', '')) <> 'تم إصدار الموفا' or array_length(_mf_trips_of(f ->> 'tripName', f ->> 'extraTrips', known), 1) > 0 then continue; end if;
    select coalesce(sum(coalesce(_mf_num(b -> 'count'), 0)), 0) into n from jsonb_array_elements(case when jsonb_typeof(f -> 'breakdown') = 'array' then f -> 'breakdown' else '[]'::jsonb end) b
     where jsonb_typeof(b) = 'object' and _ac_name_match(_rx_s(b -> 'name'), cl);
    if n = 0 then continue; end if;
    d := coalesce(nullif(f ->> 'date', ''), _mf_datet(split_part(coalesce(f ->> 'createdAt', ''), ' ', 1)), '');
    cost := coalesce(_mf_num(f -> 'price'), 0);
    if cost = 0 and coalesce(f ->> 'agent', '') <> '' and d <> '' then cost := _vz_price_at(f ->> 'agent', d, vp); end if;
    rows_ := rows_ || jsonb_build_array(jsonb_build_object('kind', 'vz', 'id', f ->> 'id', 'date', d, 'ref', coalesce(f ->> 'ref', ''), 'agent', coalesce(f ->> 'agent', ''), 'count', n, 'cost', cost));
  end loop;
  return rows_; end $$;
create or replace function _acc_src_marker(k text) returns text language sql immutable as $$ select '⟦src:' || regexp_replace(coalesce(k, ''), '[^A-Za-z0-9._-]', '', 'g') || '⟧' $$;
create or replace function rx2_getclientunlinkedfees(a jsonb, u text) returns jsonb language plpgsql stable set search_path = public as
$$ declare cl text := _w_str(a -> 1); cp jsonb; used jsonb; r jsonb; src text; pr float8; res jsonb := '[]'::jsonb; codes jsonb := '{"رسوم غرفة":"room","رسوم غرفة VIP":"vip","رسوم غرفة المشرف":"sup","تجديد باركود":"bar","رسوم التنفيذ":"exec"}'::jsonb; key_ text; begin
  perform _acc_perm('view');
  if cl = '' then return jsonb_build_object('success', false, 'error', 'اسم العميل مطلوب'); end if;
  cp := _ae_json_row('acc_client_prices', cl);
  select coalesce(jsonb_object_agg(m, 1), '{}'::jsonb) into used from (select (regexp_match(_rx_s(_rx_c(raw, 3)), '⟦src:([^⟧]+)⟧'))[1] m from _rx_rows('acc_items') where _rx_trim(_rx_s(_rx_c(raw, 1))) = cl) z where m is not null;
  for r in select * from jsonb_array_elements(_acc_unlinked(cl)) loop
    key_ := case when r ->> 'kind' = 'mf' then r ->> 'key' else 'تأشيرات' end;
    src := case when r ->> 'kind' = 'mf' then 'MF.' || (r ->> 'id') || '.' || coalesce(codes ->> key_, 'x') else 'VZ.' || (r ->> 'id') end;
    pr := _ae_price_at(cp, key_, r ->> 'date');
    res := res || jsonb_build_array(jsonb_build_object('src', src, 'kind', r ->> 'kind', 'date', r ->> 'date', 'ref', r ->> 'ref', 'key', key_, 'currency', case when r ->> 'kind' = 'mf' then 'EGP' else 'SAR' end,
      'desc', case when r ->> 'kind' = 'mf' then key_ || case when coalesce(r ->> 'ref', '') <> '' then ' — ملف ' || (r ->> 'ref') else '' end || case when coalesce(r ->> 'note', '') <> '' then ' (' || (r ->> 'note') || ')' else '' end
              else 'تأشيرات' || case when coalesce(r ->> 'ref', '') <> '' then ' — مجموعة ' || (r ->> 'ref') else '' end || case when coalesce(r ->> 'agent', '') <> '' then ' (الوكيل: ' || (r ->> 'agent') || ')' else '' end end,
      'count', r -> 'count', 'cost', r -> 'cost', 'price', coalesce(pr, (r ->> 'cost')::float8), 'priced', pr is not null,
      'inserted', used ? substr(_acc_src_marker(src), 6, length(_acc_src_marker(src)) - 6)));
  end loop;
  select coalesce(jsonb_agg(x order by coalesce(_mf_ms(x ->> 'date'), 0), x ->> 'ref'), '[]'::jsonb) into res from jsonb_array_elements(res) x;
  return jsonb_build_object('success', true, 'rows', res); end $$;
create or replace function rw2_insertclientunlinkedfees(a jsonb, u text) returns jsonb language plpgsql volatile set search_path = public as
$$ declare who text := coalesce(u, app_user(), '-'); cl text := _w_str(a -> 1); used jsonb; it jsonb; mk text; code text; cnt float8; pr float8; val float8; cur text; cat text; ds text; id_ text;
  created jsonb := '[]'::jsonb; sk int := 0; n int := 0; nowj jsonb := jsonb_build_object('$d', (extract(epoch from clock_timestamp()) * 1000)::bigint); begin
  perform _acc_perm('add');
  if cl = '' or jsonb_typeof(a -> 2) <> 'array' or jsonb_array_length(a -> 2) = 0 then return jsonb_build_object('success', false, 'error', 'لا توجد بنود محددة'); end if;
  perform _x_lock('acc_items');
  select coalesce(jsonb_object_agg(m, 1), '{}'::jsonb) into used from (select (regexp_match(_rx_s(_rx_c(raw, 3)), '⟦src:([^⟧]+)⟧'))[1] m from _rx_rows('acc_items') where _rx_trim(_rx_s(_rx_c(raw, 1))) = cl) z where m is not null;
  for it in select * from jsonb_array_elements(a -> 2) loop
    mk := _acc_src_marker(it ->> 'src'); code := substr(mk, 6, length(mk) - 6);
    if code = '' or used ? code then sk := sk + 1; continue; end if;
    used := used || jsonb_build_object(code, 1);
    cnt := coalesce(_ac_num(it -> 'count'), 0); pr := coalesce(_ac_num(it -> 'price'), 0); val := round((cnt * pr * 100)::numeric) / 100;
    cur := case when it ->> 'currency' = 'SAR' then 'SAR' else 'EGP' end; cat := case when it ->> 'key' = 'رسوم غرفة المشرف' then 'مشرف' else 'كبير' end;
    ds := coalesce(nullif(_w_str(it -> 'desc'), ''), _w_str(it -> 'key')); id_ := _x_id('I');
    perform _x_append('acc_items', jsonb_build_array(id_, cl, 'عام', ds || ' ' || mk, cat, cur, cnt, pr, val, 'لا', '', who, nowj, '', '', '', '', '', '', 'لا'));
    created := created || jsonb_build_array(jsonb_build_object('id', id_, 'trip', 'عام', 'desc', ds, 'cat', cat, 'currency', cur, 'count', cnt, 'price', pr, 'value', val, 'isDiscount', false,
      'notes', '', 'nights', 0, 'company', '', 'auto', '', 'order', 0, 'isDirect', false));
    n := n + 1;
  end loop;
  if n = 0 then return jsonb_build_object('success', false, 'error', 'كل البنود المحددة مُدرجة مسبقاً'); end if;
  perform _x_bump('acc_items'); perform _w_dv_bump(_acc_dvs());
  perform _x_aud(who, 'إدراج بنود الوزارة والتأشيرات', cl, 'عام', '-', n || ' بند');
  return jsonb_build_object('success', true, 'count', n, 'skipped', sk, 'created', created); end $$;

-- ===== تسعير الحسابات العام =====
create or replace function rx2_getaccpricing(a jsonb, u text) returns jsonb language plpgsql stable set search_path = public as
$$ begin perform _acc_perm('view'); return jsonb_build_object('success', true, 'cfg', _sx_acc_pricing()); end $$;
create or replace function rw2_saveaccpricing(a jsonb, u text) returns jsonb language plpgsql volatile set search_path = public as
$$ declare who text := coalesce(u, app_user(), '-'); c jsonb := coalesce(a -> 1, '{}'::jsonb); cl jsonb; p jsonb; rf jsonb := '[]'::jsonb; bp jsonb := '[]'::jsonb; begin
  perform _acc_perm('edit');
  for p in select * from jsonb_array_elements(case when jsonb_typeof(c -> 'roomFeePeriods') = 'array' then c -> 'roomFeePeriods' else '[]'::jsonb end) loop
    if _w_str(p -> 'from') = '' or coalesce(_ac_num(p -> 'price'), 0) = 0 then continue; end if;
    rf := rf || jsonb_build_array(jsonb_build_object('from', _w_str(p -> 'from'), 'to', _w_str(p -> 'to'), 'price', _ac_num(p -> 'price'))); end loop;
  for p in select * from jsonb_array_elements(case when jsonb_typeof(c -> 'barcodePeriods') = 'array' then c -> 'barcodePeriods' else '[]'::jsonb end) loop
    if _w_str(p -> 'from') = '' or coalesce(_ac_num(p -> 'price'), 0) = 0 then continue; end if;
    bp := bp || jsonb_build_array(jsonb_build_object('from', _w_str(p -> 'from'), 'to', _w_str(p -> 'to'), 'price', _ac_num(p -> 'price'))); end loop;
  cl := jsonb_build_object('roomFeePeriods', rf, 'supRoomFee', coalesce(nullif(_ac_num(c -> 'supRoomFee'), 0), 200), 'barcodePeriods', bp,
    'vipSurcharge', case when c ? 'vipSurcharge' then coalesce(_ac_num(c -> 'vipSurcharge'), 0) else 100 end,
    'vipRoomFee', case when c ? 'vipRoomFee' then coalesce(nullif(_ac_num(c -> 'vipRoomFee'), 0), 3100) else 3100 end);
  perform _x_kv('ACC_PRICING', cl::text);
  perform _w_dv_bump(array['ministry'] || _acc_dvs());
  perform _x_aud(who, 'تعديل تسعير الحسابات', '-', 'ACC_PRICING', '-', jsonb_array_length(rf) || ' فترة رسوم غرفة، رسوم غرفة المشرف ' || _mf_n2t((cl ->> 'supRoomFee')::float8) || ' ج');
  return jsonb_build_object('success', true, 'cfg', cl); end $$;

-- ===== مجموعات دمج الرحلات =====
create or replace function _acc_mg(cl text) returns jsonb language sql stable set search_path = public as
$$ select coalesce(jsonb_agg(jsonb_build_object('id', coalesce(nullif(_rx_trim(_rx_s(_rx_c(raw, 4))), ''), 'MG-' || substr(md5(rid), 1, 8)), 'name', coalesce(nullif(_rx_trim(_rx_s(_rx_c(raw, 5))), ''), 'مجموعة ' || o),
     'trips', tr, 'by', _rx_s(_rx_c(raw, 2)), 'at', _ae_dfmt(_rx_c(raw, 3)), 'rid', rid) order by ord), '[]'::jsonb)
   from (select rid, ord, raw, row_number() over (order by ord) o, (select coalesce(jsonb_agg(btrim(x)) filter (where btrim(x) <> ''), '[]'::jsonb) from jsonb_array_elements_text(case when jsonb_typeof(_rx_json(_rx_s(_rx_c(raw, 1)))) = 'array' then _rx_json(_rx_s(_rx_c(raw, 1))) else '[]'::jsonb end) x) tr
           from store_rows where tbl = 'acc_merge_groups' and _rx_trim(_rx_s(_rx_c(raw, 0))) = cl) z where jsonb_array_length(tr) > 0 $$;
create or replace function _acc_mg_out(cl text) returns jsonb language sql stable set search_path = public as
$$ select coalesce(jsonb_agg(g - 'rid'), '[]'::jsonb) from jsonb_array_elements(_acc_mg(cl)) g $$;
create or replace function rw2_saveclientmergegroupv2(a jsonb, u text) returns jsonb language plpgsql volatile set search_path = public as
$$ declare who text := coalesce(u, app_user(), '-'); cl text := _w_str(a -> 1); g jsonb := coalesce(a -> 2, '{}'::jsonb); mv boolean := coalesce((a -> 3 ->> 'move')::boolean, false); trips jsonb; gs jsonb; cur jsonb;
  id_ text := _w_str(g -> 'id'); nm text; clash jsonb := '[]'::jsonb; x jsonb; t text; rest jsonb; nowj jsonb := jsonb_build_object('$d', (extract(epoch from clock_timestamp()) * 1000)::bigint); begin
  perform _acc_perm('edit');
  select coalesce(jsonb_agg(t2 order by o), '[]'::jsonb) into trips from (select btrim(q.e) t2, min(q.o) o from jsonb_array_elements_text(case when jsonb_typeof(g -> 'trips') = 'array' then g -> 'trips' else '[]'::jsonb end) with ordinality q(e, o)
    where btrim(q.e) not in ('', 'عام') group by btrim(q.e)) z;
  if cl = '' or jsonb_array_length(trips) < 2 then return jsonb_build_object('success', false, 'error', 'مجموعة الدمج تحتاج رحلتين على الأقل'); end if;
  perform _x_lock('acc_merge_groups');
  gs := _acc_mg(cl);
  if id_ <> '' then select x2 into cur from jsonb_array_elements(gs) x2 where x2 ->> 'id' = id_; if cur is null then return jsonb_build_object('success', false, 'error', 'المجموعة غير موجودة (ربما حُذفت) — حدّث الشاشة'); end if; end if;
  nm := coalesce(nullif(_w_str(g -> 'name'), ''), cur ->> 'name', 'مجموعة ' || (jsonb_array_length(gs) + 1));
  for x in select * from jsonb_array_elements(gs) loop
    if cur is not null and x ->> 'id' = cur ->> 'id' then continue; end if;
    for t in select jsonb_array_elements_text(x -> 'trips') loop if trips @> to_jsonb(t) then clash := clash || jsonb_build_array(jsonb_build_object('trip', t, 'group', x ->> 'name', 'rid', x ->> 'rid')); end if; end loop;
  end loop;
  if jsonb_array_length(clash) > 0 and not mv then return jsonb_build_object('success', false, 'clash', (select jsonb_agg(c - 'rid') from jsonb_array_elements(clash) c),
    'error', 'رحلات موجودة بمجموعة أخرى: ' || (select string_agg((c ->> 'trip') || ' («' || (c ->> 'group') || '»)', '، ') from jsonb_array_elements(clash) c)); end if;
  for x in select * from jsonb_array_elements(gs) loop
    if not exists (select 1 from jsonb_array_elements(clash) c where c ->> 'rid' = x ->> 'rid') then continue; end if;
    select coalesce(jsonb_agg(t3), '[]'::jsonb) into rest from jsonb_array_elements_text(x -> 'trips') t3 where not (trips @> to_jsonb(t3));
    if jsonb_array_length(rest) < 2 then delete from store_rows where tbl = 'acc_merge_groups' and rid = x ->> 'rid';
    else update store_rows set raw = jsonb_set(jsonb_set(jsonb_set(_x_pad(raw, 6), '{1}', to_jsonb(rest::text)), '{2}', to_jsonb(who)), '{3}', nowj) where tbl = 'acc_merge_groups' and rid = x ->> 'rid'; end if;
  end loop;
  if cur is not null then
    update store_rows set raw = jsonb_build_array(cl, trips::text, who, nowj, cur ->> 'id', nm) where tbl = 'acc_merge_groups' and rid = cur ->> 'rid';
  else perform _x_append('acc_merge_groups', jsonb_build_array(cl, trips::text, who, nowj, 'MG-' || substr(md5(random()::text || clock_timestamp()::text), 1, 8), nm)); end if;
  perform _x_bump('acc_merge_groups'); perform _w_dv_bump(_acc_dvs());
  perform _x_aud(who, 'حفظ مجموعة دمج رحلات بكشف حساب: ' || nm, cl, '-', '-', (select string_agg(t4, '، ') from jsonb_array_elements_text(trips) t4));
  return jsonb_build_object('success', true, 'groups', _acc_mg_out(cl)); end $$;
create or replace function rw2_deleteclientmergegroup(a jsonb, u text) returns jsonb language plpgsql volatile set search_path = public as
$$ declare who text := coalesce(u, app_user(), '-'); cl text := _w_str(a -> 1); g jsonb; begin
  perform _acc_perm('edit');
  perform _x_lock('acc_merge_groups');
  select x into g from jsonb_array_elements(_acc_mg(cl)) x where x ->> 'id' = _w_str(a -> 2);
  if g is not null then
    delete from store_rows where tbl = 'acc_merge_groups' and rid = g ->> 'rid';
    perform _x_bump('acc_merge_groups'); perform _w_dv_bump(_acc_dvs());
    perform _x_aud(who, 'فك مجموعة دمج رحلات بكشف حساب: ' || (g ->> 'name'), cl, '-', '-', (select string_agg(t, '، ') from jsonb_array_elements_text(g -> 'trips') t));
  end if;
  return jsonb_build_object('success', true, 'groups', _acc_mg_out(cl)); end $$;
create or replace function rw2_clearclientmergegroup(a jsonb, u text) returns jsonb language plpgsql volatile set search_path = public as
$$ declare who text := coalesce(u, app_user(), '-'); cl text := _w_str(a -> 1); n int; begin
  perform _acc_perm('edit');
  perform _x_lock('acc_merge_groups');
  delete from store_rows where tbl = 'acc_merge_groups' and _rx_trim(_rx_s(_rx_c(raw, 0))) = cl and jsonb_typeof(_rx_json(_rx_s(_rx_c(raw, 1)))) = 'array' and jsonb_array_length(_rx_json(_rx_s(_rx_c(raw, 1)))) > 0;
  get diagnostics n = row_count;
  if n > 0 then perform _x_bump('acc_merge_groups'); perform _w_dv_bump(_acc_dvs()); perform _x_aud(who, 'فك دمج رحلات بكشف حساب', cl, '-', '-', '-'); end if;
  return jsonb_build_object('success', true); end $$;

-- ===== قراءات =====
create or replace function _acc_trip_stats(cl text) returns jsonb language plpgsql stable set search_path = public as
$$ #variable_conflict use_column
declare pm jsonb := _rx_map('pilgrims', _rx_h_pil()); tm jsonb := _rx_map('trips', _rx_h_trips()); rows_ jsonb; st jsonb; notrip int; refs jsonb := '{}'::jsonb; begin
  with pl as (select rn, _rx_trim(_rx_s(_rx_c(raw, _rx_ix(pm, 'اسم الرحلة')))) trip, _rx_trim(_rx_s(_rx_c(raw, _rx_ix(pm, 'النوع')))) ty,
                     _rx_trim(_rx_s(_rx_c(raw, _rx_ix(pm, 'فندق المدينة')))) hm, _rx_trim(_rx_s(_rx_c(raw, _rx_ix(pm, 'فندق مكة')))) hk, _rx_trim(_rx_s(_rx_c(raw, _rx_ix(pm, 'طبيعة التسكين')))) ac,
                     _rx_trim(_rx_s(_rx_c(raw, _rx_ix(pm, 'العميل')))) c0, _rx_trim(_rx_s(_rx_c(raw, _rx_ix(pm, 'اسم المعتمر')))) nm
                from _rx_rows('pilgrims')),
       mine as (select * from pl where c0 = cl and nm <> ''),
       nt as (select count(*) n from mine where trip = ''),
       mt as (select * from mine where trip <> ''),
       hk_ as (select trip, k, count(*) n, min(rn) f from (select trip, rn, 'M:' || hm k from mt where hm <> '' union all select trip, rn, 'K:' || hk from mt where hk <> '') x group by trip, k),
       ac_ as (select trip, ac k, count(*) n, min(rn) f from mt where ac <> '' group by trip, ac),
       tt as (select trip, count(*) filter (where ty = 'طفل') c, count(*) filter (where ty = 'رضيع') i, count(*) filter (where ty not in ('طفل', 'رضيع')) a, count(*) t, min(rn) f from mt group by trip),
       trl as (select distinct on (n) n, _rx_s(_rx_c(raw, _rx_ix(tm, 'الشركة المصرية'))) co, _rx_s(_rx_c(raw, _rx_ix(tm, 'الوكيل السعودي'))) ag,
                     _bk_date(_rx_c(raw, _rx_ix(tm, 'تاريخ الذهاب'))) dd, _bk_date(_rx_c(raw, _rx_ix(tm, 'تاريخ العودة'))) rd
                from (select _rx_trim(_rx_s(_rx_c(raw, _rx_ix(tm, 'اسم الرحلة')))) n, raw, rn from _rx_rows('trips')) q where n <> '' order by n, rn desc)
  select (select n from nt), coalesce(jsonb_agg(jsonb_build_object('trip', tt.trip, 'a', tt.a, 'c', tt.c, 'i', tt.i, 't', tt.t,
         'h', coalesce((select jsonb_object_agg(k, n) from hk_ where hk_.trip = tt.trip), '{}'::jsonb), 'm', coalesce((select jsonb_object_agg(k, n) from ac_ where ac_.trip = tt.trip), '{}'::jsonb),
         'hs', '{' || coalesce((select string_agg(to_json(k)::text || ':' || n, ',' order by f) from hk_ where hk_.trip = tt.trip), '') || '}',
         'ms', '{' || coalesce((select string_agg(to_json(k)::text || ':' || n, ',' order by f) from ac_ where ac_.trip = tt.trip), '') || '}', 'firstrn', tt.f,
         'company', coalesce(trl.co, ''), 'agent', coalesce(trl.ag, ''), 'dep', coalesce(trl.dd, ''), 'ret', coalesce(trl.rd, '')) order by tt.f), '[]'::jsonb)
    into notrip, st from tt left join trl on trl.n = tt.trip;
  select coalesce(jsonb_object_agg(n, rf), '{}'::jsonb) into refs from (select distinct on (n) n, rf from (
      select _rx_trim(_rx_s(_rx_c(raw, _rx_ix(tm, 'اسم الرحلة')))) n, _rx_trim(_rx_s(_rx_c(raw, _rx_ix(tm, 'الرقم المرجعي')))) rf, rn from _rx_rows('trips')) z where n <> '' and rf <> '' order by n, rn desc) y;
  select coalesce(jsonb_agg(jsonb_build_object('trip', e ->> 'trip', 'company', e ->> 'company', 'agent', e ->> 'agent', 'tripRef', coalesce(refs ->> (e ->> 'trip'), ''), 'departDate', e ->> 'dep', 'returnDate', e ->> 'ret',
            'adults', e -> 'a', 'children', e -> 'c', 'infants', e -> 'i', 'total', e -> 't', 'hotels', e -> 'h', 'accom', e -> 'm')
         order by (case when e ->> 'dep' ~ '^\d{1,2}/\d{1,2}/\d{4}$' then (to_date(split_part(e ->> 'dep', '/', 3) || '-' || split_part(e ->> 'dep', '/', 2) || '-' || split_part(e ->> 'dep', '/', 1), 'YYYY-MM-DD') - date '1970-01-01') else 99999999 end),
                  (case when e ->> 'trip' ~ '^(0|[1-9][0-9]{0,9})$' and (e ->> 'trip')::bigint <= 4294967294 then 0 else 1 end),
                  (case when e ->> 'trip' ~ '^(0|[1-9][0-9]{0,9})$' and (e ->> 'trip')::bigint <= 4294967294 then (e ->> 'trip')::bigint end), (e ->> 'firstrn')::int), '[]'::jsonb)
    into rows_ from jsonb_array_elements(st) e;
  return jsonb_build_object('rows', rows_, 'noTripCount', coalesce(notrip, 0)); end $$;
create or replace function rx2_getclienttripstats(a jsonb, u text) returns jsonb language plpgsql stable set search_path = public as
$$ begin
  if app_user() is null then raise exception 'غير مصرّح' using errcode = '42501'; end if;
  if _w_str(a -> 1) = '' then raise exception 'اسم العميل مطلوب' using errcode = 'P0001'; end if;
  return _acc_trip_stats(_w_str(a -> 1)); end $$;
create or replace function rx2_gettripspilgrimsmap(a jsonb, u text) returns jsonb language plpgsql stable set search_path = public as
$$ declare m jsonb := '{}'::jsonb; t text; begin
  if app_user() is null then raise exception 'غير مصرّح' using errcode = '42501'; end if;
  for t in select distinct btrim(x) from jsonb_array_elements_text(case when jsonb_typeof(a -> 1) = 'array' then a -> 1 else '[]'::jsonb end) x where btrim(x) <> '' loop
    m := m || jsonb_build_object(t, coalesce(rx_trip_pilgrims_raw(t), '[]'::jsonb)); end loop;
  return jsonb_build_object('success', true, 'map', m); end $$;

-- ===== معالجة حساب خارج الكشوف والمزامنات الخلفية =====
create or replace function rw2_accfixorphanlines(a jsonb, u text) returns jsonb language plpgsql volatile set search_path = public as
$$ declare who text := coalesce(u, app_user(), '-'); cl text := _w_str(a -> 1); tr text := _w_str(a -> 2); act text := _w_str(a -> 3); tg text := _w_str(a -> 4); ni int; np int; lbl text; begin
  perform _acc_perm(case when act = 'clear' then 'delete' else 'edit' end);
  if cl = '' or tr = '' then return jsonb_build_object('success', false, 'error', 'العميل والرحلة مطلوبان'); end if;
  if act in ('moveClient', 'moveTrip') and tg = '' then return jsonb_build_object('success', false, 'error', 'حدّد الوجهة'); end if;
  if act = 'moveClient' and tg = cl then return jsonb_build_object('success', false, 'error', 'اختر عميلاً آخر'); end if;
  perform _x_lock('acc_items'); perform _x_lock('acc_payments');
  if act = 'clear' then
    perform _rb_on('acc_item', 'بنود حساب خارج الكشوف ' || cl || ' — ' || tr, '', who);
    delete from store_rows where tbl = 'acc_items' and _rx_trim(_rx_s(_rx_c(raw, 1))) = cl and _rx_trim(_rx_s(_rx_c(raw, 2))) = tr; get diagnostics ni = row_count;
    update store_rows set raw = jsonb_set(_x_pad(raw, 3), '{2}', '"عام"') where tbl = 'acc_payments' and _rx_trim(_rx_s(_rx_c(raw, 1))) = cl and _rx_trim(_rx_s(_rx_c(raw, 2))) = tr; get diagnostics np = row_count;
  else
    update store_rows set raw = jsonb_set(_x_pad(raw, 3), case when act = 'moveClient' then '{1}'::text[] else '{2}'::text[] end, to_jsonb(tg))
     where tbl = 'acc_items' and _rx_trim(_rx_s(_rx_c(raw, 1))) = cl and _rx_trim(_rx_s(_rx_c(raw, 2))) = tr; get diagnostics ni = row_count;
    update store_rows set raw = jsonb_set(_x_pad(raw, 3), case when act = 'moveClient' then '{1}'::text[] else '{2}'::text[] end, to_jsonb(tg))
     where tbl = 'acc_payments' and _rx_trim(_rx_s(_rx_c(raw, 1))) = cl and _rx_trim(_rx_s(_rx_c(raw, 2))) = tr; get diagnostics np = row_count;
  end if;
  perform _x_bump('acc_items'); perform _x_bump('acc_payments'); perform _w_dv_bump(_acc_dvs());
  lbl := case act when 'moveClient' then 'نقل إلى العميل «' || tg || '»' when 'moveTrip' then 'نقل إلى «' || tg || '»' else 'حذف البنود ونقل الدفعات إلى «عام»' end;
  perform _x_aud(who, 'معالجة حساب خارج كشوف الرحلة', cl, tr, ni || ' بند، ' || np || ' دفعة', lbl);
  return jsonb_build_object('success', true, 'items', ni, 'payments', np); end $$;
create or replace function rw2_synctripaccountsbg(a jsonb, u text) returns jsonb language plpgsql volatile set search_path = public as
$$ declare t text; n int := 0; begin
  if app_user() is null then raise exception 'غير مصرّح' using errcode = '42501'; end if;
  for t in select btrim(x) from jsonb_array_elements_text(case when jsonb_typeof(a -> 1) = 'array' then a -> 1 else '[]'::jsonb end) x where btrim(x) <> '' limit 12 loop
    perform _acc_sync(t, coalesce(u, app_user(), '-')); n := n + 1; end loop;
  if n > 0 then perform _w_dv_bump(_acc_dvs()); end if;
  return jsonb_build_object('success', true, 'synced', n); end $$;
create or replace function rw2_accsyncbg(a jsonb, u text) returns jsonb language plpgsql volatile set search_path = public as
$$ declare t text; r jsonb; n int := 0; begin
  if app_user() is null then raise exception 'غير مصرّح' using errcode = '42501'; end if;
  for t in select btrim(x) from jsonb_array_elements_text(case when jsonb_typeof(a -> 1) = 'array' then a -> 1 else '[]'::jsonb end) x where btrim(x) not in ('', 'عام') loop
    r := _acc_sync(t, coalesce(u, app_user(), '-'));
    if coalesce((r ->> 'created')::int, 0) + coalesce((r ->> 'updated')::int, 0) + coalesce((r ->> 'removed')::int, 0) > 0 then n := n + 1; end if;
  end loop;
  if _w_str(a -> 2) <> '' then update app_outbox set done_at = now() where id::text = _w_str(a -> 2) and kind = 'accsync' and done_at is null; end if;   -- ما يحتاج Apps Script أُعيد إدراجه ببند جديد
  perform _w_dv_bump(_acc_dvs());
  return jsonb_build_object('success', true, 'resynced', n); end $$;
-- = _accAfterPilgrimsMoved_: انتقل كل معتمري العميل ⇒ تنتقل حساباته · بعضهم ⇒ دفعاته إلى «عام» وتُحذف بنوده التلقائية لتُولَّد بكل رحلة
create or replace function rw2_accaftermovedbg(a jsonb, u text) returns jsonb language plpgsql volatile set search_path = public as
$$ declare who text := coalesce(u, app_user(), '-'); fr text := _w_str(a -> 2); tt text := _w_str(a -> 3); cl text; ix jsonb := _pm_ix(); rem int; ni int; np int; nd int; notes text[] := '{}'; any_ boolean := false; begin
  if app_user() is null then raise exception 'غير مصرّح' using errcode = '42501'; end if;
  perform _x_lock('acc_items'); perform _x_lock('acc_payments');
  for cl in select distinct btrim(x) from jsonb_array_elements_text(case when jsonb_typeof(a -> 1) = 'array' then a -> 1 else '[]'::jsonb end) x where btrim(x) <> '' loop
    select count(*) into ni from store_rows where tbl = 'acc_items' and _rx_trim(_rx_s(_rx_c(raw, 1))) = cl and _rx_trim(_rx_s(_rx_c(raw, 2))) = fr;
    select count(*) into np from store_rows where tbl = 'acc_payments' and _rx_trim(_rx_s(_rx_c(raw, 1))) = cl and _rx_trim(_rx_s(_rx_c(raw, 2))) = fr;
    if ni = 0 and np = 0 then continue; end if;
    select count(*) into rem from store_rows where tbl = 'pilgrims' and _rx_trim(_rx_s(_rx_c(raw, (ix ->> 'tripName')::int))) = fr and _rx_trim(_rx_s(_rx_c(raw, (ix ->> 'client')::int))) = cl
      and _rx_trim(_rx_s(_rx_c(raw, (ix ->> 'name')::int))) <> '';
    any_ := true;
    if rem = 0 then
      update store_rows set raw = jsonb_set(_x_pad(raw, 3), '{2}', to_jsonb(tt)) where tbl in ('acc_items', 'acc_payments') and _rx_trim(_rx_s(_rx_c(raw, 1))) = cl and _rx_trim(_rx_s(_rx_c(raw, 2))) = fr;
      perform _ae_ensure_meta(cl, tt, who);
      notes := notes || ('«' || cl || '»: نُقلت حساباته مع معتمريه (' || ni || ' بند، ' || np || ' دفعة) إلى «' || tt || '»');
    else
      update store_rows set raw = jsonb_set(_x_pad(raw, 3), '{2}', '"عام"') where tbl = 'acc_payments' and _rx_trim(_rx_s(_rx_c(raw, 1))) = cl and _rx_trim(_rx_s(_rx_c(raw, 2))) = fr;
      delete from store_rows where tbl = 'acc_items' and _rx_trim(_rx_s(_rx_c(raw, 1))) = cl and _rx_trim(_rx_s(_rx_c(raw, 2))) = fr and _rx_s(_rx_c(raw, 17)) = 'نعم'
        and _rx_s(_rx_c(raw, 3)) !~ '⟦src:HB\.[A-Za-z0-9_-]+⟧';
      get diagnostics nd = row_count;
      notes := notes || ('«' || cl || '»: دفعاته (' || np || ') نُقلت إلى «عام» لإعادة تخصيصها' || case when nd > 0 then '، وحُذف ' || nd || ' بند تلقائي ليُولَّد بكل رحلة' else '' end);
    end if;
    perform _x_aud(who, 'تبعية حساب العميل لنقل معتمريه', cl, fr, case when rem > 0 then 'جزئي' else 'كلي' end, '→ ' || tt);
  end loop;
  if any_ then perform _x_bump('acc_items'); perform _x_bump('acc_payments'); perform _acc_sync(fr, who); perform _acc_sync(tt, who); perform _w_dv_bump(_acc_dvs()); end if;
  if _w_str(a -> 4) <> '' then update app_outbox set done_at = now() where id::text = _w_str(a -> 4) and kind = 'accmoved' and done_at is null; end if;
  return jsonb_build_object('success', true, 'accNote', array_to_string(notes, E'\n')); end $$;

do $$ declare r record; begin
  for r in select p.oid::regprocedure::text sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname in ('_acc_sync','_acc_perm','_acc_meta_set','rw2_setaccdisplayname','rw2_setaccmode','rw2_saveaccitemsbulk','rw2_updateaccitemsbulk','_acc_unlinked','_acc_src_marker',
              'rx2_getclientunlinkedfees','rw2_insertclientunlinkedfees','rx2_getaccpricing','rw2_saveaccpricing','_acc_mg','_acc_mg_out','rw2_saveclientmergegroupv2','rw2_deleteclientmergegroup',
              'rw2_clearclientmergegroup','_acc_trip_stats','rx2_getclienttripstats','rx2_gettripspilgrimsmap','rw2_accfixorphanlines','rw2_synctripaccountsbg','rw2_accsyncbg','rw2_accaftermovedbg') loop
    execute format('revoke all on function %s from public, anon, authenticated', r.sig);
    execute format('grant execute on function %s to service_role', r.sig);
  end loop;
end $$;

-- rw_call: + علم «as» حين أُدرج بند accsync (نمط «بنود» المعتمد على حجوزات الفنادق) ⇒ المتصفح يطلب تنفيذه فوراً
create or replace function rw_call(p_fn text, p_args jsonb default '[]'::jsonb) returns jsonb language plpgsql volatile security definer set search_path = public as
$$ declare a jsonb := case when jsonb_typeof(p_args) = 'array' then p_args else '[]'::jsonb end; u text := app_user(); p regprocedure; d jsonb; begin
  if u is null then raise exception 'غير مصرّح' using errcode = '42501'; end if;
  if p_fn !~ '^[A-Za-z]{3,60}$' then raise exception 'دالة غير مدعومة: %', p_fn using errcode = '0A000'; end if;
  p := to_regprocedure('public.rw2_' || lower(p_fn) || '(jsonb,text)');
  if p is null then raise exception 'دالة غير مدعومة: %', p_fn using errcode = '0A000'; end if;
  perform set_config('app.needs_as', '', true);
  execute format('select %s($1, $2)', p::regproc::text) into d using a, u;
  return jsonb_build_object('success', true, 'd', d) || case when current_setting('app.needs_as', true) = '1' then '{"as": true}'::jsonb else '{}'::jsonb end;
end $$;
revoke all on function rw_call(text, jsonb) from public, anon;
grant execute on function rw_call(text, jsonb) to authenticated, service_role;

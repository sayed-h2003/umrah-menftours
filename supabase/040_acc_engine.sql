-- 040: محرك تسعير/مزامنة حسابات العملاء من Postgres — _syncTripAccounts_ (نمط «برنامج» + نمط «تأشيرة وباركود») + accGenerateDraft (نمط «برنامج»).
-- • نمط «بنود» (يعتمد على بيانات حجوزات الفنادق/الحسابات العامة غير الموجودة بـPostgres) ⇒ تبقى مزامنته بـApps Script: يُنشأ بند accsync بصندوق الإخراج فقط حين توجد بنود تلقائية بهذا النمط.
-- • تُستدعى المزامنة داخل نفس معاملة حفظ الكشف (037) فتُلغى الحاجة لنداء Apps Script بالحالة المعتادة. يتطلب 034 (_pm_ix) و029 (_acc_bond_key) و010 (_sx_acc_pricing) و037 (_stp_aud).
create or replace function _ae_num(c jsonb) returns float8 language sql immutable as
$$ select coalesce(nullif(substring(case jsonb_typeof(c) when 'number' then c::text when 'string' then c #>> '{}' else '' end from '^\s*([-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?)'), '')::float8, 0) $$;

create or replace function _ae_dfmt(c jsonb) returns text language sql immutable as
$$ select case when jsonb_typeof(c) = 'object' and c ? '$d' then to_char(to_timestamp(floor((c ->> '$d')::float8 / 1000.0)) at time zone 'Africa/Cairo', 'DD/MM/YYYY') else btrim(coalesce(c #>> '{}', '')) end $$;

create or replace function _ae_dmy_ms(s text) returns float8 language plpgsql immutable as
$$ declare m text[] := regexp_match(coalesce(s, ''), '^(\d{1,2})/(\d{1,2})/(\d{4})$'); begin
  if m is null then return null; end if; return extract(epoch from make_date(m[3]::int, m[2]::int, m[1]::int))::float8;
exception when others then return null; end $$;

-- = _accClientPriceAt_ (null ⇒ لا فترة سارية)
create or replace function _ae_price_at(pricing jsonb, key_ text, dstr text) returns float8 language plpgsql immutable as
$$ declare t float8; p jsonb; fm float8; tm float8; begin
  if pricing is null or jsonb_typeof(pricing -> 'items') is distinct from 'object' or (pricing -> 'items' -> key_) is null then return null; end if;
  t := _ae_dmy_ms(dstr); if t is null then return null; end if;
  for p in select * from jsonb_array_elements(case when jsonb_typeof(pricing -> 'items' -> key_ -> 'periods') = 'array' then pricing -> 'items' -> key_ -> 'periods' else '[]'::jsonb end) loop
    fm := _ae_dmy_ms(p ->> 'from'); if fm is null then continue; end if;
    tm := _ae_dmy_ms(p ->> 'to');
    if t >= fm and (tm is null or t <= tm) then return _ae_num(p -> 'price'); end if;
  end loop;
  return null; end $$;

create or replace function _ae_json_row(tbl_ text, key_ text) returns jsonb language plpgsql stable set search_path = public as
$$ declare r jsonb; begin
  select _rx_c(raw, 1) into r from store_rows where store_rows.tbl = tbl_ and _rx_trim(_rx_s(_rx_c(raw, 0))) = key_ order by ord, rid limit 1;
  if r is null then return null; end if;
  begin return (r #>> '{}')::jsonb; exception when others then return null; end; end $$;

-- = _accClientBreakdown_
create or replace function _ae_breakdown(client text, trip text) returns jsonb language plpgsql stable set search_path = public as
$$ declare ix jsonb := _pm_ix(); i_tr int := (ix ->> 'tripName')::int; i_cl int := (ix ->> 'client')::int; i_nm int := (ix ->> 'name')::int; i_ty int := (ix ->> 'type')::int; i_ac int := (ix ->> 'accommodation')::int; i_hk int := (ix ->> 'hotelMakkah')::int; i_hm int := (ix ->> 'hotelMadinah')::int;
  r record; ty text; ac text; ho text; closed jsonb := '{}'; normal jsonb := '{}'; child int := 0; inf int := 0; out_ jsonb := '[]'; k text; p text[]; begin
  for r in select raw from store_rows where tbl = 'pilgrims' order by ord, rid loop
    if _rx_trim(_rx_s(_rx_c(r.raw, i_cl))) <> client or _rx_trim(_rx_s(_rx_c(r.raw, i_tr))) <> trip or _rx_trim(_rx_s(_rx_c(r.raw, i_nm))) = '' then continue; end if;
    ty := _rx_trim(_rx_s(_rx_c(r.raw, i_ty))); ac := _rx_trim(_rx_s(_rx_c(r.raw, i_ac)));
    ho := coalesce(nullif(_rx_trim(_rx_s(_rx_c(r.raw, i_hk))), ''), _rx_trim(_rx_s(_rx_c(r.raw, i_hm))));
    if ty = 'رضيع' then inf := inf + 1; continue; end if;
    if ty = 'طفل' and ac = '' then child := child + 1; continue; end if;
    if ac = any(array['رباعي', 'خماسي', 'سداسي', 'رباعي أسرة', 'خماسي أسرة']) then ac := ''; end if;
    if ac <> '' then closed := jsonb_set(closed, array[ho || '|' || ac], to_jsonb(coalesce((closed ->> (ho || '|' || ac))::int, 0) + 1));
    else normal := jsonb_set(normal, array[ho], to_jsonb(coalesce((normal ->> ho)::int, 0) + 1)); end if;
  end loop;
  for k in select kk from jsonb_object_keys(closed) kk order by kk collate "C" loop
    p := string_to_array(k, '|');
    out_ := out_ || jsonb_build_object('desc', case when p[1] <> '' then 'برنامج ' || p[1] || ' - ' else 'غرفة ' end || p[2], 'cat', 'كبير', 'count', (closed ->> k)::int, 'hotel', p[1], 'acc', p[2]);
  end loop;
  for k in select kk from jsonb_object_keys(normal) kk order by kk collate "C" loop
    out_ := out_ || jsonb_build_object('desc', case when k <> '' then 'برنامج ' || k || ' - ' else '' end || 'تسكين عادي', 'cat', 'كبير', 'count', (normal ->> k)::int, 'hotel', k, 'acc', 'عادي');
  end loop;
  if child > 0 then out_ := out_ || jsonb_build_object('desc', 'أطفال بدون سكن', 'cat', 'طفل بدون سرير', 'count', child, 'hotel', '', 'acc', 'طفل'); end if;
  if inf > 0 then out_ := out_ || jsonb_build_object('desc', 'رضيع', 'cat', 'رضيع', 'count', inf, 'hotel', '', 'acc', 'رضيع'); end if;
  return out_; end $$;

-- = _accPriceFor_
create or replace function _ae_price_for(pricing jsonb, g jsonb) returns float8 language plpgsql immutable as
$$ declare h jsonb; begin
  if pricing is null then return 0; end if;
  if g ->> 'acc' = 'رضيع' then return _ae_num(pricing -> 'infant'); end if;
  if g ->> 'acc' = 'طفل' then return _ae_num(pricing -> 'child'); end if;
  h := pricing -> 'hotels' -> coalesce(g ->> 'hotel', '');
  if h is null or h = 'null'::jsonb or jsonb_typeof(h) is distinct from 'object' then return 0; end if;
  return _ae_num(h -> coalesce(nullif(g ->> 'acc', ''), 'عادي')); end $$;

-- لقطة الأعداد JSON (= _accStatsHash_(row) بترتيب المفاتيح كما يبنيها _accClientStatsIdx_): {"a":..,"c":..,"i":..,"t":..,"hotels":{..},"accom":{..}}
create or replace function _ae_stats_json(client text, trip text) returns text language plpgsql stable set search_path = public as
$$ declare ix jsonb := _pm_ix(); i_tr int := (ix ->> 'tripName')::int; i_cl int := (ix ->> 'client')::int; i_nm int := (ix ->> 'name')::int; i_ty int := (ix ->> 'type')::int; i_ac int := (ix ->> 'accommodation')::int; i_hk int := (ix ->> 'hotelMakkah')::int; i_hm int := (ix ->> 'hotelMadinah')::int;
  r record; a int := 0; c int := 0; i int := 0; t int := 0; hk text[] := '{}'; hv int[] := '{}'; ak text[] := '{}'; av int[] := '{}'; ty text; x text; pos int; hs text := ''; ms text := ''; j int; begin
  for r in select raw from store_rows where tbl = 'pilgrims' order by ord, rid loop
    if _rx_trim(_rx_s(_rx_c(r.raw, i_cl))) <> client or _rx_trim(_rx_s(_rx_c(r.raw, i_tr))) <> trip or _rx_trim(_rx_s(_rx_c(r.raw, i_nm))) = '' then continue; end if;
    ty := _rx_trim(_rx_s(_rx_c(r.raw, i_ty)));
    if ty = 'طفل' then c := c + 1; elsif ty = 'رضيع' then i := i + 1; else a := a + 1; end if; t := t + 1;
    foreach x in array array['M:' || _rx_trim(_rx_s(_rx_c(r.raw, i_hm))), 'K:' || _rx_trim(_rx_s(_rx_c(r.raw, i_hk)))] loop
      if length(x) > 2 then pos := array_position(hk, x); if pos is null then hk := hk || x; hv := hv || 1; else hv[pos] := hv[pos] + 1; end if; end if;
    end loop;
    x := _rx_trim(_rx_s(_rx_c(r.raw, i_ac)));
    if x <> '' then pos := array_position(ak, x); if pos is null then ak := ak || x; av := av || 1; else av[pos] := av[pos] + 1; end if; end if;
  end loop;
  for j in 1 .. coalesce(array_length(hk, 1), 0) loop hs := hs || case when j > 1 then ',' else '' end || to_json(hk[j])::text || ':' || hv[j]; end loop;
  for j in 1 .. coalesce(array_length(ak, 1), 0) loop ms := ms || case when j > 1 then ',' else '' end || to_json(ak[j])::text || ':' || av[j]; end loop;
  if t = 0 then return ''; end if;
  return '{"a":' || a || ',"c":' || c || ',"i":' || i || ',"t":' || t || ',"hotels":{' || hs || '},"accom":{' || ms || '}}'; end $$;

-- ===== مزامنة حسابات كل عملاء الرحلة (= _syncTripAccounts_) — يرجع {clients,created,updated,removed,needsAs} =====
create or replace function _ae_sync_trip(trip text, who text) returns jsonb language plpgsql volatile set search_path = public as
$$ declare
  ix jsonb := _pm_ix(); i_tr int := (ix ->> 'tripName')::int; i_cl int := (ix ->> 'client')::int; i_ty int := (ix ->> 'type')::int;
  tp jsonb := _ae_trip_pricing(trip); applied boolean := coalesce((tp ->> 'applied') = 'true', false);
  clients text[] := '{}'; vzc jsonb := '{}'; r record; it record; cl text; mode_ text; modeof jsonb := '{}'; tomb jsonb := '{}'; nowj jsonb := jsonb_build_object('$d', (extract(epoch from clock_timestamp()) * 1000)::bigint);
  created int := 0; updated int := 0; removed int := 0; needs_as boolean := false; hasman boolean; synced boolean; haveVz boolean; vzN int; vzP float8; vzdep text; np float8; vp float8; flag text; desc_ text; raw_ jsonb;
  br jsonb; g jsonb; desired jsonb; ord_ text[]; d jsonb; k text; dprice float8; discn int; val float8; synced_clients jsonb := '{}'; manual jsonb := '{}'; stats jsonb := '{}'; a int; c int; i int; pc jsonb;
  metaold jsonb := '{}'; mrid text; mraw jsonb; ent_n int;
begin
  if not exists (select 1 from store_rows where tbl = 'pilgrims') then return jsonb_build_object('skipped', true); end if;
  perform pg_advisory_xact_lock(hashtextextended('store:put:acc_items', 0)); perform pg_advisory_xact_lock(hashtextextended('store:put:acc_meta', 0));
  for r in select raw from store_rows where tbl = 'pilgrims' order by ord, rid loop
    if _rx_trim(_rx_s(_rx_c(r.raw, i_tr))) <> trip then continue; end if;
    cl := _rx_trim(_rx_s(_rx_c(r.raw, i_cl)));
    if cl = '' or position('المشرف' in cl) = 1 then continue; end if;
    if not (cl = any(clients)) then clients := clients || cl; end if;
    vzc := jsonb_set(vzc, array[cl], to_jsonb(coalesce((vzc ->> cl)::int, 0) + 1));
  end loop;
  for r in select raw from store_rows where tbl = 'acc_meta' order by ord, rid loop
    metaold := metaold || jsonb_build_object(_rx_trim(_rx_s(_rx_c(r.raw, 0))) || '|' || _rx_trim(_rx_s(_rx_c(r.raw, 1))), true);
    if _rx_trim(_rx_s(_rx_c(r.raw, 1))) = trip then modeof := modeof || jsonb_build_object(_rx_trim(_rx_s(_rx_c(r.raw, 0))), coalesce(nullif(_rx_s(_rx_c(r.raw, 2)), ''), 'برنامج')); end if;
  end loop;
  for r in select raw from store_rows where tbl = 'acc_removed' order by ord, rid loop
    if _rx_trim(_rx_s(_rx_c(r.raw, 1))) = trip and _rx_trim(_rx_s(_rx_c(r.raw, 0))) <> '' and _rx_trim(_rx_s(_rx_c(r.raw, 2))) <> '' then
      tomb := tomb || jsonb_build_object(_rx_trim(_rx_s(_rx_c(r.raw, 0))) || '|' || _rx_trim(_rx_s(_rx_c(r.raw, 2))), true); end if;
  end loop;
  select _ae_dfmt(_rx_c(raw, (_rx_map('trips', _rx_h_trips()) ->> 'تاريخ الذهاب')::int)) into vzdep from store_rows where tbl = 'trips' and _rx_trim(_rx_s(_rx_c(raw, (_rx_map('trips', _rx_h_trips()) ->> 'اسم الرحلة')::int))) = trip order by ord, rid limit 1;
  foreach cl in array clients loop
    mode_ := coalesce(modeof ->> cl, 'برنامج'); hasman := false; synced := false;
    if mode_ = 'تأشيرة وباركود' then
      synced := true; haveVz := false; vzN := coalesce((vzc ->> cl)::int, 0); vzP := _ae_price_at(_ae_json_row('acc_client_prices', cl), 'تأشيرة وباركود', vzdep);
      for it in select rid, raw from store_rows where tbl = 'acc_items' and _rx_trim(_rx_s(_rx_c(raw, 1))) = cl and _rx_trim(_rx_s(_rx_c(raw, 2))) = trip order by ord, rid loop
        flag := _rx_s(_rx_c(it.raw, 17));
        if flag = 'معدّل' then hasman := true; end if;
        if flag = 'نعم' then
          if _acc_bond_key(_rx_s(_rx_c(it.raw, 3))) = 'تأشيرة وباركود' and not haveVz then
            haveVz := true; np := coalesce(vzP, _ae_num(_rx_c(it.raw, 7)));
            if _ae_num(_rx_c(it.raw, 6)) <> vzN or _ae_num(_rx_c(it.raw, 7)) <> np or coalesce(nullif(_rx_s(_rx_c(it.raw, 5)), ''), 'EGP') <> 'EGP' then
              raw_ := it.raw; raw_ := jsonb_set(raw_, '{5}', '"EGP"'); raw_ := jsonb_set(raw_, '{6}', to_jsonb(vzN)); raw_ := jsonb_set(raw_, '{7}', to_jsonb(np)); raw_ := jsonb_set(raw_, '{8}', to_jsonb(_gs_r2(vzN * np)));
              raw_ := jsonb_set(raw_, '{13}', to_jsonb(who)); raw_ := jsonb_set(raw_, '{14}', nowj);
              update store_rows set raw = raw_ where tbl = 'acc_items' and rid = it.rid; updated := updated + 1; end if;
          elsif not (_rx_trim(_rx_s(_rx_c(it.raw, 3))) = 'خصم' and _rx_s(_rx_c(it.raw, 9)) = 'نعم' and _ae_num(_rx_c(it.raw, 8)) <> 0) then
            delete from store_rows where tbl = 'acc_items' and rid = it.rid; removed := removed + 1; end if;
        elsif _acc_bond_key(_rx_s(_rx_c(it.raw, 3))) = 'تأشيرة وباركود' then haveVz := true; end if;
      end loop;
      if not haveVz and vzN > 0 and not (tomb ? (cl || '|تأشيرة وباركود')) then
        vp := coalesce(vzP, 0);
        insert into store_rows (tbl, rid, ord, raw) select 'acc_items', substr(md5(random()::text || clock_timestamp()::text || cl), 1, 20), coalesce(max(ord), 0) + 1,
          jsonb_build_array('I' || _w_b36((extract(epoch from clock_timestamp()) * 1000)::bigint) || substr(md5(random()::text), 1, 3), cl, trip, 'تأشيرة وباركود', 'كبير', 'EGP', vzN, vp, _gs_r2(vzN * vp), 'لا', '', who, nowj, '', '', '', '', 'نعم', '', 'لا') from store_rows where tbl = 'acc_items';
        created := created + 1; end if;
    elsif mode_ <> 'بنود' and applied then
      synced := true; br := _ae_breakdown(cl, trip); desired := '{}'; ord_ := '{}'; discn := 0;
      for g in select * from jsonb_array_elements(br) loop
        desired := desired || jsonb_build_object(g ->> 'desc', jsonb_build_object('count', (g ->> 'count')::int, 'price', _ae_price_for(tp, g), 'cat', g ->> 'cat', 'done', false, 'disc', false));
        ord_ := ord_ || (g ->> 'desc'); discn := discn + coalesce((g ->> 'count')::int, 0);
      end loop;
      if discn > 0 and not (desired ? 'خصم') then desired := desired || jsonb_build_object('خصم', jsonb_build_object('count', discn, 'price', null, 'cat', 'خصم', 'done', false, 'disc', true)); ord_ := ord_ || 'خصم'::text; end if;
      for it in select rid, raw from store_rows where tbl = 'acc_items' and _rx_trim(_rx_s(_rx_c(raw, 1))) = cl and _rx_trim(_rx_s(_rx_c(raw, 2))) = trip order by ord, rid loop
        desc_ := _rx_s(_rx_c(it.raw, 3)); flag := _rx_s(_rx_c(it.raw, 17));
        if flag = 'معدّل' then hasman := true; end if;
        if flag = 'نعم' then
          d := desired -> desc_;
          if d is not null then
            desired := jsonb_set(desired, array[desc_, 'done'], 'true');
            dprice := case when jsonb_typeof(d -> 'price') = 'null' then _ae_num(_rx_c(it.raw, 7)) else (d ->> 'price')::float8 end;
            if _ae_num(_rx_c(it.raw, 6)) <> (d ->> 'count')::float8 or _ae_num(_rx_c(it.raw, 7)) <> dprice then
              raw_ := it.raw; raw_ := jsonb_set(raw_, '{6}', d -> 'count'); raw_ := jsonb_set(raw_, '{7}', to_jsonb(dprice)); raw_ := jsonb_set(raw_, '{8}', to_jsonb(_gs_r2((d ->> 'count')::float8 * dprice)));
              raw_ := jsonb_set(raw_, '{13}', to_jsonb(who)); raw_ := jsonb_set(raw_, '{14}', nowj);
              update store_rows set raw = raw_ where tbl = 'acc_items' and rid = it.rid; updated := updated + 1; end if;
          elsif not (_rx_trim(_rx_s(_rx_c(it.raw, 3))) = 'خصم' and _rx_s(_rx_c(it.raw, 9)) = 'نعم' and _ae_num(_rx_c(it.raw, 8)) <> 0) then
            delete from store_rows where tbl = 'acc_items' and rid = it.rid; removed := removed + 1; end if;
        elsif desired ? desc_ then desired := jsonb_set(desired, array[desc_, 'done'], 'true'); end if;
      end loop;
      foreach k in array ord_ loop
        d := desired -> k; if (d ->> 'done') = 'true' then continue; end if;
        dprice := case when jsonb_typeof(d -> 'price') = 'null' then 0 else (d ->> 'price')::float8 end;
        if (tomb ? (cl || '|' || _acc_bond_key(k))) or (not ((d ->> 'disc') = 'true') and not (dprice > 0)) then continue; end if;
        insert into store_rows (tbl, rid, ord, raw) select 'acc_items', substr(md5(random()::text || clock_timestamp()::text || k), 1, 20), coalesce(max(ord), 0) + 1,
          jsonb_build_array('I' || _w_b36((extract(epoch from clock_timestamp()) * 1000)::bigint) || substr(md5(random()::text), 1, 3), cl, trip, k, d ->> 'cat', 'EGP', (d ->> 'count')::int, dprice, _gs_r2((d ->> 'count')::float8 * dprice),
                            case when (d ->> 'disc') = 'true' then 'نعم' else 'لا' end, '', who, nowj, '', '', '', '', 'نعم', '', 'لا') from store_rows where tbl = 'acc_items';
        created := created + 1;
      end loop;
    elsif mode_ = 'بنود' then
      if exists (select 1 from store_rows where tbl = 'acc_items' and _rx_trim(_rx_s(_rx_c(raw, 1))) = cl and _rx_trim(_rx_s(_rx_c(raw, 2))) = trip and _rx_s(_rx_c(raw, 17)) = 'نعم') then needs_as := true; end if;
      continue;
    else continue; end if;
    if synced then manual := manual || jsonb_build_object(cl, hasman); end if;
  end loop;
  if created + updated + removed > 0 then update store_meta set ver = ver + 1, updated_at = now() where tbl = 'acc_items'; end if;
  -- لقطة الأعداد بميتا العملاء المزامَنين (بلا بنود يدوية): كما الأصل — يُنشأ صف الميتا الناقص بلقطة JSON، ثم إن كان لأي عميل ميتا سابقة تُكتب لقطة «أ/ط/ر» لكل المزامَنين
  declare pre boolean := false; begin
    foreach cl in array clients loop
      if not (manual ? cl) or (manual ->> cl) = 'true' then continue; end if;
      if metaold ? (cl || '|' || trip) then pre := true; end if;
      if not (metaold ? (cl || '|' || trip)) then
        insert into store_rows (tbl, rid, ord, raw) select 'acc_meta', substr(md5(random()::text || clock_timestamp()::text || cl), 1, 20), coalesce(max(ord), 0) + 1,
          jsonb_build_array(cl, trip, 'برنامج', _ae_stats_json(cl, trip), '', who, nowj) from store_rows where tbl = 'acc_meta';
        update store_meta set ver = ver + 1, updated_at = now() where tbl = 'acc_meta';
      end if;
    end loop;
    if pre then
      foreach cl in array clients loop
        if not (manual ? cl) or (manual ->> cl) = 'true' then continue; end if;
        select count(*) filter (where _rx_trim(_rx_s(_rx_c(raw, i_ty))) not in ('طفل', 'رضيع')), count(*) filter (where _rx_trim(_rx_s(_rx_c(raw, i_ty))) = 'طفل'), count(*) filter (where _rx_trim(_rx_s(_rx_c(raw, i_ty))) = 'رضيع') into a, c, i
          from store_rows where tbl = 'pilgrims' and _rx_trim(_rx_s(_rx_c(raw, i_tr))) = trip and _rx_trim(_rx_s(_rx_c(raw, i_cl))) = cl;
        update store_rows set raw = jsonb_set(jsonb_set(raw, '{3}', to_jsonb(a || '/' || c || '/' || i)), '{4}', '""') where tbl = 'acc_meta' and _rx_trim(_rx_s(_rx_c(raw, 0))) = cl and _rx_trim(_rx_s(_rx_c(raw, 1))) = trip;
        update store_meta set ver = ver + 1, updated_at = now() where tbl = 'acc_meta';
      end loop;
    end if;
  end;
  if created + updated + removed > 0 then
    perform _stp_aud(who, jsonb_build_array(jsonb_build_object('action', 'مزامنة حسابات رحلة تلقائياً', 'recordId', trip, 'field', 'تسعير الرحلة', 'oldVal', '-',
      'newVal', array_length(clients, 1) || ' عميل: +' || created || ' بند، ~' || updated || ' تحديث، −' || removed || ' حذف')), 'accounts', 'حسابات العملاء');
    perform _w_dv_bump(array['acc', 'trips', 'pilgrims', 'gl']);
  end if;
  return jsonb_build_object('clients', coalesce(array_length(clients, 1), 0), 'created', created, 'updated', updated, 'removed', removed, 'needsAs', needs_as); end $$;

-- = _accTripPricing_
create or replace function _ae_trip_pricing(trip text) returns jsonb language sql stable set search_path = public as $$ select _ae_json_row('acc_trip_prices', trip) $$;

do $$ declare r record; begin
  for r in select p.oid::regprocedure::text sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname like '\_ae\_%' loop
    execute format('revoke all on function %s from public, anon, authenticated', r.sig); execute format('grant execute on function %s to service_role', r.sig); end loop; end $$;

-- ===== accGenerateDraft (نمط «برنامج») — مسودة بنود العميل×الرحلة لنافذة التوليد. نمط «بنود» (يحتاج حجوزات الفنادق/الحسابات العامة) ⇒ 0A000 ⇒ Apps Script =====
create or replace function _ae_normar(s text) returns text language sql immutable as
$$ select lower(translate(regexp_replace(regexp_replace(coalesce(s, ''), '[ً-ٰٟ]', '', 'g'), '[أإآٱ]', 'ا', 'g'), 'ىةؤئ', 'يهءء')) $$;

create or replace function rx2_accgeneratedraft(a jsonb, u text) returns jsonb language plpgsql stable set search_path = public as
$$ declare
  client text := _rx_trim(translate(coalesce(a ->> 1, ''), '٠١٢٣٤٥٦٧٨٩', '0123456789')); trip text := _rx_trim(translate(coalesce(a ->> 2, ''), '٠١٢٣٤٥٦٧٨٩', '0123456789')); mode_ text := coalesce(a ->> 3, '');
  ix jsonb := _pm_ix(); i_tr int := (ix ->> 'tripName')::int; i_cl int := (ix ->> 'client')::int; i_nm int := (ix ->> 'name')::int; i_ty int := (ix ->> 'type')::int; i_nt int := (_rx_map('pilgrims', _rx_h_pil()) ->> 'ملاحظات')::int;
  ad int := 0; ch int := 0; inf int := 0; tot int := 0; r record; ty text; cfg jsonb; tp jsonb; br jsonb; g jsonb; items jsonb := '[]'; sups int := 0; names text[] := '{}'; mine int := 0; other boolean := false; cl text; nm text; nt text; discn int := 0;
  company text; tx jsonb := _rx_map('trips', _rx_h_trips()); have jsonb := '{}'; tomb jsonb := '{}'; k text; it jsonb; excl boolean; vp record; sup_fee float8;
  push_ jsonb;
begin
  if not app_has('accounts.add') then raise exception 'لا تملك صلاحية إضافة حسابات العملاء' using errcode = '42501'; end if;
  if mode_ = 'بنود' then raise exception 'غير مدعوم: نمط بنود' using errcode = '0A000'; end if;
  for r in select raw from store_rows where tbl = 'pilgrims' order by ord, rid loop
    if _rx_trim(_rx_s(_rx_c(r.raw, i_cl))) <> client or _rx_trim(_rx_s(_rx_c(r.raw, i_tr))) <> trip or _rx_trim(_rx_s(_rx_c(r.raw, i_nm))) = '' then continue; end if;
    ty := _rx_trim(_rx_s(_rx_c(r.raw, i_ty)));
    if ty = 'طفل' then ch := ch + 1; elsif ty = 'رضيع' then inf := inf + 1; else ad := ad + 1; end if; tot := tot + 1;
  end loop;
  if tot = 0 then return jsonb_build_object('success', false, 'error', 'لا يوجد معتمرون مسجَّلون لهذا العميل في هذه الرحلة'); end if;
  cfg := _sx_acc_pricing(); sup_fee := coalesce(nullif(_ae_num(cfg -> 'supRoomFee'), 0), 200);
  select _rx_trim(_rx_s(_rx_c(raw, (tx ->> 'الشركة المصرية')::int))) into company from store_rows where tbl = 'trips' and _rx_trim(_rx_s(_rx_c(raw, (tx ->> 'اسم الرحلة')::int))) = trip order by ord, rid limit 1;
  company := coalesce(company, '');
  tp := _ae_trip_pricing(trip); br := _ae_breakdown(client, trip);
  -- مشرفو الرحلة (= _accTripSupsForClient_)
  for r in select raw from store_rows where tbl = 'pilgrims' order by ord, rid loop
    if _rx_trim(_rx_s(_rx_c(r.raw, i_tr))) <> trip then continue; end if;
    cl := _rx_trim(_rx_s(_rx_c(r.raw, i_cl))); nm := _rx_trim(_rx_s(_rx_c(r.raw, i_nm)));
    if cl = 'مشرف' or position('المشرف' in cl) = 1 then if nm <> '' then sups := sups + 1; names := names || nm; end if; continue; end if;
    if cl = client then mine := mine + 1; elsif cl <> '' then other := true; end if;
  end loop;
  excl := sups > 0 and mine > 0 and not other;
  -- أسطر البرنامج
  if jsonb_array_length(br) > 0 then
    for g in select * from jsonb_array_elements(br) loop
      items := items || jsonb_build_object('desc', g ->> 'desc', 'cat', g ->> 'cat', 'currency', 'EGP', 'count', (g ->> 'count')::int, 'price', coalesce(_ae_price_for(tp, g), 0), 'nights', 0, 'company', '', 'notes', '', 'isDirect', false);
      discn := discn + (g ->> 'count')::int;
    end loop;
  else
    if ad > 0 then items := items || jsonb_build_object('desc', 'برنامج الرحلة - كبار', 'cat', 'كبير', 'currency', 'EGP', 'count', ad, 'price', 0, 'nights', 0, 'company', '', 'notes', '', 'isDirect', false); end if;
    if ch > 0 then items := items || jsonb_build_object('desc', 'برنامج الرحلة - أطفال', 'cat', 'طفل بسرير', 'currency', 'EGP', 'count', ch, 'price', 0, 'nights', 0, 'company', '', 'notes', '', 'isDirect', false); end if;
    if inf > 0 then items := items || jsonb_build_object('desc', 'برنامج الرحلة - رضع', 'cat', 'رضيع', 'currency', 'EGP', 'count', inf, 'price', 0, 'nights', 0, 'company', '', 'notes', '', 'isDirect', false); end if;
  end if;
  if discn = 0 then discn := tot; end if;
  if discn > 0 then items := items || jsonb_build_object('desc', 'خصم', 'cat', 'خصم', 'currency', 'EGP', 'count', discn, 'price', 0, 'nights', 0, 'company', '', 'notes', '', 'isDirect', false); end if;
  -- خصم تأشيرة لمن ملاحظته تذكر تأشيرة/فيزا
  for r in select raw from store_rows where tbl = 'pilgrims' order by ord, rid loop
    if _rx_trim(_rx_s(_rx_c(r.raw, i_cl))) <> client or _rx_trim(_rx_s(_rx_c(r.raw, i_tr))) <> trip then continue; end if;
    nt := _rx_trim(_rx_s(_rx_c(r.raw, i_nt)));
    if nt <> '' and _ae_normar(nt) ~ 'تاشير|فيزا|visa' then
      items := items || jsonb_build_object('desc', 'خصم تأشيرة - ' || _rx_trim(_rx_s(_rx_c(r.raw, i_nm))) || ' (' || nt || ')', 'cat', 'خصم', 'currency', 'EGP', 'count', 1, 'price', 0, 'nights', 0, 'company', '', 'notes', '', 'isDirect', false); end if;
  end loop;
  if excl then
    items := items || jsonb_build_object('desc', 'رسوم غرفة المشرف', 'cat', 'مشرف', 'currency', 'EGP', 'count', sups, 'price', sup_fee, 'nights', 0, 'company', company, 'notes', array_to_string(names, '، '), 'isDirect', false)
                   || jsonb_build_object('desc', 'تأشيرة المشرف', 'cat', 'مشرف', 'currency', 'SAR', 'count', sups, 'price', 0, 'nights', 0, 'company', '', 'notes', array_to_string(names, '، '), 'isDirect', false);
  end if;
  -- وسم كل بند: exists / removed / sel
  select coalesce(jsonb_object_agg(_acc_bond_key(_rx_s(_rx_c(raw, 3))), 1), '{}'::jsonb) into have from store_rows where tbl = 'acc_items' and _rx_trim(_rx_s(_rx_c(raw, 1))) = client and _rx_trim(_rx_s(_rx_c(raw, 2))) = trip;
  select coalesce(jsonb_object_agg(_rx_trim(_rx_s(_rx_c(raw, 2))), 1), '{}'::jsonb) into tomb from store_rows where tbl = 'acc_removed' and _rx_trim(_rx_s(_rx_c(raw, 0))) = client and _rx_trim(_rx_s(_rx_c(raw, 1))) = trip and _rx_trim(_rx_s(_rx_c(raw, 2))) <> '';
  select coalesce(jsonb_agg(x || jsonb_build_object('exists', have ? _acc_bond_key(x ->> 'desc'), 'removed', tomb ? _acc_bond_key(x ->> 'desc'), 'sel', not (have ? _acc_bond_key(x ->> 'desc')) and not (tomb ? _acc_bond_key(x ->> 'desc'))) order by o), '[]'::jsonb) into items
    from jsonb_array_elements(items) with ordinality t(x, o);
  return jsonb_build_object('success', true, 'items', items, 'counts', jsonb_build_object('a', ad, 'c', ch, 'i', inf, 't', tot)); end $$;

revoke all on function _ae_normar(text), rx2_accgeneratedraft(jsonb, text) from public, anon, authenticated;
grant execute on function _ae_normar(text), rx2_accgeneratedraft(jsonb, text) to service_role;

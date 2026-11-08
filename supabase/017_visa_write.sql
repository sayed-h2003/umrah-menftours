-- 017_visa_write.sql — (V4.380) saveVisaFile بـPostgres عبر rw_call (يعتمد على 016). نفس شكل الرد: {success, file, syncTrips, agentBalances, lfAfter}
-- لم يُنقل بعد (يبقى على Apps Script بالخلفية عند الحاجة فقط): مزامنة اتفاقيات/تخصيصات السكن (vzAfterSaveBg ⇒ syncHousing) وفحص تطابق الشركة/الوكيل (xcheck).

-- مفتاح اسم الرحلة: يصحّح الاسم المطابق بعد التطبيع أو يرجع خطأً — يرجع {f} أو {error}
create or replace function _w_tripfix(f jsonb, o jsonb) returns jsonb language plpgsql stable set search_path = public as
$$ declare known jsonb := _mf_trip_names(); kn int; oldset text[]; t text; hit text[]; bad text[] := '{}'; begin
  select count(*) into kn from jsonb_object_keys(known);
  if kn = 0 then return jsonb_build_object('f', f); end if;
  oldset := case when o is null then '{}' else _mf_trips_of(o ->> 'tripName', o ->> 'extraTrips', known) end;
  for t in select unnest(_mf_trips_of(f ->> 'tripName', f ->> 'extraTrips', known)) loop
    if t = any (oldset) or known ? t then continue; end if;
    select array_agg(k) into hit from jsonb_object_keys(known) k where _w_norm(k) = _w_norm(t);
    if coalesce(array_length(hit, 1), 0) = 1 then
      if (f ->> 'tripName') = t then f := f || jsonb_build_object('tripName', hit[1]); end if;
      if _mf_strt(f ->> 'extraTrips') <> '' then
        f := f || jsonb_build_object('extraTrips', (select string_agg(case when _w_norm(z) = _w_norm(t) then hit[1] else z end, E'\n') from (select btrim(zz) z from unnest(regexp_split_to_array(f ->> 'extraTrips', E'[\\n,،]+')) zz) q where z <> ''));
      end if;
    else bad := bad || t; end if;
  end loop;
  if array_length(bad, 1) > 0 then
    return jsonb_build_object('error', '🧳 اسم الرحلة «' || array_to_string(bad, '» و«') || '» غير موجود بالرحلات — اخترها من القائمة (بحث تنبؤي) أو اتركها فارغة');
  end if;
  return jsonb_build_object('f', f); end $$;

-- كائن المجموعة ⇒ صف الشيت (29 خلية) — مقابل _vzObjToRow_
create or replace function _w_vz_raw(f jsonb) returns jsonb language sql immutable as
$$ select jsonb_build_array(f -> 'id', f -> 'seq', f -> 'ref', f -> 'status', f -> 'date', f -> 'company', f -> 'agent', f -> 'tripName',
    coalesce(f -> 'breakdown', '[]'::jsonb)::text, coalesce(f -> 'selected', '[]'::jsonb)::text, f -> 'visaCount', f -> 'price', f -> 'notes',
    f -> 'createdBy', f -> 'createdAt', f -> 'updatedBy', f -> 'updatedAt',
    f -> 'payStatus', f -> 'makkahIn', f -> 'makkahOut', f -> 'madinahIn', f -> 'madinahOut',
    f -> 'makkahHousingAgr', f -> 'madinahHousingAgr', f -> 'makkahCateringAgr', f -> 'madinahCateringAgr',
    coalesce(f -> 'housing', '[]'::jsonb)::text, f -> 'entryNo', f -> 'extraTrips') $$;

create or replace function rw2_savevisafile(a jsonb, u text) returns jsonb language plpgsql volatile set search_path = public as
$$ #variable_conflict use_column
declare
  d jsonb := coalesce(a -> 1, '{}'::jsonb); did text := _w_str(d -> 'id'); isnew boolean := did = '';
  oldrid text; oldraw jsonb; o jsonb; f jsonb; rk text; dup jsonb; bd jsonb; vc float8; price float8; stamp text := _w_stamp(); who text := coalesce(u, app_user(), '-');
  hz jsonb; h jsonb; hk jsonb; hm jsonb; tf jsonb; nextseq float8; fin boolean := app_has('visas.finance'); entries jsonb := '[]'::jsonb; rec text; k text; av text; bv text;
  lbls jsonb := jsonb_build_object('ref','رقم المجموعة','status','الحالة','date','تاريخ السداد','company','الشركة المصرية','agent','الوكيل السعودي','tripName','الرحلة المرتبطة','visaCount','العدد','price','سعر الفرد','notes','ملاحظات','payStatus','حالة السداد','entryNo','رقم القيد','extraTrips','رحلات إضافية','breakdown','بنود العملاء','selected','المعتمرون المختارون','housing','السكن والاتفاقيات');
  vzKeys text[] := array['status','breakdown','tripName','extraTrips','visaCount']; changed boolean; ts jsonb := '{}'::jsonb; t text; known jsonb := _mf_trip_names(); boot jsonb; bal jsonb := '{}'::jsonb; agents jsonb := '[]'::jsonb; trips jsonb; hasagr boolean;
begin
  if not app_has(case when isnew then 'visas.add' else 'visas.edit' end) then
    raise exception 'لا تملك صلاحية % متابعة التأشيرات والوكلاء', case when isnew then 'إضافة' else 'تعديل' end using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('store:put:vz_files', 0));

  if not isnew then
    select rid, raw into oldrid, oldraw from store_rows where tbl = 'vz_files' and _mf_str(_rx_c(raw, 0)) = did limit 1;
    if oldrid is null then return jsonb_build_object('success', false, 'error', 'القيد غير موجود'); end if;
    o := _vz_row_obj(oldraw);
  end if;

  -- 🚫 رقم المجموعة لا يتكرر
  rk := _w_dkey(d ->> 'ref');
  if rk <> '' and (isnew or _w_dkey(o ->> 'ref') <> rk) then
    select _vz_row_obj(raw) into dup from store_rows where tbl = 'vz_files' and _mf_str(_rx_c(raw, 0)) <> coalesce(o ->> 'id', '') and _mf_str(_rx_c(raw, 0)) <> '' and _w_dkey(_mf_str(_rx_c(raw, 2))) = rk limit 1;
    if dup is not null then
      return jsonb_build_object('success', false, 'dupRef', true, 'error', '🚫 رقم المجموعة «' || _mf_strt(d ->> 'ref') || '» مسجَّل من قبل (مسلسل ' || (dup ->> 'seq') || ') — لا يجوز تكرار رقم المجموعة');
    end if;
  end if;

  if jsonb_typeof(d -> 'breakdown') = 'array' then
    select coalesce(jsonb_agg(jsonb_build_object('name', _w_str(b -> 'name'), 'count', _w_num(b -> 'count'))), '[]'::jsonb) into bd from jsonb_array_elements(d -> 'breakdown') b where _w_str(b -> 'name') <> '';
  else bd := coalesce(o -> 'breakdown', '[]'::jsonb); end if;
  vc := _w_num(d -> 'visaCount');
  if vc = 0 and jsonb_array_length(bd) > 0 then select coalesce(sum(_w_num(b -> 'count')), 0) into vc from jsonb_array_elements(bd) b; end if;
  price := _w_num(d -> 'price');
  if price = 0 then price := _vz_price_at(d ->> 'agent', d ->> 'date', _vz_prices('vz_agent_prices')); end if;
  if isnew then
    select coalesce(max(_w_num(_rx_c(raw, 1))), 0) + 1 into nextseq from store_rows where tbl = 'vz_files';
    did := 'VZ' || substr(md5(random()::text || clock_timestamp()::text), 1, 11);
  end if;

  f := jsonb_build_object(
    'id', case when isnew then to_jsonb(did) else o -> 'id' end, 'seq', case when isnew then to_jsonb(nextseq) else o -> 'seq' end,
    'ref', _mf_strt(d ->> 'ref'), 'status', case when _w_str(d -> 'status') in ('', 'تم السداد') then 'تم الإرسال' else _w_str(d -> 'status') end,
    'date', _mf_datet(d ->> 'date'), 'company', _w_str(d -> 'company'), 'agent', _w_str(d -> 'agent'), 'tripName', _w_str(d -> 'tripName'),
    'breakdown', bd, 'selected', case when jsonb_typeof(d -> 'selected') = 'array' then d -> 'selected' else coalesce(o -> 'selected', '[]'::jsonb) end,
    'visaCount', vc, 'price', price, 'notes', _w_str(d -> 'notes'),
    'createdBy', case when isnew then to_jsonb(who) else o -> 'createdBy' end, 'createdAt', case when isnew then to_jsonb(stamp) else o -> 'createdAt' end,
    'updatedBy', who, 'updatedAt', stamp,
    'payStatus', _w_str(d -> 'payStatus'), 'makkahIn', _mf_datet(d ->> 'makkahIn'), 'makkahOut', _mf_datet(d ->> 'makkahOut'),
    'madinahIn', _mf_datet(d ->> 'madinahIn'), 'madinahOut', _mf_datet(d ->> 'madinahOut'),
    'makkahHousingAgr', _w_str(d -> 'makkahHousingAgr'), 'madinahHousingAgr', _w_str(d -> 'madinahHousingAgr'),
    'makkahCateringAgr', _w_str(d -> 'makkahCateringAgr'), 'madinahCateringAgr', _w_str(d -> 'madinahCateringAgr'),
    'housing', case when jsonb_typeof(d -> 'housing') = 'array' then d -> 'housing' else coalesce(o -> 'housing', '[]'::jsonb) end,
    'entryNo', _w_str(d -> 'entryNo'), 'extraTrips', _w_str(d -> 'extraTrips'));

  tf := _w_tripfix(f, o);
  if tf ? 'error' then return jsonb_build_object('success', false, 'error', tf ->> 'error'); end if;
  f := tf -> 'f';

  -- 🏨 تطبيع السكن المتعدد + مزامنة الحقول المفردة (أول فندق لكل مدينة)
  select coalesce(jsonb_agg(h), '[]'::jsonb) into hz from jsonb_array_elements(coalesce(f -> 'housing', '[]'::jsonb)) h
    where jsonb_typeof(h) = 'object' and (_w_str(h -> 'hotel') <> '' or _w_str(h -> 'in') <> '' or _w_str(h -> 'out') <> '' or _w_str(h -> 'hAgr') <> '' or _w_str(h -> 'cAgr') <> '' or _w_num(h -> 'count') <> 0);
  if jsonb_array_length(hz) = 0 then
    if (f ->> 'makkahIn') <> '' or (f ->> 'makkahOut') <> '' or (f ->> 'makkahHousingAgr') <> '' or (f ->> 'makkahCateringAgr') <> '' then
      hz := hz || jsonb_build_array(jsonb_build_object('city', 'مكة', 'hotel', '', 'count', vc, 'in', f ->> 'makkahIn', 'out', f ->> 'makkahOut', 'hAgr', f ->> 'makkahHousingAgr', 'cAgr', f ->> 'makkahCateringAgr', 'supplier', ''));
    end if;
    if (f ->> 'madinahIn') <> '' or (f ->> 'madinahOut') <> '' or (f ->> 'madinahHousingAgr') <> '' or (f ->> 'madinahCateringAgr') <> '' then
      hz := hz || jsonb_build_array(jsonb_build_object('city', 'المدينة', 'hotel', '', 'count', vc, 'in', f ->> 'madinahIn', 'out', f ->> 'madinahOut', 'hAgr', f ->> 'madinahHousingAgr', 'cAgr', f ->> 'madinahCateringAgr', 'supplier', ''));
    end if;
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('city', coalesce(nullif(_w_str(h -> 'city'), ''), 'مكة'), 'hotel', _w_str(h -> 'hotel'), 'count', _w_num(h -> 'count'),
         'in', _mf_datet(h ->> 'in'), 'out', _mf_datet(h ->> 'out'), 'hAgr', _w_str(h -> 'hAgr'), 'cAgr', _w_str(h -> 'cAgr'), 'supplier', _w_str(h -> 'supplier'))), '[]'::jsonb) into hz from jsonb_array_elements(hz) h;
  f := f || jsonb_build_object('housing', hz);
  select h into hk from jsonb_array_elements(hz) h where h ->> 'city' = 'مكة' limit 1;
  select h into hm from jsonb_array_elements(hz) h where h ->> 'city' = 'المدينة' limit 1;
  if hk is not null then f := f || jsonb_build_object('makkahIn', hk -> 'in', 'makkahOut', hk -> 'out', 'makkahHousingAgr', hk -> 'hAgr', 'makkahCateringAgr', hk -> 'cAgr'); end if;
  if hm is not null then f := f || jsonb_build_object('madinahIn', hm -> 'in', 'madinahOut', hm -> 'out', 'madinahHousingAgr', hm -> 'hAgr', 'madinahCateringAgr', hm -> 'cAgr'); end if;

  -- ===== الكتابة =====
  if isnew then
    insert into store_rows (tbl, rid, ord, raw)
      select 'vz_files', substr(md5(random()::text || clock_timestamp()::text), 1, 20), coalesce(max(ord), 0) + 1, _w_vz_raw(f) from store_rows where tbl = 'vz_files';
  else
    update store_rows set raw = _w_vz_raw(f) where tbl = 'vz_files' and rid = oldrid;
  end if;
  update store_meta set ver = ver + 1, updated_at = now() where tbl = 'vz_files';
  perform _w_dv_bump(array['visa', 'trips']);

  -- ===== سجل التعديلات =====
  rec := 'VZ:' || (f ->> 'id');
  if isnew then
    entries := jsonb_build_array(jsonb_build_object('action', 'إضافة مجموعة تأشيرات', 'recordId', rec, 'field', '-', 'oldVal', '-',
      'newVal', case when (f ->> 'ref') <> '' then 'مجموعة ' || (f ->> 'ref') else 'مسلسل ' || (f ->> 'seq') end || ' — ' || (f ->> 'agent') || ' — ' || (f ->> 'visaCount') || '×' || (f ->> 'price')));
  else
    for k in select jsonb_object_keys(lbls) loop
      av := _w_cmp(o -> k); bv := _w_cmp(f -> k);
      if av = bv then continue; end if;
      entries := entries || jsonb_build_array(jsonb_build_object('action', 'تعديل مجموعة تأشيرات', 'recordId', rec, 'field', lbls ->> k,
        'oldVal', left(coalesce(nullif(av, ''), '-'), 4000), 'newVal', left(coalesce(nullif(bv, ''), '-'), 4000)));
    end loop;
  end if;
  insert into app_outbox (kind, payload) select 'audit', jsonb_build_object('user', who, 'action', e ->> 'action', 'record', e ->> 'recordId', 'field', e ->> 'field', 'old', e ->> 'oldVal', 'new', e ->> 'newVal') from jsonb_array_elements(entries) e;
  insert into audit_log (src, rn, ts_str, ts_ms, t_ms, username, action, record_id, field, old_value, new_value, screen, screen_label)
    select 'pg', nextval('audit_pg_seq'), to_char(now() at time zone 'Asia/Riyadh', 'DD/MM/YYYY HH24:MI:SS'), (extract(epoch from now()) * 1000)::bigint, (extract(epoch from now()) * 1000)::bigint,
           who, e ->> 'action', e ->> 'recordId', e ->> 'field', coalesce(e ->> 'oldVal', '-'), coalesce(e ->> 'newVal', '-'), 'visas', 'متابعة الوكلاء' from jsonb_array_elements(entries) e;
  insert into app_outbox (kind, payload) values ('notif', jsonb_build_object('type', 'vz_saved', 'trip', f ->> 'tripName', 'perm', 'visas.view', 'user', who,
    'message', case when isnew then '🛂 مجموعة تأشيرات جديدة: ' else '✏️ تعديل مجموعة تأشيرات: ' end || case when (f ->> 'ref') <> '' then 'رقم ' || (f ->> 'ref') else '#' || (f ->> 'seq') end
      || ' — ' || (f ->> 'agent') || ' — ' || (f ->> 'visaCount') || ' تأشيرة — ' || (f ->> 'status') || case when (f ->> 'tripName') <> '' then ' — ' || (f ->> 'tripName') else '' end || ' — بواسطة ' || who));

  -- 🔄 رحلات تتأثر بحسابات العملاء
  changed := case when isnew then (f ->> 'status') = 'تم إصدار الموفا'
                  else exists (select 1 from unnest(vzKeys) kk where _w_cmp(o -> kk) <> _w_cmp(f -> kk)) end;
  if changed then
    for t in select unnest(coalesce(case when o is null then null else _mf_trips_of(o ->> 'tripName', o ->> 'extraTrips', known) end, '{}') || _mf_trips_of(f ->> 'tripName', f ->> 'extraTrips', known)) loop ts := ts || jsonb_build_object(t, 1); end loop;
  end if;
  f := f || jsonb_build_object('dueSAR', vc * price);

  -- أرصدة الوكلاء (للصلاحية المالية) من نفس محرك القراءة — الواجهة تدمجها بمفاتيحها
  if fin then
    boot := rx2_getvisabootstrap('[]'::jsonb, who);
    bal := coalesce(boot -> 'agentBalances', '{}'::jsonb);
  end if;
  trips := (select coalesce(jsonb_agg(t2), '[]'::jsonb) from unnest(_mf_trips_of(f ->> 'tripName', f ->> 'extraTrips', known)) t2);
  hasagr := exists (select 1 from jsonb_array_elements(hz) h where _w_str(h -> 'hAgr') <> '' or _w_str(h -> 'cAgr') <> '');
  return jsonb_build_object('success', true, 'file', f, 'syncTrips', (select coalesce(jsonb_agg(k2), '[]'::jsonb) from jsonb_object_keys(ts) k2))
    || case when fin then jsonb_build_object('agentBalances', bal) else '{}'::jsonb end
    || case when jsonb_array_length(trips) > 0 or (hasagr and (f ->> 'ref') <> '')
            then jsonb_build_object('lfAfter', jsonb_build_object('fn', 'vzAfterSaveBg', 'args', jsonb_build_array(null, jsonb_build_object('agents', '[]'::jsonb, 'trips', trips,
                 'syncHousing', case when hasagr and (f ->> 'ref') <> '' then f ->> 'id' else null end))))
            else '{}'::jsonb end;
end $$;

do $$ declare r record; begin
  for r in select p.oid::regprocedure::text sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and (p.proname in ('_w_tripfix', '_w_vz_raw') or p.proname = 'rw2_savevisafile') loop
    execute format('revoke all on function %s from public, anon, authenticated', r.sig);
    execute format('grant execute on function %s to service_role', r.sig);
  end loop;
end $$;
notify pgrst, 'reload schema';

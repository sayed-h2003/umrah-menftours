-- V4.444 · الدفعة 1 (مجال التأشيرات والسكن والإعاشة كاملاً) ⇒ Postgres. منطق كل دالة = نظيرتها بـ Code.gs.
-- اتفاقيات السكن وتخصيصاتها (قراءة بالمقاطع والسعة/حفظ/حذف) · الربط الثنائي مع سكن المجموعات (يشمل syncHousing بعد حفظ المجموعة)
-- · اتفاقيات الإعاشة (قراءة/حفظ/حذف/تكرار/دمج/سجل) · الحذف والاستيراد والتعديل الجماعي للمجموعات · رقم القيد · المطابقة (xcApply)
-- · اقتراحات دمج التسكين · التسكين المدموج. القيد التلقائي للإعاشة (AUTO:CAT) يُنفَّذ بصندوق الإخراج (glcat) حتى نقل محرك القيود (الدفعة 2).
-- يتطلب: 011 · 017 · 060 · 067.

-- ===== قراءات أساسية =====
create or replace function _vz_split(s text) returns text[] language sql immutable as   -- = _agrNosSplit_
$$ select coalesce(array_agg(t order by o), '{}') from (select _mf_strt(x) t, o from unnest(regexp_split_to_array(coalesce(s, ''), '[،,/\s\-–—+&]+')) with ordinality q(x, o)) z where t <> '' $$;
create or replace function _vz_ha_all() returns jsonb language sql stable set search_path = public as
$$ select coalesce(jsonb_agg(jsonb_build_object('id', _mf_str(_rx_c(raw, 0)), 'seq', _mf_num(_rx_c(raw, 1)), 'agrNo', _mf_str(_rx_c(raw, 2)), 'city', _mf_str(_rx_c(raw, 3)),
     'hotel', _mf_str(_rx_c(raw, 4)), 'capacity', _mf_num(_rx_c(raw, 5)), 'from', _mf_date(_rx_c(raw, 6)), 'to', _mf_date(_rx_c(raw, 7)), 'status', _mf_str(_rx_c(raw, 8)),
     'notes', _mf_str(_rx_c(raw, 9)), 'createdBy', _mf_str(_rx_c(raw, 10)), 'createdAt', _mf_str(_rx_c(raw, 11)), 'updatedBy', _mf_str(_rx_c(raw, 12)), 'updatedAt', _mf_str(_rx_c(raw, 13)),
     'supplier', _mf_str(_rx_c(raw, 14)), 'kind', coalesce(nullif(_mf_str(_rx_c(raw, 15)), ''), 'سكن')) order by rn), '[]'::jsonb)
   from _rx_rows('vz_housing_agreements') where _mf_str(_rx_c(raw, 0)) <> '' $$;
create or replace function _vz_alloc_all() returns jsonb language sql stable set search_path = public as
$$ select coalesce(jsonb_agg(jsonb_build_object('id', _mf_str(_rx_c(raw, 0)), 'agrId', _mf_str(_rx_c(raw, 1)), 'groupRef', _mf_str(_rx_c(raw, 2)), 'count', _mf_num(_rx_c(raw, 3)),
     'from', _mf_date(_rx_c(raw, 4)), 'to', _mf_date(_rx_c(raw, 5)), 'notes', _mf_str(_rx_c(raw, 6)), 'createdBy', _mf_str(_rx_c(raw, 7)), 'createdAt', _mf_str(_rx_c(raw, 8))) order by rn), '[]'::jsonb)
   from _rx_rows('vz_housing_allocations') where _mf_str(_rx_c(raw, 0)) <> '' $$;
-- = _vzHaSegments_: مقاطع زمنية للسعة (المستخدم/المتبقي) مع دمج المتجاور المتساوي
create or replace function _vz_segments(p_cap float8, p_from text, p_to text, p_allocs jsonb) returns jsonb language plpgsql stable as
$$ declare cap float8 := coalesce(p_cap, 0); ff float8 := _mf_ms(_mf_datet(p_from)); tt float8 := _mf_ms(_mf_datet(p_to)); used float8; pts float8[]; segs jsonb := '[]'::jsonb;
  i int; a float8; b float8; u float8; last_u float8; last_a float8; last_b float8; mr float8; mu float8; begin
  select coalesce(sum(coalesce(_mf_num(x -> 'count'), 0)), 0) into used from jsonb_array_elements(coalesce(p_allocs, '[]'::jsonb)) x;
  if ff is null or tt is null or tt <= ff then
    return jsonb_build_object('segments', jsonb_build_array(jsonb_build_object('from', coalesce(p_from, ''), 'to', coalesce(p_to, ''), 'used', used, 'remaining', cap - used)),
      'minRemaining', cap - used, 'maxUsed', used, 'totalAllocated', used); end if;
  select array_agg(distinct v order by v) into pts from (
    select ff v union select tt union
    select greatest(ff, least(tt, coalesce(_mf_ms(_mf_datet(x ->> 'from')), ff))) from jsonb_array_elements(coalesce(p_allocs, '[]'::jsonb)) x union
    select greatest(ff, least(tt, coalesce(_mf_ms(_mf_datet(x ->> 'to')), tt))) from jsonb_array_elements(coalesce(p_allocs, '[]'::jsonb)) x) z;
  for i in 1 .. array_length(pts, 1) - 1 loop
    a := pts[i]; b := pts[i + 1];
    select coalesce(sum(coalesce(_mf_num(x -> 'count'), 0)), 0) into u from jsonb_array_elements(coalesce(p_allocs, '[]'::jsonb)) x
     where greatest(ff, least(tt, coalesce(_mf_ms(_mf_datet(x ->> 'from')), ff))) <= a and greatest(ff, least(tt, coalesce(_mf_ms(_mf_datet(x ->> 'to')), tt))) >= b;
    if last_u is not null and last_u = u then last_b := b;
    else
      if last_u is not null then segs := segs || jsonb_build_array(jsonb_build_object('from', to_char(to_timestamp(last_a / 1000) at time zone 'Africa/Cairo', 'DD/MM/YYYY'),
        'to', to_char(to_timestamp(last_b / 1000) at time zone 'Africa/Cairo', 'DD/MM/YYYY'), 'used', last_u, 'remaining', cap - last_u)); end if;
      last_u := u; last_a := a; last_b := b;
    end if;
  end loop;
  if last_u is not null then segs := segs || jsonb_build_array(jsonb_build_object('from', to_char(to_timestamp(last_a / 1000) at time zone 'Africa/Cairo', 'DD/MM/YYYY'),
    'to', to_char(to_timestamp(last_b / 1000) at time zone 'Africa/Cairo', 'DD/MM/YYYY'), 'used', last_u, 'remaining', cap - last_u)); end if;
  select min((s ->> 'remaining')::float8), max((s ->> 'used')::float8) into mr, mu from jsonb_array_elements(segs) s;
  return jsonb_build_object('segments', segs, 'minRemaining', coalesce(mr, cap), 'maxUsed', coalesce(mu, 0), 'totalAllocated', used); end $$;
create or replace function _vz_group_index() returns jsonb language sql stable set search_path = public as
$$ select coalesce(jsonb_agg(jsonb_build_object('ref', f ->> 'ref', 'count', _mf_num(f -> 'visaCount'), 'agent', f ->> 'agent', 'company', f ->> 'company', 'tripName', f ->> 'tripName',
     'status', f ->> 'status', 'makkahIn', f ->> 'makkahIn', 'makkahOut', f ->> 'makkahOut', 'madinahIn', f ->> 'madinahIn', 'madinahOut', f ->> 'madinahOut',
     'clients', coalesce((select jsonb_agg(_mf_str(b -> 'name')) from jsonb_array_elements(case when jsonb_typeof(f -> 'breakdown') = 'array' then f -> 'breakdown' else '[]'::jsonb end) b), '[]'::jsonb)) order by rn), '[]'::jsonb)
   from _vz_files() where _mf_strt(f ->> 'ref') <> '' $$;
create or replace function _vz_gidx_multi(gi jsonb, p_ref text) returns jsonb language plpgsql immutable as
$$ declare gs jsonb := '[]'::jsonb; r text; begin
  foreach r in array _vz_split(p_ref) loop if gi ? r then gs := gs || jsonb_build_array(gi -> r); end if; end loop;
  if jsonb_array_length(gs) <= 1 then return coalesce(gs -> 0, gi -> _mf_strt(p_ref)); end if;
  return jsonb_build_object('clients', (select jsonb_agg(distinct c) from jsonb_array_elements(gs) g, jsonb_array_elements(g -> 'clients') c where c #>> '{}' <> ''),
    'tripName', (select string_agg(distinct g ->> 'tripName', ' + ') from jsonb_array_elements(gs) g where coalesce(g ->> 'tripName', '') <> ''),
    'agent', (select string_agg(distinct g ->> 'agent', ' + ') from jsonb_array_elements(gs) g where coalesce(g ->> 'agent', '') <> ''),
    'company', (select string_agg(distinct g ->> 'company', ' + ') from jsonb_array_elements(gs) g where coalesce(g ->> 'company', '') <> '')); end $$;
create or replace function _vz_supplier_list() returns jsonb language sql stable set search_path = public as
$$ select coalesce(jsonb_agg(s order by s), '[]'::jsonb) from (select a ->> 'supplier' s from jsonb_array_elements(_vz_ha_all()) a where coalesce(a ->> 'supplier', '') <> ''
     union select f ->> 'agent' from _vz_files() where coalesce(f ->> 'agent', '') <> '') z $$;
create or replace function _vz_catering_by_group() returns jsonb language plpgsql stable set search_path = public as
$$ declare o jsonb := '{}'::jsonb; r record; g text; city text; begin
  for r in select _mf_str(_rx_c(raw, 0)) no, _mf_str(_rx_c(raw, 2)) area, _mf_str(_rx_c(raw, 11)) grp from _rx_rows('catering_contracts') order by rn loop
    if r.no = '' then continue; end if;
    city := case when position('مكة' in r.area) > 0 or position('مكه' in r.area) > 0 then 'makkah' when position('مدين' in r.area) > 0 then 'madinah' else 'other' end;
    foreach g in array _vz_split(r.grp) loop
      if not o ? g then o := o || jsonb_build_object(g, jsonb_build_object('makkah', '[]'::jsonb, 'madinah', '[]'::jsonb, 'other', '[]'::jsonb)); end if;
      if not (o -> g -> city) @> to_jsonb(r.no) then o := jsonb_set(o, array[g, city], (o -> g -> city) || to_jsonb(r.no)); end if;
    end loop;
  end loop;
  return o; end $$;
create or replace function _vz_housing_agr_by_group() returns jsonb language plpgsql stable set search_path = public as
$$ declare o jsonb := '{}'::jsonb; ag jsonb; x jsonb; a jsonb; g text; bucket text; rec jsonb; begin
  select coalesce(jsonb_object_agg(z ->> 'id', z), '{}'::jsonb) into ag from jsonb_array_elements(_vz_ha_all()) z;
  for x in select * from jsonb_array_elements(_vz_alloc_all()) loop
    a := ag -> (x ->> 'agrId'); if a is null then continue; end if;
    bucket := case when a ->> 'city' = 'المدينة' then 'madinah' else 'makkah' end || case when coalesce(a ->> 'kind', 'سكن') = 'إعاشة' then 'Catering' else '' end;
    rec := jsonb_build_object('agrNo', a ->> 'agrNo', 'hotel', a ->> 'hotel', 'supplier', a ->> 'supplier', 'count', x -> 'count', 'from', x ->> 'from', 'to', x ->> 'to');
    foreach g in array _vz_split(x ->> 'groupRef') loop
      if not o ? g then o := o || jsonb_build_object(g, jsonb_build_object('makkah', '[]'::jsonb, 'madinah', '[]'::jsonb, 'makkahCatering', '[]'::jsonb, 'madinahCatering', '[]'::jsonb)); end if;
      if not exists (select 1 from jsonb_array_elements(o -> g -> bucket) y where y ->> 'agrNo' = rec ->> 'agrNo') then o := jsonb_set(o, array[g, bucket], (o -> g -> bucket) || rec); end if;
    end loop;
  end loop;
  return o; end $$;
-- = _vzHousingNormalize_
create or replace function _vz_hz_norm(f jsonb) returns jsonb language plpgsql stable as
$$ declare hz jsonb; begin
  select coalesce(jsonb_agg(h), '[]'::jsonb) into hz from jsonb_array_elements(case when jsonb_typeof(f -> 'housing') = 'array' then f -> 'housing' else '[]'::jsonb end) h
   where jsonb_typeof(h) = 'object' and (_w_str(h -> 'hotel') <> '' or _w_str(h -> 'in') <> '' or _w_str(h -> 'out') <> '' or _w_str(h -> 'hAgr') <> '' or _w_str(h -> 'cAgr') <> '' or coalesce(_mf_num(h -> 'count'), 0) <> 0);
  if jsonb_array_length(hz) = 0 then
    if _w_str(f -> 'makkahIn') <> '' or _w_str(f -> 'makkahOut') <> '' or _w_str(f -> 'makkahHousingAgr') <> '' or _w_str(f -> 'makkahCateringAgr') <> '' then
      hz := hz || jsonb_build_array(jsonb_build_object('city', 'مكة', 'hotel', '', 'count', coalesce(_mf_num(f -> 'visaCount'), 0), 'in', _w_str(f -> 'makkahIn'), 'out', _w_str(f -> 'makkahOut'),
        'hAgr', _w_str(f -> 'makkahHousingAgr'), 'cAgr', _w_str(f -> 'makkahCateringAgr'), 'supplier', '')); end if;
    if _w_str(f -> 'madinahIn') <> '' or _w_str(f -> 'madinahOut') <> '' or _w_str(f -> 'madinahHousingAgr') <> '' or _w_str(f -> 'madinahCateringAgr') <> '' then
      hz := hz || jsonb_build_array(jsonb_build_object('city', 'المدينة', 'hotel', '', 'count', coalesce(_mf_num(f -> 'visaCount'), 0), 'in', _w_str(f -> 'madinahIn'), 'out', _w_str(f -> 'madinahOut'),
        'hAgr', _w_str(f -> 'madinahHousingAgr'), 'cAgr', _w_str(f -> 'madinahCateringAgr'), 'supplier', '')); end if;
  end if;
  return coalesce((select jsonb_agg(jsonb_build_object('city', coalesce(nullif(_w_str(h -> 'city'), ''), 'مكة'), 'hotel', _w_str(h -> 'hotel'), 'count', coalesce(_mf_num(h -> 'count'), 0),
    'in', _mf_datet(h ->> 'in'), 'out', _mf_datet(h ->> 'out'), 'hAgr', _w_str(h -> 'hAgr'), 'cAgr', _w_str(h -> 'cAgr'), 'supplier', _w_str(h -> 'supplier')) order by o)
    from jsonb_array_elements(hz) with ordinality t(h, o)), '[]'::jsonb); end $$;

-- = _vzSyncAllocToGroup_: رقم الاتفاقية يُكتب بسكن المجموعة (أول خانة فارغة لنفس المدينة، أو سطر جديد)
create or replace function _vz_sync_alloc_to_group(agr jsonb, p_ref text, p_count float8, p_from text, p_to text, who text) returns boolean language plpgsql volatile set search_path = public as
$$ declare r record; f jsonb; hz jsonb; k text := case when coalesce(agr ->> 'kind', 'سكن') = 'إعاشة' then 'cAgr' else 'hAgr' end; i int; hit int; h jsonb; mk jsonb; md jsonb; touched boolean := false; begin
  p_ref := _mf_strt(p_ref); if p_ref = '' then return false; end if;
  perform _x_lock('vz_files');
  for r in select rid, raw from store_rows where tbl = 'vz_files' and _mf_str(_rx_c(raw, 2)) = p_ref loop
    f := _vz_row_obj(r.raw); hz := _vz_hz_norm(f); hit := null;
    for i in 0 .. jsonb_array_length(hz) - 1 loop
      if hz -> i ->> 'city' <> agr ->> 'city' then continue; end if;
      if _w_str(hz -> i -> k) = _w_str(agr -> 'agrNo') then hit := i; exit; end if;
      if _w_str(hz -> i -> k) = '' and hit is null then hit := i; end if;
    end loop;
    if hit is not null and _w_str(hz -> hit -> k) = _w_str(agr -> 'agrNo') then continue; end if;
    if hit is null then
      hz := hz || jsonb_build_array(jsonb_build_object('city', agr ->> 'city', 'hotel', _w_str(agr -> 'hotel'), 'count', coalesce(p_count, 0), 'in', _mf_datet(p_from), 'out', _mf_datet(p_to),
        'hAgr', '', 'cAgr', '', 'supplier', _w_str(agr -> 'supplier')));
      hit := jsonb_array_length(hz) - 1;
    end if;
    h := hz -> hit;
    h := jsonb_set(h, array[k], to_jsonb(_w_str(agr -> 'agrNo')));
    if _w_str(h -> 'hotel') = '' and k = 'hAgr' then h := jsonb_set(h, '{hotel}', to_jsonb(_w_str(agr -> 'hotel'))); end if;
    if _w_str(h -> 'supplier') = '' then h := jsonb_set(h, '{supplier}', to_jsonb(_w_str(agr -> 'supplier'))); end if;
    if _w_str(h -> 'in') = '' then h := jsonb_set(h, '{in}', to_jsonb(_mf_datet(p_from))); end if;
    if _w_str(h -> 'out') = '' then h := jsonb_set(h, '{out}', to_jsonb(_mf_datet(p_to))); end if;
    hz := jsonb_set(hz, array[hit::text], h);
    f := f || jsonb_build_object('housing', hz, 'updatedBy', who, 'updatedAt', _w_stamp());
    select x into mk from jsonb_array_elements(hz) x where x ->> 'city' = 'مكة' limit 1;
    select x into md from jsonb_array_elements(hz) x where x ->> 'city' = 'المدينة' limit 1;
    if mk is not null then f := f || jsonb_build_object('makkahIn', mk ->> 'in', 'makkahOut', mk ->> 'out', 'makkahHousingAgr', mk ->> 'hAgr', 'makkahCateringAgr', mk ->> 'cAgr'); end if;
    if md is not null then f := f || jsonb_build_object('madinahIn', md ->> 'in', 'madinahOut', md ->> 'out', 'madinahHousingAgr', md ->> 'hAgr', 'madinahCateringAgr', md ->> 'cAgr'); end if;
    update store_rows set raw = _w_vz_raw(f) where tbl = 'vz_files' and rid = r.rid;
    touched := true; mk := null; md := null;
  end loop;
  if touched then perform _x_bump('vz_files'); perform _w_dv_bump(array['visa']); end if;
  return touched; end $$;

-- = _vzSyncGroupCateringCore_: أرقام اتفاقيات الإعاشة بسكن المجموعة ⇒ اتفاقيات الإعاشة (رقم المجموعة يُضاف أو تُنشأ الاتفاقية)
create or replace function _vz_sync_group_catering(f jsonb, p_ref text, items jsonb, who text) returns boolean language plpgsql volatile set search_path = public as
$$ declare it jsonb; h jsonb; no_ text; rid_ text; raw_ jsonb; og text; touched boolean := false; nowj jsonb := jsonb_build_object('$d', (extract(epoch from clock_timestamp()) * 1000)::bigint); row_ jsonb; begin
  perform _x_lock('catering_contracts');
  for it in select * from jsonb_array_elements(items) loop
    h := it -> 'h'; no_ := it ->> 'no';
    select rid, raw into rid_, raw_ from store_rows where tbl = 'catering_contracts' and _mf_str(_rx_c(raw, 0)) = no_ order by ord desc limit 1;
    if rid_ is not null then
      raw_ := _x_pad(raw_, 16);
      if p_ref = any (_vz_split(_mf_str(_rx_c(raw_, 11)))) then continue; end if;
      og := _mf_str(_rx_c(raw_, 11));
      raw_ := jsonb_set(raw_, '{11}', to_jsonb(case when og <> '' then og || '، ' || p_ref else p_ref end));
      if _mf_str(_rx_c(raw_, 2)) = '' then raw_ := jsonb_set(raw_, '{2}', to_jsonb(h ->> 'city')); end if;
      if _mf_str(_rx_c(raw_, 4)) = '' then raw_ := jsonb_set(raw_, '{4}', to_jsonb(_mf_datet(h ->> 'in'))); end if;
      if _mf_str(_rx_c(raw_, 5)) = '' then raw_ := jsonb_set(raw_, '{5}', to_jsonb(_mf_datet(h ->> 'out'))); end if;
      if coalesce(_mf_num(_rx_c(raw_, 6)), 0) = 0 then raw_ := jsonb_set(raw_, '{6}', to_jsonb(coalesce(nullif(_mf_num(h -> 'count'), 0), nullif(_mf_num(f -> 'visaCount'), 0)))); end if;
      raw_ := jsonb_set(jsonb_set(raw_, '{14}', to_jsonb(who)), '{15}', nowj);
      update store_rows set raw = raw_ where tbl = 'catering_contracts' and rid = rid_;
      perform _x_aud(who, 'تعديل اتفاقية إعاشة', no_, 'رقم المجموعة', coalesce(nullif(og, ''), '-'), raw_ ->> 11);
    else
      row_ := _x_pad(jsonb_build_array(no_, '', h ->> 'city', '', _mf_datet(h ->> 'in'), _mf_datet(h ->> 'out'), coalesce(nullif(_mf_num(h -> 'count'), 0), nullif(_mf_num(f -> 'visaCount'), 0)), '', '',
        _w_str(f -> 'tripName'), _w_str(f -> 'company'), p_ref, who, nowj, '', '', '', _w_str(h -> 'supplier'), 'أُنشئت تلقائياً من مجموعة تأشيرات ' || p_ref, ''), 25);
      row_ := jsonb_set(row_, '{20}', to_jsonb(_cc_new_id()));
      perform _x_append('catering_contracts', row_);
      perform _x_aud(who, 'إنشاء اتفاقية إعاشة', no_, 'اتفاقية جديدة', '-', 'أُنشئت تلقائياً من مجموعة ' || p_ref || ' — ' || (h ->> 'city'));
    end if;
    touched := true; rid_ := null;
  end loop;
  if touched then perform _x_bump('catering_contracts'); end if;
  return touched; end $$;
create or replace function _cc_new_id() returns text language sql volatile as $$ select 'CC-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 10)) $$;

-- = _vzSyncGroupHousingAllocs_: أرقام اتفاقيات السكن/الإعاشة بسكن المجموعة ⇒ اتفاقيات + تخصيصات (تُنشأ الاتفاقية المجهولة تلقائياً)
create or replace function _vz_sync_group_housing(f jsonb, who text) returns boolean language plpgsql volatile set search_path = public as
$$ declare ref_ text := _mf_strt(f ->> 'ref'); h jsonb; no_ text; a jsonb; agrs jsonb; allocs jsonb; seq float8; nid text; st text := _w_stamp(); changed boolean := false; cat jsonb := '[]'::jsonb; lid text; begin
  if ref_ = '' then return false; end if;
  if not exists (select 1 from jsonb_array_elements(_vz_hz_norm(f)) x where _w_str(x -> 'hAgr') <> '' or _w_str(x -> 'cAgr') <> '') then return false; end if;
  perform _x_lock('vz_housing_agreements'); perform _x_lock('vz_housing_allocations');
  agrs := _vz_ha_all(); allocs := _vz_alloc_all();
  select coalesce(max((x ->> 'seq')::float8), 0) into seq from jsonb_array_elements(agrs) x;
  for h in select * from jsonb_array_elements(_vz_hz_norm(f)) loop
    foreach no_ in array _vz_split(h ->> 'hAgr') loop
      select x into a from jsonb_array_elements(agrs) x where x ->> 'agrNo' = no_ and x ->> 'city' = h ->> 'city' and coalesce(x ->> 'kind', 'سكن') = 'سكن' limit 1;
      if a is null then
        nid := 'HA' || (extract(epoch from clock_timestamp()) * 1000)::bigint || floor(random() * 999)::int; seq := seq + 1;
        a := jsonb_build_object('id', nid, 'seq', seq, 'agrNo', no_, 'city', h ->> 'city', 'hotel', _w_str(h -> 'hotel'),
          'capacity', coalesce(nullif(_mf_num(h -> 'count'), 0), _mf_num(f -> 'visaCount'), 0), 'from', h ->> 'in', 'to', h ->> 'out', 'kind', 'سكن');
        perform _x_append('vz_housing_agreements', jsonb_build_array(nid, seq, no_, h ->> 'city', a ->> 'hotel', a -> 'capacity', a ->> 'from', a ->> 'to', 'مبدئية',
          'أُنشئت تلقائياً من مجموعة تأشيرات ' || ref_, who, st, '', '', _w_str(h -> 'supplier'), 'سكن'));
        agrs := agrs || jsonb_build_array(a); changed := true;
        perform _x_aud(who, 'إضافة اتفاقية سكن', 'HA:' || nid, 'اتفاقية ' || no_ || ' — ' || (h ->> 'city'), '-',
          'أُنشئت تلقائياً من مجموعة ' || ref_ || case when coalesce(a ->> 'hotel', '') <> '' then ' · ' || (a ->> 'hotel') else '' end || ' · سعة ' || _mf_n2t((a ->> 'capacity')::float8));
      end if;
      if not exists (select 1 from jsonb_array_elements(allocs) x where x ->> 'agrId' = a ->> 'id' and ref_ = any (_vz_split(x ->> 'groupRef'))) then
        lid := 'HL' || (extract(epoch from clock_timestamp()) * 1000)::bigint || floor(random() * 999)::int;
        perform _x_append('vz_housing_allocations', jsonb_build_array(lid, a ->> 'id', ref_, coalesce(nullif(_mf_num(h -> 'count'), 0), _mf_num(f -> 'visaCount'), 0),
          coalesce(nullif(h ->> 'in', ''), a ->> 'from'), coalesce(nullif(h ->> 'out', ''), a ->> 'to'), 'ربط تلقائي من بيانات المجموعة', who, st));
        allocs := allocs || jsonb_build_array(jsonb_build_object('id', lid, 'agrId', a ->> 'id', 'groupRef', ref_)); changed := true;
        perform _x_aud(who, 'إضافة تخصيص سكن', 'HL:' || lid, 'اتفاقية ' || (a ->> 'agrNo') || ' — مجموعة ' || ref_, '-', 'ربط تلقائي من بيانات المجموعة');
      end if;
      a := null;
    end loop;
    foreach no_ in array _vz_split(h ->> 'cAgr') loop
      select x into a from jsonb_array_elements(agrs) x where x ->> 'agrNo' = no_ and x ->> 'city' = h ->> 'city' and coalesce(x ->> 'kind', 'سكن') = 'إعاشة' limit 1;
      if a is not null and not exists (select 1 from jsonb_array_elements(allocs) x where x ->> 'agrId' = a ->> 'id' and ref_ = any (_vz_split(x ->> 'groupRef'))) then
        lid := 'HL' || (extract(epoch from clock_timestamp()) * 1000)::bigint || floor(random() * 999)::int;
        perform _x_append('vz_housing_allocations', jsonb_build_array(lid, a ->> 'id', ref_, coalesce(nullif(_mf_num(h -> 'count'), 0), _mf_num(f -> 'visaCount'), 0),
          coalesce(nullif(h ->> 'in', ''), a ->> 'from'), coalesce(nullif(h ->> 'out', ''), a ->> 'to'), 'ربط تلقائي من بيانات المجموعة', who, st));
        allocs := allocs || jsonb_build_array(jsonb_build_object('id', lid, 'agrId', a ->> 'id', 'groupRef', ref_)); changed := true;
      end if;
      cat := cat || jsonb_build_array(jsonb_build_object('no', no_, 'h', h)); a := null;
    end loop;
  end loop;
  if changed then perform _x_bump('vz_housing_agreements'); perform _x_bump('vz_housing_allocations'); end if;
  if jsonb_array_length(cat) > 0 and _vz_sync_group_catering(f, ref_, cat, who) then changed := true; end if;
  if changed then perform _w_dv_bump(array['visa']); end if;
  return changed; end $$;

-- ===== اتفاقيات السكن والتخصيصات =====
create or replace function rx2_gethousingagreements(a jsonb, u text) returns jsonb language plpgsql stable set search_path = public as
$$ declare fl jsonb := coalesce(a -> 1, '{}'::jsonb); fm float8 := _mf_ms(_mf_datet(fl ->> 'from')); tm float8 := _mf_ms(_mf_datet(fl ->> 'to')); onm float8 := _mf_ms(_mf_datet(fl ->> 'onDate'));
  gl jsonb := _vz_group_index(); gi jsonb; ags jsonb := '[]'::jsonb; ag jsonb; al jsonb; allocs jsonb := _vz_alloc_all(); av jsonb; g jsonb; c jsonb; seg jsonb; f2 float8; t2 float8; cs jsonb; begin
  perform _x_perm('visas.view', 'لا تملك صلاحية عرض متابعة التأشيرات والوكلاء');
  select coalesce(jsonb_object_agg(x ->> 'ref', x), '{}'::jsonb) into gi from jsonb_array_elements(gl) x;
  for ag in select * from jsonb_array_elements(_vz_ha_all()) loop
    cs := '[]'::jsonb;
    for c in select x from jsonb_array_elements(allocs) x where x ->> 'agrId' = ag ->> 'id' loop
      g := _vz_gidx_multi(gi, c ->> 'groupRef');
      f2 := _mf_ms(_mf_datet(c ->> 'from')); t2 := _mf_ms(_mf_datet(c ->> 'to'));
      cs := cs || jsonb_build_array(c || jsonb_build_object('clients', coalesce(g -> 'clients', '[]'::jsonb), 'tripName', coalesce(g ->> 'tripName', ''), 'agent', coalesce(g ->> 'agent', ''),
        'company', coalesce(g ->> 'company', ''), 'onDate', onm is not null and f2 is not null and t2 is not null and onm >= f2 and onm < t2));
    end loop;
    av := _vz_segments((ag ->> 'capacity')::float8, ag ->> 'from', ag ->> 'to', cs);
    ag := ag || jsonb_build_object('allocations', cs, 'segments', av -> 'segments', 'minRemaining', av -> 'minRemaining', 'totalAllocated', av -> 'totalAllocated');
    if onm is not null then
      select s into seg from jsonb_array_elements(av -> 'segments') s where _mf_ms(s ->> 'from') is not null and onm >= _mf_ms(s ->> 'from') and onm < _mf_ms(s ->> 'to') order by _mf_ms(s ->> 'from') desc limit 1;
      ag := ag || jsonb_build_object('onDateUsed', coalesce((seg ->> 'used')::float8, 0), 'onDateRemaining', coalesce((seg ->> 'remaining')::float8, (ag ->> 'capacity')::float8),
        'onDateGroups', coalesce((select jsonb_agg(x) from jsonb_array_elements(cs) x where (x ->> 'onDate')::boolean), '[]'::jsonb),
        'onDateInside', seg is not null or exists (select 1 from jsonb_array_elements(cs) x where (x ->> 'onDate')::boolean));
      seg := null;
    end if;
    f2 := _mf_ms(ag ->> 'from'); t2 := _mf_ms(ag ->> 'to');
    if (fm is not null or tm is not null) then
      if f2 is null and t2 is null then continue; end if;
      f2 := coalesce(f2, t2); t2 := coalesce(t2, f2);
      if not (f2 <= coalesce(tm, 8.64e15) and t2 >= coalesce(fm, -8.64e15)) then continue; end if;
    end if;
    if onm is not null and coalesce((fl ->> 'onlyOnDate')::boolean, false) and not coalesce((ag ->> 'onDateInside')::boolean, false) then continue; end if;
    ags := ags || jsonb_build_array(ag);
  end loop;
  select coalesce(jsonb_agg(x order by (x ->> 'seq')::float8 desc), '[]'::jsonb) into ags from jsonb_array_elements(ags) x;
  return jsonb_build_object('success', true, 'agreements', ags, 'groups', gl, 'cities', '["مكة","المدينة"]'::jsonb, 'kinds', '["سكن","إعاشة"]'::jsonb,
    'suppliers', _vz_supplier_list(), 'onDate', _mf_datet(fl ->> 'onDate'), 'today', _mf_today()); end $$;

create or replace function rw2_savehousingagreement(a jsonb, u text) returns jsonb language plpgsql volatile set search_path = public as
$$ declare d jsonb := coalesce(a -> 1, '{}'::jsonb); who text := coalesce(u, app_user(), '-'); isnew boolean := _w_str(d -> 'id') = ''; agrno text := _w_str(d -> 'agrNo'); city text := _w_str(d -> 'city');
  kind text := coalesce(nullif(_w_str(d -> 'kind'), ''), 'سكن'); all_ jsonb; dup jsonb; cur jsonb; sid text; seq float8; st text := _w_stamp(); row_ jsonb; rid_ text; ref_ text; linked text[] := '{}'; cnt float8; lid text; ag jsonb; begin
  perform _x_perm(case when isnew then 'visas.add' else 'visas.edit' end, 'لا تملك صلاحية ' || case when isnew then 'الإضافة' else 'التعديل' end || ' بمتابعة التأشيرات والوكلاء');
  if agrno = '' then raise exception 'أدخل رقم الاتفاقية' using errcode = 'P0001'; end if;
  if city not in ('مكة', 'المدينة') then raise exception 'اختر المدينة (مكة أو المدينة)' using errcode = 'P0001'; end if;
  perform _x_lock('vz_housing_agreements');
  all_ := _vz_ha_all();
  select coalesce(jsonb_agg(x), '[]'::jsonb) into dup from jsonb_array_elements(all_) x
   where upper(regexp_replace(x ->> 'agrNo', '\s+', '', 'g')) = upper(regexp_replace(agrno, '\s+', '', 'g')) and coalesce(x ->> 'kind', 'سكن') = kind and x ->> 'id' <> _w_str(d -> 'id');
  if isnew and jsonb_array_length(dup) = 1 and (dup -> 0 ->> 'notes') ~ 'أُنشئت تلقائياً' then
    d := jsonb_set(d, '{id}', to_jsonb(dup -> 0 ->> 'id')); isnew := false;
    if _w_str(d -> 'notes') = '' or _w_str(d -> 'notes') ~ 'أُنشئت تلقائياً' then d := jsonb_set(d, '{notes}', to_jsonb(regexp_replace(dup -> 0 ->> 'notes', 'أُنشئت تلقائياً', 'أُنشئت تلقائياً ثم استُكملت من ملف'))); end if;
    dup := '[]'::jsonb;
  end if;
  if jsonb_array_length(dup) > 0 then raise exception '%', 'رقم الاتفاقية ' || agrno || ' مسجَّل من قبل (اتفاقية ' || kind || ' في ' || (dup -> 0 ->> 'city') ||
    case when coalesce(dup -> 0 ->> 'hotel', '') <> '' then ' — ' || (dup -> 0 ->> 'hotel') else '' end || ') — لا يُقبل تكرار رقم الاتفاقية' using errcode = 'P0001'; end if;
  row_ := jsonb_build_array(null, 0, agrno, city, _w_str(d -> 'hotel'), coalesce(_mf_num(d -> 'capacity'), 0), _mf_datet(d ->> 'from'), _mf_datet(d ->> 'to'), _w_str(d -> 'status'), _w_str(d -> 'notes'));
  if isnew then
    select coalesce(max((x ->> 'seq')::float8), 0) + 1 into seq from jsonb_array_elements(all_) x;
    sid := 'HA' || (extract(epoch from clock_timestamp()) * 1000)::bigint;
    perform _x_append('vz_housing_agreements', jsonb_set(jsonb_set(row_, '{0}', to_jsonb(sid)), '{1}', to_jsonb(seq)) || jsonb_build_array(who, st, '', '', _w_str(d -> 'supplier'), kind));
  else
    select x into cur from jsonb_array_elements(all_) x where x ->> 'id' = _w_str(d -> 'id');
    if cur is null then raise exception 'الاتفاقية غير موجودة' using errcode = 'P0001'; end if;
    sid := cur ->> 'id';
    select rid into rid_ from store_rows where tbl = 'vz_housing_agreements' and _mf_str(_rx_c(raw, 0)) = sid order by ord limit 1;
    update store_rows set raw = jsonb_set(jsonb_set(row_, '{0}', to_jsonb(sid)), '{1}', cur -> 'seq') || jsonb_build_array(cur ->> 'createdBy', cur ->> 'createdAt', who, st, _w_str(d -> 'supplier'), kind)
     where tbl = 'vz_housing_agreements' and rid = rid_;
  end if;
  perform _x_bump('vz_housing_agreements');
  ag := jsonb_build_object('agrNo', agrno, 'city', city, 'kind', kind, 'hotel', _w_str(d -> 'hotel'), 'supplier', _w_str(d -> 'supplier'));
  cnt := coalesce(nullif(_mf_num(d -> 'groupCount'), 0), _mf_num(d -> 'capacity'), 0);
  foreach ref_ in array _vz_split(d ->> 'groupRef') loop
    begin
      perform _x_lock('vz_housing_allocations');
      if not exists (select 1 from jsonb_array_elements(_vz_alloc_all()) x where x ->> 'agrId' = sid and ref_ = any (_vz_split(x ->> 'groupRef'))) then
        lid := 'HL' || (extract(epoch from clock_timestamp()) * 1000)::bigint || floor(random() * 999)::int;
        perform _x_append('vz_housing_allocations', jsonb_build_array(lid, sid, ref_, cnt, _mf_datet(d ->> 'from'), _mf_datet(d ->> 'to'), 'ربط تلقائي من بيانات الاتفاقية', who, st));
        perform _x_bump('vz_housing_allocations');
        perform _x_aud(who, 'إضافة تخصيص سكن', 'HL:' || lid, 'اتفاقية ' || agrno || ' — مجموعة ' || ref_, '-', 'ربط تلقائي من بيانات الاتفاقية');
      end if;
      perform _vz_sync_alloc_to_group(ag, ref_, cnt, d ->> 'from', d ->> 'to', who);
      linked := linked || ref_;
    exception when others then null; end;
  end loop;
  perform _w_dv_bump(array['visa']);
  perform _x_aud(who, case when isnew then 'إضافة اتفاقية سكن' else 'تعديل اتفاقية سكن' end || case when kind = 'إعاشة' then ' (إعاشة)' else '' end, 'HA:' || sid, 'اتفاقية ' || agrno || ' — ' || city, '-',
    array_to_string(array_remove(array[_w_str(d -> 'hotel'), 'سعة ' || _mf_n2t(coalesce(_mf_num(d -> 'capacity'), 0)), _mf_datet(d ->> 'from') || ' → ' || _mf_datet(d ->> 'to'), _w_str(d -> 'status')], ''), ' · '));
  return jsonb_build_object('success', true, 'id', sid, 'linkedGroups', to_jsonb(linked)); end $$;

create or replace function rw2_savehousingallocation(a jsonb, u text) returns jsonb language plpgsql volatile set search_path = public as
$$ declare d jsonb := coalesce(a -> 1, '{}'::jsonb); who text := coalesce(u, app_user(), '-'); isnew boolean := _w_str(d -> 'id') = ''; ag jsonb; ref_ text := _w_str(d -> 'groupRef'); cnt float8 := coalesce(_mf_num(d -> 'count'), 0);
  fr text; tt text; others jsonb; av jsonb; bad jsonb; id_ text; cur jsonb; rid_ text; r1 text; begin
  perform _x_perm(case when isnew then 'visas.add' else 'visas.edit' end, 'لا تملك صلاحية ' || case when isnew then 'الإضافة' else 'التعديل' end || ' بمتابعة التأشيرات والوكلاء');
  select x into ag from jsonb_array_elements(_vz_ha_all()) x where x ->> 'id' = _w_str(d -> 'agrId');
  if ag is null then raise exception 'اختر اتفاقية صحيحة' using errcode = 'P0001'; end if;
  if ref_ = '' then raise exception 'أدخل رقم المجموعة' using errcode = 'P0001'; end if;
  if cnt <= 0 then raise exception 'أدخل عدداً أكبر من صفر' using errcode = 'P0001'; end if;
  fr := coalesce(nullif(_mf_datet(d ->> 'from'), ''), ag ->> 'from'); tt := coalesce(nullif(_mf_datet(d ->> 'to'), ''), ag ->> 'to');
  perform _x_lock('vz_housing_allocations');
  select coalesce(jsonb_agg(x), '[]'::jsonb) into others from jsonb_array_elements(_vz_alloc_all()) x where x ->> 'agrId' = ag ->> 'id' and x ->> 'id' <> _w_str(d -> 'id');
  av := _vz_segments((ag ->> 'capacity')::float8, ag ->> 'from', ag ->> 'to', others || jsonb_build_array(jsonb_build_object('count', cnt, 'from', fr, 'to', tt)));
  if (av ->> 'minRemaining')::float8 < 0 then
    select s into bad from jsonb_array_elements(av -> 'segments') s where (s ->> 'remaining')::float8 < 0 limit 1;
    raise exception '%', 'تجاوز سعة الاتفاقية: المطلوب يفوق المتاح بـ ' || _mf_n2t(abs((bad ->> 'remaining')::float8)) || ' في الفترة ' || (bad ->> 'from') || ' → ' || (bad ->> 'to') using errcode = 'P0001';
  end if;
  if isnew then
    id_ := 'HL' || (extract(epoch from clock_timestamp()) * 1000)::bigint;
    perform _x_append('vz_housing_allocations', jsonb_build_array(id_, ag ->> 'id', ref_, cnt, fr, tt, _w_str(d -> 'notes'), who, _w_stamp()));
  else
    select x into cur from jsonb_array_elements(_vz_alloc_all()) x where x ->> 'id' = _w_str(d -> 'id');
    if cur is null then raise exception 'التخصيص غير موجود' using errcode = 'P0001'; end if;
    id_ := cur ->> 'id';
    select rid into rid_ from store_rows where tbl = 'vz_housing_allocations' and _mf_str(_rx_c(raw, 0)) = id_ order by ord limit 1;
    update store_rows set raw = jsonb_build_array(id_, ag ->> 'id', ref_, cnt, fr, tt, _w_str(d -> 'notes'), cur ->> 'createdBy', cur ->> 'createdAt') where tbl = 'vz_housing_allocations' and rid = rid_;
  end if;
  perform _x_bump('vz_housing_allocations');
  foreach r1 in array _vz_split(ref_) loop begin perform _vz_sync_alloc_to_group(ag, r1, cnt, fr, tt, who); exception when others then null; end; end loop;
  perform _w_dv_bump(array['visa']);
  perform _x_aud(who, case when isnew then 'إضافة تخصيص سكن' else 'تعديل تخصيص سكن' end, 'HL:' || id_, 'اتفاقية ' || (ag ->> 'agrNo') || ' — مجموعة ' || ref_, '-', _mf_n2t(cnt) || ' فرد · ' || fr || ' → ' || tt);
  return jsonb_build_object('success', true); end $$;

create or replace function rw2_deletehousingagreement(a jsonb, u text) returns jsonb language plpgsql volatile set search_path = public as
$$ declare who text := coalesce(u, app_user(), '-'); id_ text := _w_str(a -> 1); ag jsonb; begin
  perform _x_perm('visas.delete', 'لا تملك صلاحية الحذف من متابعة التأشيرات والوكلاء');
  select x into ag from jsonb_array_elements(_vz_ha_all()) x where x ->> 'id' = id_;
  if ag is null then raise exception 'الاتفاقية غير موجودة' using errcode = 'P0001'; end if;
  perform _x_lock('vz_housing_agreements'); perform _x_lock('vz_housing_allocations');
  perform _rb_on('housing', 'اتفاقية سكن ' || (ag ->> 'agrNo') || ' وتخصيصاتها', ag ->> 'city', who);
  delete from store_rows where tbl = 'vz_housing_allocations' and _mf_str(_rx_c(raw, 1)) = id_;
  delete from store_rows where tbl = 'vz_housing_agreements' and _mf_str(_rx_c(raw, 0)) = id_;
  perform _x_bump('vz_housing_agreements'); perform _x_bump('vz_housing_allocations'); perform _w_dv_bump(array['visa']);
  perform _x_aud(who, 'حذف اتفاقية سكن' || case when coalesce(ag ->> 'kind', 'سكن') = 'إعاشة' then ' (إعاشة)' else '' end, 'HA:' || id_, 'اتفاقية ' || (ag ->> 'agrNo') || ' — ' || (ag ->> 'city'),
    array_to_string(array_remove(array[ag ->> 'hotel', 'سعة ' || _mf_n2t((ag ->> 'capacity')::float8)], ''), ' · '), '-');
  return jsonb_build_object('success', true); end $$;
create or replace function rw2_deletehousingallocation(a jsonb, u text) returns jsonb language plpgsql volatile set search_path = public as
$$ declare who text := coalesce(u, app_user(), '-'); id_ text := _w_str(a -> 1); x jsonb; begin
  perform _x_perm('visas.delete', 'لا تملك صلاحية الحذف من متابعة التأشيرات والوكلاء');
  select z into x from jsonb_array_elements(_vz_alloc_all()) z where z ->> 'id' = id_;
  if x is null then raise exception 'التخصيص غير موجود' using errcode = 'P0001'; end if;
  perform _x_lock('vz_housing_allocations');
  perform _rb_on('housing', 'تخصيص سكن مجموعة ' || (x ->> 'groupRef'), '', who);
  delete from store_rows where tbl = 'vz_housing_allocations' and _mf_str(_rx_c(raw, 0)) = id_;
  perform _x_bump('vz_housing_allocations'); perform _w_dv_bump(array['visa']);
  perform _x_aud(who, 'حذف تخصيص سكن', 'HL:' || id_, 'مجموعة ' || (x ->> 'groupRef'), _mf_n2t((x ->> 'count')::float8) || ' فرد · ' || (x ->> 'from') || ' → ' || (x ->> 'to'), '-');
  return jsonb_build_object('success', true); end $$;
create or replace function rx2_gethousingcateringbygroup(a jsonb, u text) returns jsonb language plpgsql stable set search_path = public as
$$ begin
  if app_user() is null then raise exception 'غير مصرّح' using errcode = '42501'; end if;
  return jsonb_build_object('success', true, 'cateringByGroup', _vz_catering_by_group(), 'housingByGroup', _vz_housing_agr_by_group()); end $$;

-- ===== اتفاقيات الإعاشة =====
create or replace function _cc_perm(cap text) returns void language plpgsql stable as
$$ begin if not (app_has('catering.' || cap) or app_has('accounts.' || cap)) then
  raise exception '%', 'لا تملك صلاحية ' || case cap when 'view' then 'عرض' when 'add' then 'إضافة' when 'edit' then 'تعديل' when 'delete' then 'حذف' else cap end || ' اتفاقيات الإعاشة' using errcode = '42501'; end if; end $$;
create or replace function _cc_dfmt(c jsonb) returns text language sql stable as   -- تاريخ ⇒ dd/MM/yyyy (نص كما هو)
$$ select case when jsonb_typeof(c) = 'object' and c ? '$d' then to_char(to_timestamp((c ->> '$d')::float8 / 1000) at time zone 'Africa/Cairo', 'DD/MM/YYYY') else coalesce(_rx_s(c), '') end $$;
create or replace function _cc_acc_check(code text, lbl text) returns void language plpgsql stable set search_path = public as
$$ declare ac record; begin
  code := btrim(coalesce(code, '')); if code = '' then return; end if;
  select * into ac from gl_accounts where gl_accounts.code = _cc_acc_check.code;
  if not found then return; end if;
  if coalesce(ac.is_group, false) or not coalesce(ac.active, true) then raise exception '%', lbl || ': الحساب ' || code || ' غير موجود أو ليس حساباً فرعياً فعّالاً' using errcode = 'P0001'; end if;
  if coalesce(ac.kind, '') ~ '^(client|trip|supplier|agent)$' or app_has('gl.approve') or app_has('gl_auto.edit') or app_has('gl.edit') then return; end if;
  raise exception '%', lbl || ': «' || ac.name || '» ليس حساب عميل/رحلة/مورد/وكيل — اختيار حسابات أخرى يحتاج صلاحية تعديل «القيود التلقائية والاعتماد»' using errcode = 'P0001'; end $$;
create or replace function rx2_getcateringcontracts(a jsonb, u text) returns jsonb language plpgsql stable set search_path = public as
$$ declare glE jsonb := '{}'::jsonb; res jsonb; begin
  perform _cc_perm('view');
  begin
    select coalesce(jsonb_object_agg(k, v), '{}'::jsonb) into glE from (
      select distinct on (substr(source_key, 10)) substr(source_key, 10) k, jsonb_build_object('id', entry_id, 'status', status, 'base', total_base,
               'pending', exists (select 1 from _rx_rows('gl_pending') p where _rx_trim(_rx_s(_rx_c(p.raw, 0))) = e.source_key)) v
        from gl_entries e where source_key like 'AUTO:CAT:%' order by substr(source_key, 10), (status = 'مرحّل') desc, created_at desc) z;
  exception when others then glE := '{}'::jsonb; end;
  select coalesce(jsonb_agg(jsonb_build_object('contractNo', no, 'provider', _mf_str(_rx_c(raw, 1)), 'area', _mf_str(_rx_c(raw, 2)), 'days', coalesce(_ac_num(_rx_c(raw, 3)), 0),
      'fromDate', _cc_dfmt(_rx_c(raw, 4)), 'toDate', _cc_dfmt(_rx_c(raw, 5)), 'pilgrims', coalesce(_ac_num(_rx_c(raw, 6)), 0), 'duration', coalesce(_ac_num(_rx_c(raw, 7)), 0),
      'totalAmount', coalesce(_ac_num(_rx_c(raw, 8)), 0), 'tripClient', _mf_str(_rx_c(raw, 9)), 'umrahCompany', _mf_str(_rx_c(raw, 10)), 'groupNo', _mf_str(_rx_c(raw, 11)),
      'createdBy', _mf_str(_rx_c(raw, 12)), 'createdAt', _cc_dfmt(_rx_c(raw, 13)), 'updatedBy', _mf_str(_rx_c(raw, 14)), 'updatedAt', _cc_dfmt(_rx_c(raw, 15)),
      'sourceFile', _mf_str(_rx_c(raw, 16)), 'vendor', _mf_str(_rx_c(raw, 17)), 'notes', _mf_str(_rx_c(raw, 18)), 'attachmentUrl', _mf_str(_rx_c(raw, 19)),
      'id', _mf_str(_rx_c(raw, 20)), 'vendorAcc', _mf_str(_rx_c(raw, 21)), 'vendorAccName', coalesce((select name from gl_accounts g where g.code = _mf_str(_rx_c(raw, 21))), ''),
      'targetAcc', _mf_str(_rx_c(raw, 22)), 'targetAccName', coalesce((select name from gl_accounts g where g.code = _mf_str(_rx_c(raw, 22))), ''),
      'sellAmount', coalesce(to_jsonb(nullif(_ac_num(_rx_c(raw, 23)), 0)), '""'::jsonb), 'manualEntryNo', _mf_str(_rx_c(raw, 24)), 'glEntry', glE -> _mf_str(_rx_c(raw, 20))) order by rn), '[]'::jsonb)
    into res from (select rn, raw, _mf_str(_rx_c(raw, 0)) no from _rx_rows('catering_contracts')) z where no <> '';
  return jsonb_build_object('success', true, 'contracts', res); end $$;
create or replace function rx2_findduplicatecateringcontracts(a jsonb, u text) returns jsonb language plpgsql stable set search_path = public as
$$ declare res jsonb; begin
  perform _cc_perm('view');
  with r as (select rn, raw, _mf_str(_rx_c(raw, 0)) no from _rx_rows('catering_contracts')),
       d as (select no from r where no <> '' group by no having count(*) > 1)
  select coalesce(jsonb_agg(jsonb_build_object('contractNo', d.no, 'rows', (select jsonb_agg(jsonb_build_object('rowIndex', rn + 1, 'contractNo', no, 'provider', _mf_str(_rx_c(raw, 1)), 'area', _mf_str(_rx_c(raw, 2)),
      'days', coalesce(_rx_s(_rx_c(raw, 3)), ''), 'fromDate', _cc_dfmt(_rx_c(raw, 4)), 'toDate', _cc_dfmt(_rx_c(raw, 5)), 'pilgrims', coalesce(_rx_s(_rx_c(raw, 6)), ''), 'duration', coalesce(_rx_s(_rx_c(raw, 7)), ''),
      'totalAmount', coalesce(_rx_s(_rx_c(raw, 8)), ''), 'tripClient', _mf_str(_rx_c(raw, 9)), 'umrahCompany', _mf_str(_rx_c(raw, 10)), 'groupNo', _mf_str(_rx_c(raw, 11)), 'createdBy', _mf_str(_rx_c(raw, 12)),
      'createdAt', _cc_dfmt(_rx_c(raw, 13)), 'sourceFile', _mf_str(_rx_c(raw, 16)), 'vendor', _mf_str(_rx_c(raw, 17)), 'notes', _mf_str(_rx_c(raw, 18))) order by rn) from r where r.no = d.no)) order by d.no), '[]'::jsonb)
    into res from d;
  return jsonb_build_object('success', true, 'groups', res); end $$;
create or replace function rx2_getcateringcontracthistory(a jsonb, u text) returns jsonb language plpgsql stable set search_path = public as
$$ begin perform _cc_perm('view');
  return coalesce((select jsonb_agg(jsonb_build_object('timestamp', ts, 'username', who, 'action', act, 'field', fld, 'oldValue', ov, 'newValue', nv) order by t desc) from _aud_hist(btrim(coalesce(a ->> 1, '')))), '[]'::jsonb); end $$;

-- قيد الإعاشة التلقائي (AUTO:CAT) ⇒ صندوق الإخراج حتى نقل محرك القيود
create or replace function _cc_gl_post(ids text[], who text) returns void language sql volatile set search_path = public as
$$ insert into app_outbox (kind, payload) select 'glcat', jsonb_build_object('ids', to_jsonb(ids), 'user', who) where coalesce(array_length(ids, 1), 0) > 0 $$;
create or replace function rw2_deletecateringcontract(a jsonb, u text) returns jsonb language plpgsql volatile set search_path = public as
$$ declare who text := coalesce(u, app_user(), '-'); no_ text := _w_str(a -> 1); rid_in text := _w_str(a -> 2); rid_ text; raw_ jsonb; begin
  perform _cc_perm('delete');
  if no_ = '' and rid_in = '' then return jsonb_build_object('success', false, 'error', 'رقم الاتفاقية مطلوب'); end if;
  perform _x_lock('catering_contracts');
  if rid_in <> '' then select rid, raw into rid_, raw_ from store_rows where tbl = 'catering_contracts' and _mf_str(_rx_c(raw, 20)) = rid_in order by ord limit 1; end if;
  if rid_ is null and no_ <> '' then select rid, raw into rid_, raw_ from store_rows where tbl = 'catering_contracts' and _mf_str(_rx_c(raw, 0)) = no_ order by ord limit 1; end if;
  if rid_ is null then return jsonb_build_object('success', false, 'error', 'الاتفاقية غير موجودة'); end if;
  perform _rb_on('catering', 'اتفاقية إعاشة ' || _mf_str(_rx_c(raw_, 0)), _mf_str(_rx_c(raw_, 1)), who);
  delete from store_rows where tbl = 'catering_contracts' and rid = rid_;
  perform _x_bump('catering_contracts'); perform _w_dv_bump(array['visa']);
  perform _x_aud(who, 'حذف اتفاقية إعاشة', _mf_str(_rx_c(raw_, 0)), 'CateringContracts', '-', 'حُذفت الاتفاقية رقم ' || _mf_str(_rx_c(raw_, 0)));
  perform _cc_gl_post(array_remove(array[_mf_str(_rx_c(raw_, 20))], ''), who);
  return jsonb_build_object('success', true, 'gl', jsonb_build_object('queued', true)); end $$;
create or replace function rw2_mergecateringduplicates(a jsonb, u text) returns jsonb language plpgsql volatile set search_path = public as
$$ declare who text := coalesce(u, app_user(), '-'); no_ text := _w_str(a -> 1); ms jsonb; mg jsonb; k int; m int; v jsonb; srcs text[] := '{}'; s text; ids text[] := '{}'; keep_rid text; begin
  perform _cc_perm('edit');
  if no_ = '' then return jsonb_build_object('success', false, 'error', 'رقم الاتفاقية مطلوب'); end if;
  perform _x_lock('catering_contracts');
  select coalesce(jsonb_agg(jsonb_build_object('rid', rid, 'v', _x_pad(raw, 25)) order by ord, rid), '[]'::jsonb) into ms from store_rows where tbl = 'catering_contracts' and _mf_str(_rx_c(raw, 0)) = no_;
  if jsonb_array_length(ms) < 2 then return jsonb_build_object('success', false, 'error', 'لا يوجد تكرار فعلي لهذا الرقم'); end if;
  mg := ms -> 0 -> 'v'; keep_rid := ms -> 0 ->> 'rid';
  foreach k in array array[0,1,2,3,4,5,6,7,8,9,10,11,17,18,21,22,23,24] loop
    if coalesce(mg ->> k, '') <> '' then continue; end if;
    for m in 1 .. jsonb_array_length(ms) - 1 loop v := ms -> m -> 'v' -> k; if coalesce(v #>> '{}', '') <> '' then mg := jsonb_set(mg, array[k::text], v); exit; end if; end loop;
  end loop;
  for m in 0 .. jsonb_array_length(ms) - 1 loop s := _mf_str(ms -> m -> 'v' -> 16); if s <> '' and not (s = any (srcs)) then srcs := srcs || s; end if; end loop;
  mg := jsonb_set(jsonb_set(mg, '{14}', to_jsonb(who)), '{15}', jsonb_build_object('$d', (extract(epoch from clock_timestamp()) * 1000)::bigint));
  if array_length(srcs, 1) > 0 then mg := jsonb_set(mg, '{16}', to_jsonb(array_to_string(srcs, ' + '))); end if;
  if coalesce(mg ->> 20, '') = '' then mg := jsonb_set(mg, '{20}', to_jsonb(_cc_new_id())); end if;
  update store_rows set raw = mg where tbl = 'catering_contracts' and rid = keep_rid;
  for m in 1 .. jsonb_array_length(ms) - 1 loop s := _mf_str(ms -> m -> 'v' -> 20); if s <> '' then ids := ids || s; end if; end loop;
  delete from store_rows where tbl = 'catering_contracts' and _mf_str(_rx_c(raw, 0)) = no_ and rid <> keep_rid;
  perform _x_bump('catering_contracts'); perform _w_dv_bump(array['visa']);
  perform _x_aud(who, 'دمج اتفاقيات إعاشة مكرَّرة', no_, 'CateringContracts', '-', 'دُمجت ' || jsonb_array_length(ms) || ' نسخة لرقم الاتفاقية ' || no_ || ' في صف واحد');
  perform _cc_gl_post(ids || (mg ->> 20), who);
  return jsonb_build_object('success', true, 'mergedCount', jsonb_array_length(ms)); end $$;

-- = saveCateringContracts: إنشاء/تعديل صريح/إكمال الفارغ + ربط المجموعات + القيد التلقائي
create or replace function rw2_savecateringcontracts(a jsonb, u text) returns jsonb language plpgsql volatile set search_path = public as
$$ declare who text := coalesce(u, app_user(), '-'); c jsonb; no_ text; nv jsonb; hrid text; hraw jsonb; o jsonb; orig jsonb; cr int := 0; up int := 0; sk int := 0; post text[] := '{}'; k int; filled boolean;
  nowj jsonb := jsonb_build_object('$d', (extract(epoch from clock_timestamp()) * 1000)::bigint); hdr text[] := array['رقم الاتفاقية','اسم مقدم الخدمة','منطقة الخدمة','عدد أيام الاتفاقية','تاريخ بداية الاتفاقية','تاريخ نهاية الاتفاقية',
  'عدد المعتمرين','المدة','المبلغ الإجمالي للمعتمرين','العميل / الرحلة','اسم شركة العمرة','رقم المجموعة','أنشئ بواسطة','أنشئ في','عُدّل بواسطة','عُدّل في','مصدر الملف','المورد','ملاحظات','رابط مرفق الاتفاقية',
  'معرف الاتفاقية','حساب المورد','حساب العميل / الرحلة','سعر البيع','رقم القيد اليدوي']; ov text; nvs text; nlog int := 0; grp text; area text; city text; linked int := 0; cur jsonb; begin
  perform _cc_perm('add');
  if jsonb_typeof(a -> 1) <> 'array' or jsonb_array_length(a -> 1) = 0 then return jsonb_build_object('success', false, 'error', 'لا توجد اتفاقيات للحفظ'); end if;
  perform _x_lock('catering_contracts');
  for c in select * from jsonb_array_elements(a -> 1) loop
    no_ := _w_str(c -> 'contractNo'); if no_ = '' then sk := sk + 1; continue; end if;
    nv := jsonb_build_array(no_, _w_str(c -> 'provider'), _w_str(c -> 'area'), coalesce(to_jsonb(nullif(_ac_num(c -> 'days'), 0)), '""'), _w_str(c -> 'fromDate'), _w_str(c -> 'toDate'),
      coalesce(to_jsonb(nullif(_ac_num(c -> 'pilgrims'), 0)), '""'), coalesce(to_jsonb(nullif(_ac_num(c -> 'duration'), 0)), '""'), coalesce(to_jsonb(nullif(_ac_num(c -> 'totalAmount'), 0)), '""'),
      _w_str(c -> 'tripClient'), _w_str(c -> 'umrahCompany'), _w_str(c -> 'groupNo'), who, nowj, '', '', _w_str(c -> 'sourceFile'), _w_str(c -> 'vendor'), _w_str(c -> 'notes'),
      _w_str(c -> 'attachmentUrl'), _cc_new_id(), _w_str(c -> 'vendorAcc'), _w_str(c -> 'targetAcc'), coalesce(to_jsonb(nullif(_ac_num(c -> 'sellAmount'), 0)), '""'), _w_str(c -> 'manualEntryNo'));
    hrid := null; hraw := null;
    if _w_str(c -> '_id') <> '' then select rid, raw into hrid, hraw from store_rows where tbl = 'catering_contracts' and _mf_str(_rx_c(raw, 20)) = _w_str(c -> '_id') order by ord limit 1; end if;
    if hrid is null then select rid, raw into hrid, hraw from store_rows where tbl = 'catering_contracts' and _mf_str(_rx_c(raw, 0)) = no_ order by ord desc limit 1; end if;
    if hrid is not null then
      orig := _x_pad(hraw, 25); o := orig;
      if c ? 'vendorAcc' and _w_str(c -> 'vendorAcc') <> '' and _w_str(c -> 'vendorAcc') <> _mf_str(orig -> 21) and (coalesce((c ->> '_isEdit')::boolean, false) or _mf_str(orig -> 21) = '') then perform _cc_acc_check(_w_str(c -> 'vendorAcc'), 'حساب المورد'); end if;
      if c ? 'targetAcc' and _w_str(c -> 'targetAcc') <> '' and _w_str(c -> 'targetAcc') <> _mf_str(orig -> 22) and (coalesce((c ->> '_isEdit')::boolean, false) or _mf_str(orig -> 22) = '') then perform _cc_acc_check(_w_str(c -> 'targetAcc'), 'حساب العميل / الرحلة'); end if;
      if coalesce((c ->> '_isEdit')::boolean, false) then
        for k in 0 .. 11 loop o := jsonb_set(o, array[k::text], nv -> k); end loop;
        o := jsonb_set(jsonb_set(o, '{14}', to_jsonb(who)), '{15}', nowj);
        if _w_str(c -> 'sourceFile') <> '' then o := jsonb_set(o, '{16}', nv -> 16); end if;
        o := jsonb_set(jsonb_set(o, '{17}', nv -> 17), '{18}', nv -> 18);
        if _w_str(c -> 'attachmentUrl') <> '' then o := jsonb_set(o, '{19}', nv -> 19); end if;
        if c ? 'vendorAcc' then o := jsonb_set(o, '{21}', nv -> 21); end if;
        if c ? 'targetAcc' then o := jsonb_set(o, '{22}', nv -> 22); end if;
        if c ? 'sellAmount' then o := jsonb_set(o, '{23}', nv -> 23); end if;
        if c ? 'manualEntryNo' then o := jsonb_set(o, '{24}', nv -> 24); end if;
        if _mf_str(o -> 20) = '' then o := jsonb_set(o, '{20}', nv -> 20); end if;
        filled := true;
      else
        filled := false;
        foreach k in array array[0,1,2,3,4,5,6,7,8,9,10,11,17,18,19,21,22,23,24] loop
          if coalesce(o ->> k, '') = '' and coalesce(nv ->> k, '') <> '' then o := jsonb_set(o, array[k::text], nv -> k); filled := true; end if;
        end loop;
        if filled then
          o := jsonb_set(jsonb_set(o, '{14}', to_jsonb(who)), '{15}', nowj);
          if _w_str(c -> 'sourceFile') <> '' and coalesce(o ->> 16, '') = '' then o := jsonb_set(o, '{16}', nv -> 16); end if;
          if _mf_str(o -> 20) = '' then o := jsonb_set(o, '{20}', nv -> 20); end if;
        end if;
      end if;
      if filled then
        update store_rows set raw = o where tbl = 'catering_contracts' and rid = hrid;
        post := post || _mf_str(o -> 20); up := up + 1;
        for k in 0 .. 24 loop
          if k between 12 and 15 then continue; end if;
          ov := coalesce(nullif(orig -> k #>> '{}', ''), '-'); nvs := coalesce(nullif(o -> k #>> '{}', ''), '-');
          if ov is distinct from nvs then perform _x_aud(who, 'تعديل اتفاقية إعاشة', no_, hdr[k + 1], ov, nvs); nlog := nlog + 1; end if;
        end loop;
      else sk := sk + 1; end if;
    else
      if _mf_str(nv -> 21) <> '' then perform _cc_acc_check(_mf_str(nv -> 21), 'حساب المورد'); end if;
      if _mf_str(nv -> 22) <> '' then perform _cc_acc_check(_mf_str(nv -> 22), 'حساب العميل / الرحلة'); end if;
      perform _x_append('catering_contracts', nv);
      if _mf_str(nv -> 21) <> '' and _mf_str(nv -> 22) <> '' then post := post || _mf_str(nv -> 20); end if;
      cr := cr + 1;
      perform _x_aud(who, 'إنشاء اتفاقية إعاشة', no_, 'اتفاقية جديدة', '-', coalesce(nullif(_w_str(c -> 'provider'), ''), '-') || ' — ' || coalesce(nullif(_w_str(c -> 'area'), ''), '-') ||
        case when coalesce(_ac_num(c -> 'totalAmount'), 0) <> 0 then ' — ' || _mf_n2t(_ac_num(c -> 'totalAmount')) else '' end); nlog := nlog + 1;
    end if;
  end loop;
  perform _x_bump('catering_contracts'); perform _w_dv_bump(array['visa']);
  if nlog = 0 then perform _x_aud(who, 'حفظ اتفاقيات إعاشة', '-', 'CateringContracts', '-', 'حفظ بلا تغييرات فعلية (' || jsonb_array_length(a -> 1) || ')'); end if;
  -- ربط رقم الاتفاقية بسكن المجموعات (المدينة من منطقة الخدمة)
  for c in select * from jsonb_array_elements(a -> 1) loop
    no_ := _w_str(c -> 'contractNo'); if no_ = '' then continue; end if;
    select raw into cur from store_rows where tbl = 'catering_contracts' and _mf_str(_rx_c(raw, 0)) = no_ order by ord desc limit 1;
    area := coalesce(nullif(_mf_str(cur -> 2), ''), _w_str(c -> 'area'));
    city := case when position('مكة' in area) > 0 or position('مكه' in area) > 0 then 'مكة' when position('مدين' in area) > 0 then 'المدينة' else '' end;
    if city = '' then continue; end if;
    foreach grp in array _vz_split(coalesce(nullif(_mf_str(cur -> 11), ''), _w_str(c -> 'groupNo'))) loop
      begin
        perform _vz_sync_alloc_to_group(jsonb_build_object('agrNo', no_, 'city', city, 'kind', 'إعاشة', 'hotel', '', 'supplier', coalesce(nullif(_mf_str(cur -> 17), ''), _w_str(c -> 'vendor'))),
          grp, coalesce(nullif(_ac_num(cur -> 6), 0), _ac_num(c -> 'pilgrims'), 0), _cc_dfmt(coalesce(cur -> 4, c -> 'fromDate')), _cc_dfmt(coalesce(cur -> 5, c -> 'toDate')), who);
        linked := linked + 1;
      exception when others then null; end;
    end loop;
  end loop;
  perform _cc_gl_post(post, who);
  return jsonb_build_object('success', true, 'created', cr, 'updated', up, 'skipped', sk, 'linkedGroups', linked, 'gl', case when array_length(post, 1) > 0 then jsonb_build_object('queued', true) end); end $$;

-- ===== مجموعات التأشيرات: حذف/استيراد/تعديل جماعي/رقم القيد/المطابقة =====
create or replace function _vz_agent_bal(agents text[], u text) returns jsonb language plpgsql stable set search_path = public as
$$ declare boot jsonb; r jsonb; begin
  if coalesce(array_length(agents, 1), 0) = 0 or not app_has('visas.finance') then return null; end if;
  boot := rx2_getvisabootstrap(jsonb_build_array(null), u);
  select coalesce(jsonb_object_agg(k, v), '{}'::jsonb) into r from jsonb_each(coalesce(boot -> 'agentBalances', '{}'::jsonb)) e(k, v)
   where exists (select 1 from unnest(agents) ag where k = ag or left(k, length(ag) + 3) = ag || ' - ');
  return r; end $$;
create or replace function rw2_deletevisafilesbatch(a jsonb, u text) returns jsonb language plpgsql volatile set search_path = public as
$$ declare who text := coalesce(u, app_user(), '-'); ids text[]; r record; gone text[] := '{}'; ags text[] := '{}'; f jsonb; begin
  perform _x_perm('visas.delete', 'لا تملك صلاحية الحذف من متابعة التأشيرات والوكلاء');
  select coalesce(array_agg(_w_str(x)) filter (where _w_str(x) <> ''), '{}') into ids from jsonb_array_elements(case when jsonb_typeof(a -> 1) = 'array' then a -> 1 else '[]'::jsonb end) x;
  if coalesce(array_length(ids, 1), 0) = 0 then return jsonb_build_object('success', false, 'error', 'لم تُحدَّد أي مجموعة'); end if;
  perform _x_lock('vz_files');
  perform _rb_on('visa_file', 'حذف جماعي لـ ' || array_length(ids, 1) || ' مجموعة تأشيرات', '', who);
  for r in select raw from store_rows where tbl = 'vz_files' and _mf_str(_rx_c(raw, 0)) = any (ids) loop
    f := _vz_row_obj(r.raw); gone := gone || (f ->> 'id');
    if coalesce(f ->> 'agent', '') <> '' and not ((f ->> 'agent') = any (ags)) then ags := ags || (f ->> 'agent'); end if;
    perform _x_aud(who, 'حذف قيد تأشيرات (جماعي)', 'VZ:' || (f ->> 'id'), 'قيد ' || coalesce(nullif(f ->> 'ref', ''), f ->> 'seq') || ' — ' || coalesce(nullif(f ->> 'agent', ''), '-'), '-', '-');
  end loop;
  delete from store_rows where tbl = 'vz_files' and _mf_str(_rx_c(raw, 0)) = any (ids);
  perform _x_bump('vz_files'); perform _w_dv_bump(array['visa', 'trips']);
  return jsonb_build_object('success', true, 'count', coalesce(array_length(gone, 1), 0), 'removedIds', to_jsonb(gone), 'agentBalances', _vz_agent_bal(ags, u)); end $$;
create or replace function rw2_importvisafilesbatch(a jsonb, u text) returns jsonb language plpgsql volatile set search_path = public as
$$ declare who text := coalesce(u, app_user(), '-'); r jsonb; ex jsonb := '{}'::jsonb; seq float8; ref_ text; k text; bd jsonb; cnt float8; pr float8; f jsonb; sk text[] := '{}'; noref int := 0; n int := 0; st text := _w_stamp(); tps jsonb := _vz_prices('vz_agent_prices'); tn text; begin
  perform _x_perm('visas.add', 'لا تملك صلاحية الإضافة بمتابعة التأشيرات والوكلاء');
  if jsonb_array_length(coalesce(a -> 1, '[]'::jsonb)) = 0 then return jsonb_build_object('success', false, 'error', 'لا توجد صفوف للاستيراد'); end if;
  perform _x_lock('vz_files');
  select coalesce(jsonb_object_agg(lower(regexp_replace(translate(q.f ->> 'ref', '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹', '01234567890123456789'), '\s+', '', 'g')), 1), '{}'::jsonb), coalesce(max((q.f ->> 'seq')::float8), 0)
    into ex, seq from _vz_files() q where coalesce(q.f ->> 'ref', '') <> '';
  if seq is null then seq := 0; end if;
  for r in select * from jsonb_array_elements(a -> 1) loop
    ref_ := _w_str(r -> 'ref');
    if ref_ = '' then noref := noref + 1; continue; end if;
    k := lower(regexp_replace(translate(ref_, '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹', '01234567890123456789'), '\s+', '', 'g'));
    if ex ? k then sk := sk || ref_; continue; end if;
    ex := ex || jsonb_build_object(k, 1);
    select coalesce(jsonb_agg(jsonb_build_object('name', _w_str(b -> 'name'), 'count', coalesce(_mf_num(b -> 'count'), 0))), '[]'::jsonb) into bd
      from jsonb_array_elements(case when jsonb_typeof(r -> 'breakdown') = 'array' then r -> 'breakdown' else '[]'::jsonb end) b where _w_str(b -> 'name') <> '';
    cnt := coalesce(_mf_num(r -> 'visaCount'), 0);
    if cnt = 0 and jsonb_array_length(bd) > 0 then select sum((b ->> 'count')::float8) into cnt from jsonb_array_elements(bd) b; end if;
    pr := coalesce(_mf_num(r -> 'price'), 0);
    if pr = 0 then pr := _vz_price_at(_w_str(r -> 'agent'), _w_str(r -> 'date'), tps); end if;
    tn := _w_str(r -> 'tripName');
    if tn <> '' and not (_mf_trip_names() ? tn) then
      select coalesce(min(x), '') into tn from jsonb_object_keys(_mf_trip_names()) x where replace(_w_norm(x), ' ', '') = replace(_w_norm(tn), ' ', '')
        having count(*) = 1;
      tn := coalesce(tn, '');
    end if;
    seq := seq + 1;
    f := jsonb_build_object('id', _x_id('VZ'), 'seq', seq, 'ref', ref_, 'status', case when _w_str(r -> 'status') in ('', 'تم السداد') then 'تم الإرسال' else _w_str(r -> 'status') end,
      'date', _mf_datet(r ->> 'date'), 'company', _w_str(r -> 'company'), 'agent', _w_str(r -> 'agent'), 'tripName', tn, 'breakdown', bd, 'selected', '[]'::jsonb, 'visaCount', cnt, 'price', pr,
      'notes', _w_str(r -> 'notes'), 'createdBy', who, 'createdAt', st, 'updatedBy', '', 'updatedAt', '', 'payStatus', '', 'makkahIn', _mf_datet(r ->> 'makkahIn'), 'makkahOut', _mf_datet(r ->> 'makkahOut'),
      'madinahIn', _mf_datet(r ->> 'madinahIn'), 'madinahOut', _mf_datet(r ->> 'madinahOut'), 'makkahHousingAgr', _w_str(r -> 'makkahHousingAgr'), 'madinahHousingAgr', _w_str(r -> 'madinahHousingAgr'),
      'makkahCateringAgr', _w_str(r -> 'makkahCateringAgr'), 'madinahCateringAgr', _w_str(r -> 'madinahCateringAgr'), 'housing', case when jsonb_typeof(r -> 'housing') = 'array' then r -> 'housing' else '[]'::jsonb end,
      'entryNo', _w_str(r -> 'entryNo'), 'extraTrips', '');
    f := jsonb_set(f, '{housing}', _vz_hz_norm(f));
    perform _x_append('vz_files', _w_vz_raw(f)); n := n + 1;
  end loop;
  if n > 0 then perform _x_bump('vz_files'); perform _w_dv_bump(array['visa', 'trips']); end if;
  perform _x_aud(who, 'استيراد مجموعات تأشيرات', '-', 'استيراد دفعة', '-', 'استُورد ' || n || ' — تُخطِّي ' || coalesce(array_length(sk, 1), 0) || case when noref > 0 then ' — بلا رقم مجموعة ' || noref else '' end);
  return jsonb_build_object('success', true, 'imported', n, 'skipped', coalesce(array_length(sk, 1), 0), 'skippedRefs', to_jsonb(sk), 'noRef', noref); end $$;
create or replace function rw2_savevisafilesbulk(a jsonb, u text) returns jsonb language plpgsql volatile set search_path = public as
$$ declare it jsonb; id_ text; cur jsonb; d jsonb; k text; res jsonb; out_ jsonb := '[]'::jsonb; ok int := 0; tr text[] := '{}'; ag text[] := '{}'; t text; known jsonb := _mf_trip_names();
  editable text[] := array['status','payStatus','date','company','agent','entryNo','notes','tripName','extraTrips','selected','breakdown','visaCount','price']; begin
  perform _x_perm('visas.edit', 'لا تملك صلاحية التعديل بمتابعة التأشيرات والوكلاء');
  for it in select * from jsonb_array_elements(case when jsonb_typeof(a -> 1) = 'array' then a -> 1 else '[]'::jsonb end) loop
    id_ := _w_str(it -> 'id'); if id_ = '' then continue; end if;
    begin
      select q.f into cur from _vz_files() q where q.f ->> 'id' = id_ limit 1;
      if cur is null then raise exception 'المجموعة غير موجودة'; end if;
      if it ? 'selected' and jsonb_typeof(it -> 'selected') <> 'array' then raise exception 'قائمة المعتمرين غير صالحة'; end if;
      if it ? 'breakdown' and jsonb_typeof(it -> 'breakdown') <> 'array' then raise exception 'بنود العملاء غير صالحة'; end if;
      d := cur - 'dueSAR';
      foreach k in array editable loop if it ? k then d := jsonb_set(d, array[k], it -> k); end if; end loop;
      if it ? 'selected' then d := jsonb_set(d, '{selected}', coalesce((select jsonb_agg(_w_str(x)) from jsonb_array_elements(it -> 'selected') x where _w_str(x) <> ''), '[]'::jsonb)); end if;
      res := rw2_savevisafile(jsonb_build_array(null, d), u);
      if not coalesce((res ->> 'success')::boolean, false) then raise exception '%', coalesce(res ->> 'error', 'فشل الحفظ'); end if;
      ok := ok + 1;
      out_ := out_ || jsonb_build_array(jsonb_build_object('id', id_, 'success', true, 'file', res -> 'file', 'syncTrips', res -> 'syncTrips', 'agentBalances', res -> 'agentBalances'));
      foreach t in array _mf_trips_of(res -> 'file' ->> 'tripName', res -> 'file' ->> 'extraTrips', known) loop if not (t = any (tr)) then tr := tr || t; end if; end loop;
      if coalesce(res -> 'file' ->> 'agent', '') <> '' and not ((res -> 'file' ->> 'agent') = any (ag)) then ag := ag || (res -> 'file' ->> 'agent'); end if;
      if res ? 'lfAfter' and coalesce(res -> 'lfAfter' -> 'args' -> 1 ->> 'syncHousing', '') <> '' then perform _vz_sync_group_housing(res -> 'file', coalesce(u, app_user(), '-')); end if;
    exception when others then out_ := out_ || jsonb_build_array(jsonb_build_object('id', id_, 'success', false, 'error', sqlerrm)); end;
  end loop;
  return jsonb_build_object('success', true, 'done', ok, 'total', jsonb_array_length(coalesce(a -> 1, '[]'::jsonb)), 'results', out_)
    || case when array_length(ag, 1) > 0 or array_length(tr, 1) > 0 then jsonb_build_object('lfAfter', jsonb_build_object('fn', 'vzAfterSaveBg', 'args', jsonb_build_array(null, jsonb_build_object('agents', to_jsonb(ag), 'trips', to_jsonb(tr))))) else '{}'::jsonb end; end $$;
create or replace function rw2_setvisafileentryno(a jsonb, u text) returns jsonb language plpgsql volatile set search_path = public as
$$ declare who text := coalesce(u, app_user(), '-'); id_ text := _w_str(a -> 1); en text := _w_str(a -> 2); rid_ text; raw_ jsonb; begin
  perform _x_perm('visas.edit', 'لا تملك صلاحية التعديل بمتابعة التأشيرات والوكلاء');
  perform _x_lock('vz_files');
  select rid, raw into rid_, raw_ from store_rows where tbl = 'vz_files' and _mf_str(_rx_c(raw, 0)) = id_ order by ord limit 1;
  if rid_ is null then return jsonb_build_object('success', false, 'error', 'القيد غير موجود'); end if;
  update store_rows set raw = jsonb_set(_x_pad(raw_, 28), '{27}', to_jsonb(en)) where tbl = 'vz_files' and rid = rid_;
  perform _x_bump('vz_files'); perform _w_dv_bump(array['visa']);
  perform _x_aud(who, 'تعديل رقم القيد', 'VZ:' || id_, 'رقم القيد', coalesce(nullif(_mf_str(_rx_c(raw_, 27)), ''), '-'), coalesce(nullif(en, ''), '-'));
  return jsonb_build_object('success', true); end $$;
create or replace function rx2_vzcacheclearbg(a jsonb, u text) returns jsonb language sql stable as $$ select jsonb_build_object('success', true) $$;
-- = vzAfterSaveBg بكتابة: يشمل مزامنة اتفاقيات/تخصيصات السكن (syncHousing) ثم فحص المطابقة والأرصدة (060)
create or replace function rw2_vzaftersavebg(a jsonb, u text) returns jsonb language plpgsql volatile set search_path = public as
$$ declare p jsonb := case when jsonb_typeof(a -> 1) = 'array' then jsonb_build_object('agents', a -> 1) else coalesce(a -> 1, '{}'::jsonb) end; f jsonb; begin
  if not (app_has('visas.add') or app_has('visas.edit')) then raise exception 'لا تملك صلاحية إضافة/تعديل متابعة التأشيرات والوكلاء' using errcode = '42501'; end if;
  if _w_str(p -> 'syncHousing') <> '' then
    select q.f into f from _vz_files() q where q.f ->> 'id' = _w_str(p -> 'syncHousing') limit 1;
    if f is not null then begin perform _vz_sync_group_housing(f, coalesce(u, app_user(), '-')); exception when others then null; end; end if;
  end if;
  return rx2_vzaftersavebg(jsonb_build_array(null, p - 'syncHousing'), u); end $$;
-- = xcApply: تصحيح شركة/وكيل الرحلة والمجموعات والملفات ثم فحص المطابقة من جديد
create or replace function rw2_xcapply(a jsonb, u text) returns jsonb language plpgsql volatile set search_path = public as
$$ declare who text := coalesce(u, app_user(), '-'); it jsonb; res jsonb := '[]'::jsonb; vz jsonb := '[]'::jsonb; mf jsonb := '[]'::jsonb; tm jsonb := _rx_map('trips', _rx_h_trips()); rid_ text; raw_ jsonb;
  ci int; ai int; oc text; oa text; co text; ag text; id_ text; r jsonb; x jsonb; begin
  if app_user() is null then raise exception 'غير مصرّح' using errcode = '42501'; end if;
  ci := (tm ->> 'الشركة المصرية')::int; ai := (tm ->> 'الوكيل السعودي')::int;
  for it in select * from jsonb_array_elements(case when jsonb_typeof(a -> 1) = 'array' then a -> 1 else '[]'::jsonb end) limit 60 loop
    co := _w_str(it -> 'company'); ag := _w_str(it -> 'agent'); id_ := _w_str(it -> 'id');
    if id_ = '' or ag = '' then res := res || jsonb_build_array(jsonb_build_object('id', id_, 'success', false, 'error', 'الوكيل مطلوب')); continue; end if;
    if it ->> 'src' = 'vz' then vz := vz || jsonb_build_array(jsonb_build_object('id', id_, 'company', co, 'agent', ag));
    elsif it ->> 'src' = 'mf' then mf := mf || jsonb_build_array(jsonb_build_object('id', id_, 'company', co, 'agent', ag));
    elsif it ->> 'src' = 'trip' then
      begin
        if not app_has('trips.edit') then raise exception 'لا تملك صلاحية تعديل الرحلات'; end if;
        perform _x_lock('trips');
        select rid, raw into rid_, raw_ from store_rows where tbl = 'trips' and _rx_trim(_rx_s(_rx_c(raw, (tm ->> 'اسم الرحلة')::int))) = id_ order by ord limit 1;
        if rid_ is null then raise exception 'الرحلة غير موجودة'; end if;
        oc := _rx_s(_rx_c(raw_, ci)); oa := _rx_s(_rx_c(raw_, ai));
        raw_ := _x_pad(raw_, greatest(ci, ai) + 1);
        if co <> '' then raw_ := jsonb_set(raw_, array[ci::text], to_jsonb(co)); end if;
        raw_ := jsonb_set(raw_, array[ai::text], to_jsonb(ag));
        update store_rows set raw = raw_ where tbl = 'trips' and rid = rid_;
        perform _x_bump('trips'); perform _w_dv_bump(array['trips', 'bookings']);
        perform _x_aud(who, 'تصحيح شركة/وكيل الرحلة (مطابقة)', id_, 'الشركة/الوكيل', oc || ' / ' || oa, coalesce(nullif(co, ''), oc) || ' / ' || ag);
        res := res || jsonb_build_array(jsonb_build_object('id', id_, 'success', true));
      exception when others then res := res || jsonb_build_array(jsonb_build_object('id', id_, 'success', false, 'error', sqlerrm)); end;
      rid_ := null;
    end if;
  end loop;
  if jsonb_array_length(vz) > 0 then r := rw2_savevisafilesbulk(jsonb_build_array(null, vz), u);
    for x in select * from jsonb_array_elements(r -> 'results') loop res := res || jsonb_build_array(jsonb_build_object('id', x ->> 'id', 'success', x -> 'success', 'error', x -> 'error')); end loop; end if;
  if jsonb_array_length(mf) > 0 then r := rw2_saveministryfilesbulk(jsonb_build_array(null, mf), u);
    for x in select * from jsonb_array_elements(r -> 'results') loop res := res || jsonb_build_array(jsonb_build_object('id', x ->> 'id', 'success', x -> 'success', 'error', x -> 'error')); end loop; end if;
  return jsonb_build_object('success', true, 'results', res, 'issues', _xc_check(coalesce(a -> 2, '[]'::jsonb))); end $$;

-- ===== التسكين المدموج واقتراحات الدمج =====
create or replace function rx2_getmergedhousing(a jsonb, u text) returns jsonb language plpgsql stable set search_path = public as
$$ declare k text := coalesce(a ->> 2, '') || '::' || coalesce((select string_agg(x, '|' order by x collate "C") from jsonb_array_elements_text(case when jsonb_typeof(a -> 1) = 'array' then a -> 1 else '[]'::jsonb end) x), '');
  v text; begin
  if app_user() is null then raise exception 'غير مصرّح' using errcode = '42501'; end if;
  select _rx_s(_rx_c(raw, 3)) into v from _rx_rows('merged_housing') where _rx_s(_rx_c(raw, 0)) = k order by rn limit 1;
  if v is null then return jsonb_build_object('success', true, 'rooms', null); end if;
  return jsonb_build_object('success', true, 'rooms', _rx_json(coalesce(nullif(v, ''), '[]'))); end $$;
create or replace function rx2_getpilgrimsformergedhousing(a jsonb, u text) returns jsonb language plpgsql stable set search_path = public as
$$ declare tn text; lst jsonb; out_ jsonb := '[]'::jsonb; byp jsonb; begin
  if app_user() is null then raise exception 'غير مصرّح' using errcode = '42501'; end if;
  for tn in select jsonb_array_elements_text(case when jsonb_typeof(a -> 1) = 'array' then a -> 1 else '[]'::jsonb end) loop
    lst := coalesce(rx_trip_pilgrims_raw(tn), '[]'::jsonb);
    select coalesce(jsonb_object_agg(p ->> 'pid', p ->> 'name'), '{}'::jsonb) into byp from jsonb_array_elements(lst) p where coalesce(p ->> 'pid', '') <> '';
    select out_ || coalesce(jsonb_agg(p || jsonb_build_object('tripName', tn, 'mahramName', case when coalesce(p ->> 'mahramPid', '') <> '' then coalesce(byp ->> (p ->> 'mahramPid'), '') else '' end) order by o), '[]'::jsonb)
      into out_ from jsonb_array_elements(lst) with ordinality t(p, o);
  end loop;
  return out_; end $$;
-- = getHousingShareSuggestions: أسرّة فارغة بغرف أحادية الجنس ⇐ معتمرون خارج التسكين/ساكنون منفردون من رحلة أخرى (نفس المدينة والفندق والجنس وفترة متداخلة)
create or replace function rx2_gethousingsharesuggestions(a jsonb, u text) returns jsonb language plpgsql stable set search_path = public as
$$ declare tm jsonb := _rx_map('trips', _rx_h_trips()); pm jsonb := _rx_map('pilgrims', _rx_h_pil()); today float8 := _mf_ms(_mf_today()); res jsonb; ntrips int; begin
  if app_user() is null then raise exception 'غير مصرّح' using errcode = '42501'; end if;
  with tr as (select * from (select _rx_trim(_rx_s(_rx_c(raw, (tm ->> 'اسم الرحلة')::int))) name, _rx_trim(_rx_s(_rx_c(raw, (tm ->> 'سكن المدينة')::int))) madh, _rx_trim(_rx_s(_rx_c(raw, (tm ->> 'سكن مكة')::int))) makh,
                     _mf_ms(_ae_dfmt(_rx_c(raw, (tm ->> 'تاريخ العودة')::int))) ret,
                     _ae_dfmt(_rx_c(raw, (tm ->> 'تاريخ دخول المدينة')::int)) mis, _ae_dfmt(_rx_c(raw, (tm ->> 'تاريخ الخروج من المدينة')::int)) mos,
                     _ae_dfmt(_rx_c(raw, (tm ->> 'تاريخ دخول مكة')::int)) kis, _ae_dfmt(_rx_c(raw, (tm ->> 'تاريخ الخروج من مكة')::int)) kos, rn
                from _rx_rows('trips')) z where name <> '' and ret is not null and ret >= today),
       trd as (select distinct on (name) name, madh, makh, mis, mos, kis, kos, _mf_ms(mis) mi, _mf_ms(mos) mo, _mf_ms(kis) ki, _mf_ms(kos) ko from tr order by name, rn desc),
       pl as (select _rx_trim(_rx_s(_rx_c(raw, _rx_ix(pm, 'اسم الرحلة')))) tn, _rx_trim(_rx_s(_rx_c(raw, _rx_ix(pm, 'اسم المعتمر')))) nm, _rx_trim(_rx_s(_rx_c(raw, _rx_ix(pm, 'النوع')))) ty,
                     _rx_trim(_rx_s(_rx_c(raw, _rx_ix(pm, 'طبيعة التسكين')))) ac, _rx_trim(_rx_s(_rx_c(raw, _rx_ix(pm, 'فندق المدينة')))) hm, _rx_trim(_rx_s(_rx_c(raw, _rx_ix(pm, 'فندق مكة')))) hk,
                     _rx_trim(_rx_s(_rx_c(raw, _rx_ix(pm, 'رقم غرفة المدينة')))) rm, _rx_trim(_rx_s(_rx_c(raw, _rx_ix(pm, 'رقم الغرفة')))) r0, _rx_trim(_rx_s(_rx_c(raw, _rx_ix(pm, 'رقم غرفة مكة')))) rk,
                     _rx_s(_rx_c(raw, _rx_ix(pm, 'مستبعد من التسكين'))) ex, _rx_s(_rx_c(raw, _rx_ix(pm, 'مستبعد من تسكين المدينة'))) exm, _rx_s(_rx_c(raw, _rx_ix(pm, 'مستبعد من تسكين مكة'))) exk, rn
                from _rx_rows('pilgrims')),
       pc as (select pl.tn, pl.nm, case pl.ty when 'ذكر' then 'M' when 'أنثى' then 'F' end g, pl.ac, c.city, c.hotel, c.room, c.excl, pl.rn
                from pl join trd on trd.name = pl.tn
                cross join lateral (values ('M', coalesce(nullif(pl.hm, ''), trd.madh), coalesce(nullif(pl.rm, ''), pl.r0), pl.ex = '1' or pl.exm = '1', trd.mi, trd.mo),
                                           ('K', coalesce(nullif(pl.hk, ''), trd.makh), pl.rk, pl.ex = '1' or pl.exk = '1', trd.ki, trd.ko)) c(city, hotel, room, excl, ii, oo)
               where pl.nm <> '' and pl.ty in ('ذكر', 'أنثى') and not c.excl and c.hotel <> '' and c.ii is not null and c.oo is not null),
       rooms as (select tn, city, (array_agg(hotel order by rn))[1] hotel, room, count(*) n, array_agg(nm order by rn) names, count(distinct g) ng, min(g) g,
                        (select ac from pc p2 where p2.tn = pc.tn and p2.city = pc.city and p2.room = pc.room and p2.ac <> '' group by ac order by count(*) desc, min(p2.rn) limit 1) dom
                   from pc where room <> '' group by tn, city, room),
       offers as (select r.*, coalesce(r.dom, case when r.n = 1 then 'سنجل' else 'رباعي' end) typ,
                         coalesce(('{"سنجل":1,"دابل":2,"ثلاثي":3,"رباعي":4,"رباعي أسرة":4,"خماسي":5,"خماسي أسرة":5,"سداسي":6}'::jsonb ->> coalesce(r.dom, case when r.n = 1 then 'سنجل' else 'رباعي' end))::int, 4) cap
                    from rooms r where r.ng = 1),
       loose as (select tn, city, hotel, nm name, g, 'خارج التسكين' status from pc where room = ''
                 union all select tn, city, hotel, names[1], g, 'ساكن بمفرده بغرفة ' || room || ' (' || typ || ')' from offers where n = 1 and cap > 1),
       per as (select name, 'M' city, mi i, mo o, mis si, mos so from trd union all select name, 'K', ki, ko, kis, kos from trd),
       sug as (select o.*, pa.si, pa.so,
                      (select jsonb_agg(jsonb_build_object('trip', l.tn, 'name', l.name, 'status', l.status, 'overlap', jsonb_build_object(
                          'from', to_char(to_timestamp(greatest(pa.i, pb.i) / 1000) at time zone 'Africa/Cairo', 'DD/MM/YYYY'), 'to', to_char(to_timestamp(least(pa.o, pb.o) / 1000) at time zone 'Africa/Cairo', 'DD/MM/YYYY'),
                          'exact', pa.i = pb.i and pa.o = pb.o)) order by l.tn, l.name)
                         from loose l join per pb on pb.name = l.tn and pb.city = l.city
                        where l.tn <> o.tn and l.city = o.city and l.hotel = o.hotel and l.g = o.g and pb.i is not null and pb.o is not null and greatest(pa.i, pb.i) < least(pa.o, pb.o)) cands
                 from offers o join per pa on pa.name = o.tn and pa.city = o.city where o.cap - o.n > 0)
  select coalesce(jsonb_agg(x order by (x ->> 'nc')::int desc, (x ->> 'empty')::int desc), '[]'::jsonb) into res from (
    select jsonb_build_object('hotel', hotel, 'city', case when city = 'M' then 'المدينة' else 'مكة' end, 'trip', tn, 'roomNo', room, 'type', typ, 'empty', cap - n, 'n', n,
      'gender', case when g = 'M' then 'رجال' else 'سيدات' end, 'occupants', to_jsonb(names[1:6]), 'period', jsonb_build_object('from', si, 'to', so),
      'candidates', (select jsonb_agg(c) from (select c from jsonb_array_elements(cands) c limit 8) cc), 'nc', jsonb_array_length(cands)) x
      from sug where cands is not null) z;
  select count(*) into ntrips from (select distinct name from (select _rx_trim(_rx_s(_rx_c(raw, (tm ->> 'اسم الرحلة')::int))) name, _mf_ms(_ae_dfmt(_rx_c(raw, (tm ->> 'تاريخ العودة')::int))) ret from _rx_rows('trips')) q
     where name <> '' and ret is not null and ret >= today) w;
  return jsonb_build_object('success', true, 'suggestions', coalesce((select jsonb_agg(x - 'nc') from (select x from jsonb_array_elements(res) x limit 60) q), '[]'::jsonb), 'tripsScanned', ntrips); end $$;

do $$ declare r record; begin
  for r in select p.oid::regprocedure::text sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and (p.proname in ('_vz_split','_vz_ha_all','_vz_alloc_all','_vz_segments','_vz_group_index','_vz_gidx_multi','_vz_supplier_list','_vz_catering_by_group',
              '_vz_housing_agr_by_group','_vz_hz_norm','_vz_sync_alloc_to_group','_vz_sync_group_catering','_cc_new_id','_vz_sync_group_housing','_cc_perm','_cc_dfmt','_cc_acc_check','_cc_gl_post','_vz_agent_bal')
              or p.proname in ('rx2_gethousingagreements','rw2_savehousingagreement','rw2_savehousingallocation','rw2_deletehousingagreement','rw2_deletehousingallocation','rx2_gethousingcateringbygroup',
              'rx2_getcateringcontracts','rx2_findduplicatecateringcontracts','rx2_getcateringcontracthistory','rw2_deletecateringcontract','rw2_mergecateringduplicates','rw2_savecateringcontracts',
              'rw2_deletevisafilesbatch','rw2_importvisafilesbatch','rw2_savevisafilesbulk','rw2_setvisafileentryno','rx2_vzcacheclearbg','rw2_vzaftersavebg','rw2_xcapply','rx2_getmergedhousing',
              'rx2_getpilgrimsformergedhousing','rx2_gethousingsharesuggestions')) loop
    execute format('revoke all on function %s from public, anon, authenticated', r.sig);
    execute format('grant execute on function %s to service_role', r.sig);
  end loop;
end $$;

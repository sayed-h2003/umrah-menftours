-- 034: نقل/تخصيص المعتمرين بين الرحلات من Postgres — movePilgrimBetweenTrips · movePilgrimsBulk · assignPilgrimToTrip · assignPilgrimsBulk.
-- • الكتابة على صفوف المعتمرين (store_rows 'pilgrims') بنفس منطق Code.gs: المحارم/التوابع، منع التكرار، كشف تعارض التواريخ (rx_trip_conflicts_raw)، إعادة ضبط تسكين من تبقّى بنفس رقم الغرفة.
-- • الآثار الجانبية تُنفَّذ بالخلفية بنفس دوال Apps Script عبر صندوق الإخراج: لقطات الرحلة (tripsnap — لقطة «قبل» تُبنى هنا قبل التعديل فيبقى خط الأساس صحيحاً) · سجل التعديلات · تبعية حسابات العملاء (accmoved: يُنفَّذ فوراً من المتصفح بنداء خلفي، ويتولاه المستهلك إن لم يصل).
-- يتطلب 006+007+009. تفعيله: supaWriteOnBookings() (wbk) + مجموعة core حيّة.
create or replace function _pm_cm() returns jsonb language sql immutable as $$ select jsonb_build_object('name', 'اسم المعتمر', 'passport', 'رقم الجواز', 'type', 'النوع', 'client', 'العميل', 'accommodation', 'طبيعة التسكين', 'roomNo', 'رقم الغرفة', 'tripName', 'اسم الرحلة', 'bookingId', 'رقم الإشعار', 'latinName', 'الاسم بالإنجليزية', 'birthDate', 'تاريخ الميلاد', 'issueDate', 'تاريخ إصدار الجواز', 'expiryDate', 'تاريخ انتهاء الجواز', 'pid', 'معرف المعتمر', 'mahramPid', 'معرف المحرم', 'hotelMadinah', 'فندق المدينة', 'hotelMakkah', 'فندق مكة') $$;
create or replace function _pm_ix() returns jsonb language sql stable as
$$ select (select coalesce(jsonb_object_agg(k, (_rx_map('pilgrims', _rx_h_pil()) ->> (c ->> k))::int), '{}'::jsonb) from (select k, _pm_cm() c from jsonb_object_keys(_pm_cm()) k) z) $$;

-- حالة الرحلة {t:{عنوان:قيمة}, p:[{عنوان:قيمة}…]} (= _tripSnapBuild_)
create or replace function _ts_state(p_trip text) returns jsonb language plpgsql stable set search_path = public as
$$ declare th jsonb := _rx_hdr('trips'); ph jsonb := _rx_hdr('pilgrims'); ni int := coalesce(_rx_idx(th, 'اسم الرحلة'), 0); pi_ int := (_pm_ix() ->> 'tripName')::int; t jsonb := null; ps jsonb; begin
  select (select jsonb_object_agg(_rx_s(h.v), _rx_c(r.raw, (h.o - 1)::int)) from jsonb_array_elements(th) with ordinality h(v, o)) into t
    from _rx_rows('trips') r where _rx_trim(_rx_s(_rx_c(r.raw, ni))) = p_trip order by r.rn limit 1;
  select coalesce(jsonb_agg((select jsonb_object_agg(_rx_s(h.v), _rx_c(r.raw, (h.o - 1)::int)) from jsonb_array_elements(ph) with ordinality h(v, o)) order by r.rn), '[]'::jsonb) into ps
    from _rx_rows('pilgrims') r where _rx_trim(_rx_s(_rx_c(r.raw, pi_))) = p_trip;
  return jsonb_build_object('t', t, 'p', ps); end $$;

create or replace function _pm_set(raw_ jsonb, ix jsonb, k text, v jsonb) returns jsonb language sql immutable as
$$ select jsonb_set(raw_, array[(ix ->> k)], v) $$;

-- نقل معتمر + توابعه (= movePilgrimBetweenTrips). skip_acc: ضمن نقل مجمّع (لقطات/تبعية الحسابات تتم مرة واحدة بالنهاية)
create or replace function _pm_move(ident jsonb, ft text, tt text, force_ boolean, skip_acc boolean, who text) returns jsonb language plpgsql volatile set search_path = public as
$$ declare
  ix jsonb := _pm_ix(); i_tr int := (ix ->> 'tripName')::int; i_ps int := (ix ->> 'passport')::int; i_nm int := (ix ->> 'name')::int; i_pid int := (ix ->> 'pid')::int; i_mh int := (ix ->> 'mahramPid')::int;
  i_rm int := (ix ->> 'roomNo')::int; i_ty int := (ix ->> 'type')::int; i_cl int := (ix ->> 'client')::int;
  pid text := _rx_trim(coalesce(ident ->> 'pid', '')); pass text := _rx_trim(coalesce(ident ->> 'passport', '')); nm text := _rx_trim(coalesce(ident ->> 'name', ''));
  main_rid text; main_raw jsonb; mpid text; mpass text; rows_ jsonb; rec record; tomove text[] := '{}'; names text[] := '{}'; clients jsonb := '{}'::jsonb; roomnos text[] := '{}'; confl jsonb; dupn text[] := '{}';
  before_f jsonb; before_t jsonb; r2 record; chk jsonb; msg text; n int;
begin
  if ft = '' or tt = '' or ft = tt then raise exception 'حدد رحلتين مختلفتين' using errcode = 'P0001'; end if;
  perform pg_advisory_xact_lock(hashtextextended('store:put:pilgrims', 0));
  select rid, raw into main_rid, main_raw from (select r.rid, r.raw, r.ord from store_rows r where r.tbl = 'pilgrims') r
   where _rx_trim(_rx_s(_rx_c(raw, i_tr))) = ft
     and ((pid <> '' and _rx_trim(_rx_s(_rx_c(raw, i_pid))) = pid) or (pass <> '' and _rx_trim(_rx_s(_rx_c(raw, i_ps))) = pass) or (pid = '' and pass = '' and nm <> '' and _rx_trim(_rx_s(_rx_c(raw, i_nm))) = nm))
   order by ord, rid limit 1;
  if main_rid is null then return jsonb_build_object('success', false, 'error', 'المعتمر غير موجود في الرحلة المصدر (احفظ الكشف أولاً؟)'); end if;
  mpid := _rx_trim(_rx_s(_rx_c(main_raw, i_pid))); mpass := _rx_trim(_rx_s(_rx_c(main_raw, i_ps)));
  if exists (select 1 from store_rows r where r.tbl = 'pilgrims' and _rx_trim(_rx_s(_rx_c(r.raw, i_tr))) = tt
              and ((mpass <> '' and _rx_trim(_rx_s(_rx_c(r.raw, i_ps))) = mpass) or (mpass = '' and _rx_trim(_rx_s(_rx_c(r.raw, i_nm))) = _rx_trim(_rx_s(_rx_c(main_raw, i_nm)))))) then
    return jsonb_build_object('success', false, 'error', 'المعتمر مسجَّل بالفعل في الرحلة الهدف'); end if;
  tomove := array[main_rid];
  if mpid <> '' then
    select tomove || coalesce(array_agg(r.rid order by r.ord, r.rid), '{}') into tomove from store_rows r
     where r.tbl = 'pilgrims' and r.rid <> main_rid and _rx_trim(_rx_s(_rx_c(r.raw, i_tr))) = ft and _rx_trim(_rx_s(_rx_c(r.raw, i_mh))) = mpid;
  end if;
  if not force_ then
    select coalesce(jsonb_agg(jsonb_build_object('name', _rx_s(_rx_c(r.raw, i_nm)), 'passport', _rx_s(_rx_c(r.raw, i_ps)))), '[]'::jsonb) into chk from store_rows r where r.tbl = 'pilgrims' and r.rid = any(tomove);
    select coalesce(jsonb_agg(c), '[]'::jsonb) into confl from jsonb_array_elements(rx_trip_conflicts_raw(to_jsonb(tt), chk)) c where (c ->> 'kind') = 'passport' and (c ->> 'otherTrip') <> ft;
    if jsonb_array_length(confl) > 0 then
      select string_agg(c ->> 'message', E'\n') into msg from jsonb_array_elements(confl) c;
      return jsonb_build_object('success', false, 'conflict', true, 'error', msg); end if;
  end if;
  for rec in select r.rid, r.raw from store_rows r where r.tbl = 'pilgrims' and r.rid = any(tomove) order by r.ord, r.rid loop
    if exists (select 1 from store_rows r where r.tbl = 'pilgrims' and _rx_trim(_rx_s(_rx_c(r.raw, i_tr))) = tt
                and ((_rx_trim(_rx_s(_rx_c(rec.raw, i_ps))) <> '' and _rx_trim(_rx_s(_rx_c(r.raw, i_ps))) = _rx_trim(_rx_s(_rx_c(rec.raw, i_ps))))
                  or (_rx_trim(_rx_s(_rx_c(rec.raw, i_ps))) = '' and _rx_trim(_rx_s(_rx_c(rec.raw, i_nm))) <> '' and _rx_trim(_rx_s(_rx_c(r.raw, i_nm))) = _rx_trim(_rx_s(_rx_c(rec.raw, i_nm)))))) then
      dupn := dupn || _rx_trim(_rx_s(_rx_c(rec.raw, i_nm))); end if;
  end loop;
  if array_length(dupn, 1) > 0 then return jsonb_build_object('success', false, 'error', 'موجود بالفعل في الرحلة الهدف: ' || array_to_string(dupn, '، ')); end if;
  if not skip_acc then
    before_f := _ts_state(ft); before_t := _ts_state(tt);
    insert into app_outbox (kind, payload) values ('tripsnap', jsonb_build_object('trip', ft, 'user', who, 'action', 'خط الأساس (قبل أول تعديل مُلتقَط)', 'state', before_f, 'base', true)),
                                              ('tripsnap', jsonb_build_object('trip', tt, 'user', who, 'action', 'خط الأساس (قبل أول تعديل مُلتقَط)', 'state', before_t, 'base', true));
  end if;
  for rec in select r.rid, r.raw from store_rows r where r.tbl = 'pilgrims' and r.rid = any(tomove) order by r.ord, r.rid loop
    if _rx_trim(_rx_s(_rx_c(rec.raw, i_rm))) <> '' then roomnos := roomnos || _rx_trim(_rx_s(_rx_c(rec.raw, i_rm))); end if;
    names := names || _rx_s(_rx_c(rec.raw, i_nm));
    if _rx_trim(_rx_s(_rx_c(rec.raw, i_cl))) <> '' then clients := clients || jsonb_build_object(_rx_trim(_rx_s(_rx_c(rec.raw, i_cl))), true); end if;
    update store_rows set raw = _pm_set(_pm_set(_pm_set(_pm_set(_pm_set(raw, ix, 'tripName', to_jsonb(tt)), ix, 'roomNo', '""'::jsonb), ix, 'bookingId', '""'::jsonb), ix, 'hotelMadinah', '""'::jsonb), ix, 'hotelMakkah', '""'::jsonb)
     where tbl = 'pilgrims' and rid = rec.rid;
  end loop;
  if array_length(roomnos, 1) > 0 then
    for r2 in select r.rid, r.raw from store_rows r where r.tbl = 'pilgrims' and not (r.rid = any(tomove)) and _rx_trim(_rx_s(_rx_c(r.raw, i_tr))) = ft
                and _rx_trim(_rx_s(_rx_c(r.raw, i_rm))) <> '' and _rx_trim(_rx_s(_rx_c(r.raw, i_rm))) = any(roomnos) loop
      update store_rows set raw = case when _rx_trim(_rx_s(_rx_c(r2.raw, i_ty))) in ('طفل', 'رضيع') then _pm_set(raw, ix, 'roomNo', '""'::jsonb)
                                       else _pm_set(_pm_set(raw, ix, 'roomNo', '""'::jsonb), ix, 'accommodation', '"رباعي"'::jsonb) end
       where tbl = 'pilgrims' and rid = r2.rid;
    end loop;
  end if;
  update store_meta set ver = ver + 1, updated_at = now() where tbl = 'pilgrims';
  n := coalesce(array_length(names, 1), 0);
  insert into app_outbox (kind, payload) values ('audit', jsonb_build_object('user', who, 'action', 'نقل معتمر بين رحلتين', 'record', array_to_string(names, '، '), 'field', 'معتمر', 'old', ft, 'new', tt || ' (عدد: ' || n || ')'));
  if not skip_acc then
    insert into app_outbox (kind, payload) values ('tripsnap', jsonb_build_object('trip', ft, 'user', who, 'action', 'نقل معتمر إلى «' || tt || '»: ' || array_to_string(names, '، '), 'state', _ts_state(ft))),
                                              ('tripsnap', jsonb_build_object('trip', tt, 'user', who, 'action', 'استلام معتمر من «' || ft || '»: ' || array_to_string(names, '، '), 'state', _ts_state(tt)));
  end if;
  perform _w_dv_bump(array['pilgrims', 'trips', 'bookings']);
  return jsonb_build_object('success', true, 'moved', n, 'names', to_jsonb(names), 'clients', (select coalesce(jsonb_agg(k), '[]'::jsonb) from jsonb_object_keys(clients) k), 'accNote', ''); end $$;

create or replace function rw2_movepilgrimbetweentrips(a jsonb, u text) returns jsonb language plpgsql volatile set search_path = public as
$$ declare who text := coalesce(u, app_user(), '-'); ft text := _rx_trim(coalesce(a ->> 2, '')); tt text := _rx_trim(coalesce(a ->> 3, '')); r jsonb; jid bigint; begin
  r := _pm_move(coalesce(a -> 1, '{}'::jsonb), ft, tt, _gs_truthy(a -> 4), _gs_truthy(a -> 5), who);
  if (r ->> 'success') = 'true' and not _gs_truthy(a -> 5) and jsonb_array_length(r -> 'clients') > 0 then
    insert into app_outbox (kind, payload) values ('accmoved', jsonb_build_object('clients', r -> 'clients', 'from', ft, 'to', tt, 'user', who, 'at', extract(epoch from now()))) returning id into jid;
    r := r || jsonb_build_object('accJob', jid);
  end if;
  return r; end $$;

create or replace function rw2_movepilgrimsbulk(a jsonb, u text) returns jsonb language plpgsql volatile set search_path = public as
$$ declare who text := coalesce(u, app_user(), '-'); ft text := _rx_trim(coalesce(a ->> 2, '')); tt text := _rx_trim(coalesce(a ->> 3, '')); idents jsonb := case when jsonb_typeof(a -> 1) = 'array' then a -> 1 else '[]'::jsonb end;
  ident jsonb; r jsonb; tot int := 0; mn jsonb := '[]'::jsonb; errs jsonb := '[]'::jsonb; cl jsonb := '{}'::jsonb; c text; jid bigint; begin
  if ft = '' or tt = '' or ft = tt then raise exception 'حدد رحلتين مختلفتين' using errcode = 'P0001'; end if;
  insert into app_outbox (kind, payload) values ('tripsnap', jsonb_build_object('trip', ft, 'user', who, 'action', 'خط الأساس (قبل أول تعديل مُلتقَط)', 'state', _ts_state(ft), 'base', true)),
                                            ('tripsnap', jsonb_build_object('trip', tt, 'user', who, 'action', 'خط الأساس (قبل أول تعديل مُلتقَط)', 'state', _ts_state(tt), 'base', true));
  for ident in select * from jsonb_array_elements(idents) loop
    begin
      r := _pm_move(ident, ft, tt, _gs_truthy(a -> 4), true, who);
      if (r ->> 'success') = 'true' then
        tot := tot + (r ->> 'moved')::int; mn := mn || (r -> 'names');
        for c in select jsonb_array_elements_text(r -> 'clients') loop cl := cl || jsonb_build_object(c, true); end loop;
      elsif r ->> 'error' is not null and position('غير موجود في الرحلة المصدر' in (r ->> 'error')) = 0 then
        errs := errs || to_jsonb(coalesce(nullif(ident ->> 'name', ''), nullif(ident ->> 'passport', ''), '?') || ': ' || (r ->> 'error'));
      end if;
    exception when others then
      errs := errs || to_jsonb(coalesce(nullif(ident ->> 'name', ''), '?') || ': ' || sqlerrm);
    end;
  end loop;
  if tot > 0 then
    insert into app_outbox (kind, payload) values ('tripsnap', jsonb_build_object('trip', ft, 'user', who, 'action', 'نقل ' || tot || ' معتمر إلى «' || tt || '»', 'state', _ts_state(ft))),
                                              ('tripsnap', jsonb_build_object('trip', tt, 'user', who, 'action', 'استلام ' || tot || ' معتمر من «' || ft || '»', 'state', _ts_state(tt)));
    if (select count(*) from jsonb_object_keys(cl)) > 0 then
      insert into app_outbox (kind, payload) values ('accmoved', jsonb_build_object('clients', (select jsonb_agg(k) from jsonb_object_keys(cl) k), 'from', ft, 'to', tt, 'user', who, 'at', extract(epoch from now()))) returning id into jid;
    end if;
  end if;
  return jsonb_build_object('success', jsonb_array_length(errs) = 0, 'moved', tot, 'names', mn, 'errors', errs, 'accNote', '', 'accJob', jid, 'clients', (select coalesce(jsonb_agg(k), '[]'::jsonb) from jsonb_object_keys(cl) k)); end $$;

-- تخصيص معتمر من السجل العام لرحلة (= assignPilgrimToTrip)
create or replace function _pm_assign(key_ text, tt text, force_ boolean, who text) returns jsonb language plpgsql volatile set search_path = public as
$$ declare
  ix jsonb := _pm_ix(); i_tr int := (ix ->> 'tripName')::int; i_ps int := (ix ->> 'passport')::int; i_nm int := (ix ->> 'name')::int; i_pid int := (ix ->> 'pid')::int;
  noTrip text; tmpl jsonb; rec record; rt text; width int; row_ jsonb; pc jsonb; confl jsonb; msg text; k text := _rx_trim(coalesce(key_, ''));
  hdr jsonb := _rx_hdr('pilgrims'); nowms bigint := (extract(epoch from clock_timestamp()) * 1000)::bigint; dfix text;
begin
  if k = '' or tt = '' then raise exception 'بيانات ناقصة' using errcode = 'P0001'; end if;
  perform pg_advisory_xact_lock(hashtextextended('store:put:pilgrims', 0));
  for rec in select r.rid, r.raw from store_rows r where r.tbl = 'pilgrims' order by r.ord, r.rid loop
    if _rx_trim(_rx_s(_rx_c(rec.raw, i_ps))) <> k and _rx_trim(_rx_s(_rx_c(rec.raw, i_nm))) <> k then continue; end if;
    rt := _rx_trim(_rx_s(_rx_c(rec.raw, i_tr)));
    if rt = tt then return jsonb_build_object('success', false, 'error', 'المعتمر مسجَّل بالفعل في هذه الرحلة'); end if;
    if rt = '' and noTrip is null then noTrip := rec.rid; end if;
    tmpl := rec.raw;
  end loop;
  if tmpl is null then return jsonb_build_object('success', false, 'error', 'المعتمر غير موجود بالسجل العام'); end if;
  if not force_ then
    pc := jsonb_build_array(jsonb_build_object('name', _rx_s(_rx_c(tmpl, i_nm)), 'passport', _rx_s(_rx_c(tmpl, i_ps))));
    select coalesce(jsonb_agg(c), '[]'::jsonb) into confl from jsonb_array_elements(rx_trip_conflicts_raw(to_jsonb(tt), pc)) c where (c ->> 'kind') = 'passport';
    if jsonb_array_length(confl) > 0 then
      select string_agg(c ->> 'message', E'\n') into msg from jsonb_array_elements(confl) c;
      return jsonb_build_object('success', false, 'conflict', true, 'error', msg); end if;
  end if;
  if noTrip is not null then
    update store_rows set raw = _pm_set(raw, ix, 'tripName', to_jsonb(tt)) where tbl = 'pilgrims' and rid = noTrip;
  else
    width := greatest(jsonb_array_length(hdr), (select max(v::int) + 1 from jsonb_each_text(ix) e(k2, v)));
    select jsonb_agg('""'::jsonb) into row_ from generate_series(1, width);
    row_ := _pm_set(row_, ix, 'name', _rx_c(tmpl, i_nm)); row_ := _pm_set(row_, ix, 'passport', _rx_c(tmpl, i_ps));
    row_ := _pm_set(row_, ix, 'type', _rx_c(tmpl, (ix ->> 'type')::int)); row_ := _pm_set(row_, ix, 'client', _rx_c(tmpl, (ix ->> 'client')::int));
    row_ := _pm_set(row_, ix, 'tripName', to_jsonb(tt)); row_ := _pm_set(row_, ix, 'latinName', _rx_c(tmpl, (ix ->> 'latinName')::int));
    foreach dfix in array array['birthDate', 'issueDate', 'expiryDate'] loop
      row_ := _pm_set(row_, ix, dfix, to_jsonb(case when jsonb_typeof(_rx_c(tmpl, (ix ->> dfix)::int)) = 'object' then to_char(to_timestamp(floor(((_rx_c(tmpl, (ix ->> dfix)::int)) ->> '$d')::float8 / 1000.0)) at time zone 'Africa/Cairo', 'DD/MM/YYYY')
                                                    else _rx_s(_rx_c(tmpl, (ix ->> dfix)::int)) end));
    end loop;
    row_ := _pm_set(row_, ix, 'pid', to_jsonb(coalesce(nullif(_rx_s(_rx_c(tmpl, i_pid)), ''), 'P' || _w_b36(nowms))));
    insert into store_rows (tbl, rid, ord, raw) select 'pilgrims', substr(md5(random()::text || clock_timestamp()::text), 1, 20), coalesce(max(ord), 0) + 1, row_ from store_rows where tbl = 'pilgrims';
  end if;
  update store_meta set ver = ver + 1, updated_at = now() where tbl = 'pilgrims';
  insert into app_outbox (kind, payload) values ('audit', jsonb_build_object('user', who, 'action', 'تخصيص معتمر لرحلة', 'record', _rx_s(_rx_c(tmpl, i_nm)), 'field', 'معتمر', 'old', '-', 'new', tt));
  perform _w_dv_bump(array['pilgrims', 'trips']);
  return jsonb_build_object('success', true); end $$;

create or replace function rw2_assignpilgrimtotrip(a jsonb, u text) returns jsonb language plpgsql volatile set search_path = public as
$$ begin return _pm_assign(a ->> 1, _rx_trim(coalesce(a ->> 2, '')), _gs_truthy(a -> 3), coalesce(u, app_user(), '-')); end $$;

create or replace function rw2_assignpilgrimsbulk(a jsonb, u text) returns jsonb language plpgsql volatile set search_path = public as
$$ declare keys_ jsonb := case when jsonb_typeof(a -> 1) = 'array' then a -> 1 else '[]'::jsonb end; k jsonb; r jsonb; n int := 0; errs jsonb := '[]'::jsonb; who text := coalesce(u, app_user(), '-'); begin
  for k in select * from jsonb_array_elements(keys_) loop
    begin
      r := _pm_assign(k #>> '{}', _rx_trim(coalesce(a ->> 2, '')), _gs_truthy(a -> 3), who);
      if (r ->> 'success') = 'true' then n := n + 1; elsif r ->> 'error' is not null then errs := errs || to_jsonb((k #>> '{}') || ': ' || (r ->> 'error')); end if;
    exception when others then errs := errs || to_jsonb((k #>> '{}') || ': ' || sqlerrm); end;
  end loop;
  return jsonb_build_object('success', jsonb_array_length(errs) = 0, 'assigned', n, 'errors', errs); end $$;

do $$ declare r record; begin
  for r in select p.oid::regprocedure::text sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and (p.proname like '\_pm\_%' or p.proname like '\_ts\_%' or p.proname in ('rw2_movepilgrimbetweentrips', 'rw2_movepilgrimsbulk', 'rw2_assignpilgrimtotrip', 'rw2_assignpilgrimsbulk')) loop
    execute format('revoke all on function %s from public, anon, authenticated', r.sig);
    execute format('grant execute on function %s to service_role', r.sig);
  end loop;
end $$;

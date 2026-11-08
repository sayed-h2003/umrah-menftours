-- 006_store.sql — (V4.376 / طبقة التخزين العامة STORE_TABLES) Postgres مصدر الحقيقة لأي شيت بالملف الرئيسي/ملف الحسابات
-- منطق الأعمال يبقى بـ Apps Script (Store.gs). هذه الدوال ذرّية + service_role فقط. مستقلة عن 003/004/005 (لا تلمس gl_entries/gl_lines).
-- آمن للتكرار. لا يحتاج وجود جداول الهجرة: الجدول الأصلي للصفوف هو store_rows، والجداول المنمّطة (clients/trips/...) «مرآة» تُحدَّث بنفس
-- المعاملة بأفضل جهد (فشل صف منمّط لا يُفشل الحفظ بل يُسجَّل بـ store_mirror_errors) — لأن مفاتيح أجنبية/قيود فريدة بالجداول المنمّطة
-- لا يجوز أن تُضيّع بيانات الشيت.

-- ===== 1) الجداول =====
-- صف الشيت: خلايا حرفية raw (jsonb، التواريخ {"$d":ms}) + ord (ترتيب الصفوف = أرقام صفوف الشيت) + rid (هوية الصف الثابتة)
create table if not exists store_rows (
  tbl  text   not null,
  rid  text   not null,
  ord  bigint not null,
  raw  jsonb  not null,
  primary key (tbl, rid)
);
create index if not exists store_rows_tbl_ord_idx on store_rows (tbl, ord, rid);

-- ترويسة الشيت (الصف 1) + رقم الإصدار (يزيد بكل كتابة ⇒ يُستعمل لإبطال الكاش) + وجود الشيت
create table if not exists store_meta (
  tbl        text primary key,
  hdr        jsonb  not null default '[]'::jsonb,
  ver        bigint not null default 0,
  seeded_at  timestamptz,
  updated_at timestamptz not null default now()
);

-- أخطاء المرآة المنمّطة (لا تُفشل الحفظ) — تُراجَع بـ storeCompare()
create table if not exists store_mirror_errors (
  id  bigserial primary key,
  tbl text, rid text, err text,
  at  timestamptz not null default now()
);
create index if not exists store_mirror_errors_tbl_idx on store_mirror_errors (tbl, id);

alter table store_rows enable row level security;           -- بلا سياسات ⇒ لا وصول للمتصفح
alter table store_meta enable row level security;
alter table store_mirror_errors enable row level security;
revoke all on store_rows, store_meta, store_mirror_errors from anon, authenticated;
grant all on store_rows, store_meta, store_mirror_errors to service_role;
revoke all on sequence store_mirror_errors_id_seq from anon, authenticated;
grant all on sequence store_mirror_errors_id_seq to service_role;

-- أعمدة store_rid للجداول المنمّطة بلا مفتاح طبيعي (مفتاح تلقائي): تُرفع فقط إن وُجد الجدول
do $$ declare t text; begin
  foreach t in array array['movements','vz_transport_prices','vz_agent_prices','gl_auto_log','gl_attachments','gl_deleted'] loop
    if to_regclass('public.' || t) is not null then
      execute format('alter table %I add column if not exists store_rid text', t);
      execute format('create unique index if not exists %I on %I (store_rid)', t || '_store_rid_uq', t);
    end if;
  end loop;
end $$;

-- ===== 2) قراءة صفحة: يرجع الإصدار مع الصفحة بنفس العبارة (لقطة متسقة) =====
create or replace function store_read(p_tbl text, p_off int default 0, p_lim int default 1000) returns jsonb
language plpgsql stable security invoker set search_path = public, pg_temp as
$$ declare m store_meta%rowtype; r jsonb; n bigint; begin
  select * into m from store_meta where tbl = p_tbl;
  select coalesce(jsonb_agg(jsonb_build_array(ord, rid, raw) order by ord, rid), '[]'::jsonb) into r
    from (select ord, rid, raw from store_rows where tbl = p_tbl order by ord, rid offset greatest(p_off, 0) limit greatest(least(p_lim, 5000), 1)) s;
  select count(*) into n from store_rows where tbl = p_tbl;
  return jsonb_build_object('ver', coalesce(m.ver, 0), 'exists', m.tbl is not null, 'hdr', coalesce(m.hdr, '[]'::jsonb), 'n', n, 'rows', r);
end $$;

-- أرقام الإصدار + وجود الشيتات (استعلام خفيف للكاش)
create or replace function store_vers(p_tbls text[] default null) returns jsonb
language sql stable security invoker set search_path = public, pg_temp as
$$ select coalesce(jsonb_object_agg(tbl, ver), '{}'::jsonb) from store_meta where p_tbls is null or tbl = any (p_tbls) $$;

-- ===== 3) مرآة منمّطة: upsert/حذف بصف واحد بأفضل جهد =====
-- m = {t: جدول منمّط, mode: 'pk'|'rid', pk:[أعمدة], nullfk:[أعمدة تُصفَّر عند فشل المفتاح الأجنبي], up:[كائنات], del:[{pk..}]|[{store_rid}], rids:[rid لكل كائن up]}
create or replace function _store_mirror(m jsonb, p_tbl text) returns jsonb
language plpgsql set search_path = public, pg_temp as
$$ declare tt text := m ->> 't'; mode text := coalesce(m ->> 'mode', 'pk'); pk text[]; cols text; sets text; o jsonb; i int := 0; ok int := 0; er int := 0; w text; d jsonb; nf text; o2 jsonb; rids jsonb := coalesce(m -> 'rids', '[]'::jsonb); begin
  if tt is null or to_regclass('public.' || tt) is null then return jsonb_build_object('ok', 0, 'err', 0, 'skipped', true); end if;
  if mode = 'rid' then pk := array['store_rid']; else select array(select jsonb_array_elements_text(m -> 'pk')) into pk; end if;
  -- حذف أولاً
  for d in select * from jsonb_array_elements(coalesce(m -> 'del', '[]'::jsonb)) loop
    begin
      w := (select string_agg(format('%I is not distinct from (%L::jsonb ->> %L)::%s', c, d::text, c, (select format_type(a.atttypid, a.atttypmod) from pg_attribute a where a.attrelid = ('public.' || tt)::regclass and a.attname = c and not a.attisdropped)), ' and ') from unnest(pk) c);
      if w is not null then execute format('delete from %I where %s', tt, w); end if;
    exception when others then
      er := er + 1; insert into store_mirror_errors (tbl, rid, err) values (p_tbl, null, 'del: ' || left(sqlerrm, 300));
    end;
  end loop;
  if jsonb_array_length(coalesce(m -> 'up', '[]'::jsonb)) = 0 then return jsonb_build_object('ok', ok, 'err', er); end if;
  select string_agg(format('%I', c.column_name), ', ' order by c.ordinal_position),
         string_agg(format('%I = excluded.%I', c.column_name, c.column_name), ', ' order by c.ordinal_position) filter (where c.column_name <> all (pk))
    into cols, sets
    from information_schema.columns c
   where c.table_schema = 'public' and c.table_name = tt and c.column_name in (select jsonb_object_keys(m -> 'up' -> 0));
  if cols is null then return jsonb_build_object('ok', 0, 'err', 0, 'skipped', true); end if;
  if sets is null then sets := format('%I = excluded.%I', pk[1], pk[1]); end if;
  for o in select * from jsonb_array_elements(m -> 'up') loop
    i := i + 1;
    begin
      execute format('insert into %I (%s) select %s from jsonb_populate_record(null::%I, $1) on conflict (%s) do update set %s', tt, cols, cols, tt, array_to_string(array(select format('%I', c) from unnest(pk) c), ', '), sets) using o;
      ok := ok + 1;
    exception when others then
      o2 := o; w := sqlerrm;
      -- محاولة ثانية: تصفير أعمدة المراجع الاختيارية (الأصل يبقى بـ raw)
      if jsonb_array_length(coalesce(m -> 'nullfk', '[]'::jsonb)) > 0 then
        for nf in select jsonb_array_elements_text(m -> 'nullfk') loop o2 := o2 || jsonb_build_object(nf, null); end loop;
        begin
          execute format('insert into %I (%s) select %s from jsonb_populate_record(null::%I, $1) on conflict (%s) do update set %s', tt, cols, cols, tt, array_to_string(array(select format('%I', c) from unnest(pk) c), ', '), sets) using o2;
          ok := ok + 1; w := null;
        exception when others then w := sqlerrm; end;
      end if;
      if w is not null then er := er + 1; insert into store_mirror_errors (tbl, rid, err) values (p_tbl, rids ->> (i - 1), left(w, 300)); end if;
    end;
  end loop;
  return jsonb_build_object('ok', ok, 'err', er);
end $$;

-- ظلال الآباء (عملاء/رحلات…) لتفادي فشل المفتاح الأجنبي بالمرآة: [{t, pk, rows:[{..}]}] — تتجاهل الموجود
create or replace function _store_stubs(s jsonb) returns void
language plpgsql set search_path = public, pg_temp as
$$ declare g jsonb; tt text; cols text; begin
  for g in select * from jsonb_array_elements(coalesce(s, '[]'::jsonb)) loop
    tt := g ->> 't';
    if tt is null or to_regclass('public.' || tt) is null or jsonb_array_length(coalesce(g -> 'rows', '[]'::jsonb)) = 0 then continue; end if;
    begin
      select string_agg(format('%I', c.column_name), ', ' order by c.ordinal_position) into cols
        from information_schema.columns c where c.table_schema = 'public' and c.table_name = tt and c.column_name in (select jsonb_object_keys(g -> 'rows' -> 0));
      if cols is not null then
        execute format('insert into %I (%s) select %s from jsonb_populate_recordset(null::%I, $1) on conflict do nothing', tt, cols, cols, tt) using g -> 'rows';
      end if;
    exception when others then null; end;
  end loop;
end $$;

-- ===== 4) الكتابة الذرّية =====
-- p = { t, hdr: [..]|null (ترويسة الشيت — null = بلا تغيير), exists: bool, wipe: bool,
--       up: [{rid, raw}] (الجديد يأخذ ord = أعلى ord + ترتيبه · القائم يحتفظ بترتيبه), del: [rid], stubs: [...], mirror: {...}, seeded: bool }
create or replace function store_put(p jsonb) returns jsonb
language plpgsql security invoker set search_path = public, pg_temp as
$$ declare tt text := p ->> 't'; b0 bigint; nu int := 0; nd int := 0; v bigint; mres jsonb := null; begin
  if tt is null or tt = '' then raise exception 'store_put: t مطلوب'; end if;
  perform pg_advisory_xact_lock(hashtextextended('store:put:' || tt, 0));
  if coalesce((p ->> 'wipe')::boolean, false) then delete from store_rows where tbl = tt; end if;
  select coalesce(max(ord), 0) into b0 from store_rows where tbl = tt;
  if jsonb_array_length(coalesce(p -> 'del', '[]'::jsonb)) > 0 then
    delete from store_rows where tbl = tt and rid in (select jsonb_array_elements_text(p -> 'del'));
    get diagnostics nd = row_count;
  end if;
  if jsonb_array_length(coalesce(p -> 'up', '[]'::jsonb)) > 0 then
    insert into store_rows (tbl, rid, ord, raw)
    select tt, x ->> 'rid', b0 + n, x -> 'raw'
      from jsonb_array_elements(p -> 'up') with ordinality t(x, n)
    on conflict (tbl, rid) do update set raw = excluded.raw;     -- ord القائم لا يتغيّر
    get diagnostics nu = row_count;
  end if;
  insert into store_meta (tbl, hdr, ver, seeded_at, updated_at)
  values (tt, coalesce(p -> 'hdr', '[]'::jsonb), 1, case when coalesce((p ->> 'seeded')::boolean, false) then now() end, now())
  on conflict (tbl) do update set hdr = case when p ? 'hdr' and jsonb_typeof(p -> 'hdr') = 'array' then p -> 'hdr' else store_meta.hdr end,
                                  ver = store_meta.ver + 1, updated_at = now(),
                                  seeded_at = case when coalesce((p ->> 'seeded')::boolean, false) then now() else store_meta.seeded_at end
  returning ver into v;
  if p ? 'stubs' then perform _store_stubs(p -> 'stubs'); end if;
  if p ? 'mirror' and jsonb_typeof(p -> 'mirror') = 'object' then mres := _store_mirror(p -> 'mirror', tt); end if;
  return jsonb_build_object('ver', v, 'up', nu, 'del', nd, 'mirror', mres);
end $$;

-- بعد تحميل أولي: احذف صفوف المرآة التي ليست بالشيت (keep = [{pk..}] أو [rid] لوضع rid). بأفضل جهد (مرجع أجنبي يمنع الحذف ⇒ يُتخطى)
create or replace function store_mirror_prune(p_tbl text, m jsonb, keep jsonb) returns jsonb
language plpgsql set search_path = public, pg_temp as
$$ declare tt text := m ->> 't'; mode text := coalesce(m ->> 'mode', 'pk'); pk text[]; n int := 0; begin
  perform pg_advisory_xact_lock(hashtextextended('store:put:' || p_tbl, 0));
  if tt is null or to_regclass('public.' || tt) is null then return jsonb_build_object('pruned', 0, 'skipped', true); end if;
  if mode = 'rid' then
    begin
      execute format('delete from %I where store_rid is null or store_rid <> all (array(select jsonb_array_elements_text($1)))', tt) using keep;
      get diagnostics n = row_count;
    exception when others then insert into store_mirror_errors (tbl, rid, err) values (p_tbl, null, 'prune: ' || left(sqlerrm, 300)); end;
    return jsonb_build_object('pruned', n);
  end if;
  select array(select jsonb_array_elements_text(m -> 'pk')) into pk;
  begin
    execute format('delete from %I t where not exists (select 1 from jsonb_array_elements($1) k where %s)', tt,
      (select string_agg(format('(k ->> %L) is not distinct from (t.%I)::text', c, c), ' and ') from unnest(pk) c)) using keep;
    get diagnostics n = row_count;
  exception when others then insert into store_mirror_errors (tbl, rid, err) values (p_tbl, null, 'prune: ' || left(sqlerrm, 300)); end;
  return jsonb_build_object('pruned', n);
end $$;

-- ===== 5) فحص: أعداد المخزن مقابل المرآة + مجاميع أعمدة مالية + أخطاء المرآة =====
-- p = [{tbl, typed, sumcols:[..]}]
create or replace function store_check(p jsonb) returns jsonb
language plpgsql stable security invoker set search_path = public, pg_temp as
$$ declare x jsonb; out jsonb := '{}'::jsonb; ns bigint; nt bigint; sums jsonb; c text; v numeric; ne bigint; vv bigint; begin
  for x in select * from jsonb_array_elements(coalesce(p, '[]'::jsonb)) loop
    select count(*) into ns from store_rows where tbl = x ->> 'tbl';
    select coalesce(max(m.ver), 0) into vv from store_meta m where m.tbl = x ->> 'tbl';
    select count(*) into ne from store_mirror_errors where tbl = x ->> 'tbl';
    nt := null; sums := '{}'::jsonb;
    if x ->> 'typed' is not null and to_regclass('public.' || (x ->> 'typed')) is not null then
      execute format('select count(*) from %I', x ->> 'typed') into nt;
      for c in select jsonb_array_elements_text(coalesce(x -> 'sumcols', '[]'::jsonb)) loop
        execute format('select coalesce(sum(%I), 0) from %I', c, x ->> 'typed') into v;
        sums := sums || jsonb_build_object(c, v);
      end loop;
    end if;
    out := out || jsonb_build_object(x ->> 'tbl', jsonb_build_object('store', ns, 'typed', nt, 'sums', sums, 'errors', ne, 'ver', vv));
  end loop;
  return out;
end $$;

-- ===== 6) الصلاحيات: service_role فقط =====
revoke all on function store_read(text, int, int) from public, anon, authenticated;
revoke all on function store_vers(text[]) from public, anon, authenticated;
revoke all on function _store_mirror(jsonb, text) from public, anon, authenticated;
revoke all on function _store_stubs(jsonb) from public, anon, authenticated;
revoke all on function store_put(jsonb) from public, anon, authenticated;
revoke all on function store_mirror_prune(text, jsonb, jsonb) from public, anon, authenticated;
revoke all on function store_check(jsonb) from public, anon, authenticated;
grant execute on function store_read(text, int, int) to service_role;
grant execute on function store_vers(text[]) to service_role;
grant execute on function _store_mirror(jsonb, text) to service_role;
grant execute on function _store_stubs(jsonb) to service_role;
grant execute on function store_put(jsonb) to service_role;
grant execute on function store_mirror_prune(text, jsonb, jsonb) to service_role;
grant execute on function store_check(jsonb) to service_role;

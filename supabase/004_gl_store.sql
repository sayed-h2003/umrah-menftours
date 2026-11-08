-- 004_gl_store.sql — (V4.373 / المرحلة 2-ب/أ) طبقة تخزين القيود: Postgres مصدر بيانات gl_entries/gl_lines بدل الشيت
-- منطق الأعمال يبقى بـ Apps Script؛ هذه الدوال ذرّية + service_role فقط. مستقلة عن 003 (تنشئ التسلسلات إن لم توجد).
-- يُشغَّل مرة واحدة (آمن للتكرار). يتطلب وجود gl_entries / gl_lines / gl_accounts / gl_batches (هجرة Migration.gs).

-- ===== 1) أعمدة التخزين: raw = خلايا الشيت حرفياً (قراءة دقيقة) · ord = ترتيب الإدراج =====
alter table gl_entries add column if not exists raw jsonb;
alter table gl_entries add column if not exists ord bigint;
alter table gl_lines   add column if not exists raw jsonb;
alter table gl_lines   add column if not exists ord bigint;
create index if not exists gl_entries_ord_idx on gl_entries (ord);
create index if not exists gl_lines_ord_idx   on gl_lines (ord, entry_id, line_no);

create sequence if not exists gl_entry_seq;        -- JE-%06d — لا يُعاد استخدام رقم أبداً (نفس تسلسل 003)
create sequence if not exists gl_store_ord_seq;    -- ترتيب الصفوف

-- ===== 2) upsert عام: صفوف jsonb ⇒ جدول (الأعمدة الموجودة بالمفاتيح فقط تُكتب؛ ord يُحفظ للقائم إلا بـ reset_ord) =====
create or replace function _gls_upsert(tbl text, pk text, arr jsonb, reset_ord boolean) returns int
language plpgsql as
$$ declare cols text; sets text; n int; begin
  if arr is null or jsonb_array_length(arr) = 0 then return 0; end if;
  select string_agg(format('%I', c.column_name), ', ' order by c.ordinal_position),
         string_agg(format('%I = excluded.%I', c.column_name, c.column_name), ', ' order by c.ordinal_position)
             filter (where c.column_name <> all (string_to_array(pk, ',')) and (c.column_name <> 'ord' or reset_ord))
    into cols, sets
    from information_schema.columns c
   where c.table_schema = 'public' and c.table_name = tbl and c.column_name in (select jsonb_object_keys(arr -> 0));
  execute format('insert into %I (%s) select %s from jsonb_populate_recordset(null::%I, $1) on conflict (%s) do update set %s', tbl, cols, cols, tbl, pk, sets) using arr;
  get diagnostics n = row_count;
  return n;
end $$;

-- ===== 2ب) حذف قيود مع التعامل مع الجداول التي تشير إليها بمفتاح أجنبي (مثل gl_attachments) — ديناميكي بلا افتراض أسماء =====
-- only_unreferenced=true  ⇒ يحذف القيود غير المشار إليها فقط (يُستعمل في wipe/إعادة النقل: المُشار إليه يبقى ويُحدَّث بالـupsert)
-- only_unreferenced=false ⇒ يحذف صفوف الجداول التابعة أولاً (مرفقات قيد محذوف) ثم القيود (حذف صريح من التطبيق)
create or replace function _gls_del_entries(ids text[], only_unreferenced boolean) returns int
language plpgsql as
$$ declare r record; q text; n int := 0; begin
  for r in select c.conrelid::regclass::text as child, a.attname as col
             from pg_constraint c join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
            where c.contype = 'f' and c.confrelid = 'gl_entries'::regclass and c.conrelid <> 'gl_lines'::regclass loop
    if not only_unreferenced then
      execute format('delete from %s where %I = any ($1)', r.child, r.col) using coalesce(ids, (select array_agg(entry_id) from gl_entries));
    end if;
  end loop;
  q := 'delete from gl_entries e where ' || case when ids is null then 'true' else 'e.entry_id = any ($1)' end;
  if only_unreferenced then
    for r in select c.conrelid::regclass::text as child, a.attname as col
               from pg_constraint c join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
              where c.contype = 'f' and c.confrelid = 'gl_entries'::regclass and c.conrelid <> 'gl_lines'::regclass loop
      q := q || format(' and not exists (select 1 from %s x where x.%I = e.entry_id)', r.child, r.col);
    end loop;
  end if;
  if ids is null then execute q; else execute q using ids; end if;
  get diagnostics n = row_count;
  return n;
end $$;

-- ===== 3) الكتابة الذرّية: حذف سطور/قيود ثم upsert قيود ثم سطور — كلها بمعاملة واحدة =====
-- p = { entries:[{<أعمدة gl_entries>, raw:[...]}], lines:[...], accs:[{code,name,acc_type}] (ظلال حسابات للمفاتيح الأجنبية),
--       del_lines:[[entry_id,line_no]], del_lines_of:[entry_id], del_entries:[entry_id], wipe:bool, reset_ord:bool }
create or replace function gl_store_put(p jsonb) returns jsonb
language plpgsql security invoker set search_path = public, pg_temp as
$$ declare e jsonb; e2 jsonb; l jsonb; l2 jsonb; b0 bigint; ro boolean := coalesce((p ->> 'reset_ord')::boolean, false); ne int := 0; nl int := 0; begin
  perform pg_advisory_xact_lock(hashtextextended('gl:store:put', 0));
  if coalesce((p ->> 'wipe')::boolean, false) then
    delete from gl_lines where true;
    perform _gls_del_entries(null, true);   -- القيود المشار إليها (مرفقات…) تبقى وتُحدَّث بالـupsert أدناه
  end if;
  if jsonb_array_length(coalesce(p -> 'accs', '[]'::jsonb)) > 0 then
    insert into gl_accounts (code, name, acc_type)
    select x ->> 'code', x ->> 'name', x ->> 'acc_type' from jsonb_array_elements(p -> 'accs') x
    on conflict (code) do nothing;
  end if;
  delete from gl_lines gl using jsonb_array_elements(coalesce(p -> 'del_lines', '[]'::jsonb)) d
   where gl.entry_id = d ->> 0 and gl.line_no = (d ->> 1)::int;
  delete from gl_lines where entry_id in (select jsonb_array_elements_text(coalesce(p -> 'del_lines_of', '[]'::jsonb)));
  perform _gls_del_entries(array(select jsonb_array_elements_text(coalesce(p -> 'del_entries', '[]'::jsonb))), false);
  -- ord: الجديد/المنقول (_mv) يأخذ رقماً جديداً بترتيب المصفوفة (تحت القفل ⇒ متتابع)؛ القائم يحتفظ بترتيبه إلا مع reset_ord
  -- دفعة غير موجودة بـ gl_batches ⇒ batch_no فارغ بالعمود المنمّط (القيمة الأصلية تبقى بـ raw) كما بالهجرة
  select coalesce(jsonb_array_length(p -> 'entries'), 0) + coalesce(jsonb_array_length(p -> 'lines'), 0) into ne;
  b0 := nextval('gl_store_ord_seq');
  if ne > 1 then perform setval('gl_store_ord_seq', b0 + ne - 1, true); end if;
  select jsonb_agg(y order by n) filter (where not mv), jsonb_agg(y order by n) filter (where mv) into e, e2
    from (select (case when x ->> 'batch_no' is not null and not exists (select 1 from gl_batches b where b.batch_no = x ->> 'batch_no')
                       then x || '{"batch_no":null}'::jsonb else x end) || jsonb_build_object('ord', b0 + n - 1) as y, n, coalesce((x ->> '_mv')::boolean, false) as mv
            from jsonb_array_elements(coalesce(p -> 'entries', '[]'::jsonb)) with ordinality t(x, n)) s;
  select jsonb_agg(y order by n) filter (where not mv), jsonb_agg(y order by n) filter (where mv) into l, l2
    from (select x || jsonb_build_object('ord', b0 + coalesce(jsonb_array_length(p -> 'entries'), 0) + n - 1) as y, n, coalesce((x ->> '_mv')::boolean, false) as mv
            from jsonb_array_elements(coalesce(p -> 'lines', '[]'::jsonb)) with ordinality t(x, n)) s;
  ne := _gls_upsert('gl_entries', 'entry_id', e, ro) + _gls_upsert('gl_entries', 'entry_id', e2, true);
  nl := _gls_upsert('gl_lines', 'entry_id,line_no', l, ro) + _gls_upsert('gl_lines', 'entry_id,line_no', l2, true);
  return jsonb_build_object('entries', ne, 'lines', nl);
end $$;

-- حذف قيود مع سطورها (واجهة صريحة)
create or replace function gl_store_delete(ids text[]) returns int
language plpgsql security invoker set search_path = public, pg_temp as
$$ declare n int; begin
  perform pg_advisory_xact_lock(hashtextextended('gl:store:put', 0));
  delete from gl_lines where entry_id = any (ids);
  n := _gls_del_entries(ids, false);
  return n;
end $$;

-- ===== 4) أرقام القيود: SEQUENCE لا يتراجع (حتى لو فشل الحفظ لاحقاً) · يرجع أول رقم من n متتالية =====
create or replace function gl_store_next_seq(n int default 1) returns bigint
language plpgsql security invoker set search_path = public, pg_temp as
$$ declare v bigint; mx bigint; k int := greatest(coalesce(n, 1), 1); begin
  perform pg_advisory_xact_lock(hashtextextended('gl:seq:entry', 0));   -- نفس قفل 003 _glw_next_entry_seq
  select greatest(coalesce(max(seq), 0), coalesce(max(case when entry_id ~ '^JE-[0-9]+$' then substr(entry_id, 4)::bigint end), 0)) into mx from gl_entries;
  v := nextval('gl_entry_seq');
  if v <= mx then perform setval('gl_entry_seq', mx, true); v := nextval('gl_entry_seq'); end if;
  if k > 1 then perform setval('gl_entry_seq', v + k - 1, true); end if;
  return v;
end $$;

-- بعد نقل/استيراد: ارفع التسلسل فوق أكبر رقم موجود، ورقّم ord للصفوف الخالية (صفوف glShadowSync بلا ترتيب)
create or replace function gl_store_resync_seq() returns jsonb
language plpgsql security invoker set search_path = public, pg_temp as
$$ declare mx bigint; base bigint; ne int; nl int; begin
  perform pg_advisory_xact_lock(hashtextextended('gl:seq:entry', 0));
  select greatest(coalesce(max(seq), 0), coalesce(max(case when entry_id ~ '^JE-[0-9]+$' then substr(entry_id, 4)::bigint end), 0)) into mx from gl_entries;
  perform setval('gl_entry_seq', greatest(mx, (select last_value from gl_entry_seq), 1), true);
  select coalesce(max(ord), 0) into base from gl_entries;
  with o as (select entry_id, row_number() over (order by seq nulls last, entry_id) rn from gl_entries where ord is null)
  update gl_entries e set ord = base + o.rn from o where e.entry_id = o.entry_id;
  get diagnostics ne = row_count;
  select coalesce(max(ord), 0) into base from gl_lines;
  with o as (select entry_id, line_no, row_number() over (order by entry_id, line_no) rn from gl_lines where ord is null)
  update gl_lines g set ord = base + o.rn from o where g.entry_id = o.entry_id and g.line_no = o.line_no;
  get diagnostics nl = row_count;
  perform setval('gl_store_ord_seq', greatest((select coalesce(max(ord), 0) from gl_entries), (select coalesce(max(ord), 0) from gl_lines), (select last_value from gl_store_ord_seq), 1), true);
  return jsonb_build_object('seq', (select last_value from gl_entry_seq), 'ord_entries', ne, 'ord_lines', nl);
end $$;

-- ===== 5) الصلاحيات: service_role فقط =====
revoke all on function _gls_upsert(text, text, jsonb, boolean) from public, anon, authenticated;
revoke all on function _gls_del_entries(text[], boolean) from public, anon, authenticated;
revoke all on function gl_store_put(jsonb) from public, anon, authenticated;
revoke all on function gl_store_delete(text[]) from public, anon, authenticated;
revoke all on function gl_store_next_seq(int) from public, anon, authenticated;
revoke all on function gl_store_resync_seq() from public, anon, authenticated;
grant execute on function _gls_upsert(text, text, jsonb, boolean) to service_role;
grant execute on function gl_store_put(jsonb) to service_role;
grant execute on function gl_store_delete(text[]) to service_role;
grant execute on function gl_store_next_seq(int) to service_role;
grant execute on function gl_store_resync_seq() to service_role;
revoke all on sequence gl_entry_seq, gl_store_ord_seq from anon, authenticated;

-- 035: 🗑️ سلة المحذوفات — أي سطر يُحذف من المخزن (إشعار/رحلة/معتمرون/بند أو دفعة حساب…) يُحفظ هنا بنصّه الكامل مدة قابلة للتعديل (30 يوماً افتراضياً)
--       ويُستعاد بصلاحية recycle.edit (الأدمن افتراضياً، ويُمنح لأي مستخدم من شاشة المستخدمين). بديل نسخة الجدول الكاملة (_backupSpreadsheet_) قبل الحذف المجمّع.
-- • الالتقاط: مشغّل على store_rows (بعد الحذف) يعمل فقط حين تستدعي الدالة الحاذفة _rb_on(kind,label,detail,user) بنفس المعاملة — فلا تدخل السلةَ مزامناتُ الاستبدال الداخلية.
-- • الاستعادة تعيد الصفوف بنفس rid/ord وترفع نسخة الجدول وبصمات dv (فتظهر بكل الشاشات)، وتتحقق من عدم تعارض رقم الإشعار/اسم الرحلة، وتحذف شاهد الحذف لبنود الحسابات.
-- بعد هذا الملف أعِد تشغيل 025 و029 و033 (تستدعي _rb_on) ثم شغّل 036. يتطلب 006+009.
create table if not exists recycle_bin (
  id bigserial primary key,
  grp text not null unique,
  kind text not null,
  label text not null default '',
  detail text not null default '',
  n int not null default 0,
  deleted_by text not null default '-',
  deleted_at timestamptz not null default now(),
  expires_at timestamptz not null,
  restored_at timestamptz,
  restored_by text
);
alter table recycle_bin add column if not exists src text not null default 'pg';      -- pg = صفوف مخزن Postgres تُستعاد منه · as = عناصر من Apps Script (قيود الحسابات العامة…) تُستعاد بدوال Apps Script
alter table recycle_bin add column if not exists payload jsonb;
create index if not exists recycle_bin_exp_idx on recycle_bin (expires_at);
create table if not exists recycle_rows (
  grp text not null references recycle_bin (grp) on delete cascade,
  tbl text not null, rid text not null, ord bigint not null, raw jsonb not null,
  primary key (grp, tbl, rid)
);
create table if not exists recycle_settings (k text primary key, v text not null);
alter table recycle_bin enable row level security; alter table recycle_rows enable row level security; alter table recycle_settings enable row level security;
revoke all on recycle_bin, recycle_rows, recycle_settings from anon, authenticated;
grant all on recycle_bin, recycle_rows, recycle_settings to service_role;

create or replace function _rb_days() returns int language sql stable set search_path = public as
$$ select least(3650, greatest(1, coalesce((select v::int from recycle_settings where k = 'days' and v ~ '^\d+$'), 30))) $$;

-- تفعيل الالتقاط لبقية المعاملة (مجموعة جديدة لكل نداء)
create or replace function _rb_on(p_kind text, p_label text, p_detail text, p_user text) returns void language plpgsql volatile set search_path = public as
$$ begin
  perform set_config('app.rb_grp', md5(random()::text || clock_timestamp()::text || txid_current()::text), true);
  perform set_config('app.rb_kind', coalesce(p_kind, ''), true);
  perform set_config('app.rb_label', left(coalesce(p_label, ''), 300), true);
  perform set_config('app.rb_detail', left(coalesce(p_detail, ''), 600), true);
  perform set_config('app.rb_user', coalesce(p_user, '-'), true);
  delete from recycle_bin where expires_at < now(); end $$;
create or replace function _rb_off() returns void language sql volatile as $$ select set_config('app.rb_grp', '', true) $$;

create or replace function _rb_capture() returns trigger language plpgsql security definer set search_path = public as
$$ declare g text := nullif(current_setting('app.rb_grp', true), ''); begin
  if g is null then return null; end if;
  insert into recycle_bin (grp, kind, label, detail, deleted_by, expires_at)
    values (g, coalesce(current_setting('app.rb_kind', true), ''), coalesce(current_setting('app.rb_label', true), ''), coalesce(current_setting('app.rb_detail', true), ''),
            coalesce(nullif(current_setting('app.rb_user', true), ''), '-'), now() + make_interval(days => _rb_days()))
    on conflict (grp) do nothing;
  insert into recycle_rows (grp, tbl, rid, ord, raw) select g, o.tbl, o.rid, o.ord, o.raw from o_rows o on conflict do nothing;
  update recycle_bin set n = (select count(*) from recycle_rows where grp = g) where grp = g;
  return null; end $$;
drop trigger if exists store_rows_rb on store_rows;
create trigger store_rows_rb after delete on store_rows referencing old table as o_rows for each statement execute function _rb_capture();

-- ===== القراءة: rx2_recyclelist(a=[token, {kind, q, user, restored, limit(20|50|100), page}]) — الأحدث حذفاً أولاً، بترقيم =====
create or replace function rx2_recyclelist(a jsonb, u text) returns jsonb language plpgsql stable set search_path = public as
$$ declare f jsonb := case when jsonb_typeof(a -> 1) = 'object' then a -> 1 else '{}'::jsonb end; k text := coalesce(f ->> 'kind', ''); q text := lower(btrim(coalesce(f ->> 'q', ''))); usr text := lower(btrim(coalesce(f ->> 'user', '')));
  lim int := case when coalesce(nullif(f ->> 'limit', '')::int, 20) in (20, 50, 100) then (f ->> 'limit')::int else 20 end; pg int := greatest(0, coalesce(nullif(f ->> 'page', '')::int, 0));
  shw boolean := coalesce((f ->> 'restored')::boolean, false); items jsonb; kinds jsonb; tot int; begin
  if not app_has('recycle.view') then raise exception 'لا تملك صلاحية عرض سلة المحذوفات' using errcode = '42501'; end if;
  select count(*) into tot from recycle_bin b where b.expires_at > now() and (shw or b.restored_at is null) and (k = '' or b.kind = k) and (usr = '' or lower(b.deleted_by) like '%' || usr || '%')
     and (q = '' or lower(b.label || ' ' || b.detail || ' ' || b.deleted_by) like '%' || q || '%');
  select coalesce(jsonb_agg(x order by (x ->> 'ts') desc, (x ->> 'id')::bigint desc), '[]'::jsonb) into items from (
    select jsonb_build_object('id', b.id, 'kind', b.kind, 'src', b.src, 'label', b.label, 'detail', b.detail, 'n', b.n, 'by', b.deleted_by,
             'at', to_char(b.deleted_at at time zone 'Africa/Cairo', 'YYYY-MM-DD HH24:MI:SS'), 'ts', b.deleted_at, 'exp', to_char(b.expires_at at time zone 'Africa/Cairo', 'YYYY-MM-DD'),
             'restored', b.restored_at is not null, 'restoredBy', coalesce(b.restored_by, ''),
             'restoredAt', coalesce(to_char(b.restored_at at time zone 'Africa/Cairo', 'YYYY-MM-DD HH24:MI'), '')) x
      from recycle_bin b where b.expires_at > now() and (shw or b.restored_at is null) and (k = '' or b.kind = k) and (usr = '' or lower(b.deleted_by) like '%' || usr || '%')
       and (q = '' or lower(b.label || ' ' || b.detail || ' ' || b.deleted_by) like '%' || q || '%')
     order by b.deleted_at desc, b.id desc limit lim offset pg * lim) s;
  select coalesce(jsonb_object_agg(kind, c), '{}'::jsonb) into kinds from (select kind, count(*) c from recycle_bin where expires_at > now() and restored_at is null group by kind) z;
  return jsonb_build_object('items', items, 'kinds', kinds, 'total', tot, 'page', pg, 'limit', lim, 'days', _rb_days(), 'canRestore', app_has('recycle.edit'), 'canDelete', app_has('admin'), 'canSettings', app_has('admin')); end $$;

-- إدراج عناصر من Apps Script (service_role فقط): [{kind,label,detail,user,payload}] — قيود الحسابات العامة (سندات القبض/الصرف · الخزينة · البنوك · العهد…)
create or replace function rb_put_ext(p_items jsonb) returns int language plpgsql volatile security definer set search_path = public as
$$ declare x jsonb; n int := 0; begin
  if jsonb_typeof(p_items) is distinct from 'array' then return 0; end if;
  delete from recycle_bin where expires_at < now();
  for x in select * from jsonb_array_elements(p_items) loop
    insert into recycle_bin (grp, kind, label, detail, n, deleted_by, expires_at, src, payload)
      values (md5(random()::text || clock_timestamp()::text || n::text), coalesce(x ->> 'kind', 'other'), left(coalesce(x ->> 'label', ''), 300), left(coalesce(x ->> 'detail', ''), 600), 1,
              coalesce(nullif(x ->> 'user', ''), '-'), now() + make_interval(days => _rb_days()), 'as', x -> 'payload');
    n := n + 1;
  end loop;
  return n; end $$;

-- ===== الاستعادة =====
create or replace function rw2_recyclerestore(a jsonb, u text) returns jsonb language plpgsql volatile set search_path = public as
$$ declare ids bigint[]; b record; r record; who text := coalesce(u, app_user(), '-'); ok int := 0; errs jsonb := '[]'::jsonb; ins int; skipped int; tbls text[]; t text; conflict text; bm jsonb; ixid int; ixc int; begin
  if not app_has('recycle.edit') then raise exception 'لا تملك صلاحية الاستعادة من سلة المحذوفات' using errcode = '42501'; end if;
  select array_agg(case when jsonb_typeof(x) = 'string' then (x #>> '{}')::bigint else x::text::bigint end) into ids
    from jsonb_array_elements(case when jsonb_typeof(a -> 1) = 'array' then a -> 1 else jsonb_build_array(a -> 1) end) x;
  if ids is null then return jsonb_build_object('success', false, 'error', 'لا يوجد اختيار'); end if;
  perform pg_advisory_xact_lock(hashtextextended('recycle:restore', 0));
  for b in select * from recycle_bin where id = any(ids) and src = 'pg' and restored_at is null and expires_at > now() order by id loop
    conflict := null;
    if exists (select 1 from recycle_rows where grp = b.grp and tbl = 'bookings') and exists (select 1 from store_meta where tbl = 'bookings') then
      bm := _rx_map('bookings', _bk_canon()); ixid := (bm ->> 'رقم الإشعار')::int;
      if ixid is not null and exists (select 1 from recycle_rows rr join store_rows s on s.tbl = 'bookings' and btrim(_rx_s(s.raw -> ixid)) = btrim(_rx_s(rr.raw -> ixid)) where rr.grp = b.grp and rr.tbl = 'bookings') then
        conflict := 'رقم الإشعار مستخدم الآن بإشعار آخر'; end if;
    end if;
    if conflict is null and exists (select 1 from recycle_rows rr join store_rows s on s.tbl = 'trips' and _rx_trim(_rx_s(_rx_c(s.raw, 0))) = _rx_trim(_rx_s(_rx_c(rr.raw, 0))) where rr.grp = b.grp and rr.tbl = 'trips') then
      conflict := 'يوجد الآن رحلة بنفس الاسم'; end if;
    if conflict is not null then errs := errs || to_jsonb(b.label || ': ' || conflict); continue; end if;
    ins := 0; tbls := '{}';
    for r in select * from recycle_rows where grp = b.grp order by tbl, ord, rid loop
      perform pg_advisory_xact_lock(hashtextextended('store:put:' || r.tbl, 0));
      insert into store_rows (tbl, rid, ord, raw) values (r.tbl, r.rid, r.ord, r.raw) on conflict do nothing;
      if found then
        ins := ins + 1; if not (r.tbl = any(tbls)) then tbls := tbls || r.tbl; end if;
        if r.tbl = 'acc_items' then
          delete from store_rows where tbl = 'acc_removed' and _rx_trim(_rx_s(_rx_c(raw, 0))) = _rx_trim(_rx_s(_rx_c(r.raw, 1))) and _rx_trim(_rx_s(_rx_c(raw, 1))) = _rx_trim(_rx_s(_rx_c(r.raw, 2)))
             and _rx_trim(_rx_s(_rx_c(raw, 2))) = _acc_bond_key(_rx_s(_rx_c(r.raw, 3)));
          if not ('acc_removed' = any(tbls)) then tbls := tbls || 'acc_removed'; end if;
        end if;
      end if;
    end loop;
    foreach t in array tbls loop update store_meta set ver = ver + 1, updated_at = now() where tbl = t; end loop;
    update recycle_bin set restored_at = now(), restored_by = who where id = b.id;
    insert into app_outbox (kind, payload) values ('audit', jsonb_build_object('user', who, 'action', 'استعادة من سلة المحذوفات', 'record', b.label, 'field', b.kind, 'old', b.detail, 'new', 'صفوف مستعادة: ' || ins));
    ok := ok + 1;
  end loop;
  perform _w_dv_bump(array['bookings', 'movements', 'trips', 'pilgrims', 'visa', 'ministry', 'dropdowns', 'hb', 'gl']);
  return jsonb_build_object('success', jsonb_array_length(errs) = 0, 'restored', ok, 'errors', errs); end $$;

-- ===== حذف نهائي من السلة =====
create or replace function rw2_recycledelete(a jsonb, u text) returns jsonb language plpgsql volatile set search_path = public as
$$ declare ids bigint[]; n int; who text := coalesce(u, app_user(), '-'); begin
  if not app_has('admin') then raise exception 'الحذف النهائي من سلة المحذوفات للأدمن فقط' using errcode = '42501'; end if;
  select array_agg(case when jsonb_typeof(x) = 'string' then (x #>> '{}')::bigint else x::text::bigint end) into ids
    from jsonb_array_elements(case when jsonb_typeof(a -> 1) = 'array' then a -> 1 else jsonb_build_array(a -> 1) end) x;
  delete from recycle_bin where id = any(coalesce(ids, '{}')); get diagnostics n = row_count;
  insert into app_outbox (kind, payload) values ('audit', jsonb_build_object('user', who, 'action', 'حذف نهائي من سلة المحذوفات', 'record', '-', 'field', '-', 'old', n || ' عنصر', 'new', '-'));
  return jsonb_build_object('success', true, 'deleted', n); end $$;

-- ===== إفراغ السلة كلها (أدمن) =====
create or replace function rw2_recycleempty(a jsonb, u text) returns jsonb language plpgsql volatile set search_path = public as
$$ declare n int; begin
  if not app_has('admin') then raise exception 'إفراغ سلة المحذوفات للأدمن فقط' using errcode = '42501'; end if;
  delete from recycle_bin; get diagnostics n = row_count;
  insert into app_outbox (kind, payload) values ('audit', jsonb_build_object('user', coalesce(u, app_user(), '-'), 'action', 'إفراغ سلة المحذوفات', 'record', '-', 'field', '-', 'old', n || ' عنصر', 'new', '-'));
  return jsonb_build_object('success', true, 'deleted', n); end $$;

-- ===== مدة الاحتفاظ (أدمن) — تسري على ما يُحذف بعدها؛ والموجود يُمدَّد/يُقصَّر من تاريخ حذفه =====
create or replace function rw2_recyclesetdays(a jsonb, u text) returns jsonb language plpgsql volatile set search_path = public as
$$ declare d int; begin
  if not app_has('admin') then raise exception 'تعديل مدة الاحتفاظ للأدمن فقط' using errcode = '42501'; end if;
  d := coalesce(nullif(btrim(a ->> 1), '')::int, 30); if d < 1 or d > 3650 then return jsonb_build_object('success', false, 'error', 'المدة بين 1 و3650 يوماً'); end if;
  insert into recycle_settings (k, v) values ('days', d::text) on conflict (k) do update set v = excluded.v;
  update recycle_bin set expires_at = deleted_at + make_interval(days => d);
  insert into app_outbox (kind, payload) values ('audit', jsonb_build_object('user', coalesce(u, app_user(), '-'), 'action', 'تعديل مدة سلة المحذوفات', 'record', '-', 'field', 'أيام', 'old', '-', 'new', d::text));
  return jsonb_build_object('success', true, 'days', d); end $$;

do $$ declare r record; begin
  for r in select p.oid::regprocedure::text sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and (p.proname like '\_rb\_%' or p.proname in ('rx2_recyclelist', 'rw2_recyclerestore', 'rw2_recycledelete', 'rw2_recycleempty', 'rw2_recyclesetdays', 'rb_put_ext')) loop
    execute format('revoke all on function %s from public, anon, authenticated', r.sig);
    execute format('grant execute on function %s to service_role', r.sig);
  end loop;
end $$;

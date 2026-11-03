-- ============================================================
-- المرحلة 3-أ: الأمان — جداول القراءة السريعة + صلاحيات RLS حسب رمز الدخول (JWT)
-- الصق في SQL Editor ثم Run
-- ============================================================

-- 1) لا وصول لأي جدول للمتصفح افتراضياً (الخادم service_role يتجاوز RLS)
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
alter default privileges in schema public revoke all on tables from anon, authenticated;

-- 2) أدوات قراءة هوية المستخدم وصلاحياته من الرمز (يصدره Edge Function «login»)
create or replace function app_user() returns text language sql stable as
$$ select nullif(auth.jwt() ->> 'app_user', '') $$;

create or replace function app_has(p text) returns boolean language sql stable as
$$ select coalesce(
     (auth.jwt() -> 'perms') ? 'admin' or (auth.jwt() -> 'perms') ? 'all' or (auth.jwt() -> 'perms') ? p,
     false) $$;

-- 3) بصمات المجموعات (تحدّثها Apps Script) — يقرأها أي مستخدم مسجَّل
create table if not exists data_versions (
  group_name text primary key,
  token text not null,
  updated_at timestamptz not null default now()
);

-- 4) نتائج دوال القراءة الجاهزة (تملؤها Apps Script) — بصلاحية كل دالة
create table if not exists read_cache (
  fn text not null,
  args_key text not null default '',
  data jsonb not null,
  h text,                          -- بصمة البيانات (نفس lfFetch)
  dv jsonb,                        -- بصمات المجموعات وقت البناء
  updated_at timestamptz not null default now(),
  primary key (fn, args_key)
);
create table if not exists read_cache_perms (
  fn text primary key,
  perm text not null               -- '*' = أي مستخدم مسجَّل
);
insert into read_cache_perms (fn, perm) values
  ('getTripsList','*'), ('getTripPilgrims','*'), ('getAllMovementsAuth','*'),   -- كما بالخادم الحالي: requireAuth_ فقط
  ('getGlobalPilgrimsRegistry','registry.view'), ('getAllBookingsAuth','bookings.view'),
  ('getVisaBootstrap','visas.view'), ('getVisaTripLinks','visas.view'),
  ('getMinistryBootstrap','ministry.view'), ('getMinistryTripLinks','ministry.view'),
  ('loadDropdownsData','*')
on conflict (fn) do update set perm = excluded.perm;

-- 5) محاولات الدخول (تحديد معدل المحاولات)
create table if not exists login_attempts (
  id bigint generated always as identity primary key,
  username text not null, ok boolean not null, at timestamptz not null default now()
);
create index if not exists login_attempts_idx on login_attempts (username, at desc);

-- 6) RLS + سياسات (قراءة فقط للمتصفح)
alter table data_versions enable row level security;
alter table read_cache enable row level security;
alter table read_cache_perms enable row level security;
alter table login_attempts enable row level security;

drop policy if exists dv_read on data_versions;
create policy dv_read on data_versions for select to authenticated using (app_user() is not null);

drop policy if exists rc_read on read_cache;
create policy rc_read on read_cache for select to authenticated using (
  app_user() is not null and exists (
    select 1 from read_cache_perms p where p.fn = read_cache.fn and (p.perm = '*' or app_has(p.perm))
  )
);

grant select on data_versions, read_cache to authenticated;
-- app_users و login_attempts و read_cache_perms: بلا أي منح ⇒ لا يراها المتصفح أبداً (كلمات المرور محمية)

-- 7) رفع صيغة كلمة المرور (PBKDF2) يخزَّن بنفس العمود
comment on column app_users.password_hash is 'sha256 hex القديمة أو pbkdf2$iter$salt$hash — يُرفع تلقائياً عند الدخول';

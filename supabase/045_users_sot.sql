-- V4.419: جدول app_users بـPostgres = المرجع الوحيد لإدارة المستخدمين (إضافة/تعديل/صلاحيات/تفعيل/كلمة المرور/حذف).
-- ورقة Users في Google صارت مرآة قراءة فقط (يكتبها Apps Script من app_users باتجاه واحد عبر usersMirrorTick_).
-- كلمات المرور تُخزَّن SHA-256 hex (نفس صيغة Apps Script) فيبقى الدخول السريع app_login والقديم متوافقَين. يتطلب 001+009+016+035+037.
alter table app_users add column if not exists ord bigint;
alter table app_users add column if not exists updated_at timestamptz default now();
create sequence if not exists app_users_ord_seq;
do $$ begin
  update app_users set ord = x.rn from (select ctid c, row_number() over (order by ctid) rn from app_users where ord is null) x where app_users.ctid = x.c;
  perform setval('app_users_ord_seq', greatest(coalesce((select max(ord) from app_users), 0), 1));
end $$;
alter table app_users alter column ord set default nextval('app_users_ord_seq');

-- رقم نسخة المستخدمين: يقرؤه المشغّل فيعيد كتابة الورقة عند التغيّر فقط
create table if not exists users_rev (id int primary key default 1 check (id = 1), rev bigint not null default 0);
insert into users_rev (id, rev) values (1, 1) on conflict do nothing;
alter table users_rev enable row level security;
revoke all on users_rev from anon, authenticated; grant all on users_rev to service_role;
create or replace function _users_bump() returns trigger language plpgsql security definer set search_path = public as
$$ begin update users_rev set rev = rev + 1; return null; end $$;
drop trigger if exists app_users_bump on app_users;
create trigger app_users_bump after insert or update or delete on app_users for each statement execute function _users_bump();

-- ===== مساعدات مستقلة عن نوع الأعمدة (permissions: نص/مصفوفة/jsonb · active: منطقي/نص) =====
create or replace function _u_perms_txt(p_user text) returns text language plpgsql stable set search_path = public as
$$ declare j jsonb; v jsonb; begin
  select to_jsonb(t) -> 'permissions' into v from app_users t where username = p_user;
  if v is null or jsonb_typeof(v) = 'null' then return ''; end if;
  if jsonb_typeof(v) = 'array' then return coalesce((select string_agg(x, ',') from jsonb_array_elements_text(v) x), ''); end if;
  return btrim(v #>> '{}'); end $$;
create or replace function _u_is_admin_txt(p text) returns boolean language sql immutable as
$$ select lower(coalesce(p, '')) like '%admin%' or lower(coalesce(p, '')) like '%all%' $$;
create or replace function _u_set(p_user text, p_col text, p_val text) returns void language plpgsql volatile set search_path = public as
$$ declare typ text; udt text; lit text; begin
  select format_type(a.atttypid, a.atttypmod), t.typcategory into typ, udt from pg_attribute a join pg_type t on t.oid = a.atttypid where a.attrelid = 'public.app_users'::regclass and a.attname = p_col and not a.attisdropped;
  if typ is null then raise exception 'عمود غير موجود: %', p_col; end if;
  if p_col = 'permissions' and udt = 'A' then lit := '{' || coalesce((select string_agg('"' || replace(btrim(x), '"', '') || '"', ',') from unnest(regexp_split_to_array(coalesce(p_val, ''), '\s*[,،;|]\s*')) x where btrim(x) <> ''), '') || '}';
  elsif p_col = 'permissions' and typ = 'jsonb' then lit := coalesce((select jsonb_agg(btrim(x))::text from unnest(regexp_split_to_array(coalesce(p_val, ''), '\s*[,،;|]\s*')) x where btrim(x) <> ''), '[]');
  else lit := p_val; end if;
  execute format('update app_users set %I = %L::%s, updated_at = now() where username = %L', p_col, lit, typ, p_user); end $$;
create or replace function _u_need_admin() returns void language plpgsql stable as
$$ begin if not app_has('admin') then raise exception 'هذه الشاشة متاحة فقط لمستخدم بصلاحية ALL أو admin' using errcode = '42501'; end if; end $$;
create or replace function _u_sha(p text) returns text language sql immutable set search_path = public, extensions as
$$ select encode(digest(convert_to(coalesce(p, ''), 'UTF8'), 'sha256'), 'hex') $$;
create or replace function _u_aud(who text, act text, rec text, fld text, o text, n text) returns void language plpgsql volatile set search_path = public as
$$ begin perform _stp_aud(who, jsonb_build_array(jsonb_build_object('action', act, 'recordId', rec, 'field', fld, 'oldVal', o, 'newVal', n)), 'users', 'المستخدمون'); end $$;
-- صف المستخدم بترتيب الورقة: row = رتبته في الترتيب (نفس رقم صف المرآة − 1)
create or replace function _u_by_row(p_row jsonb) returns text language plpgsql stable set search_path = public as
$$ declare r int := nullif(regexp_replace(coalesce(p_row #>> '{}', ''), '[^0-9]', '', 'g'), '')::int; nm text; begin
  if r is null or r < 2 then return null; end if;
  select username into nm from (select username, row_number() over (order by ord nulls last, username) + 1 rn from app_users) z where rn = r; return nm; end $$;

-- ===== القراءة =====
create or replace function rx2_getallusersforadmin(a jsonb, u text) returns jsonb language plpgsql stable set search_path = public as
$$ begin perform _u_need_admin();
  return coalesce((select jsonb_agg(jsonb_build_object('row', rn, 'username', username, 'fullName', coalesce(fn, ''), 'active', act, 'permissions', _u_perms_txt(username)) order by rn)
    from (select t.username, (to_jsonb(t) ->> 'full_name') fn, not (coalesce(to_jsonb(t) ->> 'active', 'true') in ('false', 'f', '0')) act, row_number() over (order by t.ord nulls last, t.username) + 1 rn from app_users t) z), '[]'::jsonb); end $$;

-- ===== الكتابة (rw_call) =====
create or replace function rw2_addnewuser(a jsonb, u text) returns jsonb language plpgsql volatile set search_path = public as
$$ declare nm text := btrim(coalesce(a ->> 1, '')); pw text := coalesce(a ->> 2, ''); fn text := btrim(coalesce(a ->> 3, '')); pr text := coalesce(a ->> 4, ''); begin
  perform _u_need_admin();
  if nm = '' or pw = '' then raise exception 'اسم المستخدم وكلمة المرور مطلوبان'; end if;
  if exists (select 1 from app_users where username = nm) then raise exception 'اسم المستخدم موجود بالفعل'; end if;
  insert into app_users (username, password_hash) values (nm, _u_sha(pw));
  perform _u_set(nm, 'full_name', coalesce(nullif(fn, ''), nm)); perform _u_set(nm, 'active', 'true'); perform _u_set(nm, 'permissions', pr); perform _u_set(nm, 'must_change_pwd', 'false');
  perform _u_aud(u, 'إضافة مستخدم', nm, 'المستخدم', '-', 'جديد');
  return jsonb_build_object('success', true); end $$;

create or replace function rw2_changeuserpassword(a jsonb, u text) returns jsonb language plpgsql volatile set search_path = public as
$$ declare nm text; pw text := coalesce(a ->> 2, ''); begin
  perform _u_need_admin(); nm := _u_by_row(a -> 1);
  if nm is null or pw = '' then raise exception 'بيانات غير مكتملة'; end if;
  update app_users set password_hash = _u_sha(pw), updated_at = now() where username = nm;
  perform _u_aud(u, 'تغيير كلمة مرور مستخدم', nm, 'Password', '-', 'تم');
  return jsonb_build_object('success', true); end $$;

create or replace function rw2_setuseractivestatus(a jsonb, u text) returns jsonb language plpgsql volatile set search_path = public as
$$ declare nm text; on_ boolean := (a ->> 2) in ('true', 't', '1'); begin
  perform _u_need_admin(); nm := _u_by_row(a -> 1);
  if nm is null then raise exception 'بيانات غير مكتملة'; end if;
  perform _u_set(nm, 'active', case when on_ then 'true' else 'false' end);
  perform _u_aud(u, case when on_ then 'تفعيل مستخدم' else 'تعطيل مستخدم' end, nm, 'الحالة', '-', case when on_ then 'مفعّل' else 'معطّل' end);
  return jsonb_build_object('success', true); end $$;

create or replace function rw2_updateuserpermissions(a jsonb, u text) returns jsonb language plpgsql volatile set search_path = public as
$$ declare nm text; np text := coalesce(a ->> 2, ''); old text; begin
  perform _u_need_admin(); nm := _u_by_row(a -> 1);
  if nm is null then raise exception 'بيانات غير مكتملة'; end if;
  old := _u_perms_txt(nm);
  -- حماية: لا يُسحب آخر مدير
  if _u_is_admin_txt(old) and not _u_is_admin_txt(np) and (select count(*) from app_users x where _u_is_admin_txt(_u_perms_txt(x.username))) <= 1 then
    raise exception 'لا يمكن سحب صلاحية آخر مستخدم admin في النظام'; end if;
  perform _u_set(nm, 'permissions', np);
  perform _u_aud(u, 'تعديل صلاحيات مستخدم', nm, 'الصلاحيات', left(old, 200), left(np, 200));
  return jsonb_build_object('success', true); end $$;

create or replace function rw2_updateusername(a jsonb, u text) returns jsonb language plpgsql volatile set search_path = public as
$$ declare nm text; nn text := btrim(coalesce(a ->> 2, '')); begin
  perform _u_need_admin(); nm := _u_by_row(a -> 1);
  if nm is null then raise exception 'بيانات غير مكتملة'; end if;
  if nn = '' then return jsonb_build_object('success', false, 'error', 'اسم المستخدم لا يمكن أن يكون فارغاً'); end if;
  if nn = nm then return jsonb_build_object('success', true, 'unchanged', true); end if;
  if exists (select 1 from app_users where username = nn) then return jsonb_build_object('success', false, 'error', 'اسم المستخدم موجود بالفعل'); end if;
  update app_users set username = nn, updated_at = now() where username = nm;
  perform _u_aud(u, 'تعديل اسم مستخدم', nm, 'اسم المستخدم', nm, nn);
  return jsonb_build_object('success', true); end $$;

create or replace function rw2_updateuserfullname(a jsonb, u text) returns jsonb language plpgsql volatile set search_path = public as
$$ declare nm text; nf text := btrim(coalesce(a ->> 2, '')); old text; begin
  perform _u_need_admin(); nm := _u_by_row(a -> 1);
  if nm is null then raise exception 'بيانات غير مكتملة'; end if;
  if nf = '' then return jsonb_build_object('success', false, 'error', 'الاسم الكامل لا يمكن أن يكون فارغاً'); end if;
  select coalesce(to_jsonb(t) ->> 'full_name', '') into old from app_users t where username = nm;
  if old = nf then return jsonb_build_object('success', true, 'unchanged', true); end if;
  perform _u_set(nm, 'full_name', nf);
  perform _u_aud(u, 'تعديل اسم مستخدم', nm, 'الاسم الكامل', old, nf);
  return jsonb_build_object('success', true); end $$;

create or replace function rw2_deleteuseraccount(a jsonb, u text) returns jsonb language plpgsql volatile set search_path = public as
$$ declare nm text; exp_ text := nullif(btrim(coalesce(a ->> 2, '')), ''); rowj jsonb; begin
  perform _u_need_admin(); nm := _u_by_row(a -> 1);
  if nm is null then return jsonb_build_object('success', false, 'error', 'المستخدم غير موجود'); end if;
  if exp_ is not null and exp_ <> nm then return jsonb_build_object('success', false, 'error', 'عدم تطابق البيانات، أعد تحميل الصفحة وحاول مجدداً'); end if;
  if nm = u then return jsonb_build_object('success', false, 'error', 'لا يمكنك حذف حسابك الخاص'); end if;
  if _u_is_admin_txt(_u_perms_txt(nm)) and (select count(*) from app_users x where _u_is_admin_txt(_u_perms_txt(x.username))) <= 1 then
    return jsonb_build_object('success', false, 'error', 'لا يمكن حذف آخر مستخدم بصلاحية admin في النظام'); end if;
  select to_jsonb(t) into rowj from app_users t where username = nm;
  insert into recycle_bin (grp, kind, label, detail, n, deleted_by, expires_at, src, payload)
    values (md5(random()::text || clock_timestamp()::text), 'user', 'مستخدم: ' || nm, left(coalesce(rowj ->> 'full_name', ''), 200), 1, coalesce(u, '-'), now() + make_interval(days => _rb_days()), 'as', jsonb_build_object('row', rowj));
  delete from app_users where username = nm;
  perform _u_aud(u, 'حذف مستخدم', nm, '-', '-', 'تم حذف الحساب نهائياً');
  return jsonb_build_object('success', true); end $$;

-- تغيير كلمة مرور المستخدم لنفسه (يزيل علامة «يجب تغيير كلمة المرور»)
create or replace function rw2_changemypassword(a jsonb, u text) returns jsonb language plpgsql volatile set search_path = public as
$$ declare oldp text := coalesce(a ->> 1, ''); newp text := coalesce(a ->> 2, ''); cur text; begin
  if oldp = '' or newp = '' then raise exception 'بيانات غير مكتملة'; end if;
  select password_hash::text into cur from app_users where username = u;
  if cur is null then return jsonb_build_object('success', false, 'error', 'تعذر العثور على المستخدم'); end if;
  if not (lower(cur) = _u_sha(oldp) or cur = oldp) then return jsonb_build_object('success', false, 'error', 'كلمة المرور الحالية غير صحيحة'); end if;
  update app_users set password_hash = _u_sha(newp), updated_at = now() where username = u;
  perform _u_set(u, 'must_change_pwd', 'false');
  perform _u_aud(u, 'تغيير كلمة المرور', u, 'Password', '-', 'تم التغيير بنجاح');
  return jsonb_build_object('success', true); end $$;

-- استعادة مستخدم من السلة (service_role: يستدعيها Apps Script recycleRestoreAs)
create or replace function users_restore(p_row jsonb) returns jsonb language plpgsql volatile security definer set search_path = public as
$$ begin
  if p_row is null or coalesce(p_row ->> 'username', '') = '' then return jsonb_build_object('success', false, 'error', 'بيانات تالفة'); end if;
  if exists (select 1 from app_users where username = p_row ->> 'username') then return jsonb_build_object('success', false, 'error', 'اسم المستخدم موجود الآن'); end if;
  insert into app_users (username, password_hash) values (p_row ->> 'username', coalesce(p_row ->> 'password_hash', ''));
  perform _u_set(p_row ->> 'username', 'full_name', coalesce(p_row ->> 'full_name', ''));
  perform _u_set(p_row ->> 'username', 'active', coalesce(p_row ->> 'active', 'true'));
  perform _u_set(p_row ->> 'username', 'must_change_pwd', coalesce(p_row ->> 'must_change_pwd', 'false'));
  perform _u_set(p_row ->> 'username', 'permissions', case when jsonb_typeof(p_row -> 'permissions') = 'array' then (select string_agg(x, ',') from jsonb_array_elements_text(p_row -> 'permissions') x) else coalesce(p_row ->> 'permissions', '') end);
  return jsonb_build_object('success', true); end $$;

do $$ declare r record; begin
  for r in select p.oid::regprocedure::text sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and (p.proname like '\_u\_%' or p.proname in ('rx2_getallusersforadmin','rw2_addnewuser','rw2_changeuserpassword','rw2_setuseractivestatus','rw2_updateuserpermissions','rw2_updateusername','rw2_updateuserfullname','rw2_deleteuseraccount','rw2_changemypassword','users_restore','_users_bump')) loop
    execute format('revoke all on function %s from public, anon, authenticated', r.sig);
    execute format('grant execute on function %s to service_role', r.sig);
  end loop;
end $$;

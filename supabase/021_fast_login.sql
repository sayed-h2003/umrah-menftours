-- 021: دخول سريع من Postgres (بدل loginUser ≈10 ث). المتصفح يرسل sha256(كلمة المرور) فقط — لا كلمة مرور خام.
-- نجاح فقط يُقبل من هنا؛ أي فشل/عدم تطابق/غياب إعداد ⇒ الواجهة تستعمل loginUser القديم (المرجع النهائي) — جلسة Apps Script تُنشأ بالخلفية وتتحقق من الحساب فعلياً.
-- يتطلب: تشغيل supaAuthSeedNow() مرة واحدة من محرر Apps Script (يرفع JWT secret + خرائط الصلاحيات).
create extension if not exists pgcrypto;
create table if not exists app_secrets (k text primary key, v text not null);
alter table app_secrets enable row level security;
revoke all on app_secrets from anon, authenticated;
grant all on app_secrets to service_role;

create or replace function _b64u(p bytea) returns text language sql immutable as
$$ select translate(rtrim(encode(p, 'base64'), '='), E'+/\n', '-_') $$;

create or replace function _expand_perms(p_list jsonb) returns jsonb language plpgsql stable set search_path = public as
$$ declare m jsonb := coalesce((select value from app_config where key = 'perm_maps'), '{}'::jsonb);
  legacy jsonb := coalesce(m -> 'legacy', '{}'::jsonb); scr jsonb := coalesce(m -> 'screens', '[]'::jsonb);
  s text[] := '{}'; e text; t text; d int; sc text; cap text; x text; begin
  for e in select jsonb_array_elements_text(p_list) loop
    t := lower(trim(e)); if t = '' then continue; end if;
    s := s || t;
    if legacy ? t then t := legacy ->> t; s := s || t; end if;
    d := position('.' in t);
    if d > 1 then
      sc := substr(t, 1, d - 1); cap := substr(t, d + 1);
      s := s || (sc || '.view');
      if cap in ('edit', 'delete') then s := s || (sc || '.add'); end if;
      if cap = 'delete' then s := s || (sc || '.edit'); end if;
    end if;
  end loop;
  if 'delete' = any(s) then
    for x in select jsonb_array_elements_text(scr) loop s := s || (x || '.delete') || (x || '.edit') || (x || '.add') || (x || '.view'); end loop;
  end if;
  return coalesce((select jsonb_agg(distinct v) from unnest(s) v), '[]'::jsonb);
end $$;

create or replace function app_login(p_user text, p_hash text) returns jsonb language plpgsql volatile security definer set search_path = public, extensions as
$$ declare u record; sec text; perms jsonb; praw jsonb; now_s bigint := extract(epoch from now())::bigint; exp_s bigint; head text; body text; fails int; pstr text; begin
  p_user := trim(coalesce(p_user, '')); p_hash := lower(coalesce(p_hash, ''));
  if p_user = '' or p_hash !~ '^[a-f0-9]{64}$' or length(p_user) > 100 then return jsonb_build_object('success', false, 'fallback', true); end if;
  select v into sec from app_secrets where k = 'jwt_secret';
  if sec is null or not exists (select 1 from app_config where key = 'perm_maps') then return jsonb_build_object('success', false, 'fallback', true); end if;
  select count(*) into fails from login_attempts where username = p_user and ok = false and at > now() - interval '10 minutes';
  if fails >= 8 then return jsonb_build_object('success', false, 'fallback', true); end if;
  select * into u from app_users where username = p_user limit 1;
  if not found or lower(coalesce(u.password_hash::text, '')) <> p_hash or coalesce(u.active::text, 'true') in ('false', 'f', '0') then
    return jsonb_build_object('success', false, 'fallback', true);   -- لا نسجّل فشلاً هنا: القرار النهائي لـ loginUser
  end if;
  if coalesce(u.must_change_pwd::text, 'false') in ('true', 't', '1') then return jsonb_build_object('success', false, 'fallback', true); end if;
  pstr := coalesce(u.permissions::text, '');
  begin praw := case when left(pstr, 1) = '[' then pstr::jsonb else to_jsonb(regexp_split_to_array(pstr, '\s*[,،;|]\s*')) end;
  exception when others then praw := '[]'::jsonb; end;
  praw := coalesce((select jsonb_agg(x) from jsonb_array_elements_text(praw) x where trim(x) <> ''), '[]'::jsonb);
  perms := _expand_perms(praw);
  exp_s := now_s + 8 * 3600;
  head := _b64u(convert_to('{"alg":"HS256","typ":"JWT"}', 'UTF8'));
  body := _b64u(convert_to(jsonb_build_object('role', 'authenticated', 'aud', 'authenticated', 'sub', u.username, 'app_user', u.username,
            'name', coalesce(nullif(u.full_name::text, ''), u.username), 'perms', perms, 'iat', now_s, 'exp', exp_s)::text, 'UTF8'));
  return jsonb_build_object('success', true, 'username', u.username, 'fullName', coalesce(u.full_name::text, ''), 'permissionsRaw', pstr,
    'token', head || '.' || body || '.' || _b64u(hmac(convert_to(head || '.' || body, 'UTF8'), convert_to(sec, 'UTF8'), 'sha256')),
    'expiresAt', exp_s * 1000);
end $$;
revoke all on function app_login(text, text) from public;
grant execute on function app_login(text, text) to anon, authenticated, service_role;

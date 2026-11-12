-- V4.448: دالة gas تتحقق من الجلسة عبر PostgREST نفسه (يتحقق من توقيع الرمز بسر المشروع) فلا تعتمد على سر APP_JWT_SECRET مطابق.
create or replace function gas_whoami() returns jsonb language sql stable set search_path = public as
$$ select jsonb_build_object('user', app_user(), 'perms', coalesce(auth.jwt() -> 'perms', '[]'::jsonb), 'exp', auth.jwt() ->> 'exp') $$;
revoke all on function gas_whoami() from public, anon;
grant execute on function gas_whoami() to authenticated, service_role;

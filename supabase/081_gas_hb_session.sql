-- V4.453: gas_whoami يعيد مطالبة hb (رمز برنامج الحجوزات) كي تبني دالة gas بطاقة مستخدم الحجوزات حين يفشل التحقق المحلي من التوقيع.
create or replace function gas_whoami() returns jsonb language sql stable set search_path = public as
$$ select jsonb_build_object('user', app_user(), 'perms', coalesce(auth.jwt() -> 'perms', '[]'::jsonb), 'exp', auth.jwt() ->> 'exp', 'hb', auth.jwt() -> 'hb') $$;
revoke all on function gas_whoami() from public, anon;
grant execute on function gas_whoami() to authenticated, service_role;

-- V4.428 (إصلاح عاجل): (1) trigger مستخدمين 045 كان يحدّث users_rev بلا WHERE فترفضه ملحقة pg_safeupdate بـSupabase (21000 «UPDATE requires a WHERE clause»)
-- فكانت كل كتابات المستخدمين تفشل (تعليق الشاشة عند تحديث الصلاحيات). (2) المتصلون الآن: العدّاد والقائمة يقرآن نفس الجدول لكن نافذة «متصل» 200 ث أقصر من فاصل النبضة (حتى 180 ث)
-- فتظهر قائمة فارغة رغم العدّاد ⇒ النافذة 330 ث، وفتح القائمة يُحدّث حضور صاحبه أولاً.
create or replace function _users_bump() returns trigger language plpgsql security definer set search_path = public as
$$ begin update users_rev set rev = rev + 1 where id = 1; return null; end $$;

create or replace function _rx_online_count() returns int language sql stable set search_path = public as
$$ select count(*)::int from app_presence where ts >= (extract(epoch from clock_timestamp()) * 1000)::bigint - 330000 $$;

do $$ declare coll text := coalesce((select collname from pg_collation where collname in ('ar-x-icu', 'ar-001-x-icu') order by length(collname) limit 1), 'C'); begin
  execute format($f$
  create or replace function app_online_users() returns jsonb language plpgsql volatile security definer set search_path = public as
  $b$ declare nowms bigint := (extract(epoch from clock_timestamp()) * 1000)::bigint; begin
    if app_user() is null then raise exception 'غير مصرّح' using errcode = '42501'; end if;
    perform _rx_touch(app_user(), coalesce(auth.jwt() ->> 'name', app_user()));
    return jsonb_build_object('success', true,
      'count', (select count(*) from app_presence where ts >= nowms - 330000),
      'users', coalesce((select jsonb_agg(jsonb_build_object('username', username, 'fullName', full_name, 'lastSeen', ts) order by full_name collate %I, username) from app_presence where ts >= nowms - 330000), '[]'::jsonb));
  end $b$ $f$, coll);
end $$;
revoke all on function app_online_users() from public, anon; grant execute on function app_online_users() to authenticated, service_role;

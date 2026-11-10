-- V4.422: رمز الدخول الموحّد لبرنامج الحجوزات (hotelsHandoff) يصدر من Postgres فوراً بدل ≈6–11 ث بـApps Script.
-- الرمز لمرة واحدة وصالح دقيقتين؛ يستبدله hbSsoLogin (Apps Script) بجلسة حجوزات عبر حذف ذرّي من الجدول.
create table if not exists hb_sso (code text primary key, username text not null, is_admin boolean not null default false, cap text not null default 'view', expires_at timestamptz not null);
alter table hb_sso enable row level security;
revoke all on hb_sso from anon, authenticated; grant all on hb_sso to service_role;

create or replace function rw2_hotelshandoff(a jsonb, u text) returns jsonb language plpgsql volatile set search_path = public as
$$ declare code text := replace(gen_random_uuid()::text, '-', ''); adm boolean := app_has('admin'); cap text; begin
  if not adm and not app_has('hotels.view') then raise exception 'لا تملك صلاحية الدخول لبرنامج حجوزات الفنادق' using errcode = '42501'; end if;
  cap := case when adm then 'admin' else coalesce((select c from unnest(array['delete', 'edit', 'add', 'view']) c where app_has('hotels.' || c) limit 1), 'view') end;
  delete from hb_sso where expires_at < now();
  insert into hb_sso (code, username, is_admin, cap, expires_at) values (code, u, adm, cap, now() + interval '120 seconds');
  return jsonb_build_object('success', true, 'code', code); end $$;
revoke all on function rw2_hotelshandoff(jsonb, text) from public, anon, authenticated; grant execute on function rw2_hotelshandoff(jsonb, text) to service_role;

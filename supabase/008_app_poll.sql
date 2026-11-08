-- 008_app_poll.sql — (V4.377 / المرحلة 4) النبضة والمتصلون الآن من Postgres + بصمات data_versions المرجع الوحيد للتحقق اللحظي
-- • app_poll()            ≡ lfPoll: {ok, dv:{مجموعة: رمز}, t}     — بدل نداء Apps Script كل 20 ث (4.5 ث/نداء)
-- • app_pulse(p)          ≡ الجزء الخفيف من appPulse: تحديث «آخر ظهور» + عدد المتصلين + بصمات + إصدار التنبيهات (store_meta.ver لجدول notifications)
-- • app_heartbeat()       ≡ heartbeatOnline: {success, count}
-- • app_online_users()    ≡ getOnlineUsersNow: {success, count, users:[{username, fullName, lastSeen}]} مرتَّبة بالعربية
-- • dv_set(p) (service)   : تستدعيها Apps Script من _dvBump_ (LiveSync.gs) بعد كل إبطال كاش: يرفع رمز كل مجموعة، ويضمن أنه > الحالي دائماً
--   (حتى لو سبق ساعة PG ساعةَ Apps Script) فلا يضيع أي تغيير على المتصفحات التي تنبض من هنا. صيغة الرمز كـ _dvTok_: base36(ms) + 5 أحرف.
-- • قراءة البصمات والحضور تتم بصلاحية JWT صالح فقط (app_user() غير فارغ) — كما requireAuth_ ببقية الدوال.
-- يتطلب 001 (data_versions/app_user) + 006 (store_meta). آمن لإعادة التشغيل.

-- ===== 1) رموز data_versions =====
create or replace function _rx_b36(n bigint) returns text language plpgsql immutable as
$$ declare s text := ''; d int; chars text := '0123456789abcdefghijklmnopqrstuvwxyz'; begin
  if n <= 0 then return '0'; end if;
  while n > 0 loop d := (n % 36)::int; s := substr(chars, d + 1, 1) || s; n := n / 36; end loop;
  return s; end $$;
create or replace function _rx_b36dec(s text) returns bigint language plpgsql immutable as
$$ declare n bigint := 0; c text; v int; i int; begin
  for i in 1 .. length(s) loop c := substr(s, i, 1); v := position(c in '0123456789abcdefghijklmnopqrstuvwxyz') - 1; if v < 0 then return null; end if; n := n * 36 + v; end loop;
  return n; end $$;
-- مطابق _dvNext_: رمز > cur دائماً
create or replace function _rx_next_tok(cur text) returns text language plpgsql volatile as
$$ declare t text := _rx_b36((extract(epoch from clock_timestamp()) * 1000)::bigint) || substr(md5(random()::text || clock_timestamp()::text), 1, 5); ms bigint; begin
  if cur is not null and t collate "C" <= cur collate "C" then
    ms := _rx_b36dec(substr(cur, 1, 8));
    t := case when ms is null then _rx_b36((extract(epoch from clock_timestamp()) * 1000)::bigint) else _rx_b36(ms + 1) end || substr(md5(random()::text || clock_timestamp()::text), 1, 5);
  end if;
  return t; end $$;

-- p = {"bookings":"رمز", ...} (أو {"dv_bookings":..}): يرفع كل مجموعة.
--   الجديد = الحالي ⇒ لا شيء · الجديد > الحالي ⇒ يُعتمد · الجديد < الحالي ⇒ (p_force=true، وضع الإبطال الحقيقي) رمز تالٍ أكبر من الحالي؛
--   (p_force=false، وضع المطابقة الدورية من المشغّل) لا يُمسّ — كي لا يتولّد تغيير وهمي كل دقيقة لو سبقت ساعة PG ساعة Apps Script
create or replace function dv_set(p jsonb, p_force boolean default true) returns jsonb language plpgsql volatile set search_path = public as
$$ declare k text; v text; g text; cur text; n int := 0; begin
  perform pg_advisory_xact_lock(hashtextextended('dv:set', 0));
  for k, v in select key, value #>> '{}' from jsonb_each(coalesce(p, '{}'::jsonb)) loop
    g := regexp_replace(k, '^dv_', '');
    if g = '' or v is null or v = '' then continue; end if;
    select token into cur from data_versions where group_name = g;
    if cur is null then insert into data_versions (group_name, token, updated_at) values (g, v, now()); n := n + 1;
    elsif v = cur then null;
    elsif v collate "C" > cur collate "C" then update data_versions set token = v, updated_at = now() where group_name = g; n := n + 1;
    elsif p_force then update data_versions set token = _rx_next_tok(cur), updated_at = now() where group_name = g; n := n + 1;
    end if;
  end loop;
  return jsonb_build_object('set', n); end $$;

create or replace function _rx_dv() returns jsonb language sql stable set search_path = public as
$$ select coalesce(jsonb_object_agg(group_name, token), '{}'::jsonb) from data_versions $$;

-- ===== 2) الحضور =====
create table if not exists app_presence (
  username  text primary key,
  full_name text not null default '',
  ts        bigint not null            -- ms (مثل ts بسجل Apps Script)
);
alter table app_presence enable row level security;   -- بلا سياسات: الدوال security definer فقط
revoke all on app_presence from anon, authenticated;
grant all on app_presence to service_role;

create or replace function _rx_online_count() returns int language sql stable set search_path = public as
$$ select count(*)::int from app_presence where ts >= (extract(epoch from clock_timestamp()) * 1000)::bigint - 200000 $$;   -- ONLINE_STALE_MS_

create or replace function _rx_touch(p_user text, p_name text) returns void language plpgsql volatile set search_path = public as
$$ declare nowms bigint := (extract(epoch from clock_timestamp()) * 1000)::bigint; begin
  insert into app_presence (username, full_name, ts) values (p_user, coalesce(nullif(p_name, ''), p_user), nowms)
  on conflict (username) do update set full_name = excluded.full_name, ts = excluded.ts;
  if random() < 0.02 then delete from app_presence where ts < nowms - 3600000; end if;   -- تنظيف عرضي للقديم جداً
end $$;

-- ===== 3) الدوال العامة (JWT) =====
create or replace function app_poll() returns jsonb language plpgsql stable security definer set search_path = public as
$$ begin
  if app_user() is null then raise exception 'غير مصرّح' using errcode = '42501'; end if;
  return jsonb_build_object('success', true, 'ok', true, 'dv', _rx_dv(), 't', (extract(epoch from clock_timestamp()) * 1000)::bigint);
end $$;

create or replace function app_heartbeat() returns jsonb language plpgsql volatile security definer set search_path = public as
$$ begin
  if app_user() is null then raise exception 'غير مصرّح' using errcode = '42501'; end if;
  perform _rx_touch(app_user(), coalesce(auth.jwt() ->> 'name', app_user()));
  return jsonb_build_object('success', true, 'count', _rx_online_count());
end $$;

-- p = {online: bool} — يرجع {success, dv, online?, notifVer}. notifVer = إصدار جدول التنبيهات بالمخزن: تغيّر ⇒ الواجهة تجلب القائمة بنداء getNotifications
create or replace function app_pulse(p jsonb default '{}'::jsonb) returns jsonb language plpgsql volatile security definer set search_path = public as
$$ declare o jsonb; begin
  if app_user() is null then raise exception 'غير مصرّح' using errcode = '42501'; end if;
  o := jsonb_build_object('success', true, 'dv', _rx_dv(), 'notifVer', coalesce((select ver::text from store_meta where tbl = 'notifications'), ''));
  if coalesce((p ->> 'online')::boolean, false) then
    perform _rx_touch(app_user(), coalesce(auth.jwt() ->> 'name', app_user()));
    o := o || jsonb_build_object('online', _rx_online_count());
  end if;
  return o;
end $$;

do $$ declare coll text := coalesce((select collname from pg_collation where collname in ('ar-x-icu', 'ar-001-x-icu') order by length(collname) limit 1), 'C'); begin
  execute format($f$
  create or replace function app_online_users() returns jsonb language plpgsql stable security definer set search_path = public as
  $b$ declare nowms bigint := (extract(epoch from clock_timestamp()) * 1000)::bigint; begin
    if app_user() is null then raise exception 'غير مصرّح' using errcode = '42501'; end if;
    return jsonb_build_object('success', true,
      'count', (select count(*) from app_presence where ts >= nowms - 200000),
      'users', coalesce((select jsonb_agg(jsonb_build_object('username', username, 'fullName', full_name, 'lastSeen', ts) order by full_name collate %I, username) from app_presence where ts >= nowms - 200000), '[]'::jsonb));
  end $b$ $f$, coll);
end $$;

-- ===== 4) الصلاحيات =====
revoke all on function dv_set(jsonb, boolean), _rx_dv(), _rx_online_count(), _rx_touch(text, text), _rx_b36(bigint), _rx_b36dec(text), _rx_next_tok(text) from public, anon, authenticated;
grant execute on function dv_set(jsonb, boolean), _rx_dv(), _rx_online_count(), _rx_touch(text, text), _rx_b36(bigint), _rx_b36dec(text), _rx_next_tok(text) to service_role;
revoke all on function app_poll(), app_heartbeat(), app_pulse(jsonb), app_online_users() from public, anon;
grant execute on function app_poll(), app_heartbeat(), app_pulse(jsonb), app_online_users() to authenticated, service_role;

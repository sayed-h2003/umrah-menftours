-- V4.439: بصمات وقت آخر تغيير لكل شيتات العهدة الموصولة بنداء واحد خفيف (بلا الصفوف) — للمزامنة المجدولة كل دقيقة
-- وشاشة «استكمال واعتماد»: الشيت يُفحص فقط إن تغيّر منذ آخر قراءة. يتطلب 061.
create or replace function cs_stamps() returns jsonb language sql stable security definer set search_path = public as
$$ select coalesce(jsonb_object_agg(code, jsonb_build_object('changedAt', (extract(epoch from changed_at) * 1000)::bigint, 'pushedAt', (extract(epoch from pushed_at) * 1000)::bigint,
     'pending', (select count(*) from jsonb_object_keys(pending)))), '{}'::jsonb) from cs_sheets where key_hash <> '' $$;
revoke all on function cs_stamps() from public, anon, authenticated;
grant execute on function cs_stamps() to service_role;

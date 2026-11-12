-- V4.450: gas يقرأ ملف برنامج الحجوزات من نسخة hb_snap (046) — قراءة فقط. العمر بالثواني لأقدم جدول ⇒ لو أقدم من 15 دقيقة يرفض gas (يرجع لـApps Script).
create or replace function gas_hb_snap() returns jsonb language sql stable security definer set search_path = public as
$$ select jsonb_build_object(
     'age', (select extract(epoch from now() - min(synced_at))::int from hb_snap_meta where tbl in ('mk', 'md', 'pay', 'meta', 'prof')),
     'n', (select count(*) from hb_snap_meta where tbl in ('mk', 'md', 'pay', 'meta', 'prof')),
     'tables', (select coalesce(jsonb_object_agg(tbl, r), '{}'::jsonb) from (
                 select tbl, jsonb_agg(jsonb_build_array(rn, raw) order by rn) r from hb_snap where tbl in ('mk', 'md', 'pay', 'meta', 'prof') group by tbl) z)) $$;
revoke all on function gas_hb_snap() from public, anon, authenticated;
grant execute on function gas_hb_snap() to service_role;

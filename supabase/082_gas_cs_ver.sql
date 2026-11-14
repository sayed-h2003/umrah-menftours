-- V4.456: رقم إصدار لكل شيت موصول (يزيد مع أي تغيّر بالصفوف أو الطابور) ⇒ دالة gas تحتفظ بنسخة الحجوزات بالذاكرة بين الطلبات
-- ولا تعيد جلب ≈2800 صف بكل نداء · gas_snapshot يعيد الإصدارات مع إصدارات الجداول.
alter table cs_sheets add column if not exists ver bigint not null default 1;
create or replace function _cs_ver_bump() returns trigger language plpgsql as
$$ begin if new.rows is distinct from old.rows or new.pending is distinct from old.pending then new.ver := old.ver + 1; end if; return new; end $$;
drop trigger if exists cs_sheets_ver on cs_sheets;
create trigger cs_sheets_ver before update on cs_sheets for each row execute function _cs_ver_bump();

create or replace function gas_snapshot(p_tbls text[] default null) returns jsonb language sql stable security definer set search_path = public as
$$ select jsonb_build_object(
     'vers', (select coalesce(jsonb_object_agg(tbl, ver), '{}'::jsonb) from store_meta),
     'glver', (select coalesce(jsonb_object_agg(k, v), '{}'::jsonb) from gas_ver),
     'csver', (select coalesce(jsonb_object_agg(code, ver), '{}'::jsonb) from cs_sheets),
     'meta', (select coalesce(jsonb_object_agg(tbl, jsonb_build_object('hdr', coalesce(hdr, '[]'::jsonb), 'exists', true)), '{}'::jsonb) from store_meta where p_tbls is null or tbl = any (p_tbls)),
     'rows', (select coalesce(jsonb_object_agg(tbl, r), '{}'::jsonb) from (
               select m.tbl, coalesce((select jsonb_agg(jsonb_build_array(s.ord, s.rid, s.raw) order by s.ord, s.rid) from store_rows s where s.tbl = m.tbl), '[]'::jsonb) r
                 from store_meta m where p_tbls is null or m.tbl = any (p_tbls)) z)) $$;
revoke all on function gas_snapshot(text[]) from public, anon, authenticated;
grant execute on function gas_snapshot(text[]) to service_role;

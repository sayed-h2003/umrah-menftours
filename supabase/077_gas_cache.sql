-- V4.449: نسخة لقطة gas بين الطلبات — عدّاد تغيّر لقيود/سطور الحسابات (مشغّل على مستوى الجملة، رخيص) يُرجع مع إصدارات الجداول
create table if not exists gas_ver (k text primary key, v bigint not null default 0);
insert into gas_ver (k, v) values ('gl_entries', 0), ('gl_lines', 0) on conflict do nothing;
alter table gas_ver enable row level security;
revoke all on gas_ver from anon, authenticated;
create or replace function _gas_ver_bump() returns trigger language plpgsql security definer set search_path = public as
$$ begin update gas_ver set v = v + 1 where k = tg_table_name; return null; end $$;
drop trigger if exists gas_ver_entries on gl_entries;
create trigger gas_ver_entries after insert or update or delete on gl_entries for each statement execute function _gas_ver_bump();
drop trigger if exists gas_ver_lines on gl_lines;
create trigger gas_ver_lines after insert or update or delete on gl_lines for each statement execute function _gas_ver_bump();
-- gas_snapshot: + glver (يُعاد تحميل القيود/السطور فقط إن تغيّرت)
create or replace function gas_snapshot(p_tbls text[] default null) returns jsonb language sql stable security definer set search_path = public as
$$ select jsonb_build_object(
     'vers', (select coalesce(jsonb_object_agg(tbl, ver), '{}'::jsonb) from store_meta),
     'glver', (select coalesce(jsonb_object_agg(k, v), '{}'::jsonb) from gas_ver),
     'meta', (select coalesce(jsonb_object_agg(tbl, jsonb_build_object('hdr', coalesce(hdr, '[]'::jsonb), 'exists', true)), '{}'::jsonb) from store_meta where p_tbls is null or tbl = any (p_tbls)),
     'rows', (select coalesce(jsonb_object_agg(tbl, r), '{}'::jsonb) from (
               select m.tbl, coalesce((select jsonb_agg(jsonb_build_array(s.ord, s.rid, s.raw) order by s.ord, s.rid) from store_rows s where s.tbl = m.tbl), '[]'::jsonb) r
                 from store_meta m where p_tbls is null or m.tbl = any (p_tbls)) z)) $$;
revoke all on function gas_snapshot(text[]) from public, anon, authenticated;
grant execute on function gas_snapshot(text[]) to service_role;

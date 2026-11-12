-- V4.445 · بيئة تشغيل كود Apps Script داخل Supabase Edge Function «gas» (الدفعة 2ج فصاعداً).
-- gas_props: نسخة خصائص السكربت (يرفعها Apps Script كل دقيقة عند تغيّرها؛ وما يكتبه الـEdge يُرسل لـ Apps Script بصادر kvset).
-- gas_snapshot / gas_gl_rows: لقطة جداول طبقة التخزين وقيود/سطور الحسابات بنداء واحد (بدل صفحات store_read).
-- gas_lease_take / gas_lease_drop: قفل تأجير بديل LockService (تشغيل واحد يكتب في وقت واحد).
-- كلها service_role فقط.

create table if not exists gas_props (k text primary key, v text not null default '', updated_at timestamptz not null default now());
alter table gas_props enable row level security;
revoke all on gas_props from anon, authenticated;

create table if not exists gas_lease (name text primary key, owner text not null, until_at timestamptz not null);
alter table gas_lease enable row level security;
revoke all on gas_lease from anon, authenticated;

create or replace function gas_props_put(p jsonb, p_replace boolean default false) returns int language plpgsql volatile security definer set search_path = public as
$$ declare n int; begin
  if p_replace then delete from gas_props where not (p ? k); end if;
  insert into gas_props (k, v, updated_at) select key, coalesce(value, ''), now() from jsonb_each_text(coalesce(p, '{}'::jsonb))
  on conflict (k) do update set v = excluded.v, updated_at = now() where gas_props.v is distinct from excluded.v;
  get diagnostics n = row_count; return n; end $$;
create or replace function gas_props_del(p_keys text[]) returns int language sql volatile security definer set search_path = public as
$$ with d as (delete from gas_props where k = any (p_keys) returning 1) select count(*)::int from d $$;
create or replace function gas_props_all() returns jsonb language sql stable security definer set search_path = public as
$$ select coalesce(jsonb_object_agg(k, v), '{}'::jsonb) from gas_props $$;

-- لقطة جداول (null = كل الجداول): {vers:{t:ver}, meta:{t:{hdr,exists}}, rows:{t:[[ord,rid,raw]...]}}
create or replace function gas_snapshot(p_tbls text[] default null) returns jsonb language sql stable security definer set search_path = public as
$$ select jsonb_build_object(
     'vers', (select coalesce(jsonb_object_agg(tbl, ver), '{}'::jsonb) from store_meta),
     'meta', (select coalesce(jsonb_object_agg(tbl, jsonb_build_object('hdr', coalesce(hdr, '[]'::jsonb), 'exists', true)), '{}'::jsonb) from store_meta where p_tbls is null or tbl = any (p_tbls)),
     'rows', (select coalesce(jsonb_object_agg(tbl, r), '{}'::jsonb) from (
               select m.tbl, coalesce((select jsonb_agg(jsonb_build_array(s.ord, s.rid, s.raw) order by s.ord, s.rid) from store_rows s where s.tbl = m.tbl), '[]'::jsonb) r
                 from store_meta m where p_tbls is null or m.tbl = any (p_tbls)) z)) $$;
-- قيود/سطور الحسابات بنفس ترتيب GlStore._glStReadRows_
create or replace function gas_gl_rows(p_key text) returns jsonb language sql stable security definer set search_path = public as
$$ select case p_key
     when 'entries' then (select coalesce(jsonb_agg(raw order by ord asc nulls first, entry_id), '[]'::jsonb) from gl_entries)
     else (select coalesce(jsonb_agg(raw order by ord asc nulls first, entry_id, line_no), '[]'::jsonb) from gl_lines) end $$;

create or replace function gas_lease_take(p_name text, p_owner text, p_ttl_sec int default 120) returns boolean language plpgsql volatile security definer set search_path = public as
$$ begin
  insert into gas_lease (name, owner, until_at) values (p_name, p_owner, now() + make_interval(secs => p_ttl_sec))
  on conflict (name) do update set owner = excluded.owner, until_at = excluded.until_at where gas_lease.until_at < now() or gas_lease.owner = excluded.owner;
  return exists (select 1 from gas_lease where name = p_name and owner = p_owner); end $$;
create or replace function gas_lease_drop(p_name text, p_owner text) returns void language sql volatile security definer set search_path = public as
$$ delete from gas_lease where name = p_name and owner = p_owner $$;

do $$ declare r record; begin
  for r in select p.oid::regprocedure::text sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname in ('gas_props_put','gas_props_del','gas_props_all','gas_snapshot','gas_gl_rows','gas_lease_take','gas_lease_drop') loop
    execute format('revoke all on function %s from public, anon, authenticated', r.sig);
    execute format('grant execute on function %s to service_role', r.sig);
  end loop;
end $$;

-- تنفيذ الكتابات المؤجلة من تشغيل واحد بمعاملة واحدة ذرّية (كلها أو لا شيء)
-- ops = [{rpc:'store_put', b:{p:…}} | {rpc:'gl_store_put'|'gl_store_delete'|'kv_set'|'bot_mark'|'dv_set'|'store_mirror_prune', b:{…}} | {ins:'app_outbox'|'gl_outbox', rows:[{kind,payload}]} | {up:'audit_log', rows:[…]}]
create or replace function gas_apply(ops jsonb) returns int language plpgsql volatile security definer set search_path = public as
$$ declare o jsonb; n int := 0; r jsonb; begin
  for o in select * from jsonb_array_elements(coalesce(ops, '[]'::jsonb)) loop
    if o ? 'rpc' then
      case o ->> 'rpc'
        when 'store_put' then perform store_put(o -> 'b' -> 'p');
        when 'gl_store_put' then perform gl_store_put(o -> 'b' -> 'p');
        when 'gl_store_delete' then perform gl_store_delete(array(select jsonb_array_elements_text(o -> 'b' -> 'ids')));
        when 'kv_set' then perform kv_set(o -> 'b' -> 'p');
        when 'bot_mark' then perform bot_mark(o -> 'b' -> 'p_ids');
        when 'dv_set' then perform dv_set(o -> 'b' -> 'p', coalesce((o -> 'b' ->> 'p_force')::boolean, false));
        when 'store_mirror_prune' then perform store_mirror_prune(o -> 'b' ->> 'p_tbl', o -> 'b' -> 'm', o -> 'b' -> 'keep');
        else raise exception 'gas_apply: rpc غير مدعوم %', o ->> 'rpc';
      end case;
    elsif o ->> 'ins' in ('app_outbox', 'gl_outbox') then
      for r in select * from jsonb_array_elements(o -> 'rows') loop
        execute format('insert into %I (kind, payload) values ($1, $2)', o ->> 'ins') using r ->> 'kind', coalesce(r -> 'payload', '{}'::jsonb);
      end loop;
    elsif o ->> 'up' = 'audit_log' then
      insert into audit_log select * from jsonb_populate_recordset(null::audit_log, o -> 'rows') on conflict (src, rn) do nothing;
    else raise exception 'gas_apply: عملية غير مدعومة %', left(o::text, 120);
    end if;
    n := n + 1;
  end loop;
  return n; end $$;
revoke all on function gas_apply(jsonb) from public, anon, authenticated;
grant execute on function gas_apply(jsonb) to service_role;

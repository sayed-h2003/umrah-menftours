-- 015_kv_set_fix.sql — إصلاح غموض العمود k في kv_set
create or replace function kv_set(p jsonb) returns jsonb language plpgsql volatile set search_path = public as
$$ declare e record; n int := 0; begin
  for e in select j.key as jk, j.value as jv from jsonb_each(coalesce(p, '{}'::jsonb)) j loop
    insert into app_kv as t (k, v, updated_at) values (e.jk, case when jsonb_typeof(e.jv) = 'string' then e.jv #>> '{}' else coalesce(e.jv::text, '') end, now())
    on conflict (k) do update set v = excluded.v, updated_at = now(); n := n + 1;
  end loop;
  return jsonb_build_object('set', n); end $$;

notify pgrst, 'reload schema';

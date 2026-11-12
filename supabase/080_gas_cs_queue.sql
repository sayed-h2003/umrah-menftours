-- V4.452: كتابات موصل الحجوزات (cs_queue) من gas ضمن معاملة الكتابات الواحدة
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
        when 'cs_queue' then perform cs_queue(o -> 'b' ->> 'p_code', o -> 'b' -> 'p_cells');
        when 'store_mirror_prune' then perform store_mirror_prune(o -> 'b' ->> 'p_tbl', o -> 'b' -> 'm', o -> 'b' -> 'keep');
        else raise exception 'gas_apply: rpc غير مدعوم %', o ->> 'rpc';
      end case;
    elsif o ->> 'ins' in ('app_outbox', 'gl_outbox') then
      for r in select * from jsonb_array_elements(o -> 'rows') loop
        execute format('insert into %I (kind, payload) values ($1, $2)', o ->> 'ins') using r ->> 'kind', coalesce(r -> 'payload', '{}'::jsonb);
      end loop;
    elsif o ? 'upsert' and o ->> 'upsert' in ('gl_aux', 'read_cache', 'app_config') then
      declare cols text; conf text; begin
        select string_agg(quote_ident(k), ',') into cols from jsonb_object_keys(o -> 'rows' -> 0) k;
        select string_agg(quote_ident(c), ',') into conf from jsonb_array_elements_text(o -> 'conflict') c;
        execute format('insert into %I (%s) select %s from jsonb_populate_recordset(null::%I, $1) on conflict (%s) do update set (%s) = row(%s)',
          o ->> 'upsert', cols, cols, o ->> 'upsert', conf, cols, (select string_agg('excluded.' || quote_ident(k), ',') from jsonb_object_keys(o -> 'rows' -> 0) k)) using o -> 'rows';
      end;
    elsif o ->> 'up' = 'audit_log' then
      insert into audit_log select * from jsonb_populate_recordset(null::audit_log, o -> 'rows') on conflict (src, rn) do nothing;
    else raise exception 'gas_apply: عملية غير مدعومة %', left(o::text, 120);
    end if;
    n := n + 1;
  end loop;
  return n; end $$;
revoke all on function gas_apply(jsonb) from public, anon, authenticated;
grant execute on function gas_apply(jsonb) to service_role;

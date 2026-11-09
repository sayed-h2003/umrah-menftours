-- 023: getRequiredFieldsConfig من Postgres (≈4–5 ث على Apps Script ⇒ <0.5 ث). المصدر: app_config.required_fields (يرفعه SupaSync عند الحفظ/المشغّل/supaAuthSeedNow).
create or replace function rx2_getrequiredfieldsconfig(a jsonb, u text) returns jsonb language plpgsql stable set search_path = public as
$$ begin return _rx_cfg('required_fields'); end $$;
revoke all on function rx2_getrequiredfieldsconfig(jsonb, text) from public, anon, authenticated;
grant execute on function rx2_getrequiredfieldsconfig(jsonb, text) to service_role;

-- V4.416: glReconLast من Postgres (آخر تشغيل لفحص الربط) — يقرأ إعداد recon_last من gl_settings مباشرة (حيّ، بلا gl_aux).
create or replace function glx_recon_last() returns jsonb language plpgsql stable security definer set search_path = public as
$$ declare v text; o jsonb := null; begin
  perform _glx_need('stmt');
  v := _glw_setting('recon_last');
  begin if coalesce(v, '') <> '' then o := v::jsonb; end if; exception when others then o := null; end;
  return jsonb_build_object('success', true, 'last', o); end $$;
revoke all on function glx_recon_last() from public, anon;
grant execute on function glx_recon_last() to authenticated, service_role;

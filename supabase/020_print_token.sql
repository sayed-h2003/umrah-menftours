-- 020: رمز طباعة الإشعار من Postgres (بلا نداء Apps Script قبل فتح نافذة الطباعة)
-- المتصفح ينادي rx_print_token(booking_id) فيُرجع رمزاً؛ doGet(page=print) يتحقق منه بنداء واحد لـ print_tokens عبر service_key.
create table if not exists print_tokens (
  token text primary key,
  booking_id text not null,
  app_user text,
  exp timestamptz not null default now() + interval '24 hours'
);
create index if not exists print_tokens_exp_idx on print_tokens (exp);
alter table print_tokens enable row level security;
revoke all on print_tokens from anon, authenticated;
grant all on print_tokens to service_role;

create or replace function rx_print_token(p_booking text) returns jsonb language plpgsql volatile security definer set search_path = public as
$$ declare u text := app_user(); t text; begin
  if u is null then raise exception 'غير مصرّح' using errcode = '42501'; end if;
  if coalesce(trim(p_booking), '') = '' then raise exception 'رقم الإشعار مطلوب' using errcode = 'P0001'; end if;
  delete from print_tokens where exp < now() - interval '1 day';
  t := 's-' || replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  insert into print_tokens(token, booking_id, app_user) values (t, trim(p_booking), u);
  return jsonb_build_object('success', true, 'token', t);
end $$;
revoke all on function rx_print_token(text) from public, anon;
grant execute on function rx_print_token(text) to authenticated, service_role;

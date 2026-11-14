-- V4.460: جدولة مهام تليجرام من Supabase (pg_cron + pg_net) بدل مشغّلات Apps Script —
-- الاتصال بتليجرام يخرج من دالة gas (Supabase) فلا يُحسب من حصة UrlFetch اليومية لحساب Google.
-- يعمل فقط بعد supaCronOn() من محرر Apps Script (يضع CRON_ON_SUPA=1 وسرّ CRON_SECRET في gas_props) — قبلها لا يرسل شيئاً.
create extension if not exists pg_cron;
create extension if not exists pg_net;

create or replace function gas_cron_fire(p_fn text) returns bigint language plpgsql security definer set search_path = public, extensions as
$$ declare u text := (select v from gas_props where k = 'SUPA_URL'); s text := (select v from gas_props where k = 'CRON_SECRET');
begin
  if coalesce(u, '') = '' or coalesce(s, '') = '' or coalesce((select v from gas_props where k = 'CRON_ON_SUPA'), '') <> '1' then return null; end if;
  return net.http_post(url := rtrim(u, '/') || '/functions/v1/gas', body := jsonb_build_object('fn', p_fn, 'cron', s),
    headers := '{"Content-Type":"application/json"}'::jsonb, timeout_milliseconds := 120000);
end $$;
revoke all on function gas_cron_fire(text) from public, anon, authenticated;

select cron.unschedule(jobid) from cron.job where jobname = 'gas-tg-tick';
select cron.schedule('gas-tg-tick', '* * * * *', $$select gas_cron_fire('supaCronTick')$$);

-- متابعة: آخر 20 تشغيلاً وردودها
create or replace view gas_cron_log as
  select r.id, r.created, r.status_code, left(r.content, 300) as content, r.error_msg
    from net._http_response r order by r.id desc limit 20;
select jobname, schedule, active from cron.job where jobname = 'gas-tg-tick';

-- V4.463: (1) خصائص كتبتها دالة gas (مهام Supabase) لا يمسحها/يكتب فوقها رفع Apps Script الدوري (كل دقيقة، استبدال كامل) لمدة 15 دقيقة —
--     كان يمسح علامة «أُرسل اليوم» فتكرر تنبيه تحركات الغد، وقد يعيد موضع سحب أوامر البوت للخلف فيُعالَج أمر مرتين.
--     (Apps Script يستلم القيمة الجديدة خلال دقيقة عبر صادر kvset، فبعدها يتطابق الطرفان.)
-- (2) gas_once: علامة «مرة واحدة» ذرّية بقاعدة البيانات (للمهام اليومية) بدل خاصية سكربت.
-- (3) مهلة أطول لاستعلامات دالة gas (دور service_role): تحميل القيود وسطورها كاملة كان يتجاوز المهلة الافتراضية.
alter table gas_props add column if not exists src text not null default 'as';
drop function if exists gas_props_put(jsonb, boolean);
create or replace function gas_props_put(p jsonb, p_replace boolean default false, p_src text default 'as') returns int language plpgsql volatile security definer set search_path = public as
$$ declare n int; begin
  if p_replace then delete from gas_props where not (p ? k) and not (src = 'edge' and updated_at > now() - interval '15 minutes'); end if;
  insert into gas_props (k, v, updated_at, src) select key, coalesce(value, ''), now(), coalesce(p_src, 'as') from jsonb_each_text(coalesce(p, '{}'::jsonb))
  on conflict (k) do update set v = excluded.v, updated_at = now(), src = excluded.src
   where gas_props.v is distinct from excluded.v
     and not (excluded.src = 'as' and gas_props.src = 'edge' and gas_props.updated_at > now() - interval '15 minutes');
  get diagnostics n = row_count; return n; end $$;
revoke all on function gas_props_put(jsonb, boolean, text) from public, anon, authenticated;
grant execute on function gas_props_put(jsonb, boolean, text) to service_role;

create table if not exists gas_once (k text primary key, at timestamptz not null default now());
alter table gas_once enable row level security;
revoke all on gas_once from anon, authenticated;
create or replace function gas_once(p_key text) returns boolean language plpgsql volatile security definer set search_path = public as
$$ begin
  delete from gas_once where at < now() - interval '40 days';
  insert into gas_once (k) values (p_key) on conflict do nothing;
  return found; end $$;
revoke all on function gas_once(text) from public, anon, authenticated;
grant execute on function gas_once(text) to service_role;

alter role service_role set statement_timeout = '120s';
notify pgrst, 'reload config';
select 'ok' as done;

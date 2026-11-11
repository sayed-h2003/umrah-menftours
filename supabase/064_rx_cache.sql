-- V4.442: 🚀 ذاكرة نتائج القراءات الثقيلة بالخادم (rxc) — الحل الجذري لارتداد القراءات لـ Apps Script
-- التشخيص (HAR V4.441): القراءات تُحسب من صور الشيتات (jsonb) كاملة مع كل نداء، فيتشبّع معالج القاعدة: app_poll (قراءة صف واحد)
-- استغرقت 6–8 ث، و getClientsDirectory/getTripPilgrims (عادةً 150–500 مللي) قُطعت عند مهلة 9 ث ⇒ ارتداد لـ Apps Script (20–30 ث).
-- الآن: نتيجة كل قراءة ثقيلة تُحفظ بمفتاح = الدالة + المعاملات + صلاحيات المستخدم + تاريخ اليوم + إصدارات جداول المخزن (ترتفع مع
-- أي كتابة من Postgres أو Apps Script) + آخر تعديل للإعدادات. لم يتغيّر شيء ⇒ النتيجة المحفوظة فوراً (مللي ثانية) بدل إعادة الحساب.
-- • قفل لكل مفتاح: مستخدمون كثيرون يفتحون نفس الشاشة لحظة تغيّر البيانات ⇒ حساب واحد والباقي ينتظره ويأخذ نتيجته.
-- • أمان إضافي: أي نتيجة محفوظة تنتهي بعد 10 دقائق مهما كان.
-- • جداول كثيرة التغيّر لا تقرؤها هذه الدوال (الحسابات العامة الجانبية gl_* · التنبيهات · تفضيلات الواجهة · المستخدمون) لا تُبطل الذاكرة.
create unlogged table if not exists rx_cache (k text primary key, fn text not null, d jsonb not null, at timestamptz not null default now());
alter table rx_cache enable row level security;
revoke all on rx_cache from anon, authenticated;
create table if not exists rx_cache_fns (fn text primary key, rpc text not null);
alter table rx_cache_fns enable row level security;
revoke all on rx_cache_fns from anon, authenticated;
insert into rx_cache_fns (fn, rpc) values
  ('getTripsList', 'rx_call'), ('getTripPilgrims', 'rx_call'), ('getGlobalPilgrimsRegistry', 'rx_call'), ('getAllMovementsAuth', 'rx_call'),
  ('loadDropdownsData', 'rx_call'), ('getClientsDirectory', 'rx_call'), ('getTripDraft', 'rx_call'), ('getTripHotelsList', 'rx_call'),
  ('getAllBookingsAuth', 'rx_call2'), ('getVisaTripLinks', 'rx_call2'), ('getMinistryTripLinks', 'rx_call2'), ('getVisaBootstrap', 'rx_call2'),
  ('getMinistryBootstrap', 'rx_call2'), ('getTripNamesList', 'rx_boot')
on conflict (fn) do update set rpc = excluded.rpc;

create or replace function _rxc_ver() returns text language sql stable set search_path = public as
$$ select md5(coalesce((select string_agg(tbl || ':' || ver, ',' order by tbl) from store_meta
                         where tbl not like 'gl\_%' and tbl not in ('notifications', 'user_ui_prefs', 'app_users')), '')
           || '|' || coalesce((select max(updated_at)::text from app_kv), '')) $$;

create or replace function rxc(p_fn text, p_args jsonb default '[]'::jsonb) returns jsonb language plpgsql volatile security definer set search_path = public as
$$ declare r text; ck text; res jsonb; out_ jsonb; a jsonb := case when jsonb_typeof(p_args) = 'array' then p_args else '[]'::jsonb end; begin
  if app_user() is null then raise exception 'غير مصرّح' using errcode = '42501'; end if;
  select rpc into r from rx_cache_fns where fn = p_fn;
  if r is null then raise exception 'دالة غير مدعومة: %', p_fn using errcode = '0A000'; end if;
  a := jsonb_set(a, '{0}', 'null'::jsonb, false);   -- رمز الجلسة لا يدخل المفتاح
  ck := md5(p_fn || '|' || a::text || '|' || coalesce((auth.jwt() -> 'perms')::text, '') || '|' || (now() at time zone 'Africa/Cairo')::date::text || '|' || _rxc_ver());
  select d into res from rx_cache where rx_cache.k = ck and at > now() - interval '10 minutes';
  if res is null then
    perform pg_advisory_xact_lock(hashtextextended('rxc:' || ck, 0));   -- حساب واحد لنفس المفتاح
    select d into res from rx_cache where rx_cache.k = ck and at > now() - interval '10 minutes';
  end if;
  if res is not null then return jsonb_build_object('success', true, 'd', res, 'dv', _rx_dv(), 'cached', true); end if;
  execute format('select %I($1, $2)', r) into out_ using p_fn, p_args;
  if coalesce((out_ ->> 'success')::boolean, false) and out_ ? 'd' then
    insert into rx_cache (k, fn, d, at) values (ck, p_fn, out_ -> 'd', now()) on conflict (k) do update set d = excluded.d, at = excluded.at;
    if random() < 0.03 then delete from rx_cache where at < now() - interval '30 minutes'; end if;
  end if;
  return out_; end $$;
revoke all on function rxc(text, jsonb) from public, anon;
grant execute on function rxc(text, jsonb) to authenticated, service_role;
revoke all on function _rxc_ver() from public, anon, authenticated;

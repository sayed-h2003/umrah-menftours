-- V4.440: تكرار فحص الموصل داخل كل شيت عهدة = زمن المزامنة المحدد لذلك الشيت بالبرنامج (بدل كل دقيقة ثابتة لكل الشيتات).
-- البرنامج يحفظه هنا (cs_set_every) والموصل يقرؤه مع كل رد cs_push ويعيد ضبط مشغّله ذاتياً — بلا إعادة لصق السكربت عند تغيير الزمن.
-- (التعديل بالشيت يُرسل فوراً دائماً؛ هذا التكرار للاحتياط ولكتابة أرقام القيود). يتطلب 061.
alter table cs_sheets add column if not exists every_min int not null default 60;
create or replace function cs_set_every(p_code text, p_min int) returns jsonb language sql volatile security definer set search_path = public as
$$ update cs_sheets set every_min = greatest(1, least(1440, coalesce(p_min, 60))) where code = p_code returning jsonb_build_object('ok', true, 'every', every_min) $$;
revoke all on function cs_set_every(text, int) from public, anon, authenticated;
grant execute on function cs_set_every(text, int) to service_role;
create or replace function cs_push(p_code text, p_key text, p jsonb) returns jsonb language plpgsql volatile security definer set search_path = public, pg_temp as
$$ declare s cs_sheets; begin
  select * into s from cs_sheets where code = p_code for update;
  if s.code is null or s.key_hash = '' or s.key_hash <> encode(sha256(convert_to(coalesce(p_key, ''), 'UTF8')), 'hex') then raise exception 'مفتاح الموصل غير صحيح' using errcode = '42501'; end if;
  if s.sheet_id <> '' and coalesce(p ->> 'sheetId', '') <> s.sheet_id then raise exception 'هذا الموصل مربوط بشيت آخر' using errcode = '42501'; end if;
  if jsonb_typeof(p -> 'rows') = 'array' and coalesce(p ->> 'hash', '') <> s.hash then
    update cs_sheets set rows = _cs_overlay(p -> 'rows', greatest(1, coalesce((p ->> 'firstRow')::int, 1)), pending), first_row = greatest(1, coalesce((p ->> 'firstRow')::int, 1)),
           last_col = coalesce((p ->> 'lastCol')::int, 0), hash = coalesce(p ->> 'hash', ''), tab = coalesce(p ->> 'tab', ''), title = coalesce(p ->> 'title', ''), changed_at = now()
     where code = p_code;
  end if;
  update cs_sheets set pushed_at = now(), agent = left(coalesce(p ->> 'agent', ''), 40) where code = p_code;
  return (select jsonb_build_object('ok', true, 'pending', pending, 'every', every_min) from cs_sheets where code = p_code); end $$;

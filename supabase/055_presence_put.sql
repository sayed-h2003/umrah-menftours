-- V4.429: المتصلون الآن — نبضات Apps Script (المسار الاحتياطي/النسخ القديمة بالمتصفحات) تُسجَّل بجدول حضور Postgres أيضاً
-- حتى يتطابق العدّاد مع القائمة (كان العدّاد من سجل Apps Script والقائمة من Postgres فتظهر 7 ثم اسم واحد).
create or replace function app_presence_put(p_user text, p_name text) returns void language plpgsql volatile security definer set search_path = public as
$$ begin
  if coalesce(p_user, '') = '' then return; end if;
  perform _rx_touch(p_user, p_name);
end $$;
revoke all on function app_presence_put(text, text) from public, anon, authenticated;
grant execute on function app_presence_put(text, text) to service_role;

-- تشخيص (للقراءة) لمجموعات التأشيرات بحساب عميل×رحلة — يستدعيه accVisaCheck بالمحرر (service_role فقط)
create or replace function ae_vz_check(p_client text, p_trip text) returns jsonb language sql stable security definer set search_path = public as
$$ select _ae_vz_groups(p_client, p_trip) $$;
revoke all on function ae_vz_check(text, text) from public, anon, authenticated;
grant execute on function ae_vz_check(text, text) to service_role;

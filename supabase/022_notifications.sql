-- 022: getNotifications (جرس التنبيهات) من Postgres — نفس شكل الرد بـ Code.gs (الأحدث أولاً · أول 200 · صلاحية الصف · النوع المعطَّل لا يظهر)
-- الأعمدة بالترتيب الثابت لشيت التنبيهات: المعرف، النوع، الرسالة، العميل، اسم الرحلة، الصلاحية المطلوبة، مقروء؟، أنشئ بواسطة، أنشئ في
create or replace function rx2_getnotifications(a jsonb, u text) returns jsonb language plpgsql stable set search_path = public as
$$ declare cfg jsonb; off_ text[]; out jsonb; begin
  begin cfg := _rx_cfg('notif_settings'); exception when others then cfg := null; end;
  if cfg is null then raise exception 'إعداد التنبيهات غير مرفوع' using errcode = '0A000'; end if;
  select coalesce(array_agg(t ->> 'key'), '{}') into off_ from jsonb_array_elements(coalesce(cfg -> 'types', '[]'::jsonb)) t where t ->> 'enabled' = 'false';
  select coalesce(jsonb_agg(o order by rn desc), '[]'::jsonb) into out from (
    select rn, jsonb_build_object('id', _rx_s(_rx_c(raw, 0)), 'type', _rx_s(_rx_c(raw, 1)), 'message', _rx_s(_rx_c(raw, 2)),
             'client', _rx_s(_rx_c(raw, 3)), 'trip', _rx_s(_rx_c(raw, 4)), 'read', _rx_s(_rx_c(raw, 6)) = 'نعم',
             'date', case when jsonb_typeof(_rx_c(raw, 8)) = 'object' and _rx_c(raw, 8) ? '$d'
                          then to_char(to_timestamp(floor((_rx_c(raw, 8) ->> '$d')::float8 / 1000.0)) at time zone 'Africa/Cairo', 'DD/MM/YYYY HH24:MI')
                          else _rx_s(_rx_c(raw, 8)) end) o
      from _rx_rows('notifications')
     where _rx_s(_rx_c(raw, 0)) <> ''
       and (_rx_trim(_rx_s(_rx_c(raw, 5))) = '' or app_has(_rx_trim(_rx_s(_rx_c(raw, 5)))) or app_has('all'))
       and not (_rx_s(_rx_c(raw, 1)) <> '' and ('notif_' || _rx_s(_rx_c(raw, 1))) = any(off_))
     order by rn desc limit 200) q;
  return jsonb_build_object('success', true, 'notifications', out);
end $$;
revoke all on function rx2_getnotifications(jsonb, text) from public, anon, authenticated;
grant execute on function rx2_getnotifications(jsonb, text) to service_role;

-- V4.443: سجل التعديلات لحظي من Postgres لكل مسارات الكتابة — يلغي إعادة التحقق من Apps Script بعد كل حفظ (getAuditLog: AS 26× ≈ 8 ث)
--  • كل كتابة Postgres تضع سطر تدقيق بصندوق الإخراج (kind='audit') ⇒ المشغّل يُدرجه فوراً بـ audit_log (src='pg') مصنَّفاً بشاشته (= _auditScreen_).
--    (ثلاث دوال كانت تُدرجه بنفسها 016/017/037: حارس منع التكرار يتخطى السطر المطابق بنفس اللحظة.)
--  • كتابات Apps Script (logChange_) تُرفع للجدول نفسه بنهاية الطلب بنفس مفتاح المزامنة الدورية (main, رقم الصف) ⇒ لا تكرار.
create or replace function _aud_screen(p_action text, p_field text, p_rid text) returns text language plpgsql immutable as
$$ declare a text := coalesce(p_action, '') || ' ' || coalesce(p_field, ''); act text := coalesce(p_action, ''); rid text := coalesce(p_rid, ''); begin
  if rid ~ '^HB:' then return 'hotels'; end if;
  if rid ~ '^GL:' then
    if act ~ 'اعتماد تغيير|تغييرات بانتظار' then return 'glapprove'; end if;
    if act ~ 'إصدار كشف حساب' then return 'glstmt'; end if;
    if act ~ 'شيت عهدة' then return 'glcust'; end if;
    if act ~ 'مرفق|إرفاق' then return 'glatt'; end if;
    if act ~ 'صرف يومية|أسعار الصرف|سعر الصرف' or rid ~ '^GL:fx' then return 'glfx'; end if;
    if act ~ 'حجوزات|شارت|ERP مكررة' or rid ~ '^GL:hb' then return 'glhb'; end if;
    if act ~ 'القيود التلقائية|قيود الرحلات' or rid ~ '^GL:auto' then return 'glauto'; end if;
    if act ~ 'بالدليل|من الدليل|ربط العملاء والوكلاء|دمج حساب' or rid ~ '^GL:sync' then return 'glcoa'; end if;
    if act ~ 'إعدادات|تجهيز|ربط ملف|إقفال|فتح كل الفترات|إعادة فتح|استيراد|نقل بيانات الـ ERP' or rid ~ '^GL:(setup|settings|lock)' then return 'glset'; end if;
    return 'gl';
  end if;
  if rid ~ '^MF:' then return 'ministry'; end if;
  if rid ~ '^(VZ|AI|AP|HA|HL):' then return 'visas'; end if;
  if act ~ 'ملف مراجعة|ملفات مراجعة|رسوم غرفة|حصة أفراد|نوع الملف|إضافة مشرف|تعديل مشرف|حذف مشرف|لمشرفين|مشاركة جماعية لمشرف' then return 'ministry'; end if;
  if act ~ 'دورات نقل|دورة نقل|النقل السعودي' then return 'transport'; end if;
  if act ~ 'تأشيرات|وكيل|اتفاقية سكن|تخصيص سكن|حسابات الشركات للوكلاء|سعر جماعي' then return 'visas'; end if;
  if a ~ 'مستخدم|دخول|خروج|كلمة المرور|صلاحي' then return 'users'; end if;
  if a ~ 'النقل السعودي|دورات النقل|دورة نقل|دورات نقل|كشف النقل' then return 'transport'; end if;
  if a ~ 'تسكين|أرقام غرف|دمج تسكين' then return 'housing'; end if;
  if act ~ 'حفظ تسعير|تعديل تسعير|تسعير رحلة|التسعير' then return 'pricing'; end if;
  if a ~ 'معتمر|كشف|تسكين|جواز|محرم' then return 'pilgrims'; end if;
  if a ~ 'حساب' then return 'accounts'; end if;
  if a ~ 'رحلة|الرحلات' then return 'trips'; end if;
  if a ~ 'إشعار|الحجز|حجز' then return 'bookings'; end if;
  if a ~ 'اتفاقية إعاشة|اتفاقيات إعاشة' then return 'catering'; end if;
  if a ~ 'شركة|إعداد|Drive|مجلد|دالة إدارية|النظام' then return 'settings'; end if;
  return 'other'; end $$;
create or replace function _aud_label(s text) returns text language sql immutable as
$$ select coalesce(('{"bookings":"الإشعارات","trips":"الرحلات","pilgrims":"المعتمرون / الكشف","accounts":"حسابات العملاء","users":"إدارة المستخدمين","settings":"الإعدادات",
  "catering":"اتفاقيات الإعاشة","ministry":"ملفات الوزارة","visas":"متابعة الوكلاء","gl":"الحسابات العامة — القيود والإيصالات","other":"أخرى",
  "glcoa":"الحسابات العامة — دليل الحسابات","glcust":"الحسابات العامة — شيت العهدة","glatt":"الحسابات العامة — المرفقات","glfx":"الحسابات العامة — أسعار الصرف",
  "glhb":"الحسابات العامة — ربط الحجوزات والـ ERP","glauto":"الحسابات العامة — القيود التلقائية","glset":"الحسابات العامة — الإعدادات والإقفال والاستيراد",
  "glapprove":"الحسابات العامة — اعتماد التغييرات","glstmt":"الحسابات العامة — كشوف الحساب المُصدَرة","transport":"النقل","pricing":"التسعير",
  "housing":"التسكين وأرقام الغرف","hotels":"برنامج الحجوزات (الفنادق)"}'::jsonb ->> s), 'أخرى') $$;

-- صندوق الإخراج ⇒ سجل التعديلات فوراً
create or replace function _aud_from_outbox() returns trigger language plpgsql security definer set search_path = public as
$$ declare p jsonb := new.payload; ms bigint := (extract(epoch from now()) * 1000)::bigint; sc text; begin
  if new.kind <> 'audit' then return null; end if;
  sc := _aud_screen(p ->> 'action', p ->> 'field', p ->> 'record');
  insert into audit_log (src, rn, ts_str, ts_ms, t_ms, username, action, record_id, field, old_value, new_value, screen, screen_label)
  values ('pg', nextval('audit_pg_seq'), to_char(now() at time zone 'Asia/Riyadh', 'DD/MM/YYYY HH24:MI:SS'), ms, ms,
          coalesce(nullif(p ->> 'user', ''), '-'), coalesce(nullif(p ->> 'action', ''), '-'), coalesce(nullif(p ->> 'record', ''), '-'), coalesce(nullif(p ->> 'field', ''), '-'),
          left(coalesce(nullif(p ->> 'old', ''), '-'), 4000), left(coalesce(nullif(p ->> 'new', ''), '-'), 4000), sc, _aud_label(sc));
  return null; end $$;
drop trigger if exists app_outbox_audit on app_outbox;
create trigger app_outbox_audit after insert on app_outbox for each row when (new.kind = 'audit') execute function _aud_from_outbox();

-- حارس التكرار: الدوال التي تُدرج سطر pg بنفسها بعد صندوق الإخراج (016/017/037) ⇒ يُتخطى السطر المطابق بنفس المعاملة/اللحظة
create or replace function _aud_pg_dedup() returns trigger language plpgsql set search_path = public as
$$ begin
  if new.src = 'pg' and exists (select 1 from audit_log a where a.src = 'pg' and a.username = new.username and a.action = new.action and a.record_id = new.record_id
       and a.field = new.field and a.new_value = new.new_value and a.old_value = new.old_value and abs(a.t_ms - new.t_ms) < 3000) then return null; end if;
  return new; end $$;
drop trigger if exists audit_log_pg_dedup on audit_log;
create trigger audit_log_pg_dedup before insert on audit_log for each row when (new.src = 'pg') execute function _aud_pg_dedup();
create index if not exists audit_log_pg_recent on audit_log (src, username, action, t_ms) where src = 'pg';
revoke all on function _aud_screen(text, text, text), _aud_label(text), _aud_from_outbox(), _aud_pg_dedup() from public, anon, authenticated;

-- ===== شاشات «سجل التعديلات» لعنصر واحد من audit_log (تتطلب تحميل السجل القديم كاملاً: supaAuditBackfillAll ⇒ مجموعة audfull) =====
create index if not exists audit_log_record on audit_log (record_id);
create or replace function _aud_hist(p_key text) returns table (ts text, who text, act text, fld text, ov text, nv text, t float8) language sql stable set search_path = public as
$$ select ts_str, username, action, field, old_value, new_value, t_ms from audit_log where record_id = p_key and src in ('main', 'pg') order by t_ms desc, rn desc limit 2000 $$;
-- getTripChangeLog / getClientAccountHistory ⇒ [{timestamp, username, action, field, oldValue, newValue}]
create or replace function rx2_gettripchangelog(a jsonb, u text) returns jsonb language plpgsql stable set search_path = public as
$$ begin
  if not app_has('trips.view') then raise exception 'لا تملك صلاحية عرض الرحلات' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('timestamp', ts, 'username', who, 'action', act, 'field', fld, 'oldValue', ov, 'newValue', nv) order by t desc) from _aud_hist(btrim(coalesce(a ->> 1, '')))), '[]'::jsonb); end $$;
create or replace function rx2_getclientaccounthistory(a jsonb, u text) returns jsonb language plpgsql stable set search_path = public as
$$ begin
  perform _acc_perm_view();
  return coalesce((select jsonb_agg(jsonb_build_object('timestamp', ts, 'username', who, 'action', act, 'field', fld, 'oldValue', ov, 'newValue', nv) order by t desc) from _aud_hist(btrim(coalesce(a ->> 1, '')))), '[]'::jsonb); end $$;
-- getMinistryFileHistory / getVisaFileHistory ⇒ {success, entries:[{when, who, action, field, oldVal, newVal}]}
create or replace function rx2_getministryfilehistory(a jsonb, u text) returns jsonb language plpgsql stable set search_path = public as
$$ begin
  if not app_has('ministry.view') then raise exception 'لا تملك صلاحية عرض مراجعة ملفات الوزارة' using errcode = '42501'; end if;
  return jsonb_build_object('success', true, 'entries', coalesce((select jsonb_agg(jsonb_build_object('when', ts, 'who', who, 'action', act, 'field', fld, 'oldVal', ov, 'newVal', nv) order by t desc)
    from _aud_hist('MF:' || btrim(coalesce(a ->> 1, '')))), '[]'::jsonb)); end $$;
create or replace function rx2_getvisafilehistory(a jsonb, u text) returns jsonb language plpgsql stable set search_path = public as
$$ begin
  if not app_has('visas.view') then raise exception 'لا تملك صلاحية عرض متابعة التأشيرات والوكلاء' using errcode = '42501'; end if;
  return jsonb_build_object('success', true, 'entries', coalesce((select jsonb_agg(jsonb_build_object('when', ts, 'who', who, 'action', act, 'field', fld, 'oldVal', ov, 'newVal', nv) order by t desc)
    from _aud_hist('VZ:' || btrim(coalesce(a ->> 1, '')))), '[]'::jsonb)); end $$;
do $$ declare r record; begin
  for r in select p.oid::regprocedure::text sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname in ('_aud_hist', 'rx2_gettripchangelog', 'rx2_getclientaccounthistory', 'rx2_getministryfilehistory', 'rx2_getvisafilehistory') loop
    execute format('revoke all on function %s from public, anon, authenticated', r.sig);
    execute format('grant execute on function %s to service_role', r.sig);
  end loop;
end $$;

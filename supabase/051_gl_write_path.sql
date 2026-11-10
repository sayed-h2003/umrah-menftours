-- V4.425: مسار كتابة الحسابات العامة من Postgres (حفظ/ترحيل/إلغاء/حذف قيد) عبر rw_call — بنفس نواة 003 (مُراجَعة/مثبَّتة) مع:
--  (1) مولِّد raw/ord تلقائي: نواة 003 تكتب الأعمدة المنمّطة فقط بينما قراءات 004/005 تعتمد raw (خلايا الشيت حرفياً) ⇒ trigger يبنيه بنفس ترتيب _glWriteEntry_.
--  (2) أرقام السندات REC/PAY متسقة مع إعداد seq_REC/seq_PAY (يتشاركه Apps Script).
--  (3) savedRow (صف glListEntries) + سجل التعديلات (audit_log) + سلة المحذوفات (kind gl_entry_pg) + حذف تبعات المفاتيح الأجنبية (المرفقات).
--  ما لا تنقله هذه الدفعة (محرك القيود التلقائية وما يلزمه من قواعد التجاوز/الاعتمادات): تعديل/إلغاء/حذف قيد AUTO/CUST · ترحيل مسودة سند شاشة SCR (Maker-Checker) · تاريخ الاستحقاق due ⇒ يُرفَض 0A000 برسالة صريحة (لا كتابة صامتة).
-- يتطلب 003 و004 و005 و035 و037.

-- ===== 1) raw/ord تلقائياً =====
create or replace function _glw_raw_entry(e gl_entries) returns jsonb language sql stable as
$$ select jsonb_build_array(e.entry_id, e.seq, to_char(e.entry_date, 'DD/MM/YYYY'), e.entry_type, coalesce(e.description, ''), e.status, coalesce(e.source_key, ''), coalesce(e.batch_no, ''),
     coalesce(e.total_base, 0), coalesce(e.reference, ''), coalesce(e.trip_name, ''), coalesce(e.executing_company, ''), coalesce(e.created_by, ''),
     coalesce(to_char(e.created_at::timestamptz at time zone 'Africa/Cairo', 'DD/MM/YYYY HH24:MI:SS'), ''), coalesce(e.posted_by, ''),
     coalesce(to_char(e.posted_at::timestamptz at time zone 'Africa/Cairo', 'DD/MM/YYYY HH24:MI:SS'), ''), coalesce(e.updated_by, ''),
     coalesce(to_char(e.updated_at::timestamptz at time zone 'Africa/Cairo', 'DD/MM/YYYY HH24:MI:SS'), ''), coalesce(e.void_reason, '')) $$;
create or replace function _glw_raw_line(l gl_lines) returns jsonb language sql stable as
$$ select jsonb_build_array(l.entry_id, l.line_no, to_char(l.line_date, 'DD/MM/YYYY'), l.status, l.account_code,
     case when coalesce(l.debit, 0) = 0 then to_jsonb(''::text) else to_jsonb(l.debit) end, case when coalesce(l.credit, 0) = 0 then to_jsonb(''::text) else to_jsonb(l.credit) end, l.currency, coalesce(l.fx_rate, 1),
     case when coalesce(l.debit_base, 0) = 0 then to_jsonb(''::text) else to_jsonb(l.debit_base) end, case when coalesce(l.credit_base, 0) = 0 then to_jsonb(''::text) else to_jsonb(l.credit_base) end,
     coalesce(l.trip_name, ''), coalesce(l.executing_company, ''), coalesce(l.client_name, ''), coalesce(l.agent, ''), coalesce(l.description, '')) $$;

create or replace function _glw_entries_raw_trg() returns trigger language plpgsql as
$$ begin
  if tg_op = 'INSERT' then
    if new.raw is null then new.raw := _glw_raw_entry(new); end if;
    if new.ord is null then new.ord := nextval('gl_store_ord_seq'); end if;
  elsif new.raw is not distinct from old.raw and (to_jsonb(new) - 'raw') is distinct from (to_jsonb(old) - 'raw') then
    new.raw := _glw_raw_entry(new);   -- تعديل منمّط بلا raw جديد (نواة 003) ⇒ أعد بناءه
  end if;
  return new; end $$;
drop trigger if exists gl_entries_raw_bi on gl_entries;
create trigger gl_entries_raw_bi before insert or update on gl_entries for each row execute function _glw_entries_raw_trg();
create or replace function _glw_lines_raw_trg() returns trigger language plpgsql as
$$ begin
  if tg_op = 'INSERT' then
    if new.raw is null then new.raw := _glw_raw_line(new); end if;
    if new.ord is null then new.ord := nextval('gl_store_ord_seq'); end if;
  elsif new.raw is not distinct from old.raw and (to_jsonb(new) - 'raw') is distinct from (to_jsonb(old) - 'raw') then
    new.raw := _glw_raw_line(new);
  end if;
  return new; end $$;
drop trigger if exists gl_lines_raw_bi on gl_lines;
create trigger gl_lines_raw_bi before insert or update on gl_lines for each row execute function _glw_lines_raw_trg();

-- ===== 2) رقم السند = أكبر (إعداد seq_REC/PAY · أرقام موجودة · التسلسل) + 1، ويُكتب بالإعداد فيتابعه Apps Script =====
create or replace function _glw_next_voucher(typ text) returns text language plpgsql as
$$ declare pre text; key_ text; mx bigint; setv bigint; s bigint; no text; begin
  pre := case typ when 'سند قبض' then 'REC-' when 'سند صرف' then 'PAY-' else null end;
  if pre is null then return ''; end if;
  key_ := 'seq_' || replace(pre, '-', '');
  perform pg_advisory_xact_lock(hashtextextended('gl:vch:' || pre, 0));
  select coalesce(max(substring(source_key from '^VCH:' || pre || '([0-9]+)$')::bigint), 0) into mx from gl_entries where source_key like 'VCH:' || pre || '%';
  setv := coalesce(nullif(regexp_replace(coalesce((select value from gl_settings where key = key_), ''), '[^0-9]', '', 'g'), '')::bigint, 0);
  s := greatest(mx, setv) + 1;
  no := pre || _glw_pad(s, 5);
  update gl_settings set value = s::text where key = key_;
  if not found then insert into gl_settings (key, value) values (key_, s::text); end if;
  return no; end $$;

-- ===== 3) أدوات =====
create or replace function _glw_list_row(p_id text) returns jsonb language sql stable set search_path = public as
$$ select _glx_eo(ge.raw) || jsonb_build_object('_k', _glx_dkey(_glx_date(ge.raw -> 2)), 'lines', (
         select coalesce(jsonb_agg(_glx_lineobj(l.raw) order by _glx_jsnum(l.raw -> 1), l.ord nulls first, l.line_no), '[]'::jsonb) from gl_lines l where l.entry_id = ge.entry_id))
     from gl_entries ge where ge.entry_id = p_id $$;
-- حذف صفوف الجداول التابعة بمفتاح أجنبي لقيد (مرفقات…) قبل حذفه
create or replace function _glw_del_children(p_id text) returns void language plpgsql as
$$ declare r record; begin
  for r in select c.conrelid::regclass::text child, a.attname col from pg_constraint c join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
            where c.contype = 'f' and c.confrelid = 'gl_entries'::regclass and c.conrelid <> 'gl_lines'::regclass loop
    execute format('delete from %s where %I = $1', r.child, r.col) using p_id;
  end loop; end $$;
-- سلة المحذوفات: لقطة الصف المنمّط كاملة (+raw/ord) لإعادتها حرفياً
create or replace function _glw_recycle(p_id text, p_user text, p_why text) returns void language plpgsql set search_path = public as
$$ declare e jsonb; l jsonb; hdr gl_entries%rowtype; begin
  select * into hdr from gl_entries where entry_id = p_id; if not found then return; end if;
  select to_jsonb(hdr), coalesce((select jsonb_agg(to_jsonb(x) order by x.line_no) from gl_lines x where x.entry_id = p_id), '[]'::jsonb) into e, l;
  delete from recycle_bin where expires_at < now();
  insert into recycle_bin (grp, kind, label, detail, n, deleted_by, expires_at, src, payload)
    values (md5(random()::text || clock_timestamp()::text || p_id), 'gl_entry_pg', 'قيد ' || p_id || ' — ' || coalesce(hdr.entry_type, ''), left(coalesce(hdr.description, '') || ' · ' || p_why, 600), 1,
            coalesce(p_user, '-'), now() + make_interval(days => _rb_days()), 'as', jsonb_build_object('pg', true, 'e', e, 'l', l)); end $$;
create or replace function gl_restore_entry(p_payload jsonb, p_user text) returns jsonb language plpgsql security definer set search_path = public as
$$ declare e gl_entries%rowtype; id text; begin
  e := jsonb_populate_record(null::gl_entries, p_payload -> 'e'); id := e.entry_id;
  if id is null then return jsonb_build_object('success', false, 'error', 'بيانات تالفة'); end if;
  if exists (select 1 from gl_entries where entry_id = id) then return jsonb_build_object('success', false, 'error', 'القيد موجود الآن'); end if;
  if e.source_key is not null and exists (select 1 from gl_entries where source_key = e.source_key) then return jsonb_build_object('success', false, 'error', 'مفتاح المصدر/رقم السند مستخدم الآن بقيد آخر'); end if;
  if _glw_locked(e.entry_date) then return jsonb_build_object('success', false, 'error', 'القيد في فترة مقفلة'); end if;
  insert into gl_entries select (jsonb_populate_record(null::gl_entries, p_payload -> 'e')).*;
  insert into gl_lines select (jsonb_populate_recordset(null::gl_lines, p_payload -> 'l')).*;
  perform _glw_audit(p_user, 'استعادة قيد من سلة المحذوفات', id, jsonb_build_object('after', _glw_entry_json(id)));
  perform _glw_outbox('mirror:voucher_pays', jsonb_build_object('entryId', id, 'user', p_user));
  perform _glw_outbox('gl:dirty', jsonb_build_object('entryId', id, 'by', p_user));
  perform _glw_outbox('dv_bump', jsonb_build_object('groups', jsonb_build_array('gl', 'hb')));
  perform _glw_dv_bump(array['gl']);
  return jsonb_build_object('success', true, 'id', id); end $$;
create or replace function _glw_log(who text, act text, id text, o text, n text) returns void language plpgsql as
$$ begin perform _stp_aud(who, jsonb_build_array(jsonb_build_object('action', act, 'recordId', 'GL:' || id, 'field', 'القيد', 'oldVal', o, 'newVal', n)), 'gl', 'الحسابات العامة'); end $$;
create or replace function _glw_is_sys(p_id text) returns boolean language sql stable as
$$ select coalesce((select source_key like 'AUTO:%' or source_key like 'CUST:%' from gl_entries where entry_id = p_id), false) $$;

-- ===== 4) واجهات rw_call =====
create or replace function rw2_glsaveentry(a jsonb, u text) returns jsonb language plpgsql volatile set search_path = public as
$$ declare e jsonb := coalesce(a -> 1, '{}'::jsonb); post boolean := coalesce(_glw_truthy(a -> 2), false); id text := _glw_str(e -> 'id'); old gl_entries%rowtype; res jsonb; nid text; sk text := _glw_str(e -> 'sourceKey'); begin
  if _glw_str(e -> 'due') <> '' then raise exception 'تاريخ الاستحقاق: Apps Script (لم يُنقل بعد)' using errcode = '0A000'; end if;
  if _glw_str(e -> 'pendAck') <> '' or _glw_str(e -> 'ccyAck') <> '' then raise exception 'اعتماد تغيير معلَّق: Apps Script (محرك القيود التلقائية لم يُنقل بعد)' using errcode = '0A000'; end if;
  if sk like 'AUTO:%' or sk like 'CUST:%' then raise exception 'القيود التلقائية: Apps Script (محرك القيود التلقائية لم يُنقل بعد)' using errcode = '0A000'; end if;
  if id <> '' then
    select * into old from gl_entries where entry_id = id;
    if found then
      if coalesce(old.source_key, '') like 'AUTO:%' or coalesce(old.source_key, '') like 'CUST:%' then raise exception 'تعديل قيد تلقائي: Apps Script (محرك القيود التلقائية لم يُنقل بعد)' using errcode = '0A000'; end if;
      if old.status = 'مسودة' and post and coalesce(old.reference, '') like 'SCR:%' then raise exception 'ترحيل مسودة سند شاشة (Maker-Checker): Apps Script' using errcode = '0A000'; end if;
    end if;
  end if;
  res := gl_save_entry(e || jsonb_build_object('post', post));
  nid := res ->> 'id';
  perform _glw_log(u, case when id = '' then (case when post then 'تسجيل وترحيل قيد' else 'تسجيل قيد مسودة' end) else (case when post then 'تعديل وترحيل قيد' else 'تعديل قيد' end) end, nid, '-', coalesce(_glw_str(e -> 'type'), '') || ' — ' || coalesce(_glw_str(e -> 'desc'), ''));
  return res || jsonb_build_object('savedRow', _glw_list_row(nid), 'due', null); end $$;

create or replace function rw2_glpostentry(a jsonb, u text) returns jsonb language plpgsql volatile set search_path = public as
$$ declare id text := _glw_str(a -> 1); res jsonb; ref text; begin
  select reference into ref from gl_entries where entry_id = id;
  if coalesce(ref, '') like 'SCR:%' then raise exception 'ترحيل مسودة سند شاشة (Maker-Checker): Apps Script' using errcode = '0A000'; end if;
  res := gl_post_entry(id);
  perform _glw_log(u, 'ترحيل قيد', id, 'مسودة', 'مرحّل');
  return res || jsonb_build_object('savedRow', _glw_list_row(id)); end $$;

create or replace function rw2_glvoidentry(a jsonb, u text) returns jsonb language plpgsql volatile set search_path = public as
$$ declare id text := _glw_str(a -> 1); reason text := _glw_str(a -> 2); want boolean := coalesce(_glw_truthy(a -> 3), false); st text; res jsonb; sd text; begin
  if reason = '' then raise exception 'سبب الإلغاء مطلوب'; end if;
  select status, entry_type into st, sd from gl_entries where entry_id = id;
  if st is null then raise exception 'القيد غير موجود'; end if;
  if _glw_is_sys(id) then raise exception 'إلغاء/حذف قيد تلقائي: Apps Script (محرك القيود التلقائية لم يُنقل بعد)' using errcode = '0A000'; end if;
  if st = 'مسودة' then perform _glw_recycle(id, u, 'حذف مسودة: ' || reason); perform _glw_del_children(id); end if;
  res := gl_void_entry(id, reason);
  if st = 'مسودة' then perform _glw_log(u, 'حذف قيد مسودة', id, '-', '-'); else perform _glw_log(u, 'إلغاء قيد مرحّل', id, 'مرحّل', 'ملغى — ' || reason); end if;
  if not want then return jsonb_build_object('success', true); end if;
  return case when st = 'مسودة' then res else res || jsonb_build_object('savedRow', _glw_list_row(id)) end; end $$;

create or replace function rw2_gldeleteentry(a jsonb, u text) returns jsonb language plpgsql volatile set search_path = public as
$$ declare id text := _glw_str(a -> 1); st text; res jsonb; begin
  select status into st from gl_entries where entry_id = id;
  if st is null then raise exception 'القيد غير موجود'; end if;
  if _glw_is_sys(id) then raise exception 'حذف قيد تلقائي: Apps Script (محرك القيود التلقائية لم يُنقل بعد)' using errcode = '0A000'; end if;
  if not app_has('admin') then raise exception 'الحذف النهائي للقيود للمدير فقط — يمكنك «إلغاء» القيد بدلاً من ذلك' using errcode = '42501'; end if;
  perform _glw_recycle(id, u, 'حذف نهائي'); perform _glw_del_children(id);
  res := gl_delete_entry(id);
  perform _glw_log(u, 'حذف قيد نهائياً', id, st, '-');
  return res; end $$;

do $$ declare r record; begin
  for r in select p.oid::regprocedure::text sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and (p.proname in ('_glw_raw_entry','_glw_raw_line','_glw_entries_raw_trg','_glw_lines_raw_trg','_glw_list_row','_glw_del_children','_glw_recycle','_glw_log','_glw_is_sys','gl_restore_entry','rw2_glsaveentry','rw2_glpostentry','rw2_glvoidentry','rw2_gldeleteentry')) loop
    execute format('revoke all on function %s from public, anon, authenticated', r.sig);
    execute format('grant execute on function %s to service_role', r.sig);
  end loop;
end $$;

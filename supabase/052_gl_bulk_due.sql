-- V4.426: كتابة الحسابات العامة من Postgres — (1) تاريخ الاستحقاق due (2) الحفظ/الإلغاء/الحذف الجماعي. يتطلب 051.
-- ما زال خارج هذه الدفعة (يُرفض 0A000 كاملاً فينفَّذ هناك): أي قيد تلقائي AUTO/CUST ضمن الدفعة (محرك القيود التلقائية).

-- ===== تاريخ الاستحقاق = _glDueSet_ (جدول GL_BankDue بالمخزن + خريطة gl_aux.due فوراً) =====
create or replace function _glw_due_set(p_id text, p_due jsonb, p_entry_date text, p_user text) returns text language plpgsql volatile set search_path = public as
$$ declare d text := coalesce(_glx_date(coalesce(p_due, to_jsonb(''::text))), ''); begin
  if not exists (select 1 from store_meta where tbl = 'gl_bank_due') then raise exception 'مخزن الاستحقاق غير جاهز' using errcode = '0A000'; end if;
  if d = coalesce(p_entry_date, '') then d := ''; end if;
  perform pg_advisory_xact_lock(hashtextextended('store:put:gl_bank_due', 0));
  delete from store_rows where tbl = 'gl_bank_due' and raw ->> 0 = p_id;
  if d <> '' then
    insert into store_rows (tbl, rid, ord, raw) select 'gl_bank_due', substr(md5(random()::text || clock_timestamp()::text || p_id), 1, 20), coalesce(max(ord), 0) + 1,
      jsonb_build_array(p_id, d, p_user, to_char(now() at time zone 'Africa/Cairo', 'DD/MM/YYYY HH24:MI:SS')) from store_rows where tbl = 'gl_bank_due';
  end if;
  update store_meta set ver = ver + 1, updated_at = now() where tbl = 'gl_bank_due';
  update gl_aux set data = case when d = '' then data - p_id else jsonb_set(data, array[p_id], to_jsonb(d), true) end where key = 'due';
  return d; end $$;

-- ===== حفظ قيد (يحلّ محل 051) مع due =====
create or replace function rw2_glsaveentry(a jsonb, u text) returns jsonb language plpgsql volatile set search_path = public as
$$ declare e jsonb := coalesce(a -> 1, '{}'::jsonb); post boolean := coalesce(_glw_truthy(a -> 2), false); id text := _glw_str(e -> 'id'); old gl_entries%rowtype; res jsonb; nid text; sk text := _glw_str(e -> 'sourceKey'); d text; row_ jsonb; begin
  if _glw_str(e -> 'pendAck') <> '' or _glw_str(e -> 'ccyAck') <> '' then raise exception 'اعتماد تغيير معلَّق: Apps Script (محرك القيود التلقائية لم يُنقل بعد)' using errcode = '0A000'; end if;
  if sk like 'AUTO:%' or sk like 'CUST:%' then raise exception 'القيود التلقائية: Apps Script (محرك القيود التلقائية لم يُنقل بعد)' using errcode = '0A000'; end if;
  if e ? 'due' and not exists (select 1 from store_meta where tbl = 'gl_bank_due') then raise exception 'مخزن الاستحقاق غير جاهز' using errcode = '0A000'; end if;
  if id <> '' then
    select * into old from gl_entries where entry_id = id;
    if found then
      if coalesce(old.source_key, '') like 'AUTO:%' or coalesce(old.source_key, '') like 'CUST:%' then raise exception 'تعديل قيد تلقائي: Apps Script (محرك القيود التلقائية لم يُنقل بعد)' using errcode = '0A000'; end if;
      if old.status = 'مسودة' and post and coalesce(old.reference, '') like 'SCR:%' then raise exception 'ترحيل مسودة سند شاشة (Maker-Checker): Apps Script' using errcode = '0A000'; end if;
    end if;
  end if;
  res := gl_save_entry((e - 'due') || jsonb_build_object('post', post));
  nid := res ->> 'id';
  perform _glw_log(u, case when id = '' then (case when post then 'تسجيل وترحيل قيد' else 'تسجيل قيد مسودة' end) else (case when post then 'تعديل وترحيل قيد' else 'تعديل قيد' end) end, nid, '-', coalesce(_glw_str(e -> 'type'), '') || ' — ' || coalesce(_glw_str(e -> 'desc'), ''));
  row_ := _glw_list_row(nid);
  if e ? 'due' then
    d := _glw_due_set(nid, e -> 'due', row_ ->> 'date', u);
    row_ := row_ || jsonb_build_object('due', d);
    return res || jsonb_build_object('savedRow', row_, 'due', d);
  end if;
  return res || jsonb_build_object('savedRow', row_, 'due', null); end $$;

create or replace function _glw_delta_add(a jsonb, b jsonb) returns jsonb language sql immutable as
$$ select coalesce(jsonb_object_agg(k, jsonb_build_object('EGP', round(coalesce((a -> k ->> 'EGP')::numeric, 0) + coalesce((b -> k ->> 'EGP')::numeric, 0), 2), 'SAR', round(coalesce((a -> k ->> 'SAR')::numeric, 0) + coalesce((b -> k ->> 'SAR')::numeric, 0), 2),
        'USD', round(coalesce((a -> k ->> 'USD')::numeric, 0) + coalesce((b -> k ->> 'USD')::numeric, 0), 2), 'base', round(coalesce((a -> k ->> 'base')::numeric, 0) + coalesce((b -> k ->> 'base')::numeric, 0), 2))), '{}'::jsonb)
   from (select jsonb_object_keys(coalesce(a, '{}'::jsonb)) k union select jsonb_object_keys(coalesce(b, '{}'::jsonb))) z $$;

-- ===== تعديل جماعي (= glSaveEntriesBulk): البيان/المرجع/الرحلة/الشركة + الحساب المقابل لأسطر محدَّدة =====
create or replace function rw2_glsaveentriesbulk(a jsonb, u text) returns jsonb language plpgsql volatile set search_path = public as
$$ declare items jsonb := case when jsonb_typeof(a -> 1) = 'array' then a -> 1 else '[]'::jsonb end; it jsonb; id text; ge gl_entries%rowtype; lines jsonb; ln record; o jsonb; chg jsonb; frm jsonb; k text; changed boolean; amt numeric; bamt numeric;
  e jsonb; res jsonb; results jsonb := '[]'::jsonb; okn int := 0; cur_acc text; editable text[] := array['desc', 'ref', 'trip', 'company']; val text; oldv text; col text; x jsonb; begin
  if exists (select 1 from jsonb_array_elements(items) i join gl_entries g on g.entry_id = _glw_str(i -> 'id') where g.source_key like 'AUTO:%' or g.source_key like 'CUST:%') then
    raise exception 'دفعة تضم قيداً تلقائياً: Apps Script (محرك القيود التلقائية لم يُنقل بعد)' using errcode = '0A000'; end if;
  for it in select * from jsonb_array_elements(items) loop
    id := _glw_str(it -> 'id'); if id = '' then continue; end if;
    begin
      select * into ge from gl_entries where entry_id = id;
      if not found then raise exception 'القيد غير موجود'; end if;
      chg := '{}'::jsonb; frm := '{}'::jsonb; changed := false;
      for x in select * from jsonb_array_elements(case when jsonb_typeof(it -> 'lines') = 'array' then it -> 'lines' else '[]'::jsonb end) loop
        if coalesce((x ->> 'lineNo')::int, 0) > 0 and _glw_str(x -> 'account') <> '' then chg := chg || jsonb_build_object(x ->> 'lineNo', _glw_str(x -> 'account')); frm := frm || jsonb_build_object(x ->> 'lineNo', _glw_str(x -> 'from')); end if;
      end loop;
      for k in select jsonb_object_keys(chg) loop
        select account_code into cur_acc from gl_lines where entry_id = id and line_no = k::int;
        if cur_acc is null or (coalesce(frm ->> k, '') <> '' and cur_acc <> frm ->> k) then raise exception 'القيد تغيّر منذ فتح البطاقة — أعد تحميل الشاشة ثم أعد المحاولة'; end if;
      end loop;
      lines := '[]'::jsonb;
      for ln in select * from gl_lines where entry_id = id order by line_no loop
        amt := coalesce(ln.debit, 0) + coalesce(ln.credit, 0); bamt := coalesce(ln.debit_base, 0) + coalesce(ln.credit_base, 0);
        o := jsonb_build_object('account', ln.account_code, 'debit', ln.debit, 'credit', ln.credit, 'currency', ln.currency, 'rate', ln.fx_rate, 'trip', coalesce(ln.trip_name, ''), 'company', coalesce(ln.executing_company, ''),
               'client', coalesce(ln.client_name, ''), 'agent', coalesce(ln.agent, ''), 'desc', coalesce(ln.description, ''));
        if ln.currency <> 'EGP' and amt <> 0 and bamt <> 0 then o := o || jsonb_build_object('rate', bamt / amt, 'exact', 1); end if;
        if chg ? ln.line_no::text and chg ->> ln.line_no::text <> ln.account_code then o := o || jsonb_build_object('account', chg ->> ln.line_no::text, 'client', '', 'agent', ''); changed := true; end if;
        lines := lines || jsonb_build_array(o);
      end loop;
      e := jsonb_build_object('id', id, 'date', to_char(ge.entry_date, 'DD/MM/YYYY'), 'type', ge.entry_type, 'desc', coalesce(ge.description, ''), 'ref', coalesce(ge.reference, ''), 'trip', coalesce(ge.trip_name, ''),
             'company', coalesce(ge.executing_company, ''), 'lines', lines);
      foreach col in array editable loop
        if it ? col then
          val := _glw_str(it -> col); oldv := case col when 'desc' then coalesce(ge.description, '') when 'ref' then coalesce(ge.reference, '') when 'trip' then coalesce(ge.trip_name, '') else coalesce(ge.executing_company, '') end;
          if val <> btrim(oldv) then e := e || jsonb_build_object(col, it -> col); changed := true; end if;
        end if;
      end loop;
      if not changed then okn := okn + 1; results := results || jsonb_build_array(jsonb_build_object('id', id, 'success', true, 'unchanged', true)); continue; end if;
      res := rw2_glsaveentry(jsonb_build_array(null, e, ge.status = 'مرحّل'), u);
      okn := okn + 1; results := results || jsonb_build_array(jsonb_build_object('id', id, 'success', true, 'result', res));
    exception when others then
      results := results || jsonb_build_array(jsonb_build_object('id', id, 'success', false, 'error', sqlerrm));
    end;
  end loop;
  return jsonb_build_object('success', true, 'done', okn, 'total', jsonb_array_length(items), 'results', results); end $$;

-- ===== إلغاء/حذف مسودات جماعي (= glVoidEntriesBulk) =====
create or replace function rw2_glvoidentriesbulk(a jsonb, u text) returns jsonb language plpgsql volatile set search_path = public as
$$ declare items jsonb := case when jsonb_typeof(a -> 1) = 'array' then a -> 1 else '[]'::jsonb end; it jsonb; id text; res jsonb; results jsonb := '[]'::jsonb; okn int := 0; begin
  if exists (select 1 from jsonb_array_elements(items) i join gl_entries g on g.entry_id = _glw_str(i -> 'id') where g.source_key like 'AUTO:%' or g.source_key like 'CUST:%') then
    raise exception 'دفعة تضم قيداً تلقائياً: Apps Script (محرك القيود التلقائية لم يُنقل بعد)' using errcode = '0A000'; end if;
  for it in select * from jsonb_array_elements(items) loop
    id := _glw_str(it -> 'id'); if id = '' then continue; end if;
    begin
      res := rw2_glvoidentry(jsonb_build_array(null, id, it -> 'reason', true), u);
      okn := okn + 1; results := results || jsonb_build_array(jsonb_build_object('id', id, 'success', true, 'result', res));
    exception when others then results := results || jsonb_build_array(jsonb_build_object('id', id, 'success', false, 'error', sqlerrm)); end;
  end loop;
  return jsonb_build_object('success', true, 'done', okn, 'total', jsonb_array_length(items), 'results', results); end $$;

-- ===== حذف نهائي جماعي (= glDeleteEntriesBulk) — للمدير، حتى 300 قيد =====
create or replace function rw2_gldeleteentriesbulk(a jsonb, u text) returns jsonb language plpgsql volatile set search_path = public as
$$ declare ids text[]; id text; ge gl_entries%rowtype; skipped jsonb := '[]'::jsonb; del text[] := '{}'; delta jsonb := '{}'::jsonb; res jsonb; begin
  if not app_has('admin') then raise exception 'الحذف المجمع النهائي للقيود للمدير فقط' using errcode = '42501'; end if;
  select coalesce(array_agg(distinct t), '{}') into ids from (select _glw_str(x) t from jsonb_array_elements(case when jsonb_typeof(a -> 1) = 'array' then a -> 1 else '[]'::jsonb end) x) z where t <> '';
  if coalesce(array_length(ids, 1), 0) = 0 then raise exception 'اختر قيداً واحداً على الأقل'; end if;
  if array_length(ids, 1) > 300 then raise exception 'الحد الأقصى 300 قيد بالمرة الواحدة (المحدَّد %)', array_length(ids, 1); end if;
  if exists (select 1 from gl_entries g where g.entry_id = any (ids) and (g.source_key like 'AUTO:%' or g.source_key like 'CUST:%')) then
    raise exception 'دفعة تضم قيداً تلقائياً: Apps Script (محرك القيود التلقائية لم يُنقل بعد)' using errcode = '0A000'; end if;
  foreach id in array ids loop
    select * into ge from gl_entries where entry_id = id;
    if not found then skipped := skipped || jsonb_build_array(jsonb_build_object('id', id, 'reason', 'غير موجود (ربما حُذف)')); continue; end if;
    if ge.entry_type = 'قيد إقفال' then skipped := skipped || jsonb_build_array(jsonb_build_object('id', id, 'reason', 'قيد إقفال سنة — يُلغى من إعادة فتح السنة')); continue; end if;
    if _glw_locked(ge.entry_date) then skipped := skipped || jsonb_build_array(jsonb_build_object('id', id, 'reason', 'في فترة مقفلة حتى ' || _glw_setting('lockDate'))); continue; end if;
    del := del || id;
  end loop;
  foreach id in array del loop
    res := rw2_gldeleteentry(jsonb_build_array(null, id), u);
    delta := _glw_delta_add(delta, res -> 'balancesDelta');
  end loop;
  return jsonb_build_object('success', true, 'deleted', coalesce(array_length(del, 1), 0), 'skipped', skipped, 'autoN', 0, 'balancesDelta', delta, 'removedIds', to_jsonb(del)); end $$;

do $$ declare r record; begin
  for r in select p.oid::regprocedure::text sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname in ('_glw_due_set','_glw_delta_add','rw2_glsaveentry','rw2_glsaveentriesbulk','rw2_glvoidentriesbulk','rw2_gldeleteentriesbulk') loop
    execute format('revoke all on function %s from public, anon, authenticated', r.sig);
    execute format('grant execute on function %s to service_role', r.sig);
  end loop;
end $$;

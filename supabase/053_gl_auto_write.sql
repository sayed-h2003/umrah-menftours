-- V4.427: كتابة دفعة القيود التلقائية (إنشاء/تعديل/إلغاء) من Postgres بمعاملة واحدة ذرّية — المرحلة الأولى من نقل محرك القيود التلقائية.
-- القرارات (ما يُنشأ/يُعدَّل/يُلغى + قواعد الاعتماد والتجميد والإبقاء والفترات المقفلة + بصمة المصدر) تبقى بمحرك Apps Script حالياً،
-- وهذه الدالة تنفّذ الكتابة فقط: كانت تعيد كتابة كامل صفوف القيود والأسطر عند كل تعديل/إلغاء ثم تُلحق الجديد (بطيئة وغير ذرّية).
-- المدخل p: { user, creates:[{key, hash, H:{desc,trip,company}, v:{date,type,totalBase,lines:[{account,debit,credit,currency,rate,bDebit,bCredit,trip,company,client,agent,desc}]}}],
--             updates:[{id, key, hash, H, v}], voids:[entry_id,...] }
-- يتطلب 003 و051 (مولّد raw/ord).
create or replace function gl_auto_write_raw(p jsonb) returns jsonb language plpgsql volatile security definer set search_path = public, pg_temp as
$$ declare who text := coalesce(nullif(_glw_str(p -> 'user'), ''), 'system'); c jsonb; v jsonb; seq bigint; id text; created jsonb := '[]'::jsonb; nupd int := 0; nvoid int := 0; ts timestamptz := now(); h jsonb; ids text[]; begin
  perform pg_advisory_xact_lock(hashtextextended('gl:auto:write', 0));
  for c in select * from jsonb_array_elements(coalesce(p -> 'updates', '[]'::jsonb)) loop
    id := c ->> 'id'; v := c -> 'v'; h := c -> 'H';
    update gl_entries set entry_date = _glw_parse_date(v ->> 'date'), entry_type = v ->> 'type', description = nullif(h ->> 'desc', ''), status = 'مرحّل', total_base = (v ->> 'totalBase')::numeric,
           reference = c ->> 'hash', trip_name = nullif(h ->> 'trip', ''), executing_company = nullif(h ->> 'company', ''), posted_by = coalesce(posted_by, who), posted_at = coalesce(posted_at, ts),
           updated_by = who, updated_at = ts, void_reason = null
     where entry_id = id;
    if not found then raise exception 'قيد تلقائي غير موجود للتعديل: %', id; end if;
    delete from gl_lines where entry_id = id;
    insert into gl_lines (entry_id, line_no, line_date, status, account_code, debit, credit, currency, fx_rate, debit_base, credit_base, trip_name, executing_company, client_name, agent, description)
    select id, t.n, _glw_parse_date(v ->> 'date'), 'مرحّل', l ->> 'account', round(coalesce((l ->> 'debit')::numeric, 0), 2), round(coalesce((l ->> 'credit')::numeric, 0), 2), l ->> 'currency', (l ->> 'rate')::numeric,
           round(coalesce((l ->> 'bDebit')::numeric, 0), 2), round(coalesce((l ->> 'bCredit')::numeric, 0), 2), nullif(l ->> 'trip', ''), nullif(l ->> 'company', ''), nullif(l ->> 'client', ''), nullif(l ->> 'agent', ''), nullif(l ->> 'desc', '')
      from jsonb_array_elements(v -> 'lines') with ordinality t(l, n);
    nupd := nupd + 1;
  end loop;
  select coalesce(array_agg(x), '{}') into ids from jsonb_array_elements_text(coalesce(p -> 'voids', '[]'::jsonb)) x;
  if coalesce(array_length(ids, 1), 0) > 0 then
    update gl_entries set status = 'ملغى', updated_by = who, updated_at = ts, void_reason = 'حُذف مصدره من شاشات البرنامج' where entry_id = any (ids) and status <> 'ملغى';
    get diagnostics nvoid = row_count;
    update gl_lines set status = 'ملغى' where entry_id = any (ids);
  end if;
  for c in select * from jsonb_array_elements(coalesce(p -> 'creates', '[]'::jsonb)) loop
    v := c -> 'v'; h := c -> 'H'; seq := _glw_next_entry_seq(); id := 'JE-' || _glw_pad(seq, 6);
    insert into gl_entries (entry_id, seq, entry_date, entry_type, description, status, source_key, total_base, reference, trip_name, executing_company, created_by, created_at, posted_by, posted_at)
    values (id, seq, _glw_parse_date(v ->> 'date'), v ->> 'type', nullif(h ->> 'desc', ''), 'مرحّل', c ->> 'key', (v ->> 'totalBase')::numeric, c ->> 'hash', nullif(h ->> 'trip', ''), nullif(h ->> 'company', ''), who, ts, who, ts);
    insert into gl_lines (entry_id, line_no, line_date, status, account_code, debit, credit, currency, fx_rate, debit_base, credit_base, trip_name, executing_company, client_name, agent, description)
    select id, t.n, _glw_parse_date(v ->> 'date'), 'مرحّل', l ->> 'account', round(coalesce((l ->> 'debit')::numeric, 0), 2), round(coalesce((l ->> 'credit')::numeric, 0), 2), l ->> 'currency', (l ->> 'rate')::numeric,
           round(coalesce((l ->> 'bDebit')::numeric, 0), 2), round(coalesce((l ->> 'bCredit')::numeric, 0), 2), nullif(l ->> 'trip', ''), nullif(l ->> 'company', ''), nullif(l ->> 'client', ''), nullif(l ->> 'agent', ''), nullif(l ->> 'desc', '')
      from jsonb_array_elements(v -> 'lines') with ordinality t(l, n);
    created := created || jsonb_build_array(jsonb_build_object('id', id, 'key', c ->> 'key'));
  end loop;
  if nupd + nvoid + jsonb_array_length(created) > 0 then
    perform _glw_audit(who, 'مزامنة القيود التلقائية', 'auto', jsonb_build_object('created', jsonb_array_length(created), 'updated', nupd, 'voided', nvoid));
    perform _glw_outbox('dv_bump', jsonb_build_object('groups', jsonb_build_array('gl', 'hb')));
    perform _glw_dv_bump(array['gl']);
  end if;
  return jsonb_build_object('success', true, 'created', created, 'updated', nupd, 'voided', nvoid); end $$;
revoke all on function gl_auto_write_raw(jsonb) from public, anon, authenticated; grant execute on function gl_auto_write_raw(jsonb) to service_role;

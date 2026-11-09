-- 032: دفعات الوكلاء (أسرة ap) بنظام السندات من Postgres — يمدّد _lg_submit (031) + saveAgentPayment (جديدة ⇒ سند مسودة · تعديل) + saveAgentPaymentsBatch.
-- يتطلب 031 و028 (دوال _vz_*). صلاحية visas.finance. يبقى على Apps Script (0A000): تعديل دفعة منسوخة من قيد (⟦src:gl-⟧: رسالة القفل الأصلية) · التوحيد موقوف · حساب طرف متعدد بلا تمييز بالشركة.
create or replace function _lg_submit(fam text, p jsonb, who text) returns jsonb language plpgsql volatile set search_path = public as
$$ declare
  party text := _rx_trim(coalesce(p ->> 'party', '')); amount float8 := floor(coalesce(_bk_pf(p -> 'amount'), 0) * 100 + 0.5) / 100; cur text := _lg_cur(coalesce(nullif(p ->> 'currency', ''), case when fam = 'ap' then 'SAR' else 'EGP' end));
  d text := coalesce(nullif(_lg_date(p ->> 'date'), ''), _lg_today()); cp text := _rx_trim(coalesce(p ->> 'cp', '')); cpa gl_accounts%rowtype; pa gl_accounts%rowtype; cnt int; comp text := _rx_trim(coalesce(p ->> 'company', ''));
  dups jsonb := '[]'::jsonb; kind_ text := case when fam = 'ap' then 'agent' else 'client' end; dirin boolean; typ text; rate float8; dsc text; trip text; e jsonb; r jsonb; vno text; id text; dtxt text; dup_flag boolean; x record;
begin
  if fam not in ('cp', 'ap') then raise exception 'غير مدعوم: أسرة %', fam using errcode = '0A000'; end if;
  if party = '' then raise exception 'الطرف مطلوب' using errcode = 'P0001'; end if;
  if not (amount > 0) then raise exception 'المبلغ غير صالح' using errcode = 'P0001'; end if;
  if cp = '' then return jsonb_build_object('success', false, 'code', 'LEDGER_NEED_CP', 'error', '⚠️ الحساب المقابل إلزامي (خزينة/بنك/عهدة… من دليل الحسابات) — التسجيل المالي من الشاشات يمر بالحسابات العامة واعتمادها'); end if;
  if nullif(p ->> 'cashCur', '') is not null and _lg_cur(p ->> 'cashCur') <> cur then raise exception 'غير مدعوم: عملة نقدية مختلفة' using errcode = '0A000'; end if;
  select * into cpa from gl_accounts where code = cp;
  if not found or coalesce(cpa.is_group, false) or cpa.active is false then raise exception 'الحساب المقابل % غير صالح (اختر حساباً فرعياً نشطاً)', cp using errcode = 'P0001'; end if;
  if coalesce(cpa.currency, '') <> '' and cpa.currency <> cur and coalesce(cpa.category, '') in ('safe', 'bank', 'custody') then
    raise exception 'الحساب المقابل «%» بعملة % والدفعة بعملة %', cpa.name, cpa.currency, cur using errcode = 'P0001'; end if;
  -- حساب الطرف: فئة عميل + «الربط» = اسمه
  select count(*) into cnt from gl_accounts a where not coalesce(a.is_group, false) and a.active is not false and a.category = kind_ and coalesce(a.link, '') <> '' and _ca_gnorm(a.link) = _ca_gnorm(party);
  if cnt = 0 then raise exception 'لا يوجد حساب بدليل الحسابات مرتبط بـ«%» (%) — أنشئه أو اربطه من دليل الحسابات أولاً', party, case when fam = 'ap' then 'وكيل' else 'عميل' end using errcode = 'P0001'; end if;
  if cnt > 1 then
    if comp <> '' then select * into pa from gl_accounts a where not coalesce(a.is_group, false) and a.active is not false and a.category = kind_ and _ca_gnorm(a.link) = _ca_gnorm(party) and position(_ca_gnorm(comp) in _ca_gnorm(a.name)) > 0 order by a.code limit 1; end if;
    if pa.code is null then raise exception 'غير مدعوم: أكثر من حساب طرف' using errcode = '0A000'; end if;
  else
    select * into pa from gl_accounts a where not coalesce(a.is_group, false) and a.active is not false and a.category = kind_ and coalesce(a.link, '') <> '' and _ca_gnorm(a.link) = _ca_gnorm(party) limit 1;
  end if;
  if pa.code = cp then raise exception 'الحساب المقابل هو نفس حساب الطرف' using errcode = 'P0001'; end if;
  -- فحص التكرار (بالدفتر ثم بشاشة العملاء)
  for x in select e2.entry_id, e2.source_key, e2.entry_date, e2.status, e2.description from gl_lines l join gl_entries e2 on e2.entry_id = l.entry_id
            where l.account_code = pa.code and e2.status <> 'ملغى' and _lg_cur(l.currency) = cur and abs(abs(coalesce(l.debit, 0) - coalesce(l.credit, 0)) - amount) <= 0.5 and to_char(e2.entry_date, 'DD/MM/YYYY') = d
            order by e2.seq, l.line_no loop
    dups := dups || jsonb_build_object('where', 'الحسابات العامة', 'ref', x.entry_id || case when x.source_key like 'VCH:%' then ' (سند ' || substr(x.source_key, 5) || ')' else '' end, 'date', to_char(x.entry_date, 'DD/MM/YYYY'), 'status', x.status, 'desc', coalesce(x.description, ''));
  end loop;
  if fam = 'cp' then
  for x in select _rx_s(_rx_c(raw, 0)) rid_, _lg_date(_rx_s(_rx_c(raw, 4))) dd, _rx_s(_rx_c(raw, 8)) ds from _rx_rows('acc_payments')
            where _ca_gnorm(_rx_s(_rx_c(raw, 1))) = _ca_gnorm(party) and abs(coalesce(_bk_pf(_rx_c(raw, 5)), 0) - amount) <= 0.5 and coalesce(nullif(_rx_s(_rx_c(raw, 6)), ''), 'EGP') = cur
              and _lg_date(_rx_s(_rx_c(raw, 4))) = d and _rx_s(_rx_c(raw, 8)) !~ '⟦src:gl-' order by rn loop
    dups := dups || jsonb_build_object('where', 'شاشة حسابات العملاء', 'ref', x.rid_, 'date', x.dd, 'status', 'دفعة', 'desc', x.ds);
  end loop;
  else
    for x in select _rx_s(_rx_c(raw, 0)) rid_, _lg_date(_mf_date(_rx_c(raw, 2))) dd, _mf_str(_rx_c(raw, 5)) ds from _rx_rows('vz_payments')
              where _mf_str(_rx_c(raw, 0)) <> '' and _ca_gnorm(_mf_str(_rx_c(raw, 1))) = _ca_gnorm(party) and abs(coalesce(_ac_num(_rx_c(raw, 3)), 0) - amount) <= 0.5
                and coalesce(nullif(_mf_str(_rx_c(raw, 4)), ''), 'SAR') = cur and _lg_date(_mf_date(_rx_c(raw, 2))) = d and _mf_str(_rx_c(raw, 5)) !~ '⟦src:gl-' order by rn loop
      dups := dups || jsonb_build_object('where', 'شاشة حسابات الوكلاء', 'ref', x.rid_, 'date', x.dd, 'status', 'دفعة', 'desc', x.ds);
    end loop;
  end if;
  if jsonb_array_length(dups) > 8 then select coalesce(jsonb_agg(z), '[]'::jsonb) into dups from (select z from jsonb_array_elements(dups) with ordinality t(z, o) where o <= 8) q; end if;
  if jsonb_array_length(dups) > 0 and not _gs_truthy(p -> 'force') then
    return jsonb_build_object('success', false, 'dup', true, 'dups', dups, 'error', '🔁 دفعة مشابهة مسجَّلة بالفعل (نفس الطرف والمبلغ في نفس اليوم) — راجعها أو أكّد التسجيل'); end if;
  if not exists (select 1 from store_meta where tbl = 'gl_maker_checker') then raise exception 'غير مدعوم: لا جدول طابور' using errcode = '0A000'; end if;
  dirin := case when fam = 'ap' then (p ->> 'dir') = 'in' else (p ->> 'dir') is distinct from 'out' end;
  typ := case when dirin then 'سند قبض' else 'سند صرف' end;
  rate := _lg_rate(cur, d);
  dsc := coalesce(nullif(_rx_trim(coalesce(p ->> 'desc', '')), ''), (case when dirin then 'دفعة من ' else 'دفعة إلى ' end) || party);
  trip := case when fam = 'cp' then _rx_trim(coalesce(p ->> 'trip', '')) else '' end;
  e := jsonb_build_object('date', d, 'type', typ, 'desc', dsc, 'ref', 'SCR:' || fam, 'company', comp, 'trip', case when trip = 'عام' then '' else trip end,
    'lines', jsonb_build_array(
      jsonb_build_object('account', cp, 'debit', case when dirin then amount else 0 end, 'credit', case when dirin then 0 else amount end, 'currency', cur, 'rate', rate, 'desc', dsc),
      jsonb_build_object('account', pa.code, 'debit', case when dirin then 0 else amount end, 'credit', case when dirin then amount else 0 end, 'currency', cur, 'rate', rate,
                         'trip', case when trip = 'عام' then '' else trip end, 'company', comp, 'desc', dsc)));
  r := _glw_save_core(e, who, false, false);
  id := r ->> 'id'; vno := coalesce(r ->> 'voucherNo', '');
  dup_flag := jsonb_array_length(dups) > 0;
  select string_agg((z ->> 'where') || ': ' || (z ->> 'ref') || ' ' || (z ->> 'date'), ' · ') into dtxt from jsonb_array_elements(dups) z;
  insert into store_rows (tbl, rid, ord, raw)
    select 'gl_maker_checker', substr(md5(random()::text || clock_timestamp()::text), 1, 20), coalesce(max(ord), 0) + 1,
           jsonb_build_array(id, fam, party, trip, d, case when dirin then amount else -amount end, cur, who, _lg_now(), coalesce(dtxt, ''), 'بانتظار الاعتماد', '', '', '', vno, cp || ' — ' || cpa.name)
      from store_rows where tbl = 'gl_maker_checker';
  update store_meta set ver = ver + 1, updated_at = now() where tbl = 'gl_maker_checker';
  perform _glw_outbox('bot:vch_new', _glw_bot_info(id, who));
  insert into app_outbox (kind, payload) values ('audit', jsonb_build_object('user', who, 'action', 'دفعة من الشاشة بانتظار الاعتماد', 'record', 'GL:' || id, 'field', case when fam = 'ap' then 'حسابات الوكلاء' else 'حسابات عملاء العمرة' end, 'old', '-',
    'new', party || ' — ' || amount::text || ' ' || cur || ' — سند ' || vno || case when dup_flag then ' (⚠️ تكرار محتمل)' else '' end));
  return jsonb_build_object('success', true, 'pending', true, 'id', id, 'voucherNo', vno, 'dupFlag', dup_flag); end $$;


create or replace function rw2_saveagentpayment(a jsonb, u text) returns jsonb language plpgsql volatile set search_path = public as
$$ declare p jsonb := a -> 1; agent text; amt float8; who text := coalesce(u, app_user(), '-'); pid text; dt text; cur text; notes text; rid_ text; oldraw jsonb; newraw jsonb; stamp text := _w_stamp(); begin
  if jsonb_typeof(p) is distinct from 'object' then raise exception 'بيانات الدفعة مطلوبة' using errcode = 'P0001'; end if;
  if not app_has('visas.finance') then raise exception 'لا تملك صلاحية الحسابات المالية' using errcode = '42501'; end if;
  agent := _mf_str(to_jsonb(coalesce(p ->> 'agent', ''))); amt := coalesce(_ac_num(p -> 'amount'), 0);
  if agent = '' or amt = 0 then return jsonb_build_object('success', false, 'error', 'الوكيل والمبلغ مطلوبان'); end if;
  pid := _mf_str(to_jsonb(coalesce(p ->> 'id', '')));
  dt := coalesce(nullif(_mf_date(to_jsonb(coalesce(p ->> 'date', ''))), ''), _lg_today());
  cur := coalesce(nullif(_mf_str(to_jsonb(coalesce(p ->> 'currency', ''))), ''), 'SAR'); notes := _mf_str(to_jsonb(coalesce(p ->> 'notes', '')));
  if pid = '' then
    if not _lg_on() then raise exception 'غير مدعوم: التوحيد موقوف' using errcode = '0A000'; end if;
    return _lg_from_screen('ap', jsonb_build_array(jsonb_build_object('party', agent, 'date', dt, 'amount', amt, 'currency', cur, 'desc', notes, 'cp', p ->> 'cp', 'dir', p ->> 'dir', 'company', p ->> 'company', 'force', _gs_truthy(p -> 'force'))), '{}'::jsonb, who);
  end if;
  perform pg_advisory_xact_lock(hashtextextended('store:put:vz_payments', 0));
  select rid, raw into rid_, oldraw from store_rows where tbl = 'vz_payments' and _mf_str(_rx_c(raw, 0)) = pid limit 1;
  if rid_ is null then return jsonb_build_object('success', false, 'error', 'الدفعة غير موجودة'); end if;
  if _mf_str(_rx_c(oldraw, 5)) ~ '⟦src:gl-' then raise exception 'غير مدعوم: دفعة منسوخة من قيد' using errcode = '0A000'; end if;
  if btrim(coalesce(p ->> 'baseVer', '')) <> '' and (p ->> 'baseVer') <> _ca_ver(jsonb_build_array(_mf_str(_rx_c(oldraw, 0)), _mf_str(_rx_c(oldraw, 1)), _mf_date(_rx_c(oldraw, 2)), (_ac_num(_rx_c(oldraw, 3)))::text,
        coalesce(nullif(_mf_str(_rx_c(oldraw, 4)), ''), 'SAR'), _mf_str(_rx_c(oldraw, 5)), _mf_str(_rx_c(oldraw, 8))), 7) then
    return jsonb_build_object('success', false, 'conflict', true, 'error', '⚠️ عدّل مستخدم آخر هذا السجل بعد فتحك له (' || _mf_str(_rx_c(oldraw, 6)) || case when _mf_str(_rx_c(oldraw, 7)) <> '' then ' — ' || _mf_str(_rx_c(oldraw, 7)) else '' end || ') — أعد فتحه لترى التعديل ثم أعد تعديلك'); end if;
  insert into app_outbox (kind, payload) values ('snaprow', jsonb_build_object('sheet', 'AgentAccounts_Payments', 'key', pid, 'row', oldraw, 'action', 'قبل تعديل دفعة وكيل', 'user', who));
  newraw := jsonb_build_array(pid, agent, dt, amt, cur, notes, who, stamp, _mf_str(to_jsonb(coalesce(p ->> 'entryNo', ''))));
  update store_rows set raw = newraw where tbl = 'vz_payments' and rid = rid_;
  update store_meta set ver = ver + 1, updated_at = now() where tbl = 'vz_payments';
  insert into app_outbox (kind, payload) values ('audit', jsonb_build_object('user', who, 'action', 'تعديل دفعة وكيل', 'record', 'AP:' || pid, 'field', amt::text || ' ' || coalesce(nullif(p ->> 'currency', ''), 'SAR'), 'old', '-', 'new', '-'));
  perform _w_dv_bump(array['visa', 'trips']);
  return jsonb_build_object('success', true); end $$;

create or replace function rw2_saveagentpaymentsbatch(a jsonb, u text) returns jsonb language plpgsql volatile set search_path = public as
$$ declare agent text := _mf_str(to_jsonb(coalesce(a ->> 1, ''))); rws jsonb; who text := coalesce(u, app_user(), '-'); begin
  if not app_has('visas.finance') then raise exception 'لا تملك صلاحية الحسابات المالية' using errcode = '42501'; end if;
  if agent = '' then return jsonb_build_object('success', false, 'error', 'اسم الوكيل مطلوب'); end if;
  select coalesce(jsonb_agg(jsonb_build_object('party', agent, 'date', coalesce(nullif(_mf_date(to_jsonb(coalesce(r ->> 'date', ''))), ''), _lg_today()), 'amount', _ac_num(r -> 'amount'), 'currency', 'SAR',
           'desc', _mf_str(to_jsonb(coalesce(r ->> 'notes', ''))), 'cp', r ->> 'cp') order by o), '[]'::jsonb) into rws
    from jsonb_array_elements(case when jsonb_typeof(a -> 2) = 'array' then a -> 2 else '[]'::jsonb end) with ordinality t(r, o) where coalesce(_ac_num(r -> 'amount'), 0) <> 0;
  if jsonb_array_length(rws) = 0 then return jsonb_build_object('success', false, 'error', 'لا توجد دفعات صالحة بالبيانات الملصقة'); end if;
  if not _lg_on() then raise exception 'غير مدعوم: التوحيد موقوف' using errcode = '0A000'; end if;
  return _lg_from_screen('ap', rws, '{"bulk":true}'::jsonb, who); end $$;

do $$ declare r record; begin
  for r in select p.oid::regprocedure::text sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname in ('_lg_submit', 'rw2_saveagentpayment', 'rw2_saveagentpaymentsbatch') loop
    execute format('revoke all on function %s from public, anon, authenticated', r.sig);
    execute format('grant execute on function %s to service_role', r.sig);
  end loop;
end $$;

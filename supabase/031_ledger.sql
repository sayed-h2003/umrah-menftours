-- 031: نظام السندات (Ledger: توحيد قنوات التسجيل + طابور الاعتماد Maker-Checker) من Postgres — نظير Ledger.gs.
-- • إنشاء سند مسودة لدفعة من شاشة حسابات العملاء (saveAccPayment الجديدة + saveAccPaymentsBulk) يستعمل _glw_save_core (003) فيحصل على رقم السند/التتبع المحصّن/الصادر نفسها.
-- • الطابور بجدول المخزن gl_maker_checker (مجموعة glaux): ledgerQueue/ledgerCount/ledgerPendingFor قراءة · ledgerDecide/ledgerCancel كتابة (الاعتماد = _glw_post_core، الرفض/السحب = _glw_void_core).
-- • يبقى على Apps Script (0A000 ⇒ رجوع تلقائي): أسرة ap/hb (وكلاء/فنادق) · عملة نقدية مختلفة (cashCur) · أكثر من حساب طرف محتمل بلا تمييز بالشركة.
-- يتطلب 001+002+003+019(_ca_gnorm)+026..030 ومجموعة glaux حيّة بالمخزن (gl_maker_checker) وجداول GL النمطية. التفعيل: supaWriteOnBookings() نفسه (wbk).
create or replace function _lg_now() returns text language sql stable as $$ select to_char(now() at time zone 'Africa/Cairo', 'DD/MM/YYYY HH24:MI:SS') $$;
create or replace function _lg_today() returns text language sql stable as $$ select to_char(now() at time zone 'Africa/Cairo', 'DD/MM/YYYY') $$;

-- _glDate_ (نص): dd/mm/yyyy · yyyy-mm-dd · سنة من رقمين ⇒ 20yy · وإلا ''
create or replace function _lg_date(v text) returns text language plpgsql immutable as
$$ declare s text := _rx_trim(translate(coalesce(v, ''), '٠١٢٣٤٥٦٧٨٩', '0123456789')); m text[]; begin
  m := regexp_match(s, '^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$');
  if m is not null then return lpad(m[1], 2, '0') || '/' || lpad(m[2], 2, '0') || '/' || m[3]; end if;
  m := regexp_match(s, '^(\d{4})[/\-.](\d{1,2})[/\-.](\d{1,2})');
  if m is not null then return lpad(m[3], 2, '0') || '/' || lpad(m[2], 2, '0') || '/' || m[1]; end if;
  m := regexp_match(s, '^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2})$');
  if m is not null then return lpad(m[1], 2, '0') || '/' || lpad(m[2], 2, '0') || '/20' || m[3]; end if;
  return ''; end $$;
create or replace function _lg_dkey(d text) returns text language sql immutable as
$$ select case when d ~ '^\d{2}/\d{2}/\d{4}$' then substr(d, 7, 4) || substr(d, 4, 2) || substr(d, 1, 2) else '' end $$;
create or replace function _lg_cur(c text) returns text language sql immutable as
$$ select case upper(btrim(coalesce(c, ''))) when 'جنيه' then 'EGP' when 'ريال' then 'SAR' when 'دولار' then 'USD' when 'EGP' then 'EGP' when 'SAR' then 'SAR' when 'USD' then 'USD' else 'EGP' end $$;

create or replace function _lg_on() returns boolean language sql stable as $$ select coalesce(_glw_setting('ledger_central'), '') <> 'لا' $$;
create or replace function _lg_can_approve() returns boolean language sql stable as $$ select app_has('admin') or app_has('gl.approve') $$;

-- الإعداد لكل شاشة (ledger_scr): {cp|ap|hb: {on, users[]}}
create or replace function _lg_scr_check(fam text, who text) returns void language plpgsql stable set search_path = public as
$$ declare o jsonb := '{}'::jsonb; c jsonb; lbl text := case fam when 'cp' then 'حسابات عملاء العمرة' when 'ap' then 'حسابات الوكلاء' else 'حجوزات الفنادق' end; users jsonb; begin
  begin o := coalesce(nullif(_glw_setting('ledger_scr'), '')::jsonb, '{}'::jsonb); exception when others then o := '{}'::jsonb; end;
  c := coalesce(o -> fam, '{}'::jsonb);
  if (c ->> 'on') = 'false' then raise exception '⛔ تسجيل الدفعات من شاشة «%» موقوف من الإعدادات — سجّلها من الحسابات العامة', lbl; end if;
  users := case when jsonb_typeof(c -> 'users') = 'array' then c -> 'users' else '[]'::jsonb end;
  if app_has('admin') or jsonb_array_length(users) = 0 then return; end if;
  if exists (select 1 from jsonb_array_elements_text(users) x where _ca_gnorm(x) = _ca_gnorm(who)) then return; end if;
  raise exception '⛔ غير مسموح لك بتسجيل الدفعات من شاشة «%» — يسجّلها المستخدمون المحددون بالإعدادات أو من الحسابات العامة', lbl; end $$;

-- سعر الصرف: آخر سعر يومي ≤ التاريخ (بيع) وإلا سعر الإعدادات (= _glFxRateAt_)
create or replace function _lg_rate(cur text, d text) returns float8 language plpgsql stable set search_path = public as
$$ declare k text := coalesce(nullif(_lg_dkey(d), ''), _lg_dkey(_lg_today())); r float8; dflt float8; begin
  if cur = 'EGP' then return 1; end if;
  select case cur when 'SAR' then sar_sell when 'USD' then usd_sell end into r from gl_fx_daily
   where to_char(fx_date, 'YYYYMMDD') <= k and coalesce(case cur when 'SAR' then sar_sell when 'USD' then usd_sell end, 0) > 0 order by fx_date desc limit 1;
  if r is not null then return r; end if;
  dflt := coalesce(nullif(_rx_jsnum(_glw_setting('rate_' || cur)), 0), case cur when 'SAR' then 13.3 else 50 end);
  return dflt; end $$;

-- ===== إنشاء سند مسودة لدفعة (= _ledgerSubmit_ لأسرة cp) =====
create or replace function _lg_submit(fam text, p jsonb, who text) returns jsonb language plpgsql volatile set search_path = public as
$$ declare
  party text := _rx_trim(coalesce(p ->> 'party', '')); amount float8 := floor(coalesce(_bk_pf(p -> 'amount'), 0) * 100 + 0.5) / 100; cur text := _lg_cur(coalesce(nullif(p ->> 'currency', ''), 'EGP'));
  d text := coalesce(nullif(_lg_date(p ->> 'date'), ''), _lg_today()); cp text := _rx_trim(coalesce(p ->> 'cp', '')); cpa gl_accounts%rowtype; pa gl_accounts%rowtype; cnt int; comp text := _rx_trim(coalesce(p ->> 'company', ''));
  dups jsonb := '[]'::jsonb; dirin boolean; typ text; rate float8; dsc text; trip text; e jsonb; r jsonb; vno text; id text; dtxt text; dup_flag boolean; x record;
begin
  if fam <> 'cp' then raise exception 'غير مدعوم: أسرة %', fam using errcode = '0A000'; end if;
  if party = '' then raise exception 'الطرف مطلوب' using errcode = 'P0001'; end if;
  if not (amount > 0) then raise exception 'المبلغ غير صالح' using errcode = 'P0001'; end if;
  if cp = '' then return jsonb_build_object('success', false, 'code', 'LEDGER_NEED_CP', 'error', '⚠️ الحساب المقابل إلزامي (خزينة/بنك/عهدة… من دليل الحسابات) — التسجيل المالي من الشاشات يمر بالحسابات العامة واعتمادها'); end if;
  if nullif(p ->> 'cashCur', '') is not null and _lg_cur(p ->> 'cashCur') <> cur then raise exception 'غير مدعوم: عملة نقدية مختلفة' using errcode = '0A000'; end if;
  select * into cpa from gl_accounts where code = cp;
  if not found or coalesce(cpa.is_group, false) or cpa.active is false then raise exception 'الحساب المقابل % غير صالح (اختر حساباً فرعياً نشطاً)', cp using errcode = 'P0001'; end if;
  if coalesce(cpa.currency, '') <> '' and cpa.currency <> cur and coalesce(cpa.category, '') in ('safe', 'bank', 'custody') then
    raise exception 'الحساب المقابل «%» بعملة % والدفعة بعملة %', cpa.name, cpa.currency, cur using errcode = 'P0001'; end if;
  -- حساب الطرف: فئة عميل + «الربط» = اسمه
  select count(*) into cnt from gl_accounts a where not coalesce(a.is_group, false) and a.active is not false and a.category = 'client' and coalesce(a.link, '') <> '' and _ca_gnorm(a.link) = _ca_gnorm(party);
  if cnt = 0 then raise exception 'لا يوجد حساب بدليل الحسابات مرتبط بـ«%» (عميل) — أنشئه أو اربطه من دليل الحسابات أولاً', party using errcode = 'P0001'; end if;
  if cnt > 1 then
    if comp <> '' then select * into pa from gl_accounts a where not coalesce(a.is_group, false) and a.active is not false and a.category = 'client' and _ca_gnorm(a.link) = _ca_gnorm(party) and position(_ca_gnorm(comp) in _ca_gnorm(a.name)) > 0 order by a.code limit 1; end if;
    if pa.code is null then raise exception 'غير مدعوم: أكثر من حساب طرف' using errcode = '0A000'; end if;
  else
    select * into pa from gl_accounts a where not coalesce(a.is_group, false) and a.active is not false and a.category = 'client' and coalesce(a.link, '') <> '' and _ca_gnorm(a.link) = _ca_gnorm(party) limit 1;
  end if;
  if pa.code = cp then raise exception 'الحساب المقابل هو نفس حساب الطرف' using errcode = 'P0001'; end if;
  -- فحص التكرار (بالدفتر ثم بشاشة العملاء)
  for x in select e2.entry_id, e2.source_key, e2.entry_date, e2.status, e2.description from gl_lines l join gl_entries e2 on e2.entry_id = l.entry_id
            where l.account_code = pa.code and e2.status <> 'ملغى' and _lg_cur(l.currency) = cur and abs(abs(coalesce(l.debit, 0) - coalesce(l.credit, 0)) - amount) <= 0.5 and to_char(e2.entry_date, 'DD/MM/YYYY') = d
            order by e2.seq, l.line_no loop
    dups := dups || jsonb_build_object('where', 'الحسابات العامة', 'ref', x.entry_id || case when x.source_key like 'VCH:%' then ' (سند ' || substr(x.source_key, 5) || ')' else '' end, 'date', to_char(x.entry_date, 'DD/MM/YYYY'), 'status', x.status, 'desc', coalesce(x.description, ''));
  end loop;
  for x in select _rx_s(_rx_c(raw, 0)) rid_, _lg_date(_rx_s(_rx_c(raw, 4))) dd, _rx_s(_rx_c(raw, 8)) ds from _rx_rows('acc_payments')
            where _ca_gnorm(_rx_s(_rx_c(raw, 1))) = _ca_gnorm(party) and abs(coalesce(_bk_pf(_rx_c(raw, 5)), 0) - amount) <= 0.5 and coalesce(nullif(_rx_s(_rx_c(raw, 6)), ''), 'EGP') = cur
              and _lg_date(_rx_s(_rx_c(raw, 4))) = d and _rx_s(_rx_c(raw, 8)) !~ '⟦src:gl-' order by rn loop
    dups := dups || jsonb_build_object('where', 'شاشة حسابات العملاء', 'ref', x.rid_, 'date', x.dd, 'status', 'دفعة', 'desc', x.ds);
  end loop;
  if jsonb_array_length(dups) > 8 then select coalesce(jsonb_agg(z), '[]'::jsonb) into dups from (select z from jsonb_array_elements(dups) with ordinality t(z, o) where o <= 8) q; end if;
  if jsonb_array_length(dups) > 0 and not _gs_truthy(p -> 'force') then
    return jsonb_build_object('success', false, 'dup', true, 'dups', dups, 'error', '🔁 دفعة مشابهة مسجَّلة بالفعل (نفس الطرف والمبلغ في نفس اليوم) — راجعها أو أكّد التسجيل'); end if;
  if not exists (select 1 from store_meta where tbl = 'gl_maker_checker') then raise exception 'غير مدعوم: لا جدول طابور' using errcode = '0A000'; end if;
  dirin := (p ->> 'dir') is distinct from 'out';
  typ := case when dirin then 'سند قبض' else 'سند صرف' end;
  rate := _lg_rate(cur, d);
  dsc := coalesce(nullif(_rx_trim(coalesce(p ->> 'desc', '')), ''), (case when dirin then 'دفعة من ' else 'دفعة إلى ' end) || party);
  trip := _rx_trim(coalesce(p ->> 'trip', ''));
  e := jsonb_build_object('date', d, 'type', typ, 'desc', dsc, 'ref', 'SCR:cp', 'company', comp, 'trip', case when trip = 'عام' then '' else trip end,
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
  insert into app_outbox (kind, payload) values ('audit', jsonb_build_object('user', who, 'action', 'دفعة من الشاشة بانتظار الاعتماد', 'record', 'GL:' || id, 'field', 'حسابات عملاء العمرة', 'old', '-',
    'new', party || ' — ' || amount::text || ' ' || cur || ' — سند ' || vno || case when dup_flag then ' (⚠️ تكرار محتمل)' else '' end));
  return jsonb_build_object('success', true, 'pending', true, 'id', id, 'voucherNo', vno, 'dupFlag', dup_flag); end $$;

-- ===== _ledgerFromScreen_ =====
create or replace function _lg_from_screen(fam text, rws jsonb, opts jsonb, who text) returns jsonb language plpgsql volatile set search_path = public as
$$ declare r jsonb; res jsonb := '[]'::jsonb; i int; okn int := 0; row_ jsonb; first_ jsonb; begin
  perform _lg_scr_check(fam, who);
  if exists (select 1 from jsonb_array_elements(rws) x where _rx_trim(coalesce(x ->> 'cp', '')) = '') then
    return jsonb_build_object('success', false, 'code', 'LEDGER_NEED_CP', 'error', '⚠️ الحساب المقابل إلزامي (خزينة/بنك/عهدة… من دليل الحسابات) — التسجيل المالي من الشاشات يمر بالحسابات العامة واعتمادها'); end if;
  for i in 0 .. jsonb_array_length(rws) - 1 loop
    row_ := rws -> i;
    if (row_ -> 'force') is null and _gs_truthy(opts -> 'bulk') then row_ := row_ || '{"force":true}'::jsonb; end if;
    r := _lg_submit(fam, row_, who);
    if (r ->> 'success') <> 'true' then
      if jsonb_array_length(rws) = 1 then return r; end if;
      res := res || jsonb_build_array(jsonb_build_object('ok', false, 'error', r ->> 'error')); continue;
    end if;
    res := res || jsonb_build_array(jsonb_build_object('ok', true, 'id', r ->> 'id', 'voucherNo', r ->> 'voucherNo', 'dupFlag', (r ->> 'dupFlag')::boolean));
  end loop;
  select count(*) into okn from jsonb_array_elements(res) z where (z ->> 'ok') = 'true';
  first_ := coalesce(res -> 0, '{}'::jsonb);
  return jsonb_build_object('success', okn > 0, 'pending', true, 'count', okn, 'results', res, 'id', first_ -> 'id', 'voucherNo', first_ -> 'voucherNo', 'error', case when okn > 0 then '' else coalesce(first_ ->> 'error', '') end); end $$;

-- ===== قراءات الطابور =====
create or replace function rx2_ledgercount(a jsonb, u text) returns jsonb language plpgsql stable set search_path = public as
$$ declare can boolean := _lg_can_approve(); n int; begin
  select count(*) into n from _rx_rows('gl_maker_checker') where _rx_s(_rx_c(raw, 10)) = 'بانتظار الاعتماد' and (can or _rx_s(_rx_c(raw, 7)) = u);
  return jsonb_build_object('success', true, 'n', n, 'canApprove', can); end $$;

create or replace function rx2_ledgerpendingfor(a jsonb, u text) returns jsonb language plpgsql stable set search_path = public as
$$ declare fam text := _rx_s(a -> 1); k text := _ca_gnorm(_rx_s(a -> 2)); res jsonb; begin
  select coalesce(jsonb_agg(jsonb_build_object('id', _rx_s(_rx_c(raw, 0)), 'trip', _rx_s(_rx_c(raw, 3)), 'date', _lg_date(_rx_s(_rx_c(raw, 4))), 'amount', coalesce(_bk_pf(_rx_c(raw, 5)), 0), 'cur', _rx_s(_rx_c(raw, 6)),
           'maker', _rx_s(_rx_c(raw, 7)), 'voucher', _rx_s(_rx_c(raw, 14)), 'counter', _rx_s(_rx_c(raw, 15)), 'dup', _rx_s(_rx_c(raw, 9))) order by rn), '[]'::jsonb) into res
    from _rx_rows('gl_maker_checker') where _rx_s(_rx_c(raw, 10)) = 'بانتظار الاعتماد' and _rx_s(_rx_c(raw, 1)) = fam and _ca_gnorm(_rx_s(_rx_c(raw, 2))) = k;
  return jsonb_build_object('success', true, 'rows', res); end $$;

create or replace function rx2_ledgerqueue(a jsonb, u text) returns jsonb language plpgsql stable set search_path = public as
$$ declare can boolean := _lg_can_approve(); dn int := coalesce(nullif(_bk_pf(a -> 1 -> 'doneN'), 0), 60)::int; pend jsonb; done_ jsonb; begin
  with q as (
    select rn, jsonb_build_object('id', _rx_s(_rx_c(raw, 0)), 'fam', _rx_s(_rx_c(raw, 1)), 'party', _rx_s(_rx_c(raw, 2)), 'trip', _rx_s(_rx_c(raw, 3)), 'date', _lg_date(_rx_s(_rx_c(raw, 4))),
           'amount', coalesce(_bk_pf(_rx_c(raw, 5)), 0), 'cur', _rx_s(_rx_c(raw, 6)), 'maker', _rx_s(_rx_c(raw, 7)), 'at', _rx_s(_rx_c(raw, 8)), 'dup', _rx_s(_rx_c(raw, 9)), 'status', _rx_s(_rx_c(raw, 10)),
           'checker', _rx_s(_rx_c(raw, 11)), 'decidedAt', _rx_s(_rx_c(raw, 12)), 'reason', _rx_s(_rx_c(raw, 13)), 'voucher', _rx_s(_rx_c(raw, 14)), 'counter', _rx_s(_rx_c(raw, 15)),
           'desc', coalesce((select e.description from gl_entries e where e.entry_id = _rx_s(_rx_c(raw, 0))), ''), 'exists', exists (select 1 from gl_entries e where e.entry_id = _rx_s(_rx_c(raw, 0)))) o,
           _rx_s(_rx_c(raw, 10)) st, _rx_s(_rx_c(raw, 7)) mk
      from _rx_rows('gl_maker_checker') where can or _rx_s(_rx_c(raw, 7)) = u)
  select coalesce(jsonb_agg(o || jsonb_build_object('mine', mk = u) order by rn) filter (where st = 'بانتظار الاعتماد'), '[]'::jsonb),
         coalesce((select jsonb_agg(o order by rn desc) from (select o, rn from q where st <> 'بانتظار الاعتماد' order by rn desc limit dn) z), '[]'::jsonb) into pend, done_ from q;
  return jsonb_build_object('success', true, 'pending', pend, 'done', done_, 'canApprove', can, 'me', u, 'isAdmin', app_has('admin'), 'on', _lg_on()); end $$;

-- ===== اعتماد/رفض =====
create or replace function rw2_ledgerdecide(a jsonb, u text) returns jsonb language plpgsql volatile set search_path = public as
$$ declare ids jsonb := case when jsonb_typeof(a -> 1) = 'array' then a -> 1 else jsonb_build_array(a -> 1) end; decision text := a ->> 2; reason text := coalesce(a ->> 3, ''); who text := coalesce(u, app_user(), '-');
  idv jsonb; id text; hit record; selfd boolean; st text; out_ jsonb := '[]'::jsonb; okn int := 0; err text; begin
  for idv in select * from jsonb_array_elements(ids) loop
    id := _rx_trim(coalesce(idv #>> '{}', '')); if id = '' then continue; end if;
    begin
      select s.rid, s.raw into hit from store_rows s where s.tbl = 'gl_maker_checker' and _rx_s(_rx_c(s.raw, 0)) = id and _rx_s(_rx_c(s.raw, 10)) = 'بانتظار الاعتماد' order by s.ord desc limit 1;
      if hit.rid is null then raise exception 'ليس بانتظار الاعتماد'; end if;
      if not _lg_can_approve() then raise exception 'اعتماد دفعات الشاشات لصاحب صلاحية «اعتماد» الحسابات العامة أو المدير'; end if;
      selfd := _rx_s(_rx_c(hit.raw, 7)) = who;
      if selfd and not app_has('admin') then raise exception '🔒 مبدأ الفصل (Maker-Checker): لا يعتمد المُدخِل دفعته بنفسه — يعتمدها مستخدم آخر'; end if;
      select status into st from gl_entries where entry_id = id;
      if decision = 'approve' then
        if not found then raise exception 'السند غير موجود (حُذف؟)'; end if;
        if st <> 'مسودة' then raise exception 'السند ليس مسودة'; end if;
        perform _glw_post_core(id, who);
        update store_rows set raw = jsonb_set(jsonb_set(jsonb_set(jsonb_set(raw, '{10}', to_jsonb('معتمد'::text)), '{11}', to_jsonb(who)), '{12}', to_jsonb(_lg_now())), '{13}', to_jsonb(case when selfd then 'اعتماد ذاتي (مدير)' else '' end)) where tbl = 'gl_maker_checker' and rid = hit.rid;
        insert into app_outbox (kind, payload) values ('audit', jsonb_build_object('user', who, 'action', case when selfd then 'اعتماد ذاتي لدفعة شاشة (مدير)' else 'اعتماد دفعة شاشة' end, 'record', 'GL:' || id, 'field', 'الحالة', 'old', 'مسودة', 'new', 'مرحّل'));
      else
        if found then
          if st <> 'مسودة' then raise exception 'السند ليس مسودة'; end if;
          perform _glw_void_core(id, 'رفض دفعة شاشة', who, false);
        end if;
        update store_rows set raw = jsonb_set(jsonb_set(jsonb_set(jsonb_set(raw, '{10}', to_jsonb('مرفوض'::text)), '{11}', to_jsonb(who)), '{12}', to_jsonb(_lg_now())), '{13}', to_jsonb(reason)) where tbl = 'gl_maker_checker' and rid = hit.rid;
        insert into app_outbox (kind, payload) values ('audit', jsonb_build_object('user', who, 'action', 'رفض دفعة شاشة', 'record', 'GL:' || id, 'field', 'السبب', 'old', '-', 'new', reason));
      end if;
      update store_meta set ver = ver + 1, updated_at = now() where tbl = 'gl_maker_checker';
      out_ := out_ || jsonb_build_array(jsonb_build_object('id', id, 'ok', true)); okn := okn + 1;
    exception when others then
      get stacked diagnostics err = message_text;
      out_ := out_ || jsonb_build_array(jsonb_build_object('id', id, 'ok', false, 'error', err));
    end;
  end loop;
  perform _w_dv_bump(array['gl', 'hb']);
  return jsonb_build_object('success', true, 'results', out_, 'done', okn); end $$;

create or replace function rw2_ledgercancel(a jsonb, u text) returns jsonb language plpgsql volatile set search_path = public as
$$ declare id text := _rx_trim(coalesce(a ->> 1, '')); who text := coalesce(u, app_user(), '-'); hit record; st text; begin
  select s.rid, s.raw into hit from store_rows s where s.tbl = 'gl_maker_checker' and _rx_s(_rx_c(s.raw, 0)) = id and _rx_s(_rx_c(s.raw, 10)) = 'بانتظار الاعتماد' order by s.ord desc limit 1;
  if hit.rid is null then raise exception 'ليس بانتظار الاعتماد' using errcode = 'P0001'; end if;
  if _rx_s(_rx_c(hit.raw, 7)) <> who and not _lg_can_approve() then raise exception 'يسحبها مُدخِلها أو المعتمِد فقط' using errcode = 'P0001'; end if;
  select status into st from gl_entries where entry_id = id;
  if found and st = 'مسودة' then perform _glw_void_core(id, 'سحب دفعة شاشة', who, false); end if;
  update store_rows set raw = jsonb_set(jsonb_set(jsonb_set(jsonb_set(raw, '{10}', to_jsonb('ملغى من المُدخِل'::text)), '{11}', to_jsonb(who)), '{12}', to_jsonb(_lg_now())), '{13}', '""'::jsonb) where tbl = 'gl_maker_checker' and rid = hit.rid;
  update store_meta set ver = ver + 1, updated_at = now() where tbl = 'gl_maker_checker';
  insert into app_outbox (kind, payload) values ('audit', jsonb_build_object('user', who, 'action', 'سحب دفعة شاشة قبل الاعتماد', 'record', 'GL:' || id, 'field', '-', 'old', '-', 'new', '-'));
  perform _w_dv_bump(array['gl', 'hb']);
  return jsonb_build_object('success', true); end $$;

-- ===== saveAccPaymentsBulk (دفعات متعددة ⇒ سندات مسودة) =====
create or replace function rw2_saveaccpaymentsbulk(a jsonb, u text) returns jsonb language plpgsql volatile set search_path = public as
$$ declare client text := _rx_trim(coalesce(a ->> 1, '')); trip text := _rx_trim(coalesce(a ->> 2, '')); lst jsonb := a -> 3; who text := coalesce(u, app_user(), '-'); rws jsonb; begin
  if not app_has('accounts.add') then raise exception 'لا تملك صلاحية' using errcode = '42501'; end if;
  if client = '' or trip = '' or jsonb_typeof(lst) is distinct from 'array' or jsonb_array_length(lst) = 0 then return jsonb_build_object('success', false, 'error', 'لا توجد دفعات'); end if;
  if not _lg_on() then raise exception 'غير مدعوم: التوحيد موقوف' using errcode = '0A000'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('party', client, 'trip', trip, 'date', p ->> 'date', 'amount', _bk_pf(p -> 'amount'), 'currency', case when (p ->> 'currency') = 'SAR' then 'SAR' else 'EGP' end, 'desc', p ->> 'desc', 'cp', p ->> 'cp') order by o), '[]'::jsonb) into rws
    from jsonb_array_elements(lst) with ordinality t(p, o) where coalesce(_bk_pf(p -> 'amount'), 0) > 0;
  return _lg_from_screen('cp', rws, '{"bulk":true}'::jsonb, who); end $$;

-- ===== saveAccPayment (تعديل + تحويل + دفعة جديدة ⇒ سند مسودة) — يستبدل تعريف 029 =====
create or replace function rw2_saveaccpayment(a jsonb, u text) returns jsonb language plpgsql volatile set search_path = public as
$$ declare
  p jsonb := a -> 1; isedit boolean; client text; trip text; amt float8; ptype text; cur text; rate float8; dsc text; who text := coalesce(u, app_user(), '-');
  rid_ text; oldraw jsonb; newraw jsonb; od text; cfm text; nd text; srcm text; oamt float8; id text; nowj jsonb := jsonb_build_object('$d', (extract(epoch from clock_timestamp()) * 1000)::bigint); src text; dst text; fxop text;
begin
  if jsonb_typeof(p) is distinct from 'object' then raise exception 'بيانات الدفعة مطلوبة' using errcode = 'P0001'; end if;
  isedit := btrim(coalesce(p ->> 'id', '')) <> '';
  ptype := case when (p ->> 'ptype') = 'تحويل' then 'تحويل' else 'دفعة' end;
  if not app_has('accounts.' || case when isedit then 'edit' else 'add' end) then raise exception 'لا تملك صلاحية' using errcode = '42501'; end if;
  client := btrim(coalesce(p ->> 'client', '')); trip := btrim(coalesce(p ->> 'trip', ''));
  if client = '' or trip = '' then return jsonb_build_object('success', false, 'error', 'العميل والرحلة مطلوبان'); end if;
  amt := coalesce(_bk_pf(p -> 'amount'), 0);
  if amt <= 0 then return jsonb_build_object('success', false, 'error', 'المبلغ غير صالح'); end if;
  cur := case when (p ->> 'currency') = 'SAR' then 'SAR' else 'EGP' end;
  rate := coalesce(_bk_pf(p -> 'rate'), 0);
  if ptype = 'تحويل' and rate <= 0 then return jsonb_build_object('success', false, 'error', 'سعر الصرف مطلوب للتحويل'); end if;
  dsc := btrim(coalesce(p ->> 'desc', ''));
  if ptype = 'تحويل' and dsc = '' then
    src := case when cur = 'SAR' then 'ريال' else 'جنيه' end; dst := case when cur = 'SAR' then 'جنيه' else 'ريال' end; fxop := case when cur = 'SAR' then '×' else '/' end;
    dsc := 'قيمة تحويل ' || floor(amt + 0.5)::bigint::text || ' ' || src || ' ' || fxop || ' ' || rate::text || ' الى المعادل بال' || dst;
  end if;
  if not isedit and ptype <> 'تحويل' then
    -- 🏛️ دفعة جديدة عادية: سند مسودة بالحسابات العامة بانتظار الاعتماد (= _ledgerFromScreen_)
    if not _lg_on() then raise exception 'غير مدعوم: التوحيد موقوف' using errcode = '0A000'; end if;
    return _lg_from_screen('cp', jsonb_build_array(jsonb_build_object('party', client, 'trip', trip, 'date', p ->> 'date', 'amount', amt, 'currency', cur, 'desc', dsc, 'cp', p ->> 'cp', 'dir', p ->> 'dir', 'force', _gs_truthy(p -> 'force'))), '{}'::jsonb, who);
  end if;
  perform pg_advisory_xact_lock(hashtextextended('store:put:acc_payments', 0));

  if isedit then
    select rid, raw into rid_, oldraw from store_rows where tbl = 'acc_payments' and _rx_s(_rx_c(raw, 0)) = (p ->> 'id') limit 1;
    if rid_ is null then return jsonb_build_object('success', false, 'error', 'الدفعة غير موجودة'); end if;
    if btrim(coalesce(p ->> 'baseVer', '')) <> '' and (p ->> 'baseVer') <> _ca_ver(oldraw, 12) then
      return jsonb_build_object('success', false, 'conflict', true, 'error', '⚠️ عدّل مستخدم آخر هذا السجل بعد فتحك له — أعد فتحه لترى التعديل ثم أعد تعديلك'); end if;
    od := _rx_s(_rx_c(oldraw, 8));
    cfm := (regexp_match(od, '⟦cf:[a-z0-9]+⟧', 'i'))[1];
    nd := dsc || case when cfm is not null and position('⟦cf:' in dsc) = 0 then ' ' || cfm else '' end;
    srcm := (regexp_match(od, '⟦src:gl-[^⟧]+⟧'))[1];
    if srcm is not null and position('⟦src:gl-' in nd) = 0 then nd := btrim(nd || ' ' || srcm); end if;
    insert into app_outbox (kind, payload) values ('snaprow', jsonb_build_object('sheet', 'ClientAccounts_Payments', 'key', p ->> 'id', 'row', oldraw, 'action', 'قبل تعديل دفعة', 'user', who));
    oamt := coalesce(_bk_pf(_rx_c(oldraw, 5)), 0);
    newraw := oldraw;
    newraw := jsonb_set(newraw, '{3}', to_jsonb(ptype));
    newraw := jsonb_set(newraw, '{4}', to_jsonb(coalesce(p ->> 'date', '')));
    newraw := jsonb_set(newraw, '{5}', to_jsonb(amt));
    newraw := jsonb_set(newraw, '{6}', to_jsonb(cur));
    newraw := jsonb_set(newraw, '{7}', case when ptype = 'تحويل' then to_jsonb(rate) else '""'::jsonb end);
    newraw := jsonb_set(newraw, '{8}', to_jsonb(nd));
    update store_rows set raw = newraw where tbl = 'acc_payments' and rid = rid_;
    update store_meta set ver = ver + 1, updated_at = now() where tbl = 'acc_payments';
    insert into app_outbox (kind, payload) values ('audit', jsonb_build_object('user', who, 'action', 'تعديل دفعة حساب', 'record', client, 'field', trip,
      'old', oamt::text || ' ' || case when coalesce(nullif(_rx_s(_rx_c(oldraw, 6)), ''), 'EGP') = 'SAR' then 'ريال' else 'جنيه' end || ' — ' || regexp_replace(od, '\s*⟦cf:[a-z0-9]+⟧\s*$', '', 'i'),
      'new', amt::text || ' ' || cur || ' — ' || dsc));
    perform _w_dv_bump(_acc_dvs());
    return jsonb_build_object('success', true, 'id', p ->> 'id', 'ver', _ca_ver(newraw, 12));
  end if;

  -- تحويل عملة جديد
  if trip <> 'عام' and not exists (select 1 from store_rows where tbl = 'acc_meta' and btrim(_rx_s(raw -> 0)) = client and btrim(_rx_s(raw -> 1)) = trip) then
    raise exception 'غير مدعوم: لا صف meta' using errcode = '0A000'; end if;
  id := 'P' || _w_b36((extract(epoch from clock_timestamp()) * 1000)::bigint) || _w_b36((random() * 10000)::int);
  newraw := jsonb_build_array(id, client, trip, 'تحويل', coalesce(p ->> 'date', ''), amt, cur, rate, dsc, who, nowj, '');
  insert into store_rows (tbl, rid, ord, raw)
    select 'acc_payments', substr(md5(random()::text || clock_timestamp()::text), 1, 20), coalesce(max(ord), 0) + 1, newraw from store_rows where tbl = 'acc_payments';
  update store_meta set ver = ver + 1, updated_at = now() where tbl = 'acc_payments';
  insert into app_outbox (kind, payload) values ('audit', jsonb_build_object('user', who, 'action', 'تحويل عملة بحساب', 'record', client, 'field', trip, 'old', '-',
    'new', amt::text || ' ' || cur || ' × ' || rate::text || ' = ' || _gs_r2(amt * rate)::text || ' ' || (case when cur = 'SAR' then 'EGP' else 'SAR' end) || ' — ' || dsc));
  perform _w_dv_bump(_acc_dvs());
  return jsonb_build_object('success', true, 'id', id, 'serial', ''); end $$;


do $$ declare r record; begin
  for r in select p.oid::regprocedure::text sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and (p.proname like '\_lg\_%' or p.proname in ('rw2_ledgerdecide', 'rw2_ledgercancel', 'rw2_saveaccpaymentsbulk', 'rw2_saveaccpayment', 'rx2_ledgercount', 'rx2_ledgerpendingfor', 'rx2_ledgerqueue')) loop
    execute format('revoke all on function %s from public, anon, authenticated', r.sig);
    execute format('grant execute on function %s to service_role', r.sig);
  end loop;
end $$;

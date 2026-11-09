-- 037: saveTripPilgrims من Postgres — حفظ كشف الرحلة (استبدال معتمري الرحلة بالقائمة الجديدة) بنفس منطق Code.gs، وآثاره كلها داخل Postgres بنفس المعاملة:
-- • اسم العميل إلزامي · الحذف الفعلي يتطلب kashf.delete · المحذوفون من الكشف يتحوّلون لصفوف «بدون رحلة» (يبقون بالسجل العام) ما لم يكونوا برحلة أخرى
-- • صفوف الرحلات الأخرى لا تُمس؛ صفوف هذه الرحلة تنتقل لآخر الجدول (كما كان بالشيت) ثم صفوف «بدون رحلة» الجديدة
-- • سجل الفروق (معتمر مضاف/محذوف/معدَّل) ⇒ audit_log (src='pg' يظهر فوراً بسجل التعديلات) + نسخة بصندوق الإخراج للسجل المحصّن (سلسلة التجزئة بملف Drive المستقل — تبقى هناك بتصميمها)
-- • مزامنة مشرفي الرحلة من الكشف (صفوف عميلها «المشرف…») ⇒ صف الرحلة بالمخزن
-- • تنبيهات الجرس (عميل جديد · تغيّر تسكين/عدد/فندق لعميل له حساب) ⇒ مخزن notifications (تحترم مفاتيح التفعيل)
-- • تسجيل العملاء الجدد بدليل العملاء ⇒ مخزن clients (بنفس تطبيع الأسماء) ويُرجَع clientsAdded للمتصفح مباشرة
-- • لقطات الرحلة (tripsnap) ⇒ صندوق الإخراج. الكاش: لا حاجة (القراءة من Postgres وبصمات dv).
-- مزامنة حسابات العملاء التلقائية (برنامج/تأشيرة وباركود) ⇒ محرك 040 داخل Postgres؛ لا يبقى بـApps Script إلا عملاء نمط «بنود» ببنود تلقائية (بند kashfsave). يتطلب 034 و040 و006+007+009+010.
create or replace function _stp_set(r jsonb, ixh jsonb, k text, v jsonb) returns jsonb language sql immutable as
$$ select case when (ixh ->> k) is null then r else jsonb_set(r, array[(ixh ->> k)], v) end $$;

create or replace function _stp_row(ixh jsonb, w int, p jsonb, idx int, trip text) returns jsonb language plpgsql immutable as
$$ declare r jsonb; ty text := coalesce(p ->> 'type', ''); begin
  select jsonb_agg('""'::jsonb) into r from generate_series(1, w);
  r := _stp_set(r, ixh, 'مسلسل', to_jsonb(idx));
  r := _stp_set(r, ixh, 'اسم المعتمر', to_jsonb(btrim(coalesce(p ->> 'name', ''))));
  r := _stp_set(r, ixh, 'رقم الجواز', to_jsonb(btrim(coalesce(p ->> 'passport', ''))));
  r := _stp_set(r, ixh, 'النوع', to_jsonb(ty));
  r := _stp_set(r, ixh, 'العميل', to_jsonb(coalesce(p ->> 'client', '')));
  r := _stp_set(r, ixh, 'طبيعة التسكين', to_jsonb(case when ty = 'رضيع' then '' else coalesce(p ->> 'accommodation', '') end));
  r := _stp_set(r, ixh, 'رقم الغرفة', to_jsonb(coalesce(p ->> 'roomNo', '')));
  r := _stp_set(r, ixh, 'ملاحظات', to_jsonb(coalesce(p ->> 'notes', '')));
  r := _stp_set(r, ixh, 'اسم الرحلة', to_jsonb(trip));
  r := _stp_set(r, ixh, 'رقم الإشعار', to_jsonb(coalesce(p ->> 'bookingId', '')));
  r := _stp_set(r, ixh, 'الاسم بالإنجليزية', to_jsonb(btrim(coalesce(p ->> 'latinName', ''))));
  r := _stp_set(r, ixh, 'تاريخ الميلاد', to_jsonb(btrim(coalesce(p ->> 'birthDate', ''))));
  r := _stp_set(r, ixh, 'تاريخ إصدار الجواز', to_jsonb(btrim(coalesce(p ->> 'issueDate', ''))));
  r := _stp_set(r, ixh, 'تاريخ انتهاء الجواز', to_jsonb(btrim(coalesce(p ->> 'expiryDate', ''))));
  r := _stp_set(r, ixh, 'معرف المعتمر', to_jsonb(btrim(coalesce(p ->> 'pid', ''))));
  r := _stp_set(r, ixh, 'معرف المحرم', to_jsonb(btrim(coalesce(p ->> 'mahramPid', ''))));
  r := _stp_set(r, ixh, 'علاقة المحرم', to_jsonb(btrim(coalesce(p ->> 'mahramRel', ''))));
  r := _stp_set(r, ixh, 'فندق المدينة', to_jsonb(btrim(coalesce(p ->> 'hotelMadinah', ''))));
  r := _stp_set(r, ixh, 'فندق مكة', to_jsonb(btrim(coalesce(p ->> 'hotelMakkah', ''))));
  r := _stp_set(r, ixh, 'مجموعة الغرفة', to_jsonb(btrim(coalesce(p ->> 'roomGroup', ''))));
  r := _stp_set(r, ixh, 'مستبعد من التسكين', to_jsonb(case when _gs_truthy(p -> 'housingExcluded') then '1' else '' end));
  r := _stp_set(r, ixh, 'رقم غرفة المدينة', to_jsonb(btrim(coalesce(p ->> 'roomNoMadinah', ''))));
  r := _stp_set(r, ixh, 'رقم غرفة مكة', to_jsonb(btrim(coalesce(p ->> 'roomNoMakkah', ''))));
  r := _stp_set(r, ixh, 'مستبعد من تسكين المدينة', to_jsonb(case when _gs_truthy(p -> 'housingExcludedMadinah') then '1' else '' end));
  r := _stp_set(r, ixh, 'مستبعد من تسكين مكة', to_jsonb(case when _gs_truthy(p -> 'housingExcludedMakkah') then '1' else '' end));
  return r; end $$;


-- إدخال دفعة أسطر سجل تعديلات: audit_log (src='pg') + صندوق الإخراج للسجل المحصّن
create or replace function _stp_aud(who text, entries jsonb, scr text, scrlbl text) returns void language plpgsql volatile set search_path = public as
$$ begin
  if jsonb_typeof(entries) is distinct from 'array' or jsonb_array_length(entries) = 0 then return; end if;
  insert into app_outbox (kind, payload) select 'audit', jsonb_build_object('user', who, 'action', e ->> 'action', 'record', e ->> 'recordId', 'field', e ->> 'field', 'old', e ->> 'oldVal', 'new', e ->> 'newVal') from jsonb_array_elements(entries) e;
  insert into audit_log (src, rn, ts_str, ts_ms, t_ms, username, action, record_id, field, old_value, new_value, screen, screen_label)
    select 'pg', nextval('audit_pg_seq'), to_char(now() at time zone 'Asia/Riyadh', 'DD/MM/YYYY HH24:MI:SS'), (extract(epoch from now()) * 1000)::bigint, (extract(epoch from now()) * 1000)::bigint,
           who, e ->> 'action', coalesce(e ->> 'recordId', '-'), coalesce(e ->> 'field', '-'), coalesce(nullif(e ->> 'oldVal', ''), '-'), coalesce(nullif(e ->> 'newVal', ''), '-'), scr, scrlbl from jsonb_array_elements(entries) e; end $$;

-- تنبيه جرس مباشر بمخزن notifications (= _notifPush_)
create or replace function _stp_notif(p_type text, p_msg text, p_client text, p_trip text, p_perm text, p_user text) returns void language plpgsql volatile set search_path = public as
$$ begin
  if not exists (select 1 from store_meta where tbl = 'notifications') then return; end if;
  if not _sx_alert_on('notif_' || p_type) then return; end if;
  perform pg_advisory_xact_lock(hashtextextended('store:put:notifications', 0));
  insert into store_rows (tbl, rid, ord, raw) select 'notifications', substr(md5(random()::text || clock_timestamp()::text), 1, 20), coalesce(max(ord), 0) + 1,
    jsonb_build_array('N' || upper(to_hex((extract(epoch from clock_timestamp()) * 1000)::bigint)) || substr(md5(random()::text), 1, 4), p_type, p_msg, coalesce(p_client, ''), coalesce(p_trip, ''), coalesce(p_perm, ''), 'لا', coalesce(p_user, ''),
                      jsonb_build_object('$d', (extract(epoch from clock_timestamp()) * 1000)::bigint)) from store_rows where tbl = 'notifications';
  update store_meta set ver = ver + 1, updated_at = now() where tbl = 'notifications'; end $$;

-- تطبيع اسم عميل (= _clientDirNorm_)
create or replace function _stp_cnorm(s text) returns text language sql immutable as
$$ select lower(btrim(regexp_replace(translate(regexp_replace(translate(coalesce(s, ''), '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹', '01234567890123456789'), '[​-‏‪-‮⁦-⁩﻿ـ]', '', 'g'),
        'أإآىة', 'ااايه'), '[ً-ٰٟ \s]+', ' ', 'g'))) $$;

-- بصمة عميل بالكشف (أعداد/فنادق/تسكين) = buildSigs
create or replace function _stp_sigs(rows_ jsonb, kind text) returns jsonb language plpgsql immutable as
$$ declare out_ jsonb := '{}'::jsonb; r jsonb; cl text; ty text; hm text; hk text; ac text; s jsonb; a int; c int; i int; h jsonb; m jsonb; ixh jsonb := _rx_map('pilgrims', _rx_h_pil()); f text; begin
  for r in select * from jsonb_array_elements(rows_) loop
    if kind = 'old' then
      cl := _rx_trim(_rx_s(_rx_c(r, (ixh ->> 'العميل')::int))); ty := _rx_trim(_rx_s(_rx_c(r, (ixh ->> 'النوع')::int)));
      hm := _rx_trim(_rx_s(_rx_c(r, (ixh ->> 'فندق المدينة')::int))); hk := _rx_trim(_rx_s(_rx_c(r, (ixh ->> 'فندق مكة')::int))); ac := _rx_trim(_rx_s(_rx_c(r, (ixh ->> 'طبيعة التسكين')::int)));
    else
      cl := btrim(coalesce(r ->> 'client', '')); ty := btrim(coalesce(r ->> 'type', '')); hm := btrim(coalesce(r ->> 'hotelMadinah', '')); hk := btrim(coalesce(r ->> 'hotelMakkah', '')); ac := btrim(coalesce(r ->> 'accommodation', ''));
    end if;
    if cl = '' then continue; end if;
    s := coalesce(out_ -> cl, jsonb_build_object('a', 0, 'c', 0, 'i', 0, 'h', '{}'::jsonb, 'm', '{}'::jsonb));
    if ty = 'طفل' then s := jsonb_set(s, '{c}', to_jsonb((s ->> 'c')::int + 1)); elsif ty = 'رضيع' then s := jsonb_set(s, '{i}', to_jsonb((s ->> 'i')::int + 1)); else s := jsonb_set(s, '{a}', to_jsonb((s ->> 'a')::int + 1)); end if;
    if hm <> '' then s := jsonb_set(s, array['h', 'M:' || hm], to_jsonb(coalesce((s -> 'h' ->> ('M:' || hm))::int, 0) + 1)); end if;
    if hk <> '' then s := jsonb_set(s, array['h', 'K:' || hk], to_jsonb(coalesce((s -> 'h' ->> ('K:' || hk))::int, 0) + 1)); end if;
    if ac <> '' then s := jsonb_set(s, array['m', ac], to_jsonb(coalesce((s -> 'm' ->> ac)::int, 0) + 1)); end if;
    out_ := jsonb_set(out_, array[cl], s);
  end loop;
  return out_; end $$;

-- كل آثار حفظ الكشف داخل Postgres: سجل الفروق · المشرفون · التنبيهات · دليل العملاء — يرجع {clientsAdded, clientsAliases}
create or replace function _stp_effects(trip text, who text, oldrows jsonb, pil jsonb) returns jsonb language plpgsql volatile set search_path = public as
$$ declare
  ixh jsonb := _rx_map('pilgrims', _rx_h_pil()); ent jsonb := '[]'::jsonb; oldm jsonb := '{}'::jsonb; newm jsonb := '{}'::jsonb; oldord text[] := '{}'; neword text[] := '{}'; r jsonb; k text; od jsonb; nw jsonb; nm text; cl text; chg text[]; olds text[]; news text[];
  f record; labels text[] := array['الاسم', 'الجواز', 'النوع', 'العميل', 'التسكين', 'الغرفة', 'فندق المدينة', 'فندق مكة', 'ملاحظات']; keys text[] := array['name', 'passport', 'type', 'client', 'accommodation', 'roomNo', 'hotelMadinah', 'hotelMakkah', 'notes'];
  hdrs text[] := array['اسم المعتمر', 'رقم الجواز', 'النوع', 'العميل', 'طبيعة التسكين', 'رقم الغرفة', 'فندق المدينة', 'فندق مكة', 'ملاحظات']; i int; o jsonb;
  th jsonb := _rx_hdr('trips'); ti int; si int; ri int; ji int; trid text; traw jsonb; cur jsonb; roleof jsonb := '{}'::jsonb; sups jsonb := '[]'::jsonb; seen jsonb := '{}'::jsonb; role text; oldj text; newj text; s jsonb;
  osig jsonb; nsig jsonb; added text[] := '{}'; alias jsonb := '{}'::jsonb; todo jsonb := '{}'::jsonb; have jsonb := '{}'::jsonb; nk text; n int;
begin
  -- 1) سجل الفروق (= _logKashfDiff_)
  for r in select * from jsonb_array_elements(oldrows) loop
    nm := _rx_trim(_rx_s(_rx_c(r, (ixh ->> 'اسم المعتمر')::int)));
    k := coalesce(nullif(_rx_trim(_rx_s(_rx_c(r, (ixh ->> 'معرف المعتمر')::int))), ''), nullif(_rx_trim(_rx_s(_rx_c(r, (ixh ->> 'رقم الجواز')::int))), ''), nm);
    if k = '' then continue; end if;
    o := '{}'::jsonb; for i in 1 .. 9 loop o := o || jsonb_build_object(keys[i], _rx_s(_rx_c(r, (ixh ->> hdrs[i])::int))); end loop;
    oldm := oldm || jsonb_build_object(k, o); if not (k = any(oldord)) then oldord := oldord || k; end if;
  end loop;
  for r in select * from jsonb_array_elements(pil) loop
    if btrim(coalesce(r ->> 'name', '')) = '' then continue; end if;
    k := coalesce(nullif(btrim(coalesce(r ->> 'pid', '')), ''), nullif(btrim(coalesce(r ->> 'passport', '')), ''), btrim(r ->> 'name'));
    o := '{}'::jsonb; for i in 1 .. 9 loop o := o || jsonb_build_object(keys[i], coalesce(r ->> keys[i], '')); end loop;
    newm := newm || jsonb_build_object(k, o); if not (k = any(neword)) then neword := neword || k; end if;
  end loop;
  foreach k in array oldord loop
    if not (newm ? k) then od := oldm -> k;
      ent := ent || jsonb_build_object('action', 'حذف معتمر', 'recordId', trip, 'field', (od ->> 'name') || case when (od ->> 'client') <> '' then ' (العميل: ' || (od ->> 'client') || ')' else '' end,
        'oldVal', (od ->> 'name') || case when (od ->> 'passport') <> '' then ' / ' || (od ->> 'passport') else '' end, 'newVal', '-'); end if;
  end loop;
  foreach k in array neword loop
    nw := newm -> k; od := oldm -> k;
    if od is null then
      ent := ent || jsonb_build_object('action', 'تسجيل معتمر', 'recordId', trip, 'field', (nw ->> 'name') || case when (nw ->> 'client') <> '' then ' (العميل: ' || (nw ->> 'client') || ')' else '' end,
        'oldVal', '-', 'newVal', (nw ->> 'name') || case when (nw ->> 'passport') <> '' then ' / ' || (nw ->> 'passport') else '' end);
    else
      chg := '{}'; olds := '{}'; news := '{}';
      for i in 1 .. 9 loop
        if (od ->> keys[i]) is distinct from (nw ->> keys[i]) then chg := chg || labels[i]; olds := olds || (labels[i] || ': ' || coalesce(nullif(od ->> keys[i], ''), '—')); news := news || (labels[i] || ': ' || coalesce(nullif(nw ->> keys[i], ''), '—')); end if;
      end loop;
      if array_length(chg, 1) > 0 then
        ent := ent || jsonb_build_object('action', 'تحديث معتمر', 'recordId', trip, 'field', (nw ->> 'name') || case when (nw ->> 'client') <> '' then ' (العميل: ' || (nw ->> 'client') || ')' else '' end || ' — ' || array_to_string(chg, '، '),
          'oldVal', array_to_string(olds, ' | '), 'newVal', array_to_string(news, ' | ')); end if;
    end if;
  end loop;
  if jsonb_array_length(ent) = 0 then ent := jsonb_build_array(jsonb_build_object('action', 'حفظ الكشف', 'recordId', trip, 'field', 'كشف المعتمرين', 'oldVal', '-', 'newVal', 'حفظ بلا تغييرات (' || jsonb_array_length(pil) || ')')); end if;
  perform _stp_aud(who, ent, 'pilgrims', 'المعتمرون / الكشف');

  -- 2) مشرفو الرحلة من الكشف (= _syncTripSupervisorsFromKashf_)
  ti := _rx_idx(th, 'اسم الرحلة'); si := _rx_idx(th, 'المشرف'); ri := _rx_idx(th, 'دور المشرف'); ji := _rx_idx(th, 'المشرفون (JSON)');
  if ti is not null and ji is not null then
    select rid, raw into trid, traw from store_rows where tbl = 'trips' and _rx_trim(_rx_s(_rx_c(raw, ti))) = trip order by ord, rid limit 1;
    if trid is not null then
      begin cur := coalesce(nullif(_rx_s(_rx_c(traw, ji)), '')::jsonb, '[]'::jsonb); exception when others then cur := '[]'::jsonb; end;
      if jsonb_typeof(cur) <> 'array' then cur := '[]'::jsonb; end if;
      if jsonb_array_length(cur) = 0 and si is not null and _rx_trim(_rx_s(_rx_c(traw, si))) <> '' then
        cur := jsonb_build_array(jsonb_build_object('name', _rx_trim(_rx_s(_rx_c(traw, si))), 'role', coalesce(nullif(case when ri is null then '' else _rx_s(_rx_c(traw, ri)) end, ''), 'مرافق'))); end if;
      for s in select * from jsonb_array_elements(cur) loop if coalesce(s ->> 'name', '') <> '' then roleof := roleof || jsonb_build_object(btrim(s ->> 'name'), coalesce(nullif(s ->> 'role', ''), 'مرافق')); end if; end loop;
      for r in select * from jsonb_array_elements(pil) loop
        cl := btrim(coalesce(r ->> 'client', '')); nm := btrim(coalesce(r ->> 'name', ''));
        if not (cl = 'مشرف' or position('المشرف' in cl) = 1) or nm = '' or seen ? nm then continue; end if;
        seen := seen || jsonb_build_object(nm, 1);
        role := case when position('الوكيل' in cl) > 0 then 'الوكيل' when position('استقبال' in cl) > 0 then 'استقبال فقط' else coalesce(roleof ->> nm, 'مرافق') end;
        sups := sups || jsonb_build_object('name', nm, 'role', role);
      end loop;
      for s in select * from jsonb_array_elements(cur) loop
        nm := btrim(coalesce(s ->> 'name', ''));
        if nm <> '' and coalesce(s ->> 'role', '') = 'الوكيل' and not (seen ? nm) then sups := sups || jsonb_build_object('name', nm, 'role', 'الوكيل'); seen := seen || jsonb_build_object(nm, 1); end if;
      end loop;
      oldj := case when jsonb_array_length(cur) > 0 then _stp_jtxt(cur) else '' end; newj := case when jsonb_array_length(sups) > 0 then _stp_jtxt(sups) else '' end;
      if oldj <> newj then
        traw := jsonb_set(traw, array[ji::text], to_jsonb(newj));
        if si is not null then traw := jsonb_set(traw, array[si::text], to_jsonb(case when jsonb_array_length(sups) > 0 then sups -> 0 ->> 'name' else '' end)); end if;
        if ri is not null then traw := jsonb_set(traw, array[ri::text], to_jsonb(case when jsonb_array_length(sups) > 0 then coalesce(sups -> 0 ->> 'role', 'مرافق') else '' end)); end if;
        perform pg_advisory_xact_lock(hashtextextended('store:put:trips', 0));
        update store_rows set raw = traw where tbl = 'trips' and rid = trid;
        update store_meta set ver = ver + 1, updated_at = now() where tbl = 'trips';
        perform _stp_aud(who, jsonb_build_array(jsonb_build_object('action', 'مزامنة مشرفي الرحلة من الكشف', 'recordId', trip, 'field', 'المشرفون',
          'oldVal', coalesce(nullif((select string_agg((x ->> 'name') || ' (' || coalesce(nullif(x ->> 'role', ''), 'مرافق') || ')', '، ') from jsonb_array_elements(cur) x), ''), '-'),
          'newVal', coalesce(nullif((select string_agg((x ->> 'name') || ' (' || (x ->> 'role') || ')', '، ') from jsonb_array_elements(sups) x), ''), '-'))), 'trips', 'الرحلات');
      end if;
    end if;
  end if;

  -- 3) تنبيهات الجرس (= _pushKashfChangeNotifications_)
  osig := _stp_sigs(oldrows, 'old'); nsig := _stp_sigs(pil, 'new');
  for k in select jsonb_object_keys(nsig) loop
    if not (osig ? k) then perform _stp_notif('new_client', '👤 عميل جديد على رحلة ' || trip || ': ' || k, k, trip, 'accounts.view', who); end if;
  end loop;
  for k in select jsonb_object_keys(nsig) loop
    if not (osig ? k) then continue; end if;
    if not exists (select 1 from store_rows m where m.tbl = 'acc_meta' and _rx_trim(_rx_s(_rx_c(m.raw, 0))) = k and _rx_trim(_rx_s(_rx_c(m.raw, 1))) = trip) then continue; end if;
    if osig -> k = nsig -> k then continue; end if;
    perform _stp_notif('acct_change', '⚠️ تغيّر تسكين/عدد/فندق للعميل ' || k || ' في رحلة ' || trip || ' — راجع كشف حسابه', k, trip, 'accounts.view', who);
  end loop;

  -- 4) تسجيل العملاء الجدد بدليل العملاء (= _clientDirEnsure_)
  if exists (select 1 from store_meta where tbl = 'clients') then
    perform pg_advisory_xact_lock(hashtextextended('store:put:clients', 0));
    select coalesce(jsonb_object_agg(_stp_cnorm(_rx_s(_rx_c(raw, 0))), btrim(_rx_s(_rx_c(raw, 0)))), '{}'::jsonb) into have from store_rows where tbl = 'clients' and btrim(_rx_s(_rx_c(raw, 0))) <> '';
    for r in select * from jsonb_array_elements(pil) loop
      cl := btrim(coalesce(r ->> 'client', ''));
      if cl = '' or cl = 'مشرف' or position('المشرف' in cl) = 1 then continue; end if;
      nk := _stp_cnorm(cl); if nk = '' or todo ? nk then continue; end if;
      todo := todo || jsonb_build_object(nk, cl);
      if have ? nk then if (have ->> nk) <> cl then alias := alias || jsonb_build_object(cl, have ->> nk); end if;
      else
        insert into store_rows (tbl, rid, ord, raw) select 'clients', substr(md5(random()::text || clock_timestamp()::text || cl), 1, 20), coalesce(max(ord), 0) + 1, jsonb_build_array(cl, '', 'سُجّل تلقائياً من كشف معتمرين') from store_rows where tbl = 'clients';
        added := added || cl; have := have || jsonb_build_object(nk, cl);
      end if;
    end loop;
    if array_length(added, 1) > 0 then
      update store_meta set ver = ver + 1, updated_at = now() where tbl = 'clients';
      perform _stp_aud(who, jsonb_build_array(jsonb_build_object('action', 'تسجيل عملاء جدد تلقائياً', 'recordId', array_to_string(added[1:5], '، '), 'field', 'عدد', 'oldVal', '-', 'newVal', array_length(added, 1)::text)), 'pilgrims', 'المعتمرون / الكشف');
      perform _w_dv_bump(array['dropdowns', 'pilgrims']);
    end if;
  end if;
  return jsonb_build_object('clientsAdded', to_jsonb(added), 'clientsAliases', alias); end $$;

-- JSON.stringify مطابق لشكل Apps Script: [{"name":"..","role":".."}] بلا مسافات
create or replace function _stp_jtxt(a jsonb) returns text language sql immutable as
$$ select '[' || coalesce((select string_agg('{"name":' || to_json(x ->> 'name')::text || ',"role":' || to_json(coalesce(x ->> 'role', 'مرافق'))::text || '}', ',' order by o) from jsonb_array_elements(a) with ordinality t(x, o)), '') || ']' $$;

create or replace function rw2_savetrippilgrims(a jsonb, u text) returns jsonb language plpgsql volatile set search_path = public as
$$ declare
  who text := coalesce(u, app_user(), '-'); trip text := _rx_trim(coalesce(a ->> 1, '')); pil jsonb := case when jsonb_typeof(a -> 2) = 'array' then a -> 2 else '[]'::jsonb end;
  ix jsonb := _pm_ix(); ixh jsonb := _rx_map('pilgrims', _rx_h_pil()); i_tr int := (ix ->> 'tripName')::int; i_ps int := (ix ->> 'passport')::int; i_nm int := (ix ->> 'name')::int; i_pid int := (ix ->> 'pid')::int;
  i_rm int := (ix ->> 'roomNo')::int; i_bk int := (ix ->> 'bookingId')::int; i_hm int := (ix ->> 'hotelMadinah')::int; i_hk int := (ix ->> 'hotelMakkah')::int;
  w int := greatest(jsonb_array_length(_rx_hdr('pilgrims')), (select max(v::int) + 1 from jsonb_each_text(ixh) e(k, v)));
  nocl text[]; oldrows jsonb; oldkeys text[]; newkeys text[]; p jsonb; idx int := 0; base_ord bigint; kept jsonb := '{}'::jsonb; rec record; pass text; pid text; nm text; kk text; nt jsonb; jid bigint; fx jsonb; acc jsonb; conf jsonb; chk jsonb; row_ jsonb; n_new int := 0;
begin
  if trip = '' then raise exception 'اسم الرحلة مطلوب' using errcode = 'P0001'; end if;
  select array_agg(btrim(x ->> 'name')) into nocl from jsonb_array_elements(pil) x where btrim(coalesce(x ->> 'name', '')) <> '' and btrim(coalesce(x ->> 'client', '')) = '';
  if nocl is not null then raise exception 'اسم العميل مطلوب لكل معتمر — أكمِل العميل لهؤلاء المعتمرين قبل الحفظ: %', array_to_string(nocl[1:12], '، ') || case when array_length(nocl, 1) > 12 then ' …' else '' end using errcode = 'P0001'; end if;
  perform pg_advisory_xact_lock(hashtextextended('store:put:pilgrims', 0));
  select coalesce(jsonb_agg(raw order by ord, rid), '[]'::jsonb) into oldrows from store_rows where tbl = 'pilgrims' and _rx_trim(_rx_s(_rx_c(raw, i_tr))) = trip;
  -- فحص الحذف (نفس _keyOf_: pid ثم جواز ثم اسم)
  select coalesce(array_agg(distinct coalesce(nullif(_rx_trim(_rx_s(_rx_c(o, i_pid))), ''), nullif(_rx_trim(_rx_s(_rx_c(o, i_ps))), ''), _rx_trim(_rx_s(_rx_c(o, i_nm))))), '{}') into oldkeys from jsonb_array_elements(oldrows) o;
  select coalesce(array_agg(distinct coalesce(nullif(btrim(coalesce(x ->> 'pid', '')), ''), nullif(btrim(coalesce(x ->> 'passport', '')), ''), btrim(coalesce(x ->> 'name', '')))), '{}') into newkeys from jsonb_array_elements(pil) x;
  if exists (select 1 from unnest(oldkeys) ok_ where ok_ <> '' and not (ok_ = any(newkeys))) and not app_has('kashf.delete') then
    raise exception 'لا تملك صلاحية حذف معتمرين من الكشف — يمكنك إضافة/تعديل البيانات، لكن الحذف متاح فقط لصاحب صلاحية DELETE أو admin' using errcode = '42501'; end if;
  -- لقطة الأساس قبل أول تعديل مُلتقَط
  insert into app_outbox (kind, payload) values ('tripsnap', jsonb_build_object('trip', trip, 'user', who, 'action', 'خط الأساس (قبل أول تعديل مُلتقَط)', 'state', _ts_state(trip), 'base', true));
  -- مفاتيح «المتبقين» (رحلات أخرى) لمنع تكرار المحوَّلين لبدون رحلة
  select coalesce(jsonb_object_agg(k, true), '{}'::jsonb) into kept from (
    select 'P:' || _rx_trim(_rx_s(_rx_c(raw, i_ps))) k from store_rows where tbl = 'pilgrims' and _rx_trim(_rx_s(_rx_c(raw, i_tr))) <> trip and _rx_trim(_rx_s(_rx_c(raw, i_ps))) <> ''
    union select 'N:' || _rx_trim(_rx_s(_rx_c(raw, i_nm))) from store_rows where tbl = 'pilgrims' and _rx_trim(_rx_s(_rx_c(raw, i_tr))) <> trip and _rx_trim(_rx_s(_rx_c(raw, i_nm))) <> '') z;
  delete from store_rows where tbl = 'pilgrims' and _rx_trim(_rx_s(_rx_c(raw, i_tr))) = trip;
  select coalesce(max(ord), 0) into base_ord from store_rows where tbl = 'pilgrims';
  for p in select * from jsonb_array_elements(pil) loop
    idx := idx + 1;
    if btrim(coalesce(p ->> 'name', '')) = '' then continue; end if;
    n_new := n_new + 1; base_ord := base_ord + 1;
    row_ := _stp_row(ixh, w, p, idx, trip);
    insert into store_rows (tbl, rid, ord, raw) values ('pilgrims', substr(md5(random()::text || clock_timestamp()::text || idx::text), 1, 20), base_ord, row_);
    if btrim(coalesce(p ->> 'passport', '')) <> '' then kept := kept || jsonb_build_object('P:' || btrim(p ->> 'passport'), true); end if;
    kept := kept || jsonb_build_object('N:' || btrim(p ->> 'name'), true);
  end loop;
  -- المحذوفون من الكشف ⇒ صفوف «بدون رحلة»
  for rec in select o from jsonb_array_elements(oldrows) o loop
    pass := _rx_trim(_rx_s(_rx_c(rec.o, i_ps))); pid := _rx_trim(_rx_s(_rx_c(rec.o, i_pid))); nm := _rx_trim(_rx_s(_rx_c(rec.o, i_nm)));
    if nm = '' then continue; end if;
    kk := coalesce(nullif(pass, ''), nullif(pid, ''), nm);
    if kk = any(newkeys) then continue; end if;
    if (pass <> '' and kept ? ('P:' || pass)) or (pass = '' and kept ? ('N:' || nm)) then continue; end if;
    nt := rec.o;
    nt := jsonb_set(nt, array[i_tr::text], '""'); nt := jsonb_set(nt, array[i_rm::text], '""'); nt := jsonb_set(nt, array[i_bk::text], '""'); nt := jsonb_set(nt, array[i_hm::text], '""'); nt := jsonb_set(nt, array[i_hk::text], '""');
    base_ord := base_ord + 1;
    insert into store_rows (tbl, rid, ord, raw) values ('pilgrims', substr(md5(random()::text || clock_timestamp()::text || nm), 1, 20), base_ord, nt);
    kept := kept || jsonb_build_object(case when pass <> '' then 'P:' || pass else 'N:' || nm end, true);
  end loop;
  update store_meta set ver = ver + 1, updated_at = now() where tbl = 'pilgrims';
  select coalesce(jsonb_agg(jsonb_build_object('name', x ->> 'name', 'passport', coalesce(x ->> 'passport', ''))), '[]'::jsonb) into chk from jsonb_array_elements(pil) x;
  conf := rx_trip_conflicts_raw(to_jsonb(trip), chk);
  fx := _stp_effects(trip, who, oldrows, pil);
  acc := _ae_sync_trip(trip, who);   -- مزامنة حسابات العملاء (برنامج/تأشيرة وباركود) داخل Postgres — محرك 040
  if coalesce((acc ->> 'needsAs')::boolean, false) then   -- عملاء بنمط «بنود» ببنود تلقائية ⇒ محركهم بـApps Script
    insert into app_outbox (kind, payload) values ('kashfsave', jsonb_build_object('trip', trip, 'user', who, 'old', '[]'::jsonb, 'pilgrims', '[]'::jsonb, 'at', extract(epoch from now()))) returning id into jid;
  end if;
  insert into app_outbox (kind, payload) values ('tripsnap', jsonb_build_object('trip', trip, 'user', who, 'action', 'حفظ الكشف', 'state', _ts_state(trip)));
  perform _w_dv_bump(array['pilgrims', 'trips']);
  return jsonb_build_object('success', true, 'count', jsonb_array_length(pil), 'conflicts', coalesce(conf, '[]'::jsonb), 'job', jid, 'accSync', acc, 'clientsAdded', fx -> 'clientsAdded', 'clientsAliases', fx -> 'clientsAliases'); end $$;

revoke all on function _stp_set(jsonb, jsonb, text, jsonb), _stp_row(jsonb, int, jsonb, int, text), rw2_savetrippilgrims(jsonb, text), _stp_aud(text, jsonb, text, text), _stp_notif(text, text, text, text, text, text), _stp_cnorm(text), _stp_sigs(jsonb, text), _stp_effects(text, text, jsonb, jsonb), _stp_jtxt(jsonb) from public, anon, authenticated;
grant execute on function _stp_set(jsonb, jsonb, text, jsonb), _stp_row(jsonb, int, jsonb, int, text), rw2_savetrippilgrims(jsonb, text), _stp_aud(text, jsonb, text, text), _stp_notif(text, text, text, text, text, text), _stp_cnorm(text), _stp_sigs(jsonb, text), _stp_effects(text, text, jsonb, jsonb), _stp_jtxt(jsonb) to service_role;

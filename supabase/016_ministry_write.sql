-- 016_ministry_write.sql — (V4.379) أول دالة كتابة بـPostgres: saveMinistryFile
-- المتصفح ينادي rw_call('saveMinistryFile', [null, data]) بالـJWT نفسه (صلاحيات + اسم المستخدم من الرمز).
-- الدالة تعيد نفس شكل رد saveMinistryFile القديم {success, file, balances?, others?, syncTrips?, lfAfter?}.
-- أي رفض/خطأ بالتحقق يرجع {success:false, error} كالقديم. أي خطأ غير متوقع ⇒ المتصفح يعود لـApps Script تلقائياً (انظر WRPC بـindex_web.html).
-- الآثار الجانبية بصندوق الإخراج app_outbox (يفرّغه Apps Script: سجل التتبع المحصّن + إشعارات الجرس) وسجل التعديلات يُكتب هنا فوراً.
-- لم تُنقل بعد (تبقى على Apps Script بالخلفية): تنبيه حصة الأفراد · مزامنة بنود حسابات العملاء (syncTrips ترجع للواجهة كما كانت).

create table if not exists app_outbox (
  id bigserial primary key,
  kind text not null,                 -- 'audit' | 'notif'
  payload jsonb not null,
  at timestamptz not null default now(),
  done_at timestamptz
);
create index if not exists app_outbox_pending_idx on app_outbox (id) where done_at is null;
alter table app_outbox enable row level security;
revoke all on app_outbox from anon, authenticated;
grant all on app_outbox to service_role;
revoke all on sequence app_outbox_id_seq from anon, authenticated;
grant all on sequence app_outbox_id_seq to service_role;
create sequence if not exists audit_pg_seq start 1;
revoke all on sequence audit_pg_seq from anon, authenticated;
grant all on sequence audit_pg_seq to service_role;

-- ===== مساعدات =====
create or replace function _w_b36(n bigint) returns text language plpgsql immutable as
$$ declare s text := ''; d int; x bigint := n; ch text := '0123456789abcdefghijklmnopqrstuvwxyz'; begin
  if x <= 0 then return '0'; end if;
  while x > 0 loop d := (x % 36)::int; s := substr(ch, d + 1, 1) || s; x := x / 36; end loop;
  return s; end $$;

-- رمز بصمة جديد بنفس صيغة _dvTok_ (ms بالأساس 36 + لاحقة) وأكبر من الحالي
create or replace function _w_dv_bump(groups text[]) returns void language plpgsql volatile set search_path = public as
$$ declare g text; cur text; ms bigint; t text; o jsonb := '{}'::jsonb; begin
  foreach g in array groups loop
    select token into cur from data_versions where group_name = g;
    ms := (extract(epoch from clock_timestamp()) * 1000)::bigint;
    t := _w_b36(ms) || substr(md5(random()::text), 1, 5);
    if cur is not null and t <= cur then t := _w_b36(ms + 1) || substr(md5(random()::text), 1, 5); end if;
    o := o || jsonb_build_object(g, t);
  end loop;
  perform dv_set(o, false);
end $$;

create or replace function _w_stamp() returns text language sql stable as
$$ select to_char(now() at time zone 'Asia/Riyadh', 'DD/MM/YYYY HH24:MI') $$;

create or replace function _w_dkey(s text) returns text language sql immutable as
$$ select lower(regexp_replace(_mf_strt(s), '\s+', '', 'g')) $$;

create or replace function _w_ymd(d text) returns text language sql immutable as
$$ select case when d ~ '^\d\d/\d\d/\d{4}$' then substr(d, 7, 4) || substr(d, 4, 2) || substr(d, 1, 2) else '' end $$;

-- _mfNum_ لخلية jsonb ⇒ رقم (0 عند الفراغ/غير الرقمي)
create or replace function _w_num(c jsonb) returns float8 language sql immutable as
$$ select coalesce(_mf_num(coalesce(c, '""'::jsonb)), 0) $$;

create or replace function _w_str(c jsonb) returns text language sql immutable as
$$ select _mf_str(coalesce(c, '""'::jsonb)) $$;

-- _normalizeArabicName_ تقريبي للمقارنة فقط: ي/ى · ة/ه · همزات الألف · بلا مسافات
create or replace function _w_norm(s text) returns text language sql immutable as
$$ select regexp_replace(translate(lower(coalesce(s, '')), 'ىةأإآ', 'يهااا'), '\s+', '', 'g') $$;

-- _accRoomFeeAt_
create or replace function _w_roomfee_at(d text, cfg jsonb) returns float8 language plpgsql immutable as
$$ declare t date; p jsonb; fm date; tm date; begin
  if d !~ '^\d\d/\d\d/\d{4}$' then return 0; end if;
  t := to_date(d, 'DD/MM/YYYY');
  for p in select * from jsonb_array_elements(coalesce(cfg -> 'roomFeePeriods', '[]'::jsonb)) loop
    if _mf_datet(p ->> 'from') !~ '^\d\d/\d\d/\d{4}$' then continue; end if;
    fm := to_date(_mf_datet(p ->> 'from'), 'DD/MM/YYYY');
    tm := null;
    if _mf_datet(p ->> 'to') ~ '^\d\d/\d\d/\d{4}$' then tm := to_date(_mf_datet(p ->> 'to'), 'DD/MM/YYYY'); end if;
    if t >= fm and (tm is null or t <= tm) then return coalesce(_w_num(p -> 'price'), 0); end if;
  end loop;
  return 0; end $$;

-- كائن الملف ⇒ صف الشيت الحرفي (43 خلية) — مقابل _mfObjToRow_
create or replace function _w_mf_raw(f jsonb) returns jsonb language sql immutable as
$$ select jsonb_build_array(
    f -> 'id', f -> 'seq', f -> 'fileNo', case when (f ->> 'approved') = 'true' then 'نعم' else 'لا' end, f -> 'eInvoice', f -> 'ref',
    f -> 'company', f -> 'agent', f -> 'reviewDate', f -> 'reviewType', f -> 'vipReason', f -> 'travelMode',
    f -> 'clientLabel', coalesce(f -> 'breakdown', '[]'::jsonb)::text, f -> 'tripName', f -> 'goDate', f -> 'retDate',
    f -> 'pilgrims', f -> 'supCount', coalesce(f -> 'sups', '[]'::jsonb)::text,
    f -> 'progPrice', f -> 'ticket', f -> 'roomFee', f -> 'adminFee', f -> 'pct', f -> 'fxRate',
    f -> 'madinahHotel', f -> 'madinahIn', f -> 'madinahOut', f -> 'makkahHotel', f -> 'makkahIn', f -> 'makkahOut',
    f -> 'transport', f -> 'notes', coalesce(f -> 'selected', '[]'::jsonb)::text,
    f -> 'createdBy', f -> 'createdAt', f -> 'updatedBy', f -> 'updatedAt',
    f -> 'fileType', f -> 'extraTrips', coalesce(f -> 'execFeeOverride', '""'::jsonb),
    case when (f ->> 'manualType') = 'true' then 'نعم' else 'لا' end) $$;

-- مفتاح مقارنة حقل لسجل التعديلات
create or replace function _w_cmp(v jsonb) returns text language sql immutable as
$$ select case when v is null or jsonb_typeof(v) = 'null' then '' when jsonb_typeof(v) = 'string' then v #>> '{}' else v::text end $$;

-- ===== saveMinistryFile =====
create or replace function rw2_saveministryfile(a jsonb, u text) returns jsonb language plpgsql volatile set search_path = public as
$$ #variable_conflict use_column
declare
  d jsonb := coalesce(a -> 1, '{}'::jsonb); isnew boolean; did text := _w_str(d -> 'id');
  oldrid text; oldraw jsonb; o jsonb; f jsonb; pol jsonb; cfg jsonb; tdy text := _mf_today(); known jsonb; kn int;
  fk text; dup jsonb; bd jsonb; sups jsonb; pilg float8; x jsonb; ew text; s jsonb; nm text; t text; tn text; et text; oldset text[]; bad text[] := '{}'; hit text[];
  go text; ret text; iss text[] := '{}'; ca text; cb text; c record; ivs jsonb := '[]'::jsonb; iv jsonb;
  agentnm text; has_real boolean; pc float8; anorm text; noSup text[] := array[_w_norm('الوكيل السعودي'), _w_norm('بدون مشرف')];
  rd text; dow int; diff int; rt text; reffee float8; approved boolean; ftype text;
  lbl text; lbls jsonb := jsonb_build_object('fileNo','رقم الملف','approved','الاعتماد','eInvoice','فاتورة إلكترونية','ref','القيد','company','الشركة المصرية','agent','الوكيل السعودي','reviewDate','تاريخ المراجعة','reviewType','نوع المراجعة','vipReason','سبب VIP اليدوي','travelMode','وسيلة السفر','clientLabel','العميل','tripName','الرحلة المرتبطة','goDate','تاريخ الذهاب','retDate','تاريخ العودة','pilgrims','عدد المعتمرين','supCount','عدد المشرفين','progPrice','سعر البرنامج','ticket','سعر التذكرة','roomFee','رسوم الغرفة للفرد','adminFee','رسوم إدارية للفرد','pct','النسبة','fxRate','سعر صرف الريال','madinahHotel','فندق المدينة','madinahIn','دخول المدينة','madinahOut','خروج المدينة','makkahHotel','فندق مكة','makkahIn','دخول مكة','makkahOut','خروج مكة','transport','شركة النقل','notes','ملاحظات','breakdown','بنود العميل','sups','المشرفون','selected','المعتمرون المختارون','fileType','نوع الملف','extraTrips','رحلات إضافية مرتبطة','execFeeOverride','رسوم تنفيذ (تجاوز يدوي)','manualType','تحكم يدوي بالقواعد');
  k text; av text; bv text; rec text; entries jsonb := '[]'::jsonb; feeKeys text[] := array['reviewDate','reviewType','breakdown','sups','pilgrims','roomFee','tripName','extraTrips']; feeChanged boolean := false;
  others jsonb := '[]'::jsonb; oth jsonb; othraw jsonb; othrid text; mv jsonb; hitm boolean; ewm text; ts jsonb := '{}'::jsonb; core jsonb; fout jsonb; nextseq float8; ver_ok boolean; stamp text := _w_stamp(); who text := coalesce(u, app_user(), '-'); tmpid text; n int; oi int;
begin
  isnew := did = '';
  if not app_has(case when isnew then 'ministry.add' else 'ministry.edit' end) then
    raise exception 'لا تملك صلاحية %', case when isnew then 'إضافة مراجعة ملفات الوزارة' else 'تعديل مراجعة ملفات الوزارة' end using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('store:put:mf_files', 0));
  pol := _sx_exec_policy(); cfg := _sx_acc_pricing();

  if not isnew then
    select rid, raw into oldrid, oldraw from store_rows where tbl = 'mf_files' and _mf_str(_rx_c(raw, 0)) = did limit 1;
    if oldrid is null then return jsonb_build_object('success', false, 'error', 'الملف غير موجود'); end if;
    o := _mf_row_obj(oldraw, pol);
  end if;

  -- 🚫 رقم الملف لا يتكرر (عند الإضافة أو تغيير الرقم فقط)
  fk := _w_dkey(d ->> 'fileNo');
  if fk <> '' and (isnew or _w_dkey(o ->> 'fileNo') <> fk) then
    select x.f into dup from _mf_files_raw(pol) x where (isnew or x.f ->> 'id' <> o ->> 'id') and _w_dkey(x.f ->> 'fileNo') = fk limit 1;
    if dup is not null then
      return jsonb_build_object('success', false, 'dupFileNo', true, 'error',
        '🚫 رقم الملف «' || _mf_strt(d ->> 'fileNo') || '» مسجَّل من قبل' || case when _mf_str(dup -> 'company') <> '' then ' لشركة «' || (dup ->> 'company') || '»' else '' end
        || case when _mf_str(dup -> 'clientLabel') <> '' then ' (' || (dup ->> 'clientLabel') || ')' else '' end || ' — لا يجوز تكرار رقم الملف');
    end if;
  end if;

  -- التطبيع
  if jsonb_typeof(d -> 'breakdown') = 'array' then
    select coalesce(jsonb_agg(jsonb_build_object('name', _w_str(b -> 'name'), 'count', _w_num(b -> 'count'), 'sups', _w_num(b -> 'sups'), 'note', _w_str(b -> 'note'), 'isTrip', coalesce((b ->> 'isTrip') = 'true', false))), '[]'::jsonb) into bd from jsonb_array_elements(d -> 'breakdown') b;
  else bd := coalesce(o -> 'breakdown', '[]'::jsonb); end if;
  if jsonb_typeof(d -> 'sups') = 'array' then
    sups := '[]'::jsonb;
    for s in select * from jsonb_array_elements(d -> 'sups') loop
      x := jsonb_build_object('name', _w_str(s -> 'name'), 'type', coalesce(nullif(_w_str(s -> 'type'), ''), 'مرافق'), 'directTo', _w_str(s -> 'directTo'));
      ew := _w_str(s -> 'elsewhere');
      if ew <> '' and (isnew or ew <> o ->> 'id') then x := x || jsonb_build_object('elsewhere', ew); end if;
      sups := sups || jsonb_build_array(x);
    end loop;
  else sups := coalesce(o -> 'sups', '[]'::jsonb); end if;
  pilg := _w_num(d -> 'pilgrims');
  if pilg = 0 and jsonb_array_length(bd) > 0 then select coalesce(sum(_w_num(b -> 'count')), 0) into pilg from jsonb_array_elements(bd) b; end if;

  if isnew then
    select coalesce(max(_w_num(_rx_c(raw, 1))), 0) + 1 into nextseq from store_rows where tbl = 'mf_files';
    did := 'MF' || substr(md5(random()::text || clock_timestamp()::text), 1, 11);
  end if;

  f := jsonb_build_object(
    'id', case when isnew then to_jsonb(did) else o -> 'id' end, 'seq', case when isnew then to_jsonb(nextseq) else o -> 'seq' end,
    'fileNo', _mf_strt(d ->> 'fileNo'), 'approved', coalesce((d ->> 'approved') = 'true', false),
    'eInvoice', _w_str(d -> 'eInvoice'), 'ref', _w_str(d -> 'ref'), 'company', _w_str(d -> 'company'), 'agent', _w_str(d -> 'agent'),
    'reviewDate', _mf_datet(d ->> 'reviewDate'), 'reviewType', coalesce(nullif(_w_str(d -> 'reviewType'), ''), 'عادية'),
    'fileType', case when _w_str(d -> 'fileType') = 'فردي' then 'فردي' else 'مجموعات' end,
    'vipReason', _w_str(d -> 'vipReason'), 'travelMode', coalesce(nullif(_w_str(d -> 'travelMode'), ''), 'طيران'),
    'clientLabel', coalesce(nullif(_w_str(d -> 'clientLabel'), ''), (select string_agg(b ->> 'name', ' + ') from jsonb_array_elements(bd) b)),
    'breakdown', bd, 'tripName', _w_str(d -> 'tripName'), 'extraTrips', _w_str(d -> 'extraTrips'),
    'execFeeOverride', case when _w_str(d -> 'execFeeOverride') in ('نعم', 'لا') then _w_str(d -> 'execFeeOverride') else '' end,
    'manualType', coalesce((d ->> '_manualType') = 'true', false),
    'goDate', _mf_datet(d ->> 'goDate'), 'retDate', _mf_datet(d ->> 'retDate'), 'pilgrims', pilg, 'supCount', 0, 'sups', sups,
    'progPrice', _w_num(d -> 'progPrice'), 'ticket', _w_num(d -> 'ticket'),
    'adminFee', _w_num(d -> 'adminFee'), 'fxRate', _w_num(d -> 'fxRate'),
    'madinahHotel', _w_str(d -> 'madinahHotel'), 'madinahIn', _mf_datet(d ->> 'madinahIn'), 'madinahOut', _mf_datet(d ->> 'madinahOut'),
    'makkahHotel', _w_str(d -> 'makkahHotel'), 'makkahIn', _mf_datet(d ->> 'makkahIn'), 'makkahOut', _mf_datet(d ->> 'makkahOut'),
    'transport', _w_str(d -> 'transport'), 'notes', _w_str(d -> 'notes'),
    'selected', case when jsonb_typeof(d -> 'selected') = 'array' then d -> 'selected' else coalesce(o -> 'selected', '[]'::jsonb) end,
    'createdBy', case when isnew then to_jsonb(who) else o -> 'createdBy' end, 'createdAt', case when isnew then to_jsonb(stamp) else o -> 'createdAt' end,
    'updatedBy', who, 'updatedAt', stamp);
  -- رسوم الغرفة والنسبة الافتراضيتان
  reffee := _w_num(d -> 'roomFee');
  if reffee = 0 then reffee := _w_roomfee_at(coalesce(nullif(f ->> 'reviewDate', ''), tdy), cfg); end if;
  f := f || jsonb_build_object('roomFee', reffee,
    'pct', coalesce(nullif(_w_num(d -> 'pct'), 0), nullif(_w_num(o -> 'pct'), 0),
        round((least(3.0, greatest(2.5, 3.0 - (least(120, greatest(0, pilg)) / 120.0) * 0.5 + (random() - 0.5) * 0.04)))::numeric, 2)::float8));

  -- 🧳 اسم الرحلة يجب أن يكون لرحلة موجودة (الأساسية والإضافية)
  known := _mf_trip_names(); select count(*) into kn from jsonb_object_keys(known);
  if kn > 0 then
    oldset := case when o is null then '{}' else _mf_trips_of(o ->> 'tripName', o ->> 'extraTrips', known) end;
    for t in select unnest(_mf_trips_of(f ->> 'tripName', f ->> 'extraTrips', known)) loop
      if t = any (oldset) or known ? t then continue; end if;
      select array_agg(k) into hit from jsonb_object_keys(known) k where _w_norm(k) = _w_norm(t);
      if coalesce(array_length(hit, 1), 0) = 1 then
        if (f ->> 'tripName') = t then f := f || jsonb_build_object('tripName', hit[1]); end if;
        if _mf_strt(f ->> 'extraTrips') <> '' then
          f := f || jsonb_build_object('extraTrips', (select string_agg(case when _w_norm(z) = _w_norm(t) then hit[1] else z end, E'\n') from (select btrim(zz) z from unnest(regexp_split_to_array(f ->> 'extraTrips', E'[\\n,،]+')) zz) q where z <> ''));
        end if;
      else bad := bad || t; end if;
    end loop;
    if array_length(bad, 1) > 0 then
      return jsonb_build_object('success', false, 'error', '🧳 اسم الرحلة «' || array_to_string(bad, '» و«') || '» غير موجود بالرحلات — اخترها من القائمة (بحث تنبؤي) أو اتركها فارغة');
    end if;
  end if;

  -- 🏙️ إقامة بمدينة واحدة
  declare gD text := f ->> 'goDate'; rD text := f ->> 'retDate'; mdh boolean; mkh boolean; cc text; begin
    if gD <> '' and rD <> '' then
      mdh := (f ->> 'madinahHotel') <> '' or (f ->> 'madinahIn') <> '' or (f ->> 'madinahOut') <> '';
      mkh := (f ->> 'makkahHotel') <> '' or (f ->> 'makkahIn') <> '' or (f ->> 'makkahOut') <> '';
      if mdh <> mkh then
        cc := case when mdh then 'madinah' else 'makkah' end;
        if (f ->> (cc || 'In')) = '' then f := f || jsonb_build_object(cc || 'In', gD); end if;
        if (f ->> (cc || 'Out')) = '' then f := f || jsonb_build_object(cc || 'Out', rD); end if;
      end if;
    end if;
  end;

  -- 📅 فحص التواريخ
  go := _w_ymd(f ->> 'goDate'); ret := _w_ymd(f ->> 'retDate');
  if go <> '' and ret <> '' and ret < go then iss := iss || ('تاريخ العودة (' || (f ->> 'retDate') || ') قبل تاريخ السفر (' || (f ->> 'goDate') || ')'); end if;
  for c in select * from (values ('المدينة', f ->> 'madinahIn', f ->> 'madinahOut'), ('مكة', f ->> 'makkahIn', f ->> 'makkahOut')) v(city, ci, co) loop
    ca := _w_ymd(c.ci); cb := _w_ymd(c.co);
    if ca = '' and cb = '' then continue; end if;
    if ca <> '' and cb = '' then iss := iss || ('أدخل تاريخ الخروج من ' || c.city); continue; end if;
    if cb <> '' and ca = '' then iss := iss || ('أدخل تاريخ الدخول إلى ' || c.city); continue; end if;
    if cb <= ca then iss := iss || ('تاريخ الخروج من ' || c.city || ' (' || c.co || ') يجب أن يكون بعد تاريخ الدخول (' || c.ci || ')'); end if;
    if go <> '' and ca < go then iss := iss || ('دخول ' || c.city || ' (' || c.ci || ') قبل تاريخ السفر (' || (f ->> 'goDate') || ')'); end if;
    if ret <> '' and cb > ret then iss := iss || ('خروج ' || c.city || ' (' || c.co || ') بعد تاريخ العودة (' || (f ->> 'retDate') || ')'); end if;
    if ret <> '' and ca > ret then iss := iss || ('دخول ' || c.city || ' (' || c.ci || ') بعد تاريخ العودة (' || (f ->> 'retDate') || ')'); end if;
    if go <> '' and cb < go then iss := iss || ('خروج ' || c.city || ' (' || c.co || ') قبل تاريخ السفر (' || (f ->> 'goDate') || ')'); end if;
    if cb > ca then ivs := ivs || jsonb_build_array(jsonb_build_array(ca, cb)); end if;
  end loop;
  if jsonb_array_length(ivs) = 2 and (ivs -> 0 ->> 0) < (ivs -> 1 ->> 1) and (ivs -> 1 ->> 0) < (ivs -> 0 ->> 1) then
    iss := iss || 'تعارض بين فترتي السكن: المدينة ومكة متداخلتان — الدخول لإحداهما يجب أن يكون في يوم الخروج من الأخرى أو بعده';
  end if;
  if array_length(iss, 1) > 0 then
    return jsonb_build_object('success', false, 'error', E'📅 صحّح التواريخ قبل الحفظ:\n• ' || array_to_string(iss, E'\n• '), 'dateIssues', to_jsonb(iss));
  end if;

  -- نوع المراجعة التلقائي
  if (d ->> '_manualType') is distinct from 'true' then
    rt := f ->> 'reviewType';
    if rt <> 'تجديد باركود' then
      rd := f ->> 'reviewDate';
      if rd <> '' then
        dow := _mf_dow(rd);
        if dow in (5, 6) then rt := 'VIP';
        else
          diff := ceil((_mf_ms(coalesce(nullif(f ->> 'goDate', ''), 'x')) - _mf_ms(rd)) / 86400000.0);
          if f ->> 'goDate' <> '' and diff is not null and diff <= 2 and diff >= 0 then rt := 'VIP'; end if;
        end if;
      end if;
      if rt <> 'VIP' then rt := 'عادية'; end if;
      f := f || jsonb_build_object('reviewType', rt);
    end if;
  end if;

  -- 🎯 نوع الملف التلقائي
  if (d ->> '_manualFileType') is distinct from 'true' then
    anorm := _w_norm(f ->> 'agent');
    select exists (select 1 from jsonb_array_elements(f -> 'sups') s where _w_str(s -> 'name') <> '' and _w_norm(_w_str(s -> 'name')) <> anorm and _w_norm(_w_str(s -> 'name')) <> all (noSup)) into has_real;
    pc := _w_num(f -> 'pilgrims');
    f := f || jsonb_build_object('fileType', case when not has_real and pc >= 1 and pc <= 9 then 'فردي' else 'مجموعات' end);
  end if;

  -- 🧾 رقم القيد ⇒ معتمد · 🏛️ تاريخ المراجعة لأول مرة ⇒ معتمد
  if _mf_strt(f ->> 'ref') <> '' then f := f || '{"approved": true}'::jsonb; end if;
  if (f ->> 'reviewDate') <> '' and (isnew or _mf_strt(o ->> 'reviewDate') = '') then f := f || '{"approved": true}'::jsonb; end if;

  -- 🧑‍✈️ المشرف المطابق للوكيل ⇒ استقبال
  agentnm := f ->> 'agent';
  if agentnm <> '' then
    f := f || jsonb_build_object('sups', (select coalesce(jsonb_agg(case when _w_str(s -> 'name') = agentnm then s || '{"type":"استقبال"}'::jsonb else s end), '[]'::jsonb) from jsonb_array_elements(f -> 'sups') s));
  end if;
  f := f || jsonb_build_object('supCount', (select count(*) from jsonb_array_elements(f -> 'sups') s where _mf_counted(s)));
  if (f ->> 'transport') = '' then
    f := f || jsonb_build_object('transport', case when agentnm <> '' and exists (select 1 from jsonb_array_elements(f -> 'sups') s where _w_str(s -> 'name') = agentnm) then 'بدون' else f ->> 'agent' end);
  end if;
  -- 🔒 الاعتماد اليدوي يتطلب ministry.approve
  if (d ->> 'approved') = 'true' and _mf_strt(f ->> 'ref') = '' and not (o is not null and (o ->> 'approved') = 'true') and not app_has('ministry.approve') then
    f := f || '{"approved": false}'::jsonb;
  end if;
  -- (autoApproveOnReview يمنح الاعتماد دون صلاحية — أُعيد تطبيقه بعد الحارس كما بالأصل)
  if (f ->> 'reviewDate') <> '' and (isnew or _mf_strt(o ->> 'reviewDate') = '') then f := f || '{"approved": true}'::jsonb; end if;

  f := f || jsonb_build_object('execFee', _mf_exec_eff(f, pol));

  -- ===== الكتابة =====
  if isnew then
    insert into store_rows (tbl, rid, ord, raw)
      select 'mf_files', substr(md5(random()::text || clock_timestamp()::text), 1, 20), coalesce(max(ord), 0) + 1, _w_mf_raw(f) from store_rows where tbl = 'mf_files';
  else
    update store_rows set raw = _w_mf_raw(f) where tbl = 'mf_files' and rid = oldrid;
  end if;

  -- 🧑‍✈️ supMoves: المرافق المشترك بالملفات الأخرى
  for mv in select * from jsonb_array_elements(case when jsonb_typeof(d -> 'supMoves') = 'array' then d -> 'supMoves' else '[]'::jsonb end) loop
    select rid, raw into othrid, othraw from store_rows where tbl = 'mf_files' and _mf_str(_rx_c(raw, 0)) = _w_str(mv -> 'fileId') limit 1;
    if othrid is null or (_w_str(mv -> 'fileId')) = (f ->> 'id') then continue; end if;
    oth := _mf_row_obj(othraw, pol);
    nm := _mf_supkey(jsonb_build_object('name', mv -> 'name'));
    ewm := case when _w_str(mv -> 'elsewhere') = '__SELF__' then f ->> 'id' else _w_str(mv -> 'elsewhere') end;
    if ewm = oth ->> 'id' then ewm := ''; end if;
    hitm := false;
    select coalesce(jsonb_agg(case when _mf_ismur(x) and _mf_supkey(x) = nm and _w_str(x -> 'elsewhere') <> ewm
                                   then (case when ewm <> '' then (x || jsonb_build_object('elsewhere', ewm)) else (x - 'elsewhere') end) else x end), '[]'::jsonb),
           coalesce(bool_or(_mf_ismur(x) and _mf_supkey(x) = nm and _w_str(x -> 'elsewhere') <> ewm), false)
      into sups, hitm from jsonb_array_elements(_mf_arr(oth -> 'sups')) x;
    if not hitm then continue; end if;
    oth := oth || jsonb_build_object('sups', sups, 'supCount', (select count(*) from jsonb_array_elements(sups) s where _mf_counted(s)), 'updatedBy', who, 'updatedAt', stamp);
    update store_rows set raw = _w_mf_raw(oth) where tbl = 'mf_files' and rid = othrid;
    others := others || jsonb_build_array(oth);
    entries := entries || jsonb_build_array(jsonb_build_object('action', 'تعديل ملف مراجعة وزارة', 'recordId', 'MF:' || (oth ->> 'id'), 'field', 'مكان احتساب المرافق', 'oldVal', '-', 'newVal', 'تحديث من ملف ' || coalesce(nullif(f ->> 'fileNo', ''), '#' || (f ->> 'seq'))));
  end loop;

  update store_meta set ver = ver + 1, updated_at = now() where tbl = 'mf_files';
  perform _w_dv_bump(array['ministry', 'trips']);

  -- ===== سجل التعديلات (فرق حقل بحقل) =====
  rec := 'MF:' || (f ->> 'id');
  if isnew then
    entries := jsonb_build_array(jsonb_build_object('action', 'إنشاء ملف مراجعة وزارة', 'recordId', rec, 'field', '-', 'oldVal', '-',
      'newVal', case when (f ->> 'fileNo') <> '' then 'ملف رقم ' || (f ->> 'fileNo') else 'بدون رقم ملف' end || ' — ' || coalesce(f ->> 'clientLabel', '') || ' — ' || (f ->> 'company'))) || entries;
  else
    for k in select jsonb_object_keys(lbls) loop
      av := _w_cmp(o -> k); bv := _w_cmp(f -> k);
      if k = 'approved' then av := case when (o ->> 'approved') = 'true' then 'معتمد' else 'غير معتمد' end; bv := case when (f ->> 'approved') = 'true' then 'معتمد' else 'غير معتمد' end; end if;
      if av = bv then continue; end if;
      entries := entries || jsonb_build_array(jsonb_build_object('action', 'تعديل ملف مراجعة وزارة', 'recordId', rec, 'field', lbls ->> k,
        'oldVal', left(coalesce(nullif(av, ''), '-'), 4000), 'newVal', left(coalesce(nullif(bv, ''), '-'), 4000)));
    end loop;
    if _mf_strt(o ->> 'reviewDate') = '' and (f ->> 'reviewDate') <> '' then
      entries := entries || jsonb_build_array(jsonb_build_object('action', 'سحب رسوم غرفة', 'recordId', rec, 'field', 'رصيد ' || (f ->> 'company'), 'oldVal', '-', 'newVal', 'عند تسجيل تاريخ المراجعة ' || (f ->> 'reviewDate')));
    end if;
  end if;
  insert into app_outbox (kind, payload) select 'audit', jsonb_build_object('user', who, 'action', e ->> 'action', 'record', e ->> 'recordId', 'field', e ->> 'field', 'old', e ->> 'oldVal', 'new', e ->> 'newVal') from jsonb_array_elements(entries) e;
  insert into audit_log (src, rn, ts_str, ts_ms, t_ms, username, action, record_id, field, old_value, new_value, screen, screen_label)
    select 'pg', nextval('audit_pg_seq'), to_char(now() at time zone 'Asia/Riyadh', 'DD/MM/YYYY HH24:MI:SS'), (extract(epoch from now()) * 1000)::bigint, (extract(epoch from now()) * 1000)::bigint,
           who, e ->> 'action', e ->> 'recordId', e ->> 'field', coalesce(e ->> 'oldVal', '-'), coalesce(e ->> 'newVal', '-'), 'ministry', 'ملفات الوزارة' from jsonb_array_elements(entries) e;

  -- 🔔 الجرس
  declare lb text := case when (f ->> 'fileNo') <> '' then 'ملف ' || (f ->> 'fileNo') else 'ملف بدون رقم' end || ' — ' || coalesce(nullif(f ->> 'clientLabel', ''), f ->> 'tripName', '') || ' — ' || (f ->> 'company'); begin
    if isnew and _sx_alert_on('mf_new') then
      insert into app_outbox (kind, payload) values ('notif', jsonb_build_object('type', 'mf_new', 'trip', f ->> 'tripName', 'perm', 'ministry.view', 'user', who,
        'message', '🏛️ تسجيل ملف مراجعة وزارة: ' || lb || case when (f ->> 'goDate') <> '' then ' (سفر ' || (f ->> 'goDate') || ')' else '' end || ' — بواسطة ' || who));
    end if;
    if (f ->> 'reviewDate') <> '' and (isnew or _mf_strt(o ->> 'reviewDate') = '') and _sx_alert_on('mf_reviewed') then
      insert into app_outbox (kind, payload) values ('notif', jsonb_build_object('type', 'mf_reviewed', 'trip', f ->> 'tripName', 'perm', 'ministry.view', 'user', who,
        'message', '✅ تمت مراجعة ' || lb || ' بتاريخ ' || (f ->> 'reviewDate') || ' — بواسطة ' || who));
    end if;
  end;

  -- ===== الرد: الملف بعد الحساب والتنبيهات (من نفس محرك القراءة) =====
  core := _mf_all(pol, cfg, tdy);
  select x into fout from jsonb_array_elements(core -> 'files') x where x ->> 'id' = f ->> 'id' limit 1;
  fout := coalesce(fout, f);
  -- رحلات تؤثر على رسوم الحسابات ⇒ الواجهة تنادي syncTripAccountsBg كما كانت
  if isnew then feeChanged := (f ->> 'reviewDate') <> '';
  else feeChanged := exists (select 1 from unnest(feeKeys) fk2 where _w_cmp(o -> fk2) <> _w_cmp(f -> fk2)); end if;
  if feeChanged or jsonb_array_length(others) > 0 then
    for t in select unnest(coalesce(case when o is null then null else _mf_trips_of(o ->> 'tripName', o ->> 'extraTrips', known) end, '{}') || _mf_trips_of(f ->> 'tripName', f ->> 'extraTrips', known)) loop ts := ts || jsonb_build_object(t, 1); end loop;
    for oth in select * from jsonb_array_elements(others) loop
      for t in select unnest(_mf_trips_of(oth ->> 'tripName', oth ->> 'extraTrips', known)) loop ts := ts || jsonb_build_object(t, 1); end loop;
    end loop;
  end if;
  return jsonb_build_object('success', true, 'file', fout, 'balances', core -> 'balances',
    'others', (select coalesce(jsonb_agg(y), '[]'::jsonb) from jsonb_array_elements(core -> 'files') y where y ->> 'id' in (select z ->> 'id' from jsonb_array_elements(others) z)),
    'syncTrips', (select coalesce(jsonb_agg(k2), '[]'::jsonb) from jsonb_object_keys(ts) k2),
    'lfAfter', jsonb_build_object('fn', 'mfAfterSaveBg', 'args', jsonb_build_array(null, jsonb_build_object('trips', (select coalesce(jsonb_agg(t2), '[]'::jsonb) from unnest(_mf_trips_of(f ->> 'tripName', f ->> 'extraTrips', known)) t2), 'bal', false))));
end $$;

-- ===== موجّه الكتابة (volatile) — rw_<fn>(args, user) =====
create or replace function rw_call(p_fn text, p_args jsonb default '[]'::jsonb) returns jsonb language plpgsql volatile security definer set search_path = public as
$$ declare a jsonb := case when jsonb_typeof(p_args) = 'array' then p_args else '[]'::jsonb end; u text := app_user(); p regprocedure; d jsonb; begin
  if u is null then raise exception 'غير مصرّح' using errcode = '42501'; end if;
  if p_fn !~ '^[A-Za-z]{3,60}$' then raise exception 'دالة غير مدعومة: %', p_fn using errcode = '0A000'; end if;
  p := to_regprocedure('public.rw2_' || lower(p_fn) || '(jsonb,text)');
  if p is null then raise exception 'دالة غير مدعومة: %', p_fn using errcode = '0A000'; end if;
  execute format('select %s($1, $2)', p::regproc::text) into d using a, u;
  return jsonb_build_object('success', true, 'd', d);
end $$;

do $$ declare r record; begin
  for r in select p.oid::regprocedure::text sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and (p.proname like '\_w\_%' or p.proname like 'rw2\_%') loop
    execute format('revoke all on function %s from public, anon, authenticated', r.sig);
    execute format('grant execute on function %s to service_role', r.sig);
  end loop;
end $$;
revoke all on function rw_call(text, jsonb) from public, anon;
grant execute on function rw_call(text, jsonb) to authenticated, service_role;

-- ===== سجل التعديلات: يضم صفوف src='pg' (الكتابات من Postgres) إلى main + hb =====
create or replace function rx_audit_raw(p_f jsonb) returns jsonb language plpgsql stable set search_path = public as
$$ declare
  f jsonb := case when jsonb_typeof(p_f) = 'object' then p_f else '{}'::jsonb end;
  last_row bigint := coalesce((_rx_cfg('audit_meta') ->> 'lastRow')::bigint, 0);
  frid text := _rx_trim(_rx_s(f -> 'recordId')); fusr text := _rx_trim(_rx_s(f -> 'username')); fact text := _rx_trim(_rx_s(f -> 'action'));
  fscr text := _rx_trim(_rx_s(f -> 'screen')); fent text := _rx_trim(_rx_s(f -> 'entity')); ffrom text := _rx_trim(_rx_s(f -> 'fromDate')); fto text := _rx_trim(_rx_s(f -> 'toDate'));
  show_ll boolean := _rx_truthy(f -> 'showLoginLogout');
  max_rows int; start_row bigint; df float8 := null; dt float8 := null; res jsonb; hb_ok boolean := false;
begin
  max_rows := case when frid <> '' or fusr <> '' or fact <> '' or fscr <> '' or fent <> '' or ffrom <> '' or fto <> '' then 6000 else 500 end;
  if _rx_dparse(ffrom) is not null then df := extract(epoch from (_rx_dparse(ffrom))::timestamp at time zone 'UTC') * 1000; end if;
  if _rx_dparse(fto) is not null then dt := extract(epoch from ((_rx_dparse(fto))::timestamp + interval '23 hours 59 minutes 59 seconds') at time zone 'Africa/Cairo') * 1000; end if;
  if last_row < 2 then return '[]'::jsonb; end if;
  start_row := greatest(2, last_row - max_rows + 1);
  hb_ok := (fscr = '' or fscr = 'hotels');
  with m as (
    select t_ms t, 0 src, -rn sq, jsonb_build_object('timestamp', ts_str, 'username', username, 'action', action, 'recordId', record_id, 'field', field, 'oldValue', old_value, 'newValue', new_value, 'screen', screen, 'screenLabel', screen_label) j
      from audit_log
     where src = 'main' and rn >= start_row and rn <= last_row
       and (show_ll or action not in ('تسجيل دخول', 'تسجيل خروج'))
       and (fscr = '' or screen = fscr or (fscr = 'gl*' and screen ~ '^gl'))
       and (frid = '' or position(frid in record_id) > 0) and (fusr = '' or position(fusr in username) > 0) and (fact = '' or position(fact in action) > 0)
       and (fent = '' or position(fent in record_id || ' ' || field || ' ' || old_value || ' ' || new_value) > 0)
       and not (ts_ms is not null and ((df is not null and ts_ms < df) or (dt is not null and ts_ms > dt)))
     order by rn desc limit 500),
  h as (
    select t_ms t, 1 src, rn sq, jsonb_build_object('timestamp', ts_str, 'username', username, 'action', action, 'recordId', record_id, 'field', field, 'oldValue', old_value, 'newValue', new_value, 'screen', screen, 'screenLabel', screen_label) j
      from (select * from audit_log where src = 'hb' and hb_ok order by rn desc limit max_rows) hh
     where (frid = '' or position(frid in record_id) > 0) and (fusr = '' or position(fusr in username) > 0) and (fact = '' or position(fact in action) > 0)
       and (fent = '' or position(fent in record_id || ' ' || field || ' ' || old_value || ' ' || new_value) > 0)
       and not (ts_ms is not null and ((df is not null and ts_ms < df) or (dt is not null and ts_ms > dt)))),
  p as (
    select t_ms t, 2 src, rn sq, jsonb_build_object('timestamp', ts_str, 'username', username, 'action', action, 'recordId', record_id, 'field', field, 'oldValue', old_value, 'newValue', new_value, 'screen', screen, 'screenLabel', screen_label) j
      from (select * from audit_log where src = 'pg' order by rn desc limit max_rows) hh
     where (fscr = '' or screen = fscr) and (frid = '' or position(frid in record_id) > 0) and (fusr = '' or position(fusr in username) > 0) and (fact = '' or position(fact in action) > 0)
       and (fent = '' or position(fent in record_id || ' ' || field || ' ' || old_value || ' ' || new_value) > 0)
       and not (ts_ms is not null and ((df is not null and ts_ms < df) or (dt is not null and ts_ms > dt)))),
  hc as (select (select count(*) from h) + (select count(*) from p) c)
  select case when (select c from hc) > 0
              then (select jsonb_agg(j order by t desc, src, sq) from (select * from (select * from m union all select * from h union all select * from p) u order by t desc, src, sq limit 500) z)
              else (select jsonb_agg(j order by sq) from m) end into res;
  return coalesce(res, '[]'::jsonb);
end $$;
revoke all on function rx_audit_raw(jsonb) from public, anon, authenticated;
grant execute on function rx_audit_raw(jsonb) to service_role;

notify pgrst, 'reload schema';

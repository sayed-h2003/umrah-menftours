-- 003_gl_write.sql — نواة كتابة الحسابات العامة (GL) داخل Postgres (المرحلة 2-ب)
-- تنقل بأمانة: glSaveEntry / glPostEntry / glVoidEntry / glDeleteEntry / _glValidate_ / _glNextEntrySeq_ / _glNextVoucherNo_ (Accounts.gs)
-- كل عملية = معاملة واحدة: القيد + الأسطر + سجل التتبع المحصّن + اللقطة + صندوق الصادر (outbox) + بصمة data_versions.
-- يتطلب 001 و002 (app_user/app_has/gl_can/_gl_cur) والجداول gl_accounts / gl_entries / gl_lines / gl_settings الموجودة.
-- دوال *_raw للخادم فقط (service_role) — الدوال العامة تفحص صلاحية JWT.

-- ============================================================
-- 0) أعمدة/فهارس مساعدة (آمنة للتكرار)
-- ============================================================
create index if not exists gl_entries_seq_idx on gl_entries (seq);
create index if not exists gl_entries_je_num_idx on gl_entries ((case when entry_id ~ '^JE-[0-9]+$' then substr(entry_id, 4)::bigint end));
create index if not exists gl_entries_srckey_idx on gl_entries (source_key) where source_key is not null;
-- مفتاح المصدر التلقائي/رقم السند لا يتكرران (إن وُجد تكرار قديم يُكتفى بتنبيه ولا يفشل التثبيت)
do $$ begin
  create unique index if not exists gl_entries_auto_key_uq on gl_entries (source_key) where source_key like 'AUTO:%';
exception when others then raise notice 'gl_entries_auto_key_uq لم يُنشأ (تكرار قديم): %', sqlerrm; end $$;
do $$ begin
  create unique index if not exists gl_entries_vch_key_uq on gl_entries (source_key) where source_key like 'VCH:%';
exception when others then raise notice 'gl_entries_vch_key_uq لم يُنشأ (تكرار قديم): %', sqlerrm; end $$;
do $$ begin
  create unique index if not exists gl_entries_seq_uq on gl_entries (seq) where seq is not null;
exception when others then raise notice 'gl_entries_seq_uq لم يُنشأ (تكرار قديم — راجع _glDupIdGroups_): %', sqlerrm; end $$;

-- ============================================================
-- 1) جداول التتبع والصادر (append-only حيث يلزم)
-- ============================================================
create sequence if not exists gl_entry_seq;        -- JE-%06d — لا يُعاد استخدام رقم أبداً (حتى لو تراجعت المعاملة/حُذف القيد)
create sequence if not exists gl_vch_rec_seq;      -- REC-00001
create sequence if not exists gl_vch_pay_seq;      -- PAY-00001
create sequence if not exists gl_audit_id_seq;

-- سجل تتبع محصّن: سلسلة هاش (prev_hash → hash) تُكتب في نفس المعاملة، فشلها = فشل الحفظ (fail-closed، نظير _audGate_)
create table if not exists gl_audit (
  id bigint primary key,
  at timestamptz not null,
  username text,
  action text not null,
  entry_id text,
  detail jsonb,
  prev_hash text not null,
  hash text not null
);
create index if not exists gl_audit_entry_idx on gl_audit (entry_id, id);

-- لقطة صف القيد (رأس + أسطر) قبل التعديل/الإلغاء/الحذف (نظير _snapEntryTake_)
create table if not exists gl_entry_snapshots (
  sid bigint generated always as identity primary key,
  at timestamptz not null default now(),
  username text,
  action text not null,
  entry_id text not null,
  header jsonb,
  lines jsonb
);
create index if not exists gl_entry_snapshots_entry_idx on gl_entry_snapshots (entry_id, sid);

-- صندوق الصادر: آثار جانبية يستهلكها Apps Script/Edge لاحقاً (تليجرام، مرايا CP/AP/HB، إعادة بناء AUTO، بصمات الكاش)
create table if not exists gl_outbox (
  id bigint generated always as identity primary key,
  kind text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  done_at timestamptz,
  attempts int not null default 0,
  last_error text
);
create index if not exists gl_outbox_pending_idx on gl_outbox (id) where done_at is null;

create or replace function _glw_append_only() returns trigger language plpgsql as
$$ begin raise exception 'الجدول % للإلحاق فقط — لا تعديل ولا حذف', tg_table_name using errcode = '42501'; end $$;
drop trigger if exists gl_audit_ro on gl_audit;
create trigger gl_audit_ro before update or delete on gl_audit for each row execute function _glw_append_only();
drop trigger if exists gl_audit_ro_t on gl_audit;
create trigger gl_audit_ro_t before truncate on gl_audit for each statement execute function _glw_append_only();
drop trigger if exists gl_snap_ro on gl_entry_snapshots;
create trigger gl_snap_ro before update or delete on gl_entry_snapshots for each row execute function _glw_append_only();
drop trigger if exists gl_snap_ro_t on gl_entry_snapshots;
create trigger gl_snap_ro_t before truncate on gl_entry_snapshots for each statement execute function _glw_append_only();

alter table gl_audit enable row level security;
alter table gl_entry_snapshots enable row level security;
alter table gl_outbox enable row level security;
revoke all on gl_audit, gl_entry_snapshots, gl_outbox from anon, authenticated;
revoke all on sequence gl_entry_seq, gl_vch_rec_seq, gl_vch_pay_seq, gl_audit_id_seq from anon, authenticated;

-- ============================================================
-- 2) أدوات صغيرة (تطابق _glStr_/_glNum_/_glR2_/_glCur_/_glDate_/_glDKey_)
-- ============================================================
drop type if exists _glw_vline cascade;
create type _glw_vline as (acc text, d float8, c float8, cur text, rate float8, bd float8, bc float8,
                           trip text, company text, client text, agent text, descr text);

-- _glStr_ : نص مشذَّب ('' للفارغ)
create or replace function _glw_str(j jsonb) returns text language sql immutable as
$$ select case when j is null or jsonb_typeof(j) = 'null' then ''
               else regexp_replace(j #>> '{}', '^\s+|\s+$', '', 'g') end $$;

-- _glNum_ : parseFloat بعد حذف الفواصل والمسافات وتحويل الأرقام العربية؛ غير الرقمي ⇒ 0
create or replace function _glw_num(j jsonb) returns float8 language plpgsql immutable as
$$ declare t text; m text; begin
  if j is null then return 0; end if;
  if jsonb_typeof(j) = 'number' then return (j #>> '{}')::float8; end if;
  if jsonb_typeof(j) <> 'string' then return 0; end if;
  t := translate(regexp_replace(j #>> '{}', '[,٬\s]', '', 'g'), '٠١٢٣٤٥٦٧٨٩', '0123456789');
  m := substring(t from '^[+-]?(?:[0-9]+\.?[0-9]*|\.[0-9]+)(?:[eE][+-]?[0-9]+)?');
  return coalesce(m::float8, 0);
end $$;

-- _glR2_ : Math.round(x*100)/100 بنفس سلوك JS (float8 لا numeric — لتطابق الأعشار تماماً)
create or replace function _glw_r2(x float8) returns float8 language sql immutable as
$$ select floor(coalesce(x, 0) * 100 + 0.5) / 100 $$;

-- نص رقم كما يطبعه JS للقيم المقرّبة لخانتين (للرسائل)
create or replace function _glw_n(x float8) returns text language sql immutable as
$$ select trim_scale(round(x::numeric, 2))::text $$;

-- _glCur_ : EGP/SAR/USD + مرادفات عربية، وإلا EGP
create or replace function _glw_cur(c text) returns text language sql immutable as
$$ select case upper(btrim(coalesce(c, ''))) when 'SAR' then 'SAR' when 'USD' then 'USD' when 'EGP' then 'EGP'
              when 'ريال' then 'SAR' when 'دولار' then 'USD' else 'EGP' end $$;

-- _glDate_ : dd/mm/yyyy · yyyy-mm-dd · d/m/yy (يقبل أرقاماً عربية) — يعيد date أو null (تاريخ غير صالح يُرفض بدل أن يُخزَّن نصاً)
create or replace function _glw_parse_date(t text) returns date language plpgsql immutable as
$$ declare s text; m text[]; begin
  s := translate(btrim(coalesce(t, '')), '٠١٢٣٤٥٦٧٨٩', '0123456789');
  m := regexp_match(s, '^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$');
  if m is not null then return make_date(m[3]::int, m[2]::int, m[1]::int); end if;
  m := regexp_match(s, '^(\d{4})[/\-.](\d{1,2})[/\-.](\d{1,2})');
  if m is not null then return make_date(m[1]::int, m[2]::int, m[3]::int); end if;
  m := regexp_match(s, '^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2})$');
  if m is not null then return make_date(2000 + m[3]::int, m[2]::int, m[1]::int); end if;
  return null;
exception when others then return null; end $$;

create or replace function _glw_fmt_date(d date) returns text language sql immutable as
$$ select to_char(d, 'DD/MM/YYYY') $$;

-- إعدادات GL (gl_settings: key,value) مع افتراضيات _glSettings_
create or replace function _glw_setting(k text) returns text language plpgsql stable as
$$ declare v text; begin
  select s.value into v from gl_settings s where s.key = k;
  if found then return regexp_replace(coalesce(v, ''), '^\s+|\s+$', '', 'g'); end if;
  return case k when 'startDate' then '01/07/2026' when 'rate_SAR' then '13.3' when 'rate_USD' then '50' when 'baseCurrency' then 'EGP' else '' end;
end $$;

-- _glLocked_ : تاريخ ≤ lockDate
create or replace function _glw_locked(d date) returns boolean language plpgsql stable as
$$ declare lk date; begin
  lk := _glw_parse_date(_glw_setting('lockDate'));
  return lk is not null and d is not null and d <= lk;
end $$;

-- _glFxBridgeAcc_ : حساب وسيط التحويل (إعداد fx_bridge_acc إن كان ورقياً، وإلا أول حساب kind='fx' ورقي نشط بترتيب الكود)
create or replace function _glw_fx_bridge_acc() returns text language plpgsql stable as
$$ declare s text; r text; begin
  s := _glw_setting('fx_bridge_acc');
  if s <> '' and exists (select 1 from gl_accounts a where a.code = s and not coalesce(a.is_group, false)) then return s; end if;
  select a.code into r from gl_accounts a
   where a.category = 'fx' and not coalesce(a.is_group, false) and coalesce(a.active, true)
   order by a.code collate "C" limit 1;
  return coalesce(r, '');
end $$;

create or replace function _glw_truthy(j jsonb) returns boolean language sql immutable as
$$ select case jsonb_typeof(j) when 'boolean' then (j #>> '{}')::boolean when 'number' then (j #>> '{}')::float8 <> 0
                when 'string' then (j #>> '{}') <> '' else false end $$;

create or replace function _glw_pad(n bigint, w int) returns text language sql immutable as
$$ select case when length(n::text) >= w then n::text else lpad(n::text, w, '0') end $$;

-- GL_TYPE_SUB_
create or replace function _glw_sub_of_type(t text) returns text language sql immutable as
$$ select case btrim(coalesce(t, '')) when 'سند قبض' then 'safe' when 'سند صرف' then 'safe' when 'تحويل نقدية' then 'safe'
   when 'إيداع بنكي' then 'bank' when 'سحب بنكي' then 'bank' when 'صرف عهدة' then 'cust' when 'تسوية عهدة' then 'cust'
   when 'تحويل بين طرفين' then 'pt' when 'تحويل عملة' then 'fx' else 'je' end $$;

-- ============================================================
-- 3) _glHasSub_ بصلاحيات JWT (view/add/edit/delete) — يكمل gl_can(sub) في 002 الخاصة بالعرض
-- ============================================================
create or replace function gl_can_cap(sub text, cap text) returns boolean language sql stable as
$$ select app_has('admin') or (
     case when coalesce(sub, '') = '' or not exists (select 1 from jsonb_array_elements_text(coalesce(auth.jwt() -> 'perms', '[]'::jsonb)) p where p ~* '^gl_[a-z]+\.')
          then app_has('gl.' || cap)
          else app_has('gl.view') and app_has('gl_' || sub || '.' || cap) end) $$;

-- _glCanEditAuto_ : مدير أو gl.approve أو gl_auto.edit
create or replace function _glw_can_edit_auto() returns boolean language sql stable as
$$ select app_has('admin') or app_has('gl.approve') or gl_can_cap('auto', 'edit') $$;

-- ============================================================
-- 4) الترقيم: JE-%06d من SEQUENCE ≥ أكبر رقم فعلي · REC-/PAY-%05d (لا يُعاد استخدام أي رقم)
-- ============================================================
-- يُرفع التسلسل عند التثبيت إلى max(العدّاد القديم seq_entry, أكبر seq، أكبر JE-) — لا ينقص أبداً عند إعادة التشغيل
do $$
declare mx bigint; cur bigint; called boolean; setv bigint;
begin
  select greatest(coalesce(max(seq), 0), coalesce(max(case when entry_id ~ '^JE-[0-9]+$' then substr(entry_id, 4)::bigint end), 0)) into mx from gl_entries;
  begin setv := coalesce(nullif(regexp_replace(coalesce((select value from gl_settings where key = 'seq_entry'), ''), '[^0-9]', '', 'g'), '')::bigint, 0);
  exception when others then setv := 0; end;
  select last_value, is_called into cur, called from gl_entry_seq;
  mx := greatest(mx, setv, case when called then cur else 0 end);
  if mx >= 1 then perform setval('gl_entry_seq', mx, true); end if;

  -- عدّادا السندات: أكبر رقم في مفتاح المصدر VCH:REC-n / المرجع REC-n / إعداد seq_REC
  select coalesce(max(m[1]::bigint), 0) into mx from (
     select regexp_match(source_key, '^VCH:REC-([0-9]+)$') m from gl_entries
     union all select regexp_match(reference, '^REC-([0-9]+)$') from gl_entries) x where m is not null;
  begin setv := coalesce(nullif(regexp_replace(coalesce((select value from gl_settings where key = 'seq_REC'), ''), '[^0-9]', '', 'g'), '')::bigint, 0);
  exception when others then setv := 0; end;
  select last_value, is_called into cur, called from gl_vch_rec_seq;
  mx := greatest(mx, setv, case when called then cur else 0 end);
  if mx >= 1 then perform setval('gl_vch_rec_seq', mx, true); end if;

  select coalesce(max(m[1]::bigint), 0) into mx from (
     select regexp_match(source_key, '^VCH:PAY-([0-9]+)$') m from gl_entries
     union all select regexp_match(reference, '^PAY-([0-9]+)$') from gl_entries) x where m is not null;
  begin setv := coalesce(nullif(regexp_replace(coalesce((select value from gl_settings where key = 'seq_PAY'), ''), '[^0-9]', '', 'g'), '')::bigint, 0);
  exception when others then setv := 0; end;
  select last_value, is_called into cur, called from gl_vch_pay_seq;
  mx := greatest(mx, setv, case when called then cur else 0 end);
  if mx >= 1 then perform setval('gl_vch_pay_seq', mx, true); end if;
end $$;

-- _glNextEntrySeq_(1): المسار السريع بلا قفل (nextval ذرّي). إن كان الرقم ≤ أكبر رقم موجود فعلاً
-- (قيد أُدخل من خارج Postgres مثلاً) ⇒ مسار بطيء تحت قفل 'seq' يرفع التسلسل ثم يعيد المحاولة.
create or replace function _glw_next_entry_seq() returns bigint language plpgsql as
$$ declare s bigint; mx bigint; i int := 0; begin
  s := nextval('gl_entry_seq');
  loop
    select greatest(coalesce(max(seq), 0), coalesce(max(case when entry_id ~ '^JE-[0-9]+$' then substr(entry_id, 4)::bigint end), 0)) into mx from gl_entries;
    exit when s > mx;
    i := i + 1; if i > 5 then raise exception 'تعذّر حجز رقم قيد جديد' using errcode = 'GL500'; end if;
    perform pg_advisory_xact_lock(hashtextextended('gl:seq:entry', 0));
    perform setval('gl_entry_seq', greatest(mx, (select last_value from gl_entry_seq)), true);
    s := nextval('gl_entry_seq');
  end loop;
  return s;
end $$;

-- _glNextVoucherNo_(type) : REC-00001 / PAY-00001 — يتخطى أي رقم مأخوذ فعلاً بمفتاح VCH:
create or replace function _glw_next_voucher(typ text) returns text language plpgsql as
$$ declare pre text; s bigint; no text; i int := 0; begin
  pre := case typ when 'سند قبض' then 'REC-' when 'سند صرف' then 'PAY-' else null end;
  if pre is null then return ''; end if;
  loop
    s := case pre when 'REC-' then nextval('gl_vch_rec_seq') else nextval('gl_vch_pay_seq') end;
    no := pre || _glw_pad(s, 5);
    exit when not exists (select 1 from gl_entries where source_key = 'VCH:' || no);
    i := i + 1; if i > 1000 then raise exception 'تعذّر حجز رقم سند' using errcode = 'GL500'; end if;
  end loop;
  return no;
end $$;

-- ============================================================
-- 5) التتبع المحصّن + اللقطات + الصادر + بصمات المجموعات
-- ============================================================
create or replace function _glw_audit(p_user text, p_action text, p_entry text, p_detail jsonb) returns bigint language plpgsql as
$$ declare prev text; nid bigint; t timestamptz := clock_timestamp(); h text; begin
  perform pg_advisory_xact_lock(hashtextextended('gl:audit', 0));      -- يسلسل الكتابة ليبقى ترتيب السلسلة = ترتيب الإيداع
  select a.hash into prev from gl_audit a order by a.id desc limit 1;
  prev := coalesce(prev, 'GENESIS');
  nid := nextval('gl_audit_id_seq');
  h := encode(sha256(convert_to(prev || '|' || nid || '|' || to_char(t at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US') || '|' || coalesce(p_user, '') || '|' ||
        p_action || '|' || coalesce(p_entry, '') || '|' || coalesce(p_detail::text, ''), 'UTF8')), 'hex');
  insert into gl_audit (id, at, username, action, entry_id, detail, prev_hash, hash) values (nid, t, p_user, p_action, p_entry, p_detail, prev, h);
  return nid;
end $$;

create or replace function gl_audit_verify_raw() returns table (ok boolean, checked bigint, bad_id bigint) language plpgsql stable security definer set search_path = public, pg_temp as
$$ declare r record; prev text := 'GENESIS'; n bigint := 0; h text; begin
  for r in select * from gl_audit order by id loop
    h := encode(sha256(convert_to(prev || '|' || r.id || '|' || to_char(r.at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US') || '|' || coalesce(r.username, '') || '|' ||
          r.action || '|' || coalesce(r.entry_id, '') || '|' || coalesce(r.detail::text, ''), 'UTF8')), 'hex');
    if r.prev_hash <> prev or r.hash <> h then return query select false, n, r.id; return; end if;
    prev := r.hash; n := n + 1;
  end loop;
  return query select true, n, null::bigint;
end $$;

-- صورة القيد (رأس + أسطر) كـ jsonb
create or replace function _glw_entry_json(p_id text) returns jsonb language sql stable as
$$ select case when e.entry_id is null then null else jsonb_build_object('header', to_jsonb(e),
        'lines', coalesce((select jsonb_agg(to_jsonb(l) order by l.line_no) from gl_lines l where l.entry_id = e.entry_id), '[]'::jsonb)) end
     from (select 1) x left join gl_entries e on e.entry_id = p_id $$;

create or replace function _glw_snap(p_id text, p_action text, p_user text) returns bigint language plpgsql as
$$ declare j jsonb; sid bigint; begin
  j := _glw_entry_json(p_id);
  if j is null then return null; end if;
  insert into gl_entry_snapshots (username, action, entry_id, header, lines) values (p_user, p_action, p_id, j -> 'header', j -> 'lines') returning gl_entry_snapshots.sid into sid;
  return sid;
end $$;

create or replace function _glw_outbox(p_kind text, p_payload jsonb) returns void language sql as
$$ insert into gl_outbox (kind, payload) values (p_kind, coalesce(p_payload, '{}'::jsonb)) $$;

create or replace function _glw_b36(n bigint) returns text language plpgsql immutable as
$$ declare s text := ''; d int; chars text := '0123456789abcdefghijklmnopqrstuvwxyz'; begin
  if n <= 0 then return '0'; end if;
  while n > 0 loop d := (n % 36)::int; s := substr(chars, d + 1, 1) || s; n := n / 36; end loop;
  return s;
end $$;

-- _dvBump_ : بصمة جديدة للمجموعة (تُقرأ من data_versions في الواجهة)
create or replace function _glw_dv_bump(groups text[]) returns void language plpgsql as
$$ declare g text; tok text; begin
  foreach g in array groups loop
    tok := _glw_b36((extract(epoch from clock_timestamp()) * 1000)::bigint) || substr(md5(random()::text || clock_timestamp()::text), 1, 5);
    insert into data_versions (group_name, token, updated_at) values (g, tok, now())
    on conflict (group_name) do update set token = excluded.token, updated_at = now();
  end loop;
end $$;

-- _glEntryVer_ : بصمة إصدار القيد (رأس + أسطر) للتزامن المتفائل
create or replace function gl_entry_ver_raw(p_id text) returns text language sql stable as
$$ select substr(md5(
     coalesce((select jsonb_build_array(e.entry_id, e.seq, e.entry_date, e.entry_type, e.description, e.status, e.source_key, e.batch_no, e.total_base, e.reference,
                      e.trip_name, e.executing_company, e.created_by, e.created_at, e.posted_by, e.posted_at, e.updated_by, e.updated_at, e.void_reason)::text
                 from gl_entries e where e.entry_id = p_id), '')
     || '#' ||
     coalesce((select jsonb_agg(jsonb_build_array(l.line_no, l.line_date, l.status, l.account_code, l.debit, l.credit, l.currency, l.fx_rate, l.debit_base, l.credit_base,
                      l.trip_name, l.executing_company, l.client_name, l.agent, l.description) order by l.line_no)::text
                 from gl_lines l where l.entry_id = p_id), '')), 1, 16) $$;

-- _glLineDelta_ : دلتا الأرصدة (المرحّل فقط) = Σ(after) − Σ(before) لكل حساب
create or replace function _glw_delta(p_before jsonb, p_after jsonb) returns jsonb language sql immutable as
$$ select coalesce(jsonb_object_agg(account_code, jsonb_build_object('EGP', egp, 'SAR', sar, 'USD', usd, 'base', base)), '{}'::jsonb)
     from (select account_code,
                  round(sum(case when cur = 'EGP' then sg * (d - c) else 0 end), 2) egp,
                  round(sum(case when cur = 'SAR' then sg * (d - c) else 0 end), 2) sar,
                  round(sum(case when cur = 'USD' then sg * (d - c) else 0 end), 2) usd,
                  round(sum(sg * (bd - bc)), 2) base
             from (select x ->> 'account_code' account_code, _gl_cur(x ->> 'currency') cur, -1 sg,
                          coalesce((x ->> 'debit')::numeric, 0) d, coalesce((x ->> 'credit')::numeric, 0) c,
                          coalesce((x ->> 'debit_base')::numeric, 0) bd, coalesce((x ->> 'credit_base')::numeric, 0) bc
                     from jsonb_array_elements(coalesce(p_before, '[]'::jsonb)) x where x ->> 'status' = 'مرحّل' and coalesce(x ->> 'account_code', '') <> ''
                   union all
                   select x ->> 'account_code', _gl_cur(x ->> 'currency'), 1,
                          coalesce((x ->> 'debit')::numeric, 0), coalesce((x ->> 'credit')::numeric, 0),
                          coalesce((x ->> 'debit_base')::numeric, 0), coalesce((x ->> 'credit_base')::numeric, 0)
                     from jsonb_array_elements(coalesce(p_after, '[]'::jsonb)) x where x ->> 'status' = 'مرحّل' and coalesce(x ->> 'account_code', '') <> '') u
            group by account_code) g $$;

-- معلومات قيد لتنبيه تليجرام (_glBotEntryInfo_) — يصاغ النص نفسه عند المستهلك
create or replace function _glw_bot_info(p_id text, p_user text, p_extra jsonb default '{}'::jsonb) returns jsonb language sql stable as
$$ select jsonb_build_object('id', e.entry_id, 'vno', coalesce(substring(e.source_key from '^VCH:(.+)$'), ''), 'type', e.entry_type, 'date', _glw_fmt_date(e.entry_date),
          'desc', coalesce(e.description, ''), 'base', e.total_base, 'trip', coalesce(e.trip_name, ''), 'st', e.status,
          'at', coalesce(e.updated_at, e.posted_at, e.created_at), 'by', p_user,
          'parties', coalesce((select jsonb_agg(n) from (select distinct on (n) n from (select coalesce(a.link, a.name, l.account_code) n, l.line_no
                         from gl_lines l left join gl_accounts a on a.code = l.account_code where l.entry_id = e.entry_id and coalesce(a.category, '') <> 'fx' order by l.line_no) q order by n, line_no limit 4) z), '[]'::jsonb),
          'ls', coalesce((select jsonb_agg(jsonb_build_array(case when l.debit > 0 then 'م' else 'د' end, coalesce(a.link, a.name, l.account_code),
                          case when l.debit > 0 then l.debit else l.credit end, l.currency, coalesce(l.description, ''), coalesce(l.trip_name, l.client_name, l.agent, ''),
                          case when l.currency <> 'EGP' then l.fx_rate end) order by l.line_no)
                          from gl_lines l left join gl_accounts a on a.code = l.account_code where l.entry_id = e.entry_id and (coalesce(l.debit,0) > 0 or coalesce(l.credit,0) > 0)), '[]'::jsonb)) || p_extra
     from gl_entries e where e.entry_id = p_id $$;

-- ============================================================
-- 6) _glValidate_ — تطبيع وفحص القيد (Accounts.gs:1497-1570). يعيد {date,type,totalBase,lines[]} أو يرفع خطأً بنفس رسائل JS
--    opts: allowSystem · allowBeforeStart · ignoreLock · noBridge (للخادم الموثوق فقط)
-- ============================================================
create or replace function _glw_validate(e jsonb, opts jsonb default '{}'::jsonb) returns jsonb
language plpgsql stable set search_path = public, pg_temp as
$f$
declare
  v_date date; v_type text; v_start date; v_start_txt text;
  lines _glw_vline[] := array[]::_glw_vline[];
  ln _glw_vline; a gl_accounts%rowtype; fa boolean;
  r record; i int; n int;
  v_code text; d float8; c float8; cur text; rate0 float8; rate float8; brate float8; cx int;
  dB float8 := 0; cB float8 := 0; fxTol float8 := 0;
  dC float8[] := array[0,0,0]; cC float8[] := array[0,0,0]; used boolean[] := array[false,false,false];
  nused int; single boolean; kcur text; diffB float8; brX text; willBridge boolean; bigIdx int; bigSum float8;
  net float8[] := array[0,0,0]; bnet float8[] := array[0,0,0];
  rsar float8; rusd float8; nn float8; bb float8; curs text[] := array['EGP','SAR','USD'];
  allowSystem boolean := coalesce(_glw_truthy(opts -> 'allowSystem'), false);
  allowBefore boolean := coalesce(_glw_truthy(opts -> 'allowBeforeStart'), false);
  ignoreLock boolean := coalesce(_glw_truthy(opts -> 'ignoreLock'), false);
  noBridge boolean := coalesce(_glw_truthy(opts -> 'noBridge'), false);
  etypes text[] := array['قيد يومية','سند قبض','سند صرف','إيداع بنكي','سحب بنكي','صرف عهدة','تسوية عهدة','تحويل نقدية','تحويل عملة','تحويل بين طرفين','قيد افتتاحي','قيد مستورد','قيد تلقائي','قيد إقفال'];
  desc_t text; src _glw_vline; ja jsonb := '[]'::jsonb;
  hasBr boolean;
begin
  v_date := _glw_parse_date(_glw_str(e -> 'date'));
  if v_date is null then raise exception 'تاريخ القيد مطلوب (dd/mm/yyyy)'; end if;
  v_type := case when (e ->> 'type') = any (etypes) then e ->> 'type' else 'قيد يومية' end;
  if not allowSystem and v_type in ('قيد تلقائي', 'قيد إقفال') then v_type := 'قيد يومية'; end if;
  -- 🔒 الفترات المقفلة (Accounts.gs:1504)
  if not ignoreLock and _glw_locked(v_date) then
    raise exception 'الفترة مقفلة حتى % — لا يمكن تسجيل أو تعديل قيد بتاريخ %', _glw_setting('lockDate'), _glw_fmt_date(v_date);
  end if;
  -- قبل بداية الحسابات (Accounts.gs:1506)
  v_start_txt := _glw_setting('startDate'); v_start := _glw_parse_date(v_start_txt);
  if not allowBefore and v_type <> 'قيد افتتاحي' and v_type <> 'قيد مستورد' and v_start is not null and v_date < v_start then
    raise exception 'تاريخ القيد قبل تاريخ بداية الحسابات (%) — استخدم الأرصدة الافتتاحية أو الاستيراد المجمّع للبيانات القديمة', v_start_txt;
  end if;
  rsar := coalesce(nullif(_glw_num(to_jsonb(_glw_setting('rate_SAR'))), 0), 13.3);
  rusd := coalesce(nullif(_glw_num(to_jsonb(_glw_setting('rate_USD'))), 0), 50);

  for r in select ord, val from jsonb_array_elements(coalesce(case when jsonb_typeof(e -> 'lines') = 'array' then e -> 'lines' end, '[]'::jsonb)) with ordinality as t(val, ord) loop
    i := r.ord;
    v_code := _glw_str(r.val -> 'account'); d := _glw_r2(_glw_num(r.val -> 'debit')); c := _glw_r2(_glw_num(r.val -> 'credit'));
    continue when v_code = '' and d = 0 and c = 0;                         -- سطر فارغ
    select * into a from gl_accounts g where g.code = v_code; fa := found;
    if not fa then raise exception 'السطر %: الحساب غير موجود (%)', i, v_code; end if;
    if coalesce(a.is_group, false) then raise exception 'السطر %: «%» حساب تجميعي — اختر حساباً فرعياً', i, a.name; end if;
    if not coalesce(a.active, true) then raise exception 'السطر %: الحساب «%» موقوف', i, a.name; end if;
    if d < 0 or c < 0 then raise exception 'السطر %: المبالغ لا تكون سالبة', i; end if;
    if (d <> 0 and c <> 0) or (d = 0 and c = 0) then raise exception 'السطر %: أدخل مديناً أو دائناً (واحداً فقط)', i; end if;
    cur := _glw_cur(coalesce(nullif(_glw_str(r.val -> 'currency'), ''), nullif(btrim(coalesce(a.currency, '')), ''), 'EGP'));
    if coalesce(btrim(a.currency), '') <> '' and btrim(a.currency) <> cur then raise exception 'السطر %: عملة الحساب «%» هي %', i, a.name, btrim(a.currency); end if;
    rate0 := case when cur = 'EGP' then 1 else coalesce(nullif(_glw_num(r.val -> 'rate'), 0), case cur when 'SAR' then rsar else rusd end) end;
    if not (rate0 > 0) then raise exception 'السطر %: سعر الصرف مطلوب', i; end if;
    -- 💱 سعر الصرف بخانتين (إلا exact = معادل دقيق لأسطر نقل الأرصدة)
    rate := case when cur = 'EGP' then 1 else coalesce(nullif(floor(rate0 * 100 + 0.5) / 100, 0), rate0) end;
    brate := case when _glw_truthy(r.val -> 'exact') then rate0 else rate end;
    if cur <> 'EGP' and not _glw_truthy(r.val -> 'exact') then fxTol := fxTol + (d + c) * 0.005; end if;
    ln.acc := v_code; ln.d := d; ln.c := c; ln.cur := cur; ln.rate := rate;
    ln.bd := _glw_r2(d * brate); ln.bc := _glw_r2(c * brate);
    dB := dB + ln.bd; cB := cB + ln.bc;
    cx := case cur when 'EGP' then 1 when 'SAR' then 2 else 3 end;
    used[cx] := true; dC[cx] := dC[cx] + d; cC[cx] := cC[cx] + c;
    ln.trip := btrim(coalesce(nullif(r.val ->> 'trip', ''), e ->> 'trip', ''));
    ln.company := btrim(coalesce(nullif(r.val ->> 'company', ''), e ->> 'company', ''));
    ln.client := btrim(coalesce(nullif(r.val ->> 'client', ''), case when a.category = 'client' then a.link end, ''));
    ln.agent := btrim(coalesce(nullif(r.val ->> 'agent', ''), case when a.category = 'agent' then a.link end, ''));
    ln.descr := btrim(coalesce(nullif(r.val ->> 'desc', ''), e ->> 'desc', ''));
    lines := lines || ln;
  end loop;

  n := coalesce(array_length(lines, 1), 0);
  if n < 2 then raise exception 'القيد يحتاج سطرين على الأقل'; end if;
  nused := (used[1]::int + used[2]::int + used[3]::int); single := nused = 1;
  if single then
    cx := case when used[1] then 1 when used[2] then 2 else 3 end; kcur := curs[cx];
    if abs(_glw_r2(dC[cx] - cC[cx])) > 0.009 then
      raise exception 'القيد غير متوازن: المدين % ≠ الدائن % %', _glw_n(_glw_r2(dC[cx])), _glw_n(_glw_r2(cC[cx])), kcur;
    end if;
  elsif abs(_glw_r2(dB - cB)) > 0.05 then
    diffB := _glw_r2(dB - cB);
    if abs(diffB) > 0.05 + fxTol then
      raise exception 'القيد غير متوازن بعملة الأساس: المدين المعادل % ≠ الدائن المعادل % جنيه', _glw_n(_glw_r2(dB)), _glw_n(_glw_r2(cB));
    end if;
    -- فرق تقريب السعر: يمتصه وسيط التحويل، وإلا يُضاف لمعادل أكبر سطر أجنبي (Accounts.gs:1550-1557)
    brX := _glw_fx_bridge_acc();
    hasBr := exists (select 1 from unnest(lines) u where (u).acc = brX);
    willBridge := not noBridge and v_type <> 'قيد افتتاحي' and v_type <> 'قيد إقفال' and _glw_setting('fx_bridge') <> 'لا' and brX <> '' and not hasBr;
    if not willBridge then
      bigIdx := null; bigSum := 0;
      for i in 1..n loop
        if lines[i].cur <> 'EGP' and (bigIdx is null or lines[i].d + lines[i].c > bigSum) then bigIdx := i; bigSum := lines[i].d + lines[i].c; end if;
      end loop;
      if bigIdx is not null then
        if lines[bigIdx].d <> 0 then
          lines[bigIdx].bd := _glw_r2(lines[bigIdx].bd - diffB); dB := _glw_r2(dB - diffB);
        else
          lines[bigIdx].bc := _glw_r2(lines[bigIdx].bc + diffB);
        end if;
      end if;
    end if;
  end if;
  -- 💱 وسيط تحويل العملات (Accounts.gs:1564-1578): يُصفّي كل عملة داخل نفسها
  if not single and not noBridge and v_type <> 'قيد افتتاحي' and v_type <> 'قيد إقفال' and _glw_setting('fx_bridge') <> 'لا' then
    brX := _glw_fx_bridge_acc();
    if brX <> '' and not exists (select 1 from unnest(lines) u where (u).acc = brX) then
      for i in 1..n loop
        cx := case lines[i].cur when 'EGP' then 1 when 'SAR' then 2 else 3 end;
        net[cx] := net[cx] + lines[i].d - lines[i].c; bnet[cx] := bnet[cx] + lines[i].bd - lines[i].bc;
      end loop;
      for cx in 1..3 loop
        continue when not used[cx];
        nn := _glw_r2(net[cx]); bb := _glw_r2(bnet[cx]);
        continue when abs(nn) < 0.005;
        ln := null;
        ln.acc := brX; ln.d := case when nn < 0 then -nn else 0 end; ln.c := case when nn > 0 then nn else 0 end; ln.cur := curs[cx];
        ln.rate := case when cx = 1 then 1 else floor(abs(bb / nn) * 100 + 0.5) / 100 end;
        ln.bd := case when bb < 0 then -bb else 0 end; ln.bc := case when bb > 0 then bb else 0 end;
        ln.trip := btrim(coalesce(e ->> 'trip', '')); ln.company := btrim(coalesce(e ->> 'company', '')); ln.client := ''; ln.agent := '';
        -- (V4.223) بيان سطر الوسيط: «بيان أول سطر بنفس العملة — اسم حسابه» وإلا «تحويل عملة (العملة)»
        src := null; fa := false;
        for i in 1..n loop if lines[i].cur = curs[cx] then src := lines[i]; fa := true; exit; end if; end loop;
        if not fa then ln.descr := 'تحويل عملة (' || curs[cx] || ')';
        else
          select * into a from gl_accounts g where g.code = src.acc;
          ln.descr := coalesce(nullif(src.descr, ''), 'تحويل عملة') || case when found then ' — ' || a.name else '' end;
        end if;
        lines := lines || ln;
      end loop;
      dB := 0; for i in 1..coalesce(array_length(lines, 1), 0) loop dB := dB + lines[i].bd; end loop;
    end if;
  end if;
  for i in 1..coalesce(array_length(lines, 1), 0) loop
    ja := ja || jsonb_build_array(jsonb_build_object('account', lines[i].acc, 'debit', lines[i].d, 'credit', lines[i].c, 'currency', lines[i].cur, 'rate', lines[i].rate,
          'bDebit', lines[i].bd, 'bCredit', lines[i].bc, 'trip', lines[i].trip, 'company', lines[i].company, 'client', lines[i].client, 'agent', lines[i].agent, 'desc', lines[i].descr));
  end loop;
  return jsonb_build_object('date', v_date, 'type', v_type, 'totalBase', _glw_r2(dB), 'lines', ja);
end
$f$;

-- ============================================================
-- 7) حفظ قيد (إنشاء/تعديل) — glSaveEntry (Accounts.gs:1672-1762) في معاملة واحدة
--    p: {id?, date, type, desc, ref, trip, company, sourceKey?, post?, baseVer?, lines:[{account,debit,credit,currency,rate,exact,trip,company,client,agent,desc}]}
--    p_trusted (raw فقط): يسمح بـ p.opts (allowSystem…)، وبمفتاح مصدر AUTO:، وبـ p.batchId
-- ============================================================
create or replace function _glw_save_core(p jsonb, p_user text, p_can_auto boolean, p_trusted boolean) returns jsonb
language plpgsql set search_path = public, pg_temp as
$f$
declare
  v_id text := _glw_str(p -> 'id');
  is_edit boolean := _glw_str(p -> 'id') <> '';
  opts jsonb := case when p_trusted then coalesce(p -> 'opts', '{}'::jsonb) else '{}'::jsonb end;
  post boolean := coalesce(_glw_truthy(p -> 'post'), false);
  old gl_entries%rowtype; have_old boolean := false; auto_peek boolean := false; is_auto boolean := false;
  v jsonb; st text; old_st text; v_type text; sk text; sk_in text; vno text := ''; v_seq bigint; new_id text;
  v_ref text; before_j jsonb; after_j jsonb; old_lines jsonb := '[]'::jsonb; base_ver text; d_json jsonb;
  total numeric; ver text; has_vch boolean;
begin
  if coalesce(p_user, '') = '' then raise exception 'يجب تسجيل الدخول' using errcode = '42501'; end if;
  if is_edit then
    perform pg_advisory_xact_lock(hashtextextended('gl:entry:' || v_id, 0));   -- قفل لكل قيد (نظير _glLock_)
    select * into old from gl_entries where entry_id = v_id; have_old := found;
    auto_peek := have_old and coalesce(old.source_key, '') like 'AUTO:%';
  end if;
  v := _glw_validate(p, case when auto_peek then opts || '{"allowBeforeStart":true,"allowSystem":true}'::jsonb else opts end);
  st := case when post then 'مرحّل' else 'مسودة' end;
  v_type := v ->> 'type'; total := (v ->> 'totalBase')::numeric;

  if is_edit then
    if not have_old then raise exception 'القيد غير موجود'; end if;
    old_st := old.status; is_auto := coalesce(old.source_key, '') like 'AUTO:%';
    if old_st = 'ملغى' then raise exception 'القيد ملغى — لا يُعدَّل'; end if;
    if is_auto and not p_can_auto then raise exception 'تعديل القيود التلقائية يحتاج صلاحية تعديل «القيود التلقائية والاعتماد» أو صلاحية الاعتماد' using errcode = '42501'; end if;
    if old.entry_type = 'قيد إقفال' then raise exception 'قيد إقفال السنة لا يُعدَّل يدوياً'; end if;
    if _glw_locked(old.entry_date) then raise exception 'القيد في فترة مقفلة حتى %', _glw_setting('lockDate'); end if;
    if old_st = 'مرحّل' then st := 'مرحّل'; end if;
    if is_auto then v_type := coalesce(nullif(old.entry_type, ''), v_type); end if;
    before_j := _glw_entry_json(v_id);
    old_lines := coalesce(before_j -> 'lines', '[]'::jsonb);
    -- 🔐 تعديل متزامن (V4.346): القيد تغيّر بعد فتحه ⇒ رفض بدل مسح تعديل الآخر
    base_ver := _glw_str(p -> 'baseVer');
    if base_ver <> '' and base_ver <> gl_entry_ver_raw(v_id) then
      raise exception '⚠️ عدّل مستخدم آخر هذا القيد بعد فتحك له% — أغلق النافذة وافتح القيد من جديد لترى التعديل ثم أعد تعديلك',
        case when coalesce(old.updated_by, '') <> '' then ' (' || old.updated_by || case when old.updated_at is not null then ' — ' || to_char(old.updated_at, 'DD/MM/YYYY HH24:MI:SS') else '' end || ')' else '' end
        using errcode = 'GL409';
    end if;
    perform _glw_snap(v_id, case when old_st = 'مرحّل' then 'قبل تعديل قيد مرحّل' else 'قبل تعديل قيد' end, p_user);   -- ⏪ لقطة قبل التعديل
    sk := coalesce(old.source_key, '');
    if v_type in ('سند قبض', 'سند صرف') and sk = '' then sk := 'VCH:' || _glw_next_voucher(v_type); end if;   -- سند قديم بلا رقم ⇒ يأخذ رقماً
    v_ref := case when is_auto or sk like 'CUST:%' then old.reference else nullif(_glw_str(p -> 'ref'), '') end;
    update gl_entries set entry_date = (v ->> 'date')::date, entry_type = v_type, description = nullif(_glw_str(p -> 'desc'), ''), status = st,
           source_key = nullif(sk, ''), total_base = total, reference = v_ref, trip_name = nullif(_glw_str(p -> 'trip'), ''), executing_company = nullif(_glw_str(p -> 'company'), ''),
           posted_by = case when st = 'مرحّل' then p_user end, posted_at = case when st = 'مرحّل' then now() end,
           updated_by = p_user, updated_at = now(), void_reason = null
     where entry_id = v_id;
    delete from gl_lines where entry_id = v_id;
    new_id := v_id;
  else
    sk_in := _glw_str(p -> 'sourceKey');
    if sk_in like 'AUTO:%' then
      if not p_trusted then raise exception 'القيود التلقائية تُنشأ من الخادم فقط' using errcode = '42501'; end if;
      if sk_in !~ '^AUTO:(CP|CI|TRIP|TR|VZ|MF|RF|AP|AI|HB|HBP|OPEN|CAT):[^#]+(#[0-9]+)?$' then raise exception 'مفتاح المصدر التلقائي غير صالح: %', sk_in; end if;
    end if;
    if sk_in <> '' and (sk_in like 'AUTO:%' or sk_in like 'VCH:%') and exists (select 1 from gl_entries where source_key = sk_in) then
      raise exception 'مفتاح المصدر مستخدم لقيد آخر: %', sk_in; end if;
    v_seq := _glw_next_entry_seq(); new_id := 'JE-' || _glw_pad(v_seq, 6);
    if v_type in ('سند قبض', 'سند صرف') and sk_in = '' then vno := _glw_next_voucher(v_type); end if;
    sk := case when vno <> '' then 'VCH:' || vno else sk_in end;
    insert into gl_entries (entry_id, seq, entry_date, entry_type, description, status, source_key, batch_no, total_base, reference, trip_name, executing_company,
                            created_by, created_at, posted_by, posted_at)
    values (new_id, v_seq, (v ->> 'date')::date, v_type, nullif(_glw_str(p -> 'desc'), ''), st, nullif(sk, ''),
            case when p_trusted then nullif(_glw_str(p -> 'batchId'), '') end, total, nullif(_glw_str(p -> 'ref'), ''),
            nullif(_glw_str(p -> 'trip'), ''), nullif(_glw_str(p -> 'company'), ''), p_user, now(),
            case when st = 'مرحّل' then p_user end, case when st = 'مرحّل' then now() end);
  end if;

  insert into gl_lines (entry_id, line_no, line_date, status, account_code, debit, credit, currency, fx_rate, debit_base, credit_base,
                        trip_name, executing_company, client_name, agent, description)
  select new_id, t.ord, (v ->> 'date')::date, st, t.l ->> 'account', round((t.l ->> 'debit')::numeric, 2), round((t.l ->> 'credit')::numeric, 2),
         t.l ->> 'currency', (t.l ->> 'rate')::numeric, round((t.l ->> 'bDebit')::numeric, 2), round((t.l ->> 'bCredit')::numeric, 2),
         nullif(t.l ->> 'trip', ''), nullif(t.l ->> 'company', ''), nullif(t.l ->> 'client', ''), nullif(t.l ->> 'agent', ''), nullif(t.l ->> 'desc', '')
    from jsonb_array_elements(v -> 'lines') with ordinality as t(l, ord);

  after_j := _glw_entry_json(new_id);
  d_json := _glw_delta(case when is_edit then old_lines end, after_j -> 'lines');
  -- 🛡️ سجل التتبع المحصّن (نفس المعاملة — فشله يُفشل الحفظ)
  perform _glw_audit(p_user, case when not is_edit then (case when post then 'تسجيل وترحيل قيد' else 'تسجيل قيد مسودة' end)
                                  when old_st = 'مرحّل' then 'تعديل قيد مرحّل' else 'تعديل قيد' end, new_id,
                     jsonb_build_object('before', before_j, 'after', after_j));
  -- آثار جانبية للمستهلك (Apps Script/Edge)
  if st = 'مرحّل' then
    perform _glw_outbox('bot:' || case when is_edit and old_st = 'مرحّل' then 'entry_edit' else 'vch_new' end, _glw_bot_info(new_id, p_user));   -- 📲 تليجرام
  end if;
  if is_edit or st = 'مرحّل' then perform _glw_outbox('mirror:voucher_pays', jsonb_build_object('entryId', new_id, 'user', p_user)); end if;   -- مرايا CP/AP/HB (_glSyncVoucherPays_)
  perform _glw_outbox('gl:dirty', jsonb_build_object('entryId', new_id, 'by', p_user));                                                         -- logChange_ ⇒ gl_dirty (إعادة بناء AUTO)
  perform _glw_outbox('dv_bump', jsonb_build_object('groups', jsonb_build_array('gl', 'hb')));
  perform _glw_dv_bump(array['gl']);
  select coalesce(substring(source_key from '^VCH:(.+)$'), '') into vno from gl_entries where entry_id = new_id;
  return jsonb_build_object('success', true, 'id', new_id, 'status', st, 'voucherNo', vno, 'balancesDelta', d_json, 'ver', gl_entry_ver_raw(new_id));
end
$f$;

-- ============================================================
-- 8) ترحيل مسودة — glPostEntry (Accounts.gs:1824)
-- ============================================================
create or replace function _glw_post_core(p_id text, p_user text) returns jsonb
language plpgsql set search_path = public, pg_temp as
$f$
declare e gl_entries%rowtype; ent jsonb; after_j jsonb;
begin
  if coalesce(p_user, '') = '' then raise exception 'يجب تسجيل الدخول' using errcode = '42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended('gl:entry:' || coalesce(p_id, ''), 0));
  select * into e from gl_entries where entry_id = p_id;
  if not found then raise exception 'القيد غير موجود'; end if;
  if e.status <> 'مسودة' then raise exception 'القيد ليس مسودة'; end if;
  -- إعادة الفحص قبل الترحيل (ربما تغيّر الحساب أو أُوقف) — _glValidate_(_glEntryFull_) بالخيارات الافتراضية
  select jsonb_build_object('date', _glw_fmt_date(e.entry_date), 'type', e.entry_type, 'desc', coalesce(e.description, ''), 'trip', coalesce(e.trip_name, ''), 'company', coalesce(e.executing_company, ''),
         'lines', coalesce(jsonb_agg(jsonb_build_object('account', l.account_code, 'debit', l.debit, 'credit', l.credit, 'currency', l.currency, 'rate', coalesce(nullif(l.fx_rate, 0), 1),
                  'trip', coalesce(l.trip_name, ''), 'company', coalesce(l.executing_company, ''), 'client', coalesce(l.client_name, ''), 'agent', coalesce(l.agent, ''), 'desc', coalesce(l.description, '')) order by l.line_no), '[]'::jsonb))
    into ent from gl_lines l where l.entry_id = p_id;
  perform _glw_validate(ent);
  update gl_entries set status = 'مرحّل', posted_by = p_user, posted_at = now() where entry_id = p_id;
  update gl_lines set status = 'مرحّل' where entry_id = p_id;
  after_j := _glw_entry_json(p_id);
  perform _glw_audit(p_user, 'ترحيل قيد', p_id, jsonb_build_object('before_status', 'مسودة', 'after_status', 'مرحّل', 'after', after_j));
  perform _glw_outbox('bot:vch_new', _glw_bot_info(p_id, p_user));
  perform _glw_outbox('mirror:voucher_pays', jsonb_build_object('entryId', p_id, 'user', p_user));
  perform _glw_outbox('gl:dirty', jsonb_build_object('entryId', p_id, 'by', p_user));
  perform _glw_outbox('dv_bump', jsonb_build_object('groups', jsonb_build_array('gl', 'hb')));
  perform _glw_dv_bump(array['gl']);
  return jsonb_build_object('success', true, 'id', p_id, 'balancesDelta', _glw_delta('[]'::jsonb, after_j -> 'lines'), 'ver', gl_entry_ver_raw(p_id));
end
$f$;

-- ============================================================
-- 9) إلغاء — glVoidEntry (Accounts.gs:1846): المسودة تُحذف فعلياً، المرحّل ⇒ «ملغى» + سبب إلزامي
-- ============================================================
create or replace function _glw_void_core(p_id text, p_reason text, p_user text, p_can_auto boolean) returns jsonb
language plpgsql set search_path = public, pg_temp as
$f$
declare e gl_entries%rowtype; reason text := regexp_replace(coalesce(p_reason, ''), '^\s+|\s+$', '', 'g'); before_j jsonb; after_j jsonb;
begin
  if coalesce(p_user, '') = '' then raise exception 'يجب تسجيل الدخول' using errcode = '42501'; end if;
  if reason = '' then raise exception 'سبب الإلغاء مطلوب'; end if;
  perform pg_advisory_xact_lock(hashtextextended('gl:entry:' || coalesce(p_id, ''), 0));
  select * into e from gl_entries where entry_id = p_id;
  if not found then raise exception 'القيد غير موجود'; end if;
  if e.status = 'ملغى' then raise exception 'القيد ملغى بالفعل'; end if;
  if coalesce(e.source_key, '') like 'AUTO:%' and not p_can_auto then
    raise exception 'إلغاء القيد التلقائي يحتاج صلاحية تعديل «القيود التلقائية والاعتماد» — أو عدّل/احذف مصدره بالشاشة' using errcode = '42501'; end if;
  if _glw_locked(e.entry_date) then raise exception 'القيد في فترة مقفلة حتى %', _glw_setting('lockDate'); end if;
  before_j := _glw_entry_json(p_id);
  if e.status = 'مسودة' then   -- المسودة تُحذف نهائياً (لم تؤثر على أي رصيد)
    perform _glw_snap(p_id, 'قبل حذف قيد مسودة', p_user);
    perform _glw_audit(p_user, 'حذف قيد مسودة', p_id, jsonb_build_object('before', before_j, 'after', null));
    delete from gl_lines where entry_id = p_id;
    delete from gl_entries where entry_id = p_id;
    perform _glw_outbox('mirror:voucher_pays', jsonb_build_object('entryId', p_id, 'user', p_user, 'deleted', true));
    perform _glw_outbox('gl:dirty', jsonb_build_object('entryId', p_id, 'by', p_user));
    perform _glw_outbox('dv_bump', jsonb_build_object('groups', jsonb_build_array('gl', 'hb')));
    perform _glw_dv_bump(array['gl']);
    return jsonb_build_object('success', true, 'deleted', true, 'removedId', p_id, 'balancesDelta', '{}'::jsonb);
  end if;
  perform _glw_outbox('bot:entry_void', _glw_bot_info(p_id, p_user, jsonb_build_object('reason', reason)));   -- 📲 قبل تغيير الحالة (كما بالأصل)
  perform _glw_snap(p_id, 'قبل إلغاء قيد', p_user);
  update gl_entries set status = 'ملغى', updated_by = p_user, updated_at = now(), void_reason = reason where entry_id = p_id;
  update gl_lines set status = 'ملغى' where entry_id = p_id;
  after_j := _glw_entry_json(p_id);
  perform _glw_audit(p_user, 'إلغاء قيد مرحّل', p_id, jsonb_build_object('before', before_j, 'after', after_j, 'reason', reason));
  perform _glw_outbox('mirror:voucher_pays', jsonb_build_object('entryId', p_id, 'user', p_user));
  perform _glw_outbox('gl:dirty', jsonb_build_object('entryId', p_id, 'by', p_user));
  perform _glw_outbox('dv_bump', jsonb_build_object('groups', jsonb_build_array('gl', 'hb')));
  perform _glw_dv_bump(array['gl']);
  return jsonb_build_object('success', true, 'id', p_id, 'balancesDelta', _glw_delta(before_j -> 'lines', after_j -> 'lines'), 'ver', gl_entry_ver_raw(p_id));
end
$f$;

-- ============================================================
-- 10) حذف نهائي — glDeleteEntry (Accounts.gs:1901): للمدير فقط (يفحصه الغلاف العام)
-- ============================================================
create or replace function _glw_delete_core(p_id text, p_user text) returns jsonb
language plpgsql set search_path = public, pg_temp as
$f$
declare e gl_entries%rowtype; before_j jsonb;
begin
  if coalesce(p_user, '') = '' then raise exception 'يجب تسجيل الدخول' using errcode = '42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended('gl:entry:' || coalesce(p_id, ''), 0));
  select * into e from gl_entries where entry_id = p_id;
  if not found then raise exception 'القيد غير موجود'; end if;
  if e.entry_type = 'قيد إقفال' then raise exception 'قيد إقفال السنة يُلغى من «الإعدادات ← إعادة فتح السنة»'; end if;
  if _glw_locked(e.entry_date) then raise exception 'القيد في فترة مقفلة حتى %', _glw_setting('lockDate'); end if;
  before_j := _glw_entry_json(p_id);
  perform _glw_snap(p_id, 'قبل حذف قيد نهائياً', p_user);
  perform _glw_audit(p_user, 'حذف قيد نهائياً', p_id, jsonb_build_object('before', before_j, 'after', null));
  if e.status = 'مرحّل' then perform _glw_outbox('bot:entry_void', _glw_bot_info(p_id, p_user, jsonb_build_object('deleted', true))); end if;
  delete from gl_lines where entry_id = p_id;
  delete from gl_entries where entry_id = p_id;
  perform _glw_outbox('mirror:voucher_pays', jsonb_build_object('entryId', p_id, 'user', p_user, 'deleted', true));
  perform _glw_outbox('gl:dirty', jsonb_build_object('entryId', p_id, 'by', p_user));
  perform _glw_outbox('dv_bump', jsonb_build_object('groups', jsonb_build_array('gl', 'hb')));
  perform _glw_dv_bump(array['gl']);
  return jsonb_build_object('success', true, 'deleted', true, 'removedId', p_id, 'balancesDelta', _glw_delta(before_j -> 'lines', '[]'::jsonb));
end
$f$;

-- ============================================================
-- 11) الواجهات العامة (تفحص JWT) و *_raw (service_role: المستخدم يُمرَّر صراحةً)
-- ============================================================
create or replace function gl_save_entry(p jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as
$f$
declare u text := app_user(); v_id text := _glw_str(p -> 'id'); old_type text;
begin
  if u is null then raise exception 'يجب تسجيل الدخول' using errcode = '42501'; end if;
  if v_id <> '' then select entry_type into old_type from gl_entries where entry_id = v_id; end if;
  if not gl_can_cap(_glw_sub_of_type(p ->> 'type'), case when v_id <> '' then 'edit' else 'add' end)
     or (old_type is not null and not gl_can_cap(_glw_sub_of_type(old_type), 'edit')) then   -- (أشد قليلاً من الأصل: يفحص نوع القيد المخزَّن عند التعديل أيضاً)
    raise exception 'لا تملك صلاحية % الحسابات العامة', case when v_id <> '' then 'تعديل/ترحيل' else 'إضافة' end using errcode = '42501';
  end if;
  return _glw_save_core(p - 'opts' - 'batchId', u, _glw_can_edit_auto(), false);
end
$f$;

create or replace function gl_post_entry(p_id text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as
$f$
declare u text := app_user();
begin
  if u is null then raise exception 'يجب تسجيل الدخول' using errcode = '42501'; end if;
  if not gl_can_cap(_glw_sub_of_type((select entry_type from gl_entries where entry_id = p_id)), 'edit') then
    raise exception 'لا تملك صلاحية تعديل/ترحيل الحسابات العامة' using errcode = '42501'; end if;
  return _glw_post_core(p_id, u);
end
$f$;

create or replace function gl_void_entry(p_id text, p_reason text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as
$f$
declare u text := app_user();
begin
  if u is null then raise exception 'يجب تسجيل الدخول' using errcode = '42501'; end if;
  if not gl_can_cap(_glw_sub_of_type((select entry_type from gl_entries where entry_id = p_id)), 'delete') then
    raise exception 'لا تملك صلاحية حذف/إلغاء الحسابات العامة' using errcode = '42501'; end if;
  return _glw_void_core(p_id, p_reason, u, _glw_can_edit_auto());
end
$f$;

create or replace function gl_delete_entry(p_id text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as
$f$
declare u text := app_user();
begin
  if u is null then raise exception 'يجب تسجيل الدخول' using errcode = '42501'; end if;
  if not app_has('admin') then raise exception 'الحذف النهائي للقيود للمدير فقط — يمكنك «إلغاء» القيد بدلاً من ذلك' using errcode = '42501'; end if;
  return _glw_delete_core(p_id, u);
end
$f$;

-- raw: p.user مطلوب · p.canEditAuto (افتراضي true) · p.opts / p.batchId مسموحة
create or replace function gl_save_entry_raw(p jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as
$f$ begin
  return _glw_save_core(p - 'user', _glw_str(p -> 'user'), case when p ? 'canEditAuto' then _glw_truthy(p -> 'canEditAuto') else true end, true);
end $f$;
create or replace function gl_post_entry_raw(p_id text, p_user text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as
$f$ begin return _glw_post_core(p_id, p_user); end $f$;
create or replace function gl_void_entry_raw(p_id text, p_reason text, p_user text, p_can_edit_auto boolean default true) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as
$f$ begin return _glw_void_core(p_id, p_reason, p_user, p_can_edit_auto); end $f$;
create or replace function gl_delete_entry_raw(p_id text, p_user text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as
$f$ begin return _glw_delete_core(p_id, p_user); end $f$;

-- ============================================================
-- 12) الصلاحيات
-- ============================================================
do $$ declare r record; begin
  for r in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and (p.proname like '\_glw\_%' or p.proname in ('gl_entry_ver_raw','gl_audit_verify_raw','gl_save_entry_raw','gl_post_entry_raw','gl_void_entry_raw','gl_delete_entry_raw'))
  loop
    execute format('revoke all on function %s from public, anon, authenticated', r.sig);
    execute format('grant execute on function %s to service_role', r.sig);
  end loop;
  revoke all on function gl_save_entry(jsonb), gl_post_entry(text), gl_void_entry(text, text), gl_delete_entry(text) from public, anon;
  grant execute on function gl_save_entry(jsonb), gl_post_entry(text), gl_void_entry(text, text), gl_delete_entry(text) to authenticated;
  grant execute on function gl_can_cap(text, text) to authenticated;
end $$;
grant select, insert on gl_audit, gl_entry_snapshots to service_role;
grant select, update on gl_outbox to service_role;
grant usage on sequence gl_entry_seq, gl_vch_rec_seq, gl_vch_pay_seq, gl_audit_id_seq to service_role;

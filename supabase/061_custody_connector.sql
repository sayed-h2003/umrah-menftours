-- V4.438: 🔌 موصل شيتات العهدة/الخزينة/البنك — الشيت يدفع صفوفه لقاعدة البيانات، والقاعدة ترد أرقام القيود ليكتبها الشيت بنفسه
--  • كان البرنامج يفتح كل شيت عهدة خارجي (SpreadsheetApp.openById + DriveApp) عند كل مزامنة/معاينة/اعتماد (حتى 26 ث) ويكتب فيه رقم القيد.
--  • الآن: سكربت صغير داخل شيت العهدة نفسه (يُولَّد من البرنامج) يدفع صورة الشيت فور أي تعديل + كل دقيقة إلى cs_push، ويستلم بالرد
--    «الكتابات المعلّقة» (أرقام القيود) فيكتبها بالشيت ويؤكّدها بـ cs_ack. البرنامج يقرأ الصورة من هنا (cs_get) ويضع الكتابات بالطابور (cs_queue).
--  • الأمان: لكل شيت مفتاح سري عشوائي (يُخزَّن هنا مُجزَّأً sha256 فقط) + رقم الشيت يجب أن يطابق الشيت المربوط. الدالتان العامتان
--    cs_push/cs_ack لا تقرآن ولا تكتبان إلا صف هذا الشيت. لا جدول مكشوف لـ anon.
create table if not exists cs_sheets (
  code text primary key,
  sheet_id text not null default '',
  key_hash text not null default '',
  tab text not null default '', title text not null default '',
  first_row int not null default 1, last_col int not null default 0,
  rows jsonb not null default '[]'::jsonb,        -- صفوف الشيت من first_row (قيم خام؛ التاريخ {"$d": ms})
  hash text not null default '',
  pending jsonb not null default '{}'::jsonb,     -- {"<صف>|<عمود>": {v: قيمة, sig: بصمة الصف}} كتابات بانتظار الشيت (البصمة تحمي من إدراج/حذف صفوف قبل الكتابة)
  pushed_at timestamptz, changed_at timestamptz, pulled_at timestamptz, created_at timestamptz not null default now(),
  agent text not null default ''                  -- إصدار الموصل
);
alter table cs_sheets enable row level security;
revoke all on cs_sheets from anon, authenticated;
grant all on cs_sheets to service_role;

-- تطبيق الكتابات المعلّقة على صورة الصفوف (حتى يرى البرنامج رقم القيد فوراً قبل أن يكتبه الشيت)
create or replace function _cs_overlay(rows_ jsonb, fr int, pend jsonb) returns jsonb language plpgsql immutable as
$$ declare k text; v jsonb; r int; c int; i int; row_ jsonb; begin
  for k, v in select * from jsonb_each(coalesce(pend, '{}'::jsonb)) loop
    r := split_part(k, '|', 1)::int; c := split_part(k, '|', 2)::int; i := r - fr;
    if i < 0 then continue; end if;
    while jsonb_array_length(rows_) <= i loop rows_ := rows_ || '[[]]'::jsonb; end loop;
    row_ := rows_ -> i; while jsonb_array_length(row_) < c loop row_ := row_ || '""'::jsonb; end loop;
    rows_ := jsonb_set(rows_, array[i::text], jsonb_set(row_, array[(c - 1)::text], case when jsonb_typeof(v) = 'object' and v ? 'v' then v -> 'v' else v end));
  end loop;
  return rows_; end $$;

-- ===== من الشيت (anon + مفتاح الشيت) =====
-- p: {sheetId, tab, title, firstRow, lastCol, rows, hash, agent}  ⇒ {ok, pending}
create or replace function cs_push(p_code text, p_key text, p jsonb) returns jsonb language plpgsql volatile security definer set search_path = public, pg_temp as
$$ declare s cs_sheets; begin
  select * into s from cs_sheets where code = p_code for update;
  if s.code is null or s.key_hash = '' or s.key_hash <> encode(sha256(convert_to(coalesce(p_key, ''), 'UTF8')), 'hex') then raise exception 'مفتاح الموصل غير صحيح' using errcode = '42501'; end if;
  if s.sheet_id <> '' and coalesce(p ->> 'sheetId', '') <> s.sheet_id then raise exception 'هذا الموصل مربوط بشيت آخر' using errcode = '42501'; end if;
  if jsonb_typeof(p -> 'rows') = 'array' and coalesce(p ->> 'hash', '') <> s.hash then
    update cs_sheets set rows = _cs_overlay(p -> 'rows', greatest(1, coalesce((p ->> 'firstRow')::int, 1)), pending), first_row = greatest(1, coalesce((p ->> 'firstRow')::int, 1)),
           last_col = coalesce((p ->> 'lastCol')::int, 0), hash = coalesce(p ->> 'hash', ''), tab = coalesce(p ->> 'tab', ''), title = coalesce(p ->> 'title', ''), changed_at = now()
     where code = p_code;
  end if;
  update cs_sheets set pushed_at = now(), agent = left(coalesce(p ->> 'agent', ''), 40) where code = p_code;
  return jsonb_build_object('ok', true, 'pending', (select pending from cs_sheets where code = p_code)); end $$;
-- p_done: {"<صف>|<عمود>": القيمة المكتوبة} ⇒ تُزال من المعلّق إن لم تتغيّر منذ الإرسال
create or replace function cs_ack(p_code text, p_key text, p_done jsonb) returns jsonb language plpgsql volatile security definer set search_path = public, pg_temp as
$$ declare s cs_sheets; k text; v jsonb; pend jsonb; begin
  select * into s from cs_sheets where code = p_code for update;
  if s.code is null or s.key_hash = '' or s.key_hash <> encode(sha256(convert_to(coalesce(p_key, ''), 'UTF8')), 'hex') then raise exception 'مفتاح الموصل غير صحيح' using errcode = '42501'; end if;
  pend := s.pending;
  for k, v in select * from jsonb_each(coalesce(p_done, '{}'::jsonb)) loop if pend -> k = v then pend := pend - k; end if; end loop;
  update cs_sheets set pending = pend, pulled_at = now() where code = p_code;
  return jsonb_build_object('ok', true, 'left', (select count(*) from jsonb_object_keys(pend))); end $$;
revoke all on function cs_push(text, text, jsonb), cs_ack(text, text, jsonb) from public;
grant execute on function cs_push(text, text, jsonb), cs_ack(text, text, jsonb) to anon, authenticated, service_role;

-- ===== من البرنامج (service_role) =====
create or replace function cs_setup(p_code text, p_key text, p_sheet_id text) returns jsonb language plpgsql volatile security definer set search_path = public, pg_temp as
$$ begin
  insert into cs_sheets (code, sheet_id, key_hash) values (p_code, coalesce(p_sheet_id, ''), encode(sha256(convert_to(p_key, 'UTF8')), 'hex'))
  on conflict (code) do update set sheet_id = excluded.sheet_id, key_hash = excluded.key_hash,
    rows = case when cs_sheets.sheet_id = excluded.sheet_id then cs_sheets.rows else '[]'::jsonb end,
    hash = case when cs_sheets.sheet_id = excluded.sheet_id then cs_sheets.hash else '' end;
  return jsonb_build_object('ok', true); end $$;
create or replace function cs_get(p_code text) returns jsonb language sql stable security definer set search_path = public as
$$ select jsonb_build_object('code', code, 'sheetId', sheet_id, 'tab', tab, 'title', title, 'firstRow', first_row, 'lastCol', last_col, 'rows', rows, 'pending', pending,
     'pushedAt', (extract(epoch from pushed_at) * 1000)::bigint, 'changedAt', (extract(epoch from changed_at) * 1000)::bigint, 'pulledAt', (extract(epoch from pulled_at) * 1000)::bigint, 'agent', agent)
   from cs_sheets where code = p_code $$;
-- p_cells: {"<صف>|<عمود>": قيمة} ⇒ للطابور + صورة الصفوف
create or replace function cs_queue(p_code text, p_cells jsonb) returns jsonb language plpgsql volatile security definer set search_path = public as
$$ begin
  update cs_sheets set pending = pending || coalesce(p_cells, '{}'::jsonb), rows = _cs_overlay(rows, first_row, p_cells) where code = p_code;
  if not found then raise exception 'الموصل غير مُعدّ لهذا الحساب'; end if;
  return jsonb_build_object('ok', true); end $$;
create or replace function cs_off(p_code text) returns jsonb language sql volatile security definer set search_path = public as
$$ update cs_sheets set key_hash = '' where code = p_code returning jsonb_build_object('ok', true) $$;
revoke all on function cs_setup(text, text, text), cs_get(text), cs_queue(text, jsonb), cs_off(text), _cs_overlay(jsonb, int, jsonb) from public, anon, authenticated;
grant execute on function cs_setup(text, text, text), cs_get(text), cs_queue(text, jsonb), cs_off(text) to service_role;

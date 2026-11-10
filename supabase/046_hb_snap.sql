-- V4.420: نسخة قراءة من بيانات برنامج الحجوزات (HB) داخل Postgres — المرحلة 2 من HB_UNIFICATION_PLAN.md.
-- الشيتات تبقى المصدر (مكة/المدينة/سجل الدفعات/البيانات المحاسبية للدفعات/بيانات الحسابات)؛ Apps Script يرفع لقطة كاملة عند تغيّر المحتوى فقط.
-- هذه الطبقة للقراءة فقط: لا تكتب شيئاً بالشيتات. الصفوف بترميز المخزن ({$d:ms} للتواريخ) وrn = رقم الصف الفعلي بالشيت.
create table if not exists hb_snap (tbl text not null, rn int not null, raw jsonb not null, primary key (tbl, rn));
create table if not exists hb_snap_stage (tbl text not null, rn int not null, raw jsonb not null, primary key (tbl, rn));
create table if not exists hb_snap_meta (tbl text primary key, n int not null default 0, hash text not null default '', synced_at timestamptz not null default now());
alter table hb_snap enable row level security; alter table hb_snap_stage enable row level security; alter table hb_snap_meta enable row level security;
revoke all on hb_snap, hb_snap_stage, hb_snap_meta from anon, authenticated;
grant all on hb_snap, hb_snap_stage, hb_snap_meta to service_role;

-- رفع لقطة جدول على أجزاء؛ التبديل ذرّي عند آخر جزء (القراء لا يرون لقطة نصف مرفوعة)
create or replace function hb_snap_put(p_tbl text, p_part int, p_parts int, p_rows jsonb, p_hash text) returns jsonb
language plpgsql volatile security definer set search_path = public as
$$ declare n int; begin
  if p_tbl !~ '^(mk|md|pay|meta|prof)$' then raise exception 'جدول غير مدعوم: %', p_tbl; end if;
  if p_part = 1 then delete from hb_snap_stage where tbl = p_tbl; end if;
  insert into hb_snap_stage (tbl, rn, raw) select p_tbl, (e ->> 0)::int, e -> 1 from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) e on conflict (tbl, rn) do update set raw = excluded.raw;
  if p_part >= p_parts then
    delete from hb_snap where tbl = p_tbl;
    insert into hb_snap (tbl, rn, raw) select tbl, rn, raw from hb_snap_stage where tbl = p_tbl;
    select count(*) into n from hb_snap_stage where tbl = p_tbl;
    delete from hb_snap_stage where tbl = p_tbl;
    insert into hb_snap_meta (tbl, n, hash, synced_at) values (p_tbl, n, coalesce(p_hash, ''), now())
      on conflict (tbl) do update set n = excluded.n, hash = excluded.hash, synced_at = now();
    return jsonb_build_object('done', true, 'n', n);
  end if;
  return jsonb_build_object('done', false); end $$;
revoke all on function hb_snap_put(text, int, int, jsonb, text) from public, anon, authenticated;
grant execute on function hb_snap_put(text, int, int, jsonb, text) to service_role;

-- ===== مكافئات _glAutoDate_ / parseFloat / _glHbTotal_ / _glHbKey_ =====
create or replace function _hbx_autodate(c jsonb) returns text language plpgsql stable as
$$ declare s text; m text[]; begin
  if jsonb_typeof(c) = 'object' then return case when c ? '$d' then _glx_fmt_dt((c ->> '$d')::float8, false) else '' end; end if;
  s := translate(_glx_str(c), '٠١٢٣٤٥٦٧٨٩', '0123456789');
  m := regexp_match(s, '(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})');
  if m is not null then return lpad(m[1], 2, '0') || '/' || lpad(m[2], 2, '0') || '/' || m[3]; end if;
  m := regexp_match(s, '(\d{4})[/\-.](\d{1,2})[/\-.](\d{1,2})');
  if m is not null then return lpad(m[3], 2, '0') || '/' || lpad(m[2], 2, '0') || '/' || m[1]; end if;
  return ''; end $$;
-- parseFloat الحرفي: NULL = NaN (فارغ/غير رقمي)
create or replace function _hbx_pfn(c jsonb) returns float8 language plpgsql immutable as
$$ declare m text; begin
  if jsonb_typeof(c) = 'number' then return (c #>> '{}')::float8; end if;
  if jsonb_typeof(c) <> 'string' then return null; end if;
  m := substring(btrim(c #>> '{}') from '^[+-]?(?:[0-9]+\.?[0-9]*|\.[0-9]+)(?:[eE][+-]?[0-9]+)?');
  if m is null then return null; end if;
  return m::float8; exception when others then return null; end $$;
create or replace function _hbx_total(raw jsonb, role text) returns jsonb language plpgsql stable as
$$ declare nights float8 := coalesce(_hbx_pfn(raw -> 9), 0); base int := case when role = 'client' then 25 else 21 end; per float8 := 0; anyr boolean := false; miss boolean := false;
  parts text[] := '{}'; lbl text[] := array['دابل','ثلاثي','رباعي','خماسي']; cnt float8; p float8; ok boolean; i int; begin
  for i in 0..3 loop
    cnt := coalesce(_hbx_pfn(raw -> (10 + i)), 0); if cnt <= 0 then continue; end if;
    anyr := true; p := _hbx_pfn(raw -> (base + i));
    if p is null then miss := true; continue; end if;
    per := per + cnt * p;
    parts := parts || (trim_scale(cnt::numeric)::text || ' ' || lbl[i + 1] || ' × ' || trim_scale(_glx_r2(p)::numeric)::text || ' ريال');
  end loop;
  ok := anyr and not miss;
  return jsonb_build_object('value', case when ok then _glx_r2(per * nights) else 0 end, 'hasPrice', ok, 'rooms', anyr, 'breakdown', case when ok then array_to_string(parts, ' + ') else '' end); end $$;
create or replace function _hbx_key(s text) returns text language sql immutable as
$$ select btrim(regexp_replace(translate(regexp_replace(regexp_replace(coalesce(s, ''), E'[\\u200b-\\u200f\\u061c\\ufeff]', '', 'g'), E'[\\u064b-\\u0670\\u065f]', '', 'g'), 'أإآىؤئة', 'ااايويه'), '\s+', ' ', 'g')) $$;

-- ===== القراءة: نفس مخرجات _glHbRead_ في Accounts.gs =====
create or replace function hbx_read_raw() returns jsonb language plpgsql stable set search_path = public as
$$ declare bk jsonb; pays jsonb; prof jsonb; onlyk text; ts timestamptz; begin
  if (select count(*) from hb_snap_meta where tbl in ('mk', 'md', 'pay', 'prof')) < 4 then raise exception 'لقطة الحجوزات غير مرفوعة بعد (hb_snap)' using errcode = '55000'; end if;
  select min(synced_at) into ts from hb_snap_meta where tbl in ('mk', 'md', 'pay', 'meta', 'prof');
  -- الحجوزات (مكة ثم المدينة بترتيب الصفوف) — مفتاح الحجز: المدينة|الرقم الداخلي أو r<صف> (+#n للتكرار)
  with src as (
    select case s.tbl when 'mk' then 'مكة' else 'المدينة' end city, s.tbl, s.rn, s.raw, _hbx_autodate(s.raw -> 7) ci, _glx_str(s.raw -> 3) client, _glx_str(s.raw -> 14) sup, _glx_str(s.raw -> 2) inr
      from hb_snap s where s.tbl in ('mk', 'md')),
  ok as (select *, city || '|' || coalesce(nullif(inr, ''), 'r' || rn) base from src where ci <> '' and (client <> '' or sup <> '')),
  nn as (select *, row_number() over (partition by base order by case tbl when 'mk' then 0 else 1 end, rn) k from ok)
  select coalesce(jsonb_agg(jsonb_build_object('key', base || case when k > 1 then '#' || k else '' end, 'city', city, 'row', rn, 'qaid', _glx_str(raw -> 0), 'inner', inr, 'client', client,
      'hotel', _glx_str(raw -> 4), 'ci', ci, 'co', _hbx_autodate(raw -> 8), 'nights', coalesce(_hbx_pfn(raw -> 9), 0), 'supplier', sup, 'status', _glx_str(raw -> 15), 'hotelRef', _glx_str(raw -> 17),
      'sale', _hbx_total(raw, 'client'), 'cost', _hbx_total(raw, 'supplier'),
      'rooms', jsonb_build_array(coalesce(_hbx_pfn(raw -> 10), 0), coalesce(_hbx_pfn(raw -> 11), 0), coalesce(_hbx_pfn(raw -> 12), 0), coalesce(_hbx_pfn(raw -> 13), 0)))
    order by case tbl when 'mk' then 0 else 1 end, rn), '[]'::jsonb) into bk from nn;
  -- الدفعات (+ البيانات المحاسبية)
  onlyk := coalesce(nullif(_hbx_autodate(to_jsonb(_glw_setting('hb_gl_only_from'))), ''), '');
  if onlyk <> '' then onlyk := substr(onlyk, 7, 4) || substr(onlyk, 4, 2) || substr(onlyk, 1, 2); end if;
  with p as (
    select s.rn, s.raw, _hbx_autodate(s.raw -> 0) dt, _glx_str(s.raw -> 1) party, _glx_str(s.raw -> 7) pid, _glx_str(s.raw -> 9) lid, _hbx_autodate(s.raw -> 6) d6 from hb_snap s where s.tbl = 'pay' and s.rn >= 2),
  q as (select *, substr(dt, 7, 4) || substr(dt, 4, 2) || substr(dt, 1, 2) dk, case when d6 <> '' then substr(d6, 7, 4) || substr(d6, 4, 2) || substr(d6, 1, 2) end d6k from p
         where party <> '' and dt <> '' and pid !~ '^GL:' and lid !~ '^GL:'),
  f as (select * from q where not (onlyk <> '' and dk >= onlyk and pid !~ '^CUSTODY:' and not (coalesce(_glx_str(raw -> 6), '') <> '' and d6k is not null and d6k < onlyk))),
  mt as (select m.rn, _glx_str(m.raw -> 0) id, _glx_str(m.raw -> 1) cash, _glx_str(m.raw -> 2) cur, _glx_num(m.raw -> 3) amt, _glx_str(m.raw -> 4) by_ from hb_snap m where m.tbl = 'meta' and m.rn >= 2),
  mm as (select distinct on (id) id, cash, cur, amt, by_ from mt where id <> '' and cash <> '' order by id, rn desc)
  select coalesce(jsonb_agg(jsonb_build_object('id', coalesce(nullif(f.pid, ''), 'row' || f.rn), 'date', f.dt, 'party', f.party, 'dir', _glx_str(f.raw -> 2), 'amount', coalesce(_hbx_pfn(f.raw -> 3), 0),
      'note', _glx_str(f.raw -> 4), 'qaid', case when _glx_str(f.raw -> 5) ~ '^JE-\d{6}$' then '' else _glx_str(f.raw -> 5) end, 'linkId', f.lid)
      || coalesce((select jsonb_build_object('meta', jsonb_build_object('cash', mm.cash, 'cur', case when mm.cur <> '' then _glx_cur(to_jsonb(mm.cur)) else 'SAR' end, 'amount', mm.amt, 'by', mm.by_, 'src', 'hotel'))
                     from mm where mm.id = nullif(f.pid, '') limit 1), '{}'::jsonb) order by f.rn), '[]'::jsonb) into pays from f;
  -- بيانات الحسابات (آخر صف لنفس الاسم المطبَّع يغلب)
  select coalesce(jsonb_object_agg(k, v), '{}'::jsonb) into prof from (
    select distinct on (_hbx_key(_glx_str(s.raw -> 0))) _hbx_key(_glx_str(s.raw -> 0)) k,
           jsonb_build_object('name', _glx_str(s.raw -> 0), 'type', _glx_str(s.raw -> 1), 'notes', _glx_str(s.raw -> 2), 'agent', _glx_str(s.raw -> 4), 'role', _glx_str(s.raw -> 5), 'code', _glx_str(s.raw -> 6)) v
      from hb_snap s where s.tbl = 'prof' and s.rn >= 2 and _glx_str(s.raw -> 0) not in ('', '-') order by _hbx_key(_glx_str(s.raw -> 0)), s.rn desc) z;
  return jsonb_build_object('bookings', bk, 'pays', pays, 'prof', prof, 'syncedAt', ts, 'ageSec', extract(epoch from now() - ts)::int);
end $$;

create or replace function glx_hb_read() returns jsonb language plpgsql stable security definer set search_path = public as
$$ begin perform _glx_need('hb'); return jsonb_build_object('success', true) || hbx_read_raw(); end $$;
revoke all on function hbx_read_raw() from public, anon, authenticated; grant execute on function hbx_read_raw() to service_role;
revoke all on function glx_hb_read() from public, anon; grant execute on function glx_hb_read() to authenticated, service_role;

-- تجديد «آخر تأكيد» للجداول التي لم تتغيّر (بصمتها مطابقة): يبقي عمر النسخة صغيراً دون إعادة رفع
create or replace function hb_snap_touch(p_hashes jsonb) returns int language plpgsql volatile security definer set search_path = public as
$$ declare n int; begin
  update hb_snap_meta m set synced_at = now() from jsonb_each_text(coalesce(p_hashes, '{}'::jsonb)) h where m.tbl = h.key and m.hash = h.value;
  get diagnostics n = row_count; return n; end $$;
revoke all on function hb_snap_touch(jsonb) from public, anon, authenticated; grant execute on function hb_snap_touch(jsonb) to service_role;

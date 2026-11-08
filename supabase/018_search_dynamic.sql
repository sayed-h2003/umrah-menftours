-- 018_search_dynamic.sql — (V4.381) searchDynamicBookings من Postgres (الشاشة تستدعيه بلا فلاتر وتفلتر محلياً)
-- نفس مخرجات Code.gs: كائن لكل صف مفتاحه عنوان العمود الفعلي؛ التواريخ dd/MM/yyyy؛ أعمدة (ساعة|وقت|time) ⇒ HH:mm.
-- أي فلتر غير فارغ ⇒ 0A000 فيعود المتصفح لـ Apps Script (السلوك الأصلي). يتطلب 007. آمن لإعادة التشغيل.
create or replace function _sd_val(h text, c jsonb) returns jsonb language sql immutable as
$$ select case
     when c is null or c = 'null'::jsonb then '""'::jsonb
     when h ilike '%ساعة%' or h ilike '%وقت%' or h ilike '%time%' then
          case when not _rx_truthy(c) and not (jsonb_typeof(c) = 'number') then '""'::jsonb
               when jsonb_typeof(c) = 'number' then
                    (select to_jsonb(lpad(((m / 60) % 24)::text, 2, '0') || ':' || lpad((m % 60)::text, 2, '0')) from (select round((c #>> '{}')::numeric * 1440)::int m) q)
               else to_jsonb(_bk_time(c)) end
     when jsonb_typeof(c) = 'object' and c ? '$d' then to_jsonb(to_char(to_timestamp(floor((c ->> '$d')::float8 / 1000.0)) at time zone 'Africa/Cairo', 'DD/MM/YYYY'))
     else c end $$;

create or replace function rx2_searchdynamicbookings(a jsonb, u text) returns jsonb language plpgsql stable set search_path = public as
$$ declare f jsonb := coalesce(a -> 1, '{}'::jsonb); hd jsonb := _rx_hdr('bookings'); res jsonb; k text; v jsonb; begin
  if jsonb_typeof(f) = 'object' then
    for k, v in select * from jsonb_each(f) loop
      if _rx_truthy(v) then raise exception 'فلاتر غير مدعومة بالمسار السريع' using errcode = '0A000'; end if;
    end loop;
  end if;
  select coalesce(jsonb_agg(o order by rn), '[]'::jsonb) into res from (
    select r.rn, (select jsonb_object_agg(_rx_s(h.v), _sd_val(_rx_s(h.v), r.raw -> (h.i - 1)::int) order by h.i)
                    from jsonb_array_elements(hd) with ordinality h(v, i)) o
      from _rx_rows('bookings') r where r.rn > 1) x;
  return res; end $$;
grant execute on function _sd_val(text, jsonb), rx2_searchdynamicbookings(jsonb, text) to service_role;
notify pgrst, 'reload schema';

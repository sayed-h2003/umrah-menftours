-- V4.423: خريطة صلاحيات الحجوزات للمدير (hbUsersMap) من Postgres — كانت 7.5 ث × مرتين بـApps Script.
-- مصدرها شيت «المستخدمون» ببرنامج الحجوزات: تُرفع نسخة قراءة منه ضمن لقطة 046 (بعد حجب الملح وكلمة المرور) ويحسبها Postgres بنفس userRecordFromRow_.
-- يتطلب 046. أعد تعريف hb_snap_put لقبول الجدول الجديد hbusers.
create or replace function hb_snap_put(p_tbl text, p_part int, p_parts int, p_rows jsonb, p_hash text) returns jsonb
language plpgsql volatile security definer set search_path = public as
$$ declare n int; begin
  if p_tbl !~ '^(mk|md|pay|meta|prof|hbusers)$' then raise exception 'جدول غير مدعوم: %', p_tbl; end if;
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

create or replace function rx2_hbusersmap(a jsonb, u text) returns jsonb language plpgsql stable set search_path = public as
$$ #variable_conflict use_column
declare scr text[] := array['statement', 'bookings', 'arrivals', 'balancesReport', 'statsReport', 'payments', 'clientPortal', 'settings', 'changelog'];
  lbl jsonb := '{"statement":"كشف الحساب","bookings":"كل الحجوزات","arrivals":"متابعة الأرصدة","balancesReport":"بيان الأرصدة بتاريخ محدد","statsReport":"الإحصائيات","payments":"الدفعات","clientPortal":"بوابة العملاء","settings":"الإعدادات","changelog":"سجل التعديلات"}';
  lv text[] := array['none', 'view', 'add', 'edit', 'delete']; lvl jsonb := '{"none":"بدون","view":"عرض","add":"إضافة","edit":"تعديل","delete":"حذف"}';
  fl text[] := array['none', 'cost', 'sale', 'diff']; fll jsonb := '{"none":"بدون","cost":"أسعار وإجمالي التكلفة","sale":"أسعار وإجمالي البيع (وتشمل التكلفة)","diff":"الفرق (وتشمل البيع والتكلفة)"}';
  r record; saved jsonb; adm boolean; perms jsonb; s text; v jsonb; out jsonb := '{}'::jsonb; fin text; cs text; txt text; synced timestamptz; begin
  if not app_has('admin') then raise exception 'للمدير فقط' using errcode = '42501'; end if;
  select synced_at into synced from hb_snap_meta where tbl = 'hbusers';
  if synced is null or now() - synced > interval '300 seconds' then raise exception 'نسخة مستخدمي الحجوزات غير جاهزة أو قديمة' using errcode = '55000'; end if;
  for r in select rn, raw from hb_snap where tbl = 'hbusers' and rn >= 2 order by rn loop
    if btrim(_glx_str(r.raw -> 0)) = '' then continue; end if;
    txt := case when jsonb_typeof(r.raw -> 5) = 'string' then r.raw ->> 5 else '{}' end;
    begin saved := txt::jsonb; if jsonb_typeof(saved) <> 'object' then saved := '{}'; end if; exception when others then saved := '{}'::jsonb; end;
    adm := (r.raw ->> 4) = 'admin'; perms := '{}'::jsonb;
    foreach s in array scr loop
      v := saved -> s;
      perms := perms || jsonb_build_object(s, case when adm then 'delete' when v = 'true'::jsonb then 'edit' when jsonb_typeof(v) = 'string' and (v #>> '{}') = any (lv) then v #>> '{}' else 'none' end);
    end loop;
    cs := case when not adm and (saved ->> 'bookingCityScope') in ('مكة', 'المدينة') then saved ->> 'bookingCityScope' else 'all' end;
    fin := case when not adm and (saved ->> 'financeLevel') = any (fl) then saved ->> 'financeLevel' when adm then 'diff' else 'none' end;
    out := out || jsonb_build_object(lower(btrim(_glx_str(r.raw -> 0))), jsonb_build_object('username', _glx_str(r.raw -> 0), 'displayName', coalesce(nullif(_glx_str(r.raw -> 1), ''), _glx_str(r.raw -> 0)),
      'role', case when adm then 'admin' else 'user' end, 'permissions', perms, 'bookingCityScope', cs, 'financeLevel', fin,
      'accountScope', case when not adm and (saved ->> 'accountScope') = 'restricted' then 'restricted' else 'all' end, 'active', not (r.raw -> 6 = 'false'::jsonb)));
  end loop;
  return jsonb_build_object('success', true, 'users', out,
    'screens', (select jsonb_agg(jsonb_build_array(k, lbl ->> k)) from unnest(scr) k),
    'levels', (select jsonb_agg(jsonb_build_array(k, lvl ->> k)) from unnest(lv) k),
    'finance', (select jsonb_agg(jsonb_build_array(k, fll ->> k)) from unnest(fl) k)); end $$;
revoke all on function hb_snap_put(text, int, int, jsonb, text), rx2_hbusersmap(jsonb, text) from public, anon, authenticated;
grant execute on function hb_snap_put(text, int, int, jsonb, text), rx2_hbusersmap(jsonb, text) to service_role;

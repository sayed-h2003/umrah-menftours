-- V4.424: بيانات الحجز بكشف الحساب (glStatementHb) من Postgres — كانت ≈8 ث بـApps Script بعد ظهور الكشف السريع.
-- تقرأ صفوف الكشف (hbKey) من glx_statement_raw ومعها حجوزات نسخة 046 (hbx_read_raw): byKey لبيانات كل حجز + unpriced = حجوزات الطرف بلا سعر.
-- يتطلب 005 و046. أي نسخة غير جاهزة/قديمة (> 5 دقائق) ⇒ 55000 ⇒ Apps Script.
create or replace function glx_statement_hb_raw(p_code text, p_from text default '', p_to text default '') returns jsonb
language plpgsql stable set search_path = public as
$$ #variable_conflict use_column
declare v_code text := _glx_trim(p_code); st jsonb; hbr jsonb; v_hbn jsonb; keys jsonb := '{}'::jsonb; bk jsonb; byk jsonb := '{}'::jsonb; unp jsonb := '[]'::jsonb; b jsonb; r jsonb; h jsonb; hasHb boolean := false;
  fromk text := _glx_dkey(_glx_date(to_jsonb(coalesce(p_from, '')))); tok text := _glx_dkey(_glx_date(to_jsonb(coalesce(p_to, '')))); bkk text; ck boolean; sk boolean; miss boolean; n jsonb; begin
  st := glx_statement_raw(v_code, p_from, p_to, '{"fast":true}'::jsonb, null);
  v_hbn := coalesce(_glx_aux('hbnames') -> v_code, '[]'::jsonb);
  for r in select * from jsonb_array_elements(st -> 'rows') loop if coalesce(r ->> 'hbKey', '') <> '' then hasHb := true; exit; end if; end loop;
  if not hasHb and jsonb_array_length(v_hbn) = 0 then return jsonb_build_object('success', true, 'code', v_code, 'byKey', '{}'::jsonb, 'unpriced', '[]'::jsonb); end if;
  hbr := hbx_read_raw();
  if coalesce((hbr ->> 'ageSec')::int, 99999) > 300 then raise exception 'نسخة الحجوزات قديمة' using errcode = '55000'; end if;
  select coalesce(jsonb_object_agg(b2 ->> 'key', b2), '{}'::jsonb) into bk from jsonb_array_elements(hbr -> 'bookings') b2;
  for n in select * from jsonb_array_elements(v_hbn) loop
    keys := keys || jsonb_build_object(_hbx_key(n ->> 'name'), case when (n ->> 'type') ~ 'مورد|شارت' then 'supplier' else 'client' end);
  end loop;
  for r in select * from jsonb_array_elements(st -> 'rows') loop
    if coalesce(r ->> 'hbKey', '') = '' then continue; end if;
    b := bk -> (r ->> 'hbKey'); if b is null then continue; end if;
    byk := byk || jsonb_build_object(r ->> 'hbKey', jsonb_build_object('ref', coalesce(nullif(b ->> 'hotelRef', ''), b ->> 'inner', ''), 'inner', b ->> 'inner', 'hotel', b ->> 'hotel', 'city', b ->> 'city',
      'ci', b ->> 'ci', 'co', b ->> 'co', 'nights', (b ->> 'nights')::float8, 'rooms', (select coalesce(sum(x::float8), 0) from jsonb_array_elements_text(b -> 'rooms') x), 'client', b ->> 'client', 'supplier', b ->> 'supplier'));
  end loop;
  for b in select * from jsonb_array_elements(hbr -> 'bookings') loop
    if b ->> 'status' = 'لاغي' then continue; end if;
    ck := keys ->> _hbx_key(b ->> 'client') = 'client'; sk := keys ->> _hbx_key(b ->> 'supplier') = 'supplier';
    miss := (ck and not coalesce((b -> 'sale' ->> 'hasPrice')::boolean, false) and coalesce((b -> 'sale' ->> 'rooms')::boolean, false))
         or (sk and not coalesce((b -> 'cost' ->> 'hasPrice')::boolean, false) and coalesce((b -> 'cost' ->> 'rooms')::boolean, false));
    bkk := _glx_dkey(b ->> 'ci');
    if not miss or (tok <> '' and bkk collate "C" > tok collate "C") or (fromk <> '' and bkk collate "C" < fromk collate "C") then continue; end if;
    unp := unp || jsonb_build_array(jsonb_build_object('ref', coalesce(nullif(b ->> 'hotelRef', ''), b ->> 'inner', ''), 'hotel', b ->> 'hotel', 'city', b ->> 'city', 'ci', b ->> 'ci', 'co', b ->> 'co',
      'nights', (b ->> 'nights')::float8, 'rooms', (select coalesce(sum(x::float8), 0) from jsonb_array_elements_text(b -> 'rooms') x), 'client', b ->> 'client', 'supplier', b ->> 'supplier'));
  end loop;
  return jsonb_build_object('success', true, 'code', v_code, 'byKey', byk, 'unpriced', unp); end $$;
revoke all on function glx_statement_hb_raw(text, text, text) from public, anon, authenticated; grant execute on function glx_statement_hb_raw(text, text, text) to service_role;
create or replace function glx_statement_hb(p_code text, p_from text default '', p_to text default '') returns jsonb language plpgsql stable security definer set search_path = public as
$$ begin perform _glx_need('stmt'); return glx_statement_hb_raw(p_code, p_from, p_to); end $$;
revoke all on function glx_statement_hb(text, text, text) from public, anon; grant execute on function glx_statement_hb(text, text, text) to authenticated, service_role;

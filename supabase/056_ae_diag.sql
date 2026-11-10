-- V4.431: تشخيص مولّد البنود (للقراءة، service_role فقط) — يعيد ما يراه Postgres فعلاً لعميل×رحلة: تاريخ الذهاب، صف التسعير، سعر كل بند بذلك التاريخ، مجموعات التأشيرات، وأسماء رحلات المعتمرين لهذا العميل
create or replace function ae_diag(p_client text, p_trip text) returns jsonb language plpgsql stable security definer set search_path = public as
$$ declare tx jsonb := _rx_map('trips', _rx_h_trips()); ix jsonb := _pm_ix(); dep text; cp jsonb; trips jsonb; k text; pr jsonb := '{}'::jsonb; rowc int; hdr jsonb;
begin
  select _ae_dfmt(_rx_c(t.raw, (tx ->> 'تاريخ الذهاب')::int)) into dep from _rx_rows('trips') t where _rx_trim(_rx_s(_rx_c(t.raw, (tx ->> 'اسم الرحلة')::int))) = p_trip order by t.rn limit 1;
  cp := _ae_json_row('acc_client_prices', p_client);
  select count(*) into rowc from _rx_rows('trips') t where _rx_trim(_rx_s(_rx_c(t.raw, (tx ->> 'اسم الرحلة')::int))) = p_trip;
  if cp is not null and jsonb_typeof(cp -> 'items') = 'object' then
    for k in select jsonb_object_keys(cp -> 'items') loop pr := pr || jsonb_build_object(k, _ae_price_at(cp, k, coalesce(dep, ''))); end loop;
  end if;
  select coalesce(jsonb_agg(distinct _rx_trim(_rx_s(_rx_c(p.raw, (ix ->> 'tripName')::int)))), '[]'::jsonb) into trips
    from _rx_rows('pilgrims') p where _rx_trim(_rx_s(_rx_c(p.raw, (ix ->> 'client')::int))) = p_client;
  return jsonb_build_object('dep', dep, 'tripRows', rowc, 'hasPricingRow', cp is not null, 'priceAtDep', pr, 'vz', _ae_vz_groups(p_client, p_trip), 'clientTrips', trips, 'tripsMap', tx);
end $$;
revoke all on function ae_diag(text, text) from public, anon, authenticated;
grant execute on function ae_diag(text, text) to service_role;

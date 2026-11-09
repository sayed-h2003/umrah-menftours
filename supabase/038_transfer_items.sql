-- 038: transferAccItemsBulk من Postgres — نقل حجوزات فنادق (بنود ⟦src:HB.…⟧) بين رحلات لعميل واحد. يتطلب 029 (_acc_dvs).
-- • نفس قيود Code.gs: بنود حجوزات الفنادق فقط · عميل واحد · الرحلة الهدف بنمط «بنود» لهذا العميل (ما عدا «عام»)
-- • مزامنة الرحلتين (حذف تقديرات السكن/إعادتها) = محرك _syncTripAccounts_ بـApps Script: بند accsync بصندوق الإخراج ينفّذه المتصفح فوراً بـaccSyncBg وإلا _outboxDrain_ بعد ~دقيقتين.
create or replace function rw2_transferaccitemsbulk(a jsonb, u text) returns jsonb language plpgsql volatile set search_path = public as
$$ declare ids jsonb := a -> 1; tt text := btrim(coalesce(a ->> 2, '')); who text := coalesce(u, app_user(), '-'); r record; idset text[]; client text := ''; cl text; fr text; rids text[] := '{}'; froms jsonb := '{}'::jsonb; n int := 0; mode_ text := ''; trips jsonb; jid bigint; begin
  if not app_has('accounts.edit') then raise exception 'لا تملك صلاحية' using errcode = '42501'; end if;
  if tt = '' then return jsonb_build_object('success', false, 'error', 'حدّد الرحلة الهدف'); end if;
  if jsonb_typeof(ids) is distinct from 'array' or jsonb_array_length(ids) = 0 then return jsonb_build_object('success', false, 'error', 'لا توجد حجوزات محددة'); end if;
  select array_agg(case when jsonb_typeof(x) = 'string' then x #>> '{}' else x::text end) into idset from jsonb_array_elements(ids) x;
  perform pg_advisory_xact_lock(hashtextextended('store:put:acc_items', 0));
  if not exists (select 1 from store_rows where tbl = 'acc_items') then return jsonb_build_object('success', false, 'error', 'لا توجد بنود'); end if;
  for r in select rid, raw from store_rows where tbl = 'acc_items' order by ord, rid loop
    if not (_rx_s(_rx_c(r.raw, 0)) = any(idset)) then continue; end if;
    if _rx_s(_rx_c(r.raw, 3)) !~ '⟦src:HB\.([A-Za-z0-9_-]+)⟧' then return jsonb_build_object('success', false, 'error', 'النقل متاح لبنود حجوزات الفنادق فقط'); end if;
    cl := _rx_trim(_rx_s(_rx_c(r.raw, 1)));
    if client <> '' and cl <> client then return jsonb_build_object('success', false, 'error', 'الحجوزات المحددة لأكثر من عميل'); end if;
    client := cl;
    fr := coalesce(nullif(_rx_trim(_rx_s(_rx_c(r.raw, 2))), ''), 'عام');
    if fr = tt then continue; end if;
    froms := froms || jsonb_build_object(fr, true); rids := rids || r.rid; n := n + 1;
  end loop;
  if n = 0 then return jsonb_build_object('success', false, 'error', 'لا توجد حجوزات صالحة للنقل (ربما بالفعل بهذه الرحلة)'); end if;
  if tt <> 'عام' then
    select coalesce(max(_rx_trim(_rx_s(_rx_c(raw, 2)))), '') into mode_ from store_rows where tbl = 'acc_meta' and _rx_trim(_rx_s(_rx_c(raw, 0))) = client and _rx_trim(_rx_s(_rx_c(raw, 1))) = tt;
    if mode_ <> 'بنود' then return jsonb_build_object('success', false, 'error', 'الرحلة «' || tt || '» ليست بنمط «بنود» لهذا العميل — حوّل نمطها لـ«بنود» أولاً (الحجوزات بالريال تُسجَّل ببنود الرحلة)'); end if;
  end if;
  update store_rows set raw = jsonb_set(raw, '{2}', to_jsonb(tt)) where tbl = 'acc_items' and rid = any(rids);
  update store_meta set ver = ver + 1, updated_at = now() where tbl = 'acc_items';
  insert into app_outbox (kind, payload) values ('audit', jsonb_build_object('user', who, 'action', 'نقل حجوزات فنادق بين رحلات', 'record', client, 'field', 'البنود',
    'old', (select string_agg(k, '، ') from jsonb_object_keys(froms) k), 'new', n || ' حجز → ' || tt));
  trips := (select coalesce(jsonb_agg(k), '[]'::jsonb) from (select k from jsonb_object_keys(froms) k union select tt) z where k <> '' and k <> 'عام');
  if jsonb_array_length(trips) > 0 then
    insert into app_outbox (kind, payload) values ('accsync', jsonb_build_object('trips', trips, 'user', who, 'at', extract(epoch from now()))) returning id into jid;
  end if;
  perform _w_dv_bump(_acc_dvs());
  return jsonb_build_object('success', true, 'count', n, 'resynced', 0, 'job', jid, 'trips', trips); end $$;

revoke all on function rw2_transferaccitemsbulk(jsonb, text) from public, anon, authenticated;
grant execute on function rw2_transferaccitemsbulk(jsonb, text) to service_role;

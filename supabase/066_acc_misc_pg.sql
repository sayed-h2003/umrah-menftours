-- V4.443: دوال كانت Apps Script فقط ظهرت بالاستخدام اليومي — markNotificationRead · getClientPricing · saveClientPricing · getClientsWithAlerts
-- يتطلب 058 (_ac_stats_hash) و029 (_acc_dvs) و012 (_acc_perm_view).

-- ===== تعليم تنبيه كمقروء (= Code.gs markNotificationRead: العمود 7 «مقروء؟» = نعم) =====
create or replace function rw2_marknotificationread(a jsonb, u text) returns jsonb language plpgsql volatile set search_path = public as
$$ declare id_ text := _rx_s(a -> 1); rid_ text; raw_ jsonb; begin
  if app_user() is null then raise exception 'غير مصرّح' using errcode = '42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended('store:put:notifications', 0));
  select rid, raw into rid_, raw_ from store_rows where tbl = 'notifications' and _rx_s(_rx_c(raw, 0)) = id_ order by ord limit 1;
  if rid_ is null then return jsonb_build_object('success', false); end if;
  while jsonb_array_length(raw_) < 7 loop raw_ := raw_ || to_jsonb(''::text); end loop;
  update store_rows set raw = jsonb_set(raw_, '{6}', to_jsonb('نعم'::text)) where tbl = 'notifications' and rid = rid_;
  update store_meta set ver = ver + 1, updated_at = now() where tbl = 'notifications';
  return jsonb_build_object('success', true); end $$;

-- ===== تسعير بنود العميل =====
create or replace function _acc_bond_base() returns jsonb language sql immutable as
$$ select '[{"key":"رسوم غرفة","cur":"EGP"},{"key":"رسوم غرفة المشرف","cur":"EGP"},{"key":"رسوم غرفة VIP","cur":"EGP"},{"key":"تجديد باركود","cur":"EGP"},
  {"key":"تأشيرة وباركود","cur":"EGP"},{"key":"إشراف","cur":"EGP"},{"key":"تذاكر","cur":"EGP"},{"key":"تذاكر الأطفال","cur":"EGP"},{"key":"تذاكر الرضع","cur":"EGP"},
  {"key":"تأشيرات","cur":"SAR"},{"key":"نقل سعودي","cur":"SAR"},{"key":"سكن المدينة","cur":"SAR"},{"key":"سكن مكة","cur":"SAR"},{"key":"بدلات المشرف","cur":"SAR"},
  {"key":"تأشيرة المشرف","cur":"SAR"},{"key":"شركة","cur":"EGP"},{"key":"ضرائب","cur":"EGP"},{"key":"رسوم التنفيذ","cur":"EGP"},{"key":"الإعاشة","cur":"SAR"}]'::jsonb $$;
create or replace function rx2_getclientpricing(a jsonb, u text) returns jsonb language plpgsql stable set search_path = public as
$$ declare cl text := _rx_trim(_rx_s(a -> 1)); begin
  perform _acc_perm_view();
  if cl = '' then raise exception 'اسم العميل مطلوب' using errcode = 'P0001'; end if;
  return jsonb_build_object('success', true, 'pricing', _ae_json_row('acc_client_prices', cl), 'baseItems', _acc_bond_base()); end $$;
create or replace function rw2_saveclientpricing(a jsonb, u text) returns jsonb language plpgsql volatile set search_path = public as
$$ declare cl text := _rx_trim(_rx_s(a -> 1)); pr jsonb := coalesce(a -> 2, '{}'::jsonb); who text := coalesce(u, app_user(), '-'); clean jsonb := '{}'::jsonb; k text; src jsonb; per jsonb;
  p jsonb; price float8; fr text; t text; ni int := 0; np int := 0; rid_ text; nowj jsonb := jsonb_build_object('$d', (extract(epoch from clock_timestamp()) * 1000)::bigint); begin
  if not app_has('accounts.edit') then raise exception 'لا تملك صلاحية تعديل حسابات العملاء' using errcode = '42501'; end if;
  if cl = '' then raise exception 'اسم العميل مطلوب' using errcode = 'P0001'; end if;
  for k, src in select * from jsonb_each(case when jsonb_typeof(pr -> 'items') = 'object' then pr -> 'items' else '{}'::jsonb end) loop
    if btrim(k) = '' then continue; end if;
    per := '[]'::jsonb;
    for p in select * from jsonb_array_elements(case when jsonb_typeof(src -> 'periods') = 'array' then src -> 'periods' else '[]'::jsonb end) loop
      price := _ac_num(p -> 'price'); fr := btrim(coalesce(p ->> 'from', '')); t := btrim(coalesce(p ->> 'to', ''));
      if coalesce(price, 0) = 0 or fr !~ '^\d{1,2}/\d{1,2}/\d{4}$' then continue; end if;
      if t <> '' and t !~ '^\d{1,2}/\d{1,2}/\d{4}$' then t := ''; end if;
      per := per || jsonb_build_array(jsonb_build_object('price', price, 'from', fr, 'to', t));
    end loop;
    if jsonb_array_length(per) = 0 then continue; end if;
    clean := clean || jsonb_build_object(btrim(k), jsonb_build_object('currency', case when src ->> 'currency' = 'SAR' then 'SAR' else 'EGP' end, 'periods', per));
    ni := ni + 1; np := np + jsonb_array_length(per);
  end loop;
  clean := jsonb_build_object('items', clean);
  perform pg_advisory_xact_lock(hashtextextended('store:put:acc_client_prices', 0));
  select rid into rid_ from store_rows where tbl = 'acc_client_prices' and _rx_trim(_rx_s(_rx_c(raw, 0))) = cl order by ord, rid limit 1;
  if rid_ is null then
    insert into store_rows (tbl, rid, ord, raw) select 'acc_client_prices', substr(md5(random()::text || clock_timestamp()::text || cl), 1, 20), coalesce(max(ord), 0) + 1,
      jsonb_build_array(cl, clean::text, who, nowj) from store_rows where tbl = 'acc_client_prices';
  else update store_rows set raw = jsonb_build_array(cl, clean::text, who, nowj) where tbl = 'acc_client_prices' and rid = rid_; end if;
  update store_meta set ver = ver + 1, updated_at = now() where tbl = 'acc_client_prices';
  insert into app_outbox (kind, payload) values ('audit', jsonb_build_object('user', who, 'action', 'حفظ تسعير بنود عميل', 'record', cl, 'field', 'ClientAccounts_ClientPrices', 'old', '-',
    'new', ni || ' بند / ' || np || ' فترة سعر'));
  perform _w_dv_bump(_acc_dvs());
  return jsonb_build_object('success', true, 'itemsCount', ni); end $$;

-- ===== عملاء لهم تنبيهات تغيّر أعداد/تسكين (= getClientsWithAlerts) — كل لقطات الأعداد بمرور واحد على المعتمرين =====
create or replace function rx2_getclientswithalerts(a jsonb, u text) returns jsonb language plpgsql stable set search_path = public as
$$ declare pm jsonb := _rx_map('pilgrims', _rx_h_pil()); res jsonb; begin
  if app_user() is null then raise exception 'غير مصرّح' using errcode = '42501'; end if;
  with mt as (select rn, _rx_trim(_rx_s(_rx_c(raw, _rx_ix(pm, 'العميل')))) cl, _rx_trim(_rx_s(_rx_c(raw, _rx_ix(pm, 'اسم الرحلة')))) tr,
                     _rx_trim(_rx_s(_rx_c(raw, _rx_ix(pm, 'النوع')))) ty, _rx_trim(_rx_s(_rx_c(raw, _rx_ix(pm, 'فندق المدينة')))) hm,
                     _rx_trim(_rx_s(_rx_c(raw, _rx_ix(pm, 'فندق مكة')))) hk, _rx_trim(_rx_s(_rx_c(raw, _rx_ix(pm, 'طبيعة التسكين')))) ac
                from _rx_rows('pilgrims') where _rx_trim(_rx_s(_rx_c(raw, _rx_ix(pm, 'اسم المعتمر')))) <> ''),
       me as (select distinct _rx_trim(_rx_s(_rx_c(raw, 0))) cl, _rx_trim(_rx_s(_rx_c(raw, 1))) tr from _rx_rows('acc_meta') where _rx_s(_rx_c(raw, 3)) <> ''),
       pm2 as (select mt.* from mt join me using (cl, tr)),
       tt as (select cl, tr, count(*) filter (where ty not in ('طفل', 'رضيع')) a_, count(*) filter (where ty = 'طفل') c_, count(*) filter (where ty = 'رضيع') i_, count(*) t_ from pm2 group by cl, tr),
       hk_ as (select cl, tr, k, count(*) n, min(rn) f from (select cl, tr, rn, 'M:' || hm k from pm2 where hm <> '' union all select cl, tr, rn, 'K:' || hk from pm2 where hk <> '') x group by cl, tr, k),
       ac_ as (select cl, tr, ac k, count(*) n, min(rn) f from pm2 where ac <> '' group by cl, tr, ac),
       cur as (select tt.cl, tt.tr, '{"a":' || a_ || ',"c":' || c_ || ',"i":' || i_ || ',"t":' || t_
                 || ',"hotels":{' || coalesce((select string_agg(to_json(k)::text || ':' || n, ',' order by f) from hk_ where hk_.cl = tt.cl and hk_.tr = tt.tr), '') || '}'
                 || ',"accom":{' || coalesce((select string_agg(to_json(k)::text || ':' || n, ',' order by f) from ac_ where ac_.cl = tt.cl and ac_.tr = tt.tr), '') || '}}' h from tt),
       m as (select _rx_trim(_rx_s(_rx_c(raw, 0))) cl, _rx_trim(_rx_s(_rx_c(raw, 1))) tr, _rx_s(_rx_c(raw, 3)) snap, _rx_s(_rx_c(raw, 4)) rh from _rx_rows('acc_meta')
              where _rx_trim(_rx_s(_rx_c(raw, 0))) <> '' and _rx_trim(_rx_s(_rx_c(raw, 1))) <> '' and _rx_s(_rx_c(raw, 3)) <> ''),
       hit as (select m.cl from m join cur on cur.cl = m.cl and cur.tr = m.tr
                where position('"hotels"' in m.snap) > 0 and m.snap <> cur.h and m.rh <> cur.h)
  select coalesce(jsonb_agg(jsonb_build_object('client', cl, 'count', n) order by n desc, cl), '[]'::jsonb) into res from (select cl, count(*) n from hit group by cl) z;
  return jsonb_build_object('success', true, 'clients', res); end $$;

do $$ declare r record; begin
  for r in select p.oid::regprocedure::text sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname in ('rw2_marknotificationread', '_acc_bond_base', 'rx2_getclientpricing', 'rw2_saveclientpricing', 'rx2_getclientswithalerts') loop
    execute format('revoke all on function %s from public, anon, authenticated', r.sig);
    execute format('grant execute on function %s to service_role', r.sig);
  end loop;
end $$;

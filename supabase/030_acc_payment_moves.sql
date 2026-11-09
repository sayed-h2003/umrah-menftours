-- 030: نقل دفعة/دفعات بين رحلات + تعديل دفعات رحلة جماعياً من Postgres (يكمل 029). مفتاح التفعيل نفسه supaWriteOnBookings() (wbk).
-- الرحلة الهدف ≠ «عام» بلا صف meta للعميل ⇒ 0A000 ⇒ Apps Script (إنشاء meta يحتاج لقطة الأعداد). لقطات الاسترجاع/التدقيق بصندوق الإخراج كما 029.
create or replace function rw2_transferaccpayment(a jsonb, u text) returns jsonb language plpgsql volatile set search_path = public as
$$ declare id text := _rx_s(a -> 1); tt text := btrim(coalesce(a ->> 2, '')); who text := coalesce(u, app_user(), '-'); rid_ text; raw_ jsonb; cl text; ft text; begin
  if not app_has('accounts.edit') then raise exception 'لا تملك صلاحية' using errcode = '42501'; end if;
  if tt = '' then return jsonb_build_object('success', false, 'error', 'حدّد الرحلة الهدف'); end if;
  perform pg_advisory_xact_lock(hashtextextended('store:put:acc_payments', 0));
  if not exists (select 1 from store_rows where tbl = 'acc_payments') then return jsonb_build_object('success', false, 'error', 'لا توجد دفعات'); end if;
  select rid, raw into rid_, raw_ from store_rows where tbl = 'acc_payments' and _rx_s(_rx_c(raw, 0)) = id limit 1;
  if rid_ is null then return jsonb_build_object('success', false, 'error', 'الدفعة غير موجودة'); end if;
  cl := _rx_s(_rx_c(raw_, 1)); ft := _rx_s(_rx_c(raw_, 2));
  if ft = tt then return jsonb_build_object('success', false, 'error', 'الدفعة بالفعل بهذه الرحلة'); end if;
  if tt <> 'عام' and not exists (select 1 from store_rows where tbl = 'acc_meta' and btrim(_rx_s(raw -> 0)) = btrim(cl) and btrim(_rx_s(raw -> 1)) = tt) then
    raise exception 'غير مدعوم: لا صف meta' using errcode = '0A000'; end if;
  update store_rows set raw = jsonb_set(raw, '{2}', to_jsonb(tt)) where tbl = 'acc_payments' and rid = rid_;
  update store_meta set ver = ver + 1, updated_at = now() where tbl = 'acc_payments';
  insert into app_outbox (kind, payload) values ('audit', jsonb_build_object('user', who, 'action', 'نقل دفعة بين رحلات', 'record', cl, 'field', 'الدفعات', 'old', coalesce(nullif(ft, ''), 'عام'), 'new', tt));
  perform _w_dv_bump(_acc_dvs());
  return jsonb_build_object('success', true); end $$;

create or replace function rw2_transferaccpaymentsbulk(a jsonb, u text) returns jsonb language plpgsql volatile set search_path = public as
$$ declare ids jsonb := a -> 1; tt text := btrim(coalesce(a ->> 2, '')); who text := coalesce(u, app_user(), '-'); r record; n int := 0; cl text := ''; rids text[] := '{}'; idset text[]; begin
  if not app_has('accounts.edit') then raise exception 'لا تملك صلاحية' using errcode = '42501'; end if;
  if tt = '' then return jsonb_build_object('success', false, 'error', 'حدّد الرحلة الهدف'); end if;
  if jsonb_typeof(ids) is distinct from 'array' or jsonb_array_length(ids) = 0 then return jsonb_build_object('success', false, 'error', 'لا توجد دفعات محددة'); end if;
  select array_agg(case when jsonb_typeof(x) = 'string' then x #>> '{}' else x::text end) into idset from jsonb_array_elements(ids) x;
  perform pg_advisory_xact_lock(hashtextextended('store:put:acc_payments', 0));
  if not exists (select 1 from store_rows where tbl = 'acc_payments') then return jsonb_build_object('success', false, 'error', 'لا توجد دفعات'); end if;
  for r in select rid, raw from store_rows where tbl = 'acc_payments' order by ord, rid loop
    if not (_rx_s(_rx_c(r.raw, 0)) = any(idset)) then continue; end if;
    if _rx_s(_rx_c(r.raw, 2)) = tt then continue; end if;
    cl := coalesce(nullif(_rx_s(_rx_c(r.raw, 1)), ''), cl); rids := rids || r.rid; n := n + 1;
  end loop;
  if n = 0 then return jsonb_build_object('success', false, 'error', 'لا توجد دفعات صالحة للنقل (ربما بالفعل بهذه الرحلة)'); end if;
  if tt <> 'عام' and not exists (select 1 from store_rows where tbl = 'acc_meta' and btrim(_rx_s(raw -> 0)) = btrim(cl) and btrim(_rx_s(raw -> 1)) = tt) then
    raise exception 'غير مدعوم: لا صف meta' using errcode = '0A000'; end if;
  update store_rows set raw = jsonb_set(raw, '{2}', to_jsonb(tt)) where tbl = 'acc_payments' and rid = any(rids);
  update store_meta set ver = ver + 1, updated_at = now() where tbl = 'acc_payments';
  insert into app_outbox (kind, payload) values ('audit', jsonb_build_object('user', who, 'action', 'نقل دفعات متعددة بين رحلات', 'record', cl, 'field', 'الدفعات', 'old', '-', 'new', n || ' دفعة → ' || tt));
  perform _w_dv_bump(_acc_dvs());
  return jsonb_build_object('success', true, 'count', n); end $$;

create or replace function rw2_updateaccpaymentsbulk(a jsonb, u text) returns jsonb language plpgsql volatile set search_path = public as
$$ declare client text := btrim(coalesce(a ->> 1, '')); trip text := btrim(coalesce(a ->> 2, '')); lst jsonb := a -> 3; who text := coalesce(u, app_user(), '-'); p jsonb; rid_ text; oldraw jsonb; amt float8; od text; cfm text; nd text; srcm text; n int := 0; begin
  if not app_has('accounts.edit') then raise exception 'لا تملك صلاحية' using errcode = '42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended('store:put:acc_payments', 0));
  if not exists (select 1 from store_rows where tbl = 'acc_payments') then return jsonb_build_object('success', false, 'error', 'لا توجد دفعات'); end if;
  if jsonb_typeof(lst) is distinct from 'array' then lst := '[]'::jsonb; end if;
  for p in select * from jsonb_array_elements(lst) loop
    select rid, raw into rid_, oldraw from store_rows where tbl = 'acc_payments' and _rx_s(_rx_c(raw, 0)) = _rx_s(p -> 'id') limit 1;
    if rid_ is null then continue; end if;
    amt := coalesce(_bk_pf(p -> 'amount'), 0); if amt <= 0 then continue; end if;
    insert into app_outbox (kind, payload) values ('snaprow', jsonb_build_object('sheet', 'ClientAccounts_Payments', 'key', _rx_s(p -> 'id'), 'row', oldraw, 'action', 'قبل تعديل دفعات جماعي', 'user', who));
    od := _rx_s(_rx_c(oldraw, 8));
    cfm := (regexp_match(od, '⟦cf:[a-z0-9]+⟧', 'i'))[1];
    nd := btrim(coalesce(p ->> 'desc', ''));
    if cfm is not null and position('⟦cf:' in nd) = 0 then nd := nd || ' ' || cfm; end if;
    srcm := (regexp_match(od, '⟦src:gl-[^⟧]+⟧'))[1];
    if srcm is not null and position('⟦src:gl-' in nd) = 0 then nd := btrim(nd || ' ' || srcm); end if;
    update store_rows set raw = jsonb_set(jsonb_set(jsonb_set(jsonb_set(jsonb_set(raw, '{4}', to_jsonb(coalesce(p ->> 'date', ''))), '{5}', to_jsonb(amt)),
        '{6}', to_jsonb(case when (p ->> 'currency') = 'SAR' then 'SAR' else 'EGP' end)), '{7}', '""'::jsonb), '{8}', to_jsonb(nd)) where tbl = 'acc_payments' and rid = rid_;
    n := n + 1;
  end loop;
  if n = 0 then return jsonb_build_object('success', false, 'error', 'لم تُعدَّل أي دفعة'); end if;
  update store_meta set ver = ver + 1, updated_at = now() where tbl = 'acc_payments';
  insert into app_outbox (kind, payload) values ('audit', jsonb_build_object('user', who, 'action', 'تعديل دفعات حساب دفعة واحدة', 'record', client, 'field', trip, 'old', '-', 'new', n || ' دفعة'));
  perform _w_dv_bump(_acc_dvs());
  return jsonb_build_object('success', true, 'count', n); end $$;

do $$ declare r record; begin
  for r in select p.oid::regprocedure::text sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname in ('rw2_transferaccpayment', 'rw2_transferaccpaymentsbulk', 'rw2_updateaccpaymentsbulk') loop
    execute format('revoke all on function %s from public, anon, authenticated', r.sig);
    execute format('grant execute on function %s to service_role', r.sig);
  end loop;
end $$;

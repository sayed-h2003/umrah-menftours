-- 012_acc_reads.sql — (V4.378) قراءات حسابات العملاء من Postgres: getClientsBalances · getTripClientsBalances · getAllClientsSummary · getGeneralPayments
-- نفس JSON الذي ترجعه دوال Code.gs حرفياً (محرك _accResolveFx_/_accCalc_ بالحالة المتسلسلة للتحويلات بنفس ترتيب الجمع العائم).
-- المصدر: store_rows لـ acc_items (ClientAccounts_Items) و acc_payments (ClientAccounts_Payments) بالموضع كالخادم، و pilgrims/trips بالاسم (_rx_map).
-- الصلاحية accounts.view من JWT (كـ _accPerm_). getGeneralPayments تبحث عن رقم القيد بـ gl_entries (مصدرها الحقيقي حين GL_STORE=supabase — يشترط الموجّه '@gl').
-- لم تُنقل (لا يمكن نقلها بأمانة الآن): getClientAccount (أثر جانبي _accHbMirror_ + محرك بنود/سكن/ترحيل ~1000 سطر) · getClientsWithAlerts (يستدعي getClientTripStats ويكتب «ترقية صامتة» بشيت Meta)
--   · getTripAccountsSummary (شلال الدمج _accResolveFx_ على رحلات مدمجة + بيان _accTripStatement_) — تبقى على Apps Script.
-- يتطلب 006 + 007 + 010 (_mf_*/_ac_*/rx_call2). آمن لإعادة التشغيل. لا يكتب شيئاً.

-- ===== أدوات =====
-- parseD بـ _accResolveFx_: ^(\d{1,2})/(\d{1,2})/(\d{4}) (بادئة) ⇒ ms (توقيت القاهرة) وإلا 0
create or replace function _acc_parse_d(s text) returns float8 language plpgsql immutable as
$$ declare m text[]; y int; d date; begin
  m := regexp_match(coalesce(s, ''), '^(\d{1,2})/(\d{1,2})/(\d{4})');
  if m is null then return 0; end if;
  y := m[3]::int; if y < 100 then y := y + 1900; end if;
  d := (make_date(y, 1, 1) + make_interval(months => m[2]::int - 1))::date + (m[1]::int - 1);
  return extract(epoch from (d::timestamp at time zone 'Africa/Cairo')) * 1000; end $$;

-- _accResolveFx_ + _accCalc_ (carryIn = 0): items=[{value,currency,isDiscount}] · pays=[{ptype,date,amount,currency,rate}] بترتيب الشيت
create or replace function _acc_calc(items jsonb, pays jsonb) returns jsonb language plpgsql immutable as
$$ declare dueE float8 := 0; dueS float8 := 0; discE float8 := 0; discS float8 := 0; paidE float8 := 0; paidS float8 := 0; fxE float8 := 0; fxS float8 := 0;
  e jsonb; v float8; amt float8; rate float8; conv float8; cur float8; srcCredit boolean; srcSAR boolean; begin
  for e in select * from jsonb_array_elements(items) loop
    v := (e ->> 'value')::float8;
    if (e ->> 'isDiscount') = 'true' then if (e ->> 'currency') = 'SAR' then discS := discS + v; else discE := discE + v; end if;
    else if (e ->> 'currency') = 'SAR' then dueS := dueS + v; else dueE := dueE + v; end if; end if;
  end loop;
  for e in select x from jsonb_array_elements(pays) x where (x ->> 'ptype') <> 'تحويل' loop
    v := (e ->> 'amount')::float8;
    if (e ->> 'currency') = 'SAR' then paidS := paidS + v; else paidE := paidE + v; end if;
  end loop;
  for e in select x from jsonb_array_elements(pays) with ordinality t(x, i) where (x ->> 'ptype') = 'تحويل' order by _acc_parse_d(x ->> 'date'), i loop
    amt := (e ->> 'amount')::float8; rate := (e ->> 'rate')::float8; conv := amt * rate; srcSAR := (e ->> 'currency') = 'SAR';
    cur := case when srcSAR then ((0 + (dueS - discS)) - paidS) - fxS else ((0 + (dueE - discE)) + fxE) - paidE end;
    srcCredit := cur < -0.004;
    if srcSAR then
      if srcCredit then fxS := fxS - amt; fxE := fxE - conv; else fxS := fxS + amt; fxE := fxE + conv; end if;
    else
      if srcCredit then fxE := fxE + amt; fxS := fxS + conv; else fxE := fxE - amt; fxS := fxS - conv; end if;
    end if;
  end loop;
  return jsonb_build_object('dueE', dueE, 'dueS', dueS, 'discE', discE, 'discS', discS, 'paidE', paidE, 'paidS', paidS, 'fxS', fxS, 'fxE', fxE,
    'netS', ((0 + (dueS - discS)) - paidS) - fxS, 'netE', ((0 + (dueE - discE)) + fxE) - paidE); end $$;

-- بنود الحسابات (أول 10 أعمدة) وفق _accAggBalances_ · trim للعميل والرحلة
create or replace function _acc_items_rows() returns table (rn int, cl text, trip text, trip_raw text, o jsonb) language sql stable as
$$ select rn, _rx_trim(_rx_s(_rx_c(raw, 1))), _rx_trim(_rx_s(_rx_c(raw, 2))), _rx_s(_rx_c(raw, 2)),
          jsonb_build_object('value', _ac_num(_rx_c(raw, 8)), 'currency', coalesce(nullif(_rx_s(_rx_c(raw, 5)), ''), 'EGP'), 'isDiscount', _vz_s(_rx_c(raw, 9)) = 'نعم')
     from _rx_rows('acc_items') $$;
create or replace function _acc_pays_rows() returns table (rn int, cl text, trip text, trip_raw text, o jsonb) language sql stable as
$$ select rn, _rx_trim(_rx_s(_rx_c(raw, 1))), _rx_trim(_rx_s(_rx_c(raw, 2))), _rx_s(_rx_c(raw, 2)),
          jsonb_build_object('ptype', coalesce(nullif(_rx_s(_rx_c(raw, 3)), ''), 'دفعة'), 'date', _rx_s(_rx_c(raw, 4)), 'amount', _ac_num(_rx_c(raw, 5)),
                             'currency', coalesce(nullif(_rx_s(_rx_c(raw, 6)), ''), 'EGP'), 'rate', _ac_num(_rx_c(raw, 7)))
     from _rx_rows('acc_payments') $$;

-- _accAggBalances_(tripFilter): {عميل: {netE, netS}} مقرَّبة لمنزلتين
create or replace function _acc_agg_balances(p_trip text) returns jsonb language plpgsql stable set search_path = public as
$$ declare res jsonb; begin
  with it as (select cl, jsonb_agg(o order by rn) a from _acc_items_rows() where cl <> '' and (coalesce(p_trip, '') = '' or trip = p_trip) group by cl),
       py as (select cl, jsonb_agg(o order by rn) a from _acc_pays_rows() where cl <> '' and (coalesce(p_trip, '') = '' or trip = p_trip) group by cl),
       al as (select coalesce(it.cl, py.cl) cl, coalesce(it.a, '[]'::jsonb) ia, coalesce(py.a, '[]'::jsonb) pa from it full join py on py.cl = it.cl),
       t as (select cl, _acc_calc(ia, pa) c from al)
  select coalesce(jsonb_object_agg(cl, jsonb_build_object('netE', floor((c ->> 'netE')::float8 * 100 + 0.5) / 100, 'netS', floor((c ->> 'netS')::float8 * 100 + 0.5) / 100)), '{}'::jsonb) into res from t;
  return res; end $$;

create or replace function _acc_perm_view() returns void language plpgsql stable as
$$ begin if not app_has('accounts.view') then raise exception 'لا تملك صلاحية عرض حسابات العملاء' using errcode = '42501'; end if; end $$;

create or replace function rx2_getclientsbalances(a jsonb, u text) returns jsonb language plpgsql stable set search_path = public as
$$ begin perform _acc_perm_view(); return jsonb_build_object('success', true, 'balances', _acc_agg_balances(null)); end $$;
create or replace function rx2_gettripclientsbalances(a jsonb, u text) returns jsonb language plpgsql stable set search_path = public as
$$ begin perform _acc_perm_view(); return jsonb_build_object('success', true, 'balances', _acc_agg_balances(_rx_trim(_rx_s(a -> 1)))); end $$;

-- ===== getAllClientsSummary =====
create or replace function rx2_getallclientssummary(a jsonb, u text) returns jsonb language plpgsql stable set search_path = public as
$$ #variable_conflict use_column
declare pm jsonb := _rx_map('pilgrims', _rx_h_pil()); res jsonb; begin
  perform _acc_perm_view();
  with pl as (select rn, _rx_trim(_rx_s(_rx_c(raw, _rx_ix(pm, 'العميل')))) cl, _rx_trim(_rx_s(_rx_c(raw, _rx_ix(pm, 'اسم الرحلة')))) trip, _rx_trim(_rx_s(_rx_c(raw, _rx_ix(pm, 'اسم المعتمر')))) nm
                from _rx_rows('pilgrims')),
       ct as (select cl, trip, min(rn) m from pl where cl <> '' and trip <> '' and nm <> '' group by cl, trip),
       cs as (select cl, min(m) m from ct group by cl),
       ir as (select * from _acc_items_rows() where cl <> ''), pr as (select * from _acc_pays_rows() where cl <> ''),
       ia as (select cl, jsonb_agg(o order by rn) a, min(rn) m from ir group by cl),
       pa as (select cl, jsonb_agg(o - 'date' order by rn) a, min(rn) m from pr group by cl),   -- الملخص لا يمرّر تاريخ الدفعة ⇒ التحويلات بترتيب الشيت
       allc as (select cl, min(src * 1000000000 + m) ins from (select cl, 0 src, m from cs union all select cl, 1, m from ia union all select cl, 2, m from pa) u group by cl),
       tw as (select cl, trip_raw from ir where trip_raw <> '' union select cl, trip_raw from pr where trip_raw <> ''),
       calc as (select allc.cl, allc.ins, _acc_calc(coalesce(ia.a, '[]'::jsonb), coalesce(pa.a, '[]'::jsonb)) t from allc left join ia using (cl) left join pa using (cl)),
       rows as (select c.cl, c.ins, c.t,
                  coalesce((select jsonb_agg(ct.trip order by (case when ct.trip ~ '^(0|[1-9][0-9]{0,9})$' then case when ct.trip::bigint <= 4294967294 then 0 else 1 end else 1 end),
                                            (case when ct.trip ~ '^(0|[1-9][0-9]{0,9})$' and ct.trip::bigint <= 4294967294 then ct.trip::bigint end), ct.m)
                              from ct where ct.cl = c.cl and not exists (select 1 from tw where tw.cl = c.cl and tw.trip_raw = ct.trip)), '[]'::jsonb) na
                  from calc c),
       fin as (select cl, ins, na, (t ->> 'dueE')::float8 - (t ->> 'discE')::float8 + (t ->> 'fxE')::float8 dueE, (t ->> 'dueS')::float8 - (t ->> 'discS')::float8 dueS,
                      (t ->> 'paidE')::float8 paidE, (t ->> 'paidS')::float8 + (t ->> 'fxS')::float8 paidS, (t ->> 'netE')::float8 netE, (t ->> 'netS')::float8 netS from rows)
  select coalesce(jsonb_agg(jsonb_build_object('client', cl, 'dueE', dueE, 'dueS', dueS, 'paidE', paidE, 'paidS', paidS, 'netE', netE, 'netS', netS, 'notAccounted', na)
         order by round(greatest(netE, 0)::numeric, 2) desc, round(greatest(netS, 0)::numeric, 2) desc,
                  (case when cl ~ '^(0|[1-9][0-9]{0,9})$' and cl::bigint <= 4294967294 then 0 else 1 end),
                  (case when cl ~ '^(0|[1-9][0-9]{0,9})$' and cl::bigint <= 4294967294 then cl::bigint end), ins), '[]'::jsonb) into res from fin;
  return jsonb_build_object('success', true, 'clients', res); end $$;

-- ===== getGeneralPayments =====
create or replace function _acc_gp_date(s text) returns date language plpgsql immutable as   -- _dmyToDate_: ^dd?/dd?/yyyy$ ⇒ تاريخ (الالتفاف كـ new Date)
$$ declare m text[]; begin
  m := regexp_match(coalesce(s, ''), '^(\d{1,2})/(\d{1,2})/(\d{4})$');
  if m is null then return null; end if;
  return (make_date(m[3]::int, 1, 1) + make_interval(months => m[2]::int - 1))::date + (m[1]::int - 1); end $$;

create or replace function rx2_getgeneralpayments(a jsonb, u text) returns jsonb language plpgsql stable set search_path = public as
$$ declare f jsonb := case when jsonb_typeof(a -> 1) = 'object' then a -> 1 else '{}'::jsonb end; fclient text := lower(_rx_trim(_rx_s(f -> 'client')));
  ffrom date := _acc_gp_date(_rx_s_raw(f -> 'dateFrom')); fto date := _acc_gp_date(_rx_s_raw(f -> 'dateTo'));
  fmin float8; fmax float8; hasmin boolean; hasmax boolean; res jsonb; begin
  perform _acc_perm_view();
  hasmin := f ? 'amountMin' and (f -> 'amountMin') <> '""'::jsonb and jsonb_typeof(f -> 'amountMin') <> 'null'; hasmax := f ? 'amountMax' and (f -> 'amountMax') <> '""'::jsonb and jsonb_typeof(f -> 'amountMax') <> 'null';
  fmin := case when hasmin then _rx_numc(f -> 'amountMin') end; fmax := case when hasmax then _rx_numc(f -> 'amountMax') end;
  with p as (
    select rn, _rx_s(_rx_c(raw, 1)) client, _rx_s(_rx_c(raw, 0)) id, _rx_s(_rx_c(raw, 3)) ptype, _rx_s(_rx_c(raw, 4)) date, coalesce(_rx_numc(_rx_c(raw, 5)), 0) amount,
           coalesce(nullif(_rx_s(_rx_c(raw, 6)), ''), 'EGP') currency, _rx_s(_rx_c(raw, 8)) gd, _acc_gp_date(_rx_s(_rx_c(raw, 4))) d
      from _rx_rows('acc_payments') where _rx_trim(_rx_s(_rx_c(raw, 2))) = 'عام'),
  q as (select * from p where (fclient = '' or position(fclient in lower(client)) > 0)
          and (ffrom is null or (d is not null and d >= ffrom)) and (fto is null or (d is not null and d <= fto))
          and (fmin is null or not (amount < fmin)) and (fmax is null or not (amount > fmax))),
  g as (select q.*, regexp_match(gd, '⟦src:gl-([^⟧]+)⟧') gm from q),
  gl as (select distinct on (source_key) source_key, entry_id from gl_entries where status <> 'ملغى' and source_key like 'AUTO:CP:%' order by source_key, seq, entry_id desc)
  select coalesce(jsonb_agg(jsonb_build_object('id', g.id, 'client', g.client, 'ptype', g.ptype, 'date', g.date, 'amount', g.amount, 'currency', g.currency,
            'desc', case when gm is not null then _rx_trim(regexp_replace(gd, '\s*⟦src:gl-[^⟧]+⟧\s*', ' ', 'g')) else gd end, 'serial', '',
            'glId', case when gm is not null then gm[1] else coalesce((select gl.entry_id from gl where gl.source_key = 'AUTO:CP:' || g.id), '') end) order by g.rn desc), '[]'::jsonb) into res from g;
  return jsonb_build_object('success', true, 'payments', res); end $$;

-- ===== الصلاحيات =====
do $$ declare r record; begin
  for r in select p.oid::regprocedure::text sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and (p.proname like '\_acc\_%' or p.proname like '\_vz\_%' or p.proname like '\_mf\_%' or p.proname like '\_sx\_%' or p.proname like '\_ac\_%' or p.proname like 'rx2\_%') loop
    execute format('revoke all on function %s from public, anon, authenticated', r.sig);
    execute format('grant execute on function %s to service_role', r.sig);
  end loop;
end $$;

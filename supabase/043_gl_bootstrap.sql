-- V4.417: glBootstrap من Postgres (إقلاع الحسابات العامة) — نفس مخرجات Accounts.gs:glBootstrap.
-- المصادر: gl_aux (accounts/hbnames/pendlist/meta — يرفعها SupaSync) · gl_settings · gl_fx_daily · gl_lines (أرصدة حيّة).
-- لا يرد «same» أبداً (الأرصدة حيّة بينما ver من gl_aux قد يتأخر دقيقة) — الرد الكامل سريع بـPostgres.
-- مؤجَّل لـApps Script (0A000): تفعيل «تخصيص الصلاحيات» bal_user_cust=نعم (تخطيط كل مستخدم بخصائص السكربت).
create or replace function glx_bootstrap_raw() returns jsonb language plpgsql stable as
$$ declare
  v_accs jsonb; v_hb jsonb; v_pl jsonb; v_meta jsonb; v_ver text;
  st jsonb; brand jsonb; v_rates jsonb; v_fx jsonb; v_bal jsonb; v_list jsonb; v_can jsonb; v_sub jsonb := null;
  rule text; r record; curm jsonb := '{}'; hbm jsonb := '{}'; subs text[] := array['safe','bank','cust','sheets','je','pt','fx','stmt','rep','auto','hb','cp','coa'];
  sb text;
  def_brand jsonb := jsonb_build_object('vch_name_ar', 'شركة منف للسياحة الدولية', 'vch_name_en', 'Menf International Tours',
    'vch_tagline', 'رحلات حج وعمرة - تذاكر سفر - برامج سياحية', 'vch_address', '32 شارع الفلكي - باب اللوق - القاهرة', 'vch_phone', '+002 02 27926054',
    'vch_email', 'mt@menftours.net', 'vch_logo_company', '', 'vch_note', 'لا يعتد بهذا الإيصال بعد انتهاء الرحلة أو بعد مرور 30 يوماً من تاريخ الإيصال', 'vch_companies', '[]');
begin
  perform _glx_guard();
  v_accs := _glx_aux('accounts'); v_hb := _glx_aux('hbnames'); v_pl := _glx_aux('pendlist');
  select data, ver into v_meta, v_ver from gl_aux where key = 'meta';
  if v_meta is null then raise exception 'gl_aux(meta) غير موجود — بانتظار مزامنة SupaSync' using errcode = '55000'; end if;
  select ver into v_ver from gl_aux where key = 'accounts';
  -- الإعدادات
  select jsonb_build_object('startDate', '01/07/2026', 'baseCurrency', 'EGP', 'rate_SAR', '13.3', 'rate_USD', '50')
         || coalesce(jsonb_object_agg(s2.key, regexp_replace(coalesce(s2.value, ''), '^\s+|\s+$', '', 'g')) filter (where coalesce(s2.key, '') <> ''), '{}'::jsonb) into st from gl_settings s2;
  if coalesce(st ->> 'bal_user_cust', '') = 'نعم' then raise exception 'تخصيص الصلاحيات: Apps Script' using errcode = '0A000'; end if;
  select coalesce(jsonb_object_agg(b.key, case when st ? b.key and st ->> b.key <> '' then st -> b.key else b.value end), '{}'::jsonb) into brand from jsonb_each(def_brand) b;
  st := st || jsonb_build_object('vchBrand', brand);
  v_rates := jsonb_build_object('EGP', 1, 'SAR', coalesce(nullif(_glx_pf(st ->> 'rate_SAR'), 0), 13.3), 'USD', coalesce(nullif(_glx_pf(st ->> 'rate_USD'), 0), 50));
  select coalesce(jsonb_object_agg(to_char(f.fx_date, 'YYYYMMDD'), jsonb_build_array(coalesce(f.sar_sell, 0), coalesce(f.usd_sell, 0), coalesce(f.source, ''))), '{}'::jsonb) into v_fx from gl_fx_daily f where f.fx_date is not null;
  -- الأرصدة المرحّلة لكل حساب
  with ln as materialized (select l.ord, _glx_str(l.raw -> 4) code, _glx_cur(l.raw -> 7) cur, _glx_num(l.raw -> 5) d, _glx_num(l.raw -> 6) c, _glx_num(l.raw -> 9) bd, _glx_num(l.raw -> 10) bc
                             from gl_lines l where l.status = 'مرحّل'),
       g as (select code, coalesce(_glx_acc(d, c order by ord) filter (where cur = 'EGP'), 0) e, coalesce(_glx_acc(d, c order by ord) filter (where cur = 'SAR'), 0) s,
                    coalesce(_glx_acc(d, c order by ord) filter (where cur = 'USD'), 0) u, coalesce(_glx_acc(bd, bc order by ord), 0) b from ln group by code)
  select coalesce(jsonb_object_agg(code, jsonb_build_object('EGP', _glx_r2(e), 'SAR', _glx_r2(s), 'USD', _glx_r2(u), 'base', _glx_r2(b))), '{}'::jsonb) into v_bal from g;
  -- العملة الافتراضية لكل حساب (dc) وأطراف الحجوزات (hb)
  rule := coalesce(st ->> 'ccy_def_rule', ''); if rule not in ('hb', 'fixed') then rule := 'all'; end if;
  for r in select h.key code, h.value arr from jsonb_each(v_hb) h loop
    if exists (select 1 from jsonb_array_elements(r.arr) e where (e ->> 'type') in ('عميل', 'مورد', 'شارت')) then hbm := hbm || jsonb_build_object(r.code, 1); end if;
  end loop;
  if rule = 'all' then
    for r in select code, cu from (
        select distinct on (code) code, cu from (
          select _glx_str(l.raw -> 4) code, _glx_cur(l.raw -> 7) cu, count(*) n, min(l.ord) fo from gl_lines l where l.status = 'مرحّل' group by 1, 2) q
        order by code, n desc, fo asc) z loop
      curm := curm || jsonb_build_object(r.code, r.cu);   -- مرشّح «الأغلبية»؛ تُطبَّق الأولويات أدناه
    end loop;
  end if;
  select coalesce(jsonb_agg(
      (a.value - '_row') || case
         when coalesce(a.value ->> 'isGroup', 'false') = 'true' or a.value ->> 'kind' = 'fx' then '{}'::jsonb
         else (case when coalesce(a.value ->> 'currency', '') <> '' then '{}'::jsonb   -- حساب بعملة ثابتة: لا dc (كما Accounts.gs)
                    when rule = 'fixed' then '{}'::jsonb
                    when hbm ? a.key then jsonb_build_object('dc', 'SAR')
                    when rule = 'hb' then '{}'::jsonb
                    when curm ? a.key then jsonb_build_object('dc', curm ->> a.key) else '{}'::jsonb end)
         end
      || case when hbm ? a.key then jsonb_build_object('hb', 1) else '{}'::jsonb end
      order by a.key collate "C"), '[]'::jsonb) into v_list from jsonb_each(v_accs) a;
  -- الصلاحيات
  v_can := jsonb_build_object('add', app_has('gl.add'), 'edit', app_has('gl.edit'), 'del', app_has('gl.delete'),
             'approve', (app_has('admin') or app_has('gl.approve')), 'autoEdit', _glw_can_edit_auto());
  if not app_has('admin') and exists (select 1 from jsonb_array_elements_text(coalesce(auth.jwt() -> 'perms', '[]'::jsonb)) p where p ~* '^gl_[a-z]+\.') then
    v_sub := '{}'::jsonb;
    foreach sb in array subs loop
      v_sub := v_sub || jsonb_build_object(sb, jsonb_build_object('view', gl_can_cap(sb, 'view'), 'add', gl_can_cap(sb, 'add'), 'edit', gl_can_cap(sb, 'edit'), 'del', gl_can_cap(sb, 'delete')));
    end loop;
  end if;
  v_can := v_can || jsonb_build_object('sub', v_sub);
  return jsonb_build_object('success', true, 'ready', true, 'isAdmin', app_has('admin'), 'url', coalesce(v_meta ->> 'url', ''), 'ver', coalesce(v_ver, '0'),
    'fxDaily', v_fx, 'settings', st, 'rates', v_rates,
    'types', jsonb_build_object('ASSET', jsonb_build_object('label', 'أصول', 'normal', 'D'), 'LIAB', jsonb_build_object('label', 'خصوم', 'normal', 'C'),
       'EQUITY', jsonb_build_object('label', 'حقوق ملكية', 'normal', 'C'), 'REV', jsonb_build_object('label', 'إيرادات', 'normal', 'C'), 'EXP', jsonb_build_object('label', 'مصروفات', 'normal', 'D')),
    'kinds', jsonb_build_object('safe', 'خزينة', 'bank', 'بنك', 'custody', 'عهدة', 'client', 'عميل', 'agent', 'وكيل', 'supplier', 'مورد', 'trip', 'رحلة عمرة', 'fx', 'وسيط عملات', 'roomfee', 'رسوم غرفة', 'other', ''),
    'entryTypes', jsonb_build_array('قيد يومية', 'سند قبض', 'سند صرف', 'إيداع بنكي', 'سحب بنكي', 'صرف عهدة', 'تسوية عهدة', 'تحويل نقدية', 'تحويل عملة', 'تحويل بين طرفين', 'قيد افتتاحي', 'قيد مستورد', 'قيد تلقائي', 'قيد إقفال'),
    'accounts', v_list, 'balances', v_bal, 'can', v_can, 'balMine', '', 'balUserOn', false,
    'csPend', coalesce(nullif(v_meta ->> 'csPend', '')::int, 0),
    'pendingCount', (select count(*) from jsonb_array_elements(coalesce(v_pl -> 'rows', '[]'::jsonb)) e where coalesce(e ->> 'status', '') <> 'مرفوض'),
    'tripMode', (st ->> 'trip_mode') = 'نعم');
end $$;

create or replace function glx_bootstrap(p_known text default '') returns jsonb language plpgsql stable security definer set search_path = public as
$$ begin perform _glx_need(''); return glx_bootstrap_raw(); end $$;

revoke all on function glx_bootstrap_raw() from public, anon, authenticated;
grant execute on function glx_bootstrap_raw() to service_role;
revoke all on function glx_bootstrap(text) from public, anon;
grant execute on function glx_bootstrap(text) to authenticated, service_role;

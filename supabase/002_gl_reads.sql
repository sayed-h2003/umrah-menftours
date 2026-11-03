-- 002_gl_reads.sql — قراءات الحسابات العامة (GL) داخل Postgres (المرحلة 2-أ)
-- الأرصدة = Σ(مدين−دائن) لسطور «مرحّل» فقط، لكل حساب|عملة (تطابق _glBalances_ في Accounts.gs)
-- دوال *_raw للخادم فقط (service_role)؛ الدوال العامة تفحص صلاحية JWT (نفس منطق _glHasSub_)

create index if not exists gl_lines_acc_idx on gl_lines (account_code, line_date) where status = 'مرحّل';
create index if not exists gl_lines_entry_idx on gl_lines (entry_id);

-- صلاحية عرض شاشة فرعية: admin ⇒ نعم · لا صلاحيات gl_… ⇒ gl.view · وإلا gl.view + gl_<sub>.view
create or replace function gl_can(sub text) returns boolean language sql stable as
$$ select app_has('admin') or (
     case when exists (select 1 from jsonb_array_elements_text(coalesce(auth.jwt() -> 'perms', '[]'::jsonb)) p where p ~* '^gl_[a-z]+\.')
          then app_has('gl.view') and app_has('gl_' || sub || '.view')
          else app_has('gl.view') end) $$;

create or replace function _gl_cur(c text) returns text language sql immutable as
$$ select case upper(coalesce(c, '')) when 'SAR' then 'SAR' when 'USD' then 'USD' when 'ريال' then 'SAR' when 'دولار' then 'USD' else 'EGP' end $$;

-- ===== الأرصدة =====
create or replace function gl_balances_raw(p_to date default null)
returns table (account_code text, egp numeric, sar numeric, usd numeric, base numeric)
language sql stable as
$$ select l.account_code,
          round(coalesce(sum(case when _gl_cur(l.currency) = 'EGP' then coalesce(l.debit,0) - coalesce(l.credit,0) end), 0), 2),
          round(coalesce(sum(case when _gl_cur(l.currency) = 'SAR' then coalesce(l.debit,0) - coalesce(l.credit,0) end), 0), 2),
          round(coalesce(sum(case when _gl_cur(l.currency) = 'USD' then coalesce(l.debit,0) - coalesce(l.credit,0) end), 0), 2),
          round(coalesce(sum(coalesce(l.debit_base,0) - coalesce(l.credit_base,0)), 0), 2)
     from gl_lines l
    where l.status = 'مرحّل' and (p_to is null or l.line_date <= p_to)
    group by l.account_code $$;

create or replace function gl_balances(p_to date default null)
returns table (account_code text, egp numeric, sar numeric, usd numeric, base numeric)
language plpgsql stable security definer set search_path = public as
$$ begin
  if not gl_can('stmt') then raise exception 'لا تملك صلاحية عرض الحسابات العامة' using errcode = '42501'; end if;
  return query select * from gl_balances_raw(p_to);
end $$;

-- ===== ميزان المراجعة =====
create or replace function gl_trial_balance_raw(p_from date default null, p_to date default null)
returns table (account_code text, open_d numeric, open_c numeric, per_d numeric, per_c numeric, egp numeric, sar numeric, usd numeric)
language sql stable as
$$ select l.account_code,
          round(coalesce(sum(case when p_from is not null and l.line_date < p_from then coalesce(l.debit_base,0) end), 0), 2),
          round(coalesce(sum(case when p_from is not null and l.line_date < p_from then coalesce(l.credit_base,0) end), 0), 2),
          round(coalesce(sum(case when p_from is null or l.line_date >= p_from then coalesce(l.debit_base,0) end), 0), 2),
          round(coalesce(sum(case when p_from is null or l.line_date >= p_from then coalesce(l.credit_base,0) end), 0), 2),
          round(coalesce(sum(case when _gl_cur(l.currency) = 'EGP' then coalesce(l.debit,0) - coalesce(l.credit,0) end), 0), 2),
          round(coalesce(sum(case when _gl_cur(l.currency) = 'SAR' then coalesce(l.debit,0) - coalesce(l.credit,0) end), 0), 2),
          round(coalesce(sum(case when _gl_cur(l.currency) = 'USD' then coalesce(l.debit,0) - coalesce(l.credit,0) end), 0), 2)
     from gl_lines l
    where l.status = 'مرحّل' and (p_to is null or l.line_date <= p_to)
    group by l.account_code $$;

create or replace function gl_trial_balance(p_from date default null, p_to date default null)
returns table (account_code text, open_d numeric, open_c numeric, per_d numeric, per_c numeric, egp numeric, sar numeric, usd numeric)
language plpgsql stable security definer set search_path = public as
$$ begin
  if not gl_can('rep') then raise exception 'لا تملك صلاحية التقارير والميزان' using errcode = '42501'; end if;
  return query select * from gl_trial_balance_raw(p_from, p_to);
end $$;

-- ===== متابعة الخزينة/البنك/العهدة: افتتاحي + حركات برصيد تراكمي لكل عملة =====
create or replace function gl_treasury_raw(p_code text, p_from date default null, p_to date default null)
returns jsonb language sql stable as
$$ with mine as (
     select l.entry_id, l.line_no, l.line_date, _gl_cur(l.currency) cur, coalesce(l.debit,0) d, coalesce(l.credit,0) c, l.description
       from gl_lines l
      where l.status = 'مرحّل' and l.account_code = p_code and (p_to is null or l.line_date <= p_to)),
   opening as (
     select cur, round(sum(d - c), 2) v from mine where p_from is not null and line_date < p_from group by cur),
   mv as (
     select m.*, e.seq, e.entry_type, e.description edesc, e.reference,
            round(sum(m.d - m.c) over (partition by m.cur order by m.line_date, e.seq, m.line_no
                    rows between unbounded preceding and current row)
                  + coalesce((select o.v from opening o where o.cur = m.cur), 0), 2) as run_all,
            (select string_agg(distinct coalesce(a.link, a.name, o.account_code), ' + ')
               from gl_lines o left join gl_accounts a on a.code = o.account_code
              where o.entry_id = m.entry_id and o.account_code <> p_code and o.status = 'مرحّل') counter
       from mine m left join gl_entries e on e.entry_id = m.entry_id
      where p_from is null or m.line_date >= p_from)
   select jsonb_build_object(
     'opening', jsonb_build_object('EGP', coalesce((select v from opening where cur='EGP'),0), 'SAR', coalesce((select v from opening where cur='SAR'),0), 'USD', coalesce((select v from opening where cur='USD'),0)),
     'rows', coalesce((select jsonb_agg(jsonb_build_object('entryId', entry_id, 'lineNo', line_no, 'date', line_date, 'seq', seq, 'type', entry_type,
                 'currency', cur, 'inAmt', d, 'outAmt', c, 'counter', counter, 'desc', coalesce(description, edesc, ''), 'entryDesc', coalesce(edesc, ''), 'ref', reference,
                 'run', run_all) order by line_date, seq, line_no) from mv), '[]'::jsonb)) $$;

create or replace function gl_treasury(p_code text, p_from date default null, p_to date default null)
returns jsonb language plpgsql stable security definer set search_path = public as
$$ begin
  if not (gl_can('safe') or gl_can('bank') or gl_can('cust')) then
    raise exception 'لا تملك صلاحية عرض الخزينة' using errcode = '42501'; end if;
  return gl_treasury_raw(p_code, p_from, p_to);
end $$;

-- الدوال *_raw للخادم فقط
revoke all on function gl_balances_raw(date), gl_trial_balance_raw(date, date), gl_treasury_raw(text, date, date) from public, anon, authenticated;
grant execute on function gl_balances_raw(date), gl_trial_balance_raw(date, date), gl_treasury_raw(text, date, date) to service_role;
grant execute on function gl_balances(date), gl_trial_balance(date, date), gl_treasury(text, date, date) to authenticated;

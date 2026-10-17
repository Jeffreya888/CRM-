-- =============================================================================
-- Finance: pay periods & approvals, tax-friendly expenses, recurring expenses,
-- mileage, job profitability, cash/accrual P&L, dashboard figures.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Expenses
-- ---------------------------------------------------------------------------
alter table public.expenses drop constraint expenses_category_check;
update public.expenses set category = case category
  when 'labor' then 'contract_labor' when 'marketing' then 'advertising' when 'rent' then 'rent' else category end;
alter table public.expenses add constraint expenses_category_check check (category in (
  'supplies','equipment','equipment_rental','repairs','fuel','vehicle','travel','meals','insurance','rent','utilities',
  'advertising','software','fees','contract_labor','wages','taxes_licenses','office','training','other'));
alter table public.expenses
  add column kind text not null default 'expense' check (kind in ('expense','mileage')),
  add column miles numeric(10,1) check (miles >= 0),
  add column mileage_rate numeric(6,3),
  add column recurring_expense_id uuid,
  add column payment_method text,
  add column notes text;

-- Mileage entries are priced at the company's rate.
create or replace function public.trg_expense_mileage()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.kind = 'mileage' then
    if coalesce(new.miles, 0) <= 0 then raise exception 'Enter the miles driven'; end if;
    new.mileage_rate := coalesce(new.mileage_rate, (select mileage_rate from organizations where id = new.org_id));
    new.amount := round(new.miles * new.mileage_rate, 2);
    new.category := 'vehicle';
  end if;
  return new;
end;
$$;
create trigger expenses_mileage before insert or update on public.expenses for each row execute function public.trg_expense_mileage();
create trigger expenses_org_j before insert or update on public.expenses for each row execute function public.assert_same_org('jobs', 'job_id');

create table public.recurring_expenses (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  branch_id uuid references public.branches(id) on delete set null,
  vendor text,
  description text not null,
  category text not null default 'other',
  amount numeric(12,2) not null check (amount >= 0),
  every text not null default 'month' check (every in ('week','month','quarter','year')),
  next_on date not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.expenses add constraint expenses_recurring_fk foreign key (recurring_expense_id) references public.recurring_expenses(id) on delete set null;
alter table public.recurring_expenses enable row level security;
create policy recurring_expenses_money on public.recurring_expenses for all using (public.can_money(org_id)) with check (public.can_money(org_id));

-- Books every recurring expense that has come due (worker, or a manager for their company).
create or replace function public.generate_recurring_expenses(p_org uuid default null)
returns int language plpgsql security definer set search_path = public as $$
declare
  r recurring_expenses;
  v_made int := 0;
begin
  if p_org is not null and not public.can_money(p_org) then raise exception 'Not allowed'; end if;
  if p_org is null and auth.uid() is not null then raise exception 'Specify a company'; end if;
  for r in select * from recurring_expenses where active and next_on <= current_date and (p_org is null or org_id = p_org) for update skip locked loop
    while r.next_on <= current_date loop
      insert into expenses (org_id, branch_id, category, vendor, description, amount, spent_on, recurring_expense_id)
        values (r.org_id, r.branch_id, r.category, r.vendor, r.description, r.amount, r.next_on, r.id);
      v_made := v_made + 1;
      r.next_on := r.next_on + case r.every when 'week' then interval '1 week' when 'month' then interval '1 month'
                                            when 'quarter' then interval '3 months' else interval '1 year' end;
    end loop;
    update recurring_expenses set next_on = r.next_on where id = r.id;
  end loop;
  return v_made;
end;
$$;

-- ---------------------------------------------------------------------------
-- Pay periods & timesheet approvals
-- ---------------------------------------------------------------------------
alter table public.time_entries
  add column approved_by uuid references auth.users(id) on delete set null,
  add column approved_at timestamptz;

create table public.pay_periods (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  starts_on date not null,
  ends_on date not null,
  status text not null default 'closed' check (status in ('closed','reopened')),
  closed_by uuid references auth.users(id) on delete set null,
  closed_at timestamptz not null default now(),
  reopened_by uuid references auth.users(id) on delete set null,
  reopened_at timestamptz,
  reopen_reason text,
  unique (org_id, starts_on),
  check (ends_on >= starts_on)
);
alter table public.pay_periods enable row level security;
create policy pay_periods_select on public.pay_periods for select using (public.is_member(org_id));

-- The pay period containing a date, by the company's cadence.
create or replace function public.pay_period_for(p_org uuid, p_date date)
returns table (starts_on date, ends_on date) language plpgsql stable security definer set search_path = public as $$
declare
  o organizations;
  v_len int;
  v_start date;
begin
  select * into o from organizations where id = p_org;
  if o.pay_period_cadence = 'semimonthly' then
    if extract(day from p_date) <= 15 then
      starts_on := date_trunc('month', p_date)::date; ends_on := starts_on + 14;
    else
      starts_on := date_trunc('month', p_date)::date + 15; ends_on := (date_trunc('month', p_date) + interval '1 month' - interval '1 day')::date;
    end if;
  else
    v_len := case o.pay_period_cadence when 'weekly' then 7 else 14 end;
    v_start := o.pay_period_anchor + (floor((p_date - o.pay_period_anchor)::numeric / v_len)::int * v_len);
    starts_on := v_start; ends_on := v_start + v_len - 1;
  end if;
  return next;
end;
$$;

create or replace function public.is_period_locked(p_org uuid, p_at timestamptz)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from pay_periods pp join organizations o on o.id = pp.org_id
    where pp.org_id = p_org and pp.status = 'closed'
      and (p_at at time zone o.timezone)::date between pp.starts_on and pp.ends_on);
$$;

-- Entries inside a closed pay period are frozen.
create or replace function public.trg_time_lock()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op in ('UPDATE','DELETE') and public.is_period_locked(old.org_id, old.started_at) then
    raise exception 'PERIOD_CLOSED: this pay period is closed. The owner can reopen it.';
  end if;
  if tg_op in ('INSERT','UPDATE') and public.is_period_locked(new.org_id, new.started_at) then
    raise exception 'PERIOD_CLOSED: this pay period is closed. The owner can reopen it.';
  end if;
  -- Approval needs the permission and the plan feature.
  if tg_op = 'UPDATE' and new.approved is distinct from old.approved then
    if not public.has_perm(new.org_id, 'approve_timesheets') or not public.plan_allows(new.org_id, 'timesheet_approvals') then
      raise exception 'PERMISSION: you cannot approve time';
    end if;
    new.approved_by := case when new.approved then auth.uid() end;
    new.approved_at := case when new.approved then now() end;
  end if;
  return coalesce(new, old);
end;
$$;
create trigger time_entries_lock before insert or update or delete on public.time_entries for each row execute function public.trg_time_lock();

create or replace function public.approve_time(p_org uuid, p_from date, p_to date, p_user uuid default null)
returns int language plpgsql security definer set search_path = public as $$
declare v_n int;
begin
  if not public.has_perm(p_org, 'approve_timesheets') or not public.plan_allows(p_org, 'timesheet_approvals') then
    raise exception 'PERMISSION: you cannot approve time';
  end if;
  update time_entries t set approved = true
  from organizations o
  where o.id = t.org_id and t.org_id = p_org and not t.approved and t.ended_at is not null
    and (p_user is null or t.user_id = p_user)
    and (t.started_at at time zone o.timezone)::date between p_from and p_to;
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

create or replace function public.close_pay_period(p_org uuid, p_start date, p_end date)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not public.is_admin(p_org) then raise exception 'Only owners and admins can close pay periods'; end if;
  if exists (select 1 from time_entries t join organizations o on o.id = t.org_id
             where t.org_id = p_org and t.ended_at is null and (t.started_at at time zone o.timezone)::date between p_start and p_end) then
    raise exception 'Someone is still clocked in during this period. Clock them out first.';
  end if;
  insert into pay_periods (org_id, starts_on, ends_on, status, closed_by, closed_at)
    values (p_org, p_start, p_end, 'closed', auth.uid(), now())
  on conflict (org_id, starts_on) do update set status = 'closed', ends_on = excluded.ends_on, closed_by = auth.uid(), closed_at = now()
  returning id into v_id;
  insert into audit_log (org_id, actor, action, entity, entity_id, summary)
    values (p_org, auth.uid(), 'closed', 'pay_periods', v_id, 'Pay period ' || p_start || ' – ' || p_end);
  return v_id;
end;
$$;

create or replace function public.reopen_pay_period(p_period uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare p pay_periods;
begin
  select * into p from pay_periods where id = p_period;
  if not found or not public.is_owner(p.org_id) then raise exception 'Only the owner can reopen a pay period'; end if;
  if coalesce(length(trim(p_reason)), 0) < 3 then raise exception 'Enter a reason for reopening'; end if;
  update pay_periods set status = 'reopened', reopened_by = auth.uid(), reopened_at = now(), reopen_reason = trim(p_reason) where id = p_period;
  insert into audit_log (org_id, actor, action, entity, entity_id, summary)
    values (p.org_id, auth.uid(), 'reopened', 'pay_periods', p.id, 'Pay period ' || p.starts_on || ' – ' || p.ends_on || ' reopened: ' || trim(p_reason));
end;
$$;

-- Hours per person for a period, with flags. Rates only for owners/admins.
create or replace function public.timesheet_summary(p_org uuid, p_from date, p_to date)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_tz text;
  v_admin boolean := public.is_admin(p_org);
  v_all boolean := public.has_perm(p_org, 'approve_timesheets');
begin
  if not public.is_member(p_org) then raise exception 'Not a member'; end if;
  select timezone into v_tz from organizations where id = p_org;
  return (select coalesce(jsonb_agg(x order by x.name), '[]') from (
    select m.user_id, coalesce(m.display_name, 'Team member') as name,
      round(coalesce(sum(extract(epoch from (t.ended_at - t.started_at)) / 60) filter (where t.ended_at is not null), 0)::numeric) as minutes,
      count(t.id) filter (where t.ended_at is null) as open_entries,
      count(t.id) filter (where not t.approved and t.ended_at is not null) as unapproved,
      count(t.id) as entries,
      case when v_admin then (select hourly_rate from member_pay mp where mp.org_id = p_org and mp.user_id = m.user_id) end as hourly_rate,
      case when v_admin then (select overtime_multiplier from member_pay mp where mp.org_id = p_org and mp.user_id = m.user_id) end as overtime_multiplier,
      -- Weekly overtime (> 40 h in any Mon–Sun week inside the period)
      (select coalesce(sum(greatest(0, wk.mins - 2400)), 0) from (
          select sum(extract(epoch from (t2.ended_at - t2.started_at)) / 60) mins
          from time_entries t2 where t2.org_id = p_org and t2.user_id = m.user_id and t2.ended_at is not null
            and (t2.started_at at time zone v_tz)::date between p_from and p_to
          group by date_trunc('week', t2.started_at at time zone v_tz)) wk) as overtime_minutes
    from memberships m
    left join time_entries t on t.org_id = m.org_id and t.user_id = m.user_id
      and (t.started_at at time zone v_tz)::date between p_from and p_to
    where m.org_id = p_org and (m.active or t.id is not null) and (v_all or m.user_id = auth.uid())
    group by m.user_id, m.display_name) x);
end;
$$;

-- ---------------------------------------------------------------------------
-- Costing helpers
-- ---------------------------------------------------------------------------
-- Labor cost of time entries in a window (optionally one job), and minutes
-- that have no pay rate (shown as "Unknown").
create or replace function public._labor_cost(p_org uuid, p_from timestamptz, p_to timestamptz, p_job uuid default null, p_branch uuid default null)
returns table (cost numeric, minutes numeric, unknown_minutes numeric) language sql stable security definer set search_path = public as $$
  select
    round(coalesce(sum(extract(epoch from (t.ended_at - t.started_at)) / 3600 * mp.hourly_rate) filter (where mp.hourly_rate is not null), 0)::numeric, 2),
    round(coalesce(sum(extract(epoch from (t.ended_at - t.started_at)) / 60), 0)::numeric),
    round(coalesce(sum(extract(epoch from (t.ended_at - t.started_at)) / 60) filter (where mp.hourly_rate is null), 0)::numeric)
  from time_entries t
  left join member_pay mp on mp.org_id = t.org_id and mp.user_id = t.user_id
  left join jobs j on j.id = t.job_id
  where t.org_id = p_org and t.ended_at is not null
    and (p_job is null or t.job_id = p_job)
    and (p_job is not null or (t.started_at >= p_from and t.started_at < p_to))
    and (p_branch is null or j.branch_id = p_branch);
$$;

create or replace function public._supply_cost(p_org uuid, p_from timestamptz, p_to timestamptz, p_job uuid default null, p_branch uuid default null)
returns numeric language sql stable security definer set search_path = public as $$
  select round(coalesce(sum(-m.delta * coalesce(m.unit_cost, 0)), 0), 2)
  from inventory_movements m left join jobs j on j.id = m.job_id
  where m.org_id = p_org and m.reason = 'job_use'
    and (p_job is null or m.job_id = p_job)
    and (p_job is not null or (m.created_at >= p_from and m.created_at < p_to))
    and (p_branch is null or j.branch_id = p_branch);
$$;
revoke execute on function public._labor_cost(uuid, timestamptz, timestamptz, uuid, uuid) from public, anon, authenticated;
revoke execute on function public._supply_cost(uuid, timestamptz, timestamptz, uuid, uuid) from public, anon, authenticated;

-- Job profitability (owner/admin and anyone with "see reports").
create or replace function public.job_profitability(p_job uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  j jobs;
  v_rev numeric;
  l record;
  v_sup numeric;
  v_exp numeric;
  v_unknown_sup boolean;
begin
  select * into j from jobs where id = p_job;
  if not found or not public.has_perm(j.org_id, 'see_reports') then raise exception 'Not allowed'; end if;
  -- Revenue excludes tax: the invoice net of discount, else the job's lines.
  select coalesce((select subtotal - discount from invoices where job_id = j.id and status <> 'void' order by created_at desc limit 1),
                  (select sum(quantity * unit_price) from job_items where job_id = j.id), 0) into v_rev;
  select * into l from public._labor_cost(j.org_id, null, null, j.id);
  v_sup := public._supply_cost(j.org_id, null, null, j.id);
  v_unknown_sup := exists (select 1 from inventory_movements m where m.job_id = j.id and m.reason = 'job_use' and coalesce(m.unit_cost, 0) = 0);
  select coalesce(sum(amount), 0) into v_exp from expenses where job_id = j.id;
  return jsonb_build_object(
    'revenue', round(v_rev, 2),
    'labor', case when l.unknown_minutes > 0 then null else l.cost end,
    'labor_minutes', l.minutes,
    'labor_unknown_minutes', l.unknown_minutes,
    'supplies', case when v_unknown_sup then null else v_sup end,
    'job_expenses', v_exp,
    'gross', case when l.unknown_minutes > 0 or v_unknown_sup then null else round(v_rev - l.cost - v_sup, 2) end,
    'net', case when l.unknown_minutes > 0 or v_unknown_sup then null else round(v_rev - l.cost - v_sup - v_exp, 2) end,
    'margin_pct', case when l.unknown_minutes > 0 or v_unknown_sup or v_rev = 0 then null else round(100 * (v_rev - l.cost - v_sup - v_exp) / v_rev, 1) end);
end;
$$;

-- ---------------------------------------------------------------------------
-- Profit & loss. Cash basis: money received (tax portion separated) minus
-- recorded expenses, job supply costs and labor. Accrual basis: invoices
-- issued in the period (net of tax) instead of money received.
-- ---------------------------------------------------------------------------
create or replace function public.profit_loss(p_org uuid, p_from date, p_to date, p_basis text default 'cash', p_branch uuid default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_tz text;
  v_from timestamptz;
  v_to timestamptz;
  v_rev numeric; v_tax numeric; v_fees numeric; v_count int;
  v_exp numeric;
  v_sup numeric;
  l record;
  v_net numeric;
  v_setaside numeric;
begin
  if not public.has_perm(p_org, 'see_reports') then raise exception 'Not allowed'; end if;
  select timezone, tax_set_aside_pct into v_tz, v_setaside from organizations where id = p_org;
  v_from := p_from::timestamp at time zone v_tz;
  v_to := (p_to + 1)::timestamp at time zone v_tz;

  if p_basis = 'accrual' then
    select coalesce(sum(i.subtotal - i.discount), 0), coalesce(sum(i.tax), 0), count(*)
      into v_rev, v_tax, v_count
      from invoices i where i.org_id = p_org and i.status <> 'void' and i.status <> 'draft'
        and i.issue_date between p_from and p_to and (p_branch is null or i.branch_id = p_branch);
    v_fees := 0;
  else
    -- Each payment's tax share is proportional to its invoice's tax.
    select coalesce(sum(p.amount - case when i.total > 0 then p.amount * i.tax / i.total else 0 end), 0),
           coalesce(sum(case when i.total > 0 then p.amount * i.tax / i.total else 0 end), 0),
           count(distinct i.id), coalesce(sum(p.platform_fee), 0)
      into v_rev, v_tax, v_count, v_fees
      from payments p join invoices i on i.id = p.invoice_id
      where p.org_id = p_org and p.received_at >= v_from and p.received_at < v_to
        and (p_branch is null or i.branch_id = p_branch);
  end if;

  select coalesce(sum(amount), 0) into v_exp from expenses
    where org_id = p_org and spent_on between p_from and p_to and (p_branch is null or branch_id = p_branch);
  v_sup := public._supply_cost(p_org, v_from, v_to, null, p_branch);
  select * into l from public._labor_cost(p_org, v_from, v_to, null, p_branch);
  v_net := round(v_rev - v_exp - v_sup - l.cost - v_fees, 2);

  return jsonb_build_object(
    'basis', p_basis,
    'from', p_from, 'to', p_to,
    'revenue', round(v_rev, 2),
    'sales_tax_collected', round(v_tax, 2),
    'platform_fees', round(v_fees, 2),
    'paid_invoices', v_count,
    'expenses', round(v_exp, 2),
    'supplies', v_sup,
    'labor', l.cost,
    'labor_minutes', l.minutes,
    'labor_unknown_minutes', l.unknown_minutes,
    'net', v_net,
    'tax_set_aside_pct', v_setaside,
    'tax_set_aside', greatest(0, round(v_net * v_setaside / 100, 2)),
    'expenses_by_category', (select coalesce(jsonb_agg(x order by x.amount desc), '[]') from (
        select category, round(sum(amount), 2) amount, count(*) n from expenses
        where org_id = p_org and spent_on between p_from and p_to and (p_branch is null or branch_id = p_branch)
        group by category) x),
    'by_service', (select coalesce(jsonb_agg(x order by x.revenue desc), '[]') from (
        select coalesce(s.name, ii.description) as name, round(sum(ii.quantity * ii.unit_price), 2) as revenue, count(distinct i.id) as invoices
        from invoice_items ii join invoices i on i.id = ii.invoice_id left join services s on s.id = ii.service_id
        where i.org_id = p_org and i.status not in ('void','draft') and i.issue_date between p_from and p_to
          and (p_branch is null or i.branch_id = p_branch)
        group by 1 order by 2 desc limit 15) x),
    'by_customer', (select coalesce(jsonb_agg(x order by x.revenue desc), '[]') from (
        select c.name, round(sum(i.subtotal - i.discount), 2) as revenue,
          round(sum(i.subtotal - i.discount) - coalesce(sum((select (pr->>'labor')::numeric + (pr->>'supplies')::numeric
                     from (select public.job_profitability(i.job_id) pr) z where i.job_id is not null and (pr->>'gross') is not null)), 0), 2) as gross_profit
        from invoices i join customers c on c.id = i.customer_id
        where i.org_id = p_org and i.status not in ('void','draft') and i.issue_date between p_from and p_to
          and (p_branch is null or i.branch_id = p_branch)
        group by c.name order by 2 desc limit 15) x),
    'by_branch', (select coalesce(jsonb_agg(x order by x.revenue desc), '[]') from (
        select coalesce(b.name, 'No location') as name,
          round(coalesce(sum(p.amount - case when i.total > 0 then p.amount * i.tax / i.total else 0 end), 0), 2) as revenue,
          round(coalesce((select sum(amount) from expenses e where e.org_id = p_org and e.spent_on between p_from and p_to and e.branch_id is not distinct from b.id), 0), 2) as expenses
        from payments p join invoices i on i.id = p.invoice_id left join branches b on b.id = i.branch_id
        where p.org_id = p_org and p.received_at >= v_from and p.received_at < v_to
        group by b.id, b.name) x)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Dashboard (optionally one branch)
-- ---------------------------------------------------------------------------
drop function public.dashboard_stats(uuid);
create or replace function public.dashboard_stats(p_org uuid, p_branch uuid default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v jsonb;
  v_fin boolean := public.can_money(p_org);
  v_rep boolean := public.has_perm(p_org, 'see_reports');
  v_tz text;
  v_month_start date;
  pl jsonb;
begin
  if not public.is_member(p_org) then raise exception 'Not a member'; end if;
  select timezone into v_tz from organizations where id = p_org;
  v_month_start := date_trunc('month', now() at time zone v_tz)::date;
  if v_rep then
    pl := public.profit_loss(p_org, v_month_start, (now() at time zone v_tz)::date, 'accrual', p_branch);
  end if;
  select jsonb_build_object(
    'jobs_today', (select count(*) from jobs where org_id = p_org and status not in ('cancelled') and (p_branch is null or branch_id = p_branch)
                     and (scheduled_start at time zone v_tz)::date = (now() at time zone v_tz)::date),
    'jobs_in_progress', (select count(*) from jobs where org_id = p_org and status = 'in_progress' and (p_branch is null or branch_id = p_branch)),
    'jobs_scheduled', (select count(*) from jobs where org_id = p_org and status = 'scheduled' and (p_branch is null or branch_id = p_branch)),
    'jobs_tentative', (select count(*) from jobs where org_id = p_org and status = 'tentative' and (p_branch is null or branch_id = p_branch)),
    'jobs_completed', (select count(*) from jobs where org_id = p_org and status in ('completed','invoiced') and (p_branch is null or branch_id = p_branch)),
    'jobs_flagged', (select count(*) from jobs where org_id = p_org and flagged and (p_branch is null or branch_id = p_branch)),
    'open_quotes', case when v_fin then (select count(*) from quotes where org_id = p_org and status in ('draft','sent','viewed') and (p_branch is null or branch_id = p_branch)) end,
    'reminders_due', (select count(*) from service_reminders where org_id = p_org and status in ('upcoming','due') and due_on <= current_date + 14),
    'low_stock', (select count(*) from inventory_items where org_id = p_org and active and par_level > 0 and quantity <= par_level),
    'booking_requests', (select count(*) from booking_requests where org_id = p_org and status = 'pending'),
    'time_off_requests', (select count(*) from time_off where org_id = p_org and status = 'requested'),
    'equipment_issues', (select count(*) from equipment_issues where org_id = p_org and status = 'open'),
    'customers', (select count(*) from customers where org_id = p_org and status <> 'inactive'),
    'aircraft', (select count(*) from aircraft where org_id = p_org and active),
    'revenue_week', case when v_fin then (select coalesce(sum(p.amount), 0) from payments p join invoices i on i.id = p.invoice_id
        where p.org_id = p_org and (p_branch is null or i.branch_id = p_branch) and p.received_at >= date_trunc('week', now() at time zone v_tz) at time zone v_tz) end,
    'revenue_mtd', case when v_fin then (select coalesce(sum(p.amount), 0) from payments p join invoices i on i.id = p.invoice_id
        where p.org_id = p_org and (p_branch is null or i.branch_id = p_branch) and p.received_at >= v_month_start::timestamp at time zone v_tz) end,
    'total_paid', case when v_fin then (select coalesce(sum(p.amount), 0) from payments p join invoices i on i.id = p.invoice_id
        where p.org_id = p_org and (p_branch is null or i.branch_id = p_branch)) end,
    'revenue_last_month', case when v_fin then (select coalesce(sum(amount), 0) from payments where org_id = p_org
        and received_at >= (v_month_start - interval '1 month')::timestamp at time zone v_tz and received_at < v_month_start::timestamp at time zone v_tz) end,
    'outstanding', case when v_fin then (select coalesce(sum(balance), 0) from invoices where org_id = p_org and status in ('sent','partial','overdue') and (p_branch is null or branch_id = p_branch)) end,
    'overdue', case when v_fin then (select coalesce(sum(balance), 0) from invoices where org_id = p_org and status in ('sent','partial','overdue') and due_date < current_date and (p_branch is null or branch_id = p_branch)) end,
    'pipeline_value', case when v_fin then (select coalesce(sum(value * probability / 100.0), 0) from opportunities where org_id = p_org and stage not in ('won','lost')) end,
    'leads_due', case when v_fin then (select count(*) from opportunities where org_id = p_org and stage not in ('won','lost') and follow_up_on <= current_date) end,
    -- Month-to-date profitability (excluding tax); null parts mean "Unknown".
    'profit_month', case when v_rep then jsonb_build_object(
        'revenue', pl -> 'revenue',
        'gross', case when (pl ->> 'labor_unknown_minutes')::numeric > 0 then null
                      else (pl ->> 'revenue')::numeric - (pl ->> 'labor')::numeric - (pl ->> 'supplies')::numeric end,
        'net', case when (pl ->> 'labor_unknown_minutes')::numeric > 0 then null else (pl ->> 'net')::numeric end,
        'labor_unknown_minutes', pl -> 'labor_unknown_minutes') end
  ) into v;
  return v;
end;
$$;

-- Reports summary now needs "see reports" and includes win/loss reasons.
create or replace function public.report_summary(p_org uuid, p_from date, p_to date)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.has_perm(p_org, 'see_reports') then raise exception 'Not allowed'; end if;
  return jsonb_build_object(
    'revenue', (select coalesce(sum(amount), 0) from payments where org_id = p_org and received_at::date between p_from and p_to),
    'platform_fees', (select coalesce(sum(platform_fee), 0) from payments where org_id = p_org and received_at::date between p_from and p_to),
    'invoiced', (select coalesce(sum(total), 0) from invoices where org_id = p_org and status not in ('void','draft') and issue_date between p_from and p_to),
    'expenses', (select coalesce(sum(amount), 0) from expenses where org_id = p_org and spent_on between p_from and p_to),
    'jobs_completed', (select count(*) from jobs where org_id = p_org and status in ('completed','invoiced') and coalesce(actual_end, scheduled_end)::date between p_from and p_to),
    'avg_rating', (select round(avg(rating)::numeric, 2) from jobs where org_id = p_org and rating is not null and coalesce(actual_end, scheduled_end)::date between p_from and p_to),
    'hours_logged', (select round(coalesce(sum(extract(epoch from (coalesce(ended_at, now()) - started_at)) / 3600), 0)::numeric, 1)
                      from time_entries where org_id = p_org and started_at::date between p_from and p_to),
    'quote_win_rate', (select case when count(*) filter (where status in ('accepted','declined')) = 0 then null
                         else round(100.0 * count(*) filter (where status = 'accepted') / count(*) filter (where status in ('accepted','declined')), 1) end
                       from quotes where org_id = p_org and issue_date between p_from and p_to and superseded_by is null),
    'decline_reasons', (select coalesce(jsonb_object_agg(decline_reason, n), '{}') from (
                         select decline_reason, count(*) n from quotes where org_id = p_org and status = 'declined'
                           and decline_reason is not null and issue_date between p_from and p_to group by 1) x),
    'by_service', (select coalesce(jsonb_agg(x order by x.revenue desc), '[]'::jsonb) from (
                     select ii.description as name, round(sum(ii.quantity * ii.unit_price), 2) as revenue, count(*) as count
                     from invoice_items ii join invoices i on i.id = ii.invoice_id
                     where i.org_id = p_org and i.status not in ('void','draft') and i.issue_date between p_from and p_to
                     group by ii.description order by 2 desc limit 10) x),
    'top_customers', (select coalesce(jsonb_agg(x order by x.revenue desc), '[]'::jsonb) from (
                     select c.name, round(sum(i.total), 2) as revenue
                     from invoices i join customers c on c.id = i.customer_id
                     where i.org_id = p_org and i.status not in ('void','draft') and i.issue_date between p_from and p_to
                     group by c.name order by 2 desc limit 10) x),
    'by_month', (select coalesce(jsonb_agg(x order by x.month), '[]'::jsonb) from (
                     select to_char(date_trunc('month', received_at), 'YYYY-MM') as month, round(sum(amount), 2) as revenue
                     from payments where org_id = p_org and received_at::date between p_from and p_to
                     group by 1) x),
    'expenses_by_category', (select coalesce(jsonb_agg(x order by x.amount desc), '[]'::jsonb) from (
                     select category, round(sum(amount), 2) as amount
                     from expenses where org_id = p_org and spent_on between p_from and p_to
                     group by category) x),
    'technician_hours', (select coalesce(jsonb_agg(x order by x.hours desc), '[]'::jsonb) from (
                     select coalesce(m.display_name, 'Unknown') as name,
                            round(sum(extract(epoch from (coalesce(t.ended_at, now()) - t.started_at)) / 3600)::numeric, 1) as hours
                     from time_entries t left join memberships m on m.user_id = t.user_id and m.org_id = t.org_id
                     where t.org_id = p_org and t.started_at::date between p_from and p_to
                     group by 1) x)
  );
end;
$$;

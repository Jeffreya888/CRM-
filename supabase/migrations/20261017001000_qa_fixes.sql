-- =============================================================================
-- QA fixes (found driving the app end to end). Never edit older migrations.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Jobs created from a quote (customer acceptance or "Convert to job") start
--    at the aircraft's home facility when the quote has no facility, like
--    every other new job.
-- ---------------------------------------------------------------------------
create or replace function public._job_from_quote(p_quote uuid, p_start timestamptz, p_status job_status)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  q quotes;
  v_job uuid;
  v_opt uuid;
begin
  select * into q from quotes where id = p_quote;
  select id into v_job from jobs where quote_id = q.id and status <> 'cancelled' order by created_at limit 1;
  if v_job is not null then
    if p_status = 'scheduled' then
      update jobs set status = 'scheduled', scheduled_start = coalesce(p_start, scheduled_start),
        scheduled_end = coalesce(p_start + interval '4 hours', scheduled_end)
      where id = v_job and status = 'tentative';
    end if;
    return v_job;
  end if;
  v_opt := coalesce(q.selected_option_id, (select id from quote_options where quote_id = q.id order by sort_order limit 1));
  insert into jobs (org_id, number, customer_id, aircraft_id, location_id, branch_id, quote_id, status, scheduled_start, scheduled_end, notes, created_by, title)
  values (q.org_id, public._next_number(q.org_id, 'job'), q.customer_id, q.aircraft_id,
          coalesce(q.location_id, (select home_location_id from aircraft where id = q.aircraft_id)), q.branch_id, q.id, p_status,
          p_start, p_start + interval '4 hours', q.notes, coalesce(auth.uid(), q.created_by),
          (select string_agg(description, ', ' order by sort_order) from quote_items where quote_id = q.id and (v_opt is null or option_id = v_opt)))
  returning id into v_job;
  insert into job_items (org_id, job_id, service_id, description, quantity, unit_price, taxable, sort_order)
    select org_id, v_job, service_id, description, quantity, unit_price, taxable, sort_order
    from quote_items where quote_id = q.id and (v_opt is null or option_id = v_opt);
  -- Discounts carry over as a negative line so the job total matches the quote.
  if q.discount > 0 then
    insert into job_items (org_id, job_id, description, quantity, unit_price, taxable, sort_order)
      values (q.org_id, v_job, 'Discount', 1, -least(q.discount, q.subtotal), false, 9999);
  end if;
  insert into job_checklist_items (org_id, job_id, label, sort_order, guide_key, step_index)
    select q.org_id, v_job, step, (qi.sort_order * 100 + ord)::int, s.guide_key, (ord - 1)::int
    from quote_items qi
    join services s on s.id = qi.service_id
    cross join lateral unnest(s.checklist) with ordinality as t(step, ord)
    where qi.quote_id = q.id and (v_opt is null or qi.option_id = v_opt);
  return v_job;
end;
$$;
revoke execute on function public._job_from_quote(uuid, timestamptz, job_status) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Profit & loss "Profit by customer": when a job's labor or supply cost is
--    unknown (no pay rate / unit cost) the gross profit was shown as the full
--    revenue, as if the job cost nothing. It is now null ("Unknown"), and known
--    costs are always subtracted.
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
          case when bool_or(z.pr is not null and (z.pr->>'gross') is null) then null
               else round(sum(i.subtotal - i.discount) - coalesce(sum((z.pr->>'labor')::numeric + (z.pr->>'supplies')::numeric), 0), 2)
          end as gross_profit
        from invoices i join customers c on c.id = i.customer_id
          left join lateral (select public.job_profitability(i.job_id) as pr where i.job_id is not null) z on true
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

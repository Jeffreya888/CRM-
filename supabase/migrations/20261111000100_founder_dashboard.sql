-- Founder dashboard: growth over time, needs-attention lists, company lookup with support actions,
-- and the activation funnel. Everything here is for platform admins only.

-- Web subscription status from Stripe (active, past_due, canceled...), kept by the stripe-webhook function.
alter table public.organizations add column if not exists billing_status text;

-- The metrics body, callable without the admin check by the nightly snapshot (service only).
create or replace function public.platform_metrics_data()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v jsonb;
begin
  with orgs as (
    select o.id, o.created_at, o.billing_period, o.billing_source, public.effective_plan(o.id) as eplan, o.plan, o.extra_locations,
      case when o.billing_discount_ends_at is null or o.billing_discount_ends_at > now() then coalesce(o.billing_discount_monthly, 0) else 0 end as discount
    from organizations o where not o.is_demo
  ), paid as (
    select *, case eplan
        when 'solo' then case when billing_period = 'annual' then 699.99 / 12 else 69.99 end
        when 'team' then case when billing_period = 'annual' then 1199.99 / 12 else 119.99 end
        when 'fleet' then case when billing_period = 'annual' then 2199.99 / 12 else 219.99 end
        else 0 end
      -- Extra locations on Fleet: $39 each for the first 15, $29 after (yearly = 10 months, spread over 12).
      + case when eplan = 'fleet' and extra_locations > 0 then
          (least(extra_locations, 15) * 39 + greatest(extra_locations - 15, 0) * 29)
          * case when billing_period = 'annual' then 10.0 / 12 else 1 end
        else 0 end
      -- Coupons (e.g. the founding offer) until they end; Stripe then charges full price.
      - discount as mrr,
      case when eplan = 'fleet' then extra_locations else 0 end as extras,
      case when eplan = 'fleet' and extra_locations > 0 then
          (least(extra_locations, 15) * 39 + greatest(extra_locations - 15, 0) * 29)
          * case when billing_period = 'annual' then 10.0 / 12 else 1 end
        else 0 end as extras_mrr,
      -- What reaches us after store commission (15% small-business rate) or Stripe (~3%).
      case when billing_source = 'stripe' then 0.97 else 0.85 end as net_rate
    from orgs where eplan in ('solo','team','fleet')
  ), ai as (
    select
      count(*) filter (where kind = 'check' and used_at >= now() - interval '30 days') as checks_30d,
      count(*) filter (where kind = 'question' and used_at >= now() - interval '30 days') as questions_30d
    from ai_usage
  ), pay as (
    select coalesce(sum(amount), 0) as volume_30d, coalesce(sum(platform_fee), 0) as fees_30d,
           count(distinct org_id) as paying_orgs_30d
    from payments where received_at >= now() - interval '30 days' and method = 'card'
  )
  select jsonb_build_object(
    'generated_at', now(),
    'companies', (select count(*) from orgs),
    'new_companies_30d', (select count(*) from orgs where created_at >= now() - interval '30 days'),
    'trials_active', (select count(*) from orgs where eplan = 'trial'),
    'paid_companies', (select count(*) from paid),
    'by_plan', (select coalesce(jsonb_object_agg(eplan, n), '{}') from (select eplan, count(*) n from paid group by eplan) x),
    'by_source', (select coalesce(jsonb_object_agg(coalesce(billing_source, 'unknown'), n), '{}') from (select billing_source, count(*) n from paid group by billing_source) x),
    'expired', (select count(*) from orgs where eplan = 'expired'),
    -- Paying companies whose paid access ended in the last 30 days (cancelled or not renewed).
    'churned_30d', (select count(*) from organizations o where not o.is_demo and o.billing_source is not null
        and public.effective_plan(o.id) = 'expired' and o.plan_expires_at >= now() - interval '30 days'),
    'mrr', (select round(coalesce(sum(mrr), 0), 2) from paid),
    'discounts_mrr', (select round(coalesce(sum(discount), 0), 2) from paid),
    'discounted_companies', (select count(*) from paid where discount > 0),
    'extra_locations_billed', (select coalesce(sum(extras), 0) from paid),
    'extra_locations_mrr', (select round(coalesce(sum(extras_mrr), 0), 2) from paid),
    'mrr_net', (select round(coalesce(sum(mrr * net_rate), 0), 2) from paid),
    'arr', (select round(coalesce(sum(mrr), 0) * 12, 2) from paid),
    'arpa', (select case when count(*) > 0 then round(sum(mrr) / count(*), 2) end from paid),
    'trial_conversion_pct', (select case when count(*) filter (where created_at < now() - interval '30 days') > 0
        then round(100.0 * count(*) filter (where eplan in ('solo','team','fleet') and created_at < now() - interval '30 days')
                   / count(*) filter (where created_at < now() - interval '30 days'), 1) end from orgs),
    'payment_volume_30d', (select round(volume_30d, 2) from pay),
    'platform_fees_30d', (select round(fees_30d, 2) from pay),
    'companies_taking_payments_30d', (select paying_orgs_30d from pay),
    'ai_checks_30d', (select checks_30d from ai),
    'ai_questions_30d', (select questions_30d from ai),
    -- Estimates: about 10 cents per photo check and 1.5 cents per question.
    'ai_cost_estimate_30d', (select round(checks_30d * 0.10 + questions_30d * 0.015, 2) from ai),
    'gross_margin_estimate_pct', (select case when (select sum(mrr * net_rate) from paid) + (select fees_30d from pay) > 0
        then round(100 * (1 - ((select checks_30d * 0.10 + questions_30d * 0.015 from ai) + 25)
                         / ((select sum(mrr * net_rate) from paid) + (select fees_30d from pay))), 1) end)
  ) into v;
  return v;
end;
$$;
revoke execute on function public.platform_metrics_data() from public, anon, authenticated;

create or replace function public.platform_metrics()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_platform_admin() then raise exception 'Not allowed'; end if;
  return public.platform_metrics_data();
end;
$$;
revoke execute on function public.platform_metrics() from public, anon;
grant execute on function public.platform_metrics() to authenticated;

-- ---------------------------------------------------------------------------
-- 1. Growth over time: one row per day, saved by the automation worker.
-- ---------------------------------------------------------------------------
create table if not exists public.platform_daily_stats (
  day date primary key,
  companies int not null default 0,
  paid_companies int not null default 0,
  trials int not null default 0,
  new_companies int not null default 0,
  churned int not null default 0,
  mrr numeric(12,2) not null default 0,
  mrr_net numeric(12,2) not null default 0,
  data jsonb not null default '{}',
  updated_at timestamptz not null default now()
);
alter table public.platform_daily_stats enable row level security;
revoke all on public.platform_daily_stats from anon, authenticated;

create or replace function public.platform_snapshot()
returns void language plpgsql security definer set search_path = public as $$
declare m jsonb := public.platform_metrics_data(); d date := (now() at time zone 'utc')::date;
begin
  insert into platform_daily_stats (day, companies, paid_companies, trials, new_companies, churned, mrr, mrr_net, data, updated_at)
  values (d, (m->>'companies')::int, (m->>'paid_companies')::int, (m->>'trials_active')::int,
    (select count(*) from organizations where not is_demo and (created_at at time zone 'utc')::date = d),
    (select count(*) from organizations where not is_demo and billing_source is not null
       and public.effective_plan(id) = 'expired' and (plan_expires_at at time zone 'utc')::date = d),
    coalesce((m->>'mrr')::numeric, 0), coalesce((m->>'mrr_net')::numeric, 0), m, now())
  on conflict (day) do update set companies = excluded.companies, paid_companies = excluded.paid_companies, trials = excluded.trials,
    new_companies = excluded.new_companies, churned = excluded.churned, mrr = excluded.mrr, mrr_net = excluded.mrr_net,
    data = excluded.data, updated_at = now();
end;
$$;
revoke execute on function public.platform_snapshot() from public, anon, authenticated;

create or replace function public.platform_history(p_days int default 90)
returns table (day date, companies int, paid_companies int, trials int, new_companies int, churned int, mrr numeric, mrr_net numeric)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_platform_admin() then raise exception 'Not allowed'; end if;
  return query select s.day, s.companies, s.paid_companies, s.trials, s.new_companies, s.churned, s.mrr, s.mrr_net
    from platform_daily_stats s where s.day >= (now() at time zone 'utc')::date - greatest(1, least(p_days, 1100)) order by s.day;
end;
$$;
revoke execute on function public.platform_history(int) from public, anon;
grant execute on function public.platform_history(int) to authenticated;

-- ---------------------------------------------------------------------------
-- Shared: owner contact and last time anyone in the company signed in.
-- ---------------------------------------------------------------------------
create or replace function public._org_owner_email(p_org uuid) returns text
language sql stable security definer set search_path = public, auth as $$
  select u.email from memberships m join auth.users u on u.id = m.user_id
  where m.org_id = p_org and m.role = 'owner' and m.active order by m.created_at limit 1;
$$;
revoke execute on function public._org_owner_email(uuid) from public, anon, authenticated;

create or replace function public._org_last_active(p_org uuid) returns timestamptz
language sql stable security definer set search_path = public, auth as $$
  select max(u.last_sign_in_at) from memberships m join auth.users u on u.id = m.user_id where m.org_id = p_org and m.active;
$$;
revoke execute on function public._org_last_active(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Needs attention: who to contact this week.
-- ---------------------------------------------------------------------------
create or replace function public.platform_attention()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v jsonb;
begin
  if not public.is_platform_admin() then raise exception 'Not allowed'; end if;
  select jsonb_build_object(
    'trials_ending', coalesce((select jsonb_agg(x order by x->>'trial_ends_at') from (
      select jsonb_build_object('id', o.id, 'name', o.name, 'owner_email', public._org_owner_email(o.id), 'trial_ends_at', o.trial_ends_at,
        'last_active', public._org_last_active(o.id)) x
      from organizations o where not o.is_demo and o.plan = 'trial' and o.trial_ends_at between now() and now() + interval '3 days') t), '[]'),
    'payment_failed', coalesce((select jsonb_agg(x) from (
      select jsonb_build_object('id', o.id, 'name', o.name, 'owner_email', public._org_owner_email(o.id), 'plan', o.plan,
        'status', o.billing_status, 'plan_expires_at', o.plan_expires_at) x
      from organizations o where not o.is_demo and o.billing_status in ('past_due', 'unpaid')) t), '[]'),
    'inactive_paid', coalesce((select jsonb_agg(x order by x->>'last_active' nulls first) from (
      select jsonb_build_object('id', o.id, 'name', o.name, 'owner_email', public._org_owner_email(o.id), 'plan', public.effective_plan(o.id),
        'last_active', public._org_last_active(o.id)) x
      from organizations o where not o.is_demo and public.effective_plan(o.id) in ('solo', 'team', 'fleet')
        and coalesce(public._org_last_active(o.id), o.created_at) < now() - interval '14 days') t), '[]'),
    'networks_overdue', coalesce((select jsonb_agg(x) from (
      select jsonb_build_object('id', n.id, 'name', n.name, 'hq_org_id', n.hq_org_id, 'owner_email', public._org_owner_email(n.hq_org_id),
        'status', n.billing_status, 'locations', n.billed_locations) x
      from franchise_networks n where n.billing_status in ('past_due', 'unpaid')) t), '[]')
  ) into v;
  return v;
end;
$$;
revoke execute on function public.platform_attention() from public, anon;
grant execute on function public.platform_attention() to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Company lookup and support actions.
-- ---------------------------------------------------------------------------
create or replace function public.platform_find_companies(p_query text)
returns jsonb language plpgsql stable security definer set search_path = public, auth as $$
declare q text := '%' || replace(replace(trim(coalesce(p_query, '')), '%', ''), '_', '') || '%';
begin
  if not public.is_platform_admin() then raise exception 'Not allowed'; end if;
  if length(trim(coalesce(p_query, ''))) < 2 then return '[]'; end if;
  return coalesce((select jsonb_agg(x) from (
    select jsonb_build_object('id', o.id, 'name', o.name, 'plan', public.effective_plan(o.id), 'owner_email', public._org_owner_email(o.id),
      'created_at', o.created_at, 'last_active', public._org_last_active(o.id)) x
    from organizations o
    where not o.is_demo and (o.name ilike q or o.email ilike q or exists (
      select 1 from memberships m join auth.users u on u.id = m.user_id where m.org_id = o.id and u.email ilike q))
    order by o.name limit 25) t), '[]');
end;
$$;
revoke execute on function public.platform_find_companies(text) from public, anon;
grant execute on function public.platform_find_companies(text) to authenticated;

create or replace function public.platform_company(p_org uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare o organizations; v jsonb;
begin
  if not public.is_platform_admin() then raise exception 'Not allowed'; end if;
  select * into o from organizations where id = p_org;
  if o.id is null then raise exception 'Company not found'; end if;
  select jsonb_build_object(
    'id', o.id, 'name', o.name, 'email', o.email, 'phone', o.phone, 'created_at', o.created_at, 'business_types', o.business_types,
    'plan', o.plan, 'effective_plan', public.effective_plan(o.id), 'trial_ends_at', o.trial_ends_at, 'plan_expires_at', o.plan_expires_at,
    'billing_source', o.billing_source, 'billing_period', o.billing_period, 'billing_status', o.billing_status,
    'extra_locations', o.extra_locations, 'branch_limit', o.branch_limit, 'discount_monthly', o.billing_discount_monthly,
    'owner_email', public._org_owner_email(o.id), 'last_active', public._org_last_active(o.id),
    'team', (select count(*) from memberships where org_id = o.id and active),
    'locations', (select count(*) from branches where org_id = o.id and active),
    'customers', (select count(*) from customers where org_id = o.id),
    'quotes', (select count(*) from quotes where org_id = o.id),
    'jobs_completed', (select count(*) from jobs where org_id = o.id and status in ('completed', 'invoiced')),
    'invoices', (select count(*) from invoices where org_id = o.id),
    'payments', (select count(*) from payments where org_id = o.id),
    'revenue_30d', (select coalesce(sum(amount), 0) from payments where org_id = o.id and received_at >= now() - interval '30 days'),
    'ai_checks_30d', (select count(*) from ai_usage where org_id = o.id and kind = 'check' and used_at >= now() - interval '30 days'),
    'ai_questions_30d', (select count(*) from ai_usage where org_id = o.id and kind = 'question' and used_at >= now() - interval '30 days'),
    'texts_30d', (select count(*) from messages where org_id = o.id and channel = 'sms' and direction = 'out' and sent_at >= now() - interval '30 days'),
    'franchise', (select jsonb_build_object('network', n.name, 'role', case when n.hq_org_id = o.id then 'hq' else 'location' end)
                  from franchise_networks n where n.hq_org_id = o.id
                     or n.id = (select network_id from franchise_members where org_id = o.id) limit 1)
  ) into v;
  return v;
end;
$$;
revoke execute on function public.platform_company(uuid) from public, anon;
grant execute on function public.platform_company(uuid) to authenticated;

-- Give a company more trial days (from today, or from the end of its current trial if later).
create or replace function public.platform_extend_trial(p_org uuid, p_days int)
returns timestamptz language plpgsql security definer set search_path = public as $$
declare v timestamptz; o organizations;
begin
  if not public.is_platform_admin() then raise exception 'Not allowed'; end if;
  if p_days is null or p_days < 1 or p_days > 90 then raise exception 'Choose 1 to 90 days'; end if;
  select * into o from organizations where id = p_org;
  if o.id is null then raise exception 'Company not found'; end if;
  if public.effective_plan(p_org) in ('solo', 'team', 'fleet') then raise exception 'This company is already on a paid plan'; end if;
  v := greatest(coalesce(o.trial_ends_at, now()), now()) + make_interval(days => p_days);
  update organizations set plan = 'trial', trial_ends_at = v where id = p_org;
  insert into notification_outbox (org_id, audience, kind, title, body, url)
  values (p_org, 'owners', 'trial_extended', 'Your free trial was extended', 'You have ' || p_days || ' more days to try everything in Tarmo.', '/paywall');
  return v;
end;
$$;
revoke execute on function public.platform_extend_trial(uuid, int) from public, anon;
grant execute on function public.platform_extend_trial(uuid, int) to authenticated;

-- Free time on a plan (design partners, apologies). Not for companies billed by Stripe or the stores,
-- whose billing would overwrite it: give those a coupon or credit in Stripe instead.
create or replace function public.platform_comp_plan(p_org uuid, p_plan public.plan_tier, p_days int)
returns timestamptz language plpgsql security definer set search_path = public as $$
declare v timestamptz; o organizations;
begin
  if not public.is_platform_admin() then raise exception 'Not allowed'; end if;
  if p_plan not in ('solo', 'team', 'fleet') then raise exception 'Choose Solo, Team or Fleet'; end if;
  if p_days is null or p_days < 1 or p_days > 366 then raise exception 'Choose 1 to 366 days'; end if;
  select * into o from organizations where id = p_org;
  if o.id is null then raise exception 'Company not found'; end if;
  if o.billing_source in ('stripe', 'app_store', 'play_store', 'franchise') and public.effective_plan(p_org) in ('solo', 'team', 'fleet') then
    raise exception 'This company pays through %. Give them a coupon or credit there instead.',
      case o.billing_source when 'stripe' then 'Stripe' when 'franchise' then 'its franchise network' when 'play_store' then 'Google Play' else 'the App Store' end;
  end if;
  v := greatest(case when public.effective_plan(p_org) = p_plan then coalesce(o.plan_expires_at, now()) else now() end, now()) + make_interval(days => p_days);
  update organizations set plan = p_plan, plan_expires_at = v, billing_source = null where id = p_org;
  insert into notification_outbox (org_id, audience, kind, title, body, url)
  values (p_org, 'owners', 'plan_comped', 'You have ' || initcap(p_plan::text) || ' free',
          'Tarmo gave your company ' || p_days || ' days of ' || initcap(p_plan::text) || ' at no charge.', '/paywall');
  return v;
end;
$$;
revoke execute on function public.platform_comp_plan(uuid, public.plan_tier, int) from public, anon;
grant execute on function public.platform_comp_plan(uuid, public.plan_tier, int) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Activation funnel for companies that signed up in the last N days.
-- ---------------------------------------------------------------------------
create or replace function public.platform_funnel(p_days int default 90)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v jsonb;
begin
  if not public.is_platform_admin() then raise exception 'Not allowed'; end if;
  with c as (
    select o.id, o.billing_source, public.effective_plan(o.id) as eplan from organizations o
    where not o.is_demo and o.created_at >= now() - make_interval(days => greatest(1, least(p_days, 1100)))
  )
  select jsonb_build_object(
    'days', p_days,
    'signed_up', (select count(*) from c),
    'added_customer', (select count(*) from c where exists (select 1 from customers x where x.org_id = c.id)),
    'sent_quote', (select count(*) from c where exists (select 1 from quotes x where x.org_id = c.id and x.status <> 'draft')),
    'completed_job', (select count(*) from c where exists (select 1 from jobs x where x.org_id = c.id and x.status in ('completed', 'invoiced'))),
    'got_paid', (select count(*) from c where exists (select 1 from payments x where x.org_id = c.id)),
    'subscribed', (select count(*) from c where c.eplan in ('solo', 'team', 'fleet') or c.billing_source is not null)
  ) into v;
  return v;
end;
$$;
revoke execute on function public.platform_funnel(int) from public, anon;
grant execute on function public.platform_funnel(int) to authenticated;

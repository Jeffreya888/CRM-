-- Founder metrics show what companies actually pay: Stripe coupons (like the founding offer) are
-- subtracted from MRR until they end. The stripe-webhook function keeps these two columns current.
alter table public.organizations
  add column if not exists billing_discount_monthly numeric(10,2) not null default 0 check (billing_discount_monthly >= 0),
  add column if not exists billing_discount_ends_at timestamptz;

create or replace function public.platform_metrics()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v jsonb;
begin
  if not public.is_platform_admin() then raise exception 'Not allowed'; end if;
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
revoke execute on function public.platform_metrics() from public, anon;
grant execute on function public.platform_metrics() to authenticated;

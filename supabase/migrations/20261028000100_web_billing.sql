-- Web subscriptions through Stripe Billing (sign up and pay on the website).
-- A company's subscription comes from exactly one place: the App Store, Google
-- Play or Stripe (web). Plan columns stay server-only (no user update grant).
alter table public.organizations
  add column billing_source text check (billing_source in ('app_store','play_store','stripe')),
  add column stripe_billing_customer_id text,
  add column stripe_subscription_id text;
create unique index organizations_stripe_billing_customer on public.organizations (stripe_billing_customer_id)
  where stripe_billing_customer_id is not null;
create unique index organizations_stripe_subscription on public.organizations (stripe_subscription_id)
  where stripe_subscription_id is not null;

-- Existing paid companies came from the stores.
update public.organizations set billing_source = 'app_store'
where plan in ('solo','team','fleet') and billing_source is null and not is_demo;

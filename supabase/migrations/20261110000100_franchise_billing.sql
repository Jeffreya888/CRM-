-- Franchise network billing through Stripe (platform account).
--  all_in: HQ pays $149 per franchisee location per month (min $499) and every franchisee is on Team, covered by HQ.
--  split:  HQ pays $47 per franchisee location for Franchise HQ (min $499); franchisees pay their own plan with 15% off.
-- Support picks the mode (Platform admin). Stripe keeps quantity = number of franchisee locations; the
-- franchise-billing function and the automation worker keep it in sync. The HQ's own company keeps its own plan.

alter table public.franchise_networks
  add column if not exists billing_mode text check (billing_mode in ('all_in', 'split')),
  add column if not exists founding_rate boolean not null default false,
  add column if not exists stripe_subscription_id text unique,
  add column if not exists billing_status text,
  add column if not exists paid_through timestamptz,
  add column if not exists billed_locations int not null default 0;

-- Covered franchisees are billed through their network.
alter table public.organizations drop constraint if exists organizations_billing_source_check;
alter table public.organizations add constraint organizations_billing_source_check
  check (billing_source in ('app_store', 'play_store', 'stripe', 'franchise'));
alter table public.organizations add column if not exists franchise_discount_applied boolean not null default false;

-- Put every franchisee of an all-in network on Team through the date HQ has paid (+3 days grace).
-- Companies paying for their own plan keep it until it ends; then the network covers them.
create or replace function public.franchise_apply_coverage(p_network uuid)
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  update organizations o set plan = 'team', plan_expires_at = net.paid_through + interval '3 days', billing_source = 'franchise'
  from franchise_members m join franchise_networks net on net.id = m.network_id
  where m.network_id = p_network and o.id = m.org_id and not o.is_demo
    and net.billing_mode = 'all_in' and net.paid_through is not null
    and (o.billing_source = 'franchise'
         or not (o.plan in ('solo', 'team', 'fleet') and (o.plan_expires_at is null or o.plan_expires_at > now())));
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function public.franchise_apply_coverage(uuid) from public, anon, authenticated;

-- Joining an all-in network: covered right away. Leaving: 14 days to choose a plan of their own.
create or replace function public.trg_franchise_member_billing()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    perform public.franchise_apply_coverage(new.network_id);
    return new;
  end if;
  update organizations set plan_expires_at = least(coalesce(plan_expires_at, now() + interval '14 days'), now() + interval '14 days')
  where id = old.org_id and billing_source = 'franchise';
  return old;
end $$;
drop trigger if exists franchise_member_billing on public.franchise_members;
create trigger franchise_member_billing after insert or delete on public.franchise_members
  for each row execute function public.trg_franchise_member_billing();

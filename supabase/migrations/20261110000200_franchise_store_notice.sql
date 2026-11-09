-- Franchisees paying through the App Store / Google Play can't be discounted or cancelled by Tarmo.
-- Tell their owners what to do when their network bills all-in (cancel to avoid paying twice) or split
-- (subscribe on the web for 15% off). Sent when they join a billed network and when HQ billing is set up.

create or replace function public.franchise_notify_store_members(p_network uuid, p_org uuid default null)
returns int language plpgsql security definer set search_path = public as $$
declare v_mode text; v_name text; n int;
begin
  select billing_mode, name into v_mode, v_name from franchise_networks where id = p_network;
  if v_mode is null then return 0; end if;
  insert into notification_outbox (org_id, audience, kind, title, body, url)
  select o.id, 'owners', 'franchise_store_billing',
    case when v_mode = 'all_in' then v_name || ' now pays for your plan' else v_name || ': 15% off on the web' end,
    case when v_mode = 'all_in'
      then 'Cancel your App Store or Google Play subscription in your phone settings so you aren''t charged twice. Your plan stays active.'
      else 'Cancel your App Store or Google Play subscription in your phone settings, then subscribe at gettarmo.com to get your network''s 15% off.' end,
    '/settings'
  from franchise_members m join organizations o on o.id = m.org_id
  where m.network_id = p_network and (p_org is null or m.org_id = p_org) and not o.is_demo
    and o.billing_source in ('app_store', 'play_store')
    and o.plan in ('solo', 'team', 'fleet') and (o.plan_expires_at is null or o.plan_expires_at > now())
    and not exists (select 1 from notification_outbox x where x.org_id = o.id and x.kind = 'franchise_store_billing'
                    and x.created_at > now() - interval '30 days');
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function public.franchise_notify_store_members(uuid, uuid) from public, anon, authenticated;

create or replace function public.trg_franchise_member_billing()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    perform public.franchise_apply_coverage(new.network_id);
    perform public.franchise_notify_store_members(new.network_id, new.org_id);
    return new;
  end if;
  update organizations set plan_expires_at = least(coalesce(plan_expires_at, now() + interval '14 days'), now() + interval '14 days')
  where id = old.org_id and billing_source = 'franchise';
  return old;
end $$;

-- When support sets or changes how a network pays, tell its store-billed franchisees.
create or replace function public.trg_franchise_network_mode()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.billing_mode is distinct from old.billing_mode then perform public.franchise_notify_store_members(new.id); end if;
  return new;
end $$;
drop trigger if exists franchise_network_mode on public.franchise_networks;
create trigger franchise_network_mode after update of billing_mode on public.franchise_networks
  for each row execute function public.trg_franchise_network_mode();

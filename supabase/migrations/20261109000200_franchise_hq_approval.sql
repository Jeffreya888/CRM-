-- Franchise HQ is part of Enterprise & Franchise: only companies Tarmo approves can create a network.
-- Support turns it on per company (organizations.franchise_hq_enabled). App users can't change it:
-- organizations only grants column-level updates, and this column isn't one of them.
-- Franchisees joining a network with an invite code don't need it.

alter table public.organizations add column if not exists franchise_hq_enabled boolean not null default false;

-- Any company already running a network (outside the demo) keeps it.
update public.organizations o set franchise_hq_enabled = true
where not o.is_demo and exists (select 1 from public.franchise_networks n where n.hq_org_id = o.id);

create or replace function public.franchise_create(p_org uuid, p_name text, p_royalty numeric default 0, p_marketing numeric default 0)
returns uuid language plpgsql security definer set search_path = public as $$
declare id uuid;
begin
  if not public.is_admin(p_org) then raise exception 'Only owners and admins can set up a franchise network'; end if;
  if exists (select 1 from franchise_members where org_id = p_org) then raise exception 'This company is a location in another franchise network'; end if;
  if not coalesce((select o.franchise_hq_enabled from organizations o where o.id = p_org), false) then
    raise exception 'PLAN_FEATURE: Franchise HQ is part of Enterprise & Franchise. Talk to us and we''ll set it up for your brand.';
  end if;
  insert into franchise_networks (hq_org_id, name, royalty_pct, marketing_pct)
  values (p_org, trim(p_name), coalesce(p_royalty, 0), coalesce(p_marketing, 0)) returning franchise_networks.id into id;
  return id;
end $$;

-- Enterprise pricing for one owner with more than 5 locations: Fleet covers 5, each extra location
-- is billed per month on the web subscription ($39 each for locations 6-20, $29 from the 21st).
-- organizations.extra_locations mirrors the quantity on the Stripe subscription (server-only).
-- Each paid extra location also adds 100 AI photo checks, 1,200 Ask Tarmo questions and 600 texts a month.
-- organizations.branch_limit stays as a support override for invoiced customers.

alter table public.organizations add column if not exists extra_locations int not null default 0 check (extra_locations between 0 and 500);

-- Extra locations count only while the company is on Fleet.
create or replace function public.org_extra_locations(p_org uuid)
returns int language sql stable security definer set search_path = public as $$
  select case when public.effective_plan(p_org) = 'fleet' then coalesce((select extra_locations from organizations where id = p_org), 0) else 0 end;
$$;
revoke execute on function public.org_extra_locations(uuid) from public, anon;
grant execute on function public.org_extra_locations(uuid) to authenticated;

create or replace function public.org_branch_limit(p_org uuid)
returns int language sql stable security definer set search_path = public as $$
  select coalesce((select branch_limit from organizations where id = p_org), 5 + public.org_extra_locations(p_org));
$$;

create or replace function public.ai_included(p_org uuid)
returns int language sql stable security definer set search_path = public as $$
  select case
    when (select is_demo from organizations where id = p_org) then 5
    else case public.effective_plan(p_org) when 'trial' then 15 when 'solo' then 25 when 'team' then 150
      when 'fleet' then 500 + 100 * public.org_extra_locations(p_org) else 0 end
  end;
$$;

create or replace function public.ai_questions_included(p_org uuid)
returns int language sql stable security definer set search_path = public as $$
  select case
    when (select is_demo from organizations where id = p_org) then 20
    else case public.effective_plan(p_org) when 'trial' then 100 when 'solo' then 300 when 'team' then 2000
      when 'fleet' then 6000 + 1200 * public.org_extra_locations(p_org) else 0 end
  end;
$$;

create or replace function public.sms_allowance(p_org uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select case when auth.uid() is not null and not public.is_member(p_org) then null else jsonb_build_object(
    'included', case public.effective_plan(p_org) when 'solo' then 250 when 'team' then 1000
      when 'fleet' then 3000 + 600 * public.org_extra_locations(p_org) when 'trial' then 100 else 0 end,
    'extra', (select sms_extra_credits from organizations where id = p_org),
    'used', (select count(*) from messages where org_id = p_org and channel = 'sms' and direction = 'out'
             and status not in ('queued','failed','blocked') and sent_at >= date_trunc('month', now()))) end;
$$;

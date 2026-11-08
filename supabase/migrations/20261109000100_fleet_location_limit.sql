-- Fleet includes up to 5 active company locations (branches). Enterprise customers get a higher
-- limit by setting organizations.branch_limit (support/admin only; null = the plan default).
-- Inactive locations don't count, so a company can archive one to add another.

alter table public.organizations add column if not exists branch_limit int check (branch_limit is null or branch_limit > 0);

-- App users can't change it: organizations only grants column-level updates, and this column isn't one of them.

create or replace function public.org_branch_limit(p_org uuid)
returns int language sql stable security definer set search_path = public as $$
  select coalesce((select branch_limit from organizations where id = p_org), 5);
$$;
grant execute on function public.org_branch_limit(uuid) to authenticated;

create or replace function public.assert_branches_allowed()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_limit int;
begin
  if tg_op = 'INSERT' and not public.plan_allows(new.org_id, 'branches') then
    raise exception 'PLAN_FEATURE: multiple company locations are part of the Fleet plan';
  end if;
  if new.active and (tg_op = 'INSERT' or not old.active) then
    perform pg_advisory_xact_lock(hashtext('branches:' || new.org_id::text));
    v_limit := public.org_branch_limit(new.org_id);
    if (select count(*) from branches where org_id = new.org_id and active and id <> new.id) >= v_limit then
      raise exception 'BRANCH_LIMIT: your plan includes up to % active locations. Turn one off, or contact us about Enterprise for more.', v_limit;
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists branches_plan on public.branches;
create trigger branches_plan before insert or update of active on public.branches
  for each row execute function public.assert_branches_allowed();

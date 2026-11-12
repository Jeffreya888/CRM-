-- Every plan gets customer photo quotes, quality checks and the job costing report.
-- Plans now differ only by team size (team members, timesheet approvals, technician certification),
-- locations (branches, stock by location, scheduling integrations) and monthly allowances.
create or replace function public.plan_allows(p_org uuid, p_feature text)
returns boolean language sql stable security definer set search_path = public as $$
  select case public.effective_plan(p_org)
    when 'trial' then true
    when 'fleet' then true
    when 'team' then p_feature not in ('branches','integrations','stock_locations')
    when 'solo' then p_feature not in ('branches','integrations','stock_locations','team','timesheet_approvals','certification')
    else false
  end;
$$;

-- =============================================================================
-- Plan tiers for the competitive-edge features (owner-approved Oct 18, 2026):
--   all plans   FAA lookup, SOPs, condition/size pricing, estimate vs actual
--   Team+       customer photo quotes, technician certification, quality
--               check sign-off, job costing report
--   AI checks   Solo 25 · Team 150 · Fleet 500 per month (trial 15, demo 5),
--               plus purchased packs that never expire.
-- Keep in sync with src/lib/plans.ts.
-- =============================================================================

create or replace function public.plan_allows(p_org uuid, p_feature text)
returns boolean language sql stable security definer set search_path = public as $$
  select case public.effective_plan(p_org)
    when 'trial' then true
    when 'fleet' then true
    when 'team' then p_feature not in ('branches','integrations','stock_locations')
    when 'solo' then p_feature not in ('branches','integrations','stock_locations','team','timesheet_approvals',
                                       'photo_quotes','certification','quality_check','job_costing')
    else false
  end;
$$;

create or replace function public._require_feature(p_org uuid, p_feature text, p_label text)
returns void language plpgsql stable security definer set search_path = public as $$
begin
  if not public.plan_allows(p_org, p_feature) then
    raise exception 'PLAN_FEATURE: % is part of the Team and Fleet plans', p_label;
  end if;
end;
$$;
revoke execute on function public._require_feature(uuid, text, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- AI photo checks: monthly allowance + purchased packs
-- ---------------------------------------------------------------------------
alter table public.organizations add column ai_extra_credits int not null default 0 check (ai_extra_credits >= 0);

create table public.ai_usage (
  id bigint generated always as identity primary key,
  org_id uuid not null references public.organizations(id) on delete cascade,
  paid_from text not null check (paid_from in ('plan','extra')),
  source text not null default 'staff' check (source in ('staff','portal')),
  used_at timestamptz not null default now()
);
create index on public.ai_usage (org_id, used_at desc);
alter table public.ai_usage enable row level security;
revoke all on public.ai_usage from anon, authenticated;

create or replace function public.ai_included(p_org uuid)
returns int language sql stable security definer set search_path = public as $$
  select case
    when (select is_demo from organizations where id = p_org) then 5
    else case public.effective_plan(p_org) when 'trial' then 15 when 'solo' then 25 when 'team' then 150 when 'fleet' then 500 else 0 end
  end;
$$;

-- What a company has left this calendar month (UTC).
create or replace function public.ai_allowance(p_org uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_inc int := public.ai_included(p_org);
  v_used int;
  v_extra int;
begin
  if auth.uid() is not null and not public.is_member(p_org) then raise exception 'Not a member'; end if;
  select count(*) into v_used from ai_usage where org_id = p_org and paid_from = 'plan' and used_at >= date_trunc('month', now());
  select ai_extra_credits into v_extra from organizations where id = p_org;
  return jsonb_build_object('included', v_inc, 'used', v_used, 'extra', coalesce(v_extra, 0),
                            'left', greatest(v_inc - v_used, 0) + coalesce(v_extra, 0));
end;
$$;

-- Server only: takes one check (plan allowance first, then purchased packs).
-- Returns the usage id, or null when the company is out of checks.
create or replace function public.claim_ai_check(p_org uuid, p_source text default 'staff')
returns bigint language plpgsql security definer set search_path = public as $$
declare
  v_id bigint;
  v_used int;
begin
  perform pg_advisory_xact_lock(hashtext('ai_check:' || p_org::text));
  select count(*) into v_used from ai_usage where org_id = p_org and paid_from = 'plan' and used_at >= date_trunc('month', now());
  if v_used < public.ai_included(p_org) then
    insert into ai_usage (org_id, paid_from, source) values (p_org, 'plan', p_source) returning id into v_id;
    return v_id;
  end if;
  update organizations set ai_extra_credits = ai_extra_credits - 1 where id = p_org and ai_extra_credits > 0;
  if found then
    insert into ai_usage (org_id, paid_from, source) values (p_org, 'extra', p_source) returning id into v_id;
    return v_id;
  end if;
  return null;
end;
$$;

-- Server only: gives a check back when the AI could not produce a report.
create or replace function public.release_ai_check(p_usage bigint)
returns void language plpgsql security definer set search_path = public as $$
declare u ai_usage;
begin
  delete from ai_usage where id = p_usage returning * into u;
  if found and u.paid_from = 'extra' then
    update organizations set ai_extra_credits = ai_extra_credits + 1 where id = u.org_id;
  end if;
end;
$$;

-- Server only (RevenueCat webhook): adds a purchased pack.
create or replace function public.add_ai_credits(p_org uuid, p_checks int)
returns int language sql security definer set search_path = public as $$
  update organizations set ai_extra_credits = ai_extra_credits + greatest(p_checks, 0) where id = p_org returning ai_extra_credits;
$$;
revoke execute on function public.claim_ai_check(uuid, text) from public, anon, authenticated;
revoke execute on function public.release_ai_check(bigint) from public, anon, authenticated;
revoke execute on function public.add_ai_credits(uuid, int) from public, anon, authenticated;
revoke execute on function public.ai_included(uuid) from public, anon;
revoke execute on function public.ai_allowance(uuid) from public, anon;
grant execute on function public.ai_included(uuid), public.ai_allowance(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Team+ features
-- ---------------------------------------------------------------------------
create or replace function public.submit_for_qc(p_job uuid)
returns void language plpgsql security definer set search_path = public as $$
declare j jobs;
begin
  select * into j from jobs where id = p_job;
  if not found or not public.is_member(j.org_id)
     or not (public.is_manager(j.org_id) or exists (select 1 from job_assignments where job_id = p_job and user_id = auth.uid())) then
    raise exception 'Job not found';
  end if;
  perform public._require_feature(j.org_id, 'quality_check', 'Quality check sign-off');
  if j.status in ('completed','invoiced','cancelled') then raise exception 'This job is already closed'; end if;
  perform set_config('app.qc', 'on', true);
  update jobs set qc_status = 'pending', qc_by = null, qc_at = null, qc_notes = null where id = p_job;
  perform set_config('app.qc', 'off', true);
  perform public.notify(j.org_id, 'managers', 'qc_ready', 'Ready for quality check: ' || j.number,
    coalesce(j.title, 'A job') || ' is ready for your quality check.', '/jobs/' || j.id);
end;
$$;

create or replace function public.qc_decision(p_job uuid, p_pass boolean, p_notes text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  j jobs;
  u uuid;
begin
  select * into j from jobs where id = p_job;
  if not found or not public.is_manager(j.org_id) then raise exception 'Only managers can sign off quality checks'; end if;
  perform public._require_feature(j.org_id, 'quality_check', 'Quality check sign-off');
  if not p_pass and coalesce(length(trim(p_notes)), 0) < 3 then raise exception 'Say what needs work'; end if;
  perform set_config('app.qc', 'on', true);
  update jobs set qc_status = case when p_pass then 'passed' else 'failed' end, qc_by = auth.uid(), qc_at = now(),
    qc_notes = nullif(trim(coalesce(p_notes, '')), '') where id = p_job;
  perform set_config('app.qc', 'off', true);
  if not p_pass then
    for u in select user_id from job_assignments where job_id = p_job loop
      perform public.notify(j.org_id, 'user', 'qc_failed', 'Needs work: ' || j.number, trim(p_notes), '/jobs/' || j.id, u);
    end loop;
  end if;
end;
$$;

-- "Require a quality check" only applies while the plan includes it.
create or replace function public.trg_job_qc_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and coalesce(current_setting('app.qc', true), '') <> 'on' and (
       new.qc_status is distinct from old.qc_status or new.qc_by is distinct from old.qc_by
    or new.qc_at is distinct from old.qc_at or new.qc_notes is distinct from old.qc_notes) then
    raise exception 'PERMISSION: use the quality check buttons to change the quality check';
  end if;
  if new.status = 'completed' and old.status is distinct from 'completed' and new.qc_status <> 'passed'
     and (select require_qc from organizations where id = new.org_id)
     and public.plan_allows(new.org_id, 'quality_check') then
    raise exception 'QC_REQUIRED: a manager must pass the quality check before this job is completed';
  end if;
  return new;
end;
$$;

-- QC items are only added for plans with quality checks.
create or replace function public.trg_job_item_qc()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_key text;
  g service_guides;
begin
  if not public.plan_allows(new.org_id, 'quality_check') then return null; end if;
  select guide_key into v_key from services where id = new.service_id;
  if v_key is null or exists (select 1 from job_checklist_items where job_id = new.job_id and kind = 'qc' and guide_key = v_key) then
    return null;
  end if;
  select * into g from public.guide_for(new.org_id, v_key);
  if g.id is null then return null; end if;
  insert into job_checklist_items (org_id, job_id, label, sort_order, guide_key, step_index, kind)
    select new.org_id, new.job_id, q, 1000 + ord::int, v_key, null, 'qc' from unnest(g.quality_checks) with ordinality as x(q, ord);
  return null;
end;
$$;

create or replace function public.request_skill_signoff(p_org uuid, p_guide_key text)
returns void language plpgsql security definer set search_path = public as $$
declare v_title text;
begin
  if not public.is_member(p_org) or public.has_role(p_org, array['viewer']::public.member_role[]) then raise exception 'Not allowed'; end if;
  perform public._require_feature(p_org, 'certification', 'Technician certification');
  select title into v_title from public.guide_for(p_org, p_guide_key);
  if v_title is null then raise exception 'SOP not found'; end if;
  if exists (select 1 from service_skills where org_id = p_org and user_id = auth.uid() and guide_key = p_guide_key and level <> 'training') then
    return;
  end if;
  insert into service_skills (org_id, user_id, guide_key, level, requested_at) values (p_org, auth.uid(), p_guide_key, 'training', now())
    on conflict (org_id, user_id, guide_key) do update set requested_at = now();
  perform public.notify(p_org, 'managers', 'skill_request', 'Sign-off requested: ' || v_title,
    coalesce((select display_name from memberships where org_id = p_org and user_id = auth.uid()), 'A technician') || ' asks to be certified for ' || v_title || '.',
    '/training');
end;
$$;

create or replace function public.set_skill(p_org uuid, p_user uuid, p_guide_key text, p_level text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_manager(p_org) then raise exception 'Only managers can certify technicians'; end if;
  if p_level is null then
    delete from service_skills where org_id = p_org and user_id = p_user and guide_key = p_guide_key;
    return;
  end if;
  perform public._require_feature(p_org, 'certification', 'Technician certification');
  if p_level not in ('training','certified','trainer') then raise exception 'Unknown level'; end if;
  if not exists (select 1 from memberships where org_id = p_org and user_id = p_user and active) then raise exception 'Not a team member'; end if;
  if (select g.id from public.guide_for(p_org, p_guide_key) g) is null then raise exception 'SOP not found'; end if;
  insert into service_skills (org_id, user_id, guide_key, level, certified_by, certified_at)
    values (p_org, p_user, p_guide_key, p_level,
            case when p_level = 'training' then null else auth.uid() end, case when p_level = 'training' then null else now() end)
    on conflict (org_id, user_id, guide_key) do update set level = excluded.level,
      certified_by = excluded.certified_by, certified_at = excluded.certified_at;
  if p_level <> 'training' and p_user <> auth.uid() then
    perform public.notify(p_org, 'user', 'skill_certified', 'You are certified',
      'You are now ' || case when p_level = 'trainer' then 'a trainer' else 'certified' end || ' for ' ||
      (select title from public.guide_for(p_org, p_guide_key)) || '.', '/training', p_user);
  end if;
end;
$$;

-- Certified-only services: the scheduling warning only applies on plans with certification.
create or replace function public.trg_services_cert_plan()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.requires_cert and not coalesce(old.requires_cert, false) and auth.uid() is not null then
    perform public._require_feature(new.org_id, 'certification', 'Technician certification');
  end if;
  return new;
end;
$$;
create trigger services_cert_plan before insert or update of requires_cert on public.services
  for each row execute function public.trg_services_cert_plan();

-- Job costing report: Team and Fleet.
create or replace function public.job_costing_report(p_org uuid, p_from date, p_to date, p_branch uuid default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  o organizations;
  v_tz text;
  v_jobs uuid[];
  v jsonb;
begin
  if not public.has_perm(p_org, 'see_reports') then raise exception 'Not allowed'; end if;
  perform public._require_feature(p_org, 'job_costing', 'The job costing report');
  select * into o from organizations where id = p_org;
  v_tz := o.timezone;
  select coalesce(array_agg(id), '{}') into v_jobs from jobs
  where org_id = p_org and status in ('completed','invoiced') and actual_end is not null
    and (actual_end at time zone v_tz)::date between p_from and p_to
    and (p_branch is null or branch_id = p_branch);

  with per as (
    select j.id,
      coalesce(a.category::text, 'none') as cat,
      case when a.id is null then 'No asset' else public._category_label(a.category) end as cat_label,
      coalesce(a.asset_type, 'none') as atype,
      coalesce(m.id::text, nullif(lower(concat_ws(' ', a.manufacturer, a.model)), ''), 'unknown') as model_key,
      coalesce(m.manufacturer || ' ' || m.model, nullif(concat_ws(' ', a.manufacturer, a.model), ''), 'Unknown model') as model_label,
      coalesce((select subtotal - discount from invoices i where i.job_id = j.id and i.status <> 'void' order by i.created_at desc limit 1),
               (select sum(quantity * unit_price) from job_items where job_id = j.id), 0) as revenue,
      coalesce(t.hours, 0) as hours,
      coalesce(t.true_labor, 0)
        + coalesce((select sum(-mv.delta * coalesce(mv.unit_cost, 0)) from inventory_movements mv where mv.job_id = j.id and mv.reason = 'job_use'), 0)
        + coalesce((select sum(amount) from expenses e where e.job_id = j.id), 0) as cost,
      coalesce((select sum(est_hours) from job_items where job_id = j.id), 0) as est_hours,
      coalesce(t.pay_missing, false) as pay_missing
    from jobs j
    left join aircraft a on a.id = j.aircraft_id
    left join aircraft_models m on m.id = a.model_id
    left join public._true_labor(p_org, v_jobs) t on t.job_id = j.id
    where j.id = any(v_jobs)
  ), grouped as (
    select g.kind, g.key, g.label, count(*) as jobs, sum(revenue) as revenue, sum(cost) as cost, sum(hours) as hours, sum(est_hours) as est_hours
    from per
    cross join lateral (values ('class', cat, cat_label),
                               ('model', model_key, model_label),
                               ('type', atype, case atype when 'aircraft' then 'Aircraft' when 'vehicle' then 'Vehicles'
                                                          when 'watercraft' then 'Watercraft' else 'No asset' end)) as g(kind, key, label)
    group by g.kind, g.key, g.label
  ), rows as (
    select kind, jsonb_agg(jsonb_build_object(
      'key', key, 'label', label, 'jobs', jobs, 'revenue', round(revenue, 2), 'cost', round(cost, 2), 'profit', round(revenue - cost, 2),
      'margin_pct', case when revenue > 0 then round(100 * (revenue - cost) / revenue, 1) end,
      'hours', round(hours, 2), 'est_hours', round(est_hours, 2),
      'revenue_per_hour', case when hours > 0 then round(revenue / hours, 2) end) order by revenue - cost desc) as list
    from grouped group by kind
  ), svc as (
    -- Actual hours are shared across a job's services in proportion to their estimates.
    select ji.service_id, s.name, count(distinct ji.job_id) as jobs, sum(ji.est_hours) as est_hours,
           sum(case when per.est_hours > 0 then per.hours * ji.est_hours / per.est_hours end) as actual_hours
    from job_items ji join per on per.id = ji.job_id join services s on s.id = ji.service_id
    where ji.est_hours > 0
    group by ji.service_id, s.name
  )
  select jsonb_build_object(
    'by_class', coalesce((select list from rows where kind = 'class'), '[]'),
    'by_model', coalesce((select list from rows where kind = 'model'), '[]'),
    'by_type', coalesce((select list from rows where kind = 'type'), '[]'),
    'by_service', coalesce((select jsonb_agg(jsonb_build_object('service_id', service_id, 'name', name, 'jobs', jobs,
        'est_hours', round(est_hours, 2), 'actual_hours', round(coalesce(actual_hours, 0), 2),
        'variance_pct', case when est_hours > 0 and actual_hours > 0 then round(100 * (actual_hours - est_hours) / est_hours, 1) end)
        order by jobs desc, name) from svc), '[]'),
    'totals', (select jsonb_build_object('key', 'all', 'label', 'All jobs', 'jobs', count(*),
        'revenue', round(coalesce(sum(revenue), 0), 2), 'cost', round(coalesce(sum(cost), 0), 2),
        'profit', round(coalesce(sum(revenue - cost), 0), 2),
        'margin_pct', case when sum(revenue) > 0 then round(100 * sum(revenue - cost) / sum(revenue), 1) end,
        'hours', round(coalesce(sum(hours), 0), 2), 'est_hours', round(coalesce(sum(est_hours), 0), 2),
        'revenue_per_hour', case when sum(hours) > 0 then round(sum(revenue) / sum(hours), 2) end,
        'pay_missing', coalesce(bool_or(pay_missing), false)) from per),
    'hourly_cost', public._hour_cost(p_org),
    'overhead_per_hour', o.overhead_per_hour,
    'labor_burden_pct', o.labor_burden_pct) into v;
  return v;
end;
$$;

-- Certification warnings only on plans that include certification.
create or replace function public.schedule_conflicts(
  p_org uuid, p_job uuid, p_start timestamptz, p_end timestamptz,
  p_users uuid[] default '{}', p_equipment uuid[] default '{}', p_hangar uuid default null,
  p_travel_before int default 0, p_travel_after int default 0, p_location uuid default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v jsonb := '[]'::jsonb;
  v_tz text;
  v_from timestamptz := p_start - make_interval(mins => coalesce(p_travel_before, 0));
  v_to timestamptz := p_end + make_interval(mins => coalesce(p_travel_after, 0));
  u uuid; e uuid;
  v_name text;
  r record;
  v_day date;
  v_cap int;
  v_used int;
begin
  if not public.is_member(p_org) then raise exception 'Not a member'; end if;
  if p_start is null or p_end is null then return v; end if;
  if p_end <= p_start then
    return jsonb_build_array(jsonb_build_object('type', 'invalid', 'message', 'End time must be after the start time.'));
  end if;
  if p_end > p_start + interval '24 hours' then
    v := v || jsonb_build_object('type', 'too_long', 'message', 'A job can be at most 24 hours. Split longer work into several jobs.');
  end if;
  select timezone into v_tz from organizations where id = p_org;

  foreach u in array coalesce(p_users, '{}') loop
    select coalesce(display_name, 'Crew member') into v_name from memberships where org_id = p_org and user_id = u;
    -- Double-booked (including travel buffers on both sides).
    for r in
      select j.id, j.number, j.title, j.scheduled_start, j.scheduled_end from jobs j
      join job_assignments a on a.job_id = j.id and a.user_id = u
      where j.org_id = p_org and j.id is distinct from p_job
        and j.status not in ('cancelled','completed','invoiced')
        and j.scheduled_start is not null
        and j.scheduled_start - make_interval(mins => j.travel_before_min) < v_to
        and coalesce(j.scheduled_end, j.scheduled_start + interval '2 hours') + make_interval(mins => j.travel_after_min) > v_from
    loop
      v := v || jsonb_build_object('type', 'double_booked', 'user_id', u, 'job_id', r.id,
        'message', v_name || ' is already on ' || r.number || coalesce(' (' || r.title || ')', '') || ' at ' ||
                   to_char(r.scheduled_start at time zone v_tz, 'Mon DD HH24:MI') || '.');
    end loop;
    -- Approved time off.
    if exists (select 1 from time_off where org_id = p_org and user_id = u and status = 'approved'
               and starts_on <= (v_to at time zone v_tz)::date and ends_on >= (v_from at time zone v_tz)::date) then
      v := v || jsonb_build_object('type', 'time_off', 'user_id', u, 'message', v_name || ' has approved time off then.');
    end if;
    -- Working hours (each local day the job touches).
    for v_day in select generate_series((p_start at time zone v_tz)::date, (p_end at time zone v_tz)::date, interval '1 day')::date loop
      select * into r from crew_hours where org_id = p_org and user_id = u and weekday = extract(dow from v_day);
      if not found then
        v := v || jsonb_build_object('type', 'off_day', 'user_id', u, 'message', v_name || ' does not work on ' || trim(to_char(v_day, 'Day')) || 's.');
      elsif (p_start at time zone v_tz)::date = v_day and (p_start at time zone v_tz)::time < r.start_time
         or (p_end at time zone v_tz)::date = v_day and (p_end at time zone v_tz)::time > r.end_time then
        v := v || jsonb_build_object('type', 'outside_hours', 'user_id', u,
          'message', v_name || ' works ' || to_char(r.start_time, 'HH24:MI') || '–' || to_char(r.end_time, 'HH24:MI') || ' on ' || trim(to_char(v_day, 'Day')) || 's.');
      end if;
    end loop;
    -- Facility requirements the person lacks (or that expire before the job).
    if p_location is not null then
      for r in
        select fr.name from facility_requirements fr
        where fr.location_id = p_location and fr.applies_to = 'person'
          and not exists (select 1 from certifications c where c.org_id = p_org and c.user_id = u
                          and (c.requirement_id = fr.id or (c.kind = fr.kind and lower(c.name) = lower(fr.name)))
                          and (c.expires_on is null or c.expires_on >= (p_end at time zone v_tz)::date))
      loop
        v := v || jsonb_build_object('type', 'missing_requirement', 'user_id', u, 'message', v_name || ' is missing: ' || r.name || '.');
      end loop;
    end if;
  end loop;

  -- Company-level requirements (e.g. insurance certificate) expired or missing.
  if p_location is not null then
    for r in
      select fr.name from facility_requirements fr
      where fr.location_id = p_location and fr.applies_to = 'company'
        and not exists (select 1 from certifications c where c.org_id = p_org and c.user_id is null
                        and (c.requirement_id = fr.id or (c.kind = fr.kind and lower(c.name) = lower(fr.name)))
                        and (c.expires_on is null or c.expires_on >= (p_end at time zone v_tz)::date))
    loop
      v := v || jsonb_build_object('type', 'missing_requirement', 'message', 'Company document missing or expired: ' || r.name || '.');
    end loop;
  end if;

  -- Services that only certified technicians may do (SOP sign-off).
  if p_job is not null and public.plan_allows(p_org, 'certification') then
    foreach u in array coalesce(p_users, '{}') loop
      select coalesce(display_name, 'Crew member') into v_name from memberships where org_id = p_org and user_id = u;
      for r in
        select distinct s.name from job_items ji join services s on s.id = ji.service_id
        where ji.job_id = p_job and s.requires_cert and s.guide_key is not null
          and not exists (select 1 from service_skills k where k.org_id = p_org and k.user_id = u
                          and k.guide_key = s.guide_key and k.level in ('certified','trainer'))
      loop
        v := v || jsonb_build_object('type', 'not_certified', 'user_id', u, 'message', v_name || ' is not certified for ' || r.name || '.');
      end loop;
    end loop;
  end if;

  foreach e in array coalesce(p_equipment, '{}') loop
    select name, status into r from equipment where id = e and org_id = p_org;
    if not found then continue; end if;
    if r.status in ('out_of_service','retired') then
      v := v || jsonb_build_object('type', 'equipment_unavailable', 'equipment_id', e, 'message', r.name || ' is out of service.');
    end if;
    if exists (select 1 from resource_holds h where h.equipment_id = e and h.job_id is distinct from p_job
               and h.starts_at < v_to and h.ends_at > v_from) then
      v := v || jsonb_build_object('type', 'equipment_booked', 'equipment_id', e, 'message', r.name || ' is already reserved then.');
    end if;
  end loop;

  if p_hangar is not null then
    select hangar_capacity into v_cap from locations where id = p_hangar and org_id = p_org;
    select count(*) into v_used from resource_holds h where h.location_id = p_hangar and h.job_id is distinct from p_job
      and h.starts_at < p_end and h.ends_at > p_start;
    if coalesce(v_cap, 0) = 0 then
      v := v || jsonb_build_object('type', 'hangar_unavailable', 'message', 'No hangar space is set up at this facility.');
    elsif v_used >= v_cap then
      v := v || jsonb_build_object('type', 'hangar_full', 'message', 'The hangar is fully booked then (' || v_used || ' of ' || v_cap || ').');
    end if;
  end if;
  return v;
end;
$$;

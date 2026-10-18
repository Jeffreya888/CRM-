-- =============================================================================
-- Competitive edge (docs/competitive-edge.md): FAA tail number autofill, AI
-- photo condition reports, SOP time & materials, quality checks, technician
-- certification, condition pricing, pricing by footprint, fractional supplies,
-- estimate vs actual, profit by asset class/model, true labor cost.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Company settings
-- ---------------------------------------------------------------------------
alter table public.organizations
  add column labor_burden_pct numeric(5,2) not null default 15 check (labor_burden_pct between 0 and 100),
  add column overhead_per_hour numeric(8,2) not null default 0 check (overhead_per_hour >= 0),
  add column condition_multipliers jsonb not null default '{"light":0,"moderate":15,"heavy":35,"severe":60}'::jsonb,
  add column require_qc boolean not null default false,
  add column photo_quotes_enabled boolean not null default true;

grant update (labor_burden_pct, overhead_per_hour, condition_multipliers, require_qc, photo_quotes_enabled) on public.organizations to authenticated;

alter table public.organizations add constraint organizations_condition_multipliers_check check (
  jsonb_typeof(condition_multipliers) = 'object'
  and coalesce((condition_multipliers ->> 'light')::numeric, 0) between 0 and 200
  and coalesce((condition_multipliers ->> 'moderate')::numeric, 0) between 0 and 200
  and coalesce((condition_multipliers ->> 'heavy')::numeric, 0) between 0 and 200
  and coalesce((condition_multipliers ->> 'severe')::numeric, 0) between 0 and 200);

-- ---------------------------------------------------------------------------
-- Size helpers (mirror src/lib/pricing.ts typical sizes and labels)
-- ---------------------------------------------------------------------------
create or replace function public._typical_length(c public.aircraft_category)
returns numeric language sql immutable as $$
  select case c::text
    when 'piston_single' then 27 when 'piston_twin' then 32 when 'turboprop' then 40 when 'very_light_jet' then 40
    when 'light_jet' then 50 when 'midsize_jet' then 60 when 'super_midsize_jet' then 68 when 'large_jet' then 96
    when 'airliner' then 110 when 'helicopter' then 42 when 'car' then 15 when 'suv' then 16 when 'truck' then 19
    when 'van' then 20 when 'rv' then 35 when 'motorcycle' then 7 when 'boat_small' then 22 when 'boat_medium' then 32
    when 'boat_large' then 50 when 'yacht' then 80 else 40 end::numeric;
$$;

create or replace function public._category_label(c public.aircraft_category)
returns text language sql immutable as $$
  select case c::text
    when 'piston_single' then 'Piston Single' when 'piston_twin' then 'Piston Twin' when 'turboprop' then 'Turboprop'
    when 'very_light_jet' then 'Very Light Jet' when 'light_jet' then 'Light Jet' when 'midsize_jet' then 'Midsize Jet'
    when 'super_midsize_jet' then 'Super-Mid Jet' when 'large_jet' then 'Large Cabin Jet' when 'airliner' then 'Airliner / BBJ'
    when 'helicopter' then 'Helicopter' when 'car' then 'Car' when 'suv' then 'SUV' when 'truck' then 'Truck' when 'van' then 'Van'
    when 'rv' then 'RV / Motorhome' when 'motorcycle' then 'Motorcycle' when 'boat_small' then 'Small boat (under 25 ft)'
    when 'boat_medium' then 'Medium boat (25–40 ft)' when 'boat_large' then 'Large boat (40–65 ft)' when 'yacht' then 'Yacht (65 ft+)'
    else 'Other' end;
$$;

-- Length of an asset in feet (its own, else typical for its class; 0 when no asset).
create or replace function public._asset_length(p_aircraft uuid)
returns numeric language sql stable security definer set search_path = public as $$
  select coalesce((select coalesce(a.length_ft, public._typical_length(a.category)) from aircraft a where a.id = p_aircraft), 0);
$$;
revoke execute on function public._asset_length(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Assets: condition and FAA registration snapshot
-- ---------------------------------------------------------------------------
alter table public.aircraft
  add column condition_level text check (condition_level in ('light','moderate','heavy','severe')),
  add column condition_updated_at timestamptz,
  add column faa jsonb,
  add column faa_checked_at timestamptz;

-- ---------------------------------------------------------------------------
-- Services: footprint pricing, hours per size class, certified-only
-- ---------------------------------------------------------------------------
alter table public.services
  add column price_per_sqft numeric(10,2) not null default 0 check (price_per_sqft >= 0),
  add column category_hours jsonb not null default '{}'::jsonb check (jsonb_typeof(category_hours) = 'object'),
  add column requires_cert boolean not null default false;

-- Quotes remember the condition used for pricing.
alter table public.quotes
  add column condition_level text check (condition_level in ('light','moderate','heavy','severe')),
  add column condition_pct numeric(5,2) not null default 0 check (condition_pct between 0 and 200);

-- ---------------------------------------------------------------------------
-- Fractional supply usage (0.25 gal), optionally per foot of length
-- ---------------------------------------------------------------------------
drop view public.stock_by_location;
alter table public.inventory_movements alter column delta type numeric(12,3);
drop trigger inventory_low_stock on public.inventory_items;
alter table public.inventory_items alter column quantity type numeric(12,3);
create trigger inventory_low_stock after update of quantity on public.inventory_items for each row execute function public.trg_low_stock();
alter table public.service_supplies alter column quantity type numeric(10,3);
alter table public.service_supplies alter column quantity set default 1;
alter table public.service_supplies add column per_foot boolean not null default false;

create or replace view public.stock_by_location as
  select m.org_id, m.item_id, m.stock_location_id, sum(m.delta) as quantity
  from public.inventory_movements m
  where public.is_member(m.org_id)
  group by 1, 2, 3;
revoke all on public.stock_by_location from public, anon, authenticated;
grant select on public.stock_by_location to authenticated;

create or replace function public.trg_movement_defaults()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.delta <> round(new.delta, 3) then raise exception 'Use at most 3 decimals for supply amounts'; end if;
  if new.unit_cost is null then
    select unit_cost into new.unit_cost from inventory_items where id = new.item_id;
  end if;
  new.created_by := coalesce(new.created_by, auth.uid());
  return new;
end;
$$;

create or replace function public.record_count(p_item uuid, p_counted numeric, p_location uuid default null, p_note text default null)
returns numeric language plpgsql security definer set search_path = public as $$
declare
  i inventory_items;
  v_have numeric;
  v_delta numeric;
begin
  select * into i from inventory_items where id = p_item;
  if not found or not public.is_member(i.org_id) or public.has_role(i.org_id, array['viewer']::public.member_role[]) then
    raise exception 'Item not found';
  end if;
  if p_counted < 0 or p_counted <> round(p_counted, 3) then raise exception 'Counts can have at most 3 decimals'; end if;
  if p_location is null then
    v_have := i.quantity;
  else
    select coalesce(sum(delta), 0) into v_have from inventory_movements where item_id = p_item and stock_location_id = p_location;
  end if;
  v_delta := p_counted - v_have;
  if v_delta <> 0 then
    insert into inventory_movements (org_id, item_id, delta, reason, stock_location_id, note)
    values (i.org_id, p_item, v_delta, 'count', p_location, coalesce(p_note, 'Cycle count: found ' || p_counted || ', expected ' || v_have));
  end if;
  return v_delta;
end;
$$;

-- ---------------------------------------------------------------------------
-- Estimates: hours and supply cost per line, from the service and the asset
-- ---------------------------------------------------------------------------
create or replace function public._service_estimate(p_service uuid, p_aircraft uuid, p_qty numeric)
returns table (hours numeric, supply_cost numeric) language plpgsql stable security definer set search_path = public as $$
declare
  s services;
  a aircraft;
  v_len numeric;
begin
  select * into s from services where id = p_service;
  if not found then return query select null::numeric, null::numeric; return; end if;
  select * into a from aircraft where id = p_aircraft;
  v_len := coalesce(a.length_ft, public._typical_length(a.category), 0);
  return query select
    round(case when s.pricing_method = 'hourly' then coalesce(p_qty, 1)
               else coalesce((s.category_hours ->> a.category::text)::numeric, s.est_hours) * coalesce(p_qty, 1) end, 2),
    round(coalesce((select sum(ss.quantity * case when ss.per_foot then v_len else 1 end * coalesce(i.unit_cost, 0))
                    from service_supplies ss join inventory_items i on i.id = ss.item_id
                    where ss.service_id = s.id), 0) * coalesce(p_qty, 1), 2);
end;
$$;
revoke execute on function public._service_estimate(uuid, uuid, numeric) from public, anon, authenticated;

alter table public.job_items
  add column est_hours numeric(8,2),
  add column est_supply_cost numeric(10,2);

create or replace function public.trg_job_item_estimate()
returns trigger language plpgsql security definer set search_path = public as $$
declare e record;
begin
  if new.service_id is null then
    new.est_hours := null; new.est_supply_cost := null;
  else
    select * into e from public._service_estimate(new.service_id, (select aircraft_id from jobs where id = new.job_id), new.quantity);
    new.est_hours := e.hours; new.est_supply_cost := e.supply_cost;
  end if;
  return new;
end;
$$;
create trigger job_items_estimate before insert or update of service_id, quantity on public.job_items
  for each row execute function public.trg_job_item_estimate();

-- A different asset changes the estimate (size class, length).
create or replace function public.trg_job_asset_estimates()
returns trigger language plpgsql security definer set search_path = public as $$
declare r record; e record;
begin
  for r in select id, service_id, quantity from job_items where job_id = new.id and service_id is not null loop
    select * into e from public._service_estimate(r.service_id, new.aircraft_id, r.quantity);
    update job_items set est_hours = e.hours, est_supply_cost = e.supply_cost where id = r.id;
  end loop;
  return null;
end;
$$;
create trigger jobs_asset_estimates after update of aircraft_id on public.jobs
  for each row when (new.aircraft_id is distinct from old.aircraft_id) execute function public.trg_job_asset_estimates();

-- Existing lines get an estimate now.
update public.job_items ji set (est_hours, est_supply_cost) =
  (select e.hours, e.supply_cost from public._service_estimate(ji.service_id, (select aircraft_id from public.jobs where id = ji.job_id), ji.quantity) e)
where ji.service_id is not null;

-- Auto-deduct supplies on completion (fractional, per foot).
create or replace function public.trg_job_completed()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_tz text;
  v_local timestamp;
  s record;
  v_next timestamptz;
  v_new uuid;
begin
  if new.status = 'in_progress' and old.status is distinct from 'in_progress' then
    if not exists (select 1 from job_photos where job_id = new.id and kind = 'before') then
      raise exception 'BEFORE_PHOTOS_REQUIRED: add at least one before photo to start this job';
    end if;
    new.actual_start := coalesce(new.actual_start, now());
  end if;

  if new.status = 'completed' and old.status is distinct from 'completed' then
    if not exists (select 1 from job_photos where job_id = new.id and kind = 'after') then
      raise exception 'AFTER_PHOTOS_REQUIRED: add at least one after photo to complete this job';
    end if;
    new.actual_end := coalesce(new.actual_end, now());
    -- Stop any clocks still running on this job.
    update time_entries set ended_at = now() where job_id = new.id and ended_at is null;

    -- Supplies each service uses come out of stock once.
    -- Fractional amounts are allowed (0.25 gal); "per foot" supplies scale with the asset's length.
    insert into inventory_movements (org_id, item_id, delta, reason, job_id, auto, note)
      select new.org_id, ss.item_id,
             -round(sum(ss.quantity * ji.quantity * case when ss.per_foot then public._asset_length(new.aircraft_id) else 1 end), 3),
             'job_use', new.id, true, 'Auto-deducted on completion'
      from job_items ji join service_supplies ss on ss.service_id = ji.service_id
      where ji.job_id = new.id
      group by ss.item_id
      having round(sum(ss.quantity * ji.quantity * case when ss.per_foot then public._asset_length(new.aircraft_id) else 1 end), 3) > 0
      on conflict do nothing;

    select timezone into v_tz from organizations where id = new.org_id;
    v_local := coalesce(new.scheduled_start, new.actual_end) at time zone v_tz;
    if new.aircraft_id is not null then
      for s in
        select distinct sv.id, sv.name, sv.recur_every, sv.recur_unit, sv.taxable, sv.guide_key, sv.checklist,
               (select unit_price from job_items x where x.job_id = new.id and x.service_id = sv.id limit 1) as price
        from job_items ji join services sv on sv.id = ji.service_id
        where ji.job_id = new.id and sv.recur_every is not null
      loop
        v_next := (v_local + case when s.recur_unit = 'week' then make_interval(weeks => s.recur_every) else make_interval(months => s.recur_every) end) at time zone v_tz;
        if new.care_opt_in then
          -- Opted-in customers get the follow-up visit created as Tentative.
          if not exists (select 1 from jobs fj join job_items fi on fi.job_id = fj.id
                         where fj.aircraft_id = new.aircraft_id and fi.service_id = s.id
                           and fj.status in ('tentative','scheduled') and fj.scheduled_start > now()) then
            insert into jobs (org_id, number, title, customer_id, aircraft_id, location_id, branch_id, status, scheduled_start, scheduled_end, follow_up_of, created_by)
              values (new.org_id, public._next_number(new.org_id, 'job'), s.name, new.customer_id, new.aircraft_id, new.location_id, new.branch_id,
                      'tentative', v_next, v_next + coalesce(new.scheduled_end - new.scheduled_start, interval '2 hours'), new.id, auth.uid())
              returning id into v_new;
            insert into job_items (org_id, job_id, service_id, description, quantity, unit_price, taxable)
              values (new.org_id, v_new, s.id, s.name, 1, coalesce(s.price, 0), s.taxable);
            insert into job_checklist_items (org_id, job_id, label, sort_order, guide_key, step_index)
              select new.org_id, v_new, step, ord::int, s.guide_key, (ord - 1)::int from unnest(s.checklist) with ordinality as x(step, ord);
            insert into job_assignments (job_id, user_id, org_id, is_primary)
              select v_new, user_id, org_id, is_primary from job_assignments where job_id = new.id;
          end if;
        elsif not exists (select 1 from service_reminders r where r.aircraft_id = new.aircraft_id and r.service_id = s.id and r.status in ('upcoming','due')) then
          insert into service_reminders (org_id, aircraft_id, service_id, title, due_on, recur_every, recur_unit)
            values (new.org_id, new.aircraft_id, s.id, s.name, (v_next at time zone v_tz)::date, s.recur_every, s.recur_unit);
        end if;
      end loop;
      update service_reminders r set status = 'dismissed'
      where r.aircraft_id = new.aircraft_id and r.status in ('due','scheduled')
        and r.service_id in (select service_id from job_items where job_id = new.id);
    end if;
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Quality control sign-off
-- ---------------------------------------------------------------------------
alter table public.jobs
  add column qc_status text not null default 'not_required' check (qc_status in ('not_required','pending','passed','failed')),
  add column qc_by uuid references auth.users(id) on delete set null,
  add column qc_at timestamptz,
  add column qc_notes text;
alter table public.job_checklist_items
  add column kind text not null default 'step' check (kind in ('step','qc'));

-- QC fields change only through submit_for_qc / qc_decision.
create or replace function public.trg_job_qc_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and coalesce(current_setting('app.qc', true), '') <> 'on' and (
       new.qc_status is distinct from old.qc_status or new.qc_by is distinct from old.qc_by
    or new.qc_at is distinct from old.qc_at or new.qc_notes is distinct from old.qc_notes) then
    raise exception 'PERMISSION: use the quality check buttons to change the quality check';
  end if;
  if new.status = 'completed' and old.status is distinct from 'completed' and new.qc_status <> 'passed'
     and (select require_qc from organizations where id = new.org_id) then
    raise exception 'QC_REQUIRED: a manager must pass the quality check before this job is completed';
  end if;
  return new;
end;
$$;
create trigger jobs_qc_guard before update on public.jobs for each row execute function public.trg_job_qc_guard();

-- Each SOP's quality checks become QC items when its service is added to a job.
create or replace function public.trg_job_item_qc()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_key text;
  g service_guides;
begin
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
create trigger job_items_qc after insert or update of service_id on public.job_items
  for each row when (new.service_id is not null) execute function public.trg_job_item_qc();

create or replace function public.submit_for_qc(p_job uuid)
returns void language plpgsql security definer set search_path = public as $$
declare j jobs;
begin
  select * into j from jobs where id = p_job;
  if not found or not public.is_member(j.org_id)
     or not (public.is_manager(j.org_id) or exists (select 1 from job_assignments where job_id = p_job and user_id = auth.uid())) then
    raise exception 'Job not found';
  end if;
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

-- ---------------------------------------------------------------------------
-- Technician certification per SOP
-- ---------------------------------------------------------------------------
create table public.service_skills (
  org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  guide_key text not null,
  level text not null default 'training' check (level in ('training','certified','trainer')),
  certified_by uuid references auth.users(id) on delete set null,
  certified_at timestamptz,
  requested_at timestamptz,
  notes text,
  primary key (org_id, user_id, guide_key)
);
alter table public.service_skills enable row level security;
create policy service_skills_select on public.service_skills for select using (public.is_member(org_id));

create or replace function public.request_skill_signoff(p_org uuid, p_guide_key text)
returns void language plpgsql security definer set search_path = public as $$
declare v_title text;
begin
  if not public.is_member(p_org) or public.has_role(p_org, array['viewer']::public.member_role[]) then raise exception 'Not allowed'; end if;
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

-- Scheduling warns when a technician isn't certified for a certified-only service.
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
  if p_job is not null then
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

-- ---------------------------------------------------------------------------
-- AI photo condition reports (written by the assess-photos / portal functions)
-- ---------------------------------------------------------------------------
create table public.condition_assessments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  aircraft_id uuid references public.aircraft(id) on delete set null,
  customer_id uuid references public.customers(id) on delete set null,
  job_id uuid references public.jobs(id) on delete set null,
  quote_id uuid references public.quotes(id) on delete set null,
  booking_request_id uuid references public.booking_requests(id) on delete set null,
  source text not null default 'staff' check (source in ('staff','portal')),
  photo_paths text[] not null check (cardinality(photo_paths) between 1 and 6),
  status text not null default 'pending' check (status in ('pending','done','failed')),
  overall text check (overall in ('light','moderate','heavy','severe')),
  score int check (score between 1 and 10),
  summary text,
  findings jsonb not null default '[]'::jsonb,
  suggestions jsonb not null default '[]'::jsonb,
  error text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  applied_at timestamptz,
  applied_by uuid references auth.users(id) on delete set null
);
create index on public.condition_assessments (org_id, created_at desc);
create index on public.condition_assessments (aircraft_id);
create trigger assessments_org_a before insert or update on public.condition_assessments for each row execute function public.assert_same_org('aircraft', 'aircraft_id');
create trigger assessments_org_c before insert or update on public.condition_assessments for each row execute function public.assert_same_org('customers', 'customer_id');
create trigger assessments_org_j before insert or update on public.condition_assessments for each row execute function public.assert_same_org('jobs', 'job_id');
create trigger assessments_org_q before insert or update on public.condition_assessments for each row execute function public.assert_same_org('quotes', 'quote_id');
create trigger assessments_org_b before insert or update on public.condition_assessments for each row execute function public.assert_same_org('booking_requests', 'booking_request_id');
alter table public.condition_assessments enable row level security;
create policy condition_assessments_select on public.condition_assessments for select using (public.is_member(org_id));

-- Customers can ask for a quote from photos in the portal.
alter table public.booking_requests drop constraint booking_requests_kind_check;
alter table public.booking_requests
  add constraint booking_requests_kind_check check (kind in ('booking','reschedule','quote_dates','photo_quote')),
  add column photo_paths text[] not null default '{}',
  add column assessment_id uuid references public.condition_assessments(id) on delete set null;

-- Save the AI's condition to the asset (a person confirms it).
create or replace function public.apply_assessment(p_assessment uuid)
returns void language plpgsql security definer set search_path = public as $$
declare a condition_assessments;
begin
  select * into a from condition_assessments where id = p_assessment;
  if not found or not public.is_manager(a.org_id) then raise exception 'Not allowed'; end if;
  if a.status <> 'done' or a.overall is null then raise exception 'This report has no condition to save'; end if;
  if a.aircraft_id is not null then
    update aircraft set condition_level = a.overall, condition_updated_at = now() where id = a.aircraft_id;
  end if;
  update condition_assessments set applied_at = now(), applied_by = auth.uid() where id = a.id;
end;
$$;

-- A photo quote request is answered with a quote.
create or replace function public.link_request_quote(p_request uuid, p_quote uuid)
returns void language plpgsql security definer set search_path = public as $$
declare r booking_requests;
begin
  select * into r from booking_requests where id = p_request;
  if not found or not public.is_manager(r.org_id) then raise exception 'Request not found'; end if;
  if not exists (select 1 from quotes where id = p_quote and org_id = r.org_id) then raise exception 'Quote not found'; end if;
  update booking_requests set status = 'approved', quote_id = p_quote, decided_by = auth.uid(), decided_at = now() where id = r.id;
  update condition_assessments set quote_id = p_quote where id = r.assessment_id and quote_id is null;
end;
$$;

-- ---------------------------------------------------------------------------
-- FAA aircraft registry (public data, loaded weekly by
-- .github/workflows/faa-registry.yml). Read only through faa_lookup().
-- ---------------------------------------------------------------------------
create table public.faa_aircraft_ref (
  code text primary key,           -- MFR MDL CODE
  mfr text not null,
  model text not null,
  type_acft text, type_eng text, ac_cat text,
  no_eng int, no_seats int, ac_weight text
);
create table public.faa_registry (
  n_number text primary key,       -- without the leading N
  serial text,
  mfr_mdl_code text,
  year_mfr int,
  type_registrant text,
  name text, city text, state text, country text,
  cert_issue_date date,
  type_aircraft text, type_engine text,
  status_code text,
  air_worth_date date,
  expiration_date date
);
create index on public.faa_registry (mfr_mdl_code);
create table public.faa_meta (
  id boolean primary key default true check (id),
  imported_at timestamptz, aircraft_rows int, model_rows int
);
-- FAA manufacturer name prefix → catalog manufacturer (several rows per prefix allowed).
create table public.faa_mfr_map (prefix text not null, manufacturer text not null, primary key (prefix, manufacturer));
-- FAA type designations that don't read like the marketing name (e.g. 525B = Citation CJ3).
create table public.faa_model_alias (
  id bigint generated always as identity primary key,
  mfr_prefix text not null,
  faa_model text not null,          -- LIKE pattern on the normalized FAA model (A-Z0-9 only)
  year_from int, year_to int,
  model_id uuid not null references public.aircraft_models(id) on delete cascade
);
-- What a company picked for an FAA type when the suggestion was wrong.
create table public.faa_model_choice (
  org_id uuid not null references public.organizations(id) on delete cascade,
  mfr_mdl_code text not null,
  model_id uuid not null references public.aircraft_models(id) on delete cascade,
  updated_at timestamptz not null default now(),
  primary key (org_id, mfr_mdl_code)
);
do $$
declare t text;
begin
  foreach t in array array['faa_aircraft_ref','faa_registry','faa_meta','faa_mfr_map','faa_model_alias','faa_model_choice'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;
end $$;

create or replace function public._faa_norm(t text)
returns text language sql immutable as $$
  select upper(regexp_replace(coalesce(t, ''), '[^A-Za-z0-9]', '', 'g'));
$$;
-- Drops a leading family word so "Citation CJ3" and "Learjet 45" compare as "CJ3" and "45".
create or replace function public._faa_strip(t text)
returns text language sql immutable as $$
  select regexp_replace(public._faa_norm(t), '^(CITATION|KINGAIR|LEARJET|CHALLENGER|GLOBAL|PHENOM|LEGACY|PRAETOR|HAWKER|HONDAJET|GULFSTREAM|BELL|VISION)', '');
$$;

-- Best catalog model for an FAA manufacturer/model/year: alias, then name.
create or replace function public._faa_match(p_mfr text, p_model text, p_year int, out model_id uuid, out how text)
language plpgsql stable security definer set search_path = public as $$
declare
  v_mfr text := upper(coalesce(p_mfr, ''));
  v_n text := public._faa_norm(p_model);
  v_s text := public._faa_strip(p_model);
begin
  select a.model_id into model_id from faa_model_alias a
  where v_mfr like a.mfr_prefix || '%' and v_n like a.faa_model
    and (p_year is null or ((a.year_from is null or p_year >= a.year_from) and (a.year_to is null or p_year <= a.year_to)))
  -- Unknown year: the open-ended alias, else the newest variant.
  order by length(a.faa_model) desc, (a.year_from is null and a.year_to is null) desc, a.year_from desc nulls last
  limit 1;
  if model_id is not null then how := 'alias'; return; end if;
  if length(v_n) < 2 then return; end if;

  select m.id into model_id
  from aircraft_models m
  where m.manufacturer in (select f.manufacturer from faa_mfr_map f where v_mfr like f.prefix || '%')
    and m.category::text not like 'boat%' and m.category <> 'yacht'
    and (
      public._faa_norm(m.model) in (v_n, v_s) or public._faa_strip(m.model) in (v_n, v_s)
      or (length(v_n) >= 3 and public._faa_norm(m.model) like v_n || '%')
      or (length(v_s) >= 2 and public._faa_strip(m.model) like v_s || '%' and length(public._faa_strip(m.model)) > 0)
      or (length(public._faa_strip(m.model)) >= 2 and v_s like public._faa_strip(m.model) || '%')
      or (split_part(m.model, ' ', 1) ~ '[0-9]' and length(public._faa_norm(split_part(m.model, ' ', 1))) >= 2
          and v_n like public._faa_norm(split_part(m.model, ' ', 1)) || '%'))
  order by
    case when public._faa_norm(m.model) in (v_n, v_s) or public._faa_strip(m.model) in (v_n, v_s) then 4
         when length(v_n) >= 3 and public._faa_norm(m.model) like v_n || '%' then 3
         when length(v_s) >= 2 and public._faa_strip(m.model) like v_s || '%' then 2
         else 1 end desc,
    greatest(length(public._faa_strip(m.model)), length(public._faa_norm(split_part(m.model, ' ', 1)))) desc,
    length(m.model)
  limit 1;
  if model_id is not null then how := 'name'; end if;
end;
$$;
revoke execute on function public._faa_match(text, text, int) from public, anon, authenticated;

create or replace function public._faa_tail(p_tail text)
returns text language sql immutable as $$
  select case
    when x ~ '^N[1-9][0-9A-HJ-NP-Z]{0,4}$' then substr(x, 2)
    when x ~ '^[1-9][0-9A-HJ-NP-Z]{0,4}$' then x
    else null end
  from (select upper(regexp_replace(coalesce(p_tail, ''), '[\s-]', '', 'g')) as x) t;
$$;

create or replace function public.faa_lookup(p_org uuid, p_tail text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_n text := public._faa_tail(p_tail);
  r faa_registry;
  f faa_aircraft_ref;
  m aircraft_models;
  v_model uuid;
  v_how text;
  v_meta faa_meta;
  v_status text;
begin
  if not public.is_member(p_org) then raise exception 'Not a member'; end if;
  if v_n is null then return jsonb_build_object('found', false, 'reason', 'not_us'); end if;
  select * into v_meta from faa_meta where id;
  if v_meta.imported_at is null then return jsonb_build_object('found', false, 'reason', 'no_data'); end if;
  select * into r from faa_registry where n_number = v_n;
  if not found then return jsonb_build_object('found', false, 'reason', 'not_found'); end if;
  select * into f from faa_aircraft_ref where code = r.mfr_mdl_code;

  select c.model_id into v_model from faa_model_choice c where c.org_id = p_org and c.mfr_mdl_code = r.mfr_mdl_code;
  if v_model is not null then
    v_how := 'learned';
  else
    select x.model_id, x.how into v_model, v_how from public._faa_match(f.mfr, f.model, r.year_mfr) x;
  end if;
  select * into m from aircraft_models where id = v_model;

  v_status := case
    when r.expiration_date is not null and r.expiration_date < current_date then 'Expired'
    when r.status_code in ('V','M','T') then 'Valid'
    when r.status_code = 'N' then 'Valid (non-citizen corporation)'
    when r.status_code = 'R' then 'Registration pending'
    when r.status_code = '7' then 'Sale reported'
    when r.status_code in ('A','S','1','8') then 'Renewal in progress'
    when r.status_code is null or r.status_code = '' then null
    else 'Expired or canceled' end;

  return jsonb_build_object(
    'found', true,
    'n_number', 'N' || r.n_number,
    'serial', nullif(trim(r.serial), ''),
    'year', r.year_mfr,
    'faa_manufacturer', coalesce(trim(f.mfr), ''),
    'faa_model', coalesce(trim(f.model), ''),
    'owner', nullif(trim(r.name), ''),
    'city', nullif(initcap(trim(r.city)), ''),
    'state', nullif(trim(r.state), ''),
    'country', nullif(trim(r.country), ''),
    'status', v_status,
    'expires', r.expiration_date,
    'cert_issued', r.cert_issue_date,
    'engines', f.no_eng,
    'seats', f.no_seats,
    'type', case coalesce(r.type_aircraft, f.type_acft)
      when '1' then 'Glider' when '2' then 'Balloon' when '3' then 'Blimp/dirigible'
      when '4' then 'Fixed wing single engine' when '5' then 'Fixed wing multi engine' when '6' then 'Rotorcraft'
      when '7' then 'Weight-shift control' when '8' then 'Powered parachute' when '9' then 'Gyroplane'
      when 'H' then 'Hybrid lift' else null end,
    'model_id', m.id,
    'catalog', case when m.id is null then null else jsonb_build_object('manufacturer', m.manufacturer, 'model', m.model,
      'category', m.category, 'length_ft', m.length_ft, 'wingspan_ft', m.wingspan_ft) end,
    'match', case when m.id is null then null else v_how end,
    'data_as_of', v_meta.imported_at);
end;
$$;

create or replace function public.remember_faa_model(p_org uuid, p_tail text, p_model uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_code text;
begin
  if not public.is_member(p_org) or public.has_role(p_org, array['viewer']::public.member_role[]) then raise exception 'Not allowed'; end if;
  select mfr_mdl_code into v_code from faa_registry where n_number = public._faa_tail(p_tail);
  if v_code is null or p_model is null or not exists (select 1 from aircraft_models where id = p_model) then return; end if;
  insert into faa_model_choice (org_id, mfr_mdl_code, model_id) values (p_org, v_code, p_model)
    on conflict (org_id, mfr_mdl_code) do update set model_id = excluded.model_id, updated_at = now();
end;
$$;

-- Loader entry point (service role only): swaps in a fresh copy from staging tables.
create or replace function public.faa_swap_import()
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_a int; v_m int;
begin
  select count(*) into v_a from faa_registry_staging;
  select count(*) into v_m from faa_aircraft_ref_staging;
  if v_a < 1000 or v_m < 100 then raise exception 'FAA import looks incomplete (% aircraft, % models); keeping the old data', v_a, v_m; end if;
  truncate faa_aircraft_ref;
  insert into faa_aircraft_ref select distinct on (code) * from faa_aircraft_ref_staging order by code;
  truncate faa_registry;
  insert into faa_registry select distinct on (n_number) * from faa_registry_staging order by n_number;
  insert into faa_meta (id, imported_at, aircraft_rows, model_rows) values (true, now(), v_a, v_m)
    on conflict (id) do update set imported_at = now(), aircraft_rows = v_a, model_rows = v_m;
  truncate faa_registry_staging; truncate faa_aircraft_ref_staging;
  return jsonb_build_object('aircraft', v_a, 'models', v_m);
end;
$$;
create table public.faa_registry_staging (like public.faa_registry);
create table public.faa_aircraft_ref_staging (like public.faa_aircraft_ref);
alter table public.faa_registry_staging enable row level security;
alter table public.faa_aircraft_ref_staging enable row level security;
revoke all on public.faa_registry_staging, public.faa_aircraft_ref_staging from anon, authenticated;
revoke execute on function public.faa_swap_import() from public, anon, authenticated;

insert into public.faa_mfr_map (prefix, manufacturer) values
  ('GULFSTREAM', 'Gulfstream'), ('ISRAEL AIRCRAFT', 'Gulfstream'), ('IAI', 'Gulfstream'), ('GRUMMAN AMERICAN', 'Gulfstream'),
  ('CESSNA', 'Cessna'), ('TEXTRON AVIATION', 'Cessna'), ('TEXTRON AVIATION', 'Beechcraft'), ('TEXTRON AVIATION', 'Hawker'),
  ('BEECH', 'Beechcraft'), ('RAYTHEON', 'Beechcraft'), ('RAYTHEON', 'Hawker'), ('HAWKER BEECHCRAFT', 'Beechcraft'), ('HAWKER BEECHCRAFT', 'Hawker'),
  ('HAWKER', 'Hawker'), ('BRITISH AEROSPACE', 'Hawker'), ('BAE', 'Hawker'), ('HAWKER SIDDELEY', 'Hawker'),
  ('BOMBARDIER', 'Bombardier'), ('CANADAIR', 'Bombardier'), ('LEARJET', 'Bombardier'), ('GATES LEARJET', 'Bombardier'),
  ('EMBRAER', 'Embraer'), ('DASSAULT', 'Dassault'), ('PILATUS', 'Pilatus'), ('HONDA', 'Honda'), ('CIRRUS', 'Cirrus'),
  ('PIPER', 'Piper'), ('NEW PIPER', 'Piper'), ('SOCATA', 'Daher'), ('EADS SOCATA', 'Daher'), ('DAHER', 'Daher'), ('QUEST', 'Daher'),
  ('KODIAK', 'Daher'), ('BELL', 'Bell'), ('ROBINSON', 'Robinson'), ('SIKORSKY', 'Sikorsky'), ('AIRBUS', 'Airbus'),
  ('EUROCOPTER', 'Airbus Helicopters'), ('AIRBUS HELICOPTERS', 'Airbus Helicopters'), ('AGUSTA', 'Leonardo'), ('LEONARDO', 'Leonardo'),
  ('BOEING', 'Boeing'), ('MOONEY', 'Mooney'), ('DIAMOND', 'Diamond'), ('ECLIPSE', 'Eclipse'), ('PIAGGIO', 'Piaggio'),
  ('MITSUBISHI', 'Mitsubishi'), ('SYBERJET', 'SyberJet'), ('NEXTANT', 'Nextant'), ('ICON', 'Icon')
on conflict do nothing;

insert into public.faa_model_alias (mfr_prefix, faa_model, year_from, year_to, model_id)
select x.p, x.pat, x.y1, x.y2, m.id
from (values
  -- Gulfstream
  ('GULFSTREAM', 'GVSPG550%', null, null, 'Gulfstream', 'G550'), ('GULFSTREAM', 'GVSPG500%', null, null, 'Gulfstream', 'G500 (GV-SP)'),
  ('GULFSTREAM', 'GVSP', null, null, 'Gulfstream', 'G550'), ('GULFSTREAM', 'GIVXG450%', null, null, 'Gulfstream', 'G450'),
  ('GULFSTREAM', 'GIVXG350%', null, null, 'Gulfstream', 'G350'), ('GULFSTREAM', 'GIVX', null, null, 'Gulfstream', 'G450'),
  ('GULFSTREAM', 'GVIG650ER%', null, null, 'Gulfstream', 'G650ER'), ('GULFSTREAM', 'GVI%', null, null, 'Gulfstream', 'G650'),
  ('GULFSTREAM', 'GVIIG500%', null, null, 'Gulfstream', 'G500'), ('GULFSTREAM', 'GVIIG600%', null, null, 'Gulfstream', 'G600'),
  ('GULFSTREAM', 'GVIIG700%', null, null, 'Gulfstream', 'G700'), ('GULFSTREAM', 'GVIIG800%', null, null, 'Gulfstream', 'G800'),
  ('GULFSTREAM', 'G1159A', null, null, 'Gulfstream', 'GIII'), ('GULFSTREAM', 'G1159B', null, null, 'Gulfstream', 'GIIB'),
  ('GULFSTREAM', 'G1159', null, null, 'Gulfstream', 'GII'), ('GULFSTREAM', 'G1159C', null, null, 'Gulfstream', 'GIV'),
  ('GULFSTREAM', 'GIVSP%', null, null, 'Gulfstream', 'GIV-SP'), ('GULFSTREAM', 'GALAXY%', null, null, 'Gulfstream', 'G200'),
  ('GULFSTREAM', 'GULFSTREAM200', null, null, 'Gulfstream', 'G200'), ('GULFSTREAM', 'GULFSTREAM100', null, null, 'Gulfstream', 'G100'),
  ('GULFSTREAM', 'GULFSTREAM150', null, null, 'Gulfstream', 'G150'), ('ISRAEL AIRCRAFT', '1126%', null, null, 'Gulfstream', 'G200'),
  ('ISRAEL AIRCRAFT', '1125%', null, null, 'Gulfstream', 'G100'),
  -- Cessna / Textron
  ('CESSNA', '510', null, null, 'Cessna', 'Citation Mustang'), ('TEXTRON AVIATION', '510', null, null, 'Cessna', 'Citation Mustang'),
  ('CESSNA', '525', null, 2000, 'Cessna', 'CitationJet'), ('CESSNA', '525', 2001, 2004, 'Cessna', 'Citation CJ1'),
  ('CESSNA', '525', 2005, 2011, 'Cessna', 'Citation CJ1+'), ('CESSNA', '525', 2012, 2021, 'Cessna', 'Citation M2'),
  ('CESSNA', '525', 2022, null, 'Cessna', 'Citation M2 Gen2'), ('TEXTRON AVIATION', '525', null, 2021, 'Cessna', 'Citation M2'),
  ('TEXTRON AVIATION', '525', 2022, null, 'Cessna', 'Citation M2 Gen2'),
  ('CESSNA', '525A', null, 2005, 'Cessna', 'Citation CJ2'), ('CESSNA', '525A', 2006, null, 'Cessna', 'Citation CJ2+'),
  ('CESSNA', '525B', null, 2013, 'Cessna', 'Citation CJ3'), ('CESSNA', '525B', 2014, 2021, 'Cessna', 'Citation CJ3+'),
  ('CESSNA', '525B', 2022, null, 'Cessna', 'Citation CJ3 Gen2'), ('TEXTRON AVIATION', '525B', null, 2021, 'Cessna', 'Citation CJ3+'),
  ('TEXTRON AVIATION', '525B', 2022, null, 'Cessna', 'Citation CJ3 Gen2'),
  ('CESSNA', '525C', null, 2021, 'Cessna', 'Citation CJ4'), ('CESSNA', '525C', 2022, null, 'Cessna', 'Citation CJ4 Gen2'),
  ('TEXTRON AVIATION', '525C', null, 2021, 'Cessna', 'Citation CJ4'), ('TEXTRON AVIATION', '525C', 2022, null, 'Cessna', 'Citation CJ4 Gen2'),
  ('CESSNA', '500', null, null, 'Cessna', 'Citation I'), ('CESSNA', '501', null, null, 'Cessna', 'Citation I'),
  ('CESSNA', '550', null, 1996, 'Cessna', 'Citation II'), ('CESSNA', '550', 1997, null, 'Cessna', 'Citation Bravo'),
  ('CESSNA', 'S550', null, null, 'Cessna', 'Citation SII'),
  ('CESSNA', '560', null, 1993, 'Cessna', 'Citation V'), ('CESSNA', '560', 1994, 1999, 'Cessna', 'Citation Ultra'),
  ('CESSNA', '560', 2000, 2006, 'Cessna', 'Citation Encore'), ('CESSNA', '560', 2007, null, 'Cessna', 'Citation Encore+'),
  ('CESSNA', '560XL', null, 2003, 'Cessna', 'Citation Excel'), ('CESSNA', '560XL', 2004, 2008, 'Cessna', 'Citation XLS'),
  ('CESSNA', '560XL', 2009, 2021, 'Cessna', 'Citation XLS+'), ('CESSNA', '560XL', 2022, 2024, 'Cessna', 'Citation XLS Gen2'),
  ('CESSNA', '560XL', 2025, null, 'Cessna', 'Citation Ascend'), ('TEXTRON AVIATION', '560XL', null, 2024, 'Cessna', 'Citation XLS Gen2'),
  ('TEXTRON AVIATION', '560XL', 2025, null, 'Cessna', 'Citation Ascend'),
  ('CESSNA', '650', null, 1991, 'Cessna', 'Citation III'), ('CESSNA', '650', 1992, null, 'Cessna', 'Citation VII'),
  ('CESSNA', '680', null, 2013, 'Cessna', 'Citation Sovereign'), ('CESSNA', '680', 2014, null, 'Cessna', 'Citation Sovereign+'),
  ('TEXTRON AVIATION', '680', null, null, 'Cessna', 'Citation Sovereign+'),
  ('CESSNA', '680A', null, null, 'Cessna', 'Citation Latitude'), ('TEXTRON AVIATION', '680A', null, null, 'Cessna', 'Citation Latitude'),
  ('CESSNA', '700', null, null, 'Cessna', 'Citation Longitude'), ('TEXTRON AVIATION', '700', null, null, 'Cessna', 'Citation Longitude'),
  ('CESSNA', '750', null, 2013, 'Cessna', 'Citation X'), ('CESSNA', '750', 2014, null, 'Cessna', 'Citation X+'),
  ('TEXTRON AVIATION', '750', null, null, 'Cessna', 'Citation X+'),
  ('CESSNA', '208', null, null, 'Cessna', 'Caravan 208'), ('CESSNA', '208B', null, 2012, 'Cessna', 'Grand Caravan 208B'),
  ('CESSNA', '208B', 2013, null, 'Cessna', 'Grand Caravan EX'), ('TEXTRON AVIATION', '208B', null, null, 'Cessna', 'Grand Caravan EX'),
  ('TEXTRON AVIATION', '408', null, null, 'Cessna', 'SkyCourier 408'),
  ('CESSNA', '172RG%', null, null, 'Cessna', '172RG Cutlass'), ('CESSNA', '172%', null, null, 'Cessna', '172 Skyhawk'),
  ('CESSNA', 'R172%', null, null, 'Cessna', '172 Skyhawk'), ('CESSNA', '182%', null, null, 'Cessna', '182 Skylane'),
  ('CESSNA', 'R182%', null, null, 'Cessna', '182 Skylane'), ('CESSNA', 'U206%', null, null, 'Cessna', '206 Stationair'),
  ('CESSNA', 'TU206%', null, null, 'Cessna', '206 Stationair'), ('CESSNA', 'P210%', null, null, 'Cessna', 'P210 Pressurized Centurion'),
  ('CESSNA', 'T210%', null, null, 'Cessna', '210 Centurion'),
  -- Beechcraft / Hawker
  ('BEECH', 'B300', null, 2008, 'Beechcraft', 'King Air 350'), ('BEECH', 'B300', 2009, 2019, 'Beechcraft', 'King Air 350i'),
  ('BEECH', 'B300', 2020, null, 'Beechcraft', 'King Air 360'), ('HAWKER BEECHCRAFT', 'B300', null, null, 'Beechcraft', 'King Air 350i'),
  ('TEXTRON AVIATION', 'B300', null, 2019, 'Beechcraft', 'King Air 350i'), ('TEXTRON AVIATION', 'B300', 2020, null, 'Beechcraft', 'King Air 360'),
  ('RAYTHEON', 'B300', null, null, 'Beechcraft', 'King Air 350'), ('BEECH', 'B300C', null, null, 'Beechcraft', 'King Air 350'),
  ('BEECH', '300', null, null, 'Beechcraft', 'King Air 300'),
  ('BEECH', 'B200', null, 2006, 'Beechcraft', 'King Air B200'), ('BEECH', 'B200', 2007, 2011, 'Beechcraft', 'King Air B200GT'),
  ('BEECH', 'B200', 2012, 2020, 'Beechcraft', 'King Air 250'), ('BEECH', 'B200', 2021, null, 'Beechcraft', 'King Air 260'),
  ('RAYTHEON', 'B200', null, null, 'Beechcraft', 'King Air B200'), ('HAWKER BEECHCRAFT', 'B200', null, null, 'Beechcraft', 'King Air B200GT'),
  ('TEXTRON AVIATION', 'B200', null, 2020, 'Beechcraft', 'King Air 250'), ('TEXTRON AVIATION', 'B200', 2021, null, 'Beechcraft', 'King Air 260'),
  ('BEECH', '200', null, null, 'Beechcraft', 'King Air 200'),
  ('BEECH', '400A', null, null, 'Beechcraft', 'Beechjet 400A'), ('RAYTHEON', '400A', null, 2003, 'Beechcraft', 'Beechjet 400A'),
  ('RAYTHEON', '400A', 2004, null, 'Hawker', 'Hawker 400XP'), ('HAWKER BEECHCRAFT', '400A', null, null, 'Hawker', 'Hawker 400XP'),
  ('BEECH', '400', null, null, 'Beechcraft', 'Beechjet 400'), ('MITSUBISHI', 'MU300%', null, null, 'Beechcraft', 'Beechjet 400'),
  ('RAYTHEON', '390', null, 2005, 'Beechcraft', 'Premier I'), ('RAYTHEON', '390', 2006, null, 'Beechcraft', 'Premier IA'),
  ('HAWKER BEECHCRAFT', '390', null, null, 'Beechcraft', 'Premier IA'),
  ('BEECH', '58', null, null, 'Beechcraft', 'Baron 58'), ('BEECH', 'A36', null, null, 'Beechcraft', 'Bonanza A36'),
  ('BEECH', 'G36', null, null, 'Beechcraft', 'Bonanza G36'), ('BEECH', 'F33A', null, null, 'Beechcraft', 'Bonanza F33A'),
  ('BEECH', 'V35%', null, null, 'Beechcraft', 'Bonanza V35'), ('BEECH', '76', null, null, 'Beechcraft', 'Duchess 76'),
  ('BEECH', '60%', null, null, 'Beechcraft', 'Duke B60'), ('BEECH', 'B60', null, null, 'Beechcraft', 'Duke B60'),
  ('BEECH', '95B55%', null, null, 'Beechcraft', 'Baron 55'), ('BEECH', '95%', null, null, 'Beechcraft', 'Travel Air 95'),
  ('BRITISH AEROSPACE', 'BAE125SERIES800%', null, null, 'Hawker', 'Hawker 800'), ('BRITISH AEROSPACE', 'BAE125SERIES1000%', null, null, 'Hawker', 'Hawker 1000'),
  ('BRITISH AEROSPACE', 'HS125700%', null, null, 'Hawker', 'Hawker 700'), ('HAWKER SIDDELEY', 'HS125700%', null, null, 'Hawker', 'Hawker 700'),
  ('RAYTHEON', 'HAWKER800XP', null, null, 'Hawker', 'Hawker 800XP'), ('RAYTHEON', 'HAWKER800', null, null, 'Hawker', 'Hawker 800'),
  -- Bombardier
  ('BOMBARDIER', 'CL6002B16', null, 2006, 'Bombardier', 'Challenger 604'), ('BOMBARDIER', 'CL6002B16', 2007, 2014, 'Bombardier', 'Challenger 605'),
  ('BOMBARDIER', 'CL6002B16', 2015, null, 'Bombardier', 'Challenger 650'), ('CANADAIR', 'CL6002B16', null, null, 'Bombardier', 'Challenger 604'),
  ('CANADAIR', 'CL6001A11', null, null, 'Bombardier', 'Challenger 600'), ('CANADAIR', 'CL6002A12', null, null, 'Bombardier', 'Challenger 601'),
  ('BOMBARDIER', 'CL6002A12', null, null, 'Bombardier', 'Challenger 601'), ('BOMBARDIER', 'CL6002B19', null, null, 'Bombardier', 'CRJ200'),
  ('BOMBARDIER', 'BD1001A10', null, 2013, 'Bombardier', 'Challenger 300'), ('BOMBARDIER', 'BD1001A10', 2014, 2021, 'Bombardier', 'Challenger 350'),
  ('BOMBARDIER', 'BD1001A10', 2022, null, 'Bombardier', 'Challenger 3500'),
  ('BOMBARDIER', 'BD7001A10', null, 2002, 'Bombardier', 'Global Express'), ('BOMBARDIER', 'BD7001A10', 2003, 2011, 'Bombardier', 'Global Express XRS'),
  ('BOMBARDIER', 'BD7001A10', 2012, 2018, 'Bombardier', 'Global 6000'), ('BOMBARDIER', 'BD7001A10', 2019, null, 'Bombardier', 'Global 6500'),
  ('BOMBARDIER', 'BD7001A11', null, 2019, 'Bombardier', 'Global 5000'), ('BOMBARDIER', 'BD7001A11', 2020, null, 'Bombardier', 'Global 5500'),
  ('BOMBARDIER', 'BD7002A12', null, null, 'Bombardier', 'Global 7500'),
  -- Embraer
  ('EMBRAER', 'EMB500', null, 2013, 'Embraer', 'Phenom 100'), ('EMBRAER', 'EMB500', 2014, 2016, 'Embraer', 'Phenom 100E'),
  ('EMBRAER', 'EMB500', 2017, 2022, 'Embraer', 'Phenom 100EV'), ('EMBRAER', 'EMB500', 2023, null, 'Embraer', 'Phenom 100EX'),
  ('EMBRAER', 'EMB505', null, 2017, 'Embraer', 'Phenom 300'), ('EMBRAER', 'EMB505', 2018, null, 'Embraer', 'Phenom 300E'),
  ('EMBRAER', 'EMB545', null, 2019, 'Embraer', 'Legacy 450'), ('EMBRAER', 'EMB545', 2020, null, 'Embraer', 'Praetor 500'),
  ('EMBRAER', 'EMB550', null, 2019, 'Embraer', 'Legacy 500'), ('EMBRAER', 'EMB550', 2020, null, 'Embraer', 'Praetor 600'),
  ('EMBRAER', 'EMB135BJ', null, 2013, 'Embraer', 'Legacy 600'), ('EMBRAER', 'EMB135BJ', 2014, null, 'Embraer', 'Legacy 650'),
  ('EMBRAER', 'ERJ190100ECJ', null, null, 'Embraer', 'Lineage 1000'),
  -- Dassault
  ('DASSAULT', 'MYSTEREFALCON900%', null, null, 'Dassault', 'Falcon 900B'), ('DASSAULT', 'MYSTEREFALCON50%', null, null, 'Dassault', 'Falcon 50'),
  ('DASSAULT', 'MYSTEREFALCON20%', null, null, 'Dassault', 'Falcon 20'), ('DASSAULT', 'MYSTEREFALCON200%', null, null, 'Dassault', 'Falcon 200'),
  ('DASSAULT', 'FANJETFALCON%', null, null, 'Dassault', 'Falcon 20'), ('DASSAULT', 'FALCON900', null, null, 'Dassault', 'Falcon 900B'),
  -- Pilatus, Honda, Cirrus, Daher, Piper
  ('PILATUS', 'PC1247E%', null, 2018, 'Pilatus', 'PC-12 NG'), ('PILATUS', 'PC1247E%', 2019, null, 'Pilatus', 'PC-12 NGX'),
  ('PILATUS', 'PC12%', null, null, 'Pilatus', 'PC-12'),
  ('HONDA', 'HA420', null, 2017, 'Honda', 'HondaJet HA-420'), ('HONDA', 'HA420', 2018, 2021, 'Honda', 'HondaJet Elite'),
  ('HONDA', 'HA420', 2022, 2022, 'Honda', 'HondaJet Elite S'), ('HONDA', 'HA420', 2023, null, 'Honda', 'HondaJet Elite II'),
  ('CIRRUS', 'SF50', null, null, 'Cirrus', 'Vision SF50'),
  ('SOCATA', 'TBM700', null, null, 'Daher', 'TBM 700'), ('SOCATA', 'TBM700N', null, null, 'Daher', 'TBM 850'),
  ('DAHER', 'TBM700', null, 2016, 'Daher', 'TBM 900'), ('DAHER', 'TBM700', 2017, 2018, 'Daher', 'TBM 930'),
  ('DAHER', 'TBM700', 2019, 2022, 'Daher', 'TBM 940'), ('DAHER', 'TBM700', 2023, null, 'Daher', 'TBM 960'),
  ('PIPER', 'PA46600TP', null, null, 'Piper', 'M600'), ('PIPER', 'PA46701TP', null, null, 'Piper', 'M700 Fury'),
  ('PIPER', 'PA46310P', null, null, 'Piper', 'PA-46 Malibu'), ('PIPER', 'PA46R350T', null, null, 'Piper', 'PA-46 Malibu Matrix')
) as x(p, pat, y1, y2, mfr, model)
join public.aircraft_models m on m.manufacturer = x.mfr and m.model = x.model;

-- ---------------------------------------------------------------------------
-- True labor cost: wages × (1 + payroll taxes & insurance %) + overhead per hour.
-- People without a pay rate are costed at the company's average rate.
-- ---------------------------------------------------------------------------
create or replace function public._avg_wage(p_org uuid)
returns numeric language sql stable security definer set search_path = public as $$
  select round(avg(mp.hourly_rate), 2) from member_pay mp
  join memberships m on m.org_id = mp.org_id and m.user_id = mp.user_id and m.active
  where mp.org_id = p_org and mp.hourly_rate > 0;
$$;

-- Hours and true labor cost of finished time entries for a set of jobs.
create or replace function public._true_labor(p_org uuid, p_jobs uuid[])
returns table (job_id uuid, hours numeric, wages numeric, true_labor numeric, pay_missing boolean)
language sql stable security definer set search_path = public as $$
  with o as (select labor_burden_pct, overhead_per_hour, public._avg_wage(id) as avg_wage from organizations where id = p_org)
  select t.job_id,
         round(sum(extract(epoch from (t.ended_at - t.started_at)) / 3600)::numeric, 2),
         round(sum(extract(epoch from (t.ended_at - t.started_at)) / 3600 * coalesce(nullif(mp.hourly_rate, 0), o.avg_wage, 0))::numeric, 2),
         round(sum(extract(epoch from (t.ended_at - t.started_at)) / 3600
                   * (coalesce(nullif(mp.hourly_rate, 0), o.avg_wage, 0) * (1 + o.labor_burden_pct / 100) + o.overhead_per_hour))::numeric, 2),
         bool_or(coalesce(nullif(mp.hourly_rate, 0), o.avg_wage) is null)
  from time_entries t cross join o
  left join member_pay mp on mp.org_id = t.org_id and mp.user_id = t.user_id
  where t.org_id = p_org and t.job_id = any(p_jobs) and t.ended_at is not null
  group by t.job_id;
$$;

-- Cost of one estimated labor hour (crew's average rate when known, else the company's).
create or replace function public._hour_cost(p_org uuid, p_users uuid[] default null)
returns numeric language sql stable security definer set search_path = public as $$
  select round(coalesce(
           (select avg(mp.hourly_rate) from member_pay mp where mp.org_id = p_org and mp.user_id = any(p_users) and mp.hourly_rate > 0),
           public._avg_wage(p_org), 0) * (1 + o.labor_burden_pct / 100) + o.overhead_per_hour, 2)
  from organizations o where o.id = p_org;
$$;
revoke execute on function public._avg_wage(uuid) from public, anon, authenticated;
revoke execute on function public._true_labor(uuid, uuid[]) from public, anon, authenticated;
revoke execute on function public._hour_cost(uuid, uuid[]) from public, anon, authenticated;

create or replace function public.job_profitability(p_job uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  j jobs;
  o organizations;
  v_rev numeric;
  l record;
  t record;
  v_sup numeric;
  v_exp numeric;
  v_unknown_sup boolean;
  v_est_h numeric;
  v_est_sup numeric;
  v_hour_cost numeric;
  v_est_labor numeric;
  v_true_cost numeric;
begin
  select * into j from jobs where id = p_job;
  if not found or not public.has_perm(j.org_id, 'see_reports') then raise exception 'Not allowed'; end if;
  select * into o from organizations where id = j.org_id;
  -- Revenue excludes tax: the invoice net of discount, else the job's lines.
  select coalesce((select subtotal - discount from invoices where job_id = j.id and status <> 'void' order by created_at desc limit 1),
                  (select sum(quantity * unit_price) from job_items where job_id = j.id), 0) into v_rev;
  select * into l from public._labor_cost(j.org_id, null, null, j.id);
  select * into t from public._true_labor(j.org_id, array[j.id]);
  v_sup := public._supply_cost(j.org_id, null, null, j.id);
  v_unknown_sup := exists (select 1 from inventory_movements m where m.job_id = j.id and m.reason = 'job_use' and coalesce(m.unit_cost, 0) = 0);
  select coalesce(sum(amount), 0) into v_exp from expenses where job_id = j.id;
  select sum(est_hours), sum(est_supply_cost) into v_est_h, v_est_sup from job_items where job_id = j.id;
  v_hour_cost := public._hour_cost(j.org_id, (select array_agg(user_id) from job_assignments where job_id = j.id));
  v_est_labor := round(coalesce(v_est_h, 0) * v_hour_cost, 2);
  v_true_cost := case when t.pay_missing then null else round(coalesce(t.true_labor, 0) + v_sup + v_exp, 2) end;
  return jsonb_build_object(
    'revenue', round(v_rev, 2),
    'labor', case when l.unknown_minutes > 0 then null else l.cost end,
    'labor_minutes', l.minutes,
    'labor_unknown_minutes', l.unknown_minutes,
    'supplies', case when v_unknown_sup then null else v_sup end,
    'job_expenses', v_exp,
    'gross', case when l.unknown_minutes > 0 or v_unknown_sup then null else round(v_rev - l.cost - v_sup, 2) end,
    'net', case when l.unknown_minutes > 0 or v_unknown_sup then null else round(v_rev - l.cost - v_sup - v_exp, 2) end,
    'margin_pct', case when l.unknown_minutes > 0 or v_unknown_sup or v_rev = 0 then null else round(100 * (v_rev - l.cost - v_sup - v_exp) / v_rev, 1) end,
    -- Estimate vs actual and true cost
    'est_hours', v_est_h,
    'est_labor', case when v_est_h is null then null else v_est_labor end,
    'est_supplies', v_est_sup,
    'est_cost', case when v_est_h is null and v_est_sup is null then null else round(v_est_labor + coalesce(v_est_sup, 0), 2) end,
    'actual_hours', coalesce(t.hours, 0),
    'hours_variance_pct', case when coalesce(v_est_h, 0) > 0 and coalesce(t.hours, 0) > 0 then round(100 * (t.hours - v_est_h) / v_est_h, 1) end,
    'true_labor', case when t.pay_missing then null else coalesce(t.true_labor, 0) end,
    'overhead', round(coalesce(t.hours, 0) * o.overhead_per_hour, 2),
    'true_cost', v_true_cost,
    'true_profit', case when v_true_cost is null then null else round(v_rev - v_true_cost, 2) end,
    'true_margin_pct', case when v_true_cost is null or v_rev = 0 then null else round(100 * (v_rev - v_true_cost) / v_rev, 1) end,
    'hour_cost', v_hour_cost,
    'labor_burden_pct', o.labor_burden_pct,
    'overhead_per_hour', o.overhead_per_hour);
end;
$$;

-- Estimated cost and margin of a quote, per package option.
create or replace function public.quote_estimate(p_quote uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  q quotes;
  v_hour numeric;
  v_opts jsonb := '[]'::jsonb;
  r record;
begin
  select * into q from quotes where id = p_quote;
  if not found or not public.has_perm(q.org_id, 'see_reports') then raise exception 'Not allowed'; end if;
  v_hour := public._hour_cost(q.org_id);
  for r in
    with opts as (
      select op.id, op.name, op.sort_order from quote_options op where op.quote_id = q.id
      union all
      select null::uuid, 'Quote', 0 where not exists (select 1 from quote_options where quote_id = q.id)
    ), lines as (
      select o.id as option_id, o.name, o.sort_order, i.quantity * i.unit_price as amount, e.hours, e.supply_cost
      from opts o
      left join quote_items i on i.quote_id = q.id and (o.id is null or i.option_id = o.id)
      left join lateral public._service_estimate(i.service_id, q.aircraft_id, i.quantity) e on i.service_id is not null
    )
    select option_id, name, sort_order,
           greatest(coalesce(sum(amount), 0) - least(q.discount, coalesce(sum(amount), 0)), 0) as revenue,
           coalesce(sum(hours), 0) as hours, coalesce(sum(supply_cost), 0) as supplies
    from lines group by option_id, name, sort_order order by sort_order, name
  loop
    v_opts := v_opts || jsonb_build_object(
      'option_id', r.option_id, 'name', r.name, 'revenue', round(r.revenue, 2), 'est_hours', round(r.hours, 2),
      'labor', round(r.hours * v_hour, 2), 'supplies', round(r.supplies, 2),
      'cost', round(r.hours * v_hour + r.supplies, 2),
      'profit', round(r.revenue - r.hours * v_hour - r.supplies, 2),
      'margin_pct', case when r.revenue > 0 then round(100 * (r.revenue - r.hours * v_hour - r.supplies) / r.revenue, 1) end);
  end loop;
  return jsonb_build_object('hourly_cost', v_hour, 'options', v_opts);
end;
$$;

-- Profit by asset class / model / type, and estimate accuracy by service.
create or replace function public.job_costing_report(p_org uuid, p_from date, p_to date, p_branch uuid default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  o organizations;
  v_tz text;
  v_jobs uuid[];
  v jsonb;
begin
  if not public.has_perm(p_org, 'see_reports') then raise exception 'Not allowed'; end if;
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

-- Overhead per labor hour from the last 90 days: expenses not tied to a job
-- (wages and supplies excluded: those are counted as labor and job supplies).
create or replace function public.suggest_overhead_per_hour(p_org uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_exp numeric;
  v_hours numeric;
begin
  if not public.is_admin(p_org) then raise exception 'Not allowed'; end if;
  select coalesce(sum(amount), 0) into v_exp from expenses
  where org_id = p_org and job_id is null and category not in ('wages','supplies') and spent_on >= current_date - 90;
  select coalesce(sum(extract(epoch from (ended_at - started_at)) / 3600), 0) into v_hours from time_entries
  where org_id = p_org and ended_at is not null and started_at >= now() - interval '90 days';
  return jsonb_build_object('overhead_per_hour', case when v_hours > 0 then round(v_exp / v_hours, 2) end,
    'expenses', round(v_exp, 2), 'hours', round(v_hours, 1), 'days', 90);
end;
$$;

-- New functions: signed-in users only (same rule as 20261017001100 §2).
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig from pg_proc p
    where p.pronamespace = 'public'::regnamespace and p.prokind = 'f' and p.prorettype <> 'trigger'::regtype
      and p.proname in ('faa_lookup','remember_faa_model','apply_assessment','link_request_quote','submit_for_qc','qc_decision',
                        'request_skill_signoff','set_skill','job_profitability','quote_estimate','job_costing_report',
                        'suggest_overhead_per_hour','record_count','schedule_conflicts','_faa_norm','_faa_strip','_faa_tail',
                        '_typical_length','_category_label')
  loop
    execute format('revoke execute on function %s from public, anon', f.sig);
    execute format('grant execute on function %s to authenticated, service_role', f.sig);
  end loop;
end $$;

-- Photo quote requests get their own alert title.
create or replace function public.trg_booking_request_notify()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_name text;
begin
  select name into v_name from customers where id = new.customer_id;
  perform public.notify(new.org_id, 'managers', 'booking_request',
    case new.kind when 'reschedule' then 'Reschedule request' when 'quote_dates' then 'Preferred dates for an accepted quote'
                  when 'photo_quote' then 'Quote request with photos' else 'New booking request' end,
    v_name || coalesce(': ' || left(new.notes, 100), ''), '/requests');
  return null;
end;
$$;

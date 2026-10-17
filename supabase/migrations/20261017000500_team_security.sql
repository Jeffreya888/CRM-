-- =============================================================================
-- Team access & account security: email invitations, member management with
-- reassignment, devices & sessions, company switching/leaving, scheduling
-- integration requests, and the temporary demo workspace.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Invitations: link + code, 7-day expiry, newest invite wins
-- ---------------------------------------------------------------------------
alter table public.invitations
  add column token text not null unique default encode(gen_random_bytes(18), 'hex'),
  add column expires_at timestamptz not null default (now() + interval '7 days'),
  add column revoked_at timestamptz,
  add column sent_at timestamptz;

create or replace function public.my_email_verified()
returns boolean language sql stable security definer set search_path = public, auth as $$
  select coalesce((select email_confirmed_at is not null from auth.users where id = auth.uid()), false);
$$;

drop function public.invite_member(uuid, text, public.member_role);
create or replace function public.invite_member(p_org uuid, p_email text, p_role public.member_role)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_inv invitations;
  v_seats int;
  v_email text := lower(trim(p_email));
begin
  if not public.is_admin(p_org) then raise exception 'Only owners and admins can invite'; end if;
  if (select is_demo from organizations where id = p_org) then raise exception 'DEMO: invitations are disabled in the demo workspace'; end if;
  if not public.my_email_verified() then raise exception 'EMAIL_UNVERIFIED: verify your login email before inviting staff'; end if;
  if p_role = 'owner' then raise exception 'Cannot invite another owner'; end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Enter a valid email address'; end if;
  if not public.plan_allows(p_org, 'team') then raise exception 'SEAT_LIMIT: the Solo plan is for one person. Upgrade to add team members.'; end if;
  select count(*) into v_seats from memberships where org_id = p_org and active;
  if v_seats >= public.plan_seat_limit(public.effective_plan(p_org)) then
    raise exception 'SEAT_LIMIT: all seats are in use. Upgrade your plan or deactivate someone to free a seat.';
  end if;
  if exists (select 1 from memberships m join auth.users u on u.id = m.user_id where m.org_id = p_org and m.active and lower(u.email) = v_email) then
    raise exception 'That person is already on your team';
  end if;
  -- A new invitation to the same email cancels earlier pending ones.
  update invitations set revoked_at = now()
    where org_id = p_org and email = v_email and accepted_at is null and revoked_at is null;
  insert into invitations (org_id, email, role, invited_by) values (p_org, v_email, p_role, auth.uid())
    returning * into v_inv;
  return jsonb_build_object('id', v_inv.id, 'code', v_inv.code, 'token', v_inv.token, 'expires_at', v_inv.expires_at);
end;
$$;

create or replace function public.revoke_invitation(p_invitation uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_org uuid;
begin
  select org_id into v_org from invitations where id = p_invitation;
  if v_org is null or not public.is_admin(v_org) then raise exception 'Not found'; end if;
  update invitations set revoked_at = now() where id = p_invitation and accepted_at is null;
end;
$$;

-- Accept by code or link token. The signed-in email must match and be verified.
create or replace function public.accept_invitation(p_code text)
returns uuid language plpgsql security definer set search_path = public, auth as $$
declare
  v_inv invitations;
  v_uid uuid := auth.uid();
  v_email text;
  v_verified boolean;
  v_seats int;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  select lower(email), email_confirmed_at is not null into v_email, v_verified from auth.users where id = v_uid;
  select * into v_inv from invitations
    where (code = upper(trim(p_code)) or token = trim(p_code)) and accepted_at is null
    for update;
  if not found then raise exception 'Invitation code is invalid or already used'; end if;
  if v_inv.revoked_at is not null then raise exception 'This invitation was cancelled. Ask for a new one.'; end if;
  if v_inv.expires_at < now() then raise exception 'This invitation expired. Ask for a new one.'; end if;
  if v_email is distinct from v_inv.email then
    raise exception 'This invitation is for %. Sign in with that email to accept it.', v_inv.email;
  end if;
  if not v_verified then raise exception 'EMAIL_UNVERIFIED: verify your email first, then accept the invitation'; end if;
  select count(*) into v_seats from memberships where org_id = v_inv.org_id and active;
  if v_seats >= public.plan_seat_limit(public.effective_plan(v_inv.org_id)) then
    raise exception 'SEAT_LIMIT: this team is full. Ask the owner to upgrade.';
  end if;
  insert into memberships (org_id, user_id, role, display_name)
    select v_inv.org_id, v_uid, v_inv.role, p.full_name from profiles p where p.id = v_uid
    on conflict (org_id, user_id) do update set active = true, role = excluded.role, deactivated_at = null;
  update invitations set accepted_at = now() where id = v_inv.id;
  update profiles set current_org_id = v_inv.org_id where id = v_uid;
  return v_inv.org_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Member management
-- ---------------------------------------------------------------------------
-- Moves a person's open jobs and recurring schedules to someone else (or
-- leaves them unassigned when p_to is null). Returns how many were moved.
create or replace function public.reassign_member_work(p_org uuid, p_from uuid, p_to uuid default null)
returns int language plpgsql security definer set search_path = public as $$
declare v_n int := 0; v_m int;
begin
  if not public.is_admin(p_org) then raise exception 'Only owners and admins can reassign work'; end if;
  if p_to is not null and not exists (select 1 from memberships where org_id = p_org and user_id = p_to and active) then
    raise exception 'Choose an active team member';
  end if;
  if p_to is not null then
    insert into job_assignments (job_id, user_id, org_id, is_primary)
      select a.job_id, p_to, a.org_id, false from job_assignments a join jobs j on j.id = a.job_id
      where a.org_id = p_org and a.user_id = p_from and j.status in ('tentative','scheduled','in_progress','on_hold')
      on conflict do nothing;
    update job_assignments b set is_primary = true
      from job_assignments a join jobs j on j.id = a.job_id
      where a.org_id = p_org and a.user_id = p_from and a.is_primary and b.job_id = a.job_id and b.user_id = p_to
        and j.status in ('tentative','scheduled','in_progress','on_hold');
  end if;
  delete from job_assignments a using jobs j
    where j.id = a.job_id and a.org_id = p_org and a.user_id = p_from and j.status in ('tentative','scheduled','in_progress','on_hold');
  get diagnostics v_n = row_count;
  update recurring_schedules set default_user_id = p_to where org_id = p_org and default_user_id = p_from;
  get diagnostics v_m = row_count;
  return v_n + v_m;
end;
$$;

-- Role changes and deactivation (history is kept; the seat frees up).
create or replace function public.update_member(p_org uuid, p_user uuid, p_role public.member_role default null, p_active boolean default null, p_reassign_to uuid default null)
returns void language plpgsql security definer set search_path = public as $$
declare m memberships;
begin
  if not public.is_admin(p_org) then raise exception 'Only owners and admins can manage the team'; end if;
  select * into m from memberships where org_id = p_org and user_id = p_user;
  if not found then raise exception 'Member not found'; end if;
  if m.role = 'owner' then raise exception 'The owner cannot be changed here. Use transfer ownership.'; end if;
  if p_role = 'owner' then raise exception 'Use transfer ownership to make someone the owner'; end if;
  if p_role = 'admin' and not public.is_owner(p_org) then raise exception 'Only the owner can make admins'; end if;
  if p_active is true and not m.active then
    if (select count(*) from memberships where org_id = p_org and active) >= public.plan_seat_limit(public.effective_plan(p_org)) then
      raise exception 'SEAT_LIMIT: all seats are in use. Upgrade your plan to reactivate this person.';
    end if;
  end if;
  -- Leaving the field crew (deactivated, or no longer a technician) hands off their work.
  if (p_active is false and m.active) or (p_role is not null and p_role in ('viewer') and m.role <> 'viewer') then
    perform public.reassign_member_work(p_org, p_user, p_reassign_to);
  end if;
  update memberships set
    role = coalesce(p_role, role),
    active = coalesce(p_active, active),
    deactivated_at = case when p_active is false then now() when p_active is true then null else deactivated_at end
  where org_id = p_org and user_id = p_user;
  insert into audit_log (org_id, actor, action, entity, entity_id, summary)
    values (p_org, auth.uid(), 'updated', 'memberships', m.id,
            coalesce(m.display_name, 'Member') || coalesce(' → ' || p_role::text, '') || case when p_active is false then ' (deactivated)' when p_active is true then ' (reactivated)' else '' end);
end;
$$;

create or replace function public.transfer_ownership(p_org uuid, p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_owner(p_org) then raise exception 'Only the owner can transfer ownership'; end if;
  if not exists (select 1 from memberships where org_id = p_org and user_id = p_user and active and user_id <> auth.uid()) then
    raise exception 'Choose an active team member';
  end if;
  update memberships set role = 'owner' where org_id = p_org and user_id = p_user;
  update memberships set role = 'admin' where org_id = p_org and user_id = auth.uid();
  insert into audit_log (org_id, actor, action, entity, summary) values (p_org, auth.uid(), 'updated', 'memberships', 'Ownership transferred');
end;
$$;

create or replace function public.leave_company(p_org uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if public.is_owner(p_org) then raise exception 'Owners cannot leave. Transfer ownership first, or delete your account.'; end if;
  perform set_config('request.jwt.claim.sub', auth.uid()::text, true);
  delete from job_assignments a using jobs j
    where j.id = a.job_id and a.org_id = p_org and a.user_id = auth.uid() and j.status in ('tentative','scheduled','in_progress','on_hold');
  update memberships set active = false, deactivated_at = now() where org_id = p_org and user_id = auth.uid();
  update profiles set current_org_id = (select org_id from memberships where user_id = auth.uid() and active limit 1) where id = auth.uid();
end;
$$;

-- Member details editable by admins (pay lives in member_pay).
grant update (display_name, color, skills, default_branch_id) on public.memberships to authenticated;

-- ---------------------------------------------------------------------------
-- Devices & sessions
-- ---------------------------------------------------------------------------
create table public.user_devices (
  user_id uuid not null references auth.users(id) on delete cascade,
  device_id text not null,
  label text,
  platform text,
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  primary key (user_id, device_id)
);
alter table public.user_devices enable row level security;
create policy user_devices_self on public.user_devices for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Returns true when this is a new device for an account that already had one
-- (the app then asks the server to send a "new sign-in" email).
create or replace function public.register_device(p_device text, p_label text, p_platform text)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_new boolean; v_had boolean;
begin
  if auth.uid() is null then return false; end if;
  select exists (select 1 from user_devices where user_id = auth.uid()) into v_had;
  insert into user_devices (user_id, device_id, label, platform) values (auth.uid(), left(p_device, 100), left(p_label, 100), left(p_platform, 20))
    on conflict (user_id, device_id) do update set last_seen = now(), label = excluded.label
    returning (xmax = 0) into v_new;
  return v_new and v_had;
end;
$$;

-- Active sign-in sessions (Supabase Auth). Lets people sign out a lost phone.
create or replace function public.my_sessions()
returns table (id uuid, created_at timestamptz, updated_at timestamptz, user_agent text, ip text, aal text)
language sql stable security definer set search_path = public, auth as $$
  select s.id, s.created_at, coalesce(s.refreshed_at::timestamptz, s.updated_at), s.user_agent, host(s.ip), s.aal::text
  from auth.sessions s where s.user_id = auth.uid()
  order by coalesce(s.refreshed_at::timestamptz, s.updated_at) desc nulls last;
$$;

create or replace function public.revoke_session(p_session uuid)
returns void language sql security definer set search_path = public, auth as $$
  delete from auth.sessions where id = p_session and user_id = auth.uid();
$$;

create or replace function public.revoke_other_sessions(p_keep uuid)
returns int language plpgsql security definer set search_path = public, auth as $$
declare v int;
begin
  delete from auth.sessions where user_id = auth.uid() and id is distinct from p_keep;
  get diagnostics v = row_count;
  return v;
end;
$$;

-- ---------------------------------------------------------------------------
-- Scheduling-software integrations (Fleet): request flow + read-only feed
-- ---------------------------------------------------------------------------
create table public.integration_requests (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  provider text not null check (provider in ('fl3xx','leon','schedaero','airplane_manager','avianis','flight_schedule_pro')),
  management_company text not null,
  contact_name text,
  contact_email text,
  notes text,
  status text not null default 'prepared' check (status in ('prepared','sent_to_vendor','approved','live','declined')),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger integration_requests_updated before update on public.integration_requests for each row execute function public.set_updated_at();
alter table public.integration_requests enable row level security;
create policy integration_requests_admin on public.integration_requests for all using (public.is_admin(org_id)) with check (public.is_admin(org_id));
-- Only the platform marks a connection approved or live.
create or replace function public.trg_integration_status()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status in ('approved','live') and (tg_op = 'INSERT' or old.status is distinct from new.status) and auth.uid() is not null and not public.is_platform_admin() then
    raise exception 'Connections are marked approved or live by Flight Ready once the vendor grants access';
  end if;
  if not public.plan_allows(new.org_id, 'integrations') then
    raise exception 'PLAN_FEATURE: scheduling integrations are part of the Fleet plan';
  end if;
  return new;
end;
$$;
create trigger integration_requests_status before insert or update on public.integration_requests for each row execute function public.trg_integration_status();

create table public.external_schedule_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  provider text not null,
  external_id text not null,
  tail_number text,
  title text,
  starts_at timestamptz not null,
  ends_at timestamptz,
  location text,
  raw jsonb,
  synced_at timestamptz not null default now(),
  unique (org_id, provider, external_id)
);
create index on public.external_schedule_events (org_id, starts_at);
alter table public.external_schedule_events enable row level security;
create policy external_events_select on public.external_schedule_events for select using (public.is_member(org_id));

-- ---------------------------------------------------------------------------
-- Demo workspace: a private sample company on Fleet that expires. Created for
-- an anonymous sign-in; real emails, texts and payments are blocked.
-- ---------------------------------------------------------------------------
create or replace function public.create_demo_workspace()
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_org uuid;
  v_c1 uuid; v_c2 uuid; v_c3 uuid;
  v_a1 uuid; v_a2 uuid; v_a3 uuid; v_a4 uuid;
  v_l1 uuid; v_l2 uuid;
  v_b1 uuid; v_b2 uuid;
  v_job uuid; v_q uuid; v_inv uuid;
  v_today timestamptz := date_trunc('day', now()) + interval '9 hours';
  v_svc record;
  i int;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  select org_id into v_org from memberships where user_id = v_uid and active limit 1;
  if v_org is not null then return v_org; end if;
  update profiles set full_name = coalesce(full_name, 'Demo Owner') where id = v_uid;

  insert into organizations (name, email, phone, address, business_types, plan, plan_expires_at, trial_ends_at, is_demo, demo_expires_at,
                             tax_rate, google_review_url, payment_mode)
  values ('Skyline Aircraft Detailing (Demo)', 'demo@flightready.example', '(555) 010-2030', '1 Hangar Way, Teterboro, NJ',
          array['aircraft','vehicle','watercraft'], 'fleet', now() + interval '7 days', now() + interval '7 days', true, now() + interval '7 days',
          0.0663, 'https://g.page/r/demo-review', 'direct')
  returning id into v_org;
  insert into memberships (org_id, user_id, role, display_name) values (v_org, v_uid, 'owner', 'Demo Owner');
  update profiles set current_org_id = v_org where id = v_uid;
  perform public.seed_default_services(v_org);
  perform public.seed_asset_services(v_org, 'vehicle');
  perform public.seed_asset_services(v_org, 'watercraft');
  perform public.seed_org_defaults(v_org);
  insert into member_pay (org_id, user_id, hourly_rate) values (v_org, v_uid, 45);

  insert into branches (org_id, name, address) values (v_org, 'Teterboro (KTEB)', 'Teterboro, NJ') returning id into v_b1;
  insert into branches (org_id, name, address) values (v_org, 'Palm Beach (KPBI)', 'West Palm Beach, FL') returning id into v_b2;

  insert into locations (org_id, name, airport_code, fbo_name, address, contact_phone, access_notes, has_water, has_power, hangar_available, hangar_capacity, fees)
    values (v_org, 'Teterboro Airport', 'KTEB', 'Signature Flight Support', '111 Industrial Ave, Teterboro, NJ', '(201) 555-0100',
            'Check in at the front desk; escort required past the gate.', true, true, true, 2, '[{"name":"Ramp access fee","amount":75}]')
    returning id into v_l1;
  insert into location_secrets (location_id, org_id, gate_code) values (v_l1, v_org, '4471#');
  insert into locations (org_id, name, airport_code, fbo_name, address, has_water, has_power, hangar_available, hangar_capacity)
    values (v_org, 'Palm Beach International', 'KPBI', 'Atlantic Aviation', 'West Palm Beach, FL', false, true, false, 0)
    returning id into v_l2;
  insert into facility_requirements (org_id, location_id, name, kind, applies_to)
    values (v_org, v_l1, 'KTEB ramp badge', 'badge', 'person'), (v_org, v_l1, 'Certificate of insurance ($2M)', 'coi', 'company');
  insert into certifications (org_id, user_id, name, kind, expires_on) values
    (v_org, null, 'Certificate of insurance ($2M)', 'coi', current_date + 200),
    (v_org, v_uid, 'KTEB ramp badge', 'badge', current_date + 25);

  insert into customers (org_id, name, company, email, phone, kind, sms_consent) values
    (v_org, 'Jordan Blake', 'Blake Aviation Holdings', 'jordan@example.com', '(555) 201-3344', 'owner', true) returning id into v_c1;
  insert into customers (org_id, name, company, email, phone, kind) values
    (v_org, 'Priya Shah', 'Coastal Charter Group', 'ops@example.com', '(555) 404-1122', 'charter') returning id into v_c2;
  insert into customers (org_id, name, email, phone, kind) values
    (v_org, 'Marcus Lee', 'marcus@example.com', '(555) 303-9988', 'owner') returning id into v_c3;

  insert into aircraft (org_id, customer_id, tail_number, manufacturer, model, category, length_ft, wingspan_ft, home_location_id, model_id)
    select v_org, v_c1, 'N650JB', 'Gulfstream', 'G650ER', 'large_jet', 99.8, 99.6, v_l1, (select id from aircraft_models where manufacturer = 'Gulfstream' and model = 'G650ER')
    returning id into v_a1;
  insert into aircraft (org_id, customer_id, tail_number, manufacturer, model, category, length_ft, wingspan_ft, home_location_id)
    values (v_org, v_c2, 'N350CC', 'Bombardier', 'Challenger 350', 'super_midsize_jet', 68.7, 69.0, v_l2) returning id into v_a2;
  insert into aircraft (org_id, customer_id, tail_number, manufacturer, model, category, length_ft, wingspan_ft, home_location_id)
    values (v_org, v_c2, 'N52CJ', 'Cessna', 'Citation CJ3+', 'light_jet', 51.2, 53.3, v_l2) returning id into v_a3;
  insert into aircraft (org_id, customer_id, tail_number, asset_type, manufacturer, model, category)
    values (v_org, v_c3, 'Range Rover', 'vehicle', 'Land Rover', 'Range Rover', 'suv') returning id into v_a4;

  insert into inventory_items (org_id, name, unit, quantity, par_level, reorder_qty, unit_cost, vendor, approved_for, category) values
    (v_org, 'Aircraft wash concentrate (1 gal)', 'gal', 6, 4, 6, 38, 'Aero Supply Co.', 'Meets AMS 1526', 'Chemicals'),
    (v_org, 'Microfiber towels (12-pack)', 'pack', 3, 5, 10, 24, 'Detail Depot', null, 'Towels'),
    (v_org, 'Ceramic coating kit', 'kit', 2, 2, 3, 189, 'Coating Pro', 'OEM tested on Gulfstream paint', 'Coatings');

  insert into equipment (org_id, name, serial_number, purchased_on, status, bookable, usage_hours, warranty_expires_on, assigned_label) values
    (v_org, 'Hot-water pressure washer', 'PW-2231', current_date - 400, 'in_service', true, 312, current_date + 300, 'Van 1'),
    (v_org, 'Carpet extractor', 'EX-118', current_date - 200, 'in_service', true, 88, current_date + 500, 'Van 1'),
    (v_org, 'Dual-action polisher', 'DA-5', current_date - 90, 'needs_service', true, 140, null, 'Shop');
  insert into equipment_maintenance (org_id, equipment_id, name, every_hours, last_done_hours)
    select v_org, id, 'Pump oil change', 250, 100 from equipment where org_id = v_org and name = 'Hot-water pressure washer';

  -- Jobs: one completed & paid, one today, one tentative follow-up next month.
  insert into jobs (org_id, number, title, customer_id, aircraft_id, location_id, branch_id, status, scheduled_start, scheduled_end, actual_start, actual_end, rating)
    values (v_org, public._next_number(v_org, 'job'), 'Exterior Wash, Interior Detail', v_c1, v_a1, v_l1, v_b1, 'scheduled',
            v_today - interval '6 days', v_today - interval '6 days' + interval '6 hours', v_today - interval '6 days', v_today - interval '6 days' + interval '6 hours', 5)
    returning id into v_job;
  insert into job_items (org_id, job_id, service_id, description, quantity, unit_price, taxable)
    select v_org, v_job, id, name, 1, case name when 'Exterior Wash' then 1048 else 1050 end, true from services where org_id = v_org and name in ('Exterior Wash','Interior Detail') and asset_type = 'aircraft';
  insert into job_photos (org_id, job_id, kind, storage_path) values (v_org, v_job, 'before', v_org || '/demo/before.jpg'), (v_org, v_job, 'after', v_org || '/demo/after.jpg');
  insert into job_assignments (job_id, user_id, org_id, is_primary, confirmed) values (v_job, v_uid, v_org, true, true);
  insert into time_entries (org_id, user_id, job_id, started_at, ended_at, approved)
    values (v_org, v_uid, v_job, v_today - interval '6 days', v_today - interval '6 days' + interval '5 hours 30 minutes', true);
  update jobs set status = 'completed' where id = v_job;
  v_inv := public._create_invoice_for_job(v_job);
  update invoices set status = 'sent' where id = v_inv;
  insert into payments (org_id, invoice_id, amount, method, reference, received_at)
    select v_org, v_inv, total, 'ach', 'Demo payment', now() - interval '3 days' from invoices where id = v_inv;

  insert into jobs (org_id, number, title, customer_id, aircraft_id, location_id, branch_id, status, scheduled_start, scheduled_end)
    values (v_org, public._next_number(v_org, 'job'), 'Exterior Wash', v_c2, v_a2, v_l2, v_b2, 'scheduled', v_today + interval '1 hour', v_today + interval '4 hours')
    returning id into v_job;
  insert into job_items (org_id, job_id, service_id, description, quantity, unit_price, taxable)
    select v_org, v_job, id, name, 1, 768, true from services where org_id = v_org and name = 'Exterior Wash' and asset_type = 'aircraft';
  insert into job_checklist_items (org_id, job_id, label, sort_order, guide_key, step_index)
    select v_org, v_job, step, ord::int, 'exterior_wash', (ord - 1)::int
    from services s cross join lateral unnest(s.checklist) with ordinality as x(step, ord)
    where s.org_id = v_org and s.name = 'Exterior Wash' and s.asset_type = 'aircraft';
  insert into job_assignments (job_id, user_id, org_id, is_primary) values (v_job, v_uid, v_org, true);

  insert into jobs (org_id, number, title, customer_id, aircraft_id, location_id, status, scheduled_start, scheduled_end)
    values (v_org, public._next_number(v_org, 'job'), 'Ceramic Coating', v_c2, v_a3, v_l2, 'tentative', v_today + interval '20 days', v_today + interval '20 days' + interval '10 hours');

  -- An open Good/Better/Best quote.
  insert into quotes (org_id, number, customer_id, aircraft_id, status, tax_rate, valid_until, valid_until_at, deposit_type, deposit_value, sent_at)
    values (v_org, public._next_number(v_org, 'quote'), v_c3, v_a1, 'draft', 0.0663, current_date + 14, now() + interval '14 days', 'percent', 25, now())
    returning id into v_q;
  for i in 0..2 loop
    insert into quote_options (org_id, quote_id, name, sort_order) values (v_org, v_q, (array['Good','Better','Best'])[i + 1], i);
  end loop;
  insert into quote_items (org_id, quote_id, option_id, service_id, description, quantity, unit_price, sort_order)
    select v_org, v_q, o.id, s.id, s.name, 1, p.price, p.ord
    from (values ('Good', 'Exterior Wash', 1048, 0), ('Better', 'Exterior Wash', 1048, 0), ('Better', 'Wax / Sealant', 1450, 1),
                 ('Best', 'Exterior Wash', 1048, 0), ('Best', 'Ceramic Coating', 7488, 1)) p(opt, svc, price, ord)
    join quote_options o on o.quote_id = v_q and o.name = p.opt
    join services s on s.org_id = v_org and s.name = p.svc and s.asset_type = 'aircraft';
  update quotes set status = 'sent' where id = v_q;

  insert into recurring_schedules (org_id, customer_id, aircraft_id, service_id, title, price, first_at, timezone, every, unit, default_user_id, create_as, heads_up_days)
    select v_org, v_c1, v_a1, id, 'Monthly exterior wash', 1048, v_today + interval '14 days', 'America/New_York', 1, 'month', v_uid, 'tentative', 3
    from services where org_id = v_org and name = 'Exterior Wash' and asset_type = 'aircraft';

  insert into opportunities (org_id, title, stage, value, probability, follow_up_on, contact_name, contact_email, asset_description)
    values (v_org, 'Fleet wash contract — 4 jets', 'contacted', 48000, 40, current_date, 'Avery Kim', 'avery@example.com', '2× Global 6000, 2× Challenger 650');
  insert into expenses (org_id, category, vendor, description, amount, spent_on, branch_id) values
    (v_org, 'insurance', 'Aviation Insurers Inc.', 'General liability — monthly', 640, current_date - 10, v_b1),
    (v_org, 'fuel', 'Shell', 'Van fuel', 86.40, current_date - 4, v_b1);
  insert into time_off (org_id, user_id, starts_on, ends_on, reason, status) values (v_org, v_uid, current_date + 30, current_date + 32, 'Family trip', 'approved');
  return v_org;
end;
$$;

-- Deletes expired demo companies and their anonymous users (worker).
create or replace function public.cleanup_demo_workspaces()
returns int language plpgsql security definer set search_path = public, auth as $$
declare v int;
begin
  if auth.uid() is not null then raise exception 'Server only'; end if;
  with gone as (
    delete from organizations where is_demo and demo_expires_at < now() returning id
  ) select count(*) into v from gone;
  delete from auth.users u where coalesce((u.raw_user_meta_data ->> 'demo')::boolean, false)
    and not exists (select 1 from public.memberships m where m.user_id = u.id);
  return v;
end;
$$;
revoke execute on function public.cleanup_demo_workspaces() from public, anon, authenticated;

-- Demo workspaces cannot send, charge or connect real services.
create or replace function public.trg_demo_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (select is_demo from organizations where id = new.org_id) and new.status = 'queued' then
    new.status := 'blocked';
    new.error := 'Demo workspace: messages are not sent';
  end if;
  return new;
end;
$$;
create trigger messages_demo_guard before insert on public.messages for each row execute function public.trg_demo_guard();

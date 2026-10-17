-- =============================================================================
-- Operations: job workflow rules, crew & resource scheduling with conflict
-- checks, facilities (airports / marinas / service sites), supply room and
-- equipment maintenance.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Notification outbox: rows written by triggers, pushed by the worker.
-- ---------------------------------------------------------------------------
create table public.notification_outbox (
  id bigint generated always as identity primary key,
  org_id uuid not null references public.organizations(id) on delete cascade,
  audience text not null default 'managers' check (audience in ('owners','managers','user')),
  user_id uuid references auth.users(id) on delete cascade,
  kind text not null,
  title text not null,
  body text,
  url text,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
create index on public.notification_outbox (sent_at) where sent_at is null;
alter table public.notification_outbox enable row level security;
-- Written by security-definer triggers and read by the service-role worker only.

create or replace function public.notify(p_org uuid, p_audience text, p_kind text, p_title text, p_body text, p_url text, p_user uuid default null)
returns void language sql security definer set search_path = public as $$
  insert into notification_outbox (org_id, audience, user_id, kind, title, body, url)
  values (p_org, p_audience, p_user, p_kind, p_title, p_body, p_url);
$$;
revoke execute on function public.notify(uuid, text, text, text, text, text, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Jobs: crew, travel buffers, condition acceptance, care consent, flags
-- ---------------------------------------------------------------------------
alter table public.jobs
  add column travel_before_min int not null default 0 check (travel_before_min between 0 and 720),
  add column travel_after_min int not null default 0 check (travel_after_min between 0 and 720),
  add column care_opt_in boolean not null default false,
  add column condition_report text,
  add column condition_signature_svg text,
  add column condition_signed_by text,
  add column condition_signed_at timestamptz,
  add column condition_version int not null default 0,
  add column flagged boolean not null default false,
  add column flag_reason text,
  add constraint jobs_max_24h check (scheduled_end is null or scheduled_start is null or scheduled_end <= scheduled_start + interval '24 hours');

alter table public.job_assignments
  add column is_primary boolean not null default false,
  add column confirmed boolean not null default false;
create unique index job_assignments_one_primary on public.job_assignments (job_id) where is_primary;

-- Condition reports are versioned: any change to the text after signing
-- clears the signature and bumps the version so a new sign-off is required.
create or replace function public.trg_condition_version()
returns trigger language plpgsql as $$
begin
  if new.condition_report is distinct from old.condition_report then
    new.condition_version := old.condition_version + 1;
    if new.condition_signature_svg is not distinct from old.condition_signature_svg then
      new.condition_signature_svg := null;
      new.condition_signed_by := null;
      new.condition_signed_at := null;
    end if;
  end if;
  if new.condition_signature_svg is not null and new.condition_signature_svg is distinct from old.condition_signature_svg then
    new.condition_signed_at := coalesce(new.condition_signed_at, now());
  end if;
  return new;
end;
$$;
create trigger jobs_condition_version before update of condition_report, condition_signature_svg on public.jobs
  for each row execute function public.trg_condition_version();

-- Photos: at most 30 per job.
create or replace function public.trg_job_photo_limit()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from job_photos where job_id = new.job_id) >= 30 then
    raise exception 'PHOTO_LIMIT: a job can have at most 30 photos';
  end if;
  return new;
end;
$$;
create trigger job_photos_limit before insert on public.job_photos for each row execute function public.trg_job_photo_limit();

-- Low sign-off ratings flag the job and alert the owner right away.
create or replace function public.trg_job_rating()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_tail text;
begin
  if new.rating is not null and new.rating <= 3 and (old.rating is distinct from new.rating) then
    new.flagged := true;
    new.flag_reason := coalesce(new.flag_reason, new.rating || '-star sign-off rating');
    select tail_number into v_tail from aircraft where id = new.aircraft_id;
    perform public.notify(new.org_id, 'owners', 'low_rating',
      new.rating || '★ rating on ' || coalesce(v_tail, new.number),
      coalesce(left(new.feedback, 140), 'Reach out now to turn this around.'), '/jobs/' || new.id);
  end if;
  return new;
end;
$$;
create trigger jobs_rating before update of rating on public.jobs for each row execute function public.trg_job_rating();

-- ---------------------------------------------------------------------------
-- Supply room
-- ---------------------------------------------------------------------------
alter table public.inventory_items rename column reorder_level to par_level;
alter table public.inventory_items
  add column category text,
  add column reorder_qty numeric(12,2) not null default 0 check (reorder_qty >= 0),
  add column vendor_url text,
  add column vendor_email text,
  add column sds_path text,
  add column expires_on date,
  add column barcode text,
  add column active boolean not null default true;
comment on column public.inventory_items.approved_for is 'OEM approvals, e.g. "Gulfstream AMM approved", "Boeing D6-17487"';
create unique index inventory_items_barcode on public.inventory_items (org_id, barcode) where barcode is not null;

-- Stock locations: shop, vans, branches (Fleet).
create table public.stock_locations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  kind text not null default 'shop' check (kind in ('shop','van','branch','hangar','other')),
  branch_id uuid references public.branches(id) on delete set null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.stock_locations enable row level security;
create policy stock_locations_select on public.stock_locations for select using (public.is_member(org_id));
create policy stock_locations_write on public.stock_locations for all using (public.is_manager(org_id)) with check (public.is_manager(org_id));

alter table public.inventory_movements drop constraint inventory_movements_reason_check;
alter table public.inventory_movements
  add constraint inventory_movements_reason_check check (reason in ('purchase','job_use','adjustment','waste','count','transfer')),
  add column stock_location_id uuid references public.stock_locations(id) on delete set null,
  add column unit_cost numeric(12,2),
  add column auto boolean not null default false,
  add column note text;
-- Automatic job deductions happen once per job and item.
create unique index inventory_movements_auto_once on public.inventory_movements (job_id, item_id) where auto;
create trigger movements_org_j before insert or update on public.inventory_movements for each row execute function public.assert_same_org('jobs', 'job_id');
create trigger movements_org_l before insert or update on public.inventory_movements for each row execute function public.assert_same_org('stock_locations', 'stock_location_id');

-- Supplies are counted in whole units; movements remember the cost at the time.
create or replace function public.trg_movement_defaults()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.delta <> trunc(new.delta) then raise exception 'Supplies are counted in whole units'; end if;
  if new.unit_cost is null then
    select unit_cost into new.unit_cost from inventory_items where id = new.item_id;
  end if;
  new.created_by := coalesce(new.created_by, auth.uid());
  return new;
end;
$$;
create trigger movements_defaults before insert on public.inventory_movements for each row execute function public.trg_movement_defaults();

-- Low-stock alert when an item drops to or below its par level.
create or replace function public.trg_low_stock()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.par_level > 0 and new.quantity <= new.par_level and old.quantity > old.par_level then
    perform public.notify(new.org_id, 'managers', 'low_stock', 'Low stock: ' || new.name,
      'Only ' || trim(to_char(new.quantity, 'FM999999990.##')) || ' ' || new.unit || ' left (par ' || trim(to_char(new.par_level, 'FM999999990.##')) || ').',
      '/inventory');
  end if;
  return new;
end;
$$;
create trigger inventory_low_stock after update of quantity on public.inventory_items for each row execute function public.trg_low_stock();

-- Per-location stock is the sum of its movements.
create or replace view public.stock_by_location as
  select m.org_id, m.item_id, m.stock_location_id, sum(m.delta) as quantity
  from public.inventory_movements m
  where public.is_member(m.org_id)
  group by 1, 2, 3;
grant select on public.stock_by_location to authenticated;

-- Supplies each service uses (auto-deducted when a job completes).
create table public.service_supplies (
  service_id uuid not null references public.services(id) on delete cascade,
  item_id uuid not null references public.inventory_items(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  quantity int not null default 1 check (quantity > 0),
  primary key (service_id, item_id)
);
create trigger service_supplies_org_s before insert or update on public.service_supplies for each row execute function public.assert_same_org('services', 'service_id');
create trigger service_supplies_org_i before insert or update on public.service_supplies for each row execute function public.assert_same_org('inventory_items', 'item_id');
alter table public.service_supplies enable row level security;
create policy service_supplies_select on public.service_supplies for select using (public.is_member(org_id));
create policy service_supplies_write on public.service_supplies for all using (public.is_manager(org_id)) with check (public.is_manager(org_id));

-- Count mode: a cycle count records what was found and logs the correction.
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
  if p_counted < 0 or p_counted <> trunc(p_counted) then raise exception 'Counts are whole numbers'; end if;
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
-- Equipment & maintenance
-- ---------------------------------------------------------------------------
alter table public.equipment
  add column category text,
  add column bookable boolean not null default false,
  add column usage_hours numeric(10,1) not null default 0 check (usage_hours >= 0),
  add column warranty_expires_on date,
  add column purchase_cost numeric(12,2),
  add column assigned_user_id uuid references auth.users(id) on delete set null,
  add column assigned_label text,          -- e.g. "Van 2", "Hangar 4"
  add column location_id uuid references public.locations(id) on delete set null,
  add column branch_id uuid references public.branches(id) on delete set null,
  add column photo_path text,
  add column qr_token text not null unique default encode(gen_random_bytes(9), 'hex');
create trigger equipment_org_l before insert or update on public.equipment for each row execute function public.assert_same_org('locations', 'location_id');
create trigger equipment_org_b before insert or update on public.equipment for each row execute function public.assert_same_org('branches', 'branch_id');

create table public.equipment_maintenance (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  equipment_id uuid not null references public.equipment(id) on delete cascade,
  name text not null,                     -- e.g. "Pump oil change"
  every_days int check (every_days > 0),
  every_hours numeric(10,1) check (every_hours > 0),
  last_done_on date,
  last_done_hours numeric(10,1),
  notes text,
  created_at timestamptz not null default now(),
  check (every_days is not null or every_hours is not null)
);
create trigger equipment_maint_org before insert or update on public.equipment_maintenance for each row execute function public.assert_same_org('equipment', 'equipment_id');

create table public.equipment_service_log (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  equipment_id uuid not null references public.equipment(id) on delete cascade,
  maintenance_id uuid references public.equipment_maintenance(id) on delete set null,
  performed_on date not null default current_date,
  hours_at numeric(10,1),
  cost numeric(12,2) not null default 0 check (cost >= 0),
  vendor text,
  notes text,
  receipt_path text,
  expense_id uuid references public.expenses(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);
create trigger equipment_log_org before insert or update on public.equipment_service_log for each row execute function public.assert_same_org('equipment', 'equipment_id');

-- Logging service rolls the schedule forward and books the cost as an expense.
create or replace function public.trg_equipment_serviced()
returns trigger language plpgsql security definer set search_path = public as $$
declare e equipment;
begin
  select * into e from equipment where id = new.equipment_id;
  if new.maintenance_id is not null then
    update equipment_maintenance set last_done_on = new.performed_on, last_done_hours = coalesce(new.hours_at, e.usage_hours)
    where id = new.maintenance_id;
  end if;
  update equipment set last_serviced_on = greatest(coalesce(last_serviced_on, new.performed_on), new.performed_on),
    usage_hours = greatest(usage_hours, coalesce(new.hours_at, 0)),
    status = case when status = 'needs_service' then 'in_service' else status end
  where id = new.equipment_id;
  if new.cost > 0 and new.expense_id is null then
    insert into expenses (org_id, category, vendor, description, amount, spent_on, receipt_path, branch_id, created_by)
    values (new.org_id, 'repairs', new.vendor, 'Equipment service: ' || e.name, new.cost, new.performed_on, new.receipt_path, e.branch_id, new.created_by)
    returning id into new.expense_id;
  end if;
  return new;
end;
$$;
create trigger equipment_log_apply before insert on public.equipment_service_log for each row execute function public.trg_equipment_serviced();

create table public.equipment_files (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  equipment_id uuid not null references public.equipment(id) on delete cascade,
  kind text not null default 'other' check (kind in ('manual','warranty','receipt','photo','other')),
  title text not null,
  storage_path text not null,
  created_at timestamptz not null default now()
);
create trigger equipment_files_org before insert or update on public.equipment_files for each row execute function public.assert_same_org('equipment', 'equipment_id');

create table public.equipment_issues (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  equipment_id uuid not null references public.equipment(id) on delete cascade,
  reported_by uuid references auth.users(id) on delete set null default auth.uid(),
  description text not null check (length(trim(description)) > 0),
  photo_path text,
  status text not null default 'open' check (status in ('open','resolved')),
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);
create trigger equipment_issues_org before insert or update on public.equipment_issues for each row execute function public.assert_same_org('equipment', 'equipment_id');

create or replace function public.trg_equipment_issue()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_name text;
begin
  select name into v_name from equipment where id = new.equipment_id;
  update equipment set status = 'needs_service' where id = new.equipment_id and status = 'in_service';
  perform public.notify(new.org_id, 'managers', 'equipment_issue', 'Problem reported: ' || v_name, left(new.description, 160), '/equipment/' || new.equipment_id);
  return null;
end;
$$;
create trigger equipment_issue_notify after insert on public.equipment_issues for each row execute function public.trg_equipment_issue();

do $$
declare t text;
begin
  foreach t in array array['equipment_maintenance','equipment_service_log','equipment_files'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for select using (public.is_member(org_id))', t || '_select', t);
    execute format('create policy %I on public.%I for all using (public.is_manager(org_id)) with check (public.is_manager(org_id))', t || '_write', t);
  end loop;
end $$;
alter table public.equipment_issues enable row level security;
create policy equipment_issues_select on public.equipment_issues for select using (public.is_member(org_id));
create policy equipment_issues_insert on public.equipment_issues for insert with check (public.is_member(org_id) and reported_by = auth.uid());
create policy equipment_issues_update on public.equipment_issues for update using (public.is_manager(org_id)) with check (public.is_manager(org_id));

create or replace function public.equipment_by_qr(p_token text)
returns uuid language sql stable security definer set search_path = public as $$
  select id from equipment where qr_token = p_token and public.is_member(org_id);
$$;

-- Next due date / hours for each maintenance schedule.
create or replace view public.equipment_maintenance_due as
  select m.*, e.name as equipment_name, e.usage_hours,
    case when m.every_days is not null then coalesce(m.last_done_on, e.purchased_on, m.created_at::date) + m.every_days end as next_due_on,
    case when m.every_hours is not null then coalesce(m.last_done_hours, 0) + m.every_hours end as next_due_hours
  from public.equipment_maintenance m join public.equipment e on e.id = m.equipment_id
  where public.is_member(m.org_id);
grant select on public.equipment_maintenance_due to authenticated;

-- ---------------------------------------------------------------------------
-- Facilities: airports/FBOs, marinas and service sites
-- ---------------------------------------------------------------------------
alter table public.locations
  add column kind text not null default 'airport' check (kind in ('airport','marina','service_site')),
  add column site_type text check (site_type in ('residence','fleet_yard','dealership','shop','other')),
  add column hangar_notes text,                 -- hangar size / door clearance
  add column hangar_capacity int not null default 1 check (hangar_capacity >= 0),
  add column fees jsonb not null default '[]'::jsonb,  -- [{"name":"Ramp fee","amount":75}]
  add column photos text[] not null default '{}',
  add column active boolean not null default true;

-- Gate and access codes are only for owners and managers.
create table public.location_secrets (
  location_id uuid primary key references public.locations(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  gate_code text,
  notes text
);
create trigger location_secrets_org before insert or update on public.location_secrets for each row execute function public.assert_same_org('locations', 'location_id');
alter table public.location_secrets enable row level security;
create policy location_secrets_manager on public.location_secrets for all using (public.is_manager(org_id)) with check (public.is_manager(org_id));

-- Assets remember their usual facility (jobs inherit it in the app).
create trigger aircraft_org_l before insert or update on public.aircraft for each row execute function public.assert_same_org('locations', 'home_location_id');

-- Vendor requirements (COI, badges, registration) per facility.
create table public.facility_requirements (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete cascade,
  name text not null,                       -- "KTEB ramp badge", "$2M COI naming Signature"
  kind text not null default 'badge' check (kind in ('coi','badge','registration','training','other')),
  applies_to text not null default 'person' check (applies_to in ('company','person')),
  notes text,
  created_at timestamptz not null default now()
);
create trigger facility_req_org before insert or update on public.facility_requirements for each row execute function public.assert_same_org('locations', 'location_id');

-- Certifications & documents: per person (badges, training) or company-wide (COI).
create table public.certifications (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,      -- null = company document
  requirement_id uuid references public.facility_requirements(id) on delete set null,
  name text not null,
  kind text not null default 'badge' check (kind in ('coi','badge','registration','training','coating_cert','other')),
  issued_on date,
  expires_on date,
  document_path text,
  created_at timestamptz not null default now()
);
create index on public.certifications (org_id, user_id);
create trigger certifications_org before insert or update on public.certifications for each row execute function public.assert_same_org('facility_requirements', 'requirement_id');

do $$
declare t text;
begin
  foreach t in array array['facility_requirements','certifications'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for select using (public.is_member(org_id))', t || '_select', t);
    execute format('create policy %I on public.%I for all using (public.is_manager(org_id)) with check (public.is_manager(org_id))', t || '_write', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Crew scheduling: working hours, time off, resource holds
-- ---------------------------------------------------------------------------
create table public.crew_hours (
  org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  weekday smallint not null check (weekday between 0 and 6),   -- 0 = Sunday
  start_time time not null default '07:00',
  end_time time not null default '17:00',
  primary key (org_id, user_id, weekday),
  check (end_time > start_time)
);
alter table public.crew_hours enable row level security;
create policy crew_hours_select on public.crew_hours for select using (public.is_member(org_id));
create policy crew_hours_write on public.crew_hours for all using (public.is_manager(org_id)) with check (public.is_manager(org_id));

-- Every new team member starts with Monday–Friday, 7:00–17:00.
create or replace function public.trg_default_crew_hours()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into crew_hours (org_id, user_id, weekday)
    select new.org_id, new.user_id, d from generate_series(1, 5) d
    on conflict do nothing;
  return null;
end;
$$;
create trigger memberships_crew_hours after insert on public.memberships for each row execute function public.trg_default_crew_hours();
insert into public.crew_hours (org_id, user_id, weekday)
  select m.org_id, m.user_id, d from public.memberships m cross join generate_series(1, 5) d
  on conflict do nothing;

create table public.time_off (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  starts_on date not null,
  ends_on date not null,
  reason text,
  status text not null default 'requested' check (status in ('requested','approved','denied')),
  decided_by uuid references auth.users(id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  check (ends_on >= starts_on)
);
create index on public.time_off (org_id, starts_on);
alter table public.time_off enable row level security;
create policy time_off_select on public.time_off for select using (public.is_member(org_id));
-- Anyone can request their own time off; owners/admins add, approve or deny.
create policy time_off_request on public.time_off for insert with check (
  public.is_member(org_id) and ((user_id = auth.uid() and status = 'requested') or public.is_admin(org_id)));
create policy time_off_admin on public.time_off for update using (public.is_admin(org_id)) with check (public.is_admin(org_id));
create policy time_off_delete on public.time_off for delete using (public.is_admin(org_id) or (user_id = auth.uid() and status = 'requested'));

create or replace function public.trg_time_off_request()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_name text;
begin
  if new.status = 'requested' then
    select coalesce(display_name, 'A team member') into v_name from memberships where org_id = new.org_id and user_id = new.user_id;
    perform public.notify(new.org_id, 'owners', 'time_off', 'Time-off request',
      v_name || ': ' || to_char(new.starts_on, 'Mon DD') || case when new.ends_on > new.starts_on then ' – ' || to_char(new.ends_on, 'Mon DD') else '' end,
      '/scheduling');
  end if;
  return null;
end;
$$;
create trigger time_off_notify after insert on public.time_off for each row execute function public.trg_time_off_request();

create or replace function public.decide_time_off(p_id uuid, p_approve boolean)
returns void language plpgsql security definer set search_path = public as $$
declare r time_off;
begin
  select * into r from time_off where id = p_id;
  if not found or not public.is_admin(r.org_id) then raise exception 'Not found'; end if;
  update time_off set status = case when p_approve then 'approved' else 'denied' end, decided_by = auth.uid(), decided_at = now()
  where id = p_id;
  perform public.notify(r.org_id, 'user', 'time_off_decision',
    'Time off ' || case when p_approve then 'approved' else 'denied' end,
    to_char(r.starts_on, 'Mon DD') || case when r.ends_on > r.starts_on then ' – ' || to_char(r.ends_on, 'Mon DD') else '' end,
    '/scheduling', r.user_id);
end;
$$;

-- Holds reserve equipment or a hangar, for a job or on their own.
create table public.resource_holds (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  equipment_id uuid references public.equipment(id) on delete cascade,
  location_id uuid references public.locations(id) on delete cascade,  -- hangar at a facility
  job_id uuid references public.jobs(id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  note text,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  check (ends_at > starts_at),
  check ((equipment_id is null) <> (location_id is null))
);
create index on public.resource_holds (org_id, starts_at);
create trigger holds_org_e before insert or update on public.resource_holds for each row execute function public.assert_same_org('equipment', 'equipment_id');
create trigger holds_org_l before insert or update on public.resource_holds for each row execute function public.assert_same_org('locations', 'location_id');
create trigger holds_org_j before insert or update on public.resource_holds for each row execute function public.assert_same_org('jobs', 'job_id');
alter table public.resource_holds enable row level security;
create policy resource_holds_select on public.resource_holds for select using (public.is_member(org_id));
create policy resource_holds_write on public.resource_holds for all using (public.is_manager(org_id)) with check (public.is_manager(org_id));

-- ---------------------------------------------------------------------------
-- Conflict checking. Returns a list of problems; empty means good to book.
-- Every problem: {type, message, user_id?, equipment_id?}
-- ---------------------------------------------------------------------------
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

-- Saves a job's time, crew and reservations. Conflicts block the save unless
-- an owner/admin explicitly overrides after seeing the warning.
create or replace function public.schedule_job(
  p_job uuid, p_start timestamptz, p_end timestamptz, p_crew uuid[] default '{}', p_primary uuid default null,
  p_equipment uuid[] default '{}', p_hangar uuid default null,
  p_travel_before int default 0, p_travel_after int default 0, p_override boolean default false, p_confirm boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  j jobs;
  v_conf jsonb;
  e uuid;
begin
  select * into j from jobs where id = p_job;
  if not found or not public.is_manager(j.org_id) then raise exception 'Job not found'; end if;
  v_conf := public.schedule_conflicts(j.org_id, p_job, p_start, p_end, p_crew, p_equipment, p_hangar, p_travel_before, p_travel_after, j.location_id);
  if jsonb_array_length(v_conf) > 0 then
    if exists (select 1 from jsonb_array_elements(v_conf) c where c ->> 'type' in ('invalid','too_long')) then
      raise exception 'SCHEDULE_CONFLICT: %', (select string_agg(c ->> 'message', ' ') from jsonb_array_elements(v_conf) c where c ->> 'type' in ('invalid','too_long'));
    end if;
    if not (p_override and public.is_admin(j.org_id)) then
      raise exception 'SCHEDULE_CONFLICT: %', (select string_agg(c ->> 'message', ' ') from jsonb_array_elements(v_conf) c);
    end if;
    insert into activities (org_id, customer_id, job_id, kind, body)
      values (j.org_id, j.customer_id, j.id, 'system', 'Schedule conflict overridden: ' || (select string_agg(c ->> 'message', ' ') from jsonb_array_elements(v_conf) c));
  end if;

  update jobs set scheduled_start = p_start, scheduled_end = p_end,
    travel_before_min = coalesce(p_travel_before, 0), travel_after_min = coalesce(p_travel_after, 0),
    status = case when p_confirm and status = 'tentative' then 'scheduled' else status end
  where id = p_job;

  delete from job_assignments where job_id = p_job and not (user_id = any(coalesce(p_crew, '{}')));
  insert into job_assignments (job_id, user_id, org_id, is_primary)
    select p_job, u, j.org_id, false from unnest(coalesce(p_crew, '{}')) u
    on conflict (job_id, user_id) do nothing;
  update job_assignments set is_primary = coalesce(user_id = p_primary, false) where job_id = p_job;

  delete from resource_holds where job_id = p_job;
  foreach e in array coalesce(p_equipment, '{}') loop
    insert into resource_holds (org_id, equipment_id, job_id, starts_at, ends_at)
      values (j.org_id, e, p_job, p_start - make_interval(mins => coalesce(p_travel_before, 0)), p_end + make_interval(mins => coalesce(p_travel_after, 0)));
  end loop;
  if p_hangar is not null then
    insert into resource_holds (org_id, location_id, job_id, starts_at, ends_at) values (j.org_id, p_hangar, p_job, p_start, p_end);
  end if;
  return v_conf;
end;
$$;

-- Crew confirm their own assignment.
create or replace function public.confirm_assignment(p_job uuid, p_confirmed boolean default true)
returns void language sql security definer set search_path = public as $$
  update job_assignments set confirmed = p_confirmed where job_id = p_job and user_id = auth.uid();
$$;

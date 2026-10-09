-- =============================================================================
-- SkyShine CRM — multi-tenant schema for aircraft detailing businesses.
--
-- Every business row carries org_id. Row Level Security limits each user to the
-- organizations they belong to, and role checks hide financial data from
-- technicians. Subscription state lives on organizations and is written only
-- by server-side webhooks (RevenueCat / Stripe) through the service role.
-- =============================================================================

create extension if not exists pgcrypto;

-- -----------------------------------------------------------------------------
-- Enums
-- -----------------------------------------------------------------------------
create type public.member_role as enum ('owner', 'admin', 'manager', 'technician', 'viewer');
create type public.plan_tier as enum ('trial', 'solo', 'team', 'fleet', 'expired');
create type public.aircraft_category as enum (
  'piston_single', 'piston_twin', 'turboprop', 'very_light_jet', 'light_jet',
  'midsize_jet', 'super_midsize_jet', 'large_jet', 'airliner', 'helicopter', 'other'
);
create type public.pricing_method as enum ('flat', 'per_foot', 'per_category', 'hourly');
create type public.customer_status as enum ('lead', 'active', 'inactive');
create type public.opportunity_stage as enum ('new', 'contacted', 'quoted', 'negotiating', 'won', 'lost');
create type public.quote_status as enum ('draft', 'sent', 'viewed', 'accepted', 'declined', 'expired');
create type public.job_status as enum ('scheduled', 'in_progress', 'on_hold', 'completed', 'invoiced', 'cancelled');
create type public.job_priority as enum ('low', 'normal', 'high', 'aog');
create type public.invoice_status as enum ('draft', 'sent', 'partial', 'paid', 'overdue', 'void');
create type public.payment_method as enum ('card', 'ach', 'check', 'cash', 'wire', 'other');
create type public.photo_kind as enum ('before', 'after', 'damage', 'other');
create type public.reminder_status as enum ('upcoming', 'due', 'scheduled', 'dismissed');
create type public.activity_kind as enum ('note', 'call', 'email', 'sms', 'meeting', 'status_change', 'system');

-- -----------------------------------------------------------------------------
-- Tenancy
-- -----------------------------------------------------------------------------
create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  email text,
  phone text,
  website text,
  address text,
  logo_url text,
  timezone text not null default 'America/New_York',
  currency text not null default 'USD',
  tax_rate numeric(6,4) not null default 0 check (tax_rate >= 0 and tax_rate < 1),
  payment_terms_days int not null default 15 check (payment_terms_days >= 0),
  invoice_prefix text not null default 'INV-',
  quote_prefix text not null default 'Q-',
  job_prefix text not null default 'WO-',
  next_invoice_number int not null default 1001,
  next_quote_number int not null default 1001,
  next_job_number int not null default 1001,
  default_quote_terms text default 'Quote valid for 30 days. Pricing assumes aircraft is accessible in a hangar or on a ramp with water access.',
  default_invoice_notes text default 'Thank you for your business!',
  -- Subscription (written by revenuecat-webhook via service role only)
  plan public.plan_tier not null default 'trial',
  trial_ends_at timestamptz not null default (now() + interval '14 days'),
  plan_expires_at timestamptz,
  -- Payments (written by stripe functions via service role only)
  stripe_account_id text,
  stripe_charges_enabled boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  phone text,
  avatar_url text,
  current_org_id uuid references public.organizations(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.member_role not null default 'technician',
  display_name text,
  hourly_rate numeric(10,2),
  color text default '#2563EB',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (org_id, user_id)
);
create index on public.memberships (user_id);

create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  email text not null,
  role public.member_role not null default 'technician',
  code text not null unique default upper(substr(encode(gen_random_bytes(6), 'hex'), 1, 8)),
  invited_by uuid references auth.users(id) on delete set null,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  check (role <> 'owner')
);

create table public.push_tokens (
  token text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  platform text,
  updated_at timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- Helper functions (security definer so RLS policies can call them cheaply)
-- -----------------------------------------------------------------------------
create or replace function public.is_member(p_org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from memberships
    where org_id = p_org and user_id = auth.uid() and active
  );
$$;

create or replace function public.has_role(p_org uuid, p_roles public.member_role[])
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from memberships
    where org_id = p_org and user_id = auth.uid() and active and role = any(p_roles)
  );
$$;

-- Managers and up see money; technicians see work.
create or replace function public.is_manager(p_org uuid)
returns boolean language sql stable as $$
  select public.has_role(p_org, array['owner','admin','manager']::public.member_role[]);
$$;

create or replace function public.is_admin(p_org uuid)
returns boolean language sql stable as $$
  select public.has_role(p_org, array['owner','admin']::public.member_role[]);
$$;

-- Effective plan, accounting for trial and subscription expiry.
create or replace function public.effective_plan(p_org uuid)
returns public.plan_tier language sql stable security definer set search_path = public as $$
  select case
    when o.plan = 'trial' and o.trial_ends_at > now() then 'trial'::public.plan_tier
    when o.plan = 'trial' then 'expired'::public.plan_tier
    when o.plan in ('solo','team','fleet') and (o.plan_expires_at is null or o.plan_expires_at > now()) then o.plan
    else 'expired'::public.plan_tier
  end
  from organizations o where o.id = p_org;
$$;

-- Seat limit per plan. Trial gets Team limits so owners can evaluate everything.
create or replace function public.plan_seat_limit(p_plan public.plan_tier)
returns int language sql immutable as $$
  select case p_plan
    when 'solo' then 1
    when 'team' then 10
    when 'fleet' then 1000000
    when 'trial' then 10
    else 0
  end;
$$;

-- Paywall enforcement: block creating new business records when the plan has
-- lapsed. Reading and exporting existing data always stays available.
create or replace function public.assert_active_plan()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if public.effective_plan(new.org_id) = 'expired' then
    raise exception 'SUBSCRIPTION_REQUIRED: your plan has expired. Choose a plan to keep adding records.'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- Core CRM
-- -----------------------------------------------------------------------------
create table public.locations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  airport_code text,           -- ICAO / IATA / FAA LID, e.g. KTEB
  fbo_name text,
  address text,
  contact_phone text,
  access_notes text,           -- gate codes, badge requirements, water/power availability
  has_water boolean default true,
  has_power boolean default true,
  hangar_available boolean default false,
  latitude double precision,
  longitude double precision,
  created_at timestamptz not null default now()
);

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  kind text not null default 'owner' check (kind in ('owner','management_company','charter','flight_school','fbo','corporate','government','other')),
  name text not null,
  company text,
  email text,
  phone text,
  billing_address text,
  status public.customer_status not null default 'active',
  source text,                 -- referral, FBO, website, trade show...
  tags text[] not null default '{}',
  notes text,
  preferred_location_id uuid references public.locations(id) on delete set null,
  payment_terms_days int,
  tax_exempt boolean not null default false,
  discount_pct numeric(5,2) not null default 0 check (discount_pct between 0 and 100),
  stripe_customer_id text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.customers (org_id, name);

create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  name text not null,
  role text,                   -- owner, chief pilot, DOM, scheduler, CFO...
  email text,
  phone text,
  is_primary boolean not null default false,
  notify_sms boolean not null default false,
  created_at timestamptz not null default now()
);
create index on public.contacts (customer_id);

create table public.aircraft (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete set null,
  tail_number text not null,
  manufacturer text,
  model text,
  year int check (year between 1900 and 2100),
  serial_number text,
  category public.aircraft_category not null default 'light_jet',
  length_ft numeric(6,1) check (length_ft > 0),
  wingspan_ft numeric(6,1) check (wingspan_ft > 0),
  exterior_colors text,
  paint_condition text,
  interior_notes text,         -- leather type, carpet, wood veneer, special care
  coating_type text,           -- ceramic / wax / sealant brand
  coating_applied_on date,
  home_location_id uuid references public.locations(id) on delete set null,
  photo_path text,
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, tail_number)
);
create index on public.aircraft (customer_id);

create table public.services (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  description text,
  category text not null default 'exterior' check (category in ('exterior','interior','brightwork','coating','paint_correction','specialty','other')),
  pricing_method public.pricing_method not null default 'per_foot',
  base_price numeric(10,2) not null default 0,       -- flat price, or minimum for per_foot
  price_per_foot numeric(10,2) not null default 0,
  hourly_rate numeric(10,2) not null default 0,
  category_prices jsonb not null default '{}'::jsonb, -- {"light_jet": 650, ...}
  est_hours numeric(6,2),
  recurring_interval_days int,  -- e.g. 30 for monthly wash, 365 for ceramic refresh
  taxable boolean not null default true,
  checklist text[] not null default '{}',             -- default checklist steps copied onto jobs
  active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

-- Sales pipeline
create table public.opportunities (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete cascade,
  title text not null,
  stage public.opportunity_stage not null default 'new',
  value numeric(12,2) not null default 0,
  probability int not null default 20 check (probability between 0 and 100),
  expected_close date,
  source text,
  assigned_to uuid references auth.users(id) on delete set null,
  lost_reason text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- Quotes
-- -----------------------------------------------------------------------------
create table public.quotes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  number text not null,
  customer_id uuid not null references public.customers(id),
  aircraft_id uuid references public.aircraft(id) on delete set null,
  location_id uuid references public.locations(id) on delete set null,
  opportunity_id uuid references public.opportunities(id) on delete set null,
  status public.quote_status not null default 'draft',
  issue_date date not null default current_date,
  valid_until date not null default (current_date + 30),
  discount numeric(12,2) not null default 0 check (discount >= 0),
  tax_rate numeric(6,4) not null default 0,
  subtotal numeric(12,2) not null default 0,
  tax numeric(12,2) not null default 0,
  total numeric(12,2) not null default 0,
  notes text,
  terms text,
  public_token text not null unique default encode(gen_random_bytes(18), 'hex'),
  accepted_at timestamptz,
  accepted_name text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, number)
);

create table public.quote_items (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  quote_id uuid not null references public.quotes(id) on delete cascade,
  service_id uuid references public.services(id) on delete set null,
  description text not null,
  quantity numeric(10,2) not null default 1 check (quantity > 0),
  unit_price numeric(12,2) not null default 0,
  taxable boolean not null default true,
  sort_order int not null default 0
);
create index on public.quote_items (quote_id);

-- -----------------------------------------------------------------------------
-- Jobs / work orders
-- -----------------------------------------------------------------------------
create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  number text not null,
  title text,
  customer_id uuid not null references public.customers(id),
  aircraft_id uuid references public.aircraft(id) on delete set null,
  location_id uuid references public.locations(id) on delete set null,
  quote_id uuid references public.quotes(id) on delete set null,
  status public.job_status not null default 'scheduled',
  priority public.job_priority not null default 'normal',
  scheduled_start timestamptz,
  scheduled_end timestamptz,
  actual_start timestamptz,
  actual_end timestamptz,
  parking_spot text,           -- hangar / ramp spot
  notes text,                  -- visible to customer
  internal_notes text,         -- staff only
  weather_sensitive boolean not null default false,
  signed_by text,
  signature_svg text,          -- customer sign-off captured on device
  signed_at timestamptz,
  rating int check (rating between 1 and 5),
  feedback text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, number),
  check (scheduled_end is null or scheduled_start is null or scheduled_end >= scheduled_start)
);
create index on public.jobs (org_id, scheduled_start);
create index on public.jobs (customer_id);
create index on public.jobs (aircraft_id);

create table public.job_items (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  job_id uuid not null references public.jobs(id) on delete cascade,
  service_id uuid references public.services(id) on delete set null,
  description text not null,
  quantity numeric(10,2) not null default 1 check (quantity > 0),
  unit_price numeric(12,2) not null default 0,
  taxable boolean not null default true,
  sort_order int not null default 0
);
create index on public.job_items (job_id);

create table public.job_assignments (
  job_id uuid not null references public.jobs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  primary key (job_id, user_id)
);
create index on public.job_assignments (user_id);

create table public.job_checklist_items (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  job_id uuid not null references public.jobs(id) on delete cascade,
  label text not null,
  done boolean not null default false,
  done_by uuid references auth.users(id) on delete set null,
  done_at timestamptz,
  sort_order int not null default 0
);
create index on public.job_checklist_items (job_id);

create table public.job_photos (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  job_id uuid not null references public.jobs(id) on delete cascade,
  kind public.photo_kind not null default 'before',
  storage_path text not null,
  caption text,
  taken_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index on public.job_photos (job_id);

create table public.time_entries (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  job_id uuid references public.jobs(id) on delete set null,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  notes text,
  approved boolean not null default false,
  created_at timestamptz not null default now(),
  check (ended_at is null or ended_at >= started_at)
);
create index on public.time_entries (org_id, user_id, started_at);
-- One running clock per person per org.
create unique index time_entries_one_open on public.time_entries (org_id, user_id) where ended_at is null;

-- -----------------------------------------------------------------------------
-- Invoices & payments
-- -----------------------------------------------------------------------------
create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  number text not null,
  customer_id uuid not null references public.customers(id),
  job_id uuid references public.jobs(id) on delete set null,
  aircraft_id uuid references public.aircraft(id) on delete set null,
  status public.invoice_status not null default 'draft',
  issue_date date not null default current_date,
  due_date date not null default (current_date + 15),
  discount numeric(12,2) not null default 0 check (discount >= 0),
  tax_rate numeric(6,4) not null default 0,
  subtotal numeric(12,2) not null default 0,
  tax numeric(12,2) not null default 0,
  total numeric(12,2) not null default 0,
  amount_paid numeric(12,2) not null default 0,
  balance numeric(12,2) generated always as (total - amount_paid) stored,
  notes text,
  public_token text not null unique default encode(gen_random_bytes(18), 'hex'),
  sent_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, number)
);
create index on public.invoices (org_id, status, due_date);
create index on public.invoices (customer_id);

create table public.invoice_items (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  service_id uuid references public.services(id) on delete set null,
  description text not null,
  quantity numeric(10,2) not null default 1 check (quantity > 0),
  unit_price numeric(12,2) not null default 0,
  taxable boolean not null default true,
  sort_order int not null default 0
);
create index on public.invoice_items (invoice_id);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  amount numeric(12,2) not null check (amount > 0),
  method public.payment_method not null default 'card',
  reference text,
  received_at timestamptz not null default now(),
  stripe_payment_intent_id text unique,
  platform_fee numeric(12,2) not null default 0,
  recorded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index on public.payments (invoice_id);

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  category text not null default 'supplies' check (category in ('supplies','equipment','fuel','travel','labor','insurance','rent','marketing','software','fees','other')),
  vendor text,
  description text,
  amount numeric(12,2) not null check (amount >= 0),
  spent_on date not null default current_date,
  job_id uuid references public.jobs(id) on delete set null,
  receipt_path text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- Inventory & equipment
-- -----------------------------------------------------------------------------
create table public.inventory_items (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  sku text,
  unit text not null default 'each',
  quantity numeric(12,2) not null default 0,
  reorder_level numeric(12,2) not null default 0,
  unit_cost numeric(12,2) not null default 0,
  vendor text,
  approved_for text,           -- e.g. "AMM approved for Gulfstream", MSDS notes
  created_at timestamptz not null default now()
);

create table public.inventory_movements (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  item_id uuid not null references public.inventory_items(id) on delete cascade,
  delta numeric(12,2) not null check (delta <> 0),
  reason text not null default 'adjustment' check (reason in ('purchase','job_use','adjustment','waste')),
  job_id uuid references public.jobs(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.equipment (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  serial_number text,
  purchased_on date,
  last_serviced_on date,
  next_service_due date,
  status text not null default 'in_service' check (status in ('in_service','needs_service','out_of_service','retired')),
  notes text,
  created_at timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- Reminders, tasks, activity
-- -----------------------------------------------------------------------------
create table public.service_reminders (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  aircraft_id uuid not null references public.aircraft(id) on delete cascade,
  service_id uuid references public.services(id) on delete set null,
  title text not null,
  due_on date not null,
  interval_days int check (interval_days > 0),
  status public.reminder_status not null default 'upcoming',
  last_notified_at timestamptz,
  created_at timestamptz not null default now()
);
create index on public.service_reminders (org_id, due_on);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  title text not null,
  details text,
  due_at timestamptz,
  assigned_to uuid references auth.users(id) on delete set null,
  customer_id uuid references public.customers(id) on delete cascade,
  job_id uuid references public.jobs(id) on delete cascade,
  done boolean not null default false,
  done_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.activities (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete cascade,
  job_id uuid references public.jobs(id) on delete cascade,
  kind public.activity_kind not null default 'note',
  body text not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index on public.activities (customer_id, created_at desc);
create index on public.activities (job_id, created_at desc);

create table public.message_templates (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  channel text not null default 'email' check (channel in ('email','sms')),
  subject text,
  body text not null,
  created_at timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- updated_at triggers
-- -----------------------------------------------------------------------------
create trigger customers_updated before update on public.customers for each row execute function public.set_updated_at();
create trigger aircraft_updated before update on public.aircraft for each row execute function public.set_updated_at();
create trigger opportunities_updated before update on public.opportunities for each row execute function public.set_updated_at();
create trigger quotes_updated before update on public.quotes for each row execute function public.set_updated_at();
create trigger jobs_updated before update on public.jobs for each row execute function public.set_updated_at();
create trigger invoices_updated before update on public.invoices for each row execute function public.set_updated_at();

-- Paywall: lapsed orgs cannot create new revenue records.
create trigger customers_plan before insert on public.customers for each row execute function public.assert_active_plan();
create trigger aircraft_plan before insert on public.aircraft for each row execute function public.assert_active_plan();
create trigger quotes_plan before insert on public.quotes for each row execute function public.assert_active_plan();
create trigger jobs_plan before insert on public.jobs for each row execute function public.assert_active_plan();
create trigger invoices_plan before insert on public.invoices for each row execute function public.assert_active_plan();

-- -----------------------------------------------------------------------------
-- Child rows must belong to the same org as their parent (prevents a member of
-- org A attaching rows to org B's records by guessing ids).
-- -----------------------------------------------------------------------------
create or replace function public.assert_same_org()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  parent_table text := tg_argv[0];
  parent_col text := tg_argv[1];
  parent_id uuid;
  parent_org uuid;
begin
  execute format('select ($1).%I', parent_col) into parent_id using new;
  if parent_id is null then
    return new;
  end if;
  execute format('select org_id from public.%I where id = $1', parent_table) into parent_org using parent_id;
  if parent_org is distinct from new.org_id then
    raise exception 'Cross-organization reference to %.%', parent_table, parent_id;
  end if;
  return new;
end;
$$;

create trigger contacts_org before insert or update on public.contacts for each row execute function public.assert_same_org('customers', 'customer_id');
create trigger aircraft_org before insert or update on public.aircraft for each row execute function public.assert_same_org('customers', 'customer_id');
create trigger quotes_org_c before insert or update on public.quotes for each row execute function public.assert_same_org('customers', 'customer_id');
create trigger quotes_org_a before insert or update on public.quotes for each row execute function public.assert_same_org('aircraft', 'aircraft_id');
create trigger quote_items_org before insert or update on public.quote_items for each row execute function public.assert_same_org('quotes', 'quote_id');
create trigger jobs_org_c before insert or update on public.jobs for each row execute function public.assert_same_org('customers', 'customer_id');
create trigger jobs_org_a before insert or update on public.jobs for each row execute function public.assert_same_org('aircraft', 'aircraft_id');
create trigger job_items_org before insert or update on public.job_items for each row execute function public.assert_same_org('jobs', 'job_id');
create trigger job_assign_org before insert or update on public.job_assignments for each row execute function public.assert_same_org('jobs', 'job_id');
create trigger job_check_org before insert or update on public.job_checklist_items for each row execute function public.assert_same_org('jobs', 'job_id');
create trigger job_photos_org before insert or update on public.job_photos for each row execute function public.assert_same_org('jobs', 'job_id');
create trigger time_org before insert or update on public.time_entries for each row execute function public.assert_same_org('jobs', 'job_id');
create trigger invoices_org_c before insert or update on public.invoices for each row execute function public.assert_same_org('customers', 'customer_id');
create trigger invoices_org_j before insert or update on public.invoices for each row execute function public.assert_same_org('jobs', 'job_id');
create trigger invoice_items_org before insert or update on public.invoice_items for each row execute function public.assert_same_org('invoices', 'invoice_id');
create trigger payments_org before insert or update on public.payments for each row execute function public.assert_same_org('invoices', 'invoice_id');
create trigger movements_org before insert or update on public.inventory_movements for each row execute function public.assert_same_org('inventory_items', 'item_id');
create trigger reminders_org before insert or update on public.service_reminders for each row execute function public.assert_same_org('aircraft', 'aircraft_id');
create trigger opps_org before insert or update on public.opportunities for each row execute function public.assert_same_org('customers', 'customer_id');
create trigger activities_org_c before insert or update on public.activities for each row execute function public.assert_same_org('customers', 'customer_id');
create trigger activities_org_j before insert or update on public.activities for each row execute function public.assert_same_org('jobs', 'job_id');
create trigger tasks_org_c before insert or update on public.tasks for each row execute function public.assert_same_org('customers', 'customer_id');
create trigger tasks_org_j before insert or update on public.tasks for each row execute function public.assert_same_org('jobs', 'job_id');

-- -----------------------------------------------------------------------------
-- Totals: quotes and invoices recompute from their line items.
-- -----------------------------------------------------------------------------
create or replace function public.recalc_quote(p_quote uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_sub numeric; v_taxable numeric; v_disc numeric; v_rate numeric; v_tax numeric;
begin
  select coalesce(sum(quantity * unit_price), 0),
         coalesce(sum(quantity * unit_price) filter (where taxable), 0)
    into v_sub, v_taxable
    from quote_items where quote_id = p_quote;
  select least(discount, v_sub), tax_rate into v_disc, v_rate from quotes where id = p_quote;
  -- Discount is applied proportionally to the taxable share.
  v_tax := round(case when v_sub > 0 then (v_taxable - v_disc * v_taxable / v_sub) * v_rate else 0 end, 2);
  update quotes set subtotal = round(v_sub, 2), tax = v_tax, total = round(v_sub - v_disc + v_tax, 2)
   where id = p_quote;
end;
$$;

create or replace function public.recalc_invoice(p_invoice uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_sub numeric; v_taxable numeric; v_disc numeric; v_rate numeric; v_tax numeric; v_paid numeric; v_total numeric;
begin
  select coalesce(sum(quantity * unit_price), 0),
         coalesce(sum(quantity * unit_price) filter (where taxable), 0)
    into v_sub, v_taxable
    from invoice_items where invoice_id = p_invoice;
  select least(discount, v_sub), tax_rate into v_disc, v_rate from invoices where id = p_invoice;
  v_tax := round(case when v_sub > 0 then (v_taxable - v_disc * v_taxable / v_sub) * v_rate else 0 end, 2);
  v_total := round(v_sub - v_disc + v_tax, 2);
  select coalesce(sum(amount), 0) into v_paid from payments where invoice_id = p_invoice;
  update invoices set
    subtotal = round(v_sub, 2),
    tax = v_tax,
    total = v_total,
    amount_paid = v_paid,
    status = case
      when status in ('void') then status
      when v_paid >= v_total and v_total > 0 then 'paid'
      when v_paid > 0 then 'partial'
      when status in ('paid','partial') then 'sent'
      else status
    end
   where id = p_invoice;
end;
$$;

create or replace function public.trg_quote_items_recalc()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.recalc_quote(coalesce(new.quote_id, old.quote_id));
  return null;
end;
$$;
create trigger quote_items_recalc after insert or update or delete on public.quote_items
  for each row execute function public.trg_quote_items_recalc();

create or replace function public.trg_quote_header_recalc()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.discount is distinct from old.discount or new.tax_rate is distinct from old.tax_rate then
    perform public.recalc_quote(new.id);
  end if;
  return null;
end;
$$;
create trigger quotes_header_recalc after update on public.quotes
  for each row execute function public.trg_quote_header_recalc();

create or replace function public.trg_invoice_items_recalc()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.recalc_invoice(coalesce(new.invoice_id, old.invoice_id));
  return null;
end;
$$;
create trigger invoice_items_recalc after insert or update or delete on public.invoice_items
  for each row execute function public.trg_invoice_items_recalc();

create or replace function public.trg_payments_recalc()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.recalc_invoice(coalesce(new.invoice_id, old.invoice_id));
  return null;
end;
$$;
create trigger payments_recalc after insert or update or delete on public.payments
  for each row execute function public.trg_payments_recalc();

create or replace function public.trg_invoice_header_recalc()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.discount is distinct from old.discount or new.tax_rate is distinct from old.tax_rate then
    perform public.recalc_invoice(new.id);
  end if;
  return null;
end;
$$;
create trigger invoices_header_recalc after update on public.invoices
  for each row execute function public.trg_invoice_header_recalc();

-- Inventory quantity follows its movements.
create or replace function public.trg_inventory_apply()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    update inventory_items set quantity = quantity + new.delta where id = new.item_id;
  elsif tg_op = 'DELETE' then
    update inventory_items set quantity = quantity - old.delta where id = old.item_id;
  end if;
  return null;
end;
$$;
create trigger inventory_apply after insert or delete on public.inventory_movements
  for each row execute function public.trg_inventory_apply();

-- -----------------------------------------------------------------------------
-- Document numbering (atomic per org)
-- -----------------------------------------------------------------------------
create or replace function public.next_number(p_org uuid, p_kind text)
returns text language plpgsql security definer set search_path = public as $$
declare
  v text;
begin
  if not public.is_member(p_org) then
    raise exception 'Not a member of this organization';
  end if;
  if p_kind = 'invoice' then
    update organizations set next_invoice_number = next_invoice_number + 1 where id = p_org
      returning invoice_prefix || (next_invoice_number - 1) into v;
  elsif p_kind = 'quote' then
    update organizations set next_quote_number = next_quote_number + 1 where id = p_org
      returning quote_prefix || (next_quote_number - 1) into v;
  elsif p_kind = 'job' then
    update organizations set next_job_number = next_job_number + 1 where id = p_org
      returning job_prefix || (next_job_number - 1) into v;
  else
    raise exception 'Unknown document kind %', p_kind;
  end if;
  return v;
end;
$$;

-- -----------------------------------------------------------------------------
-- Onboarding / team RPCs
-- -----------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end;
$$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.create_organization(p_name text, p_seed_services boolean default true)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_org uuid;
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  insert into organizations (name) values (p_name) returning id into v_org;
  insert into memberships (org_id, user_id, role, display_name)
    select v_org, v_uid, 'owner', p.full_name from profiles p where p.id = v_uid;
  if not found then
    insert into memberships (org_id, user_id, role) values (v_org, v_uid, 'owner');
  end if;
  update profiles set current_org_id = v_org where id = v_uid;
  if p_seed_services then
    perform public.seed_default_services(v_org);
  end if;
  return v_org;
end;
$$;

-- Starter price book based on common aircraft detailing menus. Every price is
-- editable; these just save new customers from a blank screen.
create or replace function public.seed_default_services(p_org uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into services (org_id, name, category, pricing_method, base_price, price_per_foot, est_hours, recurring_interval_days, sort_order, checklist, description) values
  (p_org, 'Exterior Wash', 'exterior', 'per_foot', 150, 9, 2, 30, 1,
     array['Walk-around & pre-existing damage photos','Cover pitot/static ports & sensors','Pre-rinse & foam','Hand wash fuselage, wings, empennage','Clean gear wells & belly','Dry & spot-free rinse','Remove covers, final walk-around photos'],
     'Full hand wash of fuselage, wings, empennage and belly.'),
  (p_org, 'Dry Wash (Waterless)', 'exterior', 'per_foot', 125, 8, 2, 30, 2,
     array['Walk-around photos','Apply dry-wash product by section','Microfiber buff','Final inspection photos'],
     'Waterless wash for ramps without water access.'),
  (p_org, 'Belly & Gear Degrease', 'exterior', 'per_foot', 100, 4, 1.5, null, 3,
     array['Mask brakes & sensors','Apply approved degreaser','Agitate & rinse','Inspect & photograph'],
     'Remove exhaust soot, hydraulic fluid and grime from belly and gear wells.'),
  (p_org, 'Brightwork Polish', 'brightwork', 'per_category', 300, 0, 4, 90, 4,
     array['Mask adjacent paint','Polish leading edges','Polish engine inlets/cowl lips','Wipe residue','Photos'],
     'Polish leading edges, inlets and other bare-metal surfaces.'),
  (p_org, 'Wax / Sealant', 'coating', 'per_foot', 250, 12, 4, 90, 5,
     array['Wash prerequisite confirmed','Apply sealant by panel','Buff off','Final photos'],
     'Protective wax or polymer sealant applied after wash.'),
  (p_org, 'Ceramic Coating', 'coating', 'per_foot', 1500, 60, 16, 365, 6,
     array['Decontamination wash','Clay & iron removal','Panel wipe','Apply coating by section','Cure check','Customer care briefing'],
     'Multi-year ceramic coating for gloss and easier cleaning.'),
  (p_org, 'Paint Correction', 'paint_correction', 'hourly', 0, 0, 12, null, 7,
     array['Paint depth readings','Test spot','Compound','Polish','IPA wipe & inspect'],
     'Machine compound and polish to remove oxidation and swirls.'),
  (p_org, 'Interior Detail', 'interior', 'per_category', 350, 0, 4, 30, 8,
     array['Remove trash & loose items','Vacuum carpets & seats','Clean & condition leather','Wipe cabinetry & veneer','Clean lav & galley','Glass & windows','Final photos'],
     'Full cabin clean including leather, carpet, galley and lav.'),
  (p_org, 'Carpet Extraction', 'interior', 'per_category', 250, 0, 3, 180, 9,
     array['Pre-vacuum','Pre-treat stains','Hot-water extraction','Groom & dry'],
     'Hot-water extraction of cabin carpets and runners.'),
  (p_org, 'Leather Deep Clean & Condition', 'interior', 'per_category', 200, 0, 2, 90, 10,
     array['Test spot','Clean seats & panels','Condition','Buff'],
     'Deep clean and condition all leather surfaces.'),
  (p_org, 'De-Ice Boot Treatment', 'specialty', 'per_category', 150, 0, 1, 180, 11,
     array['Clean boots','Apply approved treatment','Buff'],
     'Clean and treat pneumatic de-ice boots.'),
  (p_org, 'Windshield & Windows Treatment', 'specialty', 'flat', 95, 0, 0.5, 60, 12,
     array['Clean','Apply approved treatment','Buff clear'],
     'Clean and treat windshields with manufacturer-approved products.');

  -- Sensible per-category defaults for category-priced services.
  update services set category_prices = jsonb_build_object(
    'piston_single', base_price * 0.5, 'piston_twin', base_price * 0.75,
    'turboprop', base_price, 'very_light_jet', base_price * 1.1, 'light_jet', base_price * 1.3,
    'midsize_jet', base_price * 1.7, 'super_midsize_jet', base_price * 2.1,
    'large_jet', base_price * 3, 'airliner', base_price * 6, 'helicopter', base_price * 0.8)
  where org_id = p_org and pricing_method = 'per_category';
  update services set hourly_rate = 95 where org_id = p_org and pricing_method = 'hourly';
end;
$$;

create or replace function public.invite_member(p_org uuid, p_email text, p_role public.member_role)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_code text;
  v_seats int;
begin
  if not public.is_admin(p_org) then raise exception 'Only owners and admins can invite'; end if;
  if p_role = 'owner' then raise exception 'Cannot invite another owner'; end if;
  select count(*) into v_seats from memberships where org_id = p_org and active;
  if v_seats >= public.plan_seat_limit(public.effective_plan(p_org)) then
    raise exception 'SEAT_LIMIT: upgrade your plan to add more team members';
  end if;
  insert into invitations (org_id, email, role, invited_by)
    values (p_org, lower(trim(p_email)), p_role, auth.uid())
    returning code into v_code;
  return v_code;
end;
$$;

create or replace function public.accept_invitation(p_code text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_inv invitations;
  v_uid uuid := auth.uid();
  v_seats int;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  select * into v_inv from invitations
    where code = upper(trim(p_code)) and accepted_at is null
    for update;
  if not found then raise exception 'Invitation code is invalid or already used'; end if;
  select count(*) into v_seats from memberships where org_id = v_inv.org_id and active;
  if v_seats >= public.plan_seat_limit(public.effective_plan(v_inv.org_id)) then
    raise exception 'SEAT_LIMIT: this team is full. Ask the owner to upgrade.';
  end if;
  insert into memberships (org_id, user_id, role, display_name)
    select v_inv.org_id, v_uid, v_inv.role, p.full_name from profiles p where p.id = v_uid
    on conflict (org_id, user_id) do update set active = true, role = excluded.role;
  update invitations set accepted_at = now() where id = v_inv.id;
  update profiles set current_org_id = v_inv.org_id where id = v_uid;
  return v_inv.org_id;
end;
$$;

-- Lets any member rename themselves without granting update on their own
-- membership row (which would let them change their role).
create or replace function public.set_my_display_name(p_name text)
returns void language sql security definer set search_path = public as $$
  update memberships set display_name = nullif(trim(p_name), '') where user_id = auth.uid();
$$;

-- -----------------------------------------------------------------------------
-- Workflow RPCs
-- -----------------------------------------------------------------------------
create or replace function public.convert_quote_to_job(p_quote uuid, p_start timestamptz default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  q quotes;
  v_job uuid;
begin
  select * into q from quotes where id = p_quote;
  if not found or not public.is_manager(q.org_id) then raise exception 'Quote not found'; end if;
  insert into jobs (org_id, number, customer_id, aircraft_id, location_id, quote_id, scheduled_start, scheduled_end, notes, created_by, title)
  values (q.org_id, public.next_number(q.org_id, 'job'), q.customer_id, q.aircraft_id, q.location_id, q.id,
          p_start, p_start + interval '4 hours', q.notes, auth.uid(),
          (select string_agg(description, ', ' order by sort_order) from quote_items where quote_id = q.id))
  returning id into v_job;
  insert into job_items (org_id, job_id, service_id, description, quantity, unit_price, taxable, sort_order)
    select org_id, v_job, service_id, description, quantity, unit_price, taxable, sort_order
    from quote_items where quote_id = q.id;
  -- Copy each service's default checklist onto the job.
  insert into job_checklist_items (org_id, job_id, label, sort_order)
    select q.org_id, v_job, step, (qi.sort_order * 100 + ord)::int
    from quote_items qi
    join services s on s.id = qi.service_id
    cross join lateral unnest(s.checklist) with ordinality as t(step, ord)
    where qi.quote_id = q.id;
  update quotes set status = 'accepted', accepted_at = coalesce(accepted_at, now()) where id = q.id;
  return v_job;
end;
$$;

create or replace function public.create_invoice_from_job(p_job uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  j jobs;
  o organizations;
  c customers;
  v_inv uuid;
  v_disc numeric;
begin
  select * into j from jobs where id = p_job;
  if not found or not public.is_manager(j.org_id) then raise exception 'Job not found'; end if;
  select * into o from organizations where id = j.org_id;
  select * into c from customers where id = j.customer_id;
  insert into invoices (org_id, number, customer_id, job_id, aircraft_id, tax_rate, due_date, notes, created_by)
  values (j.org_id, public.next_number(j.org_id, 'invoice'), j.customer_id, j.id, j.aircraft_id,
          case when c.tax_exempt then 0 else o.tax_rate end,
          current_date + coalesce(c.payment_terms_days, o.payment_terms_days),
          o.default_invoice_notes, auth.uid())
  returning id into v_inv;
  insert into invoice_items (org_id, invoice_id, service_id, description, quantity, unit_price, taxable, sort_order)
    select org_id, v_inv, service_id, description, quantity, unit_price, taxable, sort_order
    from job_items where job_id = j.id;
  -- Customer-level standing discount
  select round(subtotal * c.discount_pct / 100, 2) into v_disc from invoices where id = v_inv;
  if v_disc > 0 then
    update invoices set discount = v_disc where id = v_inv;
  end if;
  update jobs set status = 'invoiced' where id = j.id and status in ('completed','in_progress','scheduled','on_hold');
  return v_inv;
end;
$$;

-- When a job completes, roll forward recurring service reminders for its aircraft.
create or replace function public.trg_job_completed()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'completed' and old.status is distinct from 'completed' then
    new.actual_end := coalesce(new.actual_end, now());
    if new.aircraft_id is not null then
      insert into service_reminders (org_id, aircraft_id, service_id, title, due_on, interval_days)
      select new.org_id, new.aircraft_id, s.id, s.name,
             current_date + s.recurring_interval_days, s.recurring_interval_days
      from job_items ji join services s on s.id = ji.service_id
      where ji.job_id = new.id and s.recurring_interval_days is not null
        and not exists (
          select 1 from service_reminders r
          where r.aircraft_id = new.aircraft_id and r.service_id = s.id and r.status in ('upcoming','due')
        );
      -- Close out reminders this job satisfied.
      update service_reminders r set status = 'dismissed'
      where r.aircraft_id = new.aircraft_id and r.status in ('due','scheduled')
        and r.service_id in (select service_id from job_items where job_id = new.id);
    end if;
  end if;
  if new.status = 'in_progress' and old.status is distinct from 'in_progress' then
    new.actual_start := coalesce(new.actual_start, now());
  end if;
  return new;
end;
$$;
create trigger jobs_status_change before update of status on public.jobs
  for each row execute function public.trg_job_completed();

-- -----------------------------------------------------------------------------
-- Reporting
-- -----------------------------------------------------------------------------
create or replace function public.dashboard_stats(p_org uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v jsonb;
  v_fin boolean := public.is_manager(p_org);
begin
  if not public.is_member(p_org) then raise exception 'Not a member'; end if;
  select jsonb_build_object(
    'jobs_today', (select count(*) from jobs where org_id = p_org and status not in ('cancelled')
                     and scheduled_start::date = current_date),
    'jobs_in_progress', (select count(*) from jobs where org_id = p_org and status = 'in_progress'),
    'jobs_this_week', (select count(*) from jobs where org_id = p_org and status not in ('cancelled')
                     and scheduled_start >= date_trunc('week', now()) and scheduled_start < date_trunc('week', now()) + interval '7 days'),
    'open_quotes', (select count(*) from quotes where org_id = p_org and status in ('draft','sent','viewed')),
    'reminders_due', (select count(*) from service_reminders where org_id = p_org and status in ('upcoming','due') and due_on <= current_date + 14),
    'low_stock', (select count(*) from inventory_items where org_id = p_org and quantity <= reorder_level),
    'customers', (select count(*) from customers where org_id = p_org and status <> 'inactive'),
    'aircraft', (select count(*) from aircraft where org_id = p_org and active),
    'revenue_mtd', case when v_fin then (select coalesce(sum(amount), 0) from payments where org_id = p_org and received_at >= date_trunc('month', now())) end,
    'revenue_last_month', case when v_fin then (select coalesce(sum(amount), 0) from payments where org_id = p_org
                     and received_at >= date_trunc('month', now()) - interval '1 month' and received_at < date_trunc('month', now())) end,
    'outstanding', case when v_fin then (select coalesce(sum(balance), 0) from invoices where org_id = p_org and status in ('sent','partial','overdue')) end,
    'overdue', case when v_fin then (select coalesce(sum(balance), 0) from invoices where org_id = p_org and status in ('sent','partial','overdue') and due_date < current_date) end,
    'pipeline_value', case when v_fin then (select coalesce(sum(value * probability / 100.0), 0) from opportunities where org_id = p_org and stage not in ('won','lost')) end
  ) into v;
  return v;
end;
$$;

create or replace function public.report_summary(p_org uuid, p_from date, p_to date)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_manager(p_org) then raise exception 'Managers only'; end if;
  return jsonb_build_object(
    'revenue', (select coalesce(sum(amount), 0) from payments where org_id = p_org and received_at::date between p_from and p_to),
    'platform_fees', (select coalesce(sum(platform_fee), 0) from payments where org_id = p_org and received_at::date between p_from and p_to),
    'invoiced', (select coalesce(sum(total), 0) from invoices where org_id = p_org and status <> 'void' and issue_date between p_from and p_to),
    'expenses', (select coalesce(sum(amount), 0) from expenses where org_id = p_org and spent_on between p_from and p_to),
    'jobs_completed', (select count(*) from jobs where org_id = p_org and status in ('completed','invoiced') and coalesce(actual_end, scheduled_end)::date between p_from and p_to),
    'avg_rating', (select round(avg(rating)::numeric, 2) from jobs where org_id = p_org and rating is not null and coalesce(actual_end, scheduled_end)::date between p_from and p_to),
    'hours_logged', (select round(coalesce(sum(extract(epoch from (coalesce(ended_at, now()) - started_at)) / 3600), 0)::numeric, 1)
                      from time_entries where org_id = p_org and started_at::date between p_from and p_to),
    'quote_win_rate', (select case when count(*) filter (where status in ('accepted','declined')) = 0 then null
                         else round(100.0 * count(*) filter (where status = 'accepted') / count(*) filter (where status in ('accepted','declined')), 1) end
                       from quotes where org_id = p_org and issue_date between p_from and p_to),
    'by_service', (select coalesce(jsonb_agg(x order by x.revenue desc), '[]'::jsonb) from (
                     select ii.description as name, round(sum(ii.quantity * ii.unit_price), 2) as revenue, count(*) as count
                     from invoice_items ii join invoices i on i.id = ii.invoice_id
                     where i.org_id = p_org and i.status <> 'void' and i.issue_date between p_from and p_to
                     group by ii.description limit 10) x),
    'top_customers', (select coalesce(jsonb_agg(x order by x.revenue desc), '[]'::jsonb) from (
                     select c.name, round(sum(i.total), 2) as revenue
                     from invoices i join customers c on c.id = i.customer_id
                     where i.org_id = p_org and i.status <> 'void' and i.issue_date between p_from and p_to
                     group by c.name order by 2 desc limit 10) x),
    'by_month', (select coalesce(jsonb_agg(x order by x.month), '[]'::jsonb) from (
                     select to_char(date_trunc('month', received_at), 'YYYY-MM') as month, round(sum(amount), 2) as revenue
                     from payments where org_id = p_org and received_at::date between p_from and p_to
                     group by 1) x),
    'expenses_by_category', (select coalesce(jsonb_agg(x order by x.amount desc), '[]'::jsonb) from (
                     select category, round(sum(amount), 2) as amount
                     from expenses where org_id = p_org and spent_on between p_from and p_to
                     group by category) x),
    'technician_hours', (select coalesce(jsonb_agg(x order by x.hours desc), '[]'::jsonb) from (
                     select coalesce(m.display_name, 'Unknown') as name,
                            round(sum(extract(epoch from (coalesce(t.ended_at, now()) - t.started_at)) / 3600)::numeric, 1) as hours
                     from time_entries t left join memberships m on m.user_id = t.user_id and m.org_id = t.org_id
                     where t.org_id = p_org and t.started_at::date between p_from and p_to
                     group by 1) x)
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- Public (unauthenticated) documents for customers, via unguessable token.
-- -----------------------------------------------------------------------------
create or replace function public.get_public_document(p_kind text, p_token text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v jsonb;
begin
  if p_kind = 'quote' then
    update quotes set status = 'viewed' where public_token = p_token and status = 'sent';
    select jsonb_build_object(
      'kind', 'quote', 'doc', to_jsonb(q) - 'public_token' - 'created_by',
      'items', (select coalesce(jsonb_agg(to_jsonb(i) order by i.sort_order), '[]') from quote_items i where i.quote_id = q.id),
      'org', jsonb_build_object('name', o.name, 'email', o.email, 'phone', o.phone, 'address', o.address, 'logo_url', o.logo_url, 'currency', o.currency),
      'customer', jsonb_build_object('name', c.name, 'company', c.company, 'email', c.email, 'billing_address', c.billing_address),
      'aircraft', (select jsonb_build_object('tail_number', a.tail_number, 'model', concat_ws(' ', a.manufacturer, a.model)) from aircraft a where a.id = q.aircraft_id)
    ) into v
    from quotes q join organizations o on o.id = q.org_id join customers c on c.id = q.customer_id
    where q.public_token = p_token;
  elsif p_kind = 'invoice' then
    select jsonb_build_object(
      'kind', 'invoice', 'doc', to_jsonb(i) - 'public_token' - 'created_by',
      'items', (select coalesce(jsonb_agg(to_jsonb(x) order by x.sort_order), '[]') from invoice_items x where x.invoice_id = i.id),
      'org', jsonb_build_object('name', o.name, 'email', o.email, 'phone', o.phone, 'address', o.address, 'logo_url', o.logo_url,
                                'currency', o.currency, 'accepts_cards', o.stripe_charges_enabled),
      'customer', jsonb_build_object('name', c.name, 'company', c.company, 'email', c.email, 'billing_address', c.billing_address),
      'aircraft', (select jsonb_build_object('tail_number', a.tail_number, 'model', concat_ws(' ', a.manufacturer, a.model)) from aircraft a where a.id = i.aircraft_id)
    ) into v
    from invoices i join organizations o on o.id = i.org_id join customers c on c.id = i.customer_id
    where i.public_token = p_token and i.status <> 'draft';
  end if;
  return v;
end;
$$;

create or replace function public.accept_public_quote(p_token text, p_name text)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if coalesce(length(trim(p_name)), 0) < 2 then raise exception 'Please type your full name to accept'; end if;
  update quotes set status = 'accepted', accepted_at = now(), accepted_name = trim(p_name)
    where public_token = p_token and status in ('sent','viewed') and valid_until >= current_date;
  if not found then return false; end if;
  insert into activities (org_id, customer_id, kind, body)
    select org_id, customer_id, 'system', 'Quote ' || number || ' accepted online by ' || trim(p_name)
    from quotes where public_token = p_token;
  return true;
end;
$$;

-- -----------------------------------------------------------------------------
-- Account deletion (required by App Store guideline 5.1.1(v))
-- -----------------------------------------------------------------------------
create or replace function public.delete_my_account()
returns void language plpgsql security definer set search_path = public, auth as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  -- Orgs where this user is the only owner are deleted with all their data.
  delete from organizations o
   where exists (select 1 from memberships m where m.org_id = o.id and m.user_id = v_uid and m.role = 'owner')
     and not exists (select 1 from memberships m where m.org_id = o.id and m.user_id <> v_uid and m.role = 'owner' and m.active);
  delete from auth.users where id = v_uid;
end;
$$;

-- -----------------------------------------------------------------------------
-- Row Level Security
-- -----------------------------------------------------------------------------
alter table public.organizations enable row level security;
alter table public.profiles enable row level security;
alter table public.memberships enable row level security;
alter table public.invitations enable row level security;
alter table public.push_tokens enable row level security;

create policy org_select on public.organizations for select using (public.is_member(id));
-- Admins edit business details; plan/stripe columns are protected by the column grant below.
create policy org_update on public.organizations for update using (public.is_admin(id)) with check (public.is_admin(id));
revoke update on public.organizations from authenticated;
grant update (name, email, phone, website, address, logo_url, timezone, currency, tax_rate, payment_terms_days,
              invoice_prefix, quote_prefix, job_prefix, default_quote_terms, default_invoice_notes)
  on public.organizations to authenticated;

create policy profiles_self on public.profiles for all using (id = auth.uid()) with check (id = auth.uid());
create policy profiles_teammates on public.profiles for select using (
  exists (select 1 from memberships a join memberships b on a.org_id = b.org_id
          where a.user_id = auth.uid() and b.user_id = profiles.id)
);

create policy memberships_select on public.memberships for select using (public.is_member(org_id));
create policy memberships_admin_update on public.memberships for update
  using (public.is_admin(org_id) and role <> 'owner')
  with check (public.is_admin(org_id) and role <> 'owner');
create policy memberships_admin_delete on public.memberships for delete
  using (public.is_admin(org_id) and role <> 'owner');

create policy invitations_admin on public.invitations for all using (public.is_admin(org_id)) with check (public.is_admin(org_id));

create policy push_tokens_self on public.push_tokens for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Operational tables: any active member can read & write.
do $$
declare t text;
begin
  foreach t in array array[
    'locations','customers','contacts','aircraft','job_checklist_items','job_photos','job_assignments',
    'activities','tasks','service_reminders','inventory_items','inventory_movements','equipment','message_templates'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for select using (public.is_member(org_id))', t || '_select', t);
    execute format('create policy %I on public.%I for insert with check (public.is_member(org_id) and not public.has_role(org_id, array[''viewer'']::public.member_role[]))', t || '_insert', t);
    execute format('create policy %I on public.%I for update using (public.is_member(org_id) and not public.has_role(org_id, array[''viewer'']::public.member_role[])) with check (public.is_member(org_id))', t || '_update', t);
    execute format('create policy %I on public.%I for delete using (public.is_manager(org_id))', t || '_delete', t);
  end loop;
end $$;

-- Jobs: everyone reads; technicians may update (status, checklist, notes) but only managers create/delete.
alter table public.jobs enable row level security;
alter table public.job_items enable row level security;
create policy jobs_select on public.jobs for select using (public.is_member(org_id));
create policy jobs_insert on public.jobs for insert with check (public.is_manager(org_id));
create policy jobs_update on public.jobs for update using (public.is_member(org_id) and not public.has_role(org_id, array['viewer']::public.member_role[])) with check (public.is_member(org_id));
create policy jobs_delete on public.jobs for delete using (public.is_manager(org_id));
create policy job_items_select on public.job_items for select using (public.is_member(org_id));
create policy job_items_write on public.job_items for all using (public.is_manager(org_id)) with check (public.is_manager(org_id));

-- Time: members manage their own entries; managers manage everyone's.
alter table public.time_entries enable row level security;
create policy time_select on public.time_entries for select using (user_id = auth.uid() or public.is_manager(org_id));
create policy time_insert on public.time_entries for insert with check (public.is_member(org_id) and (user_id = auth.uid() or public.is_manager(org_id)));
create policy time_update on public.time_entries for update using (
  (user_id = auth.uid() and not approved) or public.is_manager(org_id)) with check (public.is_member(org_id));
create policy time_delete on public.time_entries for delete using (public.is_manager(org_id));

-- Money & sales: managers and up only.
do $$
declare t text;
begin
  foreach t in array array['services','opportunities','quotes','quote_items','invoices','invoice_items','payments','expenses'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for all using (public.is_manager(org_id)) with check (public.is_manager(org_id))', t || '_manager', t);
  end loop;
end $$;
-- Technicians still need to see the service menu (names, checklists) to work jobs.
create policy services_member_read on public.services for select using (public.is_member(org_id));

-- RPC access
revoke execute on function public.get_public_document(text, text) from public;
revoke execute on function public.accept_public_quote(text, text) from public;
grant execute on function public.get_public_document(text, text) to anon, authenticated;
grant execute on function public.accept_public_quote(text, text) to anon, authenticated;
revoke execute on function public.seed_default_services(uuid) from public, anon, authenticated;
revoke execute on function public.recalc_quote(uuid) from public, anon, authenticated;
revoke execute on function public.recalc_invoice(uuid) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Storage: one private bucket, objects namespaced by org id: "<org_id>/..."
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public) values ('org-files', 'org-files', false)
  on conflict (id) do nothing;

create policy org_files_read on storage.objects for select to authenticated
  using (bucket_id = 'org-files' and public.is_member(((storage.foldername(name))[1])::uuid));
create policy org_files_write on storage.objects for insert to authenticated
  with check (bucket_id = 'org-files' and public.is_member(((storage.foldername(name))[1])::uuid));
create policy org_files_update on storage.objects for update to authenticated
  using (bucket_id = 'org-files' and public.is_member(((storage.foldername(name))[1])::uuid));
create policy org_files_delete on storage.objects for delete to authenticated
  using (bucket_id = 'org-files' and public.is_manager(((storage.foldername(name))[1])::uuid));

-- Realtime for live schedule / job boards.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.jobs, public.job_checklist_items, public.time_entries;
  end if;
end $$;

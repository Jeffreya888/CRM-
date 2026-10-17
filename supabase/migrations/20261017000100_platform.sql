-- =============================================================================
-- Platform: business types, company branches, role permissions, pay privacy,
-- aircraft catalog + price guide, service guides, demo workspaces, audit log,
-- platform admin and support messages.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Organization settings
-- ---------------------------------------------------------------------------
alter table public.organizations
  add column business_types text[] not null default '{aircraft}',
  add column google_review_url text,
  add column auto_send_invoices boolean not null default false,
  add column payment_mode text not null default 'stripe' check (payment_mode in ('stripe','direct')),
  add column role_permissions jsonb not null default '{
    "manager":    {"see_prices": true,  "see_reports": false, "edit_customers": true,  "approve_timesheets": true,  "give_discounts": true,  "delete_records": false},
    "technician": {"see_prices": false, "see_reports": false, "edit_customers": false, "approve_timesheets": false, "give_discounts": false, "delete_records": false}
  }'::jsonb,
  add column is_demo boolean not null default false,
  add column demo_expires_at timestamptz,
  add column billing_period text check (billing_period in ('monthly','annual')),
  add column accountant_email text,
  add column tax_set_aside_pct numeric(5,2) not null default 25 check (tax_set_aside_pct between 0 and 100),
  add column mileage_rate numeric(6,3) not null default 0.70 check (mileage_rate >= 0),
  add column pay_period_cadence text not null default 'biweekly' check (pay_period_cadence in ('weekly','biweekly','semimonthly')),
  add column pay_period_anchor date not null default date '2026-01-05',
  add column sms_enabled boolean not null default false,
  add column sms_number text,
  add column sms_status text not null default 'not_requested' check (sms_status in ('not_requested','pending','active','suspended')),
  add column sms_extra_credits int not null default 0,
  add column quiet_hours_start int not null default 8 check (quiet_hours_start between 0 and 23),
  add column quiet_hours_end int not null default 20 check (quiet_hours_end between 1 and 24),
  add column require_2fa boolean not null default false,
  add column price_adjust_pct numeric(6,2) not null default 0 check (price_adjust_pct between -50 and 200),
  add column public_slug text not null unique default lower(substr(encode(gen_random_bytes(6), 'hex'), 1, 10)),
  add constraint org_business_types check (
    business_types <@ array['aircraft','vehicle','watercraft'] and 'aircraft' = any(business_types));

grant update (business_types, google_review_url, auto_send_invoices, payment_mode, accountant_email,
              tax_set_aside_pct, mileage_rate, pay_period_cadence, pay_period_anchor, sms_enabled,
              quiet_hours_start, quiet_hours_end, require_2fa, price_adjust_pct)
  on public.organizations to authenticated;

-- ---------------------------------------------------------------------------
-- Plans & features (mirrors src/lib/plans.ts). The trial unlocks everything so
-- owners can evaluate Fleet features; seat limits still apply.
-- ---------------------------------------------------------------------------
create or replace function public.plan_allows(p_org uuid, p_feature text)
returns boolean language sql stable security definer set search_path = public as $$
  select case public.effective_plan(p_org)
    when 'trial' then true
    when 'fleet' then true
    when 'team' then p_feature not in ('branches','integrations','stock_locations')
    when 'solo' then p_feature not in ('branches','integrations','stock_locations','team','timesheet_approvals')
    else false
  end;
$$;

-- ---------------------------------------------------------------------------
-- Role permissions. Owners and admins can do everything; viewers are
-- read-only and never see money; managers and technicians follow the
-- company's toggles (owner-editable).
-- ---------------------------------------------------------------------------
create or replace function public.has_perm(p_org uuid, p_perm text)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((
    select case
      when m.role in ('owner','admin') then true
      when m.role = 'viewer' then false
      else coalesce((o.role_permissions -> m.role::text ->> p_perm)::boolean, false)
    end
    from memberships m join organizations o on o.id = m.org_id
    where m.org_id = p_org and m.user_id = auth.uid() and m.active
  ), false);
$$;

create or replace function public.can_money(p_org uuid)
returns boolean language sql stable as $$
  select public.has_perm(p_org, 'see_prices');
$$;

create or replace function public.is_owner(p_org uuid)
returns boolean language sql stable as $$
  select public.has_role(p_org, array['owner']::public.member_role[]);
$$;

create or replace function public.set_role_permissions(p_org uuid, p_perms jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_clean jsonb := '{}'::jsonb;
  r text; k text;
  keys text[] := array['see_prices','see_reports','edit_customers','approve_timesheets','give_discounts','delete_records'];
begin
  if not public.is_owner(p_org) then raise exception 'Only the company owner can change permissions'; end if;
  foreach r in array array['manager','technician'] loop
    v_clean := v_clean || jsonb_build_object(r, '{}'::jsonb);
    foreach k in array keys loop
      v_clean := jsonb_set(v_clean, array[r, k], to_jsonb(coalesce((p_perms -> r ->> k)::boolean, false)));
    end loop;
  end loop;
  update organizations set role_permissions = v_clean where id = p_org;
end;
$$;

-- Money & sales tables follow the "see prices" permission instead of the role.
do $$
declare t text;
begin
  foreach t in array array['services','opportunities','quotes','quote_items','invoices','invoice_items','payments','expenses'] loop
    execute format('drop policy %I on public.%I', t || '_manager', t);
    execute format('create policy %I on public.%I for select using (public.can_money(org_id))', t || '_money_select', t);
    execute format('create policy %I on public.%I for insert with check (public.can_money(org_id))', t || '_money_insert', t);
    execute format('create policy %I on public.%I for update using (public.can_money(org_id)) with check (public.can_money(org_id))', t || '_money_update', t);
  end loop;
  -- Deleting child rows is part of editing; deleting top-level records needs the delete permission.
  foreach t in array array['quote_items','invoice_items','payments'] loop
    execute format('create policy %I on public.%I for delete using (public.can_money(org_id))', t || '_money_delete', t);
  end loop;
  foreach t in array array['services','opportunities','quotes','invoices','expenses'] loop
    execute format('create policy %I on public.%I for delete using (public.can_money(org_id) and public.has_perm(org_id, ''delete_records''))', t || '_delete', t);
  end loop;
end $$;

drop policy job_items_select on public.job_items;
drop policy job_items_write on public.job_items;
create policy job_items_select on public.job_items for select using (public.can_money(org_id));
create policy job_items_write on public.job_items for all using (public.can_money(org_id) and public.is_manager(org_id))
  with check (public.can_money(org_id) and public.is_manager(org_id));

-- Technicians read the service menu (names, checklists, guides) without prices.
drop policy services_member_read on public.services;
create or replace view public.service_menu as
  select id, org_id, name, description, category, est_hours, active, sort_order, checklist, equipment
  from public.services
  where public.is_member(org_id);
grant select on public.service_menu to authenticated;

-- Customers & assets: creating/editing needs "edit customers"; deleting needs "delete records".
do $$
declare t text;
begin
  foreach t in array array['customers','contacts','aircraft'] loop
    execute format('drop policy %I on public.%I', t || '_insert', t);
    execute format('drop policy %I on public.%I', t || '_update', t);
    execute format('drop policy %I on public.%I', t || '_delete', t);
    execute format('create policy %I on public.%I for insert with check (public.has_perm(org_id, ''edit_customers''))', t || '_insert', t);
    execute format('create policy %I on public.%I for update using (public.has_perm(org_id, ''edit_customers'')) with check (public.has_perm(org_id, ''edit_customers''))', t || '_update', t);
  end loop;
  foreach t in array array['customers','aircraft','locations','inventory_items','equipment'] loop
    if t in ('locations','inventory_items','equipment') then
      execute format('drop policy %I on public.%I', t || '_delete', t);
    end if;
    execute format('create policy %I on public.%I for delete using (public.is_manager(org_id) and public.has_perm(org_id, ''delete_records''))', t || '_delete', t);
  end loop;
  -- Contacts are part of a customer record.
  execute 'create policy contacts_delete on public.contacts for delete using (public.has_perm(org_id, ''edit_customers''))';
end $$;

drop policy jobs_delete on public.jobs;
create policy jobs_delete on public.jobs for delete using (public.is_manager(org_id) and public.has_perm(org_id, 'delete_records'));

-- Discounts need the "give discounts" permission. Automatic standing customer
-- discounts (applied by the server) are exempt.
create or replace function public.assert_discount_allowed()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.discount > 0
     and (tg_op = 'INSERT' or new.discount is distinct from old.discount)
     and auth.uid() is not null
     and coalesce(current_setting('app.system_discount', true), '') <> 'on'
     and not public.has_perm(new.org_id, 'give_discounts') then
    raise exception 'PERMISSION: you do not have permission to give discounts';
  end if;
  return new;
end;
$$;
create trigger quotes_discount_perm before insert or update of discount on public.quotes
  for each row execute function public.assert_discount_allowed();
create trigger invoices_discount_perm before insert or update of discount on public.invoices
  for each row execute function public.assert_discount_allowed();

-- ---------------------------------------------------------------------------
-- Pay rates are private: moved off memberships (which every teammate can read).
-- ---------------------------------------------------------------------------
create table public.member_pay (
  org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  hourly_rate numeric(10,2) check (hourly_rate >= 0),
  pay_type text not null default 'hourly' check (pay_type in ('hourly','salary','per_job','contractor')),
  overtime_multiplier numeric(4,2) not null default 1.5 check (overtime_multiplier >= 1),
  updated_at timestamptz not null default now(),
  primary key (org_id, user_id)
);
insert into public.member_pay (org_id, user_id, hourly_rate)
  select org_id, user_id, hourly_rate from public.memberships where hourly_rate is not null;
alter table public.memberships drop column hourly_rate;
alter table public.member_pay enable row level security;
create policy member_pay_admin on public.member_pay for all using (public.is_admin(org_id)) with check (public.is_admin(org_id));
create policy member_pay_self on public.member_pay for select using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Company locations (branches, Fleet). Facilities (airports/marinas/sites)
-- stay in public.locations; branches are where the company operates from.
-- ---------------------------------------------------------------------------
create table public.branches (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  address text,
  phone text,
  timezone text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index on public.branches (org_id);
alter table public.branches enable row level security;
create policy branches_select on public.branches for select using (public.is_member(org_id));
create policy branches_write on public.branches for all using (public.is_admin(org_id)) with check (public.is_admin(org_id));

create or replace function public.assert_branches_allowed()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not public.plan_allows(new.org_id, 'branches') then
    raise exception 'PLAN_FEATURE: multiple company locations are part of the Fleet plan';
  end if;
  return new;
end;
$$;
create trigger branches_plan before insert on public.branches for each row execute function public.assert_branches_allowed();

alter table public.memberships
  add column default_branch_id uuid references public.branches(id) on delete set null,
  add column skills text[] not null default '{}',
  add column deactivated_at timestamptz;
alter table public.jobs add column branch_id uuid references public.branches(id) on delete set null;
alter table public.quotes add column branch_id uuid references public.branches(id) on delete set null;
alter table public.invoices add column branch_id uuid references public.branches(id) on delete set null;
alter table public.expenses add column branch_id uuid references public.branches(id) on delete set null;
create trigger jobs_org_b before insert or update on public.jobs for each row execute function public.assert_same_org('branches', 'branch_id');
create trigger quotes_org_b before insert or update on public.quotes for each row execute function public.assert_same_org('branches', 'branch_id');
create trigger invoices_org_b before insert or update on public.invoices for each row execute function public.assert_same_org('branches', 'branch_id');
create trigger expenses_org_b before insert or update on public.expenses for each row execute function public.assert_same_org('branches', 'branch_id');
create trigger memberships_org_b before insert or update on public.memberships for each row execute function public.assert_same_org('branches', 'default_branch_id');

-- ---------------------------------------------------------------------------
-- Assets: aircraft, vehicles and watercraft share one table.
-- ---------------------------------------------------------------------------
create table public.aircraft_models (
  id uuid primary key default gen_random_uuid(),
  manufacturer text not null,
  model text not null,
  category public.aircraft_category not null,
  length_ft numeric(6,1),
  wingspan_ft numeric(6,1),
  unique (manufacturer, model)
);
create index aircraft_models_search on public.aircraft_models (lower(manufacturer || ' ' || model));
alter table public.aircraft_models enable row level security;
create policy aircraft_models_read on public.aircraft_models for select to authenticated using (true);

alter table public.aircraft
  add column asset_type text not null default 'aircraft' check (asset_type in ('aircraft','vehicle','watercraft')),
  add column model_id uuid references public.aircraft_models(id) on delete set null,
  add column vin text,
  add column plate text,
  add column hull_id text;
comment on column public.aircraft.tail_number is 'Identifier: tail number (aircraft), plate or nickname (vehicle), vessel name / registration (watercraft)';

alter table public.services
  add column asset_type text not null default 'aircraft' check (asset_type in ('aircraft','vehicle','watercraft')),
  add column guide_key text,
  add column recur_every int check (recur_every between 1 and 520),
  add column recur_unit text check (recur_unit in ('week','month'));
update public.services set
  recur_unit = case when recurring_interval_days % 30 = 0 or recurring_interval_days in (365, 180, 90, 60) then 'month' else 'week' end,
  recur_every = case
    when recurring_interval_days = 365 then 12
    when recurring_interval_days % 30 = 0 then recurring_interval_days / 30
    when recurring_interval_days in (180, 90, 60) then recurring_interval_days / 30
    else greatest(1, round(recurring_interval_days / 7.0)::int) end
  where recurring_interval_days is not null;
update public.services s set guide_key = x.k from (values
  ('Exterior Wash','exterior_wash'), ('Dry Wash (Waterless)','dry_wash'), ('Belly & Gear Degrease','belly_gear_degrease'),
  ('Brightwork Polish','brightwork_polish'), ('Wax / Sealant','wax_sealant'), ('Ceramic Coating','ceramic_coating'),
  ('Paint Correction','paint_correction'), ('Interior Detail','interior_detail'), ('Carpet Extraction','carpet_extraction'),
  ('Leather Deep Clean & Condition','leather_care'), ('De-Ice Boot Treatment','deice_boot_treatment'),
  ('Windshield & Windows Treatment','windshield_treatment')) x(n, k)
  where s.name = x.n;

-- Suggested price per model per service (the Flight Ready price guide).
create table public.price_guide (
  model_id uuid not null references public.aircraft_models(id) on delete cascade,
  guide_key text not null,
  price numeric(10,2) not null check (price >= 0),
  primary key (model_id, guide_key)
);
alter table public.price_guide enable row level security;
create policy price_guide_read on public.price_guide for select to authenticated using (true);

-- ---------------------------------------------------------------------------
-- Step-by-step service guides (platform defaults have org_id null).
-- ---------------------------------------------------------------------------
create table public.service_guides (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references public.organizations(id) on delete cascade,
  key text not null,
  asset_type text not null default 'aircraft' check (asset_type in ('aircraft','vehicle','watercraft')),
  title text not null,
  summary text not null,
  time_estimate text,
  crew text,
  products text[] not null default '{}',
  tools text[] not null default '{}',
  prep text[] not null default '{}',
  steps jsonb not null default '[]',
  donts text[] not null default '{}',
  quality_checks text[] not null default '{}',
  photos text[] not null default '{}',
  based_on uuid,
  hidden boolean not null default false,
  created_at timestamptz not null default now()
);
create unique index on public.service_guides (key) where org_id is null;
create index on public.service_guides (org_id, key);
alter table public.service_guides enable row level security;
create policy service_guides_read on public.service_guides for select using (org_id is null or public.is_member(org_id));
create policy service_guides_write on public.service_guides for all using (org_id is not null and public.is_manager(org_id))
  with check (org_id is not null and public.is_manager(org_id));

create table public.hidden_guides (
  org_id uuid not null references public.organizations(id) on delete cascade,
  guide_id uuid not null references public.service_guides(id) on delete cascade,
  primary key (org_id, guide_id)
);
alter table public.hidden_guides enable row level security;
create policy hidden_guides_read on public.hidden_guides for select using (public.is_member(org_id));
create policy hidden_guides_write on public.hidden_guides for all using (public.is_manager(org_id)) with check (public.is_manager(org_id));

-- Training videos can be attached to a specific guide step.
alter table public.training_media
  add column guide_key text,
  add column step_index int check (step_index >= 0);

-- Job checklist items remember which guide step they came from.
alter table public.job_checklist_items
  add column guide_key text,
  add column step_index int;

-- The guide used for a service: the company's own copy, else the platform
-- default (unless the company hid it).
create or replace function public.guide_for(p_org uuid, p_key text)
returns public.service_guides language sql stable security definer set search_path = public as $$
  select g.* from service_guides g
  where g.key = p_key
    and (g.org_id = p_org or (g.org_id is null and not exists (select 1 from hidden_guides h where h.org_id = p_org and h.guide_id = g.id)))
    and not g.hidden
  order by (g.org_id is null)  -- company copy first
  limit 1;
$$;

-- ---------------------------------------------------------------------------
-- Starter services per business type, with checklists from the guides.
-- ---------------------------------------------------------------------------
create or replace function public.seed_default_services(p_org uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into services (org_id, name, guide_key, category, pricing_method, base_price, price_per_foot, est_hours, est_hours_max,
                        recur_every, recur_unit, sort_order, description, equipment) values
  (p_org, 'Exterior Wash', 'exterior_wash', 'exterior', 'per_foot', 150, 9, 2, 3, 1, 'month', 1,
     'Full hand wash of fuselage, wings, empennage and belly.', array['Pressure washer','Foam cannon','Aviation-safe soap','Microfiber towels','Pitot covers']),
  (p_org, 'Dry Wash (Waterless)', 'dry_wash', 'exterior', 'per_foot', 125, 8, 2, 3, 1, 'month', 2,
     'Waterless wash for ramps without water access.', array['Waterless wash product','Microfiber towels','Spray bottles']),
  (p_org, 'Belly & Gear Degrease', 'belly_gear_degrease', 'exterior', 'per_foot', 100, 4, 1.5, 2, null, null, 3,
     'Remove exhaust soot, hydraulic fluid and grime from belly and gear wells.', array['Approved degreaser','Soft brushes','Masking tape']),
  (p_org, 'Brightwork Polish', 'brightwork_polish', 'brightwork', 'per_category', 300, 0, 4, 6, 3, 'month', 4,
     'Polish leading edges, inlets and other bare-metal surfaces.', array['Metal polish','Orbital polisher','Masking tape','Microfiber towels']),
  (p_org, 'Wax / Sealant', 'wax_sealant', 'coating', 'per_foot', 250, 12, 4, 6, 3, 'month', 5,
     'Protective wax or polymer sealant applied after wash.', array['Sealant','Foam applicators','Microfiber towels']),
  (p_org, 'Ceramic Coating', 'ceramic_coating', 'coating', 'per_foot', 1500, 60, 16, 24, 12, 'month', 6,
     'Multi-year ceramic coating for gloss and easier cleaning.', array['Ceramic coating kit','Clay bar','Iron remover','IPA panel wipe','Applicators','Inspection light']),
  (p_org, 'Paint Correction', 'paint_correction', 'paint_correction', 'hourly', 0, 0, 12, 20, null, null, 7,
     'Machine compound and polish to remove oxidation and swirls.', array['Dual-action polisher','Compound','Polish','Pads','Paint depth gauge','Inspection light']),
  (p_org, 'Interior Detail', 'interior_detail', 'interior', 'per_category', 350, 0, 4, 6, 1, 'month', 8,
     'Full cabin clean including leather, carpet, galley and lav.', array['Commercial vacuum','Leather conditioner','Microfiber towels','Surface sanitizer']),
  (p_org, 'Carpet Extraction', 'carpet_extraction', 'interior', 'per_category', 250, 0, 3, 4, 6, 'month', 9,
     'Hot-water extraction of cabin carpets and runners.', array['Hot-water extractor','Pre-spray','Carpet groomer']),
  (p_org, 'Leather Deep Clean & Condition', 'leather_care', 'interior', 'per_category', 200, 0, 2, 3, 3, 'month', 10,
     'Deep clean and condition all leather surfaces.', array['Leather cleaner','Leather conditioner','Soft brushes','Microfiber towels']),
  (p_org, 'De-Ice Boot Treatment', 'deice_boot_treatment', 'specialty', 'per_category', 150, 0, 1, 2, 6, 'month', 11,
     'Clean and treat pneumatic de-ice boots.', array['Approved boot treatment','Microfiber towels']),
  (p_org, 'Windshield & Windows Treatment', 'windshield_treatment', 'specialty', 'flat', 95, 0, 0.5, 1, 2, 'month', 12,
     'Clean and treat windshields with manufacturer-approved products.', array['Approved window cleaner','Microfiber towels']);

  update services set category_prices = jsonb_build_object(
    'piston_single', base_price * 0.5, 'piston_twin', base_price * 0.75,
    'turboprop', base_price, 'very_light_jet', base_price * 1.1, 'light_jet', base_price * 1.3,
    'midsize_jet', base_price * 1.7, 'super_midsize_jet', base_price * 2.1,
    'large_jet', base_price * 3, 'airliner', base_price * 6, 'helicopter', base_price * 0.8)
  where org_id = p_org and pricing_method = 'per_category';
  update services set hourly_rate = 95 where org_id = p_org and pricing_method = 'hourly';
  update services set pricing_tiers = jsonb_build_array(
    jsonb_build_object('name', 'Small Interior', 'detail', '4-6 seats', 'price', round(base_price * 0.75)),
    jsonb_build_object('name', 'Medium Interior', 'detail', '6-10 seats', 'price', round(base_price * 1.3)),
    jsonb_build_object('name', 'Large Interior', 'detail', '10+ seats', 'price', round(base_price * 2.2)))
  where org_id = p_org and name = 'Interior Detail';
  perform public.apply_guide_checklists(p_org);
end;
$$;

create or replace function public.seed_asset_services(p_org uuid, p_type text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_type = 'vehicle' and not exists (select 1 from services where org_id = p_org and asset_type = 'vehicle') then
    insert into services (org_id, asset_type, name, guide_key, category, pricing_method, base_price, est_hours, est_hours_max, recur_every, recur_unit, sort_order, description, category_prices) values
    (p_org, 'vehicle', 'Exterior Hand Wash', 'vehicle_wash', 'exterior', 'per_category', 60, 1, 1.5, 2, 'week', 101, 'Two-bucket hand wash, wheels, tires and dry.',
       '{"car":60,"suv":75,"truck":80,"van":90,"rv":250,"motorcycle":50}'),
    (p_org, 'vehicle', 'Interior Detail', 'vehicle_interior', 'interior', 'per_category', 150, 2, 3, 3, 'month', 102, 'Vacuum, shampoo, leather and plastics, glass.',
       '{"car":150,"suv":180,"truck":170,"van":220,"rv":450,"motorcycle":60}'),
    (p_org, 'vehicle', 'Full Detail', 'vehicle_full_detail', 'package', 'per_category', 250, 4, 6, 3, 'month', 103, 'Complete inside-and-out detail with sealant.',
       '{"car":250,"suv":300,"truck":300,"van":350,"rv":800,"motorcycle":150}'),
    (p_org, 'vehicle', 'Paint Correction', 'vehicle_paint_correction', 'paint_correction', 'per_category', 450, 6, 12, null, null, 104, 'Compound and polish to remove swirls and oxidation.',
       '{"car":450,"suv":550,"truck":550,"van":650,"rv":1500,"motorcycle":250}'),
    (p_org, 'vehicle', 'Ceramic Coating', 'vehicle_ceramic_coating', 'coating', 'per_category', 900, 8, 12, 12, 'month', 105, 'Multi-year ceramic protection after paint prep.',
       '{"car":900,"suv":1100,"truck":1100,"van":1300,"rv":3000,"motorcycle":500}'),
    (p_org, 'vehicle', 'Engine Bay Detail', 'vehicle_engine_bay', 'engine', 'flat', 75, 1, 1.5, null, null, 106, 'Safe degrease and dressing of the engine bay.', '{}');
  elsif p_type = 'watercraft' and not exists (select 1 from services where org_id = p_org and asset_type = 'watercraft') then
    insert into services (org_id, asset_type, name, guide_key, category, pricing_method, base_price, price_per_foot, est_hours, est_hours_max, recur_every, recur_unit, sort_order, description) values
    (p_org, 'watercraft', 'Hull & Deck Wash', 'boat_wash', 'exterior', 'per_foot', 100, 5, 2, 4, 2, 'week', 201, 'Wash hull sides, decks, non-skid and hardware.'),
    (p_org, 'watercraft', 'Oxidation Removal / Compound', 'boat_oxidation_removal', 'paint_correction', 'per_foot', 300, 25, 6, 12, null, null, 202, 'Compound and polish oxidized gelcoat.'),
    (p_org, 'watercraft', 'Wax / Sealant', 'boat_wax_sealant', 'coating', 'per_foot', 200, 15, 4, 8, 3, 'month', 203, 'Marine wax or sealant protection.'),
    (p_org, 'watercraft', 'Ceramic Coating', 'boat_ceramic_coating', 'coating', 'per_foot', 800, 60, 10, 20, 12, 'month', 204, 'Ceramic protection for gelcoat and paint.'),
    (p_org, 'watercraft', 'Interior & Upholstery', 'boat_interior', 'interior', 'per_foot', 150, 8, 3, 6, 1, 'month', 205, 'Cabin, vinyl and upholstery clean with mildew treatment.'),
    (p_org, 'watercraft', 'Teak Clean & Seal', 'boat_teak_care', 'specialty', 'per_foot', 200, 10, 4, 8, 6, 'month', 206, 'Clean, brighten and seal teak decks and trim.');
  end if;
  perform public.apply_guide_checklists(p_org);
end;
$$;

-- Services without their own checklist get the guide's step titles.
create or replace function public.apply_guide_checklists(p_org uuid)
returns void language sql security definer set search_path = public as $$
  update services s set checklist = coalesce((
      select array_agg(st ->> 'title' order by ord)
      from jsonb_array_elements((public.guide_for(p_org, s.guide_key)).steps) with ordinality as x(st, ord)
    ), s.checklist)
  where s.org_id = p_org and s.guide_key is not null and cardinality(s.checklist) = 0;
$$;
revoke execute on function public.seed_default_services(uuid) from public, anon, authenticated;
revoke execute on function public.seed_asset_services(uuid, text) from public, anon, authenticated;
revoke execute on function public.apply_guide_checklists(uuid) from public, anon, authenticated;

-- Business types can be added later, never removed; adding one seeds its services.
create or replace function public.trg_business_types()
returns trigger language plpgsql security definer set search_path = public as $$
declare t text;
begin
  if not (old.business_types <@ new.business_types) then
    raise exception 'Business types can be added but not removed';
  end if;
  foreach t in array new.business_types loop
    if not (t = any(old.business_types)) then
      perform public.seed_asset_services(new.id, t);
    end if;
  end loop;
  return new;
end;
$$;
create trigger org_business_types_change after update of business_types on public.organizations
  for each row when (old.business_types is distinct from new.business_types)
  execute function public.trg_business_types();

-- Org creation takes the business types chosen at sign-up.
drop function public.create_organization(text, boolean);
create or replace function public.create_organization(p_name text, p_seed_services boolean default true, p_business_types text[] default '{aircraft}')
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_org uuid;
  v_uid uuid := auth.uid();
  t text;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  insert into organizations (name, business_types)
    values (p_name, (select array_agg(distinct x) from unnest(array['aircraft'] || coalesce(p_business_types, '{}')) x))
    returning id into v_org;
  insert into memberships (org_id, user_id, role, display_name)
    select v_org, v_uid, 'owner', p.full_name from profiles p where p.id = v_uid;
  if not found then
    insert into memberships (org_id, user_id, role) values (v_org, v_uid, 'owner');
  end if;
  update profiles set current_org_id = v_org where id = v_uid;
  if p_seed_services then
    perform public.seed_default_services(v_org);
    foreach t in array (select business_types from organizations where id = v_org) loop
      if t <> 'aircraft' then perform public.seed_asset_services(v_org, t); end if;
    end loop;
  end if;
  perform public.seed_org_defaults(v_org);
  return v_org;
end;
$$;

-- Hook for per-org defaults added by later migrations (automations, crew hours...).
create or replace function public.seed_org_defaults(p_org uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  null;
end;
$$;
revoke execute on function public.seed_org_defaults(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Audit log (owner/admin "activity log per member").
-- ---------------------------------------------------------------------------
create table public.audit_log (
  id bigint generated always as identity primary key,
  org_id uuid not null references public.organizations(id) on delete cascade,
  actor uuid references auth.users(id) on delete set null,
  action text not null,            -- created / updated / deleted / custom
  entity text not null,            -- table name
  entity_id uuid,
  summary text,
  created_at timestamptz not null default now()
);
create index on public.audit_log (org_id, created_at desc);
create index on public.audit_log (org_id, actor, created_at desc);
alter table public.audit_log enable row level security;
create policy audit_log_admin on public.audit_log for select using (public.is_admin(org_id));

create or replace function public.audit_row()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  r jsonb := to_jsonb(coalesce(new, old));
  v_summary text;
begin
  if auth.uid() is null then return null; end if;
  -- Status-only churn on jobs is still worth recording; skip no-op updates.
  if tg_op = 'UPDATE' and to_jsonb(new) - 'updated_at' = to_jsonb(old) - 'updated_at' then return null; end if;
  v_summary := coalesce(r ->> 'number', r ->> 'tail_number', r ->> 'name', r ->> 'title', r ->> 'description', r ->> 'vendor');
  if tg_op = 'UPDATE' and r ? 'status' and (to_jsonb(old) ->> 'status') is distinct from (to_jsonb(new) ->> 'status') then
    v_summary := concat_ws(' ', v_summary, '→', to_jsonb(new) ->> 'status');
  end if;
  insert into audit_log (org_id, actor, action, entity, entity_id, summary)
  values ((r ->> 'org_id')::uuid, auth.uid(),
          case tg_op when 'INSERT' then 'created' when 'UPDATE' then 'updated' else 'deleted' end,
          tg_table_name, (r ->> 'id')::uuid, left(v_summary, 200));
  return null;
exception when others then
  return null; -- auditing must never block business writes
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['customers','aircraft','jobs','quotes','invoices','payments','services','expenses',
                           'inventory_items','equipment','locations','opportunities','branches'] loop
    execute format('create trigger %I after insert or update or delete on public.%I for each row execute function public.audit_row()', t || '_audit', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Platform admin (the Flight Ready founder) and public support messages.
-- ---------------------------------------------------------------------------
create table public.platform_admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);
alter table public.platform_admins enable row level security;
create policy platform_admins_self on public.platform_admins for select using (user_id = auth.uid());

create or replace function public.is_platform_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from platform_admins where user_id = auth.uid());
$$;

create table public.worker_runs (
  id bigint generated always as identity primary key,
  worker text not null,
  ran_at timestamptz not null default now(),
  ok boolean not null default true,
  details jsonb
);
create index on public.worker_runs (worker, ran_at desc);
alter table public.worker_runs enable row level security;
create policy worker_runs_admin on public.worker_runs for select using (public.is_platform_admin());

create table public.support_messages (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  company text,
  topic text,
  message text not null,
  handled boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.support_messages enable row level security;
create policy support_messages_admin on public.support_messages for all using (public.is_platform_admin()) with check (public.is_platform_admin());

create or replace function public.submit_support_message(p_name text, p_email text, p_company text, p_topic text, p_message text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if coalesce(length(trim(p_name)), 0) < 2 or p_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or coalesce(length(trim(p_message)), 0) < 10 then
    raise exception 'Please enter your name, a valid email and a message (10+ characters).';
  end if;
  if length(p_message) > 5000 then raise exception 'Message is too long'; end if;
  -- Light abuse protection: at most 5 messages per email per hour.
  if (select count(*) from support_messages where email = lower(trim(p_email)) and created_at > now() - interval '1 hour') >= 5 then
    raise exception 'Too many messages. Please try again later.';
  end if;
  insert into support_messages (name, email, company, topic, message)
  values (trim(p_name), lower(trim(p_email)), nullif(trim(p_company), ''), nullif(trim(p_topic), ''), trim(p_message));
end;
$$;
revoke execute on function public.submit_support_message(text, text, text, text, text) from public;
grant execute on function public.submit_support_message(text, text, text, text, text) to anon, authenticated;

create or replace function public.platform_health()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_platform_admin() then raise exception 'Platform admins only'; end if;
  return jsonb_build_object(
    'companies_by_plan', (select coalesce(jsonb_object_agg(p, n), '{}') from (
        select public.effective_plan(id)::text p, count(*) n from organizations where not is_demo group by 1) x),
    'demo_companies', (select count(*) from organizations where is_demo),
    'billing_annual', (select count(*) from organizations where billing_period = 'annual' and not is_demo),
    'texting_pending', (select count(*) from organizations where sms_status = 'pending'),
    'support_open', (select count(*) from support_messages where not handled),
    'last_worker_runs', (select coalesce(jsonb_agg(x order by x.worker), '[]') from (
        select distinct on (worker) worker, ran_at, ok, details from worker_runs order by worker, ran_at desc) x)
  );
end;
$$;

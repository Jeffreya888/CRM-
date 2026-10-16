-- =============================================================================
-- Flight Ready design: richer services, Training Center, social links,
-- notification preferences, and the dashboard figures the new design shows.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Services: time range, pricing tiers, equipment, more categories
-- ---------------------------------------------------------------------------
alter table public.services
  add column est_hours_max numeric(6,2),
  -- [{ "name": "Small Interior", "detail": "4-6 seats", "price": 1800 }, ...]
  add column pricing_tiers jsonb not null default '[]'::jsonb,
  add column equipment text[] not null default '{}';

alter table public.services drop constraint services_category_check;
alter table public.services add constraint services_category_check
  check (category in ('exterior','interior','brightwork','coating','paint_correction','engine','package','specialty','other'));

-- ---------------------------------------------------------------------------
-- Organization social links (shown on the More screen)
-- ---------------------------------------------------------------------------
alter table public.organizations
  add column instagram text,
  add column facebook text,
  add column youtube text,
  add column linkedin text;
grant update (instagram, facebook, youtube, linkedin) on public.organizations to authenticated;

-- ---------------------------------------------------------------------------
-- Per-user notification preferences
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column notification_prefs jsonb not null default
    '{"job_assignments": true, "service_reminders": true, "payments": true, "quote_accepted": true}'::jsonb;

-- ---------------------------------------------------------------------------
-- Training Center
-- ---------------------------------------------------------------------------
create table public.training_media (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  service_id uuid references public.services(id) on delete set null,
  kind text not null default 'video' check (kind in ('video','document')),
  title text not null,
  description text,
  url text,                -- external link (YouTube, Vimeo, Google Drive…)
  storage_path text,       -- or an uploaded file in org-files
  thumbnail_path text,
  duration_min int check (duration_min > 0),
  sort_order int not null default 0,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  check (url is not null or storage_path is not null)
);
create index on public.training_media (org_id, sort_order);
create index on public.training_media (service_id);

create table public.training_progress (
  media_id uuid not null references public.training_media(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  completed_at timestamptz not null default now(),
  primary key (media_id, user_id)
);

create trigger training_media_org before insert or update on public.training_media
  for each row execute function public.assert_same_org('services', 'service_id');
create trigger training_progress_org before insert or update on public.training_progress
  for each row execute function public.assert_same_org('training_media', 'media_id');

alter table public.training_media enable row level security;
create policy training_media_select on public.training_media for select using (public.is_member(org_id));
create policy training_media_write on public.training_media for all using (public.is_manager(org_id)) with check (public.is_manager(org_id));

alter table public.training_progress enable row level security;
create policy training_progress_select on public.training_progress for select using (user_id = auth.uid() or public.is_manager(org_id));
create policy training_progress_self on public.training_progress for insert with check (user_id = auth.uid() and public.is_member(org_id));
create policy training_progress_delete on public.training_progress for delete using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Starter price book extras: time ranges, equipment, interior tiers.
-- ---------------------------------------------------------------------------
create or replace function public.seed_service_extras(p_org uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update services s set est_hours_max = x.hmax, equipment = x.eq
  from (values
    ('Exterior Wash', 3, array['Pressure washer','Foam cannon','Aviation-safe soap','Microfiber towels','Pitot covers']),
    ('Dry Wash (Waterless)', 3, array['Waterless wash product','Microfiber towels','Spray bottles']),
    ('Belly & Gear Degrease', 2, array['Approved degreaser','Soft brushes','Masking tape']),
    ('Brightwork Polish', 6, array['Metal polish','Orbital polisher','Masking tape','Microfiber towels']),
    ('Wax / Sealant', 6, array['Sealant','Foam applicators','Microfiber towels']),
    ('Ceramic Coating', 24, array['Ceramic coating kit','Clay bar','Iron remover','IPA panel wipe','Applicators','Inspection light']),
    ('Paint Correction', 20, array['Dual-action polisher','Compound','Polish','Pads','Paint depth gauge','Inspection light']),
    ('Interior Detail', 6, array['Commercial vacuum','Leather conditioner','Microfiber towels','Surface sanitizer']),
    ('Carpet Extraction', 4, array['Hot-water extractor','Pre-spray','Carpet groomer']),
    ('Leather Deep Clean & Condition', 3, array['Leather cleaner','Leather conditioner','Soft brushes','Microfiber towels']),
    ('De-Ice Boot Treatment', 2, array['Approved boot treatment','Microfiber towels']),
    ('Windshield & Windows Treatment', 1, array['Approved window cleaner','Microfiber towels'])
  ) as x(name, hmax, eq)
  where s.org_id = p_org and s.name = x.name;

  update services set pricing_tiers = jsonb_build_array(
    jsonb_build_object('name', 'Small Interior', 'detail', '4-6 seats', 'price', round(base_price * 0.75)),
    jsonb_build_object('name', 'Medium Interior', 'detail', '6-10 seats', 'price', round(base_price * 1.3)),
    jsonb_build_object('name', 'Large Interior', 'detail', '10+ seats', 'price', round(base_price * 2.2)))
  where org_id = p_org and name = 'Interior Detail';
end;
$$;
revoke execute on function public.seed_service_extras(uuid) from public, anon, authenticated;

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
    perform public.seed_service_extras(v_org);
  end if;
  return v_org;
end;
$$;

-- ---------------------------------------------------------------------------
-- Dashboard: adds weekly revenue and all-time job counts by status.
-- ---------------------------------------------------------------------------
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
    'jobs_scheduled', (select count(*) from jobs where org_id = p_org and status = 'scheduled'),
    'jobs_completed', (select count(*) from jobs where org_id = p_org and status in ('completed','invoiced')),
    'jobs_this_week', (select count(*) from jobs where org_id = p_org and status not in ('cancelled')
                     and scheduled_start >= date_trunc('week', now()) and scheduled_start < date_trunc('week', now()) + interval '7 days'),
    'open_quotes', (select count(*) from quotes where org_id = p_org and status in ('draft','sent','viewed')),
    'reminders_due', (select count(*) from service_reminders where org_id = p_org and status in ('upcoming','due') and due_on <= current_date + 14),
    'low_stock', (select count(*) from inventory_items where org_id = p_org and quantity <= reorder_level),
    'customers', (select count(*) from customers where org_id = p_org and status <> 'inactive'),
    'aircraft', (select count(*) from aircraft where org_id = p_org and active),
    'revenue_week', case when v_fin then (select coalesce(sum(amount), 0) from payments where org_id = p_org and received_at >= date_trunc('week', now())) end,
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

-- ---------------------------------------------------------------------------
-- Fix: job line items carry prices, so technicians must not read them.
-- They still see the services through jobs.title.
-- ---------------------------------------------------------------------------
drop policy job_items_select on public.job_items;
create policy job_items_select on public.job_items for select using (public.is_manager(org_id));

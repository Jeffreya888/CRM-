-- =============================================================================
-- Sales & customer experience: leads, quotes (versions, Good/Better/Best,
-- deposits, tracking, templates, photos), customer portal, recurring care,
-- automations + message log, invoice snapshots, job workflow rules.
-- =============================================================================

-- Internal numbering without the membership check (used by server-side flows).
create or replace function public._next_number(p_org uuid, p_kind text)
returns text language plpgsql security definer set search_path = public as $$
declare v text;
begin
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
revoke execute on function public._next_number(uuid, text) from public, anon, authenticated;

create or replace function public.next_number(p_org uuid, p_kind text)
returns text language plpgsql security definer set search_path = public as $$
begin
  if not public.is_member(p_org) then raise exception 'Not a member of this organization'; end if;
  return public._next_number(p_org, p_kind);
end;
$$;

-- ---------------------------------------------------------------------------
-- Leads & follow-ups
-- ---------------------------------------------------------------------------
alter table public.opportunities
  add column follow_up_on date,
  add column contact_name text,
  add column contact_email text,
  add column contact_phone text,
  add column asset_description text,
  add column won_at timestamptz;
create index on public.opportunities (org_id, follow_up_on);

-- ---------------------------------------------------------------------------
-- Customers: consent and automation exceptions
-- ---------------------------------------------------------------------------
alter table public.customers
  add column sms_consent boolean not null default false,
  add column sms_consent_at timestamptz,
  add column sms_opted_out boolean not null default false,
  add column email_opted_out boolean not null default false,
  add column automation_exceptions text[] not null default '{}',
  add column portal_enabled boolean not null default true;

-- ---------------------------------------------------------------------------
-- Quotes
-- ---------------------------------------------------------------------------
alter table public.quotes
  add column valid_until_at timestamptz,
  add column version int not null default 1,
  add column parent_quote_id uuid references public.quotes(id) on delete set null,
  add column superseded_by uuid references public.quotes(id) on delete set null,
  add column selected_option_id uuid,
  add column deposit_type text not null default 'none' check (deposit_type in ('none','percent','fixed')),
  add column deposit_value numeric(12,2) not null default 0 check (deposit_value >= 0),
  add column deposit_amount numeric(12,2) not null default 0,
  add column deposit_paid_at timestamptz,
  add column deposit_payment_intent text,
  add column view_count int not null default 0,
  add column first_viewed_at timestamptz,
  add column last_viewed_at timestamptz,
  add column sent_at timestamptz,
  add column declined_at timestamptz,
  add column decline_reason text check (decline_reason in ('price','timing','went_elsewhere','other')),
  add column decline_note text,
  add column follow_ups_sent int not null default 0,
  add column last_follow_up_at timestamptz,
  add column signature_svg text;
update public.quotes set valid_until_at = (valid_until + time '23:59') at time zone 'UTC' where valid_until_at is null;

create table public.quote_options (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  quote_id uuid not null references public.quotes(id) on delete cascade,
  name text not null,                -- Good / Better / Best, or custom
  description text,
  sort_order int not null default 0,
  subtotal numeric(12,2) not null default 0,
  tax numeric(12,2) not null default 0,
  total numeric(12,2) not null default 0
);
create index on public.quote_options (quote_id);
create trigger quote_options_org before insert or update on public.quote_options for each row execute function public.assert_same_org('quotes', 'quote_id');
alter table public.quotes add constraint quotes_selected_option_fk foreign key (selected_option_id) references public.quote_options(id) on delete set null;
alter table public.quote_items add column option_id uuid references public.quote_options(id) on delete cascade;
create trigger quote_items_org_o before insert or update on public.quote_items for each row execute function public.assert_same_org('quote_options', 'option_id');

create table public.quote_photos (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  quote_id uuid not null references public.quotes(id) on delete cascade,
  storage_path text not null,
  caption text,
  created_at timestamptz not null default now()
);
create trigger quote_photos_org before insert or update on public.quote_photos for each row execute function public.assert_same_org('quotes', 'quote_id');

create table public.quote_templates (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  asset_type text not null default 'aircraft',
  -- {"options":[{"name":"Good","items":[{service_id, description, quantity, unit_price, taxable}]}], "notes":..., "terms":...}
  content jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);

do $$
declare t text;
begin
  foreach t in array array['quote_options','quote_photos','quote_templates'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for all using (public.can_money(org_id)) with check (public.can_money(org_id))', t || '_money', t);
  end loop;
end $$;

-- Totals per option; the quote header shows the selected (or first) option,
-- or all lines when the quote has no options.
create or replace function public.recalc_quote(p_quote uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  q quotes;
  o record;
  v_sub numeric; v_taxable numeric; v_disc numeric; v_tax numeric;
  v_header uuid;
begin
  select * into q from quotes where id = p_quote;
  if not found then return; end if;
  for o in select id from quote_options where quote_id = p_quote loop
    select coalesce(sum(quantity * unit_price), 0), coalesce(sum(quantity * unit_price) filter (where taxable), 0)
      into v_sub, v_taxable from quote_items where quote_id = p_quote and option_id = o.id;
    v_disc := least(q.discount, v_sub);
    v_tax := round(case when v_sub > 0 then (v_taxable - v_disc * v_taxable / v_sub) * q.tax_rate else 0 end, 2);
    update quote_options set subtotal = round(v_sub, 2), tax = v_tax, total = round(v_sub - v_disc + v_tax, 2) where id = o.id;
  end loop;

  v_header := coalesce(q.selected_option_id, (select id from quote_options where quote_id = p_quote order by sort_order, name limit 1));
  select coalesce(sum(quantity * unit_price), 0), coalesce(sum(quantity * unit_price) filter (where taxable), 0)
    into v_sub, v_taxable from quote_items
    where quote_id = p_quote and (v_header is null or option_id = v_header);
  v_disc := least(q.discount, v_sub);
  v_tax := round(case when v_sub > 0 then (v_taxable - v_disc * v_taxable / v_sub) * q.tax_rate else 0 end, 2);
  update quotes set subtotal = round(v_sub, 2), tax = v_tax, total = round(v_sub - v_disc + v_tax, 2),
    deposit_amount = case deposit_type
      when 'percent' then round((v_sub - v_disc + v_tax) * least(deposit_value, 100) / 100, 2)
      when 'fixed' then least(deposit_value, round(v_sub - v_disc + v_tax, 2))
      else 0 end
  where id = p_quote;
end;
$$;

create or replace function public.trg_quote_header_recalc()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.discount is distinct from old.discount or new.tax_rate is distinct from old.tax_rate
     or new.selected_option_id is distinct from old.selected_option_id
     or new.deposit_type is distinct from old.deposit_type or new.deposit_value is distinct from old.deposit_value then
    perform public.recalc_quote(new.id);
  end if;
  return null;
end;
$$;

create or replace function public.trg_quote_options_recalc()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.recalc_quote(coalesce(new.quote_id, old.quote_id));
  return null;
end;
$$;
create trigger quote_options_recalc after insert or delete on public.quote_options
  for each row execute function public.trg_quote_options_recalc();

-- Sent quotes are locked: what the customer approves is exactly what was sent.
-- Changes go into a new version (revise_quote).
create or replace function public.trg_quote_lock()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_status quote_status;
begin
  if coalesce(current_setting('app.quote_unlock', true), '') = 'on' then return coalesce(new, old); end if;
  select status into v_status from quotes where id = coalesce(new.quote_id, old.quote_id);
  if v_status is not null and v_status <> 'draft' then
    raise exception 'QUOTE_LOCKED: this quote was sent. Create a new version to change it.';
  end if;
  return coalesce(new, old);
end;
$$;
create trigger quote_items_lock before insert or update or delete on public.quote_items for each row execute function public.trg_quote_lock();
create trigger quote_options_lock before insert or update or delete on public.quote_options for each row execute function public.trg_quote_lock();

create or replace function public.trg_quote_header_lock()
returns trigger language plpgsql as $$
begin
  if old.status <> 'draft' and coalesce(current_setting('app.quote_unlock', true), '') <> 'on' and (
       new.discount is distinct from old.discount or new.tax_rate is distinct from old.tax_rate
    or new.customer_id is distinct from old.customer_id or new.aircraft_id is distinct from old.aircraft_id
    or new.notes is distinct from old.notes or new.terms is distinct from old.terms
    or new.deposit_type is distinct from old.deposit_type or new.deposit_value is distinct from old.deposit_value
    or (new.valid_until_at is distinct from old.valid_until_at and old.status <> 'sent' and old.status <> 'viewed')) then
    raise exception 'QUOTE_LOCKED: this quote was sent. Create a new version to change it.';
  end if;
  if new.status = 'sent' and old.status = 'draft' then
    new.sent_at := coalesce(new.sent_at, now());
  end if;
  return new;
end;
$$;
create trigger quotes_header_lock before update on public.quotes for each row execute function public.trg_quote_header_lock();

create or replace function public.revise_quote(p_quote uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  q quotes;
  v_new uuid;
  o record;
  v_opt uuid;
begin
  select * into q from quotes where id = p_quote;
  if not found or not public.can_money(q.org_id) then raise exception 'Quote not found'; end if;
  if q.status = 'draft' then return q.id; end if;
  if q.status = 'accepted' then raise exception 'Accepted quotes cannot be revised. Create a new quote instead.'; end if;
  insert into quotes (org_id, number, customer_id, aircraft_id, location_id, opportunity_id, branch_id, status, discount, tax_rate,
                      notes, terms, valid_until, valid_until_at, version, parent_quote_id, deposit_type, deposit_value, created_by)
  values (q.org_id, q.number || '-v' || (q.version + 1), q.customer_id, q.aircraft_id, q.location_id, q.opportunity_id, q.branch_id, 'draft',
          q.discount, q.tax_rate, q.notes, q.terms, greatest(q.valid_until, current_date + 14),
          greatest(coalesce(q.valid_until_at, now()), now() + interval '14 days'), q.version + 1, q.id, q.deposit_type, q.deposit_value, auth.uid())
  returning id into v_new;
  for o in select * from quote_options where quote_id = q.id order by sort_order loop
    insert into quote_options (org_id, quote_id, name, description, sort_order) values (q.org_id, v_new, o.name, o.description, o.sort_order)
      returning id into v_opt;
    insert into quote_items (org_id, quote_id, option_id, service_id, description, quantity, unit_price, taxable, sort_order)
      select org_id, v_new, v_opt, service_id, description, quantity, unit_price, taxable, sort_order from quote_items where quote_id = q.id and option_id = o.id;
  end loop;
  insert into quote_items (org_id, quote_id, service_id, description, quantity, unit_price, taxable, sort_order)
    select org_id, v_new, service_id, description, quantity, unit_price, taxable, sort_order from quote_items where quote_id = q.id and option_id is null;
  insert into quote_photos (org_id, quote_id, storage_path, caption) select org_id, v_new, storage_path, caption from quote_photos where quote_id = q.id;
  perform set_config('app.quote_unlock', 'on', true);
  update quotes set superseded_by = v_new, status = 'expired' where id = q.id;
  perform set_config('app.quote_unlock', 'off', true);
  return v_new;
end;
$$;

-- Create a quote from a saved template.
create or replace function public.quote_from_template(p_template uuid, p_customer uuid, p_aircraft uuid default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  t quote_templates;
  o organizations;
  c customers;
  v_q uuid; v_opt uuid;
  opt jsonb; it jsonb;
  i int := 0; k int;
begin
  select * into t from quote_templates where id = p_template;
  if not found or not public.can_money(t.org_id) then raise exception 'Template not found'; end if;
  select * into o from organizations where id = t.org_id;
  select * into c from customers where id = p_customer and org_id = t.org_id;
  if not found then raise exception 'Customer not found'; end if;
  insert into quotes (org_id, number, customer_id, aircraft_id, tax_rate, notes, terms, valid_until, valid_until_at, created_by)
  values (t.org_id, public._next_number(t.org_id, 'quote'), p_customer, p_aircraft, case when c.tax_exempt then 0 else o.tax_rate end,
          t.content ->> 'notes', coalesce(t.content ->> 'terms', o.default_quote_terms), current_date + 30, now() + interval '30 days', auth.uid())
  returning id into v_q;
  for opt in select * from jsonb_array_elements(coalesce(t.content -> 'options', '[]')) loop
    v_opt := null;
    if jsonb_array_length(t.content -> 'options') > 1 or (opt ->> 'name') is not null and (opt ->> 'name') <> '' and jsonb_array_length(t.content -> 'options') > 1 then
      insert into quote_options (org_id, quote_id, name, description, sort_order) values (t.org_id, v_q, coalesce(opt ->> 'name', 'Option'), opt ->> 'description', i)
      returning id into v_opt;
    end if;
    k := 0;
    for it in select * from jsonb_array_elements(coalesce(opt -> 'items', '[]')) loop
      insert into quote_items (org_id, quote_id, option_id, service_id, description, quantity, unit_price, taxable, sort_order)
      values (t.org_id, v_q, v_opt, nullif(it ->> 'service_id', '')::uuid, it ->> 'description', coalesce((it ->> 'quantity')::numeric, 1),
              coalesce((it ->> 'unit_price')::numeric, 0), coalesce((it ->> 'taxable')::boolean, true), k);
      k := k + 1;
    end loop;
    i := i + 1;
  end loop;
  return v_q;
end;
$$;

-- ---------------------------------------------------------------------------
-- Booking & reschedule requests (customer portal, quote acceptance)
-- ---------------------------------------------------------------------------
create table public.booking_requests (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  aircraft_id uuid references public.aircraft(id) on delete set null,
  service_id uuid references public.services(id) on delete set null,
  job_id uuid references public.jobs(id) on delete cascade,      -- reschedule target / job created from a quote
  quote_id uuid references public.quotes(id) on delete set null,
  kind text not null default 'booking' check (kind in ('booking','reschedule','quote_dates')),
  preferred jsonb not null default '[]'::jsonb,                  -- ["2026-11-02T09:00:00Z", ...]
  notes text,
  status text not null default 'pending' check (status in ('pending','approved','declined')),
  decided_by uuid references auth.users(id) on delete set null,
  decided_at timestamptz,
  result_job_id uuid references public.jobs(id) on delete set null,
  created_at timestamptz not null default now()
);
create index on public.booking_requests (org_id, status);
create trigger booking_requests_org_c before insert or update on public.booking_requests for each row execute function public.assert_same_org('customers', 'customer_id');
alter table public.booking_requests enable row level security;
create policy booking_requests_manager on public.booking_requests for all using (public.is_manager(org_id)) with check (public.is_manager(org_id));

create or replace function public.trg_booking_request_notify()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_name text;
begin
  select name into v_name from customers where id = new.customer_id;
  perform public.notify(new.org_id, 'managers', 'booking_request',
    case new.kind when 'reschedule' then 'Reschedule request' when 'quote_dates' then 'Preferred dates for an accepted quote' else 'New booking request' end,
    v_name || coalesce(': ' || left(new.notes, 100), ''), '/requests');
  return null;
end;
$$;
create trigger booking_requests_notify after insert on public.booking_requests for each row execute function public.trg_booking_request_notify();

-- ---------------------------------------------------------------------------
-- Customer portal sessions (email one-time code). Managed by the `portal`
-- edge function with the service role; managers can see and revoke access.
-- ---------------------------------------------------------------------------
create table public.portal_sessions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  email text not null,
  code_hash text,
  code_expires_at timestamptz,
  attempts int not null default 0,
  token_hash text unique,
  expires_at timestamptz,
  revoked_at timestamptz,
  last_used_at timestamptz,
  created_at timestamptz not null default now()
);
create index on public.portal_sessions (org_id, customer_id);
alter table public.portal_sessions enable row level security;
create policy portal_sessions_manager_select on public.portal_sessions for select using (public.is_manager(org_id));
create policy portal_sessions_manager_revoke on public.portal_sessions for update using (public.is_manager(org_id)) with check (public.is_manager(org_id));

create or replace function public.revoke_portal_access(p_customer uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_org uuid;
begin
  select org_id into v_org from customers where id = p_customer;
  if v_org is null or not public.is_manager(v_org) then raise exception 'Not found'; end if;
  update portal_sessions set revoked_at = now() where customer_id = p_customer and revoked_at is null;
end;
$$;

-- ---------------------------------------------------------------------------
-- Recurring care schedules
-- ---------------------------------------------------------------------------
create table public.recurring_schedules (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  branch_id uuid references public.branches(id) on delete set null,
  customer_id uuid not null references public.customers(id) on delete cascade,
  aircraft_id uuid references public.aircraft(id) on delete cascade,
  service_id uuid references public.services(id) on delete set null,
  location_id uuid references public.locations(id) on delete set null,
  title text,
  price numeric(12,2) not null default 0 check (price >= 0),
  duration_min int not null default 120 check (duration_min between 15 and 1440),
  first_at timestamptz not null,                -- first occurrence (its local time is kept)
  timezone text not null,
  every int not null default 1 check (every between 1 and 104),
  unit text not null default 'month' check (unit in ('week','month')),
  -- Optional monthly pattern: {"nth": 1..4 or -1 (last), "weekday": 0..6}
  pattern jsonb,
  default_user_id uuid references auth.users(id) on delete set null,
  notes text,
  end_rule text not null default 'never' check (end_rule in ('never','on_date','after')),
  end_on date,
  max_visits int check (max_visits > 0),
  lead_days int not null default 14 check (lead_days between 0 and 120),
  create_as text not null default 'tentative' check (create_as in ('tentative','scheduled')),
  heads_up_days int check (heads_up_days between 0 and 30),
  billing text not null default 'per_visit' check (billing in ('per_visit','care_plan')),
  care_plan_amount numeric(12,2) check (care_plan_amount >= 0),     -- monthly charge
  stripe_subscription_id text,
  care_plan_status text check (care_plan_status in ('pending','active','past_due','canceled')),
  annual_increase_pct numeric(5,2) not null default 0 check (annual_increase_pct between 0 and 50),
  paused boolean not null default false,
  skip_dates date[] not null default '{}',
  next_index int not null default 0,          -- index of the next occurrence not yet created
  visits_created int not null default 0,
  active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  check (end_rule <> 'on_date' or end_on is not null),
  check (end_rule <> 'after' or max_visits is not null),
  check (billing <> 'care_plan' or care_plan_amount is not null)
);
create index on public.recurring_schedules (org_id, active);
create trigger recurring_org_c before insert or update on public.recurring_schedules for each row execute function public.assert_same_org('customers', 'customer_id');
create trigger recurring_org_a before insert or update on public.recurring_schedules for each row execute function public.assert_same_org('aircraft', 'aircraft_id');
create trigger recurring_org_s before insert or update on public.recurring_schedules for each row execute function public.assert_same_org('services', 'service_id');
create trigger recurring_org_b before insert or update on public.recurring_schedules for each row execute function public.assert_same_org('branches', 'branch_id');
alter table public.recurring_schedules enable row level security;
create policy recurring_select on public.recurring_schedules for select using (public.is_manager(org_id));
create policy recurring_write on public.recurring_schedules for all using (public.is_manager(org_id)) with check (public.is_manager(org_id));

alter table public.jobs
  add column recurring_schedule_id uuid references public.recurring_schedules(id) on delete set null,
  add column occurrence_index int,
  add column covered_by_plan boolean not null default false,
  add column follow_up_of uuid references public.jobs(id) on delete set null;
create unique index jobs_one_per_occurrence on public.jobs (recurring_schedule_id, occurrence_index) where recurring_schedule_id is not null;

-- The n-th occurrence (0-based) of a schedule, in the schedule's time zone so
-- "9:00 AM" stays 9:00 AM across daylight-saving changes. Monthly schedules
-- either keep the day of month (clamped to month end) or follow a pattern.
create or replace function public.recur_occurrence(p_first timestamptz, p_tz text, p_every int, p_unit text, p_pattern jsonb, p_n int)
returns timestamptz language plpgsql immutable as $$
declare
  la timestamp := p_first at time zone p_tz;
  v_month date;
  v_day date;
  v_nth int; v_wd int;
  v_last date;
begin
  if p_unit = 'week' then
    return (la + make_interval(weeks => p_every * p_n)) at time zone p_tz;
  end if;
  v_month := (date_trunc('month', la) + make_interval(months => p_every * p_n))::date;
  v_last := (v_month + interval '1 month' - interval '1 day')::date;
  if p_pattern is not null and p_pattern ? 'weekday' then
    v_wd := (p_pattern ->> 'weekday')::int;
    v_nth := coalesce((p_pattern ->> 'nth')::int, 1);
    if v_nth = -1 then
      v_day := v_last - ((extract(dow from v_last)::int - v_wd + 7) % 7);
    else
      v_day := v_month + ((v_wd - extract(dow from v_month)::int + 7) % 7) + 7 * (v_nth - 1);
      if v_day > v_last then v_day := v_day - 7; end if;
    end if;
  else
    v_day := least(v_month + (extract(day from la)::int - 1), v_last);
  end if;
  return (v_day + la::time) at time zone p_tz;
end;
$$;

-- Upcoming dates for a schedule definition (used for the 6-date preview).
create or replace function public.recurring_preview(
  p_first timestamptz, p_tz text, p_every int, p_unit text, p_pattern jsonb default null,
  p_count int default 6, p_end_rule text default 'never', p_end_on date default null, p_max_visits int default null,
  p_skip date[] default '{}', p_from_index int default 0)
returns setof timestamptz language plpgsql immutable as $$
declare
  n int := p_from_index;
  got int := 0;
  t timestamptz;
begin
  while got < least(p_count, 52) and n < p_from_index + 520 loop
    exit when p_end_rule = 'after' and n >= p_max_visits;
    t := public.recur_occurrence(p_first, p_tz, p_every, p_unit, p_pattern, n);
    exit when p_end_rule = 'on_date' and (t at time zone p_tz)::date > p_end_on;
    if not ((t at time zone p_tz)::date = any(coalesce(p_skip, '{}'))) then
      return next t;
      got := got + 1;
    end if;
    n := n + 1;
  end loop;
end;
$$;

-- Price after annual increases on each start anniversary.
create or replace function public.recurring_price(s public.recurring_schedules, p_at timestamptz)
returns numeric language sql immutable as $$
  select round(s.price * power(1 + s.annual_increase_pct / 100.0,
    greatest(0, extract(year from age(p_at, s.first_at))))::numeric, 2);
$$;

-- Creates the job for one occurrence (internal).
create or replace function public._create_recurring_job(s public.recurring_schedules, p_at timestamptz, p_index int)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_job uuid;
  v_end timestamptz := p_at + make_interval(mins => s.duration_min);
  v_conf jsonb;
  v_svc services;
  v_loc uuid := coalesce(s.location_id, (select home_location_id from aircraft where id = s.aircraft_id));
begin
  select * into v_svc from services where id = s.service_id;
  insert into jobs (org_id, number, title, customer_id, aircraft_id, location_id, branch_id, status, scheduled_start, scheduled_end,
                    notes, recurring_schedule_id, occurrence_index, covered_by_plan, created_by)
  values (s.org_id, public._next_number(s.org_id, 'job'), coalesce(s.title, v_svc.name, 'Recurring care'), s.customer_id, s.aircraft_id, v_loc,
          s.branch_id, s.create_as::job_status, p_at, v_end, s.notes, s.id, p_index, s.billing = 'care_plan', s.created_by)
  on conflict do nothing
  returning id into v_job;
  if v_job is null then return null; end if;
  insert into job_items (org_id, job_id, service_id, description, quantity, unit_price, taxable, sort_order)
    values (s.org_id, v_job, s.service_id, coalesce(v_svc.name, s.title, 'Recurring care'), 1,
            case when s.billing = 'care_plan' then 0 else public.recurring_price(s, p_at) end, coalesce(v_svc.taxable, true), 0);
  insert into job_checklist_items (org_id, job_id, label, sort_order, guide_key, step_index)
    select s.org_id, v_job, step, ord::int, v_svc.guide_key, (ord - 1)::int
    from unnest(coalesce(v_svc.checklist, '{}')) with ordinality as x(step, ord);
  if s.default_user_id is not null then
    v_conf := public._conflicts_internal(s.org_id, v_job, p_at, v_end, array[s.default_user_id], v_loc);
    if jsonb_array_length(v_conf) = 0 then
      insert into job_assignments (job_id, user_id, org_id, is_primary) values (v_job, s.default_user_id, s.org_id, true);
    else
      perform public.notify(s.org_id, 'managers', 'recurring_unassigned', 'Recurring visit needs a technician',
        coalesce(s.title, v_svc.name, 'Visit') || ' on ' || to_char(p_at at time zone s.timezone, 'Mon DD HH24:MI') || ': ' ||
        (select string_agg(c ->> 'message', ' ') from jsonb_array_elements(v_conf) c), '/jobs/' || v_job);
    end if;
  end if;
  return v_job;
end;
$$;

-- Conflict check usable by the worker (no membership requirement).
create or replace function public._conflicts_internal(p_org uuid, p_job uuid, p_start timestamptz, p_end timestamptz, p_users uuid[], p_location uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v jsonb := '[]'::jsonb;
  v_tz text;
  u uuid;
begin
  select timezone into v_tz from organizations where id = p_org;
  foreach u in array coalesce(p_users, '{}') loop
    if exists (select 1 from jobs j join job_assignments a on a.job_id = j.id and a.user_id = u
               where j.org_id = p_org and j.id is distinct from p_job and j.status not in ('cancelled','completed','invoiced')
                 and j.scheduled_start < p_end and coalesce(j.scheduled_end, j.scheduled_start + interval '2 hours') > p_start) then
      v := v || jsonb_build_object('type', 'double_booked', 'user_id', u, 'message', 'Technician is already booked.');
    end if;
    if exists (select 1 from time_off where org_id = p_org and user_id = u and status = 'approved'
               and starts_on <= (p_end at time zone v_tz)::date and ends_on >= (p_start at time zone v_tz)::date) then
      v := v || jsonb_build_object('type', 'time_off', 'user_id', u, 'message', 'Technician has time off.');
    end if;
    if not exists (select 1 from crew_hours where org_id = p_org and user_id = u and weekday = extract(dow from (p_start at time zone v_tz))) then
      v := v || jsonb_build_object('type', 'off_day', 'user_id', u, 'message', 'Technician does not work that day.');
    end if;
  end loop;
  return v;
end;
$$;
revoke execute on function public._create_recurring_job(public.recurring_schedules, timestamptz, int) from public, anon, authenticated;
revoke execute on function public._conflicts_internal(uuid, uuid, timestamptz, timestamptz, uuid[], uuid) from public, anon, authenticated;

-- Creates every visit that falls inside each schedule's lead window. Run by
-- the worker (service role); also callable by managers for their company.
create or replace function public.generate_recurring_jobs(p_org uuid default null)
returns int language plpgsql security definer set search_path = public as $$
declare
  s recurring_schedules;
  t timestamptz;
  v_made int := 0;
  v_guard int;
begin
  if p_org is not null and not public.is_manager(p_org) then raise exception 'Managers only'; end if;
  if p_org is null and auth.uid() is not null then raise exception 'Specify a company'; end if;
  for s in select * from recurring_schedules where active and not paused and (p_org is null or org_id = p_org) for update skip locked loop
    v_guard := 0;
    loop
      v_guard := v_guard + 1;
      exit when v_guard > 60;
      if s.end_rule = 'after' and s.next_index >= s.max_visits then
        update recurring_schedules set active = false where id = s.id;
        exit;
      end if;
      t := public.recur_occurrence(s.first_at, s.timezone, s.every, s.unit, s.pattern, s.next_index);
      if s.end_rule = 'on_date' and (t at time zone s.timezone)::date > s.end_on then
        update recurring_schedules set active = false where id = s.id;
        exit;
      end if;
      exit when t > now() + make_interval(days => s.lead_days);
      if t >= now() - interval '1 day' and not ((t at time zone s.timezone)::date = any(s.skip_dates)) then
        if public._create_recurring_job(s, t, s.next_index) is not null then
          v_made := v_made + 1;
          s.visits_created := s.visits_created + 1;
        end if;
      end if;
      s.next_index := s.next_index + 1;
      update recurring_schedules set next_index = s.next_index, visits_created = s.visits_created where id = s.id;
    end loop;
  end loop;
  return v_made;
end;
$$;

-- Skip a single upcoming visit (cancels its job if it was already created).
create or replace function public.skip_occurrence(p_schedule uuid, p_date date)
returns void language plpgsql security definer set search_path = public as $$
declare s recurring_schedules;
begin
  select * into s from recurring_schedules where id = p_schedule;
  if not found or not public.is_manager(s.org_id) then raise exception 'Not found'; end if;
  update recurring_schedules set skip_dates = array(select distinct unnest(skip_dates || p_date)) where id = p_schedule;
  update jobs set status = 'cancelled'
    where recurring_schedule_id = p_schedule and status in ('tentative','scheduled')
      and (scheduled_start at time zone s.timezone)::date = p_date;
end;
$$;

-- ---------------------------------------------------------------------------
-- Automations & message log
-- ---------------------------------------------------------------------------
create table public.automations (
  org_id uuid not null references public.organizations(id) on delete cascade,
  key text not null check (key in ('job_reminder','on_our_way','job_complete','invoice_reminders','review_request',
                                   'quote_follow_up','recurring_heads_up','care_plan_charge')),
  enabled boolean not null default false,
  channel text not null default 'email' check (channel in ('email','sms','both')),
  settings jsonb not null default '{}'::jsonb,
  subject text,
  body text not null,
  updated_at timestamptz not null default now(),
  primary key (org_id, key)
);
alter table public.automations enable row level security;
create policy automations_select on public.automations for select using (public.is_manager(org_id));
create policy automations_write on public.automations for update using (public.is_admin(org_id)) with check (public.is_admin(org_id));

create or replace function public.seed_automations(p_org uuid)
returns void language sql security definer set search_path = public as $$
  insert into automations (org_id, key, enabled, channel, settings, subject, body) values
  (p_org, 'job_reminder', true, 'email', '{"hours_before": 24}',
    'Reminder: {service} for {asset} on {date}',
    'Hi {customer},\n\nThis is a reminder that {company} is scheduled to service {asset} on {date} at {time}{location_line}.\n\nNeed to change it? Reply to this message or use your customer portal: {portal_link}\n\nThank you,\n{company}'),
  (p_org, 'on_our_way', false, 'sms', '{}',
    null,
    '{company}: our team is on the way to {asset}{location_line}. See you soon!'),
  (p_org, 'job_complete', false, 'email', '{"include_photos": true}',
    '{asset} is ready',
    'Hi {customer},\n\nWe finished {service} on {asset}. Your before and after photos and service report are in your customer portal: {portal_link}\n\nThank you,\n{company}'),
  (p_org, 'invoice_reminders', true, 'email',
    '{"sequence_days": [-3, 0, 7, 14, 30], "late_fee": {"enabled": false, "type": "flat", "value": 25, "after_days": 30}}',
    'Invoice {invoice_number} from {company}: {balance} {due_phrase}',
    'Hi {customer},\n\nA friendly reminder that invoice {invoice_number} for {balance} is {due_phrase}.{late_fee_line}\n\nPay securely online: {pay_link}\n\nThank you,\n{company}'),
  (p_org, 'review_request', true, 'email', '{"days_after_payment": 1}',
    'How did we do, {customer}?',
    'Hi {customer},\n\nThank you for choosing {company}. If you were happy with our work on {asset}, a quick Google review would mean a lot: {review_link}\n\nThank you,\n{company}'),
  (p_org, 'quote_follow_up', true, 'email', '{"after_days": 3, "before_deadline_hours": 24}',
    'Your quote {quote_number} from {company}',
    'Hi {customer},\n\nJust following up on quote {quote_number} for {asset} ({total}). It is valid until {deadline}.\n\nReview and approve it here: {quote_link}\n\nQuestions? Reply to this message.\n\n{company}'),
  (p_org, 'recurring_heads_up', true, 'email', '{"days_before": 3}',
    'Upcoming visit: {service} on {date}',
    'Hi {customer},\n\nYour next {service} for {asset} is coming up on {date} at {time}.\n\nNeed a different day? Request a new time here: {portal_link}\n\n{company}'),
  (p_org, 'care_plan_charge', true, 'email', '{}',
    'Your {company} care plan receipt',
    'Hi {customer},\n\nThank you! We received {amount} for your monthly care plan for {asset}.\n\n{company}')
  on conflict do nothing;
$$;
revoke execute on function public.seed_automations(uuid) from public, anon, authenticated;
select public.seed_automations(id) from public.organizations;

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete set null,
  channel text not null check (channel in ('email','sms')),
  direction text not null default 'out' check (direction in ('out','in')),
  to_address text,
  from_address text,
  subject text,
  body text not null,
  status text not null default 'queued' check (status in ('queued','sent','delivered','opened','bounced','failed','received','blocked')),
  provider_id text,
  error text,
  automation_key text,
  invoice_id uuid references public.invoices(id) on delete set null,
  quote_id uuid references public.quotes(id) on delete set null,
  job_id uuid references public.jobs(id) on delete set null,
  dedupe_key text,
  send_after timestamptz not null default now(),
  sent_at timestamptz,
  delivered_at timestamptz,
  opened_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);
create unique index messages_dedupe on public.messages (org_id, dedupe_key) where dedupe_key is not null;
create index on public.messages (status, send_after) where status = 'queued';
create index on public.messages (org_id, customer_id, created_at desc);
create index on public.messages (provider_id) where provider_id is not null;
create trigger messages_org_c before insert or update on public.messages for each row execute function public.assert_same_org('customers', 'customer_id');
alter table public.messages enable row level security;
create policy messages_select on public.messages for select using (public.is_manager(org_id));
-- Staff queue manual messages; the worker sends them. Only queued outbound rows.
create policy messages_insert on public.messages for insert with check (public.is_manager(org_id) and status in ('queued','blocked') and direction = 'out');
-- "Fix email & resend": requeue a failed or bounced message.
create policy messages_update on public.messages for update using (public.is_manager(org_id)) with check (public.is_manager(org_id) and status in ('queued','failed','bounced','sent','delivered','opened','blocked'));

-- Texting allowance per plan per calendar month (plus purchased packs).
create or replace function public.sms_allowance(p_org uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'included', case public.effective_plan(p_org) when 'solo' then 250 when 'team' then 1000 when 'fleet' then 3000 when 'trial' then 100 else 0 end,
    'extra', (select sms_extra_credits from organizations where id = p_org),
    'used', (select count(*) from messages where org_id = p_org and channel = 'sms' and direction = 'out'
             and status not in ('queued','failed','blocked') and sent_at >= date_trunc('month', now())));
$$;

-- ---------------------------------------------------------------------------
-- Invoices: company snapshot when sent, late fee marker, auto-send
-- ---------------------------------------------------------------------------
alter table public.invoices
  add column org_snapshot jsonb,
  add column late_fee_applied_at timestamptz,
  add column covered_by_plan boolean not null default false;

create or replace function public.trg_invoice_snapshot()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status <> 'draft' and new.org_snapshot is null then
    select jsonb_build_object('name', name, 'email', email, 'phone', phone, 'address', address, 'website', website,
                              'logo_url', logo_url, 'google_review_url', google_review_url)
      into new.org_snapshot from organizations where id = new.org_id;
    new.sent_at := coalesce(new.sent_at, now());
  end if;
  return new;
end;
$$;
create trigger invoices_snapshot before insert or update of status on public.invoices for each row execute function public.trg_invoice_snapshot();

-- Internal invoice creation (used by the manager RPC and by auto-send).
create or replace function public._create_invoice_for_job(p_job uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  j jobs;
  o organizations;
  c customers;
  v_inv uuid;
  v_disc numeric;
begin
  select * into j from jobs where id = p_job;
  select * into o from organizations where id = j.org_id;
  select * into c from customers where id = j.customer_id;
  insert into invoices (org_id, number, customer_id, job_id, aircraft_id, branch_id, tax_rate, due_date, notes, created_by, covered_by_plan)
  values (j.org_id, public._next_number(j.org_id, 'invoice'), j.customer_id, j.id, j.aircraft_id, j.branch_id,
          case when c.tax_exempt then 0 else o.tax_rate end,
          current_date + coalesce(c.payment_terms_days, o.payment_terms_days),
          o.default_invoice_notes, auth.uid(), j.covered_by_plan)
  returning id into v_inv;
  insert into invoice_items (org_id, invoice_id, service_id, description, quantity, unit_price, taxable, sort_order)
    select org_id, v_inv, service_id, description, quantity, unit_price, taxable, sort_order
    from job_items where job_id = j.id;
  select round(subtotal * c.discount_pct / 100, 2) into v_disc from invoices where id = v_inv;
  if v_disc > 0 then
    perform set_config('app.system_discount', 'on', true);
    update invoices set discount = v_disc where id = v_inv;
    perform set_config('app.system_discount', 'off', true);
  end if;
  -- A deposit paid when the quote was accepted counts toward this invoice.
  insert into payments (org_id, invoice_id, amount, method, reference, received_at, stripe_payment_intent_id)
    select j.org_id, v_inv, q.deposit_amount, 'card', 'Deposit on quote ' || q.number, q.deposit_paid_at, q.deposit_payment_intent
    from quotes q where q.id = j.quote_id and q.deposit_paid_at is not null and q.deposit_amount > 0
      and not exists (select 1 from payments p where p.stripe_payment_intent_id = q.deposit_payment_intent and q.deposit_payment_intent is not null);
  update jobs set status = 'invoiced' where id = j.id and status in ('completed','in_progress','scheduled','on_hold','tentative');
  return v_inv;
end;
$$;
revoke execute on function public._create_invoice_for_job(uuid) from public, anon, authenticated;

create or replace function public.create_invoice_from_job(p_job uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_org uuid;
begin
  select org_id into v_org from jobs where id = p_job;
  if v_org is null or not public.is_manager(v_org) or not public.can_money(v_org) then raise exception 'Job not found'; end if;
  return public._create_invoice_for_job(p_job);
end;
$$;

-- ---------------------------------------------------------------------------
-- Quote → job. Customer acceptance creates a Tentative job automatically.
-- ---------------------------------------------------------------------------
create or replace function public._job_from_quote(p_quote uuid, p_start timestamptz, p_status job_status)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  q quotes;
  v_job uuid;
  v_opt uuid;
begin
  select * into q from quotes where id = p_quote;
  select id into v_job from jobs where quote_id = q.id and status <> 'cancelled' order by created_at limit 1;
  if v_job is not null then
    if p_status = 'scheduled' then
      update jobs set status = 'scheduled', scheduled_start = coalesce(p_start, scheduled_start),
        scheduled_end = coalesce(p_start + interval '4 hours', scheduled_end)
      where id = v_job and status = 'tentative';
    end if;
    return v_job;
  end if;
  v_opt := coalesce(q.selected_option_id, (select id from quote_options where quote_id = q.id order by sort_order limit 1));
  insert into jobs (org_id, number, customer_id, aircraft_id, location_id, branch_id, quote_id, status, scheduled_start, scheduled_end, notes, created_by, title)
  values (q.org_id, public._next_number(q.org_id, 'job'), q.customer_id, q.aircraft_id, q.location_id, q.branch_id, q.id, p_status,
          p_start, p_start + interval '4 hours', q.notes, coalesce(auth.uid(), q.created_by),
          (select string_agg(description, ', ' order by sort_order) from quote_items where quote_id = q.id and (v_opt is null or option_id = v_opt)))
  returning id into v_job;
  insert into job_items (org_id, job_id, service_id, description, quantity, unit_price, taxable, sort_order)
    select org_id, v_job, service_id, description, quantity, unit_price, taxable, sort_order
    from quote_items where quote_id = q.id and (v_opt is null or option_id = v_opt);
  -- Discounts carry over as a negative line so the job total matches the quote.
  if q.discount > 0 then
    insert into job_items (org_id, job_id, description, quantity, unit_price, taxable, sort_order)
      values (q.org_id, v_job, 'Discount', 1, -least(q.discount, q.subtotal), false, 9999);
  end if;
  insert into job_checklist_items (org_id, job_id, label, sort_order, guide_key, step_index)
    select q.org_id, v_job, step, (qi.sort_order * 100 + ord)::int, s.guide_key, (ord - 1)::int
    from quote_items qi
    join services s on s.id = qi.service_id
    cross join lateral unnest(s.checklist) with ordinality as t(step, ord)
    where qi.quote_id = q.id and (v_opt is null or qi.option_id = v_opt);
  return v_job;
end;
$$;
revoke execute on function public._job_from_quote(uuid, timestamptz, job_status) from public, anon, authenticated;

-- Job items may carry a negative discount line.
alter table public.job_items drop constraint if exists job_items_quantity_check;
alter table public.job_items add constraint job_items_quantity_check check (quantity > 0);

create or replace function public.convert_quote_to_job(p_quote uuid, p_start timestamptz default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  q quotes;
  v_job uuid;
begin
  select * into q from quotes where id = p_quote;
  if not found or not public.is_manager(q.org_id) or not public.can_money(q.org_id) then raise exception 'Quote not found'; end if;
  v_job := public._job_from_quote(p_quote, p_start, 'scheduled');
  perform set_config('app.quote_unlock', 'on', true);
  update quotes set status = 'accepted', accepted_at = coalesce(accepted_at, now()) where id = q.id;
  perform set_config('app.quote_unlock', 'off', true);
  return v_job;
end;
$$;

-- ---------------------------------------------------------------------------
-- Public customer documents (quote / invoice links)
-- ---------------------------------------------------------------------------
create or replace function public.get_public_document(p_kind text, p_token text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v jsonb;
  q quotes;
begin
  if p_kind = 'quote' then
    select * into q from quotes where public_token = p_token;
    if not found or q.status = 'draft' then return null; end if;
    -- Expire on read once the deadline passes.
    if q.status in ('sent','viewed') and coalesce(q.valid_until_at, (q.valid_until + time '23:59') at time zone 'UTC') < now() then
      perform set_config('app.quote_unlock', 'on', true);
      update quotes set status = 'expired' where id = q.id;
      q.status := 'expired';
    end if;
    perform set_config('app.quote_unlock', 'on', true);
    update quotes set view_count = view_count + 1, last_viewed_at = now(), first_viewed_at = coalesce(first_viewed_at, now()),
      status = case when status = 'sent' then 'viewed' else status end
    where id = q.id;
    perform set_config('app.quote_unlock', 'off', true);
    -- Alert on the first view and on views after a quiet day.
    if q.last_viewed_at is null or q.last_viewed_at < now() - interval '24 hours' then
      perform public.notify(q.org_id, 'managers', 'quote_viewed', 'Quote ' || q.number || ' opened',
        (select name from customers where id = q.customer_id) || ' is looking at your quote now.', '/quotes/' || q.id);
    end if;
    select jsonb_build_object(
      'kind', 'quote',
      'doc', to_jsonb(x) - 'public_token' - 'created_by' - 'deposit_payment_intent',
      'items', (select coalesce(jsonb_agg(to_jsonb(i) order by i.sort_order), '[]') from quote_items i where i.quote_id = x.id),
      'options', (select coalesce(jsonb_agg(to_jsonb(op) order by op.sort_order), '[]') from quote_options op where op.quote_id = x.id),
      'photo_count', (select count(*) from quote_photos where quote_id = x.id),
      'org', jsonb_build_object('name', o.name, 'email', o.email, 'phone', o.phone, 'address', o.address, 'logo_url', o.logo_url,
                                'currency', o.currency, 'accepts_cards', o.stripe_charges_enabled and o.payment_mode = 'stripe' and not o.is_demo,
                                'timezone', o.timezone, 'payment_mode', o.payment_mode, 'public_slug', o.public_slug),
      'customer', jsonb_build_object('name', c.name, 'company', c.company, 'email', c.email, 'billing_address', c.billing_address),
      'aircraft', (select jsonb_build_object('tail_number', a.tail_number, 'model', concat_ws(' ', a.manufacturer, a.model), 'asset_type', a.asset_type) from aircraft a where a.id = x.aircraft_id),
      'superseded', x.superseded_by is not null,
      'job_requested', exists (select 1 from booking_requests b where b.quote_id = x.id)
    ) into v
    from quotes x join organizations o on o.id = x.org_id join customers c on c.id = x.customer_id
    where x.id = q.id;
  elsif p_kind = 'invoice' then
    select jsonb_build_object(
      'kind', 'invoice', 'doc', to_jsonb(i) - 'public_token' - 'created_by',
      'items', (select coalesce(jsonb_agg(to_jsonb(x) order by x.sort_order), '[]') from invoice_items x where x.invoice_id = i.id),
      'org', coalesce(i.org_snapshot, jsonb_build_object('name', o.name, 'email', o.email, 'phone', o.phone, 'address', o.address, 'logo_url', o.logo_url))
             || jsonb_build_object('currency', o.currency,
                                   'accepts_cards', o.stripe_charges_enabled and o.payment_mode = 'stripe' and not o.is_demo,
                                   'google_review_url', coalesce(i.org_snapshot ->> 'google_review_url', o.google_review_url),
                                   'payment_mode', o.payment_mode, 'public_slug', o.public_slug),
      'customer', jsonb_build_object('name', c.name, 'company', c.company, 'email', c.email, 'billing_address', c.billing_address),
      'aircraft', (select jsonb_build_object('tail_number', a.tail_number, 'model', concat_ws(' ', a.manufacturer, a.model), 'asset_type', a.asset_type) from aircraft a where a.id = i.aircraft_id)
    ) into v
    from invoices i join organizations o on o.id = i.org_id join customers c on c.id = i.customer_id
    where i.public_token = p_token and i.status <> 'draft';
  end if;
  return v;
end;
$$;

-- Customer accepts (choosing an option when there are several) and signs.
drop function if exists public.accept_public_quote(text, text);
create or replace function public.accept_public_quote(p_token text, p_name text, p_option uuid default null, p_signature text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  q quotes;
  v_job uuid;
begin
  if coalesce(length(trim(p_name)), 0) < 2 then raise exception 'Please type your full name to accept'; end if;
  select * into q from quotes where public_token = p_token for update;
  if not found or q.status not in ('sent','viewed') or q.superseded_by is not null
     or coalesce(q.valid_until_at, (q.valid_until + time '23:59') at time zone 'UTC') < now() then
    return jsonb_build_object('ok', false);
  end if;
  if exists (select 1 from quote_options where quote_id = q.id) then
    if p_option is null or not exists (select 1 from quote_options where id = p_option and quote_id = q.id) then
      raise exception 'Please choose one of the options';
    end if;
  end if;
  perform set_config('app.quote_unlock', 'on', true);
  update quotes set selected_option_id = coalesce(p_option, selected_option_id) where id = q.id;
  update quotes set status = 'accepted', accepted_at = now(), accepted_name = trim(p_name), signature_svg = left(p_signature, 200000)
    where id = q.id;
  perform set_config('app.quote_unlock', 'off', true);
  select * into q from quotes where id = q.id;
  v_job := public._job_from_quote(q.id, null, 'tentative');
  insert into activities (org_id, customer_id, kind, body)
    values (q.org_id, q.customer_id, 'system', 'Quote ' || q.number || ' accepted online by ' || trim(p_name)
            || coalesce(' (' || (select name from quote_options where id = q.selected_option_id) || ')', ''));
  perform public.notify(q.org_id, 'managers', 'quote_accepted', 'Quote ' || q.number || ' accepted',
    trim(p_name) || ' approved ' || to_char(q.total, 'FM$999,999,990.00') || '. A tentative job was created.', '/jobs/' || v_job);
  return jsonb_build_object('ok', true, 'deposit_due', case when q.deposit_amount > 0 and q.deposit_paid_at is null then q.deposit_amount else 0 end);
end;
$$;

create or replace function public.decline_public_quote(p_token text, p_reason text, p_note text default null)
returns boolean language plpgsql security definer set search_path = public as $$
declare q quotes;
begin
  if p_reason not in ('price','timing','went_elsewhere','other') then raise exception 'Choose a reason'; end if;
  select * into q from quotes where public_token = p_token;
  if not found or q.status not in ('sent','viewed') or q.superseded_by is not null then return false; end if;
  perform set_config('app.quote_unlock', 'on', true);
  update quotes set status = 'declined', declined_at = now(), decline_reason = p_reason, decline_note = left(p_note, 1000) where id = q.id;
  perform set_config('app.quote_unlock', 'off', true);
  insert into activities (org_id, customer_id, kind, body)
    values (q.org_id, q.customer_id, 'system', 'Quote ' || q.number || ' declined online (' || replace(p_reason, '_', ' ') || ')' || coalesce(': ' || p_note, ''));
  perform public.notify(q.org_id, 'managers', 'quote_declined', 'Quote ' || q.number || ' declined',
    replace(p_reason, '_', ' ') || coalesce(' — ' || left(p_note, 100), ''), '/quotes/' || q.id);
  return true;
end;
$$;

-- After accepting, the customer can suggest dates for the work.
create or replace function public.request_quote_dates(p_token text, p_dates timestamptz[], p_notes text default null)
returns boolean language plpgsql security definer set search_path = public as $$
declare q quotes; v_job uuid;
begin
  select * into q from quotes where public_token = p_token;
  if not found or q.status <> 'accepted' then return false; end if;
  if coalesce(array_length(p_dates, 1), 0) = 0 or array_length(p_dates, 1) > 5 then raise exception 'Choose 1 to 5 dates'; end if;
  select id into v_job from jobs where quote_id = q.id and status <> 'cancelled' order by created_at limit 1;
  insert into booking_requests (org_id, customer_id, aircraft_id, job_id, quote_id, kind, preferred, notes)
    values (q.org_id, q.customer_id, q.aircraft_id, v_job, q.id, 'quote_dates', to_jsonb(p_dates), left(p_notes, 1000));
  return true;
end;
$$;

revoke execute on function public.accept_public_quote(text, text, uuid, text) from public;
revoke execute on function public.decline_public_quote(text, text, text) from public;
revoke execute on function public.request_quote_dates(text, timestamptz[], text) from public;
grant execute on function public.accept_public_quote(text, text, uuid, text) to anon, authenticated;
grant execute on function public.decline_public_quote(text, text, text) to anon, authenticated;
grant execute on function public.request_quote_dates(text, timestamptz[], text) to anon, authenticated;

-- Approving a booking/reschedule/date request turns it into a scheduled job.
create or replace function public.approve_booking_request(p_request uuid, p_start timestamptz, p_end timestamptz, p_crew uuid[] default '{}', p_override boolean default false)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  r booking_requests;
  v_job uuid;
  s services;
begin
  select * into r from booking_requests where id = p_request for update;
  if not found or not public.is_manager(r.org_id) then raise exception 'Request not found'; end if;
  if r.status <> 'pending' then raise exception 'This request was already handled'; end if;
  v_job := r.job_id;
  if v_job is null then
    select * into s from services where id = r.service_id;
    insert into jobs (org_id, number, title, customer_id, aircraft_id, location_id, status, created_by)
      values (r.org_id, public._next_number(r.org_id, 'job'), coalesce(s.name, 'Requested service'), r.customer_id, r.aircraft_id,
              (select home_location_id from aircraft where id = r.aircraft_id), 'tentative', auth.uid())
      returning id into v_job;
    if s.id is not null then
      insert into job_items (org_id, job_id, service_id, description, quantity, unit_price, taxable)
        values (r.org_id, v_job, s.id, s.name, 1, 0, s.taxable);
      insert into job_checklist_items (org_id, job_id, label, sort_order, guide_key, step_index)
        select r.org_id, v_job, step, ord::int, s.guide_key, (ord - 1)::int from unnest(s.checklist) with ordinality as x(step, ord);
    end if;
  end if;
  perform public.schedule_job(v_job, p_start, p_end, p_crew, p_crew[1], '{}', null, 0, 0, p_override, true);
  update booking_requests set status = 'approved', decided_by = auth.uid(), decided_at = now(), result_job_id = v_job where id = r.id;
  return v_job;
end;
$$;

create or replace function public.decline_booking_request(p_request uuid)
returns void language plpgsql security definer set search_path = public as $$
declare r booking_requests;
begin
  select * into r from booking_requests where id = p_request;
  if not found or not public.is_manager(r.org_id) then raise exception 'Request not found'; end if;
  update booking_requests set status = 'declined', decided_by = auth.uid(), decided_at = now() where id = p_request and status = 'pending';
end;
$$;

-- ---------------------------------------------------------------------------
-- Job workflow rules on status change
-- ---------------------------------------------------------------------------
alter table public.service_reminders
  add column recur_every int,
  add column recur_unit text check (recur_unit in ('week','month'));

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
    insert into inventory_movements (org_id, item_id, delta, reason, job_id, auto, note)
      select new.org_id, ss.item_id, -sum(ss.quantity * ceil(ji.quantity))::numeric, 'job_use', new.id, true, 'Auto-deducted on completion'
      from job_items ji join service_supplies ss on ss.service_id = ji.service_id
      where ji.job_id = new.id
      group by ss.item_id
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

-- Auto-send: completing a job creates and sends the invoice when enabled.
create or replace function public.trg_job_auto_invoice()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_inv uuid;
begin
  if new.status = 'completed' and old.status is distinct from 'completed' and not new.covered_by_plan
     and (select auto_send_invoices from organizations where id = new.org_id)
     and not exists (select 1 from invoices where job_id = new.id and status <> 'void')
     and exists (select 1 from job_items where job_id = new.id) then
    v_inv := public._create_invoice_for_job(new.id);
    update invoices set status = 'sent' where id = v_inv;
  end if;
  return null;
end;
$$;
create trigger jobs_auto_invoice after update of status on public.jobs for each row execute function public.trg_job_auto_invoice();

-- Reminder titles/intervals no longer use fixed days.
alter table public.services drop column recurring_interval_days;

-- Defaults for new companies.
create or replace function public.seed_org_defaults(p_org uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.seed_automations(p_org);
end;
$$;

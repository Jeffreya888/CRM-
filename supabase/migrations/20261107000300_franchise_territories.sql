-- Franchise territories and lead routing.
--
-- HQ assigns airports (ICAO/FAA codes) and zip codes to locations; each code belongs to one
-- location only. The brand's public booking page sends each request to the location that
-- owns the customer's airport, else their zip code (exact, then the first three digits),
-- else HQ. The request lands in that location's Booking requests like any portal request.

alter table public.franchise_networks
  add column public_slug text unique check (public_slug is null or public_slug ~ '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$'),
  add column booking_enabled boolean not null default false;

create table public.franchise_territories (
  network_id uuid not null references public.franchise_networks(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  kind text not null check (kind in ('airport', 'zip')),
  code text not null check (code ~ '^[A-Z0-9]{3,5}$'),
  primary key (network_id, kind, code)
);
create index on public.franchise_territories (org_id);

create table public.franchise_leads (
  id uuid primary key default gen_random_uuid(),
  network_id uuid not null references public.franchise_networks(id) on delete cascade,
  org_id uuid references public.organizations(id) on delete set null,
  matched_by text not null check (matched_by in ('airport', 'zip', 'zip3', 'hq')),
  airport text,
  zip text,
  email text not null,
  booking_request_id uuid references public.booking_requests(id) on delete set null,
  created_at timestamptz not null default now()
);
create index on public.franchise_leads (network_id, created_at);
create index on public.franchise_leads (network_id, email, created_at);

alter table public.franchise_territories enable row level security;
alter table public.franchise_leads enable row level security;
create policy franchise_territories_read on public.franchise_territories for select
  using (public.franchise_hq_admin(network_id) or public.is_member(org_id));
create policy franchise_leads_read on public.franchise_leads for select
  using (public.franchise_hq_admin(network_id));
revoke insert, update, delete on public.franchise_territories, public.franchise_leads from authenticated, anon;
grant select on public.franchise_territories, public.franchise_leads to authenticated;

-- A location leaving takes its territories with it.
create or replace function public.trg_franchise_member_left() returns trigger language plpgsql security definer set search_path = public as $$
begin
  delete from franchise_territories where network_id = old.network_id and org_id = old.org_id;
  return old;
end $$;
create trigger franchise_member_left after delete on public.franchise_members
  for each row execute function public.trg_franchise_member_left();

-- HQ: set a location's airports and zip codes (replaces what it had).
create or replace function public.franchise_set_territories(p_network uuid, p_org uuid, p_airports text[], p_zips text[])
returns void language plpgsql security definer set search_path = public as $$
declare
  codes text[];
  c text;
  taken text;
begin
  if not public.franchise_hq_admin(p_network) then raise exception 'Only franchise HQ admins can set territories'; end if;
  if not exists (select 1 from franchise_members where network_id = p_network and org_id = p_org)
     and not exists (select 1 from franchise_networks where id = p_network and hq_org_id = p_org) then
    raise exception 'That company is not in this network';
  end if;
  delete from franchise_territories where network_id = p_network and org_id = p_org;
  codes := array(select distinct upper(trim(x)) from unnest(coalesce(p_airports, '{}')) x where trim(x) <> '');
  foreach c in array codes loop
    if c !~ '^[A-Z0-9]{3,4}$' then raise exception 'TERRITORY: % is not an airport code (use codes like KHOU or HOU)', c; end if;
    select coalesce(m.location_name, o.name) into taken from franchise_territories t join organizations o on o.id = t.org_id
      left join franchise_members m on m.org_id = t.org_id where t.network_id = p_network and t.kind = 'airport' and t.code = c;
    if taken is not null then raise exception 'TERRITORY: % already belongs to %', c, taken; end if;
    insert into franchise_territories (network_id, org_id, kind, code) values (p_network, p_org, 'airport', c);
  end loop;
  codes := array(select distinct trim(x) from unnest(coalesce(p_zips, '{}')) x where trim(x) <> '');
  foreach c in array codes loop
    if c !~ '^[0-9]{3}$' and c !~ '^[0-9]{5}$' then raise exception 'TERRITORY: % is not a zip code (use 5 digits, or the first 3 for an area)', c; end if;
    select coalesce(m.location_name, o.name) into taken from franchise_territories t join organizations o on o.id = t.org_id
      left join franchise_members m on m.org_id = t.org_id where t.network_id = p_network and t.kind = 'zip' and t.code = c;
    if taken is not null then raise exception 'TERRITORY: % already belongs to %', c, taken; end if;
    insert into franchise_territories (network_id, org_id, kind, code) values (p_network, p_org, 'zip', c);
  end loop;
end $$;

-- HQ: turn the brand booking page on or off and set its web address (gettarmo.com/book/<slug>).
create or replace function public.franchise_set_booking(p_network uuid, p_enabled boolean, p_slug text)
returns text language plpgsql security definer set search_path = public as $$
declare s text := lower(regexp_replace(trim(coalesce(p_slug, '')), '[^a-zA-Z0-9]+', '-', 'g'));
begin
  if not public.franchise_hq_admin(p_network) then raise exception 'Only franchise HQ admins can change the booking page'; end if;
  s := trim(both '-' from s);
  if s !~ '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$' then raise exception 'Use 3 to 40 letters, numbers or dashes for the page address'; end if;
  if exists (select 1 from franchise_networks where public_slug = s and id <> p_network) then raise exception 'That page address is taken. Try another.'; end if;
  update franchise_networks set public_slug = s, booking_enabled = coalesce(p_enabled, false) where id = p_network;
  return s;
end $$;

-- Which location gets a request for this airport or zip code.
create or replace function public.franchise_route(p_network uuid, p_airport text, p_zip text)
returns table (org_id uuid, matched_by text) language plpgsql stable security definer set search_path = public as $$
declare a text := upper(trim(coalesce(p_airport, ''))); z text := substr(regexp_replace(coalesce(p_zip, ''), '[^0-9]', '', 'g'), 1, 5);
begin
  if a <> '' then
    return query select t.org_id, 'airport'::text from franchise_territories t where t.network_id = p_network and t.kind = 'airport'
      and (t.code = a or (length(a) = 3 and t.code = 'K' || a) or (length(a) = 4 and a like 'K%' and t.code = substr(a, 2))) limit 1;
    if found then return; end if;
  end if;
  if length(z) = 5 then
    return query select t.org_id, 'zip'::text from franchise_territories t where t.network_id = p_network and t.kind = 'zip' and t.code = z limit 1;
    if found then return; end if;
    return query select t.org_id, 'zip3'::text from franchise_territories t where t.network_id = p_network and t.kind = 'zip' and t.code = substr(z, 1, 3) limit 1;
    if found then return; end if;
  end if;
  return query select n.hq_org_id, 'hq'::text from franchise_networks n where n.id = p_network;
end $$;

-- Public brand page info: name and locations with their airports.
create or replace function public.franchise_public_info(p_slug text)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'name', n.name,
    'locations', coalesce((
      select jsonb_agg(jsonb_build_object('name', coalesce(m.location_name, o.name),
        'airports', coalesce((select jsonb_agg(t.code order by t.code) from franchise_territories t where t.network_id = n.id and t.org_id = m.org_id and t.kind = 'airport'), '[]'))
        order by coalesce(m.location_name, o.name))
      from franchise_members m join organizations o on o.id = m.org_id where m.network_id = n.id), '[]'))
  from franchise_networks n where n.public_slug = lower(trim(p_slug)) and n.booking_enabled;
$$;

-- A request from the brand booking page (called by the brand-request function only).
create or replace function public.franchise_submit_lead(
  p_slug text, p_name text, p_email text, p_phone text, p_company text, p_airport text, p_zip text,
  p_asset text, p_service text, p_preferred jsonb, p_notes text
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  net franchise_networks;
  r record;
  v_email text := lower(trim(coalesce(p_email, '')));
  v_cust uuid;
  v_req uuid;
  v_loc text;
  v_notes text;
begin
  select * into net from franchise_networks where public_slug = lower(trim(p_slug)) and booking_enabled;
  if net.id is null then raise exception 'This booking page is not available'; end if;
  if char_length(trim(coalesce(p_name, ''))) not between 2 and 120 then raise exception 'Please enter your name'; end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or char_length(v_email) > 200 then raise exception 'Please enter a valid email'; end if;
  if (select count(*) from franchise_leads where network_id = net.id and email = v_email and created_at > now() - interval '1 day') >= 5 then
    raise exception 'We already have your requests. The team will be in touch soon.';
  end if;
  if (select count(*) from franchise_leads where network_id = net.id and created_at > now() - interval '1 hour') >= 200 then
    raise exception 'Too many requests right now. Please try again later.';
  end if;

  select * into r from public.franchise_route(net.id, p_airport, p_zip);
  select id into v_cust from customers where org_id = r.org_id and lower(email) = v_email limit 1;
  if v_cust is null then
    insert into customers (org_id, name, company, email, phone, source)
    values (r.org_id, left(trim(p_name), 120), nullif(left(trim(coalesce(p_company, '')), 120), ''), v_email,
            nullif(left(trim(coalesce(p_phone, '')), 40), ''), 'Brand booking page')
    returning id into v_cust;
  end if;
  v_notes := concat_ws(E'\n',
    'From the ' || net.name || ' booking page' || case r.matched_by when 'hq' then ' (no location covers this area yet)' else '' end || '.',
    case when nullif(trim(coalesce(p_service, '')), '') is not null then 'Service: ' || left(trim(p_service), 200) end,
    case when nullif(trim(coalesce(p_asset, '')), '') is not null then 'Aircraft / boat / vehicle: ' || left(trim(p_asset), 200) end,
    case when nullif(trim(coalesce(p_airport, '')), '') is not null then 'Airport: ' || upper(left(trim(p_airport), 10)) end,
    case when nullif(trim(coalesce(p_zip, '')), '') is not null then 'Zip: ' || left(trim(p_zip), 10) end,
    case when nullif(trim(coalesce(p_phone, '')), '') is not null then 'Phone: ' || left(trim(p_phone), 40) end,
    nullif(left(trim(coalesce(p_notes, '')), 1000), ''));
  insert into booking_requests (org_id, customer_id, kind, preferred, notes)
  values (r.org_id, v_cust, 'booking',
          case when jsonb_typeof(p_preferred) = 'array' then (select coalesce(jsonb_agg(x), '[]') from (select x from jsonb_array_elements(p_preferred) x limit 3) s) else '[]' end,
          v_notes)
  returning id into v_req;
  insert into franchise_leads (network_id, org_id, matched_by, airport, zip, email, booking_request_id)
  values (net.id, r.org_id, r.matched_by, nullif(upper(trim(coalesce(p_airport, ''))), ''), nullif(trim(coalesce(p_zip, '')), ''), v_email, v_req);
  select coalesce(m.location_name, o.name) into v_loc from organizations o left join franchise_members m on m.org_id = o.id where o.id = r.org_id;
  return jsonb_build_object('location', v_loc, 'matched_by', r.matched_by);
end $$;

-- HQ: requests per location for a period, including ones no location covered.
create or replace function public.franchise_lead_counts(p_network uuid, p_from timestamptz, p_to timestamptz)
returns table (org_id uuid, matched_by text, leads int) language plpgsql stable security definer set search_path = public as $$
begin
  if not public.franchise_hq_admin(p_network) then raise exception 'Only franchise HQ admins can see network reports'; end if;
  return query select l.org_id, l.matched_by, count(*)::int from franchise_leads l
    where l.network_id = p_network and l.created_at >= p_from and l.created_at < p_to group by 1, 2;
end $$;

revoke execute on function public.franchise_set_territories(uuid, uuid, text[], text[]), public.franchise_set_booking(uuid, boolean, text),
  public.franchise_route(uuid, text, text), public.franchise_public_info(text), public.franchise_lead_counts(uuid, timestamptz, timestamptz),
  public.franchise_submit_lead(text, text, text, text, text, text, text, text, text, jsonb, text) from public, anon, authenticated;
grant execute on function public.franchise_set_territories(uuid, uuid, text[], text[]), public.franchise_set_booking(uuid, boolean, text),
  public.franchise_lead_counts(uuid, timestamptz, timestamptz) to authenticated;

-- Demo sample network: locations get airports and zip codes, and the booking page is on.
create or replace function public.create_demo_franchise() returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_org uuid;
  v_exp timestamptz;
  v_net uuid;
  v_loc uuid;
  v_cust uuid;
  v_ac uuid;
  v_inv uuid;
  v_when timestamptz;
  v_amt numeric;
  loc record;
  i int;
  models text[][] := array[['Gulfstream','G650'],['Bombardier','Challenger 350'],['Cessna','Citation XLS+'],['Embraer','Phenom 300'],
                           ['Dassault','Falcon 2000'],['Pilatus','PC-12'],['Beechcraft','King Air 350'],['Gulfstream','G280']];
begin
  select o.id, o.demo_expires_at into v_org, v_exp
  from memberships m join organizations o on o.id = m.org_id
  where m.user_id = v_uid and m.active and m.role = 'owner' and o.is_demo limit 1;
  if v_org is null then raise exception 'The sample network is only available in the demo workspace'; end if;
  select id into v_net from franchise_networks where hq_org_id = v_org;
  if v_net is not null then return v_net; end if;

  insert into franchise_networks (hq_org_id, name, royalty_pct, marketing_pct, hq_playbook)
  values (v_org, 'Skyline Aircraft Detailing Network', 6, 2,
          E'Brand standard: every aircraft leaves inspection-ready. Double-check every surface from different angles before calling a job done.\n'
          'Never use bleach or bleach-based products on an aircraft.\nAlways follow a damp towel with a dry towel.\n'
          'At airport gates, wait for the gate to close behind you so no one follows you in.\n'
          'Report any damage found during the pre-service inspection to your manager right away.')
  returning id into v_net;
  update services set franchise_push = true, franchise_lock = true where org_id = v_org and guide_key in ('exterior_wash', 'brightwork_polish', 'dry_wash');
  update services set franchise_push = true, franchise_lock = false where org_id = v_org and guide_key = 'interior_detail';

  perform set_config('tarmo.franchise_sync', '1', true);
  for loc in select * from (values
      ('Skyline Houston', 'Greater Houston', 14, 2150, 8, true, 0, 5, array['KHOU','KIAH','KSGR'], array['770','773','774']),
      ('Skyline Dallas',  'Dallas–Fort Worth', 10, 1780, 6, false, 1, 5, array['KDAL','KADS','KDFW'], array['752','750']),
      ('Skyline Scottsdale', 'Phoenix area', 8, 2420, 5, true, 0, 5, array['KSDL','KPHX','KDVT'], array['852']),
      ('Skyline Austin',  'Central Texas', 5, 1290, 2, false, 3, 4, array['KAUS','KEDC'], array['787'])
    ) as t(name, terr, jobs, avg_amt, quotes_won, share, qc_fail, rating, airports, zips) loop
    insert into organizations (name, business_types, plan, plan_expires_at, trial_ends_at, is_demo, demo_expires_at, payment_mode)
    values (loc.name || ' (Sample)', array['aircraft'], 'fleet', v_exp, v_exp, true, v_exp, 'direct') returning id into v_loc;
    perform public.seed_default_services(v_loc);
    insert into franchise_members (network_id, org_id, location_name, territory, share_details)
    values (v_net, v_loc, loc.name, loc.terr, loc.share);
    perform public._franchise_copy('service_guides', v_org, v_loc);
    perform public._franchise_copy('services', v_org, v_loc);
    insert into franchise_territories (network_id, org_id, kind, code)
      select v_net, v_loc, 'airport', unnest(loc.airports) union all select v_net, v_loc, 'zip', unnest(loc.zips);

    insert into customers (org_id, name, company) values (v_loc, 'Sample flight department', 'Sample Aviation LLC') returning id into v_cust;
    -- This month and last month.
    for i in 1..(loc.jobs * 2) loop
      v_when := case when i <= loc.jobs then now() - ((i * 2) || ' days')::interval
                     else date_trunc('month', now()) - interval '1 month' + ((i - loc.jobs) * 2 || ' days')::interval end;
      if v_when > now() then v_when := now() - interval '1 hour'; end if;
      v_amt := loc.avg_amt + ((i * 137) % 900) - 450;
      insert into aircraft (org_id, customer_id, tail_number, manufacturer, model)
      values (v_loc, v_cust, 'N' || (100 + i) || upper(substr(md5(v_loc::text || i), 1, 2)), models[1 + (i % 8)][1], models[1 + (i % 8)][2])
      returning id into v_ac;
      insert into jobs (org_id, number, title, customer_id, aircraft_id, status, scheduled_start, scheduled_end, actual_end, qc_status, rating)
      values (v_loc, 'J-' || (1000 + i), 'Exterior wash and brightwork', v_cust, v_ac, 'invoiced', v_when - interval '4 hours', v_when, v_when,
              case when i <= loc.qc_fail then 'failed' else 'passed' end,
              case when i % 3 = 0 then loc.rating - (i % 2) else loc.rating end)
      returning id into v_inv;
      insert into invoices (org_id, number, customer_id, aircraft_id, status, issue_date, due_date)
      values (v_loc, 'INV-' || (1000 + i), v_cust, v_ac, 'sent', v_when::date, v_when::date + 15) returning id into v_inv;
      insert into invoice_items (org_id, invoice_id, description, quantity, unit_price, taxable)
      values (v_loc, v_inv, 'Exterior wash and brightwork', 1, v_amt, false);
      insert into payments (org_id, invoice_id, amount, method, received_at)
      select v_loc, v_inv, total, 'card', v_when + interval '2 days' from invoices where id = v_inv and v_when + interval '2 days' < now();
    end loop;
    for i in 1..10 loop
      insert into quotes (org_id, number, customer_id, status, issue_date)
      values (v_loc, 'Q-' || (1000 + i), v_cust, (case when i <= loc.quotes_won then 'accepted' else 'sent' end)::quote_status,
              (now() - ((i * 2) || ' days')::interval)::date);
    end loop;
  end loop;
  perform set_config('tarmo.franchise_sync', '', true);
  update franchise_networks set standards_pushed_at = now(), booking_enabled = true,
    public_slug = 'skyline-demo-' || substr(replace(v_net::text, '-', ''), 1, 8) where id = v_net;
  return v_net;
end $$;

-- Website booking: each company gets a public booking page (gettarmo.com/book/<slug>) that it can link to
-- or embed on its own website. A booking creates the customer, the aircraft/boat/vehicle, a lead and a
-- booking request in the company's Tarmo, and notifies its managers.

alter table public.organizations
  add column if not exists booking_slug text,
  add column if not exists booking_enabled boolean not null default false,
  add column if not exists booking_message text check (booking_message is null or char_length(booking_message) <= 500);
create unique index if not exists organizations_booking_slug on public.organizations (booking_slug) where booking_slug is not null;

-- Every website booking, for limits and reporting.
create table if not exists public.website_bookings (
  id bigint generated always as identity primary key,
  org_id uuid not null references public.organizations(id) on delete cascade,
  email text not null,
  ip_hash text,
  booking_request_id uuid references public.booking_requests(id) on delete set null,
  opportunity_id uuid references public.opportunities(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists website_bookings_org on public.website_bookings (org_id, created_at desc);
alter table public.website_bookings enable row level security;
revoke all on public.website_bookings from anon, authenticated;

-- Owners and admins: turn the page on or off, set its address and an optional welcome message.
create or replace function public.set_booking_page(p_org uuid, p_enabled boolean, p_slug text, p_message text default null)
returns text language plpgsql security definer set search_path = public as $$
declare s text := lower(regexp_replace(trim(coalesce(p_slug, '')), '[^a-zA-Z0-9]+', '-', 'g'));
begin
  if not public.is_admin(p_org) then raise exception 'Only owners and admins can change the booking page'; end if;
  if (select is_demo from organizations where id = p_org) then raise exception 'The booking page is not available in the demo workspace'; end if;
  s := trim(both '-' from s);
  if s !~ '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$' then raise exception 'Use 3 to 40 letters, numbers or dashes for the page address'; end if;
  if exists (select 1 from organizations where booking_slug = s and id <> p_org)
     or exists (select 1 from franchise_networks where public_slug = s) then
    raise exception 'That page address is taken. Try another.';
  end if;
  update organizations set booking_slug = s, booking_enabled = coalesce(p_enabled, false),
    booking_message = nullif(left(trim(coalesce(p_message, '')), 500), '')
  where id = p_org;
  return s;
end $$;
revoke execute on function public.set_booking_page(uuid, boolean, text, text) from public, anon;
grant execute on function public.set_booking_page(uuid, boolean, text, text) to authenticated;

-- Franchise brand pages and company pages share one set of addresses.
create or replace function public.franchise_set_booking(p_network uuid, p_enabled boolean, p_slug text)
returns text language plpgsql security definer set search_path = public as $$
declare s text := lower(regexp_replace(trim(coalesce(p_slug, '')), '[^a-zA-Z0-9]+', '-', 'g'));
begin
  if not public.franchise_hq_admin(p_network) then raise exception 'Only franchise HQ admins can change the booking page'; end if;
  s := trim(both '-' from s);
  if s !~ '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$' then raise exception 'Use 3 to 40 letters, numbers or dashes for the page address'; end if;
  if exists (select 1 from franchise_networks where public_slug = s and id <> p_network)
     or exists (select 1 from organizations where booking_slug = s) then
    raise exception 'That page address is taken. Try another.';
  end if;
  update franchise_networks set public_slug = s, booking_enabled = coalesce(p_enabled, false) where id = p_network;
  return s;
end $$;

-- The booking page's settings and this month's bookings, for the Settings screen.
create or replace function public.booking_page_status(p_org uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_manager(p_org) then raise exception 'Not allowed'; end if;
  return (select jsonb_build_object('slug', o.booking_slug, 'enabled', o.booking_enabled, 'message', o.booking_message,
    'suggested_slug', trim(both '-' from lower(regexp_replace(o.name, '[^a-zA-Z0-9]+', '-', 'g'))),
    'bookings_30d', (select count(*) from website_bookings w where w.org_id = o.id and w.created_at > now() - interval '30 days'),
    'last_booking_at', (select max(created_at) from website_bookings w where w.org_id = o.id))
    from organizations o where o.id = p_org);
end $$;
revoke execute on function public.booking_page_status(uuid) from public, anon;
grant execute on function public.booking_page_status(uuid) to authenticated;

-- Public page info (website-booking function only): company, what it details, and its bookable services.
create or replace function public.booking_page_info(p_slug text)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'name', o.name, 'logo_url', o.logo_url, 'phone', o.phone, 'website', o.website, 'message', o.booking_message,
    'business_types', to_jsonb(coalesce(o.business_types, array['aircraft'])),
    'services', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name, 'description', left(s.description, 240), 'asset_type', s.asset_type)
        order by s.asset_type, s.sort_order, s.name)
      from services s where s.org_id = o.id and s.active), '[]'))
  from organizations o
  where o.booking_slug = lower(trim(p_slug)) and o.booking_enabled and not o.is_demo
    and coalesce(o.plan::text, '') <> 'expired';
$$;
revoke execute on function public.booking_page_info(text) from public, anon, authenticated;

-- A booking from the public page (website-booking function only).
create or replace function public.booking_page_submit(
  p_slug text, p_name text, p_email text, p_phone text, p_company text,
  p_asset_type text, p_asset_id text, p_asset_desc text, p_service uuid, p_location text,
  p_preferred jsonb, p_notes text, p_ip_hash text default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  o organizations;
  v_email text := lower(trim(coalesce(p_email, '')));
  v_type text := case lower(coalesce(p_asset_type, '')) when 'vehicle' then 'vehicle' when 'watercraft' then 'watercraft' else 'aircraft' end;
  v_ident text := nullif(left(trim(coalesce(p_asset_id, '')), 60), '');
  v_desc text := nullif(left(trim(coalesce(p_asset_desc, '')), 200), '');
  v_cust uuid; v_asset uuid; v_req uuid; v_opp uuid;
  v_svc services; f jsonb;
  v_make text; v_model text; v_year int; v_serial text; v_model_id uuid; v_cat public.aircraft_category; v_len numeric; v_span numeric;
  v_notes text; v_title text;
begin
  select * into o from organizations where booking_slug = lower(trim(p_slug)) and booking_enabled and not is_demo;
  if o.id is null then raise exception 'This booking page is not available'; end if;
  if char_length(trim(coalesce(p_name, ''))) not between 2 and 120 then raise exception 'Please enter your name'; end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or char_length(v_email) > 200 then raise exception 'Please enter a valid email'; end if;
  if (select count(*) from website_bookings where org_id = o.id and email = v_email and created_at > now() - interval '1 day') >= 5 then
    raise exception 'We already have your requests. The team will be in touch soon.';
  end if;
  if p_ip_hash is not null and (select count(*) from website_bookings where org_id = o.id and ip_hash = p_ip_hash and created_at > now() - interval '1 hour') >= 10 then
    raise exception 'Too many requests right now. Please try again later.';
  end if;
  if (select count(*) from website_bookings where org_id = o.id and created_at > now() - interval '1 hour') >= 100 then
    raise exception 'Too many requests right now. Please try again later.';
  end if;

  if p_service is not null then
    select * into v_svc from services where id = p_service and org_id = o.id and active;
  end if;

  -- Customer: the existing one with this email, else a new one.
  select id into v_cust from customers where org_id = o.id and lower(email) = v_email limit 1;
  if v_cust is null then
    insert into customers (org_id, name, company, email, phone, source)
    values (o.id, left(trim(p_name), 120), nullif(left(trim(coalesce(p_company, '')), 120), ''), v_email,
            nullif(left(trim(coalesce(p_phone, '')), 40), ''), 'Website booking')
    returning id into v_cust;
  end if;

  -- Aircraft, boat or vehicle: matched by tail number / name in this company, else added (US aircraft filled in from the FAA).
  if v_ident is not null then
    if v_type = 'aircraft' then v_ident := upper(regexp_replace(v_ident, '\s+', '', 'g')); end if;
    select id into v_asset from aircraft where org_id = o.id and upper(tail_number) = upper(v_ident) limit 1;
    if v_asset is null then
      if v_type = 'aircraft' and v_ident ~ '^N[0-9A-Z]{1,5}$' then
        begin f := public.faa_lookup(o.id, v_ident); exception when others then f := null; end;
        if f is not null and (f->>'found')::boolean then
          v_make := coalesce(f->'catalog'->>'manufacturer', nullif(initcap(f->>'faa_manufacturer'), ''));
          v_model := coalesce(f->'catalog'->>'model', nullif(f->>'faa_model', ''));
          v_year := (f->>'year')::int; v_serial := f->>'serial'; v_model_id := (f->>'model_id')::uuid;
          v_cat := (f->'catalog'->>'category')::public.aircraft_category;
          v_len := (f->'catalog'->>'length_ft')::numeric; v_span := (f->'catalog'->>'wingspan_ft')::numeric;
        end if;
      end if;
      insert into aircraft (org_id, customer_id, tail_number, asset_type, manufacturer, model, year, serial_number, model_id, category, length_ft, wingspan_ft, notes)
      values (o.id, v_cust, v_ident, v_type, left(v_make, 120), left(v_model, 120), v_year, left(v_serial, 60), v_model_id,
        coalesce(v_cat, case v_type when 'vehicle' then 'car'::public.aircraft_category when 'watercraft' then 'boat_medium'::public.aircraft_category else 'light_jet'::public.aircraft_category end),
        v_len, v_span, case when v_desc is not null then 'From website booking: ' || v_desc end)
      returning id into v_asset;
    end if;
  end if;

  v_notes := concat_ws(E'\n',
    'From your website booking page.',
    case when v_svc.id is not null then 'Service: ' || v_svc.name end,
    case when v_ident is not null or v_desc is not null then
      (case v_type when 'vehicle' then 'Vehicle: ' when 'watercraft' then 'Boat: ' else 'Aircraft: ' end) || concat_ws(' · ', v_ident, v_desc) end,
    case when nullif(trim(coalesce(p_location, '')), '') is not null then 'Where: ' || left(trim(p_location), 200) end,
    case when nullif(trim(coalesce(p_phone, '')), '') is not null then 'Phone: ' || left(trim(p_phone), 40) end,
    nullif(left(trim(coalesce(p_notes, '')), 1000), ''));

  insert into booking_requests (org_id, customer_id, aircraft_id, service_id, kind, preferred, notes)
  values (o.id, v_cust, v_asset, v_svc.id, 'booking',
    case when jsonb_typeof(p_preferred) = 'array' then (select coalesce(jsonb_agg(x), '[]') from (select x from jsonb_array_elements(p_preferred) x limit 3) s) else '[]' end,
    v_notes)
  returning id into v_req;

  v_title := left(concat_ws(' · ', coalesce(v_svc.name, 'Website request'), coalesce(v_ident, v_desc), left(trim(p_name), 60)), 200);
  insert into opportunities (org_id, customer_id, title, stage, value, source, notes)
  values (o.id, v_cust, v_title, 'new', coalesce(v_svc.base_price, 0), 'Website booking', v_notes)
  returning id into v_opp;

  insert into website_bookings (org_id, email, ip_hash, booking_request_id, opportunity_id)
  values (o.id, v_email, p_ip_hash, v_req, v_opp);

  return jsonb_build_object('company', o.name, 'company_email', o.email, 'company_phone', o.phone,
    'service', v_svc.name, 'booking_request_id', v_req);
end $$;
revoke execute on function public.booking_page_submit(text, text, text, text, text, text, text, text, uuid, text, jsonb, text, text) from public, anon, authenticated;

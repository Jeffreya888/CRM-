-- Import from a spreadsheet (CSV exported from Fieldd, Jobber, Housecall Pro, Shiny Jets or any sheet).
-- The app reads the file, matches the columns and sends rows in batches; these functions add them,
-- skipping duplicates, and report what happened. Owners, admins and managers only. Max 500 rows per call.

-- Customers: { name, company, email, phone, address, notes }. Duplicate = same email, or same name when there's no email.
create or replace function public.import_customers(p_org uuid, p_rows jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r jsonb; v_name text; v_email text; added int := 0; skipped int := 0; invalid int := 0;
begin
  if not public.is_manager(p_org) then raise exception 'Only owners, admins and managers can import'; end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 500 then raise exception 'Send up to 500 rows at a time'; end if;
  for r in select * from jsonb_array_elements(p_rows) loop
    v_name := nullif(trim(coalesce(r->>'name', r->>'company', '')), '');
    v_email := nullif(lower(trim(coalesce(r->>'email', ''))), '');
    if v_email is not null and v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then v_email := null; end if;
    if v_name is null then invalid := invalid + 1; continue; end if;
    if exists (select 1 from customers c where c.org_id = p_org and (
         (v_email is not null and lower(c.email) = v_email) or (v_email is null and lower(trim(c.name)) = lower(v_name)))) then
      skipped := skipped + 1; continue;
    end if;
    insert into customers (org_id, name, company, email, phone, billing_address, notes)
    values (p_org, left(v_name, 200), left(nullif(trim(r->>'company'), ''), 200), v_email, left(nullif(trim(r->>'phone'), ''), 40),
            left(nullif(trim(r->>'address'), ''), 500), left(nullif(trim(r->>'notes'), ''), 4000));
    added := added + 1;
  end loop;
  return jsonb_build_object('added', added, 'skipped', skipped, 'invalid', invalid);
end;
$$;
revoke execute on function public.import_customers(uuid, jsonb) from public, anon;
grant execute on function public.import_customers(uuid, jsonb) to authenticated;

-- Assets: { tail, type ('aircraft'|'vehicle'|'watercraft'), make, model, year, serial, owner (name or email), notes }.
-- US aircraft (N-numbers) with no make/model are filled in from the FAA registry. The owner is matched to an
-- existing customer by email or name, or added. Duplicate = same tail number / identifier.
create or replace function public.import_assets(p_org uuid, p_rows jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  r jsonb; v_tail text; v_type text; v_make text; v_model text; v_year int; v_owner text; v_cust uuid; f jsonb;
  v_cat public.aircraft_category; v_model_id uuid; v_len numeric; v_span numeric; v_serial text;
  added int := 0; skipped int := 0; invalid int := 0; faa int := 0; owners_added int := 0;
begin
  if not public.is_manager(p_org) then raise exception 'Only owners, admins and managers can import'; end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 500 then raise exception 'Send up to 500 rows at a time'; end if;
  for r in select * from jsonb_array_elements(p_rows) loop
    v_tail := nullif(upper(regexp_replace(trim(coalesce(r->>'tail', '')), '\s+', ' ', 'g')), '');
    v_type := lower(coalesce(nullif(trim(r->>'type'), ''), 'aircraft'));
    v_type := case when v_type ~ '^(car|vehicle|auto|truck|suv)' then 'vehicle' when v_type ~ '^(boat|yacht|vessel|water|marine)' then 'watercraft' else 'aircraft' end;
    if v_type <> 'aircraft' then v_tail := nullif(trim(coalesce(r->>'tail', '')), ''); end if;
    if v_tail is null then invalid := invalid + 1; continue; end if;
    if exists (select 1 from aircraft a where a.org_id = p_org and upper(a.tail_number) = upper(v_tail)) then skipped := skipped + 1; continue; end if;

    v_make := nullif(trim(r->>'make'), ''); v_model := nullif(trim(r->>'model'), ''); v_serial := nullif(trim(r->>'serial'), '');
    v_year := case when coalesce(r->>'year', '') ~ '^\d{4}$' and (r->>'year')::int between 1900 and 2100 then (r->>'year')::int end;
    v_cat := null; v_model_id := null; v_len := null; v_span := null;
    if v_type = 'aircraft' and v_tail ~ '^N[0-9A-Z]{1,5}$' and (v_make is null or v_model is null) then
      begin
        f := public.faa_lookup(p_org, v_tail);
      exception when others then f := null;
      end;
      if f is not null and (f->>'found')::boolean then
        faa := faa + 1;
        v_make := coalesce(v_make, f->'catalog'->>'manufacturer', nullif(initcap(f->>'faa_manufacturer'), ''));
        v_model := coalesce(v_model, f->'catalog'->>'model', nullif(f->>'faa_model', ''));
        v_year := coalesce(v_year, (f->>'year')::int);
        v_serial := coalesce(v_serial, f->>'serial');
        v_model_id := (f->>'model_id')::uuid;
        v_cat := (f->'catalog'->>'category')::public.aircraft_category;
        v_len := (f->'catalog'->>'length_ft')::numeric;
        v_span := (f->'catalog'->>'wingspan_ft')::numeric;
      end if;
    end if;

    v_cust := null;
    v_owner := nullif(trim(coalesce(r->>'owner', '')), '');
    if v_owner is not null then
      select id into v_cust from customers c where c.org_id = p_org and (lower(c.email) = lower(v_owner) or lower(trim(c.name)) = lower(v_owner)) limit 1;
      if v_cust is null then
        insert into customers (org_id, name, email) values (p_org, left(v_owner, 200), case when v_owner ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then lower(v_owner) end)
        returning id into v_cust;
        owners_added := owners_added + 1;
      end if;
    end if;

    insert into aircraft (org_id, customer_id, tail_number, asset_type, manufacturer, model, year, serial_number, notes, model_id, category, length_ft, wingspan_ft)
    values (p_org, v_cust, left(v_tail, 60), v_type, left(v_make, 120), left(v_model, 120), v_year, left(v_serial, 60), left(nullif(trim(r->>'notes'), ''), 4000),
            v_model_id,
            coalesce(v_cat, case v_type when 'vehicle' then 'car'::public.aircraft_category when 'watercraft' then 'boat_medium'::public.aircraft_category else 'light_jet'::public.aircraft_category end),
            v_len, v_span);
    added := added + 1;
  end loop;
  return jsonb_build_object('added', added, 'skipped', skipped, 'invalid', invalid, 'faa_filled', faa, 'owners_added', owners_added);
end;
$$;
revoke execute on function public.import_assets(uuid, jsonb) from public, anon;
grant execute on function public.import_assets(uuid, jsonb) to authenticated;

-- Services and prices: { name, price, hours, category, type }. A service with the same name gets the new
-- flat price; otherwise a new flat-price service is added.
create or replace function public.import_services(p_org uuid, p_rows jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r jsonb; v_name text; v_price numeric; v_hours numeric; v_cat text; v_type text; v_id uuid; added int := 0; updated int := 0; invalid int := 0;
begin
  if not public.is_admin(p_org) then raise exception 'Only owners and admins can import prices'; end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 500 then raise exception 'Send up to 500 rows at a time'; end if;
  for r in select * from jsonb_array_elements(p_rows) loop
    v_name := nullif(trim(r->>'name'), '');
    v_price := case when regexp_replace(coalesce(r->>'price', ''), '[$,\s]', '', 'g') ~ '^\d+(\.\d+)?$'
                    then regexp_replace(r->>'price', '[$,\s]', '', 'g')::numeric end;
    if v_name is null or v_price is null or v_price > 1000000 then invalid := invalid + 1; continue; end if;
    v_hours := case when coalesce(r->>'hours', '') ~ '^\d+(\.\d+)?$' then least((r->>'hours')::numeric, 999) end;
    v_cat := lower(coalesce(r->>'category', ''));
    v_cat := case when v_cat in ('exterior','interior','brightwork','coating','paint_correction','specialty','other') then v_cat
                  when v_cat like '%interior%' then 'interior' when v_cat like '%coat%' or v_cat like '%ceramic%' then 'coating'
                  when v_cat like '%bright%' or v_cat like '%polish%' then 'brightwork' when v_cat like '%correct%' then 'paint_correction'
                  else 'exterior' end;
    v_type := lower(coalesce(r->>'type', ''));
    v_type := case when v_type ~ '^(car|vehicle|auto)' then 'vehicle' when v_type ~ '^(boat|yacht|marine|water)' then 'watercraft' else 'aircraft' end;
    select id into v_id from services where org_id = p_org and lower(trim(name)) = lower(v_name) and asset_type = v_type limit 1;
    if v_id is not null then
      update services set pricing_method = 'flat', base_price = v_price, est_hours = coalesce(v_hours, est_hours), active = true where id = v_id;
      updated := updated + 1;
    else
      insert into services (org_id, name, category, pricing_method, base_price, est_hours, asset_type)
      values (p_org, left(v_name, 120), v_cat, 'flat', v_price, v_hours, v_type);
      added := added + 1;
    end if;
  end loop;
  return jsonb_build_object('added', added, 'updated', updated, 'invalid', invalid);
end;
$$;
revoke execute on function public.import_services(uuid, jsonb) from public, anon;
grant execute on function public.import_services(uuid, jsonb) to authenticated;

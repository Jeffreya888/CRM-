-- "Try with sample data": a new company can fill its account with example customers, assets, a sent quote,
-- a job tomorrow (with its SOP checklist) and a finished, paid job, then remove all of it in one tap.
-- Sample records are marked is_sample and numbered SAMPLE-… so real quote/job/invoice numbering is untouched,
-- and the founder funnel leaves them out.

alter table public.customers add column if not exists is_sample boolean not null default false;
alter table public.jobs add column if not exists is_sample boolean not null default false;
alter table public.quotes add column if not exists is_sample boolean not null default false;
alter table public.invoices add column if not exists is_sample boolean not null default false;

create or replace function public.has_sample_data(p_org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_member(p_org) and exists (select 1 from customers where org_id = p_org and is_sample);
$$;
grant execute on function public.has_sample_data(uuid) to authenticated;

create or replace function public.load_sample_data(p_org uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  o organizations;
  v_c1 uuid; v_c2 uuid; v_a1 uuid; v_a2 uuid; v_l uuid; v_job uuid; v_job2 uuid; v_q uuid; v_inv uuid;
  v_today timestamptz := date_trunc('day', now()) + interval '9 hours';
  v_wash numeric; v_int numeric;
begin
  if not public.is_admin(p_org) then raise exception 'Only owners and admins can add sample data'; end if;
  select * into o from organizations where id = p_org;
  if o.is_demo then raise exception 'The demo workspace already has sample data'; end if;
  if exists (select 1 from customers where org_id = p_org and is_sample) then raise exception 'Sample data is already loaded'; end if;

  select coalesce(max(base_price) filter (where guide_key = 'exterior_wash'), 950), coalesce(max(base_price) filter (where guide_key = 'interior_detail'), 1100)
    into v_wash, v_int from services where org_id = p_org;

  insert into locations (org_id, name, airport_code, fbo_name, address, has_water, has_power)
    values (p_org, 'Sample: Teterboro Airport', 'KTEB', 'Signature Flight Support', 'Teterboro, NJ', true, true) returning id into v_l;
  insert into customers (org_id, name, company, email, phone, kind, is_sample) values
    (p_org, 'Sample: Jordan Blake', 'Blake Aviation Holdings', 'jordan@example.com', '(555) 201-3344', 'owner', true) returning id into v_c1;
  insert into customers (org_id, name, company, email, phone, kind, is_sample) values
    (p_org, 'Sample: Coastal Charter Group', 'Coastal Charter Group', 'ops@example.com', '(555) 404-1122', 'charter', true) returning id into v_c2;
  insert into aircraft (org_id, customer_id, tail_number, manufacturer, model, category, length_ft, wingspan_ft, home_location_id)
    values (p_org, v_c1, 'N650SX', 'Gulfstream', 'G650ER', 'large_jet', 99.8, 99.6, v_l) returning id into v_a1;
  if 'watercraft' = any(o.business_types) then
    insert into aircraft (org_id, customer_id, tail_number, asset_type, manufacturer, model, category)
      values (p_org, v_c2, 'Sample yacht', 'watercraft', 'Azimut', '72 Flybridge', 'boat_large') returning id into v_a2;
  elsif 'vehicle' = any(o.business_types) then
    insert into aircraft (org_id, customer_id, tail_number, asset_type, manufacturer, model, category)
      values (p_org, v_c2, 'Sample SUV', 'vehicle', 'Land Rover', 'Range Rover', 'suv') returning id into v_a2;
  else
    insert into aircraft (org_id, customer_id, tail_number, manufacturer, model, category, length_ft, wingspan_ft, home_location_id)
      values (p_org, v_c2, 'N350SX', 'Bombardier', 'Challenger 350', 'super_midsize_jet', 68.7, 69.0, v_l) returning id into v_a2;
  end if;

  -- A finished, paid job last week.
  insert into jobs (org_id, number, title, customer_id, aircraft_id, location_id, status, scheduled_start, scheduled_end, actual_start, actual_end, is_sample)
    values (p_org, 'SAMPLE-1', 'Exterior wash, interior detail', v_c1, v_a1, v_l, 'completed',
            v_today - interval '6 days', v_today - interval '6 days' + interval '6 hours', v_today - interval '6 days', v_today - interval '6 days' + interval '6 hours', true)
    returning id into v_job;
  insert into invoices (org_id, number, customer_id, job_id, aircraft_id, status, issue_date, due_date, subtotal, total, is_sample, sent_at)
    values (p_org, 'SAMPLE-1', v_c1, v_job, v_a1, 'sent', current_date - 6, current_date + 9, v_wash + v_int, v_wash + v_int, true, now() - interval '6 days')
    returning id into v_inv;
  insert into invoice_items (org_id, invoice_id, description, quantity, unit_price, sort_order) values
    (p_org, v_inv, 'Exterior wash', 1, v_wash, 0), (p_org, v_inv, 'Interior detail', 1, v_int, 1);
  insert into payments (org_id, invoice_id, amount, method, reference, received_at)
    values (p_org, v_inv, v_wash + v_int, 'ach', 'Sample payment', now() - interval '3 days');

  -- A job tomorrow, assigned to whoever loaded the sample, with the exterior wash SOP as its checklist.
  insert into jobs (org_id, number, title, customer_id, aircraft_id, location_id, status, scheduled_start, scheduled_end, is_sample)
    values (p_org, 'SAMPLE-2', 'Exterior wash', v_c2, v_a2, v_l, 'scheduled', v_today + interval '1 day', v_today + interval '1 day 3 hours', true)
    returning id into v_job2;
  insert into job_checklist_items (org_id, job_id, label, sort_order, guide_key, step_index)
    select p_org, v_job2, step, ord::int, 'exterior_wash', (ord - 1)::int
    from services s cross join lateral unnest(s.checklist) with ordinality as x(step, ord)
    where s.org_id = p_org and s.guide_key = 'exterior_wash' and s.checklist is not null;
  insert into job_assignments (job_id, user_id, org_id, is_primary) values (v_job2, auth.uid(), p_org, true);

  -- A quote waiting on the customer.
  insert into quotes (org_id, number, customer_id, aircraft_id, status, valid_until, sent_at, is_sample)
    values (p_org, 'SAMPLE-1', v_c2, v_a2, 'draft', current_date + 14, now(), true) returning id into v_q;
  insert into quote_items (org_id, quote_id, description, quantity, unit_price, sort_order) values
    (p_org, v_q, 'Exterior wash', 1, v_wash, 0), (p_org, v_q, 'Brightwork polish', 1, 650, 1);
  update quotes set status = 'sent' where id = v_q;
end;
$$;
revoke execute on function public.load_sample_data(uuid) from public, anon;
grant execute on function public.load_sample_data(uuid) to authenticated;

create or replace function public.clear_sample_data(p_org uuid)
returns int language plpgsql security definer set search_path = public as $$
declare v_customers uuid[]; n int;
begin
  if not public.is_admin(p_org) then raise exception 'Only owners and admins can remove sample data'; end if;
  select array_agg(id) into v_customers from customers where org_id = p_org and is_sample;
  if v_customers is null then return 0; end if;
  delete from payments where org_id = p_org and invoice_id in (select id from invoices where org_id = p_org and customer_id = any(v_customers));
  delete from invoices where org_id = p_org and customer_id = any(v_customers);
  delete from jobs where org_id = p_org and customer_id = any(v_customers);
  delete from quotes where org_id = p_org and customer_id = any(v_customers);
  delete from recurring_schedules where org_id = p_org and customer_id = any(v_customers);
  delete from aircraft where org_id = p_org and customer_id = any(v_customers);
  delete from customers where id = any(v_customers);
  get diagnostics n = row_count;
  delete from locations l where l.org_id = p_org and l.name like 'Sample: %'
    and not exists (select 1 from jobs j where j.location_id = l.id) and not exists (select 1 from aircraft a where a.home_location_id = l.id);
  return n;
end;
$$;
revoke execute on function public.clear_sample_data(uuid) from public, anon;
grant execute on function public.clear_sample_data(uuid) to authenticated;

-- Founder funnel: sample records don't count as a company's own progress.
create or replace function public.platform_funnel(p_days int default 90)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v jsonb;
begin
  if not public.is_platform_admin() then raise exception 'Not allowed'; end if;
  with c as (
    select o.id, o.billing_source, public.effective_plan(o.id) as eplan from organizations o
    where not o.is_demo and o.created_at >= now() - make_interval(days => greatest(1, least(p_days, 1100)))
  )
  select jsonb_build_object(
    'days', p_days,
    'signed_up', (select count(*) from c),
    'added_customer', (select count(*) from c where exists (select 1 from customers x where x.org_id = c.id and not x.is_sample)),
    'sent_quote', (select count(*) from c where exists (select 1 from quotes x where x.org_id = c.id and x.status <> 'draft' and not x.is_sample)),
    'completed_job', (select count(*) from c where exists (select 1 from jobs x where x.org_id = c.id and x.status in ('completed', 'invoiced') and not x.is_sample)),
    'got_paid', (select count(*) from c where exists (select 1 from payments x join invoices i on i.id = x.invoice_id where x.org_id = c.id and not i.is_sample)),
    'subscribed', (select count(*) from c where c.eplan in ('solo', 'team', 'fleet') or c.billing_source is not null)
  ) into v;
  return v;
end;
$$;

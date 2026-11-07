-- Demo: a sample franchise network for the demo workspace, so Franchise HQ can be shown
-- with real-looking numbers. The demo company becomes HQ of three sample locations with
-- jobs, quotes, payments, QC results and ratings over the last two months. The sample
-- locations are demo companies too, deleted with the demo.
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
      ('Skyline Houston', 'KHOU · KIAH · KSGR', 14, 2150, 8, true, 0, 5),
      ('Skyline Dallas',  'KDAL · KADS',        10, 1780, 6, false, 1, 5),
      ('Skyline Scottsdale', 'KSDL',             8, 2420, 5, true, 0, 5),
      ('Skyline Austin',  'KAUS',                5, 1290, 2, false, 3, 4)
    ) as t(name, terr, jobs, avg_amt, quotes_won, share, qc_fail, rating) loop
    insert into organizations (name, business_types, plan, plan_expires_at, trial_ends_at, is_demo, demo_expires_at, payment_mode)
    values (loc.name || ' (Sample)', array['aircraft'], 'fleet', v_exp, v_exp, true, v_exp, 'direct') returning id into v_loc;
    perform public.seed_default_services(v_loc);
    insert into franchise_members (network_id, org_id, location_name, territory, share_details)
    values (v_net, v_loc, loc.name, loc.terr, loc.share);
    perform public._franchise_copy('service_guides', v_org, v_loc);
    perform public._franchise_copy('services', v_org, v_loc);

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
  update franchise_networks set standards_pushed_at = now() where id = v_net;
  return v_net;
end $$;
revoke execute on function public.create_demo_franchise() from public, anon;
grant execute on function public.create_demo_franchise() to authenticated;

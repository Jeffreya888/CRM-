-- Integration test for the schema: runs the main business flows as real
-- authenticated users with RLS enforced. Any failed assertion aborts.
\set ON_ERROR_STOP on
set client_min_messages = warning;

-- Two companies, a technician, a manager and a not-yet-verified invitee.
insert into auth.users (id, email, raw_user_meta_data, email_confirmed_at) values
  ('00000000-0000-0000-0000-00000000000a', 'owner@alpha.test', '{"full_name":"Alice Owner"}', now()),
  ('00000000-0000-0000-0000-00000000000b', 'owner@bravo.test', '{"full_name":"Bob Owner"}', now()),
  ('00000000-0000-0000-0000-00000000000c', 'tech@alpha.test',  '{"full_name":"Tina Tech"}', now()),
  ('00000000-0000-0000-0000-00000000000d', 'mgr@alpha.test',   '{"full_name":"Max Manager"}', now()),
  ('00000000-0000-0000-0000-00000000000e', 'demo@anon.test',   '{"demo":true}', null);

create temp table ctx (k text primary key, v uuid);
-- Test helper: the outbox is service-only, so count it with definer rights.
create function public.test_outbox(p_kind text) returns bigint language sql security definer as $$
  select count(*) from public.notification_outbox where kind = p_kind;
$$;
grant all on ctx to authenticated, anon;

-- Catalog & guides are loaded.
do $$ begin
  assert (select count(*) from aircraft_models) > 400, 'aircraft catalog loaded';
  assert exists (select 1 from aircraft_models where manufacturer = 'Gulfstream' and model = 'G650ER'), 'G650ER in catalog';
  assert (select count(*) from service_guides where org_id is null) = 51, 'platform guides loaded (16 aviation + 17 auto + 18 marine)';
end $$;

-- ---------- Alice creates an org with aircraft + vehicles ------------------
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
insert into ctx select 'alpha', public.create_organization('Alpha Aero Detailing', true, array['aircraft','vehicle']);
do $$ begin
  assert (select count(*) from services where asset_type = 'aircraft') = 14, 'aircraft services seeded';
  assert (select count(*) from services where asset_type = 'vehicle') = 17, 'vehicle services seeded (6 + 11 new)';
  assert (select count(*) from services where asset_type = 'watercraft') = 0, 'no watercraft yet';
  assert (select plan from organizations) = 'trial', 'starts on trial';
  assert (select cardinality(checklist) from services where guide_key = 'exterior_wash')
       = (select jsonb_array_length(steps) from service_guides where key = 'exterior_wash' and org_id is null), 'checklist from guide steps';
  assert (select recur_every || ' ' || recur_unit from services where guide_key = 'ceramic_coating') = '12 month', 'recurring in months';
  assert (select count(*) from automations) = 9, 'automations seeded';
  assert (select count(*) from automations where enabled and key in ('job_reminder','invoice_reminders')) = 2, 'smart defaults on';
  assert (select count(*) from crew_hours) = 5, 'default crew hours';
  assert (public.dashboard_stats((select v from ctx where k='alpha')) ? 'revenue_week'), 'weekly revenue stat';
end $$;

-- Business types can be added (seeding services) but not removed.
update organizations set business_types = array['aircraft','vehicle','watercraft'];
do $$ begin
  assert (select count(*) from services where asset_type = 'watercraft') = 18, 'watercraft services seeded on add (6 + 12 new)';
  assert not exists (select 1 from services s where s.guide_key is not null and s.asset_type in ('vehicle','watercraft')
                     and not exists (select 1 from service_guides g where g.org_id is null and g.key = s.guide_key)), 'every starter service has its SOP';
  assert not exists (select 1 from services where asset_type in ('vehicle','watercraft') and guide_key is not null and cardinality(checklist) = 0), 'starter services get SOP checklists';
  begin
    update organizations set business_types = array['aircraft'];
    raise exception 'removing a business type should fail';
  exception when raise_exception then
    if sqlerrm not like 'Business types can be added%' then raise; end if;
  end;
end $$;

insert into training_media (org_id, service_id, kind, title, url, duration_min, guide_key, step_index)
  select org_id, id, 'video', 'Interior Cleaning Guide', 'https://example.com/v.mp4', 30, 'interior_detail', 2 from services where guide_key = 'interior_detail';

-- Customer, aircraft (from the catalog), quote with items → totals by trigger.
insert into customers (org_id, name, email, discount_pct) select v, 'Skyway Charter', 'ops@skyway.test', 10 from ctx where k='alpha';
insert into ctx select 'cust', id from customers;
insert into locations (org_id, name, airport_code, hangar_capacity) select v, 'Teterboro', 'KTEB', 1 from ctx where k='alpha';
insert into ctx select 'loc', id from locations;
insert into location_secrets (location_id, org_id, gate_code) select v, (select v from ctx where k='alpha'), '1234#' from ctx where k='loc';
insert into aircraft (org_id, customer_id, tail_number, manufacturer, model, category, length_ft, model_id, home_location_id)
  select (select v from ctx where k='alpha'), (select v from ctx where k='cust'), 'N123AB', 'Cessna', 'Citation CJ3', 'light_jet', 51.2,
         (select id from aircraft_models where model like 'Citation CJ3%' limit 1), (select v from ctx where k='loc');
insert into ctx select 'ac', id from aircraft;
update organizations set tax_rate = 0.07;

insert into quotes (org_id, number, customer_id, aircraft_id, tax_rate, discount)
  select (select v from ctx where k='alpha'), public.next_number((select v from ctx where k='alpha'), 'quote'),
         (select v from ctx where k='cust'), (select v from ctx where k='ac'), 0.07, 0;
insert into ctx select 'quote', id from quotes;
insert into quote_items (org_id, quote_id, service_id, description, quantity, unit_price, taxable, sort_order)
  select s.org_id, (select v from ctx where k='quote'), s.id, s.name, 1, p.price, p.taxable, p.ord
  from (values ('exterior_wash', 610.80, true, 1), ('interior_detail', 455.00, false, 2)) p(name, price, taxable, ord)
  join services s on s.guide_key = p.name;
do $$ declare q quotes; begin
  select * into q from quotes;
  assert q.number = 'Q-1001', 'quote numbering: ' || q.number;
  assert q.subtotal = 1065.80, 'quote subtotal ' || q.subtotal;
  assert q.tax = 42.76, 'quote tax only on taxable lines ' || q.tax;
  assert q.total = 1108.56, 'quote total ' || q.total;
end $$;
update quotes set discount = 100, deposit_type = 'percent', deposit_value = 25;
do $$ declare q quotes; begin
  select * into q from quotes;
  assert q.tax = 38.74, 'discounted tax ' || q.tax;
  assert q.total = 1004.54, 'discounted total ' || q.total;
  assert q.deposit_amount = 251.14, 'deposit 25% ' || q.deposit_amount;
end $$;

-- Sent quotes are locked; revising creates version 2 and supersedes v1.
update quotes set status = 'sent';
do $$ begin
  assert (select sent_at is not null from quotes), 'sent_at stamped';
  begin
    update quote_items set unit_price = 1 where service_id in (select id from services where guide_key = 'exterior_wash');
    raise exception 'sent quote items should be locked';
  exception when raise_exception then
    if sqlerrm not like 'QUOTE_LOCKED%' then raise; end if;
  end;
end $$;
insert into ctx select 'quote2', public.revise_quote((select v from ctx where k='quote'));
do $$ begin
  assert (select version from quotes where id = (select v from ctx where k='quote2')) = 2, 'version 2';
  assert (select status from quotes where id = (select v from ctx where k='quote2')) = 'draft', 'v2 is a draft';
  assert (select superseded_by from quotes where id = (select v from ctx where k='quote')) = (select v from ctx where k='quote2'), 'v1 superseded';
  assert (select count(*) from quote_items where quote_id = (select v from ctx where k='quote2')) = 2, 'items copied to v2';
  assert (select total from quotes where id = (select v from ctx where k='quote2')) = 1004.54, 'v2 totals';
end $$;
update quote_items set unit_price = 650 where quote_id = (select v from ctx where k='quote2') and service_id in (select id from services where guide_key = 'exterior_wash');
update quotes set discount = 0 where id = (select v from ctx where k='quote2');

-- Quote → job (items + guide checklist copied) → photos → complete → invoice.
insert into ctx select 'job', public.convert_quote_to_job((select v from ctx where k='quote2'), now() + interval '1 day');
do $$ begin
  assert (select status from quotes where id = (select v from ctx where k='quote2')) = 'accepted';
  assert (select count(*) from job_items) = 2, 'job items copied';
  assert (select count(*) from job_checklist_items where kind = 'step') =
         (select cardinality(checklist) from services where guide_key = 'exterior_wash')
       + (select cardinality(checklist) from services where guide_key = 'interior_detail'), 'checklists copied';
  assert (select count(*) from job_checklist_items where guide_key is not null and step_index is not null) = (select count(*) from job_checklist_items where kind = 'step'), 'checklist linked to guide steps';
  assert (select count(*) from job_checklist_items where kind = 'qc') =
         (select cardinality(quality_checks) from service_guides where org_id is null and key = 'exterior_wash')
       + (select cardinality(quality_checks) from service_guides where org_id is null and key = 'interior_detail'), 'QC items from SOP quality checks';
  assert (select sum(est_hours) from job_items) > 0, 'job lines get estimated hours';
  assert (select number from jobs) = 'WO-1001';
  assert (select status from jobs) = 'scheduled';
end $$;
do $$ begin
  begin
    update jobs set status = 'in_progress';
    raise exception 'starting without before photos should fail';
  exception when raise_exception then
    if sqlerrm not like 'BEFORE_PHOTOS_REQUIRED%' then raise; end if;
  end;
end $$;
insert into job_photos (org_id, job_id, kind, storage_path) select org_id, id, 'before', org_id || '/jobs/b.jpg' from jobs;
update jobs set status = 'in_progress';
insert into time_entries (org_id, user_id, job_id, started_at) select org_id, auth.uid(), id, now() - interval '3 hours' from jobs;
-- Supplies: each wash uses 1 concentrate (auto-deducted once on completion).
insert into inventory_items (org_id, name, quantity, par_level, unit_cost) select v, 'Aero Wash Concentrate', 10, 9, 20 from ctx where k='alpha';
insert into service_supplies (service_id, item_id, org_id)
  select s.id, i.id, s.org_id from services s, inventory_items i where s.guide_key = 'exterior_wash';
do $$ begin
  begin
    update jobs set status = 'completed';
    raise exception 'completing without after photos should fail';
  exception when raise_exception then
    if sqlerrm not like 'AFTER_PHOTOS_REQUIRED%' then raise; end if;
  end;
end $$;
insert into job_photos (org_id, job_id, kind, storage_path) select org_id, id, 'after', org_id || '/jobs/a.jpg' from jobs;
update jobs set status = 'completed';
do $$ begin
  assert (select actual_start is not null and actual_end is not null from jobs), 'actual times stamped';
  assert (select count(*) from time_entries where ended_at is null) = 0, 'clocks stopped on completion';
  assert (select count(*) from service_reminders) = 2, 'recurring reminders created (not opted in)';
  assert (select quantity from inventory_items) = 9, 'supplies auto-deducted';
  assert public.test_outbox('low_stock') = 1, 'low stock alert queued';
end $$;
-- Completing again (e.g. after an edit) does not deduct twice.
update jobs set status = 'in_progress';
update jobs set status = 'completed';
do $$ begin assert (select quantity from inventory_items) = 9, 'auto-deduct is idempotent'; end $$;

-- Job profitability: revenue excl. tax − labor − supplies. No pay rate yet → Unknown.
do $$ declare p jsonb; begin
  p := public.job_profitability((select v from ctx where k='job'));
  assert (p->>'revenue')::numeric = 1105.00, 'job revenue ' || (p->>'revenue');
  assert p->>'labor' is null and p->>'gross' is null, 'labor unknown without pay rate';
  assert (p->>'supplies')::numeric = 20, 'supply cost';
end $$;
insert into member_pay (org_id, user_id, hourly_rate) select v, auth.uid(), 40 from ctx where k='alpha';
do $$ declare p jsonb; begin
  p := public.job_profitability((select v from ctx where k='job'));
  assert (p->>'labor')::numeric = 120, 'labor 3h × $40 = ' || (p->>'labor');
  assert (p->>'gross')::numeric = 965, 'gross ' || (p->>'gross');
end $$;

insert into ctx select 'inv', public.create_invoice_from_job((select v from ctx where k='job'));
do $$ declare i invoices; begin
  select * into i from invoices;
  assert i.number = 'INV-1001';
  assert i.subtotal = 1105.00, 'invoice subtotal ' || i.subtotal;
  assert i.discount = 110.50, 'customer 10% standing discount ' || i.discount;
  assert i.status = 'draft';
  assert i.org_snapshot is null, 'no snapshot while draft';
  assert (select status from jobs) = 'invoiced';
end $$;
update invoices set status = 'sent';
do $$ begin assert (select org_snapshot->>'name' from invoices) = 'Alpha Aero Detailing', 'company snapshot on send'; end $$;
update organizations set name = 'Alpha Renamed';
do $$ begin assert (select org_snapshot->>'name' from invoices) = 'Alpha Aero Detailing', 'snapshot keeps sent details'; end $$;
insert into payments (org_id, invoice_id, amount, method) select org_id, id, 500, 'check' from invoices;
do $$ begin assert (select status from invoices) = 'partial'; end $$;
insert into payments (org_id, invoice_id, amount, method) select org_id, id, balance, 'card' from invoices;
do $$ begin
  assert (select status from invoices) = 'paid';
  assert (select balance from invoices) = 0;
end $$;

-- Cash-basis P&L: revenue excludes the tax collected.
do $$ declare pl jsonb; i invoices; begin
  select * into i from invoices;
  pl := public.profit_loss((select v from ctx where k='alpha'), current_date - 1, current_date + 1);
  assert (pl->>'revenue')::numeric = i.total - i.tax, 'cash revenue excl tax ' || (pl->>'revenue') || ' vs ' || (i.total - i.tax);
  assert (pl->>'sales_tax_collected')::numeric = i.tax, 'tax shown separately';
  assert (pl->>'supplies')::numeric = 20 and (pl->>'labor')::numeric = 120, 'costs';
  assert (pl->>'net')::numeric = i.total - i.tax - 140, 'net';
  pl := public.profit_loss((select v from ctx where k='alpha'), current_date - 1, current_date + 1, 'accrual');
  assert (pl->>'revenue')::numeric = i.subtotal - i.discount, 'accrual revenue';
end $$;

-- Count mode logs the correction.
select public.record_count((select id from inventory_items), 7);
do $$ begin
  assert (select quantity from inventory_items) = 7, 'count sets quantity';
  assert (select count(*) from inventory_movements where reason = 'count') = 1, 'count logged';
end $$;

-- Equipment: logging a paid service books an expense; a problem report flags it.
insert into equipment (org_id, name, bookable) select v, 'Pressure washer', true from ctx where k='alpha';
insert into equipment_service_log (org_id, equipment_id, cost, vendor, notes) select org_id, id, 85, 'Pump Shop', 'Seal kit' from equipment;
do $$ begin
  assert (select count(*) from expenses where category = 'repairs' and amount = 85) = 1, 'service cost booked as expense';
end $$;

-- Protected columns: cannot self-upgrade plan or mark demo.
do $$ begin
  begin
    update organizations set plan = 'fleet';
    raise exception 'should not be able to change plan';
  exception when insufficient_privilege then null;
  end;
  begin
    update organizations set role_permissions = '{}';
    raise exception 'permissions only via RPC';
  exception when insufficient_privilege then null;
  end;
end $$;

-- Reports & dashboard.
do $$ declare d jsonb; r jsonb; begin
  d := public.dashboard_stats((select v from ctx where k='alpha'));
  assert (d->>'revenue_mtd')::numeric > 0, 'revenue mtd';
  assert (d->>'total_paid')::numeric > 0, 'total paid';
  assert d ? 'profit_month', 'profitability overview';
  r := public.report_summary((select v from ctx where k='alpha'), current_date - 30, current_date);
  assert jsonb_array_length(r->'by_service') = 2;
end $$;

-- Invitations: manager and technician.
create temp table invites (who text, inv jsonb);
grant select on invites to authenticated;
insert into invites values ('tech', public.invite_member((select v from ctx where k='alpha'), 'tech@alpha.test', 'technician'));
insert into invites values ('tech2', public.invite_member((select v from ctx where k='alpha'), 'tech@alpha.test', 'technician'));
insert into invites values ('mgr', public.invite_member((select v from ctx where k='alpha'), 'mgr@alpha.test', 'manager'));
do $$ begin
  assert (select count(*) from invitations where email = 'tech@alpha.test' and revoked_at is not null) = 1, 'newer invite revokes older';
end $$;

-- ---------- Tech joins, sees work but not money -----------------------------
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000c', false);
do $$ begin
  begin
    perform public.accept_invitation((select inv->>'code' from invites where who = 'tech'));
    raise exception 'revoked invite should fail';
  exception when raise_exception then
    if sqlerrm not like '%cancelled%' then raise; end if;
  end;
  begin
    perform public.accept_invitation((select inv->>'code' from invites where who = 'mgr'));
    raise exception 'invite for another email should fail';
  exception when raise_exception then
    if sqlerrm not like 'This invitation is for%' then raise; end if;
  end;
end $$;
select public.accept_invitation((select inv->>'token' from invites where who = 'tech2'));
do $$ begin
  assert (select count(*) from jobs) = 1, 'tech sees jobs';
  assert (select count(*) from invoices) = 0, 'tech cannot see invoices';
  assert (select count(*) from quotes) = 0, 'tech cannot see quotes';
  assert (select count(*) from job_items) = 0, 'tech cannot see priced job lines';
  assert (select count(*) from services) = 0, 'tech cannot read service prices';
  assert (select count(*) from service_menu) = 49, 'tech reads the service menu without prices';
  assert (select count(*) from member_pay) = 0, 'tech cannot see pay rates';
  assert (select count(*) from location_secrets) = 0, 'tech cannot see gate codes';
  assert (select count(*) from crew_hours where user_id = auth.uid()) = 5, 'new member gets default hours';
  assert (public.dashboard_stats((select v from ctx where k='alpha'))->>'revenue_mtd') is null, 'no revenue for tech';
  assert (public.dashboard_stats((select v from ctx where k='alpha'))->>'profit_month') is null, 'no profit for tech';
  begin
    insert into customers (org_id, name) values ((select v from ctx where k='alpha'), 'Tech customer');
    raise exception 'tech cannot add customers by default';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.profit_loss((select v from ctx where k='alpha'), current_date - 30, current_date);
    raise exception 'tech cannot read P&L';
  exception when raise_exception then
    if sqlerrm not like 'Not allowed%' then raise; end if;
  end;
end $$;
update job_checklist_items set done = true where sort_order = 101;
select public.set_my_display_name('Tina T.');
insert into training_progress (media_id, user_id, org_id) select id, auth.uid(), org_id from training_media;
insert into equipment_issues (org_id, equipment_id, description) select org_id, id, 'Hose leaking at the wand' from equipment;
insert into time_off (org_id, user_id, starts_on, ends_on, reason) select v, auth.uid(), current_date + 10, current_date + 11, 'Dentist' from ctx where k='alpha';
do $$ begin
  assert (select count(*) from training_progress) = 1, 'tech records own progress';
  assert (select status from equipment) = 'needs_service', 'problem report flags equipment';
  assert (select role from memberships where user_id = auth.uid()) = 'technician';
  update memberships set role = 'owner' where user_id = auth.uid();
  assert (select role from memberships where user_id = auth.uid()) = 'technician', 'tech cannot self-promote';
  begin
    insert into time_off (org_id, user_id, starts_on, ends_on, status) select org_id, auth.uid(), current_date, current_date, 'approved' from memberships where user_id = auth.uid();
    raise exception 'tech cannot self-approve time off';
  exception when insufficient_privilege then null;
  end;
end $$;
insert into time_entries (org_id, user_id, started_at, ended_at)
  select org_id, auth.uid(), now() - interval '9 hours', now() - interval '1 hour' from memberships where user_id = auth.uid();
do $$ begin
  begin
    update time_entries set approved = true where user_id = auth.uid();
    raise exception 'tech cannot approve own time';
  exception when raise_exception then
    if sqlerrm not like 'PERMISSION%' then raise; end if;
  end;
end $$;

-- ---------- Manager: money yes, P&L and deletes no (defaults) ---------------
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000d', false);
select public.accept_invitation((select inv->>'code' from invites where who = 'mgr'));
do $$ begin
  assert (select count(*) from invoices) = 1, 'manager sees invoices';
  assert (select count(*) from services) = 49, 'manager sees prices';
  assert (select count(*) from member_pay) = 0, 'manager cannot see pay rates';
  assert (select count(*) from location_secrets) = 1, 'manager sees gate codes';
  begin
    perform public.profit_loss((select v from ctx where k='alpha'), current_date - 30, current_date);
    raise exception 'manager cannot read P&L by default';
  exception when raise_exception then
    if sqlerrm not like 'Not allowed%' then raise; end if;
  end;
  delete from customers;
  assert (select count(*) from customers) = 1, 'manager cannot delete customers by default';
end $$;
select public.approve_time((select v from ctx where k='alpha'), current_date - 1, current_date + 1);
do $$ begin
  assert (select count(*) from time_entries where approved and approved_by = auth.uid()) >= 1, 'manager approves time';
end $$;

-- Scheduling: conflicts block managers; the owner can override.
insert into jobs (org_id, number, title, customer_id, aircraft_id, location_id, status)
  select (select v from ctx where k='alpha'), public.next_number((select v from ctx where k='alpha'), 'job'), 'Second wash',
         (select v from ctx where k='cust'), (select v from ctx where k='ac'), (select v from ctx where k='loc'), 'tentative';
insert into ctx select 'job2', id from jobs where title = 'Second wash';
insert into jobs (org_id, number, title, customer_id, status, scheduled_start, scheduled_end)
  select (select v from ctx where k='alpha'), public.next_number((select v from ctx where k='alpha'), 'job'), 'Busy job',
         (select v from ctx where k='cust'), 'scheduled',
         date_trunc('day', now() + interval '7 days') + interval '14 hours', date_trunc('day', now() + interval '7 days') + interval '16 hours';
insert into job_assignments (job_id, user_id, org_id) select id, '00000000-0000-0000-0000-00000000000c', org_id from jobs where title = 'Busy job';
insert into facility_requirements (org_id, location_id, name, kind) select v, (select v from ctx where k='loc'), 'KTEB ramp badge', 'badge' from ctx where k='alpha';
do $$ declare c jsonb; s timestamptz := date_trunc('day', now() + interval '7 days') + interval '15 hours'; begin
  c := public.schedule_conflicts((select v from ctx where k='alpha'), (select v from ctx where k='job2'), s, s + interval '2 hours',
        array['00000000-0000-0000-0000-00000000000c']::uuid[], '{}', null, 30, 0, (select v from ctx where k='loc'));
  assert exists (select 1 from jsonb_array_elements(c) x where x->>'type' = 'double_booked'), 'double booking detected';
  assert exists (select 1 from jsonb_array_elements(c) x where x->>'type' = 'missing_requirement'), 'missing badge detected';
  c := public.schedule_conflicts((select v from ctx where k='alpha'), null, s, s + interval '30 hours', '{}', '{}', null);
  assert exists (select 1 from jsonb_array_elements(c) x where x->>'type' = 'too_long'), '24h limit';
  begin
    perform public.schedule_job((select v from ctx where k='job2'), s, s + interval '2 hours', array['00000000-0000-0000-0000-00000000000c']::uuid[],
      '00000000-0000-0000-0000-00000000000c', '{}', null, 0, 0, true);
    raise exception 'manager override should be refused';
  exception when raise_exception then
    if sqlerrm not like 'SCHEDULE_CONFLICT%' then raise; end if;
  end;
end $$;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
select public.schedule_job((select v from ctx where k='job2'), date_trunc('day', now() + interval '7 days') + interval '15 hours',
  date_trunc('day', now() + interval '7 days') + interval '17 hours', array['00000000-0000-0000-0000-00000000000c']::uuid[],
  '00000000-0000-0000-0000-00000000000c', array[(select id from equipment)], (select v from ctx where k='loc'), 0, 0, true, true);
do $$ begin
  assert (select status from jobs where id = (select v from ctx where k='job2')) = 'scheduled', 'owner override confirms tentative job';
  assert (select count(*) from resource_holds where job_id = (select v from ctx where k='job2')) = 2, 'equipment + hangar reserved';
  assert (select is_primary from job_assignments where job_id = (select v from ctx where k='job2')), 'primary tech set';
  assert (select count(*) from activities where body like 'Schedule conflict overridden%') = 1, 'override recorded';
end $$;
select public.decide_time_off((select id from time_off), true);
do $$ begin assert (select status from time_off) = 'approved'; end $$;

-- Requiring two-step sign-in hides company data from aal1 sessions.
do $$ begin
  begin
    update organizations set require_2fa = true where id = (select v from ctx where k='alpha');
    raise exception 'needs own aal2 first';
  exception when raise_exception then
    if sqlerrm not like 'Set up two-step%' then raise; end if;
  end;
end $$;
select set_config('request.jwt.claims', '{"aal":"aal2"}', false);
update organizations set require_2fa = true where id = (select v from ctx where k='alpha');
select set_config('request.jwt.claims', '{"aal":"aal1"}', false);
do $$ begin
  assert (select count(*) from customers) = 0, '2FA required: data hidden at aal1';
  assert (select count(*) from organizations) = 1, '2FA required: company still visible';
  assert (select count(*) from memberships where user_id = auth.uid()) = 1, '2FA required: own membership visible';
end $$;
select set_config('request.jwt.claims', '{"aal":"aal2"}', false);
update organizations set require_2fa = false where id = (select v from ctx where k='alpha');
select set_config('request.jwt.claims', '', false);

-- Owner grants managers P&L; managers can then read it.
select public.set_role_permissions((select v from ctx where k='alpha'),
  '{"manager": {"see_prices": true, "see_reports": true, "edit_customers": true, "approve_timesheets": true, "give_discounts": false, "delete_records": false},
    "technician": {}}');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000d', false);
do $$ begin
  perform public.profit_loss((select v from ctx where k='alpha'), current_date - 30, current_date);
  begin
    update quotes set discount = 5 where id = (select v from ctx where k='quote2');
    raise exception 'discount permission enforced';
  exception when raise_exception then
    if sqlerrm not like 'PERMISSION%' then raise; end if;
  end;
end $$;

-- Pay periods: closing locks entries; only the owner reopens.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
insert into ctx select 'pp', public.close_pay_period((select v from ctx where k='alpha'), current_date - 3, current_date + 3);
do $$ begin
  begin
    update time_entries set notes = 'edit' where user_id = '00000000-0000-0000-0000-00000000000c';
    raise exception 'closed period should lock';
  exception when raise_exception then
    if sqlerrm not like 'PERIOD_CLOSED%' then raise; end if;
  end;
end $$;
select public.reopen_pay_period((select v from ctx where k='pp'), 'Fix a missed clock-out');
update time_entries set notes = 'edit' where user_id = '00000000-0000-0000-0000-00000000000c';
do $$ begin
  assert (select count(*) from audit_log where entity = 'pay_periods' and action = 'reopened') = 1, 'reopen audited';
  assert jsonb_array_length(public.timesheet_summary((select v from ctx where k='alpha'), current_date - 3, current_date + 3)) = 3, 'timesheet per person';
end $$;

-- Recurring care: local time kept across DST, month-end clamp, nth weekday.
do $$ declare t timestamptz[]; begin
  select array_agg(x) into t from public.recurring_preview('2026-01-31 14:00:00+00', 'America/New_York', 1, 'month', null, 4) x;
  assert (t[1] at time zone 'America/New_York')::text = '2026-01-31 09:00:00', 'first ' || t[1];
  assert (t[2] at time zone 'America/New_York')::text = '2026-02-28 09:00:00', 'clamped to Feb 28: ' || (t[2] at time zone 'America/New_York');
  assert (t[3] at time zone 'America/New_York')::text = '2026-03-31 09:00:00', '9 AM kept after DST: ' || (t[3] at time zone 'America/New_York');
  select array_agg(x) into t from public.recurring_preview('2026-11-10 15:00:00+00', 'America/New_York', 1, 'month', '{"nth": 2, "weekday": 2}', 3) x;
  assert (t[1] at time zone 'America/New_York')::date = '2026-11-10', '2nd Tuesday of Nov';
  assert (t[2] at time zone 'America/New_York')::date = '2026-12-08', '2nd Tuesday of Dec';
  select array_agg(x) into t from public.recurring_preview('2026-11-10 15:00:00+00', 'America/New_York', 2, 'week', null, 6, 'after', null, 3) x;
  assert array_length(t, 1) = 3, 'end after 3 visits';
end $$;
insert into recurring_schedules (org_id, customer_id, aircraft_id, service_id, price, first_at, timezone, every, unit, default_user_id, lead_days, annual_increase_pct)
  select (select v from ctx where k='alpha'), (select v from ctx where k='cust'), (select v from ctx where k='ac'), s.id, 500,
         date_trunc('day', now() + interval '2 days') + interval '15 hours', 'America/New_York', 1, 'week',
         '00000000-0000-0000-0000-00000000000c', 15, 5
  from services s where s.guide_key = 'exterior_wash';
select public.generate_recurring_jobs((select v from ctx where k='alpha'));
do $$ begin
  assert (select count(*) from jobs where recurring_schedule_id is not null) = 2, 'two weekly visits inside 15-day window: ' || (select count(*) from jobs where recurring_schedule_id is not null);
  assert (select bool_and(status = 'tentative') from jobs where recurring_schedule_id is not null), 'created as tentative';
  assert (select count(*) from job_items ji join jobs j on j.id = ji.job_id where j.recurring_schedule_id is not null and ji.unit_price = 500) = 2, 'priced';
  assert (select count(*) from job_checklist_items c join jobs j on j.id = c.job_id where j.recurring_schedule_id is not null) > 0, 'checklist on visits';
end $$;
select public.generate_recurring_jobs((select v from ctx where k='alpha'));
do $$ begin assert (select count(*) from jobs where recurring_schedule_id is not null) = 2, 'generation is idempotent'; end $$;
select public.skip_occurrence((select id from recurring_schedules), (select (min(scheduled_start) at time zone 'America/New_York')::date from jobs where recurring_schedule_id is not null));
do $$ begin assert (select count(*) from jobs where recurring_schedule_id is not null and status = 'cancelled') = 1, 'skip cancels that visit'; end $$;

-- Care opt-in: completing creates a Tentative follow-up instead of a reminder.
insert into job_photos (org_id, job_id, kind, storage_path) select org_id, id, k, org_id || '/x.jpg' from jobs, (values ('before'::photo_kind), ('after'::photo_kind)) v(k) where id = (select v from ctx where k='job2');
insert into job_items (org_id, job_id, service_id, description, unit_price)
  select org_id, (select v from ctx where k='job2'), id, name, 700 from services where guide_key = 'wax_sealant';
update jobs set care_opt_in = true, status = 'in_progress' where id = (select v from ctx where k='job2');
update jobs set status = 'completed' where id = (select v from ctx where k='job2');
do $$ begin
  assert (select count(*) from jobs where follow_up_of = (select v from ctx where k='job2') and status = 'tentative') = 1, 'tentative follow-up created';
end $$;

-- Low rating flags the job and alerts the owner.
update jobs set rating = 2, feedback = 'Streaks on the windshield' where id = (select v from ctx where k='job2');
do $$ begin
  assert (select flagged from jobs where id = (select v from ctx where k='job2')), 'low rating flags job';
  assert public.test_outbox('low_rating') = 1, 'owner alerted';
end $$;

-- Good/Better/Best quote: customer accepts an option → tentative job.
insert into quotes (org_id, number, customer_id, aircraft_id, tax_rate)
  select (select v from ctx where k='alpha'), public.next_number((select v from ctx where k='alpha'), 'quote'), (select v from ctx where k='cust'), (select v from ctx where k='ac'), 0;
insert into ctx select 'gbb', id from quotes where version = 1 and superseded_by is null and status = 'draft';
insert into quote_options (org_id, quote_id, name, sort_order)
  select (select v from ctx where k='alpha'), (select v from ctx where k='gbb'), n, o from (values ('Good', 0), ('Better', 1), ('Best', 2)) x(n, o);
insert into quote_items (org_id, quote_id, option_id, description, unit_price)
  select org_id, quote_id, id, name || ' package', 100 * (sort_order + 1) from quote_options;
do $$ begin
  assert (select total from quote_options where name = 'Best') = 300, 'option totals';
  assert (select total from quotes where id = (select v from ctx where k='gbb')) = 100, 'header shows first option';
end $$;
update quotes set status = 'sent' where id = (select v from ctx where k='gbb');

-- Quote templates.
insert into quote_templates (org_id, name, content) select v, 'Light jet full detail',
  '{"options":[{"name":"Standard","items":[{"description":"Exterior Wash","unit_price":800},{"description":"Interior Detail","unit_price":600}]}],"notes":"Hangar required"}'
  from ctx where k='alpha';
do $$ declare q uuid; begin
  q := public.quote_from_template((select id from quote_templates), (select v from ctx where k='cust'), (select v from ctx where k='ac'));
  assert (select subtotal from quotes where id = q) = 1400, 'template quote subtotal';
  assert (select notes from quotes where id = q) = 'Hangar required';
end $$;

-- ---------- Bob (other company) is fully isolated ---------------------------
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false);
insert into ctx select 'bravo', public.create_organization('Bravo Jet Care', false);
do $$ begin
  assert (select count(*) from customers) = 0, 'isolation: customers';
  assert (select count(*) from jobs) = 0, 'isolation: jobs';
  assert (select count(*) from organizations) = 1, 'isolation: orgs';
  assert (select count(*) from training_media) = 0, 'isolation: training';
  assert (select count(*) from messages) = 0, 'isolation: messages';
  assert (select count(*) from audit_log) = 0, 'isolation: audit log';
  assert (select count(*) from service_guides) = 51, 'platform guides visible to all';
  begin
    insert into aircraft (org_id, customer_id, tail_number) values
      ((select v from ctx where k='bravo'), (select v from ctx where k='cust'), 'N999ZZ');
    raise exception 'cross-org reference should fail';
  exception when raise_exception then
    if sqlerrm not like 'Cross-organization%' then raise; end if;
  end;
  begin
    perform public.next_number((select v from ctx where k='alpha'), 'invoice');
    raise exception 'should not number other org';
  exception when raise_exception then
    if sqlerrm not like 'Not a member%' then raise; end if;
  end;
  begin
    insert into branches (org_id, name) values ((select v from ctx where k='bravo'), 'Second base');
  exception when raise_exception then raise exception 'trial allows branches: %', sqlerrm;
  end;
end $$;

-- ---------- Public documents & customer actions (anon) ----------------------
reset role;
create temp table tok as select public_token from invoices;
create temp table qtok as select id, public_token from quotes;
grant select on tok, qtok to anon;
set role anon;
do $$ declare d jsonb; r jsonb; begin
  d := public.get_public_document('invoice', (select public_token from tok));
  assert d->'doc'->>'number' = 'INV-1001';
  assert d->'doc' ? 'public_token' = false;
  assert d->'org'->>'name' = 'Alpha Aero Detailing', 'public invoice uses the sent snapshot';
  assert public.get_public_document('invoice', 'nope') is null;
  -- Superseded v1 cannot be accepted.
  r := public.accept_public_quote((select public_token from qtok where id = (select v from ctx where k='quote')), 'Pat Pilot');
  assert (r->>'ok')::boolean = false, 'superseded quote cannot be accepted';
  -- GBB: viewing marks viewed; accepting requires a choice.
  d := public.get_public_document('quote', (select public_token from qtok where id = (select v from ctx where k='gbb')));
  assert jsonb_array_length(d->'options') = 3, 'options shown';
  begin
    perform public.accept_public_quote((select public_token from qtok where id = (select v from ctx where k='gbb')), 'Pat Pilot');
    raise exception 'must choose an option';
  exception when raise_exception then
    if sqlerrm not like 'Please choose%' then raise; end if;
  end;
  r := public.accept_public_quote((select public_token from qtok where id = (select v from ctx where k='gbb')), 'Pat Pilot',
        (select (o->>'id')::uuid from jsonb_array_elements(d->'options') o where o->>'name' = 'Best'));
  assert (r->>'ok')::boolean, 'accepted';
  assert public.request_quote_dates((select public_token from qtok where id = (select v from ctx where k='gbb')),
        array[now() + interval '10 days', now() + interval '11 days'], 'Mornings please'), 'dates requested';
end $$;
reset role;
do $$ begin
  assert (select view_count from quotes where id = (select v from ctx where k='gbb')) = 1, 'view tracked';
  assert (select status from quotes where id = (select v from ctx where k='gbb')) = 'accepted';
  assert (select total from quotes where id = (select v from ctx where k='gbb')) = 300, 'header follows chosen option';
  assert (select status from jobs where quote_id = (select v from ctx where k='gbb')) = 'tentative', 'tentative job on accept';
  assert (select sum(unit_price) from job_items ji join jobs j on j.id = ji.job_id where j.quote_id = (select v from ctx where k='gbb')) = 300, 'only the chosen option';
  assert (select count(*) from booking_requests where kind = 'quote_dates') = 1, 'date request stored';
  assert public.test_outbox('quote_viewed') + public.test_outbox('quote_accepted') + public.test_outbox('booking_request') = 3, 'managers notified';
end $$;

-- Support messages from the public website.
set role anon;
select public.submit_support_message('Sam Detailer', 'sam@example.com', 'Sam Co', 'pricing', 'How does the yearly plan work?');
reset role;
do $$ begin assert (select count(*) from support_messages) = 1; end $$;

-- ---------- Demo workspace --------------------------------------------------
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000e', false);
insert into ctx select 'demo', public.create_demo_workspace();
do $$ begin
  assert (select is_demo and plan = 'fleet' from organizations), 'demo is Fleet';
  assert (select count(*) from branches) = 2, 'demo branches';
  assert (select count(*) from jobs) >= 3, 'demo jobs';
  assert (select count(*) from services) = 49, 'demo has all business types';
  assert public.create_demo_workspace() = (select v from ctx where k='demo'), 'demo is reused';
  begin
    perform public.invite_member((select v from ctx where k='demo'), 'x@example.com', 'technician');
    raise exception 'demo cannot invite';
  exception when raise_exception then
    if sqlerrm not like 'DEMO%' then raise; end if;
  end;
end $$;
insert into messages (org_id, channel, to_address, body) select v, 'email', 'x@example.com', 'Hi' from ctx where k='demo';
do $$ begin assert (select status from messages) = 'blocked', 'demo messages are blocked'; end $$;
reset role;
update organizations set demo_expires_at = now() - interval '1 minute' where is_demo;
select set_config('request.jwt.claim.sub', '', false);  -- the worker runs without a user
select public.cleanup_demo_workspaces();
do $$ begin
  assert (select count(*) from organizations where is_demo) = 0, 'expired demo removed';
  assert (select count(*) from auth.users where email = 'demo@anon.test') = 0, 'demo user removed';
end $$;

-- ---------- Paywall: expired trial blocks new records -----------------------
update organizations set trial_ends_at = now() - interval '1 day' where name = 'Bravo Jet Care';
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false);
do $$ begin
  begin
    insert into customers (org_id, name) values ((select v from ctx where k='bravo'), 'Blocked');
    raise exception 'expired plan should block inserts';
  exception when raise_exception then
    if sqlerrm not like 'SUBSCRIPTION_REQUIRED%' then raise; end if;
  end;
end $$;

-- ---------- Account deletion -------------------------------------------------
do $$ begin perform public.delete_my_account(); end $$;
reset role;
do $$ begin
  assert (select count(*) from organizations where name = 'Bravo Jet Care') = 0, 'org deleted with sole owner';
  assert (select count(*) from auth.users where email = 'owner@bravo.test') = 0, 'user deleted';
  assert (select count(*) from organizations where name = 'Alpha Renamed') = 1, 'other org untouched';
end $$;

-- Server-side generators run without a user.
select set_config('request.jwt.claim.sub', '', false);
select public.generate_recurring_jobs();
select public.generate_recurring_expenses();

-- Deleting an org with full history must cascade cleanly.
delete from organizations where name = 'Alpha Renamed';
do $$ begin assert (select count(*) from invoices) = 0; end $$;

-- ---------- Security regressions (20261017001100_security_fixes) ----------
reset role;
insert into auth.users (id, email, raw_user_meta_data, email_confirmed_at) values
  ('00000000-0000-0000-0000-0000000000f1', 'sec-owner@sec.test', '{}', now()),
  ('00000000-0000-0000-0000-00000000e0a2', 'sec-admin@sec.test', '{}', now()),
  ('00000000-0000-0000-0000-0000000000f3', 'sec-tech@sec.test', '{}', now()),
  ('00000000-0000-0000-0000-0000000000f4', 'sec-other@sec.test', '{}', now());
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000f4', false);
insert into ctx select 'sec_other', public.create_organization('Sec Other Co', false);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000f1', false);
insert into ctx select 'sec', public.create_organization('Sec Co', false);
reset role;
insert into memberships (org_id, user_id, role) select v, '00000000-0000-0000-0000-00000000e0a2', 'admin' from ctx where k = 'sec';
insert into memberships (org_id, user_id, role) select v, '00000000-0000-0000-0000-0000000000f3', 'technician' from ctx where k = 'sec';
insert into customers (org_id, name) select v, n from ctx, (values ('Sec Cust A'), ('Sec Cust B')) x(n) where k = 'sec';
insert into jobs (org_id, number, title, customer_id, status)
  select org_id, 'SEC-1', 'Sec job', id, 'scheduled' from customers where name = 'Sec Cust A';
insert into locations (org_id, name) select v, 'Sec other loc' from ctx where k = 'sec_other';
insert into ctx select 'sec_other_loc', id from locations where name = 'Sec other loc';
insert into storage.objects (bucket_id, name) select 'org-files', v || p from ctx, (values ('/exports/flight-ready-export.zip'), ('/receipts/r.jpg'), ('/jobs/j/p.jpg')) x(p) where k = 'sec';
grant usage on schema storage to authenticated;  -- test stub only (Supabase grants this)
grant select on storage.objects to authenticated;

-- Technician
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000f3', false);
do $$ begin
  begin
    insert into service_menu (org_id, name) values ((select v from ctx where k = 'sec_other'), 'Injected');
    raise exception 'service_menu must not be writable';
  exception when insufficient_privilege then null;
  end;
  assert (select count(*) from storage.objects) = 1, 'technician sees job photos only, not exports or receipts';
  begin
    insert into job_assignments (job_id, user_id, org_id) select id, auth.uid(), org_id from jobs where number = 'SEC-1';
    raise exception 'technician cannot assign crew';
  exception when insufficient_privilege then null;
  end;
  begin
    update jobs set customer_id = (select id from customers where name = 'Sec Cust B') where number = 'SEC-1';
    raise exception 'technician cannot re-point a job';
  exception when raise_exception then
    if sqlerrm not like 'PERMISSION%' then raise; end if;
  end;
end $$;
insert into time_entries (org_id, user_id, started_at, ended_at, approved)
  select v, auth.uid(), now() - interval '2 hours', now() - interval '1 hour', true from ctx where k = 'sec';
do $$ begin
  assert (select not approved from time_entries where user_id = auth.uid()), 'technician cannot insert approved time';
end $$;

-- Admin
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000e0a2', false);
do $$ begin
  begin
    insert into invitations (org_id, email, role) select v, 'second-owner@sec.test', 'owner' from ctx where k = 'sec';
    raise exception 'admin cannot write invitations directly';
  exception when insufficient_privilege then null;
  end;
  begin
    update memberships set role = 'admin' where user_id = '00000000-0000-0000-0000-0000000000f3';
    raise exception 'admin cannot change roles directly';
  exception when raise_exception then
    if sqlerrm not like 'PERMISSION%' then raise; end if;
  end;
  assert (select count(*) from storage.objects) = 2, 'admin reads receipts but not the owner export';
end $$;

-- Owner
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000f1', false);
do $$ begin
  assert (select count(*) from storage.objects) = 3, 'owner reads the export';
  begin
    insert into job_photos (org_id, job_id, kind, storage_path)
      select org_id, id, 'before', (select v from ctx where k = 'sec_other') || '/exports/x.zip' from jobs where number = 'SEC-1';
    raise exception 'photo path must stay inside the company folder';
  exception when raise_exception then
    if sqlerrm not like 'File path%' then raise; end if;
  end;
  begin
    update jobs set location_id = (select v from ctx where k = 'sec_other_loc') where number = 'SEC-1';
    raise exception 'job location must belong to the company';
  exception when raise_exception then
    if sqlerrm not like 'Cross-organization%' then raise; end if;
  end;
  assert public.guide_for((select v from ctx where k = 'sec_other'), 'exterior_wash') is null, 'no guides from other companies';
end $$;
reset role;
set role anon;
do $$ begin
  begin
    perform public.generate_recurring_jobs();
    raise exception 'anon cannot run generators';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;


-- Daily email limit per company.
reset role;
select set_config('request.jwt.claim.sub', '', false);
insert into organizations (id, name) values ('00000000-0000-0000-0000-00000000e0a2', 'Quota Co');
do $$ begin
  assert public.email_daily_limit('00000000-0000-0000-0000-00000000e0a2') = 150, 'trial limit';
  assert public.claim_email_quota('00000000-0000-0000-0000-00000000e0a2', 149), 'within limit';
  assert public.claim_email_quota('00000000-0000-0000-0000-00000000e0a2', 1), 'reaches limit';
  assert not public.claim_email_quota('00000000-0000-0000-0000-00000000e0a2', 1), 'over limit refused';
  assert (select count(*) from notification_outbox where kind = 'email_limit') = 1, 'owner alerted once';
  perform public.claim_email_quota('00000000-0000-0000-0000-00000000e0a2', 1);
  assert (select count(*) from notification_outbox where kind = 'email_limit') = 1, 'alert not repeated';
end $$;
delete from organizations where id = '00000000-0000-0000-0000-00000000e0a2';

-- ---------- Competitive edge (20261018000100) ------------------------------
reset role;
select set_config('request.jwt.claim.sub', '', false);
insert into auth.users (id, email, raw_user_meta_data, email_confirmed_at) values
  ('00000000-0000-0000-0000-0000000000a1', 'edge-owner@edge.test', '{}', now()),
  ('00000000-0000-0000-0000-0000000000a2', 'edge-tech@edge.test', '{}', now());
-- A slice of the FAA registry.
insert into faa_aircraft_ref (code, mfr, model, type_acft, no_eng, no_seats) values
  ('G550', 'GULFSTREAM AEROSPACE', 'GV-SP (G550)', '5', 2, 19), ('CJ3', 'TEXTRON AVIATION INC', '525B', '5', 2, 9),
  ('C172', 'CESSNA', '172S', '4', 1, 4), ('P300', 'EMBRAER S A', 'EMB-505', '5', 2, 11),
  ('F2EX', 'DASSAULT AVIATION', 'FALCON 2000EX', '5', 2, 12), ('LJ45', 'LEARJET INC', '45', '5', 2, 10),
  ('PA46', 'PIPER', 'PA-46-500TP', '4', 1, 6);
insert into faa_registry (n_number, serial, mfr_mdl_code, year_mfr, name, city, state, status_code, expiration_date, type_aircraft) values
  ('550GV', '5190', 'G550', 2008, 'SKY HOLDINGS LLC', 'WILMINGTON', 'DE', 'V', current_date + 400, '5'),
  ('123CJ', '525B-0500', 'CJ3', 2016, 'CJ OWNER', 'DALLAS', 'TX', 'V', current_date + 400, '5'),
  ('172SP', '17281234', 'C172', 2005, 'FLY CLUB', 'MIAMI', 'FL', 'V', current_date - 1, '4'),
  ('300EM', '50500400', 'P300', 2019, 'PHENOM LLC', 'AUSTIN', 'TX', 'V', null, '5'),
  ('2000X', '123', 'F2EX', 2010, null, null, null, 'V', null, '5'),
  ('45LJ', '45-100', 'LJ45', 2001, null, null, null, 'V', null, '5'),
  ('500TP', '4697001', 'PA46', 2012, null, null, null, 'V', null, '4');
insert into faa_meta (id, imported_at, aircraft_rows, model_rows) values (true, now(), 7, 7)
  on conflict (id) do update set imported_at = now();

set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', false);
insert into ctx select 'edge', public.create_organization('Edge Co', true);
reset role;
insert into memberships (org_id, user_id, role, display_name) select v, '00000000-0000-0000-0000-0000000000a2', 'technician', 'Ana' from ctx where k = 'edge';
set role authenticated;

-- FAA autofill: aliases, names, years, learned choices.
do $$
declare
  o uuid := (select v from ctx where k = 'edge');
  r jsonb;
begin
  r := public.faa_lookup(o, 'N550GV');
  assert (r ->> 'found')::boolean and r -> 'catalog' ->> 'model' = 'G550' and r ->> 'match' = 'alias', 'G550 via alias: ' || r::text;
  assert r ->> 'owner' = 'SKY HOLDINGS LLC' and r ->> 'status' = 'Valid' and r ->> 'serial' = '5190' and (r ->> 'year')::int = 2008, 'FAA details';
  assert public.faa_lookup(o, '123cj') -> 'catalog' ->> 'model' = 'Citation CJ3+', 'CJ3+ by year';
  r := public.faa_lookup(o, 'N172SP');
  assert r -> 'catalog' ->> 'model' = '172 Skyhawk' and r ->> 'status' = 'Expired', 'Skyhawk, expired registration';
  assert public.faa_lookup(o, 'N300EM') -> 'catalog' ->> 'model' = 'Phenom 300E', 'Phenom 300E';
  assert public.faa_lookup(o, 'N2000X') -> 'catalog' ->> 'model' = 'Falcon 2000EX', 'Falcon by name';
  assert public.faa_lookup(o, 'N45LJ') -> 'catalog' ->> 'model' = 'Learjet 45', 'Learjet by name';
  assert public.faa_lookup(o, 'N500TP') -> 'catalog' ->> 'model' = 'PA-46-500TP Meridian', 'Meridian by designation';
  assert public.faa_lookup(o, 'C-GABC') ->> 'reason' = 'not_us', 'foreign tails are not looked up';
  assert public.faa_lookup(o, 'N9999Z') ->> 'reason' = 'not_found', 'unknown tail';
  perform public.remember_faa_model(o, 'N550GV', (select id from aircraft_models where manufacturer = 'Gulfstream' and model = 'G500 (GV-SP)'));
  r := public.faa_lookup(o, 'N550GV');
  assert r -> 'catalog' ->> 'model' = 'G500 (GV-SP)' and r ->> 'match' = 'learned', 'company choice remembered';
end $$;
do $$ begin
  begin
    perform 1 from faa_registry limit 1;
    raise exception 'registry table must not be readable directly';
  exception when insufficient_privilege then null;
  end;
end $$;

-- Setup: pay, true-cost settings, an aircraft, a service with hours by class and fractional supplies.
update organizations set labor_burden_pct = 20, overhead_per_hour = 10 where id = (select v from ctx where k = 'edge');
insert into member_pay (org_id, user_id, hourly_rate) select v, '00000000-0000-0000-0000-0000000000a2', 30 from ctx where k = 'edge';
insert into customers (org_id, name) select v, 'Edge Customer' from ctx where k = 'edge';
insert into aircraft (org_id, customer_id, tail_number, category, length_ft, wingspan_ft)
  select org_id, id, 'N50EJ', 'light_jet', 50, 50 from customers where name = 'Edge Customer';
update services set category_hours = '{"light_jet": 4}', requires_cert = true
  where org_id = (select v from ctx where k = 'edge') and guide_key = 'exterior_wash' and asset_type = 'aircraft';
insert into inventory_items (org_id, name, unit, unit_cost) select v, n, u, c from ctx, (values ('Edge concentrate', 'gal', 40), ('Edge wax', 'oz', 1)) x(n, u, c) where k = 'edge';
insert into inventory_movements (org_id, item_id, delta, reason) select org_id, id, 10, 'purchase' from inventory_items where name like 'Edge %';
insert into service_supplies (org_id, service_id, item_id, quantity, per_foot)
  select s.org_id, s.id, i.id, case when i.name = 'Edge wax' then 0.1 else 0.25 end, i.name = 'Edge wax'
  from services s join inventory_items i on i.org_id = s.org_id and i.name like 'Edge %'
  where s.org_id = (select v from ctx where k = 'edge') and s.guide_key = 'exterior_wash' and s.asset_type = 'aircraft';
insert into jobs (org_id, number, title, customer_id, aircraft_id, status, scheduled_start, scheduled_end)
  select a.org_id, 'EDGE-1', 'Wash', a.customer_id, a.id, 'scheduled', now() + interval '1 day', now() + interval '1 day 4 hours'
  from aircraft a where tail_number = 'N50EJ';
insert into job_items (org_id, job_id, service_id, description, quantity, unit_price)
  select j.org_id, j.id, s.id, s.name, 1, 1000 from jobs j join services s on s.org_id = j.org_id and s.guide_key = 'exterior_wash' and s.asset_type = 'aircraft'
  where j.number = 'EDGE-1';
insert into job_assignments (job_id, user_id, org_id) select id, '00000000-0000-0000-0000-0000000000a2', org_id from jobs where number = 'EDGE-1';
do $$
declare
  j jobs := (select x from jobs x where number = 'EDGE-1');
  v jsonb;
begin
  assert (select est_hours from job_items where job_id = j.id) = 4, 'hours by size class';
  assert (select est_supply_cost from job_items where job_id = j.id) = 15, '0.25 gal × $40 + 0.1 oz/ft × 50 ft × $1';
  assert (select count(*) from job_checklist_items where job_id = j.id and kind = 'qc') > 0, 'QC items from the SOP';
  v := public.schedule_conflicts(j.org_id, j.id, j.scheduled_start, j.scheduled_end, array['00000000-0000-0000-0000-0000000000a2'::uuid]);
  assert exists (select 1 from jsonb_array_elements(v) e where e ->> 'type' = 'not_certified'), 'uncertified tech flagged: ' || v::text;
  perform public.set_skill(j.org_id, '00000000-0000-0000-0000-0000000000a2', 'exterior_wash', 'certified');
  v := public.schedule_conflicts(j.org_id, j.id, j.scheduled_start, j.scheduled_end, array['00000000-0000-0000-0000-0000000000a2'::uuid]);
  assert not exists (select 1 from jsonb_array_elements(v) e where e ->> 'type' = 'not_certified'), 'certified tech ok';
end $$;
update organizations set require_qc = true where id = (select v from ctx where k = 'edge');

-- Technician: requests sign-off, submits for QC, cannot fake QC.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a2', false);
do $$
declare j jobs := (select x from jobs x where number = 'EDGE-1');
begin
  perform public.request_skill_signoff(j.org_id, 'interior_detail');
  assert (select level from service_skills where user_id = auth.uid() and guide_key = 'interior_detail') = 'training', 'sign-off requested';
  assert public.test_outbox('skill_request') >= 1, 'managers told about the request';
  assert (select count(*) from faa_lookup(j.org_id, 'N550GV')) = 1, 'technicians can look up tails';
  perform public.submit_for_qc(j.id);
  assert (select qc_status from jobs where id = j.id) = 'pending', 'QC pending';
  begin
    update jobs set qc_status = 'passed' where id = j.id;
    raise exception 'QC cannot be passed directly';
  exception when raise_exception then
    if sqlerrm not like 'PERMISSION%' then raise; end if;
  end;
  begin
    perform public.qc_decision(j.id, true, null);
    raise exception 'technicians cannot pass QC';
  exception when raise_exception then
    if sqlerrm not like 'Only managers%' then raise; end if;
  end;
  begin
    perform public.set_skill(j.org_id, auth.uid(), 'interior_detail', 'certified');
    raise exception 'technicians cannot certify';
  exception when raise_exception then
    if sqlerrm not like 'Only managers%' then raise; end if;
  end;
end $$;

-- Five hours of work, photos, then completion needs a passed QC.
reset role;
select set_config('request.jwt.claim.sub', '', false);
insert into time_entries (org_id, user_id, job_id, started_at, ended_at)
  select org_id, '00000000-0000-0000-0000-0000000000a2', id, now() - interval '5 hours', now() from jobs where number = 'EDGE-1';
insert into job_photos (org_id, job_id, kind, storage_path)
  select org_id, id, k::photo_kind, org_id || '/jobs/' || id || '/' || k || '.jpg' from jobs, (values ('before'), ('after')) x(k) where number = 'EDGE-1';
insert into expenses (org_id, category, amount, description) select v, 'rent', 500, 'Hangar rent' from ctx where k = 'edge';
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', false);
update jobs set status = 'in_progress' where number = 'EDGE-1';
do $$
declare
  j jobs := (select x from jobs x where number = 'EDGE-1');
  p jsonb; r jsonb; q uuid; e jsonb;
begin
  begin
    update jobs set status = 'completed' where id = j.id;
    raise exception 'QC is required before completing';
  exception when raise_exception then
    if sqlerrm not like 'QC_REQUIRED%' then raise; end if;
  end;
  perform public.qc_decision(j.id, false, 'Streaks on the left wing');
  assert (select qc_status from jobs where id = j.id) = 'failed' and public.test_outbox('qc_failed') = 1, 'crew told what needs work';
  perform public.qc_decision(j.id, true, null);
  update jobs set status = 'completed' where id = j.id;
  assert (select quantity from inventory_items where name = 'Edge concentrate') = 9.75, 'fractional deduction';
  assert (select quantity from inventory_items where name = 'Edge wax') = 5, 'per-foot deduction (0.1 × 50 ft)';
  assert public.record_count((select id from inventory_items where name = 'Edge wax'), 4.5) = -0.5, 'decimal counts';

  p := public.job_profitability(j.id);
  assert (p ->> 'est_hours')::numeric = 4 and (p ->> 'actual_hours')::numeric = 5 and (p ->> 'hours_variance_pct')::numeric = 25, 'estimate vs actual: ' || p::text;
  assert (p ->> 'true_labor')::numeric = 230, 'true labor = 5 h × ($30 × 1.2 + $10)';
  assert (p ->> 'true_cost')::numeric = 245 and (p ->> 'true_profit')::numeric = 755, 'true cost and profit';
  assert (p ->> 'est_cost')::numeric = 199, 'estimated cost = 4 h × $46 + $15';

  r := public.job_costing_report(j.org_id, current_date - 1, current_date + 1);
  assert r -> 'by_class' -> 0 ->> 'label' = 'Light Jet' and (r -> 'by_class' -> 0 ->> 'profit')::numeric = 755, 'profit by class: ' || r::text;
  assert (r -> 'by_type' -> 0 ->> 'key') = 'aircraft' and (r -> 'totals' ->> 'jobs')::int = 1, 'by type and totals';
  assert (r -> 'by_service' -> 0 ->> 'variance_pct')::numeric = 25, 'estimate accuracy by service';

  insert into quotes (org_id, number, customer_id, aircraft_id) values (j.org_id, 'EQ-1', j.customer_id, j.aircraft_id) returning id into q;
  insert into quote_items (org_id, quote_id, service_id, description, quantity, unit_price)
    select j.org_id, q, service_id, description, 1, 1000 from job_items where job_id = j.id;
  e := public.quote_estimate(q);
  assert (e -> 'options' -> 0 ->> 'est_hours')::numeric = 4 and (e -> 'options' -> 0 ->> 'cost')::numeric = 199
     and (e -> 'options' -> 0 ->> 'margin_pct')::numeric = 80.1, 'quote margin: ' || e::text;
  assert (public.suggest_overhead_per_hour(j.org_id) ->> 'overhead_per_hour')::numeric = 100, '$500 non-job expenses / 5 h';
end $$;

-- AI condition reports are written by the server; managers apply them.
reset role;
select set_config('request.jwt.claim.sub', '', false);
insert into booking_requests (org_id, customer_id, aircraft_id, kind, photo_paths)
  select org_id, customer_id, id, 'photo_quote', array[org_id || '/portal/' || customer_id || '/a.jpg'] from aircraft where tail_number = 'N50EJ';
insert into condition_assessments (org_id, aircraft_id, customer_id, booking_request_id, source, photo_paths, status, overall, score, summary)
  select b.org_id, b.aircraft_id, b.customer_id, b.id, 'portal', b.photo_paths, 'done', 'heavy', 4, 'Heavy exhaust soot'
  from booking_requests b where b.kind = 'photo_quote';
update booking_requests set assessment_id = (select id from condition_assessments limit 1) where kind = 'photo_quote';
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a2', false);
do $$ begin
  assert (select count(*) from condition_assessments) = 1, 'crew can read condition reports';
  begin
    perform public.apply_assessment((select id from condition_assessments));
    raise exception 'technicians cannot apply';
  exception when raise_exception then
    if sqlerrm not like 'Not allowed%' then raise; end if;
  end;
end $$;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', false);
do $$ begin
  perform public.apply_assessment((select id from condition_assessments));
  assert (select condition_level from aircraft where tail_number = 'N50EJ') = 'heavy', 'condition saved to the aircraft';
  perform public.link_request_quote((select id from booking_requests where kind = 'photo_quote'), (select id from quotes where number = 'EQ-1'));
  assert (select status from booking_requests where kind = 'photo_quote') = 'approved', 'photo request answered with a quote';
  assert (select quote_id from condition_assessments) = (select id from quotes where number = 'EQ-1'), 'report linked to quote';
end $$;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false);
do $$ begin
  assert (select count(*) from condition_assessments) = 0, 'other companies see no condition reports';
  assert (select count(*) from service_skills) = 0, 'other companies see no skills';
  begin
    perform public.faa_lookup((select v from ctx where k = 'edge'), 'N550GV');
    raise exception 'non-members cannot use another company''s lookup';
  exception when raise_exception then
    if sqlerrm not like 'Not a member%' then raise; end if;
  end;
end $$;
reset role;
select set_config('request.jwt.claim.sub', '', false);

-- ---------- Plan tiers & AI checks (20261018000200) -------------------------
reset role;
select set_config('request.jwt.claim.sub', '', false);
do $$
declare
  o uuid := (select v from ctx where k = 'edge');
  u bigint;
  i int;
begin
  assert public.ai_included(o) = 15, 'trial: 15 checks';
  for i in 1..15 loop assert public.claim_ai_check(o) is not null; end loop;
  assert public.claim_ai_check(o) is null, 'out of checks';
  perform public.add_ai_credits(o, 2);
  u := public.claim_ai_check(o);
  assert u is not null and (select ai_extra_credits from organizations where id = o) = 1, 'packs used after the plan allowance';
  perform public.release_ai_check(u);
  assert (select ai_extra_credits from organizations where id = o) = 2, 'failed check refunded to the pack';
  assert (public.ai_allowance(o) ->> 'left')::int = 2 and (public.ai_allowance(o) ->> 'used')::int = 15, 'allowance';
  update organizations set plan = 'solo', plan_expires_at = now() + interval '30 days' where id = o;
  assert public.ai_included(o) = 25 and (public.ai_allowance(o) ->> 'left')::int = 12, 'solo: 25 + 2 extra - 15 used';
  assert not public.plan_allows(o, 'job_costing') and not public.plan_allows(o, 'photo_quotes'), 'solo lacks Team features';
end $$;
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', false);
do $$
declare o uuid := (select v from ctx where k = 'edge');
begin
  begin
    perform public.job_costing_report(o, current_date - 1, current_date + 1);
    raise exception 'job costing needs Team';
  exception when raise_exception then
    if sqlerrm not like 'PLAN_FEATURE%' then raise; end if;
  end;
  begin
    perform public.set_skill(o, '00000000-0000-0000-0000-0000000000a2', 'interior_detail', 'certified');
    raise exception 'certification needs Team';
  exception when raise_exception then
    if sqlerrm not like 'PLAN_FEATURE%' then raise; end if;
  end;
  begin
    update services set requires_cert = true where org_id = o and guide_key = 'interior_detail';
    raise exception 'certified-only services need Team';
  exception when raise_exception then
    if sqlerrm not like 'PLAN_FEATURE%' then raise; end if;
  end;
  perform public.job_profitability((select id from jobs where number = 'EDGE-1'));  -- estimate vs actual stays on every plan
  assert (public.ai_allowance(o) ->> 'included')::int = 25, 'members can read the allowance';
  begin
    update organizations set ai_extra_credits = 999 where id = o;
    raise exception 'credits must not be editable';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
select set_config('request.jwt.claim.sub', '', false);

-- ---------- Assistant, documents, question allowance (20261028000200) -------
reset role;
select set_config('request.jwt.claim.sub', '', false);
do $$
declare
  o uuid := (select v from ctx where k = 'edge');
  u bigint;
  i int;
begin
  update organizations set plan = 'solo', plan_expires_at = now() + interval '30 days', ai_extra_credits = 1, ai_question_bank = 0 where id = o;
  delete from ai_usage where org_id = o;
  assert public.ai_questions_included(o) = 300, 'solo: 300 questions';
  for i in 1..300 loop perform public.claim_ai_question(o); end loop;
  assert (public.ai_allowance(o) ->> 'questions_left')::int = 10, 'one AI check left = 10 questions';
  u := public.claim_ai_question(o);
  assert u is not null and (select ai_extra_credits from organizations where id = o) = 0
     and (select ai_question_bank from organizations where id = o) = 9, 'a check converts into 10 questions';
  perform public.release_ai_check(u);
  assert (select ai_question_bank from organizations where id = o) = 10, 'failed answer refunded to the bank';
  for i in 1..10 loop perform public.claim_ai_question(o); end loop;
  assert public.claim_ai_question(o) is null, 'out of questions';
  assert (public.ai_allowance(o) ->> 'used')::int = 0, 'questions do not use photo checks';
  insert into assistant_threads (org_id, user_id, title) values (o, '00000000-0000-0000-0000-0000000000a2', 'Drum raking');
  insert into assistant_messages (org_id, thread_id, role, content)
    select o, id, 'user', 'How often do I rake?' from assistant_threads where title = 'Drum raking';
end $$;
set role authenticated;
-- The technician sees their own conversation; the owner sees it too; another company does not.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a2', false);
do $$ begin
  assert (select count(*) from assistant_messages) = 1, 'asker sees own conversation';
  begin
    insert into assistant_messages (org_id, thread_id, role, content)
      select org_id, id, 'assistant', 'forged' from assistant_threads limit 1;
    raise exception 'messages are written by the server only';
  exception when insufficient_privilege then null;
  end;
end $$;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', false);
do $$ begin
  assert (select count(*) from assistant_threads where title = 'Drum raking') = 1, 'owner reads team conversations';
  assert (select count(*) from assistant_messages) = 1, 'owner reads the messages';
  begin
    perform public.platform_metrics();
    raise exception 'founder metrics are platform-admin only';
  exception when raise_exception then
    if sqlerrm not like 'Not allowed%' then raise; end if;
  end;
  begin
    insert into aircraft_documents (org_id, aircraft_id, title, storage_path, mime_type)
      select org_id, id, 'Bad path', org_id || '/receipts/x.pdf', 'application/pdf' from aircraft where tail_number = 'N50EJ';
    raise exception 'documents must live in the aircraft folder';
  exception when raise_exception then
    if sqlerrm not like 'File path%' then raise; end if;
  end;
  insert into aircraft_documents (org_id, aircraft_id, title, kind, storage_path, mime_type)
    select org_id, id, 'AMM 12 cleaning', 'manual', org_id || '/aircraft/' || id || '/docs/amm12.pdf', 'application/pdf' from aircraft where tail_number = 'N50EJ';
end $$;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false);
do $$ begin
  assert (select count(*) from assistant_threads) = 0 and (select count(*) from aircraft_documents) = 0, 'other companies see nothing';
end $$;
reset role;
insert into platform_admins (user_id) values ('00000000-0000-0000-0000-0000000000a1') on conflict do nothing;
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', false);
do $$ declare m jsonb := public.platform_metrics();
begin
  assert (m ->> 'companies')::int > 0 and m ? 'mrr' and m ? 'ai_questions_30d', 'founder metrics: ' || m::text;
end $$;
reset role;
select set_config('request.jwt.claim.sub', '', false);

-- ---------- Square (second payment processor) -------------------------------
reset role;
do $$ declare
  o uuid := (select v from ctx where k='edge');
  c uuid := (select id from customers where name = 'Edge Customer');
  q uuid; j uuid; i uuid;
begin
  begin
    update organizations set payment_mode = 'paypal' where id = o;
    raise exception 'unknown processors are rejected';
  exception when check_violation then null;
  end;
  update organizations set payment_mode = 'square', square_charges_enabled = false where id = o;
  assert not public.org_accepts_cards((select x from organizations x where id = o)), 'square not connected yet';
  update organizations set square_charges_enabled = true, square_merchant_id = 'MLTEST', square_location_id = 'LTEST' where id = o;
  assert public.org_accepts_cards((select x from organizations x where id = o)), 'square connected';
  insert into square_connections (org_id, merchant_id, access_token_enc, refresh_token_enc, expires_at)
    values (o, 'MLTEST', 'enc-a', 'enc-r', now() + interval '30 days');
  -- A Square deposit carries its processor onto the job's invoice.
  insert into quotes (org_id, number, customer_id) values (o, 'Q-SQ-1', c) returning id into q;
  perform set_config('app.quote_unlock', 'on', true);
  update quotes set status = 'accepted', deposit_amount = 50, deposit_paid_at = now(), deposit_payment_intent = 'sqpay_dep_1',
                    deposit_provider = 'square' where id = q;
  perform set_config('app.quote_unlock', 'off', true);
  insert into jobs (org_id, number, customer_id, title, quote_id, status) values (o, public._next_number(o, 'job'), c, 'Square deposit job', q, 'completed') returning id into j;
  i := public._create_invoice_for_job(j);
  assert (select provider from payments where stripe_payment_intent_id = 'sqpay_dep_1' and invoice_id = i) = 'square',
    'deposit recorded as a Square payment';
  update invoices set status = 'sent' where id = i;
  insert into ctx values ('sq_inv', i);
  -- Care plan sign-up page for Square.
  insert into recurring_schedules (org_id, customer_id, title, first_at, timezone, billing, care_plan_amount,
                                   care_plan_provider, care_plan_token, care_plan_status)
    values (o, c, 'Monthly wash', now(), 'UTC', 'care_plan', 250, 'square', 'cp-token-1', 'pending');
end $$;
create temp table sqtok as select public_token from invoices where id = (select v from ctx where k='sq_inv');
grant select on sqtok to anon;
set role anon;
do $$ declare d jsonb; begin
  d := public.get_public_document('invoice', (select public_token from sqtok));
  assert (d->'org'->>'accepts_cards')::boolean and d->'org'->>'payment_mode' = 'square', 'public invoice payable by Square: ' || (d->'org')::text;
  d := public.get_public_care_plan('cp-token-1');
  assert (d->>'amount')::numeric = 250 and d->>'title' = 'Monthly wash', 'public care plan: ' || coalesce(d::text, 'null');
  assert public.get_public_care_plan('nope') is null;
  begin
    perform count(*) from square_connections;
    raise exception 'tokens are server-only';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', false);
do $$ begin
  begin
    perform count(*) from square_connections;
    raise exception 'members cannot read Square tokens';
  exception when insufficient_privilege then null;
  end;
  begin
    update organizations set square_charges_enabled = true where id = (select v from ctx where k='edge');
    raise exception 'Square status is server-only';
  exception when insufficient_privilege then null;
  end;
  update organizations set payment_mode = 'stripe' where id = (select v from ctx where k='edge');
  assert (select payment_mode from organizations where id = (select v from ctx where k='edge')) = 'stripe', 'owner switches processor';
end $$;
reset role;
select set_config('request.jwt.claim.sub', '', false);

-- ---------- Mobile & shop -----------------------------------------------------
reset role;
do $$ declare
  o uuid := (select v from ctx where k='edge');
  c uuid := (select id from customers where name = 'Edge Customer');
  j1 uuid; j2 uuid; j3 uuid;
begin
  -- New jobs take the company's way of working.
  update organizations set service_mode = 'shop', shop_bays = 2, base_address = '1 Hangar Rd, Austin TX', shop_hours = 'Mon–Sat 8–6' where id = o;
  insert into jobs (org_id, number, customer_id, title, status, scheduled_start, scheduled_end)
    values (o, public._next_number(o, 'job'), c, 'Bay job 1', 'scheduled', '2030-05-01 14:00+00', '2030-05-01 20:00+00') returning id into j1;
  insert into jobs (org_id, number, customer_id, title, status, scheduled_start, scheduled_end)
    values (o, public._next_number(o, 'job'), c, 'Bay job 2', 'scheduled', '2030-05-01 15:00+00', '2030-05-01 18:00+00') returning id into j2;
  assert (select service_mode from jobs where id = j1) = 'shop', 'job defaults to shop';
  insert into jobs (org_id, number, customer_id, title, status, service_mode) values (o, public._next_number(o, 'job'), c, 'Mobile one', 'scheduled', 'mobile') returning id into j3;
  assert (select service_mode from jobs where id = j3) = 'mobile', 'per-job override kept';
  insert into ctx values ('bay1', j1), ('bay2', j2), ('mob', j3);
  -- A job made from a mobile quote stays mobile even in a shop company.
  insert into quotes (org_id, number, customer_id, service_mode) values (o, 'Q-MOB-1', c, 'mobile');
  insert into jobs (org_id, number, customer_id, title, status, quote_id)
    values (o, public._next_number(o, 'job'), c, 'From mobile quote', 'scheduled', (select id from quotes where number = 'Q-MOB-1' and org_id = o));
  assert (select service_mode from jobs where title = 'From mobile quote') = 'mobile', 'job follows its quote';
  -- Check-in details stamp the time.
  update jobs set checkin_odometer = '42,180 mi', checkin_keys = 'Hook 7' where id = j1;
  assert (select checked_in_at is not null from jobs where id = j1), 'check-in time stamped';
  -- Automations: ready for pickup exists for every company.
  assert (select count(*) from automations where key = 'ready_for_pickup') = (select count(*) from organizations), 'ready_for_pickup seeded';
  update customers set phone = '+15125550100', sms_consent = true, sms_opted_out = false, email = 'edge@example.com' where id = c;
  update automations set enabled = true where org_id = o and key in ('on_our_way','ready_for_pickup');
end $$;
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', false);
do $$ declare res jsonb; ids uuid[]; o uuid := (select ctx.v from ctx where k='edge'); begin
  -- Third car in a 2-bay shop at the same time.
  res := public.schedule_conflicts(o, null, '2030-05-01 16:00+00', '2030-05-01 17:00+00');
  assert res @> '[{"type":"bays_full"}]', 'bays full: ' || res::text;
  res := public.schedule_conflicts(o, null, '2030-05-01 21:00+00', '2030-05-01 22:00+00');
  assert not (res @> '[{"type":"bays_full"}]'), 'free after both are out';
  -- Picked up early frees the bay.
  update jobs set picked_up_at = now() where id = (select v from ctx where k='bay2');
  res := public.schedule_conflicts(o, null, '2030-05-01 16:00+00', '2030-05-01 17:00+00');
  assert not (res @> '[{"type":"bays_full"}]'), 'picked-up car frees its bay';
  -- Mobile job: on our way with arrival time.
  update jobs set service_address = '500 Lake Dr, Austin TX' where id = (select v from ctx where k='mob');
  ids := public.queue_on_our_way((select v from ctx where k='mob'), 25);
  assert cardinality(ids) = 1, 'one text queued';
  assert (select body from messages where id = ids[1]) like '%arrive in about 25 minutes%', (select body from messages where id = ids[1]);
  assert (select eta_minutes = 25 and on_my_way_at is not null from jobs where id = (select v from ctx where k='mob')), 'eta saved';
  -- Shop job: ready for pickup names the shop and hours.
  ids := public.queue_ready_for_pickup((select v from ctx where k='bay1'));
  assert (select body from messages where id = ids[1]) like '%ready for pickup! Pick up at 1 Hangar Rd, Austin TX (Mon–Sat 8–6).%', (select body from messages where id = ids[1]);
  assert (select ready_at is not null from jobs where id = (select v from ctx where k='bay1')), 'ready time saved';
  -- Settings are the owner's to change.
  update organizations set travel_fee_mode = 'per_mile', travel_rate_per_mile = 1.5, travel_free_miles = 10, service_radius_miles = 60 where id = o;
end $$;
reset role;
select set_config('request.jwt.claim.sub', '', false);

\echo ALL FLOW TESTS PASSED

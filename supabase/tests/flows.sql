-- Integration test for the schema: runs the main business flows as real
-- authenticated users with RLS enforced. Any failed assertion aborts.
\set ON_ERROR_STOP on
set client_min_messages = warning;

-- Two users in two separate detailing companies, plus a technician.
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'owner@alpha.test', '{"full_name":"Alice Owner"}'),
  ('00000000-0000-0000-0000-00000000000b', 'owner@bravo.test', '{"full_name":"Bob Owner"}'),
  ('00000000-0000-0000-0000-00000000000c', 'tech@alpha.test',  '{"full_name":"Tina Tech"}');

create temp table ctx (k text primary key, v uuid);
grant all on ctx to authenticated;

-- ---------- Alice creates an org (seeds price book) -------------------------
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
insert into ctx select 'alpha', public.create_organization('Alpha Aero Detailing');
do $$ begin
  assert (select count(*) from services) = 12, 'seeded services';
  assert (select plan from organizations) = 'trial', 'starts on trial';
  assert public.effective_plan((select v from ctx where k='alpha')) = 'trial';
end $$;

-- Customer, aircraft, quote with items → totals computed by trigger.
insert into customers (org_id, name, email, discount_pct) select v, 'Skyway Charter', 'ops@skyway.test', 10 from ctx where k='alpha';
insert into ctx select 'cust', id from customers;
insert into aircraft (org_id, customer_id, tail_number, manufacturer, model, category, length_ft)
  select (select v from ctx where k='alpha'), (select v from ctx where k='cust'), 'N123AB', 'Cessna', 'Citation CJ3', 'light_jet', 51.2;
insert into ctx select 'ac', id from aircraft;
update organizations set tax_rate = 0.07;  -- allowed column

insert into quotes (org_id, number, customer_id, aircraft_id, tax_rate, discount)
  select (select v from ctx where k='alpha'), public.next_number((select v from ctx where k='alpha'), 'quote'),
         (select v from ctx where k='cust'), (select v from ctx where k='ac'), 0.07, 0;
insert into ctx select 'quote', id from quotes;
insert into quote_items (org_id, quote_id, service_id, description, quantity, unit_price, taxable, sort_order)
  select s.org_id, (select v from ctx where k='quote'), s.id, s.name, 1, p.price, p.taxable, p.ord
  from (values ('Exterior Wash', 610.80, true, 1), ('Interior Detail', 455.00, false, 2)) p(name, price, taxable, ord)
  join services s on s.name = p.name;
do $$ declare q quotes; begin
  select * into q from quotes;
  assert q.number = 'Q-1001', 'quote numbering: ' || q.number;
  assert q.subtotal = 1065.80, 'quote subtotal ' || q.subtotal;
  assert q.tax = 42.76, 'quote tax only on taxable lines ' || q.tax;   -- 610.80 * 0.07
  assert q.total = 1108.56, 'quote total ' || q.total;
end $$;
update quotes set discount = 100;
do $$ declare q quotes; begin
  select * into q from quotes;
  -- taxable share after proportional discount: 610.80 - 100*610.80/1065.80 = 553.4917 → tax 38.74
  assert q.tax = 38.74, 'discounted tax ' || q.tax;
  assert q.total = 1004.54, 'discounted total ' || q.total;
end $$;

-- Quote → job (items + checklist copied) → complete → invoice.
insert into ctx select 'job', public.convert_quote_to_job((select v from ctx where k='quote'), now());
do $$ begin
  assert (select status from quotes) = 'accepted';
  assert (select count(*) from job_items) = 2, 'job items copied';
  assert (select count(*) from job_checklist_items) = 14, 'checklists copied: ' || (select count(*) from job_checklist_items);
  assert (select number from jobs) = 'WO-1001';
end $$;
update jobs set status = 'in_progress';
update jobs set status = 'completed';
do $$ begin
  assert (select actual_start is not null and actual_end is not null from jobs), 'actual times stamped';
  assert (select count(*) from service_reminders) = 2, 'recurring reminders created';
end $$;

insert into ctx select 'inv', public.create_invoice_from_job((select v from ctx where k='job'));
do $$ declare i invoices; begin
  select * into i from invoices;
  assert i.number = 'INV-1001';
  assert i.subtotal = 1065.80;
  assert i.discount = 106.58, 'customer 10% discount ' || i.discount;
  assert i.tax_rate = 0.07;
  assert i.status = 'draft';
  assert (select status from jobs) = 'invoiced';
end $$;
update invoices set status = 'sent';
insert into payments (org_id, invoice_id, amount, method) select org_id, id, 500, 'check' from invoices;
do $$ declare i invoices; begin
  select * into i from invoices;
  assert i.status = 'partial', 'partial status ' || i.status;
  assert i.amount_paid = 500;
end $$;
insert into payments (org_id, invoice_id, amount, method) select org_id, id, balance, 'card' from invoices;
do $$ begin
  assert (select status from invoices) = 'paid';
  assert (select balance from invoices) = 0;
end $$;

-- Inventory movements adjust stock.
insert into inventory_items (org_id, name, quantity, reorder_level) select v, 'Aero Wash Concentrate', 10, 2 from ctx where k='alpha';
insert into inventory_movements (org_id, item_id, delta, reason) select org_id, id, -3, 'job_use' from inventory_items;
do $$ begin assert (select quantity from inventory_items) = 7; end $$;

-- Protected columns: cannot self-upgrade plan.
do $$ begin
  begin
    update organizations set plan = 'fleet';
    raise exception 'should not be able to change plan';
  exception when insufficient_privilege then null;
  end;
end $$;

-- Dashboard & reports run.
do $$ declare d jsonb; r jsonb; begin
  d := public.dashboard_stats((select v from ctx where k='alpha'));
  assert (d->>'revenue_mtd')::numeric > 0, 'revenue mtd';
  r := public.report_summary((select v from ctx where k='alpha'), current_date - 30, current_date);
  assert jsonb_array_length(r->'by_service') = 2;
end $$;

-- Invite the technician.
create temp table invite_code as select public.invite_member((select v from ctx where k='alpha'), 'tech@alpha.test', 'technician') as code;
grant select on invite_code to authenticated;

-- ---------- Tech joins, sees work but not money -----------------------------
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000c', false);
select public.accept_invitation((select code from invite_code));
do $$ begin
  assert (select count(*) from jobs) = 1, 'tech sees jobs';
  assert (select count(*) from invoices) = 0, 'tech cannot see invoices';
  assert (select count(*) from quotes) = 0, 'tech cannot see quotes';
  assert (select count(*) from services) = 12, 'tech can read service menu';
  assert (public.dashboard_stats((select v from ctx where k='alpha'))->>'revenue_mtd') is null, 'no revenue for tech';
end $$;
update job_checklist_items set done = true where sort_order = 101;
select public.set_my_display_name('Tina T.');
do $$ begin
  assert (select display_name from memberships where user_id = auth.uid()) = 'Tina T.';
  assert (select role from memberships where user_id = auth.uid()) = 'technician';
  update memberships set role = 'owner' where user_id = auth.uid();
  assert (select role from memberships where user_id = auth.uid()) = 'technician', 'tech cannot self-promote';
end $$;
insert into time_entries (org_id, user_id, job_id) select org_id, auth.uid(), id from jobs;
do $$ begin
  begin
    insert into time_entries (org_id, user_id) select org_id, auth.uid() from jobs;
    raise exception 'second open clock should fail';
  exception when unique_violation then null;
  end;
end $$;

-- ---------- Bob (other company) is fully isolated ---------------------------
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false);
insert into ctx select 'bravo', public.create_organization('Bravo Jet Care', false);
do $$ begin
  assert (select count(*) from customers) = 0, 'isolation: customers';
  assert (select count(*) from jobs) = 0, 'isolation: jobs';
  assert (select count(*) from organizations) = 1, 'isolation: orgs';
  begin
    -- Try to attach an aircraft in my org to Alpha's customer id.
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
end $$;

-- ---------- Public document access by token (anon) --------------------------
reset role;
create temp table tok as select public_token from invoices;
create temp table qtok as select public_token from quotes;
grant select on tok, qtok to anon;
set role anon;
do $$ declare d jsonb; begin
  d := public.get_public_document('invoice', (select public_token from tok));
  assert d->'doc'->>'number' = 'INV-1001';
  assert d->'doc' ? 'public_token' = false;
  assert public.get_public_document('invoice', 'nope') is null;
  assert public.accept_public_quote((select public_token from qtok), 'Pat Pilot') = false, 'already-accepted quote cannot be re-accepted';
end $$;

-- ---------- Paywall: expired trial blocks new records -----------------------
reset role;
update organizations set trial_ends_at = now() - interval '1 day' where name = 'Bravo Jet Care';
set role authenticated;
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
  assert (select count(*) from organizations where name = 'Alpha Aero Detailing') = 1, 'other org untouched';
end $$;

-- Deleting an org with full history must cascade cleanly.
delete from organizations where name = 'Alpha Aero Detailing';
do $$ begin assert (select count(*) from invoices) = 0; end $$;

\echo ALL FLOW TESTS PASSED

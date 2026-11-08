-- Franchise operations: royalty statements, HQ announcements, location compliance and
-- national accounts.

-- Helper: is the caller a member (any role) of the network's HQ company?
create or replace function public.franchise_hq_member(p_network uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from franchise_networks n where n.id = p_network and public.is_member(n.hq_org_id));
$$;

-- ---------------------------------------------------------------------------
-- Royalty statements: one per location per month; HQ marks them paid.
-- ---------------------------------------------------------------------------
create table public.franchise_statements (
  id uuid primary key default gen_random_uuid(),
  network_id uuid not null references public.franchise_networks(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  month date not null check (month = date_trunc('month', month)::date),
  gross_sales numeric(12,2) not null default 0,
  royalty_pct numeric(5,2) not null default 0,
  royalty numeric(12,2) not null default 0,
  marketing_pct numeric(5,2) not null default 0,
  marketing numeric(12,2) not null default 0,
  total numeric(12,2) generated always as (royalty + marketing) stored,
  status text not null default 'unpaid' check (status in ('unpaid', 'paid')),
  paid_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  unique (network_id, org_id, month)
);
create index on public.franchise_statements (org_id, month desc);
alter table public.franchise_statements enable row level security;
create policy franchise_statements_read on public.franchise_statements for select
  using (public.franchise_hq_admin(network_id) or public.is_admin(org_id));
revoke insert, update, delete on public.franchise_statements from authenticated, anon;
grant select on public.franchise_statements to authenticated;

-- HQ: create (or refresh unpaid) statements for a month from the royalty report.
create or replace function public.franchise_generate_statements(p_network uuid, p_month date) returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not public.franchise_hq_admin(p_network) then raise exception 'Only franchise HQ admins can create statements'; end if;
  if date_trunc('month', p_month) >= date_trunc('month', now()) then raise exception 'Statements are for finished months'; end if;
  insert into franchise_statements (network_id, org_id, month, gross_sales, royalty_pct, royalty, marketing_pct, marketing)
  select p_network, r.org_id, date_trunc('month', p_month)::date, r.gross_sales, r.royalty_pct, r.royalty, r.marketing_pct, r.marketing
  from public.franchise_royalties(p_network, p_month) r
  on conflict (network_id, org_id, month) do update set
    gross_sales = excluded.gross_sales, royalty_pct = excluded.royalty_pct, royalty = excluded.royalty,
    marketing_pct = excluded.marketing_pct, marketing = excluded.marketing
  where franchise_statements.status = 'unpaid';
  get diagnostics n = row_count;
  return n;
end $$;

create or replace function public.franchise_set_statement_paid(p_statement uuid, p_paid boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from franchise_statements s where s.id = p_statement and public.franchise_hq_admin(s.network_id)) then
    raise exception 'Only franchise HQ admins can update statements';
  end if;
  update franchise_statements set status = case when p_paid then 'paid' else 'unpaid' end,
    paid_at = case when p_paid then now() else null end where id = p_statement;
end $$;

-- Service role only: who to email for a month's statements (location owners and admins).
create or replace function public.franchise_statement_recipients(p_network uuid, p_month date)
returns table (statement_id uuid, location_name text, emails text[]) language sql stable security definer set search_path = public as $$
  select s.id, coalesce(m.location_name, o.name),
    array(select u.email from memberships ms join auth.users u on u.id = ms.user_id
          where ms.org_id = s.org_id and ms.active and ms.role in ('owner', 'admin') and u.email is not null)
  from franchise_statements s
  join organizations o on o.id = s.org_id
  left join franchise_members m on m.org_id = s.org_id and m.network_id = s.network_id
  where s.network_id = p_network and s.month = date_trunc('month', p_month)::date;
$$;
revoke execute on function public.franchise_statement_recipients(uuid, date) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Announcements from HQ to every location
-- ---------------------------------------------------------------------------
create table public.franchise_announcements (
  id uuid primary key default gen_random_uuid(),
  network_id uuid not null references public.franchise_networks(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  body text check (body is null or char_length(body) <= 4000),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index on public.franchise_announcements (network_id, created_at desc);
alter table public.franchise_announcements enable row level security;
create policy franchise_announcements_read on public.franchise_announcements for select
  using (public.franchise_hq_member(network_id) or public.franchise_in_network(network_id));
revoke insert, update, delete on public.franchise_announcements from authenticated, anon;
grant select on public.franchise_announcements to authenticated;

-- HQ posts; each location's managers get a push notification.
create or replace function public.franchise_post_announcement(p_network uuid, p_title text, p_body text) returns uuid
language plpgsql security definer set search_path = public as $$
declare id uuid; net_name text;
begin
  if not public.franchise_hq_admin(p_network) then raise exception 'Only franchise HQ admins can post announcements'; end if;
  insert into franchise_announcements (network_id, title, body, created_by)
  values (p_network, trim(p_title), nullif(trim(coalesce(p_body, '')), ''), auth.uid()) returning franchise_announcements.id into id;
  select name into net_name from franchise_networks where franchise_networks.id = p_network;
  insert into notification_outbox (org_id, audience, kind, title, body, url)
  select m.org_id, 'managers', 'franchise_announcement', net_name || ': ' || left(trim(p_title), 100), left(nullif(trim(coalesce(p_body, '')), ''), 200), '/'
  from franchise_members m where m.network_id = p_network;
  return id;
end $$;

create or replace function public.franchise_delete_announcement(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from franchise_announcements a where a.id = p_id and public.franchise_hq_admin(a.network_id)) then
    raise exception 'Only franchise HQ admins can delete announcements';
  end if;
  delete from franchise_announcements where id = p_id;
end $$;

-- ---------------------------------------------------------------------------
-- Compliance: brand SOP certification coverage and QC trend per location
-- ---------------------------------------------------------------------------
create or replace function public.franchise_compliance(p_network uuid)
returns table (org_id uuid, location_name text, techs int, brand_sops int, certified int, possible int,
               qc_passed_this int, qc_failed_this int, qc_passed_last int, qc_failed_last int)
language plpgsql stable security definer set search_path = public as $$
declare this_start timestamptz := date_trunc('month', now()); last_start timestamptz := date_trunc('month', now()) - interval '1 month';
begin
  if not public.franchise_hq_admin(p_network) then raise exception 'Only franchise HQ admins can see compliance'; end if;
  return query
  with locs as (
    select m.org_id as oid, coalesce(m.location_name, o.name) as lname from franchise_members m join organizations o on o.id = m.org_id where m.network_id = p_network
  ), keys as (
    -- Brand SOPs: guides HQ pushes plus the guides behind services HQ pushes.
    select distinct g.key from franchise_networks n join service_guides g on g.org_id = n.hq_org_id and g.franchise_push where n.id = p_network
    union
    select distinct s.guide_key from franchise_networks n join services s on s.org_id = n.hq_org_id and s.franchise_push and s.guide_key is not null where n.id = p_network
  ), techs as (
    select ms.org_id as oid, ms.user_id from memberships ms join locs l on l.oid = ms.org_id where ms.active and ms.role in ('technician', 'manager')
  )
  select l.oid, l.lname,
    (select count(*)::int from techs t where t.oid = l.oid),
    (select count(*)::int from keys),
    (select count(*)::int from techs t join service_skills sk on sk.org_id = t.oid and sk.user_id = t.user_id
       where t.oid = l.oid and sk.level in ('certified', 'trainer') and sk.guide_key in (select key from keys)),
    (select count(*)::int from techs t where t.oid = l.oid) * (select count(*)::int from keys),
    (select count(*)::int from jobs j where j.org_id = l.oid and j.qc_status = 'passed' and coalesce(j.actual_end, j.updated_at) >= this_start),
    (select count(*)::int from jobs j where j.org_id = l.oid and j.qc_status = 'failed' and coalesce(j.actual_end, j.updated_at) >= this_start),
    (select count(*)::int from jobs j where j.org_id = l.oid and j.qc_status = 'passed' and coalesce(j.actual_end, j.updated_at) >= last_start and coalesce(j.actual_end, j.updated_at) < this_start),
    (select count(*)::int from jobs j where j.org_id = l.oid and j.qc_status = 'failed' and coalesce(j.actual_end, j.updated_at) >= last_start and coalesce(j.actual_end, j.updated_at) < this_start)
  from locs l order by l.lname;
end $$;

-- ---------------------------------------------------------------------------
-- National accounts: one customer (e.g. a management company) served by several locations
-- ---------------------------------------------------------------------------
create table public.franchise_accounts (
  id uuid primary key default gen_random_uuid(),
  network_id uuid not null references public.franchise_networks(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  notes text check (notes is null or char_length(notes) <= 2000),
  created_at timestamptz not null default now()
);
create unique index franchise_accounts_name on public.franchise_accounts (network_id, lower(name));
alter table public.franchise_accounts enable row level security;
create policy franchise_accounts_read on public.franchise_accounts for select
  using (public.franchise_hq_member(network_id) or public.franchise_in_network(network_id));
revoke insert, update, delete on public.franchise_accounts from authenticated, anon;
grant select on public.franchise_accounts to authenticated;

alter table public.customers add column franchise_account_id uuid references public.franchise_accounts(id) on delete set null;
create index on public.customers (franchise_account_id) where franchise_account_id is not null;

-- A customer can only be tagged with an account of its own company's network.
create or replace function public.trg_customer_franchise_account() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.franchise_account_id is not null and (tg_op = 'INSERT' or new.franchise_account_id is distinct from old.franchise_account_id) then
    if not exists (
      select 1 from franchise_accounts a join franchise_networks n on n.id = a.network_id
      where a.id = new.franchise_account_id
        and (n.hq_org_id = new.org_id or exists (select 1 from franchise_members m where m.network_id = n.id and m.org_id = new.org_id))
    ) then
      raise exception 'That national account is not in your franchise network';
    end if;
  end if;
  return new;
end $$;
create trigger customers_franchise_account before insert or update of franchise_account_id on public.customers
  for each row execute function public.trg_customer_franchise_account();

create or replace function public.franchise_save_account(p_network uuid, p_id uuid, p_name text, p_notes text) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid := p_id;
begin
  if not public.franchise_hq_admin(p_network) then raise exception 'Only franchise HQ admins can manage national accounts'; end if;
  if v_id is null then
    insert into franchise_accounts (network_id, name, notes) values (p_network, trim(p_name), nullif(trim(coalesce(p_notes, '')), ''))
    returning id into v_id;
  else
    update franchise_accounts set name = trim(p_name), notes = nullif(trim(coalesce(p_notes, '')), '') where id = v_id and network_id = p_network;
  end if;
  return v_id;
exception when unique_violation then
  raise exception 'There is already a national account with that name';
end $$;

create or replace function public.franchise_delete_account(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from franchise_accounts a where a.id = p_id and public.franchise_hq_admin(a.network_id)) then
    raise exception 'Only franchise HQ admins can manage national accounts';
  end if;
  delete from franchise_accounts where id = p_id;
end $$;

-- HQ: each national account's business at each location for a period.
create or replace function public.franchise_account_report(p_network uuid, p_from timestamptz, p_to timestamptz)
returns table (account_id uuid, account_name text, org_id uuid, location_name text, customers int, jobs int, revenue numeric)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.franchise_hq_admin(p_network) then raise exception 'Only franchise HQ admins can see national accounts'; end if;
  return query
  select a.id, a.name, c.org_id, coalesce(m.location_name, o.name),
    count(distinct c.id)::int,
    (select count(*)::int from jobs j where j.customer_id = any(array_agg(c.id)) and j.status in ('completed', 'invoiced')
       and coalesce(j.actual_end, j.scheduled_end, j.updated_at) >= p_from and coalesce(j.actual_end, j.scheduled_end, j.updated_at) < p_to),
    coalesce((select sum(p.amount) from payments p join invoices i on i.id = p.invoice_id
       where i.customer_id = any(array_agg(c.id)) and p.received_at >= p_from and p.received_at < p_to), 0)
  from franchise_accounts a
  join customers c on c.franchise_account_id = a.id
  join organizations o on o.id = c.org_id
  left join franchise_members m on m.org_id = c.org_id and m.network_id = a.network_id
  where a.network_id = p_network
  group by a.id, a.name, c.org_id, coalesce(m.location_name, o.name)
  order by a.name, 7 desc;
end $$;

revoke execute on function public.franchise_generate_statements(uuid, date), public.franchise_set_statement_paid(uuid, boolean),
  public.franchise_post_announcement(uuid, text, text), public.franchise_delete_announcement(uuid), public.franchise_compliance(uuid),
  public.franchise_save_account(uuid, uuid, text, text), public.franchise_delete_account(uuid),
  public.franchise_account_report(uuid, timestamptz, timestamptz) from public, anon;
grant execute on function public.franchise_generate_statements(uuid, date), public.franchise_set_statement_paid(uuid, boolean),
  public.franchise_post_announcement(uuid, text, text), public.franchise_delete_announcement(uuid), public.franchise_compliance(uuid),
  public.franchise_save_account(uuid, uuid, text, text), public.franchise_delete_account(uuid),
  public.franchise_account_report(uuid, timestamptz, timestamptz) to authenticated;

-- Demo sample network: announcements, a national account and last month's statements.
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
  v_acct uuid;
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
  -- Announcements, a national account served by two locations, and last month's statements.
  insert into franchise_announcements (network_id, title, body, created_by, created_at) values
    (v_net, 'New brightwork SOP starts Monday', 'HQ updated the brightwork SOP: Nuvite-style cut then polish, sealant after. It is locked for every location.', v_uid, now() - interval '2 days'),
    (v_net, 'Winter weather reminder', 'No wet washes below 40°F on the ramp. Use the dry wash SOP and log the reason on the job.', v_uid, now() - interval '9 days');
  insert into franchise_accounts (network_id, name, notes)
    values (v_net, 'Sky Management Group', 'Manages 40+ jets. Net 30, brand pricing, monthly wash on every tail.') returning id into v_acct;
  update customers set franchise_account_id = v_acct
    where org_id in (select org_id from franchise_members where network_id = v_net and location_name in ('Skyline Houston', 'Skyline Dallas'));
  perform public.franchise_generate_statements(v_net, (date_trunc('month', now()) - interval '1 month')::date);
  update franchise_statements set status = 'paid', paid_at = now() - interval '3 days', sent_at = now() - interval '6 days'
    where network_id = v_net and org_id = (select org_id from franchise_members where network_id = v_net and location_name = 'Skyline Houston');
  update franchise_statements set sent_at = now() - interval '6 days' where network_id = v_net and sent_at is null;
  perform set_config('tarmo.franchise_sync', '', true);
  update franchise_networks set standards_pushed_at = now(), booking_enabled = true,
    public_slug = 'skyline-demo-' || substr(replace(v_net::text, '-', ''), 1, 8) where id = v_net;
  return v_net;
end $$;

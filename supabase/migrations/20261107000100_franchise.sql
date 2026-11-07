-- Franchise networks: a franchisor (HQ company) and independent franchisee companies.
--
-- Each franchisee stays its own company: its own customers, books, payment accounts and
-- team. HQ sees totals per location (revenue, jobs, quality, AI use) through the
-- functions below, never the franchisee's records, unless the franchisee turns on
-- "share job details". HQ pushes standards (services, prices, SOPs) down to every
-- location, each locked or editable, and writes a brand playbook every location's
-- Ask Tarmo follows.

create table public.franchise_networks (
  id uuid primary key default gen_random_uuid(),
  hq_org_id uuid not null unique references public.organizations(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  royalty_pct numeric(5,2) not null default 0 check (royalty_pct between 0 and 50),
  marketing_pct numeric(5,2) not null default 0 check (marketing_pct between 0 and 50),
  invite_code text not null unique default upper(substr(md5(gen_random_uuid()::text), 1, 8)),
  hq_playbook text check (hq_playbook is null or char_length(hq_playbook) <= 8000),
  standards_pushed_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.franchise_members (
  network_id uuid not null references public.franchise_networks(id) on delete cascade,
  org_id uuid not null unique references public.organizations(id) on delete cascade,
  location_name text check (location_name is null or char_length(location_name) <= 120),
  territory text check (territory is null or char_length(territory) <= 200),
  share_details boolean not null default false,
  joined_at timestamptz not null default now(),
  primary key (network_id, org_id)
);

alter table public.franchise_networks enable row level security;
alter table public.franchise_members enable row level security;

-- Helpers (definer rights, so the two policies don't query each other under RLS).
create or replace function public.franchise_hq_admin(p_network uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from franchise_networks n where n.id = p_network and public.is_admin(n.hq_org_id));
$$;
create or replace function public.franchise_in_network(p_network uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from franchise_members m where m.network_id = p_network and public.is_member(m.org_id));
$$;

-- HQ members see their network; members of a franchisee company see the network it belongs to.
create policy franchise_networks_read on public.franchise_networks for select using (
  public.is_member(hq_org_id) or public.franchise_in_network(id)
);
create policy franchise_members_read on public.franchise_members for select using (
  public.is_member(org_id) or public.franchise_hq_admin(network_id)
);
-- Changes go through the functions below only.
revoke insert, update, delete on public.franchise_networks, public.franchise_members from authenticated, anon;
grant select on public.franchise_networks, public.franchise_members to authenticated;

-- ---------------------------------------------------------------------------
-- Standards pushed from HQ
-- ---------------------------------------------------------------------------
-- On HQ's own rows: franchise_push (send it to locations) and franchise_lock (locations can't edit it).
-- On a location's copy: franchise_source_id (the HQ row) and franchise_locked.
alter table public.services
  add column franchise_push boolean not null default false,
  add column franchise_lock boolean not null default true,
  add column franchise_source_id uuid,
  add column franchise_locked boolean not null default false;
alter table public.service_guides
  add column franchise_push boolean not null default false,
  add column franchise_lock boolean not null default true,
  add column franchise_source_id uuid,
  add column franchise_locked boolean not null default false;
create unique index services_franchise_source on public.services (org_id, franchise_source_id) where franchise_source_id is not null;
create unique index service_guides_franchise_source on public.service_guides (org_id, franchise_source_id) where franchise_source_id is not null;

-- Locked HQ standards can't be edited or deleted at the location (HQ's sync can).
create or replace function public.franchise_lock_guard() returns trigger language plpgsql as $$
begin
  if not old.franchise_locked or coalesce(current_setting('tarmo.franchise_sync', true), '') = '1' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  -- Deleting the whole company (cascade) is always allowed.
  if tg_op = 'DELETE' and pg_trigger_depth() > 1 then return old; end if;
  raise exception 'HQ_LOCKED: This is set by your franchise HQ and can''t be changed here.';
end $$;
create trigger services_franchise_lock before update or delete on public.services
  for each row execute function public.franchise_lock_guard();
create trigger service_guides_franchise_lock before update or delete on public.service_guides
  for each row execute function public.franchise_lock_guard();

-- Copies one table's HQ rows (franchise_push) into one location, matched by franchise_source_id.
-- Returns how many rows were added or updated.
create or replace function public._franchise_copy(p_table text, p_hq uuid, p_org uuid) returns int
language plpgsql security definer set search_path = public as $$
declare
  cols text;
  src record;
  existing uuid;
  is_copy boolean;
  n int := 0;
begin
  select string_agg(quote_ident(column_name), ', ' order by ordinal_position) into cols
  from information_schema.columns
  where table_schema = 'public' and table_name = p_table and is_generated = 'NEVER' and is_updatable = 'YES'
    and column_name not in ('id', 'org_id', 'created_at', 'franchise_push', 'franchise_lock', 'franchise_source_id', 'franchise_locked', 'based_on');

  for src in execute format('select id, franchise_lock%s from %I where org_id = $1 and franchise_push',
                            case when p_table = 'service_guides' then ', key' else '' end, p_table) using p_hq loop
    execute format('select id from %I where org_id = $1 and franchise_source_id = $2', p_table) into existing using p_org, src.id;
    is_copy := existing is not null;
    -- A location's own SOP with the same key becomes the HQ standard.
    if existing is null and p_table = 'service_guides' then
      select id into existing from service_guides where org_id = p_org and key = src.key and franchise_source_id is null limit 1;
    end if;
    if existing is null then
      execute format('insert into %I (org_id, franchise_source_id, franchise_locked, %s) select $1, id, franchise_lock, %s from %I where id = $2',
                     p_table, cols, cols, p_table) using p_org, src.id;
    elsif is_copy and not src.franchise_lock then
      -- Editable standard the location already has: keep the location's version.
      execute format('update %I set franchise_locked = false where id = $1', p_table) using existing;
    else
      execute format('update %I d set (%s) = (select %s from %I s where s.id = $1), franchise_source_id = $1, franchise_locked = $2 where d.id = $3',
                     p_table, cols, cols, p_table) using src.id, src.franchise_lock, existing;
    end if;
    n := n + 1;
  end loop;

  -- Standards HQ stopped pushing stay at the location, unlocked and detached.
  execute format('update %I d set franchise_locked = false, franchise_source_id = null where d.org_id = $1 and d.franchise_source_id is not null
                  and not exists (select 1 from %I s where s.id = d.franchise_source_id and s.org_id = $2 and s.franchise_push)', p_table, p_table)
    using p_org, p_hq;
  return n;
end $$;
revoke execute on function public._franchise_copy(text, uuid, uuid) from public, anon, authenticated;

-- HQ: send the marked services, prices and SOPs to every location. Returns locations updated.
create or replace function public.franchise_push_standards(p_network uuid) returns int
language plpgsql security definer set search_path = public as $$
declare
  net franchise_networks;
  m record;
  n int := 0;
begin
  select * into net from franchise_networks where id = p_network;
  if net.id is null or not public.is_admin(net.hq_org_id) then raise exception 'Only franchise HQ admins can push standards'; end if;
  perform set_config('tarmo.franchise_sync', '1', true);
  for m in select org_id from franchise_members where network_id = p_network loop
    -- SOPs first, so pushed services find their guide.
    perform public._franchise_copy('service_guides', net.hq_org_id, m.org_id);
    perform public._franchise_copy('services', net.hq_org_id, m.org_id);
    n := n + 1;
  end loop;
  perform set_config('tarmo.franchise_sync', '', true);
  update franchise_networks set standards_pushed_at = now() where id = p_network;
  return n;
end $$;

-- ---------------------------------------------------------------------------
-- Creating, joining and leaving
-- ---------------------------------------------------------------------------
create or replace function public.franchise_create(p_org uuid, p_name text, p_royalty numeric default 0, p_marketing numeric default 0)
returns uuid language plpgsql security definer set search_path = public as $$
declare id uuid;
begin
  if not public.is_admin(p_org) then raise exception 'Only owners and admins can set up a franchise network'; end if;
  if exists (select 1 from franchise_members where org_id = p_org) then raise exception 'This company is a location in another franchise network'; end if;
  if public.effective_plan(p_org) not in ('fleet', 'trial') then raise exception 'PLAN: Franchise HQ is part of the Fleet and Enterprise plans'; end if;
  insert into franchise_networks (hq_org_id, name, royalty_pct, marketing_pct)
  values (p_org, trim(p_name), coalesce(p_royalty, 0), coalesce(p_marketing, 0)) returning franchise_networks.id into id;
  return id;
end $$;

create or replace function public.franchise_update(p_network uuid, p_name text, p_royalty numeric, p_marketing numeric, p_playbook text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from franchise_networks where id = p_network and public.is_admin(hq_org_id)) then
    raise exception 'Only franchise HQ admins can change the network';
  end if;
  update franchise_networks set name = trim(p_name), royalty_pct = coalesce(p_royalty, 0), marketing_pct = coalesce(p_marketing, 0),
    hq_playbook = nullif(trim(coalesce(p_playbook, '')), '')
  where id = p_network;
end $$;

create or replace function public.franchise_new_code(p_network uuid) returns text
language plpgsql security definer set search_path = public as $$
declare code text := upper(substr(md5(gen_random_uuid()::text), 1, 8));
begin
  if not exists (select 1 from franchise_networks where id = p_network and public.is_admin(hq_org_id)) then
    raise exception 'Only franchise HQ admins can change the invite code';
  end if;
  update franchise_networks set invite_code = code where id = p_network;
  return code;
end $$;

-- A franchisee owner joins with HQ's invite code. Standards are copied right away.
create or replace function public.franchise_join(p_org uuid, p_code text, p_location_name text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare net franchise_networks;
begin
  if not public.is_owner(p_org) then raise exception 'Only the company owner can join a franchise network'; end if;
  select * into net from franchise_networks where invite_code = upper(trim(p_code));
  if net.id is null then raise exception 'That invite code is not valid. Check it with your franchise HQ.'; end if;
  if net.hq_org_id = p_org then raise exception 'This company is the HQ of that network'; end if;
  if exists (select 1 from franchise_networks where hq_org_id = p_org) then raise exception 'A franchise HQ can''t join another network'; end if;
  if exists (select 1 from franchise_members where org_id = p_org) then raise exception 'This company is already in a franchise network'; end if;
  insert into franchise_members (network_id, org_id, location_name)
  values (net.id, p_org, nullif(trim(coalesce(p_location_name, '')), ''));
  perform set_config('tarmo.franchise_sync', '1', true);
  perform public._franchise_copy('service_guides', net.hq_org_id, p_org);
  perform public._franchise_copy('services', net.hq_org_id, p_org);
  perform set_config('tarmo.franchise_sync', '', true);
  return net.id;
end $$;

-- Location settings: the franchisee owner sets sharing; HQ admins set the location name and territory.
create or replace function public.franchise_update_member(p_org uuid, p_location_name text default null, p_territory text default null, p_share_details boolean default null)
returns void language plpgsql security definer set search_path = public as $$
declare mem franchise_members; hq boolean;
begin
  select * into mem from franchise_members where org_id = p_org;
  if mem.org_id is null then raise exception 'Not in a franchise network'; end if;
  hq := exists (select 1 from franchise_networks where id = mem.network_id and public.is_admin(hq_org_id));
  if p_share_details is not null and not public.is_owner(p_org) then raise exception 'Only the location''s owner can change what HQ sees'; end if;
  if (p_location_name is not null or p_territory is not null) and not (hq or public.is_owner(p_org)) then raise exception 'Not allowed'; end if;
  update franchise_members set
    location_name = case when p_location_name is null then location_name else nullif(trim(p_location_name), '') end,
    territory = case when p_territory is null then territory else nullif(trim(p_territory), '') end,
    share_details = coalesce(p_share_details, share_details)
  where org_id = p_org;
end $$;

-- The location's owner leaves, or HQ removes the location. Its copies of HQ standards stay, unlocked.
create or replace function public.franchise_leave(p_org uuid) returns void
language plpgsql security definer set search_path = public as $$
declare mem franchise_members;
begin
  select * into mem from franchise_members where org_id = p_org;
  if mem.org_id is null then return; end if;
  if not (public.is_owner(p_org) or exists (select 1 from franchise_networks where id = mem.network_id and public.is_admin(hq_org_id))) then
    raise exception 'Only the location''s owner or franchise HQ can do that';
  end if;
  perform set_config('tarmo.franchise_sync', '1', true);
  update services set franchise_locked = false, franchise_source_id = null where org_id = p_org and franchise_source_id is not null;
  update service_guides set franchise_locked = false, franchise_source_id = null where org_id = p_org and franchise_source_id is not null;
  perform set_config('tarmo.franchise_sync', '', true);
  delete from franchise_members where org_id = p_org;
end $$;

-- ---------------------------------------------------------------------------
-- HQ reporting (totals only; job details only where the location shares them)
-- ---------------------------------------------------------------------------
-- One row per location (HQ's own company first) for [p_from, p_to).
create or replace function public.franchise_dashboard(p_network uuid, p_from timestamptz, p_to timestamptz)
returns table (
  org_id uuid, location_name text, territory text, is_hq boolean, share_details boolean,
  revenue numeric, invoiced numeric, invoices int, jobs_completed int, quotes_sent int, quotes_won int,
  new_customers int, qc_passed int, qc_failed int, avg_rating numeric, ratings int, ai_questions int, team int
) language plpgsql stable security definer set search_path = public as $$
begin
  if not exists (select 1 from franchise_networks n where n.id = p_network and public.is_admin(n.hq_org_id)) then
    raise exception 'Only franchise HQ admins can see network reports';
  end if;
  return query
  with locs as (
    select n.hq_org_id as oid, null::text as lname, null::text as terr, true as hq, true as share from franchise_networks n where n.id = p_network
    union all
    select m.org_id, m.location_name, m.territory, false, m.share_details from franchise_members m where m.network_id = p_network
  )
  select l.oid, coalesce(l.lname, o.name), l.terr, l.hq, l.share,
    coalesce((select sum(p.amount) from payments p where p.org_id = l.oid and p.received_at >= p_from and p.received_at < p_to), 0),
    coalesce((select sum(i.total) from invoices i where i.org_id = l.oid and i.status not in ('draft', 'void') and i.issue_date >= p_from::date and i.issue_date < p_to::date), 0),
    (select count(*)::int from invoices i where i.org_id = l.oid and i.status not in ('draft', 'void') and i.issue_date >= p_from::date and i.issue_date < p_to::date),
    (select count(*)::int from jobs j where j.org_id = l.oid and j.status in ('completed', 'invoiced')
       and coalesce(j.actual_end, j.scheduled_end, j.updated_at) >= p_from and coalesce(j.actual_end, j.scheduled_end, j.updated_at) < p_to),
    (select count(*)::int from quotes q where q.org_id = l.oid and q.status <> 'draft' and q.issue_date >= p_from::date and q.issue_date < p_to::date),
    (select count(*)::int from quotes q where q.org_id = l.oid and q.status = 'accepted' and q.issue_date >= p_from::date and q.issue_date < p_to::date),
    (select count(*)::int from customers c where c.org_id = l.oid and c.created_at >= p_from and c.created_at < p_to),
    (select count(*)::int from jobs j where j.org_id = l.oid and j.qc_status = 'passed' and coalesce(j.actual_end, j.updated_at) >= p_from and coalesce(j.actual_end, j.updated_at) < p_to),
    (select count(*)::int from jobs j where j.org_id = l.oid and j.qc_status = 'failed' and coalesce(j.actual_end, j.updated_at) >= p_from and coalesce(j.actual_end, j.updated_at) < p_to),
    (select round(avg(j.rating)::numeric, 2) from jobs j where j.org_id = l.oid and j.rating is not null and coalesce(j.actual_end, j.updated_at) >= p_from and coalesce(j.actual_end, j.updated_at) < p_to),
    (select count(*)::int from jobs j where j.org_id = l.oid and j.rating is not null and coalesce(j.actual_end, j.updated_at) >= p_from and coalesce(j.actual_end, j.updated_at) < p_to),
    (select count(*)::int from assistant_messages a where a.org_id = l.oid and a.role = 'user' and a.created_at >= p_from and a.created_at < p_to),
    (select count(*)::int from memberships ms where ms.org_id = l.oid and ms.active)
  from locs l join organizations o on o.id = l.oid
  order by l.hq desc, coalesce(l.lname, o.name);
end $$;

-- Royalty report for one calendar month: gross collected per franchise location.
create or replace function public.franchise_royalties(p_network uuid, p_month date)
returns table (org_id uuid, location_name text, territory text, gross_sales numeric, payments int, royalty_pct numeric, royalty numeric, marketing_pct numeric, marketing numeric)
language plpgsql stable security definer set search_path = public as $$
declare start_at timestamptz := date_trunc('month', p_month); end_at timestamptz := date_trunc('month', p_month) + interval '1 month';
begin
  if not exists (select 1 from franchise_networks n where n.id = p_network and public.is_admin(n.hq_org_id)) then
    raise exception 'Only franchise HQ admins can see royalties';
  end if;
  return query
  select m.org_id, coalesce(m.location_name, o.name), m.territory, g.gross, g.cnt, n.royalty_pct,
    round(g.gross * n.royalty_pct / 100, 2), n.marketing_pct, round(g.gross * n.marketing_pct / 100, 2)
  from franchise_members m
  join franchise_networks n on n.id = m.network_id
  join organizations o on o.id = m.org_id
  cross join lateral (
    select coalesce(sum(p.amount), 0) as gross, count(*)::int as cnt
    from payments p where p.org_id = m.org_id and p.received_at >= start_at and p.received_at < end_at
  ) g
  where m.network_id = p_network
  order by coalesce(m.location_name, o.name);
end $$;

-- Job-level detail for one location, only when that location shares it. No customer names or contacts.
create or replace function public.franchise_location_jobs(p_network uuid, p_org uuid, p_from timestamptz, p_to timestamptz)
returns table (job_number text, status text, finished_at timestamptz, asset text, invoice_total numeric, qc_status text, rating int)
language plpgsql stable security definer set search_path = public as $$
begin
  if not exists (
    select 1 from franchise_networks n join franchise_members m on m.network_id = n.id
    where n.id = p_network and m.org_id = p_org and m.share_details and public.is_admin(n.hq_org_id)
  ) then
    raise exception 'This location has not shared job details with HQ';
  end if;
  return query
  select j.number, j.status::text, coalesce(j.actual_end, j.scheduled_end, j.updated_at),
    nullif(trim(concat_ws(' ', a.manufacturer, a.model)), ''),
    (select sum(i.total) from invoices i where i.job_id = j.id and i.status <> 'void'),
    j.qc_status, j.rating
  from jobs j left join aircraft a on a.id = j.aircraft_id
  where j.org_id = p_org and coalesce(j.actual_end, j.scheduled_end, j.updated_at) >= p_from
    and coalesce(j.actual_end, j.scheduled_end, j.updated_at) < p_to
  order by 3 desc
  limit 500;
end $$;

revoke execute on function public.franchise_dashboard(uuid, timestamptz, timestamptz), public.franchise_royalties(uuid, date),
  public.franchise_location_jobs(uuid, uuid, timestamptz, timestamptz), public.franchise_push_standards(uuid),
  public.franchise_create(uuid, text, numeric, numeric), public.franchise_update(uuid, text, numeric, numeric, text),
  public.franchise_new_code(uuid), public.franchise_join(uuid, text, text),
  public.franchise_update_member(uuid, text, text, boolean), public.franchise_leave(uuid) from public, anon;
grant execute on function public.franchise_dashboard(uuid, timestamptz, timestamptz), public.franchise_royalties(uuid, date),
  public.franchise_location_jobs(uuid, uuid, timestamptz, timestamptz), public.franchise_push_standards(uuid),
  public.franchise_create(uuid, text, numeric, numeric), public.franchise_update(uuid, text, numeric, numeric, text),
  public.franchise_new_code(uuid), public.franchise_join(uuid, text, text),
  public.franchise_update_member(uuid, text, text, boolean), public.franchise_leave(uuid) to authenticated;

-- HQ admins can mark their own services and SOPs for pushing.
grant update (franchise_push, franchise_lock) on public.services to authenticated;
grant update (franchise_push, franchise_lock) on public.service_guides to authenticated;

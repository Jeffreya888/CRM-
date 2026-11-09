-- QuickBooks Online sync (one-way, Tarmo → QuickBooks): customers, invoices and payments.
-- Owners/admins connect through Intuit's sign-in (quickbooks function). Tokens stay server-side;
-- the app only ever sees the status below. The automation worker syncs every 10 minutes.

create table if not exists public.qbo_connections (
  org_id uuid primary key references public.organizations(id) on delete cascade,
  realm_id text not null,
  environment text not null default 'production' check (environment in ('sandbox', 'production')),
  company_name text,
  access_token text not null,
  refresh_token text not null,
  access_expires_at timestamptz not null,
  refresh_expires_at timestamptz,
  service_item_id text,           -- "Detailing services" item used on invoice lines
  tax_item_id text,               -- "Sales tax (from Tarmo)" item for the tax line
  sync_from date not null default date_trunc('month', current_date)::date,  -- invoices issued on/after this date
  connected_by uuid references auth.users(id) on delete set null,
  connected_at timestamptz not null default now(),
  last_sync_at timestamptz,
  last_error text,
  last_error_at timestamptz
);
alter table public.qbo_connections enable row level security;
revoke all on public.qbo_connections from anon, authenticated;

-- What has been sent to QuickBooks: customer / invoice / payment → QuickBooks id.
create table if not exists public.qbo_links (
  org_id uuid not null references public.organizations(id) on delete cascade,
  kind text not null check (kind in ('customer', 'invoice', 'payment')),
  local_id uuid not null,
  qbo_id text,
  sync_token text,
  synced_at timestamptz,
  error text,
  error_at timestamptz,
  attempts int not null default 0,
  primary key (org_id, kind, local_id)
);
alter table public.qbo_links enable row level security;
revoke all on public.qbo_links from anon, authenticated;

-- Status for the Settings card (owners and admins).
create or replace function public.quickbooks_status(p_org uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare c qbo_connections;
begin
  if not public.is_admin(p_org) then raise exception 'Only owners and admins can see the QuickBooks connection'; end if;
  select * into c from qbo_connections where org_id = p_org;
  if c.org_id is null then return jsonb_build_object('connected', false); end if;
  return jsonb_build_object(
    'connected', true, 'company_name', c.company_name, 'environment', c.environment, 'connected_at', c.connected_at,
    'sync_from', c.sync_from, 'last_sync_at', c.last_sync_at, 'last_error', c.last_error, 'last_error_at', c.last_error_at,
    'needs_reconnect', c.refresh_expires_at is not null and c.refresh_expires_at < now(),
    'customers', (select count(*) from qbo_links where org_id = p_org and kind = 'customer' and qbo_id is not null),
    'invoices', (select count(*) from qbo_links where org_id = p_org and kind = 'invoice' and qbo_id is not null),
    'payments', (select count(*) from qbo_links where org_id = p_org and kind = 'payment' and qbo_id is not null),
    'failed', (select count(*) from qbo_links where org_id = p_org and error is not null),
    'recent_errors', coalesce((select jsonb_agg(x) from (
      select jsonb_build_object('kind', l.kind, 'error', l.error, 'at', l.error_at,
        'label', case l.kind when 'invoice' then (select 'Invoice ' || number from invoices where id = l.local_id)
                             when 'customer' then (select name from customers where id = l.local_id)
                             else 'Payment' end) x
      from qbo_links l where l.org_id = p_org and l.error is not null order by l.error_at desc limit 5) t), '[]')
  );
end;
$$;
revoke execute on function public.quickbooks_status(uuid) from public, anon;
grant execute on function public.quickbooks_status(uuid) to authenticated;

-- Owners/admins choose how far back to send invoices (e.g. start of the year). Already-sent ones are kept.
create or replace function public.quickbooks_set_sync_from(p_org uuid, p_from date)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin(p_org) then raise exception 'Only owners and admins can change QuickBooks sync'; end if;
  if p_from is null or p_from < current_date - interval '3 years' or p_from > current_date then raise exception 'Choose a date in the last 3 years'; end if;
  update qbo_connections set sync_from = p_from where org_id = p_org;
end;
$$;
revoke execute on function public.quickbooks_set_sync_from(uuid, date) from public, anon;
grant execute on function public.quickbooks_set_sync_from(uuid, date) to authenticated;

-- Work for one sync run (service role): invoices and payments not yet in QuickBooks, or changed since.
create or replace function public.quickbooks_pending(p_org uuid, p_limit int default 40)
returns jsonb language sql stable security definer set search_path = public as $$
  with c as (select * from qbo_connections where org_id = p_org)
  select jsonb_build_object(
    'invoices', coalesce((select jsonb_agg(i.id) from (
      select i.id from invoices i
      join c on true
      left join qbo_links l on l.org_id = p_org and l.kind = 'invoice' and l.local_id = i.id
      where i.org_id = p_org and i.status <> 'draft' and i.issue_date >= c.sync_from
        and (l.local_id is null or (l.qbo_id is not null and i.updated_at > l.synced_at) or (l.qbo_id is null and l.attempts < 5))
        and not (i.status = 'void' and l.qbo_id is null)
      order by i.issue_date, i.created_at limit p_limit) i), '[]'),
    'payments', coalesce((select jsonb_agg(p.id) from (
      select p.id from payments p
      join qbo_links li on li.org_id = p_org and li.kind = 'invoice' and li.local_id = p.invoice_id and li.qbo_id is not null
      left join qbo_links l on l.org_id = p_org and l.kind = 'payment' and l.local_id = p.id
      where p.org_id = p_org and (l.local_id is null or (l.qbo_id is null and l.attempts < 5))
      order by p.received_at limit p_limit) p), '[]')
  );
$$;
revoke execute on function public.quickbooks_pending(uuid, int) from public, anon, authenticated;

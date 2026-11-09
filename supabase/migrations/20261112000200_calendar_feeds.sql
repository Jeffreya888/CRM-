-- Calendar sync: a private link per person that Google Calendar, Apple Calendar or Outlook subscribe to.
-- 'mine' = jobs assigned to that person; 'all' = every company job (owners, admins and managers only).
-- The calendar-feed function reads events with the link's token; a reset makes the old link stop working.
-- Events carry no prices and no access notes (gate codes), since calendars can be shared.

create table if not exists public.calendar_feeds (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  scope text not null check (scope in ('mine', 'all')),
  token text not null unique default encode(gen_random_bytes(24), 'hex'),
  created_at timestamptz not null default now(),
  last_fetched_at timestamptz,
  unique (org_id, user_id, scope)
);
alter table public.calendar_feeds enable row level security;
revoke all on public.calendar_feeds from anon, authenticated;

-- The caller's private link token for a company (made on first use). p_reset = true replaces it.
create or replace function public.calendar_feed_token(p_org uuid, p_scope text, p_reset boolean default false)
returns text language plpgsql security definer set search_path = public, extensions as $$
declare t text;
begin
  if auth.uid() is null or not public.is_member(p_org) then raise exception 'Not a member of this company'; end if;
  if p_scope not in ('mine', 'all') then raise exception 'Choose your jobs or all jobs'; end if;
  if p_scope = 'all' and not public.is_manager(p_org) then raise exception 'Only owners, admins and managers can add every company job'; end if;
  if p_reset then delete from calendar_feeds where org_id = p_org and user_id = auth.uid() and scope = p_scope; end if;
  insert into calendar_feeds (org_id, user_id, scope) values (p_org, auth.uid(), p_scope)
  on conflict (org_id, user_id, scope) do nothing;
  select token into t from calendar_feeds where org_id = p_org and user_id = auth.uid() and scope = p_scope;
  return t;
end;
$$;
revoke execute on function public.calendar_feed_token(uuid, text, boolean) from public, anon;
grant execute on function public.calendar_feed_token(uuid, text, boolean) to authenticated;

-- Events for a link (service role only, from the calendar-feed function). Empty when the link was reset,
-- the person left the company, or an 'all' link's owner is no longer a manager.
create or replace function public.calendar_feed_events(p_token text)
returns table (job_id uuid, number text, title text, status text, starts_at timestamptz, ends_at timestamptz,
  place text, asset text, customer text, company text, timezone text, updated_at timestamptz)
language plpgsql security definer set search_path = public as $$
declare f calendar_feeds; ok boolean;
begin
  select * into f from calendar_feeds where token = p_token;
  if f.id is null then return; end if;
  select exists (select 1 from memberships m where m.org_id = f.org_id and m.user_id = f.user_id and m.active
    and (f.scope = 'mine' or m.role in ('owner', 'admin', 'manager'))) into ok;
  if not ok then return; end if;
  update calendar_feeds set last_fetched_at = now() where id = f.id;
  return query
    select j.id, j.number, coalesce(nullif(trim(j.title), ''), 'Job'), j.status::text, j.scheduled_start,
      coalesce(j.scheduled_end, j.scheduled_start + interval '2 hours'),
      nullif(concat_ws(' · ', l.name, nullif(l.airport_code, ''), nullif(l.fbo_name, ''), nullif(l.address, '')), ''),
      a.tail_number, c.name, o.name, o.timezone, j.updated_at
    from jobs j
    join organizations o on o.id = j.org_id
    left join locations l on l.id = j.location_id
    left join aircraft a on a.id = j.aircraft_id
    left join customers c on c.id = j.customer_id
    where j.org_id = f.org_id and j.scheduled_start is not null and j.status <> 'cancelled'
      and j.scheduled_start >= now() - interval '30 days' and j.scheduled_start < now() + interval '180 days'
      and (f.scope = 'all' or exists (select 1 from job_assignments ja where ja.job_id = j.id and ja.user_id = f.user_id))
    order by j.scheduled_start
    limit 2000;
end;
$$;
revoke execute on function public.calendar_feed_events(text) from public, anon, authenticated;

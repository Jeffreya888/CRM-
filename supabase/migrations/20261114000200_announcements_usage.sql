-- Announcements to customers (in-app banner, optional email) and feature usage (owners only).

-- ---------------------------------------------------------------------------
-- Announcements
-- ---------------------------------------------------------------------------
create table if not exists public.platform_announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 120),
  body text not null default '' check (char_length(body) <= 1000),
  level text not null default 'info' check (level in ('info', 'warning')),
  audience text not null default 'all' check (audience in ('all', 'owners')),
  url text check (url is null or url ~ '^(https://|/)'),
  ends_at timestamptz,
  ended_at timestamptz,
  send_email boolean not null default false,
  emailed_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists platform_announcements_active on public.platform_announcements (created_at desc) where ended_at is null;
alter table public.platform_announcements enable row level security;
revoke all on public.platform_announcements from anon, authenticated;

-- Who has been emailed, so the worker sends each announcement once per person, in batches.
create table if not exists public.platform_announcement_emails (
  announcement_id uuid not null references public.platform_announcements(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  sent_at timestamptz not null default now(),
  primary key (announcement_id, user_id)
);
alter table public.platform_announcement_emails enable row level security;
revoke all on public.platform_announcement_emails from anon, authenticated;

create or replace function public.platform_post_announcement(
  p_title text, p_body text default '', p_level text default 'info', p_audience text default 'all',
  p_days int default 7, p_email boolean default false, p_url text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v uuid;
begin
  if not public.is_platform_owner() then raise exception 'Not allowed'; end if;
  if coalesce(trim(p_title), '') = '' then raise exception 'Add a title'; end if;
  if p_days is not null and (p_days < 1 or p_days > 90) then raise exception 'Show it for 1–90 days'; end if;
  insert into platform_announcements (title, body, level, audience, url, ends_at, send_email, created_by)
  values (trim(p_title), coalesce(trim(p_body), ''), p_level, p_audience, nullif(trim(coalesce(p_url, '')), ''),
    case when p_days is null then null else now() + make_interval(days => p_days) end, coalesce(p_email, false), auth.uid())
  returning id into v;
  perform public.platform_audit('announcement_posted', null,
    jsonb_build_object('title', trim(p_title), 'audience', p_audience, 'days', p_days, 'email', coalesce(p_email, false)));
  return v;
end;
$$;
revoke execute on function public.platform_post_announcement(text, text, text, text, int, boolean, text) from public, anon;
grant execute on function public.platform_post_announcement(text, text, text, text, int, boolean, text) to authenticated;

create or replace function public.platform_end_announcement(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_title text;
begin
  if not public.is_platform_owner() then raise exception 'Not allowed'; end if;
  update platform_announcements set ended_at = now() where id = p_id and ended_at is null returning title into v_title;
  if v_title is not null then perform public.platform_audit('announcement_ended', null, jsonb_build_object('title', v_title)); end if;
end;
$$;
revoke execute on function public.platform_end_announcement(uuid) from public, anon;
grant execute on function public.platform_end_announcement(uuid) to authenticated;

-- People who receive an announcement: active members of real companies (owners and admins only for 'owners').
create or replace function public._announcement_recipients(p_audience text)
returns table (user_id uuid) language sql stable security definer set search_path = public as $$
  select distinct m.user_id from memberships m join organizations o on o.id = m.org_id
  where m.active and not o.is_demo and (p_audience = 'all' or m.role in ('owner', 'admin'));
$$;
revoke execute on function public._announcement_recipients(text) from public, anon, authenticated;

create or replace function public.platform_announcements_list()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_platform_owner() then raise exception 'Not allowed'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'title', a.title, 'body', a.body, 'level', a.level, 'audience', a.audience,
      'url', a.url, 'ends_at', a.ends_at, 'ended_at', a.ended_at, 'send_email', a.send_email, 'emailed_at', a.emailed_at, 'created_at', a.created_at,
      'active', a.ended_at is null and (a.ends_at is null or a.ends_at > now()),
      'recipients', (select count(*) from public._announcement_recipients(a.audience)),
      'emails_sent', (select count(*) from platform_announcement_emails e where e.announcement_id = a.id)) order by a.created_at desc)
    from (select * from platform_announcements order by created_at desc limit 50) a), '[]');
end;
$$;
revoke execute on function public.platform_announcements_list() from public, anon;
grant execute on function public.platform_announcements_list() to authenticated;

-- What the signed-in person should see now.
create or replace function public.current_announcements()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', a.id, 'title', a.title, 'body', a.body, 'level', a.level, 'url', a.url, 'created_at', a.created_at)
    order by a.created_at desc), '[]')
  from platform_announcements a
  where auth.uid() is not null and a.ended_at is null and (a.ends_at is null or a.ends_at > now())
    and (a.audience = 'all' or exists (select 1 from memberships m where m.user_id = auth.uid() and m.active and m.role in ('owner', 'admin')));
$$;
revoke execute on function public.current_announcements() from public, anon;
grant execute on function public.current_announcements() to authenticated;

-- Worker: the next people to email (service role only).
create or replace function public.announcement_email_batch(p_limit int default 100)
returns table (announcement_id uuid, user_id uuid, email text, title text, body text, url text)
language sql stable security definer set search_path = public, auth as $$
  select a.id, r.user_id, u.email, a.title, a.body, a.url
  from platform_announcements a
  cross join lateral public._announcement_recipients(a.audience) r
  join auth.users u on u.id = r.user_id
  where a.send_email and a.emailed_at is null and a.ended_at is null and (a.ends_at is null or a.ends_at > now())
    and u.email is not null
    and not exists (select 1 from platform_announcement_emails e where e.announcement_id = a.id and e.user_id = r.user_id)
  order by a.created_at, r.user_id
  limit greatest(1, least(p_limit, 500));
$$;
revoke execute on function public.announcement_email_batch(int) from public, anon, authenticated;

-- Worker: marks announcements whose emails are all sent.
create or replace function public.announcement_emails_finish()
returns int language sql security definer set search_path = public as $$
  with done as (
    update platform_announcements a set emailed_at = now()
    where a.send_email and a.emailed_at is null
      and not exists (select 1 from public._announcement_recipients(a.audience) r join auth.users u on u.id = r.user_id
        where u.email is not null and not exists (select 1 from platform_announcement_emails e where e.announcement_id = a.id and e.user_id = r.user_id))
    returning 1)
  select count(*)::int from done;
$$;
revoke execute on function public.announcement_emails_finish() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Feature usage: how many companies used each feature in the last N days
-- ---------------------------------------------------------------------------
create or replace function public.platform_feature_usage(p_days int default 30)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_days int := greatest(1, least(coalesce(p_days, 30), 365));
  since timestamptz := now() - make_interval(days => greatest(1, least(coalesce(p_days, 30), 365)));
  v jsonb;
begin
  if not public.is_platform_owner() then raise exception 'Not allowed'; end if;
  with _fu_orgs as (select id from organizations where not is_demo and plan <> 'expired')
  select jsonb_build_object('days', v_days, 'companies', (select count(*) from _fu_orgs), 'features', jsonb_build_array(
    jsonb_build_object('key', 'jobs', 'label', 'Scheduled jobs', 'companies',
      (select count(distinct j.org_id) from jobs j join _fu_orgs o on o.id = j.org_id where j.created_at >= since)),
    jsonb_build_object('key', 'quotes', 'label', 'Sent quotes', 'companies',
      (select count(distinct q.org_id) from quotes q join _fu_orgs o on o.id = q.org_id where q.status <> 'draft' and q.created_at >= since)),
    jsonb_build_object('key', 'invoices', 'label', 'Sent invoices', 'companies',
      (select count(distinct i.org_id) from invoices i join _fu_orgs o on o.id = i.org_id where i.status <> 'draft' and i.created_at >= since)),
    jsonb_build_object('key', 'card_payments', 'label', 'Took card payments', 'companies',
      (select count(distinct p.org_id) from payments p join _fu_orgs o on o.id = p.org_id where p.method = 'card' and p.received_at >= since)),
    jsonb_build_object('key', 'photos', 'label', 'Job photos', 'companies',
      (select count(distinct p.org_id) from job_photos p join _fu_orgs o on o.id = p.org_id where p.created_at >= since)),
    jsonb_build_object('key', 'checklists', 'label', 'SOP checklists', 'companies',
      (select count(distinct c.org_id) from job_checklist_items c join _fu_orgs o on o.id = c.org_id where c.done and c.done_at >= since)),
    jsonb_build_object('key', 'time_clock', 'label', 'Time clock', 'companies',
      (select count(distinct t.org_id) from time_entries t join _fu_orgs o on o.id = t.org_id where t.started_at >= since)),
    jsonb_build_object('key', 'ask_tarmo', 'label', 'Ask Tarmo', 'companies',
      (select count(distinct m.org_id) from assistant_messages m join _fu_orgs o on o.id = m.org_id where m.role = 'user' and m.created_at >= since)),
    jsonb_build_object('key', 'photo_checks', 'label', 'Photo condition checks', 'companies',
      (select count(distinct c.org_id) from condition_assessments c join _fu_orgs o on o.id = c.org_id where c.created_at >= since)),
    jsonb_build_object('key', 'texting', 'label', 'Customer texting', 'companies',
      (select count(distinct m.org_id) from messages m join _fu_orgs o on o.id = m.org_id where m.channel = 'sms' and m.direction = 'out' and m.created_at >= since)),
    jsonb_build_object('key', 'portal', 'label', 'Customer portal', 'companies',
      (select count(distinct s.org_id) from portal_sessions s join _fu_orgs o on o.id = s.org_id where coalesce(s.last_used_at, s.created_at) >= since)),
    jsonb_build_object('key', 'booking', 'label', 'Online booking requests', 'companies',
      (select count(distinct b.org_id) from booking_requests b join _fu_orgs o on o.id = b.org_id where b.created_at >= since)),
    jsonb_build_object('key', 'inventory', 'label', 'Inventory', 'companies',
      (select count(distinct m.org_id) from inventory_movements m join _fu_orgs o on o.id = m.org_id where m.created_at >= since)),
    jsonb_build_object('key', 'recurring', 'label', 'Recurring jobs (set up)', 'companies',
      (select count(distinct r.org_id) from recurring_schedules r join _fu_orgs o on o.id = r.org_id)),
    jsonb_build_object('key', 'spanish', 'label', 'Spanish (someone uses it)', 'companies',
      (select count(distinct m.org_id) from memberships m join profiles p on p.id = m.user_id join _fu_orgs o on o.id = m.org_id where m.active and p.language = 'es')),
    jsonb_build_object('key', 'calendar', 'label', 'Calendar sync', 'companies',
      (select count(distinct f.org_id) from calendar_feeds f join _fu_orgs o on o.id = f.org_id where f.last_fetched_at >= since)),
    jsonb_build_object('key', 'quickbooks', 'label', 'QuickBooks (connected)', 'companies',
      (select count(distinct q.org_id) from qbo_connections q join _fu_orgs o on o.id = q.org_id)),
    jsonb_build_object('key', 'franchise', 'label', 'Franchise network (member)', 'companies',
      (select count(distinct f.org_id) from franchise_members f join _fu_orgs o on o.id = f.org_id))
  )) into v;
  return v;
end;
$$;
revoke execute on function public.platform_feature_usage(int) from public, anon;
grant execute on function public.platform_feature_usage(int) to authenticated;

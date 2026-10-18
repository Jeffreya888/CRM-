-- Daily email allowance per company (anti-abuse): stops a throwaway trial
-- account from using the platform's sending domain for spam. Counted per
-- recipient over a rolling 24 hours; generous for real businesses.
create table public.email_quota_log (
  id bigint generated always as identity primary key,
  org_id uuid not null references public.organizations(id) on delete cascade,
  recipients int not null check (recipients > 0),
  sent_at timestamptz not null default now()
);
create index on public.email_quota_log (org_id, sent_at desc);
alter table public.email_quota_log enable row level security;  -- service role only

create or replace function public.email_daily_limit(p_org uuid)
returns int language sql stable security definer set search_path = public as $$
  select case
    when (select is_demo from organizations where id = p_org) then 0
    else case public.effective_plan(p_org)
      when 'trial' then 150
      when 'solo' then 500
      when 'team' then 1500
      when 'fleet' then 5000
      else 50 end
  end;
$$;

-- Atomically reserves room for p_count recipients; false when over the limit.
-- The first refusal in a day alerts the owner.
create or replace function public.claim_email_quota(p_org uuid, p_count int default 1)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  v_used int;
  v_limit int := public.email_daily_limit(p_org);
begin
  perform pg_advisory_xact_lock(hashtext('email_quota:' || p_org));
  select coalesce(sum(recipients), 0) into v_used from email_quota_log
    where org_id = p_org and sent_at > now() - interval '24 hours';
  if v_used + greatest(p_count, 1) > v_limit then
    if not exists (select 1 from notification_outbox where org_id = p_org and kind = 'email_limit' and created_at > now() - interval '24 hours') then
      perform public.notify(p_org, 'owners', 'email_limit', 'Daily email limit reached',
        'Some emails were paused for 24 hours. Contact support if your business needs a higher limit.', '/messages');
    end if;
    return false;
  end if;
  insert into email_quota_log (org_id, recipients) values (p_org, greatest(p_count, 1));
  return true;
end;
$$;
revoke execute on function public.claim_email_quota(uuid, int) from public, anon, authenticated;
revoke execute on function public.email_daily_limit(uuid) from public, anon;

-- Old log rows are not needed after a day.
create or replace function public.prune_email_quota_log()
returns void language sql security definer set search_path = public as $$
  delete from email_quota_log where sent_at < now() - interval '2 days';
$$;
revoke execute on function public.prune_email_quota_log() from public, anon, authenticated;

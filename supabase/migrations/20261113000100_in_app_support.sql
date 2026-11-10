-- In-app support: "Message us" sends to Platform admin → Support with the company, plan, screen and
-- device filled in, so support doesn't need follow-up questions. Platform admins get an email (worker).

alter table public.support_messages
  add column if not exists org_id uuid references public.organizations(id) on delete set null,
  add column if not exists user_id uuid references auth.users(id) on delete set null,
  add column if not exists plan text,
  add column if not exists route text,
  add column if not exists platform text,
  add column if not exists app_version text,
  add column if not exists source text not null default 'website' check (source in ('website', 'app')),
  add column if not exists notified_at timestamptz;

-- Website messages that were already there don't need an alert.
update public.support_messages set notified_at = coalesce(notified_at, created_at) where notified_at is null;

create or replace function public.send_support_message(p_org uuid, p_topic text, p_message text,
  p_route text default null, p_platform text default null, p_version text default null)
returns void language plpgsql security definer set search_path = public, auth as $$
declare v_email text; v_name text; v_company text; v_plan text;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  if p_org is not null and not public.is_member(p_org) then raise exception 'Not a member of this company'; end if;
  if length(trim(coalesce(p_message, ''))) < 3 then raise exception 'Write a short message'; end if;
  if (select count(*) from support_messages where user_id = auth.uid() and created_at > now() - interval '1 hour') >= 10 then
    raise exception 'You have sent several messages in the last hour. We will reply soon.';
  end if;
  select email into v_email from auth.users where id = auth.uid();
  select coalesce(nullif(trim(full_name), ''), split_part(v_email, '@', 1)) into v_name from profiles where id = auth.uid();
  if p_org is not null then
    select name, public.effective_plan(id)::text into v_company, v_plan from organizations where id = p_org;
  end if;
  insert into support_messages (name, email, company, topic, message, org_id, user_id, plan, route, platform, app_version, source)
  values (coalesce(v_name, 'Tarmo user'), coalesce(v_email, 'unknown'), v_company, left(nullif(trim(p_topic), ''), 60), left(trim(p_message), 5000),
          p_org, auth.uid(), v_plan, left(p_route, 200), left(p_platform, 40), left(p_version, 40), 'app');
end;
$$;
revoke execute on function public.send_support_message(uuid, text, text, text, text, text) from public, anon;
grant execute on function public.send_support_message(uuid, text, text, text, text, text) to authenticated;

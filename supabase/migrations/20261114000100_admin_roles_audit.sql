-- Platform admin team roles and an activity log.
--  owner:   everything (revenue metrics, investor update, billing, limits, franchise, announcements, the team).
--  support: companies, needs attention, support messages, errors, extending trials. No revenue or billing changes.
-- Every admin action is written to platform_audit_log (who, what, which company, when).

alter table public.platform_admins
  add column if not exists role text not null default 'owner' check (role in ('owner', 'support')),
  add column if not exists added_at timestamptz not null default now(),
  add column if not exists added_by uuid references auth.users(id) on delete set null;

create or replace function public.is_platform_owner()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from platform_admins where user_id = auth.uid() and role = 'owner');
$$;
grant execute on function public.is_platform_owner() to authenticated;

-- ---------------------------------------------------------------------------
-- Activity log
-- ---------------------------------------------------------------------------
create table if not exists public.platform_audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid references auth.users(id) on delete set null,
  actor_email text,
  action text not null,
  org_id uuid references public.organizations(id) on delete set null,
  details jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index if not exists platform_audit_log_created on public.platform_audit_log (created_at desc);
alter table public.platform_audit_log enable row level security;
revoke all on public.platform_audit_log from anon, authenticated;

-- Records an admin action. p_actor is given by server functions (service role); otherwise the caller.
create or replace function public.platform_audit(p_action text, p_org uuid default null, p_details jsonb default '{}', p_actor uuid default null)
returns void language plpgsql security definer set search_path = public, auth as $$
declare v_actor uuid := coalesce(p_actor, auth.uid());
begin
  if p_actor is not null and auth.uid() is not null then v_actor := auth.uid(); end if; -- people can't log as someone else
  insert into platform_audit_log (actor_id, actor_email, action, org_id, details)
  values (v_actor, (select email from auth.users where id = v_actor), left(p_action, 80), p_org, coalesce(p_details, '{}'));
end;
$$;
revoke execute on function public.platform_audit(text, uuid, jsonb, uuid) from public, anon, authenticated;

create or replace function public.platform_activity(p_limit int default 200)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_platform_owner() then raise exception 'Not allowed'; end if;
  return coalesce((select jsonb_agg(x) from (
    select jsonb_build_object('id', l.id, 'actor', coalesce(l.actor_email, 'system'), 'action', l.action, 'org_id', l.org_id,
      'company', (select name from organizations where id = l.org_id), 'details', l.details, 'at', l.created_at) x
    from platform_audit_log l order by l.created_at desc limit greatest(1, least(p_limit, 1000))) t), '[]');
end;
$$;
revoke execute on function public.platform_activity(int) from public, anon;
grant execute on function public.platform_activity(int) to authenticated;

-- ---------------------------------------------------------------------------
-- Owner-only views of revenue and growth (support staff don't see them)
-- ---------------------------------------------------------------------------
create or replace function public.platform_metrics()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_platform_owner() then raise exception 'Not allowed'; end if;
  return public.platform_metrics_data();
end;
$$;

alter function public.platform_history(int) rename to _platform_history_impl;
revoke execute on function public._platform_history_impl(int) from public, anon, authenticated;
create or replace function public.platform_history(p_days int default 90)
returns table (day date, companies int, paid_companies int, trials int, new_companies int, churned int, mrr numeric, mrr_net numeric)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_platform_owner() then raise exception 'Not allowed'; end if;
  return query select * from public._platform_history_impl(p_days);
end;
$$;
revoke execute on function public.platform_history(int) from public, anon;
grant execute on function public.platform_history(int) to authenticated;

alter function public.platform_funnel(int) rename to _platform_funnel_impl;
revoke execute on function public._platform_funnel_impl(int) from public, anon, authenticated;
create or replace function public.platform_funnel(p_days int default 90)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_platform_owner() then raise exception 'Not allowed'; end if;
  return public._platform_funnel_impl(p_days);
end;
$$;
revoke execute on function public.platform_funnel(int) from public, anon;
grant execute on function public.platform_funnel(int) to authenticated;

-- ---------------------------------------------------------------------------
-- Support actions, now logged: extending trials (support may), free time on a plan (owners only)
-- ---------------------------------------------------------------------------
alter function public.platform_extend_trial(uuid, int) rename to _platform_extend_trial_impl;
revoke execute on function public._platform_extend_trial_impl(uuid, int) from public, anon, authenticated;
create or replace function public.platform_extend_trial(p_org uuid, p_days int)
returns timestamptz language plpgsql security definer set search_path = public as $$
declare v timestamptz;
begin
  v := public._platform_extend_trial_impl(p_org, p_days);
  perform public.platform_audit('trial_extended', p_org, jsonb_build_object('days', p_days, 'trial_ends_at', v));
  return v;
end;
$$;
revoke execute on function public.platform_extend_trial(uuid, int) from public, anon;
grant execute on function public.platform_extend_trial(uuid, int) to authenticated;

alter function public.platform_comp_plan(uuid, public.plan_tier, int) rename to _platform_comp_plan_impl;
revoke execute on function public._platform_comp_plan_impl(uuid, public.plan_tier, int) from public, anon, authenticated;
create or replace function public.platform_comp_plan(p_org uuid, p_plan public.plan_tier, p_days int)
returns timestamptz language plpgsql security definer set search_path = public as $$
declare v timestamptz;
begin
  if not public.is_platform_owner() then raise exception 'Not allowed'; end if;
  v := public._platform_comp_plan_impl(p_org, p_plan, p_days);
  perform public.platform_audit('plan_comped', p_org, jsonb_build_object('plan', p_plan, 'days', p_days, 'until', v));
  return v;
end;
$$;
revoke execute on function public.platform_comp_plan(uuid, public.plan_tier, int) from public, anon;
grant execute on function public.platform_comp_plan(uuid, public.plan_tier, int) to authenticated;

alter function public.platform_resolve_error(uuid, boolean) rename to _platform_resolve_error_impl;
revoke execute on function public._platform_resolve_error_impl(uuid, boolean) from public, anon, authenticated;
create or replace function public.platform_resolve_error(p_id uuid, p_resolved boolean default true)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public._platform_resolve_error_impl(p_id, p_resolved);
  perform public.platform_audit(case when p_resolved then 'error_marked_fixed' else 'error_reopened' end, null,
    jsonb_build_object('error', (select left(message, 200) from app_errors where id = p_id)));
end;
$$;
revoke execute on function public.platform_resolve_error(uuid, boolean) from public, anon;
grant execute on function public.platform_resolve_error(uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- The admin team (owners manage it)
-- ---------------------------------------------------------------------------
create or replace function public.platform_my_role()
returns text language sql stable security definer set search_path = public as $$
  select role from platform_admins where user_id = auth.uid();
$$;
grant execute on function public.platform_my_role() to authenticated;

create or replace function public.platform_team()
returns jsonb language plpgsql stable security definer set search_path = public, auth as $$
begin
  if not public.is_platform_owner() then raise exception 'Not allowed'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('user_id', a.user_id, 'email', u.email, 'role', a.role, 'added_at', a.added_at,
      'last_sign_in', u.last_sign_in_at, 'me', a.user_id = auth.uid()) order by a.role, u.email)
    from platform_admins a join auth.users u on u.id = a.user_id), '[]');
end;
$$;
revoke execute on function public.platform_team() from public, anon;
grant execute on function public.platform_team() to authenticated;

create or replace function public.platform_set_admin(p_email text, p_role text)
returns void language plpgsql security definer set search_path = public, auth as $$
declare v_user uuid;
begin
  if not public.is_platform_owner() then raise exception 'Not allowed'; end if;
  if p_role not in ('owner', 'support') then raise exception 'Choose owner or support'; end if;
  select id into v_user from auth.users where lower(email) = lower(trim(p_email));
  if v_user is null then raise exception 'No Tarmo account uses that email. Ask them to sign up first.'; end if;
  if v_user = auth.uid() and p_role <> 'owner' then raise exception 'You can''t remove your own owner access'; end if;
  insert into platform_admins (user_id, role, added_by) values (v_user, p_role, auth.uid())
  on conflict (user_id) do update set role = excluded.role;
  perform public.platform_audit('admin_team_set', null, jsonb_build_object('email', lower(trim(p_email)), 'role', p_role));
end;
$$;
revoke execute on function public.platform_set_admin(text, text) from public, anon;
grant execute on function public.platform_set_admin(text, text) to authenticated;

create or replace function public.platform_remove_admin(p_user uuid)
returns void language plpgsql security definer set search_path = public, auth as $$
begin
  if not public.is_platform_owner() then raise exception 'Not allowed'; end if;
  if p_user = auth.uid() then raise exception 'You can''t remove yourself'; end if;
  perform public.platform_audit('admin_team_removed', null, jsonb_build_object('email', (select email from auth.users where id = p_user)));
  delete from platform_admins where user_id = p_user;
end;
$$;
revoke execute on function public.platform_remove_admin(uuid) from public, anon;
grant execute on function public.platform_remove_admin(uuid) to authenticated;

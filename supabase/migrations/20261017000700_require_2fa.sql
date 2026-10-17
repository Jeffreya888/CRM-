-- Enforce "Require two-step sign-in for the whole team" in the database:
-- members of such a company only reach its data with an aal2 session. They
-- can still read their own membership and the company row, so the app can
-- show the "set up two-step sign-in" screen.

create or replace function public.session_aal_ok(p_org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select not coalesce((select require_2fa from organizations where id = p_org), false)
      or coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2';
$$;

create or replace function public.is_member(p_org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from memberships
    where org_id = p_org and user_id = auth.uid() and active
  ) and public.session_aal_ok(p_org);
$$;

create or replace function public.has_role(p_org uuid, p_roles public.member_role[])
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from memberships
    where org_id = p_org and user_id = auth.uid() and active and role = any(p_roles)
  ) and public.session_aal_ok(p_org);
$$;

create or replace function public.has_perm(p_org uuid, p_perm text)
returns boolean language sql stable security definer set search_path = public as $$
  select public.session_aal_ok(p_org) and coalesce((
    select case
      when m.role in ('owner','admin') then true
      when m.role = 'viewer' then false
      else coalesce((o.role_permissions -> m.role::text ->> p_perm)::boolean, false)
    end
    from memberships m join organizations o on o.id = m.org_id
    where m.org_id = p_org and m.user_id = auth.uid() and m.active
  ), false);
$$;

-- Own membership and company stay readable at aal1.
create or replace function public.is_member_any_aal(p_org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from memberships where org_id = p_org and user_id = auth.uid() and active);
$$;

drop policy org_select on public.organizations;
create policy org_select on public.organizations for select using (public.is_member_any_aal(id));
drop policy memberships_select on public.memberships;
create policy memberships_select on public.memberships for select using (user_id = auth.uid() or public.is_member(org_id));

-- Turning the requirement on needs the owner/admin's own session at aal2,
-- so nobody locks themselves out.
create or replace function public.trg_require_2fa()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.require_2fa and not old.require_2fa and auth.uid() is not null
     and coalesce(auth.jwt() ->> 'aal', 'aal1') <> 'aal2' then
    raise exception 'Set up two-step sign-in on your own account first';
  end if;
  return new;
end;
$$;
create trigger org_require_2fa before update of require_2fa on public.organizations
  for each row execute function public.trg_require_2fa();

-- Early access list: the public website collects interest before launch.
-- Anyone can join (join_early_access); only the Tarmo team can read the list.
create table public.early_access (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null unique,
  company text,
  business_types text[] not null default '{}',
  crew_size text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  invited_at timestamptz
);
alter table public.early_access enable row level security;
create policy early_access_admin on public.early_access for all using (public.is_platform_admin()) with check (public.is_platform_admin());

-- Joining twice with the same email updates the entry. Returns true when the email was already on the list.
create or replace function public.join_early_access(p_name text, p_email text, p_company text, p_business_types text[], p_crew_size text)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_email text := lower(trim(p_email)); v_existed boolean;
begin
  if coalesce(length(trim(p_name)), 0) < 2 or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Please enter your name and a valid email.';
  end if;
  if length(p_name) > 200 or length(v_email) > 254 or length(p_company) > 200 or length(p_crew_size) > 20
     or cardinality(p_business_types) > 3
     or exists (select 1 from unnest(p_business_types) t where t not in ('aircraft', 'watercraft', 'vehicle')) then
    raise exception 'Please check the form and try again.';
  end if;
  -- Light abuse protection, like the contact form.
  if (select count(*) from early_access where updated_at > now() - interval '1 hour') >= 300 then
    raise exception 'Too many sign-ups right now. Please try again later.';
  end if;
  v_existed := exists (select 1 from early_access where email = v_email);
  insert into early_access (name, email, company, business_types, crew_size)
  values (trim(p_name), v_email, nullif(trim(p_company), ''), coalesce(p_business_types, '{}'), nullif(trim(p_crew_size), ''))
  on conflict (email) do update set name = excluded.name, company = coalesce(excluded.company, early_access.company),
    business_types = excluded.business_types, crew_size = coalesce(excluded.crew_size, early_access.crew_size), updated_at = now();
  return v_existed;
end;
$$;
revoke execute on function public.join_early_access(text, text, text, text[], text) from public;
grant execute on function public.join_early_access(text, text, text, text[], text) to anon, authenticated;

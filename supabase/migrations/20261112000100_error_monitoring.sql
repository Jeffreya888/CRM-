-- Error monitoring: crashes in the app and failures in server functions, grouped by a fingerprint
-- so the same problem shows once with a count. Platform admins see them in Platform admin → Errors
-- and get an email when something new breaks or an error spikes (automation worker).

create table if not exists public.app_errors (
  id uuid primary key default gen_random_uuid(),
  fingerprint text not null unique,
  kind text not null check (kind in ('app', 'server')),
  source text not null,              -- 'app' or the server function's name
  message text not null,
  stack text,
  route text,
  platform text,
  app_version text,
  count int not null default 1,
  org_ids uuid[] not null default '{}',   -- companies affected (up to 50)
  last_org_id uuid,
  last_user_id uuid,
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  alerted_at timestamptz,
  alerted_count int not null default 0,
  resolved_at timestamptz
);
create index if not exists app_errors_last_seen on public.app_errors (last_seen desc);
alter table public.app_errors enable row level security;
revoke all on public.app_errors from anon, authenticated;

-- Same problem = same place + same message once ids, numbers and quoted values are taken out.
create or replace function public._error_fingerprint(p_kind text, p_source text, p_message text, p_stack text)
returns text language sql immutable as $$
  select md5(p_kind || '|' || p_source || '|' ||
    regexp_replace(regexp_replace(regexp_replace(lower(coalesce(p_message, '')),
      '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}', '<id>', 'g'),
      '"[^"]*"|''[^'']*''', '<v>', 'g'), '[0-9]+', '<n>', 'g') || '|' ||
    coalesce(regexp_replace(split_part(coalesce(p_stack, ''), E'\n', 2), '[0-9]+', '<n>', 'g'), ''));
$$;

create or replace function public._log_error(p_kind text, p_source text, p_message text, p_stack text, p_route text,
  p_platform text, p_version text, p_org uuid, p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
declare fp text := public._error_fingerprint(p_kind, p_source, p_message, p_stack);
begin
  if coalesce(trim(p_message), '') = '' then return; end if;
  -- Flood guard: at most 300 new kinds of error an hour; repeats of known ones are only counted.
  if not exists (select 1 from app_errors where fingerprint = fp)
     and (select count(*) from app_errors where first_seen > now() - interval '1 hour') >= 300 then
    return;
  end if;
  insert into app_errors (fingerprint, kind, source, message, stack, route, platform, app_version, org_ids, last_org_id, last_user_id)
  values (fp, p_kind, left(p_source, 80), left(p_message, 1000), left(p_stack, 4000), left(p_route, 200), left(p_platform, 40),
          left(p_version, 40), case when p_org is null then '{}' else array[p_org] end, p_org, p_user)
  on conflict (fingerprint) do update set
    count = app_errors.count + 1,
    last_seen = now(),
    message = excluded.message,
    stack = coalesce(excluded.stack, app_errors.stack),
    route = coalesce(excluded.route, app_errors.route),
    platform = coalesce(excluded.platform, app_errors.platform),
    app_version = coalesce(excluded.app_version, app_errors.app_version),
    last_org_id = coalesce(excluded.last_org_id, app_errors.last_org_id),
    last_user_id = coalesce(excluded.last_user_id, app_errors.last_user_id),
    org_ids = case when excluded.last_org_id is null or excluded.last_org_id = any(app_errors.org_ids) or cardinality(app_errors.org_ids) >= 50
                   then app_errors.org_ids else app_errors.org_ids || excluded.last_org_id end,
    resolved_at = null;   -- it came back: show it again
end;
$$;
revoke execute on function public._log_error(text, text, text, text, text, text, text, uuid, uuid) from public, anon, authenticated;

-- From the app (signed in or not). The company is recorded only if the caller belongs to it.
create or replace function public.log_client_error(p_message text, p_stack text default null, p_route text default null,
  p_platform text default null, p_version text default null, p_org uuid default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public._log_error('app', 'app', p_message, p_stack, p_route, p_platform, p_version,
    case when p_org is not null and auth.uid() is not null and public.is_member(p_org) then p_org end, auth.uid());
end;
$$;
grant execute on function public.log_client_error(text, text, text, text, text, uuid) to anon, authenticated;

-- From server functions (service role).
create or replace function public.log_server_error(p_source text, p_message text, p_stack text default null, p_org uuid default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public._log_error('server', p_source, p_message, p_stack, null, 'server', null, p_org, null);
end;
$$;
revoke execute on function public.log_server_error(text, text, text, uuid) from public, anon, authenticated;

-- Platform admin → Errors.
create or replace function public.platform_errors(p_include_resolved boolean default false)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_platform_admin() then raise exception 'Not allowed'; end if;
  return coalesce((select jsonb_agg(x order by (x->>'last_seen')::timestamptz desc) from (
    select jsonb_build_object('id', e.id, 'kind', e.kind, 'source', e.source, 'message', e.message, 'stack', e.stack, 'route', e.route,
      'platform', e.platform, 'app_version', e.app_version, 'count', e.count, 'companies', cardinality(e.org_ids),
      'last_company', (select name from organizations where id = e.last_org_id),
      'first_seen', e.first_seen, 'last_seen', e.last_seen, 'resolved_at', e.resolved_at) x
    from app_errors e where p_include_resolved or e.resolved_at is null
    order by e.last_seen desc limit 200) t), '[]');
end;
$$;
revoke execute on function public.platform_errors(boolean) from public, anon;
grant execute on function public.platform_errors(boolean) to authenticated;

create or replace function public.platform_resolve_error(p_id uuid, p_resolved boolean default true)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_platform_admin() then raise exception 'Not allowed'; end if;
  update app_errors set resolved_at = case when p_resolved then now() end where id = p_id;
end;
$$;
revoke execute on function public.platform_resolve_error(uuid, boolean) from public, anon;
grant execute on function public.platform_resolve_error(uuid, boolean) to authenticated;

-- For the alert email (service only): platform admins' addresses.
create or replace function public.platform_admin_emails()
returns setof text language sql stable security definer set search_path = public, auth as $$
  select u.email from platform_admins a join auth.users u on u.id = a.user_id where u.email is not null;
$$;
revoke execute on function public.platform_admin_emails() from public, anon, authenticated;

-- Old, fixed errors are removed after 90 days (automation worker).
create or replace function public.prune_app_errors()
returns int language sql security definer set search_path = public as $$
  with d as (delete from app_errors where last_seen < now() - interval '90 days' returning 1) select count(*)::int from d;
$$;
revoke execute on function public.prune_app_errors() from public, anon, authenticated;

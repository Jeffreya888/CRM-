-- =============================================================================
-- Security review fixes (tenant isolation, role permissions, public endpoints).
-- Each block says what it closes. Never edit older migrations; add new ones.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Views run with the owner's rights (they bypass RLS). service_menu is a
--    simple view, so Postgres made it auto-updatable: anyone (even anon) could
--    INSERT services into any company, and technicians could edit or delete
--    services through it. Views are read-only, and never for anon.
-- ---------------------------------------------------------------------------
revoke insert, update, delete, truncate, references, trigger on public.service_menu, public.stock_by_location, public.equipment_maintenance_due
  from public, anon, authenticated;
revoke select on public.service_menu, public.stock_by_location, public.equipment_maintenance_due from public, anon;
grant select on public.service_menu, public.stock_by_location, public.equipment_maintenance_due to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Functions: Postgres grants EXECUTE to PUBLIC by default. Anonymous
--    visitors only need the public-document RPCs and the helpers that RLS
--    policies call; everything else is for signed-in users (or the service role).
-- ---------------------------------------------------------------------------
do $$
declare
  f record;
  keep text[] := array[
    -- public pages / forms
    'get_public_document','accept_public_quote','decline_public_quote','request_quote_dates','submit_support_message',
    -- helpers referenced by RLS policies (evaluated as the caller)
    'is_member','is_member_any_aal','has_role','has_perm','is_manager','is_admin','is_owner','can_money','is_platform_admin','session_aal_ok'];
begin
  for f in
    select p.oid::regprocedure as sig, p.proname
    from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and p.prokind = 'f'
      and p.prorettype <> 'trigger'::regtype
      and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
      and has_function_privilege('anon', p.oid, 'execute')
  loop
    continue when f.proname = any(keep);
    execute format('revoke execute on function %s from public, anon', f.sig);
    execute format('grant execute on function %s to authenticated, service_role', f.sig);
  end loop;
end $$;

-- Company-specific guides, texting usage and pay settings are for members only
-- (the worker calls these without a user).
create or replace function public.guide_for(p_org uuid, p_key text)
returns public.service_guides language sql stable security definer set search_path = public as $$
  select g.* from service_guides g
  where g.key = p_key
    and (auth.uid() is null or public.is_member(p_org))
    and (g.org_id = p_org or (g.org_id is null and not exists (select 1 from hidden_guides h where h.org_id = p_org and h.guide_id = g.id)))
    and not g.hidden
  order by (g.org_id is null)  -- company copy first
  limit 1;
$$;

create or replace function public.sms_allowance(p_org uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select case when auth.uid() is not null and not public.is_member(p_org) then null else jsonb_build_object(
    'included', case public.effective_plan(p_org) when 'solo' then 250 when 'team' then 1000 when 'fleet' then 3000 when 'trial' then 100 else 0 end,
    'extra', (select sms_extra_credits from organizations where id = p_org),
    'used', (select count(*) from messages where org_id = p_org and channel = 'sms' and direction = 'out'
             and status not in ('queued','failed','blocked') and sent_at >= date_trunc('month', now()))) end;
$$;

create or replace function public.pay_period_for(p_org uuid, p_date date)
returns table(starts_on date, ends_on date) language plpgsql stable security definer set search_path = public as $$
declare
  o organizations;
  v_len int;
  v_start date;
begin
  if auth.uid() is not null and not public.is_member(p_org) then raise exception 'Not a member'; end if;
  select * into o from organizations where id = p_org;
  if o.pay_period_cadence = 'semimonthly' then
    if extract(day from p_date) <= 15 then
      starts_on := date_trunc('month', p_date)::date; ends_on := starts_on + 14;
    else
      starts_on := date_trunc('month', p_date)::date + 15; ends_on := (date_trunc('month', p_date) + interval '1 month' - interval '1 day')::date;
    end if;
  else
    v_len := case o.pay_period_cadence when 'weekly' then 7 else 14 end;
    v_start := o.pay_period_anchor + (floor((p_date - o.pay_period_anchor)::numeric / v_len)::int * v_len);
    starts_on := v_start; ends_on := v_start + v_len - 1;
  end if;
  return next;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Memberships: admins could UPDATE any column directly (role → admin
--    without the owner, active → past the seat limit, user_id → hand a seat to
--    any account). Role/active changes go through update_member(); only the
--    profile-like columns stay directly editable.
-- ---------------------------------------------------------------------------
-- Definer functions run as the table owner; direct API writes run as authenticated.
create or replace function public.trg_membership_protected()
returns trigger language plpgsql set search_path = public as $$
begin
  -- Invoker rights: current_user is the API role for direct writes, the
  -- function owner when the update comes from a SECURITY DEFINER function.
  if current_user in ('authenticated','anon') and (
       new.org_id is distinct from old.org_id or new.user_id is distinct from old.user_id
    or new.role is distinct from old.role or new.active is distinct from old.active
    or new.deactivated_at is distinct from old.deactivated_at or new.created_at is distinct from old.created_at) then
    raise exception 'PERMISSION: change roles and access from the Team screen';
  end if;
  return new;
end;
$$;
drop trigger if exists memberships_protected on public.memberships;
create trigger memberships_protected before update on public.memberships
  for each row execute function public.trg_membership_protected();

-- Admins manage technicians, managers and viewers; only the owner changes admins.
create or replace function public.update_member(p_org uuid, p_user uuid, p_role public.member_role default null, p_active boolean default null, p_reassign_to uuid default null)
returns void language plpgsql security definer set search_path = public as $$
declare m memberships;
begin
  if not public.is_admin(p_org) then raise exception 'Only owners and admins can manage the team'; end if;
  select * into m from memberships where org_id = p_org and user_id = p_user;
  if not found then raise exception 'Member not found'; end if;
  if m.role = 'owner' then raise exception 'The owner cannot be changed here. Use transfer ownership.'; end if;
  if m.role = 'admin' and p_user <> auth.uid() and not public.is_owner(p_org) then raise exception 'Only the owner can change admins'; end if;
  if p_role = 'owner' then raise exception 'Use transfer ownership to make someone the owner'; end if;
  if p_role = 'admin' and not public.is_owner(p_org) then raise exception 'Only the owner can make admins'; end if;
  if p_active is true and not m.active then
    if (select count(*) from memberships where org_id = p_org and active) >= public.plan_seat_limit(public.effective_plan(p_org)) then
      raise exception 'SEAT_LIMIT: all seats are in use. Upgrade your plan to reactivate this person.';
    end if;
  end if;
  -- Leaving the field crew (deactivated, or no longer a technician) hands off their work.
  if (p_active is false and m.active) or (p_role is not null and p_role in ('viewer') and m.role <> 'viewer') then
    perform public.reassign_member_work(p_org, p_user, p_reassign_to);
  end if;
  update memberships set
    role = coalesce(p_role, role),
    active = coalesce(p_active, active),
    deactivated_at = case when p_active is false then now() when p_active is true then null else deactivated_at end
  where org_id = p_org and user_id = p_user;
  insert into audit_log (org_id, actor, action, entity, entity_id, summary)
    values (p_org, auth.uid(), 'updated', 'memberships', m.id,
            coalesce(m.display_name, 'Member') || coalesce(' → ' || p_role::text, '') || case when p_active is false then ' (deactivated)' when p_active is true then ' (reactivated)' else '' end);
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Invitations: the admin policy allowed direct INSERT/UPDATE, so an admin
--    could write an invitation with role 'owner' (or bypass seats, demo and
--    email checks) and become a second owner. Invitations are created and
--    revoked only through invite_member()/revoke_invitation().
-- ---------------------------------------------------------------------------
alter table public.invitations add constraint invitations_not_owner check (role <> 'owner') not valid;
drop policy if exists invitations_admin on public.invitations;
create policy invitations_admin_select on public.invitations for select using (public.is_admin(org_id));

-- ---------------------------------------------------------------------------
-- 5. Time entries: approval was only guarded on UPDATE, so a technician could
--    INSERT an already-approved entry, and could move an entry to another
--    person via the UPDATE check.
-- ---------------------------------------------------------------------------
create or replace function public.trg_time_lock()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op in ('UPDATE','DELETE') and public.is_period_locked(old.org_id, old.started_at) then
    raise exception 'PERIOD_CLOSED: this pay period is closed. The owner can reopen it.';
  end if;
  if tg_op in ('INSERT','UPDATE') and public.is_period_locked(new.org_id, new.started_at) then
    raise exception 'PERIOD_CLOSED: this pay period is closed. The owner can reopen it.';
  end if;
  -- Approval needs the permission and the plan feature.
  if tg_op = 'INSERT' and new.approved and auth.uid() is not null
     and (not public.has_perm(new.org_id, 'approve_timesheets') or not public.plan_allows(new.org_id, 'timesheet_approvals')) then
    new.approved := false;
  end if;
  if tg_op = 'INSERT' then
    new.approved_by := case when new.approved then coalesce(new.approved_by, auth.uid()) end;
    new.approved_at := case when new.approved then coalesce(new.approved_at, now()) end;
  end if;
  if tg_op = 'UPDATE' and new.approved is distinct from old.approved then
    if not public.has_perm(new.org_id, 'approve_timesheets') or not public.plan_allows(new.org_id, 'timesheet_approvals') then
      raise exception 'PERMISSION: you cannot approve time';
    end if;
    new.approved_by := case when new.approved then auth.uid() end;
    new.approved_at := case when new.approved then now() end;
  end if;
  return coalesce(new, old);
end;
$$;

drop policy if exists time_update on public.time_entries;
create policy time_update on public.time_entries for update
  using ((user_id = auth.uid() and not approved) or public.is_manager(org_id))
  with check (public.is_member(org_id) and (user_id = auth.uid() or public.is_manager(org_id)));

-- ---------------------------------------------------------------------------
-- 6. Job assignments: only managers assign crew (the app uses schedule_job;
--    crew confirm via confirm_assignment), and only people in the company.
-- ---------------------------------------------------------------------------
drop policy if exists job_assignments_insert on public.job_assignments;
drop policy if exists job_assignments_update on public.job_assignments;
create policy job_assignments_insert on public.job_assignments for insert with check (public.is_manager(org_id));
create policy job_assignments_update on public.job_assignments for update using (public.is_manager(org_id)) with check (public.is_manager(org_id));

create or replace function public.trg_assignee_member()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from memberships where org_id = new.org_id and user_id = new.user_id) then
    raise exception 'Only team members of this company can be assigned';
  end if;
  return new;
end;
$$;
drop trigger if exists job_assignments_member on public.job_assignments;
create trigger job_assignments_member before insert or update of user_id, org_id on public.job_assignments
  for each row execute function public.trg_assignee_member();

-- ---------------------------------------------------------------------------
-- 7. Jobs: crew can update jobs (status, photos, sign-off, condition report),
--    but not the commercial / structural links that only managers set.
-- ---------------------------------------------------------------------------
create or replace function public.trg_job_crew_columns()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- Clearing a link (ON DELETE SET NULL cascades) is allowed; pointing it elsewhere is not.
  if auth.uid() is not null and not public.is_manager(new.org_id) and (
       new.org_id is distinct from old.org_id or new.number is distinct from old.number
    or (new.customer_id is not null and new.customer_id is distinct from old.customer_id)
    or (new.aircraft_id is not null and new.aircraft_id is distinct from old.aircraft_id)
    or (new.quote_id is not null and new.quote_id is distinct from old.quote_id)
    or (new.branch_id is not null and new.branch_id is distinct from old.branch_id)
    or (new.location_id is not null and new.location_id is distinct from old.location_id)
    or new.covered_by_plan is distinct from old.covered_by_plan
    or (new.recurring_schedule_id is not null and new.recurring_schedule_id is distinct from old.recurring_schedule_id)
    or (new.follow_up_of is not null and new.follow_up_of is distinct from old.follow_up_of)) then
    raise exception 'PERMISSION: only managers can change the customer, asset, location or billing of a job';
  end if;
  return new;
end;
$$;
drop trigger if exists jobs_crew_columns on public.jobs;
create trigger jobs_crew_columns before update on public.jobs for each row execute function public.trg_job_crew_columns();

-- ---------------------------------------------------------------------------
-- 8. Cross-organization references that had no assert_same_org guard.
--    (A row could point at another company's location/quote/invoice/service,
--    which service-role code then reads and shows or sends.)
-- ---------------------------------------------------------------------------
do $$
declare
  r record;
begin
  for r in select * from (values
    ('booking_requests','aircraft','aircraft_id'), ('booking_requests','jobs','job_id'), ('booking_requests','quotes','quote_id'),
    ('booking_requests','jobs','result_job_id'), ('booking_requests','services','service_id'),
    ('customers','locations','preferred_location_id'),
    ('equipment_service_log','expenses','expense_id'), ('equipment_service_log','equipment_maintenance','maintenance_id'),
    ('expenses','recurring_expenses','recurring_expense_id'),
    ('invoice_items','services','service_id'), ('invoices','aircraft','aircraft_id'),
    ('job_items','services','service_id'),
    ('jobs','jobs','follow_up_of'), ('jobs','locations','location_id'), ('jobs','quotes','quote_id'), ('jobs','recurring_schedules','recurring_schedule_id'),
    ('messages','invoices','invoice_id'), ('messages','jobs','job_id'), ('messages','quotes','quote_id'),
    ('portal_sessions','customers','customer_id'),
    ('quote_items','services','service_id'),
    ('quotes','locations','location_id'), ('quotes','opportunities','opportunity_id'), ('quotes','quotes','parent_quote_id'),
    ('quotes','quote_options','selected_option_id'), ('quotes','quotes','superseded_by'),
    ('recurring_expenses','branches','branch_id'), ('recurring_schedules','locations','location_id'),
    ('service_reminders','services','service_id'), ('stock_locations','branches','branch_id')
  ) v(child, parent, col)
  loop
    execute format('drop trigger if exists %I on public.%I', r.child || '_sec_org_' || r.col, r.child);
    execute format('create trigger %I before insert or update of %I, org_id on public.%I for each row execute function public.assert_same_org(%L, %L)',
                   r.child || '_sec_org_' || r.col, r.col, r.child, r.parent, r.col);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 9. Storage paths saved on rows must live under the row's company folder.
--    The portal and other service-role code sign these paths, so a path like
--    "<other org>/exports/…zip" on a job photo leaked another tenant's files.
-- ---------------------------------------------------------------------------
create or replace function public.assert_org_path()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v text;
  c text;
begin
  foreach c in array tg_argv loop
    execute format('select ($1).%I::text', c) into v using new;
    continue when v is null or v ~* '^https?://';
    if v not like new.org_id::text || '/%' or v like '%..%' then
      raise exception 'File path must be inside this company''s folder';
    end if;
  end loop;
  return new;
end;
$$;
do $$
declare
  r record;
begin
  for r in select * from (values
    ('job_photos', array['storage_path']), ('quote_photos', array['storage_path']), ('aircraft', array['photo_path']),
    ('expenses', array['receipt_path']), ('training_media', array['storage_path','thumbnail_path']), ('inventory_items', array['sds_path']),
    ('equipment', array['photo_path']), ('equipment_service_log', array['receipt_path']), ('equipment_files', array['storage_path']),
    ('equipment_issues', array['photo_path']), ('certifications', array['document_path'])
  ) v(tbl, cols)
  loop
    execute format('drop trigger if exists %I on public.%I', r.tbl || '_org_path', r.tbl);
    execute format('create trigger %I before insert or update on public.%I for each row execute function public.assert_org_path(%s)',
                   r.tbl || '_org_path', r.tbl, (select string_agg(quote_literal(x), ', ') from unnest(r.cols) x));
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 10. Storage policies. Every member could read every company file, including
--     the owner's full data export (<org>/exports/…zip, predictable name),
--     receipts and quote photos, and could overwrite any file (upsert).
-- ---------------------------------------------------------------------------
drop policy if exists org_files_read on storage.objects;
drop policy if exists org_files_write on storage.objects;
drop policy if exists org_files_update on storage.objects;
create policy org_files_read on storage.objects for select to authenticated using (
  bucket_id = 'org-files'
  and public.is_member(((storage.foldername(name))[1])::uuid)
  and case
        when (storage.foldername(name))[2] = 'exports' then public.is_owner(((storage.foldername(name))[1])::uuid)
        when (storage.foldername(name))[2] in ('receipts','quotes')
          or ((storage.foldername(name))[2] = 'equipment' and (storage.foldername(name))[4] = 'receipts')
          then public.can_money(((storage.foldername(name))[1])::uuid)
        else true
      end);
create policy org_files_write on storage.objects for insert to authenticated with check (
  bucket_id = 'org-files'
  and public.is_member(((storage.foldername(name))[1])::uuid)
  and coalesce((storage.foldername(name))[2], '') <> 'exports'
  and (not public.has_role(((storage.foldername(name))[1])::uuid, array['viewer']::public.member_role[])
       or name = (storage.foldername(name))[1] || '/avatars/' || auth.uid()::text || '.jpg'));
-- Overwrites: managers, or a person replacing their own profile photo.
create policy org_files_update on storage.objects for update to authenticated using (
  bucket_id = 'org-files'
  and coalesce((storage.foldername(name))[2], '') <> 'exports'
  and (public.is_manager(((storage.foldername(name))[1])::uuid)
       or (public.is_member(((storage.foldername(name))[1])::uuid)
           and name = (storage.foldername(name))[1] || '/avatars/' || auth.uid()::text || '.jpg')));

-- The public branding bucket only holds logo images.
do $$ begin
  if exists (select 1 from information_schema.columns where table_schema = 'storage' and table_name = 'buckets' and column_name = 'allowed_mime_types') then
    update storage.buckets set allowed_mime_types = array['image/png','image/jpeg','image/webp','image/gif'], file_size_limit = 5242880
    where id = 'branding';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 11. Deactivated members no longer see teammates' profiles (phone numbers).
-- ---------------------------------------------------------------------------
drop policy if exists profiles_teammates on public.profiles;
create policy profiles_teammates on public.profiles for select using (
  exists (select 1 from memberships a join memberships b on a.org_id = b.org_id
          where a.user_id = auth.uid() and a.active and b.user_id = profiles.id));

-- ---------------------------------------------------------------------------
-- 12. Public endpoints: abuse limits.
-- ---------------------------------------------------------------------------
-- A quote link could create unlimited booking requests (manager notifications).
create or replace function public.request_quote_dates(p_token text, p_dates timestamptz[], p_notes text default null)
returns boolean language plpgsql security definer set search_path = public as $$
declare q quotes; v_job uuid;
begin
  select * into q from quotes where public_token = p_token;
  if not found or q.status <> 'accepted' then return false; end if;
  if coalesce(array_length(p_dates, 1), 0) = 0 or array_length(p_dates, 1) > 5 then raise exception 'Choose 1 to 5 dates'; end if;
  if (select count(*) from booking_requests where quote_id = q.id and status = 'pending') >= 3 then
    raise exception 'We already have your dates. We will be in touch soon.';
  end if;
  select id into v_job from jobs where quote_id = q.id and status <> 'cancelled' order by created_at limit 1;
  insert into booking_requests (org_id, customer_id, aircraft_id, job_id, quote_id, kind, preferred, notes)
    values (q.org_id, q.customer_id, q.aircraft_id, v_job, q.id, 'quote_dates', to_jsonb(p_dates), left(p_notes, 1000));
  return true;
end;
$$;

-- The per-email limit alone is bypassed by changing the address; add a global cap.
create or replace function public.submit_support_message(p_name text, p_email text, p_company text, p_topic text, p_message text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if coalesce(length(trim(p_name)), 0) < 2 or p_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or coalesce(length(trim(p_message)), 0) < 10 then
    raise exception 'Please enter your name, a valid email and a message (10+ characters).';
  end if;
  if length(p_message) > 5000 or length(p_name) > 200 or length(p_email) > 254 or length(p_company) > 200 or length(p_topic) > 100 then
    raise exception 'Message is too long';
  end if;
  -- Light abuse protection: at most 5 messages per email per hour, 200 overall.
  if (select count(*) from support_messages where email = lower(trim(p_email)) and created_at > now() - interval '1 hour') >= 5
     or (select count(*) from support_messages where created_at > now() - interval '1 hour') >= 200 then
    raise exception 'Too many messages. Please try again later.';
  end if;
  insert into support_messages (name, email, company, topic, message)
  values (trim(p_name), lower(trim(p_email)), nullif(trim(p_company), ''), nullif(trim(p_topic), ''), trim(p_message));
end;
$$;

-- Mobile and shop detailing. A company works at the customer's location
-- (mobile), in its own shop, or both; each job says which.
--   Mobile: service address + directions, travel fee on quotes, "On our way"
--           with an arrival time, a route view of the day.
--   Shop:   check-in at drop-off (photos, mileage/hours, keys, signature),
--           "Ready for pickup" message, pickup, and bay capacity on the calendar.

alter table public.organizations
  add column service_mode text not null default 'mobile' check (service_mode in ('mobile','shop','both')),
  add column base_address text,                       -- shop, or where mobile crews start
  add column base_lat double precision,
  add column base_lng double precision,
  add column shop_bays int not null default 0 check (shop_bays between 0 and 200),   -- 0 = not tracked
  add column shop_hours text,                         -- shown in the pickup message
  add column travel_fee_mode text not null default 'off' check (travel_fee_mode in ('off','per_mile','zones')),
  add column travel_free_miles numeric(7,1) not null default 0 check (travel_free_miles >= 0),
  add column travel_rate_per_mile numeric(8,2) not null default 0 check (travel_rate_per_mile >= 0),
  add column travel_min_fee numeric(10,2) not null default 0 check (travel_min_fee >= 0),
  -- [{"up_to_miles": 15, "fee": 0}, {"up_to_miles": 30, "fee": 35}, ...] ascending
  add column travel_zones jsonb not null default '[]' check (jsonb_typeof(travel_zones) = 'array'),
  add column service_radius_miles numeric(7,1) check (service_radius_miles > 0);
grant update (service_mode, base_address, base_lat, base_lng, shop_bays, shop_hours, travel_fee_mode, travel_free_miles,
              travel_rate_per_mile, travel_min_fee, travel_zones, service_radius_miles)
  on public.organizations to authenticated;

-- Fleet: each shop location has its own bays (falls back to the company's).
alter table public.branches add column shop_bays int check (shop_bays between 0 and 200);

alter table public.customers
  add column service_address text,                    -- where mobile crews go (home, office, marina slip)
  add column service_lat double precision,
  add column service_lng double precision;

alter table public.quotes
  add column service_mode text check (service_mode in ('mobile','shop')),
  add column travel_miles numeric(7,1) check (travel_miles >= 0);

alter table public.jobs
  add column service_mode text check (service_mode in ('mobile','shop')),
  add column service_address text,
  add column service_lat double precision,
  add column service_lng double precision,
  add column on_my_way_at timestamptz,
  add column eta_minutes int check (eta_minutes between 1 and 600),
  add column checked_in_at timestamptz,
  add column checkin_odometer text,                   -- miles or engine hours at drop-off
  add column checkin_keys text,                       -- key tag / where the keys are
  add column checkin_notes text,
  add column checkin_signed_by text,
  add column checkin_signature_svg text,
  add column ready_at timestamptz,
  add column picked_up_at timestamptz;
create index jobs_shop_window on public.jobs (org_id, scheduled_start) where service_mode = 'shop';

-- New jobs and quotes start with the company's way of working.
create or replace function public.trg_default_service_mode()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.service_mode is null then
    select case service_mode when 'shop' then 'shop' else 'mobile' end into new.service_mode
    from organizations where id = new.org_id;
  end if;
  return new;
end;
$$;
create trigger jobs_service_mode before insert on public.jobs for each row execute function public.trg_default_service_mode();
create trigger quotes_service_mode before insert on public.quotes for each row execute function public.trg_default_service_mode();
update public.jobs j set service_mode = case o.service_mode when 'shop' then 'shop' else 'mobile' end
  from public.organizations o where o.id = j.org_id and j.service_mode is null;

-- Check-in stamps its time once it is signed or has details.
create or replace function public.trg_job_checkin()
returns trigger language plpgsql as $$
begin
  if new.checked_in_at is null and (new.checkin_signature_svg is not null or new.checkin_odometer is not null or new.checkin_keys is not null) then
    new.checked_in_at := now();
  end if;
  if new.checkin_signature_svg is distinct from old.checkin_signature_svg and new.checkin_signature_svg is null then
    new.checkin_signed_by := null;
  end if;
  return new;
end;
$$;
create trigger jobs_checkin before update of checkin_odometer, checkin_keys, checkin_signature_svg on public.jobs
  for each row execute function public.trg_job_checkin();

-- ---------------------------------------------------------------------------
-- Customer messages from the job: "On our way" (with arrival time) and
-- "Ready for pickup". Any crew member on the company can send them; the app
-- then asks send-message to deliver right away.
-- ---------------------------------------------------------------------------
alter table public.automations drop constraint if exists automations_key_check;
alter table public.automations add constraint automations_key_check check (key in (
  'job_reminder','on_our_way','job_complete','invoice_reminders','review_request',
  'quote_follow_up','recurring_heads_up','care_plan_charge','ready_for_pickup'));

insert into public.automations (org_id, key, enabled, channel, settings, subject, body)
  select id, 'ready_for_pickup', true, 'sms', '{}', '{asset} is ready for pickup',
         '{company}: {asset} is ready for pickup!{shop_line}{balance_line} Reply here with any questions.'
  from public.organizations
  on conflict do nothing;

create or replace function public.seed_automations(p_org uuid)
returns void language sql security definer set search_path = public as $$
  insert into automations (org_id, key, enabled, channel, settings, subject, body) values
  (p_org, 'job_reminder', true, 'email', '{"hours_before": 24}',
    'Reminder: {service} for {asset} on {date}',
    'Hi {customer},\n\nThis is a reminder that {company} is scheduled to service {asset} on {date} at {time}{location_line}.\n\nNeed to change it? Reply to this message or use your customer portal: {portal_link}\n\nThank you,\n{company}'),
  (p_org, 'on_our_way', true, 'sms', '{}',
    null,
    '{company}: our team is on the way to {asset}{location_line}.{eta_line} See you soon!'),
  (p_org, 'job_complete', false, 'email', '{"include_photos": true}',
    '{asset} is ready',
    'Hi {customer},\n\nWe finished {service} on {asset}. Your before and after photos and service report are in your customer portal: {portal_link}\n\nThank you,\n{company}'),
  (p_org, 'invoice_reminders', true, 'email',
    '{"sequence_days": [-3, 0, 7, 14, 30], "late_fee": {"enabled": false, "type": "flat", "value": 25, "after_days": 30}}',
    'Invoice {invoice_number} from {company}: {balance} {due_phrase}',
    'Hi {customer},\n\nA friendly reminder that invoice {invoice_number} for {balance} is {due_phrase}.{late_fee_line}\n\nPay securely online: {pay_link}\n\nThank you,\n{company}'),
  (p_org, 'review_request', true, 'email', '{"days_after_payment": 1}',
    'How did we do, {customer}?',
    'Hi {customer},\n\nThank you for choosing {company}. If you were happy with our work on {asset}, a quick Google review would mean a lot: {review_link}\n\nThank you,\n{company}'),
  (p_org, 'quote_follow_up', true, 'email', '{"after_days": 3, "before_deadline_hours": 24}',
    'Your quote {quote_number} from {company}',
    'Hi {customer},\n\nJust following up on quote {quote_number} for {asset} ({total}). It is valid until {deadline}.\n\nReview and approve it here: {quote_link}\n\nQuestions? Reply to this message.\n\n{company}'),
  (p_org, 'recurring_heads_up', true, 'email', '{"days_before": 3}',
    'Upcoming visit: {service} on {date}',
    'Hi {customer},\n\nYour next {service} for {asset} is coming up on {date} at {time}.\n\nNeed a different day? Request a new time here: {portal_link}\n\n{company}'),
  (p_org, 'care_plan_charge', true, 'email', '{}',
    'Your {company} care plan receipt',
    'Hi {customer},\n\nThank you! We received {amount} for your monthly care plan for {asset}.\n\n{company}'),
  (p_org, 'ready_for_pickup', true, 'sms', '{}',
    '{asset} is ready for pickup',
    '{company}: {asset} is ready for pickup!{shop_line}{balance_line} Reply here with any questions.')
  on conflict do nothing;
$$;
revoke execute on function public.seed_automations(uuid) from public, anon, authenticated;

-- Queues an automation message about a job to the customer (text and/or email
-- per the automation's channel). Returns the queued message ids.
create or replace function public._queue_job_message(p_job uuid, p_key text, p_vars jsonb)
returns uuid[] language plpgsql security definer set search_path = public as $$
declare
  j jobs; c customers; o organizations; a automations;
  v_asset text; v_loc text; v_body text; v_subject text; k text;
  v_ids uuid[] := '{}'; v_id uuid;
  v_label text := case p_key when 'on_our_way' then 'On our way' else 'Ready for pickup' end;
begin
  select * into j from jobs where id = p_job;
  if not found or not public.is_member(j.org_id) or public.has_role(j.org_id, array['viewer']::public.member_role[]) then
    raise exception 'Job not found';
  end if;
  select * into a from automations where org_id = j.org_id and key = p_key;
  if not found or not a.enabled then raise exception 'Turn on the "%" message in the Automation center first', v_label; end if;
  select * into c from customers where id = j.customer_id;
  select * into o from organizations where id = j.org_id;
  if p_key = any(c.automation_exceptions) then raise exception 'This customer has "%" messages turned off', v_label; end if;
  select concat_ws(' ', tail_number, nullif('(' || concat_ws(' ', manufacturer, model) || ')', '()')) into v_asset from aircraft where id = j.aircraft_id;
  select ' at ' || concat_ws(' · ', airport_code, coalesce(fbo_name, name)) into v_loc from locations where id = j.location_id;
  if v_loc is null and j.service_mode = 'mobile' and j.service_address is not null then v_loc := ' at ' || j.service_address; end if;
  v_body := replace(replace(replace(replace(replace(a.body, '\n', E'\n'),
              '{customer}', coalesce(split_part(c.name, ' ', 1), '')), '{company}', o.name),
              '{asset}', coalesce(v_asset, 'your ' || case when j.aircraft_id is null then 'vehicle' else 'aircraft' end)),
              '{location_line}', coalesce(v_loc, ''));
  for k in select jsonb_object_keys(p_vars) loop
    v_body := replace(v_body, '{' || k || '}', coalesce(p_vars ->> k, ''));
  end loop;
  -- Older "On our way" templates have no {eta_line}: add the arrival time at the end.
  if p_key = 'on_our_way' and coalesce(p_vars ->> 'eta_line', '') <> '' and position('{eta_line}' in a.body) = 0 then
    v_body := v_body || (p_vars ->> 'eta_line');
  end if;
  v_body := regexp_replace(v_body, '\{\w+\}', '', 'g');
  v_subject := coalesce(nullif(regexp_replace(replace(replace(coalesce(a.subject, ''), '{company}', o.name), '{asset}', coalesce(v_asset, 'Your vehicle')), '\{\w+\}', '', 'g'), ''),
                        o.name || ': ' || lower(v_label));
  if a.channel in ('sms','both') and c.phone is not null and c.sms_consent and not c.sms_opted_out then
    insert into messages (org_id, customer_id, channel, to_address, body, automation_key, job_id, dedupe_key, created_by)
      values (j.org_id, c.id, 'sms', c.phone, v_body, p_key, j.id, p_key || ':sms:' || j.id, auth.uid())
      on conflict do nothing returning id into v_id;
    if v_id is not null then v_ids := v_ids || v_id; end if;
  end if;
  v_id := null;
  if (a.channel in ('email','both') or (a.channel = 'sms' and cardinality(v_ids) = 0)) and c.email is not null and not c.email_opted_out then
    insert into messages (org_id, customer_id, channel, to_address, subject, body, automation_key, job_id, dedupe_key, created_by)
      values (j.org_id, c.id, 'email', c.email, v_subject, v_body, p_key, j.id, p_key || ':email:' || j.id, auth.uid())
      on conflict do nothing returning id into v_id;
    if v_id is not null then v_ids := v_ids || v_id; end if;
  end if;
  if cardinality(v_ids) = 0 and not exists (select 1 from messages where job_id = j.id and automation_key = p_key) then
    raise exception 'This customer has no phone with texting consent or email on file';
  end if;
  return v_ids;
end;
$$;
revoke execute on function public._queue_job_message(uuid, text, jsonb) from public, anon, authenticated;

drop function if exists public.queue_on_our_way(uuid);
create or replace function public.queue_on_our_way(p_job uuid, p_eta int default null)
returns uuid[] language plpgsql security definer set search_path = public as $$
declare v_ids uuid[];
begin
  if p_eta is not null and (p_eta < 1 or p_eta > 600) then raise exception 'Arrival time must be between 1 and 600 minutes'; end if;
  v_ids := public._queue_job_message(p_job, 'on_our_way', jsonb_build_object(
    'eta_line', case when p_eta is null then ''
                     when p_eta < 60 then ' We should arrive in about ' || p_eta || ' minutes.'
                     else ' We should arrive in about ' || round(p_eta / 60.0, 1)::text || ' hours.' end));
  update jobs set on_my_way_at = coalesce(on_my_way_at, now()), eta_minutes = coalesce(p_eta, eta_minutes) where id = p_job;
  return v_ids;
end;
$$;
revoke execute on function public.queue_on_our_way(uuid, int) from public, anon;
grant execute on function public.queue_on_our_way(uuid, int) to authenticated;

create or replace function public.queue_ready_for_pickup(p_job uuid)
returns uuid[] language plpgsql security definer set search_path = public as $$
declare
  j jobs; o organizations; b branches; v_ids uuid[]; v_balance numeric; v_addr text; v_cur text;
begin
  select * into j from jobs where id = p_job;
  if not found then raise exception 'Job not found'; end if;
  select * into o from organizations where id = j.org_id;
  select * into b from branches where id = j.branch_id;
  v_addr := coalesce(b.address, o.base_address);
  select sum(balance) into v_balance from invoices where job_id = j.id and status not in ('void','draft','paid');
  v_cur := coalesce(o.currency, 'USD');
  v_ids := public._queue_job_message(p_job, 'ready_for_pickup', jsonb_build_object(
    'shop_line', case when v_addr is null then '' else ' Pick up at ' || v_addr || coalesce(' (' || nullif(trim(o.shop_hours), '') || ')', '') || '.' end,
    'balance_line', case when coalesce(v_balance, 0) > 0
      then ' Balance due: ' || case when v_cur = 'USD' then '$' else v_cur || ' ' end || to_char(v_balance, 'FM999,999,990.00') || '.' else '' end));
  update jobs set ready_at = coalesce(ready_at, now()) where id = p_job;
  return v_ids;
end;
$$;
revoke execute on function public.queue_ready_for_pickup(uuid) from public, anon;
grant execute on function public.queue_ready_for_pickup(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Calendar: shop bay capacity joins the other scheduling checks.
-- (Same function as in 20261018000200_plan_tiers.sql plus the bay check.)
-- ---------------------------------------------------------------------------
create or replace function public.schedule_conflicts(
  p_org uuid, p_job uuid, p_start timestamptz, p_end timestamptz,
  p_users uuid[] default '{}', p_equipment uuid[] default '{}', p_hangar uuid default null,
  p_travel_before int default 0, p_travel_after int default 0, p_location uuid default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v jsonb := '[]'::jsonb;
  v_tz text;
  v_from timestamptz := p_start - make_interval(mins => coalesce(p_travel_before, 0));
  v_to timestamptz := p_end + make_interval(mins => coalesce(p_travel_after, 0));
  u uuid; e uuid;
  v_name text;
  r record;
  v_day date;
  v_cap int;
  v_used int;
  v_mode text;
  v_branch uuid;
begin
  if not public.is_member(p_org) then raise exception 'Not a member'; end if;
  if p_start is null or p_end is null then return v; end if;
  if p_end <= p_start then
    return jsonb_build_array(jsonb_build_object('type', 'invalid', 'message', 'End time must be after the start time.'));
  end if;
  if p_end > p_start + interval '24 hours' then
    v := v || jsonb_build_object('type', 'too_long', 'message', 'A job can be at most 24 hours. Split longer work into several jobs.');
  end if;
  select timezone into v_tz from organizations where id = p_org;

  foreach u in array coalesce(p_users, '{}') loop
    select coalesce(display_name, 'Crew member') into v_name from memberships where org_id = p_org and user_id = u;
    -- Double-booked (including travel buffers on both sides).
    for r in
      select j.id, j.number, j.title, j.scheduled_start, j.scheduled_end from jobs j
      join job_assignments a on a.job_id = j.id and a.user_id = u
      where j.org_id = p_org and j.id is distinct from p_job
        and j.status not in ('cancelled','completed','invoiced')
        and j.scheduled_start is not null
        and j.scheduled_start - make_interval(mins => j.travel_before_min) < v_to
        and coalesce(j.scheduled_end, j.scheduled_start + interval '2 hours') + make_interval(mins => j.travel_after_min) > v_from
    loop
      v := v || jsonb_build_object('type', 'double_booked', 'user_id', u, 'job_id', r.id,
        'message', v_name || ' is already on ' || r.number || coalesce(' (' || r.title || ')', '') || ' at ' ||
                   to_char(r.scheduled_start at time zone v_tz, 'Mon DD HH24:MI') || '.');
    end loop;
    -- Approved time off.
    if exists (select 1 from time_off where org_id = p_org and user_id = u and status = 'approved'
               and starts_on <= (v_to at time zone v_tz)::date and ends_on >= (v_from at time zone v_tz)::date) then
      v := v || jsonb_build_object('type', 'time_off', 'user_id', u, 'message', v_name || ' has approved time off then.');
    end if;
    -- Working hours (each local day the job touches).
    for v_day in select generate_series((p_start at time zone v_tz)::date, (p_end at time zone v_tz)::date, interval '1 day')::date loop
      select * into r from crew_hours where org_id = p_org and user_id = u and weekday = extract(dow from v_day);
      if not found then
        v := v || jsonb_build_object('type', 'off_day', 'user_id', u, 'message', v_name || ' does not work on ' || trim(to_char(v_day, 'Day')) || 's.');
      elsif (p_start at time zone v_tz)::date = v_day and (p_start at time zone v_tz)::time < r.start_time
         or (p_end at time zone v_tz)::date = v_day and (p_end at time zone v_tz)::time > r.end_time then
        v := v || jsonb_build_object('type', 'outside_hours', 'user_id', u,
          'message', v_name || ' works ' || to_char(r.start_time, 'HH24:MI') || '–' || to_char(r.end_time, 'HH24:MI') || ' on ' || trim(to_char(v_day, 'Day')) || 's.');
      end if;
    end loop;
    -- Facility requirements the person lacks (or that expire before the job).
    if p_location is not null then
      for r in
        select fr.name from facility_requirements fr
        where fr.location_id = p_location and fr.applies_to = 'person'
          and not exists (select 1 from certifications c where c.org_id = p_org and c.user_id = u
                          and (c.requirement_id = fr.id or (c.kind = fr.kind and lower(c.name) = lower(fr.name)))
                          and (c.expires_on is null or c.expires_on >= (p_end at time zone v_tz)::date))
      loop
        v := v || jsonb_build_object('type', 'missing_requirement', 'user_id', u, 'message', v_name || ' is missing: ' || r.name || '.');
      end loop;
    end if;
  end loop;

  -- Company-level requirements (e.g. insurance certificate) expired or missing.
  if p_location is not null then
    for r in
      select fr.name from facility_requirements fr
      where fr.location_id = p_location and fr.applies_to = 'company'
        and not exists (select 1 from certifications c where c.org_id = p_org and c.user_id is null
                        and (c.requirement_id = fr.id or (c.kind = fr.kind and lower(c.name) = lower(fr.name)))
                        and (c.expires_on is null or c.expires_on >= (p_end at time zone v_tz)::date))
    loop
      v := v || jsonb_build_object('type', 'missing_requirement', 'message', 'Company document missing or expired: ' || r.name || '.');
    end loop;
  end if;

  -- Services that only certified technicians may do (SOP sign-off).
  if p_job is not null and public.plan_allows(p_org, 'certification') then
    foreach u in array coalesce(p_users, '{}') loop
      select coalesce(display_name, 'Crew member') into v_name from memberships where org_id = p_org and user_id = u;
      for r in
        select distinct s.name from job_items ji join services s on s.id = ji.service_id
        where ji.job_id = p_job and s.requires_cert and s.guide_key is not null
          and not exists (select 1 from service_skills k where k.org_id = p_org and k.user_id = u
                          and k.guide_key = s.guide_key and k.level in ('certified','trainer'))
      loop
        v := v || jsonb_build_object('type', 'not_certified', 'user_id', u, 'message', v_name || ' is not certified for ' || r.name || '.');
      end loop;
    end loop;
  end if;

  foreach e in array coalesce(p_equipment, '{}') loop
    select name, status into r from equipment where id = e and org_id = p_org;
    if not found then continue; end if;
    if r.status in ('out_of_service','retired') then
      v := v || jsonb_build_object('type', 'equipment_unavailable', 'equipment_id', e, 'message', r.name || ' is out of service.');
    end if;
    if exists (select 1 from resource_holds h where h.equipment_id = e and h.job_id is distinct from p_job
               and h.starts_at < v_to and h.ends_at > v_from) then
      v := v || jsonb_build_object('type', 'equipment_booked', 'equipment_id', e, 'message', r.name || ' is already reserved then.');
    end if;
  end loop;

  if p_hangar is not null then
    select hangar_capacity into v_cap from locations where id = p_hangar and org_id = p_org;
    select count(*) into v_used from resource_holds h where h.location_id = p_hangar and h.job_id is distinct from p_job
      and h.starts_at < p_end and h.ends_at > p_start;
    if coalesce(v_cap, 0) = 0 then
      v := v || jsonb_build_object('type', 'hangar_unavailable', 'message', 'No hangar space is set up at this facility.');
    elsif v_used >= v_cap then
      v := v || jsonb_build_object('type', 'hangar_full', 'message', 'The hangar is fully booked then (' || v_used || ' of ' || v_cap || ').');
    end if;
  end if;
  -- Shop bays: vehicles and boats in the shop at the same time (drop-off to pickup).
  select service_mode, branch_id into v_mode, v_branch from jobs where id = p_job and org_id = p_org;
  if v_mode is null then
    select case service_mode when 'shop' then 'shop' else 'mobile' end into v_mode from organizations where id = p_org;
  end if;
  if v_mode = 'shop' then
    select coalesce((select shop_bays from branches where id = v_branch), o.shop_bays) into v_cap from organizations o where o.id = p_org;
    if coalesce(v_cap, 0) > 0 then
      select count(*) into v_used from jobs j
      where j.org_id = p_org and j.id is distinct from p_job and j.service_mode = 'shop'
        and j.branch_id is not distinct from v_branch
        and j.status not in ('cancelled','invoiced') and j.picked_up_at is null
        and j.scheduled_start is not null
        and j.scheduled_start < p_end
        and coalesce(j.scheduled_end, j.scheduled_start + interval '2 hours') > p_start;
      if v_used >= v_cap then
        v := v || jsonb_build_object('type', 'bays_full',
          'message', 'All ' || v_cap || ' shop bay' || case when v_cap = 1 then ' is' else 's are' end || ' booked then. Pick another time or raise the bay count in Settings.');
      end if;
    end if;
  end if;
  return v;
end;
$$;

-- Worker support: the maintenance-due view also serves the service-role
-- worker, plus indexes for portal logins and alert de-duplication.
create or replace view public.equipment_maintenance_due as
  select m.*, e.name as equipment_name, e.usage_hours,
    case when m.every_days is not null then coalesce(m.last_done_on, e.purchased_on, m.created_at::date) + m.every_days end as next_due_on,
    case when m.every_hours is not null then coalesce(m.last_done_hours, 0) + m.every_hours end as next_due_hours
  from public.equipment_maintenance m join public.equipment e on e.id = m.equipment_id
  where public.is_member(m.org_id) or auth.uid() is null;
revoke select on public.equipment_maintenance_due from anon;
create index if not exists portal_sessions_login on public.portal_sessions (org_id, email, created_at desc);
create index if not exists notification_outbox_kind on public.notification_outbox (org_id, kind, created_at);

-- "On our way": any crew member on the job can notify the customer. Queues
-- the message(s) per the automation's channel; the app then asks
-- send-message to deliver them right away.
create or replace function public.queue_on_our_way(p_job uuid)
returns uuid[] language plpgsql security definer set search_path = public as $$
declare
  j jobs; c customers; o organizations; a automations;
  v_asset text; v_loc text; v_body text; v_subject text;
  v_ids uuid[] := '{}'; v_id uuid;
begin
  select * into j from jobs where id = p_job;
  if not found or not public.is_member(j.org_id) or public.has_role(j.org_id, array['viewer']::public.member_role[]) then
    raise exception 'Job not found';
  end if;
  select * into a from automations where org_id = j.org_id and key = 'on_our_way';
  if not found or not a.enabled then raise exception 'Turn on the "On our way" message in the Automation center first'; end if;
  select * into c from customers where id = j.customer_id;
  select * into o from organizations where id = j.org_id;
  if 'on_our_way' = any(c.automation_exceptions) then raise exception 'This customer has "On our way" messages turned off'; end if;
  select concat_ws(' ', tail_number, nullif('(' || concat_ws(' ', manufacturer, model) || ')', '()')) into v_asset from aircraft where id = j.aircraft_id;
  select ' at ' || concat_ws(' · ', airport_code, coalesce(fbo_name, name)) into v_loc from locations where id = j.location_id;
  v_body := replace(replace(replace(replace(replace(a.body, '\n', E'\n'),
              '{customer}', coalesce(split_part(c.name, ' ', 1), '')), '{company}', o.name),
              '{asset}', coalesce(v_asset, 'your aircraft')), '{location_line}', coalesce(v_loc, ''));
  v_body := regexp_replace(v_body, '\{\w+\}', '', 'g');
  v_subject := coalesce(nullif(regexp_replace(replace(coalesce(a.subject, ''), '{company}', o.name), '\{\w+\}', '', 'g'), ''), o.name || ': we are on our way');
  if a.channel in ('sms','both') and c.phone is not null and c.sms_consent and not c.sms_opted_out then
    insert into messages (org_id, customer_id, channel, to_address, body, automation_key, job_id, dedupe_key, created_by)
      values (j.org_id, c.id, 'sms', c.phone, v_body, 'on_our_way', j.id, 'on_our_way:sms:' || j.id, auth.uid())
      on conflict do nothing returning id into v_id;
    if v_id is not null then v_ids := v_ids || v_id; end if;
  end if;
  v_id := null;
  if (a.channel in ('email','both') or (a.channel = 'sms' and cardinality(v_ids) = 0)) and c.email is not null and not c.email_opted_out then
    insert into messages (org_id, customer_id, channel, to_address, subject, body, automation_key, job_id, dedupe_key, created_by)
      values (j.org_id, c.id, 'email', c.email, v_subject, v_body, 'on_our_way', j.id, 'on_our_way:email:' || j.id, auth.uid())
      on conflict do nothing returning id into v_id;
    if v_id is not null then v_ids := v_ids || v_id; end if;
  end if;
  if cardinality(v_ids) = 0 and not exists (select 1 from messages where job_id = j.id and automation_key = 'on_our_way') then
    raise exception 'This customer has no phone with texting consent or email on file';
  end if;
  return v_ids;
end;
$$;

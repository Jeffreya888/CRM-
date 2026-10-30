-- Win-back follow-ups: four automations that bring back work that slipped away.
--   quote_win_back     a quote expired or was declined → one message N days later
--   customer_win_back  a customer has had no job for N days and nothing booked
--   service_due        a service reminder (e.g. coating maintenance) comes due → the customer hears
--   job_rebook         a job was canceled → "want to pick a new date?" N days later
-- Each is sent at most once per quote / quiet period / reminder due date / canceled job,
-- and never when the customer already has work booked. The automation worker sends them.

alter table public.automations drop constraint if exists automations_key_check;
alter table public.automations add constraint automations_key_check check (key in (
  'job_reminder','on_our_way','job_complete','invoice_reminders','review_request',
  'quote_follow_up','recurring_heads_up','care_plan_charge','ready_for_pickup',
  'quote_win_back','customer_win_back','service_due','job_rebook'));

alter table public.quotes add column win_back_sent_at timestamptz;
alter table public.customers add column win_back_sent_at timestamptz;
alter table public.service_reminders add column customer_notified_for date;   -- due date the customer was told about
alter table public.jobs
  add column cancelled_at timestamptz,
  add column rebook_sent_at timestamptz;

-- When a job is canceled (for the rebook message).
create or replace function public.trg_job_cancelled_at()
returns trigger language plpgsql as $$
begin
  if new.status = 'cancelled' and old.status is distinct from 'cancelled' then new.cancelled_at := now();
  elsif new.status <> 'cancelled' then new.cancelled_at := null;
  end if;
  return new;
end;
$$;
create trigger jobs_cancelled_at before update of status on public.jobs
  for each row execute function public.trg_job_cancelled_at();

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
    '{company}: {asset} is ready for pickup!{shop_line}{balance_line} Reply here with any questions.'),
  (p_org, 'quote_win_back', true, 'email', '{"after_days": 10}',
    'Still thinking about {asset}?',
    'Hi {customer},\n\nYour quote {quote_number} for {asset} has closed, but we would still love to take care of it. Reply to this message and we will send an updated quote, or request a time here: {portal_link}\n\n{company}'),
  (p_org, 'customer_win_back', true, 'email', '{"after_days": 120}',
    'Time for your next detail?',
    'Hi {customer},\n\nIt has been a while since we last took care of {asset}. Want us to get it looking its best again? Pick a time here: {portal_link}\n\nOr just reply to this message.\n\n{company}'),
  (p_org, 'service_due', true, 'email', '{"days_before": 7}',
    '{service} is due for {asset}',
    'Hi {customer},\n\n{service} for {asset} is due {due_phrase}. Keeping it on schedule protects the finish. Book a time here: {portal_link}\n\n{company}'),
  (p_org, 'job_rebook', true, 'email', '{"after_days": 3}',
    'Want to pick a new date?',
    'Hi {customer},\n\nOur visit for {asset} was canceled. Whenever you are ready, pick a new date here: {portal_link}\n\nOr reply to this message and we will set it up.\n\n{company}')
  on conflict do nothing;
$$;
revoke execute on function public.seed_automations(uuid) from public, anon, authenticated;
select public.seed_automations(id) from public.organizations;

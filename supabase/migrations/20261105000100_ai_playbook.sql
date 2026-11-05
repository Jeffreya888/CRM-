-- Company playbook for Ask Tarmo: the company's own products, methods and standards.
-- Read only by that company's assistant; owners and admins edit it (org_update policy).
alter table public.organizations add column if not exists ai_playbook text
  check (ai_playbook is null or char_length(ai_playbook) <= 8000);
grant update (ai_playbook) on public.organizations to authenticated;

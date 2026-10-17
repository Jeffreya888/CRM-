-- Technicians' price-free service menu: add type, duration range, guide and
-- recurrence so their Services tab and guides work fully.
create or replace view public.service_menu as
  select id, org_id, name, description, category, est_hours, active, sort_order, checklist, equipment,
         asset_type, est_hours_max, guide_key, recur_every, recur_unit, taxable
  from public.services
  where public.is_member(org_id);
grant select on public.service_menu to authenticated;

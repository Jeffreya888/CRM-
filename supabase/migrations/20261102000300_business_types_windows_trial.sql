-- 1) Any combination of business types (at least one): boat-only and car-only
--    detailers no longer get aircraft. Aircraft services seed only when aircraft is picked.
-- 2) Two aircraft window services with SOPs (polish; restoration with an NDT report).
-- 3) 30-day free trial for new companies.

alter table public.organizations drop constraint if exists org_business_types;
alter table public.organizations add constraint org_business_types check (
  business_types <@ array['aircraft','vehicle','watercraft'] and cardinality(business_types) >= 1);

alter table public.organizations alter column trial_ends_at set default (now() + interval '30 days');

insert into public.service_guides (key, asset_type, title, summary, time_estimate, crew, products, tools, prep, steps, donts, quality_checks, photos) values
(
  'window_polish', 'aircraft', 'Window Polish (Haze & Light Scratches)',
  'Removes light haze, fine scratches and swirls from acrylic cabin windows and acrylic windscreens with approved plastic polishes only. No sanding and no material removal beyond polish. Priced per window: set the quantity to the number of windows.',
  '20–40 min per window', '1 technician',
  array['Approved acrylic cleaner (non-ammonia)', 'Approved acrylic/plastic polish (fine and finishing grades)', 'Anti-static protectant for acrylic']::text[],
  array['Low-tack masking tape', 'Soft foam or microfiber polishing pads', 'Low-speed dual-action polisher (optional, low heat)', 'Clean flannel or microfiber towels']::text[],
  array['Confirm the windows are acrylic (stretched or cast). Never polish or sand glass or coated windshields; most jet windshields are glass', 'Check the aircraft manufacturers maintenance manual (or AC 43.13-1B for general aviation) for cleaning and polishing products and limits', 'Protect surrounding paint, seals and rubber with low-tack masking', 'Work in shade on cool windows']::text[],
  '[{"title": "Inspect and record each window", "detail": "Photograph every window under raking light. Note haze, scratches and any crazing, cracks or delamination.", "caution": "Crazing, cracks, deep scratches or delamination are maintenance items: stop and report to the owner and their maintenance provider.", "minutes": 5, "products": []}, {"title": "Clean", "detail": "Flush with water, then clean with an approved acrylic cleaner and a soft cloth, wiping in one direction.", "caution": "Never wipe dry: grit scratches acrylic.", "minutes": 5, "products": []}, {"title": "Mask", "detail": "Mask seals, rubber and surrounding paint.", "caution": null, "minutes": 5, "products": []}, {"title": "Polish by hand or low speed", "detail": "Work the polish in small overlapping passes with light pressure, keeping the surface cool. Check under light and repeat only as needed.", "caution": "Heat distorts and crazes acrylic. Keep the pad moving and the speed low.", "minutes": 15, "products": []}, {"title": "Finish and protect", "detail": "Finish with the fine grade, remove residue and apply anti-static protectant.", "caution": null, "minutes": 5, "products": []}, {"title": "Final inspection", "detail": "Inspect from inside and outside under light, compare to before photos and remove masking.", "caution": null, "minutes": 5, "products": []}]'::jsonb,
  array['Never sand in this service. Deeper damage needs Window Restoration with an NDT report', 'Never use ammonia, alcohol, solvents or household glass cleaner on acrylic', 'Never polish glass or coated windshields', 'Never let the surface get hot']::text[],
  array['Haze and fine scratches reduced, with clear, distortion-free vision', 'No polish residue on seals or paint', 'Before and after photos for every window']::text[],
  array['Before: each window under raking light', 'After: same angles', 'Close-ups of any damage reported to the owner']::text[]
),
(
  'window_restoration', 'aircraft', 'Window Restoration (Wet Sand & Polish)',
  'Restores acrylic cabin windows and acrylic windscreens with deeper scratches by wet sanding through progressively finer abrasives and polishing to optical clarity. Sanding removes material, so it needs the owners written approval and a thickness (NDT) report from their maintenance provider before work starts. Priced per window: set the quantity to the number of windows.',
  '1–3 h per window', '1–2 technicians',
  array['Acrylic restoration abrasive system (progressive wet grits, e.g. Micro-Mesh style)', 'Approved acrylic/plastic polish (fine and finishing grades)', 'Approved acrylic cleaner (non-ammonia)', 'Anti-static protectant for acrylic']::text[],
  array['Low-tack masking tape', 'Foam sanding blocks', 'Spray bottle with clean water (a drop of mild soap)', 'Low-speed dual-action polisher (optional, low heat)', 'Bright inspection light', 'Microfiber towels']::text[],
  array['Get the owners written approval for material removal on each window', 'Confirm the windows are acrylic (stretched or cast). Never polish or sand glass or coated windshields; most jet windshields are glass', 'Check the aircraft manufacturers maintenance manual (or AC 43.13-1B for general aviation) for cleaning and polishing products and limits', 'Protect surrounding paint, seals and rubber with low-tack masking', 'Work in shade on cool windows', 'Get the thickness/NDT report from the owners maintenance provider (usually ultrasonic thickness readings) with the minimum allowed thickness and how much may be removed. No report, no sanding']::text[],
  '[{"title": "Review approval and NDT report", "detail": "Confirm in the job notes that the owner approved the work and attach the maintenance providers thickness/NDT report showing current thickness, minimum allowed thickness and removal allowed per window.", "caution": "Do not start without both. The detailer never decides how much material can come off.", "minutes": 10, "products": []}, {"title": "Inspect and record each window", "detail": "Photograph each window under raking light. Mark the scratches to be removed and note crazing, cracks or delamination.", "caution": "Damage beyond the allowed removal is a maintenance item: stop and report it.", "minutes": 10, "products": []}, {"title": "Clean and mask", "detail": "Clean with an approved acrylic cleaner, then mask seals, rubber and surrounding paint.", "caution": null, "minutes": 10, "products": []}, {"title": "Wet sand with the coarsest approved grit", "detail": "Using a foam block and plenty of water, sand only the damaged area with light, even pressure in one direction, feathering the edges.", "caution": "Keep it wet and cool. Remove the minimum needed and stay within the NDT reports limit.", "minutes": 30, "products": []}, {"title": "Step through finer grits", "detail": "Move through each finer grit, changing direction each step until the previous scratches are gone. Rinse between grits.", "caution": null, "minutes": 30, "products": []}, {"title": "Polish to clarity", "detail": "Polish with the fine grade, then the finishing grade, at low speed or by hand until optically clear.", "caution": "Heat crazes acrylic. Keep the pad moving.", "minutes": 25, "products": []}, {"title": "Re-measure as required", "detail": "Have the maintenance provider re-check thickness where their report requires it, and record the result.", "caution": null, "minutes": 10, "products": []}, {"title": "Protect, inspect and document", "detail": "Apply anti-static protectant, inspect from inside and outside for distortion, remove masking and attach before and after photos to the job.", "caution": null, "minutes": 10, "products": []}]'::jsonb,
  array['Never sand without the owners approval and the maintenance providers thickness/NDT report', 'Never remove more material than the report allows', 'Never sand or polish glass or coated windshields', 'Never use ammonia, alcohol or solvents on acrylic', 'Never let the window heat up during sanding or polishing']::text[],
  array['Scratches removed within the approved limit, with no distortion when looking through', 'Thickness re-check recorded where required', 'Approval, NDT report and before/after photos attached to the job']::text[],
  array['Before: each window under raking light', 'During: after the final grit', 'After: same angles as before', 'Photo of the NDT report and approval']::text[]
)
on conflict do nothing;

-- Window services, priced per window (quantity = number of windows).
create or replace function public._add_window_services(p_org uuid)
returns void language sql security definer set search_path = public as $$
  insert into services (org_id, asset_type, name, guide_key, category, pricing_method, base_price, est_hours, est_hours_max, sort_order, description)
  select p_org, 'aircraft', v.name, v.key, 'specialty', 'flat', v.price, v.h, v.hmax, v.sort, v.descr
  from (values
    ('Window Polish (Haze & Light Scratches)', 'window_polish', 95::numeric, 0.5::numeric, 0.75::numeric, 40,
     'Per window: removes haze and light scratches from acrylic windows. Set the quantity to the number of windows.'),
    ('Window Restoration (Wet Sand & Polish)', 'window_restoration', 195::numeric, 1.5::numeric, 3::numeric, 41,
     'Per window: wet sand and polish deeper scratches on acrylic windows. Needs owner approval and a thickness (NDT) report. Set the quantity to the number of windows.')
  ) as v(name, key, price, h, hmax, sort, descr)
  where not exists (select 1 from services s where s.org_id = p_org and s.guide_key = v.key);
$$;
revoke execute on function public._add_window_services(uuid) from public, anon, authenticated;

-- Aircraft starter services, once.
create or replace function public._seed_aircraft_services(p_org uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from services where org_id = p_org and asset_type = 'aircraft') then
    perform public.seed_default_services(p_org);
  end if;
  perform public._add_window_services(p_org);
  perform public.apply_guide_checklists(p_org);
end;
$$;
revoke execute on function public._seed_aircraft_services(uuid) from public, anon, authenticated;

create or replace function public.create_organization(p_name text, p_seed_services boolean default true, p_business_types text[] default '{aircraft}')
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_org uuid;
  v_uid uuid := auth.uid();
  v_types text[];
  t text;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  select coalesce(array_agg(distinct x), '{aircraft}') into v_types
    from unnest(coalesce(p_business_types, '{}')) x where x in ('aircraft', 'vehicle', 'watercraft');
  insert into organizations (name, business_types) values (p_name, v_types) returning id into v_org;
  insert into memberships (org_id, user_id, role, display_name)
    select v_org, v_uid, 'owner', p.full_name from profiles p where p.id = v_uid;
  if not found then
    insert into memberships (org_id, user_id, role) values (v_org, v_uid, 'owner');
  end if;
  update profiles set current_org_id = v_org where id = v_uid;
  if p_seed_services then
    foreach t in array v_types loop
      if t = 'aircraft' then perform public._seed_aircraft_services(v_org);
      else perform public.seed_asset_services(v_org, t); end if;
    end loop;
  end if;
  perform public.seed_org_defaults(v_org);
  return v_org;
end;
$$;

create or replace function public.trg_business_types()
returns trigger language plpgsql security definer set search_path = public as $$
declare t text;
begin
  if not (old.business_types <@ new.business_types) then
    raise exception 'Business types can be added but not removed';
  end if;
  foreach t in array new.business_types loop
    if not (t = any(old.business_types)) then
      if t = 'aircraft' then perform public._seed_aircraft_services(new.id);
      else perform public.seed_asset_services(new.id, t); end if;
    end if;
  end loop;
  return new;
end;
$$;

-- Existing aircraft companies get the window services.
do $$
declare r record;
begin
  for r in select id from public.organizations where 'aircraft' = any(business_types) loop
    perform public._add_window_services(r.id);
    perform public.apply_guide_checklists(r.id);
  end loop;
end $$;

-- Trial conversion counts companies older than the 30-day trial.
create or replace function public.platform_metrics()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v jsonb;
begin
  if not public.is_platform_admin() then raise exception 'Not allowed'; end if;
  with orgs as (
    select o.id, o.created_at, o.billing_period, o.billing_source, public.effective_plan(o.id) as eplan, o.plan
    from organizations o where not o.is_demo
  ), paid as (
    select *, case eplan
        when 'solo' then case when billing_period = 'annual' then 699.99 / 12 else 69.99 end
        when 'team' then case when billing_period = 'annual' then 1199.99 / 12 else 119.99 end
        when 'fleet' then case when billing_period = 'annual' then 2199.99 / 12 else 219.99 end
        else 0 end as mrr,
      -- What reaches us after store commission (15% small-business rate) or Stripe (~3%).
      case when billing_source = 'stripe' then 0.97 else 0.85 end as net_rate
    from orgs where eplan in ('solo','team','fleet')
  ), ai as (
    select
      count(*) filter (where kind = 'check' and used_at >= now() - interval '30 days') as checks_30d,
      count(*) filter (where kind = 'question' and used_at >= now() - interval '30 days') as questions_30d
    from ai_usage
  ), pay as (
    select coalesce(sum(amount), 0) as volume_30d, coalesce(sum(platform_fee), 0) as fees_30d,
           count(distinct org_id) as paying_orgs_30d
    from payments where received_at >= now() - interval '30 days' and method = 'card'
  )
  select jsonb_build_object(
    'generated_at', now(),
    'companies', (select count(*) from orgs),
    'new_companies_30d', (select count(*) from orgs where created_at >= now() - interval '30 days'),
    'trials_active', (select count(*) from orgs where eplan = 'trial'),
    'paid_companies', (select count(*) from paid),
    'by_plan', (select coalesce(jsonb_object_agg(eplan, n), '{}') from (select eplan, count(*) n from paid group by eplan) x),
    'by_source', (select coalesce(jsonb_object_agg(coalesce(billing_source, 'unknown'), n), '{}') from (select billing_source, count(*) n from paid group by billing_source) x),
    'expired', (select count(*) from orgs where eplan = 'expired'),
    'mrr', (select round(coalesce(sum(mrr), 0), 2) from paid),
    'mrr_net', (select round(coalesce(sum(mrr * net_rate), 0), 2) from paid),
    'arr', (select round(coalesce(sum(mrr), 0) * 12, 2) from paid),
    'arpa', (select case when count(*) > 0 then round(sum(mrr) / count(*), 2) end from paid),
    'trial_conversion_pct', (select case when count(*) filter (where created_at < now() - interval '30 days') > 0
        then round(100.0 * count(*) filter (where eplan in ('solo','team','fleet') and created_at < now() - interval '30 days')
                   / count(*) filter (where created_at < now() - interval '30 days'), 1) end from orgs),
    'payment_volume_30d', (select round(volume_30d, 2) from pay),
    'platform_fees_30d', (select round(fees_30d, 2) from pay),
    'companies_taking_payments_30d', (select paying_orgs_30d from pay),
    'ai_checks_30d', (select checks_30d from ai),
    'ai_questions_30d', (select questions_30d from ai),
    -- Estimates: about 10 cents per photo check and 1.5 cents per question.
    'ai_cost_estimate_30d', (select round(checks_30d * 0.10 + questions_30d * 0.015, 2) from ai),
    'gross_margin_estimate_pct', (select case when (select sum(mrr * net_rate) from paid) + (select fees_30d from pay) > 0
        then round(100 * (1 - ((select checks_30d * 0.10 + questions_30d * 0.015 from ai) + 25)
                         / ((select sum(mrr * net_rate) from paid) + (select fees_30d from pay))), 1) end)
  ) into v;
  return v;
end;
$$;
revoke execute on function public.platform_metrics() from public, anon;
grant execute on function public.platform_metrics() to authenticated;

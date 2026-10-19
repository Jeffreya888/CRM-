-- Starter services for the new auto and marine SOPs (20261019000100 / 000200).
-- New companies get the full list; existing companies that already work on
-- vehicles or watercraft get the new services added (prices are editable).

create or replace function public._new_asset_services(p_org uuid, p_type text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_type = 'vehicle' then
    insert into services (org_id, asset_type, name, guide_key, category, pricing_method, base_price, est_hours, est_hours_max, recur_every, recur_unit, sort_order, description, category_prices)
    select p_org, 'vehicle', x.name, x.gk, x.cat, x.pm, x.base, x.h1, x.h2, x.re, x.ru, x.so, x.descr, x.cp::jsonb
    from (values
      ('Exterior Wash — Level 1 (Maintenance)', 'vehicle_wash_l1', 'exterior', 'per_category'::pricing_method, 40, 0.75, 1, 1, 'week', 107,
        'Quick maintenance wash for regularly kept vehicles.', '{"car":40,"suv":50,"truck":55,"van":60,"rv":150,"motorcycle":35}'),
      ('Interior — Level 1 (Quick Clean)', 'vehicle_interior_l1', 'interior', 'per_category', 50, 0.75, 1, 2, 'week', 108,
        'Vacuum, wipe-down, glass and mats.', '{"car":50,"suv":60,"truck":60,"van":70,"rv":150,"motorcycle":30}'),
      ('Waterless / Rinseless Wash', 'vehicle_waterless_wash', 'exterior', 'per_category', 45, 0.75, 1, 1, 'week', 109,
        'Water-saving wash for garages, condos and light dirt.', '{"car":45,"suv":55,"truck":60,"van":65,"rv":180,"motorcycle":35}'),
      ('Clay Bar Decontamination', 'vehicle_clay_decon', 'paint_correction', 'per_category', 80, 1.5, 2, null, null, 110,
        'Iron remover and clay to leave paint smooth before protection.', '{"car":80,"suv":100,"truck":100,"van":120,"rv":300,"motorcycle":50}'),
      ('Wax / Sealant (One-Step Polish & Protect)', 'vehicle_wax_sealant', 'coating', 'per_category', 120, 2, 3, 3, 'month', 111,
        'One-step polish for gloss plus wax or sealant protection.', '{"car":120,"suv":150,"truck":150,"van":180,"rv":450,"motorcycle":80}'),
      ('Wheels, Tires & Wheel Wells Deep Clean', 'vehicle_wheels_tires', 'exterior', 'flat', 60, 1, 1.5, null, null, 112,
        'Deep clean of wheel faces and barrels, tires and wheel wells.', '{}'),
      ('Leather Clean & Condition', 'vehicle_leather_care', 'interior', 'per_category', 90, 1.5, 2, 3, 'month', 113,
        'Shampoo and condition leather seats and trim.', '{"car":90,"suv":110,"truck":100,"van":130,"rv":250,"motorcycle":40}'),
      ('Carpet & Seat Extraction', 'vehicle_extraction', 'interior', 'per_category', 120, 2, 3, null, null, 114,
        'Hot water extraction of carpets, mats and cloth seats.', '{"car":120,"suv":150,"truck":140,"van":180,"rv":400,"motorcycle":40}'),
      ('Headlight Restoration', 'vehicle_headlight_restoration', 'specialty', 'flat', 120, 1.5, 2, null, null, 115,
        'Sand, polish and UV-protect cloudy headlights.', '{}'),
      ('Odor Removal (Ozone / Enzyme)', 'vehicle_odor_removal', 'specialty', 'flat', 150, 2, 4, null, null, 116,
        'Remove the source, enzyme treatment and ozone.', '{}'),
      ('Paint Protection Film (PPF) Care', 'vehicle_ppf_care', 'coating', 'per_category', 90, 1.5, 2, 1, 'month', 117,
        'Safe wash and protection for vehicles with PPF.', '{"car":90,"suv":110,"truck":110,"van":130,"rv":300,"motorcycle":60}')
    ) as x(name, gk, cat, pm, base, h1, h2, re, ru, so, descr, cp)
    where not exists (select 1 from services s where s.org_id = p_org and s.guide_key = x.gk);
  elsif p_type = 'watercraft' then
    insert into services (org_id, asset_type, name, guide_key, category, pricing_method, base_price, price_per_foot, est_hours, est_hours_max, recur_every, recur_unit, sort_order, description)
    select p_org, 'watercraft', x.name, x.gk, x.cat, x.pm, x.base, x.ppf, x.h1, x.h2, x.re, x.ru, x.so, x.descr
    from (values
      ('Wash — Level 1 (Rinse & Wipe-Down)', 'boat_wash_l1', 'exterior', 'per_foot'::pricing_method, 75, 3, 1, 2, 1, 'week', 207,
        'Fresh-water rinse and wipe-down for boats washed regularly.'),
      ('Interior — Level 1 (Quick Clean)', 'boat_interior_l1', 'interior', 'per_foot', 100, 4, 1.5, 3, 2, 'week', 208,
        'Quick cabin and cockpit clean.'),
      ('Non-skid Deck Deep Clean', 'boat_nonskid', 'exterior', 'per_foot', 150, 6, 2, 4, 3, 'month', 209,
        'Brush-scrub non-skid to lift ground-in dirt and stains.'),
      ('Metal & Stainless Polish', 'boat_metal_polish', 'brightwork', 'per_foot', 150, 6, 3, 6, 3, 'month', 210,
        'Polish rails, cleats and fittings; remove tea staining.'),
      ('Canvas & Clear Vinyl (Isinglass) Care', 'boat_canvas_isinglass', 'specialty', 'per_foot', 150, 5, 2, 4, 3, 'month', 211,
        'Clean and protect canvas, enclosures and clear vinyl.'),
      ('Waterline / Scum Line Stain Removal', 'boat_waterline_stain', 'exterior', 'per_foot', 100, 4, 1.5, 3, 1, 'month', 212,
        'Remove waterline and scum line staining.'),
      ('Vinyl Upholstery Mildew Treatment', 'boat_vinyl_mildew', 'interior', 'per_foot', 150, 5, 2, 4, null, null, 213,
        'Treat mildew on marine vinyl and protect from UV.'),
      ('Engine Room / Bilge Cleaning', 'boat_engine_room_bilge', 'engine', 'per_foot', 200, 8, 3, 6, 6, 'month', 214,
        'Degrease engine room and bilge; oily water disposed of legally.'),
      ('Outboard & Trailer Wash', 'boat_outboard_trailer', 'exterior', 'flat', 120, 0, 1.5, 2, null, null, 215,
        'Clean outboards and trailer; remove salt.'),
      ('Gelcoat One-Step Polish', 'boat_gelcoat_one_step', 'paint_correction', 'per_foot', 250, 18, 5, 10, 6, 'month', 216,
        'One-step polish and protect for lightly oxidized gelcoat.'),
      ('Bottom Paint Inspection', 'boat_bottom_inspection', 'specialty', 'flat', 150, 0, 1.5, 2, 6, 'month', 217,
        'Wash and inspect the bottom, running gear and anodes with a photo report.'),
      ('Hull Wax (Lift or Trailer)', 'boat_hull_wax_lift', 'coating', 'per_foot', 250, 20, 5, 10, 6, 'month', 218,
        'Full hull wax for boats out of the water.')
    ) as x(name, gk, cat, pm, base, ppf, h1, h2, re, ru, so, descr)
    where not exists (select 1 from services s where s.org_id = p_org and s.guide_key = x.gk);
  end if;
end;
$$;
revoke execute on function public._new_asset_services(uuid, text) from public, anon, authenticated;

-- New companies: the original starter list plus the new services.
create or replace function public.seed_asset_services(p_org uuid, p_type text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_type = 'vehicle' and not exists (select 1 from services where org_id = p_org and asset_type = 'vehicle') then
    insert into services (org_id, asset_type, name, guide_key, category, pricing_method, base_price, est_hours, est_hours_max, recur_every, recur_unit, sort_order, description, category_prices) values
    (p_org, 'vehicle', 'Exterior Wash — Level 2 (Full Exterior)', 'vehicle_wash', 'exterior', 'per_category', 60, 1, 1.5, 2, 'week', 101, 'Two-bucket hand wash, wheels, tires and dry.',
       '{"car":60,"suv":75,"truck":80,"van":90,"rv":250,"motorcycle":50}'),
    (p_org, 'vehicle', 'Interior — Level 2 (Full Interior)', 'vehicle_interior', 'interior', 'per_category', 150, 2, 3, 3, 'month', 102, 'Vacuum, shampoo, leather and plastics, glass.',
       '{"car":150,"suv":180,"truck":170,"van":220,"rv":450,"motorcycle":60}'),
    (p_org, 'vehicle', 'Full Detail', 'vehicle_full_detail', 'package', 'per_category', 250, 4, 6, 3, 'month', 103, 'Complete inside-and-out detail with sealant.',
       '{"car":250,"suv":300,"truck":300,"van":350,"rv":800,"motorcycle":150}'),
    (p_org, 'vehicle', 'Paint Correction', 'vehicle_paint_correction', 'paint_correction', 'per_category', 450, 6, 12, null, null, 104, 'Compound and polish to remove swirls and oxidation.',
       '{"car":450,"suv":550,"truck":550,"van":650,"rv":1500,"motorcycle":250}'),
    (p_org, 'vehicle', 'Ceramic Coating', 'vehicle_ceramic_coating', 'coating', 'per_category', 900, 8, 12, 12, 'month', 105, 'Multi-year ceramic protection after paint prep.',
       '{"car":900,"suv":1100,"truck":1100,"van":1300,"rv":3000,"motorcycle":500}'),
    (p_org, 'vehicle', 'Engine Bay Detail', 'vehicle_engine_bay', 'engine', 'flat', 75, 1, 1.5, null, null, 106, 'Safe degrease and dressing of the engine bay.', '{}');
    perform public._new_asset_services(p_org, 'vehicle');
  elsif p_type = 'watercraft' and not exists (select 1 from services where org_id = p_org and asset_type = 'watercraft') then
    insert into services (org_id, asset_type, name, guide_key, category, pricing_method, base_price, price_per_foot, est_hours, est_hours_max, recur_every, recur_unit, sort_order, description) values
    (p_org, 'watercraft', 'Wash — Level 2 (Full Hull & Deck)', 'boat_wash', 'exterior', 'per_foot', 100, 5, 2, 4, 2, 'week', 201, 'Wash hull sides, decks, non-skid and hardware.'),
    (p_org, 'watercraft', 'Oxidation Removal / Compound', 'boat_oxidation_removal', 'paint_correction', 'per_foot', 300, 25, 6, 12, null, null, 202, 'Compound and polish oxidized gelcoat.'),
    (p_org, 'watercraft', 'Wax / Sealant', 'boat_wax_sealant', 'coating', 'per_foot', 200, 15, 4, 8, 3, 'month', 203, 'Marine wax or sealant protection.'),
    (p_org, 'watercraft', 'Ceramic Coating', 'boat_ceramic_coating', 'coating', 'per_foot', 800, 60, 10, 20, 12, 'month', 204, 'Ceramic protection for gelcoat and paint.'),
    (p_org, 'watercraft', 'Interior — Level 2 (Full Interior)', 'boat_interior', 'interior', 'per_foot', 150, 8, 3, 6, 1, 'month', 205, 'Cabin, vinyl and upholstery clean with mildew treatment.'),
    (p_org, 'watercraft', 'Teak Clean & Seal', 'boat_teak_care', 'specialty', 'per_foot', 200, 10, 4, 8, 6, 'month', 206, 'Clean, brighten and seal teak decks and trim.');
    perform public._new_asset_services(p_org, 'watercraft');
  end if;
  perform public.apply_guide_checklists(p_org);
end;
$$;
revoke execute on function public.seed_asset_services(uuid, text) from public, anon, authenticated;

-- Existing companies that already work on vehicles / watercraft.
do $$
declare r record;
begin
  for r in select distinct org_id, asset_type from public.services where asset_type in ('vehicle','watercraft') loop
    perform public._new_asset_services(r.org_id, r.asset_type);
    perform public.apply_guide_checklists(r.org_id);
  end loop;
end $$;

-- Marine (boat/yacht) SOPs: Level 1 wash and interior, plus specialty marine services.
-- Guides are general best practice; always follow the manufacturer's instructions and product labels/SDS, and marina, yard and environmental rules.
-- Step minutes are estimates for a typical 30 ft boat.

insert into public.service_guides (key, asset_type, title, summary, time_estimate, crew, products, tools, prep, steps, donts, quality_checks, photos) values
(
  'boat_wash_l1',
  'watercraft',
  'Wash — Level 1 (Rinse & Wipe-Down)',
  'A fast maintenance wash for boats that are washed regularly: a thorough fresh-water rinse to get salt off, spot-washing only where needed, glass and clear vinyl cleaned, and everything chamoised dry so it does not spot. Sell it weekly or after every outing on a maintenance plan; move up to Level 2 (Full Hull & Deck) when the boat has gone more than a couple of weeks or the non-skid needs scrubbing.',
  'Under 25 ft 30–60 min · 25–40 ft 1–2 h · 40 ft+ 2–3 h',
  '1–2 technicians',
  array['Biodegradable marine boat soap (wax-safe)', 'Salt-removal wash additive (optional)', 'Marine glass/isinglass cleaner (vinyl window safe)', 'Marine quick detailer / spray wax (gelcoat-safe)']::text[],
  array['Hose with adjustable shower/fan nozzle and fresh water supply', 'Soft deck brush on extension pole', 'Microfiber wash mitt', 'Bucket with grit guard', 'Synthetic chamois and soft silicone water blade', 'Color-coded microfiber towels (gelcoat, glass/clear vinyl, stainless)']::text[],
  array['Confirm marina/yard rules for washing, chemicals and runoff before starting; use containment and biodegradable products where required', 'Walk the vessel with the owner, note and photograph existing damage, gelcoat cracks and stains', 'Secure the boat (lines doubled at the dock or properly blocked/stand-supported on the hard), and use non-slip footwear', 'Close hatches and ports and protect electronics, helm displays and open electrical panels', 'Confirm the scope is a Level 1 rinse and wipe-down, and agree when the owner plans to use the boat next']::text[],
  '[
  {
    "title": "Walk vessel & note anything new",
    "detail": "Walk the boat dock-side and aboard, comparing it to the last visit. Photograph any new scrapes, stains, loose hardware or fender marks and note them on the work order.",
    "caution": "Report new damage, water in the bilge or chafed dock lines to the owner before you start.",
    "minutes": 5,
    "products": []
  },
  {
    "title": "Board safely & check marina rules",
    "detail": "Confirm the marina allows washing at the slip and what soap is permitted. Board using the dock step, handholds and three points of contact; pass tools aboard rather than carrying them across the gap.",
    "caution": "Docks and decks are slippery when wet. Never step across a widening gap or board with your hands full. Wear non-slip soles.",
    "minutes": 5,
    "products": []
  },
  {
    "title": "Close hatches & protect electronics",
    "detail": "Close hatches, ports and vents, zip enclosure panels, and cover helm displays and any open switch panels.",
    "caution": null,
    "minutes": 5,
    "products": []
  },
  {
    "title": "Fresh-water rinse top-down",
    "detail": "Rinse from the highest point (hardtop, arch, radar mount) down to the waterline to flush salt and loose dirt off canvas, hardware, glass and gelcoat. Rinse into stainless fittings, cleat bases and scuppers where salt collects.",
    "caution": "Use a shower or fan pattern, not a jet, on canvas seams, isinglass and around vents and electrical fittings.",
    "minutes": 15,
    "products": []
  },
  {
    "title": "Spot-wash only where needed",
    "detail": "Wash bird droppings, fish blood, footprints and exhaust marks with a mitt and marine soap mixed per label (add the salt-removal additive in heavy salt). Rinse each area before it dries.",
    "caution": "Only biodegradable marine soap where runoff reaches the water; never household detergents.",
    "minutes": 20,
    "products": [
      "Biodegradable marine boat soap (wax-safe)",
      "Salt-removal wash additive (optional)"
    ]
  },
  {
    "title": "Wipe down seating & hardware",
    "detail": "Wipe vinyl seats, helm, rails and cleats with a clean damp microfiber to remove salt film missed by the rinse.",
    "caution": null,
    "minutes": 10,
    "products": []
  },
  {
    "title": "Clean glass & clear vinyl",
    "detail": "Rinse clear vinyl again, then clean windshields, glass and isinglass with the vinyl-safe cleaner on a dedicated soft microfiber, in straight lines.",
    "caution": "Never wipe isinglass dry or with a dirty towel; salt and grit scratch it permanently.",
    "minutes": 10,
    "products": [
      "Marine glass/isinglass cleaner (vinyl window safe)"
    ]
  },
  {
    "title": "Chamois & water-blade dry",
    "detail": "Dry gelcoat, stainless and glass top-down with a chamois or soft water blade to prevent water spots. Finish stainless with a dry microfiber.",
    "caution": "Dry from stable footing inside the rails. Never lean over lifelines or stand on gunwales or swim platforms in a wake.",
    "minutes": 20,
    "products": []
  },
  {
    "title": "Spot-touch with quick detailer",
    "detail": "Mist quick detailer on any remaining water spots or smudges on smooth gelcoat and stainless and buff off.",
    "caution": "Keep detailer and spray wax off non-skid, steps and swim platforms; it makes them slippery.",
    "minutes": 5,
    "products": [
      "Marine quick detailer / spray wax (gelcoat-safe)"
    ]
  },
  {
    "title": "Final walk-through & photos",
    "detail": "Reopen what the owner leaves open, coil the hose, check lines and fenders are as found and take after photos.",
    "caution": null,
    "minutes": 5,
    "products": []
  }
]'::jsonb,
  array['Never use non-biodegradable or household soap where runoff reaches the water', 'Never dry-wipe isinglass or use ammonia glass cleaner on clear vinyl', 'Never let soap or salt water dry on gelcoat, glass or stainless in the sun', 'Never aim a jet of water into vents, electrical fittings or canvas seams', 'Never apply spray wax or detailer to non-skid, steps or the swim platform', 'Never lean over lifelines or work from the gunwale to reach the hull']::text[],
  array['No salt film on glass, stainless or vinyl when wiped with a clean dark towel', 'No water spots on gelcoat, glass or stainless', 'Isinglass clear and unscratched', 'Non-skid not slippery and free of detailer overspray', 'Hatches, enclosure panels and covers back as the owner left them']::text[],
  array['Before: bow, stern, port and starboard', 'Before: close-ups of any new damage or stains', 'After: same four angles', 'After: helm, windshield and clear vinyl']::text[]
),
(
  'boat_interior_l1',
  'watercraft',
  'Interior — Level 1 (Quick Clean)',
  'A quick reset of the cockpit and cabin between outings: trash out, vacuum, vinyl and hard surfaces wiped, head and galley sanitized, glass cleaned and sun-exposed vinyl protected. Sell it with the Level 1 wash on a maintenance plan or after charters; upgrade to Level 2 (Full Interior) for deep cleaning, extraction or established mildew.',
  'Under 25 ft (cockpit) 30–60 min · 25–40 ft 1.5–2.5 h · 40 ft+ 2.5–4 h',
  '1–2 technicians',
  array['Marine vinyl cleaner (pH-neutral)', 'Mildew cleaner safe for marine vinyl (spot use)', 'Marine-safe disinfectant for heads and galley', 'Marine glass/isinglass cleaner (vinyl window safe)', 'Marine vinyl UV protectant (non-greasy)']::text[],
  array['Shop vacuum with crevice and upholstery tools (cordless or GFCI-protected)', 'Color-coded microfiber towels (vinyl, head, galley, glass)', 'Soft upholstery brush', 'Detail brushes for seams and tracks', 'Trash bags', 'Nitrile gloves']::text[],
  array['Confirm marina/yard rules for washing, chemicals and runoff before starting; use containment and biodegradable products where required', 'Walk the vessel with the owner, note and photograph existing damage, gelcoat cracks and stains', 'Secure the boat (lines doubled at the dock or properly blocked/stand-supported on the hard), and use non-slip footwear', 'Close hatches and ports and protect electronics, helm displays and open electrical panels', 'Confirm the scope (Level 1 Quick Clean) and any areas the owner wants left untouched, such as personal lockers or the engine room']::text[],
  '[
  {
    "title": "Confirm scope & photograph as found",
    "detail": "Confirm what is included and photograph the cockpit, salon, cabins, head and galley as found, noting stains, tears and mildew.",
    "caution": null,
    "minutes": 5,
    "products": []
  },
  {
    "title": "Ventilate & set up power safely",
    "detail": "Open hatches and ports for airflow. Plug the vacuum into a GFCI-protected outlet and route cords so they do not cross walkways or hang over the side.",
    "caution": "Keep cords and tools away from water. Never run shore power cords through standing water or leave them across companionway steps.",
    "minutes": 5,
    "products": []
  },
  {
    "title": "Remove trash & declutter",
    "detail": "Bag trash, empty galley and head bins and set loose items aside neatly. Do not open private lockers or move personal items beyond what the job needs.",
    "caution": null,
    "minutes": 10,
    "products": []
  },
  {
    "title": "Dry dust & vacuum",
    "detail": "Dust top-down, then vacuum cushions, seams, carpets, lockers and cockpit drains or tracks with crevice tools.",
    "caution": null,
    "minutes": 25,
    "products": []
  },
  {
    "title": "Wipe vinyl seating & cockpit upholstery",
    "detail": "Wipe vinyl with marine vinyl cleaner on a microfiber, using a soft brush on textured areas and seams. Spot-treat small mildew spots with the vinyl-safe mildew cleaner and wipe clean.",
    "caution": "No bleach, ammonia or solvents on marine vinyl or stitching. Spot test first.",
    "minutes": 20,
    "products": [
      "Marine vinyl cleaner (pH-neutral)",
      "Mildew cleaner safe for marine vinyl (spot use)"
    ]
  },
  {
    "title": "Sanitize head & galley",
    "detail": "Wear gloves. Clean and disinfect the head, sink, counters, galley surfaces and handles with marine-safe disinfectant, observing the dwell time on the label.",
    "caution": "Never mix cleaning chemicals. Do not pour cleaners into the head or holding tank unless they are labeled holding-tank safe.",
    "minutes": 20,
    "products": [
      "Marine-safe disinfectant for heads and galley"
    ]
  },
  {
    "title": "Clean glass, mirrors & interior clear vinyl",
    "detail": "Clean ports, mirrors and the inside of clear vinyl panels with the vinyl-safe cleaner on a dedicated soft microfiber.",
    "caution": "Never dry-wipe isinglass.",
    "minutes": 10,
    "products": [
      "Marine glass/isinglass cleaner (vinyl window safe)"
    ]
  },
  {
    "title": "Protect sun-exposed vinyl",
    "detail": "Apply UV protectant to cockpit seats and bolsters and buff completely dry.",
    "caution": "Leave no greasy residue on seats, steps or handholds. Keep protectant off non-skid and companionway steps.",
    "minutes": 10,
    "products": [
      "Marine vinyl UV protectant (non-greasy)"
    ]
  },
  {
    "title": "Reset cabin & close up",
    "detail": "Return cushions and items to where they were, check the bilge pump and ventilation are as found and close hatches unless the owner wants them open.",
    "caution": null,
    "minutes": 5,
    "products": []
  },
  {
    "title": "Final walk-through & photos",
    "detail": "Walk every space, remove all tools and towels and take after photos.",
    "caution": null,
    "minutes": 5,
    "products": []
  }
]'::jsonb,
  array['Never use bleach, ammonia, solvents or magic erasers on marine vinyl or stitching', 'Never mix cleaning chemicals, especially in the confined head', 'Never pour non-approved cleaners into the head or holding tank', 'Never leave greasy protectant on seats, steps or handholds', 'Never open private lockers or move personal items without permission', 'Never route power cords through water or across walkways']::text[],
  array['No trash, crumbs or sand in seams, lockers or drains', 'Vinyl clean and dry with no slippery residue', 'Head and galley surfaces sanitized and odor-free', 'Glass and clear vinyl streak-free', 'Cushions and items back in place and the boat closed up as the owner left it']::text[],
  array['Before: cockpit and salon', 'Before: head and galley', 'After: cockpit and salon', 'After: head and galley', 'Close-ups of any tears, stains or mildew found']::text[]
),
(
  'boat_nonskid',
  'watercraft',
  'Non-skid Deck Deep Clean',
  'Deep cleaning of molded non-skid decks, which trap dirt, mildew and footprints that a normal wash leaves behind. Done with a dedicated non-skid cleaner and a stiff brush in a cross-hatch pattern, then rinsed until the pattern is clean and grippy again. Sell it seasonally, at spring commissioning, before a sale or as an add-on when the decks look grey.',
  'Under 25 ft 45–90 min · 25–40 ft 1.5–3 h · 40 ft+ 3–5 h',
  '1–2 technicians',
  array['Non-skid deck cleaner (biodegradable)', 'Mildew/stain remover safe for gelcoat', 'Biodegradable marine boat soap (wax-safe)', 'Non-skid protectant (labeled non-slip, optional)']::text[],
  array['Stiff and medium deck brushes on extension poles', 'Hand detail brush for corners, edges and around hardware', 'Hose with adjustable nozzle', 'Buckets', 'Squeegee or soft water blade', 'Microfiber towels', 'Plastic sheeting or tape to protect teak and canvas']::text[],
  array['Confirm marina/yard rules for washing, chemicals and runoff before starting; use containment and biodegradable products where required', 'Walk the vessel with the owner, note and photograph existing damage, gelcoat cracks and stains', 'Secure the boat (lines doubled at the dock or properly blocked/stand-supported on the hard), and use non-slip footwear', 'Close hatches and ports and protect electronics, helm displays and open electrical panels', 'Remove cushions, lines, fenders and loose gear from the deck so the whole surface can be reached', 'Plan the work so you always scrub back toward a safe exit, never toward an open transom, gate or gunwale']::text[],
  '[
  {
    "title": "Inspect & photograph non-skid",
    "detail": "Photograph each deck area showing grey or dirty non-skid, mildew, rust drips and stains. Note any soft spots, cracks or lifting hardware and tell the owner.",
    "caution": null,
    "minutes": 5,
    "products": []
  },
  {
    "title": "Clear deck & protect adjacent surfaces",
    "detail": "Remove cushions and gear. Cover or tape off teak, canvas and any surface the cleaner should not touch.",
    "caution": null,
    "minutes": 10,
    "products": []
  },
  {
    "title": "Pre-rinse & cool the deck",
    "detail": "Rinse the deck thoroughly with fresh water to cool it and loosen dirt. Work in shade or early in the day.",
    "caution": "Never apply cleaner to a hot deck in direct sun; it dries in the pattern and leaves streaks.",
    "minutes": 5,
    "products": []
  },
  {
    "title": "Apply non-skid cleaner in sections",
    "detail": "Apply cleaner diluted per label to one manageable section at a time and let it dwell; keep it wet.",
    "caution": "Wet, soapy non-skid is very slippery. Stay inside the rails, work backward toward a safe exit and keep one hand for the boat.",
    "minutes": 10,
    "products": [
      "Non-skid deck cleaner (biodegradable)"
    ]
  },
  {
    "title": "Scrub in two directions with stiff brush",
    "detail": "Scrub each section with the stiff brush in one direction, then at 90 degrees (cross-hatch) so the bristles reach both sides of the pattern. Let the brush do the work; use the medium brush on worn or shallow non-skid and the detail brush along edges and around hardware.",
    "caution": "Use stiff brushes only on non-skid; they scratch smooth gelcoat.",
    "minutes": 40,
    "products": [
      "Non-skid deck cleaner (biodegradable)"
    ]
  },
  {
    "title": "Treat stubborn stains & mildew",
    "detail": "Spot-treat remaining mildew, rust drips or stains with the gelcoat-safe stain remover, agitate with the detail brush and rinse.",
    "caution": "Test first. Keep stain remover off teak, metal and canvas.",
    "minutes": 15,
    "products": [
      "Mildew/stain remover safe for gelcoat"
    ]
  },
  {
    "title": "Rinse thoroughly",
    "detail": "Flood-rinse each section until no suds remain in the pattern, working toward the scuppers. Check the scuppers and drains are clear and flowing.",
    "caution": "Runoff must meet marina rules; contain it if required.",
    "minutes": 15,
    "products": []
  },
  {
    "title": "Wash adjacent smooth gelcoat",
    "detail": "Wash and rinse the smooth gelcoat borders, coamings and toe rails that caught overspray or drips, using marine soap and a soft mitt.",
    "caution": null,
    "minutes": 10,
    "products": [
      "Biodegradable marine boat soap (wax-safe)"
    ]
  },
  {
    "title": "Dry, inspect & optional non-slip protectant",
    "detail": "Squeegee standing water and inspect the pattern in good light; re-scrub any grey areas. If the owner wants protection, apply only a product labeled for non-skid and non-slip, per label.",
    "caution": "Never wax, polish or apply silicone dressing to non-skid; it creates a serious slip hazard.",
    "minutes": 10,
    "products": [
      "Non-skid protectant (labeled non-slip, optional)"
    ]
  },
  {
    "title": "Restore gear & final photos",
    "detail": "Remove protection, return cushions and gear once the deck is dry and take after photos from the same angles.",
    "caution": null,
    "minutes": 5,
    "products": []
  }
]'::jsonb,
  array['Never wax, polish or use silicone dressings on non-skid', 'Never use stiff brushes on smooth gelcoat, vinyl or clear vinyl', 'Never apply cleaner to a hot deck in direct sun', 'Never use bleach-based or non-biodegradable cleaners where runoff reaches the water', 'Never scrub toward an open transom, gate or gunwale edge', 'Never pressure-wash non-skid near caulked seams, hatches or deck hardware']::text[],
  array['Non-skid pattern uniformly clean with no grey patches when wet and dry', 'No cleaner residue or suds left in the pattern', 'Non-skid grippy underfoot, with no slippery product on it', 'Scuppers and drains clear', 'Adjacent smooth gelcoat, teak and canvas clean and undamaged']::text[],
  array['Before: foredeck, side decks and cockpit sole', 'Before: close-up of dirty pattern and stains', 'After: same areas and angles', 'After: close-up of cleaned pattern']::text[]
),
(
  'boat_metal_polish',
  'watercraft',
  'Metal & Stainless Polish',
  'Removing tea staining and surface rust from stainless rails, stanchions, cleats and fittings, polishing them to a bright finish and sealing them so salt does not re-stain them quickly. Anodized and painted metal is cleaned, never cut. Sell it seasonally and as an add-on to any wash for boats in salt water.',
  'Under 25 ft 1–2 h · 25–40 ft 2–4 h · 40 ft+ 4–8 h',
  '1–2 technicians',
  array['Biodegradable marine boat soap (wax-safe)', 'Low-tack marine masking tape', 'Stainless rust / tea-stain remover (acid-based gel)', 'Marine metal polish for stainless steel (light-cut)', 'Aluminum-safe non-abrasive cleaner (for anodized parts)', 'Marine metal protectant / sealant']::text[],
  array['Microfiber applicator pads', 'Dedicated microfiber towels for metal (do not reuse on gelcoat)', 'Soft nylon detail brushes', 'Cotton swabs and foam detail tips for tight spots', 'Small DA polisher with foam pad (optional, for long straight rails)', 'Nitrile gloves and safety glasses', 'Drop towels to protect deck and gelcoat']::text[],
  array['Confirm marina/yard rules for washing, chemicals and runoff before starting; use containment and biodegradable products where required', 'Walk the vessel with the owner, note and photograph existing damage, gelcoat cracks and stains', 'Secure the boat (lines doubled at the dock or properly blocked/stand-supported on the hard), and use non-slip footwear', 'Close hatches and ports and protect electronics, helm displays and open electrical panels', 'Identify each metal and finish (stainless, chrome, polished aluminum, anodized aluminum, bronze, painted) before choosing products', 'Have the SDS for the rust/tea-stain remover on hand and confirm the marina allows it']::text[],
  '[
  {
    "title": "Photograph metal condition",
    "detail": "Photograph rails, stanchions, cleats, bow roller, windlass, hinges and fittings showing tea staining, rust bleed and pitting.",
    "caution": null,
    "minutes": 5,
    "products": []
  },
  {
    "title": "Identify metals & finishes",
    "detail": "Sort each part into stainless, chrome, polished aluminum, anodized aluminum or painted, and note pitted or welded areas that will not polish out.",
    "caution": "Anodized aluminum (most T-tops, windshield frames and tracks) must never be polished with abrasives; it removes the anodized layer permanently.",
    "minutes": 5,
    "products": []
  },
  {
    "title": "Wash & dry hardware",
    "detail": "Wash the metal with marine soap to remove salt and grit, rinse and dry so the polish is not grinding salt into the surface.",
    "caution": null,
    "minutes": 10,
    "products": [
      "Biodegradable marine boat soap (wax-safe)"
    ]
  },
  {
    "title": "Mask adjacent gelcoat, canvas & teak",
    "detail": "Tape off gelcoat around bases, canvas snaps, teak and decals, and lay towels where drips could land.",
    "caution": "Rust removers stain teak and can dull gelcoat; polish residue marks canvas.",
    "minutes": 10,
    "products": [
      "Low-tack marine masking tape"
    ]
  },
  {
    "title": "Remove tea staining & rust bleed",
    "detail": "Wearing gloves and eye protection, apply the tea-stain remover to stained stainless with a brush or applicator, dwell per label and agitate with a soft nylon brush.",
    "caution": "Keep acid gel off anodized aluminum, painted parts, gelcoat and teak and do not let it drip into the water. Never mix it with other chemicals.",
    "minutes": 20,
    "products": [
      "Stainless rust / tea-stain remover (acid-based gel)"
    ]
  },
  {
    "title": "Rinse treated areas",
    "detail": "Rinse treated metal and anything beneath it thoroughly with fresh water and dry.",
    "caution": null,
    "minutes": 5,
    "products": []
  },
  {
    "title": "Polish stainless rails, cleats & fittings",
    "detail": "Polish stainless with light-cut metal polish on an applicator, in short overlapping strokes along the grain, working into cleat bases and weld joints with swabs. Use the small DA with a foam pad on long straight rails if available.",
    "caution": "Keep your feet inside the lifelines and do not hang your weight on rails or stanchions while polishing; they are not rated for it.",
    "minutes": 40,
    "products": [
      "Marine metal polish for stainless steel (light-cut)"
    ]
  },
  {
    "title": "Clean anodized & painted metal",
    "detail": "Clean anodized aluminum, T-top frames and painted parts with a non-abrasive aluminum-safe cleaner on a soft microfiber only.",
    "caution": "No metal polish, compound or abrasive pads on anodized or painted surfaces.",
    "minutes": 10,
    "products": [
      "Aluminum-safe non-abrasive cleaner (for anodized parts)"
    ]
  },
  {
    "title": "Buff off residue from crevices",
    "detail": "Buff all polish residue off with a clean microfiber and clear black residue from fasteners, seams and cleat bases with swabs.",
    "caution": null,
    "minutes": 10,
    "products": []
  },
  {
    "title": "Apply metal protectant",
    "detail": "Apply a thin coat of marine metal protectant to polished stainless and buff per label to slow re-staining.",
    "caution": "Keep protectant off non-skid, steps and grab-rail grip areas where it could make them slippery.",
    "minutes": 10,
    "products": [
      "Marine metal protectant / sealant"
    ]
  },
  {
    "title": "Remove tape & final inspection",
    "detail": "Remove tape slowly, wipe any residue from gelcoat and take after photos of the same fittings.",
    "caution": null,
    "minutes": 5,
    "products": []
  }
]'::jsonb,
  array['Never use abrasive polish, compound or scouring pads on anodized aluminum or painted metal', 'Never use steel wool or carbon-steel brushes on stainless; they leave particles that rust', 'Never let acid rust remover drip into the water or onto teak, gelcoat or canvas', 'Never hang your weight on rails, stanchions or lifelines', 'Never leave polish residue in fasteners, seams or on canvas', 'Never apply protectant to grip areas, steps or non-skid']::text[],
  array['Stainless bright and uniform with no tea staining when viewed in daylight', 'No black polish residue in fasteners, seams or cleat bases', 'Anodized surfaces clean, even and undamaged', 'Gelcoat, teak and canvas around fittings unstained', 'Protectant evenly applied and not greasy to the touch']::text[],
  array['Before: bow rail and pulpit', 'Before: close-ups of tea staining and rust bleed', 'After: same rails and fittings', 'After: close-ups of the same stained spots']::text[]
),
(
  'boat_canvas_isinglass',
  'watercraft',
  'Canvas & Clear Vinyl (Isinglass) Care',
  'Cleaning and protecting bimini tops, enclosures, covers and clear vinyl windows: clear vinyl is flooded and washed with dedicated cleaners, never wiped dry, then protected; canvas is cleaned, rinsed and re-treated with water repellent; zippers and snaps are cleaned and lubricated. Sell it at spring commissioning, mid-season and before winter storage; replacing canvas is expensive and owners know it.',
  'Under 25 ft 1–2 h · 25–40 ft 2–4 h · 40 ft+ 4–6 h (plus drying time before water repellent)',
  '1–2 technicians',
  array['Mild marine soap (biodegradable)', 'Isinglass / clear vinyl cleaner (ammonia-free)', 'Isinglass / clear vinyl protectant with UV inhibitors', 'Canvas cleaner for solution-dyed acrylic', 'Fabric water-repellent / UV treatment for marine canvas', 'Zipper and snap lubricant (dry or wax type)']::text[],
  array['Hose with gentle shower nozzle', 'Ultra-soft microfiber towels dedicated to clear vinyl', 'Soft-bristle canvas brush', 'Soft toothbrush-type brush for zippers and snaps', 'Buckets', 'Clean tarp or padded surface for removed panels', 'Plastic sheeting and tape to mask against repellent overspray', 'Step stool or stable platform']::text[],
  array['Confirm marina/yard rules for washing, chemicals and runoff before starting; use containment and biodegradable products where required', 'Walk the vessel with the owner, note and photograph existing damage, gelcoat cracks and stains', 'Secure the boat (lines doubled at the dock or properly blocked/stand-supported on the hard), and use non-slip footwear', 'Close hatches and ports and protect electronics, helm displays and open electrical panels', 'Agree with the owner whether panels are cleaned in place or removed, and note the order they come off', 'Check the weather; avoid repellent application in wind, rain or when temperatures are outside the label range']::text[],
  '[
  {
    "title": "Inspect & photograph canvas and clear panels",
    "detail": "Photograph every panel, noting tears, worn stitching, cloudy or cracked clear vinyl, stuck zippers, missing snaps and mildew.",
    "caution": "Report worn stitching and cracked clear vinyl; do not attempt repairs.",
    "minutes": 5,
    "products": []
  },
  {
    "title": "Remove panels or prepare to clean in place",
    "detail": "If removing, unzip panels gently, roll (never fold) clear vinyl with a towel between layers and lay panels on a clean tarp. Note the order so they go back the same way.",
    "caution": "Panels catch the wind and can go overboard. Do not stand on gunwales, seats or the console to reach the top; use a stable step. Cold clear vinyl cracks if folded.",
    "minutes": 5,
    "products": []
  },
  {
    "title": "Flood-rinse clear vinyl",
    "detail": "Flood both sides of the clear vinyl with fresh water to float off salt and grit before anything touches it.",
    "caution": "Never dry-wipe isinglass; salt crystals and dust scratch it permanently.",
    "minutes": 5,
    "products": []
  },
  {
    "title": "Wash clear vinyl",
    "detail": "Wash with mild soapy water, then the ammonia-free clear vinyl cleaner, using a dedicated ultra-soft microfiber in straight lines with light pressure. Rinse and blot dry.",
    "caution": "No ammonia, alcohol, household glass cleaner, paper towels or squeegees on clear vinyl.",
    "minutes": 15,
    "products": [
      "Mild marine soap (biodegradable)",
      "Isinglass / clear vinyl cleaner (ammonia-free)"
    ]
  },
  {
    "title": "Pre-rinse canvas",
    "detail": "Rinse the canvas thoroughly to remove loose dirt and salt and to wet the fabric evenly.",
    "caution": null,
    "minutes": 5,
    "products": []
  },
  {
    "title": "Clean canvas",
    "detail": "Apply canvas cleaner per label (or mild soap for light soil) and scrub gently with the soft brush in the direction of the weave. Treat mildew spots with the canvas cleaner, not bleach.",
    "caution": "No bleach unless the canvas maker approves it, and never on thread. No pressure washer; it strips the factory water repellent and damages stitching.",
    "minutes": 25,
    "products": [
      "Canvas cleaner for solution-dyed acrylic",
      "Mild marine soap (biodegradable)"
    ]
  },
  {
    "title": "Rinse canvas completely",
    "detail": "Rinse until no suds remain; leftover cleaner attracts dirt and stops the repellent from bonding.",
    "caution": null,
    "minutes": 10,
    "products": []
  },
  {
    "title": "Air-dry fully",
    "detail": "Let the canvas dry completely in the air, stretched in place or laid flat; work on zippers and clear vinyl meanwhile.",
    "caution": "Do not machine-dry canvas or put away clear vinyl while wet.",
    "minutes": 30,
    "products": []
  },
  {
    "title": "Apply water repellent to canvas",
    "detail": "Mask clear vinyl, gelcoat and deck, then spray an even wet coat of repellent on the dry canvas, overlapping passes, and allow cure time per label.",
    "caution": "Repellent overspray on non-skid or gelcoat is slippery; mask and wipe any overspray at once. Do not apply in wind or in an enclosed cabin without ventilation.",
    "minutes": 15,
    "products": [
      "Fabric water-repellent / UV treatment for marine canvas"
    ]
  },
  {
    "title": "Protect clear vinyl",
    "detail": "Apply UV protectant to the clean, dry clear vinyl with a fresh soft microfiber and buff lightly.",
    "caution": null,
    "minutes": 10,
    "products": [
      "Isinglass / clear vinyl protectant with UV inhibitors"
    ]
  },
  {
    "title": "Clean & lubricate zippers and snaps",
    "detail": "Brush salt and dirt out of zipper teeth and snaps with mild soapy water, rinse, dry and apply zipper/snap lubricant. Work each zipper gently full length.",
    "caution": "Never force a zipper under tension; release the panel tension first or the zipper and stitching tear.",
    "minutes": 15,
    "products": [
      "Mild marine soap (biodegradable)",
      "Zipper and snap lubricant (dry or wax type)"
    ]
  },
  {
    "title": "Reinstall & final photos",
    "detail": "Reinstall panels in the noted order, check every zipper and snap closes and take after photos.",
    "caution": null,
    "minutes": 10,
    "products": []
  }
]'::jsonb,
  array['Never dry-wipe clear vinyl or wipe it with paper towels', 'Never use ammonia, alcohol or household glass cleaner on clear vinyl', 'Never fold clear vinyl, especially when cold', 'Never pressure-wash canvas or clear vinyl', 'Never use bleach on canvas thread or without the canvas maker''s approval', 'Never force a zipper that is under tension', 'Never leave repellent overspray on non-skid or gelcoat']::text[],
  array['Clear vinyl transparent and streak-free with no new scratches', 'Canvas color even with no mildew spots or soap residue', 'Water beads on the treated canvas', 'Every zipper and snap opens and closes smoothly', 'No repellent overspray on clear vinyl, gelcoat or deck']::text[],
  array['Before: full enclosure or bimini from outside', 'Before: close-ups of cloudy clear vinyl, mildew and stuck zippers', 'After: same angles', 'After: water beading on treated canvas']::text[]
),
(
  'boat_waterline_stain',
  'watercraft',
  'Waterline / Scum Line Stain Removal',
  'Removing the yellow-brown scum line, tannin and rust staining along the waterline and transom with an acid-based (oxalic) hull cleaner, rinsing it off completely and re-protecting the gelcoat so it stays clean longer. Done with full chemical PPE and in line with marina and environmental rules, ideally with the boat on a trailer, lift or the hard. Sell it as an add-on to any wash or wax, and at haul-out.',
  'Under 25 ft 1–1.5 h · 25–40 ft 1.5–3 h · 40 ft+ 3–5 h',
  '1–2 technicians',
  array['Biodegradable marine boat soap (wax-safe)', 'Marine masking tape', 'Acid-based hull stain remover (oxalic acid gel or spray)', 'Neutralizing rinse (per cleaner label)', 'Marine wax or sealant']::text[],
  array['Chemical-resistant gloves (nitrile or neoprene), splash goggles and face shield', 'Long sleeves or chemical apron', 'Acid-resistant pump sprayer or foam applicator', 'Soft brush and non-scratch pads', 'Hose with adjustable nozzle', 'Containment tarp or wash pad with water capture (on the hard)', 'Stable work float or dinghy with PFD if the boat is in the water and the marina allows it']::text[],
  array['Confirm marina/yard rules for washing, chemicals and runoff before starting; use containment and biodegradable products where required', 'Walk the vessel with the owner, note and photograph existing damage, gelcoat cracks and stains', 'Secure the boat (lines doubled at the dock or properly blocked/stand-supported on the hard), and use non-slip footwear', 'Close hatches and ports and protect electronics, helm displays and open electrical panels', 'Read the hull cleaner SDS and confirm with the marina/yard that acid hull cleaners are allowed; many prohibit their use where runoff enters the water', 'Prefer working with the boat on a trailer, lift or the hard so runoff can be captured', 'If working from a float or dinghy, wear a PFD, secure the float and never work alone']::text[],
  '[
  {
    "title": "Photograph waterline & stains",
    "detail": "Photograph the scum line, transom, exhaust stains and rust streaks on both sides and the bow.",
    "caution": null,
    "minutes": 5,
    "products": []
  },
  {
    "title": "Review SDS & environmental rules",
    "detail": "Read the cleaner label and SDS for dilution, dwell time and PPE, and confirm where runoff may go. If the boat is in the water and acid cleaners are not allowed, reschedule for a lift, trailer or haul-out.",
    "caution": "Acid hull cleaners can harm aquatic life; follow local discharge rules and marina policy every time.",
    "minutes": 5,
    "products": []
  },
  {
    "title": "Put on PPE & set containment",
    "detail": "Put on chemical gloves, splash goggles, face shield and long sleeves. Lay the containment tarp or move to the wash pad.",
    "caution": "Oxalic acid is toxic and a severe eye irritant. Eye protection is mandatory, especially when working at or above head height.",
    "minutes": 10,
    "products": []
  },
  {
    "title": "Pre-wash the stained band",
    "detail": "Wash the waterline band with marine soap and rinse to remove salt, slime and loose dirt so the acid works on the stain only.",
    "caution": null,
    "minutes": 10,
    "products": [
      "Biodegradable marine boat soap (wax-safe)"
    ]
  },
  {
    "title": "Mask metal, paint & graphics",
    "detail": "Tape over aluminum, anodized trim, bronze through-hulls, painted surfaces, boot stripe vinyl and decals near the work area.",
    "caution": "Acid hull cleaners etch or discolor aluminum, anodized and painted surfaces. Keep them off bottom paint.",
    "minutes": 10,
    "products": [
      "Marine masking tape"
    ]
  },
  {
    "title": "Apply hull cleaner in sections",
    "detail": "Apply the cleaner to a 3–4 ft section at a time, working from the bottom of the stain upward so drips do not streak clean gelcoat.",
    "caution": "Never mix acid cleaners with bleach or other chemicals. Do not let the product dry on the hull.",
    "minutes": 15,
    "products": [
      "Acid-based hull stain remover (oxalic acid gel or spray)"
    ]
  },
  {
    "title": "Agitate lightly & observe dwell time",
    "detail": "Agitate lightly with a soft brush or non-scratch pad and leave it for the labeled dwell time while the stain lifts.",
    "caution": null,
    "minutes": 15,
    "products": [
      "Acid-based hull stain remover (oxalic acid gel or spray)"
    ]
  },
  {
    "title": "Rinse & neutralize thoroughly",
    "detail": "Rinse each section with plenty of fresh water from the top down, then apply the neutralizing rinse if the label calls for it, and rinse again.",
    "caution": "Residual acid keeps etching and will stain metal below it. Rinse longer than seems necessary.",
    "minutes": 15,
    "products": [
      "Neutralizing rinse (per cleaner label)"
    ]
  },
  {
    "title": "Inspect & repeat where needed",
    "detail": "Inspect in good light. Re-treat any remaining stain rather than scrubbing harder.",
    "caution": null,
    "minutes": 15,
    "products": [
      "Acid-based hull stain remover (oxalic acid gel or spray)"
    ]
  },
  {
    "title": "Wash & dry the treated area",
    "detail": "Wash the treated band with marine soap, rinse and dry so the surface is ready for protection.",
    "caution": null,
    "minutes": 10,
    "products": [
      "Biodegradable marine boat soap (wax-safe)"
    ]
  },
  {
    "title": "Protect with wax or sealant",
    "detail": "Acid strips existing wax, so apply marine wax or sealant to the treated gelcoat and buff off per label.",
    "caution": "Keep wax off bottom paint and transducer faces.",
    "minutes": 30,
    "products": [
      "Marine wax or sealant"
    ]
  },
  {
    "title": "Remove tape, clean up & final photos",
    "detail": "Remove tape, collect the containment tarp and dispose of residue per the SDS and marina rules, and take after photos from the same angles.",
    "caution": null,
    "minutes": 5,
    "products": []
  }
]'::jsonb,
  array['Never use acid hull cleaners without gloves and eye protection', 'Never let acid cleaner run into the water where marina or local rules prohibit it', 'Never let acid cleaner touch aluminum, anodized, painted surfaces or bottom paint', 'Never mix acid cleaners with bleach or other chemicals', 'Never let the cleaner dry on the hull', 'Never use abrasive pads or compound to scrub out a stain the acid can lift', 'Never work from a float or dinghy without a PFD and a second person']::text[],
  array['Waterline and transom stain-free and color-matched to surrounding gelcoat', 'No streaks or drip marks below the treated band', 'No etching or discoloration on metal, trim or graphics', 'All acid rinsed off and neutralized per label', 'Treated gelcoat protected with wax or sealant']::text[],
  array['Before: port and starboard waterline', 'Before: transom and exhaust stains', 'After: same angles', 'After: close-up of treated waterline next to untreated reference area, if any']::text[]
),
(
  'boat_vinyl_mildew',
  'watercraft',
  'Vinyl Upholstery Mildew Treatment',
  'Removing mildew and grime from marine vinyl seats, bolsters and cushions with bleach-free, stitching-safe products, drying them completely and finishing with UV protection to slow its return. Pink staining caused by bacteria may be permanent and is flagged before work begins. Sell it at spring commissioning, after storage and for boats that sit closed up.',
  'Under 25 ft 1–2 h · 25–40 ft 2–4 h · 40 ft+ 4–6 h',
  '1–2 technicians',
  array['Marine vinyl cleaner (pH-neutral)', 'Marine vinyl mildew remover (bleach-free, stitching-safe)', 'Enzyme odor treatment safe for marine vinyl', 'Marine vinyl UV protectant (non-greasy)']::text[],
  array['Soft-bristle upholstery brush', 'Medium nylon brush (textured vinyl only)', 'Detail brush and swabs for seams and piping', 'Microfiber towels', 'Labeled spray bottles', 'Wet/dry vacuum', 'Fans or dehumidifier', 'Nitrile gloves, eye protection and a particulate mask for heavy mildew']::text[],
  array['Confirm marina/yard rules for washing, chemicals and runoff before starting; use containment and biodegradable products where required', 'Walk the vessel with the owner, note and photograph existing damage, gelcoat cracks and stains', 'Secure the boat (lines doubled at the dock or properly blocked/stand-supported on the hard), and use non-slip footwear', 'Close hatches and ports and protect electronics, helm displays and open electrical panels', 'Tell the owner before starting that pink or deep-set staining may not come out fully', 'Choose a clean, shaded, sheltered spot on deck or the dock to work on removed cushions']::text[],
  '[
  {
    "title": "Inspect & photograph mildew",
    "detail": "Photograph every affected cushion and panel. Note black/green mildew (usually removable), pink staining (often permanent), cracking, brittle vinyl and rotted stitching.",
    "caution": "Report rotted stitching and cracked vinyl; cleaning can open them further.",
    "minutes": 5,
    "products": []
  },
  {
    "title": "Remove cushions to a clean area",
    "detail": "Remove removable cushions and check their undersides, drain holes and the lockers beneath for moisture and mildew.",
    "caution": "Lift cushions with your legs and keep them inboard; they catch wind and slide off decks. Do not stack them on non-skid near an open edge.",
    "minutes": 10,
    "products": []
  },
  {
    "title": "Dry vacuum loose spores",
    "detail": "Vacuum loose mildew and dirt from seams, piping and undersides, outside the cabin where possible.",
    "caution": "Wear a particulate mask and eye protection for heavy mildew.",
    "minutes": 10,
    "products": []
  },
  {
    "title": "Spot test",
    "detail": "Test the mildew remover on a hidden area of each vinyl type and check for color change after the dwell time.",
    "caution": null,
    "minutes": 5,
    "products": [
      "Marine vinyl mildew remover (bleach-free, stitching-safe)"
    ]
  },
  {
    "title": "Pre-clean with vinyl cleaner",
    "detail": "Clean the vinyl with pH-neutral marine vinyl cleaner and a soft brush to remove body oils, sunscreen and dirt so the mildew remover reaches the growth.",
    "caution": null,
    "minutes": 15,
    "products": [
      "Marine vinyl cleaner (pH-neutral)"
    ]
  },
  {
    "title": "Apply mildew remover & dwell",
    "detail": "Spray the mildew remover on affected areas and let it dwell per label, keeping it from drying.",
    "caution": "No bleach, ammonia, solvents, alcohol or magic erasers. They strip the plasticizers and UV inhibitors, rot thread and can void the upholstery warranty.",
    "minutes": 15,
    "products": [
      "Marine vinyl mildew remover (bleach-free, stitching-safe)"
    ]
  },
  {
    "title": "Agitate seams & piping gently",
    "detail": "Work the remover into seams, piping and textured grain with the soft or detail brush. Use the medium brush only on heavily textured vinyl.",
    "caution": null,
    "minutes": 20,
    "products": [
      "Marine vinyl mildew remover (bleach-free, stitching-safe)"
    ]
  },
  {
    "title": "Rinse & extract",
    "detail": "Wipe off with damp microfibers rinsed often, or extract with the wet/dry vacuum, until no product remains.",
    "caution": "Do not soak cushions or flood seams; wet foam stays wet for days and grows mildew back.",
    "minutes": 15,
    "products": []
  },
  {
    "title": "Treat odor & undersides",
    "detail": "Apply the enzyme odor treatment to undersides, drain areas and lockers where mildew odor remains, per label.",
    "caution": null,
    "minutes": 10,
    "products": [
      "Enzyme odor treatment safe for marine vinyl"
    ]
  },
  {
    "title": "Dry completely",
    "detail": "Stand cushions on edge in airflow with fans or a dehumidifier until fully dry inside and out.",
    "caution": "Never reinstall damp cushions or close up the boat with them wet.",
    "minutes": 30,
    "products": []
  },
  {
    "title": "Apply UV protectant",
    "detail": "Apply non-greasy marine vinyl UV protectant to all vinyl and buff completely dry.",
    "caution": "Leave no slippery residue on seats, steps or handholds, and keep protectant off non-skid.",
    "minutes": 15,
    "products": [
      "Marine vinyl UV protectant (non-greasy)"
    ]
  },
  {
    "title": "Reinstall, advise & final photos",
    "detail": "Reinstall cushions as found, advise the owner on ventilation and covers to prevent recurrence, and take after photos.",
    "caution": null,
    "minutes": 10,
    "products": []
  }
]'::jsonb,
  array['Never use bleach, ammonia, solvents, alcohol or magic erasers on marine vinyl', 'Never soak cushions or flood seams and stitching', 'Never reinstall cushions or close the boat up while anything is damp', 'Never promise that pink staining will come out', 'Never leave greasy or slippery protectant on seats or steps', 'Never pressure-wash vinyl upholstery']::text[],
  array['No visible black or green mildew on surfaces, seams or piping', 'Vinyl color even with no bleaching or tackiness', 'Cushions fully dry inside and out', 'No mildew odor in the cockpit or cabin', 'Protectant evenly applied and dry to the touch']::text[],
  array['Before: each affected cushion and panel', 'Before: close-ups of mildew in seams and any pink staining', 'After: same cushions and angles', 'After: close-ups of the same seams']::text[]
),
(
  'boat_engine_room_bilge',
  'watercraft',
  'Engine Room / Bilge Cleaning',
  'Cleaning the engine room and bilge safely: engines off and cool, compartment ventilated, no ignition sources, free oil absorbed, oily water collected and disposed of legally, surfaces degreased and the space left dry. A clean bilge makes leaks easy to spot, so findings are photographed and reported to the owner, not repaired. Sell it at commissioning, before survey or sale and annually.',
  'Under 25 ft 1–2 h · 25–40 ft 2–4 h · 40 ft+ 4–8 h',
  '1–2 technicians (never work alone in an engine room)',
  array['Oil-absorbent pads and socks (oil-only, hydrophobic)', 'Bilge cleaner (biodegradable, non-emulsifying)', 'Engine room degreaser (water-based, marine-safe)', 'Marine-safe all-purpose cleaner', 'Corrosion inhibitor spray (optional, owner-approved)']::text[],
  array['Chemical-resistant gloves, safety glasses and a respirator suitable for the products used', 'Intrinsically safe (spark-proof) headlamp or work light', 'Long-handled bilge brushes and detail brushes', 'Hand pump or dedicated oily-water pump with sealed containers', 'Labeled sealed containers and heavy bags for oily waste', 'Drip pans and rags', 'Kneeling pads', 'Fire extinguisher (confirm onboard extinguishers are accessible)']::text[],
  array['Confirm marina/yard rules for washing, chemicals and runoff before starting; use containment and biodegradable products where required', 'Walk the vessel with the owner, note and photograph existing damage, gelcoat cracks and stains', 'Secure the boat (lines doubled at the dock or properly blocked/stand-supported on the hard), and use non-slip footwear', 'Close hatches and ports and protect electronics, helm displays and open electrical panels', 'Confirm with the owner that engines and generator will not be started, and get permission before touching battery switches or bilge pump switches', 'Find out the fuel type (gasoline or diesel) and where the marina''s oily-waste and used-absorbent disposal is', 'Have a second person nearby; engine rooms are confined spaces with fumes and heat']::text[],
  '[
  {
    "title": "Confirm engines off, cool & keys removed",
    "detail": "Confirm engines and generator are off and cool, remove or tag the keys and hang a do-not-start tag at the helm.",
    "caution": "Exhaust manifolds, turbos and risers stay hot long after shutdown. Never work in the engine room with anything running.",
    "minutes": 5,
    "products": []
  },
  {
    "title": "Ventilate & check for fuel vapors",
    "detail": "Open engine hatches and run the blower for at least four minutes on gasoline boats, then check by smell for fuel vapors before entering.",
    "caution": "If you smell fuel, stop: do not operate any switches, get off the boat and notify the owner and marina. No smoking, sparks, open flames or non-rated electrical tools in the compartment.",
    "minutes": 10,
    "products": []
  },
  {
    "title": "Make batteries & electrics safe",
    "detail": "With the owner''s permission, isolate batteries per the owner''s instructions. Remove jewelry, cover battery terminals and keep metal tools off them, and plan to keep water off batteries, chargers, alternators and starters.",
    "caution": "A tool across battery terminals causes burns, arcing and can ignite battery hydrogen.",
    "minutes": 5,
    "products": []
  },
  {
    "title": "Inspect & photograph before cleaning",
    "detail": "Photograph the bilge and engine room as found. Look for oil, fuel, coolant or hydraulic leaks, raw water leaks, chafed hoses, rusty clamps, a dripping shaft seal and corrosion.",
    "caution": "If you find a fuel leak or active water coming in, stop and notify the owner or marina immediately.",
    "minutes": 10,
    "products": []
  },
  {
    "title": "Set the bilge pump to manual",
    "detail": "With the owner''s permission, set the automatic bilge pump to off or manual so oily water and cleaner are not pumped overboard. Leave a note at the panel and watch the water level if the boat is in the water.",
    "caution": "Never leave a boat in the water with its bilge pump disabled; restore it before you leave.",
    "minutes": 5,
    "products": []
  },
  {
    "title": "Absorb free oil & fuel",
    "detail": "Lay oil-only absorbent pads and socks on any free oil or sheen and let them soak before anything else.",
    "caution": null,
    "minutes": 15,
    "products": [
      "Oil-absorbent pads and socks (oil-only, hydrophobic)"
    ]
  },
  {
    "title": "Pump out & contain oily water",
    "detail": "Pump oily bilge water into sealed, labeled containers for disposal at the marina''s oily-waste facility or by a pump-out service.",
    "caution": "Never pump oily water or any sheen overboard; it is illegal and fines are heavy. Never use dish soap or dispersants to hide a sheen.",
    "minutes": 20,
    "products": [
      "Oil-absorbent pads and socks (oil-only, hydrophobic)"
    ]
  },
  {
    "title": "Apply bilge cleaner & agitate",
    "detail": "Apply non-emulsifying bilge cleaner per label and scrub the bilge, stringers and limber holes with long-handled brushes, keeping clear of wiring, connectors and float switches.",
    "caution": null,
    "minutes": 30,
    "products": [
      "Bilge cleaner (biodegradable, non-emulsifying)"
    ]
  },
  {
    "title": "Degrease engine room surfaces",
    "detail": "On cool surfaces only, apply water-based degreaser to rag or brush and clean drip pans, engine beds and accessible surfaces. Wipe rather than spray around electrical components.",
    "caution": "Do not spray water or degreaser on alternators, starters, wiring, ECUs, air intakes or belts.",
    "minutes": 25,
    "products": [
      "Engine room degreaser (water-based, marine-safe)"
    ]
  },
  {
    "title": "Recover & dispose of waste legally",
    "detail": "Recover the dirty cleaning water and used absorbents into sealed labeled containers and take them to the marina''s oily-waste or hazardous-waste facility.",
    "caution": "Used absorbents and oily water are regulated waste; never put them in normal trash or the water.",
    "minutes": 15,
    "products": [
      "Oil-absorbent pads and socks (oil-only, hydrophobic)"
    ]
  },
  {
    "title": "Wipe down, dry & protect",
    "detail": "Wipe surfaces with all-purpose cleaner, dry the bilge, and, if the owner approves, apply corrosion inhibitor to clean bare metal fittings, keeping it off belts and drive surfaces.",
    "caution": null,
    "minutes": 15,
    "products": [
      "Marine-safe all-purpose cleaner",
      "Corrosion inhibitor spray (optional, owner-approved)"
    ]
  },
  {
    "title": "Restore pumps, ventilate & report findings",
    "detail": "Return the bilge pump to automatic and confirm the float switch activates, restore batteries as found, remove tags and tools and ventilate. Report all leaks and findings with photos; do not repair.",
    "caution": "Do not leave until the bilge pump is confirmed back on automatic.",
    "minutes": 10,
    "products": []
  }
]'::jsonb,
  array['Never work in the engine room with engines or generator running or hot', 'Never create sparks, smoke or use non-rated electrical tools in a gasoline engine compartment', 'Never pump oily water or cleaner overboard', 'Never use dish soap, emulsifiers or dispersants to hide a sheen', 'Never spray water or cleaner onto alternators, starters, wiring, batteries or air intakes', 'Never leave the bilge pump disabled when you leave the boat', 'Never attempt to repair leaks, hoses or wiring; report them']::text[],
  array['Bilge clean and dry with no oil film or sheen', 'All oily water and absorbents contained and disposed of at an approved facility', 'Bilge pump back on automatic and float switch tested', 'No cleaner residue on wiring, belts or electrical components', 'Findings documented with photos and reported to the owner']::text[],
  array['Before: bilge and engine room as found', 'Close-ups of every leak, chafed hose or corrosion found', 'After: same bilge and engine room angles', 'After: bilge pump panel showing automatic setting', 'Waste containers ready for disposal']::text[]
),
(
  'boat_outboard_trailer',
  'watercraft',
  'Outboard & Trailer Wash',
  'After-use care for trailered and outboard boats: the engine is flushed with fresh water per the manufacturer''s method, the cowling and lower unit are washed and protected, and the trailer is rinsed of salt with a visual check of tires, lights, bearings and winch reported to the owner, not repaired. Sell it after every salt-water trip and on maintenance plans for dry-stack and trailer boats.',
  'Under 25 ft (single outboard) 1–1.5 h · 25–40 ft (twin/triple outboards) 1.5–3 h · 40 ft+ (multiple outboards, lift or dry stack) 2–3 h',
  '1–2 technicians',
  array['Marine engine flush salt neutralizer (optional)', 'Biodegradable marine boat soap (wax-safe)', 'Salt-removal wash additive', 'Marine engine cowling cleaner / polish (paint-safe)', 'Trailer and wheel cleaner (non-acid)', 'Water-displacing corrosion inhibitor (marine, owner-approved)']::text[],
  array['Flush muffs or the manufacturer''s flush-port adapter', 'Garden hose with full-flow supply', 'Soft wash brush and microfiber mitt', 'Long-handled brush and hose wand for the trailer frame', 'Wheel brush', 'Wheel chocks', 'Flashlight', 'Microfiber towels']::text[],
  array['Confirm marina/yard rules for washing, chemicals and runoff before starting; use containment and biodegradable products where required', 'Walk the vessel with the owner, note and photograph existing damage, gelcoat cracks and stains', 'Secure the boat (lines doubled at the dock or properly blocked/stand-supported on the hard), and use non-slip footwear', 'Close hatches and ports and protect electronics, helm displays and open electrical panels', 'Park the trailer level, hitched to the tow vehicle or with the tongue jack down, and chock the wheels', 'Read the engine manufacturer''s flushing instructions and confirm with the owner whether the engine will be run; only the owner or an authorized person runs the engine']::text[],
  '[
  {
    "title": "Secure trailer & photograph",
    "detail": "Chock the wheels and confirm the boat is secured to the trailer. Photograph the engine(s), boat and trailer as found, including any damage.",
    "caution": "Never go under the boat or trailer. Do not climb onto a trailered boat without a stable ladder.",
    "minutes": 10,
    "products": []
  },
  {
    "title": "Confirm the flush method",
    "detail": "Check the manual: most modern outboards flush through a flush port with the engine off; others use muffs with the engine running in neutral.",
    "caution": "If the engine must run on muffs: water on first at full flow, engine in neutral, everyone clear of the propeller, never left unattended, and run only by the owner or an authorized person.",
    "minutes": 5,
    "products": []
  },
  {
    "title": "Flush the cooling system",
    "detail": "Flush with fresh water for the time the manufacturer specifies, adding salt neutralizer if the owner uses it. If running, confirm a steady telltale stream.",
    "caution": "If there is no telltale stream or the engine alarms, shut it off immediately to avoid overheating.",
    "minutes": 15,
    "products": [
      "Marine engine flush salt neutralizer (optional)"
    ]
  },
  {
    "title": "Rinse outboard exterior",
    "detail": "Rinse the cowling, midsection, lower unit, propeller and steering/tilt gear with fresh water.",
    "caution": "Do not blast water into the cowl air intake or under the cowl seal.",
    "minutes": 5,
    "products": []
  },
  {
    "title": "Wash cowling & lower unit",
    "detail": "Wash with marine soap and salt-removal additive using a soft mitt, then rinse.",
    "caution": null,
    "minutes": 15,
    "products": [
      "Biodegradable marine boat soap (wax-safe)",
      "Salt-removal wash additive"
    ]
  },
  {
    "title": "Clean & protect cowling",
    "detail": "Apply paint-safe cowling cleaner/polish to the dry cowling and buff off.",
    "caution": "Keep polish off decals that the manufacturer says to avoid and off the propeller.",
    "minutes": 10,
    "products": [
      "Marine engine cowling cleaner / polish (paint-safe)"
    ]
  },
  {
    "title": "Rinse salt from the trailer",
    "detail": "Rinse the trailer thoroughly from front to back, including inside frame rails, springs, axles, brakes, rollers or bunks, winch and coupler, using salt-removal additive and the long-handled brush and wand.",
    "caution": "Reach under with the wand; never crawl under the trailer.",
    "minutes": 15,
    "products": [
      "Salt-removal wash additive"
    ]
  },
  {
    "title": "Wash wheels & tires",
    "detail": "Clean wheels and tires with non-acid wheel cleaner and the wheel brush, then rinse.",
    "caution": null,
    "minutes": 10,
    "products": [
      "Trailer and wheel cleaner (non-acid)"
    ]
  },
  {
    "title": "Visually check bearings, tires, lights & winch",
    "detail": "Look for grease slung on rims or hubs, tire wear, cracking or low pressure, rust, a frayed winch strap or cable, damaged bunks or rollers and worn safety chains. With the owner''s tow vehicle connected, check the trailer lights work.",
    "caution": "Report only; do not jack the trailer, open hubs or make repairs.",
    "minutes": 10,
    "products": []
  },
  {
    "title": "Apply corrosion inhibitor",
    "detail": "With owner approval, mist corrosion inhibitor on trailer hardware, winch, coupler, and the outboard''s exposed linkages per the manufacturer.",
    "caution": "Keep inhibitor off brake rotors and pads, tires, trailer bunks and anywhere people step.",
    "minutes": 10,
    "products": [
      "Water-displacing corrosion inhibitor (marine, owner-approved)"
    ]
  },
  {
    "title": "Final walk-through, report & photos",
    "detail": "Remove muffs and tools, check flush caps are refitted, take after photos and give the owner a written note of everything found on the trailer and engine.",
    "caution": null,
    "minutes": 5,
    "products": []
  }
]'::jsonb,
  array['Never run an outboard without water flowing to the cooling intake', 'Never stand near the propeller of a running engine or leave it running unattended', 'Never crawl under a boat or trailer', 'Never jack the trailer, open hubs or repair lights, bearings or brakes; report them', 'Never spray inhibitor on brakes, tires or bunks', 'Never aim high-pressure water into the cowl air intake or electrical connections']::text[],
  array['Engine flushed per the manufacturer''s method with flush caps refitted', 'Cowling and lower unit free of salt and water spots', 'Trailer frame, springs, axles and winch rinsed of salt', 'Tires, lights, bearings and winch findings recorded and reported', 'No inhibitor on brakes, tires or bunks']::text[],
  array['Before: outboard(s) and trailer', 'During: telltale stream or flush connection', 'After: outboard cowling and lower unit', 'After: trailer frame, wheels and winch', 'Close-ups of any tire, bearing, light or winch issues found']::text[]
),
(
  'boat_gelcoat_one_step',
  'watercraft',
  'Gelcoat One-Step Polish',
  'A single machine pass with a marine one-step cleaner-wax that removes light oxidation, restores gloss and leaves protection in the same step. For gelcoat that is dull or lightly chalky, not heavily oxidized (that needs Oxidation Removal / Compound). Sell it annually, at spring commissioning and as an upgrade from a wash-and-wax.',
  'Under 25 ft 2–4 h · 25–40 ft 4–8 h · 40 ft+ 1–2 days',
  '1–3 technicians',
  array['Biodegradable marine boat soap (wax-safe)', 'Hull cleaner for waterline stains (if needed)', 'Marine masking tape', 'Marine one-step cleaner-wax (light-cut polish with protection)', 'Gelcoat prep / inspection spray (marine-safe)']::text[],
  array['Dual-action (DA) polisher (rotary at low speed for experienced technicians only)', 'Medium and light foam pads', 'Pad conditioning brush', 'Plush microfiber towels', 'Stable staging, scaffold or ladders (or a secure work float where permitted)', 'GFCI-protected extension cord', 'Inspection light', 'Hearing and eye protection']::text[],
  array['Confirm marina/yard rules for washing, chemicals and runoff before starting; use containment and biodegradable products where required', 'Walk the vessel with the owner, note and photograph existing damage, gelcoat cracks and stains', 'Secure the boat (lines doubled at the dock or properly blocked/stand-supported on the hard), and use non-slip footwear', 'Close hatches and ports and protect electronics, helm displays and open electrical panels', 'Do a chalk test with a dark towel to confirm the oxidation is light enough for a one-step; heavy chalking is quoted as a compound job', 'Confirm whether surfaces are gelcoat or painted; painted hulls need paint-safe products']::text[],
  '[
  {
    "title": "Assess oxidation & photograph",
    "detail": "Rub a dark towel on each side and the transom; light chalk transfer suits a one-step. Photograph dull areas, stains and any cracks, chips or crazing.",
    "caution": "Heavy chalking, deep stains or painted surfaces need a different process; stop and re-quote.",
    "minutes": 10,
    "products": []
  },
  {
    "title": "Wash & decontaminate",
    "detail": "Wash the hull and superstructure with marine soap and remove waterline stains with hull cleaner where needed, then rinse.",
    "caution": "Acid hull cleaners need gloves and eye protection and must be rinsed off fully.",
    "minutes": 40,
    "products": [
      "Biodegradable marine boat soap (wax-safe)",
      "Hull cleaner for waterline stains (if needed)"
    ]
  },
  {
    "title": "Dry & mask",
    "detail": "Dry completely and tape rub rails, striping, decals, registration numbers, canvas snaps, rubber seals and the edges of non-skid.",
    "caution": null,
    "minutes": 20,
    "products": [
      "Marine masking tape"
    ]
  },
  {
    "title": "Do a test spot",
    "detail": "Polish a 2×2 ft test area with the light pad first, then the medium pad if needed, and inspect. Use the least aggressive combination that restores gloss.",
    "caution": null,
    "minutes": 15,
    "products": [
      "Marine one-step cleaner-wax (light-cut polish with protection)"
    ]
  },
  {
    "title": "Machine polish in sections",
    "detail": "Work 2×2 ft sections: spread product at low speed, then work at medium speed in slow overlapping passes with the pad flat, 4–6 passes per section, before it dries.",
    "caution": "Keep the GFCI cord off the water and out of walkways. Never stand on gunwales or dock edges; work from stable staging. Ease off at edges and molded corners where gelcoat is thin.",
    "minutes": 90,
    "products": [
      "Marine one-step cleaner-wax (light-cut polish with protection)"
    ]
  },
  {
    "title": "Clean pads often",
    "detail": "Brush the pad after every section or two; oxidized gelcoat loads pads quickly and a loaded pad cuts unevenly.",
    "caution": null,
    "minutes": 10,
    "products": []
  },
  {
    "title": "Wipe off residue",
    "detail": "Buff residue off each section with a clean plush microfiber, turning the towel often.",
    "caution": null,
    "minutes": 20,
    "products": []
  },
  {
    "title": "Hand-polish tight areas",
    "detail": "Apply the one-step by hand with an applicator in tight areas the machine cannot reach safely and buff off.",
    "caution": null,
    "minutes": 20,
    "products": [
      "Marine one-step cleaner-wax (light-cut polish with protection)"
    ]
  },
  {
    "title": "Inspect under light",
    "detail": "Mist inspection spray and check each section under the inspection light for haze, missed spots and holograms; re-polish where needed.",
    "caution": null,
    "minutes": 15,
    "products": [
      "Gelcoat prep / inspection spray (marine-safe)"
    ]
  },
  {
    "title": "Clean residue from tape lines & non-skid",
    "detail": "Clean residue from tape edges, hardware and especially any wax that reached non-skid.",
    "caution": "Cleaner-wax on non-skid or steps is a slip hazard; remove it completely.",
    "minutes": 15,
    "products": []
  },
  {
    "title": "Remove tape & final photos",
    "detail": "Remove tape, wipe any final residue and take after photos from the same angles in similar light.",
    "caution": null,
    "minutes": 10,
    "products": []
  }
]'::jsonb,
  array['Never use a one-step on heavy oxidation without re-quoting as a compound job', 'Never apply cleaner-wax to non-skid, steps or swim platforms', 'Never polish in direct hot sun or on a hot hull', 'Never dwell on edges, corners or molded lines where gelcoat is thin', 'Never let extension cords touch the water or cross walkways', 'Never work from gunwales, dock edges or unsecured floats']::text[],
  array['Uniform gloss with no remaining chalk on a dark towel', 'No haze, holograms or missed sections under the inspection light', 'No residue on tape lines, hardware, decals or rub rails', 'Non-skid free of wax and not slippery', 'Water beads on the treated gelcoat']::text[],
  array['Before: bow, stern, port and starboard', 'Before: chalk test towel', 'After: same four angles', 'After: close-up reflection shot of a polished section']::text[]
),
(
  'boat_bottom_inspection',
  'watercraft',
  'Bottom Paint Inspection',
  'A premium condition check for boats on a lift, trailer or hauled out: the bottom is washed gently, then antifouling condition, blisters, running gear, through-hulls and zincs/anodes are inspected, photographed and written up in a report for the owner and yard. No sanding, scraping or painting of antifouling is done; that hazardous, regulated work is referred to the yard. Sell it at haul-out, before survey or purchase and annually.',
  'Under 25 ft 1–1.5 h · 25–40 ft 1.5–3 h · 40 ft+ 3–5 h',
  '1–2 technicians',
  array['Biodegradable marine boat soap (wax-safe)', 'Antifouling-safe hull cleaner (non-abrasive)', 'Low-tack marking tape for flagging findings']::text[],
  array['Soft brushes and sponges', 'Low-pressure hose (pressure washing only in the yard''s wash bay with water capture)', 'Bright inspection light and small mirror', 'Camera with a scale reference (ruler)', 'Moisture meter (optional, for noting readings)', 'Inspection form or clipboard', 'Disposable coveralls, nitrile gloves, safety glasses and a particulate mask', 'Hard hat when working under a hull', 'Kneeling pad or creeper', 'Containment tarp']::text[],
  array['Confirm marina/yard rules for washing, chemicals and runoff before starting; use containment and biodegradable products where required', 'Walk the vessel with the owner, note and photograph existing damage, gelcoat cracks and stains', 'Secure the boat (lines doubled at the dock or properly blocked/stand-supported on the hard), and use non-slip footwear', 'Close hatches and ports and protect electronics, helm displays and open electrical panels', 'Confirm the boat is properly supported by the yard on stands, blocks, a locked lift or a chocked trailer, and that it will not be moved while you work', 'Confirm with the yard where bottom washing is allowed; most require their wash pad with water capture because antifouling contains copper and biocides', 'Wear PPE throughout; antifouling residue and flakes are hazardous']::text[],
  '[
  {
    "title": "Confirm support & yard rules",
    "detail": "Check stands are pinned or chained, blocks are seated, the lift is locked or the trailer is chocked, and the yard knows you are under the boat.",
    "caution": "Never work under a boat hanging in travel-lift slings or on an unlocked lift. Never adjust or move jack stands; ask the yard.",
    "minutes": 5,
    "products": []
  },
  {
    "title": "Put on PPE & set containment",
    "detail": "Put on coveralls, gloves, safety glasses, mask and hard hat, and lay a tarp to catch paint flakes and growth.",
    "caution": "Antifouling flakes and wash water contain copper and biocides; contain and dispose of them per yard rules.",
    "minutes": 5,
    "products": []
  },
  {
    "title": "Photograph the bottom as found",
    "detail": "Photograph each side, bow, stern, keel and running gear to show growth and paint condition before washing.",
    "caution": null,
    "minutes": 10,
    "products": []
  },
  {
    "title": "Wash the bottom gently",
    "detail": "Wash with marine soap or antifouling-safe hull cleaner and a soft brush or sponge, top to bottom, rinsing with low pressure.",
    "caution": "Ablative paints wear away with scrubbing; use light pressure and no abrasive pads. Capture wash water per yard rules.",
    "minutes": 30,
    "products": [
      "Biodegradable marine boat soap (wax-safe)",
      "Antifouling-safe hull cleaner (non-abrasive)"
    ]
  },
  {
    "title": "Inspect antifouling condition",
    "detail": "Assess paint coverage, thin spots, bare areas, flaking or peeling, and whether lower color layers (wear indicators on ablative paints) show through. Flag areas with marking tape.",
    "caution": null,
    "minutes": 15,
    "products": [
      "Low-tack marking tape for flagging findings"
    ]
  },
  {
    "title": "Inspect for blisters & hull damage",
    "detail": "Look along the hull in raking light for osmotic blisters and note their size, number and location. Check for gouges, cracks, the keel-to-hull joint, rudder and any soft or impact-damaged areas.",
    "caution": "Do not pop or puncture blisters; the fluid can be acidic. Mark and photograph them.",
    "minutes": 15,
    "products": [
      "Low-tack marking tape for flagging findings"
    ]
  },
  {
    "title": "Inspect running gear & through-hulls",
    "detail": "Check propellers for dings, bent blades and fishing line, shafts and struts, cutless bearing wear, rudders, trim tabs, outdrives, through-hulls, intake strainers and transducers.",
    "caution": "Do not rotate shafts, move drives or remove anything; observe and report.",
    "minutes": 15,
    "products": []
  },
  {
    "title": "Inspect zincs & anodes",
    "detail": "Check every anode (shaft, trim tab, outdrive, transom, bow thruster) and estimate how much is wasted away. Note anodes about half gone, missing or unusually fast-wasting.",
    "caution": "Unusually fast anode loss can mean stray-current or bonding problems; report it to the owner and yard.",
    "minutes": 10,
    "products": []
  },
  {
    "title": "Inspect waterline & boot stripe",
    "detail": "Check where antifouling meets the boot stripe and gelcoat for lifting, gaps or staining.",
    "caution": null,
    "minutes": 5,
    "products": []
  },
  {
    "title": "Photograph findings systematically",
    "detail": "Photograph every flagged finding close-up with a ruler for scale, plus a wider shot showing its location on the hull.",
    "caution": null,
    "minutes": 15,
    "products": [
      "Low-tack marking tape for flagging findings"
    ]
  },
  {
    "title": "Remove marking tape & clean up",
    "detail": "Remove all marking tape, collect paint flakes and growth from the tarp and dispose of them per yard rules.",
    "caution": null,
    "minutes": 10,
    "products": [
      "Low-tack marking tape for flagging findings"
    ]
  },
  {
    "title": "Write report & refer to the yard",
    "detail": "Write a condition report with ratings for antifouling, blisters, running gear and anodes, attach photos and list recommended yard work for the owner.",
    "caution": "Do not sand, scrape or paint antifouling. It is hazardous, regulated work with dust and runoff controls; refer it to the yard or a licensed applicator.",
    "minutes": 15,
    "products": []
  }
]'::jsonb,
  array['Never sand, scrape, grind or paint antifouling; refer it to the yard', 'Never work under a boat in travel-lift slings or on an unlocked lift', 'Never adjust or move jack stands, blocks or lift settings', 'Never pressure-wash antifouling outside an approved wash bay with water capture', 'Never pop or puncture blisters', 'Never remove or replace zincs, props or through-hull fittings as part of this service', 'Never work without eye protection and gloves under a painted bottom']::text[],
  array['Bottom clean enough to see paint condition, with no abrasion of the antifouling', 'Antifouling, blisters, running gear and every anode assessed and recorded', 'Every finding photographed close-up with scale and location shots', 'All marking tape removed and debris contained and disposed of', 'Written report delivered with clear yard referrals']::text[],
  array['Before: full bottom from bow, stern, port and starboard', 'Close-ups of antifouling wear, bare spots and flaking', 'Close-ups of blisters with a ruler for scale', 'Propellers, shafts, struts, rudders and through-hulls', 'Every zinc/anode', 'After: full bottom from the same angles']::text[]
),
(
  'boat_hull_wax_lift',
  'watercraft',
  'Hull Wax (Lift or Trailer)',
  'A premium full-hull wax done while the boat is out of the water on a lift, trailer or stands, so the whole hull side down to the boot stripe and any bare gelcoat bottom (common on trailered boats) can be cleaned, stain-treated and protected. Antifouling-painted surfaces are never waxed. Sell it at commissioning, haul-out and twice a season for lift-kept boats.',
  'Under 25 ft 3–5 h · 25–40 ft 5–9 h · 40 ft+ 1–2 days',
  '2–3 technicians',
  array['Biodegradable marine boat soap (wax-safe)', 'Hull cleaner for scum line (oxalic acid, if approved)', 'Marine masking tape', 'Marine one-step cleaner-wax (for lightly oxidized areas)', 'Marine paste or liquid wax / polymer sealant']::text[],
  array['Dual-action polisher with foam finishing pads', 'Foam applicator pads', 'Plush microfiber towels', 'Stable staging, scaffold or low step platforms', 'Creeper or kneeling pad for bottom work', 'GFCI-protected extension cord', 'Hard hat, safety glasses and nitrile gloves', 'Chemical-resistant gloves and splash goggles for hull cleaner', 'Containment tarp']::text[],
  array['Confirm marina/yard rules for washing, chemicals and runoff before starting; use containment and biodegradable products where required', 'Walk the vessel with the owner, note and photograph existing damage, gelcoat cracks and stains', 'Secure the boat (lines doubled at the dock or properly blocked/stand-supported on the hard), and use non-slip footwear', 'Close hatches and ports and protect electronics, helm displays and open electrical panels', 'Confirm the boat is properly supported: lift locked out and not to be operated, trailer chocked and level, or stands set by the yard', 'Identify which bottom surfaces are bare gelcoat (waxable) and which are antifouling-painted (never waxed)']::text[],
  '[
  {
    "title": "Confirm support & lock-out",
    "detail": "Check the lift is locked out with power off and a do-not-operate tag, the trailer is chocked, or the yard''s stands are secure. Tell the marina or owner you are working under the boat.",
    "caution": "Never work under a boat in travel-lift slings or on an unlocked lift. Never adjust stands or lift settings.",
    "minutes": 5,
    "products": []
  },
  {
    "title": "Identify waxable surfaces",
    "detail": "Map the hull: hull sides, transom, boot stripe and bare gelcoat bottom are waxed; antifouling-painted areas are not. Painted (non-antifouling) bottoms only per the paint maker.",
    "caution": "Never apply wax to antifouling; it stops the biocide working.",
    "minutes": 5,
    "products": []
  },
  {
    "title": "Photograph & note damage",
    "detail": "Photograph hull sides, transom and bottom, noting gelcoat cracks, chips, blisters and bunk or roller wear marks.",
    "caution": null,
    "minutes": 10,
    "products": []
  },
  {
    "title": "Wash hull sides & bottom",
    "detail": "Wash the whole hull with marine soap and a soft mitt or brush, top to bottom, and rinse.",
    "caution": null,
    "minutes": 40,
    "products": [
      "Biodegradable marine boat soap (wax-safe)"
    ]
  },
  {
    "title": "Remove scum line & stains",
    "detail": "Wearing chemical gloves and goggles, treat scum line, rust and tannin stains with the approved hull cleaner over the containment tarp, then rinse thoroughly.",
    "caution": "Keep acid cleaner off antifouling, metal and painted surfaces, and follow marina runoff rules.",
    "minutes": 20,
    "products": [
      "Hull cleaner for scum line (oxalic acid, if approved)"
    ]
  },
  {
    "title": "Mask boot stripe edge, hardware & graphics",
    "detail": "Tape the antifouling line, rub rails, through-hulls, transducers, trim tabs, decals and registration numbers.",
    "caution": null,
    "minutes": 20,
    "products": [
      "Marine masking tape"
    ]
  },
  {
    "title": "Cleaner-wax lightly oxidized areas",
    "detail": "Apply one-step cleaner-wax with the DA on any dull or lightly chalky areas to restore gloss before sealing.",
    "caution": "Keep the GFCI cord off the water and out of walkways, and work from stable staging, not ladders leaned on the hull.",
    "minutes": 40,
    "products": [
      "Marine one-step cleaner-wax (for lightly oxidized areas)"
    ]
  },
  {
    "title": "Wax hull sides & transom",
    "detail": "Apply a thin, even coat of wax or sealant to the hull sides and transom by DA or applicator, in sections, per the label''s haze time.",
    "caution": null,
    "minutes": 60,
    "products": [
      "Marine paste or liquid wax / polymer sealant"
    ]
  },
  {
    "title": "Wax bare gelcoat bottom",
    "detail": "Apply wax to the bare gelcoat bottom surfaces you can reach safely, working in small sections from the creeper or kneeling pad.",
    "caution": "Wear eye protection for overhead work. Keep wax off transducer faces and speed sensors. Do not try to reach under bunks by lifting or shifting the boat; note those areas as not reachable.",
    "minutes": 40,
    "products": [
      "Marine paste or liquid wax / polymer sealant"
    ]
  },
  {
    "title": "Buff off & inspect",
    "detail": "Buff off all haze with clean plush microfibers, turning towels often, and inspect in raking light for missed spots and streaks.",
    "caution": null,
    "minutes": 40,
    "products": []
  },
  {
    "title": "Remove tape & clean residue",
    "detail": "Remove tape and clean wax residue from rub rails, decals, the boot stripe edge and any antifouling it touched.",
    "caution": null,
    "minutes": 15,
    "products": [
      "Marine masking tape"
    ]
  },
  {
    "title": "Final photos & report",
    "detail": "Remove lock-out tags only with the owner or marina present, take after photos and note any damage, blisters or unreachable areas for the owner.",
    "caution": null,
    "minutes": 10,
    "products": []
  }
]'::jsonb,
  array['Never wax antifouling-painted surfaces', 'Never work under a boat in travel-lift slings or on an unlocked or powered lift', 'Never adjust jack stands, blocks or lift settings', 'Never wax transducer faces, speed sensors or non-skid', 'Never let acid hull cleaner touch antifouling or run into the water against marina rules', 'Never lean ladders against the hull or work from unstable platforms']::text[],
  array['Hull sides, transom and bare gelcoat bottom evenly waxed with no haze or streaks', 'No wax on antifouling, transducers or non-skid', 'Waterline and transom stain-free', 'No residue on rub rails, decals or the boot stripe edge', 'Water beads evenly across the waxed surfaces', 'Unreachable bunk areas noted for the owner']::text[],
  array['Before: hull port and starboard, bow and transom', 'Before: bottom surfaces and waterline stains', 'After: same angles', 'After: water beading on hull side', 'Close-ups of any damage, blisters or unreachable areas']::text[]
);

-- Existing marine guides become the Level 2 services.
update public.service_guides set title = 'Wash — Level 2 (Full Hull & Deck)' where org_id is null and key = 'boat_wash';
update public.service_guides set title = 'Interior — Level 2 (Full Interior)' where org_id is null and key = 'boat_interior';

-- Auto detailing SOPs: maintenance (Level 1) wash and interior, waterless/rinseless wash, clay decontamination,
-- one-step polish & protect, wheels/tires, leather, extraction, headlight restoration, odor removal and PPF care.
-- Existing vehicle_wash and vehicle_interior are retitled as the Level 2 (Full) services.
-- Guides are general best practice; always follow the vehicle manufacturer's recommendations and each product's label instructions.
-- Step minutes are estimates for a typical sedan/midsize SUV.

insert into public.service_guides (key, asset_type, title, summary, time_estimate, crew, products, tools, prep, steps, donts, quality_checks, photos) values
(
  'vehicle_wash_l1',
  'vehicle',
  'Exterior Wash — Level 1 (Maintenance Wash)',
  'A quick, safe maintenance wash for vehicles that are washed regularly and already in good condition: foam pre-wash, two-bucket contact wash, a quick wheel and tire clean, touchless or towel drying and tire dressing. No decontamination, bug/tar work or door jambs. Sell it weekly or biweekly on a maintenance plan; move up to Level 2 (Full Exterior) when the vehicle is heavily soiled or has not been washed in a month or more.',
  'Sedan 30–45 min · Midsize SUV 40–55 min · Full-size truck/SUV 50–70 min',
  '1 technician (2 for back-to-back fleet or plan stops)',
  array['pH-neutral car shampoo', 'Snow foam / pre-wash', 'Non-acid wheel cleaner', 'Water-based tire dressing', 'Spray sealant or drying aid']::text[],
  array['Two buckets with grit guards (wash and rinse)', 'Separate wheel bucket and wheel brushes', 'Microfiber wash mitts (one for upper panels, one for lower panels)', 'Foam cannon / pressure washer (1,200–1,900 psi with 25–40° tip) or foam sprayer and hose', 'Plush drying towels and/or blower', 'Tire dressing applicator pad']::text[],
  array['Confirm the scope is a Level 1 Maintenance Wash and that the vehicle is in maintenance condition; quote Level 2 if it is heavily soiled', 'Do a quick walk-around and photograph any new damage since the last visit', 'Remove or bag personal items and valuables near the exterior work area (roof racks, truck beds); note anything left', 'Park in shade on a surface where runoff is allowed; panels and wheels cool to the touch']::text[],
  '[
  {
    "title": "Quick walk-around & photos",
    "detail": "Walk the vehicle and compare to the last visit. Photograph any new chips, scratches, curb rash or dents and point them out to the customer before you start.",
    "caution": "If the vehicle is far dirtier than a maintenance wash, stop and confirm an upgrade to Level 2 before starting.",
    "minutes": 3,
    "products": []
  },
  {
    "title": "Quick clean wheels & tires",
    "detail": "Spray wheel cleaner on cool wheels and tires, agitate wheel faces, lug nuts and the visible barrel with dedicated brushes, scrub the tire sidewall and rinse thoroughly.",
    "caution": "Never spray wheel cleaner on hot wheels or brakes, and never use the wheel brushes or bucket on paint.",
    "minutes": 8,
    "products": ["Non-acid wheel cleaner"]
  },
  {
    "title": "Pre-rinse top-down",
    "detail": "Rinse the vehicle from the roof down to float off loose dirt, keeping the nozzle moving and at least 12 in from paint, badges and trim.",
    "caution": null,
    "minutes": 3,
    "products": []
  },
  {
    "title": "Foam pre-wash & dwell",
    "detail": "Apply snow foam to the whole vehicle, bottom-up so it clings longest on the dirtiest lower panels, let it dwell 3–5 minutes without drying, then rinse top-down.",
    "caution": "Do not let foam dry on the paint; in heat, work and rinse one side at a time.",
    "minutes": 6,
    "products": ["Snow foam / pre-wash"]
  },
  {
    "title": "Two-bucket contact wash top-down",
    "detail": "Wash one panel at a time from the roof down with a loaded mitt using light, straight-line strokes. Rinse the mitt in the rinse bucket before reloading. Switch to the lower-panel mitt below the door handles.",
    "caution": "If a mitt touches the ground, set it aside and use a clean one. Never scrub harder to remove a spot; leave it for Level 2.",
    "minutes": 10,
    "products": ["pH-neutral car shampoo"]
  },
  {
    "title": "Final rinse with sheeting flow",
    "detail": "Rinse thoroughly top-down, then finish with an open hose (no nozzle) to sheet water off the panels and reduce drying time.",
    "caution": null,
    "minutes": 3,
    "products": []
  },
  {
    "title": "Dry with blower & plush towels",
    "detail": "Blow water out of mirrors, grilles, emblems and gaps, then dry panels by patting or gently dragging a plush towel lightly misted with drying aid.",
    "caution": "Use a clean, dedicated towel for paint; never use a towel that has touched wheels or the ground.",
    "minutes": 8,
    "products": ["Spray sealant or drying aid"]
  },
  {
    "title": "Dress tires",
    "detail": "Apply a thin, even coat of water-based tire dressing with an applicator pad and wipe off any excess from the tread and wheel.",
    "caution": "Keep dressing off the tread and brake components, and wipe any overspray off the wheel and paint.",
    "minutes": 3,
    "products": ["Water-based tire dressing"]
  },
  {
    "title": "Final inspection & after photos",
    "detail": "Inspect in good light for missed dirt, drips from mirrors and trim, and dressing sling. Take after photos and let the customer know about anything that needs a Level 2 or decontamination service.",
    "caution": null,
    "minutes": 3,
    "products": []
  }
]'::jsonb,
  array['Never wash in direct sun or on hot panels', 'Never use dish soap or household detergents', 'Never use the same mitt, towel or bucket for wheels and paint', 'Never use a zero-degree tip or get close to paint, badges or trim with pressure', 'Never use a dropped mitt or towel without cleaning it', 'Never let foam or shampoo dry on the paint']::text[],
  array['No dirt film when wiped with a white towel on a lower panel', 'No water spots, drips or streaks from mirrors and trim', 'Wheel faces and lug nuts clean', 'Tires evenly dressed with no sling on paint', 'Any new damage photographed and reported to the customer']::text[],
  array['Before: four corners', 'Before: close-ups of any new damage', 'After: four corners', 'After: wheel and tire close-up']::text[]
),
(
  'vehicle_interior_l1',
  'vehicle',
  'Interior — Level 1 (Quick Clean)',
  'A fast maintenance interior: trash out, thorough vacuum, wipe-down of all touch surfaces, glass inside, and mats cleaned. No shampooing, extraction or leather conditioning. Sell it with the Level 1 exterior wash on weekly or biweekly plans, for rideshare drivers and between full details; move up to Level 2 (Full Interior) for stains, odors, pet hair or heavy soil.',
  'Sedan 30–45 min · Midsize SUV 45–60 min · 3-row SUV/minivan 60–75 min',
  '1 technician',
  array['All-purpose interior cleaner (diluted for plastics)', 'Ammonia-free glass cleaner', 'Screen-safe cleaner', 'Water-based UV interior dressing (non-greasy)', 'Rubber mat cleaner (non-slip, no dressing)']::text[],
  array['Shop vacuum with crevice and brush tools', 'Soft detail brushes (vents, seams, switches)', 'Compressed air blow gun (optional)', 'Microfiber towels (separate for glass, plastics and mats)', 'Mat scrub brush', 'Trash bags and labeled bags for personal items']::text[],
  array['Confirm the scope is a Level 1 Quick Clean; quote Level 2 for stains, odors, pet hair or heavy soil', 'Photograph the interior as found, including any damage, stains or tears', 'Bag personal items and valuables in labeled bags and ask the customer what may be thrown away; never discard papers, receipts or items of possible value', 'Park in shade with doors open for airflow']::text[],
  '[
  {
    "title": "Photograph interior as found",
    "detail": "Photograph each row of seats, the dash and the cargo area, plus close-ups of any stains, tears or damage.",
    "caution": null,
    "minutes": 2,
    "products": []
  },
  {
    "title": "Remove trash, mats & personal items",
    "detail": "Remove obvious trash, take out all floor mats, and bag personal items in labeled bags placed in the trunk or returned to the customer.",
    "caution": "Do not throw away papers, receipts, cards, cash or anything that could have value; bag it and return it.",
    "minutes": 4,
    "products": []
  },
  {
    "title": "Blow out & brush vents and seams",
    "detail": "Use soft brushes (and compressed air if available) to loosen dust from vents, seat seams, console gaps and door pockets toward the floor.",
    "caution": "Keep compressed air away from your eyes and do not blow debris into open containers or the customer''s belongings.",
    "minutes": 4,
    "products": []
  },
  {
    "title": "Vacuum top-down",
    "detail": "Vacuum seats, seat seams, between and under seats with the seats moved fully forward then back, then carpets, door pockets and the cargo area.",
    "caution": "Return seats, steering wheel and mirrors to the customer''s positions when finished; photograph settings if unsure.",
    "minutes": 10,
    "products": []
  },
  {
    "title": "Clean floor mats",
    "detail": "Scrub rubber mats with mat cleaner and rinse, or vacuum and brush carpet mats outside the vehicle. Dry rubber mats completely.",
    "caution": "Never apply slippery dressing to mats or pedals.",
    "minutes": 6,
    "products": ["Rubber mat cleaner (non-slip, no dressing)"]
  },
  {
    "title": "Wipe down dash, console & door panels",
    "detail": "Spray cleaner onto a towel or brush, not the surface, and wipe dash, console, cup holders, door panels, handles and steering wheel. Follow with a light coat of non-greasy UV dressing on plastics only.",
    "caution": "Do not spray liquids directly onto switches, screens or airbag covers, and keep dressing off the steering wheel and pedals.",
    "minutes": 8,
    "products": ["All-purpose interior cleaner (diluted for plastics)", "Water-based UV interior dressing (non-greasy)"]
  },
  {
    "title": "Clean screens",
    "detail": "Wipe infotainment screens and the instrument cluster with screen-safe cleaner on a clean, soft microfiber, using light pressure.",
    "caution": "Never use glass cleaner or all-purpose cleaner on screens; it can strip anti-glare coatings.",
    "minutes": 2,
    "products": ["Screen-safe cleaner"]
  },
  {
    "title": "Clean interior glass & mirrors",
    "detail": "Clean the inside of all windows, mirrors and the windshield with ammonia-free glass cleaner sprayed on the towel, using one towel to clean and a second to buff.",
    "caution": "Do not scrub rear window defroster lines or aftermarket tint aggressively.",
    "minutes": 6,
    "products": ["Ammonia-free glass cleaner"]
  },
  {
    "title": "Reinstall mats & final inspection",
    "detail": "Reinstall dry mats with any retention clips engaged, check for missed debris and streaks, take after photos and note any upsell items (stains, odors) for the customer.",
    "caution": "Make sure the driver mat is clipped in and cannot slide under the pedals.",
    "minutes": 3,
    "products": []
  }
]'::jsonb,
  array['Never spray liquids directly onto electronics, screens or airbag covers', 'Never use greasy or silicone dressings on steering wheels, pedals or floor mats', 'Never use ammonia glass cleaner on tinted windows', 'Never use glass or all-purpose cleaner on touch screens', 'Never throw away customer items other than obvious trash', 'Never leave the driver mat unsecured']::text[],
  array['No visible debris in seats, seams, cup holders or door pockets', 'Plastics clean with an even satin, non-greasy finish', 'Glass and screens streak-free', 'Mats clean, dry and secured with clips', 'Seats and mirrors returned to the customer''s positions', 'Personal items bagged and returned']::text[],
  array['Before: front seats, rear seats, cargo area', 'Before: close-ups of stains or damage', 'After: same angles', 'After: driver footwell with mat installed']::text[]
),
(
  'vehicle_waterless_wash',
  'vehicle',
  'Waterless / Rinseless Wash',
  'A low-water wash for garages, condos, parking structures and anywhere runoff is not allowed: high-lubricity rinseless solution or waterless spray with many plush towels, one panel at a time. It is safe only on lightly to moderately dirty vehicles; heavy mud, sand, salt or caked grit requires a traditional wash. Sell it to condo and office buildings, fleet lots and maintenance-plan customers without water access.',
  'Sedan 40–60 min · Midsize SUV 50–75 min · Full-size truck/SUV 60–90 min',
  '1 technician',
  array['Rinseless wash concentrate', 'Waterless wash spray (high-lubricity, polymer-based)', 'Non-acid wheel cleaner', 'Water-based tire dressing', 'Ammonia-free glass cleaner']::text[],
  array['Two buckets with grit guards (solution and clean-towel soak, or garry-style method)', 'Pump sprayer for pre-soak (1–2 gal)', '12–20 plush microfiber towels (70/30, 400+ gsm), folded in quarters', 'Separate wheel towels and wheel brushes', 'Plush drying towels', 'Drip mat or towels to protect garage floors', 'Dirty-towel bin']::text[],
  array['Confirm property rules allow on-site detailing and that there is no runoff; protect the floor under the vehicle', 'Assess soil level: if there is mud, sand, salt crust, heavy road film or caked grit, do not proceed with a waterless/rinseless wash; reschedule or quote a traditional wash', 'Walk around, photograph existing damage and confirm the scope and price', 'Work in shade with panels cool to the touch; have enough clean towels ready (at least one fresh face per panel)']::text[],
  '[
  {
    "title": "Assess soil level & go/no-go",
    "detail": "Inspect the lower panels, rocker panels and behind the wheels in good light. Drag a clean finger lightly on a hidden lower area: a light dust or road film is suitable; gritty sand, mud or salt is not.",
    "caution": "If grit is heavy, stop. Rubbing grit with a towel causes scratches and swirls no matter how much product is used.",
    "minutes": 3,
    "products": []
  },
  {
    "title": "Walk around & photograph existing damage",
    "detail": "Photograph each side and close-ups of chips, scratches and swirls, and show the customer before starting.",
    "caution": null,
    "minutes": 3,
    "products": []
  },
  {
    "title": "Mix solution & soak towels",
    "detail": "Mix rinseless concentrate in a bucket at the label wash dilution, fill the pump sprayer at the pre-soak dilution, and soak the clean towels in the solution bucket.",
    "caution": null,
    "minutes": 4,
    "products": ["Rinseless wash concentrate"]
  },
  {
    "title": "Clean wheels & tires",
    "detail": "Spray wheel cleaner on cool wheels, agitate faces, lug nuts and barrels with brushes, then wipe with dedicated wheel towels wrung out in rinseless solution. Scrub tires and wipe dry.",
    "caution": "Wheel towels and brushes never touch paint. Keep wheel cleaner off brake components on hot wheels.",
    "minutes": 10,
    "products": ["Non-acid wheel cleaner", "Rinseless wash concentrate"]
  },
  {
    "title": "Pre-soak one panel at a time",
    "detail": "Mist the panel generously with the pre-soak sprayer or waterless spray and let it dwell 30–60 seconds to lift and encapsulate dirt. Work top-down, starting with the roof and glass.",
    "caution": "Never let solution dry on the panel; re-mist if it starts to dry.",
    "minutes": 5,
    "products": ["Rinseless wash concentrate", "Waterless wash spray (high-lubricity, polymer-based)"]
  },
  {
    "title": "Wipe with a fresh towel face, no pressure",
    "detail": "Take a soaked towel, fold in quarters, and wipe in straight lines with no pressure, lifting dirt away. Turn to a clean face after each pass; put the towel in the dirty bin once all faces are used. Never return a dirty towel to the solution bucket.",
    "caution": "No circular scrubbing. If you feel grit drag, stop, re-soak and use a fresh towel face.",
    "minutes": 18,
    "products": ["Rinseless wash concentrate", "Waterless wash spray (high-lubricity, polymer-based)"]
  },
  {
    "title": "Dry & buff immediately",
    "detail": "Follow each wiped panel immediately with a plush drying towel, lightly buffing to a streak-free finish.",
    "caution": null,
    "minutes": 8,
    "products": []
  },
  {
    "title": "Lower panels last",
    "detail": "Do rocker panels, lower doors and bumpers last with fresh towels and extra pre-soak, since they hold the most grit.",
    "caution": "Use a new towel for lower panels; never bring a lower-panel towel back up to upper panels.",
    "minutes": 6,
    "products": ["Rinseless wash concentrate"]
  },
  {
    "title": "Glass, tire dressing & floor check",
    "detail": "Clean exterior glass with ammonia-free cleaner, apply a thin coat of water-based tire dressing, and wipe up any drips on the garage floor.",
    "caution": null,
    "minutes": 6,
    "products": ["Ammonia-free glass cleaner", "Water-based tire dressing"]
  },
  {
    "title": "Final inspection & after photos",
    "detail": "Inspect in good light from several angles for streaks, high spots and missed areas. Take after photos and walk the customer around.",
    "caution": null,
    "minutes": 3,
    "products": []
  }
]'::jsonb,
  array['Never waterless/rinseless wash a vehicle with mud, sand, salt crust or caked grit', 'Never use pressure while wiping; let the product and towel do the work', 'Never reuse a dirty towel face or return a dirty towel to the clean solution', 'Never work in direct sun or on hot panels', 'Never use the same towels for wheels and paint', 'Never let runoff or overspray reach floors, walls or neighboring vehicles']::text[],
  array['No new swirls or marring when inspected with a light at an angle', 'No streaks or high spots on paint and glass', 'Lower panels and rocker panels clean', 'Wheels, lug nuts and tires clean; dressing even with no sling', 'No drips or residue left on the garage floor or nearby vehicles']::text[],
  array['Before: four corners', 'Before: lower panel close-up showing soil level', 'Before: close-ups of existing damage', 'After: four corners', 'After: work area clean']::text[]
),
(
  'vehicle_clay_decon',
  'vehicle',
  'Clay Bar Decontamination',
  'Chemical and mechanical decontamination that removes bonded contaminants a wash cannot: iron fallout, rail dust, tar, overspray and tree sap. Done after a full wash and before polishing, sealant or ceramic coating so protection bonds to clean paint. Sell it once or twice a year, before any polish or coating, and whenever the paint feels rough after washing.',
  'Sedan 45–75 min · Midsize SUV 1–1.5 h · Full-size truck/SUV 1.5–2 h (after the wash)',
  '1–2 technicians',
  array['pH-neutral car shampoo', 'Iron/fallout remover (color-changing)', 'Tar and adhesive remover', 'Clay bar (fine/medium) or synthetic clay mitt/towel', 'Clay lubricant (or slick shampoo solution)', 'Spray sealant (to protect after decontamination)']::text[],
  array['Pressure washer (1,200–1,900 psi with 25–40° tip) and hose', 'Microfiber wash mitts', 'Plastic sandwich bag (for the feel test)', 'Plush microfiber towels', 'Plush drying towels and/or blower', 'Inspection light', 'Nitrile gloves and safety glasses']::text[],
  array['Wash the vehicle fully (two-bucket wash) and work in shade with panels cool to the touch', 'Walk around and photograph existing damage; note any soft or failing clear coat, repaint or PPF/wrap areas', 'Wear nitrile gloves and safety glasses; iron remover is odorous and must not get in eyes', 'Confirm the customer understands clay can leave light marring that should be followed by polish or at least a protective sealant']::text[],
  '[
  {
    "title": "Wash & dry the vehicle",
    "detail": "Complete a full two-bucket wash so no loose dirt remains; the panels can stay wet for chemical decontamination.",
    "caution": null,
    "minutes": 30,
    "products": ["pH-neutral car shampoo"]
  },
  {
    "title": "Feel test with a plastic bag",
    "detail": "Put your hand in a thin plastic bag and lightly glide it over the hood, roof, rear and lower panels to feel bonded contamination. Note the roughest areas.",
    "caution": null,
    "minutes": 3,
    "products": []
  },
  {
    "title": "Apply iron remover",
    "detail": "Spray iron remover on cool paint and wheels, panel by panel. Let it dwell per label (usually 2–5 minutes) and watch for the purple bleed as it dissolves iron particles.",
    "caution": "Do not let it dry, and keep it off hot panels, bare metal, uncoated polished wheels and open wounds. Rinse eyes immediately with water if splashed.",
    "minutes": 6,
    "products": ["Iron/fallout remover (color-changing)"]
  },
  {
    "title": "Rinse thoroughly",
    "detail": "Rinse every panel, gap, badge and trim piece thoroughly to remove all iron remover.",
    "caution": null,
    "minutes": 4,
    "products": []
  },
  {
    "title": "Spot-treat tar & sap",
    "detail": "Apply tar remover to tar spots and sap on lower panels and behind the wheels, dwell briefly and wipe gently with a microfiber.",
    "caution": "Test on a hidden area first if the paint is a respray, and wash the area after use.",
    "minutes": 6,
    "products": ["Tar and adhesive remover"]
  },
  {
    "title": "Clay with plenty of lubricant",
    "detail": "Work a 2x2 ft section at a time. Spray lubricant generously, glide the flattened clay (or clay mitt) in straight lines with light pressure until it moves smoothly and quietly. Fold and knead the clay often to expose a clean face.",
    "caution": "Never clay a dry panel. If the clay is dropped, throw it away; a mitt must be fully rinsed.",
    "minutes": 25,
    "products": ["Clay bar (fine/medium) or synthetic clay mitt/towel", "Clay lubricant (or slick shampoo solution)"]
  },
  {
    "title": "Wipe & feel each section",
    "detail": "Wipe off residual lubricant and repeat the bag test. Re-clay only the areas that still feel rough.",
    "caution": null,
    "minutes": 6,
    "products": ["Clay lubricant (or slick shampoo solution)"]
  },
  {
    "title": "Clay glass (optional)",
    "detail": "Clay the windshield and side glass with a separate clay piece or mitt to remove bonded film before glass treatment.",
    "caution": "Use a separate clay piece for glass; do not reuse glass clay on paint.",
    "minutes": 5,
    "products": ["Clay bar (fine/medium) or synthetic clay mitt/towel", "Clay lubricant (or slick shampoo solution)"]
  },
  {
    "title": "Rinse, dry & inspect",
    "detail": "Rinse the vehicle to remove lubricant residue, dry with blower and plush towels, and inspect under a light for clay marring.",
    "caution": null,
    "minutes": 8,
    "products": []
  },
  {
    "title": "Protect the paint",
    "detail": "Clay leaves paint bare: follow with polishing, or at minimum apply a spray sealant so the paint is protected before the vehicle leaves.",
    "caution": "Never leave freshly clayed paint unprotected.",
    "minutes": 8,
    "products": ["Spray sealant (to protect after decontamination)"]
  }
]'::jsonb,
  array['Never clay a dirty, dry or hot panel', 'Never use a dropped clay bar', 'Never press hard; let the clay and lubricant do the work', 'Never use aggressive clay on soft, thin or failing clear coat without testing', 'Never let iron or tar remover dry on the surface', 'Never leave paint unprotected after claying', 'Never clay PPF or wraps with aggressive clay; use only fine clay or a mitt approved for film']::text[],
  array['Paint glass-smooth on the bag test across all panels', 'No remaining iron bleed when re-sprayed on a test area', 'No tar or sap spots on lower panels', 'No clay marring left unaddressed, or customer informed it will be polished', 'Sealant or polish applied before delivery']::text[],
  array['Before: bag test or close-up of contamination on a light panel', 'During: iron remover bleeding (purple) on paint or wheel', 'During: dirty clay face', 'After: four corners', 'After: reflection close-up on the hood']::text[]
),
(
  'vehicle_wax_sealant',
  'vehicle',
  'Wax / Sealant (One-Step Polish & Protect)',
  'A one-step machine polish that removes light swirls and oxidation and restores gloss, followed by a durable sealant or wax. It is an enhancement, not a full paint correction; deeper scratches will remain. Sell it every 3–6 months for sealant (6–12 weeks for wax), before sale, and as the upgrade from a wash when the paint looks dull.',
  'Sedan 2.5–4 h · Midsize SUV 3–4.5 h · Full-size truck/SUV 4–6 h (including wash and decontamination)',
  '1–2 technicians',
  array['pH-neutral car shampoo', 'Iron/fallout remover (color-changing)', 'Clay bar or synthetic clay mitt with clay lubricant', 'All-in-one polish (light cut with protection) or one-step polish', 'Panel wipe / polish residue remover (IPA-based, diluted per label)', 'Paint sealant or carnauba wax', 'Water-based trim protectant']::text[],
  array['Dual-action (DA) polisher, 5–6 in backing plate', 'Polishing pads (medium cut and finishing foam or microfiber)', 'Foam applicator pads for sealant/wax', 'Low-tack painter''s masking tape', 'Paint depth gauge (recommended)', 'Inspection light (swirl finder)', 'Plush microfiber towels (short-pile for removal, plush for final buff)', 'Pad cleaning brush or compressed air', 'Safety glasses and hearing protection']::text[],
  array['Walk around with the customer, photograph existing damage, and set expectations: a one-step improves gloss and light swirls but will not remove deep scratches or rock chips', 'Wash and decontaminate fully (iron remover and clay); polishing over contamination causes marring', 'Work indoors or in full shade with cool panels and good lighting', 'Measure paint thickness on each panel if a gauge is available and note thin, repainted or damaged areas to avoid', 'Mask rubber and textured plastic trim, emblems, panel edges and sensors with low-tack tape']::text[],
  '[
  {
    "title": "Wash & decontaminate",
    "detail": "Complete a two-bucket wash, iron remover and clay so the paint is smooth and clean. Dry fully, including gaps and mirrors.",
    "caution": null,
    "minutes": 60,
    "products": ["pH-neutral car shampoo", "Iron/fallout remover (color-changing)", "Clay bar or synthetic clay mitt with clay lubricant"]
  },
  {
    "title": "Inspect & measure paint",
    "detail": "Inspect each panel under the swirl light and record defects. Take paint depth readings where possible and flag thin or repainted areas.",
    "caution": "Avoid or use only the finishing pad on thin paint, repaints, single-stage paint and sharp body lines.",
    "minutes": 10,
    "products": []
  },
  {
    "title": "Mask trim & sensitive areas",
    "detail": "Tape rubber seals, textured plastics, emblems, sharp edges and parking sensors so polish does not stain them and the pad does not burn edges.",
    "caution": null,
    "minutes": 10,
    "products": []
  },
  {
    "title": "Test spot",
    "detail": "Choose a 2x2 ft section on the hood. Polish with the least aggressive pad and polish combination first, wipe and inspect. Step up only if needed.",
    "caution": "Always start least aggressive. Check that the result is consistent before polishing the whole vehicle.",
    "minutes": 10,
    "products": ["All-in-one polish (light cut with protection) or one-step polish", "Panel wipe / polish residue remover (IPA-based, diluted per label)"]
  },
  {
    "title": "Machine polish panel by panel",
    "detail": "Prime the pad with 3–4 pea-size drops. Work 2x2 ft sections in slow, overlapping cross-hatch passes at moderate speed and light to moderate pressure until the polish turns clear. Clean the pad often.",
    "caution": "Keep the pad flat and moving, stay off panel edges and body lines, and stop if the panel becomes hot to the touch. Keep the cord over your shoulder and away from the paint.",
    "minutes": 75,
    "products": ["All-in-one polish (light cut with protection) or one-step polish"]
  },
  {
    "title": "Wipe residue & inspect",
    "detail": "Wipe residue with a short-pile microfiber, then mist panel wipe and buff to reveal the true finish. Inspect under the light and touch up any hazy areas.",
    "caution": "Ventilate when using panel wipe, wear gloves, and keep it off plastic trim and PPF.",
    "minutes": 15,
    "products": ["Panel wipe / polish residue remover (IPA-based, diluted per label)"]
  },
  {
    "title": "Apply sealant or wax",
    "detail": "Apply a thin, even coat of sealant or wax with a foam applicator, one panel at a time. Respect the label haze/cure time.",
    "caution": "Thin coats only. Do not apply on hot panels or in direct sun, and keep it off textured trim.",
    "minutes": 20,
    "products": ["Paint sealant or carnauba wax"]
  },
  {
    "title": "Buff off & cure",
    "detail": "Buff off residue with a plush microfiber, flipping to clean faces often. Allow cure time per label before exposing to water or rain.",
    "caution": "Tell the customer how long to avoid washing or rain after application.",
    "minutes": 15,
    "products": ["Paint sealant or carnauba wax"]
  },
  {
    "title": "Remove tape, dress trim & clean glass",
    "detail": "Remove masking tape slowly, wipe any polish dust from gaps and emblems, and apply trim protectant to exterior plastics.",
    "caution": null,
    "minutes": 10,
    "products": ["Water-based trim protectant"]
  },
  {
    "title": "Final inspection & handover",
    "detail": "Inspect in sun and under the swirl light, take after photos with matching angles, and explain wax/sealant care to the customer (pH-neutral soap, no automatic brush washes).",
    "caution": null,
    "minutes": 8,
    "products": []
  }
]'::jsonb,
  array['Never polish a panel that has not been washed and decontaminated', 'Never polish in direct sun or on hot panels', 'Never use a rotary polisher unless trained; use a DA for this service', 'Never polish over edges, body lines or thin/repainted paint without checking', 'Never let polish, sealant or wax dry on rubber or textured trim', 'Never promise defect-free paint from a one-step', 'Never use panel wipe or compound on PPF or matte paint/wraps']::text[],
  array['Even gloss across all panels with no hazing, holograms or buffer trails under the light', 'No polish or wax residue in gaps, emblems or trim', 'No burned edges or body lines', 'Water beads or sheets evenly after cure (spot check)', 'Before/after 50-50 comparison photographed on one panel', 'Customer informed of remaining deeper defects and cure time']::text[],
  array['Before: four corners', 'Before: swirl-light close-up on hood', 'During: 50-50 taped comparison on one panel', 'After: same swirl-light close-up', 'After: four corners']::text[]
),
(
  'vehicle_wheels_tires',
  'vehicle',
  'Wheels, Tires & Wheel Wells Deep Clean',
  'A deep clean of wheel faces, barrels, lug nuts, calipers (visible), tires and wheel wells: iron decontamination, tire browning removal, well degreasing, wheel sealant and dressing. Sell it as an add-on to any wash, for show and sale prep, and to customers with heavy brake dust or neglected wheels.',
  'Sedan 45–75 min · Midsize SUV 1–1.5 h · Truck/large SUV with off-road or oversized wheels 1.5–2 h',
  '1 technician',
  array['Non-acid wheel cleaner (pH-balanced, safe for coated and painted wheels)', 'Iron/fallout remover (color-changing)', 'Tire cleaner / rubber degreaser', 'All-purpose cleaner (diluted for wheel wells)', 'Tar and adhesive remover', 'Wheel sealant or ceramic wheel spray', 'Water-based tire dressing', 'Wheel well / plastic liner dressing (water-based)']::text[],
  array['Dedicated wheel bucket with grit guard', 'Wheel face brush (soft), barrel brush (long, soft), lug nut brush', 'Tire brush (stiff bristle)', 'Long-handled wheel well brush', 'Pressure washer (1,200–1,900 psi with 25–40° tip)', 'Dedicated wheel microfiber towels and applicator pads', 'Blower or compressed air', 'Nitrile gloves and safety glasses']::text[],
  array['Walk around and photograph each wheel, including curb rash, chips, corrosion and missing center caps or weights', 'Confirm wheel finish: painted, clear-coated, powder-coated, polished/uncoated aluminum, chrome or anodized; check for aftermarket or coated wheels', 'Wheels, tires and brakes must be cool to the touch; if the vehicle was just driven, wait', 'Park on a level surface with the parking brake set; never work on a vehicle on a jack without stands']::text[],
  '[
  {
    "title": "Photograph each wheel as found",
    "detail": "Photograph each wheel face, tire sidewall and the wheel well, plus close-ups of curb rash, corrosion and damage.",
    "caution": null,
    "minutes": 4,
    "products": []
  },
  {
    "title": "Identify finish & test",
    "detail": "Identify the wheel finish and test cleaners on an inconspicuous area, especially polished, chrome, anodized or aftermarket wheels.",
    "caution": "Never use acid wheel cleaner on uncoated, polished, anodized or chrome wheels. Polished and uncoated wheels may need only shampoo and polish.",
    "minutes": 3,
    "products": ["Non-acid wheel cleaner (pH-balanced, safe for coated and painted wheels)"]
  },
  {
    "title": "Rinse wheel wells first",
    "detail": "Rinse wells from top to bottom to remove loose mud and road grime before the wheels, so dirt is not splashed onto clean wheels.",
    "caution": "Keep high pressure off brake lines, ABS sensors, wiring and suspension boots.",
    "minutes": 4,
    "products": []
  },
  {
    "title": "Degrease & scrub wheel wells",
    "detail": "Spray diluted all-purpose cleaner on plastic liners or painted wells, agitate with the long-handled brush and rinse. Treat tar spots with tar remover.",
    "caution": null,
    "minutes": 12,
    "products": ["All-purpose cleaner (diluted for wheel wells)", "Tar and adhesive remover"]
  },
  {
    "title": "Clean tires to remove browning",
    "detail": "Spray tire cleaner on the sidewall, scrub with the stiff brush until the foam turns from brown to white, and rinse. Repeat if needed.",
    "caution": "Keep tire degreaser off the paint and do not let it dry on the wheel face.",
    "minutes": 10,
    "products": ["Tire cleaner / rubber degreaser"]
  },
  {
    "title": "Clean wheels: barrel, face & lugs",
    "detail": "One wheel at a time, spray wheel cleaner on the barrel, face and lug nuts, agitate with the barrel, face and lug nut brushes, and rinse thoroughly.",
    "caution": "Work one wheel at a time so cleaner never dries. Be careful around TPMS valve stems and wheel weights.",
    "minutes": 16,
    "products": ["Non-acid wheel cleaner (pH-balanced, safe for coated and painted wheels)"]
  },
  {
    "title": "Iron decontamination",
    "detail": "Spray iron remover on the wheel face and barrel, dwell 2–4 minutes until it stops bleeding, lightly agitate and rinse thoroughly.",
    "caution": "Use gloves and eye protection; keep it off hot wheels and bare metal brake components, and rinse thoroughly.",
    "minutes": 10,
    "products": ["Iron/fallout remover (color-changing)"]
  },
  {
    "title": "Dry wheels & tires",
    "detail": "Blow water out of lug nut holes, behind spokes and around the valve stem, then towel dry the wheels and tires with dedicated wheel towels.",
    "caution": null,
    "minutes": 6,
    "products": []
  },
  {
    "title": "Protect wheels",
    "detail": "Apply wheel sealant or ceramic wheel spray to the clean, dry face (and barrel if reachable), then buff per label.",
    "caution": "Keep sealant off brake rotors and pads.",
    "minutes": 8,
    "products": ["Wheel sealant or ceramic wheel spray"]
  },
  {
    "title": "Dress tires & wheel wells",
    "detail": "Apply a thin, even coat of water-based tire dressing with an applicator and dress plastic well liners lightly. Wipe excess off the tread, wheels and paint.",
    "caution": "Never apply dressing to the tread or brake components, and avoid heavy coats that sling onto paint.",
    "minutes": 8,
    "products": ["Water-based tire dressing", "Wheel well / plastic liner dressing (water-based)"]
  },
  {
    "title": "Final inspection & after photos",
    "detail": "Check barrels, lug nuts and the inner spokes with a light. Photograph each wheel at the same angle as the before photos.",
    "caution": null,
    "minutes": 4,
    "products": []
  }
]'::jsonb,
  array['Never clean hot wheels or brakes', 'Never use acid wheel cleaner on uncoated, polished, anodized or chrome wheels', 'Never use wheel brushes, buckets or towels on paint', 'Never spray high pressure at brake lines, ABS sensors, wiring or bearings', 'Never apply dressing to tire tread, brake rotors or pads', 'Never let wheel cleaner or iron remover dry on the surface']::text[],
  array['Barrels, inner spokes and lug nut holes clean when checked with a light', 'Tire sidewalls clean with no brown residue or blotchy dressing', 'Wheel wells free of mud and road film, liners evenly dressed', 'No dressing on tread, brakes or paint and no sling', 'No chemical residue or water spots on wheel faces', 'Existing curb rash or damage documented']::text[],
  array['Before: each wheel face', 'Before: wheel well and tire sidewall', 'Before: close-ups of curb rash or corrosion', 'After: each wheel face at the same angle', 'After: tire and wheel well close-up']::text[]
),
(
  'vehicle_leather_care',
  'vehicle',
  'Leather Clean & Condition',
  'Deep cleaning of leather seats, steering wheel and trim with a pH-neutral shampoo and soft brush, followed by a non-greasy conditioner and UV protectant once the leather is fully dry. Removes body oils, dye transfer and grime that crack and darken leather. Sell it every 3–6 months, as part of a Level 2 interior, and to owners of light-colored leather.',
  'Front seats only 30–45 min · Sedan full interior 1–1.5 h · 3-row SUV 1.5–2.5 h',
  '1 technician',
  array['pH-neutral leather cleaner / shampoo (foaming, water-based)', 'Water-based leather conditioner (non-greasy, no silicone)', 'Water-based leather protectant with UV inhibitors', 'Aniline/nubuck-specific cleaner (only where that leather is present)', 'All-purpose interior cleaner (diluted for surrounding trim)']::text[],
  array['Soft horsehair or synthetic leather brush', 'Soft interior detail brushes (seams and stitching)', 'Microfiber towels (white or light-colored to check soil transfer)', 'Foam or microfiber applicator pads', 'Vacuum with soft brush and crevice tools', 'Spray bottles']::text[],
  array['Photograph seats as found, including wear, cracks, tears, dye loss and stains; set expectations that cracking and color loss are not reversed by cleaning', 'Identify the leather type (pigmented, semi-aniline, aniline, nubuck/suede) and check for perforated, ventilated or heated/cooled seats', 'Vacuum seats thoroughly, including seams and between cushions, before any wet cleaning', 'Work in shade with the interior cool; leather must not be hot']::text[],
  '[
  {
    "title": "Photograph & identify leather type",
    "detail": "Photograph each seat and the steering wheel. Put a drop of water on a hidden spot: if it soaks in and darkens, the leather is aniline/semi-aniline and needs minimal moisture; if it beads, it is pigmented. Nubuck and suede are cleaned dry or with a specific cleaner only.",
    "caution": "Do not use pigmented-leather products on aniline, nubuck or suede.",
    "minutes": 4,
    "products": []
  },
  {
    "title": "Vacuum seams & perforations",
    "detail": "Vacuum seats with a soft brush tool, opening seams and the gap between cushions. Brush debris out of perforations without pushing it in.",
    "caution": null,
    "minutes": 8,
    "products": []
  },
  {
    "title": "Test spot",
    "detail": "Apply cleaner to a hidden area (side of the seat base or lower back) with a brush, wipe with a white towel and check for color transfer or change. Proceed only if the leather is unaffected.",
    "caution": "If dye transfers heavily or the finish changes, stop and advise the customer; the leather may need professional repair or recoloring.",
    "minutes": 4,
    "products": ["pH-neutral leather cleaner / shampoo (foaming, water-based)"]
  },
  {
    "title": "Shampoo leather section by section",
    "detail": "Spray foaming cleaner onto the brush, not the seat, and gently agitate one section at a time (headrest, bolster, seat face). Wipe foam and dirt away immediately with a damp microfiber, then a dry one.",
    "caution": "Perforated and ventilated seats: use foam only, keep the brush nearly dry and never saturate; liquid in perforations can damage heater/cooler elements and stain foam.",
    "minutes": 25,
    "products": ["pH-neutral leather cleaner / shampoo (foaming, water-based)", "Aniline/nubuck-specific cleaner (only where that leather is present)"]
  },
  {
    "title": "Clean steering wheel & touch points",
    "detail": "Clean the steering wheel, shift knob, armrests and door pulls the same way; these hold the most body oil. Repeat until a white towel shows no soil.",
    "caution": "Do not spray near the airbag cover or steering wheel controls.",
    "minutes": 8,
    "products": ["pH-neutral leather cleaner / shampoo (foaming, water-based)"]
  },
  {
    "title": "Clean surrounding trim",
    "detail": "Wipe adjacent plastic trim and seat bases with diluted interior cleaner on a towel to remove overspray and grime.",
    "caution": null,
    "minutes": 5,
    "products": ["All-purpose interior cleaner (diluted for surrounding trim)"]
  },
  {
    "title": "Let leather dry fully",
    "detail": "Allow the leather to dry completely (usually 15–30 minutes with doors open) before conditioning.",
    "caution": "Never condition damp leather; it traps moisture and leaves a blotchy finish.",
    "minutes": 15,
    "products": []
  },
  {
    "title": "Condition",
    "detail": "Apply a small amount of conditioner to an applicator and work it in thinly and evenly, especially on bolsters and creases. Let it absorb per label and buff off any excess.",
    "caution": "Thin coats only. Keep conditioner out of perforations and off the steering wheel grip area if it leaves any slickness.",
    "minutes": 15,
    "products": ["Water-based leather conditioner (non-greasy, no silicone)"]
  },
  {
    "title": "Apply UV protectant & buff",
    "detail": "Apply a thin coat of UV protectant to seats and dash-adjacent leather and buff to a natural satin finish.",
    "caution": null,
    "minutes": 8,
    "products": ["Water-based leather protectant with UV inhibitors"]
  },
  {
    "title": "Final inspection & customer care advice",
    "detail": "Check that the finish is even, dry and non-slippery. Take after photos and advise the customer to avoid sitting on seats until dry, and to clean every few months.",
    "caution": null,
    "minutes": 3,
    "products": []
  }
]'::jsonb,
  array['Never use household cleaners, alcohol, solvents, baby wipes or magic erasers on leather', 'Never saturate perforated, ventilated or heated/cooled seats', 'Never condition leather that is still damp from shampooing', 'Never use silicone or greasy dressings on leather, steering wheels or pedals', 'Never spray products directly onto seats, airbag covers or electronics', 'Never use stiff brushes or aggressive scrubbing on leather', 'Never use pigmented-leather products on aniline, nubuck or suede']::text[],
  array['No soil transfer on a clean white towel wiped across seat faces', 'Seams, stitching and perforations clean and not clogged with product', 'Even, natural satin finish, soft and dry to the touch with no greasy residue', 'Steering wheel clean and not slippery', 'No dye removal or color change at test spot or elsewhere']::text[],
  array['Before: each seat (driver bolster close-up)', 'Before: steering wheel', 'During: dirty towel after first wipe', 'After: same angles as before', 'After: close-up of perforations if present']::text[]
),
(
  'vehicle_extraction',
  'vehicle',
  'Carpet & Seat Extraction',
  'Hot-water extraction of carpets, floor mats and cloth seats to remove embedded soil, stains, spills and odors: thorough vacuum, pre-treat and agitate, extract with a low-foam rinse, and dry fast to prevent mildew. Sell it as part of a Level 2 interior, after spills, for pet owners and families, and before sale.',
  'Carpets & mats only 45–75 min · Sedan carpets + cloth seats 1.5–2.5 h · 3-row SUV/minivan 2.5–3.5 h (plus drying time)',
  '1–2 technicians',
  array['Carpet and upholstery pre-spray (enzyme or traffic-lane type)', 'Spot removers (protein/organic, oil/grease, tannin)', 'Low-foam extraction rinse (acidic or pH-neutral)', 'Enzyme odor neutralizer', 'Fabric protector (optional, water-based)']::text[],
  array['Hot-water extractor with upholstery and crevice tools', 'Shop vacuum with crevice and brush tools', 'Drill brush and handheld upholstery brushes (medium for carpet, soft for seats)', 'Pump sprayer', 'Fans/air movers or dehumidifier for drying', 'Moisture meter (recommended)', 'Microfiber towels and white towels for blotting', 'Nitrile gloves']::text[],
  array['Photograph seats and carpets as found, including stains and damage; set expectations that some stains (dye, ink, bleach, old set-in stains) may not fully come out', 'Remove mats, trash and personal items; vacuum thoroughly so you are not extracting dry soil into mud', 'Check for seats with occupancy sensors, airbags in seats, heating elements and under-carpet wiring or modules', 'Plan drying: work early in the day, with good airflow and fans available; avoid extraction on cold, humid days without drying equipment']::text[],
  '[
  {
    "title": "Photograph & identify stains",
    "detail": "Photograph each seat and carpet area and close-ups of stains. Identify likely stain types (food/drink, grease, coffee, pet, blood, mud) to pick the right spotter.",
    "caution": null,
    "minutes": 4,
    "products": []
  },
  {
    "title": "Vacuum thoroughly",
    "detail": "Vacuum carpets, seats and mats with brush and crevice tools, moving seats forward and back; agitate carpet with a brush to lift embedded sand and hair.",
    "caution": null,
    "minutes": 15,
    "products": []
  },
  {
    "title": "Pre-treat stains",
    "detail": "Apply the correct spotter to each stain, let it dwell per label and gently blot or agitate from the outside in. Test spotters on a hidden area first.",
    "caution": "Never use bleach or oxidizers on colored fabric without testing; blot rather than rub to avoid spreading or fuzzing.",
    "minutes": 10,
    "products": ["Spot removers (protein/organic, oil/grease, tannin)"]
  },
  {
    "title": "Pre-spray & agitate carpets",
    "detail": "Lightly mist pre-spray over carpets and mats and agitate with the drill brush (carpet) on low speed. Let it dwell 5–10 minutes without drying.",
    "caution": "Use light moisture only; do not flood the carpet.",
    "minutes": 12,
    "products": ["Carpet and upholstery pre-spray (enzyme or traffic-lane type)"]
  },
  {
    "title": "Extract carpets & mats",
    "detail": "Extract with hot water and low-foam rinse in slow, overlapping passes, then make two or three dry vacuum passes for every wet pass until the recovery water runs clear.",
    "caution": "Do not over-wet: water soaking into the padding causes mildew, odor and can damage under-carpet wiring and modules.",
    "minutes": 25,
    "products": ["Low-foam extraction rinse (acidic or pH-neutral)"]
  },
  {
    "title": "Pre-spray & gently agitate cloth seats",
    "detail": "Mist seats lightly with pre-spray and agitate with a soft upholstery brush, one section at a time.",
    "caution": "Seats with airbags or occupancy sensors: use minimal moisture and never saturate the seat foam.",
    "minutes": 10,
    "products": ["Carpet and upholstery pre-spray (enzyme or traffic-lane type)"]
  },
  {
    "title": "Extract cloth seats",
    "detail": "Extract seats with the upholstery tool using light pressure, more dry passes than wet passes, and finish with dry vacuum passes until the recovery is clear.",
    "caution": null,
    "minutes": 25,
    "products": ["Low-foam extraction rinse (acidic or pH-neutral)"]
  },
  {
    "title": "Treat odors at the source",
    "detail": "If spills or pet accidents caused odor, apply enzyme neutralizer to the affected area and allow dwell time per label before final drying.",
    "caution": null,
    "minutes": 5,
    "products": ["Enzyme odor neutralizer"]
  },
  {
    "title": "Dry fast & prevent mildew",
    "detail": "Groom the fibers in one direction, open doors or windows, run air movers into the cabin and use the vehicle''s A/C or heat with fresh air if allowed. Check moisture with a meter or by hand before closing up.",
    "caution": "Never close up a damp vehicle. Seats and carpets should be dry to the touch within 2–6 hours; advise the customer to leave windows cracked in a secure place if needed.",
    "minutes": 30,
    "products": []
  },
  {
    "title": "Apply fabric protector (optional)",
    "detail": "Once completely dry, apply a light, even coat of water-based fabric protector to seats and mats if sold.",
    "caution": "Ventilate during application and keep it off plastics, glass and screens.",
    "minutes": 8,
    "products": ["Fabric protector (optional, water-based)"]
  },
  {
    "title": "Final inspection & reinstall mats",
    "detail": "Check for wicking stains, water rings and damp spots, re-treat if needed, reinstall dry mats and take after photos.",
    "caution": null,
    "minutes": 6,
    "products": []
  }
]'::jsonb,
  array['Never over-wet carpets or seat foam', 'Never close up or deliver a damp vehicle', 'Never extract without vacuuming dry soil first', 'Never use bleach or harsh solvents on automotive fabric without testing', 'Never saturate seats with airbags, occupancy sensors or heating elements', 'Never use high-foam shampoos in the extractor; residue attracts dirt']::text[],
  array['Recovery water ran clear on the final passes', 'No water rings, wicking stains or soap residue', 'Carpets and seats dry to the touch, with no musty or mildew odor', 'Fibers groomed in one direction with a uniform appearance', 'Mats dry and reinstalled with clips engaged', 'Customer informed of any stains that could not be fully removed']::text[],
  array['Before: each seat and carpet area', 'Before: close-ups of stains', 'During: extractor recovery tank or dirty water', 'After: same angles and stain close-ups', 'After: groomed carpet']::text[]
),
(
  'vehicle_headlight_restoration',
  'vehicle',
  'Headlight Restoration',
  'Restores yellowed, hazy or oxidized polycarbonate headlight lenses by removing the failed factory UV coating with a wet-sanding progression, polishing to clarity and applying a new UV-resistant clear coat. Without a new UV layer the lens will yellow again within months. Sell it as a safety and appearance upgrade, before inspection or sale; it does not fix internal moisture, cracks or failed bulbs.',
  'Pair of headlights: lightly hazy 45–60 min · heavily oxidized 1–1.5 h (plus coating cure time per label)',
  '1 technician',
  array['Automotive masking tape (low-tack, 1–2 in)', 'Wet-sanding discs or sheets (e.g. 800/1000, 1500, 2000, 3000 grit)', 'Sanding lubricant (water with a drop of car shampoo)', 'Plastic/headlight polish (fine finishing)', 'Panel wipe / IPA solution (diluted per label)', 'UV-resistant headlight clear coat or coating (essential)']::text[],
  array['Dual-action (DA) polisher with 3 in backing plate, or hand sanding block', '3 in interface pad and finishing polishing pad', 'Spray bottle for lubricant', 'Microfiber towels', 'Inspection light', 'Nitrile gloves, safety glasses and respirator/mask rated for the clear coat used']::text[],
  array['Photograph each headlight as found and check for cracks, chips, internal moisture or condensation, and failed bulbs; these are not fixed by restoration', 'Confirm the lens is polycarbonate/plastic; glass headlights are polished only and are not sanded', 'Wash and dry the headlight and surrounding area', 'Work in shade with the lens cool, and with good ventilation for the clear coat; check temperature and humidity limits on the coating label', 'Mask the paint, trim and bumper around each headlight with two or three layers of low-tack tape']::text[],
  '[
  {
    "title": "Inspect & photograph",
    "detail": "Photograph each lens straight on and at an angle. Note cracks, internal fogging and moisture; tell the customer before starting that internal damage will remain.",
    "caution": "If the lens is cracked or holds water inside, restoration will not fix it; recommend repair or replacement.",
    "minutes": 3,
    "products": []
  },
  {
    "title": "Wash & mask surrounding paint and trim",
    "detail": "Clean the lens, then mask all paint, chrome and trim around it with two or three layers of low-tack tape so the sander and polisher cannot touch paint.",
    "caution": "Unprotected paint next to the lens is easily sanded through; re-tape if tape lifts or gets cut.",
    "minutes": 8,
    "products": ["Automotive masking tape (low-tack, 1–2 in)"]
  },
  {
    "title": "Wet-sand with the coarse grit",
    "detail": "With plenty of lubricant, sand the whole lens evenly with the coarsest grit needed (start at 1000–1500 for moderate haze; 800 only for heavy oxidation) until the old yellowed coating is completely removed and the lens has an even, uniform frost.",
    "caution": "Keep the surface wet, use light pressure and keep the sander flat. Any remaining shiny or yellow spots mean the old coating is still there and the new coat will not bond evenly.",
    "minutes": 12,
    "products": ["Wet-sanding discs or sheets (e.g. 800/1000, 1500, 2000, 3000 grit)", "Sanding lubricant (water with a drop of car shampoo)"]
  },
  {
    "title": "Refine through finer grits",
    "detail": "Rinse and dry, inspect, then sand with each finer grit (1500, 2000, 3000), changing direction or pattern each step so you can see when the previous scratches are gone.",
    "caution": "Do not skip grits; deeper scratches will show through the clear coat.",
    "minutes": 15,
    "products": ["Wet-sanding discs or sheets (e.g. 800/1000, 1500, 2000, 3000 grit)", "Sanding lubricant (water with a drop of car shampoo)"]
  },
  {
    "title": "Polish to clarity (if coating requires)",
    "detail": "Polish the lens with plastic polish on a finishing pad at moderate speed until clear, or stop at the final grit if the coating maker specifies applying over a sanded surface.",
    "caution": "Keep the pad moving and the lens cool; heat can distort polycarbonate.",
    "minutes": 10,
    "products": ["Plastic/headlight polish (fine finishing)"]
  },
  {
    "title": "Clean with panel wipe",
    "detail": "Wipe the lens with panel wipe to remove all polish oils and residue, then let it flash off completely.",
    "caution": "Check the coating label: some coatings require a specific prep solvent. Never touch the lens with bare fingers after this step.",
    "minutes": 3,
    "products": ["Panel wipe / IPA solution (diluted per label)"]
  },
  {
    "title": "Apply UV-resistant clear coat",
    "detail": "Apply the UV clear coat exactly per label in thin, even coats with the specified flash time between coats, working in a ventilated area free of dust.",
    "caution": "This step is essential: a restored lens without a new UV layer will yellow again quickly. Wear gloves, eye protection and the respirator specified on the label; keep bystanders away.",
    "minutes": 8,
    "products": ["UV-resistant headlight clear coat or coating (essential)"]
  },
  {
    "title": "Cure & remove tape",
    "detail": "Let the coating cure per label (heat, time or UV lamp as specified) before removing masking tape slowly at a low angle.",
    "caution": "Do not touch, wash or expose the lens to rain until the label cure time has passed.",
    "minutes": 15,
    "products": []
  },
  {
    "title": "Final inspection, photos & care advice",
    "detail": "Inspect clarity with a light from several angles, take after photos at the same angles as before, and tell the customer the cure time and to avoid harsh chemicals and automatic brush washes for the period on the label.",
    "caution": null,
    "minutes": 3,
    "products": []
  }
]'::jsonb,
  array['Never skip the UV-resistant clear coat after sanding', 'Never sand without masking surrounding paint and trim', 'Never dry-sand headlight lenses', 'Never skip grits in the sanding progression', 'Never use solvents not approved by the coating maker on polycarbonate; some craze the lens', 'Never sand glass headlights', 'Never spray coatings without ventilation and proper PPE']::text[],
  array['Lens clear and uniform with no sanding marks under a light', 'No remaining yellow, haze or untreated spots', 'UV coating applied evenly with no runs, dust nibs or dry spots', 'No damage to surrounding paint, trim or bumper', 'Customer informed of cure time and of any internal moisture or cracks']::text[],
  array['Before: each headlight straight on', 'Before: angle close-up showing haze', 'During: masked and sanded lens (uniform frost)', 'After: each headlight straight on', 'After: 50-50 photo if one side was done first']::text[]
),
(
  'vehicle_odor_removal',
  'vehicle',
  'Odor Removal (Ozone / Enzyme)',
  'Eliminates persistent odors (smoke, pets, spilled food or milk, mildew, vomit) by finding and removing the source first, treating with enzyme cleaners, cleaning the HVAC system and cabin filter, and finishing with an ozone treatment only in an empty, sealed vehicle followed by thorough airing out. Sell it as a stand-alone service or with a Level 2 interior; heavy smoke or mildew may need more than one treatment.',
  'Light odor 1–2 h · Smoke or pet odor 3–5 h · Severe smoke/mildew 1–2 days with multiple treatments (ozone and airing time included)',
  '1 technician',
  array['Enzyme odor neutralizer (bio-enzymatic)', 'Carpet and upholstery pre-spray', 'All-purpose interior cleaner (diluted for plastics)', 'HVAC system odor treatment (evaporator/vent foam or fogger, label-approved)', 'Replacement cabin air filter (correct part for the vehicle)']::text[],
  array['Shop vacuum with crevice and brush tools', 'Hot-water extractor', 'Steamer (optional)', 'Ozone generator with timer', 'Fans/air movers', 'Detail brushes and microfiber towels', 'Flashlight', '"Do not enter — ozone treatment" warning signs', 'Nitrile gloves and a mask suitable for the products']::text[],
  array['Ask the customer about the odor source, when it started, spills, pets, smoking and water leaks; a hidden source (spilled milk, food, mildew from a leak) must be found or the odor will return', 'Photograph the interior as found', 'Remove all personal items, trash, mats and car seats; check under seats, seat tracks, spare tire well and door pockets', 'Plan a secure, ventilated outdoor or well-ventilated area for ozone treatment, away from people, pets, plants and occupied buildings']::text[],
  '[
  {
    "title": "Find the odor source",
    "detail": "Inspect under and between seats, seat tracks, trunk and spare tire well, door pockets, headliner and carpets for spills, food, pet accidents, mold or water. Check carpet padding for dampness that may indicate a leak.",
    "caution": "Wear gloves and a mask when handling mold, vomit or biological material. A water leak (door seals, sunroof drains, A/C drain) must be repaired or the mildew odor will return; tell the customer.",
    "minutes": 15,
    "products": []
  },
  {
    "title": "Remove source & debris",
    "detail": "Remove all trash, food and contaminated items, and vacuum thoroughly including seat tracks, under seats and the cargo area. Clean the ash tray and cup holders.",
    "caution": null,
    "minutes": 20,
    "products": []
  },
  {
    "title": "Clean hard surfaces",
    "detail": "Wipe dash, console, door panels, headliner (lightly) and all plastics with diluted interior cleaner; smoke residue film holds odor on every surface, including the inside of glass.",
    "caution": "Spray onto a towel, not directly onto electronics or airbag covers. Use minimal moisture on the headliner to avoid sagging.",
    "minutes": 25,
    "products": ["All-purpose interior cleaner (diluted for plastics)"]
  },
  {
    "title": "Pre-treat & extract fabrics",
    "detail": "Pre-spray carpets, mats and cloth seats, agitate and hot-water extract to remove odor-causing residue.",
    "caution": "Avoid over-wetting; damp padding causes new mildew odors.",
    "minutes": 45,
    "products": ["Carpet and upholstery pre-spray"]
  },
  {
    "title": "Apply enzyme treatment to source areas",
    "detail": "Saturate the specific source area (pet urine, vomit, milk) with enzyme neutralizer so it reaches as deep as the contamination did, cover if the label says, and allow full dwell time per label.",
    "caution": "Do not mix enzyme products with other chemicals or follow immediately with ozone or steam, which can deactivate enzymes; follow the label sequence.",
    "minutes": 20,
    "products": ["Enzyme odor neutralizer (bio-enzymatic)"]
  },
  {
    "title": "Replace cabin air filter",
    "detail": "Locate and remove the cabin air filter, vacuum the housing and install a new filter of the correct part with the airflow arrow pointing the right way.",
    "caution": "Photograph the old filter for the customer; never reuse a dirty or moldy filter.",
    "minutes": 10,
    "products": ["Replacement cabin air filter (correct part for the vehicle)"]
  },
  {
    "title": "Treat the HVAC system",
    "detail": "With the engine running outdoors, A/C off and fan on recirculate (or as the label specifies), apply the HVAC odor treatment, then run the fan to circulate it through the vents.",
    "caution": "Never run the engine in an enclosed space. Follow the label for vent and drain application; stay out of the vehicle during fogging.",
    "minutes": 15,
    "products": ["HVAC system odor treatment (evaporator/vent foam or fogger, label-approved)"]
  },
  {
    "title": "Ozone treatment (empty vehicle only)",
    "detail": "Place the ozone generator in the empty vehicle, close doors and windows (routing the cord safely), post warning signs and run it on a timer for the shortest effective time (typically 30–60 minutes for light odors, up to a few hours for smoke, in repeat sessions if needed).",
    "caution": "Ozone is harmful to breathe. No people, pets or plants in or near the vehicle during treatment. Never sit in or open the vehicle while the generator is running. Do not exceed the manufacturer''s run-time limits; excessive ozone can degrade rubber, plastics and leather.",
    "minutes": 60,
    "products": []
  },
  {
    "title": "Ventilate fully",
    "detail": "After treatment, turn the generator off, wait before opening, then open all doors and air out the vehicle with fans for at least 30–60 minutes until no ozone smell (sharp, chlorine-like) remains. Run the HVAC on fresh air to purge the system.",
    "caution": "Do not enter or let anyone ride in the vehicle until it has been fully aired out and has no ozone smell.",
    "minutes": 45,
    "products": []
  },
  {
    "title": "Final evaluation & customer advice",
    "detail": "Close the vehicle for 15–30 minutes, then reopen and smell-test. Repeat enzyme or ozone treatment if odor remains. Take after photos and advise the customer that heat may bring back faint odors and a follow-up visit may be needed.",
    "caution": null,
    "minutes": 20,
    "products": []
  }
]'::jsonb,
  array['Never run an ozone generator with people, pets or plants in or near the vehicle', 'Never enter a vehicle during ozone treatment or before it is fully ventilated', 'Never exceed ozone run-time limits or use ozone as a substitute for removing the source', 'Never run the engine for HVAC treatment in an enclosed space', 'Never mask odors with fragrances alone', 'Never over-wet carpets, padding or the headliner', 'Never deliver a vehicle that still smells of ozone']::text[],
  array['Odor source identified and removed or documented (including any leak)', 'No odor detected after the closed-vehicle smell test', 'No ozone smell remaining at delivery', 'Cabin air filter replaced and old filter shown to the customer', 'Carpets and seats dry with no musty odor', 'Customer informed about possible follow-up treatment']::text[],
  array['Before: interior overview', 'Before: odor source found (spill, stain, mold, debris)', 'During: old cabin air filter next to the new one', 'During: ozone setup with warning sign posted', 'After: interior overview']::text[]
),
(
  'vehicle_ppf_care',
  'vehicle',
  'Paint Protection Film (PPF) Care',
  'Safe maintenance washing and protection of vehicles with paint protection film (clear or matte/stealth): gentle wash technique that protects film edges, compatible pH-neutral products, inspection for lifting edges, staining and yellowing, and a PPF-safe sealant topper. This is care for existing film, not installation or repair. Sell it as a maintenance plan for PPF owners; refer lifting, bubbling or damaged film to the installer.',
  'Sedan 60–90 min · Midsize SUV 75–105 min · Full-size truck/SUV 1.5–2 h',
  '1–2 technicians',
  array['pH-neutral car shampoo (no waxes, gloss enhancers or solvents)', 'Snow foam / pre-wash (PPF-safe)', 'Bug remover (PPF-safe, non-solvent)', 'Non-acid wheel cleaner', 'PPF-safe spray sealant or film-specific coating topper', 'Quick detailer (PPF-safe, wax-free)']::text[],
  array['Two buckets with grit guards (wash and rinse)', 'Separate wheel bucket and brushes', 'Soft microfiber wash mitts', 'Foam cannon / pressure washer (under ~1,200–1,500 psi with 40° tip)', 'Plush drying towels and blower', 'Inspection light', 'Soft detailing brushes']::text[],
  array['Ask the customer which panels are filmed (full front, full body, partial), whether the film is gloss or matte, and the film maker''s care instructions and any coating on the film', 'Walk around with an inspection light and photograph existing film issues: lifting edges, bubbles, scratches, stains, yellowing or contamination under the film', 'Note fresh installs: do not wash film installed in the last 7 days (or per the installer''s cure time)', 'Park in shade with panels cool to the touch']::text[],
  '[
  {
    "title": "Identify filmed areas & finish",
    "detail": "Confirm which panels are filmed and whether the film is gloss or matte. Locate film edges and seams with the light so you know where to avoid pressure and lint.",
    "caution": "Matte/stealth film needs matte-safe products only: no waxes, polishes or gloss-enhancing sealants.",
    "minutes": 5,
    "products": []
  },
  {
    "title": "Inspect & photograph film condition",
    "detail": "Photograph lifting edges, bubbles, stains, yellowing, scratches and contamination under the film. Show the customer before washing.",
    "caution": "Do not try to press down, trim or heat lifted film; refer it to the installer.",
    "minutes": 6,
    "products": []
  },
  {
    "title": "Clean wheels & tires first",
    "detail": "Clean wheels and tires with non-acid cleaner and dedicated brushes, rinsing so no splash dries on the film.",
    "caution": null,
    "minutes": 12,
    "products": ["Non-acid wheel cleaner"]
  },
  {
    "title": "Rinse with low pressure, away from edges",
    "detail": "Rinse top-down with the nozzle at least 18–24 in away, spraying across the film surface and never directly at film edges or seams.",
    "caution": "High pressure aimed at a film edge can lift or tear it. Keep the stream moving and angled away from edges.",
    "minutes": 4,
    "products": []
  },
  {
    "title": "Foam pre-wash",
    "detail": "Apply PPF-safe snow foam, dwell 3–5 minutes without drying and rinse at low pressure.",
    "caution": null,
    "minutes": 6,
    "products": ["Snow foam / pre-wash (PPF-safe)"]
  },
  {
    "title": "Soften bugs & bird droppings",
    "detail": "Spray PPF-safe bug remover on bugs and droppings, let it soften, and lift gently with a soaked microfiber.",
    "caution": "Never scrape or use solvent-based tar/bug removers, clay or abrasive pads on film; they can haze or stain it.",
    "minutes": 6,
    "products": ["Bug remover (PPF-safe, non-solvent)"]
  },
  {
    "title": "Two-bucket contact wash with gentle pressure",
    "detail": "Wash top-down with a soft mitt in straight lines parallel to film edges, never pushing into or catching an edge. Rinse the mitt often.",
    "caution": "Wipe along edges, not against them, to avoid lifting and dirt build-up at the edge line.",
    "minutes": 15,
    "products": ["pH-neutral car shampoo (no waxes, gloss enhancers or solvents)"]
  },
  {
    "title": "Rinse & dry gently",
    "detail": "Rinse at low pressure, then blow water out of edges, seams and emblems and dry with plush towels using light pressure.",
    "caution": "Keep the blower nozzle back from film edges; strong air aimed at an edge can lift it.",
    "minutes": 10,
    "products": []
  },
  {
    "title": "Check stains, yellowing & edges",
    "detail": "Inspect the film under the light for remaining stains, yellowing, haze and edge lift or dirt lines. Use quick detailer on light spots; document anything that does not come off.",
    "caution": "Yellowing or staining inside the film cannot be cleaned out; note it and recommend the installer.",
    "minutes": 6,
    "products": ["Quick detailer (PPF-safe, wax-free)"]
  },
  {
    "title": "Apply PPF-safe sealant",
    "detail": "Apply a thin coat of PPF-safe spray sealant or film-specific topper panel by panel and buff with a clean towel. On matte film, use only a matte-safe product.",
    "caution": "Keep products from building up on edges; wipe edges clean.",
    "minutes": 10,
    "products": ["PPF-safe spray sealant or film-specific coating topper"]
  },
  {
    "title": "Final inspection & customer report",
    "detail": "Take after photos, walk the customer around and give them a short report of film condition: edges, stains, yellowing and any items to send to the installer.",
    "caution": null,
    "minutes": 4,
    "products": []
  }
]'::jsonb,
  array['Never aim a pressure washer directly at film edges or seams, or get closer than 18 in', 'Never use solvents, tar removers, clay, compounds or abrasive polishes on PPF', 'Never use waxes or gloss products on matte/stealth film', 'Never wash film during the installer''s cure period', 'Never pick at, trim, heat or press down lifted film; refer to the installer', 'Never wipe against film edges with mitts or towels']::text[],
  array['No lifted, nicked or dirty edges created during the wash', 'Film surface clean, uniform and streak-free (matte film even with no shiny spots)', 'No product build-up at film edges or seams', 'Existing film issues photographed and reported to the customer', 'Sealant applied evenly and buffed with no high spots']::text[],
  array['Before: four corners', 'Before: close-ups of lifting edges, stains or yellowing', 'After: four corners', 'After: film edge close-up on hood and bumper']::text[]
);

update public.service_guides set title = 'Exterior Wash — Level 2 (Full Exterior)' where org_id is null and key = 'vehicle_wash';
update public.service_guides set title = 'Interior — Level 2 (Full Interior)' where org_id is null and key = 'vehicle_interior';

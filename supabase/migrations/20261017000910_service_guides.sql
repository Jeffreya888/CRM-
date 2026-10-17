-- Platform default step-by-step service guides. Guides are general best practice; always follow the aircraft/vehicle/vessel manufacturer's maintenance manual and approved products.

insert into public.service_guides (key, asset_type, title, summary, time_estimate, crew, products, tools, prep, steps, donts, quality_checks, photos) values
(
  'exterior_wash',
  'aircraft',
  'Exterior Wash',
  'A full wet wash of the airframe using AMM-approved aircraft cleaner to remove dirt, exhaust soot and bug residue. Sell it as the base service and on a regular schedule (every 2–6 weeks depending on operation) to protect paint and allow inspection.',
  'Piston single 1–2 h · Light jet 2–3 h · Midsize 3–4 h · Large 5–7 h',
  '2–3 technicians',
  array['Aircraft exterior cleaner meeting AMS 1526 (water-based, pH-balanced)', 'Approved bug and leading-edge cleaner', 'Approved exhaust/soot cleaner', 'Acrylic or OEM-approved windshield cleaner', 'Residue-free masking tape (aviation grade)', 'Clean water (deionized for final rinse if available)']::text[],
  array['Low-pressure water supply with fan nozzle (under ~500 psi, preferably garden-hose pressure)', 'Soft wash mops and long-handle brushes', 'Microfiber wash mitts and drying towels', 'Synthetic chamois or water blade (soft silicone)', 'Padded ladders / work stands', 'Approved pitot/static and engine covers with streamers', 'Filtered air blower', 'Water reclaim mat or containment if required']::text[],
  array['Confirm work authorization and scope with the owner/operator and coordinate time, location and any wash-rack rules with the FBO/line service', 'Confirm the aircraft is chocked, grounded where required, no fueling, maintenance or engine runs in progress, and you know who the crew contact is', 'Do a walk-around with the crew/owner and photograph all pre-existing damage and discrepancies before touching the aircraft', 'Set up ramp safety: hi-vis vest, hearing protection, FOD walk, stay clear of propeller arcs, engine intakes/exhausts and moving ground equipment', 'Cover or tape pitot tubes, static ports, AOA vanes, TAT probes, fuel vents, engine inlets/exhausts and APU openings with approved covers or residue-free tape and remove-before-flight streamers', 'Position padded ladders/stands; never lean on or rest equipment against control surfaces, flaps, antennas or static wicks']::text[],
  '[
  {
    "title": "Walk around & photograph pre-existing damage",
    "detail": "Walk the entire aircraft with the crew or owner and photograph dents, chips, paint loss, cracked lenses, missing fasteners and fluid leaks. Note everything on the work order before starting.",
    "caution": "Report any damage or discrepancies to the crew/owner before work begins, not after."
  },
  {
    "title": "Coordinate with FBO, line service & crew",
    "detail": "Confirm where you are allowed to work, water/power availability, runoff rules and the crew''s departure time. Get a crew contact number in case you find a discrepancy.",
    "caution": null
  },
  {
    "title": "Verify chocks, grounding & no fueling in progress",
    "detail": "Check chocks are in place, the aircraft is grounded if the FBO requires it, and no fueling, maintenance or engine run is happening. Do a FOD walk and put on hearing protection and hi-vis.",
    "caution": "Never work near a turning propeller or running engine/APU. Stay out of intake and exhaust danger zones."
  },
  {
    "title": "Cover pitot/static ports & sensors",
    "detail": "Cover pitot tubes, static ports, AOA vanes, TAT probes and fuel vents with approved covers or residue-free tape plus a remove-before-flight streamer. Log every cover you install.",
    "caution": "A missed static-port tape can cause erroneous airspeed/altitude indications. Count covers on and off."
  },
  {
    "title": "Plug engine inlets, exhausts & APU openings",
    "detail": "Install engine inlet and exhaust covers and cover the APU inlet/exhaust so no water, chemical or debris can enter. Turboprops: confirm prop is tied or secured per crew.",
    "caution": null
  },
  {
    "title": "Set padded ladders & stands",
    "detail": "Place padded ladders or work stands with soft contact points and set them so you never need to reach or lean onto the airframe. Reposition rather than overreach.",
    "caution": "Never lean on or brace against control surfaces, flaps, antennas, static wicks or vortex generators. Never move flight controls."
  },
  {
    "title": "Pre-rinse top-down at low pressure",
    "detail": "Rinse from the top of the fuselage downward to float off loose dirt. Keep the nozzle moving and at a shallow angle.",
    "caution": "No high pressure near seals, sensors, windows, antennas, de-ice boots, wheel bearings, gear components or composite edges."
  },
  {
    "title": "Apply AMS 1526 wash solution in sections",
    "detail": "Mix the approved cleaner at the label dilution and apply with mops working one section at a time, top to bottom. Work in the shade when possible.",
    "caution": "Do not let cleaner dry on the surface; it can stain paint and brightwork."
  },
  {
    "title": "Pre-soak leading edges & bug residue",
    "detail": "Apply approved bug remover to wing and stabilizer leading edges, nose and engine nacelle lips and let it dwell per label. Lift residue with a soft microfiber, never a scraper.",
    "caution": null
  },
  {
    "title": "Clean exhaust soot trail with approved cleaner",
    "detail": "Treat the exhaust track on the fuselage or nacelle with approved soot cleaner and soft brushes. Several gentle passes beat one aggressive one.",
    "caution": null
  },
  {
    "title": "Agitate gently with mops & mitts",
    "detail": "Agitate each section with soft mops and microfiber mitts using straight-line strokes in the direction of airflow. Rinse mitts often to avoid dragging grit.",
    "caution": null
  },
  {
    "title": "Rinse thoroughly top-down",
    "detail": "Rinse all cleaner off at low pressure, paying attention to panel seams, hinge lines and drain holes where soap can collect.",
    "caution": null
  },
  {
    "title": "Dry with blower, towels & water blade",
    "detail": "Blow water out of seams, hinge lines and fastener heads with filtered air, then dry with clean microfiber or chamois to prevent spotting.",
    "caution": "Washing can remove lubricant from hinges and bearings; tell the crew so maintenance can relubricate per the AMM."
  },
  {
    "title": "Clean windshield & windows with approved cleaner",
    "detail": "Clean windshields and windows last with the OEM-approved product and a clean, dedicated soft microfiber, using light straight strokes.",
    "caution": "Acrylic: no ammonia, alcohol or abrasive towels. Heated glass windshields use only their approved products."
  },
  {
    "title": "Remove all covers & tape; count them",
    "detail": "Remove every cover, plug and piece of tape and reconcile against your installed list. Check ports are clean and free of adhesive or residue.",
    "caution": "Do not release the aircraft until every remove-before-flight item is accounted for."
  },
  {
    "title": "Final walk-around & report to crew",
    "detail": "Walk the aircraft again, take after photos from the same angles as the before photos and brief the crew/owner. Look for water trapped in control surface gaps and drips from drain holes. Report any new or newly visible discrepancies in writing.",
    "caution": null
  }
]'::jsonb,
  array['Never move flight controls or operate aircraft systems (power, lights, doors, APU) unless explicitly authorized by the crew', 'Never lean on or place equipment against control surfaces, flaps, antennas, static wicks or probes', 'Never use a product that is not approved by the aircraft manufacturer''s maintenance manual (AMM) for that surface', 'Never use high pressure on seals, windows, antennas, de-ice boots, gear, bearings or composite edges', 'Never let wash solution dry on paint, brightwork or windows', 'Never use household detergents, ammonia glass cleaners or degreasers not approved for aircraft', 'Never wash on the ramp without FBO permission and the required runoff containment']::text[],
  array['No soap residue in seams, hinge lines or around fasteners', 'Leading edges free of bug residue', 'No water spots or streaks on paint and windows', 'All covers and tape removed and reconciled', 'No new damage compared with before photos']::text[],
  array['Before: four corners plus nose and tail', 'Before: close-ups of all pre-existing damage', 'Before/after: leading edges and exhaust trail', 'After: same four corners and nose/tail angles', 'Any discrepancy found during the wash']::text[]
),
(
  'dry_wash',
  'aircraft',
  'Dry Wash (Waterless)',
  'Cleaning the airframe with an approved waterless/dry-wash product and microfiber where water is prohibited or unavailable on the ramp. Ideal for FBO ramps, hangars, cold weather and quick turns between flights.',
  'Piston single 1–2 h · Light jet 2–4 h · Midsize 4–5 h · Large 6–9 h',
  '1–3 technicians',
  array['Approved aircraft dry-wash / waterless cleaner (AMM-approved, AMS 1526-compatible)', 'Approved bug and leading-edge cleaner', 'Approved soot/exhaust cleaner', 'OEM-approved windshield cleaner', 'Residue-free masking tape']::text[],
  array['Large stock of plush microfiber towels (several per panel)', 'Pump sprayers with fine mist', 'Mop heads with microfiber covers for high areas', 'Padded ladders / work stands', 'Approved pitot/static covers with streamers', 'Dirty-towel bin']::text[],
  array['Confirm work authorization and scope with the owner/operator and coordinate time, location and any wash-rack rules with the FBO/line service', 'Confirm the aircraft is chocked, grounded where required, no fueling, maintenance or engine runs in progress, and you know who the crew contact is', 'Do a walk-around with the crew/owner and photograph all pre-existing damage and discrepancies before touching the aircraft', 'Set up ramp safety: hi-vis vest, hearing protection, FOD walk, stay clear of propeller arcs, engine intakes/exhausts and moving ground equipment', 'Cover or tape pitot tubes, static ports, AOA vanes, TAT probes, fuel vents, engine inlets/exhausts and APU openings with approved covers or residue-free tape and remove-before-flight streamers', 'Position padded ladders/stands; never lean on or rest equipment against control surfaces, flaps, antennas or static wicks']::text[],
  '[
  {
    "title": "Walk around & photograph pre-existing damage",
    "detail": "Walk the entire aircraft with the crew or owner and photograph dents, chips, paint loss, cracked lenses, missing fasteners and fluid leaks. Note everything on the work order before starting.",
    "caution": "Report any damage or discrepancies to the crew/owner before work begins, not after."
  },
  {
    "title": "Coordinate with FBO, line service & crew",
    "detail": "Confirm where you are allowed to work, water/power availability, runoff rules and the crew''s departure time. Get a crew contact number in case you find a discrepancy.",
    "caution": null
  },
  {
    "title": "Verify chocks, grounding & no fueling in progress",
    "detail": "Check chocks are in place, the aircraft is grounded if the FBO requires it, and no fueling, maintenance or engine run is happening. Do a FOD walk and put on hearing protection and hi-vis.",
    "caution": "Never work near a turning propeller or running engine/APU. Stay out of intake and exhaust danger zones."
  },
  {
    "title": "Cover pitot/static ports & sensors",
    "detail": "Cover pitot tubes, static ports, AOA vanes, TAT probes and fuel vents with approved covers or residue-free tape plus a remove-before-flight streamer. Log every cover you install.",
    "caution": "A missed static-port tape can cause erroneous airspeed/altitude indications. Count covers on and off."
  },
  {
    "title": "Set padded ladders & stands",
    "detail": "Place padded ladders or work stands with soft contact points and set them so you never need to reach or lean onto the airframe. Reposition rather than overreach.",
    "caution": "Never lean on or brace against control surfaces, flaps, antennas, static wicks or vortex generators. Never move flight controls."
  },
  {
    "title": "Assess soil level & choose method",
    "detail": "Dry wash is for light to moderate soil. Heavy grime, exhaust soot and belly oil may need a dedicated cleaner or a wet wash; tell the customer before you start.",
    "caution": null
  },
  {
    "title": "Dust off loose grit first",
    "detail": "Lightly remove loose dust with a clean, soft microfiber duster or mop before applying any product, so grit is not dragged across the paint.",
    "caution": null
  },
  {
    "title": "Mist product on a small section",
    "detail": "Spray an approved dry-wash product on a 2×2 ft section (or onto the towel for areas near probes and seams) and let it encapsulate dirt for a few seconds.",
    "caution": "Never spray directly at pitot/static ports, sensors, vents or into seams."
  },
  {
    "title": "Lift dirt with straight strokes",
    "detail": "Wipe in one direction with a folded microfiber, lifting dirt away instead of scrubbing. Turn to a clean face after every pass.",
    "caution": null
  },
  {
    "title": "Buff off haze with a clean towel",
    "detail": "Immediately follow with a dry, clean microfiber to buff off the residue and leave a streak-free finish.",
    "caution": null
  },
  {
    "title": "Swap towels constantly",
    "detail": "Use a fresh towel as soon as the face looks dirty. Reusing a loaded towel is the main cause of swirl marks on a dry wash.",
    "caution": null
  },
  {
    "title": "Treat leading edges & exhaust separately",
    "detail": "Use approved bug and soot cleaners on leading edges and exhaust tracks with dedicated towels that never go back on clean paint.",
    "caution": null
  },
  {
    "title": "Clean windshield & windows with approved cleaner",
    "detail": "Clean windows last with OEM-approved cleaner and a dedicated soft microfiber.",
    "caution": "Acrylic: no ammonia, alcohol or abrasive towels. Heated glass windshields use only their approved products."
  },
  {
    "title": "Remove all covers & tape; count them",
    "detail": "Remove every cover, plug and piece of tape and reconcile against your installed list. Check ports are clean and free of adhesive or residue.",
    "caution": "Do not release the aircraft until every remove-before-flight item is accounted for."
  },
  {
    "title": "Final walk-around & report to crew",
    "detail": "Walk the aircraft again, take after photos from the same angles as the before photos and brief the crew/owner. Report any new or newly visible discrepancies in writing.",
    "caution": null
  }
]'::jsonb,
  array['Never move flight controls or operate aircraft systems (power, lights, doors, APU) unless explicitly authorized by the crew', 'Never lean on or place equipment against control surfaces, flaps, antennas, static wicks or probes', 'Never use a product that is not approved by the aircraft manufacturer''s maintenance manual (AMM) for that surface', 'Never dry wash heavily soiled or sandy surfaces without pre-dusting; grit will scratch paint', 'Never reuse a dirty towel face or drop towels on the ramp and reuse them', 'Never use dry-wash product on windshields unless the AMM approves it', 'Never spray product into probes, vents, seams or hinge lines']::text[],
  array['Uniform gloss with no streaks or haze', 'No new swirl marks visible in direct light', 'Leading edges and exhaust area clean', 'All covers and tape removed and reconciled']::text[],
  array['Before: four corners plus nose and tail', 'Before: close-ups of pre-existing damage', 'Before/after: a 50/50 test section', 'After: same angles as before photos']::text[]
),
(
  'belly_gear_degrease',
  'aircraft',
  'Belly & Gear Degrease',
  'Removing oil, hydraulic fluid, exhaust residue and grime from the lower fuselage, wheel wells and landing gear using approved cleaners. Sell it with washes on turboprops and jets (oil and exhaust on the belly) and before inspections.',
  'Piston single 1–1.5 h · Light jet 1.5–2.5 h · Midsize 2–3 h · Large 3–5 h',
  '2 technicians',
  array['Aircraft alkaline cleaner/degreaser approved by the AMM (AMS 1526 or AMS 1550-type as specified)', 'Approved solvent-type cleaner for spot oil removal only where the AMM allows', 'Residue-free masking tape and plastic sheeting', 'Absorbent pads and drip pans']::text[],
  array['Low-pressure water supply with fan nozzle', 'Creeper or padded mat for working under the aircraft', 'Soft nylon brushes (no wire brushes)', 'Microfiber towels', 'Pump sprayers', 'Brake and wheel covers / plastic bags', 'Headlamp', 'Chemical-resistant gloves and eye protection']::text[],
  array['Confirm work authorization and scope with the owner/operator and coordinate time, location and any wash-rack rules with the FBO/line service', 'Confirm the aircraft is chocked, grounded where required, no fueling, maintenance or engine runs in progress, and you know who the crew contact is', 'Do a walk-around with the crew/owner and photograph all pre-existing damage and discrepancies before touching the aircraft', 'Set up ramp safety: hi-vis vest, hearing protection, FOD walk, stay clear of propeller arcs, engine intakes/exhausts and moving ground equipment', 'Cover or tape pitot tubes, static ports, AOA vanes, TAT probes, fuel vents, engine inlets/exhausts and APU openings with approved covers or residue-free tape and remove-before-flight streamers', 'Position padded ladders/stands; never lean on or rest equipment against control surfaces, flaps, antennas or static wicks', 'Confirm brakes and wheels are cool and that the aircraft has not just landed']::text[],
  '[
  {
    "title": "Walk around & photograph pre-existing damage",
    "detail": "Walk the entire aircraft with the crew or owner and photograph dents, chips, paint loss, cracked lenses, missing fasteners and fluid leaks. Note everything on the work order before starting.",
    "caution": "Report any damage or discrepancies to the crew/owner before work begins, not after."
  },
  {
    "title": "Coordinate with FBO, line service & crew",
    "detail": "Confirm where you are allowed to work, water/power availability, runoff rules and the crew''s departure time. Get a crew contact number in case you find a discrepancy.",
    "caution": null
  },
  {
    "title": "Verify chocks, grounding & no fueling in progress",
    "detail": "Check chocks are in place, the aircraft is grounded if the FBO requires it, and no fueling, maintenance or engine run is happening. Do a FOD walk and put on hearing protection and hi-vis.",
    "caution": "Never work near a turning propeller or running engine/APU. Stay out of intake and exhaust danger zones."
  },
  {
    "title": "Cover pitot/static ports & sensors",
    "detail": "Cover pitot tubes, static ports, AOA vanes, TAT probes and fuel vents with approved covers or residue-free tape plus a remove-before-flight streamer. Log every cover you install.",
    "caution": "A missed static-port tape can cause erroneous airspeed/altitude indications. Count covers on and off."
  },
  {
    "title": "Confirm brakes & gear are cool",
    "detail": "Let brakes and wheels cool fully after landing before working near them. Hot brakes can flash chemicals and cause burns.",
    "caution": null
  },
  {
    "title": "Mask brakes, wheel bearings & sensors",
    "detail": "Cover brake assemblies, wheel hubs/bearings, wheel speed and proximity sensors, squat switches and electrical connectors with plastic and residue-free tape.",
    "caution": "Never spray degreaser into brake assemblies or wheel bearings; it destroys grease and contaminates pads."
  },
  {
    "title": "Protect hydraulic lines, seals & struts",
    "detail": "Avoid aggressive chemicals on hydraulic lines, actuator seals and chrome oleo struts. Wipe struts only with a clean cloth and the cleaner approved for them.",
    "caution": "Never apply solvent or degreaser to exposed strut chrome or seals."
  },
  {
    "title": "Place absorbent pads & drip pans",
    "detail": "Lay absorbent pads under the work area to catch oil and runoff and keep it out of ramp drains per FBO and environmental rules.",
    "caution": null
  },
  {
    "title": "Apply approved degreaser to belly",
    "detail": "Apply the AMM-approved cleaner at the correct dilution with a pump sprayer, working small sections from rear to front on the belly and exhaust area. Respect dwell time.",
    "caution": "Do not let cleaner dry; keep it off windows, de-ice boots and painted areas longer than the label allows."
  },
  {
    "title": "Agitate with soft nylon brushes",
    "detail": "Use soft nylon brushes to lift oil and soot around drains, access panels and antennas without snagging edges.",
    "caution": "Never use wire brushes or abrasive pads on aircraft skin or gear."
  },
  {
    "title": "Hand-clean wheel wells & gear legs",
    "detail": "Clean wheel wells and gear legs by hand with towels dampened in approved cleaner, keeping product away from masked components and wiring.",
    "caution": null
  },
  {
    "title": "Rinse at low pressure",
    "detail": "Rinse with low-pressure water, aiming away from bearings, brakes, sensors and seals. Wipe any area you cannot safely rinse.",
    "caution": "No high pressure near gear components, bearings, seals, sensors or antennas."
  },
  {
    "title": "Dry belly, wells & gear",
    "detail": "Blow out and towel-dry the belly, wheel wells and gear to prevent water traps and corrosion.",
    "caution": null
  },
  {
    "title": "Remove masking & inspect for leaks",
    "detail": "Remove all masking from brakes, wheels and sensors. Look for fresh hydraulic or oil leaks now visible on clean surfaces.",
    "caution": "Report any leaks, cracks, chafed lines or missing fasteners to the crew immediately."
  },
  {
    "title": "Remove all covers & tape; count them",
    "detail": "Remove every cover, plug and piece of tape and reconcile against your installed list. Check ports are clean and free of adhesive or residue.",
    "caution": "Do not release the aircraft until every remove-before-flight item is accounted for."
  },
  {
    "title": "Final walk-around & report to crew",
    "detail": "Walk the aircraft again, take after photos from the same angles as the before photos and brief the crew/owner. Tell the crew wheel wells and gear were washed so they can check lubrication per the AMM. Report any new or newly visible discrepancies in writing.",
    "caution": null
  }
]'::jsonb,
  array['Never move flight controls or operate aircraft systems (power, lights, doors, APU) unless explicitly authorized by the crew', 'Never lean on or place equipment against control surfaces, flaps, antennas, static wicks or probes', 'Never spray degreaser into brake assemblies, wheel bearings or electrical connectors', 'Never use aggressive solvents on hydraulic lines, seals or strut chrome', 'Never use wire brushes or abrasive pads on skin or gear', 'Never let oily runoff into storm drains; contain and dispose per FBO rules', 'Never work near brakes that are still hot']::text[],
  array['Belly free of oil film and soot streaks', 'Wheel wells and gear legs clean without residue', 'All masking removed from brakes, bearings and sensors', 'Any leaks or discrepancies reported to crew', 'All covers reconciled']::text[],
  array['Before: belly and exhaust track', 'Before: each wheel well and gear leg', 'After: same belly and gear angles', 'Any leak, chafe or damage found']::text[]
),
(
  'brightwork_polish',
  'aircraft',
  'Brightwork Polish',
  'Polishing bare aluminum and other polishable metal (leading edges, spinners, intake lips, trim) to a mirror finish with approved metal polish. Sell to owners of polished leading edges and vintage/polished aircraft, typically every 3–6 months.',
  'Piston single (spinner & trim) 1–3 h · Light jet leading edges 4–8 h · Midsize 6–10 h · Large/full polished airframe multi-day',
  '1–3 technicians',
  array['AMM-approved aircraft metal polish (cutting and finishing grades)', 'Approved cleaner for pre-wash (AMS 1526)', 'Residue-free fine-line masking tape and masking paper', 'Approved protective metal sealant or wax', 'Clean microfiber and cotton polishing cloths']::text[],
  array['Rotary or dual-action polisher with wool/foam metal-polishing pads (if approved)', 'Hand applicators', 'Padded ladders / work stands', 'Nitrile gloves', 'Plenty of clean towels (polish turns black)', 'Good lighting']::text[],
  array['Confirm work authorization and scope with the owner/operator and coordinate time, location and any wash-rack rules with the FBO/line service', 'Confirm the aircraft is chocked, grounded where required, no fueling, maintenance or engine runs in progress, and you know who the crew contact is', 'Do a walk-around with the crew/owner and photograph all pre-existing damage and discrepancies before touching the aircraft', 'Set up ramp safety: hi-vis vest, hearing protection, FOD walk, stay clear of propeller arcs, engine intakes/exhausts and moving ground equipment', 'Cover or tape pitot tubes, static ports, AOA vanes, TAT probes, fuel vents, engine inlets/exhausts and APU openings with approved covers or residue-free tape and remove-before-flight streamers', 'Position padded ladders/stands; never lean on or rest equipment against control surfaces, flaps, antennas or static wicks']::text[],
  '[
  {
    "title": "Walk around & photograph pre-existing damage",
    "detail": "Walk the entire aircraft with the crew or owner and photograph dents, chips, paint loss, cracked lenses, missing fasteners and fluid leaks. Note everything on the work order before starting.",
    "caution": "Report any damage or discrepancies to the crew/owner before work begins, not after."
  },
  {
    "title": "Coordinate with FBO, line service & crew",
    "detail": "Confirm where you are allowed to work, water/power availability, runoff rules and the crew''s departure time. Get a crew contact number in case you find a discrepancy.",
    "caution": null
  },
  {
    "title": "Verify chocks, grounding & no fueling in progress",
    "detail": "Check chocks are in place, the aircraft is grounded if the FBO requires it, and no fueling, maintenance or engine run is happening. Do a FOD walk and put on hearing protection and hi-vis.",
    "caution": "Never work near a turning propeller or running engine/APU. Stay out of intake and exhaust danger zones."
  },
  {
    "title": "Cover pitot/static ports & sensors",
    "detail": "Cover pitot tubes, static ports, AOA vanes, TAT probes and fuel vents with approved covers or residue-free tape plus a remove-before-flight streamer. Log every cover you install.",
    "caution": "A missed static-port tape can cause erroneous airspeed/altitude indications. Count covers on and off."
  },
  {
    "title": "Set padded ladders & stands",
    "detail": "Place padded ladders or work stands with soft contact points and set them so you never need to reach or lean onto the airframe. Reposition rather than overreach.",
    "caution": "Never lean on or brace against control surfaces, flaps, antennas, static wicks or vortex generators. Never move flight controls."
  },
  {
    "title": "Identify polishable vs coated metal",
    "detail": "Confirm which surfaces are bare polishable metal. Clad aluminum, anodized, chromate/alodine-treated and clear-coated surfaces are not all meant to be polished; check the AMM or ask maintenance if unsure.",
    "caution": "Never polish anodized or chromated surfaces that are not meant to be polished; you will remove corrosion protection."
  },
  {
    "title": "Wash & dry the work area",
    "detail": "Wash the brightwork with approved cleaner and dry it so grit is not ground into the metal during polishing.",
    "caution": null
  },
  {
    "title": "Mask adjacent paint, decals & seals",
    "detail": "Mask all paint lines, decals, rubber seals, de-ice boots and rivet lines bordering the metal with fine-line tape and paper.",
    "caution": "Polish compounds stain paint and boots and are hard to remove from seams."
  },
  {
    "title": "Test polish on a small area",
    "detail": "Do a small test spot to choose the least aggressive polish and pad that removes oxidation. Check the result before scaling up.",
    "caution": null
  },
  {
    "title": "Apply cutting polish in small sections",
    "detail": "Work small sections with the cutting grade, using moderate pressure and keeping the pad flat. Wipe off the black residue before it dries.",
    "caution": "Avoid heat build-up at rivet heads, seams and thin edges; keep the machine moving."
  },
  {
    "title": "Refine with finishing polish",
    "detail": "Follow with finishing polish on a clean pad or by hand to remove haze and bring up a mirror finish.",
    "caution": null
  },
  {
    "title": "Wipe off residue & clean seams",
    "detail": "Remove all polish residue with clean towels, then clear dried polish from rivet heads and panel seams with a soft brush.",
    "caution": null
  },
  {
    "title": "Apply approved protectant",
    "detail": "Apply an approved metal sealant or wax to slow re-oxidation, following the cure time on the label.",
    "caution": null
  },
  {
    "title": "Remove masking & clean paint edges",
    "detail": "Pull masking slowly at a low angle and clean any polish that crept onto paint or seals.",
    "caution": null
  },
  {
    "title": "Remove all covers & tape; count them",
    "detail": "Remove every cover, plug and piece of tape and reconcile against your installed list. Check ports are clean and free of adhesive or residue.",
    "caution": "Do not release the aircraft until every remove-before-flight item is accounted for."
  },
  {
    "title": "Final walk-around & report to crew",
    "detail": "Walk the aircraft again, take after photos from the same angles as the before photos and brief the crew/owner. Report any new or newly visible discrepancies in writing.",
    "caution": null
  }
]'::jsonb,
  array['Never move flight controls or operate aircraft systems (power, lights, doors, APU) unless explicitly authorized by the crew', 'Never lean on or place equipment against control surfaces, flaps, antennas, static wicks or probes', 'Never polish anodized, alodined/chromated or clear-coated surfaces not designed to be polished', 'Never use metal polish not approved by the AMM', 'Never let polish residue sit in seams, rivet heads, de-ice boots or on paint', 'Never overheat thin skins, rivet heads or edges with a machine', 'Never use abrasive pads or steel wool on aircraft metal']::text[],
  array['Uniform mirror finish with no haze or swirl', 'No polish residue in seams, rivets or on paint', 'Paint lines and decals undamaged', 'Protectant applied evenly', 'All covers reconciled']::text[],
  array['Before: close-up of oxidation on each polished area', 'Before: masking setup', 'Before/after: 50/50 section', 'After: finished brightwork in good light']::text[]
),
(
  'wax_sealant',
  'aircraft',
  'Wax / Sealant',
  'Applying an AMM-approved aircraft wax or polymer sealant to clean paint to add gloss, UV protection and easier cleaning. Sell after every wash program or quarterly; it pairs well with an exterior wash.',
  'Piston single 1.5–3 h · Light jet 3–5 h · Midsize 5–7 h · Large 8–12 h',
  '2–3 technicians',
  array['AMM-approved aircraft wax or polymer sealant', 'Approved surface prep cleaner / panel wipe', 'AMS 1526 wash solution for pre-wash', 'Residue-free masking tape']::text[],
  array['Foam applicator pads', 'Dual-action polisher with soft finishing pads (optional)', 'Plush microfiber buffing towels', 'Padded ladders / work stands', 'Approved pitot/static covers', 'Inspection light']::text[],
  array['Confirm work authorization and scope with the owner/operator and coordinate time, location and any wash-rack rules with the FBO/line service', 'Confirm the aircraft is chocked, grounded where required, no fueling, maintenance or engine runs in progress, and you know who the crew contact is', 'Do a walk-around with the crew/owner and photograph all pre-existing damage and discrepancies before touching the aircraft', 'Set up ramp safety: hi-vis vest, hearing protection, FOD walk, stay clear of propeller arcs, engine intakes/exhausts and moving ground equipment', 'Cover or tape pitot tubes, static ports, AOA vanes, TAT probes, fuel vents, engine inlets/exhausts and APU openings with approved covers or residue-free tape and remove-before-flight streamers', 'Position padded ladders/stands; never lean on or rest equipment against control surfaces, flaps, antennas or static wicks', 'Aircraft must be freshly washed and fully dry; work in shade or hangar, panels cool to the touch']::text[],
  '[
  {
    "title": "Walk around & photograph pre-existing damage",
    "detail": "Walk the entire aircraft with the crew or owner and photograph dents, chips, paint loss, cracked lenses, missing fasteners and fluid leaks. Note everything on the work order before starting.",
    "caution": "Report any damage or discrepancies to the crew/owner before work begins, not after."
  },
  {
    "title": "Coordinate with FBO, line service & crew",
    "detail": "Confirm where you are allowed to work, water/power availability, runoff rules and the crew''s departure time. Get a crew contact number in case you find a discrepancy.",
    "caution": null
  },
  {
    "title": "Verify chocks, grounding & no fueling in progress",
    "detail": "Check chocks are in place, the aircraft is grounded if the FBO requires it, and no fueling, maintenance or engine run is happening. Do a FOD walk and put on hearing protection and hi-vis.",
    "caution": "Never work near a turning propeller or running engine/APU. Stay out of intake and exhaust danger zones."
  },
  {
    "title": "Cover pitot/static ports & sensors",
    "detail": "Cover pitot tubes, static ports, AOA vanes, TAT probes and fuel vents with approved covers or residue-free tape plus a remove-before-flight streamer. Log every cover you install.",
    "caution": "A missed static-port tape can cause erroneous airspeed/altitude indications. Count covers on and off."
  },
  {
    "title": "Set padded ladders & stands",
    "detail": "Place padded ladders or work stands with soft contact points and set them so you never need to reach or lean onto the airframe. Reposition rather than overreach.",
    "caution": "Never lean on or brace against control surfaces, flaps, antennas, static wicks or vortex generators. Never move flight controls."
  },
  {
    "title": "Confirm aircraft is clean, dry & cool",
    "detail": "Wax goes only on clean, dry paint that is cool to the touch. Wash first if needed and work in shade or a hangar.",
    "caution": null
  },
  {
    "title": "Mask boots, windows, seals & decals",
    "detail": "Mask de-ice boots, windows, rubber seals, antennas and textured decals so wax does not stain or build up on them.",
    "caution": "Wax on de-ice boots or windows can affect performance and visibility."
  },
  {
    "title": "Apply thin coat panel by panel",
    "detail": "Apply a thin, even layer with a foam applicator or DA polisher one panel at a time, following the airflow direction.",
    "caution": "Thicker is not better; heavy coats are hard to remove and leave residue in seams."
  },
  {
    "title": "Allow haze per label",
    "detail": "Let the product haze for the time on the label; do a swipe test with a finger before removing.",
    "caution": null
  },
  {
    "title": "Buff off with clean microfiber",
    "detail": "Buff off with plush microfiber, turning to a clean face often. Use a second towel for a final wipe.",
    "caution": null
  },
  {
    "title": "Clear residue from seams & rivets",
    "detail": "Remove white residue from panel seams, rivet heads and fasteners with a soft detail brush.",
    "caution": null
  },
  {
    "title": "Inspect under light for high spots",
    "detail": "Check each panel with an inspection light for streaks or high spots and re-wipe as needed.",
    "caution": null
  },
  {
    "title": "Remove masking",
    "detail": "Remove masking and clean any wax that reached boots, windows or seals with the approved cleaner for that surface.",
    "caution": null
  },
  {
    "title": "Remove all covers & tape; count them",
    "detail": "Remove every cover, plug and piece of tape and reconcile against your installed list. Check ports are clean and free of adhesive or residue.",
    "caution": "Do not release the aircraft until every remove-before-flight item is accounted for."
  },
  {
    "title": "Final walk-around & report to crew",
    "detail": "Walk the aircraft again, take after photos from the same angles as the before photos and brief the crew/owner. Advise the crew of any cure time before flying through rain. Report any new or newly visible discrepancies in writing.",
    "caution": null
  }
]'::jsonb,
  array['Never move flight controls or operate aircraft systems (power, lights, doors, APU) unless explicitly authorized by the crew', 'Never lean on or place equipment against control surfaces, flaps, antennas, static wicks or probes', 'Never use a product that is not approved by the aircraft manufacturer''s maintenance manual (AMM) for that surface', 'Never wax de-ice boots, windshields or windows', 'Never apply wax in direct sun or on hot panels', 'Never leave residue in seams, rivets or around probes', 'Never use automotive waxes containing silicone or abrasives unless approved by the AMM']::text[],
  array['Uniform deep gloss with no streaks or high spots', 'No residue in seams, rivets or decal edges', 'Boots, windows and seals free of wax', 'Water beads evenly on treated panels', 'All covers reconciled']::text[],
  array['Before: four corners and nose/tail', 'Before: close-ups of pre-existing damage', 'After: gloss reflection shots', 'After: same four corners and nose/tail']::text[]
),
(
  'ceramic_coating',
  'aircraft',
  'Ceramic Coating',
  'A multi-step service that decontaminates, prepares and coats paint (and approved brightwork) with an aviation-approved ceramic/SiO2 coating for long-term protection and easier cleaning. Premium upsell after paint correction or on new paint.',
  'Piston single 1–2 days · Light jet 2–3 days · Midsize 3–4 days · Large 4–7 days (plus cure time)',
  '2–4 technicians',
  array['Aviation-approved ceramic coating (OEM/AMM-compatible)', 'AMS 1526 wash solution', 'Iron/fallout remover safe for aircraft paint', 'Clay bar or synthetic clay mitt with lubricant', 'Panel prep / IPA-free or approved surface prep wipe', 'Finishing polish if correction needed', 'Residue-free masking tape']::text[],
  array['Low-pressure wash setup', 'Dual-action polisher and pads', 'Coating applicator blocks and suede cloths', 'Plush leveling microfiber towels', 'Inspection lights / swirl finder', 'Paint thickness gauge', 'Padded ladders / stands', 'Nitrile gloves and respirator per coating SDS']::text[],
  array['Confirm work authorization and scope with the owner/operator and coordinate time, location and any wash-rack rules with the FBO/line service', 'Confirm the aircraft is chocked, grounded where required, no fueling, maintenance or engine runs in progress, and you know who the crew contact is', 'Do a walk-around with the crew/owner and photograph all pre-existing damage and discrepancies before touching the aircraft', 'Set up ramp safety: hi-vis vest, hearing protection, FOD walk, stay clear of propeller arcs, engine intakes/exhausts and moving ground equipment', 'Cover or tape pitot tubes, static ports, AOA vanes, TAT probes, fuel vents, engine inlets/exhausts and APU openings with approved covers or residue-free tape and remove-before-flight streamers', 'Position padded ladders/stands; never lean on or rest equipment against control surfaces, flaps, antennas or static wicks', 'Book hangar space: the aircraft must stay out of rain, dew and contamination during cure']::text[],
  '[
  {
    "title": "Walk around & photograph pre-existing damage",
    "detail": "Walk the entire aircraft with the crew or owner and photograph dents, chips, paint loss, cracked lenses, missing fasteners and fluid leaks. Note everything on the work order before starting.",
    "caution": "Report any damage or discrepancies to the crew/owner before work begins, not after."
  },
  {
    "title": "Coordinate with FBO, line service & crew",
    "detail": "Confirm where you are allowed to work, water/power availability, runoff rules and the crew''s departure time. Get a crew contact number in case you find a discrepancy.",
    "caution": null
  },
  {
    "title": "Verify chocks, grounding & no fueling in progress",
    "detail": "Check chocks are in place, the aircraft is grounded if the FBO requires it, and no fueling, maintenance or engine run is happening. Do a FOD walk and put on hearing protection and hi-vis.",
    "caution": "Never work near a turning propeller or running engine/APU. Stay out of intake and exhaust danger zones."
  },
  {
    "title": "Cover pitot/static ports & sensors",
    "detail": "Cover pitot tubes, static ports, AOA vanes, TAT probes and fuel vents with approved covers or residue-free tape plus a remove-before-flight streamer. Log every cover you install.",
    "caution": "A missed static-port tape can cause erroneous airspeed/altitude indications. Count covers on and off."
  },
  {
    "title": "Plug engine inlets, exhausts & APU openings",
    "detail": "Install engine inlet and exhaust covers and cover the APU inlet/exhaust so no water, chemical or debris can enter. Turboprops: confirm prop is tied or secured per crew.",
    "caution": null
  },
  {
    "title": "Set padded ladders & stands",
    "detail": "Place padded ladders or work stands with soft contact points and set them so you never need to reach or lean onto the airframe. Reposition rather than overreach.",
    "caution": "Never lean on or brace against control surfaces, flaps, antennas, static wicks or vortex generators. Never move flight controls."
  },
  {
    "title": "Wash with AMS 1526 cleaner",
    "detail": "Perform a full exterior wash and dry so the surface is free of loose dirt and grime.",
    "caution": null
  },
  {
    "title": "Decontaminate: iron remover & clay",
    "detail": "Apply an approved fallout remover, rinse, then clay with plenty of lubricant to remove bonded contamination. Rinse and dry again.",
    "caution": "Keep decon chemicals off windows, boots, seals and brightwork unless approved."
  },
  {
    "title": "Measure paint & correct defects",
    "detail": "Take paint readings and polish out swirls and oxidation so the coating locks in a clean finish. Coating does not hide defects.",
    "caution": "Never polish thin readings, composite edges or across rivet heads and seams with heat."
  },
  {
    "title": "Mask boots, windows, rubber & seals",
    "detail": "Mask de-ice boots, windshields, windows, rubber seals, antennas and sensors. The coating is not applied to these surfaces.",
    "caution": "Ceramic on de-ice boots, windows or rubber can cause damage or visibility problems."
  },
  {
    "title": "Panel wipe to remove oils",
    "detail": "Wipe each panel with the approved surface prep so polishing oils and wax are removed and the coating can bond.",
    "caution": null
  },
  {
    "title": "Apply coating in small sections",
    "detail": "Apply in roughly 2×2 ft sections with a cross-hatch pattern using the coating applicator, following the manufacturer''s flash time.",
    "caution": null
  },
  {
    "title": "Level & remove high spots",
    "detail": "Level with a clean microfiber at the right flash time, then a second towel to buff. Check with a light for high spots before moving on.",
    "caution": "High spots that cure become hard to remove and may need polishing."
  },
  {
    "title": "Keep aircraft dry for full cure",
    "detail": "Keep the aircraft in the hangar out of rain, dew and washing for the coating''s initial cure (typically 12–24 h; full cure longer).",
    "caution": null
  },
  {
    "title": "Remove all covers & tape; count them",
    "detail": "Remove every cover, plug and piece of tape and reconcile against your installed list. Check ports are clean and free of adhesive or residue.",
    "caution": "Do not release the aircraft until every remove-before-flight item is accounted for."
  },
  {
    "title": "Final walk-around & report to crew",
    "detail": "Walk the aircraft again, take after photos from the same angles as the before photos and brief the crew/owner. Give the owner written aftercare: no washing for the full cure period and only approved pH-neutral cleaners. Report any new or newly visible discrepancies in writing.",
    "caution": null
  }
]'::jsonb,
  array['Never move flight controls or operate aircraft systems (power, lights, doors, APU) unless explicitly authorized by the crew', 'Never lean on or place equipment against control surfaces, flaps, antennas, static wicks or probes', 'Never use a product that is not approved by the aircraft manufacturer''s maintenance manual (AMM) for that surface', 'Never apply ceramic to de-ice boots, windows, windshields, rubber seals or sensors', 'Never coat over unwashed, uncorrected or oily paint', 'Never let the aircraft be exposed to rain or dew before initial cure', 'Never leave high spots to cure', 'Never polish thin paint or composite edges to prep for coating']::text[],
  array['Even gloss with no high spots or streaks under inspection light', 'Masked surfaces free of coating', 'Water beads and sheets evenly after cure', 'Paint readings logged before and after correction', 'Aftercare instructions handed to owner']::text[],
  array['Before: four corners and nose/tail', 'Before: close-ups of defects and paint readings', 'During: 50/50 correction section', 'After: gloss and water-beading shots', 'After: same four corners']::text[]
),
(
  'paint_correction',
  'aircraft',
  'Paint Correction',
  'Machine compounding and polishing aircraft paint to remove oxidation, swirls and light scratches after measuring paint depth. Sell to owners with dull or oxidized paint, before ceramic coating, or before a sale.',
  'Piston single 1–2 days · Light jet 2–4 days · Midsize 4–6 days · Large 6–10 days',
  '2–4 technicians',
  array['AMM-approved compound (heavy cut) and finishing polish', 'AMS 1526 wash solution', 'Clay bar or synthetic clay mitt with lubricant', 'Approved panel prep wipe', 'Fine-line masking tape', 'Approved wax, sealant or ceramic for protection']::text[],
  array['Paint thickness gauge (ferrous/non-ferrous capable; note composites need ultrasonic gauge)', 'Dual-action and rotary polishers', 'Wool, microfiber and foam cutting/polishing pads', 'Pad brush / compressed air for pad cleaning', 'Inspection lights / swirl finder', 'Padded ladders / stands', 'Respirator and eye protection']::text[],
  array['Confirm work authorization and scope with the owner/operator and coordinate time, location and any wash-rack rules with the FBO/line service', 'Confirm the aircraft is chocked, grounded where required, no fueling, maintenance or engine runs in progress, and you know who the crew contact is', 'Do a walk-around with the crew/owner and photograph all pre-existing damage and discrepancies before touching the aircraft', 'Set up ramp safety: hi-vis vest, hearing protection, FOD walk, stay clear of propeller arcs, engine intakes/exhausts and moving ground equipment', 'Cover or tape pitot tubes, static ports, AOA vanes, TAT probes, fuel vents, engine inlets/exhausts and APU openings with approved covers or residue-free tape and remove-before-flight streamers', 'Position padded ladders/stands; never lean on or rest equipment against control surfaces, flaps, antennas or static wicks']::text[],
  '[
  {
    "title": "Walk around & photograph pre-existing damage",
    "detail": "Walk the entire aircraft with the crew or owner and photograph dents, chips, paint loss, cracked lenses, missing fasteners and fluid leaks. Note everything on the work order before starting.",
    "caution": "Report any damage or discrepancies to the crew/owner before work begins, not after."
  },
  {
    "title": "Coordinate with FBO, line service & crew",
    "detail": "Confirm where you are allowed to work, water/power availability, runoff rules and the crew''s departure time. Get a crew contact number in case you find a discrepancy.",
    "caution": null
  },
  {
    "title": "Verify chocks, grounding & no fueling in progress",
    "detail": "Check chocks are in place, the aircraft is grounded if the FBO requires it, and no fueling, maintenance or engine run is happening. Do a FOD walk and put on hearing protection and hi-vis.",
    "caution": "Never work near a turning propeller or running engine/APU. Stay out of intake and exhaust danger zones."
  },
  {
    "title": "Cover pitot/static ports & sensors",
    "detail": "Cover pitot tubes, static ports, AOA vanes, TAT probes and fuel vents with approved covers or residue-free tape plus a remove-before-flight streamer. Log every cover you install.",
    "caution": "A missed static-port tape can cause erroneous airspeed/altitude indications. Count covers on and off."
  },
  {
    "title": "Set padded ladders & stands",
    "detail": "Place padded ladders or work stands with soft contact points and set them so you never need to reach or lean onto the airframe. Reposition rather than overreach.",
    "caution": "Never lean on or brace against control surfaces, flaps, antennas, static wicks or vortex generators. Never move flight controls."
  },
  {
    "title": "Wash & decontaminate the paint",
    "detail": "Wash with approved cleaner, then clay to remove bonded contamination so it is not ground into the paint.",
    "caution": null
  },
  {
    "title": "Take paint depth readings & map",
    "detail": "Measure paint depth on every panel and record it. Mark thin areas, repaints, composite panels and edges as no-machine or light-polish only.",
    "caution": "Thin readings, composite edges and repaired areas can burn through quickly."
  },
  {
    "title": "Mask edges, seams, decals & boots",
    "detail": "Mask panel edges, rivet lines, seams, decals, rubber seals, de-ice boots and windows.",
    "caution": null
  },
  {
    "title": "Do a test spot",
    "detail": "Pick a representative area and start with the least aggressive pad and polish. Increase cut only if the test spot needs it.",
    "caution": null
  },
  {
    "title": "Compound in small sections",
    "detail": "Work 1×1 to 2×2 ft sections with slow arm speed, overlapping passes and the pad flat. Wipe and inspect each section, and clean the pad after every section; loaded pads cut unevenly and build heat.",
    "caution": "Never sand thin paint or composite edges. Avoid heat at rivet heads and seams; keep the machine moving."
  },
  {
    "title": "Polish to refine finish",
    "detail": "Follow with a finishing polish and soft pad to remove compounding haze and restore clarity.",
    "caution": null
  },
  {
    "title": "Inspect with lights & re-measure",
    "detail": "Check every panel with an inspection light and re-measure paint depth on worked areas. Record final readings.",
    "caution": null
  },
  {
    "title": "Remove residue & masking",
    "detail": "Panel wipe to remove polishing oils, clear residue from seams and rivets, then remove masking.",
    "caution": null
  },
  {
    "title": "Apply protection",
    "detail": "Protect the corrected paint with an approved wax, sealant or ceramic coating.",
    "caution": null
  },
  {
    "title": "Remove all covers & tape; count them",
    "detail": "Remove every cover, plug and piece of tape and reconcile against your installed list. Check ports are clean and free of adhesive or residue.",
    "caution": "Do not release the aircraft until every remove-before-flight item is accounted for."
  },
  {
    "title": "Final walk-around & report to crew",
    "detail": "Walk the aircraft again, take after photos from the same angles as the before photos and brief the crew/owner. Report any new or newly visible discrepancies in writing.",
    "caution": null
  }
]'::jsonb,
  array['Never move flight controls or operate aircraft systems (power, lights, doors, APU) unless explicitly authorized by the crew', 'Never lean on or place equipment against control surfaces, flaps, antennas, static wicks or probes', 'Never use a product that is not approved by the aircraft manufacturer''s maintenance manual (AMM) for that surface', 'Never machine polish without measuring paint depth first', 'Never wet-sand or heavy-cut thin paint, repaints or composite edges', 'Never dwell on rivet heads, seams or edges with heat', 'Never polish over decals, stencils or placards required by regulation', 'Never leave compound residue in seams or fasteners']::text[],
  array['Defects removed or reduced as agreed, with uniform gloss', 'No holograms or haze under inspection light', 'No burn-through or edge wear', 'Before/after paint readings recorded', 'All covers reconciled']::text[],
  array['Before: close-ups of oxidation and swirls in direct light', 'Before: paint depth map / readings', 'During: 50/50 test spot', 'After: same panels in the same light', 'After: four corners']::text[]
),
(
  'interior_detail',
  'aircraft',
  'Interior Detail',
  'Complete cabin and cockpit cleaning: vacuum, wipe-down, leather, veneer, lav and galley sanitation, using products safe for aircraft materials. Sell between trips, after charters and before owner flights.',
  'Piston single 1–2 h · Light jet 2–4 h · Midsize 4–6 h · Large 6–10 h',
  '1–3 technicians',
  array['Aircraft-approved all-purpose interior cleaner (low VOC, non-flammable)', 'pH-neutral leather cleaner and conditioner', 'Veneer/wood-safe cleaner (no silicone)', 'OEM-approved acrylic window cleaner', 'Hospital-grade disinfectant approved for aircraft lav/galley surfaces', 'Fabric spot cleaner tested for fire-blocking materials']::text[],
  array['HEPA vacuum with soft brush and crevice tools', 'Color-coded microfiber towels (lav, galley, cabin, leather)', 'Soft detail brushes', 'Low-moisture extractor for spot work', 'Gloves', 'Trash bags', 'Protective runners']::text[],
  array['Confirm work authorization and scope with the owner/operator and coordinate cabin access and power (GPU/hangar power) with the FBO and crew', 'Confirm aircraft is chocked, no fueling or maintenance in progress, and that you will not operate any aircraft systems unless authorized', 'Photograph the cabin and cockpit as found, including existing stains, wear, scratches in veneer and any inoperative items', 'Lay protective runners at the entry door and airstair; cover sill and door seal', 'Cover yokes/sidesticks, throttle quadrant, avionics displays and switch panels with clean, lint-free covers or plastic sheeting']::text[],
  '[
  {
    "title": "Photograph cabin & cockpit as found",
    "detail": "Photograph every seat, panel, carpet area, lav and galley, and note existing stains, wear and damage on the work order.",
    "caution": "Report any damage or inoperative items to the crew/owner before you start."
  },
  {
    "title": "Coordinate cabin access & power",
    "detail": "Confirm with crew/FBO when you can access the cabin and whether a GPU or hangar power is available. Do not switch on aircraft systems yourself unless authorized.",
    "caution": null
  },
  {
    "title": "Protect yokes, avionics & switches",
    "detail": "Cover yokes/sidesticks, throttle quadrant, avionics displays and switch panels. Never change switch positions or move flight controls.",
    "caution": "Never spray liquids near or into avionics, switch panels or circuit breaker panels."
  },
  {
    "title": "Remove trash, linens & loose items",
    "detail": "Remove trash, catering waste and linens. Bag the owner''s personal items, photograph where they were and store them safely.",
    "caution": null
  },
  {
    "title": "Vacuum top-down: headliner to carpet",
    "detail": "Vacuum headliner, sidewalls, seats, tracks and carpet with a HEPA vacuum and soft brush, getting into seat tracks and side ledges.",
    "caution": null
  },
  {
    "title": "Wipe hard surfaces with towel-applied cleaner",
    "detail": "Spray cleaner onto the towel, never onto the surface, and wipe tables, sidewalls, PSUs and trim.",
    "caution": null
  },
  {
    "title": "Clean & condition leather",
    "detail": "Clean leather with pH-neutral cleaner and soft brush, wipe dry, then apply conditioner sparingly and buff.",
    "caution": "Test first; avoid soaking perforated leather or stitching."
  },
  {
    "title": "Clean veneer & high-gloss trim",
    "detail": "Dust and clean wood veneer and piano-black trim with a dedicated soft microfiber and a veneer-safe cleaner. Use light pressure.",
    "caution": "No ammonia, silicone or abrasive products on veneer; it scratches easily."
  },
  {
    "title": "Sanitize lav: bowl, sink & surfaces",
    "detail": "Clean and disinfect the lav with dedicated towels and approved disinfectant, following dwell time. Do not service the waste system unless trained and authorized.",
    "caution": null
  },
  {
    "title": "Clean & sanitize galley",
    "detail": "Clean galley inserts, counters, drawers and coffee maker exteriors with food-safe approved cleaner and dedicated towels.",
    "caution": null
  },
  {
    "title": "Spot-treat fabrics with tested cleaner",
    "detail": "Spot clean fabric seats and carpets with low moisture after testing an inconspicuous area. Blot, do not scrub.",
    "caution": "Seat and panel fabrics are fire-blocking certified; do not use unapproved chemicals that could affect flammability."
  },
  {
    "title": "Clean cabin windows with approved cleaner",
    "detail": "Clean windows and shades with OEM-approved acrylic cleaner and a soft dedicated microfiber.",
    "caution": "No ammonia, alcohol or paper towels on acrylic windows."
  },
  {
    "title": "Wipe cockpit with care",
    "detail": "In the cockpit, dust displays with a dry soft microfiber or approved screen cleaner applied to the cloth. Wipe glareshield and side consoles lightly.",
    "caution": "Never move flight controls, change switches, breakers or avionics settings."
  },
  {
    "title": "Remove covers & reset cabin",
    "detail": "Remove protective covers and runners, reset seats and amenities to the crew''s standard and replace linens if supplied.",
    "caution": null
  },
  {
    "title": "Final inspection & report to crew",
    "detail": "Walk the cabin with the crew, take after photos from the same angles and report any damage or inoperative items found.",
    "caution": null
  }
]'::jsonb,
  array['Never spray liquids directly into or near avionics, switch panels or breakers', 'Never move flight controls or change switch, breaker or avionics settings', 'Never operate aircraft systems (power, lighting, lav, doors) unless authorized', 'Never use ammonia, alcohol or paper towels on acrylic windows', 'Never use unapproved chemicals on fire-blocking upholstery or carpets', 'Never cross-contaminate: lav towels never go to the galley or cabin']::text[],
  array['No dust, crumbs or debris in seat tracks and side ledges', 'Leather clean, conditioned, no greasy residue', 'Veneer streak-free with no new scratches', 'Lav and galley sanitized and smelling neutral', 'Cockpit switches and settings untouched, covers removed']::text[],
  array['Before: each cabin zone and cockpit', 'Before: close-ups of stains and damage', 'Before/after: lav and galley', 'After: each cabin zone from same angles']::text[]
),
(
  'carpet_extraction',
  'aircraft',
  'Carpet Extraction',
  'Low-moisture hot-water extraction of cabin carpet and runners to remove embedded soil and stains while protecting the floor and fire-blocking materials. Sell annually or after heavy use, spills or pet travel.',
  'Light jet 1.5–3 h · Midsize 3–4 h · Large 4–6 h (plus drying)',
  '1–2 technicians',
  array['Low-foam, pH-balanced carpet pre-spray tested for aircraft carpets', 'Acid rinse / neutralizer', 'Spot and stain removers (protein, tannin, oil)', 'Carpet protector if approved']::text[],
  array['Portable low-moisture extractor with upholstery and floor wands', 'HEPA vacuum with beater bar', 'Carpet grooming brush', 'Air movers / dehumidifier', 'Protective runners and plastic', 'Moisture meter']::text[],
  array['Confirm work authorization and scope with the owner/operator and coordinate cabin access and power (GPU/hangar power) with the FBO and crew', 'Confirm aircraft is chocked, no fueling or maintenance in progress, and that you will not operate any aircraft systems unless authorized', 'Photograph the cabin and cockpit as found, including existing stains, wear, scratches in veneer and any inoperative items', 'Lay protective runners at the entry door and airstair; cover sill and door seal', 'Cover yokes/sidesticks, throttle quadrant, avionics displays and switch panels with clean, lint-free covers or plastic sheeting']::text[],
  '[
  {
    "title": "Photograph carpet & stains as found",
    "detail": "Photograph each carpet zone and every stain before you start and note any wear, delamination or seams lifting.",
    "caution": "Report damage to the crew/owner before work begins."
  },
  {
    "title": "Coordinate power, access & drying time",
    "detail": "Confirm power source and that the aircraft can stay open or ventilated for drying. Do not use aircraft power or systems unless authorized.",
    "caution": null
  },
  {
    "title": "Protect avionics, seats & sidewalls",
    "detail": "Cover cockpit pedestal, avionics and seat bases and tape plastic along sidewalls and cabinetry so overspray cannot reach them.",
    "caution": null
  },
  {
    "title": "Remove loose items & runners",
    "detail": "Remove floor mats and runners for separate cleaning. Do not remove seats or floor panels unless maintenance authorizes it.",
    "caution": null
  },
  {
    "title": "Vacuum thoroughly",
    "detail": "Vacuum slowly in two directions to lift dry soil; this does most of the cleaning.",
    "caution": null
  },
  {
    "title": "Test cleaner in a hidden area",
    "detail": "Test the pre-spray in an inconspicuous spot for colorfastness and shrinkage, especially on wool carpets.",
    "caution": null
  },
  {
    "title": "Pre-treat stains & traffic lanes",
    "detail": "Mist pre-spray on traffic lanes and use the right spotter for each stain type. Let dwell per label and agitate gently.",
    "caution": null
  },
  {
    "title": "Extract with minimal moisture",
    "detail": "Extract using light water passes and more dry (vacuum-only) passes. The goal is a damp, not wet, carpet.",
    "caution": "Don''t soak the carpet: water can wick into floor panels, wiring and pad and cause corrosion or odors."
  },
  {
    "title": "Rinse with neutralizer",
    "detail": "Do a light rinse pass with acid rinse so no sticky residue is left to attract soil.",
    "caution": null
  },
  {
    "title": "Groom carpet pile",
    "detail": "Groom the pile in one direction with a carpet brush for a uniform appearance and faster drying.",
    "caution": null
  },
  {
    "title": "Speed dry with air movers",
    "detail": "Run air movers and ventilation until the carpet is dry to the touch. Check with a moisture meter.",
    "caution": "Do not close up a wet aircraft; mold and odor will follow."
  },
  {
    "title": "Remove protection & final walk-through",
    "detail": "Remove plastic and covers, reinstall runners when dry, take after photos and brief the crew on any stains that did not fully release.",
    "caution": null
  }
]'::jsonb,
  array['Never soak the carpet or let water reach floor panels and wiring', 'Never use high-foam or household carpet shampoo', 'Never spray near avionics or electrical connections', 'Never close the aircraft while carpet is wet', 'Never remove seats or floor panels without maintenance authorization', 'Never use chemicals that may affect fire-blocking certification']::text[],
  array['Carpet dry to the touch and verified with moisture meter', 'Stains removed or reduced as agreed', 'Pile groomed and uniform', 'No residue or crunchy feel', 'Avionics and seat bases free of overspray']::text[],
  array['Before: each carpet zone', 'Before: close-ups of stains', 'After: same zones and stains', 'Moisture meter reading at completion']::text[]
),
(
  'leather_care',
  'aircraft',
  'Leather Deep Clean & Condition',
  'Deep cleaning and conditioning of cabin and cockpit leather seats and trim to remove body oils, dye transfer and grime while keeping the leather soft. Sell every 3–6 months or with an interior detail.',
  'Piston single 0.5–1 h · Light jet 1.5–3 h · Midsize 3–4 h · Large 4–6 h',
  '1–2 technicians',
  array['pH-neutral leather cleaner', 'Water-based leather conditioner / protectant (non-greasy, no silicone)', 'Dye-transfer remover for leather (test first)', 'Aircraft-approved interior cleaner for surrounding trim']::text[],
  array['Soft horsehair leather brushes', 'White microfiber towels', 'Foam applicators', 'HEPA vacuum with soft brush', 'Detail brushes for stitching']::text[],
  array['Confirm work authorization and scope with the owner/operator and coordinate cabin access and power (GPU/hangar power) with the FBO and crew', 'Confirm aircraft is chocked, no fueling or maintenance in progress, and that you will not operate any aircraft systems unless authorized', 'Photograph the cabin and cockpit as found, including existing stains, wear, scratches in veneer and any inoperative items', 'Lay protective runners at the entry door and airstair; cover sill and door seal', 'Cover yokes/sidesticks, throttle quadrant, avionics displays and switch panels with clean, lint-free covers or plastic sheeting']::text[],
  '[
  {
    "title": "Photograph leather condition",
    "detail": "Photograph each seat and panel, including cracks, wear, dye loss and stains, and note them on the work order.",
    "caution": "Report damage to the crew/owner before you begin."
  },
  {
    "title": "Protect avionics & adjacent surfaces",
    "detail": "Cover avionics, switches and veneer near the seats. Never move flight controls or adjust crew seats with powered controls unless authorized.",
    "caution": null
  },
  {
    "title": "Identify leather type & finish",
    "detail": "Check whether the leather is finished (coated), semi-aniline or aniline. Aniline and nubuck need specialist products and minimal moisture.",
    "caution": null
  },
  {
    "title": "Vacuum seams & perforations",
    "detail": "Vacuum seams, piping and perforations with a soft brush to remove grit before wet cleaning.",
    "caution": null
  },
  {
    "title": "Test cleaner in a hidden spot",
    "detail": "Test the cleaner on a hidden area and check for color transfer onto a white towel.",
    "caution": null
  },
  {
    "title": "Clean with foamed cleaner & soft brush",
    "detail": "Apply cleaner to the brush, not the leather, and work small areas in light circles. Wipe immediately with a clean white towel.",
    "caution": "Avoid soaking perforated leather, stitching or seat foam."
  },
  {
    "title": "Treat dye transfer & stubborn spots",
    "detail": "Use dye-transfer remover sparingly on stained areas only, after a test spot, and wipe clean.",
    "caution": null
  },
  {
    "title": "Dry fully before conditioning",
    "detail": "Let the leather air-dry or wipe with a dry towel so it is fully dry before conditioner goes on.",
    "caution": null
  },
  {
    "title": "Apply conditioner thinly & buff",
    "detail": "Apply a thin coat of conditioner with a foam applicator, let it absorb per label, then buff to a natural satin finish.",
    "caution": "Excess conditioner leaves a greasy film that transfers to clothing."
  },
  {
    "title": "Clean surrounding trim",
    "detail": "Wipe adjacent plastic and seat hardware with an approved interior cleaner applied to the towel.",
    "caution": null
  },
  {
    "title": "Final inspection & report",
    "detail": "Inspect under good light, take after photos and report any cracking, dye loss or wear needing professional repair.",
    "caution": null
  }
]'::jsonb,
  array['Never use household cleaners, alcohol, solvents or magic erasers on aircraft leather', 'Never soak perforated leather or seat foam', 'Never use silicone-based or greasy dressings', 'Never spray products near avionics or switches', 'Never adjust powered crew seats or move flight controls without authorization']::text[],
  array['Even satin finish with no greasy residue', 'No color transfer on a clean white towel', 'Seams and perforations free of grime', 'Surrounding trim clean and undamaged']::text[],
  array['Before: each seat front and side', 'Before: close-ups of stains, wear and cracks', 'Before/after: 50/50 on a cushion', 'After: each seat from same angles']::text[]
),
(
  'deice_boot_treatment',
  'aircraft',
  'De-Ice Boot Treatment',
  'Cleaning and treating pneumatic rubber de-ice boots with manufacturer-approved cleaners and protectants (e.g., ICEX-type treatments) to restore appearance, protect from ozone/UV and reduce ice adhesion. Sell before winter and with exterior washes on turboprops and boot-equipped piston twins and jets.',
  'Piston twin 1–1.5 h · Turboprop 1.5–3 h · Light/midsize jet with boots 2–3 h',
  '1–2 technicians',
  array['De-ice boot manufacturer-approved cleaner (mild soap and water or specified cleaner)', 'Approved boot protectant / ice-adhesion inhibitor (ICEX-type)', 'Approved conductive edge sealer only if specified by the boot manufacturer', 'Residue-free masking tape']::text[],
  array['Soft clean cloths and lint-free applicators', 'Soft brushes', 'Low-pressure water supply', 'Padded ladders / work stands', 'Nitrile gloves']::text[],
  array['Confirm work authorization and scope with the owner/operator and coordinate time, location and any wash-rack rules with the FBO/line service', 'Confirm the aircraft is chocked, grounded where required, no fueling, maintenance or engine runs in progress, and you know who the crew contact is', 'Do a walk-around with the crew/owner and photograph all pre-existing damage and discrepancies before touching the aircraft', 'Set up ramp safety: hi-vis vest, hearing protection, FOD walk, stay clear of propeller arcs, engine intakes/exhausts and moving ground equipment', 'Cover or tape pitot tubes, static ports, AOA vanes, TAT probes, fuel vents, engine inlets/exhausts and APU openings with approved covers or residue-free tape and remove-before-flight streamers', 'Position padded ladders/stands; never lean on or rest equipment against control surfaces, flaps, antennas or static wicks']::text[],
  '[
  {
    "title": "Walk around & photograph pre-existing damage",
    "detail": "Walk the entire aircraft with the crew or owner and photograph dents, chips, paint loss, cracked lenses, missing fasteners and fluid leaks. Note everything on the work order before starting.",
    "caution": "Report any damage or discrepancies to the crew/owner before work begins, not after."
  },
  {
    "title": "Coordinate with FBO, line service & crew",
    "detail": "Confirm where you are allowed to work, water/power availability, runoff rules and the crew''s departure time. Get a crew contact number in case you find a discrepancy.",
    "caution": null
  },
  {
    "title": "Verify chocks, grounding & no fueling in progress",
    "detail": "Check chocks are in place, the aircraft is grounded if the FBO requires it, and no fueling, maintenance or engine run is happening. Do a FOD walk and put on hearing protection and hi-vis.",
    "caution": "Never work near a turning propeller or running engine/APU. Stay out of intake and exhaust danger zones."
  },
  {
    "title": "Set padded ladders & stands",
    "detail": "Place padded ladders or work stands with soft contact points and set them so you never need to reach or lean onto the airframe. Reposition rather than overreach.",
    "caution": "Never lean on or brace against control surfaces, flaps, antennas, static wicks or vortex generators. Never move flight controls."
  },
  {
    "title": "Check the boot manual & approved products",
    "detail": "Confirm the boot manufacturer''s and AMM-approved cleaners and treatments for this aircraft before you start.",
    "caution": null
  },
  {
    "title": "Inspect boots for damage",
    "detail": "Inspect each boot for cuts, scuffs, cracks, lifting edges and patches. Photograph and report damage before treatment.",
    "caution": "Never treat over damaged or lifting boots without telling the crew; maintenance may need to repair first."
  },
  {
    "title": "Mask adjacent paint & leading edges",
    "detail": "Mask paint along the boot edges so protectant does not run onto surrounding paint.",
    "caution": null
  },
  {
    "title": "Wash boots with approved mild cleaner",
    "detail": "Wash with the approved mild soap or cleaner and a soft cloth, wiping spanwise. Rinse with low-pressure water.",
    "caution": "No petroleum solvents, MEK, fuel, degreasers or high pressure on boots."
  },
  {
    "title": "Dry boots completely",
    "detail": "Dry thoroughly with a clean cloth and let the boots air-dry before applying any treatment.",
    "caution": null
  },
  {
    "title": "Apply approved protectant thinly",
    "detail": "Apply the approved treatment in a thin even coat with a lint-free applicator, following the product''s coverage and number of coats.",
    "caution": null
  },
  {
    "title": "Buff or let cure per label",
    "detail": "Buff or allow to dry as the product directs; some treatments must cure before flight or rain.",
    "caution": null
  },
  {
    "title": "Remove masking & clean paint edges",
    "detail": "Remove masking and wipe any product off paint with a clean cloth.",
    "caution": null
  },
  {
    "title": "Final walk-around & report to crew",
    "detail": "Walk the aircraft again, take after photos from the same angles as the before photos and brief the crew/owner. Record product and date applied so the next treatment interval is tracked. Report any new or newly visible discrepancies in writing.",
    "caution": null
  }
]'::jsonb,
  array['Never use petroleum solvents, fuel, MEK, degreasers or tire dressings on de-ice boots', 'Never use high-pressure water or brushes with stiff bristles on boots', 'Never apply ceramic, wax or polish to de-ice boots', 'Never treat damaged boots without reporting the damage first', 'Never operate the de-ice system unless authorized by the crew', 'Never lean ladders against boots or leading edges']::text[],
  array['Boots evenly dark with uniform satin finish', 'No product on surrounding paint', 'No streaks or puddled treatment', 'Damage documented and reported']::text[],
  array['Before: each boot full length', 'Before: close-ups of any cuts, scuffs or lifting edges', 'After: each boot full length', 'Product label and application date']::text[]
),
(
  'windshield_treatment',
  'aircraft',
  'Windshield & Windows Treatment',
  'Cleaning and treating windshields and cabin windows with OEM-approved products: acrylic polishes and protectants for acrylic, and only manufacturer-approved products and rain repellents for heated glass windshields. Sell with every wash and before the rainy season.',
  'Piston single 0.5–1 h · Light jet 1–2 h · Midsize 1.5–2.5 h · Large 2–3 h',
  '1 technician',
  array['OEM-approved acrylic cleaner and acrylic polish/protectant', 'Glass windshield cleaner approved by the aircraft/windshield manufacturer', 'Approved rain repellent (only where the AMM allows; many jets prohibit some products)', 'Distilled water']::text[],
  array['Clean, soft, dedicated microfiber or flannel cloths', 'Padded ladders / work stands', 'Soft-edge squeegee (glass only, if approved)', 'Inspection light', 'Nitrile gloves']::text[],
  array['Confirm work authorization and scope with the owner/operator and coordinate time, location and any wash-rack rules with the FBO/line service', 'Confirm the aircraft is chocked, grounded where required, no fueling, maintenance or engine runs in progress, and you know who the crew contact is', 'Do a walk-around with the crew/owner and photograph all pre-existing damage and discrepancies before touching the aircraft', 'Set up ramp safety: hi-vis vest, hearing protection, FOD walk, stay clear of propeller arcs, engine intakes/exhausts and moving ground equipment', 'Cover or tape pitot tubes, static ports, AOA vanes, TAT probes, fuel vents, engine inlets/exhausts and APU openings with approved covers or residue-free tape and remove-before-flight streamers', 'Position padded ladders/stands; never lean on or rest equipment against control surfaces, flaps, antennas or static wicks']::text[],
  '[
  {
    "title": "Walk around & photograph pre-existing damage",
    "detail": "Walk the entire aircraft with the crew or owner and photograph dents, chips, paint loss, cracked lenses, missing fasteners and fluid leaks. Note everything on the work order before starting.",
    "caution": "Report any damage or discrepancies to the crew/owner before work begins, not after."
  },
  {
    "title": "Coordinate with FBO, line service & crew",
    "detail": "Confirm where you are allowed to work, water/power availability, runoff rules and the crew''s departure time. Get a crew contact number in case you find a discrepancy.",
    "caution": null
  },
  {
    "title": "Verify chocks, grounding & no fueling in progress",
    "detail": "Check chocks are in place, the aircraft is grounded if the FBO requires it, and no fueling, maintenance or engine run is happening. Do a FOD walk and put on hearing protection and hi-vis.",
    "caution": "Never work near a turning propeller or running engine/APU. Stay out of intake and exhaust danger zones."
  },
  {
    "title": "Set padded ladders & stands",
    "detail": "Place padded ladders or work stands with soft contact points and set them so you never need to reach or lean onto the airframe. Reposition rather than overreach.",
    "caution": "Never lean on or brace against control surfaces, flaps, antennas, static wicks or vortex generators. Never move flight controls."
  },
  {
    "title": "Identify acrylic vs heated glass",
    "detail": "Determine whether each windshield and window is acrylic (stretched acrylic) or glass/heated glass, and look up the approved products in the AMM.",
    "caution": "Products that are safe on glass can craze acrylic, and some rain repellents are prohibited on certain heated windshields."
  },
  {
    "title": "Inspect for crazing, chips & delamination",
    "detail": "Inspect under light for crazing, scratches, chips, delamination and bubbling, and photograph them. Report before starting.",
    "caution": "Report any windshield damage to the crew immediately; it may affect airworthiness."
  },
  {
    "title": "Flush loose grit with clean water",
    "detail": "Rinse or flood with clean water to float off grit and bugs before wiping. Never wipe dry dust across acrylic.",
    "caution": null
  },
  {
    "title": "Clean acrylic with approved cleaner",
    "detail": "Apply approved acrylic cleaner and wipe with a clean soft cloth in straight lines with light pressure, turning the cloth often.",
    "caution": "No ammonia, alcohol, glass cleaner, paper towels or abrasive cloths on acrylic."
  },
  {
    "title": "Clean heated glass with approved product",
    "detail": "On glass windshields use only the windshield manufacturer''s approved cleaner and soft cloths. Do not work over wiper blades or sealant beads aggressively.",
    "caution": null
  },
  {
    "title": "Polish minor acrylic haze if approved",
    "detail": "Remove light haze on acrylic with approved acrylic polish by hand. Deep scratches or crazing need maintenance assessment.",
    "caution": null
  },
  {
    "title": "Apply approved protectant or repellent",
    "detail": "Apply an approved acrylic protectant or approved rain repellent per the product directions, keeping it off seals and paint.",
    "caution": null
  },
  {
    "title": "Buff streak-free & inspect",
    "detail": "Buff with a clean cloth and inspect from inside and outside under light for streaks and smears.",
    "caution": null
  },
  {
    "title": "Final walk-around & report to crew",
    "detail": "Walk the aircraft again, take after photos from the same angles as the before photos and brief the crew/owner. Report any new or newly visible discrepancies in writing.",
    "caution": null
  }
]'::jsonb,
  array['Never use ammonia, alcohol, household glass cleaner or solvents on acrylic', 'Never use paper towels, shop rags or abrasive pads on windows', 'Never wipe dry dust or grit across acrylic', 'Never apply a rain repellent unless the AMM approves it for that windshield', 'Never use high pressure on windows or window seals', 'Never lean ladders against windshields or wiper arms']::text[],
  array['Clear, streak-free view from inside and outside', 'No new scratches or haze', 'Seals and paint free of product', 'Any crazing or damage documented and reported']::text[],
  array['Before: each windshield and window panel', 'Before: close-ups of crazing, chips or scratches', 'After: same windows in good light', 'Product used (label) for records']::text[]
),
(
  'vehicle_wash',
  'vehicle',
  'Exterior Hand Wash',
  'A safe two-bucket hand wash with wheel and tire cleaning, pre-wash foam and touchless drying to remove dirt without inducing swirls. The core recurring service; sell as a weekly/biweekly maintenance plan.',
  'Sedan 45–75 min · SUV/truck 1–1.5 h',
  '1–2 technicians',
  array['pH-neutral car shampoo', 'Snow foam / pre-wash', 'Non-acid wheel cleaner', 'Tire cleaner and water-based tire dressing', 'Bug and tar remover', 'Spray sealant or drying aid (optional)']::text[],
  array['Two buckets with grit guards (wash and rinse)', 'Separate wheel bucket and brushes', 'Microfiber wash mitts', 'Foam cannon / pressure washer (1,200–1,900 psi with 25–40° tip)', 'Plush drying towels and/or blower', 'Soft detailing brushes']::text[],
  array['Walk around with the customer, note and photograph existing damage, and confirm the scope and price', 'Remove or bag personal items and valuables; note anything left in the vehicle', 'Park in shade on a surface where runoff is allowed; panels and wheels cool to the touch']::text[],
  '[
  {
    "title": "Walk around & photograph existing damage",
    "detail": "Photograph each side and close-ups of chips, scratches and curb rash, and show the customer before starting.",
    "caution": null
  },
  {
    "title": "Clean wheels & tires first",
    "detail": "Spray wheel cleaner on cool wheels, agitate faces, barrels and lug nuts with dedicated brushes, scrub tires and rinse.",
    "caution": "Never use acid wheel cleaner on uncoated, polished or anodized wheels."
  },
  {
    "title": "Pre-rinse top-down",
    "detail": "Rinse the vehicle top to bottom to remove loose dirt, keeping the nozzle 12+ in from paint.",
    "caution": null
  },
  {
    "title": "Foam pre-wash & dwell",
    "detail": "Apply snow foam, let it dwell 3–5 minutes without drying, then rinse to remove most grit before contact.",
    "caution": null
  },
  {
    "title": "Treat bugs & tar",
    "detail": "Spot-treat bugs and tar on the front end and lower panels with the appropriate remover.",
    "caution": null
  },
  {
    "title": "Two-bucket contact wash top-down",
    "detail": "Wash one panel at a time from the roof down with a loaded mitt, straight-line strokes, and rinse the mitt in the rinse bucket before reloading.",
    "caution": "Use a separate mitt for lower panels and never use a dropped mitt until it is cleaned."
  },
  {
    "title": "Clean door jambs, fuel door & emblems",
    "detail": "Wipe door jambs and fuel door, and brush around emblems and grilles.",
    "caution": null
  },
  {
    "title": "Final rinse with sheeting flow",
    "detail": "Rinse thoroughly, finishing with an open hose to sheet water off and reduce drying.",
    "caution": null
  },
  {
    "title": "Dry with blower & plush towels",
    "detail": "Blow water from mirrors, trim and grilles and dry panels by patting or gently dragging a plush towel with drying aid.",
    "caution": null
  },
  {
    "title": "Dress tires & clean glass",
    "detail": "Apply a thin coat of water-based tire dressing and clean exterior glass streak-free.",
    "caution": null
  },
  {
    "title": "Final walk-around with customer",
    "detail": "Inspect in good light for missed spots and water drips, take after photos and walk the customer around.",
    "caution": null
  }
]'::jsonb,
  array['Never wash in direct sun or on hot panels', 'Never use dish soap or household detergents', 'Never use the same mitt for wheels and paint', 'Never use a zero-degree tip or get close to paint, badges or trim with pressure', 'Never use a dropped mitt or towel without cleaning it']::text[],
  array['No dirt film when wiped with a white towel', 'No water spots, drips or streaks', 'Wheels, barrels and lug nuts clean', 'Tires evenly dressed, no sling', 'Glass streak-free inside out']::text[],
  array['Before: four corners', 'Before: close-ups of existing damage', 'After: four corners', 'After: wheel close-up']::text[]
),
(
  'vehicle_interior',
  'vehicle',
  'Interior Detail',
  'Thorough interior cleaning: vacuuming, steam/extraction of carpets and seats, leather care, plastics and glass, with odor neutralization. Sell to families, rideshare drivers and before vehicle sales.',
  'Sedan 2–3 h · SUV/truck 3–4 h (heavy soil or pet hair +1–2 h)',
  '1–2 technicians',
  array['All-purpose interior cleaner (diluted for plastics)', 'Upholstery/carpet shampoo and spotters', 'pH-neutral leather cleaner and conditioner', 'Water-based UV interior dressing (non-greasy)', 'Ammonia-free glass cleaner', 'Enzyme odor neutralizer']::text[],
  array['Shop vacuum with crevice and brush tools', 'Hot-water extractor', 'Steamer (optional)', 'Detail brushes and drill brush', 'Pet hair rubber brush/stone', 'Compressed air blow gun', 'Microfiber towels']::text[],
  array['Walk around with the customer, note and photograph existing damage, and confirm the scope and price', 'Remove or bag personal items and valuables; note anything left in the vehicle', 'Park in shade on a surface where runoff is allowed; panels and wheels cool to the touch']::text[],
  '[
  {
    "title": "Photograph interior as found",
    "detail": "Photograph each seat, carpet area and dash, plus stains, tears and damage.",
    "caution": null
  },
  {
    "title": "Remove trash, mats & personal items",
    "detail": "Remove trash and floor mats and bag personal items in labeled bags.",
    "caution": null
  },
  {
    "title": "Blow out vents, seams & crevices",
    "detail": "Use compressed air and a brush to blow debris from vents, seat seams and console gaps toward the floor.",
    "caution": null
  },
  {
    "title": "Vacuum top-down",
    "detail": "Vacuum headliner lightly, seats, under seats with seats moved fully forward and back, then carpets and trunk.",
    "caution": null
  },
  {
    "title": "Clean floor mats separately",
    "detail": "Scrub rubber mats and extract carpet mats outside the vehicle; let them dry fully before reinstalling.",
    "caution": null
  },
  {
    "title": "Pre-treat & extract carpets",
    "detail": "Pre-spray carpets, agitate with a brush, and extract with hot water. Use more dry passes than wet passes.",
    "caution": "Avoid soaking; excess moisture causes mildew and can affect seat sensors and wiring under carpet."
  },
  {
    "title": "Shampoo & extract cloth seats",
    "detail": "Spot-treat stains, then clean and extract cloth seats with light moisture.",
    "caution": "Avoid over-wetting seats with airbags and occupancy sensors."
  },
  {
    "title": "Clean & condition leather",
    "detail": "Clean leather with pH-neutral cleaner and a soft brush, wipe dry and apply a thin coat of conditioner.",
    "caution": null
  },
  {
    "title": "Clean dash, console & door panels",
    "detail": "Spray cleaner onto a towel or brush, clean plastics and switches, then apply non-greasy UV dressing.",
    "caution": "Do not spray liquids directly onto screens, switches or airbag covers."
  },
  {
    "title": "Clean screens with screen-safe cleaner",
    "detail": "Clean infotainment screens and clusters with a screen-safe cleaner on a soft microfiber.",
    "caution": null
  },
  {
    "title": "Clean glass inside & out",
    "detail": "Clean all glass with ammonia-free cleaner and two towels, one to clean and one to buff.",
    "caution": null
  },
  {
    "title": "Neutralize odors",
    "detail": "Treat odor sources with enzyme cleaner and ventilate. Use ozone only in an unoccupied vehicle and air out afterward.",
    "caution": null
  },
  {
    "title": "Reinstall mats & final inspection",
    "detail": "Reinstall dry mats, reset seats, take after photos and walk the customer through the results.",
    "caution": null
  }
]'::jsonb,
  array['Never spray liquids directly onto electronics, screens or airbag covers', 'Never soak carpets or seats', 'Never use greasy or silicone dressings on steering wheels, pedals or floor mats', 'Never use ammonia glass cleaner on tinted windows', 'Never run an ozone generator with people or pets inside']::text[],
  array['No debris in seat tracks, vents or crevices', 'Carpets and seats dry within a few hours, no mildew odor', 'Plastics clean with satin, non-greasy finish', 'Glass streak-free', 'Mats dry and reinstalled']::text[],
  array['Before: front seats, rear seats, trunk', 'Before: close-ups of stains and damage', 'After: same angles', 'After: cleaned mats']::text[]
),
(
  'vehicle_full_detail',
  'vehicle',
  'Full Detail',
  'Complete exterior and interior detail: two-bucket wash, decontamination (iron and clay), one-step polish, sealant, full interior clean and dressing. Sell as the seasonal reset or before sale/after purchase.',
  'Sedan 4–6 h · SUV/truck 5–8 h',
  '1–2 technicians',
  array['pH-neutral shampoo and snow foam', 'Iron/fallout remover', 'Clay bar or clay mitt with lubricant', 'One-step polish', 'Paint sealant or wax', 'Interior cleaners, leather care and UV dressing', 'Wheel and tire cleaners and dressing', 'Ammonia-free glass cleaner']::text[],
  array['Two buckets with grit guards', 'Pressure washer and foam cannon', 'Dual-action polisher with pads', 'Paint thickness gauge', 'Extractor and shop vacuum', 'Detail brushes', 'Microfiber towels', 'Inspection light']::text[],
  array['Walk around with the customer, note and photograph existing damage, and confirm the scope and price', 'Remove or bag personal items and valuables; note anything left in the vehicle', 'Park in shade on a surface where runoff is allowed; panels and wheels cool to the touch']::text[],
  '[
  {
    "title": "Walk around & photograph damage",
    "detail": "Photograph all panels, wheels and interior, noting chips, scratches and stains, and agree expectations with the customer.",
    "caution": null
  },
  {
    "title": "Clean wheels, tires & wheel wells",
    "detail": "Clean wheels, barrels, lug nuts, tires and wheel wells first with dedicated tools.",
    "caution": null
  },
  {
    "title": "Foam pre-wash & two-bucket wash",
    "detail": "Foam, rinse, then hand wash top-down with the two-bucket method.",
    "caution": null
  },
  {
    "title": "Iron decon & rinse",
    "detail": "Apply iron remover to paint and wheels, let it react (purple bleeding) without drying, and rinse thoroughly.",
    "caution": null
  },
  {
    "title": "Clay paint & glass",
    "detail": "Clay each panel with plenty of lubricant until smooth, then rinse and dry.",
    "caution": "Fold the clay often and discard it if dropped."
  },
  {
    "title": "Check paint depth & tape trim",
    "detail": "Take paint readings on each panel and tape rubber trim, badges and sharp edges before machine polishing.",
    "caution": null
  },
  {
    "title": "One-step polish panel by panel",
    "detail": "Machine polish with a one-step polish on a medium pad to remove light swirls and add gloss.",
    "caution": "Stay off panel edges and body lines and keep the pad flat."
  },
  {
    "title": "Wipe down & apply sealant",
    "detail": "Panel wipe to remove polishing oils, then apply sealant or wax thinly and buff off per label.",
    "caution": null
  },
  {
    "title": "Dress tires & trim, clean glass",
    "detail": "Dress tires and exterior plastics, clean exterior glass.",
    "caution": null
  },
  {
    "title": "Vacuum & extract interior",
    "detail": "Vacuum thoroughly and extract carpets, mats and cloth seats with low moisture.",
    "caution": null
  },
  {
    "title": "Clean & protect interior surfaces",
    "detail": "Clean and condition leather, clean dash and door panels, and apply non-greasy UV dressing.",
    "caution": null
  },
  {
    "title": "Clean interior glass & screens",
    "detail": "Clean interior glass and screens with appropriate cleaners.",
    "caution": null
  },
  {
    "title": "Final inspection in good light",
    "detail": "Inspect inside and out with an inspection light, remove residue and tape, take after photos and walk the customer around.",
    "caution": null
  }
]'::jsonb,
  array['Never machine polish without checking paint depth', 'Never polish over panel edges or body lines with pressure', 'Never apply sealant in direct sun or on hot panels', 'Never leave polish or sealant residue in emblems and trim', 'Never soak interior carpets or seats']::text[],
  array['Paint smooth to the touch with clear gloss', 'No residue in trim, emblems or panel gaps', 'Wheels and tires clean and evenly dressed', 'Interior clean, dry and odor-free', 'Glass streak-free']::text[],
  array['Before: four corners and interior zones', 'Before: close-ups of swirls and stains', 'During: 50/50 polish section', 'After: four corners and interior zones']::text[]
),
(
  'vehicle_paint_correction',
  'vehicle',
  'Paint Correction',
  'Multi-stage machine compounding and polishing to remove swirls, scratches, oxidation and water spots after measuring paint thickness. Sell to enthusiasts, before ceramic coating and for dark or high-end vehicles.',
  'One-step: sedan 4–6 h · SUV/truck 6–8 h · Two-step: sedan 8–12 h · SUV/truck 10–16 h',
  '1–2 technicians',
  array['Heavy-cut compound', 'Finishing polish', 'Iron remover and clay with lubricant', 'Panel prep wipe', 'Automotive masking tape', 'Wax, sealant or ceramic for protection']::text[],
  array['Paint thickness gauge', 'Dual-action polisher (rotary optional for experienced techs)', 'Microfiber/wool cutting pads and foam polishing pads', 'Pad brush / compressed air', 'Inspection lights / swirl finder', 'Small polisher for tight areas']::text[],
  array['Walk around with the customer, note and photograph existing damage, and confirm the scope and price', 'Remove or bag personal items and valuables; note anything left in the vehicle', 'Park in shade on a surface where runoff is allowed; panels and wheels cool to the touch', 'Work indoors with good lighting if possible']::text[],
  '[
  {
    "title": "Photograph defects in direct light",
    "detail": "Photograph swirls, scratches and defects under an inspection light so the customer can see the before state.",
    "caution": null
  },
  {
    "title": "Wash & fully decontaminate",
    "detail": "Two-bucket wash, iron decon and clay so the paint is smooth and clean before machining.",
    "caution": null
  },
  {
    "title": "Measure paint thickness on every panel",
    "detail": "Take multiple readings per panel and record them. Note repaints, thin areas and edges.",
    "caution": "Low readings or repaints mean less aggressive work or no correction on that area."
  },
  {
    "title": "Mask trim, badges & edges",
    "detail": "Tape rubber and plastic trim, badges, sensors and sharp body lines.",
    "caution": null
  },
  {
    "title": "Do a test spot",
    "detail": "Start with the least aggressive pad/polish combo on a test area and step up only if needed.",
    "caution": null
  },
  {
    "title": "Compound in 2×2 ft sections",
    "detail": "Work small sections with slow overlapping passes, pad flat, moderate pressure, and wipe off to inspect.",
    "caution": "Watch heat near edges and on thin panels; keep the machine moving."
  },
  {
    "title": "Wet-sand only if paint allows",
    "detail": "Only wet-sand deep defects when readings show enough clear coat and the customer has approved the risk.",
    "caution": null
  },
  {
    "title": "Refine with finishing polish",
    "detail": "Polish with a fine polish and soft pad to remove compounding haze and micro-marring.",
    "caution": null
  },
  {
    "title": "Clean pads between sections",
    "detail": "Brush or blow out pads after each section and swap when saturated.",
    "caution": null
  },
  {
    "title": "Panel wipe & inspect under lights",
    "detail": "Remove polishing oils with a panel wipe and check every panel from several angles under lights.",
    "caution": null
  },
  {
    "title": "Re-measure & record results",
    "detail": "Re-measure worked areas and log before/after readings for the customer file.",
    "caution": null
  },
  {
    "title": "Protect corrected paint",
    "detail": "Apply wax, sealant or ceramic coating to protect the finish.",
    "caution": null
  }
]'::jsonb,
  array['Never machine polish without measuring paint thickness', 'Never wet-sand without enough clear coat and customer approval', 'Never polish over sharp edges, body lines or plastic trim', 'Never work in direct sun or on hot panels', 'Never promise 100% defect removal; some scratches are too deep']::text[],
  array['Agreed defect removal achieved', 'No holograms or haze under lights', 'No burn-through at edges', 'Before/after readings recorded', 'No residue in trim or gaps']::text[],
  array['Before: defects under inspection light', 'Before: paint thickness readings', 'During: 50/50 section', 'After: same panels in same light']::text[]
),
(
  'vehicle_ceramic_coating',
  'vehicle',
  'Ceramic Coating',
  'Paint preparation and application of a professional ceramic/SiO2 coating for multi-year protection, gloss and easier washing. Premium upsell after paint correction or on new vehicles.',
  'Sedan 1–2 days · SUV/truck 1.5–2.5 days (including correction and cure)',
  '1–2 technicians',
  array['Ceramic coating (paint, plus wheel and glass coatings if included)', 'pH-neutral shampoo and snow foam', 'Iron remover, tar remover, clay and lubricant', 'Polish (one-step or finishing)', 'Coating prep / panel wipe']::text[],
  array['Dual-action polisher and pads', 'Paint thickness gauge', 'Applicator blocks and suede cloths', 'Plush leveling towels (many)', 'Inspection lights', 'Nitrile gloves and respirator per SDS', 'Indoor bay']::text[],
  array['Walk around with the customer, note and photograph existing damage, and confirm the scope and price', 'Remove or bag personal items and valuables; note anything left in the vehicle', 'Park in shade on a surface where runoff is allowed; panels and wheels cool to the touch', 'Vehicle must stay indoors and dry during initial cure']::text[],
  '[
  {
    "title": "Photograph vehicle & defects",
    "detail": "Photograph all panels and defects, and agree on correction level and coating package.",
    "caution": null
  },
  {
    "title": "Wash & full decon",
    "detail": "Two-bucket wash, iron and tar removal, clay, and rinse until the paint is perfectly smooth.",
    "caution": null
  },
  {
    "title": "Measure paint & correct",
    "detail": "Measure paint thickness and polish to the agreed level. The coating will lock in whatever is under it.",
    "caution": null
  },
  {
    "title": "Mask trim, rubber & sensors",
    "detail": "Tape textured trim, rubber seals and sensors not being coated.",
    "caution": null
  },
  {
    "title": "Panel wipe every surface",
    "detail": "Remove all polishing oils with coating prep so the coating bonds correctly.",
    "caution": null
  },
  {
    "title": "Apply coating in small sections",
    "detail": "Apply in 2×2 ft sections with a cross-hatch pattern following the manufacturer''s flash time for current temperature and humidity.",
    "caution": null
  },
  {
    "title": "Level & check for high spots",
    "detail": "Level with a clean towel at flash, buff with a second towel, and inspect immediately with a light.",
    "caution": "Cured high spots require polishing to remove."
  },
  {
    "title": "Coat wheels & glass if included",
    "detail": "Apply wheel and glass coatings with the specific products, keeping glass coating off wiper paths if the product requires.",
    "caution": null
  },
  {
    "title": "Cure indoors, keep dry",
    "detail": "Keep the vehicle indoors and dry for the initial cure (typically 12–24 h); IR lamps can speed cure if the product allows.",
    "caution": null
  },
  {
    "title": "Final inspection & aftercare brief",
    "detail": "Re-inspect under lights, remove tape, take after photos and give written aftercare: no washing for 7 days, pH-neutral soap, no automatic brush washes.",
    "caution": null
  }
]'::jsonb,
  array['Never coat over uncorrected, unwashed or oily paint', 'Never apply in direct sun, high humidity or outside the product''s temperature range', 'Never leave high spots to cure', 'Never expose to rain or wash during initial cure', 'Never apply paint coating to textured trim or rubber unless the product is designed for it']::text[],
  array['No high spots or streaks under inspection light', 'Even gloss on every panel', 'Masked surfaces free of coating', 'Water beads and sheets after cure', 'Aftercare instructions given']::text[],
  array['Before: four corners and defects', 'During: 50/50 correction', 'After: gloss shots in good light', 'After: water-beading test']::text[]
),
(
  'vehicle_engine_bay',
  'vehicle',
  'Engine Bay Detail',
  'Safe cleaning and dressing of the engine bay with sensitive components covered, using degreaser and low-pressure rinse. Sell with full details, before vehicle sales and for show cars.',
  'Sedan 45–75 min · SUV/truck 1–1.5 h',
  '1 technician',
  array['Water-based degreaser / all-purpose cleaner (diluted)', 'Water-based engine bay dressing (non-greasy)', 'Plastic bags and painter''s tape']::text[],
  array['Soft detail brushes and long-handle brushes', 'Low-pressure water (garden hose or pressure washer with wide tip at distance)', 'Compressed air / blower', 'Microfiber towels', 'Gloves and eye protection']::text[],
  array['Walk around with the customer, note and photograph existing damage, and confirm the scope and price', 'Remove or bag personal items and valuables; note anything left in the vehicle', 'Park in shade on a surface where runoff is allowed; panels and wheels cool to the touch', 'Engine must be cool to the touch; never clean a hot engine']::text[],
  '[
  {
    "title": "Photograph engine bay as found",
    "detail": "Photograph the engine bay and any leaks, damaged hoses or loose components, and inform the customer.",
    "caution": null
  },
  {
    "title": "Confirm engine is cool",
    "detail": "Wait until the engine and exhaust manifold are cool to the touch.",
    "caution": "Spraying a hot engine can crack components and flash chemicals."
  },
  {
    "title": "Remove debris from cowl & corners",
    "detail": "Remove leaves and debris from the cowl, battery tray and corners by hand or with a vacuum.",
    "caution": null
  },
  {
    "title": "Cover alternator, intake & fuse box",
    "detail": "Cover the alternator, air intake, fuse/relay box, exposed electrical connectors, ECU and battery terminals with plastic and tape.",
    "caution": "Water in the intake or electrical components can cause running problems."
  },
  {
    "title": "Apply diluted degreaser bottom-up",
    "detail": "Spray diluted degreaser on plastics, hoses and painted surfaces from the bottom up to avoid streaking. Respect dwell time.",
    "caution": null
  },
  {
    "title": "Agitate with soft brushes",
    "detail": "Brush heavily soiled areas, hoses and the underside of the hood (if not insulated felt).",
    "caution": null
  },
  {
    "title": "Rinse gently at low pressure",
    "detail": "Rinse lightly with a gentle stream, avoiding direct spray on covered components and connectors.",
    "caution": null
  },
  {
    "title": "Blow dry & towel off",
    "detail": "Blow water out of crevices and connectors with compressed air and towel-dry surfaces.",
    "caution": null
  },
  {
    "title": "Remove covers & check connections",
    "detail": "Remove all plastic covers and confirm connectors, caps and intake are secure.",
    "caution": null
  },
  {
    "title": "Apply non-greasy dressing",
    "detail": "Apply a thin coat of water-based dressing to plastics and hoses and wipe off excess.",
    "caution": null
  },
  {
    "title": "Start engine briefly & re-inspect",
    "detail": "With customer permission, start the engine to dry residual moisture and confirm it runs normally; check for warning lights.",
    "caution": null
  }
]'::jsonb,
  array['Never clean a hot engine', 'Never pressure wash directly at the alternator, intake, fuse box or connectors', 'Never use solvent-based degreasers on rubber hoses and belts', 'Never use greasy silicone dressing near belts or on exhaust components', 'Never leave plastic covers in the engine bay']::text[],
  array['Plastics and hoses clean with satin finish', 'No standing water or residue', 'All covers removed and connections secure', 'Engine starts and runs normally']::text[],
  array['Before: overall engine bay', 'Before: any leaks or damaged components', 'After: overall engine bay same angle']::text[]
),
(
  'boat_wash',
  'watercraft',
  'Hull & Deck Wash',
  'A full wash of topsides, deck, non-skid, hardware and enclosures using marine-safe soap, with runoff handled per marina rules. Sell as a weekly/biweekly maintenance plan, especially in salt water.',
  'Up to 25 ft 1–2 h · 26–40 ft 2–4 h · 41–60 ft 4–6 h · 60 ft+ 6 h+',
  '1–3 technicians',
  array['Biodegradable marine boat soap (wax-safe)', 'Non-skid deck cleaner', 'Marine glass/isinglass cleaner (vinyl window safe)', 'Salt-removal wash additive (optional)', 'Mildew cleaner for vinyl/canvas']::text[],
  array['Soft and medium deck brushes on extension poles', 'Wash mitts and microfiber towels', 'Buckets with grit guards', 'Hose with adjustable nozzle', 'Chamois / water blade', 'Fender and hull brush']::text[],
  array['Confirm marina/yard rules for washing, chemicals and runoff before starting; use containment and biodegradable products where required', 'Walk the vessel with the owner, note and photograph existing damage, gelcoat cracks and stains', 'Secure the boat (lines doubled at the dock or properly blocked/stand-supported on the hard), and use non-slip footwear', 'Close hatches and ports and protect electronics, helm displays and open electrical panels']::text[],
  '[
  {
    "title": "Walk vessel & photograph existing damage",
    "detail": "Photograph topsides, deck, upholstery and hardware; note chips, cracks and stains with the owner.",
    "caution": null
  },
  {
    "title": "Check marina runoff & chemical rules",
    "detail": "Confirm what soaps are allowed, whether runoff must be contained and if water use is restricted.",
    "caution": "Many marinas and harbors prohibit discharging non-biodegradable soap or any detergent into the water."
  },
  {
    "title": "Close hatches & protect electronics",
    "detail": "Close hatches, ports and vents and cover helm electronics and open switch panels.",
    "caution": null
  },
  {
    "title": "Rinse salt & dirt top-down",
    "detail": "Rinse the boat from the highest point down to flush salt and loose dirt off hardware and canvas.",
    "caution": null
  },
  {
    "title": "Wash superstructure & hardware",
    "detail": "Wash the hardtop, arch, windshield frame and stainless with marine soap and a mitt, rinsing often.",
    "caution": null
  },
  {
    "title": "Scrub non-skid with deck brush",
    "detail": "Scrub non-skid in two directions with a medium brush and non-skid cleaner, then rinse well.",
    "caution": null
  },
  {
    "title": "Wash smooth gelcoat & topsides",
    "detail": "Wash smooth gelcoat and topsides with a soft mitt or soft brush using straight strokes.",
    "caution": null
  },
  {
    "title": "Clean isinglass & enclosures",
    "detail": "Rinse vinyl windows first, then wash with a dedicated soft cloth and isinglass-safe cleaner. Never wipe dry.",
    "caution": "No ammonia or household glass cleaner on clear vinyl."
  },
  {
    "title": "Clean upholstery & canvas",
    "detail": "Wipe vinyl upholstery with a marine vinyl cleaner and treat mildew spots.",
    "caution": null
  },
  {
    "title": "Final rinse & dry",
    "detail": "Rinse thoroughly and dry gelcoat, stainless and glass with a chamois or water blade to prevent spots.",
    "caution": null
  },
  {
    "title": "Clean fenders & dock lines",
    "detail": "Scrub fenders and rinse dock lines if included in scope.",
    "caution": null
  },
  {
    "title": "Final walk-through with photos",
    "detail": "Walk the vessel, take after photos and report any new damage, loose hardware or leaks.",
    "caution": null
  }
]'::jsonb,
  array['Never use non-marine or non-biodegradable soap where runoff reaches the water', 'Never use ammonia cleaners or dry towels on isinglass', 'Never use stiff brushes on smooth gelcoat or vinyl', 'Never spray water into electronics, vents or open hatches', 'Never use acetone or harsh solvents on gelcoat']::text[],
  array['No salt film or soap residue', 'Non-skid uniformly clean', 'Isinglass clear without scratches', 'Stainless spot-free']::text[],
  array['Before: bow, stern, port and starboard', 'Before: close-ups of damage and stains', 'After: same four angles', 'After: deck and non-skid']::text[]
),
(
  'boat_oxidation_removal',
  'watercraft',
  'Oxidation Removal / Compound',
  'Restoring chalky, faded gelcoat by compounding from heavy to fine and finishing with polish and protection. Sell to owners of older or sun-faded boats, before sale and at spring commissioning.',
  'Up to 25 ft 6–10 h · 26–40 ft 1–3 days · 41–60 ft 3–5 days · 60 ft+ 5 days+',
  '2–3 technicians',
  array['Heavy-cut marine compound', 'Medium and fine marine polish', 'Marine wax or sealant', 'Hull cleaner / oxidation pre-cleaner', 'Marine masking tape']::text[],
  array['Rotary polisher (and DA for finishing)', 'Wool compounding pads, foam polishing pads', 'Pad spur/brush', 'Scaffold, staging or stable work platform', 'Gelcoat/paint thickness consideration (paint gauge for painted hulls)', 'Microfiber towels', 'Respirator and eye protection']::text[],
  array['Confirm marina/yard rules for washing, chemicals and runoff before starting; use containment and biodegradable products where required', 'Walk the vessel with the owner, note and photograph existing damage, gelcoat cracks and stains', 'Secure the boat (lines doubled at the dock or properly blocked/stand-supported on the hard), and use non-slip footwear', 'Close hatches and ports and protect electronics, helm displays and open electrical panels', 'Determine whether the surface is gelcoat or painted (e.g., polyurethane paint); painted hulls need paint-specific products and gentler cutting']::text[],
  '[
  {
    "title": "Photograph oxidation & damage",
    "detail": "Photograph each side, transom and deck showing chalking, stains, cracks and gelcoat damage.",
    "caution": null
  },
  {
    "title": "Identify gelcoat vs painted surface",
    "detail": "Confirm whether each area is gelcoat or paint. Gelcoat is thicker and tolerates heavier cutting; paint needs paint-safe compounds and less cut.",
    "caution": "Heavy marine compound can cut through painted hulls quickly."
  },
  {
    "title": "Wash & remove waterline stains",
    "detail": "Wash thoroughly and remove scum line and rust stains with a hull cleaner, rinsing well.",
    "caution": "Acid hull cleaners need gloves, eye protection and thorough rinsing; keep off metals and paint."
  },
  {
    "title": "Mask rub rails, decals & hardware",
    "detail": "Tape rub rails, striping, decals, registration numbers, hardware and canvas snaps.",
    "caution": null
  },
  {
    "title": "Do a test section",
    "detail": "Test on a 2×2 ft area to choose the least aggressive compound and pad that removes the oxidation.",
    "caution": null
  },
  {
    "title": "Compound heavy cut in sections",
    "detail": "Compound small sections with a wool pad at moderate speed, keeping the pad flat and moving. Wipe before it dries.",
    "caution": "Keep off sharp edges, corners and molded lines where gelcoat is thin."
  },
  {
    "title": "Polish with medium/fine polish",
    "detail": "Follow with a medium then fine polish on foam pads to remove compound haze and swirls.",
    "caution": null
  },
  {
    "title": "Clean pads frequently",
    "detail": "Spur or brush pads often; oxidized gelcoat loads pads fast.",
    "caution": null
  },
  {
    "title": "Wipe down & inspect",
    "detail": "Wipe all residue and inspect in sunlight or under lights for haze and missed spots.",
    "caution": null
  },
  {
    "title": "Apply marine wax or sealant",
    "detail": "Protect the restored gelcoat with marine wax or sealant; unprotected gelcoat re-oxidizes quickly.",
    "caution": null
  },
  {
    "title": "Remove masking & clean residue",
    "detail": "Remove tape and clean compound from rub rails, hardware and non-skid.",
    "caution": null
  },
  {
    "title": "Final walk-through & after photos",
    "detail": "Take after photos from the same angles and review with the owner, noting any stains or crazing that remain.",
    "caution": null
  }
]'::jsonb,
  array['Never use acetone or harsh solvents on gelcoat', 'Never use heavy marine compound on painted hulls without a test spot', 'Never compound sharp edges, corners or thin gelcoat areas aggressively', 'Never work from an unstable ladder on a boat on stands; use proper staging', 'Never let compound dry on the surface or in non-skid', 'Never let compound dust or runoff enter the water']::text[],
  array['Uniform gloss with no chalky areas', 'No swirls or haze in sunlight', 'No burn-through at edges', 'Protection applied evenly', 'Decals and rub rails clean and undamaged']::text[],
  array['Before: port, starboard, transom', 'Before: close-up of chalking', 'During: 50/50 section', 'After: same angles in sunlight']::text[]
),
(
  'boat_wax_sealant',
  'watercraft',
  'Wax / Sealant',
  'Applying marine wax or polymer sealant to clean gelcoat or paint for UV and salt protection and easier cleaning. Sell 2–4 times per season depending on climate and use.',
  'Up to 25 ft 2–4 h · 26–40 ft 4–8 h · 41–60 ft 1–2 days · 60 ft+ 2 days+',
  '1–3 technicians',
  array['Marine wax or polymer sealant (UV inhibitors)', 'Marine boat soap', 'Cleaner wax for light oxidation (optional)', 'Marine masking tape']::text[],
  array['Dual-action or random orbital polisher with finishing pads', 'Foam applicators', 'Plush microfiber towels', 'Stable work platform or staging', 'Inspection light']::text[],
  array['Confirm marina/yard rules for washing, chemicals and runoff before starting; use containment and biodegradable products where required', 'Walk the vessel with the owner, note and photograph existing damage, gelcoat cracks and stains', 'Secure the boat (lines doubled at the dock or properly blocked/stand-supported on the hard), and use non-slip footwear', 'Close hatches and ports and protect electronics, helm displays and open electrical panels', 'Surface must be clean, dry and cool; work in shade']::text[],
  '[
  {
    "title": "Photograph vessel condition",
    "detail": "Photograph each side, transom and deck, noting oxidation and damage.",
    "caution": null
  },
  {
    "title": "Wash & dry thoroughly",
    "detail": "Wash with marine soap, rinse and dry fully.",
    "caution": null
  },
  {
    "title": "Check for oxidation needing compound",
    "detail": "Rub a clean towel on the gelcoat; chalk residue means it needs a cleaner wax or compound first. Tell the owner before proceeding.",
    "caution": null
  },
  {
    "title": "Mask decals, rub rails & non-skid edges",
    "detail": "Tape decals, rub rails and non-skid borders to keep wax off.",
    "caution": null
  },
  {
    "title": "Apply thin coat in sections",
    "detail": "Apply a thin even layer by machine or hand, working manageable sections out of direct sun.",
    "caution": null
  },
  {
    "title": "Haze & buff off",
    "detail": "Let it haze per label, then buff with clean microfiber, turning towels often.",
    "caution": null
  },
  {
    "title": "Second coat on high-exposure areas",
    "detail": "Add a second coat on the bow, transom and topsides that get the most sun and spray.",
    "caution": null
  },
  {
    "title": "Remove residue from crevices",
    "detail": "Clear residue from hardware bases, seams and lettering with a soft brush.",
    "caution": null
  },
  {
    "title": "Remove masking & final inspection",
    "detail": "Remove tape, inspect in good light and take after photos.",
    "caution": null
  }
]'::jsonb,
  array['Never wax non-skid surfaces; it makes them slippery and dangerous', 'Never apply wax in direct sun or on hot gelcoat', 'Never wax over oxidized gelcoat without cleaning or compounding first', 'Never leave residue in hardware bases or lettering', 'Never let wax or wash runoff enter the water where prohibited']::text[],
  array['Deep, even gloss', 'Water beads uniformly', 'No residue on decals, rub rails or hardware', 'Non-skid free of wax']::text[],
  array['Before: port, starboard and transom', 'After: same angles', 'After: water-beading close-up']::text[]
),
(
  'boat_ceramic_coating',
  'watercraft',
  'Ceramic Coating',
  'Decontamination, correction and application of a marine ceramic coating to gelcoat or paint for long-term UV, salt and stain protection. Premium upsell after oxidation removal or on new boats.',
  'Up to 25 ft 1–2 days · 26–40 ft 2–4 days · 41–60 ft 4–6 days · 60 ft+ 6 days+ (plus cure)',
  '2–3 technicians',
  array['Marine-rated ceramic coating', 'Marine soap and hull/scum line cleaner', 'Compound and polish for gelcoat or paint', 'Coating prep / panel wipe', 'Marine masking tape']::text[],
  array['Rotary and DA polishers with pads', 'Coating applicators and suede cloths', 'Plush leveling towels', 'Inspection lights', 'Covered workspace or shrink-wrap tent', 'Nitrile gloves and respirator per SDS', 'Stable staging']::text[],
  array['Confirm marina/yard rules for washing, chemicals and runoff before starting; use containment and biodegradable products where required', 'Walk the vessel with the owner, note and photograph existing damage, gelcoat cracks and stains', 'Secure the boat (lines doubled at the dock or properly blocked/stand-supported on the hard), and use non-slip footwear', 'Close hatches and ports and protect electronics, helm displays and open electrical panels', 'Arrange covered workspace; the vessel must stay dry and out of dew during initial cure']::text[],
  '[
  {
    "title": "Photograph vessel & defects",
    "detail": "Photograph all areas to be coated, noting oxidation, stains and gelcoat damage.",
    "caution": null
  },
  {
    "title": "Wash & remove stains",
    "detail": "Wash and remove waterline, rust and scum stains so they are not sealed under the coating.",
    "caution": null
  },
  {
    "title": "Correct oxidation & swirls",
    "detail": "Compound and polish until the gelcoat or paint is fully restored; coating will not fix oxidation.",
    "caution": null
  },
  {
    "title": "Mask non-skid, decals & hardware",
    "detail": "Mask non-skid, rubber, canvas, decals and hardware not being coated.",
    "caution": "Do not coat non-skid unless using a product made for non-skid."
  },
  {
    "title": "Panel wipe to remove oils",
    "detail": "Remove all polishing oils and wax with coating prep.",
    "caution": null
  },
  {
    "title": "Apply coating in sections",
    "detail": "Apply in small sections with a cross-hatch pattern following flash time for the conditions.",
    "caution": null
  },
  {
    "title": "Level & remove high spots",
    "detail": "Level and buff at flash time, then inspect with a light before moving on.",
    "caution": null
  },
  {
    "title": "Coat stainless & glass if included",
    "detail": "Use the appropriate coatings on stainless and glass where included in the package.",
    "caution": null
  },
  {
    "title": "Keep dry during cure",
    "detail": "Keep the vessel covered and dry for the initial cure (typically 12–24 h) before splashing or washing.",
    "caution": null
  },
  {
    "title": "Remove masking & aftercare brief",
    "detail": "Remove tape, take after photos, and give the owner written aftercare: pH-neutral marine soap, no harsh cleaners, regular rinsing of salt.",
    "caution": null
  }
]'::jsonb,
  array['Never coat over oxidized or stained gelcoat', 'Never apply in direct sun, rain, dew or high humidity', 'Never coat non-skid with a product not designed for it', 'Never leave high spots to cure', 'Never launch or wash before initial cure', 'Never use acetone on gelcoat to prep']::text[],
  array['No high spots or streaks under lights', 'Uniform gloss on all coated surfaces', 'Masked areas free of coating', 'Water beads and sheets after cure', 'Aftercare given to owner']::text[],
  array['Before: port, starboard and transom', 'During: 50/50 correction', 'After: gloss shots', 'After: water-beading test']::text[]
),
(
  'boat_interior',
  'watercraft',
  'Interior & Upholstery',
  'Cleaning cabins, cockpits, marine vinyl upholstery, canvas and carpets, with mildew treatment and UV protection. Sell at spring commissioning, after charters and before winter storage.',
  'Up to 25 ft (cockpit) 1–2 h · 26–40 ft 3–5 h · 41–60 ft 5–8 h · 60 ft+ 1 day+',
  '1–3 technicians',
  array['Marine vinyl cleaner and UV protectant', 'Mildew remover safe for marine vinyl (no bleach on stitching)', 'Canvas cleaner and water-repellent treatment', 'Carpet/upholstery shampoo', 'Marine-safe disinfectant for heads and galley', 'Isinglass cleaner']::text[],
  array['Soft and medium brushes', 'Microfiber towels', 'Shop vacuum with crevice tools', 'Low-moisture extractor', 'Steamer (optional)', 'Dehumidifier / fans']::text[],
  array['Confirm marina/yard rules for washing, chemicals and runoff before starting; use containment and biodegradable products where required', 'Walk the vessel with the owner, note and photograph existing damage, gelcoat cracks and stains', 'Secure the boat (lines doubled at the dock or properly blocked/stand-supported on the hard), and use non-slip footwear', 'Close hatches and ports and protect electronics, helm displays and open electrical panels']::text[],
  '[
  {
    "title": "Photograph upholstery & cabin as found",
    "detail": "Photograph seats, canvas, carpets, head and galley, noting mildew, tears and stains.",
    "caution": null
  },
  {
    "title": "Remove cushions & personal items",
    "detail": "Remove loose cushions and personal items, and open lockers for ventilation.",
    "caution": null
  },
  {
    "title": "Ventilate cabin & protect electronics",
    "detail": "Open hatches for airflow and cover helm and cabin electronics.",
    "caution": null
  },
  {
    "title": "Vacuum all areas",
    "detail": "Vacuum upholstery seams, carpets, lockers and bilge access edges.",
    "caution": null
  },
  {
    "title": "Treat mildew on vinyl",
    "detail": "Apply marine-vinyl-safe mildew remover, agitate gently, let dwell and rinse/wipe.",
    "caution": "Bleach and harsh cleaners weaken stitching thread and strip vinyl plasticizers."
  },
  {
    "title": "Clean marine vinyl upholstery",
    "detail": "Clean vinyl with marine vinyl cleaner and a soft brush, wipe dry and apply UV protectant.",
    "caution": null
  },
  {
    "title": "Clean canvas & bimini",
    "detail": "Clean canvas with canvas cleaner and soft brush, rinse well and re-treat with water repellent when dry.",
    "caution": null
  },
  {
    "title": "Extract carpets with low moisture",
    "detail": "Pre-treat and extract carpets, using extra dry passes to avoid mildew.",
    "caution": null
  },
  {
    "title": "Sanitize head & galley",
    "detail": "Clean and disinfect the head and galley with marine-safe products and dedicated towels.",
    "caution": null
  },
  {
    "title": "Clean interior surfaces & windows",
    "detail": "Wipe cabinetry, headliners and hatches; clean ports and isinglass with appropriate cleaners.",
    "caution": null
  },
  {
    "title": "Dry fully before closing up",
    "detail": "Run fans or a dehumidifier until upholstery and carpets are dry.",
    "caution": "Closing up a damp boat guarantees mildew."
  },
  {
    "title": "Reinstall cushions & final walk-through",
    "detail": "Reinstall dry cushions, take after photos and review results with the owner.",
    "caution": null
  }
]'::jsonb,
  array['Never use bleach or harsh solvents on marine vinyl or stitching', 'Never use ammonia cleaners on isinglass', 'Never close up the boat while upholstery or carpet is damp', 'Never spray water into electronics or electrical panels', 'Never use silicone dressings on walking surfaces']::text[],
  array['No visible mildew', 'Vinyl clean and protected with satin finish', 'Canvas clean and water-repellent', 'Carpets and cushions fully dry', 'Head and galley sanitized']::text[],
  array['Before: cockpit seating and cabin', 'Before: close-ups of mildew and stains', 'After: same angles', 'After: canvas/bimini']::text[]
),
(
  'boat_teak_care',
  'watercraft',
  'Teak Clean & Seal',
  'Cleaning weathered teak decks and trim, brightening and applying sealer or oil to restore color and protect the wood. Sell at spring commissioning and mid-season on teak-equipped boats.',
  'Swim platform/trim 1–3 h · 26–40 ft decks 4–8 h · 41–60 ft decks 1–2 days · 60 ft+ 2 days+',
  '1–3 technicians',
  array['Two-part teak cleaner (part A cleaner, part B brightener)', 'One-part mild teak cleaner for light soil', 'Teak sealer or teak oil', 'Marine masking tape and plastic sheeting']::text[],
  array['Soft to medium bristle brush or Scotch-type non-woven pad (fine)', 'Buckets and hose with gentle nozzle', 'Foam brushes or lint-free applicators', 'Chemical-resistant gloves and eye protection', 'Drop cloths']::text[],
  array['Confirm marina/yard rules for washing, chemicals and runoff before starting; use containment and biodegradable products where required', 'Walk the vessel with the owner, note and photograph existing damage, gelcoat cracks and stains', 'Secure the boat (lines doubled at the dock or properly blocked/stand-supported on the hard), and use non-slip footwear', 'Close hatches and ports and protect electronics, helm displays and open electrical panels', 'Check marina rules: teak cleaners are often acidic/caustic and runoff may need containment']::text[],
  '[
  {
    "title": "Photograph teak condition",
    "detail": "Photograph decks and trim showing graying, stains, raised grain, loose plugs and failing caulk seams.",
    "caution": null
  },
  {
    "title": "Check runoff rules & contain",
    "detail": "Confirm marina rules for teak cleaner runoff and set up containment if required.",
    "caution": null
  },
  {
    "title": "Mask gelcoat, paint & hardware",
    "detail": "Mask adjacent gelcoat, paint, stainless and rubber, and wet surrounding gelcoat to dilute any splash.",
    "caution": "Two-part teak cleaners can stain and dull gelcoat and attack metals if left on."
  },
  {
    "title": "Wet the teak thoroughly",
    "detail": "Wet the teak before applying cleaner so it does not soak in unevenly.",
    "caution": null
  },
  {
    "title": "Apply part A & scrub across grain",
    "detail": "Apply part A sparingly and scrub lightly across the grain with a soft brush or fine pad. Keep surfaces wet.",
    "caution": "Wear gloves and eye protection; scrubbing with the grain or too hard digs out soft grain."
  },
  {
    "title": "Rinse, then apply part B brightener",
    "detail": "Rinse well, apply part B to neutralize and brighten, and let it work per label.",
    "caution": null
  },
  {
    "title": "Rinse thoroughly & inspect seams",
    "detail": "Rinse completely, flushing gelcoat too. Check caulk seams and bungs; report any failing seams or loose plugs.",
    "caution": null
  },
  {
    "title": "Let teak dry completely",
    "detail": "Allow teak to dry fully (often 24–48 h) before sealing.",
    "caution": null
  },
  {
    "title": "Apply teak sealer or oil thinly",
    "detail": "Apply a thin coat of sealer or oil with a foam brush, wiping excess before it gums up. Apply additional coats per label.",
    "caution": "Oily rags can spontaneously combust; lay flat to dry or store in a water-filled metal container."
  },
  {
    "title": "Remove masking & clean splash",
    "detail": "Remove tape and clean any sealer or cleaner splash from gelcoat promptly.",
    "caution": null
  },
  {
    "title": "Final inspection & after photos",
    "detail": "Inspect for even color and coverage, take after photos and brief the owner on recoat interval.",
    "caution": null
  }
]'::jsonb,
  array['Never pressure wash teak; it tears out soft grain and ruins the deck', 'Never scrub teak with the grain or with stiff brushes', 'Never let two-part teak cleaners dry on teak, gelcoat or metal', 'Never apply sealer or oil to damp teak', 'Never leave oily rags balled up', 'Never let teak cleaner runoff into the water where prohibited']::text[],
  array['Even golden color with no gray patches', 'Grain smooth, not raised or furrowed', 'No cleaner or sealer stains on gelcoat', 'Seams and plugs inspected and issues reported']::text[],
  array['Before: overall teak areas', 'Before: close-ups of graying and seams', 'During: 50/50 cleaned section', 'After: same areas']::text[]
);

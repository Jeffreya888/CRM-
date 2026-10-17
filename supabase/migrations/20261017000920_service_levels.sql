-- Service levels as defined by the owner:
--   Exterior dry wash: Level 1 (Trip Clean) and Level 2 (Full Exterior; replaces the old single dry_wash guide).
--   Exterior wet wash: Full Exterior only.
--   Interior: Level 1 (Trip Clean, new) and Level 2 (Full Interior, the existing interior_detail guide).
--   Leather: explicit shampoo-then-condition checklist.
-- Guides are general best practice; always follow the aircraft manufacturer's maintenance manual and approved products.

insert into public.service_guides (key, asset_type, title, summary, time_estimate, crew, products, tools, prep, steps, donts, quality_checks, photos) values
(
  'dry_wash_l1',
  'aircraft',
  'Dry Wash — Level 1 (Trip Clean)',
  'A quick waterless exterior refresh between trips: bug removal on leading edges, windows cleaned per the approved method, a wipe of obvious gear and belly grime and spot-cleaning of visible soil. Usually done on the ramp before a departure, so it is fast, focused and timed around the crew. Sell it as a per-trip add-on for managed and charter aircraft; upgrade to Level 2 when the whole airframe needs it.',
  'Piston single 30–60 min · Light jet 1–2 h · Midsize 1.5–2.5 h · Large 2.5–4 h',
  '1–2 technicians',
  array['Approved aircraft dry-wash / waterless cleaner (AMM-approved, AMS 1526-compatible)', 'Approved bug and leading-edge cleaner', 'Approved soot/exhaust cleaner for spot work', 'OEM-approved windshield and acrylic window cleaner (or the approved method for heated glass)', 'Residue-free masking tape (aviation grade)']::text[],
  array['Plush microfiber towels (color-coded: paint, leading edges, windows, gear/belly)', 'Pump sprayer with fine mist', 'Microfiber mop with extension handle for high leading edges', 'Padded step ladder or work stand', 'Approved pitot/static covers with remove-before-flight streamers', 'Dirty-towel bin', 'Headlamp or inspection light for early departures']::text[]
  ,
  array['Confirm the scope (Trip Clean, not Full Exterior) and the crew''s departure or show time, and agree when you must be off the aircraft', 'Confirm the aircraft is chocked, no fueling, maintenance or engine runs in progress, and you know who the crew contact is', 'Do a quick walk-around and photograph any pre-existing damage or discrepancies before touching the aircraft', 'Set up ramp safety: hi-vis vest, hearing protection, FOD walk, stay clear of propeller arcs, engine intakes/exhausts and moving ground equipment', 'Cover or tape pitot tubes, static ports, AOA vanes and TAT probes near the areas you will clean, with remove-before-flight streamers']::text[],
  '[
  {
    "title": "Confirm departure time & Trip Clean scope",
    "detail": "Confirm with the crew or dispatcher when the aircraft must be ready, where it is parked and that the job is a Level 1 Trip Clean. Plan the order of work so the most visible items (leading edges, windshield, entry door) are finished first.",
    "caution": "Be off the aircraft and packed up before the crew starts the preflight. Never delay a departure to finish cosmetic work."
  },
  {
    "title": "Walk around & photograph existing damage",
    "detail": "Do a quick walk-around and photograph dents, chips, cracked lenses, missing fasteners and fluid leaks. Note them on the work order.",
    "caution": "Report any damage, leaks or discrepancies to the crew immediately, before departure."
  },
  {
    "title": "Verify chocks, no fueling & ramp safety",
    "detail": "Check chocks are in place and no fueling, maintenance or engine run is in progress. Do a FOD walk and put on hi-vis and hearing protection; ramps are busy around departure times.",
    "caution": "Never work near a turning propeller or running engine/APU. Stay out of intake and exhaust danger zones."
  },
  {
    "title": "Cover pitot/static ports near work areas",
    "detail": "Cover pitot tubes, static ports, AOA vanes and TAT probes near the nose and any area you will wipe, using approved covers or residue-free tape with streamers. Log every cover you install.",
    "caution": "A missed static-port tape can cause erroneous airspeed/altitude indications. Count covers on and off."
  },
  {
    "title": "Set padded ladder or stand",
    "detail": "Position a padded ladder or stand for the nose, windshield and leading edges so you never reach or lean onto the airframe. Reposition rather than overreach.",
    "caution": "Never lean on or brace against control surfaces, flaps, antennas, static wicks or vortex generators. Never move flight controls."
  },
  {
    "title": "Pre-dust leading edges & nose",
    "detail": "Lightly remove loose dust and grit from the nose, wing and stabilizer leading edges and engine inlet lips with a clean soft microfiber before applying product.",
    "caution": null
  },
  {
    "title": "Remove bugs from leading edges",
    "detail": "Mist approved bug cleaner on leading edges, let it soften the residue for the labeled dwell time, then lift it off with a dedicated soft microfiber. Repeat rather than scrub. Follow with dry-wash product and buff.",
    "caution": "No abrasive pads on leading edges, de-ice boots or erosion tape. Boots use only boot-approved cleaners."
  },
  {
    "title": "Clean windshield & windows per approved method",
    "detail": "Clean the windshield and cabin windows with the OEM-approved cleaner and a dedicated soft microfiber, in straight lines. Inspect for streaks from the cockpit side if you have access.",
    "caution": "Acrylic: no ammonia, alcohol, dry-wash product or abrasive towels. Heated glass windshields use only their approved products."
  },
  {
    "title": "Wipe obvious gear & belly grime",
    "detail": "Wipe visible dirt, brake dust and exhaust streaks from gear doors, struts, wheels and the lower fuselage with dry-wash or approved soot cleaner and dedicated gear/belly towels.",
    "caution": "Do not wipe chrome oleo struts or actuator rods with grit-loaded towels, and do not remove grease from bearings, fittings or lubrication points."
  },
  {
    "title": "Spot-clean visible soil",
    "detail": "Walk the airframe and spot-clean fingerprints, drips, fuel stains and smudges that are visible at eye level: entry door area, fuel caps, nacelles and tail. Mist, lift with straight strokes, then buff with a clean towel.",
    "caution": "Never spray product directly at probes, vents, seams or hinge lines."
  },
  {
    "title": "Wipe entry door, airstair & handles",
    "detail": "Wipe the entry door frame, airstair treads and handrails and exterior handles. This is what passengers see and touch first.",
    "caution": "Do not get product on door seals or leave slippery residue on airstair treads."
  },
  {
    "title": "Remove all covers & tape; count them",
    "detail": "Remove every cover, plug and piece of tape and reconcile against your installed list. Check ports are clean and free of adhesive.",
    "caution": "Do not release the aircraft until every remove-before-flight item is accounted for."
  },
  {
    "title": "Final walk-around & brief the crew",
    "detail": "Walk the aircraft once more, take after photos of leading edges, windshield and entry door, collect towels and equipment, and tell the crew you are clear. Report any discrepancies in writing.",
    "caution": null
  }
]'::jsonb,
  array['Never delay a departure or work during the crew''s preflight without their agreement', 'Never move flight controls or operate aircraft systems (power, lights, doors, APU) unless explicitly authorized by the crew', 'Never lean on or place equipment against control surfaces, flaps, antennas, static wicks or probes', 'Never use a product that is not approved by the aircraft manufacturer''s maintenance manual (AMM) for that surface', 'Never dry wash gritty or sandy areas without pre-dusting; grit will scratch paint', 'Never use dry-wash product on windshields unless the AMM approves it', 'Never leave a cover, plug or tape on the aircraft']::text[],
  array['Leading edges and inlet lips free of bug residue', 'Windshield and windows streak-free from inside and outside', 'No obvious grime on gear doors, wheels or lower fuselage', 'Entry door, airstair and handles clean and dry', 'All covers and tape removed and reconciled before crew arrival']::text[],
  array['Before: nose, leading edges and any pre-existing damage', 'Before/after: one wing leading edge', 'After: windshield, entry door and airstair', 'Any discrepancy reported to the crew']::text[]
),
(
  'dry_wash_l2',
  'aircraft',
  'Dry Wash — Level 2 (Full Exterior)',
  'A complete waterless wash of the entire airframe, panel by panel, with an approved dry-wash product and plenty of clean microfiber, including leading edges, exhaust tracks, belly, gear and windows. Use it where water is prohibited or unavailable: FBO ramps, hangars, cold weather. Sell it on a regular schedule (every 2–6 weeks) or as the step up from a Level 1 Trip Clean.',
  'Piston single 1–2 h · Light jet 2–4 h · Midsize 4–5 h · Large 6–9 h',
  '1–3 technicians',
  array['Approved aircraft dry-wash / waterless cleaner (AMM-approved, AMS 1526-compatible)', 'Approved bug and leading-edge cleaner', 'Approved soot/exhaust cleaner', 'Approved belly/gear cleaner for oil and hydraulic film (towel-applied)', 'OEM-approved windshield and acrylic window cleaner', 'Residue-free masking tape (aviation grade)']::text[],
  array['Large stock of plush microfiber towels (several per panel, color-coded for paint, leading edges/exhaust, belly/gear and windows)', 'Pump sprayers with fine mist', 'Microfiber mop heads on extension poles for high areas', 'Padded ladders / work stands', 'Approved pitot/static covers with remove-before-flight streamers', 'Inspection light for raking-light checks', 'Dirty-towel bin']::text[],
  array['Confirm work authorization and scope with the owner/operator and coordinate time, location and any ramp or hangar rules with the FBO/line service', 'Confirm the aircraft is chocked, grounded where required, no fueling, maintenance or engine runs in progress, and you know who the crew contact is', 'Do a walk-around with the crew/owner and photograph all pre-existing damage and discrepancies before touching the aircraft', 'Set up ramp safety: hi-vis vest, hearing protection, FOD walk, stay clear of propeller arcs, engine intakes/exhausts and moving ground equipment', 'Cover or tape pitot tubes, static ports, AOA vanes, TAT probes, fuel vents, engine inlets/exhausts and APU openings with approved covers or residue-free tape and remove-before-flight streamers', 'Position padded ladders/stands; never lean on or rest equipment against control surfaces, flaps, antennas or static wicks']::text[],
  '[
  {
    "title": "Walk around & photograph pre-existing damage",
    "detail": "Walk the entire aircraft with the crew or owner and photograph dents, chips, paint loss, cracked lenses, missing fasteners and fluid leaks. Note everything on the work order before starting.",
    "caution": "Report any damage or discrepancies to the crew/owner before work begins, not after."
  },
  {
    "title": "Coordinate with FBO, line service & crew",
    "detail": "Confirm where you are allowed to work, power and lighting availability, any hangar rules and the crew''s next departure time. Get a crew contact number in case you find a discrepancy.",
    "caution": null
  },
  {
    "title": "Verify chocks, grounding & no fueling",
    "detail": "Check chocks are in place, the aircraft is grounded if the FBO requires it, and no fueling, maintenance or engine run is happening. Do a FOD walk and put on hearing protection and hi-vis.",
    "caution": "Never work near a turning propeller or running engine/APU. Stay out of intake and exhaust danger zones."
  },
  {
    "title": "Cover pitot/static ports & sensors",
    "detail": "Cover pitot tubes, static ports, AOA vanes, TAT probes, fuel vents and engine/APU openings with approved covers or residue-free tape plus a remove-before-flight streamer. Log every cover you install.",
    "caution": "A missed static-port tape can cause erroneous airspeed/altitude indications. Count covers on and off."
  },
  {
    "title": "Set padded ladders & stands",
    "detail": "Place padded ladders or work stands with soft contact points so you never need to reach or lean onto the airframe. Reposition rather than overreach.",
    "caution": "Never lean on or brace against control surfaces, flaps, antennas, static wicks or vortex generators. Never move flight controls."
  },
  {
    "title": "Assess soil level & plan panel order",
    "detail": "Dry wash suits light to moderate soil. Check for heavy exhaust soot, belly oil or caked mud that needs a dedicated cleaner or a wet wash and tell the customer before you start. Plan a fixed panel sequence: top-down, nose to tail, one side then the other.",
    "caution": null
  },
  {
    "title": "Dust off loose grit first",
    "detail": "Lightly remove loose dust from each area with a clean soft microfiber duster or mop before applying any product, so grit is not dragged across the paint.",
    "caution": null
  },
  {
    "title": "Pre-treat leading edges & exhaust tracks",
    "detail": "Apply approved bug cleaner to leading edges and inlet lips and approved soot cleaner to exhaust tracks so they soften while you work the upper fuselage. Use dedicated towels that never go back on clean paint.",
    "caution": "De-ice boots and erosion tape: boot-approved cleaners only, no abrasives."
  },
  {
    "title": "Mist product on one small section",
    "detail": "Spray approved dry-wash product on a 2×2 ft section (or onto the towel near probes, seams and decals) and let it encapsulate the dirt for a few seconds.",
    "caution": "Never spray directly at pitot/static ports, sensors, vents or into seams and hinge lines."
  },
  {
    "title": "Lift dirt with straight strokes",
    "detail": "Wipe in one direction with a folded microfiber, lifting dirt away instead of scrubbing. Turn to a clean face after every pass.",
    "caution": null
  },
  {
    "title": "Buff off haze with a clean towel",
    "detail": "Immediately follow with a dry, clean microfiber to buff off the residue and leave a streak-free finish before moving to the next overlapping section.",
    "caution": null
  },
  {
    "title": "Work panel by panel; swap towels constantly",
    "detail": "Repeat mist, lift and buff across every panel in your planned order: upper fuselage, vertical and horizontal stabilizers, wings, nacelles, lower fuselage. Use a fresh towel as soon as a face looks dirty; a loaded towel is the main cause of swirl marks.",
    "caution": null
  },
  {
    "title": "Finish leading edges, belly & gear last",
    "detail": "Remove the softened bug and soot residue, then clean the belly, gear doors, struts and wheels with belly/gear towels that are bagged separately afterwards.",
    "caution": "Do not wipe grease from bearings, fittings or lubrication points, and do not scratch chrome oleo struts with gritty towels."
  },
  {
    "title": "Clean windshield & windows with approved cleaner",
    "detail": "Clean windows last with OEM-approved cleaner and a dedicated soft microfiber, in straight lines.",
    "caution": "Acrylic: no ammonia, alcohol or abrasive towels. Heated glass windshields use only their approved products."
  },
  {
    "title": "Remove all covers & tape; count them",
    "detail": "Remove every cover, plug and piece of tape and reconcile against your installed list. Check ports are clean and free of adhesive or residue.",
    "caution": "Do not release the aircraft until every remove-before-flight item is accounted for."
  },
  {
    "title": "Inspect in raking light & report to crew",
    "detail": "Check each panel with an inspection light at a low angle for haze, streaks and missed spots and touch them up. Take after photos from the same angles as the before photos and brief the crew/owner, reporting any new or newly visible discrepancies in writing.",
    "caution": null
  }
]'::jsonb,
  array['Never move flight controls or operate aircraft systems (power, lights, doors, APU) unless explicitly authorized by the crew', 'Never lean on or place equipment against control surfaces, flaps, antennas, static wicks or probes', 'Never use a product that is not approved by the aircraft manufacturer''s maintenance manual (AMM) for that surface', 'Never dry wash heavily soiled or sandy surfaces without pre-dusting; grit will scratch paint', 'Never reuse a dirty towel face, move belly/gear towels back onto paint, or reuse towels dropped on the ramp', 'Never use dry-wash product on windshields unless the AMM approves it', 'Never spray product into probes, vents, seams or hinge lines']::text[],
  array['Every panel cleaned, with uniform gloss and no streaks or haze', 'No new swirl marks visible in direct or raking light', 'Leading edges, inlet lips and exhaust tracks clean', 'Belly, gear doors and wheels free of grime', 'Windows streak-free', 'All covers and tape removed and reconciled']::text[],
  array['Before: four corners plus nose and tail', 'Before: close-ups of pre-existing damage', 'Before/after: a 50/50 test section', 'Before/after: leading edges and exhaust track', 'After: same angles as before photos']::text[]
),
(
  'interior_l1',
  'aircraft',
  'Interior — Level 1 (Trip Clean)',
  'A quick cabin wipe-down between trips: trash and catering removal, tables, armrests and touch points wiped, a quick vacuum of traffic areas, a lav and galley refresh, amenities restocked if the operator provides them, seat belts crossed and pillows and blankets folded. Sell it per trip to charter and managed operators; upgrade to Level 2 (Full Interior) when the cabin needs a deep clean.',
  'Piston single 15–30 min · Light jet 30–45 min · Midsize 45–60 min · Large 60–90 min',
  '1–2 technicians',
  array['Aircraft-approved all-purpose interior cleaner (low VOC, non-flammable)', 'Hospital-grade disinfectant approved for aircraft lav/galley surfaces', 'OEM-approved acrylic window cleaner', 'Veneer-safe cleaner (no silicone)', 'Operator-supplied amenities, linens and consumables (if provided)']::text[],
  array['Cordless HEPA vacuum with soft brush and crevice tool', 'Color-coded microfiber towels (lav, galley, cabin, cockpit)', 'Gloves', 'Trash and recycling bags', 'Protective runner for the entry door', 'Operator cabin-setup photo or checklist']::text[],
  array['Confirm the scope (Trip Clean, not Full Interior), the next departure time and the operator''s cabin setup standard (amenity list, seat belt and pillow arrangement)', 'Confirm the aircraft is chocked, no fueling or maintenance in progress, and that you will not operate any aircraft systems unless authorized', 'Note any damage, stains or inoperative items found on arrival', 'Lay a protective runner at the entry door and airstair']::text[],
  '[
  {
    "title": "Confirm departure time & cabin standard",
    "detail": "Confirm with the crew or dispatcher when the cabin must be ready and the operator''s setup standard: amenity list, seat belt arrangement, pillows and blankets. Ask whether cabin lighting or power is available and who switches it on.",
    "caution": "Do not switch on aircraft power, lighting or lav systems yourself unless the crew authorizes it."
  },
  {
    "title": "Note damage & lost items",
    "detail": "Walk the cabin and note new stains, damage or inoperative items. Photograph anything significant and bag any passenger items left behind, recording the seat they were found at.",
    "caution": "Report damage and lost property to the crew before the next departure."
  },
  {
    "title": "Remove trash, catering & used linens",
    "detail": "Remove trash, catering waste, used cups, newspapers and used linens from the cabin, galley and seat pockets. Separate recycling if the FBO provides it.",
    "caution": null
  },
  {
    "title": "Wipe tables, armrests & touch points",
    "detail": "Spray cleaner onto the towel, never onto the surface, and wipe tables, armrests, cupholders, seat controls, PSU buttons, door handles and the entry handrail.",
    "caution": "Never spray liquids near switch panels, cabin management controls or entertainment screens."
  },
  {
    "title": "Spot-clean veneer & windows",
    "detail": "Remove fingerprints and smudges from veneer, high-gloss trim and cabin windows with dedicated soft microfiber and the right cleaner for each surface.",
    "caution": "No ammonia, alcohol or paper towels on acrylic windows; no silicone or abrasives on veneer."
  },
  {
    "title": "Quick vacuum of traffic areas",
    "detail": "Vacuum the entry, aisle, galley floor and around seats where crumbs and debris are visible. Pick up debris from seat cushions and side ledges.",
    "caution": null
  },
  {
    "title": "Refresh the lav",
    "detail": "With dedicated lav towels and approved disinfectant, wipe the toilet seat and bowl rim, sink, faucet, mirror and counter. Respect the disinfectant dwell time and empty the lav waste bin.",
    "caution": "Do not service the toilet waste system unless trained and authorized. Lav towels never go to the galley or cabin."
  },
  {
    "title": "Refresh the galley",
    "detail": "Wipe galley counters, drawer fronts and coffee maker and oven exteriors with food-safe approved cleaner and dedicated galley towels. Empty the galley waste bin.",
    "caution": null
  },
  {
    "title": "Restock amenities if provided",
    "detail": "Restock tissues, hand towels, soap, water, snacks and other amenities from the operator''s supply to their standard. Note anything that is running low.",
    "caution": null
  },
  {
    "title": "Cross belts; fold pillows & blankets",
    "detail": "Cross or arrange seat belts to the operator''s standard, fold pillows and blankets neatly and return seats to the upright, forward-facing position if the crew allows.",
    "caution": "Do not operate powered seats or berthing functions without authorization."
  },
  {
    "title": "Wipe cockpit touch points lightly",
    "detail": "If the crew wants the cockpit included, dust the glareshield and side consoles with a dry soft microfiber and remove trash. Leave displays and controls untouched unless specifically asked.",
    "caution": "Never move flight controls or change switches, breakers or avionics settings."
  },
  {
    "title": "Final check & report to crew",
    "detail": "Remove the runner, take after photos of each cabin zone, lav and galley, and tell the crew the cabin is ready. Report damage, low stock and lost items in writing.",
    "caution": null
  }
]'::jsonb,
  array['Never spray liquids directly into or near avionics, switch panels, cabin management controls or breakers', 'Never move flight controls or change switch, breaker or avionics settings', 'Never operate aircraft systems (power, lighting, lav, doors, powered seats) unless authorized', 'Never use ammonia, alcohol or paper towels on acrylic windows', 'Never cross-contaminate: lav towels never go to the galley or cabin', 'Never throw away passenger items; bag and hand them to the crew']::text[],
  array['No trash, crumbs or catering left in cabin, galley or seat pockets', 'Tables, armrests and touch points clean and dry', 'Lav and galley refreshed and smelling neutral', 'Amenities stocked to the operator standard', 'Seat belts crossed, pillows and blankets folded', 'Cockpit settings untouched']::text[],
  array['Before: each cabin zone as found', 'Before: any new damage or stains', 'After: each cabin zone set up', 'After: lav and galley']::text[]
);

-- Level 2 dry wash replaces the original single dry-wash guide.
delete from public.service_guides where key = 'dry_wash' and org_id is null;

-- Wet wash is Full Exterior only.
update public.service_guides set
  title = 'Exterior Wet Wash (Full Exterior)',
  summary = 'A full exterior wet wash of the entire airframe using AMM-approved aircraft cleaner to remove dirt, exhaust soot and bug residue. Sell it as the base exterior service and on a regular schedule (every 2–6 weeks depending on operation) to protect paint and allow inspection; where water is not allowed, offer Dry Wash Level 2 instead.'
where key = 'exterior_wash' and org_id is null;

-- Interior detail becomes Level 2 (Full Interior).
update public.service_guides set
  title = 'Interior — Level 2 (Full Interior)',
  summary = 'A complete cabin and cockpit detail: top-down HEPA vacuum, full wipe-down of every surface, leather cleaned and conditioned, veneer, lav and galley sanitation and fabric spot treatment, using products safe for aircraft materials. Sell it monthly, after charters, before owner flights and inspections; between trips, a Level 1 Trip Clean keeps the cabin ready.'
where key = 'interior_detail' and org_id is null;

-- Leather: explicit shampoo-then-condition checklist.
update public.service_guides set
  title = 'Leather Shampoo & Conditioning',
  summary = 'A two-stage leather service: shampoo the seats and trim with a pH-neutral leather cleaner and soft brush to lift body oils, dye transfer and grime, then condition and protect so the leather stays soft and resists cracking. Done section by section, with avionics and fire-blocking upholstery protected. Sell every 3–6 months, or with a Level 2 Full Interior.',
  products = array['pH-neutral leather shampoo / cleaner (foaming, water-based)', 'Aniline/nubuck-specific cleaner and protector (only where that leather is present)', 'Water-based leather conditioner (non-greasy, no silicone)', 'Water-based leather protectant with UV inhibitors', 'Dye-transfer remover for leather (test first)', 'Aircraft-approved interior cleaner for surrounding trim']::text[],
  tools = array['Soft horsehair leather brushes (one for shampoo, one for conditioner)', 'Small detail brushes for stitching and piping', 'White microfiber towels (to check for color transfer)', 'Foam applicator pads', 'Foaming pump sprayer', 'HEPA vacuum with soft brush and crevice tool', 'Clean lint-free covers or plastic sheeting for avionics and switches', 'Inspection light']::text[],
  steps = '[
  {
    "title": "Inspect & photograph leather condition",
    "detail": "Photograph each seat and panel and inspect under good light for cracks, wear, dye loss, scuffs, stains and loose stitching. Note everything on the work order.",
    "caution": "Report damage to the crew/owner before you begin; tears or cracking need an upholstery shop, not cleaning."
  },
  {
    "title": "Protect avionics, switches & veneer",
    "detail": "Cover avionics displays, switch panels, cabin management controls and nearby veneer with clean lint-free covers or plastic sheeting before any product comes out.",
    "caution": "Never move flight controls or adjust powered crew or passenger seats unless authorized."
  },
  {
    "title": "Identify finish: aniline vs pigmented",
    "detail": "Put a drop of water on a hidden spot. If it soaks in and darkens, the leather is aniline or semi-aniline and needs minimal moisture and specialist products; if it beads, it is pigmented (finished). Nubuck and suede are cleaned dry only.",
    "caution": null
  },
  {
    "title": "Vacuum seams, piping & perforations",
    "detail": "Vacuum seams, piping, perforations and seat crevices with a soft brush tool to remove grit that would otherwise be scrubbed into the leather.",
    "caution": null
  },
  {
    "title": "Test shampoo on a hidden spot",
    "detail": "Apply shampoo to a hidden area, agitate lightly, wipe with a white towel and check for color transfer or dulling. Proceed only if the result is clean.",
    "caution": "If color comes off on the towel, stop and switch to a gentler aniline-safe cleaner."
  },
  {
    "title": "Shampoo one small section at a time",
    "detail": "Foam shampoo onto the brush, not the leather, and work a section about the size of a seat cushion panel in light overlapping circles until the dirt lifts into the foam.",
    "caution": "Avoid soaking perforated leather, stitching or seat foam; fire-blocking layers and foam must not get wet."
  },
  {
    "title": "Wipe residue immediately",
    "detail": "Wipe the foam and lifted dirt off right away with a clean white microfiber, turning to a fresh face often. Repeat on heavily soiled areas such as headrests and armrests.",
    "caution": null
  },
  {
    "title": "Clean stitching & piping with detail brush",
    "detail": "Work shampoo into stitching and piping with a small soft detail brush and wipe clean.",
    "caution": null
  },
  {
    "title": "Treat dye transfer & stubborn spots",
    "detail": "Use dye-transfer remover sparingly on stained areas only, after a test spot, and wipe clean.",
    "caution": null
  },
  {
    "title": "Let the leather dry completely",
    "detail": "Let each section air-dry or pat it with a dry towel until fully dry before any conditioner goes on. Conditioner on damp leather blotches and traps dirt.",
    "caution": null
  },
  {
    "title": "Apply conditioner thinly",
    "detail": "Apply a thin, even coat of water-based conditioner with a foam applicator, working it into the grain section by section. Use an aniline-specific product on aniline leather.",
    "caution": "No silicone dressings anywhere near flight controls, rudder pedals or crew seat tracks; slippery residue is a safety hazard."
  },
  {
    "title": "Buff to a natural satin finish",
    "detail": "After the labeled absorption time, buff with a clean microfiber to remove excess. The surface should feel soft and dry, not slick.",
    "caution": "Excess conditioner leaves a greasy film that transfers to clothing."
  },
  {
    "title": "Allow cure time before use",
    "detail": "Leave the leather to cure for the product''s stated time (typically 1–2 h, overnight is ideal) before passengers sit on it, and tell the crew when the seats are ready.",
    "caution": null
  },
  {
    "title": "Apply UV protection & close shades",
    "detail": "Apply a UV protectant if not part of the conditioner and close window shades when the aircraft is parked outside to slow fading and drying.",
    "caution": null
  },
  {
    "title": "Remove covers & final inspection",
    "detail": "Remove protective covers, wipe adjacent trim with towel-applied interior cleaner, inspect in good light, take after photos and report any cracking, dye loss or wear needing professional repair.",
    "caution": null
  }
]'::jsonb,
  donts = array['Never use household cleaners, alcohol, solvents, baby wipes or magic erasers on aircraft leather', 'Never soak perforated leather, stitching or seat foam; fire-blocking layers must stay dry', 'Never use silicone-based or greasy dressings, especially near flight controls, pedals or crew seats', 'Never condition leather that is still damp from shampooing', 'Never spray products near avionics, switches or cabin management controls', 'Never adjust powered crew seats or move flight controls without authorization', 'Never use pigmented-leather products on aniline or nubuck']::text[],
  quality_checks = array['No color transfer on a clean white towel', 'Seams, piping and perforations free of grime', 'Even satin finish, soft and dry to the touch with no greasy residue', 'Cure time observed and communicated to the crew', 'Surrounding trim clean and avionics covers removed']::text[]
where key = 'leather_care' and org_id is null;

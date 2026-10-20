-- Brightwork polishing methods (owner request): rotary / dual-action polisher (the
-- existing guide, renamed), pneumatic drum buffer and electric drum buffer. A company
-- picks the method for its Brightwork Polish service from the SOP list in the service
-- editor. On both drum buffers the cutting compound goes on the metal, not on the pad.
-- General best practice; always follow the aircraft manufacturer's maintenance manual,
-- the polish system's instructions and the tool and compressor manufacturers' guidance.

update public.service_guides
set title = 'Brightwork Polish — Rotary / Dual-Action',
    summary = summary || ' This SOP covers rotary and dual-action polishers; use a "Drum Buffer" SOP (pneumatic or electric) when your crew polishes with a drum buffer.'
where org_id is null and key = 'brightwork_polish';

insert into public.service_guides (key, asset_type, title, summary, time_estimate, crew, products, tools, prep, steps, donts, quality_checks, photos) values
(
  'brightwork_polish_drum_pneumatic',
  'aircraft',
  'Brightwork Polish — Pneumatic Drum Buffer',
  'Polishing bare polishable aluminum (leading edges, intake lips, spinners, trim and fully polished skins) with a pneumatic drum buffer running off a commercial air compressor (at least 90 CFM), fitted with wool or combo pads held by metal spring pins. A drum cuts faster and flatter than a pad on long, straight surfaces but builds heat quickly and can grab edges, so technique, drum control and heat checks are what make it safe. Cutting compound goes on the metal, not on the pad. Cut with the drum and its cut pad, then finish with the polish drum pad or a dual-action polisher. Use the "Rotary / Dual-Action" SOP for small curved parts the drum cannot reach.',
  'Light jet leading edges 5–8 h · Midsize 7–10 h · Large leading edges & intakes 10–14 h · Full polished airframe multi-day',
  '2–3 technicians (one polishing, one wiping/inspecting; rotate every 30–45 min)',
  array['AMM-approved aircraft metal polish system (cutting and finishing grades)', 'Approved cleaner for pre-wash (AMS 1526)', 'Residue-free fine-line masking tape and masking paper', 'Approved protective metal sealant or wax', 'Clean cotton polishing cloths and microfiber towels', 'Approved solvent wipe for residue (per AMM)', 'Pneumatic air tool oil']::text[],
  array['Pneumatic drum buffer', 'Commercial air compressor (at least 90 CFM)', 'Air hoses, couplers and whip checks rated for the compressor', 'Wool and combo drum pads (cut and polish) with metal spring pins', 'Drum pad rake or cleaning comb', 'Dual-action polisher with finishing pads (optional finishing method)', 'Hand applicators and soft detail brushes', 'Padded ladders / work stands', 'Face shield or safety glasses, respirator for polish dust, hearing protection and nitrile gloves', 'Infrared thermometer (or back-of-hand heat check)', 'Good lighting (LED work lights)']::text[],
  array['Confirm work authorization and scope with the owner/operator and coordinate time, location and any wash-rack rules with the FBO/line service', 'Confirm the aircraft is chocked, grounded where required, no fueling, maintenance or engine runs in progress, and you know who the crew contact is', 'Do a walk-around with the crew/owner and photograph all pre-existing damage and discrepancies before touching the aircraft', 'Set up ramp safety: hi-vis vest, hearing protection, FOD walk, stay clear of propeller arcs, engine intakes/exhausts and moving ground equipment', 'Cover or tape pitot tubes, static ports, AOA vanes, TAT probes, fuel vents, engine inlets/exhausts and APU openings with approved covers or residue-free tape and remove-before-flight streamers', 'Position padded ladders/stands; never lean on or rest equipment against control surfaces, flaps, antennas or static wicks', 'Plan the compressor location with the FBO (noise, exhaust and hose routing) and keep it and the hoses away from fuel vents, tires and walkways']::text[],
  '[
  {
    "title": "Walk around & photograph pre-existing damage",
    "detail": "Walk the entire aircraft with the crew or owner and photograph dents, chips, paint loss, cracked lenses, missing fasteners, corrosion and existing polish condition. Note everything on the work order before starting.",
    "caution": "Report any damage, corrosion or discrepancies to the crew/owner before work begins, not after.",
    "minutes": 15,
    "products": []
  },
  {
    "title": "Verify chocks, grounding, no fueling & cover sensors",
    "detail": "Check chocks and grounding, confirm no fueling, maintenance or engine runs, do a FOD walk, then cover pitot tubes, static ports, AOA vanes, TAT probes, fuel vents and inlets with approved covers plus remove-before-flight streamers. Log every cover you install.",
    "caution": "A missed static-port cover can cause erroneous airspeed/altitude indications. Count covers on and off.",
    "minutes": 20,
    "products": []
  },
  {
    "title": "Identify polishable vs coated metal",
    "detail": "Confirm which surfaces are bare polishable metal. Clad aluminum, anodized, chromate/alodine-treated and clear-coated surfaces are not all meant to be polished; check the AMM or ask maintenance if unsure. Note thin skins, sharp edges and areas with raised fasteners the drum must avoid.",
    "caution": "Never polish anodized or chromated surfaces that are not meant to be polished; you will remove corrosion protection.",
    "minutes": 10,
    "products": []
  },
  {
    "title": "Wash & dry the work area",
    "detail": "Wash the brightwork with approved cleaner and dry it fully so grit is not trapped in the drum pad and dragged across the metal.",
    "caution": "Any grit picked up by the pad will scratch the whole panel; never buff a dirty surface.",
    "minutes": 30,
    "products": [
      "Approved cleaner for pre-wash (AMS 1526)",
      "Clean cotton polishing cloths and microfiber towels"
    ]
  },
  {
    "title": "Mask paint lines, boots, seals & decals",
    "detail": "Mask all paint lines, de-ice boots, rubber seals, decals, lights and sealant beads bordering the metal with fine-line tape and paper. Double-mask edges where the drum will run close.",
    "caution": "A drum can burn through masking and paint in seconds at an edge. Leave a margin and finish the last half inch by hand.",
    "minutes": 40,
    "products": [
      "Residue-free fine-line masking tape and masking paper"
    ]
  },
  {
    "title": "Connect air hoses to the compressor",
    "detail": "Position the commercial air compressor (at least 90 CFM) where the FBO allows, away from fuel vents and the aircraft. Drain water from the tank, then connect the air hoses to the compressor, making sure every coupler is fully seated and whip checks are fitted on the connections. Run the hose on the ground clear of walkways and tires. Do not connect the hose to the buffer yet.",
    "caution": "An undersized compressor makes the buffer bog down and polish unevenly. A loose coupler under pressure can whip violently.",
    "minutes": 10,
    "products": []
  },
  {
    "title": "Set buffer to OFF & throttle fully closed",
    "detail": "Twist the drum buffer to the off position and close the throttle all the way before handling the drum or connecting air.",
    "caution": "Never install a pad or connect air with the buffer switched on or the throttle open; it can start unexpectedly.",
    "minutes": 2,
    "products": []
  },
  {
    "title": "Install the cut pad with the spring pins",
    "detail": "Remove the metal spring pins, slide the wool or combo cut pad onto the drum, fold the pad ends in and secure them with the metal spring pins. Check the pad sits evenly and the pins are fully seated.",
    "caution": "A loose pin or pad end can fly off at speed; recheck before every start.",
    "minutes": 5,
    "products": []
  },
  {
    "title": "Oil the buffer (3 drops)",
    "detail": "Put three drops of pneumatic air tool oil into the air inlet at the throttle end of the buffer.",
    "caution": null,
    "minutes": 1,
    "products": [
      "Pneumatic air tool oil"
    ]
  },
  {
    "title": "Connect the air hose & put on PPE",
    "detail": "Connect the air hose to the buffer and check for leaks. Put on face shield or glasses, a respirator for polish dust, hearing protection (pneumatic buffers are loud) and gloves. With the drum clear of everything, open the throttle briefly to check it spins true with no loose threads.",
    "caution": "Keep hands, clothing, hair and the hose clear of the spinning drum.",
    "minutes": 3,
    "products": []
  },
  {
    "title": "Apply cutting compound to the metal",
    "detail": "Apply a small amount of cutting compound directly to the metal on the first section (not to the drum pad), spread thin over about a 2 ft length. Reapply to the metal for each new section; add product sparingly so it does not sling or smear.",
    "caution": "Do not load compound onto the drum pad itself.",
    "minutes": 5,
    "products": [
      "AMM-approved aircraft metal polish system (cutting and finishing grades)"
    ]
  },
  {
    "title": "Test section & set speed",
    "detail": "On a small inconspicuous area, run the drum flat with light pressure along the length of the panel. Check cut, heat and finish, then adjust speed and pressure to the least aggressive setting that removes the oxidation.",
    "caution": "Start slow; heat and cut rise sharply with speed and pressure.",
    "minutes": 10,
    "products": [
      "AMM-approved aircraft metal polish system (cutting and finishing grades)"
    ]
  },
  {
    "title": "Cut in long, straight, overlapping passes",
    "detail": "Keep the drum fully flat on the surface with both hands, move steadily along the length of the leading edge or panel, overlap each pass by about half the drum width, and lift off only while moving. Orient rotation so the drum pulls away from edges, never into them. Work sections about 2 ft long.",
    "caution": "Never stop in one place, tilt onto the drum edge, or run off an edge or over raised rivet heads, antennas, lights or fasteners: the drum will grab, gouge or burn through.",
    "minutes": 90,
    "products": [
      "AMM-approved aircraft metal polish system (cutting and finishing grades)"
    ]
  },
  {
    "title": "Heat-check every section",
    "detail": "After each section check skin temperature with an infrared thermometer or the back of your hand. If the metal is hot to the touch, move to another section and let it cool before continuing.",
    "caution": "Overheating can soften sealants, damage bonded structure and discolor thin skins. If in doubt, stop and let it cool.",
    "minutes": 10,
    "products": []
  },
  {
    "title": "Wipe residue & rake the drum pad",
    "detail": "Wipe the black residue off each section before it dries using clean cloths, folding to a clean face often. Rake or comb the drum pad regularly to remove spent compound and metal so it keeps cutting cleanly.",
    "caution": "A glazed, dirty pad overheats the metal and leaves streaks. Clean it before it loads up.",
    "minutes": 30,
    "products": [
      "Clean cotton polishing cloths and microfiber towels"
    ]
  },
  {
    "title": "Inspect under light & repeat cut where needed",
    "detail": "Inspect each section with a work light at a low angle. Repeat cutting passes (compound on the metal) only where oxidation or deep haze remains; do not over-polish areas that are already clear.",
    "caution": null,
    "minutes": 20,
    "products": [
      "AMM-approved aircraft metal polish system (cutting and finishing grades)"
    ]
  },
  {
    "title": "Polish: change to the polish drum pad — or finish with a dual-action",
    "detail": "Choose one finishing method. Option A (drum): close the throttle, twist the buffer to off and disconnect the air hose, remove the spring pins, swap the cut pad for a clean polish pad (fold the ends in and re-secure with the spring pins), then reconnect the air. Apply finishing polish to the metal and refine every section with lighter pressure and overlapping passes in the same direction. Option B (dual-action): finish with a dual-action polisher, a clean finishing pad and finishing polish, working small sections with slow overlapping passes. Either way, continue until the haze is gone and a mirror finish develops.",
    "caution": "Never finish with the cut pad or mix polish grades on one pad; it will re-scratch the surface. Keep the dual-action pad flat and off paint lines and edges.",
    "minutes": 60,
    "products": [
      "AMM-approved aircraft metal polish system (cutting and finishing grades)",
      "Clean cotton polishing cloths and microfiber towels"
    ]
  },
  {
    "title": "Hand-finish edges, rivets & tight areas",
    "detail": "Polish by hand the margins next to masking, around fasteners, lights, antennas and any curve the drum cannot sit flat on. Clear dried polish from rivet heads and panel seams with a soft brush.",
    "caution": null,
    "minutes": 30,
    "products": [
      "AMM-approved aircraft metal polish system (cutting and finishing grades)",
      "Clean cotton polishing cloths and microfiber towels"
    ]
  },
  {
    "title": "Final residue wipe",
    "detail": "Remove all remaining polish film with clean towels and, if the polish system calls for it, an approved solvent wipe so the protectant bonds to clean metal.",
    "caution": "Use only solvents approved by the AMM; keep them off paint, seals and de-ice boots.",
    "minutes": 20,
    "products": [
      "Approved solvent wipe for residue (per AMM)",
      "Clean cotton polishing cloths and microfiber towels"
    ]
  },
  {
    "title": "Apply approved protectant",
    "detail": "Apply an approved metal sealant or wax by hand in a thin, even coat and follow the cure time on the label before buffing off.",
    "caution": null,
    "minutes": 30,
    "products": [
      "Approved protective metal sealant or wax",
      "Clean cotton polishing cloths and microfiber towels"
    ]
  },
  {
    "title": "Remove masking & clean paint edges",
    "detail": "Pull masking slowly at a low angle and clean any polish that crept onto paint, seals or boots.",
    "caution": null,
    "minutes": 15,
    "products": [
      "Clean cotton polishing cloths and microfiber towels"
    ]
  },
  {
    "title": "Remove all covers & tape; count them",
    "detail": "Remove every cover, plug and piece of tape and reconcile against your installed list. Check ports and vents are clean and free of polish, adhesive or residue.",
    "caution": "Do not release the aircraft until every remove-before-flight item is accounted for.",
    "minutes": 10,
    "products": []
  },
  {
    "title": "Shut down air, clean & store pads; final walk-around & report",
    "detail": "Close the throttle, twist the buffer to off, disconnect it and bleed the air from the hose before uncoupling. Drain the compressor tank. Clean the drum pads (and dual-action pads if used), bag them separately by grade and store them sealed so they stay free of grit. Walk the aircraft, take after photos from the same angles as the before photos and brief the crew/owner, reporting any new or newly visible discrepancies in writing.",
    "caution": null,
    "minutes": 15,
    "products": []
  }
]'::jsonb,
  array['Never install or change a pad, or connect air, with the buffer switched on or the throttle open', 'Never disconnect a hose under pressure; close the throttle and bleed the line first', 'Never stop the drum in one place, tilt it onto its edge, or run it off an edge or over raised fasteners, antennas, lights or probes', 'Never let the metal get hot to the touch; move to another section and let it cool', 'Never load cutting compound onto the drum pad; apply it to the metal', 'Never mix polish grades on one pad or use a dirty, glazed pad', 'Never polish anodized, alodined/chromated or clear-coated surfaces not designed to be polished', 'Never use polish or solvents not approved by the AMM, or let them sit on paint, seals or de-ice boots', 'Never move flight controls, lean on control surfaces, or operate aircraft systems unless explicitly authorized by the crew', 'Never run the compressor or hoses near fuel vents or during fueling']::text[],
  array['Uniform mirror finish with no haze, holograms, drum marks or streaks', 'No burns, discoloration or heat marks on skins, edges or rivet heads', 'No polish residue in seams, rivets, vents or on paint, seals and boots', 'Paint lines, decals and sealant beads undamaged', 'Protectant applied evenly and fully buffed off', 'All covers and tape reconciled']::text[],
  array['Before: close-up of oxidation on each polished area', 'Before: masking setup and drum buffer setup', 'Before/after: 50/50 section on a leading edge', 'After: finished brightwork in good light from the same angles', 'After: paint lines and edges next to polished metal']::text[]
),
(
  'brightwork_polish_drum_electric',
  'aircraft',
  'Brightwork Polish — Electric Drum Buffer',
  'Polishing bare polishable aluminum (leading edges, intake lips, spinners, trim and fully polished skins) with an electric drum buffer fitted with interchangeable cut and polish drum pads. A drum cuts faster and flatter than a pad on long, straight surfaces but builds heat quickly and can grab edges, so technique, drum control and heat checks are what make it safe. Cutting compound goes on the metal, not on the pad. Cut with the drum and its cut pad, then finish with the polish drum pad or a dual-action polisher. Use the "Rotary / Dual-Action" SOP for small curved parts the drum cannot reach.',
  'Light jet leading edges 5–8 h · Midsize 7–10 h · Large leading edges & intakes 10–14 h · Full polished airframe multi-day',
  '2–3 technicians (one polishing, one wiping/inspecting; rotate every 30–45 min)',
  array['AMM-approved aircraft metal polish system (cutting and finishing grades)', 'Approved cleaner for pre-wash (AMS 1526)', 'Residue-free fine-line masking tape and masking paper', 'Approved protective metal sealant or wax', 'Clean cotton polishing cloths and microfiber towels', 'Approved solvent wipe for residue (per AMM)']::text[],
  array['Variable-speed electric drum buffer with side handle and drum guard', 'Interchangeable cut and polish drum pads (labeled)', 'Extension cord with GFCI and cord management', 'Drum pad rake or cleaning comb', 'Dual-action polisher with finishing pads (optional finishing method)', 'Hand applicators and soft detail brushes', 'Padded ladders / work stands', 'Face shield or safety glasses, respirator for polish dust, hearing protection and nitrile gloves', 'Infrared thermometer (or back-of-hand heat check)', 'Good lighting (LED work lights)']::text[],
  array['Confirm work authorization and scope with the owner/operator and coordinate time, location and any wash-rack rules with the FBO/line service', 'Confirm the aircraft is chocked, grounded where required, no fueling, maintenance or engine runs in progress, and you know who the crew contact is', 'Do a walk-around with the crew/owner and photograph all pre-existing damage and discrepancies before touching the aircraft', 'Set up ramp safety: hi-vis vest, hearing protection, FOD walk, stay clear of propeller arcs, engine intakes/exhausts and moving ground equipment', 'Cover or tape pitot tubes, static ports, AOA vanes, TAT probes, fuel vents, engine inlets/exhausts and APU openings with approved covers or residue-free tape and remove-before-flight streamers', 'Position padded ladders/stands; never lean on or rest equipment against control surfaces, flaps, antennas or static wicks', 'Route power cords on the ground away from fuel vents, tires and walkways; use a GFCI and keep electric tools away from any fuel vapors']::text[],
  '[
  {
    "title": "Walk around & photograph pre-existing damage",
    "detail": "Walk the entire aircraft with the crew or owner and photograph dents, chips, paint loss, cracked lenses, missing fasteners, corrosion and existing polish condition. Note everything on the work order before starting.",
    "caution": "Report any damage, corrosion or discrepancies to the crew/owner before work begins, not after.",
    "minutes": 15,
    "products": []
  },
  {
    "title": "Verify chocks, grounding, no fueling & cover sensors",
    "detail": "Check chocks and grounding, confirm no fueling, maintenance or engine runs, do a FOD walk, then cover pitot tubes, static ports, AOA vanes, TAT probes, fuel vents and inlets with approved covers plus remove-before-flight streamers. Log every cover you install.",
    "caution": "A missed static-port cover can cause erroneous airspeed/altitude indications. Count covers on and off.",
    "minutes": 20,
    "products": []
  },
  {
    "title": "Identify polishable vs coated metal",
    "detail": "Confirm which surfaces are bare polishable metal. Clad aluminum, anodized, chromate/alodine-treated and clear-coated surfaces are not all meant to be polished; check the AMM or ask maintenance if unsure. Note thin skins, sharp edges and areas with raised fasteners the drum must avoid.",
    "caution": "Never polish anodized or chromated surfaces that are not meant to be polished; you will remove corrosion protection.",
    "minutes": 10,
    "products": []
  },
  {
    "title": "Wash & dry the work area",
    "detail": "Wash the brightwork with approved cleaner and dry it fully so grit is not trapped in the drum pad and dragged across the metal.",
    "caution": "Any grit picked up by the pad will scratch the whole panel; never buff a dirty surface.",
    "minutes": 30,
    "products": [
      "Approved cleaner for pre-wash (AMS 1526)",
      "Clean cotton polishing cloths and microfiber towels"
    ]
  },
  {
    "title": "Mask paint lines, boots, seals & decals",
    "detail": "Mask all paint lines, de-ice boots, rubber seals, decals, lights and sealant beads bordering the metal with fine-line tape and paper. Double-mask edges where the drum will run close.",
    "caution": "A drum can burn through masking and paint in seconds at an edge. Leave a margin and finish the last half inch by hand.",
    "minutes": 40,
    "products": [
      "Residue-free fine-line masking tape and masking paper"
    ]
  },
  {
    "title": "Set up the electric drum buffer & PPE",
    "detail": "Inspect the buffer, guard, side handle and cord. With the buffer unplugged, fit a clean cut drum pad, then plug into a GFCI-protected cord and set the speed low to start. Put on face shield or glasses, respirator, hearing protection and gloves, and check the drum spins true with no loose threads.",
    "caution": "Never run a drum buffer without the guard and side handle. Loose clothing, hair and cords must stay clear of the drum.",
    "minutes": 10,
    "products": []
  },
  {
    "title": "Apply cutting compound to the metal",
    "detail": "Apply a small amount of cutting compound directly to the metal on the first section (not to the drum pad), spread thin over about a 2 ft length. Reapply to the metal for each new section; add product sparingly so it does not sling or smear.",
    "caution": "Do not load compound onto the drum pad itself.",
    "minutes": 5,
    "products": [
      "AMM-approved aircraft metal polish system (cutting and finishing grades)"
    ]
  },
  {
    "title": "Test section & set speed",
    "detail": "On a small inconspicuous area, run the drum flat with light pressure along the length of the panel. Check cut, heat and finish, then adjust speed and pressure to the least aggressive setting that removes the oxidation.",
    "caution": "Start slow; heat and cut rise sharply with speed and pressure.",
    "minutes": 10,
    "products": [
      "AMM-approved aircraft metal polish system (cutting and finishing grades)"
    ]
  },
  {
    "title": "Cut in long, straight, overlapping passes",
    "detail": "Keep the drum fully flat on the surface with both hands, move steadily along the length of the leading edge or panel, overlap each pass by about half the drum width, and lift off only while moving. Orient rotation so the drum pulls away from edges, never into them. Work sections about 2 ft long.",
    "caution": "Never stop in one place, tilt onto the drum edge, or run off an edge or over raised rivet heads, antennas, lights or fasteners: the drum will grab, gouge or burn through.",
    "minutes": 90,
    "products": [
      "AMM-approved aircraft metal polish system (cutting and finishing grades)"
    ]
  },
  {
    "title": "Heat-check every section",
    "detail": "After each section check skin temperature with an infrared thermometer or the back of your hand. If the metal is hot to the touch, move to another section and let it cool before continuing.",
    "caution": "Overheating can soften sealants, damage bonded structure and discolor thin skins. If in doubt, stop and let it cool.",
    "minutes": 10,
    "products": []
  },
  {
    "title": "Wipe residue & rake the drum pad",
    "detail": "Wipe the black residue off each section before it dries using clean cloths, folding to a clean face often. Rake or comb the drum pad regularly to remove spent compound and metal so it keeps cutting cleanly.",
    "caution": "A glazed, dirty pad overheats the metal and leaves streaks. Clean it before it loads up.",
    "minutes": 30,
    "products": [
      "Clean cotton polishing cloths and microfiber towels"
    ]
  },
  {
    "title": "Inspect under light & repeat cut where needed",
    "detail": "Inspect each section with a work light at a low angle. Repeat cutting passes (compound on the metal) only where oxidation or deep haze remains; do not over-polish areas that are already clear.",
    "caution": null,
    "minutes": 20,
    "products": [
      "AMM-approved aircraft metal polish system (cutting and finishing grades)"
    ]
  },
  {
    "title": "Polish: change to the polish drum pad — or finish with a dual-action",
    "detail": "Choose one finishing method. Option A (drum): unplug the buffer, swap the cut pad for a clean polish drum pad, then plug back in. Apply finishing polish to the metal and refine every section with lighter pressure and overlapping passes in the same direction. Option B (dual-action): finish with a dual-action polisher, a clean finishing pad and finishing polish, working small sections with slow overlapping passes. Either way, continue until the haze is gone and a mirror finish develops.",
    "caution": "Never finish with the cut pad or mix polish grades on one pad; it will re-scratch the surface. Keep the dual-action pad flat and off paint lines and edges.",
    "minutes": 60,
    "products": [
      "AMM-approved aircraft metal polish system (cutting and finishing grades)",
      "Clean cotton polishing cloths and microfiber towels"
    ]
  },
  {
    "title": "Hand-finish edges, rivets & tight areas",
    "detail": "Polish by hand the margins next to masking, around fasteners, lights, antennas and any curve the drum cannot sit flat on. Clear dried polish from rivet heads and panel seams with a soft brush.",
    "caution": null,
    "minutes": 30,
    "products": [
      "AMM-approved aircraft metal polish system (cutting and finishing grades)",
      "Clean cotton polishing cloths and microfiber towels"
    ]
  },
  {
    "title": "Final residue wipe",
    "detail": "Remove all remaining polish film with clean towels and, if the polish system calls for it, an approved solvent wipe so the protectant bonds to clean metal.",
    "caution": "Use only solvents approved by the AMM; keep them off paint, seals and de-ice boots.",
    "minutes": 20,
    "products": [
      "Approved solvent wipe for residue (per AMM)",
      "Clean cotton polishing cloths and microfiber towels"
    ]
  },
  {
    "title": "Apply approved protectant",
    "detail": "Apply an approved metal sealant or wax by hand in a thin, even coat and follow the cure time on the label before buffing off.",
    "caution": null,
    "minutes": 30,
    "products": [
      "Approved protective metal sealant or wax",
      "Clean cotton polishing cloths and microfiber towels"
    ]
  },
  {
    "title": "Remove masking & clean paint edges",
    "detail": "Pull masking slowly at a low angle and clean any polish that crept onto paint, seals or boots.",
    "caution": null,
    "minutes": 15,
    "products": [
      "Clean cotton polishing cloths and microfiber towels"
    ]
  },
  {
    "title": "Remove all covers & tape; count them",
    "detail": "Remove every cover, plug and piece of tape and reconcile against your installed list. Check ports and vents are clean and free of polish, adhesive or residue.",
    "caution": "Do not release the aircraft until every remove-before-flight item is accounted for.",
    "minutes": 10,
    "products": []
  },
  {
    "title": "Clean & store drum pads; final walk-around & report",
    "detail": "Unplug the buffer. Clean the drum pads (and dual-action pads if used), bag them separately by grade and store them sealed so they stay free of grit. Walk the aircraft, take after photos from the same angles as the before photos and brief the crew/owner, reporting any new or newly visible discrepancies in writing.",
    "caution": null,
    "minutes": 15,
    "products": []
  }
]'::jsonb,
  array['Never run a drum buffer without the guard and side handle, or with loose clothing, hair or cords near the drum', 'Never change a pad with the buffer plugged in', 'Never stop the drum in one place, tilt it onto its edge, or run it off an edge or over raised fasteners, antennas, lights or probes', 'Never let the metal get hot to the touch; move to another section and let it cool', 'Never load cutting compound onto the drum pad; apply it to the metal', 'Never mix polish grades on one pad or use a dirty, glazed pad', 'Never polish anodized, alodined/chromated or clear-coated surfaces not designed to be polished', 'Never use polish or solvents not approved by the AMM, or let them sit on paint, seals or de-ice boots', 'Never move flight controls, lean on control surfaces, or operate aircraft systems unless explicitly authorized by the crew', 'Never use electric tools near fuel vapors or during fueling']::text[],
  array['Uniform mirror finish with no haze, holograms, drum marks or streaks', 'No burns, discoloration or heat marks on skins, edges or rivet heads', 'No polish residue in seams, rivets, vents or on paint, seals and boots', 'Paint lines, decals and sealant beads undamaged', 'Protectant applied evenly and fully buffed off', 'All covers and tape reconciled']::text[],
  array['Before: close-up of oxidation on each polished area', 'Before: masking setup and drum buffer setup', 'Before/after: 50/50 section on a leading edge', 'After: finished brightwork in good light from the same angles', 'After: paint lines and edges next to polished metal']::text[]
);

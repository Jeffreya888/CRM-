# Generates supabase/migrations/20261020000100_brightwork_drum_buffer.sql (edit here, then: python3 scripts/sop-brightwork-drum.py)
import json
OUT = __import__('os').path.join(__import__('os').path.dirname(__file__), '..', 'supabase', 'migrations', '20261020000100_brightwork_drum_buffer.sql')

POLISH = 'AMM-approved aircraft metal polish system (cutting and finishing grades)'
CLEANER = 'Approved cleaner for pre-wash (AMS 1526)'
TAPE = 'Residue-free fine-line masking tape and masking paper'
SEAL = 'Approved protective metal sealant or wax'
CLOTH = 'Clean cotton polishing cloths and microfiber towels'
SOLV = 'Approved solvent wipe for residue (per AMM)'
OIL = 'Pneumatic air tool oil'

def st(title, detail, caution, minutes, products=()):
    return {"title": title, "detail": detail, "caution": caution, "minutes": minutes, "products": list(products)}

def head():
    return [
        st("Walk around & photograph pre-existing damage",
           "Walk the entire aircraft with the crew or owner and photograph dents, chips, paint loss, cracked lenses, missing fasteners, corrosion and existing polish condition. Note everything on the work order before starting.",
           "Report any damage, corrosion or discrepancies to the crew/owner before work begins, not after.", 15),
        st("Verify chocks, grounding, no fueling & cover sensors",
           "Check chocks and grounding, confirm no fueling, maintenance or engine runs, do a FOD walk, then cover pitot tubes, static ports, AOA vanes, TAT probes, fuel vents and inlets with approved covers plus remove-before-flight streamers. Log every cover you install.",
           "A missed static-port cover can cause erroneous airspeed/altitude indications. Count covers on and off.", 20),
        st("Identify polishable vs coated metal",
           "Confirm which surfaces are bare polishable metal. Clad aluminum, anodized, chromate/alodine-treated and clear-coated surfaces are not all meant to be polished; check the AMM or ask maintenance if unsure. Note thin skins, sharp edges and areas with raised fasteners the drum must avoid.",
           "Never polish anodized or chromated surfaces that are not meant to be polished; you will remove corrosion protection.", 10),
        st("Wash & dry the work area",
           "Wash the brightwork with approved cleaner and dry it fully so grit is not trapped in the drum pad and dragged across the metal.",
           "Any grit picked up by the pad will scratch the whole panel; never buff a dirty surface.", 30, [CLEANER, CLOTH]),
        st("Mask paint lines, boots, seals & decals",
           "Mask all paint lines, de-ice boots, rubber seals, decals, lights and sealant beads bordering the metal with fine-line tape and paper. Double-mask edges where the drum will run close.",
           "A drum can burn through masking and paint in seconds at an edge. Leave a margin and finish the last half inch by hand.", 40, [TAPE]),
    ]

def middle(spin):
    return [
        st("Apply cutting compound to the metal",
           "Apply a small amount of cutting compound directly to the metal on the first section (not to the drum pad), spread thin over about a 2 ft length. Reapply to the metal for each new section; add product sparingly so it does not sling or smear.",
           "Do not load compound onto the drum pad itself.", 5, [POLISH]),
        st("Test section & set speed",
           "On a small inconspicuous area, run the drum flat with light pressure along the length of the panel. Check cut, heat and finish, then adjust speed and pressure to the least aggressive setting that removes the oxidation.",
           "Start slow; heat and cut rise sharply with speed and pressure.", 10, [POLISH]),
        st("Cut in long, straight, overlapping passes",
           "Keep the drum fully flat on the surface with both hands, move steadily along the length of the leading edge or panel, overlap each pass by about half the drum width, and lift off only while moving. Orient rotation so the drum pulls away from edges, never into them. Work sections about 2 ft long.",
           "Never stop in one place, tilt onto the drum edge, or run off an edge or over raised rivet heads, antennas, lights or fasteners: the drum will grab, gouge or burn through.", 90, [POLISH]),
        st("Heat-check every section",
           "After each section check skin temperature with an infrared thermometer or the back of your hand. If the metal is hot to the touch, move to another section and let it cool before continuing.",
           "Overheating can soften sealants, damage bonded structure and discolor thin skins. If in doubt, stop and let it cool.", 10),
        st("Wipe residue off each section",
           "Wipe the black residue off each section before it dries using clean cloths, folding to a clean face often.",
           None, 20, [CLOTH]),
        st("Rake the drum pad every 2 sections",
           "After every 2 sections (and sooner if the pad starts to load up or glaze), step away from the aircraft, " + spin + ", and hold the pad rake firmly against the spinning pad, moving it across the full width of the drum until spent compound and metal stop coming out and the fibers stand up again. Return to cutting with a clean, fluffed pad.",
           "Rake only away from the aircraft with the drum spinning slowly, rake held flat against the pad and fingers behind the rake; keep the hose, clothing and hands clear. A glazed, dirty pad overheats the metal and leaves streaks.", 10),
        st("Inspect under light & repeat cut where needed",
           "Inspect each section with a work light at a low angle. Repeat cutting passes (compound on the metal) only where oxidation or deep haze remains; do not over-polish areas that are already clear.",
           None, 20, [POLISH]),
    ]

def tail(store_title, store_detail):
    return [
        st("Hand-finish edges, rivets & tight areas",
           "Polish by hand the margins next to masking, around fasteners, lights, antennas and any curve the drum cannot sit flat on. Clear dried polish from rivet heads and panel seams with a soft brush.",
           None, 30, [POLISH, CLOTH]),
        st("Final residue wipe",
           "Remove all remaining polish film with clean towels and, if the polish system calls for it, an approved solvent wipe so the protectant bonds to clean metal.",
           "Use only solvents approved by the AMM; keep them off paint, seals and de-ice boots.", 20, [SOLV, CLOTH]),
        st("Apply approved protectant",
           "Apply an approved metal sealant or wax by hand in a thin, even coat and follow the cure time on the label before buffing off.",
           None, 30, [SEAL, CLOTH]),
        st("Remove masking & clean paint edges",
           "Pull masking slowly at a low angle and clean any polish that crept onto paint, seals or boots.", None, 15, [CLOTH]),
        st("Remove all covers & tape; count them",
           "Remove every cover, plug and piece of tape and reconcile against your installed list. Check ports and vents are clean and free of polish, adhesive or residue.",
           "Do not release the aircraft until every remove-before-flight item is accounted for.", 10),
        st(store_title, store_detail, None, 15),
    ]

def polish_step(swap):
    return st("Polish: change to the polish drum pad — or finish with a dual-action",
        "Choose one finishing method. Option A (drum): " + swap + " Apply finishing polish to the metal and refine every section with lighter pressure and overlapping passes in the same direction. Option B (dual-action): finish with a dual-action polisher, a clean finishing pad and finishing polish, working small sections with slow overlapping passes. Either way, continue until the haze is gone and a mirror finish develops.",
        "Never finish with the cut pad or mix polish grades on one pad; it will re-scratch the surface. Keep the dual-action pad flat and off paint lines and edges.",
        60, [POLISH, CLOTH])

pneumatic_setup = [
    st("Connect air hoses to the compressor",
       "Position the commercial air compressor (at least 90 CFM) where the FBO allows, away from fuel vents and the aircraft. Drain water from the tank, then connect the air hoses to the compressor, making sure every coupler is fully seated and whip checks are fitted on the connections. Run the hose on the ground clear of walkways and tires. Do not connect the hose to the buffer yet.",
       "An undersized compressor makes the buffer bog down and polish unevenly. A loose coupler under pressure can whip violently.", 10),
    st("Set buffer to OFF & throttle fully closed",
       "Twist the drum buffer to the off position and close the throttle all the way before handling the drum or connecting air.",
       "Never install a pad or connect air with the buffer switched on or the throttle open; it can start unexpectedly.", 2),
    st("Install the cut pad with the spring pins",
       "Remove the metal spring pins, slide the wool or combo cut pad onto the drum, fold the pad ends in and secure them with the metal spring pins. Check the pad sits evenly and the pins are fully seated.",
       "A loose pin or pad end can fly off at speed; recheck before every start.", 5),
    st("Oil the buffer (3 drops)",
       "Put three drops of pneumatic air tool oil into the air inlet at the throttle end of the buffer.",
       None, 1, [OIL]),
    st("Connect the air hose & put on PPE",
       "Connect the air hose to the buffer and check for leaks. Put on face shield or glasses, a respirator for polish dust, hearing protection (pneumatic buffers are loud) and gloves. With the drum clear of everything, open the throttle briefly to check it spins true with no loose threads.",
       "Keep hands, clothing, hair and the hose clear of the spinning drum.", 3),
    st("Rake (fluff) the new pad",
       "Away from the aircraft, crack the throttle open so the drum spins lightly and hold the pad rake against the new pad across its full width to fluff the fibers and remove loose lint before first use.",
       "Keep fingers behind the rake and the drum pointed away from your body; never rake near the aircraft.", 2),
]

electric_setup = [
    st("Set up the electric drum buffer & PPE",
       "Inspect the buffer, guard, side handle and cord. With the buffer unplugged, fit a clean cut drum pad, then plug into a GFCI-protected cord and set the speed low to start. Put on face shield or glasses, respirator, hearing protection and gloves, and check the drum spins true with no loose threads.",
       "Never run a drum buffer without the guard and side handle. Loose clothing, hair and cords must stay clear of the drum.", 10),
    st("Rake (fluff) the new pad",
       "Away from the aircraft, run the drum at its lowest speed and hold the pad rake against the new pad across its full width to fluff the fibers and remove loose lint before first use.",
       "Keep fingers behind the rake and the drum pointed away from your body; never rake near the aircraft.", 2),
]

common_prep = [
    'Confirm work authorization and scope with the owner/operator and coordinate time, location and any wash-rack rules with the FBO/line service',
    'Confirm the aircraft is chocked, grounded where required, no fueling, maintenance or engine runs in progress, and you know who the crew contact is',
    'Do a walk-around with the crew/owner and photograph all pre-existing damage and discrepancies before touching the aircraft',
    'Set up ramp safety: hi-vis vest, hearing protection, FOD walk, stay clear of propeller arcs, engine intakes/exhausts and moving ground equipment',
    'Cover or tape pitot tubes, static ports, AOA vanes, TAT probes, fuel vents, engine inlets/exhausts and APU openings with approved covers or residue-free tape and remove-before-flight streamers',
    'Position padded ladders/stands; never lean on or rest equipment against control surfaces, flaps, antennas or static wicks',
]
common_tools_tail = ['Drum pad rake or cleaning comb', 'Dual-action polisher with finishing pads (optional finishing method)', 'Hand applicators and soft detail brushes', 'Padded ladders / work stands', 'Face shield or safety glasses, respirator for polish dust, hearing protection and nitrile gloves', 'Infrared thermometer (or back-of-hand heat check)', 'Good lighting (LED work lights)']
base_products = [POLISH, CLEANER, TAPE, SEAL, CLOTH, SOLV]
common_donts = ['Never stop the drum in one place, tilt it onto its edge, or run it off an edge or over raised fasteners, antennas, lights or probes', 'Never let the metal get hot to the touch; move to another section and let it cool', 'Never load cutting compound onto the drum pad; apply it to the metal', 'Never mix polish grades on one pad or keep cutting with a loaded, glazed pad; rake it every 2 sections', 'Never rake a pad near the aircraft or with fingers in front of the rake', 'Never polish anodized, alodined/chromated or clear-coated surfaces not designed to be polished', 'Never use polish or solvents not approved by the AMM, or let them sit on paint, seals or de-ice boots', 'Never move flight controls, lean on control surfaces, or operate aircraft systems unless explicitly authorized by the crew']
qc = ['Uniform mirror finish with no haze, holograms, drum marks or streaks', 'No burns, discoloration or heat marks on skins, edges or rivet heads', 'No polish residue in seams, rivets, vents or on paint, seals and boots', 'Paint lines, decals and sealant beads undamaged', 'Protectant applied evenly and fully buffed off', 'All covers and tape reconciled']
photos = ['Before: close-up of oxidation on each polished area', 'Before: masking setup and drum buffer setup', 'Before/after: 50/50 section on a leading edge', 'After: finished brightwork in good light from the same angles', 'After: paint lines and edges next to polished metal']
summary_base = ' A drum cuts faster and flatter than a pad on long, straight surfaces but builds heat quickly and can grab edges, so technique, drum control and heat checks are what make it safe. Cutting compound goes on the metal, not on the pad. Cut with the drum and its cut pad, then finish with the polish drum pad or a dual-action polisher. Use the "Rotary / Dual-Action" SOP for small curved parts the drum cannot reach.'
time_est = 'Light jet leading edges 5–8 h · Midsize 7–10 h · Large leading edges & intakes 10–14 h · Full polished airframe multi-day'
crew = '2–3 technicians (one polishing, one wiping/inspecting; rotate every 30–45 min)'

guides = [
  dict(key='brightwork_polish_drum_pneumatic', title='Brightwork Polish — Pneumatic Drum Buffer',
       summary='Polishing bare polishable aluminum (leading edges, intake lips, spinners, trim and fully polished skins) with a pneumatic drum buffer running off a commercial air compressor (at least 90 CFM), fitted with wool or combo pads held by metal spring pins.' + summary_base,
       products=base_products + [OIL],
       tools=['Pneumatic drum buffer', 'Commercial air compressor (at least 90 CFM)', 'Air hoses, couplers and whip checks rated for the compressor', 'Wool and combo drum pads (cut and polish) with metal spring pins'] + common_tools_tail,
       prep=common_prep + ['Plan the compressor location with the FBO (noise, exhaust and hose routing) and keep it and the hoses away from fuel vents, tires and walkways'],
       steps=head() + pneumatic_setup + middle("crack the throttle open so the drum spins lightly") + [polish_step("close the throttle, twist the buffer to off and disconnect the air hose, remove the spring pins, swap the cut pad for a clean polish pad (fold the ends in and re-secure with the spring pins), reconnect the air and rake (fluff) the new polish pad with the drum spinning lightly, away from the aircraft.")] + tail(
            "Shut down air, clean & store pads; final walk-around & report",
            "Close the throttle, twist the buffer to off, disconnect it and bleed the air from the hose before uncoupling. Drain the compressor tank. Clean the drum pads (and dual-action pads if used), bag them separately by grade and store them sealed so they stay free of grit. Walk the aircraft, take after photos from the same angles as the before photos and brief the crew/owner, reporting any new or newly visible discrepancies in writing."),
       donts=['Never install or change a pad, or connect air, with the buffer switched on or the throttle open', 'Never disconnect a hose under pressure; close the throttle and bleed the line first'] + common_donts + ['Never run the compressor or hoses near fuel vents or during fueling']),
  dict(key='brightwork_polish_drum_electric', title='Brightwork Polish — Electric Drum Buffer',
       summary='Polishing bare polishable aluminum (leading edges, intake lips, spinners, trim and fully polished skins) with an electric drum buffer fitted with interchangeable cut and polish drum pads.' + summary_base,
       products=base_products,
       tools=['Variable-speed electric drum buffer with side handle and drum guard', 'Interchangeable cut and polish drum pads (labeled)', 'Extension cord with GFCI and cord management'] + common_tools_tail,
       prep=common_prep + ['Route power cords on the ground away from fuel vents, tires and walkways; use a GFCI and keep electric tools away from any fuel vapors'],
       steps=head() + electric_setup + middle("run the drum at its lowest speed") + [polish_step("unplug the buffer, swap the cut pad for a clean polish drum pad, plug back in and rake (fluff) the new polish pad at the lowest speed, away from the aircraft.")] + tail(
            "Clean & store drum pads; final walk-around & report",
            "Unplug the buffer. Clean the drum pads (and dual-action pads if used), bag them separately by grade and store them sealed so they stay free of grit. Walk the aircraft, take after photos from the same angles as the before photos and brief the crew/owner, reporting any new or newly visible discrepancies in writing."),
       donts=['Never run a drum buffer without the guard and side handle, or with loose clothing, hair or cords near the drum', 'Never change a pad with the buffer plugged in'] + common_donts + ['Never use electric tools near fuel vapors or during fueling']),
]

def q(x): return "'" + x.replace("'", "''") + "'"
def arr(xs): return 'array[' + ', '.join(q(x) for x in xs) + ']::text[]'

rows = []
for g in guides:
    for s_ in g['steps']:
        for pr in s_['products']:
            assert pr in g['products'], (g['key'], pr)
    used = {pr for s_ in g['steps'] for pr in s_['products']}
    assert used == set(g['products']), (g['key'], set(g['products']) - used)
    rows.append('(\n  ' + ',\n  '.join([q(g['key']), q('aircraft'), q(g['title']), q(g['summary']), q(time_est), q(crew),
        arr(g['products']), arr(g['tools']), arr(g['prep']), q(json.dumps(g['steps'], indent=2, ensure_ascii=False)) + '::jsonb',
        arr(g['donts']), arr(qc), arr(photos)]) + '\n)')

sql = """-- Brightwork polishing methods (owner request): rotary / dual-action polisher (the
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
""" + ',\n'.join(rows) + ';\n'
open(OUT, 'w').write(sql)
for g in guides: print(g['key'], len(g['steps']), 'steps', sum(s_['minutes'] for s_ in g['steps']), 'min')

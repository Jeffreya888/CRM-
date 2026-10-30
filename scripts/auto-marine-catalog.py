#!/usr/bin/env python3
"""Generates supabase/migrations/20261030000300_auto_marine_catalog_pricing.sql:
the built-in vehicle catalog (popular US makes and models with their size class)
and the Tarmo starter prices for vehicle and watercraft services.

Prices are typical US detailing rates (2026) before each company's regional
adjustment. Vehicles are priced per size class; boats per foot by class with
a minimum charge. Run: python3 scripts/auto-marine-catalog.py
"""
import json
import math

OUT = "supabase/migrations/20261030000300_auto_marine_catalog_pricing.sql"

# ---------------------------------------------------------------------------
# Vehicle catalog: make -> {class: [models]}
#   compact   coupe / compact / hatchback      car       sedan
#   crossover small SUV / crossover            suv       midsize SUV (2–3 rows)
#   suv_full  full-size SUV (3 rows)           truck_mid midsize pickup
#   truck     full-size pickup                 truck_hd  heavy-duty / dually
#   van       minivan / full-size van          exotic    exotic / high-end
#   motorcycle                                 rv        motorhome / camper van
# ---------------------------------------------------------------------------
CATALOG = {
    "Acura": {"compact": ["Integra"], "car": ["ILX", "TLX", "TL", "TSX", "RLX"], "crossover": ["RDX", "ADX"], "suv": ["MDX", "ZDX"], "exotic": ["NSX"]},
    "Alfa Romeo": {"car": ["Giulia"], "crossover": ["Stelvio", "Tonale"], "exotic": ["4C"]},
    "Aston Martin": {"exotic": ["DB11", "DB12", "Vantage", "DBS", "DBX"]},
    "Audi": {"compact": ["A3", "S3", "RS 3", "TT"], "car": ["A4", "S4", "A5", "S5", "RS 5", "A6", "S6", "A7", "S7", "RS 7", "A8", "e-tron GT"],
             "crossover": ["Q3", "Q4 e-tron", "Q5", "SQ5"], "suv": ["Q7", "SQ7", "Q8", "SQ8", "RS Q8", "e-tron", "Q8 e-tron"], "exotic": ["R8"]},
    "Bentley": {"exotic": ["Bentayga", "Continental GT", "Flying Spur"]},
    "BMW": {"compact": ["2 Series", "M2", "Z4", "i3"], "car": ["3 Series", "M3", "4 Series", "M4", "5 Series", "M5", "7 Series", "8 Series", "i4", "i5", "i7"],
            "crossover": ["X1", "X2", "X3", "X4", "iX3"], "suv": ["X5", "X6", "XM", "iX"], "suv_full": ["X7"],
            "motorcycle": ["R 1250 GS", "R 1300 GS", "S 1000 RR", "K 1600"]},
    "Buick": {"car": ["LaCrosse", "Regal"], "crossover": ["Encore", "Encore GX", "Envision", "Envista"], "suv": ["Enclave"]},
    "Cadillac": {"car": ["CT4", "CT5", "CT6", "CTS", "ATS"], "crossover": ["XT4", "Optiq"], "suv": ["XT5", "XT6", "Lyriq"], "suv_full": ["Escalade", "Escalade ESV", "Escalade IQ"]},
    "Chevrolet": {"compact": ["Spark", "Sonic", "Cruze", "Bolt EV"], "car": ["Malibu", "Impala", "Camaro"],
                  "crossover": ["Trax", "Trailblazer", "Equinox", "Equinox EV", "Bolt EUV"], "suv": ["Blazer", "Blazer EV", "Traverse"],
                  "suv_full": ["Tahoe", "Suburban"], "truck_mid": ["Colorado"], "truck": ["Silverado 1500", "Silverado EV", "Avalanche"],
                  "truck_hd": ["Silverado 2500HD", "Silverado 3500HD"], "van": ["Express"], "exotic": ["Corvette"]},
    "Chrysler": {"car": ["300"], "van": ["Pacifica", "Voyager"]},
    "Dodge": {"car": ["Charger", "Challenger"], "crossover": ["Hornet", "Journey"], "suv": ["Durango"], "van": ["Grand Caravan"], "exotic": ["Viper"]},
    "Ferrari": {"exotic": ["296 GTB", "F8 Tributo", "Roma", "SF90 Stradale", "812 Superfast", "Purosangue", "Portofino", "488"]},
    "Fiat": {"compact": ["500"], "crossover": ["500X"]},
    "Ford": {"compact": ["Focus", "Fiesta"], "car": ["Fusion", "Mustang", "Taurus"],
             "crossover": ["EcoSport", "Escape", "Bronco Sport", "Edge", "Mustang Mach-E"], "suv": ["Explorer", "Bronco", "Flex"],
             "suv_full": ["Expedition", "Expedition MAX"], "truck_mid": ["Maverick", "Ranger"], "truck": ["F-150", "F-150 Lightning", "F-150 Raptor"],
             "truck_hd": ["F-250 Super Duty", "F-350 Super Duty", "F-450 Super Duty"], "van": ["Transit", "Transit Connect", "E-Series"], "exotic": ["GT"]},
    "Genesis": {"car": ["G70", "G80", "G90"], "crossover": ["GV60", "GV70"], "suv": ["GV80"]},
    "GMC": {"crossover": ["Terrain"], "suv": ["Acadia", "Hummer EV SUV"], "suv_full": ["Yukon", "Yukon XL"], "truck_mid": ["Canyon"],
            "truck": ["Sierra 1500", "Sierra EV", "Hummer EV Pickup"], "truck_hd": ["Sierra 2500HD", "Sierra 3500HD"], "van": ["Savana"]},
    "Harley-Davidson": {"motorcycle": ["Street Glide", "Road Glide", "Road King", "Fat Boy", "Sportster", "Softail", "Electra Glide", "Pan America"]},
    "Honda": {"compact": ["Civic", "Fit", "Insight"], "car": ["Accord"], "crossover": ["HR-V", "CR-V", "Prologue"], "suv": ["Passport", "Pilot"],
              "truck_mid": ["Ridgeline"], "van": ["Odyssey"], "motorcycle": ["Gold Wing", "Rebel", "Africa Twin", "CBR1000RR"]},
    "Hyundai": {"compact": ["Accent", "Elantra", "Veloster"], "car": ["Sonata", "Ioniq 6"], "crossover": ["Venue", "Kona", "Tucson", "Ioniq 5"],
                "suv": ["Santa Fe", "Palisade", "Ioniq 9"], "truck_mid": ["Santa Cruz"]},
    "Indian": {"motorcycle": ["Chief", "Chieftain", "Scout", "Roadmaster"]},
    "Infiniti": {"car": ["Q50", "Q60"], "crossover": ["QX50", "QX55"], "suv": ["QX60"], "suv_full": ["QX80"]},
    "Jaguar": {"car": ["XE", "XF", "F-Type"], "crossover": ["E-Pace", "F-Pace", "I-Pace"]},
    "Jeep": {"crossover": ["Renegade", "Compass", "Cherokee"], "suv": ["Grand Cherokee", "Grand Cherokee L", "Wrangler", "Wrangler Unlimited"],
             "suv_full": ["Wagoneer", "Grand Wagoneer"], "truck_mid": ["Gladiator"]},
    "Kawasaki": {"motorcycle": ["Ninja", "Z900", "Vulcan", "KLR650"]},
    "Kia": {"compact": ["Rio", "Forte", "Soul"], "car": ["K5", "Optima", "Stinger"], "crossover": ["Seltos", "Niro", "Sportage", "EV6"],
            "suv": ["Sorento", "Telluride", "EV9"], "van": ["Carnival"]},
    "Lamborghini": {"exotic": ["Huracán", "Revuelto", "Aventador", "Urus"]},
    "Land Rover": {"crossover": ["Range Rover Evoque", "Discovery Sport"], "suv": ["Defender", "Discovery", "Range Rover Sport", "Range Rover Velar"],
                   "suv_full": ["Range Rover"]},
    "Lexus": {"car": ["IS", "ES", "GS", "LS", "RC", "LC"], "crossover": ["UX", "NX", "RZ"], "suv": ["RX", "GX", "TX"], "suv_full": ["LX"]},
    "Lincoln": {"car": ["MKZ", "Continental"], "crossover": ["Corsair"], "suv": ["Nautilus", "Aviator"], "suv_full": ["Navigator", "Navigator L"]},
    "Lotus": {"exotic": ["Emira", "Eletre", "Evora"]},
    "Lucid": {"car": ["Air"], "suv": ["Gravity"]},
    "Maserati": {"car": ["Ghibli", "Quattroporte"], "crossover": ["Grecale"], "suv": ["Levante"], "exotic": ["MC20", "GranTurismo"]},
    "Mazda": {"compact": ["Mazda3", "MX-5 Miata"], "car": ["Mazda6"], "crossover": ["CX-30", "CX-5", "CX-50"], "suv": ["CX-70", "CX-9", "CX-90"]},
    "McLaren": {"exotic": ["720S", "750S", "Artura", "GT", "570S"]},
    "Mercedes-Benz": {"compact": ["A-Class", "CLA"], "car": ["C-Class", "E-Class", "S-Class", "CLS", "EQE", "EQS", "SL"],
                      "crossover": ["GLA", "GLB", "GLC", "EQB"], "suv": ["GLE", "EQE SUV", "EQS SUV", "G-Class"], "suv_full": ["GLS"],
                      "van": ["Sprinter", "Metris"], "exotic": ["AMG GT", "Maybach S-Class", "Maybach GLS", "SLS AMG"]},
    "MINI": {"compact": ["Cooper", "Clubman"], "crossover": ["Countryman"]},
    "Mitsubishi": {"compact": ["Mirage"], "crossover": ["Eclipse Cross", "Outlander Sport"], "suv": ["Outlander"]},
    "Nissan": {"compact": ["Versa", "Sentra", "Leaf"], "car": ["Altima", "Maxima", "Z"], "crossover": ["Kicks", "Rogue", "Ariya"],
               "suv": ["Murano", "Pathfinder"], "suv_full": ["Armada"], "truck_mid": ["Frontier"], "truck": ["Titan"], "truck_hd": ["Titan XD"],
               "van": ["NV200", "NV Passenger", "Quest"], "exotic": ["GT-R"]},
    "Polestar": {"car": ["Polestar 2"], "suv": ["Polestar 3"], "crossover": ["Polestar 4"]},
    "Porsche": {"car": ["Panamera", "Taycan"], "crossover": ["Macan"], "suv": ["Cayenne"], "exotic": ["911", "718 Cayman", "718 Boxster", "918 Spyder"]},
    "Ram": {"truck": ["1500", "1500 TRX"], "truck_hd": ["2500", "3500"], "van": ["ProMaster", "ProMaster City"]},
    "Rivian": {"crossover": ["R2"], "suv": ["R1S"], "truck": ["R1T"]},
    "Rolls-Royce": {"exotic": ["Cullinan", "Ghost", "Phantom", "Spectre", "Wraith", "Dawn"]},
    "Subaru": {"compact": ["Impreza", "WRX", "BRZ"], "car": ["Legacy"], "crossover": ["Crosstrek", "Forester", "Outback", "Solterra"], "suv": ["Ascent"]},
    "Tesla": {"car": ["Model 3", "Model S"], "crossover": ["Model Y"], "suv": ["Model X"], "truck": ["Cybertruck"]},
    "Toyota": {"compact": ["Corolla", "Prius", "GR86", "GR Corolla"], "car": ["Camry", "Avalon", "Crown", "GR Supra", "Mirai"],
               "crossover": ["C-HR", "Corolla Cross", "RAV4", "bZ4X", "Venza"], "suv": ["Highlander", "Grand Highlander", "4Runner", "Land Cruiser"],
               "suv_full": ["Sequoia"], "truck_mid": ["Tacoma"], "truck": ["Tundra"], "van": ["Sienna"]},
    "Volkswagen": {"compact": ["Golf", "GTI", "Golf R", "Jetta", "Beetle"], "car": ["Passat", "Arteon"], "crossover": ["Taos", "Tiguan", "ID.4"],
                   "suv": ["Atlas", "Atlas Cross Sport"], "van": ["ID. Buzz"]},
    "Volvo": {"car": ["S60", "S90", "V60", "V90"], "crossover": ["EX30", "XC40", "EX40", "XC60"], "suv": ["XC90", "EX90"]},
    "Yamaha": {"motorcycle": ["YZF-R1", "MT-09", "Bolt", "Tenere 700"]},
    "Ducati": {"motorcycle": ["Panigale V4", "Monster", "Multistrada", "Scrambler"]},
    "Airstream": {"rv": ["Interstate 24", "Atlas"]},
    "Winnebago": {"rv": ["View", "Navion", "Revel", "Solis", "Travato", "Minnie Winnie", "Vista", "Adventurer", "Forza"]},
    "Thor": {"rv": ["Four Winds", "Chateau", "Ace", "Palazzo", "Sequence", "Tellaro"]},
    "Tiffin": {"rv": ["Allegro Open Road", "Allegro Bus", "Phaeton", "Zephyr", "Wayfarer"]},
    "Newmar": {"rv": ["Dutch Star", "Bay Star", "Canyon Star", "King Aire", "Ventana"]},
    "Entegra": {"rv": ["Accolade", "Odyssey", "Cornerstone", "Anthem"]},
    "Jayco": {"rv": ["Greyhawk", "Redhawk", "Precept", "Embark"]},
    "Coachmen": {"rv": ["Leprechaun", "Mirada", "Beyond", "Galleria"]},
    "Grand Design": {"rv": ["Lineage"]},
    "Fleetwood": {"rv": ["Bounder", "Discovery", "Flair"]},
    "Storyteller Overland": {"rv": ["Mode", "Beast Mode"]},
}

# Typical length for the catalog row (feet); RVs use their own sizes below.
RV_LENGTHS = {"Interstate 24": 24, "Atlas": 25, "View": 25, "Navion": 25, "Revel": 20, "Solis": 21, "Travato": 21, "Minnie Winnie": 31,
              "Vista": 31, "Adventurer": 35, "Forza": 36, "Four Winds": 31, "Chateau": 31, "Ace": 32, "Palazzo": 37, "Sequence": 21,
              "Tellaro": 21, "Allegro Open Road": 36, "Allegro Bus": 40, "Phaeton": 40, "Zephyr": 45, "Wayfarer": 25, "Dutch Star": 43,
              "Bay Star": 35, "Canyon Star": 39, "King Aire": 45, "Ventana": 40, "Accolade": 37, "Odyssey": 31, "Cornerstone": 45,
              "Anthem": 44, "Greyhawk": 31, "Redhawk": 31, "Precept": 36, "Embark": 39, "Leprechaun": 31, "Mirada": 35, "Beyond": 21,
              "Galleria": 24, "Lineage": 25, "Bounder": 35, "Discovery": 38, "Flair": 33, "Mode": 19, "Beast Mode": 19}

# ---------------------------------------------------------------------------
# Vehicle prices. Anchors per service: [sedan, midsize SUV, full-size SUV/truck, van];
# other classes derive from them (rounded to $5).
# ---------------------------------------------------------------------------
VEHICLE = {
    # guide_key: (anchors, interior?)  — interior services skip motorcycles
    "vehicle_wash_l1":          ([45, 55, 65, 75], False),
    "vehicle_wash":             ([75, 90, 105, 120], False),
    "vehicle_waterless_wash":   ([50, 60, 70, 80], False),
    "vehicle_interior_l1":      ([75, 90, 105, 120], True),
    "vehicle_interior":         ([150, 175, 200, 225], True),
    "vehicle_full_detail":      ([225, 275, 325, 375], False),
    "vehicle_clay_decon":       ([100, 120, 140, 160], False),
    "vehicle_wax_sealant":      ([350, 425, 500, 550], False),
    "vehicle_paint_correction": ([800, 950, 1100, 1200], False),
    "vehicle_ceramic_coating":  ([1200, 1400, 1600, 1700], False),
    "vehicle_leather_care":     ([100, 125, 150, 150], True),
    "vehicle_extraction":       ([150, 175, 200, 225], True),
    "vehicle_ppf_care":         ([100, 120, 140, 160], False),
}
VEHICLE_FLAT = {"vehicle_wheels_tires": 75, "vehicle_headlight_restoration": 125, "vehicle_odor_removal": 175, "vehicle_engine_bay": 100}
# Hours scale with size relative to a sedan.
HOURS_FACTOR = {"compact": 0.9, "car": 1, "crossover": 1.1, "suv": 1.2, "suv_full": 1.4, "truck_mid": 1.15, "truck": 1.35,
                "truck_hd": 1.5, "van": 1.5, "exotic": 1.3, "motorcycle": 0.6, "rv": 3}

r5 = lambda x: int(5 * round(x / 5))

def vehicle_prices(anchors, interior):
    car, suv, full, van = anchors
    p = {
        "compact": r5(car * 0.9), "car": car, "crossover": r5((car + suv) / 2), "suv": suv, "suv_full": full,
        "truck_mid": suv, "truck": full, "truck_hd": r5(full * 1.15), "van": van,
        "exotic": r5(max(full, car * 1.5)),
        "rv": r5(van * (2 if interior else 3)),
    }
    if not interior:
        p["motorcycle"] = r5(car * 0.6)
    return p

# ---------------------------------------------------------------------------
# Watercraft: per-foot rate by class [under 25 ft, 25–40, 40–65, 65 ft+] and a minimum charge.
# ---------------------------------------------------------------------------
BOAT = {
    "boat_wash_l1":            ([4, 5, 6, 7], 100),
    "boat_wash":               ([6, 7, 8, 9], 150),
    "boat_full_detail":        ([25, 30, 35, 40], 500),
    "boat_oxidation_removal":  ([35, 45, 50, 60], 700),
    "boat_wax_sealant":        ([18, 22, 25, 30], 350),
    "boat_ceramic_coating":    ([65, 80, 95, 115], 1300),
    "boat_gelcoat_one_step":   ([22, 27, 30, 35], 450),
    "boat_hull_wax_lift":      ([18, 22, 25, 30], 350),
    "boat_interior_l1":        ([6, 7, 8, 10], 150),
    "boat_interior":           ([12, 14, 16, 20], 250),
    "boat_nonskid":            ([6, 8, 9, 10], 150),
    "boat_metal_polish":       ([6, 8, 10, 12], 150),
    "boat_canvas_isinglass":   ([5, 6, 7, 8], 150),
    "boat_waterline_stain":    ([4, 5, 6, 7], 100),
    "boat_vinyl_mildew":       ([5, 6, 7, 8], 150),
    "boat_engine_room_bilge":  ([8, 10, 12, 15], 200),
    "boat_teak_care":          ([12, 14, 16, 20], 250),
}
BOAT_CLASSES = ["boat_small", "boat_medium", "boat_large", "yacht"]

def sql_str(s):
    return "'" + s.replace("'", "''") + "'"

def main():
    rows = []
    seen = set()
    for make, classes in CATALOG.items():
        for cls, models in classes.items():
            for m in models:
                key = (make.lower(), m.lower())
                assert key not in seen, key
                seen.add(key)
                length = RV_LENGTHS.get(m) if cls == "rv" else None
                rows.append(f"  ({sql_str(make)}, {sql_str(m)}, '{cls}', {length if length else 'null'}, null)")

    vehicle_rows = []
    for gk, (anchors, interior) in VEHICLE.items():
        prices = vehicle_prices(anchors, interior)
        vehicle_rows.append(f"  ('{gk}', 'per_category', {anchors[0]}, 0, '{json.dumps(prices)}', '{json.dumps(HOURS_FACTOR)}', '{{}}')")
    for gk, price in VEHICLE_FLAT.items():
        vehicle_rows.append(f"  ('{gk}', 'flat', {price}, 0, '{{}}', null, '{{}}')")
    boat_rows = []
    for gk, (rates, minimum) in BOAT.items():
        per = dict(zip(BOAT_CLASSES, rates))
        boat_rows.append(f"  ('{gk}', 'per_foot', {minimum}, {rates[1]}, '{{}}', null, '{json.dumps(per)}')")
    for gk, price in {"boat_outboard_trailer": 125, "boat_bottom_inspection": 175}.items():
        boat_rows.append(f"  ('{gk}', 'flat', {price}, 0, '{{}}', null, '{{}}')")

    with open("supabase/migrations/20261029000200_mobile_and_shop.sql") as f:
        pass  # (only to fail loudly when run outside the repo root)

    sql = f"""-- Generated by scripts/auto-marine-catalog.py — edit the script, not this file.
-- 1. Size helpers know the new vehicle classes.
-- 2. Built-in vehicle catalog: {len(rows)} popular US makes and models with their size class
--    (like the aircraft and boat catalogs; detailers can still type any vehicle).
-- 3. Tarmo starter prices for vehicle and watercraft services (typical US rates, 2026):
--    vehicles by size class; boats per foot by class with a minimum charge.
--    Per-foot services may carry a rate per foot for each size class (services.foot_rates).
--    New companies get them; existing companies' starter services are updated too.

create or replace function public._typical_length(c public.aircraft_category)
returns numeric language sql immutable as $$
  select case c::text
    when 'piston_single' then 27 when 'piston_twin' then 32 when 'turboprop' then 40 when 'very_light_jet' then 40
    when 'light_jet' then 50 when 'midsize_jet' then 60 when 'super_midsize_jet' then 68 when 'large_jet' then 96
    when 'airliner' then 110 when 'helicopter' then 42
    when 'compact' then 14 when 'car' then 16 when 'crossover' then 15 when 'suv' then 16 when 'suv_full' then 18
    when 'truck_mid' then 18 when 'truck' then 19 when 'truck_hd' then 21 when 'van' then 19 when 'exotic' then 15
    when 'rv' then 35 when 'motorcycle' then 7 when 'boat_small' then 22 when 'boat_medium' then 32
    when 'boat_large' then 50 when 'yacht' then 80 else 40 end::numeric;
$$;

create or replace function public._category_label(c public.aircraft_category)
returns text language sql immutable as $$
  select case c::text
    when 'piston_single' then 'Piston Single' when 'piston_twin' then 'Piston Twin' when 'turboprop' then 'Turboprop'
    when 'very_light_jet' then 'Very Light Jet' when 'light_jet' then 'Light Jet' when 'midsize_jet' then 'Midsize Jet'
    when 'super_midsize_jet' then 'Super-Mid Jet' when 'large_jet' then 'Large Cabin Jet' when 'airliner' then 'Airliner / BBJ'
    when 'helicopter' then 'Helicopter'
    when 'compact' then 'Coupe / Compact' when 'car' then 'Sedan' when 'crossover' then 'Small SUV / Crossover'
    when 'suv' then 'Midsize SUV' when 'suv_full' then 'Full-size SUV' when 'truck_mid' then 'Midsize Truck'
    when 'truck' then 'Full-size Truck' when 'truck_hd' then 'Heavy-duty Truck' when 'van' then 'Van / Minivan'
    when 'exotic' then 'Exotic / High-end' when 'rv' then 'RV / Motorhome' when 'motorcycle' then 'Motorcycle'
    when 'boat_small' then 'Small boat (under 25 ft)' when 'boat_medium' then 'Medium boat (25–40 ft)'
    when 'boat_large' then 'Large boat (40–65 ft)' when 'yacht' then 'Yacht (65 ft+)'
    else 'Other' end;
$$;

-- ---------------------------------------------------------------------------
-- Vehicle catalog
-- ---------------------------------------------------------------------------
insert into public.aircraft_models (manufacturer, model, category, length_ft, wingspan_ft)
select v.manufacturer, v.model, v.category::public.aircraft_category, v.length_ft::numeric, v.wingspan_ft::numeric
from (values
{(','+chr(10)).join(rows)}
) as v(manufacturer, model, category, length_ft, wingspan_ft)
where not exists (select 1 from public.aircraft_models m where lower(m.manufacturer) = lower(v.manufacturer) and lower(m.model) = lower(v.model));

-- ---------------------------------------------------------------------------
-- Starter prices
-- ---------------------------------------------------------------------------
-- Per-foot pricing by size class: {{"boat_small": 25, "yacht": 40}} (rate per foot);
-- classes not listed use price_per_foot.
alter table public.services add column foot_rates jsonb not null default '{{}}' check (jsonb_typeof(foot_rates) = 'object');

create table public.standard_prices (
  guide_key text primary key,
  pricing_method public.pricing_method not null,
  base_price numeric(10,2) not null,          -- flat price, default, or minimum charge for per-foot
  price_per_foot numeric(10,2) not null default 0,
  category_prices jsonb not null default '{{}}',  -- per class: price (per_category)
  hours_factor jsonb,                         -- per class: multiple of the service's base hours
  foot_rates jsonb not null default '{{}}'      -- per class: rate per foot (per_foot)
);
alter table public.standard_prices enable row level security;
create policy standard_prices_read on public.standard_prices for select to authenticated using (true);

insert into public.standard_prices (guide_key, pricing_method, base_price, price_per_foot, category_prices, hours_factor, foot_rates) values
{(','+chr(10)).join(vehicle_rows + boat_rows)};

-- Boats: a full inside-and-out detail package (vehicles already have one).
create or replace function public._boat_full_detail(p_org uuid)
returns void language sql security definer set search_path = public as $$
  insert into services (org_id, asset_type, name, guide_key, category, pricing_method, base_price, price_per_foot, est_hours, est_hours_max, recur_every, recur_unit, sort_order, description)
  select p_org, 'watercraft', 'Full Detail (Inside & Out)', 'boat_full_detail', 'package', 'per_foot', 500, 30, 6, 12, 3, 'month', 200,
         'Complete wash, hull and deck polish with protection, metal, vinyl and interior.'
  where not exists (select 1 from services where org_id = p_org and guide_key = 'boat_full_detail');
$$;
revoke execute on function public._boat_full_detail(uuid) from public, anon, authenticated;

-- Applies the starter prices (and per-class hours) to a company's vehicle and watercraft services.
create or replace function public._apply_standard_prices(p_org uuid)
returns void language sql security definer set search_path = public as $$
  update services s set
    pricing_method = p.pricing_method,
    base_price = p.base_price,
    price_per_foot = p.price_per_foot,
    category_prices = p.category_prices,
    foot_rates = p.foot_rates,
    category_hours = case when p.hours_factor is null or s.est_hours is null then s.category_hours
      else (select jsonb_object_agg(k, round((s.est_hours * v::numeric)::numeric, 1)) from jsonb_each_text(p.hours_factor) as h(k, v)) end
  from standard_prices p
  where s.org_id = p_org and s.guide_key = p.guide_key and s.asset_type in ('vehicle', 'watercraft');
$$;
revoke execute on function public._apply_standard_prices(uuid) from public, anon, authenticated;

-- New companies: the starter lists, then the starter prices.
create or replace function public.seed_asset_services(p_org uuid, p_type text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_type = 'vehicle' and not exists (select 1 from services where org_id = p_org and asset_type = 'vehicle') then
    insert into services (org_id, asset_type, name, guide_key, category, pricing_method, base_price, est_hours, est_hours_max, recur_every, recur_unit, sort_order, description, category_prices) values
    (p_org, 'vehicle', 'Exterior Wash — Level 2 (Full Exterior)', 'vehicle_wash', 'exterior', 'per_category', 60, 1, 1.5, 2, 'week', 101, 'Two-bucket hand wash, wheels, tires and dry.', '{{}}'),
    (p_org, 'vehicle', 'Interior — Level 2 (Full Interior)', 'vehicle_interior', 'interior', 'per_category', 150, 2, 3, 3, 'month', 102, 'Vacuum, shampoo, leather and plastics, glass.', '{{}}'),
    (p_org, 'vehicle', 'Full Detail', 'vehicle_full_detail', 'package', 'per_category', 250, 4, 6, 3, 'month', 103, 'Complete inside-and-out detail with sealant.', '{{}}'),
    (p_org, 'vehicle', 'Paint Correction (Two-Step)', 'vehicle_paint_correction', 'paint_correction', 'per_category', 450, 6, 12, null, null, 104, 'Compound and polish to remove swirls and oxidation.', '{{}}'),
    (p_org, 'vehicle', 'Ceramic Coating (3–5 Year)', 'vehicle_ceramic_coating', 'coating', 'per_category', 900, 8, 12, 12, 'month', 105, 'Multi-year ceramic protection after paint prep.', '{{}}'),
    (p_org, 'vehicle', 'Engine Bay Detail', 'vehicle_engine_bay', 'engine', 'flat', 75, 1, 1.5, null, null, 106, 'Safe degrease and dressing of the engine bay.', '{{}}');
    perform public._new_asset_services(p_org, 'vehicle');
  elsif p_type = 'watercraft' and not exists (select 1 from services where org_id = p_org and asset_type = 'watercraft') then
    insert into services (org_id, asset_type, name, guide_key, category, pricing_method, base_price, price_per_foot, est_hours, est_hours_max, recur_every, recur_unit, sort_order, description) values
    (p_org, 'watercraft', 'Wash — Level 2 (Full Hull & Deck)', 'boat_wash', 'exterior', 'per_foot', 100, 5, 2, 4, 2, 'week', 201, 'Wash hull sides, decks, non-skid and hardware.'),
    (p_org, 'watercraft', 'Compound & Wax (Oxidation Removal)', 'boat_oxidation_removal', 'paint_correction', 'per_foot', 300, 25, 6, 12, null, null, 202, 'Compound and polish oxidized gelcoat, then wax.'),
    (p_org, 'watercraft', 'Wax / Sealant', 'boat_wax_sealant', 'coating', 'per_foot', 200, 15, 4, 8, 3, 'month', 203, 'Marine wax or sealant protection.'),
    (p_org, 'watercraft', 'Ceramic Coating', 'boat_ceramic_coating', 'coating', 'per_foot', 800, 60, 10, 20, 12, 'month', 204, 'Ceramic protection for gelcoat and paint.'),
    (p_org, 'watercraft', 'Interior — Level 2 (Full Interior)', 'boat_interior', 'interior', 'per_foot', 150, 8, 3, 6, 1, 'month', 205, 'Cabin, vinyl and upholstery clean with mildew treatment.'),
    (p_org, 'watercraft', 'Teak Clean & Seal', 'boat_teak_care', 'specialty', 'per_foot', 200, 10, 4, 8, 6, 'month', 206, 'Clean, brighten and seal teak decks and trim.');
    perform public._new_asset_services(p_org, 'watercraft');
  end if;
  if p_type = 'watercraft' and exists (select 1 from services where org_id = p_org and asset_type = 'watercraft') then
    perform public._boat_full_detail(p_org);
  end if;
  perform public._apply_standard_prices(p_org);
  perform public.apply_guide_checklists(p_org);
end;
$$;
revoke execute on function public.seed_asset_services(uuid, text) from public, anon, authenticated;

-- Existing companies.
do $$
declare r record;
begin
  for r in select distinct org_id from public.services where asset_type = 'watercraft' loop
    perform public._boat_full_detail(r.org_id);
  end loop;
  for r in select distinct org_id from public.services where asset_type in ('vehicle', 'watercraft') loop
    perform public._apply_standard_prices(r.org_id);
  end loop;
end $$;
"""
    with open(OUT, "w") as f:
        f.write(sql)
    print(f"{OUT}: {len(rows)} vehicle models, {len(vehicle_rows)} vehicle and {len(boat_rows)} boat prices")


if __name__ == "__main__":
    main()

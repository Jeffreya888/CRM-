-- Finer vehicle size classes (shops price by these). Existing values keep their
-- meaning: car = sedan, suv = midsize SUV, truck = full-size pickup.
-- (Enum values are added in their own migration so the next one can use them.)
alter type public.aircraft_category add value if not exists 'compact';    -- coupe / compact / hatchback
alter type public.aircraft_category add value if not exists 'crossover';  -- small SUV / crossover
alter type public.aircraft_category add value if not exists 'suv_full';   -- full-size SUV (3 rows)
alter type public.aircraft_category add value if not exists 'truck_mid';  -- midsize pickup
alter type public.aircraft_category add value if not exists 'truck_hd';   -- heavy-duty / dually
alter type public.aircraft_category add value if not exists 'exotic';     -- exotic / high-end

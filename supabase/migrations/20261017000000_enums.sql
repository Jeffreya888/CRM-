-- New enum values. Kept in their own migration: a value added with
-- ALTER TYPE ... ADD VALUE cannot be used in the transaction that adds it.

-- Follow-up visits created automatically wait for the owner to confirm them.
alter type public.job_status add value if not exists 'tentative' before 'scheduled';

-- Size classes for vehicles and watercraft (business types beyond aircraft).
alter type public.aircraft_category add value if not exists 'car';
alter type public.aircraft_category add value if not exists 'suv';
alter type public.aircraft_category add value if not exists 'truck';
alter type public.aircraft_category add value if not exists 'van';
alter type public.aircraft_category add value if not exists 'rv';
alter type public.aircraft_category add value if not exists 'motorcycle';
alter type public.aircraft_category add value if not exists 'boat_small';
alter type public.aircraft_category add value if not exists 'boat_medium';
alter type public.aircraft_category add value if not exists 'boat_large';
alter type public.aircraft_category add value if not exists 'yacht';

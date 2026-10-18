-- New pricing method: price by footprint (length × wingspan, or beam for boats).
-- Kept in its own migration so the value is committed before functions use it.
alter type public.pricing_method add value if not exists 'per_sqft';

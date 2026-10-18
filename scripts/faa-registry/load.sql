-- Loads the CSVs written by convert.mjs and swaps them in (keeps the old data
-- if the download looks incomplete). Run from the repository root:
--   psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f scripts/faa-registry/load.sql
begin;
truncate public.faa_registry_staging, public.faa_aircraft_ref_staging;
\copy public.faa_registry_staging from 'faa-out/registry.csv' with (format csv)
\copy public.faa_aircraft_ref_staging from 'faa-out/models.csv' with (format csv)
select public.faa_swap_import();
commit;

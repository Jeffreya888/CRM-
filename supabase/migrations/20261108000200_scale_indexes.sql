-- Indexes for scale.
--
-- 1. Every single-column foreign key gets an index. Without one, deleting or updating the
--    parent row (for example deleting a company, which the demo cleanup does every day)
--    scans the whole child table, and joins from the parent side are slow.
-- 2. Composite indexes for the queries that run most: dashboards, reports, AI allowances
--    and franchise totals filter by company and date or status.

do $$
declare
  r record;
  idx text;
begin
  for r in
    select c.conrelid::regclass::text as tbl, a.attname as col
    from pg_constraint c
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
    where c.contype = 'f' and c.connamespace = 'public'::regnamespace and array_length(c.conkey, 1) = 1
      and not exists (select 1 from pg_index i where i.indrelid = c.conrelid and i.indkey[0] = c.conkey[1])
  loop
    idx := left(replace(r.tbl, 'public.', '') || '_' || r.col || '_fk', 63);
    execute format('create index if not exists %I on %s (%I)', idx, r.tbl, r.col);
  end loop;
end $$;

create index if not exists payments_org_received on public.payments (org_id, received_at desc);
create index if not exists invoices_org_issue on public.invoices (org_id, issue_date desc);
create index if not exists quotes_org_issue on public.quotes (org_id, issue_date desc);
create index if not exists quotes_org_status on public.quotes (org_id, status);
create index if not exists jobs_org_status on public.jobs (org_id, status);
create index if not exists jobs_org_updated on public.jobs (org_id, updated_at desc);
create index if not exists customers_org_created on public.customers (org_id, created_at desc);
create index if not exists expenses_org_spent on public.expenses (org_id, spent_on desc);
create index if not exists assistant_messages_org_role_created on public.assistant_messages (org_id, role, created_at desc);
create index if not exists tasks_org_done on public.tasks (org_id, done);
create index if not exists job_photos_org on public.job_photos (org_id);

analyze;

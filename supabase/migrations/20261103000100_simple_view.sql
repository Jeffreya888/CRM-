-- Simple view: one-person businesses see the core tools first; "Show all tools" turns on everything.
alter table public.organizations add column if not exists show_all_tools boolean not null default false;
grant update (show_all_tools) on public.organizations to authenticated;

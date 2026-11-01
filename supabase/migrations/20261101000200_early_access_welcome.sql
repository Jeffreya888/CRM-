-- Early access welcome email: sent once per address; one-click unsubscribe.
alter table public.early_access
  add column welcomed_at timestamptz,
  add column unsubscribed_at timestamptz,
  add column unsubscribe_token uuid not null default gen_random_uuid();
create unique index early_access_unsubscribe_token on public.early_access (unsubscribe_token);

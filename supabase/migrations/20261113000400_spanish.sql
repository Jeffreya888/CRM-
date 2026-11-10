-- Spanish for technicians: each person picks their own language (owners can stay in English).
-- SOP steps and checklist text are translated once by the translate function and saved here, shared by everyone.

alter table public.profiles add column if not exists language text not null default 'en' check (language in ('en', 'es'));

create or replace function public.set_my_language(p_language text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  if p_language not in ('en', 'es') then raise exception 'Choose English or Spanish'; end if;
  update profiles set language = p_language where id = auth.uid();
end;
$$;
revoke execute on function public.set_my_language(text) from public, anon;
grant execute on function public.set_my_language(text) to authenticated;

-- Saved translations (server-only): source text hash + language → translated text.
create table if not exists public.translations (
  source_hash text not null,
  language text not null check (language in ('es')),
  source text not null,
  translated text not null,
  created_at timestamptz not null default now(),
  primary key (source_hash, language)
);
alter table public.translations enable row level security;
revoke all on public.translations from anon, authenticated;

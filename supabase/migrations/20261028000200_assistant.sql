-- =============================================================================
-- "Ask" AI assistant for crews, per-aircraft documents, question allowances,
-- and the founder metrics dashboard.
--   Questions: Solo 300 · Team 2,000 · Fleet 6,000 per month (trial 100, demo 20).
--   Photo questions use AI checks (claim_ai_check). One purchased AI check = 10 questions.
--   Owners/admins/managers can read every conversation in their company.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Per-aircraft documents (manual chapters, approved-products lists, instructions)
-- ---------------------------------------------------------------------------
create table public.aircraft_documents (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  aircraft_id uuid not null references public.aircraft(id) on delete cascade,
  title text not null check (length(trim(title)) between 1 and 200),
  kind text not null default 'other' check (kind in ('manual','approved_products','instructions','other')),
  storage_path text not null,
  mime_type text not null check (mime_type in ('application/pdf','image/jpeg','image/png','image/webp')),
  size_bytes int check (size_bytes > 0 and size_bytes <= 20 * 1024 * 1024),
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index on public.aircraft_documents (aircraft_id);
create trigger aircraft_documents_org_a before insert or update on public.aircraft_documents
  for each row execute function public.assert_same_org('aircraft', 'aircraft_id');

create or replace function public.trg_aircraft_document_path()
returns trigger language plpgsql as $$
begin
  if new.storage_path not like new.org_id::text || '/aircraft/' || new.aircraft_id::text || '/docs/%' or new.storage_path like '%..%' then
    raise exception 'File path must be inside this aircraft''s documents folder';
  end if;
  return new;
end;
$$;
create trigger aircraft_documents_path before insert or update on public.aircraft_documents
  for each row execute function public.trg_aircraft_document_path();

create or replace function public.trg_aircraft_documents_limit()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from aircraft_documents where aircraft_id = new.aircraft_id) >= 10 then
    raise exception 'An aircraft can have up to 10 documents. Remove one to add another.';
  end if;
  return new;
end;
$$;
create trigger aircraft_documents_limit before insert on public.aircraft_documents
  for each row execute function public.trg_aircraft_documents_limit();

alter table public.aircraft_documents enable row level security;
create policy aircraft_documents_select on public.aircraft_documents for select using (public.is_member(org_id));
create policy aircraft_documents_write on public.aircraft_documents for all
  using (public.is_manager(org_id)) with check (public.is_manager(org_id));

-- ---------------------------------------------------------------------------
-- Conversations (written by the assistant function with the service role)
-- ---------------------------------------------------------------------------
create table public.assistant_threads (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  job_id uuid references public.jobs(id) on delete set null,
  aircraft_id uuid references public.aircraft(id) on delete set null,
  guide_key text,
  title text not null default 'New question',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.assistant_threads (org_id, updated_at desc);
create index on public.assistant_threads (user_id, updated_at desc);
create trigger assistant_threads_org_j before insert or update on public.assistant_threads
  for each row execute function public.assert_same_org('jobs', 'job_id');
create trigger assistant_threads_org_a before insert or update on public.assistant_threads
  for each row execute function public.assert_same_org('aircraft', 'aircraft_id');

create table public.assistant_messages (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  thread_id uuid not null references public.assistant_threads(id) on delete cascade,
  role text not null check (role in ('user','assistant')),
  content text not null,
  photo_paths text[] not null default '{}' check (cardinality(photo_paths) <= 3),
  sources jsonb not null default '[]'::jsonb,        -- [{type:'sop'|'aircraft_doc'|'job'|'general', key?, step?, document_id?, title}]
  safety text check (safety in ('damage','injury','aircraft_systems')),
  status text not null default 'done' check (status in ('done','failed','limit')),
  created_at timestamptz not null default now()
);
create index on public.assistant_messages (thread_id, created_at);
create trigger assistant_messages_org_t before insert or update on public.assistant_messages
  for each row execute function public.assert_same_org('assistant_threads', 'thread_id');

alter table public.assistant_threads enable row level security;
alter table public.assistant_messages enable row level security;
-- The asker sees their own; owners, admins and managers see every conversation.
create policy assistant_threads_select on public.assistant_threads for select
  using (public.is_member(org_id) and (user_id = auth.uid() or public.is_manager(org_id)));
create policy assistant_threads_delete on public.assistant_threads for delete
  using (public.is_member(org_id) and user_id = auth.uid());
create policy assistant_messages_select on public.assistant_messages for select
  using (exists (select 1 from public.assistant_threads t where t.id = thread_id
                 and public.is_member(t.org_id) and (t.user_id = auth.uid() or public.is_manager(t.org_id))));

-- ---------------------------------------------------------------------------
-- Question allowance (plan questions, then purchased AI checks at 10 questions each)
-- ---------------------------------------------------------------------------
alter table public.ai_usage add column kind text not null default 'check' check (kind in ('check','question'));
alter table public.ai_usage drop constraint ai_usage_paid_from_check;
alter table public.ai_usage add constraint ai_usage_paid_from_check check (paid_from in ('plan','extra','bank'));
alter table public.organizations add column ai_question_bank int not null default 0 check (ai_question_bank >= 0);

create index on public.ai_usage (org_id, kind, used_at desc);

-- AI checks only count check usage from now on.
create or replace function public.ai_allowance(p_org uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_inc int := public.ai_included(p_org);
  v_used int;
  v_extra int;
  v_qinc int := public.ai_questions_included(p_org);
  v_qused int;
  v_bank int;
begin
  if auth.uid() is not null and not public.is_member(p_org) then raise exception 'Not a member'; end if;
  select count(*) into v_used from ai_usage where org_id = p_org and kind = 'check' and paid_from = 'plan' and used_at >= date_trunc('month', now());
  select count(*) into v_qused from ai_usage where org_id = p_org and kind = 'question' and paid_from = 'plan' and used_at >= date_trunc('month', now());
  select ai_extra_credits, ai_question_bank into v_extra, v_bank from organizations where id = p_org;
  return jsonb_build_object(
    'included', v_inc, 'used', v_used, 'extra', coalesce(v_extra, 0),
    'left', greatest(v_inc - v_used, 0) + coalesce(v_extra, 0),
    'questions_included', v_qinc, 'questions_used', v_qused,
    'questions_left', greatest(v_qinc - v_qused, 0) + coalesce(v_bank, 0) + 10 * coalesce(v_extra, 0));
end;
$$;

create or replace function public.ai_questions_included(p_org uuid)
returns int language sql stable security definer set search_path = public as $$
  select case
    when (select is_demo from organizations where id = p_org) then 20
    else case public.effective_plan(p_org) when 'trial' then 100 when 'solo' then 300 when 'team' then 2000 when 'fleet' then 6000 else 0 end
  end;
$$;
revoke execute on function public.ai_questions_included(uuid) from public, anon;
grant execute on function public.ai_questions_included(uuid) to authenticated;

create or replace function public.claim_ai_check(p_org uuid, p_source text default 'staff')
returns bigint language plpgsql security definer set search_path = public as $$
declare
  v_id bigint;
  v_used int;
begin
  perform pg_advisory_xact_lock(hashtext('ai_check:' || p_org::text));
  select count(*) into v_used from ai_usage where org_id = p_org and kind = 'check' and paid_from = 'plan' and used_at >= date_trunc('month', now());
  if v_used < public.ai_included(p_org) then
    insert into ai_usage (org_id, paid_from, source, kind) values (p_org, 'plan', p_source, 'check') returning id into v_id;
    return v_id;
  end if;
  update organizations set ai_extra_credits = ai_extra_credits - 1 where id = p_org and ai_extra_credits > 0;
  if found then
    insert into ai_usage (org_id, paid_from, source, kind) values (p_org, 'extra', p_source, 'check') returning id into v_id;
    return v_id;
  end if;
  return null;
end;
$$;

-- Server only: one text question (plan questions, then the question bank, then
-- one purchased AI check converted into 10 questions).
create or replace function public.claim_ai_question(p_org uuid)
returns bigint language plpgsql security definer set search_path = public as $$
declare
  v_id bigint;
  v_used int;
begin
  perform pg_advisory_xact_lock(hashtext('ai_check:' || p_org::text));
  select count(*) into v_used from ai_usage where org_id = p_org and kind = 'question' and paid_from = 'plan' and used_at >= date_trunc('month', now());
  if v_used < public.ai_questions_included(p_org) then
    insert into ai_usage (org_id, paid_from, source, kind) values (p_org, 'plan', 'staff', 'question') returning id into v_id;
    return v_id;
  end if;
  update organizations set ai_question_bank = ai_question_bank - 1 where id = p_org and ai_question_bank > 0;
  if not found then
    update organizations set ai_extra_credits = ai_extra_credits - 1, ai_question_bank = ai_question_bank + 9
      where id = p_org and ai_extra_credits > 0;
    if not found then return null; end if;
  end if;
  insert into ai_usage (org_id, paid_from, source, kind) values (p_org, 'bank', 'staff', 'question') returning id into v_id;
  return v_id;
end;
$$;

-- Gives back a check or question when the AI could not answer.
create or replace function public.release_ai_check(p_usage bigint)
returns void language plpgsql security definer set search_path = public as $$
declare u ai_usage;
begin
  delete from ai_usage where id = p_usage returning * into u;
  if not found then return; end if;
  if u.paid_from = 'extra' then
    update organizations set ai_extra_credits = ai_extra_credits + 1 where id = u.org_id;
  elsif u.paid_from = 'bank' then
    update organizations set ai_question_bank = ai_question_bank + 1 where id = u.org_id;
  end if;
end;
$$;
revoke execute on function public.claim_ai_check(uuid, text) from public, anon, authenticated;
revoke execute on function public.claim_ai_question(uuid) from public, anon, authenticated;
revoke execute on function public.release_ai_check(bigint) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Founder metrics (platform admins only)
-- ---------------------------------------------------------------------------
create or replace function public.platform_metrics()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v jsonb;
begin
  if not public.is_platform_admin() then raise exception 'Not allowed'; end if;
  with orgs as (
    select o.id, o.created_at, o.billing_period, o.billing_source, public.effective_plan(o.id) as eplan, o.plan
    from organizations o where not o.is_demo
  ), paid as (
    select *, case eplan
        when 'solo' then case when billing_period = 'annual' then 399.99 / 12 else 39.99 end
        when 'team' then case when billing_period = 'annual' then 899.99 / 12 else 89.99 end
        when 'fleet' then case when billing_period = 'annual' then 1899.99 / 12 else 189.99 end
        else 0 end as mrr,
      -- What reaches us after store commission (15% small-business rate) or Stripe (~3%).
      case when billing_source = 'stripe' then 0.97 else 0.85 end as net_rate
    from orgs where eplan in ('solo','team','fleet')
  ), ai as (
    select
      count(*) filter (where kind = 'check' and used_at >= now() - interval '30 days') as checks_30d,
      count(*) filter (where kind = 'question' and used_at >= now() - interval '30 days') as questions_30d
    from ai_usage
  ), pay as (
    select coalesce(sum(amount), 0) as volume_30d, coalesce(sum(platform_fee), 0) as fees_30d,
           count(distinct org_id) as paying_orgs_30d
    from payments where received_at >= now() - interval '30 days' and method = 'card'
  )
  select jsonb_build_object(
    'generated_at', now(),
    'companies', (select count(*) from orgs),
    'new_companies_30d', (select count(*) from orgs where created_at >= now() - interval '30 days'),
    'trials_active', (select count(*) from orgs where eplan = 'trial'),
    'paid_companies', (select count(*) from paid),
    'by_plan', (select coalesce(jsonb_object_agg(eplan, n), '{}') from (select eplan, count(*) n from paid group by eplan) x),
    'by_source', (select coalesce(jsonb_object_agg(coalesce(billing_source, 'unknown'), n), '{}') from (select billing_source, count(*) n from paid group by billing_source) x),
    'expired', (select count(*) from orgs where eplan = 'expired'),
    'mrr', (select round(coalesce(sum(mrr), 0), 2) from paid),
    'mrr_net', (select round(coalesce(sum(mrr * net_rate), 0), 2) from paid),
    'arr', (select round(coalesce(sum(mrr), 0) * 12, 2) from paid),
    'arpa', (select case when count(*) > 0 then round(sum(mrr) / count(*), 2) end from paid),
    'trial_conversion_pct', (select case when count(*) filter (where created_at < now() - interval '14 days') > 0
        then round(100.0 * count(*) filter (where eplan in ('solo','team','fleet') and created_at < now() - interval '14 days')
                   / count(*) filter (where created_at < now() - interval '14 days'), 1) end from orgs),
    'payment_volume_30d', (select round(volume_30d, 2) from pay),
    'platform_fees_30d', (select round(fees_30d, 2) from pay),
    'companies_taking_payments_30d', (select paying_orgs_30d from pay),
    'ai_checks_30d', (select checks_30d from ai),
    'ai_questions_30d', (select questions_30d from ai),
    -- Estimates: about 10 cents per photo check and 1.5 cents per question.
    'ai_cost_estimate_30d', (select round(checks_30d * 0.10 + questions_30d * 0.015, 2) from ai),
    'gross_margin_estimate_pct', (select case when (select sum(mrr * net_rate) from paid) + (select fees_30d from pay) > 0
        then round(100 * (1 - ((select checks_30d * 0.10 + questions_30d * 0.015 from ai) + 25)
                         / ((select sum(mrr * net_rate) from paid) + (select fees_30d from pay))), 1) end)
  ) into v;
  return v;
end;
$$;
revoke execute on function public.platform_metrics() from public, anon;
grant execute on function public.platform_metrics() to authenticated;

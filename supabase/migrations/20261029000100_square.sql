-- Square as a second payment processor next to Stripe. A company picks one
-- (organizations.payment_mode = 'stripe' | 'square' | 'direct'); invoices,
-- quote deposits, monthly care plans and in-person (Tap to Pay / reader)
-- payments all work with either. The platform fee is the same on both.
--
-- Square tokens live in square_connections, encrypted by the edge functions
-- (SQUARE_TOKEN_KEY) and readable only with the service role.

alter table public.organizations drop constraint if exists organizations_payment_mode_check;
alter table public.organizations
  add constraint organizations_payment_mode_check check (payment_mode in ('stripe','square','direct')),
  add column square_merchant_id text,
  add column square_location_id text,
  add column square_location_name text,
  add column square_charges_enabled boolean not null default false,
  add column square_connected_at timestamptz;
create unique index organizations_square_merchant on public.organizations (square_merchant_id)
  where square_merchant_id is not null;

create table public.square_connections (
  org_id uuid primary key references public.organizations(id) on delete cascade,
  merchant_id text not null,
  access_token_enc text not null,
  refresh_token_enc text not null,
  expires_at timestamptz not null,
  scopes text[] not null default '{}',
  updated_at timestamptz not null default now()
);
alter table public.square_connections enable row level security;
revoke all on public.square_connections from public, anon, authenticated;

-- Which processor took each payment. stripe_payment_intent_id keeps the
-- processor's payment id for both (Square payment ids never collide with Stripe's).
alter table public.payments
  add column provider text not null default 'stripe' check (provider in ('stripe','square'));

alter table public.quotes
  add column deposit_provider text check (deposit_provider in ('stripe','square'));

alter table public.customers
  add column square_customer_id text;

alter table public.recurring_schedules
  add column care_plan_provider text check (care_plan_provider in ('stripe','square')),
  add column care_plan_token text unique,
  add column square_card_id text,
  add column care_plan_next_charge_at timestamptz,
  add column care_plan_failures int not null default 0,
  add column care_plan_last_error text;
create index recurring_square_due on public.recurring_schedules (care_plan_next_charge_at)
  where care_plan_provider = 'square' and care_plan_status in ('active','past_due');

-- True when the company's customers can pay online right now.
create or replace function public.org_accepts_cards(o public.organizations)
returns boolean language sql stable set search_path = public as $$
  select not o.is_demo and case o.payment_mode
    when 'stripe' then o.stripe_charges_enabled
    when 'square' then o.square_charges_enabled
    else false end;
$$;

-- A deposit paid when the quote was accepted counts toward the job's invoice
-- (now records which processor took it).
create or replace function public._create_invoice_for_job(p_job uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  j jobs;
  o organizations;
  c customers;
  v_inv uuid;
  v_disc numeric;
begin
  select * into j from jobs where id = p_job;
  select * into o from organizations where id = j.org_id;
  select * into c from customers where id = j.customer_id;
  insert into invoices (org_id, number, customer_id, job_id, aircraft_id, branch_id, tax_rate, due_date, notes, created_by, covered_by_plan)
  values (j.org_id, public._next_number(j.org_id, 'invoice'), j.customer_id, j.id, j.aircraft_id, j.branch_id,
          case when c.tax_exempt then 0 else o.tax_rate end,
          current_date + coalesce(c.payment_terms_days, o.payment_terms_days),
          o.default_invoice_notes, auth.uid(), j.covered_by_plan)
  returning id into v_inv;
  insert into invoice_items (org_id, invoice_id, service_id, description, quantity, unit_price, taxable, sort_order)
    select org_id, v_inv, service_id, description, quantity, unit_price, taxable, sort_order
    from job_items where job_id = j.id;
  select round(subtotal * c.discount_pct / 100, 2) into v_disc from invoices where id = v_inv;
  if v_disc > 0 then
    perform set_config('app.system_discount', 'on', true);
    update invoices set discount = v_disc where id = v_inv;
    perform set_config('app.system_discount', 'off', true);
  end if;
  insert into payments (org_id, invoice_id, amount, method, reference, received_at, stripe_payment_intent_id, provider)
    select j.org_id, v_inv, q.deposit_amount, 'card', 'Deposit on quote ' || q.number, q.deposit_paid_at, q.deposit_payment_intent,
           coalesce(q.deposit_provider, 'stripe')
    from quotes q where q.id = j.quote_id and q.deposit_paid_at is not null and q.deposit_amount > 0
      and not exists (select 1 from payments p where p.stripe_payment_intent_id = q.deposit_payment_intent and q.deposit_payment_intent is not null);
  update jobs set status = 'invoiced' where id = j.id and status in ('completed','in_progress','scheduled','on_hold','tentative');
  return v_inv;
end;
$$;
revoke execute on function public._create_invoice_for_job(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Public customer documents (quote / invoice links)
-- ---------------------------------------------------------------------------
create or replace function public.get_public_document(p_kind text, p_token text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v jsonb;
  q quotes;
begin
  if p_kind = 'quote' then
    select * into q from quotes where public_token = p_token;
    if not found or q.status = 'draft' then return null; end if;
    -- Expire on read once the deadline passes.
    if q.status in ('sent','viewed') and coalesce(q.valid_until_at, (q.valid_until + time '23:59') at time zone 'UTC') < now() then
      perform set_config('app.quote_unlock', 'on', true);
      update quotes set status = 'expired' where id = q.id;
      q.status := 'expired';
    end if;
    perform set_config('app.quote_unlock', 'on', true);
    update quotes set view_count = view_count + 1, last_viewed_at = now(), first_viewed_at = coalesce(first_viewed_at, now()),
      status = case when status = 'sent' then 'viewed' else status end
    where id = q.id;
    perform set_config('app.quote_unlock', 'off', true);
    -- Alert on the first view and on views after a quiet day.
    if q.last_viewed_at is null or q.last_viewed_at < now() - interval '24 hours' then
      perform public.notify(q.org_id, 'managers', 'quote_viewed', 'Quote ' || q.number || ' opened',
        (select name from customers where id = q.customer_id) || ' is looking at your quote now.', '/quotes/' || q.id);
    end if;
    select jsonb_build_object(
      'kind', 'quote',
      'doc', to_jsonb(x) - 'public_token' - 'created_by' - 'deposit_payment_intent' - 'deposit_provider',
      'items', (select coalesce(jsonb_agg(to_jsonb(i) order by i.sort_order), '[]') from quote_items i where i.quote_id = x.id),
      'options', (select coalesce(jsonb_agg(to_jsonb(op) order by op.sort_order), '[]') from quote_options op where op.quote_id = x.id),
      'photo_count', (select count(*) from quote_photos where quote_id = x.id),
      'org', jsonb_build_object('name', o.name, 'email', o.email, 'phone', o.phone, 'address', o.address, 'logo_url', o.logo_url,
                                'currency', o.currency, 'accepts_cards', public.org_accepts_cards(o),
                                'timezone', o.timezone, 'payment_mode', o.payment_mode, 'public_slug', o.public_slug),
      'customer', jsonb_build_object('name', c.name, 'company', c.company, 'email', c.email, 'billing_address', c.billing_address),
      'aircraft', (select jsonb_build_object('tail_number', a.tail_number, 'model', concat_ws(' ', a.manufacturer, a.model), 'asset_type', a.asset_type) from aircraft a where a.id = x.aircraft_id),
      'superseded', x.superseded_by is not null,
      'job_requested', exists (select 1 from booking_requests b where b.quote_id = x.id)
    ) into v
    from quotes x join organizations o on o.id = x.org_id join customers c on c.id = x.customer_id
    where x.id = q.id;
  elsif p_kind = 'invoice' then
    select jsonb_build_object(
      'kind', 'invoice', 'doc', to_jsonb(i) - 'public_token' - 'created_by',
      'items', (select coalesce(jsonb_agg(to_jsonb(x) order by x.sort_order), '[]') from invoice_items x where x.invoice_id = i.id),
      'org', coalesce(i.org_snapshot, jsonb_build_object('name', o.name, 'email', o.email, 'phone', o.phone, 'address', o.address, 'logo_url', o.logo_url))
             || jsonb_build_object('currency', o.currency,
                                   'accepts_cards', public.org_accepts_cards(o),
                                   'google_review_url', coalesce(i.org_snapshot ->> 'google_review_url', o.google_review_url),
                                   'payment_mode', o.payment_mode, 'public_slug', o.public_slug),
      'customer', jsonb_build_object('name', c.name, 'company', c.company, 'email', c.email, 'billing_address', c.billing_address),
      'aircraft', (select jsonb_build_object('tail_number', a.tail_number, 'model', concat_ws(' ', a.manufacturer, a.model), 'asset_type', a.asset_type) from aircraft a where a.id = i.aircraft_id)
    ) into v
    from invoices i join organizations o on o.id = i.org_id join customers c on c.id = i.customer_id
    where i.public_token = p_token and i.status <> 'draft';
  end if;
  return v;
end;
$$;


-- Public care plan sign-up page (Square): what the customer is agreeing to.
create or replace function public.get_public_care_plan(p_token text)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'title', coalesce(s.title, sv.name, 'Monthly care plan'),
    'amount', s.care_plan_amount,
    'status', s.care_plan_status,
    'every', s.every, 'unit', s.unit,
    'org', jsonb_build_object('name', o.name, 'email', o.email, 'phone', o.phone, 'logo_url', o.logo_url,
                              'currency', o.currency, 'accepts_cards', public.org_accepts_cards(o),
                              'payment_mode', o.payment_mode, 'public_slug', o.public_slug),
    'customer', jsonb_build_object('name', c.name, 'email', c.email),
    'aircraft', (select jsonb_build_object('tail_number', a.tail_number, 'model', concat_ws(' ', a.manufacturer, a.model), 'asset_type', a.asset_type)
                 from aircraft a where a.id = s.aircraft_id)
  )
  from recurring_schedules s
  join organizations o on o.id = s.org_id
  join customers c on c.id = s.customer_id
  left join services sv on sv.id = s.service_id
  where s.care_plan_token = p_token and s.care_plan_provider = 'square' and s.billing = 'care_plan' and s.active;
$$;
revoke execute on function public.get_public_care_plan(text) from public;
grant execute on function public.get_public_care_plan(text) to anon, authenticated;

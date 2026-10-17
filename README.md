# Flight Ready — CRM for aircraft, auto & marine detailers

A multi-tenant CRM + field-service app for detailing companies, built to ship on
the **Apple App Store** (plus Google Play and the web) and sold as a subscription.

- **App:** Expo SDK 57 / React Native / Expo Router (iOS, Android, web)
- **Backend:** Supabase (Postgres + Row Level Security, Auth, Storage, Edge Functions)
- **Revenue:** subscriptions via App Store / Play (RevenueCat), plus a platform fee on
  every card payment processed for subscribers (Stripe Connect)
- **Website:** marketing site, pricing, privacy, terms and support are public routes of
  the same web build that hosts the customer portal.

Owner-only launch steps: **[docs/launch-checklist.md](docs/launch-checklist.md)**.
Full feature spec agreed with the owner: [docs/feature-plan.md](docs/feature-plan.md).

---

## Features

**Business types & assets** — aircraft, vehicles and watercraft (choose at sign-up, add later).
Built-in catalog of 545 aircraft and 604 boat models with size class, length and wingspan/beam;
Flight Ready price guide per model (company regional adjustment).

**Service guides & training** — 26 step-by-step service guides (Dry Wash Level 1 Trip Clean /
Level 2 Full Exterior, Exterior Wet Wash, Interior Level 1 / Level 2, Leather Shampoo &
Conditioning, ceramic, paint correction, brightwork, …). Guide steps become the job checklist;
videos can be attached to steps; companies can hide, copy and edit guides.

**Jobs & scheduling** — tentative/scheduled jobs, crew (primary + additional), travel buffers,
equipment and hangar reservations, live conflict checks (double booking, time off, working
hours, missing facility badges) with owner override, drag-and-drop dispatch board, time-off
requests, booking/reschedule requests. Before photos to start, after photos to complete, damage
documentation, versioned condition sign-off, crew time, supplies used, care opt-in follow-ups,
service report PDF, job profitability, low-rating alerts, "On our way" texts.

**Customers & sales** — customers with assets, contacts, texting consent and automation
exceptions; leads & follow-ups; facilities (airports/FBOs, marinas, service sites) with private
gate codes, fees, vendor requirements, maps and photos. Quotes with Good/Better/Best packages,
deadlines, deposits, photos, templates, versions, view tracking, follow-ups and decline reasons.
Invoices with company snapshot, review link, late fees, card/ACH or "arranged directly".

**Customer portal** — email one-time code; assets, upcoming visits, photos, quotes to approve,
invoices to pay, booking and reschedule requests.

**Recurring care** — schedules in weeks/months (local time kept across DST), day-of-week
patterns, end rules, lead time, heads-up messages, skip/pause, monthly care plans charged to the
card on file, annual price increases, plan health.

**Automations & messages** — job reminders, on-our-way, job complete, invoice reminder
sequence + late fees, review requests, quote follow-ups, recurring heads-ups; email and/or text
(Telnyx, platform-run), quiet hours, editable templates, message log with fix & resend, two-way
texting.

**Money & team** — pay periods with approvals, close/reopen and Gusto/QuickBooks/ADP/CSV exports;
expenses with receipt auto-fill, recurring bills, mileage and accountant export; cash/accrual
profit & loss with comparisons, tax set-aside and profit by service/customer/location; supply room
(par levels, reorder emails, barcode scanning, stock by van/location, count mode); equipment
maintenance with QR labels and problem reports.

**Security & access** — every company isolated with Postgres RLS; roles owner/admin/manager/
technician/viewer with owner-editable permissions enforced in the database (technicians never see
prices); private pay rates; email invitations; two-step sign-in (company can require it — enforced
in the database); devices & sessions; app lock (Face ID); Sign in with Apple; owner data export;
in-app account deletion; activity log. Demo workspace (Fleet preview, expires, no real sends).

**Fleet** — multiple company locations (branch filter everywhere), stock by location,
scheduling-software integration requests (FL3XX, Leon, Schedaero, Airplane Manager, Avianis,
Flight Schedule Pro).

---

## Monetization

| Plan | Monthly | Yearly | Seats | Texts / month | Card platform fee |
|---|---|---|---|---|---|
| Solo | $39.99 | $399.99 | 1 | 250 | 1.5% |
| Team | $89.99 | $899.99 | 10 | 1,000 | 1.0% |
| Fleet | $189.99 | $1,899.99 | Unlimited | 3,000 | 0.5% |

- 14-day free trial with every feature (10 seats). After it ends, data stays readable and
  exportable, but new records are blocked **in the database** until a plan is active.
- Subscriptions belong to the company (RevenueCat app user id = organization id) and are sold
  through Apple/Google In-App Purchase (guideline 3.1.1). Customer payments for physical detailing
  services go through Stripe Connect, which Apple allows (3.1.3(e)).
- Extra text packs are consumable in-app purchases (product ids containing `texts`).

## Setup (development)

```bash
npm install
cp .env.example .env            # Supabase URL/key, RevenueCat keys, EXPO_PUBLIC_PORTAL_URL
npx supabase@2 start            # local database (Docker) — applies supabase/migrations
npx expo start                  # press i / a / w
```

Native modules (purchases, push, camera scanning, Face ID, Sign in with Apple) need a development
build: `npx eas-cli@latest build --profile development`.

Production setup (Supabase auth settings, secrets, cron worker, Stripe/RevenueCat/Resend/Telnyx
webhooks, App Store products) is in **docs/launch-checklist.md**. Environment variables for the
functions are documented in `supabase/functions/.env.example`.

## Project layout

```
src/app/(site)/          public website: welcome, pricing, privacy, terms, support
src/app/(auth)/          sign in (demo, Apple), sign up (business type), reset
src/app/onboarding.tsx   create company / join with invite
src/app/invite/[token]   invitation links
src/app/portal/          public quote & invoice pages, customer portal (/portal/c/<slug>)
src/app/(app)/           the CRM (tabs: Dashboard, Jobs, Customers, Services, More + all screens)
src/components/          UI kit and feature components (jobs, quotes, portal, finance, team, …)
src/lib/                 session/permissions, plans, pricing, templates, data helpers
supabase/migrations/     schema, RLS, triggers, RPCs, catalogs and service guides
supabase/functions/      payments, webhooks, automation worker, messaging, portal, exports
supabase/tests/          database integration tests (plain Postgres)
docs/                    feature plan, build contract, launch checklist
```

## Checks

```bash
npm run lint          # ESLint (Expo config)
npm run typecheck     # TypeScript
npm test              # pricing / plan unit tests
npm run test:db       # migrations + RLS + business-flow tests (run as a non-root user)
cd supabase/functions && npx deno check --node-modules-dir=none */index.ts   # edge functions
```

# SkyShine — CRM for aircraft detailing companies

A multi-tenant CRM + field-service app for aircraft detailers, built to ship on
the **Apple App Store** (and Google Play + web) and sold as a subscription to
other detailing companies.

- **App:** Expo SDK 57 / React Native 0.86 / Expo Router (iOS, Android, web)
- **Backend:** Supabase (Postgres + Row Level Security, Auth, Storage, Edge Functions)
- **Revenue:** App Store / Play subscriptions via RevenueCat, plus a platform fee on
  every invoice your customers' customers pay by card (Stripe Connect)

> "SkyShine" is a placeholder name. Rename it in `src/lib/config.ts` and `app.json`
> (`name`, `slug`, `scheme`, `bundleIdentifier`, `package`).

---

## Features

**Customers & aircraft**
- Customers (owners, management companies, charter, flight schools, FBOs, corporate, government), leads, tags, lead source, payment terms, standing discount, tax exemption
- Multiple contacts per customer (chief pilot, DOM, scheduler…), one-tap call/text/email
- Aircraft profiles: tail number, make/model/year/serial, class, length & wingspan, paint, interior, coating history, home base, photo, notes
- Airports/FBOs with gate codes, water/power availability, directions
- Activity timeline (notes, calls, emails, meetings, automatic system events)

**Sales**
- Service menu with **aircraft-aware pricing**: per foot (with minimum), per aircraft class, flat, or hourly; 12-service starter price book
- Quotes with auto-pricing, discounts, tax only on taxable lines, terms; PDF; email; shareable link
- **Customer portal** (web): customers review and **accept quotes by typed signature** and **pay invoices online**
- Sales pipeline with stages, probability and weighted value

**Operations**
- Week schedule with day strip, "my jobs" filter, priorities (incl. AOG), weather-sensitive flag
- Work orders: crew assignment, checklists (auto-copied from each service), **before/after/damage photos**, time clock per job, supplies used, internal notes, **customer signature + star rating**, PDF service report with photos
- Quote → job → invoice in one tap each
- Automatic **recurring service reminders** (e.g. monthly wash, yearly ceramic refresh) created when a job completes, with push notifications
- Tasks / to-dos, time sheets with overtime flag and labor cost
- Inventory with low-stock alerts, restock/adjust history, supplies-per-job; equipment service tracking

**Money**
- Invoices: partial payments, overdue tracking, void, record check/cash/wire/ACH, **card & ACH via Stripe Checkout**, Stripe refunds sync
- Expenses by category
- Reports: collected revenue, net profit, invoiced, jobs completed, hours, quote win rate, average rating, revenue by month, top services, top customers, expenses by category, technician hours; PDF export
- CSV export of customers, aircraft, jobs, invoices

**Team & security**
- Roles: owner, admin, manager, technician, viewer. **Technicians never see prices, quotes, invoices or revenue** (enforced in the database, not just hidden in the UI)
- Invite by code, seat limits per plan, multiple companies per login
- Every table is isolated per company with Postgres Row Level Security; cross-company references are blocked by triggers
- In-app account deletion (App Store requirement)

---

## Monetization

| Stream | How it works | Where it's configured |
|---|---|---|
| **Subscriptions** | Solo / Team / Fleet, monthly + annual, sold through Apple IAP & Google Play Billing via RevenueCat. The subscription belongs to the **company** (RevenueCat app user id = organization id), so one purchase covers the whole team. | App Store Connect, RevenueCat, `src/lib/plans.ts` |
| **Free trial + paywall** | Every new company gets 14 days of full Team features. After that, existing data stays readable and exportable, but creating customers, aircraft, quotes, jobs and invoices is blocked **in the database** until they subscribe. | `organizations.trial_ends_at`, `assert_active_plan()` |
| **Payment processing fee** | Detailers connect Stripe (Express). When their customers pay an invoice online, the platform takes an application fee: 1.5% Solo, 1.0% Team, 0.5% Fleet (configurable), on top of Stripe's own fee. | `supabase/functions/invoice-checkout`, `PLATFORM_FEE_BPS_*` |

Suggested pricing (edit freely in App Store Connect):

| Plan | Monthly | Annual | Seats | Customers | Card fee |
|---|---|---|---|---|---|
| Solo | $29.99 | $299.99 | 1 | 50 | 1.5% |
| Team | $79.99 | $799.99 | 10 | Unlimited | 1.0% |
| Fleet | $199.99 | $1,999.99 | Unlimited | Unlimited | 0.5% |

**Why this is App Store-compliant:** access to the software is a digital
subscription, so it **must** use Apple In-App Purchase (guideline 3.1.1). That's
what RevenueCat does. Invoice payments are for **real-world detailing services**,
which Apple allows through outside payment processors (guideline 3.1.3(e)), so
Stripe is fine there.

---

## Setup

### 1. Install & run

```bash
npm install
cp .env.example .env          # fill in values (see below)
npx expo start                # press i / a / w
```

The app runs in Expo Go for most screens. Purchases, push notifications and the
date picker need a **development build**: `npx eas-cli@latest build --profile development`.

### 2. Supabase

1. Create a project at supabase.com and copy the URL + anon key into `.env`.
2. Apply the schema:
   ```bash
   npx supabase@2 link --project-ref YOUR_REF
   npx supabase@2 db push
   ```
3. Auth → URL configuration: add `skyshine://` and your portal URL to redirect URLs.
4. Deploy functions and secrets:
   ```bash
   cp supabase/functions/.env.example supabase/functions/.env   # fill in
   npx supabase@2 secrets set --env-file supabase/functions/.env
   npx supabase@2 functions deploy
   ```
5. Schedule the daily job (SQL editor; enable the `pg_cron` and `pg_net` extensions first):
   ```sql
   select cron.schedule('skyshine-daily', '0 11 * * *', $$
     select net.http_post(
       url := 'https://YOUR_REF.functions.supabase.co/daily-jobs',
       headers := jsonb_build_object('Authorization', 'Bearer YOUR_CRON_SECRET')
     );
   $$);
   ```

### 3. Stripe (invoice payments + your platform fee)

1. Create a Stripe account and enable **Connect** (Express accounts).
2. Put `STRIPE_SECRET_KEY` in function secrets.
3. Dashboard → Developers → Webhooks → endpoint
   `https://YOUR_REF.functions.supabase.co/stripe-webhook`, with events
   `checkout.session.completed`, `checkout.session.async_payment_succeeded`,
   `charge.refunded`, `account.updated` (tick "events on connected accounts").
   Save the signing secret as `STRIPE_WEBHOOK_SECRET`.
4. Settings → Payment methods: enable Cards and ACH Direct Debit.

### 4. Email (quotes & invoices)

Create a Resend account, verify your domain, and set `RESEND_API_KEY` and `EMAIL_FROM`.

### 5. RevenueCat (subscriptions)

1. In **App Store Connect**, create the app, then a subscription group
   "SkyShine Plans" with six auto-renewable products. **Product ids must contain
   `solo`, `team` or `fleet`**, e.g. `skyshine_solo_monthly`, `skyshine_solo_annual`,
   `skyshine_team_monthly`, … Add an introductory offer (e.g. 1 week free) if you like.
2. In **RevenueCat**: add the iOS app (upload the App Store Connect API key + in-app
   purchase key), create entitlements `solo`, `team`, `fleet`, attach the products,
   and create a **current offering** with monthly and annual packages for each.
3. Copy the public SDK keys into `.env` (`EXPO_PUBLIC_REVENUECAT_IOS_KEY`, …).
4. Integrations → Webhooks → `https://YOUR_REF.functions.supabase.co/revenuecat-webhook`,
   authorization header `Bearer <REVENUECAT_WEBHOOK_SECRET>`.
5. Repeat products in Google Play Console for Android.

### 6. Customer portal (web)

The same codebase builds a web app that hosts `/portal/quote/<token>` and
`/portal/invoice/<token>`:

```bash
npx expo export --platform web
npx eas-cli@latest deploy --prod      # EAS Hosting, or upload dist/ to any static host with SPA fallback
```

Set `EXPO_PUBLIC_PORTAL_URL` (app) and `PORTAL_URL` (functions) to that URL.

---

## Publishing to the App Store

Prerequisites: an **Apple Developer Program** membership ($99/yr). **No Mac is needed.**
EAS builds and signs in the cloud.

1. Set your real `ios.bundleIdentifier` / `android.package` in `app.json`.
2. `npx eas-cli@latest init` (fills `extra.eas.projectId`, which push notifications need).
3. Put the production `EXPO_PUBLIC_*` values in EAS: `npx eas-cli@latest env:create` (or the expo.dev dashboard).
4. Build: `npx eas-cli@latest build --platform ios --profile production`
5. Submit: `npx eas-cli@latest submit --platform ios` (set `ascAppId` in `eas.json`).
6. In App Store Connect, complete:
   - **App Privacy**: Contact info (name, email, phone), user content (photos), identifiers (user id), purchases. Linked to user, not used for tracking.
   - **Privacy policy URL** and **support URL** (required). Host them and set `EXPO_PUBLIC_PRIVACY_URL` / `EXPO_PUBLIC_TERMS_URL`.
   - **Subscriptions**: attach all six products to the version, with localized names, review screenshot of the paywall.
   - **Review notes**: give Apple a **demo login** for a company already on an active plan with sample data, and explain that card payments on invoices are for physical aircraft detailing services (3.1.3(e)).
   - Screenshots: 6.9" iPhone and 13" iPad (the app supports iPad).

What's already handled for App Review:
- Restore Purchases, auto-renew disclosure, Terms + Privacy links on the paywall (3.1.2)
- In-app account deletion (5.1.1(v))
- Camera/photo permission strings that explain the purpose (5.1.1)
- Non-exempt encryption flag set (`ITSAppUsesNonExemptEncryption: false`)
- No third-party social login, so Sign in with Apple is not required (4.8). If you add Google login, add Sign in with Apple too.

---

## Project layout

```
src/app/                 Expo Router screens
  (auth)/                sign in / sign up / reset
  onboarding.tsx         create company (starts trial) or join with invite code
  (app)/(tabs)/          Dashboard, Schedule, Jobs, Customers, More
  (app)/…                customers, aircraft, jobs, quotes, invoices, services, inventory,
                         pipeline, reminders, tasks, timesheets, expenses, locations,
                         team, reports, settings, paywall
  portal/[kind]/[token]  public customer portal (quote accept / invoice pay)
src/components/          UI kit, forms, line-item editor, signature pad, PDF actions
src/lib/                 Supabase client, session/plan context, pricing engine,
                         RevenueCat wrapper, PDFs, push notifications
supabase/migrations/     schema, RLS, triggers, RPCs
supabase/functions/      stripe-connect, invoice-checkout, stripe-webhook,
                         revenuecat-webhook, send-document, daily-jobs
supabase/tests/          database integration tests (run on plain Postgres)
```

## Checks

```bash
npm run typecheck     # TypeScript
npm test              # pricing / plan unit tests
npm run test:db       # migration + RLS + business-flow tests (needs Postgres binaries; run as a non-root user)
```

# Flight Ready — founder launch checklist (private)

This is for you, the Flight Ready owner. Your subscribers never see it; they get the in-app **Getting started** guide. Work top to bottom. A step is done only when its check passes, not just when an account exists.

## 1. Accounts, domain and support
- [ ] Buy the domain (e.g. flightready.app) and create a support mailbox (e.g. support@…).
- [ ] Apple Developer Program ($99/yr), App Store Connect access.
- [ ] Google Play Console ($25 once) if you launch on Android.
- [ ] Accounts: Supabase, Stripe, RevenueCat, Resend, Telnyx, Expo (EAS), Anthropic (receipt scanning).
- [ ] Fill in the legal placeholders on the website (`src/components/site/legalContent.ts`): `[Legal company name]`, `[Business address]`, `[State]`, `[Effective date]`. Have a lawyer review Privacy and Terms.
- **Check:** `https://<domain>/privacy`, `/terms` and `/support` open and show no placeholders.

## 2. Supabase (production database)
- [ ] Create the project on the **Pro plan** (daily backups; add Point-in-Time Recovery for production).
- [ ] `npx supabase@2 link --project-ref <ref>` then `npx supabase@2 db push`.
- [ ] Authentication settings (Dashboard → Authentication):
  - Anonymous sign-ins **on** (demo workspace and App Review).
  - Minimum password length **10**; email confirmation **on**.
  - Multi-factor: **TOTP enabled**.
  - Apple provider **on** with your iOS bundle id `com.flightready.app` (Sign in with Apple).
  - Redirect URLs: `flightready://**` and `https://<domain>/**`.
  - Custom SMTP: point Auth emails at Resend so sign-up/reset emails come from your domain.
- [ ] Storage: raise the upload size limit if owners will export large photo libraries.
- [ ] Make yourself platform admin: `insert into public.platform_admins (user_id) values ('<your auth user id>');`
- **Check:** do a restore of a backup into a branch/new project and confirm customers, jobs and photo links work.

## 3. Edge functions & secrets
- [ ] Fill `supabase/functions/.env` from `.env.example`, then `npx supabase@2 secrets set --env-file supabase/functions/.env`.
- [ ] `npx supabase@2 functions deploy`.
- [ ] Schedule the worker every 10 minutes (SQL editor; enable `pg_cron`, `pg_net`; store `cron_secret` in Vault):
  ```sql
  select cron.schedule('automation-worker', '*/10 * * * *', $$
    select net.http_post(
      url := 'https://<ref>.supabase.co/functions/v1/automation-worker',
      headers := jsonb_build_object('Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret'), 'Content-Type', 'application/json'),
      body := '{}'::jsonb, timeout_milliseconds := 120000);
  $$);
  ```
- **Check:** Platform admin screen shows "automation" worker runs as OK within 10 minutes.

## 3b. FAA registry (tail number autofill)
- [ ] GitHub repository secret `SUPABASE_DB_URL` = the database connection string (Supabase → Project Settings → Database → Session pooler URI, with password).
- [ ] Actions → "FAA registry import" → **Run workflow** once (then it runs every Monday).
- **Check:** in the app, add an aircraft and type a real N-number; the FAA card appears with make, model and owner.

## 3c. AI photo condition reports
- [ ] `ANTHROPIC_API_KEY` is set in the function secrets (same key as receipt scanning). Each check sends up to 6 photos. Monthly AI checks: Solo 25, Team 150, Fleet 500 (trial 15, demo 5) plus purchased packs; checks that fail are given back. Customer photo quotes (Team and Fleet) are limited to 3 per customer per day.
- **Check:** on an aircraft, "Check condition from photos" returns a report; in the portal, "Get a quote from photos" creates a request on the Requests screen.

## 4. Email (Resend)
- [ ] Add and verify your domain (SPF/DKIM DNS records exactly as Resend shows).
- [ ] `EMAIL_FROM` on that domain; `RESEND_API_KEY`; webhook → `/functions/v1/resend-webhook`, secret in `RESEND_WEBHOOK_SECRET`.
- **Check:** send yourself an invoice, a team invite and a password reset; all arrive (not spam) and the Message log shows Delivered/Opened.

## 5. Subscriptions (Apple / Google / RevenueCat)
- [ ] App Store Connect subscription group "Flight Ready Plans" with six products (ids must contain the plan name): `flightready_solo_monthly` $39.99, `flightready_solo_annual` $399.99, `flightready_team_monthly` $89.99, `flightready_team_annual` $899.99, `flightready_fleet_monthly` $189.99, `flightready_fleet_annual` $1,899.99.
- [ ] Optional consumable text packs, e.g. `flightready_texts_500`, `flightready_texts_2000`.
- [ ] AI check packs (consumable; the id must contain `ai_checks` and the number), e.g. `flightready_ai_checks_50`, `flightready_ai_checks_200`. Put them in RevenueCat like the text packs.
- [ ] RevenueCat: entitlements `solo`, `team`, `fleet`; current offering with monthly + annual packages; webhook → `/functions/v1/revenuecat-webhook` with `Bearer <REVENUECAT_WEBHOOK_SECRET>`; public SDK keys in the app env.
- **Check:** sandbox purchase on a real iPhone unlocks the plan; Restore works; the yearly plan shows "Yearly" in Settings.

## 6. Payments (Stripe Connect Express)
- [ ] Enable Connect (Express). `STRIPE_SECRET_KEY` in secrets.
- [ ] Two webhook endpoints, both → `/functions/v1/stripe-webhook`:
  - Your account (secret `STRIPE_WEBHOOK_SECRET`): `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `charge.refunded`.
  - Connected accounts (secret `STRIPE_CONNECT_WEBHOOK_SECRET`): `account.updated`, `checkout.session.completed`, `invoice.paid`, `invoice.payment_failed`, `customer.subscription.updated`, `customer.subscription.deleted`.
- [ ] Payment methods: Cards + ACH Direct Debit.
- **Check (test mode):** pay an invoice, a quote deposit and start a care plan; each shows as paid in the app with the platform fee recorded.

## 7. Customer texting (Telnyx)
- [ ] Telnyx account, messaging profile (webhook → `/functions/v1/telnyx-webhook`), `TELNYX_API_KEY`, `TELNYX_MESSAGING_PROFILE_ID`, `TELNYX_PUBLIC_KEY`.
- [ ] Register your brand/campaign for 10DLC (A2P) — required for US business texting.
- [ ] For each company that requests texting (Platform admin → Texting): buy a number in Telnyx, assign it to the profile, then "Activate texting" with that number.
- **Check:** a test customer with consent gets a reminder; replying STOP opts them out.

## 8. App build & website
- [ ] `npx eas-cli@latest init`; set `EXPO_PUBLIC_*` env vars in EAS (Supabase URL/key, RevenueCat keys, `EXPO_PUBLIC_PORTAL_URL=https://<domain>`, support email, store URLs).
- [ ] Web build for the website + customer portal: `npx expo export --platform web`, deploy (EAS Hosting or any static host with SPA fallback) on your domain.
- [ ] `npx eas-cli@latest build --platform ios --profile production` → `npx eas-cli@latest submit --platform ios`.

## 9. Pilot company (before real customers)
Run the full day with a test company: sign up → services & prices → customer + aircraft (catalog) → quote with packages → customer accepts online → job → before photos → start → crew time & supplies → after photos → complete → invoice → payment → review request → recurring visit → timesheet approval → P&L. Also: invite a technician and confirm they see no prices.

## Go / no-go
- [ ] Backups and a tested restore.
- [ ] Email delivery verified.
- [ ] Store products, purchase and restore verified on a device.
- [ ] Stripe test payments verified (or companies told to arrange payment directly).
- [ ] Texting registered (or left off at launch).
- [ ] Legal pages final; support email answered.
- [ ] Scheduling integrations described as "request access" until a vendor approves API access.

## After launch
- QuickBooks Online (Phase 2): start Intuit app review during beta; build at ~10–20 paying companies.
- Send your aircraft pricing file to merge into the Flight Ready price guide (`price_guide` table).
- Film the videos for brightwork polishing, ceramic coating, carpet extraction and paint correction and attach them to the guide steps in the Training center.

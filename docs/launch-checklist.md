# Tarmo — founder launch checklist (private)

This is for you, the Tarmo owner. Your subscribers never see it; they get the in-app **Getting started** guide. Work top to bottom. A step is done only when its check passes, not just when an account exists.

## 1. Accounts, domain and support
- [ ] Buy the domain gettarmo.com (optionally gettarmo.app too, redirecting to it) and create a support mailbox (e.g. support@…).
- [ ] Apple Developer Program ($99/yr), App Store Connect access.
- [ ] Google Play Console ($25 once) if you launch on Android.
- [ ] Accounts: Supabase, Stripe, Square (if offering it), RevenueCat, Resend, Telnyx, Expo (EAS), Anthropic (receipt scanning).
- [ ] Fill in the legal placeholders on the website (`src/components/site/legalContent.ts`): `[Legal company name]`, `[Business address]`, `[State]`, `[Effective date]`. Have a lawyer review Privacy and Terms.
- **Check:** `https://<domain>/privacy`, `/terms` and `/support` open and show no placeholders.

## 2. Supabase (production database)
- [ ] Create the project on the **Pro plan** (daily backups; add Point-in-Time Recovery for production).
- [ ] GitHub repository secrets `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_ID`, `SUPABASE_DB_PASSWORD`, then Actions → **Deploy backend** → Run workflow (applies the database and deploys the functions; run it again after each update). Terminal alternative: `npx supabase@2 link --project-ref <ref>` then `npx supabase@2 db push`.
- [ ] Authentication settings (Dashboard → Authentication):
  - Anonymous sign-ins **on** (demo workspace and App Review).
  - Minimum password length **10**; email confirmation **on**.
  - Multi-factor: **TOTP enabled**.
  - Apple provider **on** with your iOS bundle id `com.gettarmo.app` (Sign in with Apple).
  - Redirect URLs: `tarmo://**` and `https://<domain>/**`.
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
- [ ] App Store Connect subscription group "Tarmo Plans" with six products (ids must contain the plan name): `tarmo_solo_monthly` $39.99, `tarmo_solo_annual` $399.99, `tarmo_team_monthly` $89.99, `tarmo_team_annual` $899.99, `tarmo_fleet_monthly` $189.99, `tarmo_fleet_annual` $1,899.99.
- [ ] Optional consumable text packs, e.g. `tarmo_texts_500`, `tarmo_texts_2000`.
- [ ] AI check packs (consumable; the id must contain `ai_checks` and the number), e.g. `tarmo_ai_checks_50`, `tarmo_ai_checks_200`. Put them in RevenueCat like the text packs.
- [ ] RevenueCat: entitlements `solo`, `team`, `fleet`; current offering with monthly + annual packages; webhook → `/functions/v1/revenuecat-webhook` with `Bearer <REVENUECAT_WEBHOOK_SECRET>`; public SDK keys in the app env.
- **Check:** sandbox purchase on a real iPhone unlocks the plan; Restore works; the yearly plan shows "Yearly" in Settings.

## 6. Payments (Stripe Connect Express)
- [ ] Enable Connect (Express). `STRIPE_SECRET_KEY` in secrets.
- [ ] Two webhook endpoints, both → `/functions/v1/stripe-webhook`:
  - Your account (secret `STRIPE_WEBHOOK_SECRET`): `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `charge.refunded`.
  - Connected accounts (secret `STRIPE_CONNECT_WEBHOOK_SECRET`): `account.updated`, `checkout.session.completed`, `invoice.paid`, `invoice.payment_failed`, `customer.subscription.updated`, `customer.subscription.deleted`.
- [ ] Payment methods: Cards + ACH Direct Debit.
- **Check (test mode):** pay an invoice, a quote deposit and start a care plan; each shows as paid in the app with the platform fee recorded.

### 6c. Payments with Square (optional second processor)
Companies choose Stripe or Square in Settings → Payments. Square covers the same things (invoices, quote deposits, monthly care plans) plus in-person payments with Tap to Pay or a Square reader. Same platform fee.
- [ ] [Square Developer Console](https://developer.squareup.com/apps) → create an application. Use the **Sandbox** credentials first, production when testing is done.
- [ ] OAuth → Redirect URL: `https://<ref>.supabase.co/functions/v1/square-connect`.
- [ ] Secrets: `SQUARE_APPLICATION_ID`, `SQUARE_APPLICATION_SECRET` (OAuth page), `SQUARE_ENVIRONMENT` (`sandbox` or `production`), `SQUARE_TOKEN_KEY` (generate with `openssl rand -base64 32`; keep it forever — it encrypts the companies' Square tokens).
- [ ] Webhooks → Add subscription → URL `https://<ref>.supabase.co/functions/v1/square-webhook`; events `payment.created`, `payment.updated`, `refund.created`, `refund.updated`, `oauth.authorization.revoked`. Secrets: `SQUARE_WEBHOOK_SIGNATURE_KEY` (shown on the subscription) and `SQUARE_WEBHOOK_URL` (the exact URL above).
- [ ] Apple Pay on the payment pages: Square Developer Console → Apple Pay → download the domain file and publish it at `https://<domain>/.well-known/apple-developer-merchantid-domain-association` (put it in `public/.well-known/` before the web export). Each company's domain registration happens automatically when they connect.
- [ ] App builds: set `EXPO_PUBLIC_SQUARE_APPLICATION_ID` in EAS (same application ID; it starts Square's in-person SDK). Then a new build — in-person payments don't work in Expo Go.
- [ ] Tap to Pay on iPhone: request the entitlement from Apple ([developer.apple.com/tap-to-pay](https://developer.apple.com/tap-to-pay/)). After approval, add `SQUARE_TAP_TO_PAY_IOS=1` to the EAS build environment and rebuild. Before approval iPhones can still use a Square reader; Android Tap to Pay needs no extra approval.
- [ ] First Android build: check it compiles with Square's SDK (the config plugin sets Kotlin 2.2.21, which Square requires).
- **Check (sandbox):** Settings → Payments → Square → Connect (sandbox seller) → "Square connected". Pay an invoice and a deposit on the website with test card `4111 1111 1111 1111`, start a care plan from a recurring schedule and sign up on the link; each shows as paid with the platform fee. In the app on a phone: invoice → **Tap to Pay** → the Square screen appears (sandbox shows a mock reader). Refund one payment in the Square dashboard and see it removed from the invoice.

### 6b. Web subscriptions (Stripe Billing on your platform account)
Companies can sign up and pay on the website; the iPhone/Android apps keep using in-app purchase (section 5) and never link to web checkout or web prices.
- [ ] Stripe → Product catalog: three products (Solo, Team, Fleet), each with a **monthly** and a **yearly** recurring price matching `src/lib/plans.ts` ($39.99/$399.99, $89.99/$899.99, $189.99/$1,899.99). Set the price ids as secrets: `STRIPE_PRICE_SOLO_MONTHLY`, `STRIPE_PRICE_SOLO_ANNUAL`, `STRIPE_PRICE_TEAM_MONTHLY`, `STRIPE_PRICE_TEAM_ANNUAL`, `STRIPE_PRICE_FLEET_MONTHLY`, `STRIPE_PRICE_FLEET_ANNUAL`. A plan/period without its secret shows "Not available yet" on the web paywall.
- [ ] Optional one-time pack prices (each pack is offered only when its secret is set): `STRIPE_PRICE_AI_50`, `STRIPE_PRICE_AI_200`, `STRIPE_PRICE_TEXTS_500`, `STRIPE_PRICE_TEXTS_2000`.
- [ ] Customer portal (Settings → Billing → Customer portal): turn on; allow updating payment methods, viewing invoices, cancelling (at period end) and switching plans between the six plan prices above. Set your business name, terms and privacy links.
- [ ] Add to the **Your account** webhook endpoint (secret `STRIPE_WEBHOOK_SECRET`): `checkout.session.completed` (already there), `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`.
- [ ] Deploy `billing-checkout` and `billing-portal` (JWT verified; owner only).
- [ ] Optional — TODO: sales tax on subscriptions. Not collected today. If you need it, enable Stripe Tax and add `automatic_tax: { enabled: true }` (plus `customer_update: { address: 'auto' }`) to the Checkout sessions in `billing-checkout`.
- [ ] Optional: promotion codes are allowed at checkout — create coupons/promo codes in Stripe if you want them.
- **Check (test mode):** on the website as an owner in the free trial, Plans → Start subscription → pay with 4242… → back on Plans with "Thank you"; Settings shows the plan, "Billed by card on the web" and **Manage billing** opens the Stripe portal. Switch plans and cancel in the portal and see the app follow. Buy an AI and a text pack on the web and see the credits added once. On the iPhone app the same company shows "Your subscription is managed in your web account" and no purchase buttons.

## 7. Customer texting (Telnyx)
- [ ] Telnyx account, messaging profile (webhook → `/functions/v1/telnyx-webhook`), `TELNYX_API_KEY`, `TELNYX_MESSAGING_PROFILE_ID`, `TELNYX_PUBLIC_KEY`.
- [ ] Register your brand/campaign for 10DLC (A2P) — required for US business texting.
- [ ] For each company that requests texting (Platform admin → Texting): buy a number in Telnyx, assign it to the profile, then "Activate texting" with that number.
- **Check:** a test customer with consent gets a reminder; replying STOP opts them out.

## 8. App build & website
- [ ] `npx eas-cli@latest init`; set `EXPO_PUBLIC_*` env vars in EAS (Supabase URL/key, RevenueCat keys, `EXPO_PUBLIC_PORTAL_URL=https://<domain>`, support email, store URLs).
- [ ] Web build for the website + customer portal: `npx expo export --platform web`, deploy (EAS Hosting or any static host with SPA fallback) on your domain.
- [ ] `npx eas-cli@latest build --platform ios --profile production` → `npx eas-cli@latest submit --platform ios`.

### 8b. Mobile & shop detailing
- [ ] Nothing to set up on the platform: address lookup for travel fees and routes uses the free U.S. Census geocoder (US addresses; no key). Outside the US, crews type the miles.
- **Check:** Settings → Where you work → pick Both, add your address, a per-mile fee and 2 shop bays. Quote a mobile customer (Estimate → Add to quote), tap **On our way** on a mobile job (customer gets the arrival time), check in a shop job, finish it, tap **Ready for pickup**, then **Picked up**. Try booking a third car in the same time slot: the calendar warns that the bays are full. Open **Route** for today's stops.

## 9. Pilot company (before real customers)
Run the full day with a test company: sign up → services & prices → customer + aircraft (catalog) → quote with packages → customer accepts online → job → before photos → start → crew time & supplies → after photos → complete → invoice → payment → review request → recurring visit → timesheet approval → P&L. Also: invite a technician and confirm they see no prices.

## Go / no-go
- [ ] Backups and a tested restore.
- [ ] Email delivery verified.
- [ ] Store products, purchase and restore verified on a device.
- [ ] Stripe test payments verified (or companies told to arrange payment directly).
- [ ] Square sandbox payments, a care plan charge and Tap to Pay verified (if offering Square).
- [ ] Texting registered (or left off at launch).
- [ ] Legal pages final; support email answered.
- [ ] Scheduling integrations described as "request access" until a vendor approves API access.

## After launch
- QuickBooks Online (Phase 2): start Intuit app review during beta; build at ~10–20 paying companies.
- Send your aircraft pricing file to merge into the Tarmo price guide (`price_guide` table).
- Film the videos for brightwork polishing, ceramic coating, carpet extraction and paint correction and attach them to the guide steps in the Training center.

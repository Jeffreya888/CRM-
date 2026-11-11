# Tarmo to-do list

Prioritized, most urgent first. Updated November 11, 2026. Full launch steps live in `launch-checklist.md`.

## 1. This week (investors)

- [ ] **Thank-you email to Tim** with the one-pager PDF and the short note he can forward.
- [ ] **Share the deck link** (deck → Share menu) before sending it to anyone; it is private now.
- [ ] **Reply to every intro within 24 hours**: offer a 20-minute call and a live demo.
- [ ] **Test the demo link**: gettarmo.com/sign-in?demo=1. If it fails, Supabase → Authentication → turn on "Allow anonymous sign-ins".
- [ ] **Spanish test**: have a Spanish-speaking tech open a real job in the app.
- [ ] Optional: headshot on deck slide 17 (Founder).

## 2. Blockers (most items below wait on these)

- [ ] **File the LLC**, then EIN and D-U-N-S number. Unlocks the bank account, live Stripe/Square, Apple and Google developer accounts, texting, SAFEs and design partner agreements.
- [ ] **Business bank account.**
- [ ] **Lawyer review**: Terms, Privacy, design partner agreement and SAFE. Fill the website's legal blanks (`src/components/site/legalContent.ts`): company name, address, state, effective date.
- [ ] **`MAILING_ADDRESS` secret** in Supabase (CAN-SPAM requires a postal address in marketing emails).

## 3. Before the January 2027 launch

- [ ] **Sign 10 founding design partners** (messages in the Design Partner Program doc).
- [ ] **Aircraft pricing file**: send prices per model; same-class rates fill missing models; fix the Paint Correction $0; scale time estimates by size class.
- [ ] **SOP wording changes**: send the SOPs and new wording; Jetgleam also gets its own copies with its products named (shared SOPs stay as they are).
- [ ] **Apple and Google developer accounts**, then the six subscription products, RevenueCat, app builds and store submission.
- [ ] **Stripe live**: Connect and webhooks, plan prices, the three founding coupons. Square optional.
- [ ] **Email**: verify gettarmo.com in Resend; point Supabase sign-in emails at it (custom SMTP).
- [ ] **Supabase production**: Pro plan with more compute, a tested backup restore, two-step sign-in and Sign in with Apple, redirect URLs, the automation worker every 10 minutes, the FAA import secret.
- [ ] **QuickBooks**: Intuit developer app; secrets `QBO_CLIENT_ID`, `QBO_CLIENT_SECRET`, `QBO_ENVIRONMENT`.
- [ ] **Texting**: Telnyx 10DLC registration, or launch without texting.
- [ ] **Capacity**: higher Anthropic usage tier; Resend Pro.
- [ ] **Extend Jetgleam's trial** in Platform admin so it doesn't run out before launch.
- [ ] **Film training videos**: brightwork, ceramic coating, carpet extraction, paint correction.

## 4. Launch day

- [ ] **`EXPO_PUBLIC_PRELAUNCH=0`** in Cloudflare, then redeploy (shows Sign in, the demo and store badges).
- [ ] **Email the founding codes** to the early access list.
- [ ] **Uptime monitor** on gettarmo.com.

## Later / optional

- [ ] `GOOGLE_TTS_API_KEY` for a natural Ask Tarmo voice (then build it, cache audio per answer, 2–3 voices to pick from).
- [ ] Confirm RealClean's location count (franchise disclosure document, Item 20) before quoting a number.

## Product (Claude, no action needed from Jeffrey)

- [ ] Voice and speed picker for the free device voices.
- [ ] Captcha on demo sign-ins before launch.

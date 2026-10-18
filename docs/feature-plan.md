# Flight Ready — feature plan (from the original app walkthrough)

Decisions agreed with the owner while reviewing screenshots of the original
Flight Ready app. Status: **built** (owner said "sending complete"). See README for the feature summary. Phase 2 (competitive edge: FAA autofill, AI photo reports, SOP certification & QC, true job costing) is specified and built per docs/competitive-edge.md.

## Plans & pricing
| Plan | Price | Notes |
|---|---|---|
| Solo | $39.99/mo | Timesheet approvals hidden |
| Team | $89.99/mo | |
| Fleet | $189.99/mo | Multiple company locations (branches) + scheduling-software integrations |

Billing: monthly or yearly (≈2 months free): Solo $399.99/yr · Team $899.99/yr · Fleet $1,899.99/yr. Six store products (solo/team/fleet × monthly/annual).

Texting allowance per plan: Solo 250 / Team 1,000 / Fleet 3,000 texts per month; extra text packs as in-app purchase.

## Sign-in & demo
- Sign-in screen: "Flight Ready CRM — Aircraft care. Business ready.", Explore demo workspace, Create account, Forgot password, Explore plans/privacy/support, Join your company (invite).
- Passwords 10–128 characters.
- **Demo mode**: temporary sample company (expires), banner "Fleet preview · Temporary demo access" + Exit demo; real emails/texts/payments blocked. Also serves as Apple App Review access.

## Business type (asset categories)
- At sign-up choose: Aircraft only / Aircraft + Vehicles / Aircraft + Vehicles + Watercraft.
- Changeable later in Profile & Settings; categories can be added, never removed. Price unaffected.
- UI only shows forms/sizes/pricing for enabled categories. Customers have "assets".

## Dashboard
- Welcome, owner name · role, date.
- Company locations switcher (Fleet): All locations or one branch; filters jobs, schedules, quotes, invoices, profitability. Customers, assets, services shared company-wide.
- Profitability overview (month, excl. tax): gross & net profit; "Unknown" where cost data missing.
- Revenue: Total paid / Paid this month (keep week + month).

## Jobs / Job Details
- Crew assignment (primary tech + additional crew).
- Company branch per job (Fleet).
- Crew & resource schedule: start/end (≤ 24 h), travel before/after, confirmed crew, reserve equipment/hangar, live conflict warnings.
- Before photos required to start; after photos required to complete. JPG/PNG/WebP, ≤ 10 MB, ≤ 30 per job.
- Condition & service acceptance: condition report + customer signature (versioned).
- Airport/facility link; damage documentation (description + photo).
- Crew time (each person clocks own time); supplies used (whole units, idempotent).
- Customer care consent toggle ("opted in to follow-up care").
- Service report PDF (no prices). Job profitability (owner-only).

## Recurring asset care (per service)
- Interval in **weeks or months** (years = 12 months); calendar months.
- On completion: customer **not** opted in → reminder (as today). Opted in → automatic follow-up job with new status **Tentative**, owner confirms.

## Customers & leads
- Subtitle "N customers, N assets"; search customers and assets; cards with asset count, phone, email.
- Leads & follow-ups (owner/manager): stages, follow-up due dates, filters (stage, due follow-ups, assigned member), New lead. Won = sales outcome.

## Services
- Filters by asset type (All / Aircraft / Automotive / Watercraft) and by category.
- Each service applies to an asset type; durations in minutes or hour ranges.
- "Schedule a job" button on service detail.

## Profile & Settings
- Company info (invoice sender; sent invoices keep a snapshot).
- Business type card.
- Google review link; tax %; auto-send invoices on completion.
- Payments: "Arranged directly (no Stripe)" vs Stripe; Square "coming later".
- About Flight Ready CRM, website/plans/privacy/support.

## Reviews
- Google review link on every invoice + payment page, and automatic message ~1 day after payment to **every** customer (no gating).
- 1–3 star sign-off ratings → instant owner push alert + job flagged.

## Supply room (all nine)
1. Auto-deduct supplies per service on job completion.
2. Low-stock push alert (below par).
3. One-tap reorder (vendor, link, reorder qty; email order of all low items).
4. Supply cost flows into job profitability.
5. SDS (PDF) + OEM approvals per product.
6. Expiration dates.
7. Barcode scanning.
8. Stock per location/van (Fleet).
9. Count mode (cycle counts with logged corrections).
- Rename reorder level → **par level**; "Reorder list only" filter.

## Equipment (all eight)
1. Maintenance schedules by time and/or usage hours, with alerts.
2. Service history log (cost, notes, receipt photo → expenses/P&L).
3. Out-of-service lock (can't be booked).
4. Assignment (person / van / location / hangar).
5. Photos & documents (manuals, warranty, receipts).
6. Warranty expiration reminders.
7. QR labels: scan to view history / check out / report problem.
8. Technician problem reporting with photo → owner notified.

## Airports, marinas & service sites
- Categories: Airport/FBO, Marina (watercraft), **Service site** (vehicles: Residence / Business-fleet yard / Dealership / Your shop) — shown per business type.
- Fields: airport code, name, FBO/hangar, address, FBO phone, private gate/access code (owner/manager only), access notes, water, power, hangar available, hangar size/clearance notes.
- Link facility from asset; new jobs inherit it. Facilities ≠ Fleet branches.
- Additions: vendor requirements (COI/badges/registration) with expiration alerts; facility fees (ramp/access/after-hours) as job costs; map pin + directions; site photos.

## Scheduling (all five improvements)
- Crew working hours (defaults, editable), time off (multi-day), bookable equipment/hangars with capacity, standalone resource holds, company locations.
1. Automatic setup (no confirm gate).
2. Conflicts shown live while scheduling.
3. Owner override after warning (techs/managers cannot).
4. Visual dispatch board (columns per tech, drag & drop, unassigned list).
5. Time-off requests with owner approval.

## Workflow setup
- **Customer portal**: email one-time-code login; customer sees assets, upcoming jobs, photos, service reports, quotes to accept, invoices to pay; booking & reschedule requests → owner approves → job (conflict-checked). Access expiring/revocable.
- **Job profitability**: automatic from hourly rates + supply costs; gross = revenue (excl. tax) − labor − supplies; net = gross − job expenses; unknowns shown as Unknown.
- **Customer texting** (optional, off by default): platform-run Telnyx account (Option 1), number per company, carrier registration via platform, consent + STOP handling; appointment reminders, on-our-way, job complete + photos, two-way conversation per customer. Provider swappable.

## Timesheets → Pay periods (Team & Fleet)
- Pay period cadence (weekly / biweekly / semi-monthly); per-tech hours, flags (missing clock-out, >40h overtime), approve per person / all.
- Close pay period → locked; PDF + CSV exports formatted for Gusto / QuickBooks / ADP / generic. Owner-only reopen with audit log. Techs see their own approved hours.

## Integrations
- Scheduling providers (Fleet): FL3XX, Leon, Schedaero, Airplane Manager, Avianis, Flight Schedule Pro — "prepare vendor access request" flow; External schedule panel (read-only, aircraft only). Live sync per vendor once partner API access is approved.
- **QuickBooks Online (Phase 2)**: start Intuit app review during beta; build ~1–2 months after launch / at 10–20 paying companies. Sync invoices, payments, expenses, payroll hours. Gusto later; ADP last.

## Business expenses (all five)
- Job attribution field on expenses; hint not to re-enter job supplies/labor.
1. Receipt photo with auto-fill (vendor, amount, date) + stored receipt.
2. Recurring expenses (monthly insurance, hangar rent, software, truck payments).
3. Mileage tracking at IRS rate (manual or from job facility distance).
4. Tax-friendly categories + accountant export.
5. Branch tagging (Fleet) for per-location P&L.

## Profit & loss (cash basis + all seven)
- Cash-basis report: paid invoice revenue − recorded expenses − job supply costs − labor costs = net operating result; unpaid invoices excluded. Breakdown with counts (paid invoices, labor minutes).
- Reporting period From/Through + Apply; timesheets & labor rates panel (hourly rate per member); refresh button.
- Exports: P&L PDF, P&L CSV, Expenses CSV, Timesheets CSV, Inventory CSV.
1. Cash / accrual toggle.
2. Compare to previous period ($ and % change per line).
3. Profit by service, customer and branch (Fleet).
4. Tax set-aside estimate (owner-set % of net profit).
5. Email to accountant (saved email; P&L PDF + all CSVs for the period).
6. Date presets: this month, last month, this quarter, year to date, last year, custom.
7. Sales tax collected shown separately (not revenue).

## Public website (new, not a copy of the old one)
- Premium, modern marketing site: hero, workflow story, features by area, business types (aircraft / vehicles / watercraft), pricing (Solo $39.99 · Team $89.99 · Fleet $189.99, platform fee 1.5% / 1% / 0.5%), 14-day free trial, FAQ, App Store / Google Play badges.
- Real privacy policy + terms of service (owner fills legal name, address, state; lawyer review recommended). No "draft"/"preview"/builder notes anywhere.
- Support page: contact email (placeholder until domain exists) + contact form, Getting started guide (first 7 steps), FAQ (incl. billing, cancel, data export), troubleshooting tips.
- Hosted on the same web build as the customer portal.
- Launch checklist / launch guide = owner-only (project docs + platform-admin area), not shown to subscribers.

## Quotes & customer approvals (all nine)
- Approval deadline (date + time); expired quotes can't be accepted.
- Sent quotes are locked; edits create a new version (customer sees exactly what they approve).
- Customer can approve or decline from the private link.
1. Good / Better / Best: up to 3 packages per quote; customer picks one and signs.
2. Optional deposit on acceptance (% or fixed), paid by card via Stripe (platform fee applies).
3. Viewed tracking (open count, last viewed) + push when opened.
4. Automatic follow-ups after X days unanswered + 24h before deadline; stop on response.
5. Decline reason (price / timing / went elsewhere / other + note) → win/loss report.
6. Quote templates.
7. Photos attached to quotes.
8. Accepted → Tentative job automatically; customer requests preferred dates; owner confirms (conflict-checked).
9. List filters (Draft / Sent / Viewed / Accepted / Declined / Expired) + open quote value and win rate.

## Recurring care schedules (all nine)
- Two sources, one list: (a) per-service interval on job completion (above); (b) standalone schedule: customer + asset + service + price + first occurrence + interval + default tech + notes.
- Intervals in weeks or months in the company time zone (local time stays fixed across DST); not fixed UTC days.
1. Day-of-week patterns ("every 2nd Tuesday", "first Monday of the month").
2. Pause / resume / skip one occurrence.
3. End rule: never / on date / after N visits.
4. Lead time: create visits X days ahead as Tentative or Scheduled (per schedule), conflict-checked, default tech assigned.
5. Customer heads-up X days before, with reschedule link → portal request flow.
6. Preview of next 6 dates before saving; timeline of past/future visits.
7. Billing per schedule: invoice per visit, or monthly care plan auto-charged to card on file via Stripe (platform fee applies).
8. Optional annual price increase (X% on anniversary, with customer notice).
9. Plan health: active schedules, monthly recurring revenue, visits this month, unassigned schedules.

## Reminders & automation (all eight)
- Platform plumbing (worker, email domain, queues/failures) = owner-only platform health in the admin area. Subscribers see a **Message log** (every email/text: Delivered / Opened / Bounced / Failed; fix email & resend).
1. One Automation center: job reminder (X h before), on-our-way, job complete + photos, invoice reminders, review request, quote follow-ups, recurring heads-up, care-plan charges — each with on/off + timing.
2. Channel per automation: email / text / both (text only with consent).
3. Invoice reminder sequence: e.g. 3 days before due, due date, +7, +14, final notice; pay link in each; stops on payment.
4. Optional late fee (flat or %) after X days overdue, warned in the prior reminder.
5. Editable templates with fields ({customer}, {tail}, {date}, {amount}, {pay link}), live preview, send test to me.
6. Quiet hours for texts (8 AM–8 PM customer time); queued until allowed.
7. Per-customer exceptions (e.g. disable invoice reminders for net-60 accounts).
8. Smart defaults: job reminders + invoice reminders ON for new companies.

## Team roles & access (all eight)
- Email invitations: link + code, 7-day expiry, new invite to same email revokes old; resend/revoke; pending list. Owner must verify own email first.
- Role change/removal → reassignment step for open jobs + recurring schedules (no silent unassign).
- Default permissions (owner can change any toggle):
  - Owner: everything.
  - Admin: everything except subscription/plan, ownership transfer, deleting the company.
  - Manager: customers, assets, services, jobs, scheduling, quotes, invoices + prices, record payments, approve timesheets. **Not**: P&L/profitability, pay rates, company subscription, Stripe payout settings, team management.
  - Technician: assigned work, photos, checklists, own time and hours; no prices.
  - Viewer: read-only, no money.
1. Custom permission toggles per role (see prices, invoices, reports/P&L, edit customers, approve timesheets, give discounts, delete records).
2. Better invites (above).
3. Member profile: phone, photo, hourly rate + pay type (owner-only; feeds labor cost/P&L), default branch (Fleet).
4. Certifications with expirations (airport badges, ramp safety, coating-brand) + alerts; scheduler warns if tech lacks a facility's required badge.
5. Skill tags (ceramic, interior, brightwork, paint correction); scheduler suggests qualified techs first.
6. Deactivate instead of delete (history kept, seat freed) + reassignment.
7. Activity log per member (owner-only).
8. Seat usage meter + upgrade prompt.

## Account & security (all ten)
- Demo accounts show a demo status card instead (no password/email/push changes).
1. Profile: name, photo, phone, change email (confirm link to new address).
2. Change password + forgot-password email.
3. Face ID / fingerprint app lock (on open or after X minutes away).
4. Two-step sign-in (authenticator app); owner can require it for the whole team.
5. Signed-in devices: list, last active, sign out one / everywhere.
6. New-device sign-in alert email.
7. Push per phone (enable/disable) + private lock screen (no customer names/amounts).
8. Sign in with Apple.
9. My companies: switch / leave.
10. Owner data export: one-tap ZIP (CSVs, PDFs, photos).

## Launch & setup guide (owner-only)
- Not shown to subscribers. Rewrite as a private founder launch checklist for this stack: domain + support email, Supabase production project (daily backups / point-in-time restore, tested restore), Resend domain verification, Apple Developer + App Store Connect products, Google Play products, RevenueCat entitlements/offerings + webhook, Stripe Connect (Express) + webhook, Telnyx texting registration, EAS build/submit, legal pages, pilot company test, go/no-go list.
- Subscribers get the in-app "Getting started" guide instead (first 7 steps).
- Stripe stays Connect **Express** (simpler onboarding than the old app's Standard OAuth).

## Built-in aircraft catalog & price guide (platform defaults)
- Built-in aircraft model catalog (manufacturer, model, size class, length, wingspan) covering all major makers: Gulfstream (G280–G800), Dassault Falcon (10–10X), Bombardier (Learjet, Challenger, Global), Cessna Citation (M2–Longitude), Embraer (Phenom, Praetor, Legacy, Lineage), Hawker/Beechcraft (King Air, Premier, Hawker), Pilatus, Honda, Cirrus Vision, Daher TBM, Piper, Cirrus, Diamond, Mooney, Boeing BBJ / Airbus ACJ and airliners, plus helicopters (Bell, Airbus, Leonardo, Sikorsky, Robinson). Search when adding an asset; custom entry still allowed. Dimensions from public specs.
- Until the owner's pricing file arrives: 12 standard services with size-based pricing.
- Owner will send pricing per aircraft + services → merged into the catalog as the **Flight Ready price guide** (suggested price per model per service) for every new company. Each company can edit prices and apply a regional adjustment %.

## Service levels (owner clarification)
- Exterior **dry wash**: Level 1 = Trip Clean, Level 2 = Full Exterior (two services, two guides).
- Exterior **wet wash**: Full Exterior only (no levels).
- **Interior**: Level 1 = Trip Clean (quick wipe-down), Level 2 = Full Interior.
- **Leather shampoo & conditioning**: its own step-by-step checklist.
- Boat model catalog (like the aircraft catalog) for watercraft.

## Training library (platform defaults)
- Default **step-by-step service guide** for every service, written by us (owner reviews): what it is, time estimate by size, crew, products, tools/equipment, prep and protection (pitot/static covers, sensors, antennas, de-ice boots, windows), numbered steps, aviation-specific do-nots, quality check, photos to take.
- Guide steps double as the job checklist automatically.
- Launch with written guides only. Owner adds videos later for the big services: brightwork polishing, ceramic coating, carpet extraction, paint correction (attached to specific steps).
- Disclaimer: always follow the aircraft manufacturer's maintenance manual and OEM-approved products.
- Each company can hide a default guide, duplicate and edit it, or add its own media/guides.

## More menu (from original)
Company profile & settings · Supply room · Equipment & maintenance · Airports, FBOs & marinas · Crew scheduling & resource reservations · Workflow setup & customer portal · Timesheet approvals · Business expenses · Profit & loss · Flight Ready website & plan information · Invoices & completion reports · Quotes & customer approvals · Recurring asset care · Reminders & delivery readiness · Team roles & access · Training center · Scheduling integrations · Account & security · Company access · Launch & setup guide (PDF) · Sign out

## Still to review
Anything else the owner sends.

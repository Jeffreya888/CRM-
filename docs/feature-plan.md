# Flight Ready — feature plan (from the original app walkthrough)

Decisions agreed with the owner while reviewing screenshots of the original
Flight Ready app. Status: **collecting; not built yet** (owner will say
"sending complete").

## Plans & pricing
| Plan | Price | Notes |
|---|---|---|
| Solo | $39.99/mo | Timesheet approvals hidden |
| Team | $79.99/mo | |
| Fleet | $189.99/mo | Multiple company locations (branches) + scheduling-software integrations |

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

## More menu (from original)
Company profile & settings · Supply room · Equipment & maintenance · Airports, FBOs & marinas · Crew scheduling & resource reservations · Workflow setup & customer portal · Timesheet approvals · Business expenses · Profit & loss · Flight Ready website & plan information · Invoices & completion reports · Quotes & customer approvals · Recurring asset care · Reminders & delivery readiness · Team roles & access · Training center · Scheduling integrations · Account & security · Company access · Launch & setup guide (PDF) · Sign out

## Still to review
Flight Ready website & plan info, Reminders & delivery readiness, Account & security, Launch & setup guide, and anything else the owner sends.

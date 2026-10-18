# Competitive edge build (approved Oct 18, 2026)

The owner approved everything below. Their instruction: **"make it as simple as possible to use."**
Guiding rules:
- Every feature is useful with zero setup. It uses sensible defaults and appears only where it helps.
- One tap to apply an AI or FAA suggestion. A person always confirms; nothing changes silently.
- Plain words: "SOP", "True cost", "Condition", "Quality check". Never use jargon like "burden" alone. Write "Payroll taxes & insurance (%)".

The database lives in `supabase/migrations/20261018000000_competitive_edge.sql` (lead writes it). The contract below is binding for UI work.

---

## 1. FAA tail number autofill (aircraft)
- Data: the full FAA aircraft registry is loaded weekly by `.github/workflows/faa-registry.yml` into `faa_registry` + `faa_aircraft_ref`.
- **RPC `faa_lookup(p_org uuid, p_tail text) → jsonb`** (any member):
  ```ts
  { found: false, reason: 'not_us' | 'not_found' | 'no_data' }
  | { found: true, n_number: 'N550GV', serial: string|null, year: number|null,
      faa_manufacturer: string, faa_model: string,      // raw FAA strings, e.g. 'GULFSTREAM AEROSPACE', 'GV-SP (G550)'
      owner: string|null, city: string|null, state: string|null, country: string|null,
      status: string|null,            // plain words: 'Valid', 'Expired', 'Deregistered pending', ...
      expires: string|null,           // YYYY-MM-DD registration expiration
      cert_issued: string|null, engines: number|null, seats: number|null, type: string|null, // 'Fixed wing multi engine', 'Rotorcraft', ...
      model_id: string|null,          // best catalog match (aircraft_models.id)
      catalog: { manufacturer, model, category, length_ft, wingspan_ft } | null,
      match: 'learned' | 'alias' | 'name' | null,
      data_as_of: string|null }       // when the registry was last imported
  ```
  Only US tails ("N…" or bare digits+letters) are looked up; others return `not_us`.
- **RPC `remember_faa_model(p_org uuid, p_tail text, p_model uuid)`**: call it after saving an aircraft whose chosen catalog model differs from the suggested `model_id`. The next lookup of the same FAA type then suggests that model ("learned").
- Asset columns: `aircraft.faa jsonb` (snapshot of the lookup result) and `aircraft.faa_checked_at timestamptz`.
- **UX**:
  - In the aircraft form, typing a tail number looks it up automatically (debounced ~600 ms).
  - A small card appears: "FAA: 2008 Gulfstream G550 · S/N 5190 · Registered to XYZ LLC, Wilmington DE" with **Use these details**. Tapping it fills manufacturer, model, catalog model (size class, length, wingspan), year and serial, and stores the snapshot.
  - If the registration is expired or deregistered, show a yellow note.
  - The aircraft detail screen shows a "Registration (FAA)" card with **Refresh**.

## 2. AI photo condition report
- **Edge function `assess-photos`** (staff):
  - Body: `{ org_id, paths: string[] (1–6, already uploaded to org-files under <org_id>/…), aircraft_id?, job_id?, quote_id? }`. Any member except viewer.
  - Returns the saved `condition_assessments` row.
  - Daily cap: 40 per company per day; demo 5.
- **Portal** (customers): `portal` actions:
  - `{ action: 'upload_urls', token, count (1–6), ext }` → `{ uploads: [{ path, url, token }] }`. These are signed upload URLs; upload with `PUT`, or with `supabase.storage.from('org-files').uploadToSignedUrl(path, token, file)`.
  - `{ action: 'photo_quote', token, aircraft_id?, paths, notes? }` → `{ ok: true, request_id }`. This creates a `booking_requests` row with `kind = 'photo_quote'` and `photo_paths`, runs the assessment, and links `assessment_id`.
  - Caps: 3 per customer per day. Owners can turn it off with `organizations.photo_quotes_enabled`.
- **Table `condition_assessments`**:
  - Context: id, org_id, aircraft_id, customer_id, job_id, quote_id, booking_request_id, source ('staff'|'portal'), photo_paths text[], status ('pending'|'done'|'failed').
  - Results: overall ('light'|'moderate'|'heavy'|'severe'), score (1–10, 10 = like new), summary, findings jsonb `[{ area, issue, severity: 'low'|'medium'|'high', note }]`, suggestions jsonb `[{ service_id|null, guide_key|null, name, reason }]`, error.
  - Tracking: created_by, created_at, applied_at, applied_by.
  - Members can read it. It is written by the function, and by managers when applied.
- **RPC `apply_assessment(p_assessment uuid)`** (manager): sets `aircraft.condition_level = overall` (and `condition_updated_at`) and marks the row applied.
- **UX**:
  - Shared sheet `<AssessPhotosSheet>`:
    - The user picks or takes up to 6 photos, taps **Check condition**, and watches progress.
    - The result card shows the condition badge, a score, the summary, findings with severity dots, and suggested services as chips.
    - Buttons: **Create quote** (managers with see_prices) and **Save condition to aircraft**.
    - It is always labelled "AI estimate — please confirm on site".
  - Entry points: aircraft detail ("Check condition from photos"), new quote ("Start from photos"), job detail (manager, "Check condition").
  - Requests screen: a `photo_quote` request shows the photos, the AI report and **Create quote**.
  - Portal: "Get a quote from photos". The customer picks an aircraft (or none), adds photos and a note, then submits.
- **Create quote from assessment** (client helper `src/lib/assess.ts`, `quoteFromAssessment()`):
  1. Creates a draft quote for the customer and aircraft with `condition_level` and `condition_pct` from the company's multipliers.
  2. Adds one line per suggested service that exists, priced with `priceService()` and then the condition adjustment.
  3. Opens the quote editor.

## 3. SOPs (service guides) — per-step time and materials
- Service guides are labelled **SOPs** everywhere in the UI ("Standard Operating Procedures" in headers, "SOP" in buttons). Routes stay the same.
- Each step (`service_guides.steps[]`) may carry `minutes?: number` and `products?: string[]` (names from the guide's product list). The SOP view shows them per step and a total; the SOP editor edits them.
- Job checklist: per step, show the estimate (when present) and the actual time (the gap since the previous checked step). The job shows "Steps took 3h 10m (est. 2h 45m)".

## 4. Quality control sign-off
- `organizations.require_qc boolean default false` (Settings → "Require a quality check before completing jobs").
- Jobs:
  - `qc_status` ('not_required'|'pending'|'passed'|'failed'), `qc_by`, `qc_at`, `qc_notes`.
  - `job_checklist_items.kind` ('step'|'qc'). QC items are created automatically from each SOP's quality checks when a service is added to a job.
- RPCs:
  - **`submit_for_qc(p_job)`** (assigned crew or manager) → status 'pending' and notifies managers.
  - **`qc_decision(p_job, p_pass boolean, p_notes text)`** (manager). Pass → 'passed'. Fail → 'failed', notifies the assigned crew with the notes, and the job stays in progress.
- When `require_qc` is on, completing a job whose `qc_status <> 'passed'` raises `QC_REQUIRED: …`.
- **UX** on the job screen:
  - A "Quality check" section lists the QC items as checkboxes.
  - Crew: **Ready for quality check**.
  - Manager: **Pass** / **Needs work** (with a note).
  - Badges: "QC passed by Ana · 4:12 PM", or "Needs work: …".

## 5. Technician certification per SOP
- **Table `service_skills (org_id, user_id, guide_key, level 'training'|'certified'|'trainer', certified_by, certified_at, requested_at, notes)`**.
- RPCs:
  - **`request_skill_signoff(p_org, p_guide_key)`**: the tech asks to be certified; this notifies managers.
  - **`set_skill(p_org, p_user, p_guide_key, p_level text|null)`** (manager; null removes).
- `services.requires_cert boolean default false`. The scheduling check adds a warning `{ type: 'not_certified', user_id, message: 'Ana is not certified for Ceramic Coating.' }` (overridable like the others).
- **UX**:
  - On an SOP: "Certified technicians", plus **Request sign-off** (tech) and **Certify** (manager).
  - Team member screen: a "Certified for" list with a quick add.
  - Service editor: toggle "Only certified technicians".

## 6. Condition-based pricing
- Asset: `aircraft.condition_level` ('light'|'moderate'|'heavy'|'severe'|null), `condition_updated_at`.
- `organizations.condition_multipliers jsonb default {"light":0,"moderate":15,"heavy":35,"severe":60}` (percent added).
- Quote: `quotes.condition_level`, `quotes.condition_pct numeric`. The quote editor has a **Condition** selector. It defaults from the aircraft and shows "+35%". New lines are priced × (1 + pct/100). Changing it re-prices existing lines that came from services, after a confirm. The customer view shows "Pricing reflects heavy condition".

## 7. Pricing from real dimensions
- New pricing method **`per_sqft`**: price = max(base_price, length_ft × wingspan_ft (beam for boats) × price_per_sqft). When a dimension is missing, it falls back to the category's typical size. Column `services.price_per_sqft`.
- **`services.category_hours jsonb`** holds hours per size class (like `category_prices`). The service editor shows one grid: size class → price (when per class) and hours.
- Estimated hours for a service on an asset = `category_hours[category] ?? est_hours` × quantity. For hourly services, it is the quantity.

## 8. Fractional supply usage
- `service_supplies.quantity` is now numeric (e.g. 0.25 gal), plus `per_foot boolean` (quantity per foot of length).
- Stock quantities and movements allow 3 decimals. Counts allow decimals.
- Auto-deduct on completion uses quantity × line quantity × (length if per_foot).

## 9. Estimate vs actual
- `job_items.est_hours` and `est_supply_cost`, and the same on `quote_items`. They are filled automatically by the database when a line is added or changed (and recomputed when the asset changes).
- `job_profitability(p_job)` adds:
  - estimates: est_hours, est_labor, est_supplies, est_cost;
  - actual true cost: true_labor (wages + payroll % + overhead per hour), overhead, true_cost, true_profit, true_margin_pct;
  - accuracy: hours_variance_pct.
- **UX**:
  - Job screen (see_reports): an "Estimate vs actual" card. Example: "Hours: est 6.0 · actual 7.2 (+20%)", "Cost: est $410 · actual $492", "True profit $1,108 (69%)".

## 10. Profit by aircraft class / model / boat size
- **RPC `job_costing_report(p_org, p_from date, p_to date, p_branch uuid default null) → jsonb`** (see_reports):
  ```ts
  { by_class: Row[], by_model: Row[], by_type: Row[], by_service: AccuracyRow[], totals: Row,
    hourly_cost: number, overhead_per_hour: number, labor_burden_pct: number }
  Row = { key: string, label: string, jobs: number, revenue: number, cost: number, profit: number, margin_pct: number|null,
          hours: number, est_hours: number, revenue_per_hour: number|null }
  AccuracyRow = { service_id, name, jobs, est_hours, actual_hours, variance_pct: number|null }
  ```
  Jobs completed in range. Cost = true labor (members without a pay rate use the company average) + supplies + job expenses.
- **UX**: the Profit & loss screen gets a **Job costing** tab. Segmented By class / By model / By type, then rows sorted by profit with margin bars. Below that, "Estimate accuracy by service".

## 11. True labor cost (payroll % + overhead)
- `organizations.labor_burden_pct numeric default 15` ("Payroll taxes & insurance on top of wages") and `organizations.overhead_per_hour numeric default 0` ("Overhead per labor hour").
- **RPC `suggest_overhead_per_hour(p_org) → { overhead_per_hour, expenses, hours, days }`** (admin): the last 90 days of expenses not tied to a job, divided by labor hours.
- **RPC `quote_estimate(p_quote) → jsonb`** (see_reports):
  ```ts
  { hourly_cost: number, options: [{ option_id: string|null, name: string, revenue: number, est_hours: number,
      labor: number, supplies: number, cost: number, profit: number, margin_pct: number|null }] }
  ```
- **UX**:
  - Settings (owner/admin), a "Job costing" section: payroll % and overhead per hour (with **Suggest from my expenses**). Also the condition percents and the QC toggle.
  - Quote editor: a slim banner (see_reports only), e.g. "Est. cost $410 · margin 62% · 6.0 h". It is red under 30%.

## 12. Positioning
- Website: "The operating system for professional detailing — aviation, marine and automotive." The features section adds FAA autofill, AI photo condition reports, SOPs with technician certification, and true job costing.

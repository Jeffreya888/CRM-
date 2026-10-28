# Build contract (app ↔ database ↔ edge functions)

Internal reference for implementing docs/feature-plan.md. The database is in
`supabase/migrations/20261017*.sql` (read them for exact columns/RPCs).

## Conventions
- Expo SDK 57 + expo-router 57. Routes in `src/app`. Use `src/components/ui.tsx` kit, `src/lib/theme.ts` colors.
- Session: `useOrg()` → `{ org, orgId, role, plan, perm(p), can(feature), businessTypes, isDemo, branchId, setBranchId, refresh, session, profile }`.
  - Money/price UI: `perm('see_prices')`. P&L/profitability: `perm('see_reports')`. Admin: `canAdmin(role)`. Owner: `isOwner(role)`.
  - Plan features: `can('branches' | 'integrations' | 'stock_locations' | 'timesheet_approvals' | 'team' | ...)`; wrap upsell areas in `<Gate feature=...>`.
- Data: `useQuery(fn, deps)` (src/lib/useQuery.ts), `supabase` + `must()` + `friendlyError()` + `callFunction(name, body)` (src/lib/supabase.ts).
- Pickers: `useLookups()` (customers, assets, facilities, services (price-free for techs), members, branches + option builders).
- Assets: table `aircraft` holds aircraft, vehicles and watercraft (`asset_type`). Helpers in `src/lib/pricing.ts`: `ASSET_TYPES`, `categoriesFor()`, `categoryLabel()`, `assetTypeInfo()`, `BUSINESS_TYPE_CHOICES`, `adjustPrice()`.
- Errors from the DB use `CODE: sentence` and `friendlyError` strips the code.
- Forms: `FormSheet` (src/components/FormSheet.tsx), date/time: `DateTimeField`.
- Never show prices to people without `see_prices` (the DB also blocks them).
- Run `npx tsc --noEmit` and `npx expo lint` before finishing.

## Route map (who owns what)
| Area | Routes |
|---|---|
| Auth, onboarding, demo, account & security | `(auth)/*`, `/onboarding`, `/invite/[token]`, `/account`, root `_layout.tsx` |
| Dashboard, More, settings, branches, paywall, about, admin | `/(tabs)/index`, `/(tabs)/more`, `/settings`, `/branches`, `/paywall`, `/getting-started`, `/about`, `/admin` |
| Jobs & scheduling | `/(tabs)/jobs`, `/jobs/*`, `/schedule`, `/dispatch`, `/scheduling`, `/requests` |
| Customers, assets, leads, facilities | `/(tabs)/customers`, `/customers/*`, `/aircraft/*` (assets), `/leads`, `/facilities` |
| Services & training | `/(tabs)/services`, `/services/*`, `/training`, `/guides/*` |
| Quotes, invoices, portal | `/quotes/*`, `/invoices/*`, `/portal/[kind]/[token]`, `/portal/c/[slug]` |
| Recurring care, automations, messages | `/recurring/*`, `/automations/*`, `/messages/*`, `/texting`, `/reminders` |
| Finance & team | `/timesheets`, `/expenses`, `/reports` (Profit & loss), `/team/*`, `/integrations`, `/activity` |
| Supply room & equipment | `/inventory/*`, `/equipment/*`, `/scan` |
| Website | `(site)/welcome`, `(site)/pricing`, `(site)/privacy`, `(site)/terms`, `(site)/support` |

Old routes being replaced: `/pipeline` → `/leads`, `/locations` → `/facilities`, `/business` → `/settings`, `/notifications` → `/account`.

## Edge functions (`callFunction(name, body)`; all return JSON, `{ error }` on failure)
| Function | Body | Returns | Notes |
|---|---|---|---|
| `send-message` | `{ message_id }` | `{ status }` | Sends a `messages` row now (caller must be manager of its org). The worker sends anything still `queued`. |
| `send-document` | `{ kind: 'quote'\|'invoice', id }` | `{ sent }` | Existing; also logs to `messages`. |
| `send-invite` | `{ invitation_id }` | `{ sent }` | Emails the invite link `PORTAL_URL/invite/<token>` + code. |
| `portal` | `{ action: 'request_code', slug, email }` → `{ ok }`; `{ action: 'verify', slug, email, code }` → `{ token }`; `{ action: 'data', token }` → portal JSON; `{ action: 'request', token, kind, aircraft_id?, service_id?, job_id?, preferred: string[], notes? }` → `{ ok }`; `{ action: 'files', token, paths }` → `{ urls }` | | Public (no auth). |
| `quote-deposit-checkout` | `{ token }` | `{ url }` | Public. Stripe Checkout for the deposit. |
| `care-plan` | `{ action: 'start' \| 'cancel', schedule_id }` | `{ url? }` | Start returns a Checkout (subscription) link to send to the customer. |
| `export-data` | `{ org_id }` | `{ url }` | Owner only; ZIP of CSVs + PDFs list + photos. |
| `scan-receipt` | `{ org_id, path }` | `{ vendor, amount, date, category }` | Receipt photo already uploaded to storage. |
| `security-alert` | `{ device }` | `{ sent }` | Emails the signed-in user about a new device. |
| `texting` | `{ action: 'request_number', org_id }` | `{ status }` | Owner only. |
| `billing-checkout` | `{ action: 'catalog' }` → `{ plans: [{ plan, period, amount, currency }], packs: [{ id, kind, quantity, amount, currency }] }`; `{ org_id, kind: 'plan', plan, period }` / `{ org_id, kind: 'ai_pack' \| 'text_pack', pack }` → `{ url }` | | Web only (Stripe Checkout on the platform account). Owner only. 409 when the plan is billed by the App Store / Google Play or a web subscription already exists. Use `src/lib/billing.ts`. |
| `billing-portal` | `{ org_id }` | `{ url }` | Owner only. Stripe customer portal for a web subscription; returns to `/settings`. |
| `send-reorder` | `{ org_id, item_ids? }` | `{ emailed }` | Emails vendors the low-stock reorder list. |
| `send-report` | `{ org_id, to?, subject, body, attachments: [{ filename, content_base64, type }] }` | `{ sent }` | Accountant exports. |
| `admin-action` | `{ action: 'set_sms', org_id, status, number? }` / `{ action: 'set_integration', id, status }` / `{ action: 'support_handled', id }` | `{ ok }` | Platform admins only. |
| `automation-worker` | cron (`Authorization: Bearer CRON_SECRET`) | summary | Every 10 min: outbox pushes, recurring jobs/expenses, automations, sequences, late fees, review requests, follow-ups, alerts, demo cleanup. |
| Webhooks | `stripe-webhook`, `revenuecat-webhook`, `resend-webhook`, `telnyx-webhook` | | |

URLs: customer links use `PORTAL_URL` (`EXPO_PUBLIC_PORTAL_URL` in the app): `/portal/quote/<token>`, `/portal/invoice/<token>`, `/portal/c/<org.public_slug>`, `/invite/<token>`.

## Portal `data` response (contract between `portal` function and `/portal/c/[slug]`)
```ts
{
  org: { name: string; logo_url: string | null; phone: string | null; email: string | null; timezone: string; google_review_url: string | null; accepts_cards: boolean },
  customer: { id: string; name: string; email: string | null; phone: string | null; company: string | null },
  assets: { id: string; tail_number: string; asset_type: 'aircraft'|'vehicle'|'watercraft'; manufacturer: string | null; model: string | null; category: string }[],
  services: { id: string; name: string; asset_type: string }[],                // active services customers may request
  upcoming_jobs: { id: string; number: string; title: string | null; status: string; scheduled_start: string | null; scheduled_end: string | null; aircraft_id: string | null; tail_number: string | null; location_name: string | null }[],
  past_jobs: { id: string; number: string; title: string | null; actual_end: string | null; tail_number: string | null; rating: number | null; photos: { path: string; kind: string; caption: string | null }[] }[],
  quotes: { number: string; status: string; total: number; valid_until_at: string | null; token: string }[],   // non-draft
  invoices: { number: string; status: string; total: number; balance: number; due_date: string; token: string }[],  // non-draft
  requests: { id: string; kind: string; status: string; created_at: string; preferred: string[] }[]
}
```
`verify` returns `{ token, expires_at }` (30-day session). `request_code` always returns `{ ok: true }` (never reveals whether an email exists).

## Extra backend expectations from the app (binding)
- `portal` also supports `{ action: 'quote_photos', quote_token }` → `{ urls: string[] }` (signed 1 h; public, token-scoped; quote must be non-draft).
- Portal session errors (expired/revoked/invalid token) return HTTP 401 with `{ error: 'Session expired' }`. `files` returns `{ urls: Record<path, url> }`.
- Stripe return URLs: deposit → `${PORTAL_URL}/portal/quote/<token>?deposit=paid|cancelled`; invoice → `${PORTAL_URL}/portal/invoice/<token>?paid=1` (cancel without the param).
- Late fee invoice lines use the description `Late fee` (optionally `Late fee (x%)`).
- Automation settings: `invoice_reminders.settings.late_fee = { enabled, type: 'flat'|'percent', value, after_days }`.
- `get_public_document` org objects include `payment_mode` and `public_slug`.

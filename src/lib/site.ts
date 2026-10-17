// Copy and links for the public Flight Ready website (src/app/(site)).
import type { ComponentProps } from 'react';
import type Ionicons from '@expo/vector-icons/Ionicons';

type IconName = ComponentProps<typeof Ionicons>['name'];

/** Store listings. Replace the placeholders once the apps are live. */
export const APP_STORE_URL = process.env.EXPO_PUBLIC_APP_STORE_URL ?? 'https://apps.apple.com/app/flight-ready/id0000000000';
export const PLAY_STORE_URL = process.env.EXPO_PUBLIC_PLAY_STORE_URL ?? 'https://play.google.com/store/apps/details?id=com.flightready.app';

export const SITE_TAGLINE = 'The all-in-one CRM for aircraft, auto & marine detailers';
export const TRIAL_DAYS = 14;
export const AIRCRAFT_MODELS = 545;
export const BOAT_MODELS = 604;
export const GUIDE_COUNT = 26;

export const SIGN_UP_HREF = '/sign-up';
export const DEMO_HREF = '/sign-in?demo=1';

export const NAV_LINKS = [
  { label: 'Features', href: '/welcome#features' },
  { label: 'Pricing', href: '/pricing' },
  { label: 'Support', href: '/support' },
];

export const FOOTER_LINKS = [
  { label: 'Pricing', href: '/pricing' },
  { label: 'Support', href: '/support' },
  { label: 'Privacy', href: '/privacy' },
  { label: 'Terms', href: '/terms' },
];

export const WORKFLOW: { step: string; title: string; body: string; icon: IconName; points: string[] }[] = [
  {
    step: '01', title: 'Plan', icon: 'calendar-outline',
    body: 'Quote the job with your own prices or the built-in price guide, win approval with Good / Better / Best packages, and drop the work onto a crew calendar that warns you before anything collides.',
    points: ['Quotes customers approve and sign from their phone', 'Deposits collected the moment they say yes', 'Crew, hangar and equipment booked without conflicts'],
  },
  {
    step: '02', title: 'Document', icon: 'camera-outline',
    body: 'Every job carries its own proof: before and after photos, a condition report the customer signs, damage notes and a clean service report — so nothing becomes a debate later.',
    points: ['Before photos to start, after photos to finish', 'Condition & service sign-off, versioned', 'Step-by-step guides your crew can follow on the ramp'],
  },
  {
    step: '03', title: 'Get paid', icon: 'card-outline',
    body: 'Turn finished work into an invoice in a tap, let customers pay by card from a private link, and let automatic reminders do the chasing while you see true profit per job.',
    points: ['Card payments and pay links on every invoice', 'Reminder sequences that stop when they pay', 'Profit & loss that includes labor and supplies'],
  },
];

export const FEATURES: { id: string; title: string; body: string; icon: IconName; tone: 'blue' | 'gold' | 'green'; bullets: string[] }[] = [
  {
    id: 'schedule', title: 'Scheduling & dispatch', icon: 'calendar-number-outline', tone: 'blue',
    body: 'A live crew calendar built for ramp days and early departures.',
    bullets: ['Primary tech plus extra crew per job', 'Travel time, hangar and equipment reservations', 'Live conflict warnings and qualified-tech suggestions', 'Tentative jobs from accepted quotes, confirmed in one tap'],
  },
  {
    id: 'photos', title: 'Before/after photos & sign-off', icon: 'images-outline', tone: 'gold',
    body: 'Proof of the work, attached to the job forever.',
    bullets: ['Before photos required to start, after photos to finish', 'Condition report with customer signature', 'Damage documentation with photo and description', 'Service report PDF without prices'],
  },
  {
    id: 'quotes', title: 'Quotes with Good / Better / Best', icon: 'document-text-outline', tone: 'blue',
    body: 'Give customers a choice — and watch the average ticket climb.',
    bullets: ['Up to three packages per quote', 'Optional deposit paid by card on acceptance', 'Viewed tracking and automatic follow-ups', 'Approval deadlines and locked, versioned quotes'],
  },
  {
    id: 'invoices', title: 'Invoices & card payments', icon: 'card-outline', tone: 'green',
    body: 'From finished job to money in the bank, without the chase.',
    bullets: ['Card payments through Stripe from a private link', 'Reminder sequences with optional late fees', 'Record checks, ACH and cash too', 'Clear status: sent, viewed, paid, overdue'],
  },
  {
    id: 'portal', title: 'Customer portal & texting', icon: 'chatbubbles-outline', tone: 'blue',
    body: 'A polished, private space for every customer.',
    bullets: ['Customers view quotes, invoices, photos and history', 'Request service and preferred dates', 'Two-way texting with consent and quiet hours', 'On-our-way, reminders and review requests'],
  },
  {
    id: 'recurring', title: 'Recurring care plans', icon: 'repeat-outline', tone: 'gold',
    body: 'Turn one-time washes into predictable monthly revenue.',
    bullets: ['Weekly or monthly schedules with smart patterns', 'Pause, skip or end after a number of visits', 'Invoice per visit or auto-charged monthly plans', 'Heads-up messages with a reschedule link'],
  },
  {
    id: 'supply', title: 'Supply room & equipment', icon: 'cube-outline', tone: 'blue',
    body: 'Know what you have, what you used and what to reorder.',
    bullets: ['Supplies used per job feed true job cost', 'Low-stock alerts and vendor reorder emails', 'Barcode and QR scanning', 'Equipment maintenance reminders'],
  },
  {
    id: 'crew', title: 'Crew, timesheets & payroll exports', icon: 'people-outline', tone: 'green',
    body: 'Everyone clocks their own time; you approve it in seconds.',
    bullets: ['Roles and permission toggles (techs never see prices)', 'Timesheet approvals and pay periods', 'Certifications and badge expirations', 'Payroll and accountant exports'],
  },
  {
    id: 'pnl', title: 'Profit & loss', icon: 'stats-chart-outline', tone: 'gold',
    body: 'See the real margin on every job, every month.',
    bullets: ['Revenue, labor, supplies and expenses in one view', 'Job profitability (owner-only)', 'Expenses, mileage and receipt scanning', 'Win/loss reporting on quotes'],
  },
];

export const GUIDE_EXAMPLES = [
  'Dry Wash Level 1 (Trip Clean)',
  'Dry Wash Level 2 (Full Exterior)',
  'Exterior Wet Wash',
  'Interior Level 1 (Trip Clean)',
  'Interior Level 2 (Full Interior)',
  'Leather Shampoo & Conditioning',
];

export const BUSINESS_TYPES: { title: string; icon: IconName; body: string; examples: string[] }[] = [
  {
    title: 'Aircraft', icon: 'airplane-outline',
    body: 'Built first for aviation: tail numbers, makes and models, facilities and FBOs, hangar bookings and airport badges.',
    examples: [`${AIRCRAFT_MODELS} aircraft models in the price guide`, 'Pistons, turboprops, light to heavy jets', 'Facility and FBO access notes'],
  },
  {
    title: 'Vehicles', icon: 'car-sport-outline',
    body: 'Cars, trucks, SUVs and fleets with sizes that drive your pricing automatically.',
    examples: ['Size-based pricing', 'Mobile and shop work', 'Fleet accounts and recurring washes'],
  },
  {
    title: 'Watercraft', icon: 'boat-outline',
    body: 'Boats and yachts with lengths, marinas and slip details right on the asset.',
    examples: [`${BOAT_MODELS} boat models in the catalog`, 'Length-based pricing', 'Marina and slip notes'],
  },
];

export const SECURITY: { title: string; body: string; icon: IconName }[] = [
  { title: 'Company data isolation', body: 'Every company’s records are separated at the database level. Nobody outside your company can read your customers, jobs or prices.', icon: 'shield-checkmark-outline' },
  { title: 'Roles & permissions', body: 'Owner, admin, manager, technician and viewer — with toggles for prices, reports, discounts and deletions.', icon: 'key-outline' },
  { title: '2-step sign-in', body: 'Protect accounts with an authenticator app, require it company-wide, and get alerts when a new device signs in.', icon: 'lock-closed-outline' },
];

export const HOME_FAQ: { q: string; a: string }[] = [
  { q: 'Who is Flight Ready for?', a: 'Detailing companies that care for aircraft — and, if you choose, vehicles and watercraft too. Solo operators and multi-location crews use the same app; the plan simply grows with you.' },
  { q: 'Do I need a card to start the free trial?', a: `No. Create your company and use every feature free for ${TRIAL_DAYS} days. Choose a plan in the app when you are ready.` },
  { q: 'Are the service guides and price guide really included?', a: `Yes, on every plan. ${GUIDE_COUNT} step-by-step service guides and a price guide covering ${AIRCRAFT_MODELS} aircraft models are built in — no separate training program or pricing app to buy.` },
  { q: 'How do my customers pay?', a: 'Connect Stripe and customers pay invoices, deposits and care plans by card from a private link. Prefer checks or ACH? Record them in a tap.' },
  { q: 'Can I try it without setting anything up?', a: 'Yes. Open the demo for a fully loaded sample company. Nothing you do there sends real emails, texts or payments.' },
  { q: 'Can I take my data with me?', a: 'Always. The owner can export customers, assets, jobs, quotes, invoices and photos at any time.' },
];

export const PRICING_FAQ: { q: string; a: string }[] = [
  { q: 'How does billing work?', a: 'Subscriptions are purchased in the Flight Ready app and billed by Apple (App Store) or Google (Google Play). Your plan renews automatically each month or year until you cancel.' },
  { q: 'Can I cancel anytime?', a: 'Yes. Cancel from your App Store or Google Play subscription settings at least 24 hours before renewal. You keep access until the end of the paid period, and your data stays available to export.' },
  { q: 'What is the platform fee?', a: 'When your customers pay you by card through Flight Ready (invoices, deposits, care plans), a small platform fee applies: 1.5% on Solo, 1% on Team and 0.5% on Fleet. It is separate from Stripe’s own processing fee. Payments you record yourself — cash, check, ACH outside the app — carry no platform fee.' },
  { q: 'What happens after the free trial?', a: `Your ${TRIAL_DAYS}-day trial includes every feature. When it ends, pick a plan to keep adding records. Nothing is deleted, and you can still view and export your data.` },
  { q: 'Can I export my data?', a: 'Yes. Owners can download a full export (spreadsheets plus photos) at any time from Settings.' },
  { q: 'Can I change plans later?', a: 'Upgrade or downgrade anytime from the app. Changes are handled by the App Store or Google Play and take effect according to their rules.' },
  { q: 'What if I need more texts?', a: 'Extra text packs are available as in-app purchases whenever you need them.' },
];

export const SUPPORT_FAQ: { q: string; a: string }[] = [
  { q: 'How am I billed?', a: 'Through your Apple or Google account, monthly or yearly. Receipts come from Apple or Google, and you manage the subscription in their settings.' },
  { q: 'How do I cancel?', a: 'iPhone/iPad: Settings → your name → Subscriptions → Flight Ready. Android: Google Play → Profile → Payments & subscriptions → Subscriptions. Cancel at least 24 hours before renewal.' },
  { q: 'How do I export my data?', a: 'Owners: open Settings → Export data. You will receive a download with spreadsheets of your records and your job photos.' },
  { q: 'How does customer texting work?', a: 'Turn on texting in the app to get a business number. Texts go only to customers who have agreed to receive them; anyone can reply STOP to opt out. Messages are held during quiet hours (8 AM–8 PM in the customer’s time).' },
  { q: 'Can I explore before signing up?', a: 'Yes. Tap “Explore demo” on the sign-in screen. The demo company is temporary and never sends real messages or payments.' },
  { q: 'How do I delete my account?', a: 'Open Account in the app and choose Delete account. If you own a company, export your data first — deleting the owner account also removes the company’s records.' },
];

export const GETTING_STARTED: { title: string; body: string; icon: IconName }[] = [
  { title: 'Create your company & choose business types', body: 'Sign up, name your company and pick Aircraft only, Aircraft + Vehicles, or Aircraft + Vehicles + Watercraft. You can add categories later.', icon: 'business-outline' },
  { title: 'Set your services & prices', body: `Start from the built-in services — each comes with a step-by-step guide — and set prices yourself or from the price guide (${AIRCRAFT_MODELS} aircraft models).`, icon: 'pricetags-outline' },
  { title: 'Add customers & assets', body: 'Add customers and their aircraft, vehicles or boats. Tail numbers, sizes and facility notes make every quote and job faster.', icon: 'person-add-outline' },
  { title: 'Invite your crew', body: 'Send email invitations and choose each person’s role. Technicians see their assigned work — never your prices.', icon: 'people-outline' },
  { title: 'Connect payments', body: 'Connect Stripe to accept cards on invoices, deposits and care plans — or arrange payment directly and record it in the app.', icon: 'card-outline' },
  { title: 'Schedule & complete your first job', body: 'Put a job on the calendar, take before photos to start, follow the service guide, and take after photos to finish.', icon: 'camera-outline' },
  { title: 'Send the invoice & turn on automations', body: 'Invoice in one tap, then switch on reminders, follow-ups and review requests so the app keeps working while you do.', icon: 'flash-outline' },
];

export const TROUBLESHOOTING: { title: string; body: string; icon: IconName }[] = [
  { title: 'Keep support messages safe', body: 'Never send passwords, verification codes, card numbers or customer records in a support message. We will never ask for them.', icon: 'shield-outline' },
  { title: 'Didn’t get the verification email?', body: 'Check spam and promotions, make sure the address is spelled correctly, then request a new email from the sign-in screen. Links expire, so use the newest one.', icon: 'mail-unread-outline' },
  { title: 'Card payments not working yet?', body: 'Open Settings → Payments and finish Stripe onboarding. Stripe may ask for business and bank details before payouts begin.', icon: 'card-outline' },
  { title: 'Photos won’t upload?', body: 'Photos must be JPG, PNG or WebP under 10 MB. On a weak signal, keep the app open until uploads finish.', icon: 'cloud-upload-outline' },
];

export const SUPPORT_TOPICS = ['Getting started', 'Billing & plans', 'Payments', 'Texting', 'Account & data', 'Report a problem', 'Other'];

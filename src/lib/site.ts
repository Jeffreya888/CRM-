// Copy and links for the public Tarmo website (src/app/(site)).
import type { ComponentProps } from 'react';
import type Ionicons from '@expo/vector-icons/Ionicons';
import { PLANS, TRIAL_AI_CHECKS, TRIAL_AI_QUESTIONS } from './plans';
import { APP_NAME } from './config';

type IconName = ComponentProps<typeof Ionicons>['name'];

/** Store listings. Replace the placeholders once the apps are live. */
export const APP_STORE_URL = process.env.EXPO_PUBLIC_APP_STORE_URL ?? 'https://apps.apple.com/app/tarmo/id0000000000';
export const PLAY_STORE_URL = process.env.EXPO_PUBLIC_PLAY_STORE_URL ?? 'https://play.google.com/store/apps/details?id=com.flightready.app';

export const SITE_TAGLINE = 'The operating system for professional detailing — aviation, marine and automotive';
/** Short form for tight spaces (pills, footers). */
export const SITE_TAGLINE_SHORT = 'The operating system for professional detailing';
export const TRIAL_DAYS = 14;
export const AIRCRAFT_MODELS = 545;
export const BOAT_MODELS = 604;
export const GUIDE_COUNT = 51;

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
    body: 'Type a tail number and the FAA registry fills in the aircraft. Quote with your own prices or the built-in price guide, adjusted for condition, win approval with Good / Better / Best packages, and drop the work onto a crew calendar that warns you before anything collides.',
    points: ['Quotes customers approve and sign from their phone', 'Deposits collected the moment they say yes', 'Crew, hangar and equipment booked without conflicts'],
  },
  {
    step: '02', title: 'Document', icon: 'camera-outline',
    body: 'Every job carries its own proof: before and after photos, a condition report the customer signs, damage notes and a clean service report — so nothing becomes a debate later.',
    points: ['AI condition report from a few photos', 'Before/after photos and customer sign-off, versioned', 'SOPs, certified technicians and a quality check before handover'],
  },
  {
    step: '03', title: 'Get paid', icon: 'card-outline',
    body: 'Turn finished work into an invoice in a tap, let customers pay by card from a private link, and let automatic reminders do the chasing — while you see the true profit of every job, labor and overhead included.',
    points: ['Card payments and pay links on every invoice', 'Reminder sequences that stop when they pay', 'True job cost: estimate vs actual, profit by aircraft class and model'],
  },
];

export const FEATURES: { id: string; title: string; body: string; icon: IconName; tone: 'blue' | 'gold' | 'green'; bullets: string[] }[] = [
  {
    id: 'faa', title: 'FAA tail-number autofill', icon: 'airplane-outline', tone: 'blue',
    body: 'Type the N-number. The aircraft fills itself in.',
    bullets: ['Make, model, year and serial from the FAA registry', 'Size class, length and wingspan for accurate pricing', 'Registered owner and location at a glance', 'Warnings for expired or deregistered aircraft'],
  },
  {
    id: 'ai', title: 'AI photo condition reports', icon: 'sparkles-outline', tone: 'gold',
    body: 'A few photos in, a condition report and quote out.',
    bullets: ['Condition, score and findings from up to six photos', 'Suggested services turned into a quote in one tap', 'Customers request quotes from photos in their portal', 'Condition-based pricing for moderate, heavy and severe'],
  },
  {
    id: 'ask', title: `Ask ${APP_NAME} AI assistant`, icon: 'chatbubbles-outline', tone: 'blue',
    body: 'Your crew asks; it answers from your SOPs and the aircraft\u2019s own documents.',
    bullets: [
      'Plain, step-by-step answers with sources for every one',
      'Uses each aircraft\u2019s manual chapters and approved-product lists first',
      'Stop-and-report prompts for damage, injuries and aircraft systems',
      `Questions each month: ${PLANS.map((p) => `${p.aiQuestions.toLocaleString('en-US')} on ${p.name}`).join(', ')}`,
    ],
  },
  {
    id: 'sops', title: 'SOPs, certification & quality checks', icon: 'ribbon-outline', tone: 'green',
    body: 'Every technician, every step, the same standard.',
    bullets: ['Standard operating procedures with time and products per step', 'Technician certification per SOP, with sign-off requests', 'Scheduling warns before booking an uncertified tech', 'Quality check sign-off before a job is completed'],
  },
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
    bullets: ['Roles and permission toggles (techs never see prices)', 'Timesheet approvals and pay periods', 'Badge expirations and airport credentials', 'Profit & loss, payroll and accountant exports'],
  },
  {
    id: 'costing', title: 'True job costing & profit', icon: 'stats-chart-outline', tone: 'gold',
    body: 'Know what every job really cost — and what it really earned.',
    bullets: ['Estimate vs actual hours and cost on every job', 'True labor cost with payroll taxes and overhead', 'Profit by aircraft class, model and boat size', 'Margin check on quotes before you send them'],
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

/** The four capabilities that set Tarmo apart (homepage spotlight). */
export const EDGE: { title: string; body: string; icon: IconName; tone: 'blue' | 'gold' | 'green'; sample: { label: string; value: string }[] }[] = [
  {
    title: 'FAA tail-number autofill', icon: 'airplane-outline', tone: 'blue',
    body: 'Type N550GV and the registry fills in the make, model, year, serial and size — ready to price.',
    sample: [{ label: 'FAA', value: '2008 Gulfstream G550' }, { label: 'S/N', value: '5190' }, { label: 'Class', value: 'Large cabin jet' }],
  },
  {
    title: 'AI photo condition reports', icon: 'sparkles-outline', tone: 'gold',
    body: 'Snap a few photos for a condition report and suggested services. Customers can even request a quote from photos.',
    sample: [{ label: 'Condition', value: 'Heavy' }, { label: 'Score', value: '5 / 10' }, { label: 'Pricing', value: '+35%' }],
  },
  {
    title: 'SOPs, certification & quality checks', icon: 'ribbon-outline', tone: 'green',
    body: 'Standard operating procedures with time per step, certified technicians, and a quality check before handover.',
    sample: [{ label: 'Steps', value: '3h 10m (est. 2h 45m)' }, { label: 'Tech', value: 'Certified' }, { label: 'QC', value: 'Passed' }],
  },
  {
    title: 'True job costing', icon: 'stats-chart-outline', tone: 'blue',
    body: 'Estimate vs actual on every job, true labor cost with overhead, and profit by aircraft class, model and boat size.',
    sample: [{ label: 'Hours', value: 'est 6.0 · actual 7.2' }, { label: 'True cost', value: '$492' }, { label: 'Margin', value: '69%' }],
  },
];

export const BUSINESS_TYPES: { title: string; icon: IconName; body: string; examples: string[] }[] = [
  {
    title: 'Aircraft', icon: 'airplane-outline',
    body: 'Built first for aviation: FAA tail-number autofill, makes and models, facilities and FBOs, hangar bookings and airport badges.',
    examples: ['FAA registry lookup by tail number', `${AIRCRAFT_MODELS} aircraft models in the price guide`, 'Pistons, turboprops, light to heavy jets', 'Facility and FBO access notes'],
  },
  {
    title: 'Vehicles', icon: 'car-sport-outline',
    body: 'Cars, trucks, SUVs and fleets with sizes that drive your pricing automatically.',
    examples: ['Size-based and condition-based pricing', 'Mobile and shop work', 'Fleet accounts and recurring washes'],
  },
  {
    title: 'Watercraft', icon: 'boat-outline',
    body: 'Boats and yachts with lengths, marinas and slip details right on the asset.',
    examples: [`${BOAT_MODELS} boat models in the catalog`, 'Length, beam and square-foot pricing', 'Profit by boat size'],
  },
];

export const SECURITY: { title: string; body: string; icon: IconName }[] = [
  { title: 'Company data isolation', body: 'Every company’s records are separated at the database level. Nobody outside your company can read your customers, jobs or prices.', icon: 'shield-checkmark-outline' },
  { title: 'Roles & permissions', body: 'Owner, admin, manager, technician and viewer — with toggles for prices, reports, discounts and deletions.', icon: 'key-outline' },
  { title: '2-step sign-in', body: 'Protect accounts with an authenticator app, require it company-wide, and get alerts when a new device signs in.', icon: 'lock-closed-outline' },
];

export const HOME_FAQ: { q: string; a: string }[] = [
  { q: 'Who is Tarmo for?', a: 'Professional detailing companies — aviation first, plus marine and automotive if you choose. Solo operators and multi-location crews use the same app; the plan simply grows with you.' },
  { q: 'Do I need a card to start the free trial?', a: `No. Create your company and use every feature free for ${TRIAL_DAYS} days. Choose a plan on the web or in the app when you are ready.` },
  { q: 'Are the SOPs and price guide really included?', a: `Yes, on every plan. ${GUIDE_COUNT} step-by-step SOPs (standard operating procedures) and a price guide covering ${AIRCRAFT_MODELS} aircraft models are built in — no separate training program or pricing app to buy. On Team and Fleet you can also certify technicians per SOP and require a quality check before jobs are completed.` },
  { q: 'How does the tail-number lookup work?', a: 'Type a US tail number (N-number) on a new aircraft. Tarmo looks it up in the FAA aircraft registry, refreshed weekly, and offers the make, model, year, serial number and size in one tap. You always confirm before anything is saved.' },
  { q: 'How accurate are the AI photo condition reports?', a: 'They are a fast first look: add up to six photos and get a condition level, findings and suggested services, ready to turn into a quote. Every report is labelled as an estimate, and a person always confirms on site before anything changes.' },
  { q: 'What does “true job costing” include?', a: 'Each job compares estimated and actual hours, then adds up the real cost: wages plus payroll taxes and insurance, overhead per labor hour, supplies used and job expenses. Reports show profit and margin by aircraft class, model and boat size, so you can see which work pays best.' },
  { q: 'How do my customers pay?', a: 'Connect Stripe and customers pay invoices, deposits and care plans by card from a private link. Prefer checks or ACH? Record them in a tap.' },
  { q: 'Can I try it without setting anything up?', a: 'Yes. Open the demo for a fully loaded sample company. Nothing you do there sends real emails, texts or payments.' },
  { q: 'Can I take my data with me?', a: 'Always. The owner can export customers, assets, jobs, quotes, invoices and photos at any time.' },
];

export const PRICING_FAQ: { q: string; a: string }[] = [
  { q: 'How does billing work?', a: `Subscribe on the web or in the app. On the web you pay by card (billed securely by Stripe); in the iPhone or Android app the subscription is billed by Apple (App Store) or Google (Google Play). Your plan renews automatically each month or year until you cancel.` },
  { q: 'Can I cancel anytime?', a: 'Yes. If you subscribed on the web, cancel anytime from Settings → Manage billing. If you subscribed in the app, cancel from your App Store or Google Play subscription settings at least 24 hours before renewal. You keep access until the end of the paid period, and your data stays available to export.' },
  { q: 'What is the platform fee?', a: 'When your customers pay you by card through Tarmo (invoices, deposits, care plans), a small platform fee applies: 1.5% on Solo, 1% on Team and 0.5% on Fleet. It is separate from Stripe’s own processing fee. Payments you record yourself — cash, check, ACH outside the app — carry no platform fee.' },
  { q: 'What happens after the free trial?', a: `Your ${TRIAL_DAYS}-day trial includes every feature. When it ends, pick a plan to keep adding records. Nothing is deleted, and you can still view and export your data.` },
  { q: 'Can I export my data?', a: 'Yes. Owners can download a full export (spreadsheets plus photos) at any time from Settings.' },
  { q: 'Can I change plans later?', a: 'Yes, upgrade or downgrade anytime. Web subscriptions change in Settings → Manage billing; app subscriptions are changed through the App Store or Google Play and take effect according to their rules.' },
  { q: 'What if I need more texts?', a: 'Extra text packs are available as in-app purchases whenever you need them.' },
  { q: `What is Ask ${APP_NAME}?`, a: `An AI assistant for your crew. Technicians ask how to do a step, what's safe on a surface or what to do when something looks wrong, and get a short, step-by-step answer that cites your SOPs and the documents you uploaded for that aircraft. Every plan includes questions each month: ${PLANS.map((p) => `${p.aiQuestions.toLocaleString('en-US')} on ${p.name}`).join(', ').replace(/, ([^,]*)$/, ' and $1')} (the free trial includes ${TRIAL_AI_QUESTIONS}). Questions with photos use an AI check, and each extra AI check you buy also adds 10 questions. Owners and managers can review every conversation.` },
  { q: 'What are AI checks?', a: `Each AI check turns up to six photos into a condition report with suggested services. Every plan includes AI checks each month: ${PLANS.map((p) => `${p.aiChecks} on ${p.name}`).join(', ').replace(/, ([^,]*)$/, ' and $1')} (the free trial includes ${TRIAL_AI_CHECKS}). Need more? Buy extra AI check packs on the web or in the app. Unused monthly checks don’t roll over, but extra checks you buy never expire.` },
];

export const SUPPORT_FAQ: { q: string; a: string }[] = [
  { q: 'How am I billed?', a: 'Monthly or yearly. On the web you pay by card and get receipts by email from our payment processor (Stripe); in the app you are billed through your Apple or Google account and manage the subscription in their settings.' },
  { q: 'How do I cancel?', a: `Web: Settings → Manage billing → Cancel. iPhone/iPad: Settings → your name → Subscriptions → ${APP_NAME}. Android: Google Play → Profile → Payments & subscriptions → Subscriptions. In the stores, cancel at least 24 hours before renewal.` },
  { q: 'How do I export my data?', a: 'Owners: open More → Account & security → Export my company data. You will receive a download with spreadsheets of your records and your job photos.' },
  { q: 'How does customer texting work?', a: 'Turn on texting in the app to get a business number. Texts go only to customers who have agreed to receive them; anyone can reply STOP to opt out. Messages are held during quiet hours (8 AM–8 PM in the customer’s time).' },
  { q: 'Can I explore before signing up?', a: 'Yes. Tap “Explore demo” on the sign-in screen. The demo company is temporary and never sends real messages or payments.' },
  { q: 'How do I delete my account?', a: 'Open Account in the app and choose Delete account. If you own a company, export your data first — deleting the owner account also removes the company’s records.' },
];

export const GETTING_STARTED: { title: string; body: string; icon: IconName }[] = [
  { title: 'Create your company & choose business types', body: 'Sign up, name your company and pick Aircraft only, Aircraft + Vehicles, or Aircraft + Vehicles + Watercraft. You can add categories later.', icon: 'business-outline' },
  { title: 'Set your services & prices', body: `Start from the built-in services — each comes with a step-by-step SOP — and set prices yourself or from the price guide (${AIRCRAFT_MODELS} aircraft models).`, icon: 'pricetags-outline' },
  { title: 'Add customers & assets', body: 'Add customers and their aircraft, vehicles or boats. Type a US tail number and the FAA registry fills in the details; sizes and facility notes make every quote and job faster.', icon: 'person-add-outline' },
  { title: 'Invite your crew', body: 'Send email invitations and choose each person’s role. Technicians see their assigned work — never your prices.', icon: 'people-outline' },
  { title: 'Connect payments', body: 'Connect Stripe to accept cards on invoices, deposits and care plans — or arrange payment directly and record it in the app.', icon: 'card-outline' },
  { title: 'Schedule & complete your first job', body: 'Put a job on the calendar, take before photos to start, follow the SOP, and take after photos to finish.', icon: 'camera-outline' },
  { title: 'Send the invoice & turn on automations', body: 'Invoice in one tap, then switch on reminders, follow-ups and review requests so the app keeps working while you do.', icon: 'flash-outline' },
];

export const TROUBLESHOOTING: { title: string; body: string; icon: IconName }[] = [
  { title: 'Keep support messages safe', body: 'Never send passwords, verification codes, card numbers or customer records in a support message. We will never ask for them.', icon: 'shield-outline' },
  { title: 'Didn’t get the verification email?', body: 'Check spam and promotions, make sure the address is spelled correctly, then request a new email from the sign-in screen. Links expire, so use the newest one.', icon: 'mail-unread-outline' },
  { title: 'Card payments not working yet?', body: 'Open Settings → Payments and finish Stripe onboarding. Stripe may ask for business and bank details before payouts begin.', icon: 'card-outline' },
  { title: 'Photos won’t upload?', body: 'Photos must be JPG, PNG or WebP under 10 MB. On a weak signal, keep the app open until uploads finish.', icon: 'cloud-upload-outline' },
];

export const SUPPORT_TOPICS = ['Getting started', 'Billing & plans', 'Payments', 'Texting', 'Account & data', 'Report a problem', 'Other'];

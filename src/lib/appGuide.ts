import type { IconName } from '../components/ui';

/** One entry per main screen: a first-visit tip, plus a longer explanation for the Getting started guide. */
export type GuideEntry = { path: string; title: string; icon: IconName; tip: string; body: string };

export const APP_GUIDE: GuideEntry[] = [
  {
    path: '/', title: 'Dashboard', icon: 'grid-outline',
    tip: 'Your day at a glance: today’s jobs and what needs your attention. Follow the Getting started card to set up in about 10 minutes.',
    body: 'The dashboard shows today’s jobs and the items that need your attention. The Getting started card walks you through setup and checks each step off on its own.',
  },
  {
    path: '/customers', title: 'Customers & assets', icon: 'people-outline',
    tip: 'Add a customer, then the aircraft, boat or vehicle you care for. For aircraft, type the tail number and Tarmo fills in the make and model from FAA data.',
    body: 'Every quote, job and invoice belongs to a customer. Add their aircraft, boats or vehicles under them; for US aircraft, the tail number fills in the make and model from FAA registry data. Each asset keeps its own service history and photos.',
  },
  {
    path: '/services', title: 'Services & SOPs', icon: 'sparkles-outline',
    tip: 'Your service menu and prices. Review them once: they fill in your quotes automatically. Each service links to its step-by-step SOP.',
    body: 'Your service menu comes pre-filled for the business types you chose. Set your own prices (flat, hourly or by size), and they flow into every quote. Each service has an SOP (standard operating procedure) your crew follows on the job.',
  },
  {
    path: '/quotes', title: 'Quotes', icon: 'document-text-outline',
    tip: 'Pick a customer and services, and Tarmo prices the quote for you. Send it by email or text; the customer approves it online and can pay a deposit.',
    body: 'Build a quote from your services and Tarmo prices it by the asset’s size. Send it as a link: the customer approves online, picks dates and can pay a deposit. Customers can also send you photos from your portal and get an AI condition report with the request.',
  },
  {
    path: '/jobs', title: 'Jobs', icon: 'briefcase-outline',
    tip: 'An approved quote becomes a job. On the job, follow the checklist, take before and after photos, and mark it complete to invoice it.',
    body: 'Jobs come from approved quotes or can be created directly. Open a job to follow its checklist, take before and after photos, run an AI condition check and mark it complete. A completed job turns into an invoice in one tap.',
  },
  {
    path: '/schedule', title: 'Schedule', icon: 'calendar-outline',
    tip: 'Every job on a weekly calendar, so you can plan your days and spot open time.',
    body: 'The schedule shows all jobs by week. Use it to plan your days, spot open time and move jobs when plans change.',
  },
  {
    path: '/invoices', title: 'Invoices & payments', icon: 'receipt-outline',
    tip: 'Send an invoice with a pay link. Connect Stripe or Square in Settings so customers can pay by card, or record cash and checks yourself.',
    body: 'Invoices include the job’s photos and a completion report. Send a pay link by email or text, take Tap to Pay with Square, or record cash, check and ACH payments yourself. Card payments go straight to your bank.',
  },
  {
    path: '/training', title: 'Training & SOPs', icon: 'school-outline',
    tip: 'Step-by-step SOPs for every service, plus your own. Add photos and videos to train your crew the way you work.',
    body: 'The Training center has SOPs for aircraft, marine and auto detailing, with safety notes. Add your own SOPs, photos and videos so new technicians learn your standards.',
  },
  {
    path: '/assistant', title: 'Ask Tarmo', icon: 'sparkles-outline',
    tip: 'Ask anything about your SOPs or a customer’s aircraft documents. Answers come from your own material.',
    body: 'The AI assistant answers questions from your SOPs and the documents you upload, such as an aircraft’s maintenance manual, so your crew gets the right answer on the ramp.',
  },
  {
    path: '/more', title: 'More', icon: 'menu-outline',
    tip: 'Settings, your team, training and plans. You start with the core tools; tap “Show all tools” at the bottom for inventory, automations, care plans and reports.',
    body: 'More holds your company settings, team, training and plan. One-person businesses start with the core tools; “Show all tools” turns on inventory, automations, care plans, reports and the rest. You can switch back any time.',
  },
];

export const guideFor = (path: string) => APP_GUIDE.find((g) => g.path === path) ?? null;

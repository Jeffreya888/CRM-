// Message templates for automations. Pure TS (no React Native imports) so the
// same renderer runs in the app (live preview) and in Edge Functions
// (supabase/functions/_shared/templates.ts is a copy — keep them identical).

export const TEMPLATE_FIELDS: { key: string; label: string; sample: string }[] = [
  { key: 'customer', label: 'Customer name', sample: 'Jordan' },
  { key: 'company', label: 'Your company', sample: 'Skyline Aircraft Detailing' },
  { key: 'asset', label: 'Aircraft / asset', sample: 'N650JB (Gulfstream G650ER)' },
  { key: 'tail', label: 'Tail number', sample: 'N650JB' },
  { key: 'service', label: 'Service', sample: 'Exterior Wash' },
  { key: 'date', label: 'Date', sample: 'Tue, Nov 4' },
  { key: 'time', label: 'Time', sample: '9:00 AM' },
  { key: 'location_line', label: 'Location (with " at ")', sample: ' at KTEB · Signature' },
  { key: 'eta_line', label: 'Arrival time (On our way)', sample: ' We should arrive in about 20 minutes.' },
  { key: 'shop_line', label: 'Shop address & hours (pickup)', sample: ' Pick up at 1 Hangar Rd, Austin TX (Mon–Sat 8–6).' },
  { key: 'balance_line', label: 'Balance due (pickup)', sample: ' Balance due: $450.00.' },
  { key: 'amount', label: 'Amount', sample: '$1,250.00' },
  { key: 'balance', label: 'Balance due', sample: '$1,250.00' },
  { key: 'total', label: 'Total', sample: '$2,498.00' },
  { key: 'invoice_number', label: 'Invoice number', sample: 'INV-1042' },
  { key: 'quote_number', label: 'Quote number', sample: 'Q-1018' },
  { key: 'due_phrase', label: 'Due phrase', sample: 'due in 3 days' },
  { key: 'deadline', label: 'Quote deadline', sample: 'Nov 12, 5:00 PM' },
  { key: 'late_fee_line', label: 'Late fee warning', sample: ' A $25.00 late fee applies after Dec 1.' },
  { key: 'pay_link', label: 'Pay link', sample: 'https://app.flightready.example/portal/invoice/…' },
  { key: 'quote_link', label: 'Quote link', sample: 'https://app.flightready.example/portal/quote/…' },
  { key: 'portal_link', label: 'Customer portal link', sample: 'https://app.flightready.example/portal/c/…' },
  { key: 'review_link', label: 'Google review link', sample: 'https://g.page/r/…' },
];

export const SAMPLE_VALUES: Record<string, string> = Object.fromEntries(TEMPLATE_FIELDS.map((f) => [f.key, f.sample]));

/** Replaces {field} placeholders; unknown fields render as empty text. */
export function renderTemplate(template: string | null | undefined, values: Record<string, string | number | null | undefined>): string {
  return (template ?? '')
    .replace(/\\n/g, '\n')
    .replace(/\{(\w+)\}/g, (_, k: string) => {
      const v = values[k];
      return v == null ? '' : String(v);
    });
}

/** "due in 3 days" / "due today" / "3 days overdue". */
export function duePhrase(dueDate: string, today = new Date()): string {
  const due = new Date(dueDate + 'T00:00:00');
  const t = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const days = Math.round((due.getTime() - t.getTime()) / 864e5);
  if (days > 1) return `due in ${days} days`;
  if (days === 1) return 'due tomorrow';
  if (days === 0) return 'due today';
  return `${-days} day${days === -1 ? '' : 's'} overdue`;
}

/** Whether a text may be sent now under the company's quiet hours (local hour). */
export function withinQuietHours(localHour: number, start: number, end: number): boolean {
  return localHour >= start && localHour < end;
}

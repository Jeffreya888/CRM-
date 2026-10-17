import type { IconName } from '../ui';
import type { AutomationKey } from '../../lib/types';

export const AUTOMATION_ORDER: AutomationKey[] = [
  'job_reminder', 'on_our_way', 'job_complete', 'invoice_reminders', 'review_request', 'quote_follow_up', 'recurring_heads_up', 'care_plan_charge',
];

export const AUTOMATION_META: Record<AutomationKey, { title: string; icon: IconName; description: string }> = {
  job_reminder: { title: 'Job reminder', icon: 'alarm-outline', description: 'Reminds the customer before a scheduled visit.' },
  on_our_way: { title: 'On our way', icon: 'car-outline', description: 'Sent when a technician taps "On our way" on a job. It is never sent automatically.' },
  job_complete: { title: 'Job complete + photos', icon: 'checkmark-circle-outline', description: 'Tells the customer the work is done, with before and after photos in their portal.' },
  invoice_reminders: { title: 'Invoice reminders', icon: 'receipt-outline', description: 'A sequence of reminders around the due date, each with a pay link. Stops as soon as the invoice is paid.' },
  review_request: { title: 'Review request', icon: 'star-outline', description: 'Asks happy customers for a Google review after they pay.' },
  quote_follow_up: { title: 'Quote follow-ups', icon: 'document-text-outline', description: 'Nudges customers who have not answered a quote, and again before it expires.' },
  recurring_heads_up: { title: 'Recurring visit heads-up', icon: 'repeat-outline', description: 'Lets the customer know a recurring visit is coming up, with a link to ask for another time.' },
  care_plan_charge: { title: 'Care plan receipts', icon: 'card-outline', description: 'Sends a receipt after each monthly care plan charge.' },
};

export const CHANNEL_OPTIONS = [
  { value: 'email' as const, label: 'Email' },
  { value: 'sms' as const, label: 'Text' },
  { value: 'both' as const, label: 'Both' },
];

/** "3 days before due" / "on the due date" / "7 days after". */
export function sequenceLabel(d: number): string {
  if (d === 0) return 'Due date';
  return d < 0 ? `${-d}d before` : `+${d}d`;
}

export function hourLabel(h: number): string {
  const hh = ((h % 24) + 24) % 24;
  if (h === 24) return 'Midnight';
  return `${hh % 12 === 0 ? 12 : hh % 12} ${hh < 12 ? 'AM' : 'PM'}`;
}

import type { IconName } from '../ui';
import type { AutomationKey } from '../../lib/types';

export const AUTOMATION_ORDER: AutomationKey[] = [
  'job_reminder', 'on_our_way', 'ready_for_pickup', 'job_complete', 'invoice_reminders', 'review_request', 'quote_follow_up', 'recurring_heads_up', 'care_plan_charge', 'quote_win_back', 'customer_win_back', 'service_due', 'job_rebook',
];

export const AUTOMATION_META: Record<AutomationKey, { title: string; icon: IconName; description: string }> = {
  job_reminder: { title: 'Job reminder', icon: 'alarm-outline', description: 'Reminds the customer before a scheduled visit.' },
  on_our_way: { title: 'On our way', icon: 'car-outline', description: 'Sent when a technician taps "On our way" on a mobile job, with the arrival time they pick. Never sent automatically. Use {eta_line} for the arrival time.' },
  ready_for_pickup: { title: 'Ready for pickup', icon: 'storefront-outline', description: 'Sent when the team taps "Ready for pickup" on a finished shop job. Use {shop_line} for your address and hours and {balance_line} for the amount due.' },
  job_complete: { title: 'Job complete + photos', icon: 'checkmark-circle-outline', description: 'Tells the customer the work is done, with before and after photos in their portal.' },
  invoice_reminders: { title: 'Invoice reminders', icon: 'receipt-outline', description: 'A sequence of reminders around the due date, each with a pay link. Stops as soon as the invoice is paid.' },
  review_request: { title: 'Review request', icon: 'star-outline', description: 'Asks happy customers for a Google review after they pay.' },
  quote_follow_up: { title: 'Quote follow-ups', icon: 'document-text-outline', description: 'Nudges customers who have not answered a quote, and again before it expires.' },
  recurring_heads_up: { title: 'Recurring visit heads-up', icon: 'repeat-outline', description: 'Lets the customer know a recurring visit is coming up, with a link to ask for another time.' },
  care_plan_charge: { title: 'Care plan receipts', icon: 'card-outline', description: 'Sends a receipt after each monthly care plan charge.' },
  quote_win_back: { title: 'Win back lost quotes', icon: 'refresh-circle-outline', description: 'One friendly message after a quote expires or is declined, inviting the customer to get an updated quote.' },
  customer_win_back: { title: 'Win back quiet customers', icon: 'person-add-outline', description: 'Reaches customers who have not booked in a while, with a link to pick a time.' },
  service_due: { title: 'Service due', icon: 'calendar-number-outline', description: 'Tells the customer when a recurring service (coating maintenance, brightwork, washes) is due, with a link to book.' },
  job_rebook: { title: 'Rebook canceled jobs', icon: 'calendar-outline', description: 'A few days after a job is canceled, invites the customer to pick a new date.' },
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

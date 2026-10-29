import type { Tone } from '../../lib/theme';
import type { Message } from '../../lib/types';

export const MESSAGE_STATUS: Record<Message['status'], { label: string; tone: Tone }> = {
  queued: { label: 'Queued', tone: 'neutral' },
  sent: { label: 'Sent', tone: 'info' },
  delivered: { label: 'Delivered', tone: 'success' },
  opened: { label: 'Opened', tone: 'success' },
  bounced: { label: 'Bounced', tone: 'danger' },
  failed: { label: 'Failed', tone: 'danger' },
  received: { label: 'Received', tone: 'purple' },
  blocked: { label: 'Blocked (demo)', tone: 'warning' },
};

export const AUTOMATION_LABEL: Record<string, string> = {
  job_reminder: 'Job reminder', on_our_way: 'On our way', ready_for_pickup: 'Ready for pickup', job_complete: 'Job complete', invoice_reminders: 'Invoice reminder',
  review_request: 'Review request', quote_follow_up: 'Quote follow-up', recurring_heads_up: 'Recurring heads-up', care_plan_charge: 'Care plan receipt',
};

export const canResend = (m: Pick<Message, 'status' | 'direction'>) => m.direction === 'out' && (m.status === 'failed' || m.status === 'bounced');

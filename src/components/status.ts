import type { Tone } from '../lib/theme';

export const jobTone: Record<string, Tone> = {
  scheduled: 'info', in_progress: 'warning', on_hold: 'neutral', completed: 'success', invoiced: 'primary', cancelled: 'danger',
};
export const quoteTone: Record<string, Tone> = {
  draft: 'neutral', sent: 'info', viewed: 'primary', accepted: 'success', declined: 'danger', expired: 'warning',
};
export const invoiceTone: Record<string, Tone> = {
  draft: 'neutral', sent: 'info', partial: 'warning', paid: 'success', overdue: 'danger', void: 'neutral',
};
export const priorityTone: Record<string, Tone> = { low: 'neutral', normal: 'info', high: 'warning', aog: 'danger' };
export const stageTone: Record<string, Tone> = {
  new: 'neutral', contacted: 'info', quoted: 'primary', negotiating: 'warning', won: 'success', lost: 'danger',
};

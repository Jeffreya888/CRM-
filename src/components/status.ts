import type { Tone } from '../lib/theme';

export const jobTone: Record<string, Tone> = {
  scheduled: 'info', in_progress: 'warning', on_hold: 'neutral', completed: 'success', invoiced: 'purple', cancelled: 'danger',
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
export const categoryTone: Record<string, Tone> = {
  exterior: 'info', interior: 'warning', engine: 'danger', package: 'purple', brightwork: 'info',
  coating: 'success', paint_correction: 'purple', specialty: 'neutral', other: 'neutral',
};
export const SERVICE_CATEGORIES = ['exterior', 'interior', 'engine', 'package', 'brightwork', 'coating', 'paint_correction', 'specialty', 'other'];

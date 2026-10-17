import type { Role } from '../../lib/types';

export const ROLE_INFO: { value: Exclude<Role, 'owner'> | 'owner'; label: string; hint: string }[] = [
  { value: 'owner', label: 'Owner', hint: 'Everything, including the subscription, ownership and deleting the company.' },
  { value: 'admin', label: 'Admin', hint: 'Everything except the subscription/plan, transferring ownership and deleting the company.' },
  { value: 'manager', label: 'Manager', hint: 'Customers, assets, services, jobs, scheduling, quotes, invoices and payments, approving timesheets. Not P&L, pay rates or team management (unless you turn it on below).' },
  { value: 'technician', label: 'Technician', hint: 'Assigned work, photos, checklists, own time and hours. No prices.' },
  { value: 'viewer', label: 'Viewer', hint: 'Read-only. Never sees money.' },
];
export const roleLabel = (r: string | null | undefined) => ROLE_INFO.find((x) => x.value === r)?.label ?? 'Member';
export const INVITE_ROLES = ROLE_INFO.filter((r) => r.value !== 'owner');

export const SKILLS = ['ceramic', 'interior', 'brightwork', 'paint correction', 'exterior', 'engine', 'leather', 'carpet', 'de-icing', 'wax & sealant', 'boat hull', 'teak'];

export const MEMBER_COLORS = ['#2563EB', '#16A34A', '#D97706', '#DC2626', '#7C3AED', '#0891B2', '#DB2777', '#4B5563'];

export const CERT_KINDS = [
  { value: 'badge', label: 'Airport / ramp badge' },
  { value: 'training', label: 'Safety training' },
  { value: 'coating_cert', label: 'Coating brand certification' },
  { value: 'registration', label: 'Registration / license' },
  { value: 'coi', label: 'Certificate of insurance' },
  { value: 'other', label: 'Other' },
];
export const certKindLabel = (k: string) => CERT_KINDS.find((c) => c.value === k)?.label ?? 'Document';

export const PAY_TYPES = [
  { value: 'hourly', label: 'Hourly' }, { value: 'salary', label: 'Salary' }, { value: 'per_job', label: 'Per job' }, { value: 'contractor', label: 'Contractor (1099)' },
];

/** Days until a date (negative when past). */
export function daysUntil(d: string | null | undefined): number | null {
  if (!d) return null;
  const t = new Date(d + 'T00:00:00').getTime();
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return Math.round((t - today.getTime()) / 864e5);
}
export const EXPIRING_DAYS = 30;

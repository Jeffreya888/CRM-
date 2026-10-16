import type { Organization } from './types';
import type { IconName } from '../components/ui';

export const SOCIALS: { key: 'instagram' | 'facebook' | 'youtube' | 'linkedin'; label: string; icon: IconName; bg: string; fg: string; base: string; placeholder: string }[] = [
  { key: 'instagram', label: 'Instagram', icon: 'logo-instagram', bg: '#3A2350', fg: '#D17AF5', base: 'https://instagram.com/', placeholder: '@yourhandle' },
  { key: 'facebook', label: 'Facebook', icon: 'logo-facebook', bg: '#1E2F55', fg: '#5B8DEF', base: 'https://facebook.com/', placeholder: 'Page name or link' },
  { key: 'youtube', label: 'Youtube', icon: 'logo-youtube', bg: '#45222B', fg: '#F05A5A', base: 'https://youtube.com/@', placeholder: '@channel or link' },
  { key: 'linkedin', label: 'Linkedin', icon: 'logo-linkedin', bg: '#1C3350', fg: '#4A9EE0', base: 'https://linkedin.com/company/', placeholder: 'Company page or link' },
];

/** Accepts a full URL or a handle like "@flightready". */
export function socialUrl(base: string, value: string): string {
  const v = value.trim();
  if (/^https?:\/\//i.test(v)) return v;
  return base + v.replace(/^@/, '').replace(/\s+/g, '');
}

export function socialDisplay(value: string, org: Pick<Organization, 'name'>): string {
  const v = value.trim();
  if (v.startsWith('@')) return v;
  if (/^https?:\/\//i.test(v)) return org.name;
  return v;
}

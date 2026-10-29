import type { Organization } from './types';

export type PaymentProvider = 'stripe' | 'square';

/** True when the company's customers can pay online right now (mirrors public.org_accepts_cards). */
export function onlinePaymentsLive(org: Pick<Organization, 'payment_mode' | 'stripe_charges_enabled' | 'square_charges_enabled' | 'is_demo'>): boolean {
  if (org.is_demo) return false;
  if (org.payment_mode === 'stripe') return !!org.stripe_charges_enabled;
  if (org.payment_mode === 'square') return !!org.square_charges_enabled;
  return false;
}

export const PROVIDER_LABEL: Record<PaymentProvider, string> = { stripe: 'Stripe', square: 'Square' };

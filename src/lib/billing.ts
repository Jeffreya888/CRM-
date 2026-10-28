// Web subscriptions through Stripe Billing (website only). The iPhone/Android
// apps use in-app purchase (src/lib/purchases.ts) and never link here.
import { Platform } from 'react-native';
import type { Organization, Plan } from './types';
import { callFunction } from './supabase';

export type BillingPeriod = 'monthly' | 'annual';
export type PaidPlan = Exclude<Plan, 'trial' | 'expired'>;
export type WebPackKind = 'ai_pack' | 'text_pack';

export interface WebPlanPrice { plan: PaidPlan; period: BillingPeriod; amount: number | null; currency: string }
export interface WebPack { id: string; kind: WebPackKind; quantity: number; amount: number | null; currency: string }
export interface WebCatalog { plans: WebPlanPrice[]; packs: WebPack[] }

/** True on the website, where subscriptions are paid with Stripe. */
export const webBilling = Platform.OS === 'web';

/** Which plans and packs can be bought on the web right now. */
export async function loadWebCatalog(): Promise<WebCatalog> {
  const r = await callFunction<Partial<WebCatalog>>('billing-checkout', { action: 'catalog' });
  return { plans: r?.plans ?? [], packs: (r?.packs ?? []).slice().sort((a, b) => a.quantity - b.quantity) };
}

function go(url: string | undefined) {
  if (!url) throw new Error('Could not open checkout. Please try again.');
  if (typeof window !== 'undefined') window.location.href = url;
}

/** Sends the owner to Stripe Checkout for a plan. */
export async function startPlanCheckout(orgId: string, plan: PaidPlan, period: BillingPeriod) {
  const { url } = await callFunction<{ url: string }>('billing-checkout', { org_id: orgId, kind: 'plan', plan, period });
  go(url);
}

/** Sends the owner to Stripe Checkout for a one-time AI check or text pack. */
export async function startPackCheckout(orgId: string, kind: WebPackKind, pack: string) {
  const { url } = await callFunction<{ url: string }>('billing-checkout', { org_id: orgId, kind, pack });
  go(url);
}

/** Opens the Stripe billing portal (change plan, card, invoices, cancel). */
export async function openBillingPortal(orgId: string) {
  const { url } = await callFunction<{ url: string }>('billing-portal', { org_id: orgId });
  go(url);
}

type BillingOrg = Pick<Organization, 'billing_source' | 'stripe_subscription_id'> | null | undefined;
const paidActive = (plan: Plan) => plan !== 'trial' && plan !== 'expired';

/** The paid plan is billed by Apple / Google (change it on the phone). */
export const storeManaged = (org: BillingOrg, plan: Plan) =>
  paidActive(plan) && (org?.billing_source === 'app_store' || org?.billing_source === 'play_store');

/** The paid plan is billed on the web through Stripe. */
export const webManaged = (org: BillingOrg, plan: Plan) =>
  paidActive(plan) && org?.billing_source === 'stripe' && !!org?.stripe_subscription_id;

export const storeLabel = (org: BillingOrg) => (org?.billing_source === 'play_store' ? 'Google Play' : 'the App Store');

export function formatPrice(amount: number | null, currency: string): string {
  if (amount == null) return '';
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount);
  } catch {
    return `$${amount.toFixed(2)}`;
  }
}

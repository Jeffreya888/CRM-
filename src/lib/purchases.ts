// RevenueCat wrapper. All calls are no-ops on web or when keys are missing, so
// the app still runs in Expo Go / web during development.
import { Platform } from 'react-native';
import Purchases, { LOG_LEVEL, type CustomerInfo, type PurchasesPackage } from 'react-native-purchases';
import { REVENUECAT_ANDROID_KEY, REVENUECAT_IOS_KEY } from './config';

let configured = false;
const apiKey = Platform.select({ ios: REVENUECAT_IOS_KEY, android: REVENUECAT_ANDROID_KEY, default: '' });
export const purchasesAvailable = Platform.OS !== 'web' && !!apiKey;

function ensure(): boolean {
  if (!purchasesAvailable) return false;
  if (!configured) {
    if (__DEV__) Purchases.setLogLevel(LOG_LEVEL.WARN);
    Purchases.configure({ apiKey: apiKey! });
    configured = true;
  }
  return true;
}

/** Ties purchases to the organization so every teammate shares the plan. */
export async function identifyOrg(orgId: string) {
  if (!ensure()) return;
  await Purchases.logIn(orgId);
}

export interface StorePackage {
  identifier: string;
  planId: 'solo' | 'team' | 'fleet' | null;
  period: 'monthly' | 'annual' | 'other';
  priceString: string;
  title: string;
  introText: string | null;
  raw: PurchasesPackage;
}

function planOf(id: string): StorePackage['planId'] {
  const s = id.toLowerCase();
  return s.includes('fleet') ? 'fleet' : s.includes('team') ? 'team' : s.includes('solo') ? 'solo' : null;
}

// Consumable add-ons (not subscriptions): extra texts and extra AI checks.
const isTextPack = (id: string) => id.toLowerCase().includes('texts');
const isAiPack = (id: string) => id.toLowerCase().includes('ai_checks');

export async function loadPackages(): Promise<StorePackage[]> {
  if (!ensure()) return [];
  const offerings = await Purchases.getOfferings();
  const pkgs = (offerings.current?.availablePackages ?? []).filter((p) => !isTextPack(p.product.identifier) && !isAiPack(p.product.identifier));
  return pkgs.map((p) => {
    const intro = p.product.introPrice;
    return {
      identifier: p.identifier,
      planId: planOf(p.product.identifier) ?? planOf(p.identifier),
      period: p.packageType === 'ANNUAL' ? 'annual' : p.packageType === 'MONTHLY' ? 'monthly' : 'other',
      priceString: p.product.priceString,
      title: p.product.title,
      introText: intro ? (intro.price === 0 ? `${intro.periodNumberOfUnits} ${intro.periodUnit.toLowerCase()} free` : `${intro.priceString} intro`) : null,
      raw: p,
    };
  });
}

/** A consumable add-on product (text pack or AI check pack). */
interface ConsumablePack {
  identifier: string;
  productId: string;
  priceString: string;
  title: string;
  raw: PurchasesPackage;
}

export interface TextPack extends ConsumablePack {
  texts: number | null;
}

export interface AiPack extends ConsumablePack {
  checks: number | null;
}

/** Reads the pack size from a product id like flightready_ai_checks_50. */
function packCount(id: string): number | null {
  const n = /(\d[\d,]*)\D*$/.exec(id)?.[1];
  return n ? Number(n.replace(/,/g, '')) : null;
}

/**
 * Consumable packs whose product id matches `match`. Looks through every
 * offering so the packs can live in their own offering. [] when none exist.
 */
async function loadConsumables(match: (id: string) => boolean): Promise<(ConsumablePack & { count: number | null })[]> {
  if (!ensure()) return [];
  const offerings = await Purchases.getOfferings();
  const seen = new Set<string>();
  const out: (ConsumablePack & { count: number | null })[] = [];
  const all = [offerings.current, ...Object.values(offerings.all ?? {})].filter(Boolean);
  for (const o of all) {
    for (const p of o!.availablePackages) {
      const id = p.product.identifier;
      if (!match(id) || seen.has(id)) continue;
      seen.add(id);
      out.push({ identifier: p.identifier, productId: id, count: packCount(id), priceString: p.product.priceString, title: p.product.title, raw: p });
    }
  }
  return out.sort((a, b) => (a.count ?? 0) - (b.count ?? 0));
}

async function buyConsumable(pack: ConsumablePack): Promise<CustomerInfo | null> {
  if (!ensure()) return null;
  try {
    const { customerInfo } = await Purchases.purchasePackage(pack.raw);
    return customerInfo;
  } catch (e: any) {
    if (e?.userCancelled) return null;
    throw e;
  }
}

/** Extra text packs: consumable products whose id contains "texts", e.g. flightready_texts_500. */
export async function loadTextPacks(): Promise<TextPack[]> {
  return (await loadConsumables(isTextPack)).map(({ count, ...p }) => ({ ...p, texts: count }));
}

/** Buys a text pack; the revenuecat-webhook adds the credits to the company. */
export const buyTextPack = (pack: TextPack) => buyConsumable(pack);

/** Extra AI photo check packs: consumable products whose id contains "ai_checks", e.g. flightready_ai_checks_50. */
export async function loadAiPacks(): Promise<AiPack[]> {
  return (await loadConsumables(isAiPack)).map(({ count, ...p }) => ({ ...p, checks: count }));
}

/** Buys an AI check pack; the revenuecat-webhook adds the checks to the company. */
export const buyAiPack = (pack: AiPack) => buyConsumable(pack);

export async function buy(pkg: StorePackage): Promise<CustomerInfo | null> {
  if (!ensure()) return null;
  try {
    const { customerInfo } = await Purchases.purchasePackage(pkg.raw);
    return customerInfo;
  } catch (e: any) {
    if (e?.userCancelled) return null;
    throw e;
  }
}

export async function restore(): Promise<CustomerInfo | null> {
  if (!ensure()) return null;
  return Purchases.restorePurchases();
}

export async function manageSubscriptionsUrl(): Promise<string | null> {
  if (!ensure()) return null;
  const info = await Purchases.getCustomerInfo();
  return info.managementURL;
}

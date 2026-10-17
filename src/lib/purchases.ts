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

export async function loadPackages(): Promise<StorePackage[]> {
  if (!ensure()) return [];
  const offerings = await Purchases.getOfferings();
  const pkgs = (offerings.current?.availablePackages ?? []).filter((p) => !p.product.identifier.toLowerCase().includes('texts'));
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

export interface TextPack {
  identifier: string;
  productId: string;
  texts: number | null;
  priceString: string;
  title: string;
  raw: PurchasesPackage;
}

/**
 * Extra text packs: consumable products whose id contains "texts", e.g.
 * flightready_texts_500. Looks through every offering so the packs can live in
 * their own offering. Returns [] when none are configured.
 */
export async function loadTextPacks(): Promise<TextPack[]> {
  if (!ensure()) return [];
  const offerings = await Purchases.getOfferings();
  const seen = new Set<string>();
  const out: TextPack[] = [];
  const all = [offerings.current, ...Object.values(offerings.all ?? {})].filter(Boolean);
  for (const o of all) {
    for (const p of o!.availablePackages) {
      const id = p.product.identifier;
      if (!id.toLowerCase().includes('texts') || seen.has(id)) continue;
      seen.add(id);
      const n = /(\d[\d,]*)/.exec(id.replace(/^\D+/, ''))?.[1];
      out.push({ identifier: p.identifier, productId: id, texts: n ? Number(n.replace(/,/g, '')) : null, priceString: p.product.priceString, title: p.product.title, raw: p });
    }
  }
  return out.sort((a, b) => (a.texts ?? 0) - (b.texts ?? 0));
}

/** Buys a text pack; the revenuecat-webhook adds the credits to the company. */
export async function buyTextPack(pack: TextPack): Promise<CustomerInfo | null> {
  if (!ensure()) return null;
  try {
    const { customerInfo } = await Purchases.purchasePackage(pack.raw);
    return customerInfo;
  } catch (e: any) {
    if (e?.userCancelled) return null;
    throw e;
  }
}

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

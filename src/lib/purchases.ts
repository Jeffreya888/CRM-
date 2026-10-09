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
  const pkgs = offerings.current?.availablePackages ?? [];
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

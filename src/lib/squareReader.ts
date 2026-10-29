// In-person card payments with Square's Mobile Payments SDK: Tap to Pay on
// iPhone/Android or a paired Square reader. Needs a development or store build
// with the square-mobile-payments config plugin (not Expo Go) and
// EXPO_PUBLIC_SQUARE_APPLICATION_ID set at build time.
import * as Crypto from 'expo-crypto';
import { NativeModules, Platform } from 'react-native';
import { callFunction } from './supabase';

type Sdk = typeof import('mobile-payments-sdk-react-native');

let sdk: Sdk | null | undefined;
function load(): Sdk | null {
  if (sdk !== undefined) return sdk;
  try {
    // The package throws on import when its native module isn't in this build.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    sdk = NativeModules.MobilePaymentsSdkReactNative ? (require('mobile-payments-sdk-react-native') as Sdk) : null;
  } catch {
    sdk = null;
  }
  return sdk;
}

/** True when this build can take in-person payments. */
export const inPersonSupported = (): boolean =>
  Platform.OS !== 'web' && !!process.env.EXPO_PUBLIC_SQUARE_APPLICATION_ID && !!load();

type Session = {
  access_token: string; location_id: string; amount_cents: number; fee_cents: number;
  currency: string; reference_id: string; note: string;
};

async function signIn(s: Sdk, session: Session) {
  const state = String(await s.getAuthorizationState());
  if (state === s.AuthorizationState.AUTHORIZED) {
    const loc = await s.getAuthorizedLocation().catch(() => null);
    if (loc && String(loc.id) === session.location_id) return;
    await s.deauthorize();
  }
  await s.authorize(session.access_token, session.location_id);
}

/** Apple asks the business owner to accept Tap to Pay terms once per Apple account. */
async function ensureTapToPayLinked(s: Sdk) {
  if (Platform.OS !== 'ios') return;
  try {
    if (!(await s.TapToPaySettings.isDeviceCapable())) return;
    if (!(await s.TapToPaySettings.isAppleAccountLinked())) await s.TapToPaySettings.linkAppleAccount();
  } catch {
    // Not capable / declined: the card reader and manual entry still work.
  }
}

export type InPersonResult = { status: 'paid' } | { status: 'canceled' } | { status: 'failed'; message: string };

/** Takes a card payment on an invoice in person and records it. */
export async function takeInPersonPayment(invoiceId: string, amount?: number): Promise<InPersonResult> {
  const s = load();
  if (!s) return { status: 'failed', message: 'In-person payments need the latest version of the app.' };
  const session = await callFunction<Session>('square-reader', { action: 'session', invoice_id: invoiceId, amount });
  await signIn(s, session);
  await ensureTapToPayLinked(s);
  const currencyCode = session.currency as Parameters<Sdk['startPayment']>[0]['amountMoney']['currencyCode'];
  let payment;
  try {
    payment = await s.startPayment({
      amountMoney: { amount: session.amount_cents, currencyCode },
      appFeeMoney: { amount: session.fee_cents, currencyCode },
      idempotencyKey: Crypto.randomUUID(),
      referenceId: session.reference_id,
      note: session.note,
      autocomplete: true,
      processingMode: s.ProcessingMode.ONLINE_ONLY,
      allowCardSurcharge: false,
    }, {
      additionalMethods: [s.AdditionalPaymentMethodType.TAP_TO_PAY, s.AdditionalPaymentMethodType.KEYED],
      mode: s.PromptMode.DEFAULT,
    });
  } catch (e: any) {
    const failure = e?.userInfo ? s.mapUserInfoToFailure(e.userInfo) : null;
    const text = String(failure?.errorMessage || failure?.debugMessage || e?.message || '');
    if (/cancel/i.test(text) || /cancel/i.test(String(failure?.errorCode ?? failure?.debugCode ?? ''))) return { status: 'canceled' };
    return { status: 'failed', message: text || 'The payment did not go through.' };
  }
  await callFunction('square-reader', { action: 'record', invoice_id: invoiceId, payment_id: String(payment.id) });
  return { status: 'paid' };
}

/** Square's own screen to pair and manage card readers. */
export async function openReaderSettings() {
  const s = load();
  if (!s) throw new Error('Card readers need the latest version of the app.');
  await s.showSettings();
}

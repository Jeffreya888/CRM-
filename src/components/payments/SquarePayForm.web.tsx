import * as Crypto from 'expo-crypto';
import { useEffect, useId, useRef, useState } from 'react';
import { Platform, Pressable, View } from 'react-native';
import { Button, ErrorBanner, Ionicons, Row, T } from '../ui';
import { callFunction } from '../../lib/supabase';
import { colors, radius, space } from '../../lib/theme';
import { money } from '../../lib/format';
import type { SquareMethod, SquarePayFormProps, SquarePayments, SquareTokenResult } from './SquarePayForm.types';

type Config = {
  application_id: string; location_id: string; environment: 'production' | 'sandbox';
  amount: number; currency: string; label: string; customer: { name: string | null; email: string | null };
};

const SDK = { production: 'https://web.squarecdn.com/v1/square.js', sandbox: 'https://sandbox.web.squarecdn.com/v1/square.js' };

function loadSdk(env: Config['environment']): Promise<void> {
  const w = window as unknown as { Square?: unknown };
  if (w.Square) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = SDK[env];
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Could not load the secure card form. Check your connection and reload the page.'));
    document.head.appendChild(s);
  });
}

// Square's card field lives in an iframe; these are the styles it accepts.
const cardStyle = {
  '.input-container': { borderColor: colors.border, borderRadius: '10px' },
  '.input-container.is-focus': { borderColor: colors.primary },
  input: { backgroundColor: colors.input, color: colors.text, fontSize: '16px' },
  'input::placeholder': { color: colors.textMuted },
  '.message-text': { color: colors.textMuted },
  '.message-icon': { color: colors.textMuted },
};

/** Square's secure card form (plus Apple Pay / Google Pay where available) on a customer page. */
export function SquarePayForm({ kind, token, buttonLabel, onDone }: SquarePayFormProps) {
  const id = `sq${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const [config, setConfig] = useState<Config | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [applePay, setApplePay] = useState<SquareMethod | null>(null);
  const card = useRef<SquareMethod | null>(null);
  const googlePay = useRef<SquareMethod | null>(null);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    let alive = true;
    (async () => {
      try {
        const c = await callFunction<Config>('square-pay', { action: 'config', kind, token });
        if (!alive) return;
        setConfig(c);
        await loadSdk(c.environment);
        const Square = (window as unknown as { Square: { payments: (app: string, loc: string) => SquarePayments } }).Square;
        const payments = Square.payments(c.application_id, c.location_id);
        let m: SquareMethod;
        try {
          m = await payments.card({ style: cardStyle });
        } catch {
          m = await payments.card(); // styles rejected by a newer SDK: use Square's defaults
        }
        if (!alive) return;
        await m.attach?.(`#${id}-card`);
        card.current = m;
        setReady(true);
        if (kind === 'care_plan') return; // wallets can't be saved as a card on file
        const req = payments.paymentRequest({
          countryCode: 'US', currencyCode: c.currency,
          total: { amount: c.amount.toFixed(2), label: c.label.slice(0, 60) },
        });
        try {
          const g = await payments.googlePay(req);
          await g.attach?.(`#${id}-gpay`);
          if (alive) googlePay.current = g;
        } catch { /* not available in this browser */ }
        try {
          const a = await payments.applePay(req);
          if (alive) setApplePay(a);
        } catch { /* not available in this browser */ }
      } catch (e: any) {
        if (alive) setError(e.message ?? String(e));
      }
    })();
    return () => {
      alive = false;
      card.current?.destroy?.().catch(() => {});
      googlePay.current?.destroy?.().catch(() => {});
    };
  }, [id, kind, token]);

  const submit = async (method: SquareMethod | null, isCard: boolean) => {
    if (!method || !config || busy) return;
    setError(null);
    setBusy(true);
    try {
      const [givenName, ...rest] = (config.customer.name ?? '').trim().split(/\s+/);
      const result: SquareTokenResult = await method.tokenize(isCard ? {
        amount: config.amount.toFixed(2),
        currencyCode: config.currency,
        intent: kind === 'care_plan' ? 'STORE' : 'CHARGE',
        customerInitiated: true,
        sellerKeyedIn: false,
        billingContact: { givenName: givenName || undefined, familyName: rest.join(' ') || undefined, email: config.customer.email ?? undefined },
      } : undefined);
      if (result.status !== 'OK' || !result.token) {
        if (result.status !== 'Cancel') setError(result.errors?.[0]?.message ?? 'Please check the card details.');
        return;
      }
      const r = await callFunction<{ status: 'paid' | 'pending' | 'active' }>('square-pay', {
        action: kind === 'care_plan' ? 'care_plan_start' : 'pay', kind, token,
        source_id: result.token, idempotency_key: Crypto.randomUUID(),
      });
      onDone(r.status);
    } catch (e: any) {
      setError(e.message ?? String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ gap: space.sm }}>
      <ErrorBanner message={error} />
      {config && kind === 'care_plan' ? (
        <T variant="small">Your card is saved securely with Square and charged {money(config.amount, config.currency)} each month. You can cancel any time by contacting the business.</T>
      ) : null}
      {applePay ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Pay with Apple Pay" onPress={() => submit(applePay, false)}
          style={{ height: 48, borderRadius: radius.md, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' }}>
          <Row gap={6}><Ionicons name="logo-apple" size={20} color="#fff" /><T style={{ color: '#fff', fontWeight: '600' }}>Pay</T></Row>
        </Pressable>
      ) : null}
      <View nativeID={`${id}-gpay`} />
      <View nativeID={`${id}-card`} style={{ minHeight: 90 }} />
      {!ready && !error ? <T variant="small">Loading the secure card form…</T> : null}
      <Button icon="lock-closed-outline" title={buttonLabel} onPress={() => submit(card.current, true)} loading={busy} disabled={!ready} />
      <Row gap={6}>
        <Ionicons name="shield-checkmark-outline" size={14} color={colors.textMuted} />
        <T variant="small">Processed securely by Square. Card details never touch our servers.</T>
      </Row>
    </View>
  );
}

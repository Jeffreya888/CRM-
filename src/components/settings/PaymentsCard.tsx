import * as Linking from 'expo-linking';
import { useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useState } from 'react';
import { Platform, Pressable, View } from 'react-native';
import { confirmAction, notify } from '../FormSheet';
import { Badge, Button, Card, IconTile, Ionicons, Row, T } from '../ui';
import { planInfo } from '../../lib/plans';
import { callFunction, friendlyError, supabase } from '../../lib/supabase';
import type { Organization, Plan } from '../../lib/types';
import { colors, radius, space } from '../../lib/theme';

function Choice({ title, body, selected, disabled, onPress, badge }: { title: string; body: string; selected: boolean; disabled?: boolean; onPress?: () => void; badge?: string }) {
  return (
    <Pressable disabled={disabled || !onPress} onPress={onPress} accessibilityRole="radio" accessibilityState={{ selected, disabled }}
      style={({ pressed }) => [{
        flexDirection: 'row', gap: space.md, alignItems: 'center', padding: space.md, borderRadius: radius.md, marginBottom: space.sm,
        borderWidth: 1, borderColor: selected ? colors.primary : colors.border, backgroundColor: selected ? colors.primarySoft : colors.input,
      }, disabled && { opacity: 0.5 }, pressed && { opacity: 0.8 }]}>
      <Ionicons name={selected ? 'radio-button-on' : 'radio-button-off'} size={22} color={selected ? colors.primary : colors.textMuted} />
      <View style={{ flex: 1 }}>
        <Row gap={6}><T style={{ fontWeight: '600' }}>{title}</T>{badge ? <Badge raw label={badge} tone="neutral" /> : null}</Row>
        <T variant="small">{body}</T>
      </View>
    </Pressable>
  );
}

/** How customers pay: arranged directly, or online through Stripe Connect or Square. */
export function PaymentsCard({ org, plan, editable, isDemo, onChanged }: { org: Organization; plan: Plan; editable: boolean; isDemo: boolean; onChanged: () => Promise<void> }) {
  const fee = ((planInfo(plan)?.feeBps ?? 150) / 100).toFixed(1);
  const { square: squareReturn } = useLocalSearchParams<{ square?: string }>();
  const [locations, setLocations] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    if (!squareReturn) return;
    const msg: Record<string, [string, string]> = {
      connected: ['Square connected', 'Customers can now pay with Square, and your team can take Tap to Pay payments.'],
      no_location: ['Square connected', 'Your Square account has no location that can take card payments yet. Finish setup in Square, then tap Refresh.'],
      in_use: ['Square account in use', 'That Square account is already connected to another company.'],
      cancelled: ['Square not connected', 'You cancelled the Square sign-in.'],
      error: ['Square not connected', 'Something went wrong connecting Square. Please try again.'],
    };
    const m = msg[squareReturn];
    if (m) notify(m[0], m[1]);
    onChanged();
  }, [squareReturn]); // eslint-disable-line react-hooks/exhaustive-deps

  const setMode = async (mode: Organization['payment_mode']) => {
    if (mode === org.payment_mode) return;
    const { error } = await supabase.from('organizations').update({ payment_mode: mode }).eq('id', org.id);
    if (error) return notify('Could not save', friendlyError(error.message));
    await onChanged();
  };

  const stripe = async (action: 'onboard' | 'status' | 'dashboard') => {
    if (isDemo) return notify('Demo workspace', 'Real payments are turned off in the demo.');
    try {
      const r = await callFunction<any>('stripe-connect', { org_id: org.id, action, return_url: Linking.createURL('/settings') });
      if (r?.url) await WebBrowser.openBrowserAsync(r.url);
      const s = await callFunction<any>('stripe-connect', { org_id: org.id, action: 'status' });
      await onChanged();
      if (action === 'status') {
        notify(s.charges_enabled ? 'Payments are live' : 'Setup not finished',
          s.charges_enabled ? 'Customers can pay invoices by card and bank transfer.' : 'Finish the Stripe setup to start accepting payments.');
      }
    } catch (e: any) {
      notify('Stripe', friendlyError(e.message));
    }
  };

  const square = async (action: 'start' | 'status' | 'disconnect', extra: Record<string, unknown> = {}) => {
    if (isDemo) return notify('Demo workspace', 'Real payments are turned off in the demo.');
    try {
      if (action === 'start') {
        const back = Platform.OS === 'web' && typeof window !== 'undefined' ? `${window.location.origin}/settings` : Linking.createURL('/settings');
        const { url } = await callFunction<{ url: string }>('square-connect', { org_id: org.id, action, return_url: back });
        if (Platform.OS === 'web' && typeof window !== 'undefined') {
          window.location.href = url;
          return;
        }
        const r = await WebBrowser.openAuthSessionAsync(url, back);
        if (r.type === 'success') {
          const status = new URL(r.url).searchParams.get('square');
          if (status && status !== 'connected') notify('Square', status === 'in_use' ? 'That Square account is already connected to another company.' : 'Square was not connected.');
        }
      }
      if (action === 'disconnect') await callFunction('square-connect', { org_id: org.id, action });
      const s = await callFunction<any>('square-connect', { org_id: org.id, action: 'status', ...extra });
      setLocations(s.locations ?? []);
      await onChanged();
      if (action === 'status' && !extra.location_id) {
        notify(s.charges_enabled ? 'Square is live' : s.connected ? 'Choose a location' : 'Square not connected',
          s.charges_enabled ? `Taking payments at ${s.location_name}.` : s.connected ? 'Pick the Square location that should receive payments.' : 'Connect your Square account to get paid.');
      }
    } catch (e: any) {
      notify('Square', friendlyError(e.message));
    }
  };

  const chooseLocation = async (id: string) => {
    try {
      const s = await callFunction<any>('square-connect', { org_id: org.id, action: 'set_location', location_id: id });
      setLocations(s.locations ?? []);
      await onChanged();
    } catch (e: any) {
      notify('Square', friendlyError(e.message));
    }
  };

  const disconnectSquare = () => confirmAction('Disconnect Square?',
    'Customers will no longer be able to pay with Square, and Square care plans stop charging.', () => square('disconnect'));

  const mode = org.payment_mode;
  return (
    <Card>
      <Choice title="Arranged directly" body="Customers pay you by check, cash, wire or your own card reader. You record payments on the invoice."
        selected={mode === 'direct'} onPress={editable ? () => setMode('direct') : undefined} />
      <Choice title="Online payments with Stripe" body={`Customers pay invoices, deposits and care plans by card or bank transfer. Money goes to your bank. ${fee}% platform fee plus Stripe's processing fee.`}
        selected={mode === 'stripe'} onPress={editable ? () => setMode('stripe') : undefined} />
      <Choice title="Online and in-person payments with Square" body={`Use your Square account: customers pay invoices, deposits and care plans online, and your team takes Tap to Pay or Square reader payments. ${fee}% platform fee plus Square's processing fee.`}
        selected={mode === 'square'} onPress={editable ? () => setMode('square') : undefined} />

      {mode === 'stripe' ? (
        <View style={{ marginTop: space.sm, paddingTop: space.md, borderTopWidth: 1, borderTopColor: colors.border }}>
          <Row gap={space.md}>
            <IconTile icon="card-outline" tone={org.stripe_charges_enabled ? 'success' : 'neutral'} size={36} />
            <View style={{ flex: 1 }}>
              <T style={{ fontWeight: '600' }}>{org.stripe_charges_enabled ? 'Stripe connected' : org.stripe_account_id ? 'Stripe setup not finished' : 'Stripe not connected'}</T>
              <T variant="small">{org.stripe_charges_enabled ? 'Accepting card and bank payments' : 'Connect your bank account to get paid online'}</T>
            </View>
            <Badge label={org.stripe_charges_enabled ? 'live' : 'off'} tone={org.stripe_charges_enabled ? 'success' : 'neutral'} />
          </Row>
          {editable ? (
            <Row style={{ marginTop: space.md, flexWrap: 'wrap' }}>
              {!org.stripe_charges_enabled ? <Button small icon="link-outline" title={org.stripe_account_id ? 'Continue setup' : 'Connect Stripe'} onPress={() => stripe('onboard')} /> : null}
              {org.stripe_account_id ? <Button small kind="secondary" title="Refresh status" onPress={() => stripe('status')} /> : null}
              {org.stripe_charges_enabled ? <Button small kind="secondary" title="Payouts dashboard" onPress={() => stripe('dashboard')} /> : null}
            </Row>
          ) : null}
        </View>
      ) : null}

      {mode === 'square' ? (
        <View style={{ marginTop: space.sm, paddingTop: space.md, borderTopWidth: 1, borderTopColor: colors.border }}>
          <Row gap={space.md}>
            <IconTile icon="square-outline" tone={org.square_charges_enabled ? 'success' : 'neutral'} size={36} />
            <View style={{ flex: 1 }}>
              <T style={{ fontWeight: '600' }}>{org.square_charges_enabled ? 'Square connected' : org.square_merchant_id ? 'Choose a Square location' : 'Square not connected'}</T>
              <T variant="small">{org.square_charges_enabled
                ? `Payments go to ${org.square_location_name ?? 'your Square location'}. Payouts follow your Square settings.`
                : 'Sign in to Square to get paid online and in person'}</T>
            </View>
            <Badge label={org.square_charges_enabled ? 'live' : 'off'} tone={org.square_charges_enabled ? 'success' : 'neutral'} />
          </Row>
          {editable && locations.length > 1 ? (
            <View style={{ marginTop: space.md }}>
              <T variant="small" style={{ marginBottom: space.xs }}>Location that receives payments</T>
              {locations.map((l) => (
                <Choice key={l.id} title={l.name} body="" selected={org.square_location_id === l.id} onPress={() => chooseLocation(l.id)} />
              ))}
            </View>
          ) : null}
          {editable ? (
            <Row style={{ marginTop: space.md, flexWrap: 'wrap' }}>
              {!org.square_merchant_id ? <Button small icon="link-outline" title="Connect Square" onPress={() => square('start')} /> : null}
              {org.square_merchant_id ? <Button small kind="secondary" title={locations.length ? 'Refresh status' : 'Locations & status'} onPress={() => square('status')} /> : null}
              {org.square_merchant_id ? <Button small kind="ghost" title="Disconnect" onPress={disconnectSquare} /> : null}
            </Row>
          ) : null}
        </View>
      ) : null}
    </Card>
  );
}

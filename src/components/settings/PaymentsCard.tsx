import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { Pressable, View } from 'react-native';
import { notify } from '../FormSheet';
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

/** How customers pay: arranged directly (no Stripe) or online through Stripe Connect. */
export function PaymentsCard({ org, plan, editable, isDemo, onChanged }: { org: Organization; plan: Plan; editable: boolean; isDemo: boolean; onChanged: () => Promise<void> }) {
  const fee = ((planInfo(plan)?.feeBps ?? 150) / 100).toFixed(1);

  const setMode = async (mode: 'stripe' | 'direct') => {
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

  const stripeMode = org.payment_mode === 'stripe';
  return (
    <Card>
      <Choice title="Arranged directly (no Stripe)" body="Customers pay you by check, cash, wire or your own card reader. You record payments on the invoice."
        selected={!stripeMode} onPress={editable ? () => setMode('direct') : undefined} />
      <Choice title="Online payments with Stripe" body={`Customers pay invoices by card or bank transfer from the pay link. Money goes to your bank. ${fee}% platform fee plus Stripe's processing fee.`}
        selected={stripeMode} onPress={editable ? () => setMode('stripe') : undefined} />
      <Choice title="Square" body="Accept payments through Square." selected={false} disabled badge="Coming later" />

      {stripeMode ? (
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
    </Card>
  );
}

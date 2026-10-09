import { router, Stack } from 'expo-router';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { Share } from 'react-native';
import { confirmAction, FormSheet, notify, type FieldDef } from '../../components/FormSheet';
import { Badge, Button, Card, KeyValue, ListRow, Row, Screen, Section, T } from '../../components/ui';
import { APP_NAME, PRIVACY_URL, SUPPORT_EMAIL, TERMS_URL } from '../../lib/config';
import { date } from '../../lib/format';
import { canAdmin, PLANS } from '../../lib/plans';
import { manageSubscriptionsUrl } from '../../lib/purchases';
import { useOrg } from '../../lib/session';
import { callFunction, friendlyError, supabase } from '../../lib/supabase';
import { space } from '../../lib/theme';

const COMPANY_FIELDS: FieldDef[] = [
  { key: 'name', label: 'Company name', type: 'text', required: true },
  { key: 'email', label: 'Billing email', type: 'email' },
  { key: 'phone', label: 'Phone', type: 'phone' },
  { key: 'website', label: 'Website', type: 'text' },
  { key: 'address', label: 'Address', type: 'multiline' },
  { key: 'logo_url', label: 'Logo URL (for PDFs)', type: 'text' },
  { key: 'tax_rate_pct', label: 'Default sales tax (%)', type: 'number' },
  { key: 'payment_terms_days', label: 'Default payment terms (days)', type: 'number' },
  { key: 'currency', label: 'Currency', type: 'select', options: ['USD', 'CAD', 'EUR', 'GBP', 'AUD', 'MXN', 'CHF', 'AED'].map((c) => ({ value: c, label: c })) },
  { key: 'invoice_prefix', label: 'Invoice prefix', type: 'text' },
  { key: 'quote_prefix', label: 'Quote prefix', type: 'text' },
  { key: 'job_prefix', label: 'Work order prefix', type: 'text' },
  { key: 'default_quote_terms', label: 'Default quote terms', type: 'multiline' },
  { key: 'default_invoice_notes', label: 'Default invoice notes', type: 'multiline' },
];

function toCsv(rows: Record<string, unknown>[]): string {
  if (!rows.length) return '';
  const cols = Object.keys(rows[0]!);
  const cell = (v: unknown) => { const s = v == null ? '' : Array.isArray(v) ? v.join('; ') : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  return [cols.join(','), ...rows.map((r) => cols.map((c) => cell(r[c])).join(','))].join('\n');
}

export default function Settings() {
  const { org, orgId, role, plan, trialDays, profile, session, refresh, signOut } = useOrg();
  const admin = canAdmin(role);
  const [companySheet, setCompanySheet] = useState(false);
  const [profileSheet, setProfileSheet] = useState(false);
  const planInfo = PLANS.find((p) => p.id === plan);

  const stripe = async (action: 'onboard' | 'status' | 'dashboard') => {
    try {
      const r = await callFunction<any>('stripe-connect', { org_id: orgId, action, return_url: Linking.createURL('/settings') });
      if (r.url) await WebBrowser.openBrowserAsync(r.url);
      const s = await callFunction<any>('stripe-connect', { org_id: orgId, action: 'status' });
      await refresh();
      if (action === 'status') notify(s.charges_enabled ? 'Payments are live' : 'Setup incomplete', s.charges_enabled ? 'Customers can pay invoices by card and ACH.' : 'Finish Stripe onboarding to start accepting payments.');
    } catch (e: any) {
      notify('Stripe', e.message);
    }
  };

  const exportData = async (table: 'customers' | 'aircraft' | 'invoices' | 'jobs') => {
    const { data, error } = await supabase.from(table).select('*').eq('org_id', orgId).limit(10000);
    if (error) return notify('Export failed', error.message);
    await Share.share({ title: `${table}.csv`, message: toCsv((data ?? []).map(({ org_id: _o, public_token: _t, signature_svg: _s, ...r }: any) => r)) });
  };

  const deleteAccount = () =>
    confirmAction(
      'Delete your account?',
      role === 'owner'
        ? `This permanently deletes your login AND ${org.name} with all customers, jobs, photos and invoices (unless another owner exists). Active App Store subscriptions must be cancelled separately in Settings → Apple ID → Subscriptions.`
        : 'This permanently deletes your login and removes you from the team.',
      async () => {
        const { error } = await supabase.rpc('delete_my_account');
        if (error) return notify('Could not delete', friendlyError(error.message));
        await signOut();
      },
      true,
    );

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Settings' }} />

      <Section title="Subscription">
        <Card>
          <Row style={{ justifyContent: 'space-between' }}>
            <T variant="h3">{plan === 'trial' ? 'Free trial' : planInfo?.name ?? 'No active plan'}</T>
            <Badge label={plan} tone={plan === 'expired' ? 'danger' : plan === 'trial' ? 'warning' : 'success'} />
          </Row>
          {plan === 'trial' ? <T variant="muted">{trialDays} days left · ends {date(org.trial_ends_at)}</T> : null}
          {org.plan_expires_at && plan !== 'expired' ? <T variant="muted">Renews / expires {date(org.plan_expires_at)}</T> : null}
          {admin ? (
            <Row style={{ marginTop: space.sm, flexWrap: 'wrap' }}>
              <Button small icon="rocket-outline" title={plan === 'trial' || plan === 'expired' ? 'Choose plan' : 'Change plan'} onPress={() => router.push('/paywall')} />
              <Button small kind="secondary" title="Manage subscription" onPress={async () => {
                const url = await manageSubscriptionsUrl();
                Linking.openURL(url ?? 'https://apps.apple.com/account/subscriptions');
              }} />
            </Row>
          ) : null}
        </Card>
      </Section>

      {admin ? (
        <Section title="Online payments (Stripe)">
          <Card>
            <Row style={{ justifyContent: 'space-between' }}>
              <T>{org.stripe_charges_enabled ? 'Accepting card & ACH payments' : org.stripe_account_id ? 'Onboarding incomplete' : 'Not connected'}</T>
              <Badge label={org.stripe_charges_enabled ? 'live' : 'off'} tone={org.stripe_charges_enabled ? 'success' : 'neutral'} />
            </Row>
            <T variant="small" style={{ marginTop: 4 }}>
              Customers pay invoices online and funds go straight to your bank. A {((planInfo?.feeBps ?? 150) / 100).toFixed(1)}% platform fee applies on top of Stripe's processing fee.
            </T>
            <Row style={{ marginTop: space.sm, flexWrap: 'wrap' }}>
              {!org.stripe_charges_enabled ? <Button small icon="card-outline" title={org.stripe_account_id ? 'Continue setup' : 'Connect Stripe'} onPress={() => stripe('onboard')} /> : null}
              {org.stripe_account_id ? <Button small kind="secondary" title="Refresh status" onPress={() => stripe('status')} /> : null}
              {org.stripe_charges_enabled ? <Button small kind="secondary" title="Payouts dashboard" onPress={() => stripe('dashboard')} /> : null}
            </Row>
          </Card>
        </Section>
      ) : null}

      <Section title="Company" action={admin ? <Button small kind="ghost" title="Edit" onPress={() => setCompanySheet(true)} /> : null}>
        <Card>
          <KeyValue label="Name" value={org.name} />
          <KeyValue label="Email" value={org.email} />
          <KeyValue label="Phone" value={org.phone} />
          <KeyValue label="Sales tax" value={`${(Number(org.tax_rate) * 100).toFixed(3).replace(/\.?0+$/, '')}%`} />
          <KeyValue label="Terms" value={`Net ${org.payment_terms_days}`} />
          <KeyValue label="Numbering" value={`${org.quote_prefix}… / ${org.job_prefix}… / ${org.invoice_prefix}…`} />
        </Card>
      </Section>

      <Section title="My profile" action={<Button small kind="ghost" title="Edit" onPress={() => setProfileSheet(true)} />}>
        <Card>
          <KeyValue label="Name" value={profile?.full_name} />
          <KeyValue label="Email" value={session?.user.email} />
          <KeyValue label="Phone" value={profile?.phone} />
        </Card>
      </Section>

      {admin ? (
        <Section title="Export your data (CSV)">
          <Row style={{ flexWrap: 'wrap' }}>
            {(['customers', 'aircraft', 'jobs', 'invoices'] as const).map((t) => <Button key={t} small kind="secondary" title={t} onPress={() => exportData(t)} />)}
          </Row>
        </Section>
      ) : null}

      <Section title="Help">
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          <ListRow icon="mail-outline" title="Contact support" subtitle={SUPPORT_EMAIL} onPress={() => Linking.openURL(`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(APP_NAME + ' support')}`)} />
          <ListRow icon="shield-checkmark-outline" title="Privacy policy" onPress={() => WebBrowser.openBrowserAsync(PRIVACY_URL)} />
          <ListRow icon="document-outline" title="Terms of use" onPress={() => WebBrowser.openBrowserAsync(TERMS_URL)} />
        </Card>
      </Section>

      <Button style={{ marginTop: space.xl }} kind="secondary" icon="log-out-outline" title="Sign out" onPress={signOut} />
      <Button style={{ marginTop: space.sm }} kind="ghost" icon="trash-outline" title="Delete account" onPress={deleteAccount} />

      <FormSheet visible={companySheet} title="Company" fields={COMPANY_FIELDS}
        initial={{ ...org, tax_rate_pct: String(+(Number(org.tax_rate) * 100).toFixed(4)) }}
        onClose={() => setCompanySheet(false)}
        onSubmit={async (v) => {
          const { tax_rate_pct, ...rest } = v;
          const { error } = await supabase.from('organizations').update({ ...rest, tax_rate: (Number(tax_rate_pct) || 0) / 100 }).eq('id', orgId);
          if (error) throw error;
          await refresh();
        }} />
      <FormSheet visible={profileSheet} title="My profile" initial={{ full_name: profile?.full_name, phone: profile?.phone }}
        fields={[{ key: 'full_name', label: 'Full name', type: 'text', required: true }, { key: 'phone', label: 'Phone', type: 'phone' }]}
        onClose={() => setProfileSheet(false)}
        onSubmit={async (v) => {
          const { error } = await supabase.from('profiles').update(v).eq('id', session!.user.id);
          if (error) throw error;
          await supabase.rpc('set_my_display_name', { p_name: v.full_name });
          await refresh();
        }} />
    </Screen>
  );
}

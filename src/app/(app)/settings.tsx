import { router, Stack } from 'expo-router';
import * as Linking from 'expo-linking';
import { useState } from 'react';
import { Image, Platform, View } from 'react-native';
import { FormSheet, type FieldDef } from '../../components/FormSheet';
import { BusinessTypeCard } from '../../components/settings/BusinessTypeCard';
import { JobCostingCard } from '../../components/settings/JobCostingCard';
import { appVersion, openSite, SITE } from '../../components/settings/links';
import { PaymentsCard } from '../../components/settings/PaymentsCard';
import { Badge, Button, Card, ErrorBanner, IconTile, KeyValue, ListRow, Row, Screen, Section, T, ToggleRow } from '../../components/ui';
import { openBillingPortal, storeLabel, storeManaged, webBilling } from '../../lib/billing';
import { APP_NAME } from '../../lib/config';
import { date } from '../../lib/format';
import { pickImage } from '../../lib/files';
import { canAdmin, planInfo } from '../../lib/plans';
import { manageSubscriptionsUrl } from '../../lib/purchases';
import { useOrg } from '../../lib/session';
import { SOCIALS } from '../../lib/social';
import { friendlyError, supabase } from '../../lib/supabase';
import { colors, radius, space } from '../../lib/theme';

const TIMEZONES = [
  'America/New_York', 'America/Chicago', 'America/Denver', 'America/Phoenix', 'America/Los_Angeles', 'America/Anchorage',
  'Pacific/Honolulu', 'America/Puerto_Rico', 'America/Toronto', 'America/Vancouver', 'America/Mexico_City',
  'Europe/London', 'Europe/Paris', 'Europe/Berlin', 'Europe/Zurich', 'Asia/Dubai', 'Asia/Singapore', 'Australia/Sydney', 'UTC',
];
const tzLabel = (z: string) => z.replace(/_/g, ' ').replace('America/', '').replace('Pacific/', '').replace('Europe/', '').replace('Asia/', '').replace('Australia/', '');

type SheetKey = 'company' | 'social' | 'invoicing' | 'pricing' | 'documents' | null;

const pctOf = (fraction: number | string | null | undefined) => String(+(Number(fraction ?? 0) * 100).toFixed(4));

export default function Settings() {
  const { org, orgId, role, plan, trialDays, refresh, businessTypes, isDemo } = useOrg();
  const admin = canAdmin(role);
  const [sheet, setSheet] = useState<SheetKey>(null);
  const [logoBusy, setLogoBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [billingBusy, setBillingBusy] = useState(false);
  const info = planInfo(plan);
  const paid = plan !== 'trial' && plan !== 'expired';
  const stripeBilled = org.billing_source === 'stripe';

  const save = async (patch: Record<string, unknown>) => {
    const { error: e } = await supabase.from('organizations').update(patch).eq('id', orgId);
    if (e) throw new Error(friendlyError(e.message));
    await refresh();
  };
  const saveQuiet = async (patch: Record<string, unknown>) => {
    setError(null);
    try { await save(patch); } catch (e: any) { setError(e.message); }
  };

  const timezoneOptions = (TIMEZONES.includes(org.timezone) ? TIMEZONES : [org.timezone, ...TIMEZONES]).map((z) => ({ value: z, label: tzLabel(z), hint: z }));

  const SHEETS: Record<Exclude<SheetKey, null>, { title: string; fields: FieldDef[]; initial: Record<string, unknown>; submit: (v: Record<string, any>) => Promise<void> }> = {
    company: {
      title: 'Company info',
      fields: [
        { key: 'name', label: 'Company name', type: 'text', required: true },
        { key: 'email', label: 'Email', type: 'email', placeholder: 'info@yourcompany.com' },
        { key: 'phone', label: 'Phone', type: 'phone', placeholder: '(555) 123-4567' },
        { key: 'website', label: 'Website', type: 'text', placeholder: 'yourcompany.com' },
        { key: 'address', label: 'Address', type: 'multiline' },
        { key: 'timezone', label: 'Time zone', type: 'select', options: timezoneOptions },
      ],
      initial: { name: org.name, email: org.email, phone: org.phone, website: org.website, address: org.address, timezone: org.timezone },
      submit: async (v) => save({ ...v, timezone: v.timezone || org.timezone }),
    },
    social: {
      title: 'Social media',
      fields: SOCIALS.map((s) => ({ key: s.key, label: s.label, type: 'text' as const, placeholder: s.placeholder })),
      initial: Object.fromEntries(SOCIALS.map((s) => [s.key, org[s.key]])),
      submit: save,
    },
    invoicing: {
      title: 'Invoicing & reviews',
      fields: [
        { key: 'tax_rate_pct', label: 'Default sales tax (%)', type: 'number', placeholder: '8.25' },
        { key: 'payment_terms_days', label: 'Payment terms (days)', type: 'number', placeholder: '30', hint: 'Invoices are due this many days after they are sent.' },
        { key: 'currency', label: 'Currency', type: 'select', options: ['USD', 'CAD', 'EUR', 'GBP', 'AUD', 'MXN', 'CHF', 'AED'].map((c) => ({ value: c, label: c })) },
        { key: 'google_review_url', label: 'Google review link', type: 'text', placeholder: 'https://g.page/r/…', hint: 'Shown on every invoice and payment page, and sent about a day after payment.' },
      ],
      initial: { tax_rate_pct: pctOf(org.tax_rate), payment_terms_days: String(org.payment_terms_days ?? 30), currency: org.currency, google_review_url: org.google_review_url },
      submit: async ({ tax_rate_pct, payment_terms_days, google_review_url, currency }) => {
        const tax = Number(tax_rate_pct) || 0;
        if (tax < 0 || tax > 30) throw new Error('Sales tax should be between 0 and 30%.');
        const url = google_review_url ? (/^https?:\/\//i.test(google_review_url) ? google_review_url : `https://${google_review_url}`) : null;
        await save({ tax_rate: tax / 100, payment_terms_days: Math.max(0, Math.round(Number(payment_terms_days) || 0)), google_review_url: url, currency: currency || org.currency });
      },
    },
    pricing: {
      title: 'Price guide',
      fields: [{ key: 'price_adjust_pct', label: 'Regional price adjustment (%)', type: 'number', placeholder: '0', hint: 'For example 10 raises guide prices by 10%; -5 lowers them by 5%. Between -50 and 200.' }],
      initial: { price_adjust_pct: String(Number(org.price_adjust_pct ?? 0)) },
      submit: async ({ price_adjust_pct }) => {
        const n = Number(price_adjust_pct) || 0;
        if (n < -50 || n > 200) throw new Error('Use a number between -50 and 200.');
        await save({ price_adjust_pct: n });
      },
    },
    documents: {
      title: 'Documents',
      fields: [
        { key: 'quote_prefix', label: 'Quote number prefix', type: 'text', required: true },
        { key: 'job_prefix', label: 'Work order prefix', type: 'text', required: true },
        { key: 'invoice_prefix', label: 'Invoice number prefix', type: 'text', required: true },
        { key: 'default_quote_terms', label: 'Default quote terms', type: 'multiline' },
        { key: 'default_invoice_notes', label: 'Default invoice notes', type: 'multiline' },
      ],
      initial: { quote_prefix: org.quote_prefix, job_prefix: org.job_prefix, invoice_prefix: org.invoice_prefix, default_quote_terms: org.default_quote_terms, default_invoice_notes: org.default_invoice_notes },
      submit: save,
    },
  };

  const uploadLogo = async () => {
    setError(null);
    try {
      const uri = await pickImage('library');
      if (!uri) return;
      setLogoBusy(true);
      // Public "branding" bucket: logos show on invoices, emails and the customer portal.
      const m = /\.(png|jpe?g|webp|gif)(\?|$)/i.exec(uri);
      const ext = (m?.[1] ?? 'jpg').toLowerCase().replace('jpeg', 'jpg');
      const type = ext === 'jpg' ? 'image/jpeg' : `image/${ext}`;
      const body = await (await fetch(uri)).arrayBuffer();
      const path = `${orgId}/logo-${Date.now()}.${ext}`;
      const up = await supabase.storage.from('branding').upload(path, body, { contentType: type, upsert: true });
      if (up.error) throw new Error(up.error.message);
      const { data } = supabase.storage.from('branding').getPublicUrl(path);
      await save({ logo_url: data.publicUrl });
    } catch (e: any) {
      setError(friendlyError(e.message));
    } finally {
      setLogoBusy(false);
    }
  };

  const manage = async () => {
    const url = await manageSubscriptionsUrl().catch(() => null);
    Linking.openURL(url ?? (Platform.OS === 'android' ? 'https://play.google.com/store/account/subscriptions' : 'https://apps.apple.com/account/subscriptions'));
  };

  // Web only: Stripe billing portal (change plan, card, invoices, cancel). Owner only.
  const manageBilling = async () => {
    setError(null);
    setBillingBusy(true);
    try {
      await openBillingPortal(orgId);
    } catch (e: any) {
      setError(e.message);
      setBillingBusy(false);
    }
  };

  const current = sheet ? SHEETS[sheet] : null;
  const edit = (k: Exclude<SheetKey, null>) => (admin ? <Button small kind="ghost" title="Edit" onPress={() => setSheet(k)} /> : null);
  const socials = SOCIALS.filter((s) => org[s.key]);

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Company profile & settings' }} />
      <ErrorBanner message={error} />
      {!admin ? (
        <Card style={{ backgroundColor: colors.infoSoft, borderColor: 'transparent' }}>
          <Row><IconTile icon="lock-closed-outline" tone="info" size={32} /><T style={{ flex: 1 }}>Only the owner or an admin can change company settings.</T></Row>
        </Card>
      ) : null}

      <Section title="Company info" action={edit('company')}>
        <Card>
          <Row gap={space.md} style={{ marginBottom: space.md }}>
            <View style={{ width: 64, height: 64, borderRadius: radius.md, backgroundColor: colors.cardRaised, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }}>
              {org.logo_url ? <Image source={{ uri: org.logo_url }} style={{ width: 64, height: 64 }} resizeMode="contain" accessibilityLabel="Company logo" />
                : <IconTile icon="image-outline" tone="neutral" size={64} />}
            </View>
            <View style={{ flex: 1 }}>
              <T style={{ fontWeight: '700', fontSize: 18 }} numberOfLines={2}>{org.name}</T>
              {admin ? (
                <Row style={{ marginTop: space.xs, flexWrap: 'wrap' }}>
                  <Button small kind="secondary" icon="cloud-upload-outline" title={org.logo_url ? 'Change logo' : 'Upload logo'} loading={logoBusy} onPress={uploadLogo} />
                  {org.logo_url ? <Button small kind="ghost" title="Remove" onPress={() => saveQuiet({ logo_url: null })} /> : null}
                </Row>
              ) : null}
            </View>
          </Row>
          <KeyValue label="Email" value={org.email ?? '—'} />
          <KeyValue label="Phone" value={org.phone ?? '—'} />
          <KeyValue label="Website" value={org.website ?? '—'} />
          <KeyValue label="Address" value={org.address ?? '—'} />
          <KeyValue label="Time zone" value={tzLabel(org.timezone)} />
          <T variant="small" style={{ marginTop: space.sm }}>
            These details appear as the sender on quotes and invoices. Invoices you already sent keep a snapshot of the details at the time they were sent.
          </T>
        </Card>
      </Section>

      <Section title="Social media" action={edit('social')}>
        <Card>
          {socials.length ? socials.map((s) => <KeyValue key={s.key} label={s.label} value={org[s.key]} />)
            : <T variant="muted">No social links yet. They show on your More page and customer portal.</T>}
        </Card>
      </Section>

      <Section title="Business type">
        <BusinessTypeCard orgId={orgId} types={businessTypes} editable={admin} onChanged={refresh} />
      </Section>

      <Section title="Invoicing & reviews" action={edit('invoicing')}>
        <Card>
          <KeyValue label="Sales tax" value={`${pctOf(org.tax_rate)}%`} />
          <KeyValue label="Payment terms" value={`Net ${org.payment_terms_days}`} />
          <KeyValue label="Currency" value={org.currency} />
          <KeyValue label="Review link" value={org.google_review_url ?? 'Not set'} />
          <View style={{ marginTop: space.md }}>
            <ToggleRow label="Auto-send invoices on completion" hint="When a job is marked complete, its invoice is emailed to the customer automatically."
              value={!!org.auto_send_invoices} onChange={(v) => (admin ? saveQuiet({ auto_send_invoices: v }) : undefined)} />
          </View>
        </Card>
      </Section>

      <Section title="Payments">
        <PaymentsCard org={org} plan={plan} editable={admin} isDemo={isDemo} onChanged={refresh} />
      </Section>

      <Section title="Price guide" action={edit('pricing')}>
        <Card>
          <KeyValue label="Regional adjustment" value={`${Number(org.price_adjust_pct) > 0 ? '+' : ''}${Number(org.price_adjust_pct ?? 0)}%`} />
          <T variant="small" style={{ marginTop: space.xs }}>Applied to Flight Ready price guide suggestions so they match prices in your area.</T>
        </Card>
      </Section>

      {admin ? (
        <Section title="Job costing & quality" icon="calculator-outline">
          <JobCostingCard org={org} onChanged={refresh} />
        </Section>
      ) : null}

      <Section title="Documents" action={edit('documents')}>
        <Card>
          <KeyValue label="Numbering" value={`${org.quote_prefix}… · ${org.job_prefix}… · ${org.invoice_prefix}…`} />
          <KeyValue label="Quote terms" value={org.default_quote_terms ?? 'None'} />
          <KeyValue label="Invoice notes" value={org.default_invoice_notes ?? 'None'} />
        </Card>
      </Section>

      <Section title="Subscription">
        <Card>
          <Row style={{ justifyContent: 'space-between' }}>
            <T variant="h3">{plan === 'trial' ? 'Free trial' : info?.name ?? 'No active plan'}</T>
            <Badge label={plan} tone={plan === 'expired' ? 'danger' : plan === 'trial' ? 'warning' : 'success'} />
          </Row>
          {info ? <T variant="muted">{org.billing_period === 'annual' ? `Yearly · $${info.annual.toFixed(2)}/yr` : `Monthly · $${info.monthly.toFixed(2)}/mo`}</T> : null}
          {plan === 'trial' ? <T variant="muted">{trialDays} day{trialDays === 1 ? '' : 's'} left · ends {date(org.trial_ends_at)}</T> : null}
          {org.plan_expires_at && plan !== 'expired' && plan !== 'trial' ? <T variant="muted">Renews or ends {date(org.plan_expires_at)}</T> : null}
          {stripeBilled && paid ? (
            <T variant="small" style={{ marginTop: space.xs }}>{webBilling ? 'Billed by card on the web.' : 'Your subscription is managed in your web account.'}</T>
          ) : null}
          {webBilling && storeManaged(org, plan) ? (
            <T variant="small" style={{ marginTop: space.xs }}>Your subscription is managed in {storeLabel(org)} on your phone.</T>
          ) : null}
          {admin ? (
            <Row style={{ marginTop: space.md, flexWrap: 'wrap' }}>
              <Button small icon="rocket-outline" title={plan === 'trial' || plan === 'expired' ? 'Choose a plan' : 'Change plan'} onPress={() => router.push('/paywall')} />
              {paid && !webBilling && !stripeBilled ? <Button small kind="secondary" title="Manage subscription" onPress={manage} /> : null}
            </Row>
          ) : null}
        </Card>
      </Section>

      {webBilling && role === 'owner' && stripeBilled && org.stripe_billing_customer_id ? (
        <Section title="Billing" icon="card-outline">
          <Card>
            <T variant="muted">Change your plan, update your card, download invoices or cancel your subscription.</T>
            <Row style={{ marginTop: space.md }}>
              <Button small kind="secondary" icon="card-outline" title="Manage billing" loading={billingBusy} onPress={manageBilling} />
            </Row>
          </Card>
        </Section>
      ) : null}

      <Section title={`About ${APP_NAME} CRM`}>
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          <ListRow icon="information-circle-outline" title="Website & plan information" subtitle={`Version ${appVersion()}`} onPress={() => router.push('/about')} />
          {SITE.pricing && webBilling ? <ListRow icon="pricetags-outline" title="Plans & pricing" onPress={() => openSite(SITE.pricing)} /> : null}
          <ListRow icon="shield-checkmark-outline" title="Privacy policy" onPress={() => openSite(SITE.privacy)} />
          {SITE.support ? <ListRow icon="help-buoy-outline" title="Support" onPress={() => openSite(SITE.support)} /> : null}
          <ListRow icon="person-circle-outline" title="Your login & security" subtitle="Your profile, password and devices" onPress={() => router.push('/account')} />
        </Card>
      </Section>

      {current ? (
        <FormSheet visible title={current.title} fields={current.fields} initial={current.initial}
          onClose={() => setSheet(null)}
          onSubmit={current.submit} />
      ) : null}
    </Screen>
  );
}

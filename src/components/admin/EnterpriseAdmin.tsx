// Platform admin: set up Enterprise & Franchise customers without SQL.
// Search a company, turn Franchise HQ on or off, and set a location limit (with the price it implies).
import { useState } from 'react';
import { View } from 'react-native';
import { confirmAction, notify } from '../FormSheet';
import { Badge, Button, Card, ErrorBanner, Field, Row, Section, Segmented, T } from '../ui';
import { useQuery } from '../../lib/useQuery';
import { money, titleCase } from '../../lib/format';
import { extraLocationsPrice, FLEET_INCLUDED_LOCATIONS, FRANCHISE_PRICING, franchiseQuote, PLANS } from '../../lib/plans';
import { callFunction, friendlyError } from '../../lib/supabase';
import { space } from '../../lib/theme';

type OrgRow = {
  id: string; name: string; email: string | null; plan: string; billing_source: string | null; billing_period: string | null;
  extra_locations: number; branch_limit: number | null; franchise_hq_enabled: boolean; active_locations: number; has_network: boolean;
  network: { id: string; name: string; billing_mode: 'all_in' | 'split' | null; founding_rate: boolean; billing_status: string | null; billed_locations: number; paid_through: string | null } | null;
};

const FLEET_MONTHLY = PLANS.find((p) => p.id === 'fleet')!.monthly;

export function EnterpriseAdmin() {
  const [query, setQuery] = useState('');
  const [rows, setRows] = useState<OrgRow[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const search = async () => {
    setBusy(true);
    setError(null);
    try { setRows((await callFunction<{ orgs: OrgRow[] }>('admin-action', { action: 'find_orgs', query })).orgs); }
    catch (e: any) { setError(friendlyError(e.message)); } finally { setBusy(false); }
  };
  return (
    <>
      <T variant="muted" style={{ marginBottom: space.md }}>
        Find a company to turn on Franchise HQ or set its location limit. Fleet owners billed on the website add extra locations themselves
        (Company locations); use a limit here for customers you invoice directly.
      </T>
      <FranchiseCalculator />
      <Card>
        <Field label="Company name or email" value={query} onChangeText={setQuery} placeholder="e.g. RealClean" />
        <Button title="Search" icon="search" onPress={search} loading={busy} disabled={query.trim().length < 2} />
      </Card>
      <ErrorBanner message={error} />
      {rows && rows.length === 0 ? <T variant="muted">No companies found.</T> : null}
      {(rows ?? []).map((o) => <OrgCard key={o.id} org={o} onSaved={search} />)}
    </>
  );
}

function OrgCard({ org, onSaved }: { org: OrgRow; onSaved: () => Promise<void> }) {
  const [limit, setLimit] = useState(org.branch_limit == null ? '' : String(org.branch_limit));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const n = limit.trim() === '' ? null : Number(limit);
  const valid = n === null || (Number.isInteger(n) && n >= 1 && n <= 1000);
  const priceFor = (locations: number) => FLEET_MONTHLY + extraLocationsPrice(locations - FLEET_INCLUDED_LOCATIONS);
  const currentLimit = org.branch_limit ?? FLEET_INCLUDED_LOCATIONS + (org.plan === 'fleet' ? org.extra_locations : 0);

  const save = async (patch: Record<string, unknown>, done: string) => {
    setBusy(true);
    setError(null);
    try {
      await callFunction('admin-action', { action: 'set_enterprise', org_id: org.id, ...patch });
      notify('Saved', done);
      await onSaved();
    } catch (e: any) { setError(friendlyError(e.message)); } finally { setBusy(false); }
  };
  const toggleHq = () => {
    const on = !org.franchise_hq_enabled;
    if (!on && org.has_network) {
      confirmAction('Turn off Franchise HQ?', 'Their existing network keeps working; they just can’t create a new one.', () => save({ franchise_hq_enabled: false }, 'Franchise HQ turned off.'));
    } else {
      save({ franchise_hq_enabled: on }, on ? 'Franchise HQ is on. The owner was notified.' : 'Franchise HQ turned off.');
    }
  };

  return (
    <Section title={org.name} icon="business-outline">
      <Card>
        <Row style={{ flexWrap: 'wrap' }} gap={space.sm}>
          <Badge label={titleCase(org.plan)} tone="primary" raw />
          {org.billing_source ? <Badge label={org.billing_source === 'stripe' ? 'Billed on web' : 'Billed in app store'} tone="neutral" raw /> : null}
          {org.franchise_hq_enabled ? <Badge label="Franchise HQ on" tone="success" raw /> : null}
          {org.has_network ? <Badge label="Has a network" tone="info" raw /> : null}
        </Row>
        {org.email ? <T variant="small" style={{ marginTop: space.xs }}>{org.email}</T> : null}
        <T style={{ marginTop: space.sm }}>
          {org.active_locations} active location{org.active_locations === 1 ? '' : 's'} · limit {currentLimit}
          {org.branch_limit != null ? ' (set by you)' : org.extra_locations && org.plan === 'fleet' ? ` (Fleet + ${org.extra_locations} billed)` : ''}
        </T>

        <View style={{ marginTop: space.md }}>
          <Button kind={org.franchise_hq_enabled ? 'secondary' : 'primary'} icon="git-network-outline"
            title={org.franchise_hq_enabled ? 'Turn off Franchise HQ' : 'Turn on Franchise HQ'} onPress={toggleHq} loading={busy} />
        </View>

        <View style={{ marginTop: space.md }}>
          <Field label="Location limit (empty = Fleet’s 5 plus what they buy)" value={limit} onChangeText={setLimit} keyboardType="number-pad" />
          {n && valid ? (
            <T variant="small">
              Suggested price for {n} locations: {money(priceFor(Math.max(n, FLEET_INCLUDED_LOCATIONS)))}/month
              {n > FLEET_INCLUDED_LOCATIONS ? ` (Fleet + ${n - FLEET_INCLUDED_LOCATIONS} × $39, $29 from the 21st)` : ' (Fleet)'}
            </T>
          ) : null}
          {!valid ? <T variant="small">Enter a whole number from 1 to 1,000, or leave it empty.</T> : null}
          <Button kind="secondary" title="Save location limit" icon="save-outline" style={{ marginTop: space.sm }} loading={busy}
            disabled={!valid || n === org.branch_limit}
            onPress={() => save({ branch_limit: n }, n == null ? 'Back to the plan default.' : `Limit set to ${n} locations.`)} />
        </View>
        <ErrorBanner message={error} />
        {org.network ? <NetworkBilling network={org.network} onSaved={onSaved} /> : null}
      </Card>
    </Section>
  );
}

type Status = { mode: 'all_in' | 'split' | null; founding: boolean; status: string | null; active: boolean; locations: number; billed_locations: number; monthly_cents: number | null; paid_through: string | null };

/** Support sets how a franchise network pays, then bills it by invoice or lets HQ start card billing. */
function NetworkBilling({ network, onSaved }: { network: NonNullable<OrgRow['network']>; onSaved: () => Promise<void> }) {
  const q = useQuery(async () => callFunction<Status>('franchise-billing', { action: 'status', network_id: network.id }), [network.id]);
  const [mode, setMode] = useState<'all_in' | 'split'>(network.billing_mode ?? 'all_in');
  const [founding, setFounding] = useState(network.founding_rate);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const s = q.data;
  const quote = franchiseQuote(s?.locations ?? 0);
  const run = async (fn: () => Promise<unknown>, done: string) => {
    setBusy(true);
    setError(null);
    try { await fn(); notify('Done', done); await Promise.all([q.reload(), onSaved()]); }
    catch (e: any) { setError(friendlyError(e.message)); } finally { setBusy(false); }
  };
  const save = () => run(() => callFunction('admin-action', { action: 'set_franchise_billing', network_id: network.id, mode, founding }), 'Billing settings saved.');
  const invoice = () => confirmAction('Bill this network by invoice?', 'Stripe emails the HQ owner an invoice every month, due in 30 days, for the current number of locations.',
    () => run(() => callFunction('franchise-billing', { action: 'invoice', network_id: network.id }), 'Invoice billing started. Stripe sends the first invoice now.'));
  const sync = () => run(() => callFunction('franchise-billing', { action: 'sync', network_id: network.id }), 'Stripe now matches the network’s locations.');
  const price = mode === 'all_in' ? (founding ? quote.foundingAllIn : quote.allIn) : quote.split.hq;

  return (
    <View style={{ marginTop: space.lg }}>
      <T style={{ fontWeight: '700' }}>Franchise billing · {network.name}</T>
      <T variant="small" style={{ marginTop: 2 }}>
        {s ? `${s.locations} franchisee location${s.locations === 1 ? '' : 's'} · ${s.active ? `billing ${s.status}, ${s.billed_locations} billed` : 'not billing yet'}` : 'Loading…'}
      </T>
      <View style={{ marginTop: space.sm }}>
        <Segmented value={mode} onChange={setMode} options={[{ value: 'all_in', label: 'All-in (HQ pays)' }, { value: 'split', label: 'Split' }]} />
      </View>
      {mode === 'all_in' ? (
        <Button small kind={founding ? 'primary' : 'secondary'} icon={founding ? 'checkmark' : 'pricetag-outline'} style={{ marginTop: space.sm }}
          title={founding ? 'Founding network rate on ($129 for 12 months)' : 'Give founding network rate'} onPress={() => setFounding(!founding)} />
      ) : null}
      <T variant="small" style={{ marginTop: space.sm }}>
        {mode === 'all_in'
          ? `HQ pays ${money(price)}/month for every franchisee location; franchisees are covered on Team.`
          : `HQ pays ${money(price)}/month for Franchise HQ; each franchisee pays its own plan with 15% off.`}
      </T>
      <ErrorBanner message={error ?? q.error} />
      <Row style={{ flexWrap: 'wrap', marginTop: space.sm }} gap={space.sm}>
        <Button small kind="secondary" icon="save-outline" title="Save billing settings" onPress={save} loading={busy}
          disabled={mode === network.billing_mode && founding === network.founding_rate} />
        {s && !s.active && network.billing_mode ? <Button small icon="document-text-outline" title="Bill by invoice (net 30)" onPress={invoice} loading={busy} /> : null}
        {s?.active ? <Button small kind="secondary" icon="sync-outline" title="Sync locations now" onPress={sync} loading={busy} /> : null}
      </Row>
      {s && !s.active && network.billing_mode ? (
        <T variant="small" style={{ marginTop: space.sm }}>Or the HQ owner can start card billing in Franchise HQ → Dashboard.</T>
      ) : null}
    </View>
  );
}

/** Quote a franchise network: all-in (HQ pays) or split (franchisees pay their own plan). */
function FranchiseCalculator() {
  const [locations, setLocations] = useState('10');
  const n = Number(locations);
  const valid = Number.isInteger(n) && n > 0 && n <= 5000;
  const q = franchiseQuote(valid ? n : 0);
  const line = (label: string, value: string, strong = false) => (
    <Row style={{ justifyContent: 'space-between', paddingVertical: 3 }} gap={space.sm}>
      <T style={{ flex: 1, fontWeight: strong ? '700' : '400' }}>{label}</T>
      <T style={{ fontWeight: strong ? '700' : '400' }}>{value}</T>
    </Row>
  );
  return (
    <Section title="Franchise price calculator" icon="calculator-outline">
      <Card>
        <Field label="Number of locations" value={locations} onChangeText={setLocations} keyboardType="number-pad" />
        {!valid ? <T variant="small">Enter a number of locations.</T> : (
          <>
            <T variant="small" style={{ fontWeight: '700', marginTop: space.xs }}>All-in (HQ pays for every location)</T>
            {line(`${n} × ${money(FRANCHISE_PRICING.allIn)}`, `${money(q.allIn)}/mo`, true)}
            {line('Yearly', `${money(q.allIn * 12)}/yr`)}
            {line(`Founding network rate (${money(FRANCHISE_PRICING.foundingAllIn)}, 12 months)`, `${money(q.foundingAllIn)}/mo`)}
            <T variant="small" style={{ fontWeight: '700', marginTop: space.md }}>Split (franchisees pay their own plan)</T>
            {line(`HQ: ${n} × ${money(FRANCHISE_PRICING.hqPerLocation)} Franchise HQ`, `${money(q.split.hq)}/mo`)}
            {line(`Each franchisee: Team at 15% off`, `${money(q.split.franchiseePlan)}/mo`)}
            {line('Network total', `${money(q.split.total)}/mo`, true)}
            <T variant="small" style={{ marginTop: space.sm }}>HQ pays at least {money(FRANCHISE_PRICING.hqMinimum)}/month either way.</T>
          </>
        )}
      </Card>
    </Section>
  );
}

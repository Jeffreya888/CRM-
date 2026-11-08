// Platform admin: set up Enterprise & Franchise customers without SQL.
// Search a company, turn Franchise HQ on or off, and set a location limit (with the price it implies).
import { useState } from 'react';
import { View } from 'react-native';
import { confirmAction, notify } from '../FormSheet';
import { Badge, Button, Card, ErrorBanner, Field, Row, Section, T } from '../ui';
import { money, titleCase } from '../../lib/format';
import { extraLocationsPrice, FLEET_INCLUDED_LOCATIONS, PLANS } from '../../lib/plans';
import { callFunction, friendlyError } from '../../lib/supabase';
import { space } from '../../lib/theme';

type OrgRow = {
  id: string; name: string; email: string | null; plan: string; billing_source: string | null; billing_period: string | null;
  extra_locations: number; branch_limit: number | null; franchise_hq_enabled: boolean; active_locations: number; has_network: boolean;
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
      </Card>
    </Section>
  );
}

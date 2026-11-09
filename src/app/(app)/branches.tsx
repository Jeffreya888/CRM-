import { Stack } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { confirmAction, FormSheet, notify, type FieldDef } from '../../components/FormSheet';
import { Gate } from '../../components/Gate';
import { Badge, Button, Card, EmptyState, ErrorBanner, Fab, ListRow, Row, Screen, Section, T } from '../../components/ui';
import { canAdmin, extraLocationsPrice, FLEET_INCLUDED_LOCATIONS, PLANS } from '../../lib/plans';
import { useOrg } from '../../lib/session';
import { callFunction, friendlyError, must, supabase } from '../../lib/supabase';
import { money } from '../../lib/format';
import type { Branch } from '../../lib/types';
import { colors, space } from '../../lib/theme';
import { useQuery } from '../../lib/useQuery';

const FIELDS: FieldDef[] = [
  { key: 'name', label: 'Location name', type: 'text', required: true, placeholder: 'e.g. Teterboro (TEB)' },
  { key: 'address', label: 'Address', type: 'multiline' },
  { key: 'phone', label: 'Phone', type: 'phone' },
  { key: 'timezone', label: 'Time zone', type: 'text', placeholder: 'America/New_York', hint: 'Leave blank to use the company time zone.' },
  { key: 'active', label: 'Active', type: 'toggle', hint: 'Turn off to hide this location without losing its history.' },
];

export default function Branches() {
  return (
    <>
      <Stack.Screen options={{ title: 'Company locations' }} />
      <Gate feature="branches" body="Run several bases or shops from one account and filter jobs, schedules, invoices and profit by location.">
        <BranchList />
      </Gate>
    </>
  );
}

function BranchList() {
  const { orgId, role, org, plan, branchId, setBranchId, refresh } = useOrg();
  const admin = canAdmin(role);
  const [editing, setEditing] = useState<Partial<Branch> | null>(null);
  const q = useQuery(async () => (await must(supabase.from('branches').select('*').eq('org_id', orgId).order('active', { ascending: false }).order('name'))) as Branch[], [orgId]);
  const rows = q.data ?? [];
  const active = rows.filter((b) => b.active);
  const inactive = rows.filter((b) => !b.active);
  const limitQ = useQuery(async () => (await must(supabase.rpc('org_branch_limit', { p_org: orgId }))) as number, [orgId]);
  const limit = typeof limitQ.data === 'number' ? limitQ.data : null;

  const row = (b: Branch) => (
    <ListRow key={b.id} icon="business-outline" tone={b.active ? 'info' : 'neutral'} title={b.name}
      subtitle={[b.address, b.phone].filter(Boolean).join(' · ') || null}
      meta={b.timezone ?? null}
      right={!b.active ? <Badge label="inactive" tone="neutral" /> : b.id === branchId ? <Badge raw label="Selected" tone="primary" /> : undefined}
      onPress={admin ? () => setEditing(b) : undefined} />
  );

  return (
    <>
      <Screen refreshing={q.refreshing} onRefresh={q.refresh}>
        <ErrorBanner message={q.error} onRetry={q.refresh} />
        <T variant="muted" style={{ marginBottom: space.md }}>
          Locations your company operates from. Jobs, schedules, quotes, invoices and profit can be filtered by location on the dashboard. Customers, assets and services are shared across all locations.
        </T>
        {limit != null ? (
          <T variant="small" style={{ marginBottom: space.md }}>
            {active.length} of {limit} active locations used.{active.length >= limit ? ' Turn one off to add another, or contact us about Enterprise for more.' : ''}
          </T>
        ) : null}
        {!q.loading && rows.length === 0 ? (
          <EmptyState icon="business-outline" title="No locations yet"
            body={admin ? 'Add your first location, for example each airport base or shop.' : 'Your company has not added any locations.'} />
        ) : null}
        {active.length ? <Card style={{ padding: 0, overflow: 'hidden' }}>{active.map(row)}</Card> : null}
        {inactive.length ? (
          <Section title="Inactive" titleColor={colors.textMuted}>
            <Card style={{ padding: 0, overflow: 'hidden' }}>{inactive.map(row)}</Card>
          </Section>
        ) : null}
        {!admin ? <T variant="small" style={{ marginTop: space.md }}>Only the owner or an admin can add or change locations.</T> : null}
        {role === 'owner' && plan === 'fleet' && org.branch_limit == null ? (
          <BilledLocations activeCount={active.length} onChanged={async () => { await refresh(); await limitQ.reload(); }} />
        ) : null}
      </Screen>
      {admin ? <Fab label="Add location" onPress={() => setEditing({ active: true })} /> : null}
      <FormSheet visible={!!editing} title={editing?.id ? 'Edit location' : 'New location'} fields={FIELDS}
        initial={editing ?? undefined}
        onClose={() => setEditing(null)}
        onSubmit={async (v) => {
          const values: Record<string, any> = { ...v, timezone: v.timezone || null };
          const { error } = editing?.id
            ? await supabase.from('branches').update(values).eq('id', editing.id)
            : await supabase.from('branches').insert({ ...values, org_id: org.id });
          if (error) throw new Error(friendlyError(error.message));
          if (editing?.id && !values.active && editing.id === branchId) setBranchId(null);
          await q.reload();
        }} />
    </>
  );
}

/** Fleet owners add or remove billed locations beyond the 5 included (web subscriptions). */
function BilledLocations({ activeCount, onChanged }: { activeCount: number; onChanged: () => Promise<void> }) {
  const { org } = useOrg();
  const billed = org.extra_locations ?? 0;
  const [extra, setExtra] = useState(billed);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const period = org.billing_period === 'annual' ? 'annual' : 'monthly';
  const per = period === 'annual' ? 'year' : 'month';
  const min = Math.max(0, activeCount - FLEET_INCLUDED_LOCATIONS);
  const save = () => confirmAction(
    extra > billed ? `Add ${extra - billed} location${extra - billed === 1 ? '' : 's'}?` : 'Remove billed locations?',
    `Your plan becomes ${FLEET_INCLUDED_LOCATIONS + extra} locations: Fleet plus ${money(extraLocationsPrice(extra, period))}/${per} for ${extra} extra. The change is prorated on your next invoice.`,
    async () => {
      setBusy(true);
      setError(null);
      try {
        await callFunction('billing-locations', { org_id: org.id, action: 'set', extra });
        await onChanged();
        notify('Locations updated', `You can now have up to ${FLEET_INCLUDED_LOCATIONS + extra} active locations.`);
      } catch (e: any) { setError(e.message); } finally { setBusy(false); }
    });
  return (
    <Section title="Need more locations?" icon="add-circle-outline">
      <Card>
        <T variant="muted">
          Fleet includes {FLEET_INCLUDED_LOCATIONS} locations. Each extra location is $39/month (from the 21st location, $29), and adds 100 AI photo checks,
          1,200 Ask Tarmo questions and 600 texts a month.
        </T>
        <Row style={{ alignItems: 'center', marginTop: space.md }} gap={space.md}>
          <Button small kind="secondary" icon="remove" title="" onPress={() => setExtra((n) => Math.max(min, n - 1))} disabled={extra <= min || busy} />
          <View style={{ flex: 1, alignItems: 'center' }}>
            <T style={{ fontWeight: '700', fontSize: 18 }}>{FLEET_INCLUDED_LOCATIONS + extra} locations</T>
            <T variant="small">{extra ? `+${money(extraLocationsPrice(extra, period))}/${per} for ${extra} extra` : 'Included in Fleet'}</T>
          </View>
          <Button small kind="secondary" icon="add" title="" onPress={() => setExtra((n) => Math.min(500, n + 1))} disabled={busy} />
        </Row>
        <ErrorBanner message={error} />
        <Button title={extra === billed ? 'No change' : 'Update billing'} icon="card-outline" onPress={save} loading={busy} disabled={extra === billed} style={{ marginTop: space.md }} />
        {billed > 0 ? <SwitchPeriod period={period} extra={billed} onChanged={onChanged} /> : null}
      </Card>
    </Section>
  );
}

/** Monthly ↔ yearly for a Fleet plan with extra locations (moves both charges together). */
function SwitchPeriod({ period, extra, onChanged }: { period: 'monthly' | 'annual'; extra: number; onChanged: () => Promise<void> }) {
  const { org } = useOrg();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fleet = PLANS.find((p) => p.id === 'fleet')!;
  const to = period === 'annual' ? 'monthly' : 'annual';
  const yearly = fleet.annual + extraLocationsPrice(extra, 'annual');
  const monthly = fleet.monthly + extraLocationsPrice(extra, 'monthly');
  const switchNow = () => confirmAction(
    to === 'annual' ? 'Switch to yearly billing?' : 'Switch to monthly billing?',
    to === 'annual'
      ? `You'll pay ${money(yearly)}/year instead of ${money(monthly)}/month (two months free), and card payments through Tarmo have no platform fee. You're charged now for the rest of the year, minus what's left of this month.`
      : `You'll pay ${money(monthly)}/month instead of ${money(yearly)}/year. What's left of your year is credited to your next invoices.`,
    async () => {
      setBusy(true);
      setError(null);
      try {
        await callFunction('billing-locations', { org_id: org.id, action: 'switch_period', period: to });
        await onChanged();
        notify('Billing updated', to === 'annual' ? 'You’re now billed yearly.' : 'You’re now billed monthly.');
      } catch (e: any) { setError(e.message); } finally { setBusy(false); }
    });
  return (
    <View style={{ marginTop: space.md }}>
      <T variant="small">
        Billed {period === 'annual' ? `yearly: ${money(yearly)}/year` : `monthly: ${money(monthly)}/month`} for Fleet and {extra} extra location{extra === 1 ? '' : 's'}.
      </T>
      <ErrorBanner message={error} />
      <Button small kind="secondary" icon="swap-horizontal-outline" loading={busy} style={{ marginTop: space.sm }}
        title={to === 'annual' ? `Switch to yearly (${money(yearly)}/year)` : 'Switch to monthly'} onPress={switchNow} />
    </View>
  );
}

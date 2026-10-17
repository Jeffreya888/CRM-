import { Stack } from 'expo-router';
import { useState } from 'react';
import { FormSheet, type FieldDef } from '../../components/FormSheet';
import { Gate } from '../../components/Gate';
import { Badge, Card, EmptyState, ErrorBanner, Fab, ListRow, Screen, Section, T } from '../../components/ui';
import { canAdmin } from '../../lib/plans';
import { useOrg } from '../../lib/session';
import { friendlyError, must, supabase } from '../../lib/supabase';
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
  const { orgId, role, org, branchId, setBranchId } = useOrg();
  const admin = canAdmin(role);
  const [editing, setEditing] = useState<Partial<Branch> | null>(null);
  const q = useQuery(async () => (await must(supabase.from('branches').select('*').eq('org_id', orgId).order('active', { ascending: false }).order('name'))) as Branch[], [orgId]);
  const rows = q.data ?? [];
  const active = rows.filter((b) => b.active);
  const inactive = rows.filter((b) => !b.active);

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
      </Screen>
      {admin ? <Fab label="Add location" onPress={() => setEditing({ active: true })} /> : null}
      <FormSheet visible={!!editing} title={editing?.id ? 'Edit location' : 'New location'} fields={FIELDS}
        initial={editing ?? undefined}
        onClose={() => setEditing(null)}
        onSubmit={async (v) => {
          const values = { ...v, timezone: v.timezone || null };
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

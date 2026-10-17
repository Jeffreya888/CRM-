import { Stack } from 'expo-router';
import { useState } from 'react';
import { ActivityFeed, ENTITY_LABELS } from '../../components/team/ActivityFeed';
import { EmptyState, Screen, Select, T } from '../../components/ui';
import { canAdmin } from '../../lib/plans';
import { useOrg } from '../../lib/session';
import { must, supabase } from '../../lib/supabase';
import { space } from '../../lib/theme';
import { useQuery } from '../../lib/useQuery';

/** Company activity log (owner/admin): who changed what, filterable by member and record type. */
export default function Activity() {
  const { orgId, role } = useOrg();
  const admin = canAdmin(role);
  const [actor, setActor] = useState<string | null>(null);
  const [entity, setEntity] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const people = useQuery(async () => ((await must(supabase.from('memberships').select('user_id, display_name, active').eq('org_id', orgId).order('display_name'))) ?? []) as
    { user_id: string; display_name: string | null; active: boolean }[], [orgId]);
  const nameOf = (id: string | null) => (id ? people.data?.find((p) => p.user_id === id)?.display_name ?? 'Former member' : 'Flight Ready (automatic)');

  if (!admin) {
    return (
      <Screen>
        <Stack.Screen options={{ title: 'Activity log' }} />
        <EmptyState icon="lock-closed-outline" title="Owners and admins only" body="The activity log shows every change made in the company." />
      </Screen>
    );
  }
  return (
    <Screen refreshing={false} onRefresh={() => { setNonce((n) => n + 1); people.reload(); }}>
      <Stack.Screen options={{ title: 'Activity log' }} />
      <T variant="muted" style={{ marginBottom: space.md }}>Every change to customers, assets, jobs, quotes, invoices, payments, expenses, the team and pay periods.</T>
      <Select label="Member" value={actor} onChange={setActor} allowClear placeholder="Everyone" searchable
          options={(people.data ?? []).map((p) => ({ value: p.user_id, label: p.display_name ?? 'Team member', hint: p.active ? undefined : 'deactivated' }))} />
      <Select label="Record type" value={entity} onChange={setEntity} allowClear placeholder="All records"
        options={Object.entries(ENTITY_LABELS).map(([value, label]) => ({ value, label }))} />
      <ActivityFeed key={nonce} orgId={orgId} actor={actor} entity={entity} nameOf={nameOf} />
    </Screen>
  );
}

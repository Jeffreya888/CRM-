import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { FlatList, View } from 'react-native';
import { Gate } from '../../../components/Gate';
import { Badge, Button, Card, EmptyState, ErrorBanner, IconTile, Loading, Row, SearchBar, Segmented, StatTile, T } from '../../../components/ui';
import {
  EQUIPMENT_STATUS, maintenanceState, warrantyBadge, type DueState, type Equipment, type MaintenanceDue,
} from '../../../lib/inventory';
import { useLookups } from '../../../lib/lookups';
import { isManager } from '../../../lib/plans';
import { useOrg } from '../../../lib/session';
import { must, supabase } from '../../../lib/supabase';
import { colors, space } from '../../../lib/theme';
import { useQuery } from '../../../lib/useQuery';

type Filter = 'all' | 'due' | 'issues' | 'out' | 'mine' | 'retired';

export default function EquipmentList() {
  return (
    <Gate feature="inventory">
      <EquipmentInner />
    </Gate>
  );
}

function EquipmentInner() {
  const { orgId, role, session } = useOrg();
  const { memberName } = useLookups();
  const manager = isManager(role);
  const me = session?.user.id;
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');

  const q = useQuery(async () => {
    const [eq, due, issues] = await Promise.all([
      must(supabase.from('equipment').select('*').eq('org_id', orgId).order('name')),
      must(supabase.from('equipment_maintenance_due').select('*').eq('org_id', orgId)),
      must(supabase.from('equipment_issues').select('equipment_id').eq('org_id', orgId).eq('status', 'open')),
    ]);
    const dueBy: Record<string, { state: DueState; label: string; name: string }> = {};
    const items = (eq ?? []) as Equipment[];
    for (const m of (due ?? []) as MaintenanceDue[]) {
      const st = maintenanceState(m, Number(items.find((e) => e.id === m.equipment_id)?.usage_hours ?? m.usage_hours));
      const cur = dueBy[m.equipment_id];
      const rank = (s: DueState) => (s === 'overdue' ? 2 : s === 'soon' ? 1 : 0);
      if (!cur || rank(st.state) > rank(cur.state)) dueBy[m.equipment_id] = { ...st, name: m.name };
    }
    const issueCount: Record<string, number> = {};
    for (const r of (issues ?? []) as { equipment_id: string }[]) issueCount[r.equipment_id] = (issueCount[r.equipment_id] ?? 0) + 1;
    return { items, dueBy, issueCount };
  }, [orgId]);

  if (!q.data && !q.error) return <><Stack.Screen options={{ title: 'Equipment' }} /><Loading /></>;

  const items = q.data?.items ?? [];
  const dueBy = q.data?.dueBy ?? {};
  const issueCount = q.data?.issueCount ?? {};
  const working = items.filter((e) => e.status !== 'retired');
  const due = working.filter((e) => dueBy[e.id] && dueBy[e.id]!.state !== 'ok');
  const withIssues = working.filter((e) => issueCount[e.id]);
  const out = working.filter((e) => e.status === 'out_of_service');
  const mine = working.filter((e) => e.assigned_user_id && e.assigned_user_id === me);
  const retired = items.filter((e) => e.status === 'retired');
  const base = { all: working, due, issues: withIssues, out, mine, retired }[filter];
  const s = search.trim().toLowerCase();
  const rows = base.filter((e) => !s || [e.name, e.serial_number, e.category, e.assigned_label].some((x) => x?.toLowerCase().includes(s)));

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Stack.Screen options={{
        title: 'Equipment',
        headerRight: () => manager ? <Button small icon="add" title="Add" onPress={() => router.push('/equipment/edit')} /> : null,
      }} />
      <FlatList
        data={rows}
        keyExtractor={(e) => e.id}
        refreshing={q.refreshing}
        onRefresh={q.refresh}
        contentContainerStyle={{ padding: space.lg, paddingBottom: 110 }}
        ListHeaderComponent={
          <View>
            <ErrorBanner message={q.error} onRetry={q.reload} />
            <Row gap={space.md} style={{ flexWrap: 'wrap', marginBottom: space.md }}>
              <StatTile label="Maintenance due" value={due.length} icon="build-outline" tone={due.length ? 'warning' : 'success'} onPress={() => setFilter('due')} />
              <StatTile label="Open problems" value={withIssues.length} icon="alert-circle-outline" tone={withIssues.length ? 'danger' : 'success'} onPress={() => setFilter('issues')} />
            </Row>
            <Row gap={space.sm} style={{ flexWrap: 'wrap', marginBottom: space.md }}>
              <Button small kind="secondary" icon="qr-code-outline" title="Scan a label" onPress={() => router.push({ pathname: '/scan', params: { mode: 'equipment' } })} />
              {manager && working.length ? <Button small kind="secondary" icon="print-outline" title="Print all labels" onPress={() => router.push('/equipment/label')} /> : null}
            </Row>
            <SearchBar value={search} onChange={setSearch} placeholder="Name, serial, van, category" />
            <Segmented value={filter} onChange={setFilter} options={[
              { value: 'all' as const, label: 'All', count: working.length },
              { value: 'due' as const, label: 'Due', count: due.length },
              { value: 'issues' as const, label: 'Problems', count: withIssues.length },
              { value: 'out' as const, label: 'Out of service', count: out.length },
              ...(mine.length ? [{ value: 'mine' as const, label: 'Checked out to me', count: mine.length }] : []),
              ...(retired.length ? [{ value: 'retired' as const, label: 'Retired', count: retired.length }] : []),
            ]} />
          </View>
        }
        ListEmptyComponent={
          items.length === 0 ? (
            <EmptyState icon="construct-outline" title="No equipment yet"
              body="Pressure washers, polishers, lifts, extractors, vans. Track maintenance, warranties and who has what — and print QR labels."
              action={manager ? <Button title="Add equipment" icon="add" onPress={() => router.push('/equipment/edit')} /> : undefined} />
          ) : <EmptyState icon="checkmark-circle-outline" title="Nothing here" body="No equipment matches this filter." />
        }
        renderItem={({ item: e }) => {
          const st = EQUIPMENT_STATUS[e.status] ?? EQUIPMENT_STATUS.in_service;
          const d = dueBy[e.id];
          const w = warrantyBadge(e.warranty_expires_on);
          const issues = issueCount[e.id] ?? 0;
          const who = [e.assigned_user_id ? memberName(e.assigned_user_id) : null, e.assigned_label].filter(Boolean).join(' · ');
          return (
            <Card onPress={() => router.push(`/equipment/${e.id}`)} style={{ padding: space.md }}>
              <Row gap={space.md} style={{ alignItems: 'flex-start' }}>
                <IconTile icon={e.status === 'out_of_service' ? 'lock-closed-outline' : 'construct-outline'} tone={st.tone === 'success' ? 'primary' : st.tone} />
                <View style={{ flex: 1 }}>
                  <T style={{ fontWeight: '700' }} numberOfLines={1}>{e.name}</T>
                  <T variant="muted" numberOfLines={1}>{[e.serial_number ? `S/N ${e.serial_number}` : null, who || null].filter(Boolean).join(' · ') || e.category || ' '}</T>
                  {d && d.state !== 'ok' ? <T variant="small" style={{ color: d.state === 'overdue' ? colors.danger : colors.warning }} numberOfLines={1}>{`${d.name}: ${d.label}`}</T> : null}
                  <Row gap={4} style={{ marginTop: 6, flexWrap: 'wrap' }}>
                    <Badge label={st.label} tone={st.tone} raw />
                    {issues ? <Badge label={`${issues} problem${issues === 1 ? '' : 's'}`} tone="danger" raw /> : null}
                    {e.bookable ? <Badge label="Bookable" tone="info" raw /> : null}
                    {w ? <Badge label={w.label} tone={w.tone} raw /> : null}
                  </Row>
                </View>
              </Row>
            </Card>
          );
        }}
      />
    </View>
  );
}

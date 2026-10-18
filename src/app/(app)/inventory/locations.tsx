import { Stack } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { FormSheet, type FieldDef } from '../../../components/FormSheet';
import { Gate } from '../../../components/Gate';
import { Badge, Button, Card, EmptyState, ErrorBanner, ListRow, Loading, Screen, T } from '../../../components/ui';
import { fmtQty as fmtNum } from '../../../components/inventory/qty';
import { STOCK_LOCATION_KINDS, type StockByLocation, type StockLocation } from '../../../lib/inventory';
import { useLookups } from '../../../lib/lookups';
import { isManager } from '../../../lib/plans';
import { useOrg } from '../../../lib/session';
import { must, supabase } from '../../../lib/supabase';
import { space } from '../../../lib/theme';
import { useQuery } from '../../../lib/useQuery';

export default function StockLocations() {
  return (
    <>
      <Stack.Screen options={{ title: 'Vans & locations' }} />
      <Gate feature="stock_locations">
        <LocationsInner />
      </Gate>
    </>
  );
}

function LocationsInner() {
  const { orgId, role, can } = useOrg();
  const { branchOptions } = useLookups();
  const manager = isManager(role);
  const [editing, setEditing] = useState<Partial<StockLocation> | null>(null);

  const q = useQuery(async () => {
    const [locs, stock] = await Promise.all([
      must(supabase.from('stock_locations').select('*').eq('org_id', orgId).order('name')),
      must(supabase.from('stock_by_location').select('item_id, stock_location_id, quantity').eq('org_id', orgId)),
    ]);
    const counts: Record<string, { units: number; items: number }> = {};
    for (const r of (stock ?? []) as StockByLocation[]) {
      if (!r.stock_location_id || Number(r.quantity) <= 0) continue;
      const c = (counts[r.stock_location_id] ??= { units: 0, items: 0 });
      c.units += Number(r.quantity);
      c.items += 1;
    }
    return { locs: (locs ?? []) as StockLocation[], counts };
  }, [orgId]);

  if (!q.data) return <Screen>{q.error ? <ErrorBanner message={q.error} onRetry={q.reload} /> : <Loading />}</Screen>;

  const fields: FieldDef[] = [
    { key: 'name', label: 'Name', type: 'text', required: true, placeholder: 'Van 2, Main shop, Hangar 4' },
    { key: 'kind', label: 'Type', type: 'select', options: STOCK_LOCATION_KINDS },
    ...(can('branches') && branchOptions.length ? [{ key: 'branch_id', label: 'Company location (branch)', type: 'select', options: branchOptions, allowClear: true } as FieldDef] : []),
    { key: 'active', label: 'Active', type: 'toggle' },
  ];

  return (
    <Screen refreshing={q.refreshing} onRefresh={q.refresh}>
      <T variant="muted" style={{ marginBottom: space.md }}>
        Track stock in your shop, each van, branch or hangar. Receive, adjust, transfer and count stock per location from each supply.
      </T>
      <ErrorBanner message={q.error} onRetry={q.reload} />
      {manager ? <Button icon="add" title="Add location" onPress={() => setEditing({ kind: 'van', active: true })} style={{ marginBottom: space.md }} /> : null}
      {q.data.locs.length === 0 ? (
        <EmptyState icon="car-outline" title="No locations yet" body="Add your shop and each van so you know what is on board before heading out." />
      ) : (
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          {q.data.locs.map((l) => {
            const c = q.data!.counts[l.id];
            return (
              <ListRow key={l.id}
                icon={l.kind === 'van' ? 'car-outline' : l.kind === 'hangar' ? 'airplane-outline' : l.kind === 'shop' ? 'home-outline' : 'business-outline'}
                tone={l.active ? 'primary' : 'neutral'}
                title={l.name}
                subtitle={STOCK_LOCATION_KINDS.find((k) => k.value === l.kind)?.label ?? l.kind}
                meta={c ? `${c.items} item${c.items === 1 ? '' : 's'} · ${fmtNum(c.units)} units` : 'Empty'}
                right={l.active ? undefined : <View><Badge label="Inactive" /></View>}
                onPress={manager ? () => setEditing(l) : undefined} />
            );
          })}
        </Card>
      )}
      <FormSheet
        visible={!!editing}
        title={editing?.id ? 'Edit location' : 'New location'}
        initial={editing ?? {}}
        fields={fields}
        onClose={() => setEditing(null)}
        onSubmit={async (v) => {
          const row = { name: v.name, kind: v.kind ?? 'other', branch_id: v.branch_id ?? null, active: v.active !== false };
          const { error } = editing?.id
            ? await supabase.from('stock_locations').update(row).eq('id', editing.id)
            : await supabase.from('stock_locations').insert({ ...row, org_id: orgId });
          if (error) throw error;
          q.reload();
        }}
        onDelete={editing?.id ? async () => {
          const { error } = await supabase.from('stock_locations').delete().eq('id', editing.id!);
          if (error) throw error;
          q.reload();
        } : undefined}
      />
    </Screen>
  );
}

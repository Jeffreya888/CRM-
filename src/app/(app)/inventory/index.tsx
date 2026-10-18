import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { FlatList, View } from 'react-native';
import { confirmAction, notify } from '../../../components/FormSheet';
import { Gate } from '../../../components/Gate';
import { StockSheet } from '../../../components/inventory/StockSheet';
import { Badge, Button, Card, EmptyState, ErrorBanner, IconTile, Loading, Row, SearchBar, Segmented, StatTile, T } from '../../../components/ui';
import { money } from '../../../lib/format';
import { fmtQty as fmtNum } from '../../../components/inventory/qty';
import { expiryBadge, isLow, type InventoryItem, type StockLocation } from '../../../lib/inventory';
import { canEdit, isManager } from '../../../lib/plans';
import { useOrg } from '../../../lib/session';
import { callFunction, friendlyError, must, supabase } from '../../../lib/supabase';
import { colors, space } from '../../../lib/theme';
import { useQuery } from '../../../lib/useQuery';

type Filter = 'all' | 'reorder' | 'expiring' | 'inactive';

export default function SupplyRoom() {
  return (
    <Gate feature="inventory">
      <SupplyList />
    </Gate>
  );
}

function SupplyList() {
  const { orgId, role, perm, can } = useOrg();
  const showMoney = perm('see_prices');
  const manager = isManager(role);
  const writable = canEdit(role);
  const fleet = can('stock_locations');
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const [adjust, setAdjust] = useState<InventoryItem | null>(null);
  const [sending, setSending] = useState(false);

  const q = useQuery(async () => {
    const [items, locs] = await Promise.all([
      must(supabase.from('inventory_items').select('*').eq('org_id', orgId).order('name')),
      fleet ? must(supabase.from('stock_locations').select('*').eq('org_id', orgId).order('name')) : Promise.resolve([]),
    ]);
    return { items: (items ?? []) as InventoryItem[], locations: (locs ?? []) as StockLocation[] };
  }, [orgId, fleet]);

  const all = q.data?.items ?? [];
  const active = all.filter((i) => i.active !== false);
  const low = active.filter(isLow);
  const expiring = active.filter((i) => expiryBadge(i.expires_on));
  const inactive = all.filter((i) => i.active === false);
  const s = search.trim().toLowerCase();
  const base = filter === 'reorder' ? low : filter === 'expiring' ? expiring : filter === 'inactive' ? inactive : active;
  const rows = base.filter((i) => !s || [i.name, i.sku, i.barcode, i.vendor, i.category].some((x) => x?.toLowerCase().includes(s)));
  const stockValue = active.reduce((sum, i) => sum + Math.max(0, Number(i.quantity)) * Number(i.unit_cost || 0), 0);

  const emailAll = () => {
    const withEmail = low.filter((i) => i.vendor_email);
    const missing = low.length - withEmail.length;
    if (!withEmail.length) {
      notify('No vendor emails yet', 'Add a vendor email to your low items (open the item → Edit) and we can email the order for you.');
      return;
    }
    const vendors = new Set(withEmail.map((i) => i.vendor_email!.toLowerCase())).size;
    confirmAction(
      'Email reorder?',
      `We'll email ${vendors === 1 ? 'your vendor' : `${vendors} vendors`} an order for ${withEmail.length} low item${withEmail.length === 1 ? '' : 's'}, using each item's reorder quantity.${missing ? `\n\n${missing} item${missing === 1 ? ' has' : 's have'} no vendor email and will be skipped.` : ''}`,
      async () => {
        setSending(true);
        try {
          const r = await callFunction<{ emailed: number }>('send-reorder', { org_id: orgId, item_ids: withEmail.map((i) => i.id) });
          notify('Order sent', `Emailed ${r?.emailed ?? vendors} vendor${(r?.emailed ?? vendors) === 1 ? '' : 's'}. Tap "Mark received" on each item when it arrives.`);
        } catch (e: any) {
          notify('Could not send', friendlyError(e.message));
        } finally {
          setSending(false);
        }
      },
    );
  };

  if (!q.data && !q.error) return <><Stack.Screen options={{ title: 'Supply room' }} /><Loading /></>;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Stack.Screen options={{
        title: 'Supply room',
        headerRight: () => manager ? <Button small icon="add" title="Add" onPress={() => router.push('/inventory/edit')} /> : null,
      }} />
      <FlatList
        data={rows}
        keyExtractor={(i) => i.id}
        refreshing={q.refreshing}
        onRefresh={q.refresh}
        contentContainerStyle={{ padding: space.lg, paddingBottom: 110 }}
        ListHeaderComponent={
          <View>
            <ErrorBanner message={q.error} onRetry={q.reload} />
            <Row gap={space.md} style={{ flexWrap: 'wrap', marginBottom: space.md }}>
              <StatTile label="Reorder list" value={low.length} icon="alert-circle-outline" tone={low.length ? 'danger' : 'success'} onPress={() => setFilter('reorder')} />
              {showMoney
                ? <StatTile label="Stock value" value={money(stockValue)} icon="cash-outline" tone="primary" />
                : <StatTile label="Items" value={active.length} icon="cube-outline" tone="primary" />}
            </Row>
            <Row gap={space.sm} style={{ flexWrap: 'wrap', marginBottom: space.md }}>
              <Button small kind="secondary" icon="scan-outline" title="Scan" onPress={() => router.push('/scan')} />
              {writable ? <Button small kind="secondary" icon="clipboard-outline" title="Count" onPress={() => router.push('/inventory/count')} /> : null}
              <Button small kind="secondary" icon="car-outline" title="Vans & locations" onPress={() => router.push('/inventory/locations')} />
            </Row>
            <SearchBar value={search} onChange={setSearch} placeholder="Name, SKU, barcode, vendor, category" />
            <Segmented value={filter} onChange={setFilter} options={[
              { value: 'all' as const, label: 'All', count: active.length },
              { value: 'reorder' as const, label: 'Reorder list only', count: low.length },
              { value: 'expiring' as const, label: 'Expiring', count: expiring.length },
              ...(inactive.length ? [{ value: 'inactive' as const, label: 'Inactive', count: inactive.length }] : []),
            ]} />
            {filter === 'reorder' ? (
              <Card>
                <Row gap={space.md} style={{ alignItems: 'flex-start' }}>
                  <IconTile icon="notifications-outline" tone="warning" />
                  <View style={{ flex: 1 }}>
                    <T style={{ fontWeight: '700' }}>Low-stock alerts are automatic</T>
                    <T variant="muted">When an item drops to its par level, owners and managers get a push alert. Everything at or below par shows here.</T>
                  </View>
                </Row>
                {manager && low.length ? (
                  <Button style={{ marginTop: space.md }} icon="mail-outline" title="Email order of all low items" loading={sending} onPress={emailAll} />
                ) : null}
              </Card>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          all.length === 0 ? (
            <EmptyState icon="cube-outline" title="No supplies tracked yet"
              body="Add wash concentrate, polish, towels and ceramic kits. Set a par level and we'll alert you when stock runs low."
              action={manager ? <Button title="Add a supply" icon="add" onPress={() => router.push('/inventory/edit')} /> : undefined} />
          ) : filter === 'reorder' && !s ? (
            <EmptyState icon="checkmark-circle-outline" title="Nothing to reorder" body="Every item is above its par level." />
          ) : (
            <EmptyState icon="search-outline" title="No matches" body="Try a different search or filter." />
          )
        }
        renderItem={({ item: i }) => {
          const lowNow = isLow(i);
          const exp = expiryBadge(i.expires_on);
          return (
            <Card onPress={() => router.push(`/inventory/${i.id}`)} style={{ padding: space.md }}>
              <Row gap={space.md}>
                <IconTile icon="flask-outline" tone={lowNow ? 'danger' : 'primary'} />
                <View style={{ flex: 1 }}>
                  <T style={{ fontWeight: '700' }} numberOfLines={1}>{i.name}</T>
                  <T variant="muted" numberOfLines={1}>
                    {`${fmtNum(i.quantity)} ${i.unit} on hand`}{Number(i.par_level) > 0 ? ` · par ${fmtNum(i.par_level)}` : ''}
                  </T>
                  <T variant="small" numberOfLines={1}>
                    {[i.category, i.vendor, showMoney && Number(i.unit_cost) ? `${money(i.unit_cost)}/${i.unit}` : null].filter(Boolean).join(' · ') || ' '}
                  </T>
                  {lowNow || exp ? (
                    <Row gap={4} style={{ marginTop: 4, flexWrap: 'wrap' }}>
                      {lowNow ? <Badge label="Low" tone="danger" /> : null}
                      {exp ? <Badge label={exp.label} tone={exp.tone} raw /> : null}
                    </Row>
                  ) : null}
                </View>
                {writable && i.active !== false ? <Button small kind="secondary" title="Adjust" onPress={() => setAdjust(i)} /> : null}
              </Row>
            </Card>
          );
        }}
      />
      <StockSheet
        item={adjust}
        mode="adjust"
        orgId={orgId}
        locations={q.data?.locations ?? []}
        useLocations={fleet && (q.data?.locations.length ?? 0) > 0}
        showMoney={showMoney}
        onClose={() => setAdjust(null)}
        onDone={q.reload}
      />
    </View>
  );
}

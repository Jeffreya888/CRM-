import { router } from 'expo-router';
import { useState } from 'react';
import { FlatList, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CustomerCard, type CustomerCardData } from '../../../components/customers/CustomerCard';
import { Avatar, Badge, Button, EmptyState, ErrorBanner, Fab, Ionicons, ListRow, PageTitle, Row, SearchBar, Segmented, T, TableHeader, TableRow, useContentStyle, type Column } from '../../../components/ui';
import { assetIcon, assetModelName } from '../../../lib/assets';
import { initials } from '../../../lib/format';
import { useIsDesktop } from '../../../lib/layout';
import { isManager } from '../../../lib/plans';
import { categoryLabel } from '../../../lib/pricing';
import { useOrg } from '../../../lib/session';
import { must, supabase } from '../../../lib/supabase';
import { colors, space } from '../../../lib/theme';
import type { AssetType } from '../../../lib/types';
import { useQuery } from '../../../lib/useQuery';

type AssetLite = {
  id: string; tail_number: string; manufacturer: string | null; model: string | null; plate: string | null; vin: string | null;
  hull_id: string | null; asset_type: AssetType; active: boolean; category: any; customer_id: string | null;
};
type CRow = CustomerCardData & { assets: AssetLite[] };
type Item = { kind: 'customer'; c: CRow } | { kind: 'asset'; a: AssetLite; owner: string | null } | { kind: 'header'; title: string };

// Desktop table columns.
const COLUMNS: Column[] = [
  { label: 'Customer', flex: 2.4 },
  { label: 'Status', width: 100 },
  { label: 'Assets', flex: 1.2 },
  { label: 'Phone', flex: 1.3 },
  { label: 'Email', flex: 2 },
  { label: '', width: 20 },
];

function AssetCounts({ c }: { c: CRow }) {
  const counts = (['aircraft', 'vehicle', 'watercraft'] as AssetType[])
    .map((t) => ({ t, n: c.assets.filter((a) => a.active && a.asset_type === t).length }))
    .filter((x) => x.n > 0);
  if (!counts.length) return <T variant="small">No assets</T>;
  return (
    <Row gap={space.md}>
      {counts.map((x) => (
        <Row key={x.t} gap={4}>
          <Ionicons name={assetIcon(x.t)} size={15} color={colors.warning} />
          <T style={{ fontSize: 14 }}>{x.n}</T>
        </Row>
      ))}
    </Row>
  );
}

export default function Customers() {
  const { orgId, role, perm } = useOrg();
  const desktop = useIsDesktop();
  const desk = useContentStyle();
  const [status, setStatus] = useState<'all' | 'active' | 'lead' | 'inactive'>('all');
  const [search, setSearch] = useState('');

  const q = useQuery(async () => {
    const [customers, unowned] = await Promise.all([
      must(supabase.from('customers')
        .select('id, name, company, status, email, phone, sms_opted_out, assets:aircraft(id, tail_number, manufacturer, model, plate, vin, hull_id, asset_type, active, category, customer_id)')
        .eq('org_id', orgId).order('name')),
      must(supabase.from('aircraft').select('id, tail_number, manufacturer, model, plate, vin, hull_id, asset_type, active, category, customer_id')
        .eq('org_id', orgId).is('customer_id', null)),
    ]);
    return { customers: (customers ?? []) as unknown as CRow[], unowned: (unowned ?? []) as AssetLite[] };
  }, [orgId]);

  const all = q.data?.customers ?? [];
  const assetCount = all.reduce((s, c) => s + c.assets.filter((a) => a.active).length, 0) + (q.data?.unowned ?? []).filter((a) => a.active).length;
  const s = search.trim().toLowerCase();
  const assetHit = (a: AssetLite) => [a.tail_number, a.manufacturer, a.model, assetModelName(a), a.plate, a.vin, a.hull_id].some((x) => x?.toLowerCase().includes(s));

  const byStatus = all.filter((c) => status === 'all' || c.status === status);
  const customers = byStatus.filter((c) => !s || [c.name, c.company, c.email, c.phone].some((x) => x?.toLowerCase().includes(s)) || c.assets.some(assetHit));
  const items: Item[] = customers.map((c) => ({ kind: 'customer' as const, c }));
  if (s) {
    const assets: Item[] = [
      ...all.flatMap((c) => c.assets.filter(assetHit).map((a) => ({ kind: 'asset' as const, a, owner: c.name }))),
      ...(q.data?.unowned ?? []).filter(assetHit).map((a) => ({ kind: 'asset' as const, a, owner: null })),
    ];
    if (assets.length) items.push({ kind: 'header', title: `Assets (${assets.length})` }, ...assets.slice(0, 50));
  }

  const count = (st: string) => all.filter((c) => c.status === st).length;
  const leadsAllowed = isManager(role) && perm('see_prices');

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <FlatList
        data={items}
        keyExtractor={(it, i) => (it.kind === 'customer' ? it.c.id : it.kind === 'asset' ? `a-${it.a.id}` : `h-${i}`)}
        refreshing={q.refreshing}
        onRefresh={q.refresh}
        ListHeaderComponent={
          <View style={desk ? undefined : { padding: space.lg, paddingBottom: 0 }}>
            <PageTitle
              title="Customers"
              subtitle={q.data ? `${all.length} customer${all.length === 1 ? '' : 's'}, ${assetCount} asset${assetCount === 1 ? '' : 's'}` : ' '}
              right={desktop && perm('edit_customers') ? <Button small icon="add" title="New customer" onPress={() => router.push('/customers/new')} /> : undefined}
            />
            <Row style={{ flexWrap: 'wrap', marginBottom: space.md }}>
              <Button small kind="secondary" icon="airplane-outline" title="All assets" onPress={() => router.push('/aircraft')} />
              {leadsAllowed ? <Button small kind="secondary" icon="funnel-outline" title="Leads" onPress={() => router.push('/leads')} /> : null}
              <Button small kind="secondary" icon="location-outline" title="Facilities" onPress={() => router.push('/facilities')} />
            </Row>
            <SearchBar value={search} onChange={setSearch} placeholder="Name, phone, tail number, plate, model" />
            <Segmented value={status} onChange={setStatus} options={[
              { value: 'all', label: 'All', count: all.length },
              { value: 'active', label: 'Active', count: count('active') },
              { value: 'lead', label: 'Leads', count: count('lead') },
              { value: 'inactive', label: 'Inactive', count: count('inactive') },
            ]} />
            <ErrorBanner message={q.error} onRetry={q.reload} />
            {desktop && customers.length ? <TableHeader columns={COLUMNS} /> : null}
          </View>
        }
        renderItem={({ item, index }) => {
          if (item.kind === 'header') return <T variant="overline" style={{ marginHorizontal: desk ? 0 : space.lg, marginTop: desk ? space.xl : space.md, marginBottom: space.sm }}>{item.title}</T>;
          if (item.kind === 'asset') {
            const a = item.a;
            return (
              <View style={{ marginHorizontal: desk ? 0 : space.lg, borderRadius: 12, overflow: 'hidden', marginBottom: 6 }}>
                <ListRow icon={assetIcon(a.asset_type)} tone="warning" title={a.tail_number + (a.active ? '' : ' (inactive)')}
                  subtitle={assetModelName(a) || categoryLabel(a.category)} meta={item.owner ?? 'No owner'}
                  onPress={() => router.push(`/aircraft/${a.id}`)} />
              </View>
            );
          }
          if (desktop) {
            const c = item.c;
            return (
              <TableRow columns={COLUMNS} last={index === customers.length - 1} onPress={() => router.push(`/customers/${c.id}`)}
                cells={[
                  <Row key="n" gap={space.md}>
                    <Avatar label={initials(c.name)} size={36} />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <T style={{ fontWeight: '700', fontSize: 15 }} numberOfLines={1}>{c.name}</T>
                      {c.company ? <T variant="small" numberOfLines={1}>{c.company}</T> : null}
                    </View>
                  </Row>,
                  <Badge key="s" label={c.status === 'lead' ? 'Lead' : c.status === 'inactive' ? 'Inactive' : 'Active'} tone={c.status === 'lead' ? 'info' : c.status === 'inactive' ? 'neutral' : 'success'} />,
                  <AssetCounts key="a" c={c} />,
                  c.phone ? <T variant="muted" numberOfLines={1}>{c.phone}</T> : null,
                  c.email ? <T variant="muted" numberOfLines={1}>{c.email}</T> : null,
                  <Ionicons key="x" name="chevron-forward" size={18} color={colors.textFaint} />,
                ]} />
            );
          }
          return <CustomerCard c={item.c} onPress={() => router.push(`/customers/${item.c.id}`)} />;
        }}
        ListEmptyComponent={q.loading ? null : s ? (
          <EmptyState icon="search-outline" title="No matches" body="Try a name, phone number, tail number, plate or model." />
        ) : (
          <EmptyState icon="people-outline" title={status === 'all' ? 'No customers yet' : `No ${status === 'lead' ? 'leads' : status} customers`}
            body="Add the owners, operators and companies you work for, with their aircraft, vehicles or boats."
            action={perm('edit_customers') ? <Button title="Add customer" icon="add" onPress={() => router.push('/customers/new')} /> : undefined} />
        )}
        contentContainerStyle={[{ paddingBottom: 110 }, desk, desk && { paddingBottom: 64 }]}
      />
      {perm('edit_customers') && !desktop ? <Fab onPress={() => router.push('/customers/new')} label="New customer" /> : null}
    </SafeAreaView>
  );
}

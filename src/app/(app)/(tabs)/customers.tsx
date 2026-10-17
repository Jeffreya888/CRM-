import { router } from 'expo-router';
import { useState } from 'react';
import { FlatList, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CustomerCard, type CustomerCardData } from '../../../components/customers/CustomerCard';
import { Button, EmptyState, ErrorBanner, Fab, ListRow, PageTitle, Row, SearchBar, Segmented, T } from '../../../components/ui';
import { assetIcon, assetModelName } from '../../../lib/assets';
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

export default function Customers() {
  const { orgId, role, perm } = useOrg();
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
          <View style={{ padding: space.lg, paddingBottom: 0 }}>
            <PageTitle
              title="Customers"
              subtitle={q.data ? `${all.length} customer${all.length === 1 ? '' : 's'}, ${assetCount} asset${assetCount === 1 ? '' : 's'}` : ' '}
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
          </View>
        }
        renderItem={({ item }) => {
          if (item.kind === 'header') return <T variant="overline" style={{ marginHorizontal: space.lg, marginTop: space.md, marginBottom: space.sm }}>{item.title}</T>;
          if (item.kind === 'asset') {
            const a = item.a;
            return (
              <View style={{ marginHorizontal: space.lg, borderRadius: 12, overflow: 'hidden', marginBottom: 6 }}>
                <ListRow icon={assetIcon(a.asset_type)} tone="warning" title={a.tail_number + (a.active ? '' : ' (inactive)')}
                  subtitle={assetModelName(a) || categoryLabel(a.category)} meta={item.owner ?? 'No owner'}
                  onPress={() => router.push(`/aircraft/${a.id}`)} />
              </View>
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
        contentContainerStyle={{ paddingBottom: 110 }}
      />
      {perm('edit_customers') ? <Fab onPress={() => router.push('/customers/new')} label="New customer" /> : null}
    </SafeAreaView>
  );
}

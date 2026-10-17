import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { FlatList, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { confirmAction } from '../../../components/FormSheet';
import { Gate } from '../../../components/Gate';
import { Badge, Button, Card, EmptyState, ErrorBanner, Field, IconTile, Loading, Row, Screen, SearchBar, Section, Select, T } from '../../../components/ui';
import { money } from '../../../lib/format';
import { fmtNum, parseWhole, type InventoryItem, type StockByLocation, type StockLocation } from '../../../lib/inventory';
import { canEdit } from '../../../lib/plans';
import { useOrg } from '../../../lib/session';
import { friendlyError, must, supabase } from '../../../lib/supabase';
import { colors, radius, space } from '../../../lib/theme';
import { useQuery } from '../../../lib/useQuery';

const ALL = '__all__';
type Result = { item: InventoryItem; expected: number; counted: number; delta: number; error?: string };

export default function CountMode() {
  return (
    <>
      <Stack.Screen options={{ title: 'Count mode' }} />
      <Gate feature="inventory">
        <CountInner />
      </Gate>
    </>
  );
}

function CountInner() {
  const { orgId, role, perm, can } = useOrg();
  const fleet = can('stock_locations');
  const showMoney = perm('see_prices');
  const [location, setLocation] = useState<string>(ALL);
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [search, setSearch] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [results, setResults] = useState<Result[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const q = useQuery(async () => {
    const [items, locs, stock] = await Promise.all([
      must(supabase.from('inventory_items').select('*').eq('org_id', orgId).eq('active', true).order('category', { nullsFirst: false }).order('name')),
      fleet ? must(supabase.from('stock_locations').select('*').eq('org_id', orgId).eq('active', true).order('name')) : Promise.resolve([]),
      fleet ? must(supabase.from('stock_by_location').select('item_id, stock_location_id, quantity').eq('org_id', orgId)) : Promise.resolve([]),
    ]);
    return { items: (items ?? []) as InventoryItem[], locations: (locs ?? []) as StockLocation[], stock: (stock ?? []) as StockByLocation[] };
  }, [orgId, fleet]);

  if (!canEdit(role)) return <Screen><ErrorBanner message="Viewers can't record counts." /></Screen>;
  if (!q.data) return <Screen>{q.error ? <ErrorBanner message={q.error} onRetry={q.reload} /> : <Loading />}</Screen>;

  const { items, locations, stock } = q.data;
  const locId = location === ALL ? null : location;
  const expectedFor = (i: InventoryItem) => {
    if (!locId) return Number(i.quantity);
    return Number(stock.find((s) => s.item_id === i.id && s.stock_location_id === locId)?.quantity ?? 0);
  };
  const s = search.trim().toLowerCase();
  const rows = items.filter((i) => !s || [i.name, i.sku, i.barcode, i.category].some((x) => x?.toLowerCase().includes(s)));
  const entered = items.filter((i) => (counts[i.id] ?? '').trim() !== '');
  const invalid = entered.filter((i) => parseWhole(counts[i.id]) == null);

  const finish = () => {
    if (!entered.length) return setError('Enter at least one counted quantity.');
    if (invalid.length) return setError(`Counts are whole numbers. Check: ${invalid.map((i) => i.name).join(', ')}`);
    setError(null);
    confirmAction('Save count?', `Save counts for ${entered.length} item${entered.length === 1 ? '' : 's'}${locId ? ` at ${locations.find((l) => l.id === locId)?.name}` : ''}? Any difference is logged as a count correction.`, async () => {
      setSaving(true);
      const out: Result[] = [];
      for (const i of entered) {
        const counted = parseWhole(counts[i.id])!;
        const expected = expectedFor(i);
        try {
          const { data, error: e } = await supabase.rpc('record_count', { p_item: i.id, p_counted: counted, p_location: locId, p_note: note.trim() || null });
          if (e) throw e;
          out.push({ item: i, expected, counted, delta: Number(data ?? counted - expected) });
        } catch (e: any) {
          out.push({ item: i, expected, counted, delta: 0, error: friendlyError(e.message) });
        }
      }
      setSaving(false);
      setResults(out);
      setCounts({});
      q.reload();
    });
  };

  if (results) {
    const diffs = results.filter((r) => r.delta !== 0 && !r.error);
    const failed = results.filter((r) => r.error);
    const value = diffs.reduce((sum, r) => sum + r.delta * Number(r.item.unit_cost || 0), 0);
    return (
      <Screen>
        <Card>
          <Row gap={space.md}>
            <IconTile icon="checkmark-done-outline" tone="success" size={48} />
            <View style={{ flex: 1 }}>
              <T variant="h3">Count saved</T>
              <T variant="muted">{`${results.length - failed.length} counted · ${diffs.length} correction${diffs.length === 1 ? '' : 's'}`}</T>
              {showMoney && diffs.length ? <T variant="small">{`Net value change ${value >= 0 ? '+' : ''}${money(value)}`}</T> : null}
            </View>
          </Row>
        </Card>
        <Section title="Differences" icon="git-compare-outline">
          {diffs.length === 0 && !failed.length ? <EmptyState icon="thumbs-up-outline" title="Everything matched" body="No corrections were needed." /> : null}
          {[...failed, ...diffs].map((r) => (
            <Card key={r.item.id} style={{ padding: space.md }} onPress={() => router.push(`/inventory/${r.item.id}`)}>
              <Row style={{ justifyContent: 'space-between' }} gap={space.md}>
                <View style={{ flex: 1 }}>
                  <T style={{ fontWeight: '700' }}>{r.item.name}</T>
                  {r.error ? <T variant="small" style={{ color: colors.danger }}>{r.error}</T>
                    : <T variant="muted">{`Expected ${fmtNum(r.expected)} · counted ${fmtNum(r.counted)} ${r.item.unit}`}</T>}
                </View>
                {r.error ? <Badge label="Not saved" tone="danger" raw /> : <Badge label={`${r.delta > 0 ? '+' : ''}${fmtNum(r.delta)}`} tone={r.delta > 0 ? 'success' : 'danger'} raw />}
              </Row>
            </Card>
          ))}
        </Section>
        <Row gap={space.sm} style={{ marginTop: space.lg }}>
          <Button style={{ flex: 1 }} kind="secondary" title="Count again" onPress={() => setResults(null)} />
          <Button style={{ flex: 1 }} title="Done" onPress={() => router.back()} />
        </Row>
      </Screen>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <FlatList
        data={rows}
        keyExtractor={(i) => i.id}
        keyboardShouldPersistTaps="handled"
        refreshing={q.refreshing}
        onRefresh={q.refresh}
        contentContainerStyle={{ padding: space.lg, paddingBottom: 140 }}
        ListHeaderComponent={
          <View>
            <T variant="muted" style={{ marginBottom: space.md }}>
              Walk the shelves and type what you actually find (whole numbers). Leave an item blank to skip it. Differences are logged as count corrections.
            </T>
            {fleet && locations.length ? (
              <Select label="Counting at" value={location} onChange={(v) => { setLocation(v ?? ALL); setCounts({}); }}
                options={[{ value: ALL, label: 'Everything (all locations)' }, ...locations.map((l) => ({ value: l.id, label: l.name }))]} />
            ) : null}
            <SearchBar value={search} onChange={setSearch} placeholder="Find an item" />
            <ErrorBanner message={error ?? q.error} />
            <T variant="small" style={{ marginBottom: space.sm }}>{`${entered.length} of ${items.length} counted`}</T>
          </View>
        }
        ListEmptyComponent={<EmptyState icon="cube-outline" title={items.length ? 'No matches' : 'No supplies to count'} />}
        renderItem={({ item: i }) => {
          const expected = expectedFor(i);
          const raw = counts[i.id] ?? '';
          const n = parseWhole(raw);
          const diff = n == null ? null : n - expected;
          return (
            <Card style={{ padding: space.md }}>
              <Row gap={space.md}>
                <View style={{ flex: 1 }}>
                  <T style={{ fontWeight: '700' }} numberOfLines={1}>{i.name}</T>
                  <T variant="small">{`${i.category ? i.category + ' · ' : ''}expected ${fmtNum(expected)} ${i.unit}`}</T>
                  {raw.trim() !== '' ? (
                    n == null ? <T variant="small" style={{ color: colors.danger }}>Whole numbers only</T>
                      : diff === 0 ? <T variant="small" style={{ color: colors.success }}>Matches</T>
                        : <T variant="small" style={{ color: colors.warning }}>{`${diff! > 0 ? '+' : ''}${fmtNum(diff)} difference`}</T>
                  ) : null}
                </View>
                <TextInput
                  value={raw}
                  onChangeText={(v) => setCounts((c) => ({ ...c, [i.id]: v.replace(/[^0-9]/g, '') }))}
                  keyboardType="number-pad"
                  placeholder="—"
                  placeholderTextColor={colors.textFaint}
                  accessibilityLabel={`Counted ${i.name}`}
                  style={{ width: 84, textAlign: 'center', fontSize: 20, fontWeight: '700', color: colors.text, backgroundColor: colors.input, borderWidth: 1, borderColor: n == null && raw ? colors.danger : colors.border, borderRadius: radius.md, paddingVertical: 10 }}
                />
              </Row>
            </Card>
          );
        }}
        ListFooterComponent={entered.length ? (
          <Field label="Note for this count (optional)" value={note} onChangeText={setNote} placeholder="Monthly count, Van 2 restock" />
        ) : null}
      />
      <SafeAreaView edges={['bottom']} style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: space.lg, backgroundColor: colors.bg, borderTopWidth: 1, borderTopColor: colors.border }}>
        <Button title={entered.length ? `Save count (${entered.length})` : 'Save count'} icon="checkmark-done-outline" loading={saving} disabled={!entered.length} onPress={finish} />
      </SafeAreaView>
    </View>
  );
}

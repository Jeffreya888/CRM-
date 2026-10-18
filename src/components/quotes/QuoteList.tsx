import { subDays } from 'date-fns';
import { router, Stack } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, View } from 'react-native';
import { quoteTone } from '../status';
import { Badge, Button, EmptyState, ErrorBanner, Fab, IconButton, Ionicons, ListRow, Row, SearchBar, Segmented, StatTile, T, ToggleRow } from '../ui';
import { dateTime, money, moneyShort } from '../../lib/format';
import { useOrg } from '../../lib/session';
import { supabase } from '../../lib/supabase';
import { colors, space } from '../../lib/theme';
import { useQuery } from '../../lib/useQuery';
import type { Quote, QuoteStatus } from '../../lib/types';
import { deadlineOf, effectiveStatus, viewedLabel } from './quoteUtils';
import { StartFromPhotosButton } from '../ai/StartFromPhotos';

type Filter = 'all' | QuoteStatus;
type QRow = Pick<Quote, 'id' | 'number' | 'status' | 'total' | 'valid_until' | 'valid_until_at' | 'view_count' | 'last_viewed_at' | 'accepted_at' | 'declined_at' | 'superseded_by' | 'version' | 'branch_id' | 'deposit_amount' | 'deposit_paid_at'> & {
  customer: { name: string } | null; aircraft: { tail_number: string } | null; options: { id: string }[];
};

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'All' }, { value: 'draft', label: 'Draft' }, { value: 'sent', label: 'Sent' }, { value: 'viewed', label: 'Viewed' },
  { value: 'accepted', label: 'Accepted' }, { value: 'declined', label: 'Declined' }, { value: 'expired', label: 'Expired' },
];

export function QuoteList() {
  const { orgId, perm, branchId } = useOrg();
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const [showOld, setShowOld] = useState(false);
  const allowed = perm('see_prices');

  const q = useQuery(async () => {
    if (!allowed) return [] as QRow[];
    let query = supabase.from('quotes')
      .select('id, number, status, total, valid_until, valid_until_at, view_count, last_viewed_at, accepted_at, declined_at, superseded_by, version, branch_id, deposit_amount, deposit_paid_at, customer:customers(name), aircraft:aircraft(tail_number), options:quote_options!quote_options_quote_id_fkey(id)')
      .eq('org_id', orgId).order('created_at', { ascending: false }).limit(500);
    if (branchId) query = query.eq('branch_id', branchId);
    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []) as unknown as QRow[];
  }, [orgId, branchId, allowed]);

  const all = useMemo(() => (q.data ?? []).map((r) => ({ ...r, eff: effectiveStatus(r) })), [q.data]);
  const current = all.filter((r) => showOld || !r.superseded_by);

  const stats = useMemo(() => {
    const live = all.filter((r) => !r.superseded_by);
    const open = live.filter((r) => r.eff === 'sent' || r.eff === 'viewed');
    const since = subDays(new Date(), 90).getTime();
    const won = live.filter((r) => r.status === 'accepted' && r.accepted_at && new Date(r.accepted_at).getTime() >= since).length;
    const lost = live.filter((r) => r.status === 'declined' && r.declined_at && new Date(r.declined_at).getTime() >= since).length;
    return {
      openValue: open.reduce((s, r) => s + Number(r.total), 0),
      openCount: open.length,
      winRate: won + lost ? Math.round((won / (won + lost)) * 100) : null,
      won, lost,
    };
  }, [all]);

  const s = search.trim().toLowerCase();
  const rows = current
    .filter((r) => filter === 'all' || r.eff === filter)
    .filter((r) => !s || [r.number, r.customer?.name, r.aircraft?.tail_number].some((x) => x?.toLowerCase().includes(s)));
  const counts = Object.fromEntries(FILTERS.map((f) => [f.value, f.value === 'all' ? current.length : current.filter((r) => r.eff === f.value).length]));

  if (!allowed) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <Stack.Screen options={{ title: 'Quotes' }} />
        <EmptyState icon="lock-closed-outline" title="Quotes are hidden for your role" body="Ask your company owner for access to prices to see quotes." />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Stack.Screen options={{ title: 'Quotes', headerRight: () => <IconButton icon="bookmarks-outline" label="Quote templates" onPress={() => router.push('/quotes/templates')} /> }} />
      <FlatList
        data={rows}
        keyExtractor={(d) => d.id}
        refreshing={q.refreshing}
        onRefresh={q.refresh}
        ListHeaderComponent={
          <View style={{ padding: space.lg, paddingBottom: 0 }}>
            <Row style={{ marginBottom: space.lg, flexWrap: 'wrap' }} gap={space.md}>
              <StatTile icon="hourglass-outline" tone="info" label={`Open quotes (${stats.openCount})`} value={moneyShort(stats.openValue)} onPress={() => setFilter('sent')} />
              <StatTile icon="trophy-outline" tone="success" label="Win rate · 90 days" value={stats.winRate == null ? '—' : `${stats.winRate}%`} />
            </Row>
            {stats.winRate != null ? <T variant="small" style={{ marginTop: -space.sm, marginBottom: space.md }}>{stats.won} accepted · {stats.lost} declined in the last 90 days</T> : null}
            <StartFromPhotosButton style={{ alignSelf: 'flex-start', marginBottom: space.md }} />
            <SearchBar value={search} onChange={setSearch} placeholder="Number, customer, tail" />
            <Segmented value={filter} onChange={setFilter} options={FILTERS.map((f) => ({ ...f, count: counts[f.value] }))} />
            <ToggleRow label="Show replaced versions" value={showOld} onChange={setShowOld} />
            <ErrorBanner message={q.error} onRetry={q.reload} />
          </View>
        }
        renderItem={({ item: d }) => {
          const viewed = viewedLabel(d);
          const deadline = deadlineOf(d);
          const meta = [
            d.aircraft?.tail_number,
            d.options?.length > 1 ? `${d.options.length} packages` : null,
            d.superseded_by ? 'Replaced by a newer version' : viewed ?? (d.eff === 'sent' ? 'Not opened yet' : null),
            (d.eff === 'sent' || d.eff === 'viewed') && deadline ? `Deadline ${dateTime(deadline)}` : null,
          ].filter(Boolean).join(' · ');
          return (
            <ListRow
              title={`${d.number} · ${d.customer?.name ?? ''}`}
              subtitle={`${d.options?.length > 1 ? 'From ' : ''}${money(d.total)}${Number(d.deposit_amount) > 0 ? ` · deposit ${d.deposit_paid_at ? 'paid' : money(d.deposit_amount)}` : ''}`}
              meta={meta}
              right={
                <View style={{ alignItems: 'flex-end', gap: 4 }}>
                  <Badge label={d.eff} tone={quoteTone[d.eff]} />
                  {d.view_count > 0 && !d.superseded_by ? <Row gap={4}><Ionicons name="eye-outline" size={14} color={colors.primaryText} /><T variant="small" style={{ color: colors.primaryText }}>{d.view_count}</T></Row> : null}
                </View>
              }
              onPress={() => router.push(`/quotes/${d.id}`)}
            />
          );
        }}
        ListEmptyComponent={q.loading ? null : (
          <EmptyState icon="document-text-outline" title={filter === 'all' && !s ? 'No quotes yet' : 'No quotes match'}
            body={filter === 'all' && !s ? 'Create a quote and send the customer a link to approve it online.' : undefined}
            action={filter === 'all' && !s ? <Button title="New quote" icon="add" onPress={() => router.push('/quotes/edit')} /> : undefined} />
        )}
        contentContainerStyle={{ paddingBottom: 96 }}
      />
      <Fab onPress={() => router.push('/quotes/edit')} label="New quote" />
    </View>
  );
}

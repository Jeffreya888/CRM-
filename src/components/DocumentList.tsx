import { router, Stack, type Href } from 'expo-router';
import { useState } from 'react';
import { FlatList, View } from 'react-native';
import { invoiceTone, quoteTone } from './status';
import { Badge, EmptyState, ErrorBanner, Fab, ListRow, SearchBar, Segmented, T } from './ui';
import { date, money } from '../lib/format';
import { useOrg } from '../lib/session';
import { supabase } from '../lib/supabase';
import { colors, space } from '../lib/theme';
import { useQuery } from '../lib/useQuery';

export function DocumentList({ kind }: { kind: 'quote' | 'invoice' }) {
  const { orgId } = useOrg();
  const isQ = kind === 'quote';
  const filters = isQ
    ? [{ value: 'open', label: 'Open' }, { value: 'accepted', label: 'Accepted' }, { value: 'declined', label: 'Declined' }, { value: 'all', label: 'All' }]
    : [{ value: 'unpaid', label: 'Unpaid' }, { value: 'overdue', label: 'Overdue' }, { value: 'draft', label: 'Drafts' }, { value: 'paid', label: 'Paid' }, { value: 'all', label: 'All' }];
  const [filter, setFilter] = useState(filters[0]!.value);
  const [search, setSearch] = useState('');

  const q = useQuery(async () => {
    let query = supabase.from(isQ ? 'quotes' : 'invoices')
      .select(`id, number, status, total, ${isQ ? 'valid_until' : 'balance, due_date'}, issue_date, customer:customers(name), aircraft:aircraft(tail_number)`)
      .eq('org_id', orgId).order('created_at', { ascending: false }).limit(300);
    if (filter === 'open') query = query.in('status', ['draft', 'sent', 'viewed']);
    else if (filter === 'unpaid') query = query.in('status', ['sent', 'partial', 'overdue']);
    else if (filter !== 'all') query = query.eq('status', filter);
    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []) as any[];
  }, [orgId, filter]);

  const s = search.toLowerCase();
  const rows = (q.data ?? []).filter((d) => !s || [d.number, d.customer?.name, d.aircraft?.tail_number].some((x: string) => x?.toLowerCase().includes(s)));
  const sum = rows.reduce((acc, d) => acc + Number(isQ ? d.total : d.balance), 0);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Stack.Screen options={{ title: isQ ? 'Quotes' : 'Invoices' }} />
      <FlatList
        data={rows}
        keyExtractor={(d) => d.id}
        refreshing={q.refreshing}
        onRefresh={q.refresh}
        ListHeaderComponent={
          <View style={{ padding: space.lg, paddingBottom: 0 }}>
            <SearchBar value={search} onChange={setSearch} placeholder="Number, customer, tail" />
            <Segmented value={filter} onChange={setFilter} options={filters} />
            <ErrorBanner message={q.error} />
            {rows.length ? <T variant="muted" style={{ marginBottom: space.sm }}>{rows.length} · {money(sum)} {isQ ? 'total' : 'outstanding'}</T> : null}
          </View>
        }
        renderItem={({ item: d }) => (
          <ListRow
            title={`${d.number} · ${d.customer?.name ?? ''}`}
            subtitle={isQ ? money(d.total) : `${money(d.total)}${Number(d.balance) > 0 && d.status !== 'draft' ? ` · ${money(d.balance)} due` : ''}`}
            meta={[d.aircraft?.tail_number, isQ ? `Valid until ${date(d.valid_until)}` : `Due ${date(d.due_date)}`].filter(Boolean).join(' · ')}
            right={<Badge label={d.status} tone={(isQ ? quoteTone : invoiceTone)[d.status]} />}
            onPress={() => router.push(`/${isQ ? 'quotes' : 'invoices'}/${d.id}` as Href)}
          />
        )}
        ListEmptyComponent={q.loading ? null : <EmptyState icon={isQ ? 'document-text-outline' : 'receipt-outline'} title={`No ${kind}s here`} />}
        contentContainerStyle={{ paddingBottom: 96 }}
      />
      <Fab onPress={() => router.push(`/${isQ ? 'quotes' : 'invoices'}/edit` as Href)} label={`New ${kind}`} />
    </View>
  );
}

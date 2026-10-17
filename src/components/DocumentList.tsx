import { isBefore, parseISO, startOfToday } from 'date-fns';
import { router, Stack } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, View } from 'react-native';
import { QuoteList } from './quotes/QuoteList';
import { invoiceTone } from './status';
import { Badge, EmptyState, ErrorBanner, Fab, ListRow, Row, SearchBar, Segmented, StatTile } from './ui';
import { date, money, moneyShort } from '../lib/format';
import { useOrg } from '../lib/session';
import { supabase } from '../lib/supabase';
import { colors, space } from '../lib/theme';
import { useQuery } from '../lib/useQuery';
import type { Invoice } from '../lib/types';

type InvRow = Pick<Invoice, 'id' | 'number' | 'status' | 'total' | 'balance' | 'due_date' | 'issue_date' | 'covered_by_plan' | 'late_fee_applied_at' | 'branch_id'> & {
  customer: { name: string } | null; aircraft: { tail_number: string } | null;
};
type Filter = 'unpaid' | 'overdue' | 'draft' | 'paid' | 'care_plan' | 'void' | 'all';

/** Quotes and invoices lists. Quotes have their own screen (filters, win rate, open value). */
export function DocumentList({ kind }: { kind: 'quote' | 'invoice' }) {
  return kind === 'quote' ? <QuoteList /> : <InvoiceList />;
}

const isOverdue = (r: Pick<Invoice, 'status' | 'balance' | 'due_date'>) =>
  r.status === 'overdue' || (['sent', 'partial'].includes(r.status) && Number(r.balance) > 0 && isBefore(parseISO(r.due_date), startOfToday()));
const isUnpaid = (r: Pick<Invoice, 'status' | 'balance'>) => ['sent', 'partial', 'overdue'].includes(r.status) && Number(r.balance) > 0;

function InvoiceList() {
  const { orgId, perm, branchId, org } = useOrg();
  const [filter, setFilter] = useState<Filter>('unpaid');
  const [search, setSearch] = useState('');
  const allowed = perm('see_prices');
  const cur = org.currency;

  const q = useQuery(async () => {
    if (!allowed) return [] as InvRow[];
    let query = supabase.from('invoices')
      .select('id, number, status, total, balance, due_date, issue_date, covered_by_plan, late_fee_applied_at, branch_id, customer:customers(name), aircraft:aircraft(tail_number)')
      .eq('org_id', orgId).order('created_at', { ascending: false }).limit(1000);
    if (branchId) query = query.eq('branch_id', branchId);
    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []) as unknown as InvRow[];
  }, [orgId, branchId, allowed]);

  const all = useMemo(() => q.data ?? [], [q.data]);
  const totals = useMemo(() => {
    const unpaid = all.filter(isUnpaid);
    const overdue = all.filter(isOverdue);
    return {
      outstanding: unpaid.reduce((s, r) => s + Number(r.balance), 0), unpaidCount: unpaid.length,
      overdue: overdue.reduce((s, r) => s + Number(r.balance), 0), overdueCount: overdue.length,
    };
  }, [all]);

  const match: Record<Filter, (r: InvRow) => boolean> = {
    unpaid: isUnpaid,
    overdue: isOverdue,
    draft: (r) => r.status === 'draft',
    paid: (r) => r.status === 'paid',
    care_plan: (r) => r.covered_by_plan,
    void: (r) => r.status === 'void',
    all: () => true,
  };
  const filters: { value: Filter; label: string; count?: number }[] = ([
    ['unpaid', 'Unpaid'], ['overdue', 'Overdue'], ['draft', 'Drafts'], ['paid', 'Paid'], ['care_plan', 'Care plan'], ['void', 'Void'], ['all', 'All'],
  ] as [Filter, string][]).map(([value, label]) => ({ value, label, count: all.filter(match[value]).length }));

  const s = search.trim().toLowerCase();
  const rows = all.filter(match[filter]).filter((d) => !s || [d.number, d.customer?.name, d.aircraft?.tail_number].some((x) => x?.toLowerCase().includes(s)));

  if (!allowed) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <Stack.Screen options={{ title: 'Invoices' }} />
        <EmptyState icon="lock-closed-outline" title="Invoices are hidden for your role" body="Ask your company owner for access to prices to see invoices." />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Stack.Screen options={{ title: 'Invoices' }} />
      <FlatList
        data={rows}
        keyExtractor={(d) => d.id}
        refreshing={q.refreshing}
        onRefresh={q.refresh}
        ListHeaderComponent={
          <View style={{ padding: space.lg, paddingBottom: 0 }}>
            <Row style={{ marginBottom: space.lg, flexWrap: 'wrap' }} gap={space.md}>
              <StatTile icon="wallet-outline" tone="info" label={`Outstanding (${totals.unpaidCount})`} value={moneyShort(totals.outstanding)} onPress={() => setFilter('unpaid')} />
              <StatTile icon="alert-circle-outline" tone={totals.overdueCount ? 'danger' : 'success'} label={`Overdue (${totals.overdueCount})`} value={moneyShort(totals.overdue)} onPress={() => setFilter('overdue')} />
            </Row>
            <SearchBar value={search} onChange={setSearch} placeholder="Number, customer, tail" />
            <Segmented value={filter} onChange={setFilter} options={filters} />
            <ErrorBanner message={q.error} onRetry={q.reload} />
          </View>
        }
        renderItem={({ item: d }) => {
          const overdue = isOverdue(d);
          const status = overdue && d.status !== 'overdue' ? 'overdue' : d.status;
          return (
            <ListRow
              title={`${d.number} · ${d.customer?.name ?? ''}`}
              subtitle={`${money(d.total, cur)}${Number(d.balance) > 0 && !['draft', 'void'].includes(d.status) ? ` · ${money(d.balance, cur)} due` : ''}`}
              meta={[d.aircraft?.tail_number, `Due ${date(d.due_date)}`, d.covered_by_plan ? 'Care plan' : null, d.late_fee_applied_at ? 'Late fee added' : null].filter(Boolean).join(' · ')}
              right={<Badge label={status} tone={invoiceTone[status]} />}
              onPress={() => router.push(`/invoices/${d.id}`)}
            />
          );
        }}
        ListEmptyComponent={q.loading ? null : (
          <EmptyState icon="receipt-outline" title={filter === 'unpaid' && !s ? 'Nothing owed right now' : 'No invoices here'}
            body={filter === 'unpaid' && !s ? 'Invoices waiting for payment show up here.' : undefined} />
        )}
        contentContainerStyle={{ paddingBottom: 96 }}
      />
      <Fab onPress={() => router.push('/invoices/edit')} label="New invoice" />
    </View>
  );
}

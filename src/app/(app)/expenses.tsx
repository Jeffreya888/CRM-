import { Stack } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { DateTimeField } from '../../components/DateTimeField';
import { ExpenseEditor, type ExpenseRecord, type JobLite } from '../../components/finance/ExpenseEditor';
import { FormSheet, notify } from '../../components/FormSheet';
import { Gate } from '../../components/Gate';
import {
  Badge, Button, Card, EmptyState, ErrorBanner, Fab, Field, Ionicons, ListRow, Loading, Row, Screen, SearchBar, Section, Segmented, Select, StatTile, T,
} from '../../components/ui';
import { categoryLabel, categoryOptions, expensesCsv, presetRange, PRESETS, RECUR_EVERY, shareTextFile, type Preset } from '../../lib/finance';
import { date, money } from '../../lib/format';
import { useLookups } from '../../lib/lookups';
import { canAdmin } from '../../lib/plans';
import { useOrg } from '../../lib/session';
import { friendlyError, must, supabase } from '../../lib/supabase';
import { colors, space } from '../../lib/theme';
import { useQuery } from '../../lib/useQuery';

type Tab = 'expenses' | 'recurring' | 'settings';
type Recurring = { id: string; vendor: string | null; description: string; category: string; amount: number; every: 'week' | 'month' | 'quarter' | 'year'; next_on: string; active: boolean; branch_id: string | null };

export default function Expenses() {
  return (
    <Gate feature="expenses">
      <ExpensesScreen />
    </Gate>
  );
}

function ExpensesScreen() {
  const { perm } = useOrg();
  const [tab, setTab] = useState<Tab>('expenses');
  if (!perm('see_prices')) {
    return (
      <Screen>
        <Stack.Screen options={{ title: 'Business expenses' }} />
        <EmptyState icon="lock-closed-outline" title="No access" body="Ask the owner for permission to see prices and expenses." />
      </Screen>
    );
  }
  return (
    <>
      <Stack.Screen options={{ title: 'Business expenses' }} />
      {tab === 'expenses' ? <ExpenseList tab={tab} setTab={setTab} /> : tab === 'recurring' ? <RecurringList tab={tab} setTab={setTab} /> : <ExpenseSettings tab={tab} setTab={setTab} />}
    </>
  );
}

function Tabs({ tab, setTab }: { tab: Tab; setTab: (t: Tab) => void }) {
  return <Segmented value={tab} onChange={setTab} options={[{ value: 'expenses', label: 'Expenses' }, { value: 'recurring', label: 'Recurring' }, { value: 'settings', label: 'Mileage & export' }]} />;
}

function ExpenseList({ tab, setTab }: { tab: Tab; setTab: (t: Tab) => void }) {
  const { orgId, org, session, can, branchId, perm } = useOrg();
  const { branchOptions } = useLookups();
  const showBranches = can('branches');
  const [preset, setPreset] = useState<Preset>('this_month');
  const [custom, setCustom] = useState(presetRange('this_month'));
  const [cat, setCat] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<ExpenseRecord | null>(null);
  const [open, setOpen] = useState(false);
  const range = preset === 'custom' ? custom : presetRange(preset);

  const q = useQuery(async () => {
    let eq = supabase.from('expenses').select('*, job:jobs(number), branch:branches(name)').eq('org_id', orgId)
      .gte('spent_on', range.from).lte('spent_on', range.to).order('spent_on', { ascending: false }).order('created_at', { ascending: false });
    if (showBranches && branchId) eq = eq.eq('branch_id', branchId);
    const [rows, jobs] = await Promise.all([
      must(eq),
      must(supabase.from('jobs').select('id, number, title, location:locations(name, airport_code)').eq('org_id', orgId).order('scheduled_start', { ascending: false }).limit(300)),
    ]);
    return { rows: (rows ?? []) as unknown as ExpenseRecord[], jobs: (jobs ?? []) as unknown as JobLite[] };
  }, [orgId, range.from, range.to, branchId, showBranches]);

  const all = q.data?.rows ?? [];
  const s = search.trim().toLowerCase();
  const rows = all.filter((r) => (!cat || r.category === cat) && (!s || [r.vendor, r.description, r.notes, categoryLabel(r.category)].some((x) => x?.toLowerCase().includes(s))));
  const total = all.reduce((t, r) => t + Number(r.amount), 0);
  const miles = all.filter((r) => r.kind === 'mileage').reduce((t, r) => t + Number(r.miles ?? 0), 0);
  const byCat = Object.entries(all.reduce<Record<string, number>>((m, r) => ({ ...m, [r.category]: (m[r.category] ?? 0) + Number(r.amount) }), {})).sort((a, b) => b[1] - a[1]);

  const exportCsv = async () => {
    try { await shareTextFile(`Expenses ${range.from} to ${range.to}.csv`, expensesCsv(all)); } catch (e: any) { notify('Export failed', e.message); }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Screen refreshing={q.refreshing} onRefresh={q.refresh}>
        <Tabs tab={tab} setTab={setTab} />
        <Segmented value={preset} onChange={setPreset} options={PRESETS} />
        {preset === 'custom' ? (
          <Row gap={space.md}>
            <View style={{ flex: 1 }}><DateTimeField label="From" mode="date" value={custom.from} onChange={(v) => v && setCustom((c) => ({ ...c, from: v }))} allowClear={false} /></View>
            <View style={{ flex: 1 }}><DateTimeField label="Through" mode="date" value={custom.to} onChange={(v) => v && setCustom((c) => ({ ...c, to: v }))} allowClear={false} /></View>
          </Row>
        ) : null}
        <ErrorBanner message={q.error} onRetry={q.reload} />
        {!q.data ? (q.error ? null : <Loading />) : (
          <>
            <Row style={{ flexWrap: 'wrap' }} gap={space.md}>
              <StatTile label={`Spent · ${date(range.from)} – ${date(range.to)}`} value={money(total, org.currency)} icon="wallet-outline" tone="danger" />
              {miles ? <StatTile label="Miles logged" value={miles.toLocaleString()} icon="car-outline" tone="info" /> : null}
            </Row>
            {byCat.length ? (
              <Section title="By category">
                <Card>
                  {byCat.map(([c, amt]) => (
                    <Row key={c} style={{ justifyContent: 'space-between', paddingVertical: 4 }}>
                      <T style={{ flex: 1 }} numberOfLines={1}>{categoryLabel(c)}</T>
                      <T style={{ fontWeight: '700', fontVariant: ['tabular-nums'] }}>{money(amt, org.currency)}</T>
                    </Row>
                  ))}
                  <Button small kind="secondary" icon="download-outline" title="Accountant export (CSV)" style={{ marginTop: space.md }} onPress={exportCsv} />
                </Card>
              </Section>
            ) : null}
            <Section title="Expenses" count={`${rows.length}`}>
              <SearchBar value={search} onChange={setSearch} placeholder="Search vendor or description" />
              <Select value={cat} options={categoryOptions} onChange={setCat} allowClear placeholder="All categories" icon="pricetags-outline" searchable />
              {rows.length === 0 ? (
                <EmptyState icon="receipt-outline" title={all.length ? 'No matches' : 'No expenses in this period'}
                  body="Add fuel, insurance, hangar rent, software and other business costs. Snap a receipt and we fill in the details."
                  action={<Button icon="camera-outline" title="Add expense" onPress={() => { setEditing(null); setOpen(true); }} />} />
              ) : (
                <Card style={{ padding: 0, overflow: 'hidden' }}>
                  {rows.map((e) => (
                    <ListRow key={e.id} icon={e.kind === 'mileage' ? 'car-outline' : e.receipt_path ? 'receipt-outline' : 'wallet-outline'} tone={e.kind === 'mileage' ? 'info' : 'neutral'}
                      title={e.kind === 'mileage' ? `${e.miles} mi · ${e.description ?? 'Mileage'}` : e.vendor || e.description || categoryLabel(e.category)}
                      subtitle={[date(e.spent_on), categoryLabel(e.category)].join(' · ')}
                      meta={[e.job ? `Job ${e.job.number}` : null, e.branch?.name, e.recurring_expense_id ? 'Recurring' : null, e.receipt_path ? 'Receipt' : null].filter(Boolean).join(' · ') || null}
                      right={<T style={{ fontWeight: '700', fontVariant: ['tabular-nums'] }}>{money(e.amount, org.currency)}</T>}
                      onPress={() => { setEditing(e); setOpen(true); }} />
                  ))}
                </Card>
              )}
            </Section>
          </>
        )}
      </Screen>
      <Fab icon="add" label="Add expense" onPress={() => { setEditing(null); setOpen(true); }} />
      <ExpenseEditor visible={open} expense={editing} onClose={() => setOpen(false)} onSaved={q.reload} orgId={orgId} userId={session!.user.id}
        jobs={q.data?.jobs ?? []} branchOptions={branchOptions} showBranches={showBranches} mileageRate={Number(org.mileage_rate ?? 0.7)}
        defaultBranchId={branchId} canDelete={perm('delete_records')} />
    </View>
  );
}

function RecurringList({ tab, setTab }: { tab: Tab; setTab: (t: Tab) => void }) {
  const { orgId, org, can } = useOrg();
  const { branchOptions, branches } = useLookups();
  const [edit, setEdit] = useState<Recurring | 'new' | null>(null);
  const q = useQuery(async () => (await must(supabase.from('recurring_expenses').select('*').eq('org_id', orgId).order('active', { ascending: false }).order('next_on'))) as Recurring[], [orgId]);
  const rows = q.data ?? [];
  const today = new Date().toISOString().slice(0, 10);
  const due = rows.filter((r) => r.active && r.next_on <= today).length;
  const monthly = rows.filter((r) => r.active).reduce((t, r) => t + Number(r.amount) * ({ week: 52 / 12, month: 1, quarter: 1 / 3, year: 1 / 12 }[r.every]), 0);

  const book = async () => {
    try {
      const n = await must(supabase.rpc('generate_recurring_expenses', { p_org: orgId }));
      q.reload();
      notify(n ? 'Expenses booked' : 'Nothing due', n ? `${n} expense${n === 1 ? '' : 's'} added to your books.` : 'Every recurring expense is up to date.');
    } catch (e: any) { notify('Could not book expenses', friendlyError(e.message)); }
  };
  const cur = edit && edit !== 'new' ? edit : null;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Screen refreshing={q.refreshing} onRefresh={q.refresh}>
        <Tabs tab={tab} setTab={setTab} />
        <ErrorBanner message={q.error} onRetry={q.reload} />
        <Card>
          <T variant="muted">Regular bills like insurance, hangar rent, software and truck payments are added to your expenses automatically on their due date.</T>
          <Row style={{ marginTop: space.md, justifyContent: 'space-between' }}>
            <View>
              <T variant="small">About per month</T>
              <T variant="h3">{money(monthly, org.currency)}</T>
            </View>
            <Button small icon="flash-outline" title={due ? `Book due now (${due})` : 'Book due now'} onPress={book} />
          </Row>
        </Card>
        {!q.data ? (q.error ? null : <Loading />) : rows.length === 0 ? (
          <EmptyState icon="repeat-outline" title="No recurring expenses" body="Add the bills you pay every week, month, quarter or year."
            action={<Button icon="add" title="Add recurring expense" onPress={() => setEdit('new')} />} />
        ) : (
          <Card style={{ padding: 0, overflow: 'hidden' }}>
            {rows.map((r) => (
              <ListRow key={r.id} icon="repeat-outline" tone={r.active ? 'primary' : 'neutral'} title={r.description}
                subtitle={[r.vendor, categoryLabel(r.category), RECUR_EVERY.find((x) => x.value === r.every)?.label].filter(Boolean).join(' · ')}
                meta={r.active ? `Next: ${date(r.next_on)}${r.next_on <= today ? ' (due)' : ''}${can('branches') && r.branch_id ? ` · ${branches.find((b) => b.id === r.branch_id)?.name ?? ''}` : ''}` : 'Paused'}
                right={<View style={{ alignItems: 'flex-end', gap: 4 }}><T style={{ fontWeight: '700' }}>{money(r.amount, org.currency)}</T>{!r.active ? <Badge label="paused" /> : null}</View>}
                onPress={() => setEdit(r)} />
            ))}
          </Card>
        )}
      </Screen>
      <Fab icon="add" label="Add recurring expense" onPress={() => setEdit('new')} />
      <FormSheet visible={!!edit} title={cur ? 'Recurring expense' : 'New recurring expense'}
        initial={cur ? { ...cur, amount: String(cur.amount) } : { category: 'insurance', every: 'month', next_on: today, active: true }}
        onClose={() => setEdit(null)}
        fields={[
          { key: 'description', label: 'What is it?', type: 'text', required: true, placeholder: 'Hangar rent' },
          { key: 'vendor', label: 'Vendor', type: 'text' },
          { key: 'amount', label: 'Amount', type: 'money', required: true },
          { key: 'category', label: 'Category', type: 'select', options: categoryOptions },
          { key: 'every', label: 'Repeats', type: 'select', options: RECUR_EVERY },
          { key: 'next_on', label: 'Next due date', type: 'date', required: true },
          ...(can('branches') ? [{ key: 'branch_id', label: 'Company location', type: 'select' as const, options: branchOptions, allowClear: true }] : []),
          { key: 'active', label: 'Active', type: 'toggle', hint: 'Paused bills are not booked' },
        ]}
        onSubmit={async (v) => {
          const row = { description: v.description, vendor: v.vendor, amount: v.amount, category: v.category ?? 'other', every: v.every ?? 'month', next_on: v.next_on, active: v.active, ...(can('branches') ? { branch_id: v.branch_id } : {}) };
          if (cur) await must(supabase.from('recurring_expenses').update(row).eq('id', cur.id));
          else await must(supabase.from('recurring_expenses').insert({ ...row, org_id: orgId }));
          q.reload();
        }}
        onDelete={cur ? async () => { await must(supabase.from('recurring_expenses').delete().eq('id', cur.id)); q.reload(); } : undefined}
      />
    </View>
  );
}

function ExpenseSettings({ tab, setTab }: { tab: Tab; setTab: (t: Tab) => void }) {
  const { orgId, org, role, refresh } = useOrg();
  const admin = canAdmin(role);
  const [rate, setRate] = useState(String(org.mileage_rate ?? '0.70'));
  const [range, setRange] = useState(presetRange('last_year'));
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const saveRate = async () => {
    setError(null); setSaved(false);
    const n = Number(rate);
    if (Number.isNaN(n) || n < 0) return setError('Enter a rate like 0.70');
    try {
      await must(supabase.from('organizations').update({ mileage_rate: n }).eq('id', orgId));
      await refresh();
      setSaved(true);
    } catch (e: any) { setError(friendlyError(e.message)); }
  };
  const exportRange = async () => {
    try {
      const rows = await must(supabase.from('expenses').select('*, job:jobs(number), branch:branches(name)').eq('org_id', orgId).gte('spent_on', range.from).lte('spent_on', range.to).order('spent_on'));
      await shareTextFile(`Expenses ${range.from} to ${range.to}.csv`, expensesCsv((rows ?? []) as any));
    } catch (e: any) { notify('Export failed', friendlyError(e.message)); }
  };

  return (
    <Screen>
      <Tabs tab={tab} setTab={setTab} />
      <ErrorBanner message={error} />
      <Section title="Mileage rate" icon="car-outline">
        <Card>
          <T variant="muted" style={{ marginBottom: space.md }}>Mileage entries are priced at this rate per mile. Use the IRS standard mileage rate for the year (your accountant can confirm it).</T>
          <Field label="Rate per mile ($)" value={rate} onChangeText={(t) => { setRate(t); setSaved(false); }} keyboardType="decimal-pad" editable={admin}
            hint={admin ? undefined : 'Only owners and admins can change the rate.'} />
          {admin ? (
            <Row>
              <Button small title="Save rate" onPress={saveRate} />
              {saved ? <Row gap={4}><Ionicons name="checkmark-circle" size={16} color={colors.success} /><T variant="small">Saved</T></Row> : null}
            </Row>
          ) : null}
        </Card>
      </Section>
      <Section title="Accountant export" icon="download-outline">
        <Card>
          <T variant="muted" style={{ marginBottom: space.md }}>A spreadsheet with totals by tax category (Schedule C lines) followed by every expense in the dates you choose.</T>
          <Segmented value="x" onChange={(p: string) => setRange(presetRange(p as Preset))} options={PRESETS.filter((p) => p.value !== 'custom').map((p) => ({ ...p }))} />
          <Row gap={space.md}>
            <View style={{ flex: 1 }}><DateTimeField key={`f${range.from}`} label="From" mode="date" value={range.from} onChange={(v) => v && setRange((r) => ({ ...r, from: v }))} allowClear={false} /></View>
            <View style={{ flex: 1 }}><DateTimeField key={`t${range.to}`} label="Through" mode="date" value={range.to} onChange={(v) => v && setRange((r) => ({ ...r, to: v }))} allowClear={false} /></View>
          </Row>
          <Button icon="document-text-outline" title="Export expenses CSV" onPress={exportRange} />
        </Card>
      </Section>
    </Screen>
  );
}

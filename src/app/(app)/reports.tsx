import { addDays } from 'date-fns';
import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { DateTimeField } from '../../components/DateTimeField';
import { BarList, MonthBars } from '../../components/finance/Charts';
import { PayRatesPanel } from '../../components/finance/PayRatesPanel';
import { notify } from '../../components/FormSheet';
import { Gate } from '../../components/Gate';
import {
  Badge, Button, Card, EmptyState, ErrorBanner, Field, IconButton, Ionicons, Loading, Row, Screen, Section, Segmented, Select, StatTile, T, ToggleRow,
} from '../../components/ui';
import { payrollCsv, type PayrollEntry, type PayrollPerson } from '../../lib/csv';
import {
  categoryInfo, categoryLabel, csvAttachment, expensesCsv, inventoryCsv, pctChange, pdfAttachment, PL_LINES, plCsv, plHtml, presetRange, PRESETS,
  previousRange, rangeLabel, sharePdfFile, shareTextFile, type Attachment, type PLLineKey, type Preset, type ProfitLoss,
} from '../../lib/finance';
import { duration, money, moneyShort, titleCase } from '../../lib/format';
import { useLookups } from '../../lib/lookups';
import { canAdmin, isOwner } from '../../lib/plans';
import { useOrg } from '../../lib/session';
import { callFunction, friendlyError, must, supabase } from '../../lib/supabase';
import { colors, space } from '../../lib/theme';
import { useQuery } from '../../lib/useQuery';

type Summary = {
  by_month: { month: string; revenue: number }[]; by_service: { name: string; revenue: number; count: number }[];
  quote_win_rate: number | null; decline_reasons: Record<string, number>; jobs_completed: number; avg_rating: number | null; hours_logged: number;
};

export default function ProfitAndLoss() {
  const { perm } = useOrg();
  return (
    <Gate feature="reports">
      {perm('see_reports') ? <PLScreen /> : (
        <View style={{ flex: 1, backgroundColor: colors.bg }}>
          <Stack.Screen options={{ title: 'Profit & loss' }} />
          <EmptyState icon="lock-closed-outline" title="No access" body="Ask the owner for permission to see profit & loss and reports." />
        </View>
      )}
    </Gate>
  );
}

function PLScreen() {
  const { orgId, org, role, can, branchId, refresh: refreshSession } = useOrg();
  const admin = canAdmin(role);
  const owner = isOwner(role);
  const fleet = can('branches');
  const { branchOptions, branches } = useLookups();
  const [preset, setPreset] = useState<Preset>('this_month');
  const [custom, setCustom] = useState(presetRange('this_month'));
  const [applied, setApplied] = useState(presetRange('this_month'));
  const [basis, setBasis] = useState<'cash' | 'accrual'>('cash');
  const [compare, setCompare] = useState(true);
  const [branch, setBranch] = useState<string | null>(fleet ? branchId : null);
  const [busy, setBusy] = useState<string | null>(null);
  const range = preset === 'custom' ? applied : presetRange(preset);
  const prevRange = previousRange(range.from, range.to);
  const branchName = branch ? branches.find((b) => b.id === branch)?.name ?? null : null;

  const q = useQuery(async () => {
    const pl = (p: { from: string; to: string }) => must(supabase.rpc('profit_loss', { p_org: orgId, p_from: p.from, p_to: p.to, p_basis: basis, p_branch: branch }));
    const [cur, prev, sum] = await Promise.all([
      pl(range),
      compare ? pl(prevRange) : Promise.resolve(null),
      must(supabase.rpc('report_summary', { p_org: orgId, p_from: range.from, p_to: range.to })),
    ]);
    return { cur: cur as ProfitLoss, prev: prev as ProfitLoss | null, sum: sum as Summary };
  }, [orgId, range.from, range.to, basis, compare, branch]);
  const pl = q.data?.cur;
  const prev = compare ? q.data?.prev ?? null : null;

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    try { await fn(); } catch (e: any) { notify('Something went wrong', friendlyError(e.message)); } finally { setBusy(null); }
  };

  // ----- export builders -----
  const tag = `${range.from} to ${range.to}`;
  const buildPlCsv = () => plCsv(pl!, prev, branchName);
  const buildPlHtml = () => plHtml(org.name, pl!, prev, branchName, org.currency);
  const buildExpenses = async () => {
    let eq = supabase.from('expenses').select('*, job:jobs(number), branch:branches(name)').eq('org_id', orgId).gte('spent_on', range.from).lte('spent_on', range.to).order('spent_on');
    if (branch) eq = eq.eq('branch_id', branch);
    return expensesCsv(((await must(eq)) ?? []) as any);
  };
  const buildTimesheets = async () => {
    const [people, entries] = await Promise.all([
      must(supabase.rpc('timesheet_summary', { p_org: orgId, p_from: range.from, p_to: range.to })),
      must(supabase.from('time_entries').select('user_id, started_at, ended_at, approved, notes, job:jobs(number, title, customer:customers(name))').eq('org_id', orgId)
        .gte('started_at', new Date(range.from + 'T00:00:00').toISOString()).lt('started_at', addDays(new Date(range.to + 'T00:00:00'), 1).toISOString()).order('started_at')),
    ]);
    return payrollCsv('generic', range, ((people ?? []) as any[]).map((p) => ({ ...p, minutes: Number(p.minutes), overtime_minutes: Number(p.overtime_minutes) })) as PayrollPerson[],
      ((entries ?? []) as any[]).map((e) => ({ ...e, job_number: e.job?.number, customer: e.job?.customer?.name, service: e.job?.title })) as PayrollEntry[]);
  };
  const buildInventory = async () => inventoryCsv(((await must(supabase.from('inventory_items').select('name, category, unit, quantity, par_level, unit_cost, vendor').eq('org_id', orgId).eq('active', true).order('name'))) ?? []) as any);

  const [email, setEmail] = useState(org.accountant_email ?? '');
  const sendToAccountant = () => run('email', async () => {
    const to = email.trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) throw new Error('Enter your accountant’s email address');
    if (admin && to !== (org.accountant_email ?? '')) {
      await must(supabase.from('organizations').update({ accountant_email: to }).eq('id', orgId));
      refreshSession();
    }
    const [exp, ts, inv] = await Promise.all([buildExpenses(), buildTimesheets(), buildInventory()]);
    const attachments: Attachment[] = [
      await pdfAttachment(buildPlHtml(), `Profit and loss ${tag}.pdf`),
      csvAttachment(`Profit and loss ${tag}.csv`, buildPlCsv()),
      csvAttachment(`Expenses ${tag}.csv`, exp),
      csvAttachment(`Timesheets ${tag}.csv`, ts),
      csvAttachment(`Inventory ${range.to}.csv`, inv),
    ];
    await callFunction('send-report', {
      org_id: orgId, to, subject: `${org.name} — Profit & loss ${rangeLabel(range.from, range.to)}`,
      body: `Hi,\n\nAttached are ${org.name}'s profit & loss (${basis} basis), expenses, timesheets and inventory for ${rangeLabel(range.from, range.to)}${branchName ? ` (${branchName})` : ''}.\n\nNet operating result: ${money(pl!.net, org.currency)}\nSales tax collected (not revenue): ${money(pl!.sales_tax_collected, org.currency)}\n\nSent from Flight Ready.`,
      attachments,
    });
    notify('Sent', `The report and spreadsheets were emailed to ${to}.`);
  });

  const saveSetAside = async (v: string) => {
    const n = Number(v);
    if (Number.isNaN(n) || n < 0 || n > 100) { notify('Enter a percent between 0 and 100'); return; }
    await run('setaside', async () => {
      await must(supabase.from('organizations').update({ tax_set_aside_pct: n }).eq('id', orgId));
      await refreshSession();
      q.reload();
    });
  };

  const sign = (k: PLLineKey) => (k === 'revenue' || k === 'net' ? 1 : -1);
  const unknownLabor = pl ? Number(pl.labor_unknown_minutes) > 0 : false;
  const sum = q.data?.sum;
  const declines = sum ? Object.entries(sum.decline_reasons ?? {}).map(([reason, n]) => ({ reason, n })).sort((a, b) => b.n - a.n) : [];

  return (
    <Screen refreshing={q.refreshing} onRefresh={q.refresh}>
      <Stack.Screen options={{ title: 'Profit & loss' }} />
      <Row style={{ justifyContent: 'space-between', marginBottom: space.sm }}>
        <T variant="muted" style={{ flex: 1 }}>{rangeLabel(range.from, range.to)}</T>
        <IconButton icon="refresh" label="Refresh" onPress={q.refresh} />
      </Row>
      <Segmented value={preset} onChange={setPreset} options={PRESETS} />
      {preset === 'custom' ? (
        <Card>
          <Row gap={space.md}>
            <View style={{ flex: 1 }}><DateTimeField label="From" mode="date" value={custom.from} onChange={(v) => v && setCustom((c) => ({ ...c, from: v }))} allowClear={false} /></View>
            <View style={{ flex: 1 }}><DateTimeField label="Through" mode="date" value={custom.to} onChange={(v) => v && setCustom((c) => ({ ...c, to: v }))} allowClear={false} /></View>
          </Row>
          <Button small title="Apply" icon="checkmark" disabled={custom.from > custom.to} onPress={() => setApplied(custom)} />
        </Card>
      ) : null}
      <Segmented value={basis} onChange={setBasis} options={[{ value: 'cash', label: 'Cash basis' }, { value: 'accrual', label: 'Accrual basis' }]} />
      {fleet ? <Select label="Company location" value={branch} options={branchOptions} onChange={setBranch} allowClear placeholder="All locations" icon="business-outline" /> : null}
      <ToggleRow label="Compare to previous period" hint={rangeLabel(prevRange.from, prevRange.to)} value={compare} onChange={setCompare} />
      <ErrorBanner message={q.error} onRetry={q.reload} />

      {!pl ? (q.error ? null : <Loading />) : (
        <>
          <Card style={{ borderColor: pl.net >= 0 ? colors.success : colors.danger }}>
            <T variant="muted">Net operating result · {rangeLabel(pl.from, pl.to)}</T>
            <T style={{ fontSize: 36, fontWeight: '800', color: pl.net >= 0 ? colors.success : colors.danger, fontVariant: ['tabular-nums'] }}>{money(pl.net, org.currency)}</T>
            {prev ? <Change cur={pl.net} prev={prev.net} currency={org.currency} /> : null}
            <T variant="small" style={{ marginTop: space.sm }}>
              {basis === 'cash' ? 'Money received from paid invoices minus expenses, supplies, labor and fees. Unpaid invoices are not counted.' : 'Invoices issued in the period (paid or not) minus expenses, supplies and labor.'}
            </T>
            {unknownLabor ? <Badge raw label="Labor cost partly unknown" tone="warning" /> : null}
          </Card>

          <Section title="Breakdown">
            <Card>
              {PL_LINES.map((l) => {
                const cur = Number(pl[l.key]) * sign(l.key);
                const p = prev ? Number(prev[l.key]) * sign(l.key) : null;
                const note = l.key === 'revenue' ? `${pl.paid_invoices} ${basis === 'cash' ? 'paid invoice' : 'invoice'}${Number(pl.paid_invoices) === 1 ? '' : 's'}`
                  : l.key === 'labor' ? `${duration(Number(pl.labor_minutes))} clocked${unknownLabor ? ` · ${duration(Number(pl.labor_unknown_minutes))} Unknown (no pay rate)` : ''}`
                  : l.key === 'supplies' ? 'From the supply room, used on jobs' : null;
                return (
                  <View key={l.key} style={[{ paddingVertical: 8 }, l.key === 'net' && { borderTopWidth: 1, borderTopColor: colors.borderStrong, marginTop: 4 }]}>
                    <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <View style={{ flex: 1 }}>
                        <T style={l.key === 'net' ? { fontWeight: '800' } : undefined}>{l.label}</T>
                        {note ? <T variant="small">{note}</T> : null}
                      </View>
                      <View style={{ alignItems: 'flex-end' }}>
                        <T style={{ fontWeight: '700', fontVariant: ['tabular-nums'] }}>{money(cur, org.currency)}</T>
                        {p != null ? <Change cur={cur} prev={p} currency={org.currency} small /> : null}
                      </View>
                    </Row>
                  </View>
                );
              })}
              {unknownLabor && admin ? (
                <Button small kind="ghost" icon="cash-outline" title="Set pay rates so labor cost is known" onPress={() => router.push('/team')} />
              ) : null}
            </Card>
            <Card>
              <Row style={{ justifyContent: 'space-between' }}>
                <View style={{ flex: 1 }}>
                  <T>Sales tax collected</T>
                  <T variant="small">Owed to the state — kept separate, not revenue.</T>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <T style={{ fontWeight: '700' }}>{money(pl.sales_tax_collected, org.currency)}</T>
                  {prev ? <Change cur={Number(pl.sales_tax_collected)} prev={Number(prev.sales_tax_collected)} currency={org.currency} small /> : null}
                </View>
              </Row>
            </Card>
          </Section>

          <Section title="Tax set-aside" icon="shield-checkmark-outline">
            <Card>
              <T variant="muted">Suggested amount to put aside for income taxes ({pl.tax_set_aside_pct}% of net profit). Ask your accountant for the right percent.</T>
              <T variant="h2" style={{ marginTop: space.sm }}>{money(pl.tax_set_aside, org.currency)}</T>
              {owner ? <SetAsideEditor value={String(pl.tax_set_aside_pct)} onSave={saveSetAside} /> : null}
            </Card>
          </Section>

          <Section title="Expenses by category">
            <Card>
              <BarList rows={pl.expenses_by_category} labelKey="category" valueKey="amount" label={(r) => categoryLabel(r.category)} sub={(r) => `${r.n} · ${categoryInfo(r.category).line}`}
                format={(n) => money(n, org.currency)} empty="No expenses recorded in this period." />
              <Button small kind="ghost" icon="wallet-outline" title="Open business expenses" onPress={() => router.push('/expenses')} />
            </Card>
          </Section>

          <Section title="Profit by service">
            <Card><BarList rows={pl.by_service} labelKey="name" valueKey="revenue" sub={(r) => `${r.invoices} invoice${Number(r.invoices) === 1 ? '' : 's'}`} format={(n) => money(n, org.currency)} /></Card>
          </Section>
          <Section title="Profit by customer">
            <Card><BarList rows={pl.by_customer} labelKey="name" valueKey="revenue" sub={(r) => `Gross profit ${money(r.gross_profit, org.currency)}`} format={(n) => money(n, org.currency)} /></Card>
          </Section>
          {fleet ? (
            <Section title="Profit by company location">
              <Card><BarList rows={pl.by_branch.map((b) => ({ ...b, profit: Number(b.revenue) - Number(b.expenses) }))} labelKey="name" valueKey="profit"
                sub={(r) => `Revenue ${money(r.revenue, org.currency)} · Expenses ${money(r.expenses, org.currency)}`} format={(n) => money(n, org.currency)} empty="No payments in this period." /></Card>
            </Section>
          ) : null}

          {sum ? (
            <>
              <Row style={{ flexWrap: 'wrap', marginTop: space.lg }} gap={space.md}>
                <StatTile label="Quote win rate" value={sum.quote_win_rate != null ? `${sum.quote_win_rate}%` : '—'} icon="trophy-outline" tone="warning" />
                <StatTile label="Jobs completed" value={sum.jobs_completed} icon="checkmark-done-outline" tone="success" />
                <StatTile label="Avg. rating" value={sum.avg_rating != null ? `${sum.avg_rating} ★` : '—'} icon="star-outline" tone="warning" />
              </Row>
              <Section title="Revenue by month"><Card><MonthBars rows={sum.by_month} /></Card></Section>
              <Section title="Top services"><Card><BarList rows={sum.by_service} labelKey="name" valueKey="revenue" format={(n) => moneyShort(n)} /></Card></Section>
              {declines.length ? (
                <Section title="Why quotes were declined"><Card><BarList rows={declines} labelKey="reason" valueKey="n" label={(r) => titleCase(r.reason)} format={(n) => String(n)} /></Card></Section>
              ) : null}
            </>
          ) : null}

          {admin ? (
            <Section title="Timesheets & labor rates" icon="time-outline" action={<Button small kind="ghost" title="Timesheets" onPress={() => router.push('/timesheets')} />}>
              <Card><PayRatesPanel orgId={orgId} onChanged={q.reload} /></Card>
            </Section>
          ) : null}

          <Section title="Exports" icon="download-outline">
            <Card>
              <Row gap={space.sm} style={{ flexWrap: 'wrap' }}>
                <Button small kind="secondary" icon="print-outline" title="P&L PDF" loading={busy === 'pdf'} onPress={() => run('pdf', () => sharePdfFile(buildPlHtml(), `Profit and loss ${tag}.pdf`))} />
                <Button small kind="secondary" icon="document-text-outline" title="P&L CSV" loading={busy === 'plcsv'} onPress={() => run('plcsv', () => shareTextFile(`Profit and loss ${tag}.csv`, buildPlCsv()))} />
                <Button small kind="secondary" icon="wallet-outline" title="Expenses CSV" loading={busy === 'exp'} onPress={() => run('exp', async () => shareTextFile(`Expenses ${tag}.csv`, await buildExpenses()))} />
                <Button small kind="secondary" icon="time-outline" title="Timesheets CSV" loading={busy === 'ts'} onPress={() => run('ts', async () => shareTextFile(`Timesheets ${tag}.csv`, await buildTimesheets()))} />
                <Button small kind="secondary" icon="cube-outline" title="Inventory CSV" loading={busy === 'inv'} onPress={() => run('inv', async () => shareTextFile(`Inventory ${range.to}.csv`, await buildInventory()))} />
              </Row>
            </Card>
          </Section>

          <Section title="Email to accountant" icon="mail-outline">
            <Card>
              <T variant="muted" style={{ marginBottom: space.md }}>Sends the P&amp;L PDF plus the P&amp;L, expenses, timesheets and inventory spreadsheets for this period.</T>
              <Field label="Accountant email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" placeholder="cpa@example.com"
                hint={admin ? 'Saved for next time.' : undefined} icon="mail-outline" />
              <Button icon="send-outline" title="Email report" loading={busy === 'email'} onPress={sendToAccountant} />
            </Card>
          </Section>
        </>
      )}
    </Screen>
  );
}

function Change({ cur, prev, currency, small }: { cur: number; prev: number; currency: string; small?: boolean }) {
  const diff = cur - prev;
  const pc = pctChange(cur, prev);
  const up = diff >= 0;
  return (
    <Row gap={4}>
      <Ionicons name={diff === 0 ? 'remove' : up ? 'arrow-up' : 'arrow-down'} size={small ? 12 : 14} color={colors.textMuted} />
      <T variant={small ? 'small' : 'muted'}>{`${up ? '+' : '−'}${money(Math.abs(diff), currency)}${pc != null ? ` (${pc > 0 ? '+' : ''}${pc}%)` : ''} vs previous`}</T>
    </Row>
  );
}

function SetAsideEditor({ value, onSave }: { value: string; onSave: (v: string) => Promise<void> }) {
  const [v, setV] = useState(value);
  return (
    <Row style={{ marginTop: space.md, alignItems: 'flex-end' }}>
      <Field style={{ flex: 1, marginBottom: 0 }} label="Set-aside percent" value={v} onChangeText={setV} keyboardType="decimal-pad" />
      <Button small title="Save" disabled={v === value} onPress={() => onSave(v)} />
    </Row>
  );
}

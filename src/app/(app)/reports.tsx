import { endOfMonth, format, startOfMonth, startOfYear, subMonths } from 'date-fns';
import { Stack } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { notify } from '../../components/FormSheet';
import { Gate } from '../../components/Gate';
import { Button, Card, ErrorBanner, Loading, Row, Screen, Section, Segmented, StatTile, T } from '../../components/ui';
import { sharePdf } from '../../lib/documents';
import { isoDate, money, moneyShort, titleCase } from '../../lib/format';
import { useOrg } from '../../lib/session';
import { supabase } from '../../lib/supabase';
import { colors, radius, space } from '../../lib/theme';
import { useQuery } from '../../lib/useQuery';

type Range = 'month' | 'last_month' | 'ytd' | '12m';
const RANGES: { value: Range; label: string }[] = [
  { value: 'month', label: 'This month' }, { value: 'last_month', label: 'Last month' }, { value: 'ytd', label: 'Year to date' }, { value: '12m', label: 'Last 12 months' },
];

function bounds(r: Range): [Date, Date] {
  const now = new Date();
  if (r === 'month') return [startOfMonth(now), now];
  if (r === 'last_month') { const m = subMonths(now, 1); return [startOfMonth(m), endOfMonth(m)]; }
  if (r === 'ytd') return [startOfYear(now), now];
  return [startOfMonth(subMonths(now, 11)), now];
}

/** Horizontal single-series bars: label + value in text ink, bar in one hue. */
function BarList({ rows, valueKey, labelKey, format: fmt = money }: { rows: any[]; valueKey: string; labelKey: string; format?: (n: number) => string }) {
  if (!rows.length) return <T variant="muted">No data in this period.</T>;
  const max = Math.max(...rows.map((r) => Number(r[valueKey])), 1);
  return (
    <View style={{ gap: space.md }}>
      {rows.map((r) => (
        <View key={r[labelKey]}>
          <Row style={{ justifyContent: 'space-between', marginBottom: 4 }}>
            <T style={{ flex: 1 }} numberOfLines={1}>{titleCase(r[labelKey])}</T>
            <T style={{ fontWeight: '700', fontVariant: ['tabular-nums'] }}>{fmt(Number(r[valueKey]))}</T>
          </Row>
          <View style={{ height: 8, borderRadius: 4, backgroundColor: colors.bg }}>
            <View style={{ height: 8, borderRadius: 4, width: `${Math.max((Number(r[valueKey]) / max) * 100, 1)}%`, backgroundColor: colors.primary }} />
          </View>
        </View>
      ))}
    </View>
  );
}

/** Monthly revenue columns; tap a column to read its exact value. */
function MonthBars({ rows }: { rows: { month: string; revenue: number }[] }) {
  const [sel, setSel] = useState<string | null>(null);
  if (!rows.length) return <T variant="muted">No payments in this period.</T>;
  const max = Math.max(...rows.map((r) => Number(r.revenue)), 1);
  const active = rows.find((r) => r.month === sel) ?? rows[rows.length - 1]!;
  return (
    <View>
      <T variant="muted">{format(new Date(active.month + '-01T00:00:00'), 'MMMM yyyy')}</T>
      <T variant="h3" style={{ marginBottom: space.md }}>{money(active.revenue)}</T>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', height: 140, gap: 2, borderBottomWidth: 1, borderBottomColor: colors.border }}>
        {rows.map((r) => (
          <Pressable key={r.month} onPress={() => setSel(r.month)} style={{ flex: 1, height: '100%', justifyContent: 'flex-end' }} accessibilityLabel={`${r.month}: ${money(r.revenue)}`}>
            <View style={{ height: `${Math.max((Number(r.revenue) / max) * 100, 1)}%`, backgroundColor: r.month === active.month ? colors.primary : '#9DB3DB', borderTopLeftRadius: 4, borderTopRightRadius: 4 }} />
          </Pressable>
        ))}
      </View>
      <Row style={{ justifyContent: 'space-between', marginTop: 4 }}>
        <T variant="small">{format(new Date(rows[0]!.month + '-01T00:00:00'), 'MMM')}</T>
        <T variant="small">{format(new Date(rows[rows.length - 1]!.month + '-01T00:00:00'), 'MMM')}</T>
      </Row>
    </View>
  );
}

export default function Reports() {
  const { orgId, org } = useOrg();
  const [range, setRange] = useState<Range>('month');
  const [from, to] = bounds(range);
  const q = useQuery(async () => {
    const { data, error } = await supabase.rpc('report_summary', { p_org: orgId, p_from: isoDate(from), p_to: isoDate(to) });
    if (error) throw error;
    return data as any;
  }, [orgId, range]);
  const r = q.data;
  const profit = r ? Number(r.revenue) - Number(r.expenses) - Number(r.platform_fees) : 0;

  const exportPdf = async () => {
    if (!r) return;
    const table = (title: string, rows: any[], l: string, v: string, fmt = (n: number) => money(n)) =>
      `<h3>${title}</h3><table>${rows.map((x) => `<tr><td>${titleCase(String(x[l]))}</td><td style="text-align:right">${fmt(Number(x[v]))}</td></tr>`).join('') || '<tr><td>—</td></tr>'}</table>`;
    const html = `<html><head><meta charset="utf-8"><style>body{font-family:-apple-system,Helvetica;padding:32px;color:#0f172a}td{padding:6px;border-bottom:1px solid #e2e8f0}table{width:100%;border-collapse:collapse}h1{color:#0B3D91}</style></head><body>
      <h1>${org.name} · Business report</h1><p>${isoDate(from)} to ${isoDate(to)}</p>
      <table>
        <tr><td>Revenue collected</td><td style="text-align:right">${money(r.revenue)}</td></tr>
        <tr><td>Invoiced</td><td style="text-align:right">${money(r.invoiced)}</td></tr>
        <tr><td>Expenses</td><td style="text-align:right">${money(r.expenses)}</td></tr>
        <tr><td>Payment processing fees</td><td style="text-align:right">${money(r.platform_fees)}</td></tr>
        <tr><td><b>Net profit</b></td><td style="text-align:right"><b>${money(profit)}</b></td></tr>
        <tr><td>Jobs completed</td><td style="text-align:right">${r.jobs_completed}</td></tr>
        <tr><td>Hours logged</td><td style="text-align:right">${r.hours_logged}</td></tr>
        <tr><td>Quote win rate</td><td style="text-align:right">${r.quote_win_rate ?? '—'}%</td></tr>
        <tr><td>Average rating</td><td style="text-align:right">${r.avg_rating ?? '—'}</td></tr>
      </table>
      ${table('Revenue by month', r.by_month, 'month', 'revenue')}
      ${table('Top services', r.by_service, 'name', 'revenue')}
      ${table('Top customers', r.top_customers, 'name', 'revenue')}
      ${table('Expenses by category', r.expenses_by_category, 'category', 'amount')}
      ${table('Technician hours', r.technician_hours, 'name', 'hours', (n) => `${n} h`)}
    </body></html>`;
    try { await sharePdf(html, `Report ${isoDate(from)}.pdf`); } catch (e: any) { notify('Export failed', e.message); }
  };

  return (
    <Gate feature="reports">
      <Screen refreshing={q.refreshing} onRefresh={q.refresh}>
        <Stack.Screen options={{ title: 'Reports' }} />
        <Segmented value={range} onChange={setRange} options={RANGES} />
        <ErrorBanner message={q.error} />
        {!r ? <Loading /> : (
          <>
            <Row style={{ flexWrap: 'wrap' }} gap={space.md}>
              <StatTile label="Collected" value={moneyShort(r.revenue)} icon="cash-outline" tone="success" />
              <StatTile label="Net profit" value={moneyShort(profit)} icon="trending-up-outline" tone={profit >= 0 ? 'primary' : 'danger'} />
              <StatTile label="Expenses" value={moneyShort(r.expenses)} icon="wallet-outline" tone="neutral" />
              <StatTile label="Invoiced" value={moneyShort(r.invoiced)} icon="receipt-outline" tone="info" />
              <StatTile label="Jobs completed" value={r.jobs_completed} icon="checkmark-done-outline" tone="success" />
              <StatTile label="Hours logged" value={r.hours_logged} icon="time-outline" tone="neutral" />
              <StatTile label="Quote win rate" value={r.quote_win_rate != null ? `${r.quote_win_rate}%` : '—'} icon="trophy-outline" tone="warning" />
              <StatTile label="Avg. rating" value={r.avg_rating != null ? `${r.avg_rating} ★` : '—'} icon="star-outline" tone="warning" />
            </Row>
            <Section title="Revenue by month"><Card><MonthBars rows={r.by_month} /></Card></Section>
            <Section title="Top services"><Card><BarList rows={r.by_service} labelKey="name" valueKey="revenue" /></Card></Section>
            <Section title="Top customers"><Card><BarList rows={r.top_customers} labelKey="name" valueKey="revenue" /></Card></Section>
            <Section title="Expenses by category"><Card><BarList rows={r.expenses_by_category} labelKey="category" valueKey="amount" /></Card></Section>
            <Section title="Technician hours"><Card><BarList rows={r.technician_hours} labelKey="name" valueKey="hours" format={(n) => `${n} h`} /></Card></Section>
            <Button style={{ marginTop: space.lg }} kind="secondary" icon="download-outline" title="Export PDF for your accountant" onPress={exportPdf} />
          </>
        )}
        <View style={{ height: radius.lg }} />
      </Screen>
    </Gate>
  );
}

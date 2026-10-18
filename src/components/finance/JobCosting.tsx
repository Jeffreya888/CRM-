import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Button, Card, EmptyState, ErrorBanner, Row, Section, Segmented, T } from '../ui';
import { hoursText, signedPct } from '../costing/costingFormat';
import { money } from '../../lib/format';
import { must, supabase } from '../../lib/supabase';
import { colors, space } from '../../lib/theme';
import { useQuery } from '../../lib/useQuery';

/** public.job_costing_report rows (docs/competitive-edge.md §10). */
export interface CostingRow {
  key: string; label: string; jobs: number; revenue: number; cost: number; profit: number; margin_pct: number | null;
  hours: number; est_hours: number; revenue_per_hour: number | null;
}
export interface AccuracyRow { service_id: string | null; name: string; jobs: number; est_hours: number; actual_hours: number; variance_pct: number | null }
export interface CostingReport {
  by_class: CostingRow[]; by_model: CostingRow[]; by_type: CostingRow[]; by_service: AccuracyRow[]; totals: CostingRow | null;
  hourly_cost: number; overhead_per_hour: number; labor_burden_pct: number;
}

type Group = 'by_class' | 'by_model' | 'by_type';
const GROUPS: { value: Group; label: string }[] = [
  { value: 'by_class', label: 'By class' },
  { value: 'by_model', label: 'By model' },
  { value: 'by_type', label: 'By type' },
];

/** Margin tone: green at 40%+, amber 20–40%, red below. */
export const marginColor = (m: number | null | undefined) =>
  m == null ? colors.textMuted : m >= 40 ? colors.success : m >= 20 ? colors.warning : colors.danger;

/** Job costing tab of the Profit & loss screen: true profit by size class, model and asset type, plus estimate accuracy. */
export function JobCostingPanel({ orgId, from, to, branch, currency, admin }: { orgId: string; from: string; to: string; branch: string | null; currency: string; admin: boolean }) {
  const [group, setGroup] = useState<Group>('by_class');
  const q = useQuery(async () => {
    const r = (await must(supabase.rpc('job_costing_report', { p_org: orgId, p_from: from, p_to: to, p_branch: branch }))) as CostingReport | null;
    return r;
  }, [orgId, from, to, branch]);

  if (q.error) return <ErrorBanner message={q.error} onRetry={q.reload} />;
  if (q.loading && !q.data) return <ActivityIndicator color={colors.primary} style={{ marginTop: space.xl }} />;
  const r = q.data;
  const rows = [...((r?.[group] ?? []) as CostingRow[])].sort((a, b) => Number(b.profit) - Number(a.profit));
  const totals = r?.totals ?? null;
  const accuracy = [...(r?.by_service ?? [])].sort((a, b) => Math.abs(Number(b.variance_pct ?? 0)) - Math.abs(Number(a.variance_pct ?? 0)));

  if (!r || !totals || !Number(totals.jobs)) {
    return (
      <EmptyState icon="stats-chart-outline" title="No completed jobs in this period"
        body="Job costing compares what each completed job earned with what it really cost: crew time at true labor cost, supplies used and job expenses. Complete a few jobs (with crew clocking in), or pick a longer date range."
        action={admin ? <Button small kind="secondary" icon="settings-outline" title="Set payroll % and overhead" onPress={() => router.push('/settings')} /> : undefined} />
    );
  }

  return (
    <View>
      <Card>
        <T variant="muted">True profit · {Number(totals.jobs)} completed job{Number(totals.jobs) === 1 ? '' : 's'}</T>
        <T style={{ fontSize: 32, fontWeight: '800', color: Number(totals.profit) >= 0 ? colors.success : colors.danger, fontVariant: ['tabular-nums'] }}>{money(totals.profit, currency)}</T>
        <Row style={{ flexWrap: 'wrap', marginTop: space.xs }} gap={space.md}>
          <Stat label="Revenue" value={money(totals.revenue, currency)} />
          <Stat label="True cost" value={money(totals.cost, currency)} />
          <Stat label="Margin" value={totals.margin_pct == null ? '—' : `${Math.round(Number(totals.margin_pct))}%`} color={marginColor(totals.margin_pct)} />
          <Stat label="Per labor hour" value={totals.revenue_per_hour == null ? '—' : `${money(totals.revenue_per_hour, currency)}/h`} />
        </Row>
        <T variant="small" style={{ marginTop: space.sm }}>
          Labor costs {money(r.hourly_cost, currency)}/h on average, including {Number(r.labor_burden_pct)}% payroll taxes &amp; insurance and {money(r.overhead_per_hour, currency)}/h overhead.
          {!Number(r.overhead_per_hour) && admin ? ' Overhead is not set yet — add it in Settings for a truer picture.' : ''}
        </T>
      </Card>

      <Segmented value={group} onChange={setGroup} options={GROUPS} />
      <Card>
        {rows.length ? (
          <View style={{ gap: space.md }}>
            {rows.map((x) => <CostingRowView key={`${group}-${x.key}`} row={x} currency={currency} />)}
          </View>
        ) : <T variant="muted">No jobs to group in this period.</T>}
      </Card>

      <Section title="Estimate accuracy by service" icon="speedometer-outline">
        <Card>
          {accuracy.length ? (
            <View style={{ gap: space.sm }}>
              {accuracy.map((a, i) => {
                const v = a.variance_pct == null ? null : Number(a.variance_pct);
                const vColor = v == null ? colors.textMuted : v > 10 ? colors.danger : v < -10 ? colors.success : colors.textMuted;
                return (
                  <Row key={a.service_id ?? `${a.name}-${i}`} style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <View style={{ flex: 1 }}>
                      <T numberOfLines={1}>{a.name}</T>
                      <T variant="small">{Number(a.jobs)} job{Number(a.jobs) === 1 ? '' : 's'} · est {hoursText(a.est_hours)} · actual {hoursText(a.actual_hours)}</T>
                    </View>
                    <T style={{ fontWeight: '700', color: vColor, fontVariant: ['tabular-nums'] }}>{v == null ? '—' : signedPct(v)}</T>
                  </Row>
                );
              })}
              <T variant="small" style={{ marginTop: space.xs }}>Red means jobs took longer than estimated — consider raising the service&apos;s hours or price.</T>
            </View>
          ) : <T variant="muted">Add estimated hours to your services to see how close your estimates are.</T>}
        </Card>
      </Section>
    </View>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <View style={{ minWidth: 120 }}>
      <T variant="small">{label}</T>
      <T style={{ fontWeight: '700', color: color ?? colors.text, fontVariant: ['tabular-nums'] }}>{value}</T>
    </View>
  );
}

function CostingRowView({ row, currency }: { row: CostingRow; currency: string }) {
  const m = row.margin_pct == null ? null : Number(row.margin_pct);
  const width = m == null ? 0 : Math.min(Math.max(m, 0), 100);
  const profit = Number(row.profit);
  return (
    <View>
      <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
        <View style={{ flex: 1 }}>
          <T numberOfLines={1}>{row.label}</T>
          <T variant="small" numberOfLines={1}>
            {Number(row.jobs)} job{Number(row.jobs) === 1 ? '' : 's'} · {money(row.revenue, currency)} revenue{row.revenue_per_hour != null ? ` · ${money(row.revenue_per_hour, currency)}/h` : ''}
          </T>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <T style={{ fontWeight: '700', color: profit < 0 ? colors.danger : colors.text, fontVariant: ['tabular-nums'] }}>{money(profit, currency)}</T>
          <T variant="small" style={{ color: marginColor(m) }}>{m == null ? 'Margin unknown' : `${Math.round(m)}% margin`}</T>
        </View>
      </Row>
      <View style={{ height: 8, borderRadius: 4, backgroundColor: colors.bg }}>
        <View style={{ height: 8, borderRadius: 4, width: `${Math.max(width, m == null ? 0 : 1)}%`, backgroundColor: marginColor(m) }} />
      </View>
    </View>
  );
}

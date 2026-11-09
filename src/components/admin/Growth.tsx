// Founder dashboard: growth over time (from the hourly snapshots) and the activation funnel.
import { useState } from 'react';
import { View } from 'react-native';
import { Card, ErrorBanner, Loading, Row, Section, Segmented, T } from '../ui';
import { moneyShort } from '../../lib/format';
import { byWeek, type Bucket, type DayStat, type Funnel, funnelSteps, growthPct } from '../../lib/growth';
import { must, supabase } from '../../lib/supabase';
import { colors, radius, space } from '../../lib/theme';
import { useQuery } from '../../lib/useQuery';

type Range = '30' | '90' | '365';

export function Growth() {
  const [range, setRange] = useState<Range>('90');
  const days = Number(range);
  const hist = useQuery(async () => (await must(supabase.rpc('platform_history', { p_days: days }))) as DayStat[], [days]);
  const funnel = useQuery(async () => (await must(supabase.rpc('platform_funnel', { p_days: days }))) as Funnel, [days]);
  const rows = (hist.data ?? []).map((r) => ({ ...r, mrr: Number(r.mrr), mrr_net: Number(r.mrr_net) }));
  const mrr = byWeek(rows, (r) => r.mrr, 'last');
  const paying = byWeek(rows, (r) => r.paid_companies, 'last');
  const signups = byWeek(rows, (r) => r.new_companies, 'sum');
  const churn = byWeek(rows, (r) => r.churned, 'sum');

  return (
    <>
      <Segmented value={range} onChange={setRange} options={[{ value: '30', label: '30 days' }, { value: '90', label: '90 days' }, { value: '365', label: '1 year' }]} />
      <ErrorBanner message={hist.error ?? funnel.error} onRetry={() => { hist.reload(); funnel.reload(); }} />
      {hist.loading ? <Loading /> : rows.length === 0 ? (
        <Card><T variant="muted">History starts filling in once the backend is deployed: a snapshot is saved every hour, so the first point appears today and the charts grow from there.</T></Card>
      ) : (
        <>
          <Chart title="Monthly revenue (MRR)" buckets={mrr} format={moneyShort} color={colors.success} trend />
          <Chart title="Paying companies" buckets={paying} format={(v) => String(v)} color={colors.primary} trend />
          <Chart title="New sign-ups per week" buckets={signups} format={(v) => String(v)} color={colors.purple} total />
          <Chart title="Cancellations per week" buckets={churn} format={(v) => String(v)} color={colors.danger} total />
        </>
      )}
      <Section title={`Activation funnel · sign-ups in the last ${range === '365' ? 'year' : `${range} days`}`} icon="funnel-outline">
        {funnel.loading ? <Loading /> : funnel.data ? <FunnelCard f={funnel.data} /> : null}
      </Section>
    </>
  );
}

/** One series as weekly columns, with the latest value and change over the range. */
function Chart({ title, buckets, format, color, trend, total }: {
  title: string; buckets: Bucket[]; format: (v: number) => string; color: string; trend?: boolean; total?: boolean;
}) {
  const values = buckets.map((b) => b.value);
  const max = Math.max(1, ...values);
  const latest = values[values.length - 1] ?? 0;
  const pct = trend ? growthPct(values) : null;
  const sum = values.reduce((n, v) => n + v, 0);
  return (
    <Section title={title}>
      <Card>
        <Row style={{ justifyContent: 'space-between', alignItems: 'flex-end' }} gap={space.sm}>
          <T style={{ fontSize: 24, fontWeight: '800' }}>{total ? format(sum) : format(latest)}</T>
          <T variant="small" style={{ color: pct == null ? colors.textMuted : pct >= 0 ? colors.success : colors.danger }}>
            {total ? `total over ${buckets.length} week${buckets.length === 1 ? '' : 's'}` : pct == null ? 'now' : `${pct >= 0 ? '+' : ''}${pct}% over this range`}
          </T>
        </Row>
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', height: 96, gap: 3, marginTop: space.md }} accessibilityLabel={`${title}: ${buckets.map((b) => `${b.label} ${format(b.value)}`).join(', ')}`}>
          {buckets.map((b) => (
            <View key={b.start} style={{ flex: 1, height: '100%', justifyContent: 'flex-end' }}>
              <View style={{ height: `${Math.max(b.value > 0 ? 4 : 1, (b.value / max) * 100)}%`, backgroundColor: b.value > 0 ? color : colors.border, borderTopLeftRadius: 3, borderTopRightRadius: 3 }} />
            </View>
          ))}
        </View>
        <Row style={{ justifyContent: 'space-between', marginTop: 6 }}>
          <T variant="small">{buckets[0]?.label}</T>
          <T variant="small">{buckets.length > 1 ? `week of ${buckets[buckets.length - 1].label}` : ''}</T>
        </Row>
      </Card>
    </Section>
  );
}

function FunnelCard({ f }: { f: Funnel }) {
  const steps = funnelSteps(f);
  if (!f.signed_up) return <Card><T variant="muted">No sign-ups in this range yet.</T></Card>;
  return (
    <Card>
      {steps.map((s, i) => (
        <View key={s.key} style={{ marginBottom: space.md }}>
          <Row style={{ justifyContent: 'space-between', marginBottom: 4 }} gap={space.sm}>
            <T style={{ flex: 1, fontWeight: i === 0 ? '700' : '400' }}>{s.label}</T>
            <T variant="muted">{s.count.toLocaleString('en-US')} · {s.pct}%</T>
          </Row>
          <View style={{ height: 10, borderRadius: radius.pill, backgroundColor: colors.cardRaised, overflow: 'hidden' }}>
            <View style={{ width: `${s.pct}%`, height: '100%', backgroundColor: s.key === 'subscribed' ? colors.success : colors.primary, borderRadius: radius.pill }} />
          </View>
          {i > 0 && s.lost > 0 && s.key !== 'subscribed' ? <T variant="small" style={{ marginTop: 2 }}>{s.lost} stopped before this step</T> : null}
        </View>
      ))}
      <T variant="small">Subscribed counts every company on a paid plan, whichever steps it took.</T>
    </Card>
  );
}

// Platform admin → Investor update (one-page PDF for a month) and Feature usage. Owners only.
import { useState } from 'react';
import { View } from 'react-native';
import { notify } from '../FormSheet';
import { Button, Card, ErrorBanner, Field, Loading, Row, Section, Segmented, T } from '../ui';
import type { PlatformMetricsData } from './PlatformMetrics';
import type { DayStat, Funnel } from '../../lib/growth';
import { investorHtml, monthLabel, monthSummary, recentMonths } from '../../lib/investorUpdate';
import { sharePdfFile } from '../../lib/finance';
import { friendlyError, must, supabase } from '../../lib/supabase';
import { colors, radius, space } from '../../lib/theme';
import { useQuery } from '../../lib/useQuery';

type Usage = { days: number; companies: number; features: { key: string; label: string; companies: number }[] };

const fetchUsage = async (days: number) => (await must(supabase.rpc('platform_feature_usage', { p_days: days }))) as Usage;

export function InvestorUpdate() {
  const months = recentMonths(6);
  const [month, setMonth] = useState(months[1]);
  const [highlights, setHighlights] = useState('');
  const [asks, setAsks] = useState('');
  const [busy, setBusy] = useState(false);
  const hist = useQuery(async () => (await must(supabase.rpc('platform_history', { p_days: 220 }))) as DayStat[], []);
  const s = hist.data ? monthSummary(hist.data, month) : null;

  const make = async () => {
    setBusy(true);
    try {
      const [metrics, funnel, usage] = await Promise.all([
        must(supabase.rpc('platform_metrics')) as Promise<PlatformMetricsData>,
        must(supabase.rpc('platform_funnel', { p_days: 90 })) as Promise<Funnel>,
        fetchUsage(30),
      ]);
      const html = investorHtml({
        summary: monthSummary(hist.data ?? [], month),
        trialConversionPct: metrics.trial_conversion_pct, grossMarginPct: metrics.gross_margin_estimate_pct,
        paymentVolume30d: metrics.payment_volume_30d, companiesTakingPayments30d: metrics.companies_taking_payments_30d,
        funnel, funnelDays: 90, usage: usage.features, usageCompanies: usage.companies, highlights, asks,
      });
      await sharePdfFile(html, `Tarmo investor update ${month}.pdf`);
    } catch (e: any) {
      notify('Could not make the PDF', friendlyError(e.message));
    } finally { setBusy(false); }
  };

  return (
    <Section title="Investor update" icon="document-text-outline">
      <Card>
        <T variant="muted" style={{ marginBottom: space.md }}>
          A one-page PDF: revenue, paying companies, sign-ups and cancellations for the month, plus the current funnel and feature usage. Add a few lines of your own and share it.
        </T>
        <Segmented value={month} onChange={setMonth} options={months.map((m, i) => ({ value: m, label: i === 0 ? `${monthLabel(m).split(' ')[0]} (so far)` : monthLabel(m).split(' ')[0] }))} />
        <ErrorBanner message={hist.error} onRetry={hist.reload} />
        {hist.loading ? <Loading /> : s ? (
          <Row gap={space.md} style={{ flexWrap: 'wrap', marginVertical: space.md }}>
            {[
              ['Revenue / month', s.mrrEnd == null ? '—' : `$${Math.round(s.mrrEnd).toLocaleString('en-US')}`, s.mrrGrowthPct == null ? '' : `${s.mrrGrowthPct > 0 ? '+' : ''}${s.mrrGrowthPct}%`],
              ['Paying companies', s.paidEnd == null ? '—' : String(s.paidEnd), ''],
              ['Sign-ups', String(s.newCompanies), ''],
              ['Cancelled', String(s.churned), ''],
            ].map(([l, v, sub]) => (
              <View key={l} style={{ minWidth: 130, flex: 1 }}>
                <T style={{ fontSize: 20, fontWeight: '800' }}>{v} {sub ? <T variant="small" style={{ color: colors.success }}>{sub}</T> : null}</T>
                <T variant="small">{l}</T>
              </View>
            ))}
          </Row>
        ) : null}
        {s && s.mrrEnd == null ? <T variant="small" style={{ marginBottom: space.md }}>No daily snapshots for this month yet. They start the day the dashboard went live.</T> : null}
        <Field label="Highlights (optional)" multiline value={highlights} onChangeText={setHighlights} placeholder="Signed our first franchise network. Launched Spanish for technicians." />
        <Field label="Where they can help (optional)" multiline value={asks} onChangeText={setAsks} placeholder="Intros to FBO chains in Texas." />
        <Button icon="download-outline" title={`Make the ${monthLabel(month)} PDF`} loading={busy} disabled={hist.loading} onPress={make} />
      </Card>
    </Section>
  );
}

export function FeatureUsage() {
  const [range, setRange] = useState<'7' | '30' | '90'>('30');
  const q = useQuery(() => fetchUsage(Number(range)), [range]);
  const total = q.data?.companies ?? 0;
  const rows = [...(q.data?.features ?? [])].sort((a, b) => b.companies - a.companies);
  return (
    <Section title="Feature usage" icon="bar-chart-outline">
      <T variant="muted" style={{ marginBottom: space.sm }}>
        How many active companies (not demo, not expired) used each feature. &quot;Set up&quot; and &quot;connected&quot; rows count companies that have it, whatever the period.
      </T>
      <Segmented value={range} onChange={setRange} options={[{ value: '7', label: '7 days' }, { value: '30', label: '30 days' }, { value: '90', label: '90 days' }]} />
      <ErrorBanner message={q.error} onRetry={q.reload} />
      {q.loading ? <Loading /> : (
        <Card>
          <T variant="small" style={{ marginBottom: space.md }}>{total} active {total === 1 ? 'company' : 'companies'}</T>
          {rows.map((f) => {
            const pct = total ? Math.round((f.companies / total) * 100) : 0;
            return (
              <View key={f.key} style={{ marginBottom: space.md }}>
                <Row style={{ justifyContent: 'space-between' }}>
                  <T style={{ fontWeight: '600', flex: 1 }}>{f.label}</T>
                  <T variant="small">{f.companies} · {pct}%</T>
                </Row>
                <View style={{ height: 8, backgroundColor: colors.border, borderRadius: radius.sm, marginTop: 4, overflow: 'hidden' }}>
                  <View style={{ width: `${pct}%`, height: 8, backgroundColor: pct ? colors.primary : 'transparent' }} />
                </View>
              </View>
            );
          })}
          <T variant="small" style={{ color: colors.textFaint }}>Low numbers point to features to explain better, move up in onboarding, or stop building.</T>
        </Card>
      )}
    </Section>
  );
}

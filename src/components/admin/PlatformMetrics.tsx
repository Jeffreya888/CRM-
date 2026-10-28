// Founder metrics (rpc platform_metrics, platform admins only).
import { View } from 'react-native';
import { Card, ErrorBanner, Grid, Row, Section, StatTile, T, type IconName } from '../ui';
import { dateTime, moneyShort } from '../../lib/format';
import { useIsDesktop } from '../../lib/layout';
import { must, supabase } from '../../lib/supabase';
import { colors, radius, space, type Tone } from '../../lib/theme';
import { useQuery } from '../../lib/useQuery';

export interface PlatformMetricsData {
  generated_at: string;
  companies: number; new_companies_30d: number; trials_active: number; paid_companies: number; expired: number;
  by_plan: Partial<Record<'solo' | 'team' | 'fleet', number>>;
  by_source: Partial<Record<'app_store' | 'play_store' | 'stripe' | 'unknown', number>>;
  mrr: number; mrr_net: number; arr: number; arpa: number | null; trial_conversion_pct: number | null;
  payment_volume_30d: number; platform_fees_30d: number; companies_taking_payments_30d: number;
  ai_checks_30d: number; ai_questions_30d: number; ai_cost_estimate_30d: number; gross_margin_estimate_pct: number | null;
}

const num = (v: number | null | undefined) => (v == null ? '—' : Number(v).toLocaleString('en-US'));
const pct = (v: number | null | undefined) => (v == null ? '—' : `${Number(v).toFixed(1)}%`);
const usd = (v: number | null | undefined) => (v == null ? '—' : moneyShort(v));

type Tile = { label: string; value: string; icon: IconName; tone: Tone };

export function usePlatformMetrics() {
  return useQuery(async () => (await must(supabase.rpc('platform_metrics'))) as PlatformMetricsData, []);
}

export function PlatformMetrics({ q }: { q: ReturnType<typeof usePlatformMetrics> }) {
  const desktop = useIsDesktop();
  const m = q.data;
  const tiles: Tile[] = [
    { label: 'MRR', value: usd(m?.mrr), icon: 'trending-up', tone: 'success' },
    { label: 'ARR', value: usd(m?.arr), icon: 'calendar-outline', tone: 'success' },
    { label: 'Paid companies', value: num(m?.paid_companies), icon: 'business-outline', tone: 'primary' },
    { label: 'Active trials', value: num(m?.trials_active), icon: 'time-outline', tone: 'warning' },
    { label: 'Trial conversion', value: pct(m?.trial_conversion_pct), icon: 'swap-horizontal-outline', tone: 'info' },
    { label: 'ARPA (per month)', value: usd(m?.arpa), icon: 'person-outline', tone: 'purple' },
    { label: 'Payment volume (30 days)', value: usd(m?.payment_volume_30d), icon: 'card-outline', tone: 'primary' },
    { label: 'Platform fees (30 days)', value: usd(m?.platform_fees_30d), icon: 'cash-outline', tone: 'success' },
    { label: 'AI checks (30 days)', value: num(m?.ai_checks_30d), icon: 'sparkles-outline', tone: 'purple' },
    { label: 'AI questions (30 days)', value: num(m?.ai_questions_30d), icon: 'chatbubbles-outline', tone: 'purple' },
    { label: 'AI cost (estimate)', value: usd(m?.ai_cost_estimate_30d), icon: 'flask-outline', tone: 'warning' },
    { label: 'Gross margin (estimate)', value: pct(m?.gross_margin_estimate_pct), icon: 'pie-chart-outline', tone: 'info' },
  ];
  const cells = tiles.map((t) => <StatTile key={t.label} label={t.label} value={t.value} icon={t.icon} tone={t.tone} />);
  const pairs: typeof cells[] = [];
  for (let i = 0; i < cells.length; i += 2) pairs.push(cells.slice(i, i + 2));

  const plan = m?.by_plan ?? {};
  const source = m?.by_source ?? {};
  return (
    <View>
      <ErrorBanner message={q.error} onRetry={q.refresh} />
      {desktop ? (
        <Grid columns={4} gap={space.md} rowGap={space.md}>{cells}</Grid>
      ) : (
        <View style={{ gap: space.md }}>
          {pairs.map((p, i) => <Row key={i} gap={space.md} style={{ alignItems: 'stretch' }}>{p}</Row>)}
        </View>
      )}
      {m ? (
        <T variant="small" style={{ marginTop: space.md }}>
          {num(m.companies)} companies ({num(m.new_companies_30d)} new in 30 days, {num(m.expired)} expired) · Net MRR after store/Stripe fees {usd(m.mrr_net)} · {num(m.companies_taking_payments_30d)} companies took card payments in 30 days. Estimates: AI at about 10¢ per check and 1.5¢ per question; margin also subtracts ~$25/mo hosting. Updated {dateTime(m.generated_at)}.
        </T>
      ) : null}
      <View style={desktop ? { flexDirection: 'row', gap: space.lg } : undefined}>
        <View style={{ flex: 1 }}>
          <Section title="Plan mix" icon="layers-outline">
            <Bars rows={[
              { label: 'Solo', value: plan.solo ?? 0, color: colors.primary },
              { label: 'Team', value: plan.team ?? 0, color: colors.success },
              { label: 'Fleet', value: plan.fleet ?? 0, color: colors.purple },
            ]} empty="No paid companies yet." />
          </Section>
        </View>
        <View style={{ flex: 1 }}>
          <Section title="Billing source" icon="wallet-outline">
            <Bars rows={[
              { label: 'App Store', value: source.app_store ?? 0, color: colors.primary },
              { label: 'Google Play', value: source.play_store ?? 0, color: colors.success },
              { label: 'Web (Stripe)', value: source.stripe ?? 0, color: colors.purple },
              { label: 'Unknown', value: source.unknown ?? 0, color: colors.textFaint },
            ]} empty="No paid companies yet." />
          </Section>
        </View>
      </View>
    </View>
  );
}

function Bars({ rows, empty }: { rows: { label: string; value: number; color: string }[]; empty: string }) {
  const total = rows.reduce((s, r) => s + r.value, 0);
  return (
    <Card>
      {total === 0 ? <T variant="muted">{empty}</T> : rows.map((r) => {
        const share = total ? r.value / total : 0;
        return (
          <View key={r.label} style={{ marginBottom: space.md }}>
            <Row style={{ justifyContent: 'space-between', marginBottom: 4 }}>
              <T>{r.label}</T>
              <T variant="muted">{r.value.toLocaleString('en-US')} · {Math.round(share * 100)}%</T>
            </Row>
            <View style={{ height: 8, borderRadius: radius.pill, backgroundColor: colors.cardRaised, overflow: 'hidden' }}>
              <View style={{ width: `${share * 100}%`, height: '100%', backgroundColor: r.color, borderRadius: radius.pill }} />
            </View>
          </View>
        );
      })}
    </Card>
  );
}

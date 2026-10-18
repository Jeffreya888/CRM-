import { useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { Card, ErrorBanner, Ionicons, Row, T } from '../ui';
import { money } from '../../lib/format';
import { useOrg } from '../../lib/session';
import { friendlyError, supabase } from '../../lib/supabase';
import { colors, space } from '../../lib/theme';
import { useQuery } from '../../lib/useQuery';
import { hoursText, signedPct } from './costingFormat';

/** public.job_profitability with the estimate-vs-actual fields (docs/competitive-edge.md §9). */
export interface JobProfitability {
  revenue: number; labor: number | null; labor_minutes: number; labor_unknown_minutes: number; supplies: number | null; job_expenses: number;
  gross: number | null; net: number | null; margin_pct: number | null;
  est_hours?: number | null; est_labor?: number | null; est_supplies?: number | null; est_cost?: number | null;
  true_labor?: number | null; overhead?: number | null; true_cost?: number | null; true_profit?: number | null; true_margin_pct?: number | null;
  hours_variance_pct?: number | null;
}

const n = (v: unknown): number | null => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));

/**
 * "Estimate vs actual" card for a job: hours and cost estimated from its
 * services against the real clocked time and true cost (wages + payroll % +
 * overhead, supplies, job expenses). Renders nothing without "see reports".
 */
export function EstimateVsActual({ jobId }: { jobId: string }) {
  const { perm } = useOrg();
  if (!perm('see_reports')) return null;
  return <EstimateVsActualCard jobId={jobId} />;
}

function EstimateVsActualCard({ jobId }: { jobId: string }) {
  const { org } = useOrg();
  const cur = org.currency;
  const [explain, setExplain] = useState(false);
  const q = useQuery(async () => {
    const { data, error } = await supabase.rpc('job_profitability', { p_job: jobId });
    if (error) throw new Error(friendlyError(error.message));
    return data as JobProfitability;
  }, [jobId]);

  if (q.loading && !q.data) return <Card><ActivityIndicator color={colors.primary} /></Card>;
  if (q.error) return <Card><ErrorBanner message={q.error} onRetry={q.reload} /></Card>;
  const p = q.data;
  if (!p) return null;

  const estH = n(p.est_hours);
  const actH = Number(p.labor_minutes) > 0 ? Number(p.labor_minutes) / 60 : null;
  const estCost = n(p.est_cost);
  const trueCost = n(p.true_cost);
  const trueProfit = n(p.true_profit);
  const trueMargin = n(p.true_margin_pct);
  const hoursVar = n(p.hours_variance_pct) ?? (estH && actH != null ? Math.round(((actH - estH) / estH) * 100) : null);
  const missingRates = Number(p.labor_unknown_minutes) > 0 || (actH != null && p.true_labor == null);
  const missingSupplyCost = p.supplies == null;

  // Nothing estimated and nothing clocked yet: stay out of the way.
  if (estH == null && actH == null && estCost == null && trueCost == null) return null;

  const varColor = hoursVar == null ? colors.textMuted : hoursVar > 10 ? colors.danger : hoursVar < -10 ? colors.success : colors.textMuted;

  return (
    <Card>
      <Line label="Hours"
        value={`est ${estH != null ? hoursText(estH) : '—'} · actual ${actH != null ? hoursText(actH) : 'not clocked yet'}`}
        extra={hoursVar != null && actH != null ? { text: `(${signedPct(hoursVar)})`, color: varColor } : undefined} />
      <Line label="Cost"
        value={`est ${estCost != null ? money(estCost, cur) : '—'} · actual ${trueCost != null ? money(trueCost, cur) : actH != null ? 'unknown' : '—'}`} />
      {trueProfit != null ? (
        <Row style={{ justifyContent: 'space-between', paddingVertical: 4 }}>
          <T style={{ fontWeight: '700' }}>True profit</T>
          <T style={{ fontWeight: '800', color: trueProfit >= 0 ? colors.success : colors.danger, fontVariant: ['tabular-nums'] }}>
            {money(trueProfit, cur)}{trueMargin != null ? ` (${Math.round(trueMargin)}%)` : ''}
          </T>
        </Row>
      ) : null}

      {missingRates ? <T variant="small" style={{ marginTop: 4, color: colors.warning }}>Add pay rates to see true labor cost (Team → pay rates).</T> : null}
      {missingSupplyCost ? <T variant="small" style={{ marginTop: 4, color: colors.warning }}>Some supplies have no unit cost yet — set it in the Supply room.</T> : null}
      {estH == null ? <T variant="small" style={{ marginTop: 4 }}>Add estimated hours to your services to compare against actual time.</T> : null}

      <Pressable onPress={() => setExplain((v) => !v)} accessibilityRole="button" style={{ marginTop: space.sm }}>
        <Row gap={4}>
          <Ionicons name={explain ? 'chevron-down' : 'chevron-forward'} size={13} color={colors.primaryText} />
          <T variant="small" style={{ color: colors.primaryText }}>How is this calculated?</T>
        </Row>
      </Pressable>
      {explain ? (
        <View style={{ marginTop: 4 }}>
          <T variant="small">
            Labor = clocked hours × each person&apos;s wage, plus payroll taxes &amp; insurance ({Number(org.labor_burden_pct ?? 0)}%) and overhead
            ({money(Number(org.overhead_per_hour ?? 0), cur)} per labor hour). Then supplies used on the job and job expenses are added.
            Estimates come from each service&apos;s hours and supplies. Owners can change these in Settings → Job costing &amp; quality.
          </T>
        </View>
      ) : null}
    </Card>
  );
}

function Line({ label, value, extra }: { label: string; value: string; extra?: { text: string; color: string } }) {
  return (
    <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start', paddingVertical: 4 }}>
      <T variant="muted">{label}</T>
      <T style={{ flex: 1, textAlign: 'right', fontVariant: ['tabular-nums'] }}>
        {value}{extra ? <T style={{ color: extra.color, fontWeight: '700' }}>{` ${extra.text}`}</T> : null}
      </T>
    </Row>
  );
}

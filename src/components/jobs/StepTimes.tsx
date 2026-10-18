// Per-step time on the job checklist: the SOP's estimate vs. the actual gap
// between checked steps (docs/competitive-edge.md §3).
import { View } from 'react-native';
import { minutesLabel } from '../../lib/guides';
import { colors, space } from '../../lib/theme';
import type { GuideStep } from '../../lib/types';
import { Ionicons, Row, T } from '../ui';

export interface StepItem {
  id: string; kind?: string | null; done: boolean; done_at: string | null; guide_key: string | null; step_index: number | null;
}
export interface StepTiming { est: number | null; actual: number | null }

/** Steps (not quality checks) of a job checklist. */
export const stepItems = <X extends { kind?: string | null }>(items: X[]) => items.filter((c) => (c.kind ?? 'step') !== 'qc');

/**
 * Estimate from each item's SOP step (`guides[guide_key].steps[step_index].minutes`), and the
 * actual minutes: time since the previously checked step, or since the job started for the first one.
 */
export function stepTimings(items: StepItem[], guides: Record<string, { steps: GuideStep[] } | null | undefined>, actualStart: string | null): Record<string, StepTiming> {
  const out: Record<string, StepTiming> = {};
  for (const c of items) {
    const st = c.guide_key && c.step_index != null ? guides[c.guide_key]?.steps?.[c.step_index] : undefined;
    const m = Number(st?.minutes);
    out[c.id] = { est: Number.isFinite(m) && m > 0 ? m : null, actual: null };
  }
  const done = items.filter((c) => c.done && c.done_at).sort((a, b) => new Date(a.done_at!).getTime() - new Date(b.done_at!).getTime());
  let prev = actualStart ? new Date(actualStart).getTime() : null;
  for (const c of done) {
    const t = new Date(c.done_at!).getTime();
    if (prev != null && t >= prev) out[c.id]!.actual = (t - prev) / 60000;
    prev = t;
  }
  return out;
}

/** "est 20m · took 25m" under a checklist row. */
export function StepTimeLine({ t }: { t: StepTiming | undefined }) {
  if (!t || (t.est == null && t.actual == null)) return null;
  const over = t.est != null && t.actual != null && t.actual > t.est * 1.15;
  return (
    <T variant="small" style={{ marginTop: 2 }}>
      {t.est != null ? `est ${minutesLabel(t.est)}` : ''}
      {t.est != null && t.actual != null ? ' · ' : ''}
      {t.actual != null ? <T variant="small" style={over ? { color: colors.warning } : undefined}>took {minutesLabel(t.actual)}</T> : null}
    </T>
  );
}

/** "Steps took 3h 10m (est. 2h 45m)". Renders nothing without any estimate or actual time. */
export function StepTimesSummary({ items, timings }: { items: StepItem[]; timings: Record<string, StepTiming> }) {
  const est = items.reduce((s, c) => s + (timings[c.id]?.est ?? 0), 0);
  const actual = items.reduce((s, c) => s + (timings[c.id]?.actual ?? 0), 0);
  if (!est && !actual) return null;
  const allDone = items.length > 0 && items.every((c) => c.done);
  const text = actual
    ? `${allDone ? 'Steps took' : 'Steps so far'} ${minutesLabel(actual)}${est ? ` (est. ${minutesLabel(est)}${allDone ? '' : ' total'})` : ''}`
    : `Steps estimated at ${minutesLabel(est)}`;
  const over = allDone && est > 0 && actual > est * 1.15;
  return (
    <View style={{ paddingHorizontal: space.md, paddingTop: space.md }}>
      <Row gap={6}>
        <Ionicons name="stopwatch-outline" size={16} color={over ? colors.warning : colors.textMuted} />
        <T variant="small" style={{ flex: 1, color: over ? colors.warning : colors.textMuted, fontWeight: '600' }}>{text}</T>
      </Row>
    </View>
  );
}

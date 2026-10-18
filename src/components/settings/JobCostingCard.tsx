import { useState } from 'react';
import { View } from 'react-native';
import { FeatureRow } from '../plans/PlanUpsell';
import { Button, Card, Divider, ErrorBanner, Field, Row, T, ToggleRow } from '../ui';
import { money } from '../../lib/format';
import { CONDITION_LEVELS, DEFAULT_CONDITION_MULTIPLIERS } from '../../lib/pricing';
import { friendlyError, supabase } from '../../lib/supabase';
import { colors, space } from '../../lib/theme';
import type { ConditionLevel, Organization } from '../../lib/types';

const numText = (v: unknown) => String(+(Number(v) || 0).toFixed(2));
const clean = (v: string) => v.replace(/[^0-9.]/g, '');

/**
 * Settings → "Job costing & quality" (owner/admin): payroll % and overhead for
 * true labor cost, condition pricing percents, and the QC / photo-quote toggles.
 */
export function JobCostingCard({ org, onChanged }: { org: Organization; onChanged: () => Promise<void> }) {
  const mult = { ...DEFAULT_CONDITION_MULTIPLIERS, ...(org.condition_multipliers ?? {}) };
  const initial = {
    burden: numText(org.labor_burden_pct ?? 15),
    overhead: numText(org.overhead_per_hour ?? 0),
    ...Object.fromEntries(CONDITION_LEVELS.map((c) => [c.value, numText(mult[c.value])])) as Record<ConditionLevel, string>,
  };
  const [v, setV] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [busy, setBusy] = useState<'save' | 'suggest' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [suggestNote, setSuggestNote] = useState<string | null>(null);
  const dirty = JSON.stringify(v) !== JSON.stringify(saved);
  const set = (k: keyof typeof initial, text: string) => setV((s) => ({ ...s, [k]: clean(text) }));

  const update = async (patch: Record<string, unknown>) => {
    const { error: e } = await supabase.from('organizations').update(patch).eq('id', org.id);
    if (e) throw new Error(friendlyError(e.message));
    await onChanged();
  };

  const save = async () => {
    setError(null);
    const burden = Number(v.burden) || 0;
    const overhead = Number(v.overhead) || 0;
    if (burden < 0 || burden > 100) return setError('Payroll taxes & insurance should be between 0 and 100%.');
    if (overhead < 0 || overhead > 1000) return setError('Overhead per labor hour should be between $0 and $1,000.');
    const multipliers = Object.fromEntries(CONDITION_LEVELS.map((c) => [c.value, Number(v[c.value]) || 0])) as Record<ConditionLevel, number>;
    if (Object.values(multipliers).some((n) => n < 0 || n > 300)) return setError('Condition percents should be between 0 and 300.');
    setBusy('save');
    try {
      await update({ labor_burden_pct: burden, overhead_per_hour: overhead, condition_multipliers: multipliers });
      setSaved(v);
      setSuggestNote(null);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  };

  const suggest = async () => {
    setError(null);
    setBusy('suggest');
    try {
      const { data, error: e } = await supabase.rpc('suggest_overhead_per_hour', { p_org: org.id });
      if (e) throw new Error(friendlyError(e.message));
      const r = (data ?? {}) as { overhead_per_hour?: number | null; expenses?: number; hours?: number; days?: number };
      const hours = Number(r.hours) || 0;
      const days = Number(r.days) || 90;
      if (!hours || r.overhead_per_hour == null) {
        setSuggestNote(`Not enough clocked labor hours in the last ${days} days to suggest a number yet. Have your crew clock in on jobs, then try again.`);
        return;
      }
      setSuggestNote(`Based on ${money(Number(r.expenses) || 0, org.currency)} of expenses over ${Math.round(hours)} labor hours in the last ${days} days. Tap Save to keep it.`);
      setV((s) => ({ ...s, overhead: numText(r.overhead_per_hour) }));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  };

  const toggle = async (patch: Record<string, unknown>) => {
    setError(null);
    try { await update(patch); } catch (e: any) { setError(e.message); }
  };

  return (
    <Card>
      <ErrorBanner message={error} />
      <T variant="h3">True labor cost</T>
      <T variant="small" style={{ marginBottom: space.md }}>Used for job profit, quote margins and the Job costing report.</T>
      <Field label="Payroll taxes & insurance on top of wages (%)" keyboardType="decimal-pad" value={v.burden} onChangeText={(t) => set('burden', t)} placeholder="15"
        hint="Employer payroll taxes, workers' comp and benefits. 15% is a common starting point." />
      <Field label={`Overhead per labor hour (${org.currency})`} keyboardType="decimal-pad" value={v.overhead} onChangeText={(t) => set('overhead', t)} placeholder="0"
        hint="Rent, insurance, vehicles, software and other costs not tied to one job, spread over each hour worked." style={{ marginBottom: space.sm }} />
      <Button small kind="secondary" icon="sparkles-outline" title="Suggest from my expenses" loading={busy === 'suggest'} onPress={suggest} style={{ alignSelf: 'flex-start' }} />
      {suggestNote ? <T variant="small" style={{ marginTop: space.sm, color: colors.primaryText }}>{suggestNote}</T> : null}

      <Divider />
      <T variant="h3">Condition pricing</T>
      <T variant="small" style={{ marginBottom: space.md }}>Percent added to quote prices when the aircraft, vehicle or boat is in this condition. Light is normally 0.</T>
      <Row style={{ flexWrap: 'wrap' }} gap={space.sm}>
        {CONDITION_LEVELS.map((c) => (
          <View key={c.value} style={{ flexGrow: 1, flexBasis: 120 }}>
            <Field label={`${c.label} (+%)`} keyboardType="decimal-pad" value={v[c.value]} onChangeText={(t) => set(c.value, t)} placeholder={String(DEFAULT_CONDITION_MULTIPLIERS[c.value])} />
          </View>
        ))}
      </Row>
      <Button title="Save" icon="checkmark" disabled={!dirty} loading={busy === 'save'} onPress={save} />

      <Divider />
      <T variant="h3" style={{ marginBottom: space.md }}>Quality</T>
      <FeatureRow feature="quality_check" label="Require a quality check before completing jobs" hint="A manager signs off each job before it's complete.">
        <ToggleRow label="Require a quality check before completing jobs" hint="A manager passes the job's quality checks before it can be marked complete."
          value={!!org.require_qc} onChange={(on) => toggle({ require_qc: on })} />
      </FeatureRow>
      <FeatureRow feature="photo_quotes" label="Customers can request quotes from photos" hint="Customers send photos from your portal and get an AI condition report.">
        <ToggleRow label="Customers can request quotes from photos" hint="Adds “Get a quote from photos” to your customer portal, with an AI condition report for you to review."
          value={org.photo_quotes_enabled !== false} onChange={(on) => toggle({ photo_quotes_enabled: on })} />
      </FeatureRow>
    </Card>
  );
}

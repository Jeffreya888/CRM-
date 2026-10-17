import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, Switch, View } from 'react-native';
import { friendlyError, supabase } from '../../lib/supabase';
import { colors, radius, space } from '../../lib/theme';
import type { Automation } from '../../lib/types';
import { Badge, Button, Card, ErrorBanner, Field, IconTile, Ionicons, Row, Segmented, T, ToggleRow } from '../ui';
import { AUTOMATION_META, CHANNEL_OPTIONS, sequenceLabel } from './meta';

type Settings = Record<string, any>;
type LateFee = { enabled: boolean; type: 'flat' | 'percent'; value: number; after_days: number };

const DEFAULT_FEE: LateFee = { enabled: false, type: 'flat', value: 25, after_days: 30 };

/** One automation: on/off, channel, timing and a link to its message template. */
export function AutomationCard({ a, editable, smsActive, hasReviewLink, onSaved }: {
  a: Automation; editable: boolean; smsActive: boolean; hasReviewLink: boolean; onSaved: () => void;
}) {
  const meta = AUTOMATION_META[a.key];
  const [enabled, setEnabled] = useState(a.enabled);
  const [channel, setChannel] = useState(a.channel);
  const [settings, setSettings] = useState<Settings>(() => ({ ...a.settings }));
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newDay, setNewDay] = useState('');

  const save = async (patch: Partial<Automation>) => {
    setError(null);
    const { error: e } = await supabase.from('automations').update({ ...patch, updated_at: new Date().toISOString() }).eq('org_id', a.org_id).eq('key', a.key);
    if (e) { setError(friendlyError(e.message)); return false; }
    onSaved();
    return true;
  };
  const setS = (k: string, v: unknown) => { setSettings((s) => ({ ...s, [k]: v })); setDirty(true); };
  const numField = (k: string, label: string, hint?: string) => (
    <Field key={k} label={label} hint={hint} editable={editable} keyboardType="number-pad"
      value={settings[k] == null ? '' : String(settings[k])}
      onChangeText={(t) => setS(k, t.replace(/[^0-9]/g, ''))} />
  );
  const saveSettings = async () => {
    const out: Settings = { ...settings };
    for (const k of ['hours_before', 'days_after_payment', 'after_days', 'before_deadline_hours', 'days_before']) {
      if (k in out) out[k] = out[k] === '' || out[k] == null ? 0 : Number(out[k]);
    }
    if (out.late_fee) {
      const f = out.late_fee as LateFee;
      out.late_fee = { ...f, value: Number(f.value) || 0, after_days: Number(f.after_days) || 0 };
    }
    if (await save({ settings: out })) setDirty(false);
  };

  const fee: LateFee = { ...DEFAULT_FEE, ...(settings.late_fee ?? {}) };
  const setFee = (patch: Partial<LateFee>) => setS('late_fee', { ...fee, ...patch });
  const days: number[] = Array.isArray(settings.sequence_days) ? [...settings.sequence_days].map(Number).sort((x, y) => x - y) : [];

  return (
    <Card>
      <ErrorBanner message={error} />
      <Row gap={space.md} style={{ alignItems: 'flex-start' }}>
        <IconTile icon={meta.icon} tone={enabled ? 'primary' : 'neutral'} />
        <View style={{ flex: 1 }}>
          <T style={{ fontWeight: '700', fontSize: 17 }}>{meta.title}</T>
          <T variant="muted">{meta.description}</T>
        </View>
        <Switch value={enabled} disabled={!editable}
          onValueChange={async (v) => { setEnabled(v); if (!(await save({ enabled: v }))) setEnabled(!v); }}
          trackColor={{ true: colors.primary, false: colors.borderStrong }} thumbColor={colors.white} />
      </Row>

      {enabled ? (
        <View style={{ marginTop: space.lg }}>
          <T style={{ fontWeight: '600', marginBottom: 8 }}>Send by</T>
          {editable ? (
            <Segmented value={channel} onChange={async (v) => { const prev = channel; setChannel(v); if (!(await save({ channel: v }))) setChannel(prev); }} options={CHANNEL_OPTIONS} />
          ) : <Badge label={CHANNEL_OPTIONS.find((c) => c.value === channel)?.label ?? channel} tone="info" raw />}
          {channel !== 'email' ? (
            <T variant="small" style={{ marginTop: -space.sm, marginBottom: space.md }}>
              Texts only go to customers who agreed to receive them and have not replied STOP{channel === 'both' ? '; everyone else still gets the email' : ''}.
              {!smsActive ? ' Customer texting is not set up yet, so texts are not sent.' : ''}
            </T>
          ) : null}
          {channel !== 'email' && !smsActive ? (
            <Button small kind="ghost" icon="chatbubbles-outline" title="Set up customer texting" onPress={() => router.push('/texting')} style={{ alignSelf: 'flex-start', marginBottom: space.md }} />
          ) : null}

          {a.key === 'job_reminder' ? numField('hours_before', 'Hours before the visit') : null}
          {a.key === 'job_complete' ? (
            <ToggleRow label="Include photos" value={settings.include_photos !== false} onChange={(v) => editable && setS('include_photos', v)}
              hint="Before and after photos are shown in the customer portal." />
          ) : null}
          {a.key === 'review_request' ? (
            <>
              {numField('days_after_payment', 'Days after payment')}
              {!hasReviewLink ? (
                <Pressable onPress={() => router.push('/settings')} style={{ flexDirection: 'row', gap: 8, alignItems: 'center', backgroundColor: colors.warningSoft, padding: space.md, borderRadius: radius.md, marginBottom: space.md }}>
                  <Ionicons name="alert-circle-outline" size={18} color={colors.warning} />
                  <T style={{ flex: 1, color: colors.warning }}>Add your Google review link in Company settings, or review requests are not sent.</T>
                  <Ionicons name="chevron-forward" size={18} color={colors.warning} />
                </Pressable>
              ) : null}
            </>
          ) : null}
          {a.key === 'quote_follow_up' ? (
            <Row gap={space.md}>
              <View style={{ flex: 1 }}>{numField('after_days', 'Days after sending')}</View>
              <View style={{ flex: 1 }}>{numField('before_deadline_hours', 'Hours before it expires')}</View>
            </Row>
          ) : null}
          {a.key === 'recurring_heads_up' ? numField('days_before', 'Days before the visit', 'Each recurring schedule can choose its own number of days.') : null}
          {a.key === 'on_our_way' ? <T variant="small" style={{ marginBottom: space.md }}>Technicians send this from the job screen when they leave.</T> : null}

          {a.key === 'invoice_reminders' ? (
            <>
              <T style={{ fontWeight: '600', marginBottom: 8 }}>Reminder schedule (days from the due date)</T>
              <Row gap={space.sm} style={{ flexWrap: 'wrap', marginBottom: space.md }}>
                {days.map((d) => (
                  <Pressable key={d} disabled={!editable} onPress={() => setS('sequence_days', days.filter((x) => x !== d))}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 7, paddingHorizontal: 12, borderRadius: radius.pill, backgroundColor: colors.primarySoft }}>
                    <T style={{ color: colors.primaryText, fontWeight: '600' }}>{sequenceLabel(d)}</T>
                    {editable ? <Ionicons name="close" size={14} color={colors.primaryText} /> : null}
                  </Pressable>
                ))}
                {!days.length ? <T variant="muted">No reminders in the sequence.</T> : null}
              </Row>
              {editable ? (
                <Row gap={space.sm} style={{ alignItems: 'flex-start' }}>
                  <Field style={{ flex: 1 }} value={newDay} onChangeText={(t) => setNewDay(t.replace(/[^0-9-]/g, ''))} keyboardType="numbers-and-punctuation"
                    placeholder="e.g. -3, 0 or 45" hint="Negative = before the due date, 0 = on the due date." />
                  <Button small kind="secondary" icon="add" title="Add" onPress={() => {
                    const n = parseInt(newDay, 10);
                    if (Number.isNaN(n) || n < -60 || n > 365) return;
                    if (!days.includes(n)) setS('sequence_days', [...days, n].sort((x, y) => x - y));
                    setNewDay('');
                  }} style={{ marginTop: 2 }} />
                </Row>
              ) : null}
              <View style={{ borderTopWidth: 1, borderTopColor: colors.border, paddingTop: space.md, marginTop: space.sm }}>
                <ToggleRow label="Late fee" value={fee.enabled} onChange={(v) => editable && setFee({ enabled: v })}
                  hint="Customers are warned in the reminder before the fee applies." />
                {fee.enabled ? (
                  <>
                    <Segmented value={fee.type} onChange={(v) => editable && setFee({ type: v })} options={[{ value: 'flat', label: 'Flat amount' }, { value: 'percent', label: '% of balance' }]} />
                    <Row gap={space.md}>
                      <Field style={{ flex: 1 }} label={fee.type === 'flat' ? 'Amount ($)' : 'Percent'} editable={editable} keyboardType="decimal-pad"
                        value={String(fee.value ?? '')} onChangeText={(t) => setFee({ value: t.replace(/[^0-9.]/g, '') as unknown as number })} />
                      <Field style={{ flex: 1 }} label="Days overdue" editable={editable} keyboardType="number-pad"
                        value={String(fee.after_days ?? '')} onChangeText={(t) => setFee({ after_days: t.replace(/[^0-9]/g, '') as unknown as number })} />
                    </Row>
                  </>
                ) : null}
              </View>
            </>
          ) : null}

          {dirty && editable ? <Button small icon="checkmark" title="Save timing" onPress={saveSettings} style={{ alignSelf: 'flex-start', marginBottom: space.md }} /> : null}
        </View>
      ) : null}

      <Button small kind="ghost" icon="create-outline" title={editable ? 'Edit message' : 'View message'}
        onPress={() => router.push({ pathname: '/automations/[key]', params: { key: a.key } })} style={{ alignSelf: 'flex-start', marginTop: enabled ? 0 : space.md }} />
    </Card>
  );
}

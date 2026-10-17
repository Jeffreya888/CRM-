import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { AUTOMATION_EXCEPTIONS } from '../../lib/assets';
import { dateTime } from '../../lib/format';
import { friendlyError, supabase } from '../../lib/supabase';
import { colors, space } from '../../lib/theme';
import type { Customer } from '../../lib/types';
import { Badge, Card, ErrorBanner, Ionicons, Row, T, ToggleRow } from '../ui';

type Comms = Pick<Customer, 'id' | 'phone' | 'sms_consent' | 'sms_consent_at' | 'sms_opted_out' | 'email_opted_out' | 'automation_exceptions'>;

/** Texting consent: on/off with the time consent was recorded; STOP replies show as opted out. */
export function ConsentCard({ c, editable, onChanged }: { c: Comms; editable: boolean; onChanged: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const set = async (v: boolean) => {
    setError(null);
    const { error: e } = await supabase.from('customers')
      .update({ sms_consent: v, sms_consent_at: v ? new Date().toISOString() : null }).eq('id', c.id);
    if (e) setError(friendlyError(e.message));
    else onChanged();
  };
  return (
    <Card>
      <ErrorBanner message={error} />
      <Row gap={space.sm} style={{ flexWrap: 'wrap', marginBottom: space.md }}>
        {c.sms_opted_out ? <Badge label="Opted out of texts" tone="danger" raw /> : c.sms_consent ? <Badge label="OK to text" tone="success" raw /> : <Badge label="No texting consent" tone="neutral" raw />}
        {c.email_opted_out ? <Badge label="Unsubscribed from emails" tone="warning" raw /> : null}
      </Row>
      {c.sms_opted_out ? (
        <T variant="muted">This customer replied STOP, so no texts will be sent. They can text START to opt back in.</T>
      ) : editable ? (
        <ToggleRow label="Customer agreed to receive texts" value={c.sms_consent} onChange={set}
          hint={c.sms_consent && c.sms_consent_at ? `Recorded ${dateTime(c.sms_consent_at)}` : 'Only turn on if they said yes. Texts are only sent with consent.'} />
      ) : (
        <T variant="muted">{c.sms_consent && c.sms_consent_at ? `Consent recorded ${dateTime(c.sms_consent_at)}` : 'No texting consent recorded.'}</T>
      )}
      {!c.phone ? <T variant="small">Add a mobile number to text this customer.</T> : null}
    </Card>
  );
}

/** Per-customer automation exceptions, e.g. no invoice reminders for net-60 accounts. */
export function AutomationExceptionsCard({ c, editable, onChanged }: { c: Comms; editable: boolean; onChanged: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const off = new Set(c.automation_exceptions ?? []);
  const toggle = async (key: string) => {
    if (!editable || saving) return;
    const next = new Set(off);
    if (next.has(key)) next.delete(key); else next.add(key);
    setSaving(key);
    setError(null);
    const { error: e } = await supabase.from('customers').update({ automation_exceptions: [...next] }).eq('id', c.id);
    setSaving(null);
    if (e) setError(friendlyError(e.message));
    else onChanged();
  };
  return (
    <Card style={{ paddingVertical: space.sm }}>
      <ErrorBanner message={error} />
      <T variant="small" style={{ marginBottom: space.sm }}>Checked messages are turned off for this customer only.</T>
      {AUTOMATION_EXCEPTIONS.map((a) => {
        const checked = off.has(a.key);
        return (
          <Pressable key={a.key} disabled={!editable} onPress={() => toggle(a.key)} accessibilityRole="checkbox" accessibilityState={{ checked }}
            style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: 10 }, pressed && { opacity: 0.6 }]}>
            <Ionicons name={checked ? 'checkbox' : 'square-outline'} size={22} color={checked ? colors.warning : colors.textMuted} />
            <View style={{ flex: 1 }}>
              <T style={{ opacity: saving === a.key ? 0.5 : 1 }}>{checked ? `No ${a.label.toLowerCase()}` : a.label}</T>
              <T variant="small">{a.hint}</T>
            </View>
          </Pressable>
        );
      })}
    </Card>
  );
}

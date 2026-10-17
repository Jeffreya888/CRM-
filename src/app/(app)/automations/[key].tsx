import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { AUTOMATION_META } from '../../../components/automations/meta';
import { notify } from '../../../components/FormSheet';
import { Gate } from '../../../components/Gate';
import { Button, Card, EmptyState, ErrorBanner, Field, Loading, Row, Screen, Section, T } from '../../../components/ui';
import { canAdmin, canSeeMoney } from '../../../lib/plans';
import { useOrg } from '../../../lib/session';
import { callFunction, friendlyError, must, supabase } from '../../../lib/supabase';
import { colors, radius, space } from '../../../lib/theme';
import { renderTemplate, SAMPLE_VALUES, TEMPLATE_FIELDS } from '../../../lib/templates';
import type { Automation, AutomationKey } from '../../../lib/types';
import { useQuery } from '../../../lib/useQuery';

export default function TemplateEditor() {
  return (
    <Gate feature="reminders">
      <Inner />
    </Gate>
  );
}

type Target = 'subject' | 'body';

function Inner() {
  const { key } = useLocalSearchParams<{ key: AutomationKey }>();
  const { org, orgId, role, session } = useOrg();
  const editable = canAdmin(role);
  const meta = AUTOMATION_META[key as AutomationKey];
  const q = useQuery(async () => (await must(supabase.from('automations').select('*').eq('org_id', orgId).eq('key', key).maybeSingle())) as Automation | null, [orgId, key]);

  const [draft, setDraft] = useState<{ subject: string; body: string } | null>(null);
  if (!draft && q.data) setDraft({ subject: (q.data.subject ?? '').replace(/\\n/g, '\n'), body: q.data.body.replace(/\\n/g, '\n') });
  const [target, setTarget] = useState<Target>('body');
  const [sel, setSel] = useState<Record<Target, { start: number; end: number }>>({ subject: { start: 0, end: 0 }, body: { start: 0, end: 0 } });
  const [error, setError] = useState<string | null>(null);

  const title = meta?.title ?? 'Message';
  if (!canSeeMoney(role)) return <Screen><Stack.Screen options={{ title }} /><EmptyState icon="lock-closed-outline" title="Managers only" /></Screen>;
  if (!draft) {
    return q.loading ? <><Stack.Screen options={{ title }} /><Loading /></> : <Screen><Stack.Screen options={{ title }} /><ErrorBanner message={q.error ?? 'Not found'} onRetry={q.reload} /></Screen>;
  }

  const values = { ...SAMPLE_VALUES, company: org.name || SAMPLE_VALUES.company };
  const smsOnly = q.data?.channel === 'sms';
  const dirty = draft.subject !== (q.data?.subject ?? '').replace(/\\n/g, '\n') || draft.body !== q.data?.body.replace(/\\n/g, '\n');

  const insert = (field: string) => {
    if (!editable) return;
    const token = `{${field}}`;
    const t = smsOnly ? 'body' : target;
    const text = draft[t];
    const { start, end } = sel[t];
    const s0 = Math.min(start, text.length), e0 = Math.min(end, text.length);
    const next = text.slice(0, s0) + token + text.slice(e0);
    setDraft({ ...draft, [t]: next });
    setSel({ ...sel, [t]: { start: s0 + token.length, end: s0 + token.length } });
  };

  const save = async () => {
    setError(null);
    if (!draft.body.trim()) return setError('The message cannot be empty.');
    const { error: e } = await supabase.from('automations').update({ subject: draft.subject.trim() || null, body: draft.body, updated_at: new Date().toISOString() })
      .eq('org_id', orgId).eq('key', key);
    if (e) return setError(friendlyError(e.message));
    await q.reload();
    notify('Message saved');
  };

  const sendTest = async () => {
    setError(null);
    const me = session?.user.email;
    if (!me) return setError('Your account has no email address.');
    try {
      const row = await must(supabase.from('messages').insert({
        org_id: orgId, channel: 'email', direction: 'out', to_address: me, status: 'queued', automation_key: key,
        subject: `[Test] ${renderTemplate(draft.subject || title, values)}`, body: renderTemplate(draft.body, values),
      }).select('id').single());
      await callFunction('send-message', { message_id: (row as { id: string }).id });
      notify('Test sent', `Check ${me} in a minute.`);
    } catch (e: any) {
      setError(friendlyError(e.message ?? String(e)));
    }
  };

  return (
    <Screen footer={editable ? <Button title="Save message" icon="checkmark" onPress={save} disabled={!dirty} /> : undefined}>
      <Stack.Screen options={{ title }} />
      <ErrorBanner message={error} />
      {meta ? <T variant="muted" style={{ marginBottom: space.lg }}>{meta.description}</T> : null}
      {key === 'on_our_way' ? <T variant="small" style={{ marginBottom: space.md }}>Sent only when a technician taps &quot;On our way&quot; on a job.</T> : null}

      {!smsOnly ? (
        <Field label="Email subject" value={draft.subject} editable={editable} onChangeText={(v) => setDraft({ ...draft, subject: v })}
          onFocus={() => setTarget('subject')}
          onSelectionChange={(e) => setSel({ ...sel, subject: e.nativeEvent.selection })} />
      ) : null}
      <Field label="Message" value={draft.body} multiline editable={editable} onChangeText={(v) => setDraft({ ...draft, body: v })}
        onFocus={() => setTarget('body')}
        onSelectionChange={(e) => setSel({ ...sel, body: e.nativeEvent.selection })}
        hint={smsOnly || q.data?.channel === 'both' ? `${draft.body.length} characters. Texts over 160 characters count as more than one.` : undefined} />

      {editable ? (
        <>
          <T style={{ fontWeight: '600', marginBottom: 8 }}>Insert a field {smsOnly ? '' : `into the ${target === 'subject' ? 'subject' : 'message'}`}</T>
          <Row gap={space.sm} style={{ flexWrap: 'wrap', marginBottom: space.lg }}>
            {TEMPLATE_FIELDS.map((f) => (
              <Pressable key={f.key} onPress={() => insert(f.key)}
                style={({ pressed }) => ({ paddingVertical: 7, paddingHorizontal: 12, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: pressed ? colors.cardRaised : 'transparent' })}>
                <T variant="muted">{f.label}</T>
              </Pressable>
            ))}
          </Row>
        </>
      ) : null}

      <Section title="Preview" icon="eye-outline">
        <Card style={{ backgroundColor: colors.cardRaised }}>
          {!smsOnly ? <T style={{ fontWeight: '700', marginBottom: space.sm }}>{renderTemplate(draft.subject, values) || '(no subject)'}</T> : null}
          <T>{renderTemplate(draft.body, values)}</T>
        </Card>
        <T variant="small">Preview uses sample values. Real messages use the customer&apos;s details.</T>
        <View style={{ marginTop: space.md }}>
          <Button kind="secondary" icon="paper-plane-outline" title="Send test to me" onPress={sendTest} />
        </View>
      </Section>
    </Screen>
  );
}

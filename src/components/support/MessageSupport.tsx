// "Message us": sends to Tarmo support with the company, plan, screen and device filled in.
import Constants from 'expo-constants';
import { usePathname } from 'expo-router';
import { useState } from 'react';
import { Platform } from 'react-native';
import { notify } from '../FormSheet';
import { Button, Card, ErrorBanner, Field, Segmented, T } from '../ui';
import { useOrg } from '../../lib/session';
import { friendlyError, must, supabase } from '../../lib/supabase';
import { space } from '../../lib/theme';

const TOPICS = [
  { value: 'Question', label: 'Question' },
  { value: 'Problem', label: 'Something’s wrong' },
  { value: 'Billing', label: 'Billing' },
  { value: 'Idea', label: 'Idea' },
] as const;
type Topic = (typeof TOPICS)[number]['value'];

export function MessageSupport({ from }: { from?: string }) {
  const { orgId } = useOrg();
  const pathname = usePathname();
  const [topic, setTopic] = useState<Topic>('Question');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const send = async () => {
    setBusy(true);
    setError(null);
    try {
      await must(supabase.rpc('send_support_message', {
        p_org: orgId ?? null, p_topic: topic, p_message: message, p_route: from ?? pathname,
        p_platform: Platform.OS, p_version: Constants.expoConfig?.version ?? null,
      }));
      setMessage('');
      setSent(true);
      notify('Message sent', 'We’ll reply by email, usually within one business day.');
    } catch (e: any) { setError(friendlyError(e.message)); } finally { setBusy(false); }
  };
  return (
    <Card>
      <T variant="muted" style={{ marginBottom: space.md }}>
        Send us a message from here. We&apos;ll see your company and the screen you were on, and reply by email.
      </T>
      <Segmented value={topic} onChange={setTopic} options={TOPICS.map((t) => ({ value: t.value, label: t.label }))} />
      <Field label="Message" multiline value={message} onChangeText={(v) => { setMessage(v); setSent(false); }} maxLength={5000}
        placeholder={topic === 'Problem' ? 'What happened, and what did you expect?' : 'How can we help?'} />
      <ErrorBanner message={error} />
      <Button icon="send-outline" title={sent ? 'Sent' : 'Send message'} onPress={send} loading={busy} disabled={message.trim().length < 3} />
    </Card>
  );
}

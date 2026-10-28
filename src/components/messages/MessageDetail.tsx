import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { dateTime } from '../../lib/format';
import { callFunction, friendlyError, must, supabase } from '../../lib/supabase';
import { colors, space } from '../../lib/theme';
import type { Message } from '../../lib/types';
import { notify } from '../FormSheet';
import { Badge, Button, Card, ErrorBanner, Field, KeyValue, ListRow, Row, T, SheetModal } from '../ui';
import { AUTOMATION_LABEL, canResend, MESSAGE_STATUS } from './status';

export type MessageWithCustomer = Message & { customer: { id: string; name: string } | null };

/** Full message: body, delivery details, related records, and "Fix & resend" for failed or bounced messages. */
export function MessageDetail({ m, onClose, onChanged }: { m: MessageWithCustomer | null; onClose: () => void; onChanged: () => void }) {
  const [to, setTo] = useState('');
  const [updateCustomer, setUpdateCustomer] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [shownId, setShownId] = useState<string | null>(null);
  if ((m?.id ?? null) !== shownId) {
    setShownId(m?.id ?? null);
    setTo(m?.to_address ?? '');
    setError(null);
    setUpdateCustomer(true);
  }
  if (!m) return null;
  const st = MESSAGE_STATUS[m.status];
  const isEmail = m.channel === 'email';

  const go = (path: Parameters<typeof router.push>[0]) => { onClose(); router.push(path); };

  const resend = async () => {
    setError(null);
    const addr = to.trim();
    if (!addr) return setError(isEmail ? 'Enter an email address.' : 'Enter a mobile number.');
    if (isEmail && !/^\S+@\S+\.\S+$/.test(addr)) return setError('That email address does not look right.');
    try {
      if (m.customer_id && updateCustomer) {
        await must(supabase.from('customers').update(isEmail ? { email: addr } : { phone: addr }).eq('id', m.customer_id));
      }
      await must(supabase.from('messages').update({ to_address: addr, status: 'queued', error: null, send_after: new Date().toISOString() }).eq('id', m.id));
      await callFunction('send-message', { message_id: m.id });
      onChanged();
      onClose();
      notify('Message resent');
    } catch (e: any) {
      setError(friendlyError(e.message ?? String(e)));
      onChanged();
    }
  };

  return (
    <SheetModal visible onClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <Row style={{ padding: space.lg, justifyContent: 'space-between' }}>
          <T variant="h3">{isEmail ? 'Email' : 'Text message'}</T>
          <Button small kind="secondary" title="Done" onPress={onClose} />
        </Row>
        <ScrollView contentContainerStyle={{ padding: space.lg, paddingBottom: 64 }} keyboardShouldPersistTaps="handled">
          <ErrorBanner message={error} />
          <Row gap={space.sm} style={{ marginBottom: space.md, flexWrap: 'wrap' }}>
            <Badge label={st.label} tone={st.tone} raw />
            <Badge label={m.direction === 'in' ? 'Incoming' : 'Outgoing'} tone="neutral" raw />
            {m.automation_key ? <Badge label={AUTOMATION_LABEL[m.automation_key] ?? m.automation_key} tone="info" raw /> : null}
          </Row>
          <Card>
            <KeyValue label="Customer" value={m.customer?.name} />
            <KeyValue label={m.direction === 'in' ? 'From' : 'To'} value={m.direction === 'in' ? m.from_address : m.to_address} />
            <KeyValue label="Created" value={dateTime(m.created_at)} />
            {m.status === 'queued' && new Date(m.send_after) > new Date() ? <KeyValue label="Sends at" value={dateTime(m.send_after)} /> : null}
            <KeyValue label="Sent" value={m.sent_at ? dateTime(m.sent_at) : null} />
            <KeyValue label="Delivered" value={m.delivered_at ? dateTime(m.delivered_at) : null} />
            <KeyValue label="Opened" value={m.opened_at ? dateTime(m.opened_at) : null} />
          </Card>
          {m.error ? (
            <Card style={{ backgroundColor: colors.dangerSoft, borderColor: colors.danger }}>
              <T style={{ color: colors.danger, fontWeight: '600' }}>What went wrong</T>
              <T style={{ color: colors.danger, marginTop: 4 }}>{m.error}</T>
            </Card>
          ) : null}
          <Card>
            {m.subject ? <T style={{ fontWeight: '700', marginBottom: space.sm }}>{m.subject}</T> : null}
            <T>{m.body.replace(/\\n/g, '\n')}</T>
          </Card>

          {m.invoice_id || m.quote_id || m.job_id || m.customer_id ? (
            <Card style={{ padding: 0, overflow: 'hidden' }}>
              {m.invoice_id ? <ListRow icon="receipt-outline" title="Open invoice" onPress={() => go({ pathname: '/invoices/[id]', params: { id: m.invoice_id! } })} /> : null}
              {m.quote_id ? <ListRow icon="document-text-outline" title="Open quote" onPress={() => go({ pathname: '/quotes/[id]', params: { id: m.quote_id! } })} /> : null}
              {m.job_id ? <ListRow icon="briefcase-outline" title="Open job" onPress={() => go({ pathname: '/jobs/[id]', params: { id: m.job_id! } })} /> : null}
              {m.customer_id ? <ListRow icon="chatbubbles-outline" title="Conversation with customer" onPress={() => go({ pathname: '/messages/[customerId]', params: { customerId: m.customer_id! } })} /> : null}
            </Card>
          ) : null}

          {canResend(m) ? (
            <View style={{ marginTop: space.md }}>
              <T variant="h3" style={{ marginBottom: space.sm }}>{isEmail ? 'Fix email & resend' : 'Fix number & resend'}</T>
              <Field label={isEmail ? 'Email address' : 'Mobile number'} value={to} onChangeText={setTo} autoCapitalize="none"
                keyboardType={isEmail ? 'email-address' : 'phone-pad'} />
              {m.customer_id ? (
                <Button small kind="ghost" icon={updateCustomer ? 'checkbox-outline' : 'square-outline'}
                  title={`Also save it on ${m.customer?.name ?? 'the customer'}`} onPress={() => setUpdateCustomer((v) => !v)} style={{ alignSelf: 'flex-start', marginBottom: space.md }} />
              ) : null}
              <Button icon="refresh-outline" title="Resend" onPress={resend} />
            </View>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </SheetModal>
  );
}

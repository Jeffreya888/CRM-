import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Platform, Pressable, RefreshControl, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Gate } from '../../../components/Gate';
import { MessageDetail, type MessageWithCustomer } from '../../../components/messages/MessageDetail';
import { MESSAGE_STATUS } from '../../../components/messages/status';
import { Badge, Button, EmptyState, ErrorBanner, IconButton, Ionicons, Loading, Row, Screen, Segmented, T } from '../../../components/ui';
import { dateTime } from '../../../lib/format';
import { canSeeMoney } from '../../../lib/plans';
import { useOrg } from '../../../lib/session';
import { callFunction, friendlyError, must, supabase } from '../../../lib/supabase';
import { colors, radius, space } from '../../../lib/theme';
import type { Customer } from '../../../lib/types';
import { useQuery } from '../../../lib/useQuery';

type Cust = Pick<Customer, 'id' | 'name' | 'email' | 'phone' | 'sms_consent' | 'sms_opted_out' | 'email_opted_out'>;

export default function Conversation() {
  return (
    <Gate feature="reminders">
      <Inner />
    </Gate>
  );
}

function Inner() {
  const { customerId } = useLocalSearchParams<{ customerId: string }>();
  const { org, orgId, role } = useOrg();
  const [picked, setChannel] = useState<'sms' | 'email' | null>(null);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [open, setOpen] = useState<MessageWithCustomer | null>(null);

  const q = useQuery(async () => {
    const [c, msgs] = await Promise.all([
      must(supabase.from('customers').select('id, name, email, phone, sms_consent, sms_opted_out, email_opted_out').eq('id', customerId).maybeSingle()),
      must(supabase.from('messages').select('*, customer:customers(id, name)').eq('customer_id', customerId).order('created_at', { ascending: false }).limit(200)),
    ]);
    return { customer: c as Cust | null, messages: (msgs ?? []) as unknown as MessageWithCustomer[] };
  }, [customerId]);

  // Poll for replies while the conversation is open.
  const reload = q.reload;
  useEffect(() => {
    const t = setInterval(() => { reload(); }, 15000);
    return () => clearInterval(t);
  }, [reload]);

  if (!canSeeMoney(role)) return <Screen><Stack.Screen options={{ title: 'Conversation' }} /><EmptyState icon="lock-closed-outline" title="Managers only" /></Screen>;
  if (q.loading && !q.data) return <><Stack.Screen options={{ title: 'Conversation' }} /><Loading /></>;
  const c = q.data?.customer;
  if (!c) return <Screen><Stack.Screen options={{ title: 'Conversation' }} /><ErrorBanner message={q.error ?? 'Customer not found'} onRetry={q.reload} /></Screen>;

  const textingOn = org.sms_status === 'active' && org.sms_enabled;
  const smsBlock = !textingOn ? 'Customer texting is not turned on for your company.'
    : c.sms_opted_out ? `${c.name} replied STOP and has opted out of texts.`
    : !c.sms_consent ? `${c.name} has not agreed to receive texts. Record consent on their customer page first.`
    : !c.phone ? 'Add a mobile number for this customer first.' : null;
  const emailBlock = !c.email ? 'Add an email address for this customer first.' : c.email_opted_out ? `${c.name} unsubscribed from emails.` : null;
  const channel: 'sms' | 'email' = picked ?? (smsBlock && !emailBlock ? 'email' : 'sms');
  const block = channel === 'sms' ? smsBlock : emailBlock;

  const send = async () => {
    setError(null);
    const text = body.trim();
    if (!text || block) return;
    setSending(true);
    try {
      const row = await must(supabase.from('messages').insert({
        org_id: orgId, customer_id: c.id, channel, direction: 'out', status: 'queued',
        to_address: channel === 'sms' ? c.phone : c.email, subject: channel === 'email' ? subject.trim() || `Message from ${org.name}` : null, body: text,
      }).select('id').single());
      setBody('');
      setSubject('');
      await callFunction('send-message', { message_id: (row as { id: string }).id }).catch((e) => setError(friendlyError(e.message ?? String(e))));
      await q.reload();
    } catch (e: any) {
      setError(friendlyError(e.message ?? String(e)));
    } finally {
      setSending(false);
    }
  };

  return (
    <SafeAreaView edges={['bottom']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <Stack.Screen options={{
        title: c.name,
        headerRight: () => <IconButton icon="person-circle-outline" label="Customer" onPress={() => router.push({ pathname: '/customers/[id]', params: { id: c.id } })} />,
      }} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0} style={{ flex: 1 }}>
        <Row gap={space.sm} style={{ paddingHorizontal: space.lg, flexWrap: 'wrap', marginBottom: space.sm }}>
          {c.sms_opted_out ? <Badge label="Opted out (STOP)" tone="danger" raw /> : c.sms_consent ? <Badge label="OK to text" tone="success" raw /> : <Badge label="No texting consent" tone="neutral" raw />}
          {c.phone ? <Badge label={c.phone} tone="neutral" raw /> : null}
          {c.email ? <Badge label={c.email} tone="neutral" raw /> : null}
        </Row>
        <FlatList
          inverted
          data={q.data?.messages ?? []}
          keyExtractor={(m) => m.id}
          contentContainerStyle={{ padding: space.lg, gap: space.sm }}
          refreshControl={<RefreshControl refreshing={q.refreshing} onRefresh={q.refresh} tintColor={colors.textMuted} />}
          ListEmptyComponent={<View style={{ transform: [{ scaleY: -1 }] }}><EmptyState icon="chatbubbles-outline" title="No messages yet" body="Texts and emails with this customer show up here, including their replies." /></View>}
          renderItem={({ item: m }) => <Bubble m={m} onPress={() => setOpen(m)} />}
        />
        <View style={{ borderTopWidth: 1, borderTopColor: colors.border, padding: space.md, backgroundColor: colors.bgDeep }}>
          <ErrorBanner message={error} />
          <Segmented value={channel} onChange={setChannel} options={[{ value: 'sms', label: 'Text' }, { value: 'email', label: 'Email' }]} />
          {block ? (
            <Row gap={space.sm} style={{ marginBottom: space.sm }}>
              <Ionicons name="information-circle-outline" size={18} color={colors.warning} />
              <T variant="small" style={{ flex: 1, color: colors.warning }}>{block}</T>
              {channel === 'sms' && !textingOn ? <Button small kind="ghost" title="Set up" onPress={() => router.push('/texting')} /> : null}
            </Row>
          ) : null}
          {channel === 'email' ? (
            <TextInput value={subject} onChangeText={setSubject} placeholder="Subject" placeholderTextColor={colors.textFaint} editable={!block}
              style={{ backgroundColor: colors.input, color: colors.text, borderRadius: radius.md, paddingHorizontal: space.md, paddingVertical: 10, fontSize: 16, marginBottom: space.sm }} />
          ) : null}
          <Row gap={space.sm} style={{ alignItems: 'flex-end' }}>
            <TextInput value={body} onChangeText={setBody} multiline editable={!block}
              placeholder={channel === 'sms' ? 'Text message' : 'Email message'} placeholderTextColor={colors.textFaint}
              style={{ flex: 1, maxHeight: 140, minHeight: 44, backgroundColor: colors.input, color: colors.text, borderRadius: radius.md, paddingHorizontal: space.md, paddingVertical: 10, fontSize: 16 }} />
            <Button icon="send" title="" onPress={send} loading={sending} disabled={!!block || !body.trim()} style={{ minHeight: 44, width: 52, paddingHorizontal: 0 }} />
          </Row>
          {channel === 'sms' && body.length > 160 ? <T variant="small" style={{ marginTop: 4 }}>{body.length} characters · counts as {Math.ceil(body.length / 153)} texts</T> : null}
        </View>
      </KeyboardAvoidingView>
      <MessageDetail m={open} onClose={() => setOpen(null)} onChanged={q.reload} />
    </SafeAreaView>
  );
}

function Bubble({ m, onPress }: { m: MessageWithCustomer; onPress: () => void }) {
  const mine = m.direction === 'out';
  const st = MESSAGE_STATUS[m.status];
  return (
    <Pressable onPress={onPress} style={{ alignSelf: mine ? 'flex-end' : 'flex-start', maxWidth: '85%' }}>
      <View style={{
        backgroundColor: mine ? colors.primarySoft : colors.cardRaised, borderRadius: radius.lg, padding: space.md,
        borderBottomRightRadius: mine ? 4 : radius.lg, borderBottomLeftRadius: mine ? radius.lg : 4,
      }}>
        {m.channel === 'email' ? (
          <Row gap={4} style={{ marginBottom: 4 }}>
            <Ionicons name="mail-outline" size={14} color={colors.textMuted} />
            <T variant="small" numberOfLines={1} style={{ flexShrink: 1, fontWeight: '600' }}>{m.subject || 'Email'}</T>
          </Row>
        ) : null}
        <T numberOfLines={m.channel === 'email' ? 6 : undefined}>{m.body.replace(/\\n/g, '\n')}</T>
      </View>
      <Row gap={6} style={{ marginTop: 2, alignSelf: mine ? 'flex-end' : 'flex-start' }}>
        <T variant="small">{dateTime(m.created_at)}</T>
        {mine ? <T variant="small" style={{ color: st.tone === 'danger' ? colors.danger : colors.textMuted }}>{st.label}</T> : null}
      </Row>
    </Pressable>
  );
}

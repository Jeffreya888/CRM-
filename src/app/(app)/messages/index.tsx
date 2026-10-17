import { Stack } from 'expo-router';
import { useState } from 'react';
import { FlatList, RefreshControl, View } from 'react-native';
import { Gate } from '../../../components/Gate';
import { MessageDetail, type MessageWithCustomer } from '../../../components/messages/MessageDetail';
import { AUTOMATION_LABEL, MESSAGE_STATUS } from '../../../components/messages/status';
import { Badge, EmptyState, ErrorBanner, ListRow, Loading, Screen, SearchBar, Segmented } from '../../../components/ui';
import { relative } from '../../../lib/format';
import { canSeeMoney } from '../../../lib/plans';
import { useOrg } from '../../../lib/session';
import { must, supabase } from '../../../lib/supabase';
import { colors, space } from '../../../lib/theme';
import { useQuery } from '../../../lib/useQuery';

type StatusFilter = 'all' | 'delivered' | 'opened' | 'bounced' | 'failed' | 'blocked' | 'queued' | 'received';
type ChannelFilter = 'all' | 'email' | 'sms';

export default function MessageLog() {
  return (
    <Gate feature="reminders">
      <Inner />
    </Gate>
  );
}

function Inner() {
  const { orgId, role } = useOrg();
  const [status, setStatus] = useState<StatusFilter>('all');
  const [channel, setChannel] = useState<ChannelFilter>('all');
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState<MessageWithCustomer | null>(null);
  const term = search.trim();

  const q = useQuery(async () => {
    let mq = supabase.from('messages').select('*, customer:customers(id, name)').eq('org_id', orgId).order('created_at', { ascending: false }).limit(300);
    if (status !== 'all') mq = mq.eq('status', status);
    if (channel !== 'all') mq = mq.eq('channel', channel);
    if (term) {
      const safe = term.replace(/[%,()]/g, ' ');
      const ids = ((await must(supabase.from('customers').select('id').eq('org_id', orgId).ilike('name', `%${safe}%`).limit(100))) ?? []).map((c: { id: string }) => c.id);
      mq = ids.length ? mq.or(`to_address.ilike.%${safe}%,customer_id.in.(${ids.join(',')})`) : mq.ilike('to_address', `%${safe}%`);
    }
    return ((await must(mq)) ?? []) as unknown as MessageWithCustomer[];
  }, [orgId, status, channel, term]);

  if (!canSeeMoney(role)) return <Screen><Stack.Screen options={{ title: 'Message log' }} /><EmptyState icon="lock-closed-outline" title="Managers only" /></Screen>;

  const header = (
    <View style={{ paddingTop: space.lg }}>
      <ErrorBanner message={q.error} onRetry={q.reload} />
      <SearchBar value={search} onChange={setSearch} placeholder="Search customer, email or number" />
      <Segmented value={channel} onChange={setChannel} options={[{ value: 'all', label: 'All' }, { value: 'email', label: 'Email' }, { value: 'sms', label: 'Text' }]} />
      <Segmented value={status} onChange={setStatus} options={[
        { value: 'all', label: 'Any status' }, { value: 'delivered', label: 'Delivered' }, { value: 'opened', label: 'Opened' },
        { value: 'bounced', label: 'Bounced' }, { value: 'failed', label: 'Failed' }, { value: 'blocked', label: 'Blocked (demo)' },
        { value: 'queued', label: 'Queued' }, { value: 'received', label: 'Received' },
      ]} />
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Stack.Screen options={{ title: 'Message log' }} />
      {q.loading && !q.data ? <>{header}<Loading /></> : (
        <FlatList
          data={q.data ?? []}
          keyExtractor={(m) => m.id}
          ListHeaderComponent={header}
          contentContainerStyle={{ paddingHorizontal: space.lg, paddingBottom: 110 }}
          refreshControl={<RefreshControl refreshing={q.refreshing} onRefresh={q.refresh} tintColor={colors.textMuted} />}
          ListEmptyComponent={<EmptyState icon="mail-outline" title="No messages" body={term || status !== 'all' || channel !== 'all' ? 'Nothing matches these filters.' : 'Emails and texts sent to customers appear here with their delivery status.'} />}
          renderItem={({ item: m }) => {
            const st = MESSAGE_STATUS[m.status];
            const who = m.customer?.name ?? (m.direction === 'in' ? m.from_address : m.to_address) ?? 'Unknown';
            const what = m.subject || m.body.replace(/\\n/g, ' ').replace(/\s+/g, ' ');
            return (
              <ListRow
                icon={m.channel === 'email' ? 'mail-outline' : m.direction === 'in' ? 'chatbubble-ellipses-outline' : 'chatbubble-outline'}
                tone={st.tone === 'danger' ? 'danger' : m.direction === 'in' ? 'purple' : 'primary'}
                title={who}
                subtitle={what}
                meta={[m.automation_key ? AUTOMATION_LABEL[m.automation_key] ?? m.automation_key : m.direction === 'in' ? 'Reply' : 'Manual', relative(m.created_at)].join(' · ')}
                right={<Badge label={st.label} tone={st.tone} raw />}
                onPress={() => setOpen(m)}
              />
            );
          }}
        />
      )}
      <MessageDetail m={open} onClose={() => setOpen(null)} onChanged={q.reload} />
    </View>
  );
}

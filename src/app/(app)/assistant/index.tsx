import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { AiAllowance, useAiAllowance } from '../../../components/ai/AiAllowance';
import { Badge, Button, Card, EmptyState, ErrorBanner, Ionicons, ListRow, Row, Screen, Segmented, T } from '../../../components/ui';
import { ASSISTANT_SUGGESTIONS, loadThreads, REVIEW_NOTICE, type ThreadRow } from '../../../lib/assistant';
import { APP_NAME } from '../../../lib/config';
import { date, relative } from '../../../lib/format';
import { canEdit, isManager } from '../../../lib/plans';
import { useOrg } from '../../../lib/session';
import { colors, space } from '../../../lib/theme';
import { useQuery } from '../../../lib/useQuery';

/** "Ask <APP_NAME>": my conversations, and for managers+ every conversation in the company. */
export default function AssistantHome() {
  const { orgId, role, session } = useOrg();
  const uid = session?.user.id ?? '';
  const manager = isManager(role);
  const [scope, setScope] = useState<'mine' | 'team'>('mine');
  const allowance = useAiAllowance();
  const q = useQuery(() => loadThreads(orgId, uid, manager ? scope : 'mine'), [orgId, uid, scope, manager]);

  const title = `Ask ${APP_NAME}`;
  if (!canEdit(role)) {
    return (
      <Screen>
        <Stack.Screen options={{ title }} />
        <EmptyState icon="lock-closed-outline" title="Not available" body="The assistant is for team members who work on jobs." />
      </Screen>
    );
  }

  const ask = (text?: string) => router.push({ pathname: '/assistant/[id]', params: text ? { id: 'new', q: text } : { id: 'new' } });
  const rows = q.data ?? [];

  const subtitle = (t: ThreadRow) => {
    const about = t.job_id ? 'Job question' : t.guide_key ? 'SOP question' : t.aircraft_id ? 'Asset question' : null;
    return scope === 'team'
      ? [t.askerName, date(t.created_at), about].filter(Boolean).join(' · ')
      : [relative(t.updated_at), about].filter(Boolean).join(' · ');
  };

  return (
    <Screen refreshing={q.refreshing} onRefresh={() => { q.refresh(); allowance.refresh(); }}>
      <Stack.Screen options={{ title }} />
      <Card style={{ backgroundColor: colors.primarySoft, borderColor: 'transparent' }}>
        <Row gap={space.md} style={{ alignItems: 'flex-start' }}>
          <Ionicons name="sparkles" size={24} color={colors.primaryText} style={{ marginTop: 2 }} />
          <View style={{ flex: 1 }}>
            <T style={{ fontWeight: '700', fontSize: 17 }}>Ask anything about the work</T>
            <T variant="muted" style={{ marginTop: 2, color: colors.text }}>
              Products, steps, what&apos;s safe on which surface, what to do when something looks wrong. Answers cite your SOPs and the aircraft&apos;s documents.
            </T>
          </View>
        </Row>
        <Button icon="add" title="New question" onPress={() => ask()} style={{ marginTop: space.md }} />
      </Card>
      <AiAllowance allowance={allowance.data} kind="question" />
      {!manager ? (
        <Row gap={6} style={{ marginBottom: space.md }}>
          <Ionicons name="eye-outline" size={14} color={colors.textFaint} />
          <T variant="small" style={{ flex: 1, color: colors.textFaint }}>{REVIEW_NOTICE}</T>
        </Row>
      ) : null}

      {manager ? (
        <Segmented value={scope} onChange={setScope} options={[{ value: 'mine', label: 'Mine' }, { value: 'team', label: 'Team' }]} />
      ) : null}
      <ErrorBanner message={q.error} onRetry={q.reload} />

      {!q.loading && rows.length === 0 ? (
        <Card>
          <EmptyState icon="chatbubbles-outline" title={scope === 'team' ? 'No questions yet' : 'Ask your first question'}
            body={scope === 'team' ? 'Questions your team asks show up here.' : 'Try one of these:'} />
          {scope === 'mine' ? (
            <View style={{ gap: space.sm }}>
              {ASSISTANT_SUGGESTIONS.slice(0, 3).map((s) => (
                <Button key={s} kind="secondary" small title={s} onPress={() => ask(s)} />
              ))}
            </View>
          ) : null}
        </Card>
      ) : null}

      {rows.length ? (
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          {rows.map((t) => (
            <ListRow key={t.id} icon={t.job_id ? 'construct-outline' : t.guide_key ? 'book-outline' : 'chatbubble-ellipses-outline'}
              tone={t.job_id ? 'warning' : t.guide_key ? 'success' : 'primary'}
              title={t.title} subtitle={subtitle(t)}
              right={scope === 'team' && t.user_id === uid ? <Badge label="You" tone="info" raw /> : undefined}
              onPress={() => router.push(`/assistant/${t.id}`)} />
          ))}
        </Card>
      ) : null}
    </Screen>
  );
}

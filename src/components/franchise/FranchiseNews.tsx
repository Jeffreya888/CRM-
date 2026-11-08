// Dashboard: the latest announcements from franchise HQ (shown only in a franchise network).
import { View } from 'react-native';
import { Card, IconTile, Row, Section, T } from '../ui';
import { date } from '../../lib/format';
import { loadAnnouncements } from '../../lib/franchise';
import { space } from '../../lib/theme';
import { useQuery } from '../../lib/useQuery';

export function FranchiseNews({ orgId }: { orgId: string }) {
  const q = useQuery(() => loadAnnouncements(3).catch(() => []), [orgId]);
  const items = q.data ?? [];
  if (!items.length) return null;
  return (
    <Section title="From HQ" icon="megaphone-outline">
      <Card style={{ gap: space.md }}>
        {items.map((a) => (
          <Row key={a.id} gap={space.md} style={{ alignItems: 'flex-start' }}>
            <IconTile icon="megaphone-outline" tone="primary" size={32} />
            <View style={{ flex: 1 }}>
              <T style={{ fontWeight: '700' }}>{a.title}</T>
              <T variant="small">{date(a.created_at)}</T>
              {a.body ? <T style={{ marginTop: 2 }}>{a.body}</T> : null}
            </View>
          </Row>
        ))}
      </Card>
    </Section>
  );
}

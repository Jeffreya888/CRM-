import { View } from 'react-native';
import { assetIcon } from '../../lib/assets';
import { initials } from '../../lib/format';
import { colors, space } from '../../lib/theme';
import type { AssetType } from '../../lib/types';
import { Avatar, Badge, Card, Ionicons, Row, T } from '../ui';

export interface CustomerCardData {
  id: string; name: string; company: string | null; status: 'lead' | 'active' | 'inactive';
  email: string | null; phone: string | null; sms_opted_out?: boolean;
  assets: { asset_type: AssetType; active: boolean }[];
}

/** Customer list card: name, company, asset counts per type, phone and email. */
export function CustomerCard({ c, onPress }: { c: CustomerCardData; onPress: () => void }) {
  const counts = (['aircraft', 'vehicle', 'watercraft'] as AssetType[])
    .map((t) => ({ t, n: c.assets.filter((a) => a.active && a.asset_type === t).length }))
    .filter((x) => x.n > 0);
  const total = counts.reduce((s, x) => s + x.n, 0);
  return (
    <Card onPress={onPress} style={{ marginHorizontal: space.lg }}>
      <Row gap={space.md} style={{ alignItems: 'flex-start' }}>
        <Avatar label={initials(c.name)} size={44} />
        <View style={{ flex: 1 }}>
          <Row style={{ justifyContent: 'space-between' }} gap={space.sm}>
            <T style={{ fontWeight: '700', flex: 1 }} numberOfLines={1}>{c.name}</T>
            {c.status !== 'active' ? <Badge label={c.status === 'lead' ? 'Lead' : 'Inactive'} tone={c.status === 'lead' ? 'info' : 'neutral'} /> : null}
          </Row>
          {c.company ? <T variant="muted" numberOfLines={1}>{c.company}</T> : null}
          <Row gap={space.md} style={{ marginTop: 6, flexWrap: 'wrap' }}>
            {counts.length ? counts.map((x) => (
              <Row key={x.t} gap={4}>
                <Ionicons name={assetIcon(x.t)} size={15} color={colors.warning} />
                <T variant="small" style={{ color: colors.text }}>{x.n}</T>
              </Row>
            )) : <T variant="small">No assets</T>}
            {total > 0 ? <T variant="small">{total} asset{total === 1 ? '' : 's'}</T> : null}
          </Row>
          {c.phone ? (
            <Row gap={6} style={{ marginTop: 6 }}>
              <Ionicons name="call-outline" size={14} color={colors.textMuted} />
              <T variant="small" numberOfLines={1}>{c.phone}</T>
            </Row>
          ) : null}
          {c.email ? (
            <Row gap={6} style={{ marginTop: 2 }}>
              <Ionicons name="mail-outline" size={14} color={colors.textMuted} />
              <T variant="small" numberOfLines={1}>{c.email}</T>
            </Row>
          ) : null}
        </View>
      </Row>
    </Card>
  );
}

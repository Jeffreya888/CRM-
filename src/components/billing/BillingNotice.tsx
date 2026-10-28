import type { ReactNode } from 'react';
import { Card, Ionicons, Row, T, type IconName } from '../ui';
import { colors, space } from '../../lib/theme';

/** A soft, neutral status card for subscription / billing messages. */
export function BillingNotice({ text, icon = 'information-circle-outline', tone = 'info', action }: {
  text: string; icon?: IconName; tone?: 'info' | 'success'; action?: ReactNode;
}) {
  const bg = tone === 'success' ? colors.successSoft : colors.infoSoft;
  const fg = tone === 'success' ? colors.success : colors.primaryText;
  return (
    <Card style={{ backgroundColor: bg, borderColor: 'transparent' }}>
      <Row gap={space.sm} style={{ alignItems: 'flex-start' }}>
        <Ionicons name={icon} size={20} color={fg} style={{ marginTop: 1 }} />
        <T style={{ flex: 1 }}>{text}</T>
      </Row>
      {action ? <Row style={{ marginTop: space.sm, flexWrap: 'wrap' }}>{action}</Row> : null}
    </Card>
  );
}

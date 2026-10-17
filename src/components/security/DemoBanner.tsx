import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DEMO_TITLE } from '../../lib/demo';
import { date } from '../../lib/format';
import { useSession } from '../../lib/session';
import { colors, space } from '../../lib/theme';
import { Button, Ionicons, Row, T } from '../ui';

/** Persistent banner shown above the app while exploring the demo workspace. */
export function DemoBanner() {
  const { org, signOut } = useSession();
  const insets = useSafeAreaInsets();
  const expires = org?.demo_expires_at ? date(org.demo_expires_at) : 'soon';
  return (
    <View style={{ paddingTop: insets.top + space.xs, paddingBottom: space.sm, paddingHorizontal: space.lg, backgroundColor: colors.warningSoft, borderBottomWidth: 1, borderBottomColor: colors.warning }}>
      <Row gap={space.md}>
        <Ionicons name="sparkles" size={18} color={colors.warning} />
        <View style={{ flex: 1 }}>
          <T style={{ fontWeight: '700', color: colors.warning }} numberOfLines={1}>{DEMO_TITLE}</T>
          <T variant="small" numberOfLines={2}>Private sample company · expires {expires}. No real sends or payments.</T>
        </View>
        <Button small kind="secondary" title="Exit demo" onPress={signOut} />
      </Row>
    </View>
  );
}

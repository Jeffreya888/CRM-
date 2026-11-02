// A one-time tip the first time someone opens each main screen. Dismissed per device.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { usePathname } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, IconTile, Row, T } from '../ui';
import { guideFor } from '../../lib/appGuide';
import { useIsDesktop } from '../../lib/layout';
import { colors, radius, space } from '../../lib/theme';

const keyFor = (path: string) => `first-tip-seen:${path}`;

export function FirstVisitTip() {
  const path = usePathname();
  const entry = guideFor(path);
  const desktop = useIsDesktop();
  const insets = useSafeAreaInsets();
  // Which path was checked, and whether its tip is still unseen. Until checked, nothing shows.
  const [state, setState] = useState<{ path: string; show: boolean } | null>(null);

  useEffect(() => {
    if (!entry) return;
    let alive = true;
    AsyncStorage.getItem(keyFor(entry.path))
      .then((v) => { if (alive) setState({ path: entry.path, show: v !== '1' }); })
      .catch(() => {});
    return () => { alive = false; };
  }, [entry]);

  if (!entry || state?.path !== entry.path || !state.show) return null;
  const dismiss = () => {
    setState({ path: entry.path, show: false });
    AsyncStorage.setItem(keyFor(entry.path), '1').catch(() => {});
  };
  // Phones: sit above the tab bar. Desktop: bottom-right corner.
  const tabs = ['/', '/jobs', '/customers', '/services', '/more'].includes(path);
  return (
    <View pointerEvents="box-none" style={{
      position: 'absolute', left: desktop ? undefined : space.lg, right: space.lg,
      bottom: (desktop ? space.xl : (tabs ? 72 : space.lg)) + insets.bottom, width: desktop ? 380 : undefined,
    }}>
      <View accessibilityRole="alert" style={{
        backgroundColor: colors.cardRaised, borderColor: colors.primary, borderWidth: 1, borderRadius: radius.lg, padding: space.lg,
        shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, elevation: 8,
      }}>
        <Row gap={space.md} style={{ alignItems: 'flex-start' }}>
          <IconTile icon={entry.icon} tone="primary" size={36} />
          <View style={{ flex: 1 }}>
            <T style={{ fontWeight: '700' }}>{entry.title}</T>
            <T variant="small" style={{ marginTop: 4, color: colors.text }}>{entry.tip}</T>
          </View>
        </Row>
        <Button small title="Got it" onPress={dismiss} style={{ alignSelf: 'flex-end', marginTop: space.md }} />
      </View>
    </View>
  );
}

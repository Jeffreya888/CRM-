import { router } from 'expo-router';
import type { NativeStackHeaderProps } from 'expo-router/build/react-navigation/native-stack/types';
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, space } from '../lib/theme';
import { BackButton, Row, T, useContentStyle } from './ui';

/** Header used by every pushed screen: round back button, large title, optional right item. */
export function AppHeader({ options, back, navigation, route }: NativeStackHeaderProps) {
  const title = typeof options.title === 'string' ? options.title : route.name;
  // On desktop the header lines up with the centered page content.
  const desk = useContentStyle();
  return (
    <SafeAreaView edges={['top']} style={{ backgroundColor: colors.bg }}>
      <Row style={[{ paddingHorizontal: space.lg, paddingTop: space.sm, paddingBottom: space.md, justifyContent: 'space-between' }, desk && { ...desk, paddingTop: space.xl, paddingBottom: 0 }]} gap={space.md}>
        <Row gap={space.md} style={{ flex: 1 }}>
          <BackButton onPress={() => (back || navigation.canGoBack() ? navigation.goBack() : router.replace('/'))} />
          <T variant="h2" numberOfLines={1} style={{ flexShrink: 1 }}>{title}</T>
        </Row>
        <View>{options.headerRight?.({ tintColor: colors.text, canGoBack: navigation.canGoBack() })}</View>
      </Row>
    </SafeAreaView>
  );
}

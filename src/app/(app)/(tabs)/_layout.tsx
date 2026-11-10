import { Tabs } from 'expo-router/js-tabs';
import { Ionicons } from '../../../components/ui';
import { useT } from '../../../lib/i18n';
import { useIsDesktop } from '../../../lib/layout';
import { colors } from '../../../lib/theme';

export default function TabsLayout() {
  // Desktop navigates with the sidebar instead of the bottom tab bar.
  const desktop = useIsDesktop();
  const t = useT();
  return (
    <Tabs
      tabBar={desktop ? () => null : undefined}
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textFaint,
        tabBarStyle: { backgroundColor: colors.bgDeep, borderTopColor: colors.border },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
        sceneStyle: { backgroundColor: colors.bg },
      }}
    >
      <Tabs.Screen name="index" options={{ title: t('Dashboard'), tabBarIcon: ({ color, size }) => <Ionicons name="grid-outline" color={color} size={size} /> }} />
      <Tabs.Screen name="jobs" options={{ title: t('Jobs'), tabBarIcon: ({ color, size }) => <Ionicons name="briefcase-outline" color={color} size={size} /> }} />
      <Tabs.Screen name="customers" options={{ title: t('Customers'), tabBarIcon: ({ color, size }) => <Ionicons name="people-outline" color={color} size={size} /> }} />
      <Tabs.Screen name="services" options={{ title: t('Services'), tabBarIcon: ({ color, size }) => <Ionicons name="sparkles-outline" color={color} size={size} /> }} />
      <Tabs.Screen name="more" options={{ title: t('More'), tabBarIcon: ({ color, size }) => <Ionicons name="menu-outline" color={color} size={size} /> }} />
    </Tabs>
  );
}

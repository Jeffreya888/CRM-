import { Stack } from 'expo-router';
import { AppHeader } from '../../components/AppHeader';
import { colors } from '../../lib/theme';

export default function AppLayout() {
  return (
    <Stack
      screenOptions={{
        header: (props) => <AppHeader {...props} />,
        contentStyle: { backgroundColor: colors.bg },
      }}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="paywall" options={{ presentation: 'modal', title: 'Plans' }} />
    </Stack>
  );
}

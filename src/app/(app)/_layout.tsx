import { Stack } from 'expo-router';
import { View } from 'react-native';
import { AppHeader } from '../../components/AppHeader';
import { Sidebar } from '../../components/nav/Sidebar';
import { useIsDesktop } from '../../lib/layout';
import { colors } from '../../lib/theme';

export default function AppLayout() {
  const desktop = useIsDesktop();
  // The tree stays the same at every width so resizing the window keeps the navigation state.
  return (
    <View style={{ flex: 1, flexDirection: 'row', backgroundColor: colors.bg }}>
      {desktop ? <Sidebar /> : null}
      <View style={{ flex: 1 }}>
        <Stack
          screenOptions={{
            header: (props) => <AppHeader {...props} />,
            contentStyle: { backgroundColor: colors.bg },
          }}
        >
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="paywall" options={{ presentation: 'modal', title: 'Plans' }} />
        </Stack>
      </View>
    </View>
  );
}

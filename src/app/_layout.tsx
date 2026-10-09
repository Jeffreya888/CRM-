import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { Loading } from '../components/ui';
import { registerForPush } from '../lib/notifications';
import { SessionProvider, useSession } from '../lib/session';
import { colors } from '../lib/theme';

function RootNavigator() {
  const { loading, session, org } = useSession();

  useEffect(() => {
    if (session?.user.id) registerForPush(session.user.id).catch(() => {});
  }, [session?.user.id]);

  if (loading) return <Loading />;
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
      <Stack.Protected guard={!session}>
        <Stack.Screen name="(auth)" />
      </Stack.Protected>
      <Stack.Protected guard={!!session && !org}>
        <Stack.Screen name="onboarding" />
      </Stack.Protected>
      <Stack.Protected guard={!!session && !!org}>
        <Stack.Screen name="(app)" />
      </Stack.Protected>
      {/* Customer-facing pages: open to everyone, no login. */}
      <Stack.Screen name="portal/[kind]/[token]" />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <SessionProvider>
      <StatusBar style="dark" />
      <RootNavigator />
    </SessionProvider>
  );
}

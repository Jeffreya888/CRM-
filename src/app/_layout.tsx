import * as Linking from 'expo-linking';
import { router, Stack, usePathname, useRootNavigationState, useSegments, type ErrorBoundaryProps } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';
import { SafeAreaInsetsContext, useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppLockGate } from '../components/security/AppLockGate';
import { DemoBanner } from '../components/security/DemoBanner';
import { NewPasswordGate } from '../components/security/NewPasswordGate';
import { TwoFactorGate, useAal } from '../components/security/TwoFactorGate';
import { Loading } from '../components/ui';
import { registerForPush } from '../lib/notifications';
import { currentSessionId, handleAuthLink, isAnonymous, pushDisabledHere, registerThisDevice, useRecovery } from '../lib/security';
import { SessionProvider, useSession } from '../lib/session';
import { supabase } from '../lib/supabase';
import { colors } from '../lib/theme';
import { installGlobalErrorHandlers, reportClientError, setErrorContext } from '../lib/errorReporter';
import { startOfflineQueue } from '../lib/offlineQueue';

installGlobalErrorHandlers();
void startOfflineQueue();

// Where a web visitor first landed, before any guard redirect.
const initialWebPath = Platform.OS === 'web' && typeof window !== 'undefined' ? window.location.pathname : null;
// A web visitor arriving from a "reset password" email picks a new password first.
if (Platform.OS === 'web' && typeof window !== 'undefined' && /type=recovery/.test(window.location.hash)) useRecovery.getState().set(true);
// Routes anyone can open, signed in or not.
const PUBLIC_SEGMENTS = ['(site)', 'portal', 'invite'];

function RootNavigator() {
  const { loading, session, org, isDemo } = useSession();
  const segments = useSegments() as string[];
  const pathname = usePathname();
  const navState = useRootNavigationState();
  const insets = useSafeAreaInsets();
  useEffect(() => { setErrorContext({ route: pathname, orgId: org?.id ?? null }); }, [pathname, org?.id]);
  const recovery = useRecovery((s) => s.active);
  const aal = useAal();
  const anon = isAnonymous(session);
  const userId = session?.user.id;
  const sessionId = currentSessionId(session);
  const isPublic = PUBLIC_SEGMENTS.includes(segments[0] ?? '');
  const webRedirected = useRef(false);

  // Push notifications (not for demo users, and not when turned off on this device).
  useEffect(() => {
    if (!userId || anon) return;
    pushDisabledHere().then((off) => { if (!off) registerForPush(userId).catch(() => {}); });
  }, [userId, anon]);

  // Remember this device and email a new-device alert (once per session).
  useEffect(() => {
    if (session && !anon) registerThisDevice(session);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, userId, anon]);

  // Email links opened in the app (confirm, reset password, change email).
  useEffect(() => {
    Linking.getInitialURL().then(handleAuthLink).catch(() => {});
    const sub = Linking.addEventListener('url', (e) => { handleAuthLink(e.url); });
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') useRecovery.getState().set(true);
    });
    return () => {
      sub.remove();
      data.subscription.unsubscribe();
    };
  }, []);

  // Someone who signs out (or exits the demo) goes to sign in, not the website.
  const hadSession = useRef(false);
  useEffect(() => { if (session) hadSession.current = true; }, [session]);

  // Signed-out web visitors at "/" see the public website.
  useEffect(() => {
    if (Platform.OS !== 'web' || loading || session || !navState?.key || webRedirected.current || hadSession.current) return;
    if (pathname === '/' || initialWebPath === '/') {
      webRedirected.current = true;
      router.replace('/welcome');
    }
  }, [loading, session, pathname, navState?.key]);

  if (loading) return <Loading />;

  const showBanner = !!session && !!org && isDemo && !isPublic;
  const need2fa = !!session && !!org && !anon && !isDemo && org.require_2fa && aal.ready && aal.level !== 'aal2' && !isPublic;

  const stack = (
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
      {/* Public: marketing website, invitations and customer-facing pages. */}
      <Stack.Screen name="(site)" />
      <Stack.Screen name="invite/[token]" />
      <Stack.Screen name="portal/[kind]/[token]" />
      <Stack.Screen name="portal/c/[slug]" />
    </Stack>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      {showBanner ? <DemoBanner /> : null}
      <View style={{ flex: 1 }}>
        {showBanner ? (
          // The banner already covers the status bar area.
          <SafeAreaInsetsContext.Provider value={{ ...insets, top: 0 }}>{stack}</SafeAreaInsetsContext.Provider>
        ) : stack}
      </View>
      {need2fa ? <TwoFactorGate /> : null}
      {recovery && session ? <NewPasswordGate /> : null}
      <AppLockGate />
    </View>
  );
}

export default function RootLayout() {
  return (
    <SessionProvider>
      <StatusBar style="light" />
      <RootNavigator />
    </SessionProvider>
  );
}

/** Shown instead of a blank or frozen screen when something crashes; the error is reported. */
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  useEffect(() => { reportClientError(error); }, [error]);
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <Text style={{ color: colors.text, fontSize: 20, fontWeight: '700', textAlign: 'center' }}>Something went wrong</Text>
      <Text style={{ color: colors.textMuted, fontSize: 15, textAlign: 'center', marginTop: 8, maxWidth: 360 }}>
        We&apos;ve been notified and will look into it. Try again, or go back to your dashboard.
      </Text>
      <Pressable onPress={retry} accessibilityRole="button"
        style={{ marginTop: 20, backgroundColor: colors.primary, paddingVertical: 12, paddingHorizontal: 24, borderRadius: 10 }}>
        <Text style={{ color: colors.white, fontWeight: '700' }}>Try again</Text>
      </Pressable>
      <Pressable onPress={() => router.replace('/')} accessibilityRole="button" style={{ marginTop: 12, padding: 8 }}>
        <Text style={{ color: colors.primaryText, fontWeight: '600' }}>Go to dashboard</Text>
      </Pressable>
    </View>
  );
}

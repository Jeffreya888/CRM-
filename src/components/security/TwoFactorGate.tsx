import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useSession } from '../../lib/session';
import { supabase } from '../../lib/supabase';
import { colors, space } from '../../lib/theme';
import { AuthShell } from '../AuthShell';
import { Button, T } from '../ui';
import { TotpEnroll, TotpVerify } from './TotpSetup';

/** Current assurance level of the session ('aal1' | 'aal2'), re-read when the token changes. */
export function useAal(): { level: string | null; next: string | null; ready: boolean } {
  const { session } = useSession();
  const token = session?.access_token;
  const [state, setState] = useState<{ token?: string; level: string | null; next: string | null }>({ level: null, next: null });
  useEffect(() => {
    if (!token) return;
    let alive = true;
    supabase.auth.mfa.getAuthenticatorAssuranceLevel().then(({ data }) => {
      if (alive) setState({ token, level: data?.currentLevel ?? null, next: data?.nextLevel ?? null });
    });
    return () => { alive = false; };
  }, [token]);
  return { level: state.level, next: state.next, ready: !!token && state.token === token };
}

/** Full-screen two-step sign-in required by the company (organizations.require_2fa). */
export function TwoFactorGate() {
  const { org, signOut, session } = useSession();
  const [factorId, setFactorId] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    let alive = true;
    supabase.auth.mfa.listFactors().then(({ data }) => {
      if (alive) setFactorId(data?.totp?.[0]?.id ?? null);
    });
    return () => { alive = false; };
  }, [session?.user.id]);

  // Verifying refreshes the session; the gate disappears once the token is aal2.
  const done = () => supabase.auth.refreshSession().catch(() => {});

  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.bg, zIndex: 900 }]}>
      <AuthShell
        title={factorId ? 'Enter your sign-in code' : 'Set up two-step sign-in'}
        subtitle={factorId
          ? 'Open your authenticator app and enter the 6-digit code for Tarmo.'
          : `${org?.name ?? 'Your company'} requires two-step sign-in for everyone. It takes about a minute.`}
      >
        {factorId === undefined ? <ActivityIndicator color={colors.primary} style={{ margin: space.lg }} />
          : factorId ? <TotpVerify factorId={factorId} onDone={done} />
          : <TotpEnroll onDone={done} />}
        <T variant="small" style={{ marginTop: space.lg, textAlign: 'center' }}>Lost your phone? Ask your company owner or admin, or contact support.</T>
        <Button kind="ghost" title="Sign out" onPress={signOut} style={{ marginTop: space.sm }} />
      </AuthShell>
    </View>
  );
}

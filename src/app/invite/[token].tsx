import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { AuthShell } from '../../components/AuthShell';
import { AppleSignInButton, signInWithApple, useAppleAvailable } from '../../components/security/AppleSignIn';
import { Button, Divider, ErrorBanner, Field, IconTile, Row, T } from '../../components/ui';
import { clearPendingInvite, isAnonymous, savePendingInvite } from '../../lib/security';
import { useSession } from '../../lib/session';
import { friendlyError, supabase } from '../../lib/supabase';
import { colors, space } from '../../lib/theme';

type Problem = { kind: 'unverified' | 'wrong_email' | 'expired' | 'invalid' | 'full' | 'other'; message: string };

function classify(raw: string): Problem {
  const message = friendlyError(raw);
  if (raw.includes('EMAIL_UNVERIFIED')) return { kind: 'unverified', message };
  if (raw.includes('This invitation is for')) return { kind: 'wrong_email', message };
  if (/expired|cancelled/i.test(raw)) return { kind: 'expired', message };
  if (/invalid or already used/i.test(raw)) return { kind: 'invalid', message: 'This invitation link or code is not valid, or it was already used.' };
  if (raw.includes('SEAT_LIMIT')) return { kind: 'full', message };
  return { kind: 'other', message };
}

/** Deep link from the invite email: flightready://invite/<token> or <site>/invite/<token>. */
export default function InvitePage() {
  const params = useLocalSearchParams<{ token: string }>();
  const token = decodeURIComponent(String(params.token ?? '')).trim();
  const { session, loading } = useSession();

  if (loading) return <View style={{ flex: 1, backgroundColor: colors.bg }} />;
  if (!token) {
    return (
      <AuthShell title="Invitation not found">
        <T>This link is missing its invitation code. Open the link from your email again, or type the code on the sign-in screen.</T>
        <Button style={{ marginTop: space.lg }} title="Go to Flight Ready" onPress={() => router.replace('/')} />
      </AuthShell>
    );
  }
  if (!session) return <SignedOut token={token} />;
  if (isAnonymous(session)) return <InDemo />;
  return <Accept key={`${session.user.id}:${token}`} token={token} />;
}

function SignedOut({ token }: { token: string }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const apple = useAppleAvailable();

  useEffect(() => { savePendingInvite(token); }, [token]);

  const signIn = async () => {
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) setError(error.message.includes('Invalid login') ? 'That email and password don’t match.' : error.message);
  };

  return (
    <AuthShell title="You’re invited to join a team" subtitle="Sign in or create an account with the email address the invitation was sent to. We’ll add you to the team right after.">
      <ErrorBanner message={error} />
      <Field label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" icon="mail-outline" />
      <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry autoComplete="password" icon="lock-closed-outline" onSubmitEditing={signIn} />
      <Button title="Sign in & accept" onPress={signIn} disabled={!email || !password} />
      {apple ? <View style={{ marginTop: space.md }}><AppleSignInButton onPress={() => signInWithApple().catch((e) => setError(e.message))} /></View> : null}
      <Divider />
      <T variant="muted" style={{ textAlign: 'center', marginBottom: space.sm }}>New to Flight Ready?</T>
      <Button kind="secondary" title="Create account" onPress={() => router.push({ pathname: '/sign-up', params: { invite: token, email: email.trim() } })} />
      <Button kind="ghost" title="Forgot password?" onPress={() => router.push('/forgot-password')} style={{ marginTop: space.sm }} />
    </AuthShell>
  );
}

function InDemo() {
  const { signOut } = useSession();
  return (
    <AuthShell title="You’re in the demo workspace" subtitle="Exit the demo, then open your invitation link again to sign in and join your team.">
      <Button title="Exit demo" onPress={signOut} />
    </AuthShell>
  );
}

function Accept({ token }: { token: string }) {
  const { session, refresh, signOut } = useSession();
  const [state, setState] = useState<'working' | 'done' | 'problem'>('working');
  const [problem, setProblem] = useState<Problem | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const started = useRef(false);
  const refreshRef = useRef(refresh);
  useEffect(() => { refreshRef.current = refresh; });

  const accept = useCallback(async () => {
    setNote(null);
    const { error } = await supabase.rpc('accept_invitation', { p_code: token });
    if (error) {
      setProblem(classify(error.message));
      setState('problem');
      if (!/EMAIL_UNVERIFIED|This invitation is for/.test(error.message)) await clearPendingInvite();
      return;
    }
    await clearPendingInvite();
    await refreshRef.current();
    setState('done');
  }, [token]);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    accept();
  }, [accept]);

  if (state === 'working') {
    return (
      <AuthShell title="Joining your team…">
        <View style={{ alignItems: 'center', padding: space.lg }}><ActivityIndicator size="large" color={colors.primary} /></View>
      </AuthShell>
    );
  }

  if (state === 'done') {
    return (
      <AuthShell title="You’re on the team">
        <Row gap={space.md} style={{ marginBottom: space.lg }}>
          <IconTile icon="checkmark-circle" tone="success" />
          <T style={{ flex: 1 }}>Your invitation was accepted. Your company is ready in Flight Ready.</T>
        </Row>
        <Button title="Open Flight Ready" onPress={() => router.replace('/')} />
      </AuthShell>
    );
  }

  const email = session?.user.email ?? '';
  return (
    <AuthShell title="We couldn’t accept this invitation">
      <ErrorBanner message={problem?.message} />
      {problem?.kind === 'unverified' ? (
        <>
          <T>For security, your email ({email}) must be verified before you join a team. Open the confirmation email we sent when you signed up and tap the link, then come back and try again.</T>
          {note ? <T variant="small" style={{ marginTop: space.sm, color: colors.success }}>{note}</T> : null}
          <Button style={{ marginTop: space.lg }} kind="secondary" title="Resend verification email" onPress={async () => {
            const { error } = await supabase.auth.resend({ type: 'signup', email });
            setNote(error ? error.message : `Sent. Check ${email} (and your spam folder).`);
          }} />
          <Button style={{ marginTop: space.sm }} title="I’ve verified — try again" onPress={accept} />
        </>
      ) : problem?.kind === 'wrong_email' ? (
        <>
          <T>You’re signed in as {email}. Sign out, then sign in or create an account with the invited email. Your invitation will be kept.</T>
          <Button style={{ marginTop: space.lg }} title="Sign out & switch email" onPress={async () => { await savePendingInvite(token); await signOut(); }} />
        </>
      ) : problem?.kind === 'expired' || problem?.kind === 'invalid' ? (
        <T>Ask the person who invited you to send a new invitation from Team in their Flight Ready app. Invitations last 7 days.</T>
      ) : problem?.kind === 'full' ? (
        <T>Every seat on this team is in use. Ask the owner to upgrade the plan or free a seat, then try again.</T>
      ) : (
        <Button style={{ marginTop: space.md }} title="Try again" onPress={accept} />
      )}
      <Button style={{ marginTop: space.md }} kind="ghost" title="Go to Flight Ready" onPress={() => router.replace('/')} />
    </AuthShell>
  );
}

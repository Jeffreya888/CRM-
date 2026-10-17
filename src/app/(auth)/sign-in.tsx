import { Link, router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { AuthShell } from '../../components/AuthShell';
import { AppleSignInButton, signInWithApple, useAppleAvailable } from '../../components/security/AppleSignIn';
import { AuthLinks } from '../../components/security/AuthLinks';
import { Button, Divider, ErrorBanner, Field, Row, T } from '../../components/ui';
import { startDemo } from '../../lib/demo';
import { parseInvite } from '../../lib/security';
import { supabase } from '../../lib/supabase';
import { colors, space } from '../../lib/theme';

export default function SignIn() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);
  const [invite, setInvite] = useState('');
  const apple = useAppleAvailable();

  const submit = async () => {
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) setError(error.message.includes('Invalid login') ? 'That email and password don’t match. Try again or reset your password.' : error.message);
  };

  const demo = async () => {
    setError(null);
    try {
      await startDemo();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const apple_ = async () => {
    setError(null);
    try {
      await signInWithApple();
    } catch (e: any) {
      setError(e.message);
    }
  };

  return (
    <AuthShell title="Sign in" footer={<AuthLinks />}>
      <ErrorBanner message={error} />
      <Field label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" textContentType="emailAddress" icon="mail-outline" />
      <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry autoComplete="password" textContentType="password" onSubmitEditing={submit} icon="lock-closed-outline" />
      <Button title="Sign in" onPress={submit} disabled={!email || !password} />
      <Row style={{ justifyContent: 'space-between', marginTop: space.lg }}>
        <Link href="/forgot-password"><T style={{ color: colors.primaryText }}>Forgot password?</T></Link>
        <Link href="/sign-up"><T style={{ color: colors.primaryText, fontWeight: '700' }}>Create account</T></Link>
      </Row>

      {apple ? (
        <View style={{ marginTop: space.lg }}>
          <AppleSignInButton onPress={apple_} />
        </View>
      ) : null}

      <Divider />
      <Button kind="secondary" icon="sparkles-outline" title="Explore demo workspace" onPress={demo} />
      <T variant="small" style={{ textAlign: 'center', marginTop: space.xs }}>A private sample company. Nothing is sent or charged.</T>

      <View style={{ marginTop: space.lg }}>
        {joining ? (
          <>
            <Field label="Invite code or link" placeholder="8-character code or the link from your email" autoCapitalize="none" autoCorrect={false}
              value={invite} onChangeText={setInvite} icon="people-outline" />
            <Row>
              <Button style={{ flex: 1 }} kind="ghost" title="Cancel" onPress={() => setJoining(false)} />
              <Button style={{ flex: 1 }} title="Continue" disabled={parseInvite(invite).length < 6} onPress={() => router.push(`/invite/${encodeURIComponent(parseInvite(invite))}`)} />
            </Row>
          </>
        ) : (
          <Button kind="ghost" icon="people-outline" title="Join your company" onPress={() => setJoining(true)} />
        )}
      </View>
    </AuthShell>
  );
}

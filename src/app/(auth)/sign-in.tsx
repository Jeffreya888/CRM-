import { Link } from 'expo-router';
import { useState } from 'react';
import { AuthShell } from '../../components/AuthShell';
import { Button, ErrorBanner, Field, Row, T } from '../../components/ui';
import { supabase } from '../../lib/supabase';
import { colors, space } from '../../lib/theme';

export default function SignIn() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) setError(error.message);
  };

  return (
    <AuthShell title="Sign in">
      <ErrorBanner message={error} />
      <Field label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" textContentType="emailAddress" />
      <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry autoComplete="password" textContentType="password" onSubmitEditing={submit} />
      <Button title="Sign in" onPress={submit} disabled={!email || !password} />
      <Row style={{ justifyContent: 'space-between', marginTop: space.lg }}>
        <Link href="/forgot-password"><T style={{ color: colors.primary }}>Forgot password?</T></Link>
        <Link href="/sign-up"><T style={{ color: colors.primary, fontWeight: '700' }}>Create account</T></Link>
      </Row>
    </AuthShell>
  );
}

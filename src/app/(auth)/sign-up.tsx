import { Link } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { AuthShell } from '../../components/AuthShell';
import { notify } from '../../components/FormSheet';
import { Button, ErrorBanner, Field, Row, T } from '../../components/ui';
import { PRIVACY_URL, TERMS_URL } from '../../lib/config';
import { supabase } from '../../lib/supabase';
import { colors, space } from '../../lib/theme';

export default function SignUp() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    if (password.length < 8) return setError('Password must be at least 8 characters.');
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { data: { full_name: name.trim() } },
    });
    if (error) return setError(error.message);
    if (!data.session) notify('Check your email', 'We sent you a confirmation link. Open it, then sign in.');
  };

  return (
    <AuthShell title="Create your account">
      <ErrorBanner message={error} />
      <Field label="Your name" value={name} onChangeText={setName} autoComplete="name" textContentType="name" />
      <Field label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" />
      <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry hint="At least 8 characters" textContentType="newPassword" />
      <Button title="Start 14-day free trial" onPress={submit} disabled={!name || !email || !password} />
      <T variant="small" style={{ marginTop: space.md, textAlign: 'center' }}>By continuing you agree to the</T>
      <Row style={{ justifyContent: 'center' }}>
        <Button small kind="ghost" title="Terms of Use" onPress={() => WebBrowser.openBrowserAsync(TERMS_URL)} />
        <Button small kind="ghost" title="Privacy Policy" onPress={() => WebBrowser.openBrowserAsync(PRIVACY_URL)} />
      </Row>
      <Link href="/sign-in" style={{ marginTop: space.md, alignSelf: 'center' }}>
        <T style={{ color: colors.primary }}>Already have an account? Sign in</T>
      </Link>
    </AuthShell>
  );
}

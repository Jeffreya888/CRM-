import { Link } from 'expo-router';
import * as Linking from 'expo-linking';
import { useState } from 'react';
import { AuthShell } from '../../components/AuthShell';
import { Button, ErrorBanner, Field, T } from '../../components/ui';
import { supabase } from '../../lib/supabase';
import { colors, space } from '../../lib/theme';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: Linking.createURL('/') });
    if (error) setError(error.message);
    else setSent(true);
  };

  return (
    <AuthShell title="Reset password">
      <ErrorBanner message={error} />
      {sent ? (
        <T>Check {email} for a reset link.</T>
      ) : (
        <>
          <Field label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />
          <Button title="Send reset link" onPress={submit} disabled={!email} />
        </>
      )}
      <Link href="/sign-in" style={{ marginTop: space.lg, alignSelf: 'center' }}>
        <T style={{ color: colors.primary }}>Back to sign in</T>
      </Link>
    </AuthShell>
  );
}

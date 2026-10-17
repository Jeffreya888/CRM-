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
    <AuthShell title="Reset password" subtitle="We’ll email you a link to choose a new password.">
      <ErrorBanner message={error} />
      {sent ? (
        <T>Check {email.trim()} for a reset link. Open it on this device, then pick a new password (10–128 characters).</T>
      ) : (
        <>
          <Field label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" icon="mail-outline" onSubmitEditing={submit} />
          <Button title="Send reset link" onPress={submit} disabled={!email.trim()} />
        </>
      )}
      <Link href="/sign-in" style={{ marginTop: space.lg, alignSelf: 'center' }}>
        <T style={{ color: colors.primaryText }}>Back to sign in</T>
      </Link>
    </AuthShell>
  );
}

import * as Linking from 'expo-linking';
import { Link, useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { AuthShell } from '../../components/AuthShell';
import { BusinessTypePicker } from '../../components/security/BusinessTypePicker';
import { Button, ErrorBanner, Field, Row, T } from '../../components/ui';
import { PRIVACY_URL, TERMS_URL } from '../../lib/config';
import { passwordProblem, PASSWORD_MAX, PASSWORD_MIN, savePendingInvite } from '../../lib/security';
import { supabase } from '../../lib/supabase';
import { colors, space } from '../../lib/theme';
import type { AssetType } from '../../lib/types';

export default function SignUp() {
  const params = useLocalSearchParams<{ invite?: string; email?: string }>();
  const invite = typeof params.invite === 'string' ? params.invite : '';
  const [step, setStep] = useState<'account' | 'business' | 'sent'>('account');
  const [name, setName] = useState('');
  const [email, setEmail] = useState(typeof params.email === 'string' ? params.email : '');
  const [password, setPassword] = useState('');
  const [types, setTypes] = useState<AssetType[]>(['aircraft']);
  const [error, setError] = useState<string | null>(null);

  const next = () => {
    setError(null);
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) return setError('Enter a valid email address.');
    const p = passwordProblem(password);
    if (p) return setError(p);
    if (invite) return create();
    setStep('business');
  };

  const create = async () => {
    setError(null);
    if (invite) await savePendingInvite(invite);
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: { full_name: name.trim(), ...(invite ? {} : { business_types: types }) },
        emailRedirectTo: Linking.createURL(invite ? `/invite/${invite}` : '/'),
      },
    });
    if (error) return setError(error.message);
    if (!data.session) setStep('sent');
  };

  if (step === 'sent') {
    return (
      <AuthShell title="Check your email" subtitle={`We sent a confirmation link to ${email.trim()}.`}>
        <T>Open the link to verify your email, then come back and sign in.{invite ? ' Your invitation will be waiting.' : ''}</T>
        <Button style={{ marginTop: space.lg }} kind="secondary" title="Resend the link" onPress={async () => {
          const { error } = await supabase.auth.resend({ type: 'signup', email: email.trim() });
          setError(error ? error.message : null);
        }} />
        <ErrorBanner message={error} />
        <Link href="/sign-in" style={{ marginTop: space.lg, alignSelf: 'center' }}>
          <T style={{ color: colors.primaryText }}>Back to sign in</T>
        </Link>
      </AuthShell>
    );
  }

  if (step === 'business') {
    return (
      <AuthShell title="What do you detail?" subtitle="We’ll set up the right forms, sizes and starter prices.">
        <ErrorBanner message={error} />
        <BusinessTypePicker value={types} onChange={setTypes} />
        <Button title="Start 14-day free trial" onPress={create} />
        <Button style={{ marginTop: space.sm }} kind="ghost" title="Back" onPress={() => setStep('account')} />
        <T variant="small" style={{ marginTop: space.md, textAlign: 'center' }}>By continuing you agree to the</T>
        <Row style={{ justifyContent: 'center' }}>
          <Button small kind="ghost" title="Terms of Use" onPress={() => WebBrowser.openBrowserAsync(TERMS_URL)} />
          <Button small kind="ghost" title="Privacy Policy" onPress={() => WebBrowser.openBrowserAsync(PRIVACY_URL)} />
        </Row>
      </AuthShell>
    );
  }

  return (
    <AuthShell title={invite ? 'Create your account to join' : 'Create your account'} subtitle={invite ? 'Use the email address your invitation was sent to.' : '14 days free with every feature. No card required.'}>
      <ErrorBanner message={error} />
      <Field label="Your name" value={name} onChangeText={setName} autoComplete="name" textContentType="name" icon="person-outline" />
      <Field label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" icon="mail-outline" />
      <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry maxLength={PASSWORD_MAX} hint={`${PASSWORD_MIN}–${PASSWORD_MAX} characters`} textContentType="newPassword" autoComplete="new-password" icon="lock-closed-outline" onSubmitEditing={next} />
      <Button title={invite ? 'Create account' : 'Continue'} onPress={next} disabled={!name.trim() || !email.trim() || !password} />
      {invite ? (
        <>
          <T variant="small" style={{ marginTop: space.md, textAlign: 'center' }}>By continuing you agree to the</T>
          <Row style={{ justifyContent: 'center' }}>
            <Button small kind="ghost" title="Terms of Use" onPress={() => WebBrowser.openBrowserAsync(TERMS_URL)} />
            <Button small kind="ghost" title="Privacy Policy" onPress={() => WebBrowser.openBrowserAsync(PRIVACY_URL)} />
          </Row>
        </>
      ) : null}
      <Link href="/sign-in" style={{ marginTop: space.md, alignSelf: 'center' }}>
        <T style={{ color: colors.primaryText }}>Already have an account? Sign in</T>
      </Link>
    </AuthShell>
  );
}

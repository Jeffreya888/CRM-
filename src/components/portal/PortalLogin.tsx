import { useState } from 'react';
import { View } from 'react-native';
import { Button, Card, ErrorBanner, Field, IconTile, Row, T } from '../ui';
import { requestPortalCode, verifyPortalCode, type PortalSession } from '../../lib/portal';
import { colors, space } from '../../lib/theme';
import { Notice } from './PortalShell';

/** Email → one-time code sign-in for the customer portal. */
export function PortalLogin({ slug, notice, onSignedIn }: { slug: string; notice?: string | null; onSignedIn: (s: PortalSession) => void }) {
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);

  const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  const sendCode = async () => {
    setError(null);
    if (!validEmail) return setError('Enter the email address your service provider has on file.');
    try {
      await requestPortalCode(slug, email);
      setStep('code');
      setCode('');
    } catch (e: any) {
      setError(e.message);
    }
  };

  const verify = async () => {
    setError(null);
    if (code.trim().length < 4) return setError('Enter the code from the email.');
    try {
      onSignedIn(await verifyPortalCode(slug, email, code));
    } catch (e: any) {
      setError(/invalid|incorrect|wrong|expired/i.test(e.message) ? 'That code did not work or has expired. Check it, or send a new one.' : e.message);
    }
  };

  return (
    <View>
      <Card>
        <Row style={{ marginBottom: space.md }}>
          <IconTile icon="person-circle-outline" tone="primary" size={48} />
          <View style={{ flex: 1 }}>
            <T variant="h2">Customer portal</T>
            <T variant="muted">See your upcoming service, photos, quotes and invoices.</T>
          </View>
        </Row>
        {notice ? <Notice tone="warning" icon="time-outline" title={notice} /> : null}
        <ErrorBanner message={error} />
        {step === 'email' ? (
          <>
            <Field label="Email" value={email} onChangeText={setEmail} placeholder="you@example.com" keyboardType="email-address"
              autoCapitalize="none" autoComplete="email" autoCorrect={false} onSubmitEditing={sendCode} returnKeyType="send" icon="mail-outline" />
            <Button title="Email me a sign-in code" icon="paper-plane-outline" onPress={sendCode} disabled={!email.trim()} />
            <T variant="small" style={{ marginTop: space.md }}>No password needed. We&apos;ll email you a short code.</T>
          </>
        ) : (
          <>
            <T style={{ marginBottom: space.md }}>
              If <T style={{ fontWeight: '700' }}>{email.trim()}</T> is on file, a sign-in code is on its way. It expires in a few minutes.
            </T>
            <Field label="Sign-in code" value={code} onChangeText={(v) => setCode(v.replace(/\s/g, ''))} placeholder="123456" keyboardType="number-pad"
              autoComplete="one-time-code" textContentType="oneTimeCode" maxLength={10} onSubmitEditing={verify} returnKeyType="go" icon="key-outline" />
            <Button title="Sign in" icon="log-in-outline" onPress={verify} disabled={!code.trim()} />
            <Row style={{ marginTop: space.sm, justifyContent: 'space-between', flexWrap: 'wrap' }}>
              <Button small kind="ghost" title="Use a different email" onPress={() => { setStep('email'); setError(null); }} />
              <Button small kind="ghost" title="Send a new code" onPress={sendCode} />
            </Row>
            <T variant="small" style={{ color: colors.textMuted }}>Didn&apos;t get it? Check your spam folder, or contact your service provider to confirm your email.</T>
          </>
        )}
      </Card>
    </View>
  );
}

import * as Clipboard from 'expo-clipboard';
import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { supabase } from '../../lib/supabase';
import { colors, radius, space } from '../../lib/theme';
import { Button, ErrorBanner, Field, Row, T } from '../ui';

const cleanCode = (s: string) => s.replace(/\D/g, '').slice(0, 6);

/** Enroll an authenticator app: QR code + secret, then confirm a 6-digit code. */
export function TotpEnroll({ onDone, onCancel }: { onDone: () => void; onCancel?: () => void }) {
  const [factor, setFactor] = useState<{ id: string; uri: string; secret: string } | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      // Clear half-finished setups so a new one can start.
      const { data: list } = await supabase.auth.mfa.listFactors();
      for (const f of list?.all ?? []) {
        if (f.factor_type === 'totp' && f.status !== 'verified') await supabase.auth.mfa.unenroll({ factorId: f.id });
      }
      const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: `Authenticator ${new Date().toISOString().slice(0, 10)}` });
      if (!alive) return;
      if (error) setError(error.message.includes('disabled') ? 'Two-step sign-in is not turned on for this app yet. Please contact support.' : error.message);
      else setFactor({ id: data.id, uri: data.totp.uri, secret: data.totp.secret });
    })();
    return () => { alive = false; };
  }, []);

  const verify = async () => {
    if (!factor) return;
    setError(null);
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code: cleanCode(code) });
    if (error) return setError(error.message.includes('Invalid') ? 'That code didn’t match. Check the time on your phone and try the newest code.' : error.message);
    onDone();
  };

  return (
    <View>
      <ErrorBanner message={error} />
      {!factor ? (
        !error ? <ActivityIndicator color={colors.primary} style={{ margin: space.lg }} /> : null
      ) : (
        <>
          <T style={{ marginBottom: space.md }}>1. Open an authenticator app (Google Authenticator, 1Password, Authy, Microsoft Authenticator) and scan this code.</T>
          <View style={{ alignSelf: 'center', padding: space.md, backgroundColor: colors.white, borderRadius: radius.md, marginBottom: space.md }}>
            <QRCode value={factor.uri} size={180} backgroundColor={colors.white} color="#000000" />
          </View>
          <T variant="small" style={{ textAlign: 'center' }}>Can’t scan? Enter this key instead:</T>
          <Row style={{ justifyContent: 'center', marginBottom: space.lg, flexWrap: 'wrap' }}>
            <T style={{ fontFamily: 'monospace', letterSpacing: 1, color: colors.primaryText }} >{factor.secret}</T>
            <Button small kind="ghost" icon={copied ? 'checkmark' : 'copy-outline'} title={copied ? 'Copied' : 'Copy'} onPress={async () => { await Clipboard.setStringAsync(factor.secret); setCopied(true); }} />
          </Row>
          <T style={{ marginBottom: space.sm }}>2. Enter the 6-digit code it shows.</T>
          <Field value={code} onChangeText={(v) => setCode(cleanCode(v))} keyboardType="number-pad" placeholder="123456" maxLength={6}
            autoComplete="one-time-code" textContentType="oneTimeCode" onSubmitEditing={verify} icon="keypad-outline" />
          <Button title="Turn on two-step sign-in" onPress={verify} disabled={cleanCode(code).length !== 6} />
        </>
      )}
      {onCancel ? <Button style={{ marginTop: space.sm }} kind="ghost" title="Cancel" onPress={async () => {
        if (factor) await supabase.auth.mfa.unenroll({ factorId: factor.id }).catch(() => {});
        onCancel();
      }} /> : null}
    </View>
  );
}

/** Enter a code from an already set-up authenticator app. */
export function TotpVerify({ factorId, onDone }: { factorId: string; onDone: () => void }) {
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const verify = async () => {
    setError(null);
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code: cleanCode(code) });
    if (error) return setError(error.message.includes('Invalid') ? 'That code didn’t match. Try the newest code in your authenticator app.' : error.message);
    onDone();
  };
  return (
    <View>
      <ErrorBanner message={error} />
      <Field label="6-digit code" value={code} onChangeText={(v) => setCode(cleanCode(v))} keyboardType="number-pad" placeholder="123456" maxLength={6}
        autoComplete="one-time-code" textContentType="oneTimeCode" onSubmitEditing={verify} icon="keypad-outline" autoFocus />
      <Button title="Verify" onPress={verify} disabled={cleanCode(code).length !== 6} />
    </View>
  );
}

import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { passwordProblem, PASSWORD_MAX, PASSWORD_MIN, useRecovery } from '../../lib/security';
import { supabase } from '../../lib/supabase';
import { colors } from '../../lib/theme';
import { AuthShell } from '../AuthShell';
import { notify } from '../FormSheet';
import { Button, ErrorBanner, Field } from '../ui';

/** Shown after opening a "reset password" email link: pick a new password. */
export function NewPasswordGate() {
  const setRecovery = useRecovery((s) => s.set);
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setError(null);
    const p = passwordProblem(pw);
    if (p) return setError(p);
    if (pw !== pw2) return setError('The two passwords don’t match.');
    const { error } = await supabase.auth.updateUser({ password: pw });
    if (error) return setError(error.message);
    setRecovery(false);
    notify('Password updated', 'Use your new password next time you sign in.');
  };

  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.bg, zIndex: 950 }]}>
      <AuthShell title="Choose a new password" subtitle={`${PASSWORD_MIN}–${PASSWORD_MAX} characters.`}>
        <ErrorBanner message={error} />
        <Field label="New password" value={pw} onChangeText={setPw} secureTextEntry maxLength={PASSWORD_MAX} textContentType="newPassword" autoComplete="new-password" icon="lock-closed-outline" />
        <Field label="Repeat new password" value={pw2} onChangeText={setPw2} secureTextEntry maxLength={PASSWORD_MAX} textContentType="newPassword" icon="lock-closed-outline" onSubmitEditing={save} />
        <Button title="Save new password" onPress={save} disabled={!pw || !pw2} />
        <Button kind="ghost" title="Skip for now" onPress={() => setRecovery(false)} />
      </AuthShell>
    </View>
  );
}

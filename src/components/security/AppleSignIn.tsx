import * as AppleAuthentication from 'expo-apple-authentication';
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { supabase } from '../../lib/supabase';

/** True on iPhones/iPads that support Sign in with Apple. */
export function useAppleAvailable(): boolean {
  const [ok, setOk] = useState(false);
  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    AppleAuthentication.isAvailableAsync().then(setOk).catch(() => setOk(false));
  }, []);
  return ok;
}

/** Asks Apple for an identity token. Returns null when the person cancels. */
async function appleToken(): Promise<{ token: string; fullName: string | null } | null> {
  try {
    const cred = await AppleAuthentication.signInAsync({
      requestedScopes: [AppleAuthentication.AppleAuthenticationScope.FULL_NAME, AppleAuthentication.AppleAuthenticationScope.EMAIL],
    });
    if (!cred.identityToken) throw new Error('Apple did not return a sign-in token. Please try again.');
    const fullName = cred.fullName ? [cred.fullName.givenName, cred.fullName.familyName].filter(Boolean).join(' ') || null : null;
    return { token: cred.identityToken, fullName };
  } catch (e: any) {
    if (e?.code === 'ERR_REQUEST_CANCELED' || e?.code === 'ERR_CANCELED') return null;
    throw e;
  }
}

/** Signs in (or creates an account) with Apple. */
export async function signInWithApple(): Promise<void> {
  const t = await appleToken();
  if (!t) return;
  const { error } = await supabase.auth.signInWithIdToken({ provider: 'apple', token: t.token });
  if (error) throw new Error(error.message);
  // Apple only shares the name on the very first sign-in; keep it.
  if (t.fullName) await supabase.auth.updateUser({ data: { full_name: t.fullName } }).catch(() => {});
}

/** Links an Apple ID to the signed-in account. */
export async function linkAppleId(): Promise<boolean> {
  const t = await appleToken();
  if (!t) return false;
  const { error } = await supabase.auth.linkIdentity({ provider: 'apple', token: t.token });
  if (error) throw new Error(error.message);
  return true;
}

export function AppleSignInButton({ onPress }: { onPress: () => void }) {
  return (
    <AppleAuthentication.AppleAuthenticationButton
      buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
      buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.WHITE}
      cornerRadius={12}
      style={{ height: 48, width: '100%' }}
      onPress={onPress}
    />
  );
}

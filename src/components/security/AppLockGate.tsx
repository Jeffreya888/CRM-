import * as LocalAuthentication from 'expo-local-authentication';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Platform, StyleSheet, View } from 'react-native';
import { useAppLock } from '../../lib/security';
import { useSession } from '../../lib/session';
import { colors, space } from '../../lib/theme';
import { Button, Ionicons, T } from '../ui';

/** Asks for Face ID / fingerprint (falls back to the device passcode). */
export async function unlockWithBiometrics(prompt = 'Unlock Flight Ready'): Promise<boolean> {
  const res = await LocalAuthentication.authenticateAsync({ promptMessage: prompt, cancelLabel: 'Cancel', disableDeviceFallback: false });
  return res.success;
}

/** Can this phone use biometrics or a passcode for app lock? */
export async function biometricsReady(): Promise<{ ok: boolean; reason?: string; label: string }> {
  if (Platform.OS === 'web') return { ok: false, reason: 'App lock works in the iPhone and Android app.', label: 'Face ID / fingerprint' };
  const [hw, enrolled, types] = await Promise.all([
    LocalAuthentication.hasHardwareAsync(),
    LocalAuthentication.isEnrolledAsync(),
    LocalAuthentication.supportedAuthenticationTypesAsync(),
  ]);
  const face = types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION);
  const label = Platform.OS === 'ios' ? (face ? 'Face ID' : 'Touch ID') : face ? 'Face unlock' : 'Fingerprint';
  if (!hw) return { ok: false, reason: 'This device has no Face ID or fingerprint sensor.', label };
  if (!enrolled) return { ok: false, reason: `Set up ${label} in your phone settings first.`, label };
  return { ok: true, label };
}

/**
 * Covers the app with a lock screen when the app opens, or comes back after
 * the chosen time away, until the person unlocks with biometrics.
 */
export function AppLockGate() {
  const { session } = useSession();
  const { loaded, enabled, load } = useAppLock();
  const [locked, setLocked] = useState(false);
  const awaySince = useRef<number | null>(null);
  const coldStartChecked = useRef(false);
  const prompting = useRef(false);

  useEffect(() => { load(); }, [load]);

  const tryUnlock = useCallback(async () => {
    if (prompting.current) return;
    prompting.current = true;
    try {
      if (await unlockWithBiometrics()) setLocked(false);
    } finally {
      prompting.current = false;
    }
  }, []);

  // Lock on a cold start once settings have loaded.
  useEffect(() => {
    if (!loaded || coldStartChecked.current) return;
    coldStartChecked.current = true;
    if (enabled && session) {
      // Defer so the state change happens outside the effect body.
      const t = setTimeout(() => { setLocked(true); tryUnlock(); }, 0);
      return () => clearTimeout(t);
    }
  }, [loaded, enabled, session, tryUnlock]);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    const sub = AppState.addEventListener('change', (state) => {
      const { enabled: on, after: mins } = useAppLock.getState();
      if (state === 'background' || state === 'inactive') {
        if (awaySince.current == null && !prompting.current) awaySince.current = Date.now();
        return;
      }
      if (state === 'active') {
        const since = awaySince.current;
        awaySince.current = null;
        if (!on || since == null || prompting.current) return;
        if (Date.now() - since >= mins * 60_000) {
          setLocked(true);
          tryUnlock();
        }
      }
    });
    return () => sub.remove();
  }, [tryUnlock]);

  if (!locked || !enabled || !session) return null;
  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.bgDeep, alignItems: 'center', justifyContent: 'center', padding: space.xl, zIndex: 1000 }]}>
      <View style={{ width: 84, height: 84, borderRadius: 24, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name="lock-closed" size={40} color={colors.primary} />
      </View>
      <T variant="h2" style={{ marginTop: space.lg }}>Flight Ready is locked</T>
      <T variant="muted" style={{ marginTop: space.xs, textAlign: 'center' }}>Unlock with Face ID, fingerprint or your phone passcode.</T>
      <Button style={{ marginTop: space.xl, minWidth: 220 }} icon="finger-print" title="Unlock" onPress={tryUnlock} />
    </View>
  );
}

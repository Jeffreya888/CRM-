import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Session } from '@supabase/supabase-js';
import * as Application from 'expo-application';
import Constants from 'expo-constants';
import { randomUUID } from 'expo-crypto';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { create } from 'zustand';
import { callFunction, supabase } from './supabase';

// ---------------------------------------------------------------------------
// Password rules (sign-up, reset, change)
// ---------------------------------------------------------------------------
export const PASSWORD_MIN = 10;
export const PASSWORD_MAX = 128;

/** Returns a friendly problem with the password, or null when it is fine. */
export function passwordProblem(pw: string): string | null {
  if (pw.length < PASSWORD_MIN) return `Use at least ${PASSWORD_MIN} characters.`;
  if (pw.length > PASSWORD_MAX) return `Use ${PASSWORD_MAX} characters or fewer.`;
  return null;
}

// ---------------------------------------------------------------------------
// Session helpers
// ---------------------------------------------------------------------------
function decodeBase64Url(s: string): string {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let out = '';
  let buffer = 0;
  let bits = 0;
  for (const c of b64) {
    const v = chars.indexOf(c);
    if (v < 0) continue;
    buffer = (buffer << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out += String.fromCharCode((buffer >> bits) & 0xff);
    }
  }
  try {
    return decodeURIComponent(escape(out));
  } catch {
    return out;
  }
}

/** Claims inside the access token (session_id, aal, ...). */
export function jwtClaims(session: Session | null | undefined): Record<string, any> {
  const part = session?.access_token?.split('.')[1];
  if (!part) return {};
  try {
    return JSON.parse(decodeBase64Url(part));
  } catch {
    return {};
  }
}

export const currentSessionId = (s: Session | null | undefined): string | null => jwtClaims(s).session_id ?? null;
export const isAnonymous = (s: Session | null | undefined) => !!s?.user?.is_anonymous;

// ---------------------------------------------------------------------------
// Device identity + new-device alert
// ---------------------------------------------------------------------------
const DEVICE_KEY = 'security:device-id';

/** A stable id for this install (vendor id / Android id, else a stored uuid). */
export async function deviceId(): Promise<string> {
  try {
    if (Platform.OS === 'ios') {
      const id = await Application.getIosIdForVendorAsync();
      if (id) return `ios-${id}`;
    } else if (Platform.OS === 'android') {
      const id = Application.getAndroidId();
      if (id) return `android-${id}`;
    }
  } catch {}
  try {
    const saved = await AsyncStorage.getItem(DEVICE_KEY);
    if (saved) return saved;
    const id = `${Platform.OS}-${randomUUID()}`;
    await AsyncStorage.setItem(DEVICE_KEY, id);
    return id;
  } catch {
    return `${Platform.OS}-unknown`;
  }
}

/** Turns a browser user agent into something like "Chrome on Mac". */
export function describeUserAgent(ua: string | null | undefined): string {
  if (!ua) return 'Unknown device';
  const s = ua.toLowerCase();
  if (s.includes('expo') || s.includes('okhttp') || s.includes('cfnetwork') || s.includes('darwin/')) {
    if (s.includes('okhttp') || s.includes('android')) return 'Flight Ready app on Android';
    return 'Flight Ready app on iPhone or iPad';
  }
  const os = s.includes('iphone') ? 'iPhone'
    : s.includes('ipad') ? 'iPad'
    : s.includes('android') ? 'Android'
    : s.includes('mac os') || s.includes('macintosh') ? 'Mac'
    : s.includes('windows') ? 'Windows'
    : s.includes('cros') ? 'Chromebook'
    : s.includes('linux') ? 'Linux'
    : null;
  const browser = s.includes('edg/') ? 'Edge'
    : s.includes('opr/') || s.includes('opera') ? 'Opera'
    : s.includes('firefox') || s.includes('fxios') ? 'Firefox'
    : s.includes('crios') || s.includes('chrome') ? 'Chrome'
    : s.includes('safari') ? 'Safari'
    : s.includes('node') || s.includes('deno') ? 'Server'
    : null;
  if (browser && os) return `${browser} on ${os}`;
  return browser ?? os ?? 'Unknown device';
}

/** Readable name for this device, e.g. "iPhone 16 Pro (iOS 19)". */
export function deviceLabel(): string {
  if (Platform.OS === 'web') {
    const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
    return describeUserAgent(ua);
  }
  const model = Device.modelName ?? (Platform.OS === 'ios' ? 'iPhone' : 'Android phone');
  const os = Device.osName && Device.osVersion ? ` (${Device.osName} ${Device.osVersion})` : '';
  return `${model}${os}`;
}

const registeredSessions = new Set<string>();

/**
 * Records this device for the signed-in user. On a device the account has not
 * used before, asks the server to email a "new sign-in" alert. Once per session.
 */
export async function registerThisDevice(session: Session): Promise<void> {
  if (isAnonymous(session)) return;
  const key = currentSessionId(session) ?? session.user.id;
  if (registeredSessions.has(key)) return;
  registeredSessions.add(key);
  try {
    const label = deviceLabel();
    const { data: isNew } = await supabase.rpc('register_device', { p_device: await deviceId(), p_label: label, p_platform: Platform.OS });
    if (isNew === true) await callFunction('security-alert', { device: label }).catch(() => {});
  } catch {}
}

// ---------------------------------------------------------------------------
// Push notifications on this device
// ---------------------------------------------------------------------------
const PUSH_OFF_KEY = 'security:push-off';

export async function pushDisabledHere(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(PUSH_OFF_KEY)) === '1';
  } catch {
    return false;
  }
}

export async function setPushDisabledHere(off: boolean): Promise<void> {
  try {
    if (off) await AsyncStorage.setItem(PUSH_OFF_KEY, '1');
    else await AsyncStorage.removeItem(PUSH_OFF_KEY);
  } catch {}
}

/** This device's Expo push token, without prompting. Null when unavailable. */
export async function currentPushToken(): Promise<string | null> {
  if (Platform.OS === 'web' || !Device.isDevice) return null;
  try {
    const perm = await Notifications.getPermissionsAsync();
    if (!perm.granted) return null;
    const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    if (!projectId) return null;
    return (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  } catch {
    return null;
  }
}

/** Stops pushes to this phone by removing its token row. */
export async function removeThisDevicePush(userId: string): Promise<void> {
  await setPushDisabledHere(true);
  const token = await currentPushToken();
  if (token) await supabase.from('push_tokens').delete().eq('token', token).eq('user_id', userId);
}

// ---------------------------------------------------------------------------
// App lock (Face ID / fingerprint), stored per device
// ---------------------------------------------------------------------------
export type LockAfter = 0 | 1 | 5 | 15;
export const LOCK_AFTER_OPTIONS: { value: `${LockAfter}`; label: string }[] = [
  { value: '0', label: 'Immediately' },
  { value: '1', label: '1 min' },
  { value: '5', label: '5 min' },
  { value: '15', label: '15 min' },
];

interface AppLockState {
  loaded: boolean;
  enabled: boolean;
  after: LockAfter;
  load: () => Promise<void>;
  save: (patch: Partial<Pick<AppLockState, 'enabled' | 'after'>>) => Promise<void>;
}

const LOCK_KEY = 'security:app-lock';

export const useAppLock = create<AppLockState>((set, get) => ({
  loaded: false,
  enabled: false,
  after: 0,
  load: async () => {
    if (get().loaded) return;
    try {
      const raw = await AsyncStorage.getItem(LOCK_KEY);
      const v = raw ? JSON.parse(raw) : {};
      set({ loaded: true, enabled: Platform.OS !== 'web' && !!v.enabled, after: ([0, 1, 5, 15].includes(v.after) ? v.after : 0) as LockAfter });
    } catch {
      set({ loaded: true });
    }
  },
  save: async (patch) => {
    set(patch);
    const { enabled, after } = get();
    try {
      await AsyncStorage.setItem(LOCK_KEY, JSON.stringify({ enabled, after }));
    } catch {}
  },
}));

// ---------------------------------------------------------------------------
// Pending invitation (kept while the invited person signs in / signs up)
// ---------------------------------------------------------------------------
const INVITE_KEY = 'security:pending-invite';

export async function savePendingInvite(token: string) {
  try { await AsyncStorage.setItem(INVITE_KEY, token); } catch {}
}
export async function pendingInvite(): Promise<string | null> {
  try { return await AsyncStorage.getItem(INVITE_KEY); } catch { return null; }
}
export async function clearPendingInvite() {
  try { await AsyncStorage.removeItem(INVITE_KEY); } catch {}
}

// ---------------------------------------------------------------------------
// Profile photo
// ---------------------------------------------------------------------------
/** Uploads the profile photo to "<orgId>/avatars/<uid>.jpg" and saves the path on the profile. */
export async function uploadAvatar(orgId: string, userId: string, uri: string): Promise<string> {
  const body = await (await fetch(uri)).arrayBuffer();
  const path = `${orgId}/avatars/${userId}.jpg`;
  const { error } = await supabase.storage.from('org-files').upload(path, body, { contentType: 'image/jpeg', upsert: true });
  if (error) throw new Error(error.message);
  const { error: e2 } = await supabase.from('profiles').update({ avatar_url: path }).eq('id', userId);
  if (e2) throw new Error(e2.message);
  return path;
}

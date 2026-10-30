import * as Application from 'expo-application';
import Constants from 'expo-constants';
import * as WebBrowser from 'expo-web-browser';
import { PORTAL_URL, PRIVACY_URL, TERMS_URL } from '../../lib/config';

const base = PORTAL_URL.replace(/\/+$/, '');

/** Public Tarmo website pages (hosted on the same web build as the portal). */
export const SITE = {
  home: base ? `${base}/welcome` : null,
  pricing: base ? `${base}/pricing` : null,
  privacy: base ? `${base}/privacy` : PRIVACY_URL,
  terms: base ? `${base}/terms` : TERMS_URL,
  support: base ? `${base}/support` : null,
};

export function openSite(url: string | null | undefined) {
  if (!url) return;
  WebBrowser.openBrowserAsync(url).catch(() => {});
}

/** "1.0.0 (12)" from the native build, falling back to app.json on web / Expo Go. */
export function appVersion(): string {
  const v = Application.nativeApplicationVersion ?? Constants.expoConfig?.version ?? '1.0.0';
  const b = Application.nativeBuildVersion;
  return b ? `${v} (${b})` : v;
}

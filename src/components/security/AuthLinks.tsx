import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { Platform, Pressable } from 'react-native';
import { PORTAL_URL, PRIVACY_URL } from '../../lib/config';
import { colors, space } from '../../lib/theme';
import { notify } from '../FormSheet';
import { Row, T } from '../ui';

/** Opens a public website page: in-app route on web, browser on phones. */
export function openSitePage(path: '/pricing' | '/privacy' | '/support' | '/terms') {
  if (Platform.OS === 'web') {
    router.push(path);
    return;
  }
  const base = PORTAL_URL.replace(/\/$/, '');
  const url = base ? `${base}${path}` : path === '/privacy' ? PRIVACY_URL : '';
  if (!url) return notify('Website not set up yet', 'Set EXPO_PUBLIC_PORTAL_URL to your Tarmo website address.');
  WebBrowser.openBrowserAsync(url).catch(() => notify('Could not open the page', url));
}

/** Small "Explore plans · Privacy · Support" links under the sign-in card. */
export function AuthLinks() {
  const link = (label: string, path: '/pricing' | '/privacy' | '/support') => (
    <Pressable key={path} onPress={() => openSitePage(path)} hitSlop={8} accessibilityRole="link">
      <T variant="small" style={{ color: colors.primaryText }}>{label}</T>
    </Pressable>
  );
  return (
    <Row gap={space.lg} style={{ justifyContent: 'center', flexWrap: 'wrap' }}>
      {link('Explore plans', '/pricing')}
      <T variant="small">·</T>
      {link('Privacy', '/privacy')}
      <T variant="small">·</T>
      {link('Support', '/support')}
    </Row>
  );
}

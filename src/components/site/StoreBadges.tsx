import { Text, View } from 'react-native';
import { APP_STORE_URL, PLAY_STORE_URL } from '../../lib/site';
import { Ionicons, SiteLink, fontFamily, site, webStyle, type IconName } from './primitives';

function Badge({ href, icon, small, big, compact }: { href: string; icon: IconName; small: string; big: string; compact?: boolean }) {
  return (
    <SiteLink
      href={href}
      external
      label={`${small} ${big}`}
      style={(s) => [
        {
          flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 14, borderWidth: 1,
          borderColor: s.hovered ? 'rgba(255,255,255,0.4)' : site.lineStrong,
          backgroundColor: s.hovered ? '#000000' : 'rgba(0,0,0,0.55)',
          paddingVertical: compact ? 7 : 9, paddingHorizontal: compact ? 12 : 16,
          transform: [{ translateY: s.hovered ? -1 : 0 }],
        },
        webStyle({ cursor: 'pointer', transition: 'all 180ms ease' }),
      ]}
    >
      <Ionicons name={icon} size={compact ? 20 : 24} color="#FFFFFF" />
      <View>
        <Text style={{ fontFamily, color: 'rgba(255,255,255,0.75)', fontSize: compact ? 9.5 : 10.5, fontWeight: '600', letterSpacing: 0.3 }}>{small}</Text>
        <Text style={{ fontFamily, color: '#FFFFFF', fontSize: compact ? 14.5 : 17, fontWeight: '700', letterSpacing: -0.3, marginTop: -1 }}>{big}</Text>
      </View>
    </SiteLink>
  );
}

export function StoreBadges({ compact }: { compact?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>
      <Badge href={APP_STORE_URL} icon="logo-apple" small="Download on the" big="App Store" compact={compact} />
      <Badge href={PLAY_STORE_URL} icon="logo-google-playstore" small="GET IT ON" big="Google Play" compact={compact} />
    </View>
  );
}

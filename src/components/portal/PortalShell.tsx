import { Stack } from 'expo-router';
import type { ReactNode } from 'react';
import { Image, Linking, Pressable, View } from 'react-native';
import { Card, Ionicons, Row, Screen, T } from '../ui';
import { APP_NAME } from '../../lib/config';
import { colors, radius, space } from '../../lib/theme';

export interface Brand { name: string; logo_url?: string | null; phone?: string | null; email?: string | null; address?: string | null }

/** Centered, branded page frame for customer-facing pages (web and native). */
export function PortalShell({ title, brand, children, right, onRefresh, refreshing }: {
  title: string; brand?: Brand | null; children: ReactNode; right?: ReactNode; onRefresh?: () => void; refreshing?: boolean;
}) {
  return (
    <Screen onRefresh={onRefresh} refreshing={refreshing}>
      <Stack.Screen options={{ headerShown: false, title }} />
      <View style={{ maxWidth: 760, width: '100%', alignSelf: 'center', paddingTop: space.lg }}>
        {brand ? <BrandHeader brand={brand} right={right} /> : null}
        {children}
        <T variant="small" style={{ textAlign: 'center', marginTop: space.xl }}>Powered by {APP_NAME}</T>
      </View>
    </Screen>
  );
}

export function BrandHeader({ brand, right }: { brand: Brand; right?: ReactNode }) {
  return (
    <Card>
      <Row style={{ alignItems: 'flex-start' }} gap={space.md}>
        {brand.logo_url ? (
          <Image source={{ uri: brand.logo_url }} accessibilityLabel={`${brand.name} logo`} resizeMode="contain"
            style={{ width: 64, height: 64, borderRadius: radius.md, backgroundColor: colors.white }} />
        ) : (
          <View style={{ width: 64, height: 64, borderRadius: radius.md, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="airplane" size={30} color={colors.primaryText} />
          </View>
        )}
        <View style={{ flex: 1 }}>
          <T variant="h2">{brand.name}</T>
          {brand.address ? <T variant="muted">{brand.address}</T> : null}
          <Row style={{ flexWrap: 'wrap', marginTop: 2 }} gap={space.md}>
            {brand.phone ? <ContactLink icon="call-outline" label={brand.phone} url={`tel:${brand.phone.replace(/[^0-9+]/g, '')}`} /> : null}
            {brand.email ? <ContactLink icon="mail-outline" label={brand.email} url={`mailto:${brand.email}`} /> : null}
          </Row>
        </View>
        {right}
      </Row>
    </Card>
  );
}

function ContactLink({ icon, label, url }: { icon: 'call-outline' | 'mail-outline'; label: string; url: string }) {
  return (
    <Pressable onPress={() => Linking.openURL(url).catch(() => {})} hitSlop={6}>
      <Row gap={4}>
        <Ionicons name={icon} size={14} color={colors.primaryText} />
        <T variant="muted" style={{ color: colors.primaryText }}>{label}</T>
      </Row>
    </Pressable>
  );
}

/** Green / amber / red notice card. */
export function Notice({ tone, icon, title, body, children }: {
  tone: 'success' | 'warning' | 'danger' | 'info'; icon: React.ComponentProps<typeof Ionicons>['name']; title: string; body?: string | null; children?: ReactNode;
}) {
  const map = {
    success: [colors.successSoft, colors.success], warning: [colors.warningSoft, colors.warning],
    danger: [colors.dangerSoft, colors.danger], info: [colors.infoSoft, colors.primaryText],
  } as const;
  const [bg, fg] = map[tone];
  return (
    <Card style={{ backgroundColor: bg, borderColor: bg }}>
      <Row style={{ alignItems: 'flex-start' }}>
        <Ionicons name={icon} size={22} color={fg} />
        <View style={{ flex: 1 }}>
          <T style={{ fontWeight: '700' }}>{title}</T>
          {body ? <T variant="muted" style={{ color: colors.text, marginTop: 2 }}>{body}</T> : null}
          {children}
        </View>
      </Row>
    </Card>
  );
}

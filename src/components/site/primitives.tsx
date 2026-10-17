// Building blocks for the public website (react-native-web friendly).
import Ionicons from '@expo/vector-icons/Ionicons';
import { Link, type Href } from 'expo-router';
import { useState, type ComponentProps, type ReactNode } from 'react';
import { Platform, Pressable, StyleSheet, Text, View, useWindowDimensions, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import Svg, { Defs, LinearGradient, RadialGradient, Rect, Stop } from 'react-native-svg';
import { colors } from '../../lib/theme';

export type IconName = ComponentProps<typeof Ionicons>['name'];
export { Ionicons };

export const site = {
  bg: '#0B101A',
  bgAlt: '#0F1522',
  panel: 'rgba(27, 33, 48, 0.72)',
  panelSolid: '#161C2A',
  line: 'rgba(255, 255, 255, 0.08)',
  lineStrong: 'rgba(255, 255, 255, 0.14)',
  blue: colors.primary,
  blueText: colors.primaryText,
  gold: colors.accent,
  goldText: '#E9BC79',
  text: colors.text,
  muted: '#A3ADBF',
  faint: '#6E788B',
  maxWidth: 1160,
};

const WEB = Platform.OS === 'web';
export const fontFamily = WEB ? 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif' : undefined;

/** Web-only style extras (transitions, blur) that RN types don't know. */
export const webStyle = (s: Record<string, unknown>): ViewStyle => (WEB ? (s as ViewStyle) : {});

export function useBreakpoint() {
  const { width } = useWindowDimensions();
  return { width, isMobile: width < 720, isTablet: width >= 720 && width < 1024, isDesktop: width >= 1024 };
}

/** Pressable state on web includes hovered/focused. */
type PressState = { pressed: boolean; hovered?: boolean; focused?: boolean };

export function Container({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const { isMobile } = useBreakpoint();
  return (
    <View style={[{ width: '100%', maxWidth: site.maxWidth, alignSelf: 'center', paddingHorizontal: isMobile ? 16 : 32 }, style]}>
      {children}
    </View>
  );
}

export function Section({ children, style, id, tint }: { children: ReactNode; style?: StyleProp<ViewStyle>; id?: string; tint?: boolean }) {
  const { isMobile } = useBreakpoint();
  return (
    <View nativeID={id} style={[{ paddingVertical: isMobile ? 56 : 104, backgroundColor: tint ? site.bgAlt : 'transparent' }, style]}>
      <Container>{children}</Container>
    </View>
  );
}

/** Semantic heading: role="heading" + aria-level on web, header role on native. */
export function Heading({ level = 2, children, style, center }: { level?: 1 | 2 | 3 | 4; children: ReactNode; style?: StyleProp<TextStyle>; center?: boolean }) {
  const { isMobile } = useBreakpoint();
  const size = { 1: isMobile ? 40 : 62, 2: isMobile ? 30 : 46, 3: isMobile ? 20 : 22, 4: 17 }[level];
  const a11y = WEB ? ({ role: 'heading', 'aria-level': level } as object) : { accessibilityRole: 'header' as const };
  return (
    <Text
      {...a11y}
      style={[
        {
          fontFamily,
          color: site.text,
          fontSize: size,
          lineHeight: Math.round(size * (level <= 2 ? 1.08 : 1.3)),
          fontWeight: level <= 2 ? '800' : '700',
          letterSpacing: level <= 2 ? -size * 0.03 : -0.2,
          textAlign: center ? 'center' : 'left',
        },
        style,
      ]}
    >
      {children}
    </Text>
  );
}

export function P({ children, style, size = 'md', center, muted = true }: { children: ReactNode; style?: StyleProp<TextStyle>; size?: 'sm' | 'md' | 'lg'; center?: boolean; muted?: boolean }) {
  const { isMobile } = useBreakpoint();
  const fs = size === 'lg' ? (isMobile ? 17 : 20) : size === 'sm' ? 14 : 16;
  return (
    <Text style={[{ fontFamily, color: muted ? site.muted : site.text, fontSize: fs, lineHeight: Math.round(fs * 1.6), textAlign: center ? 'center' : 'left' }, style]}>
      {children}
    </Text>
  );
}

export function Eyebrow({ children, color = site.goldText, center }: { children: ReactNode; color?: string; center?: boolean }) {
  return (
    <Text style={{ fontFamily, color, fontSize: 12.5, fontWeight: '800', letterSpacing: 2.2, textTransform: 'uppercase', marginBottom: 14, textAlign: center ? 'center' : 'left' }}>
      {children}
    </Text>
  );
}

export function SectionIntro({ eyebrow, title, body, center = true, style }: { eyebrow?: string; title: string; body?: string; center?: boolean; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[{ maxWidth: 760, alignSelf: center ? 'center' : 'flex-start', marginBottom: 48 }, style]}>
      {eyebrow ? <Eyebrow center={center}>{eyebrow}</Eyebrow> : null}
      <Heading level={2} center={center}>{title}</Heading>
      {body ? <P size="lg" center={center} style={{ marginTop: 16 }}>{body}</P> : null}
    </View>
  );
}

/** Wraps children in an expo-router Link (renders an <a> on web). Hover/focus state is tracked here
 *  because Link's Slot does not resolve Pressable's function styles. */
export function SiteLink({ href, children, style, label, external }: { href: string; children: ReactNode | ((s: PressState) => ReactNode); style?: (s: PressState) => StyleProp<ViewStyle>; label?: string; external?: boolean }) {
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [pressed, setPressed] = useState(false);
  const state: PressState = { hovered, focused, pressed };
  const ext = external || /^(https?:|mailto:|tel:)/.test(href);
  return (
    <Link href={href as Href} asChild {...(ext && WEB ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={label}
        onHoverIn={() => setHovered(true)}
        onHoverOut={() => setHovered(false)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onPressIn={() => setPressed(true)}
        onPressOut={() => setPressed(false)}
        style={StyleSheet.flatten(style?.(state))}
      >
        {typeof children === 'function' ? children(state) : children}
      </Pressable>
    </Link>
  );
}

export function TextLink({ href, children, color = site.muted, hoverColor = site.text, size = 15, weight = '600' }: { href: string; children: string; color?: string; hoverColor?: string; size?: number; weight?: TextStyle['fontWeight'] }) {
  return (
    <SiteLink href={href} label={children} style={() => webStyle({ cursor: 'pointer' })}>
      {(s) => <Text style={{ fontFamily, color: s.hovered || s.focused ? hoverColor : color, fontSize: size, fontWeight: weight, ...webStyle({ transition: 'color 160ms ease' }) }}>{children}</Text>}
    </SiteLink>
  );
}

type BtnVariant = 'primary' | 'gold' | 'ghost' | 'outline';

export function CTAButton({ href, onPress, label, icon, variant = 'primary', size = 'md', full, disabled, center }: {
  href?: string; onPress?: () => void; label: string; icon?: IconName; variant?: BtnVariant; size?: 'md' | 'lg' | 'sm'; full?: boolean; disabled?: boolean; center?: boolean;
}) {
  const pad = size === 'lg' ? { paddingVertical: 17, paddingHorizontal: 28 } : size === 'sm' ? { paddingVertical: 9, paddingHorizontal: 16 } : { paddingVertical: 13, paddingHorizontal: 22 };
  const fs = size === 'lg' ? 16.5 : size === 'sm' ? 14 : 15;
  const fg = variant === 'gold' ? '#1A1206' : variant === 'primary' ? '#FFFFFF' : site.text;
  const bgFor = (h: boolean) => ({
    primary: h ? '#5AA8F0' : site.blue,
    gold: h ? '#E2AA55' : site.gold,
    ghost: h ? 'rgba(255,255,255,0.08)' : 'transparent',
    outline: h ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.03)',
  })[variant];
  const style = (s: PressState) => [
    {
      flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'center' as const, gap: 9, borderRadius: 999, ...pad,
      backgroundColor: bgFor(!!s.hovered && !disabled),
      borderWidth: 1,
      borderColor: variant === 'outline' ? site.lineStrong : variant === 'ghost' ? 'transparent' : 'rgba(255,255,255,0.18)',
      opacity: disabled ? 0.55 : s.pressed ? 0.85 : 1,
      alignSelf: full ? ('stretch' as const) : center ? ('center' as const) : ('flex-start' as const),
      transform: [{ translateY: s.hovered && !disabled ? -1 : 0 }],
    },
    webStyle({
      cursor: disabled ? 'not-allowed' : 'pointer',
      transition: 'background-color 180ms ease, transform 180ms ease, box-shadow 180ms ease',
      boxShadow: variant === 'primary' ? `0 10px 30px -10px rgba(70,152,225,${s.hovered ? 0.85 : 0.6})` : variant === 'gold' ? `0 10px 30px -10px rgba(211,153,67,${s.hovered ? 0.8 : 0.55})` : 'none',
      outlineColor: site.goldText,
    }),
  ];
  const content = (
    <>
      <Text style={{ fontFamily, color: fg, fontSize: fs, fontWeight: '700', letterSpacing: -0.1 }}>{label}</Text>
      {icon ? <Ionicons name={icon} size={fs + 2} color={fg} /> : null}
    </>
  );
  if (href && !disabled) return <SiteLink href={href} label={label} style={style}>{content}</SiteLink>;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} style={style as never}>
      {content}
    </Pressable>
  );
}

/** Frosted, softly bordered card. Lifts on hover when `hover` is set. */
export function Glass({ children, style, hover, padding = 28 }: { children: ReactNode; style?: StyleProp<ViewStyle>; hover?: boolean; padding?: number }) {
  const base: ViewStyle = { backgroundColor: site.panel, borderWidth: 1, borderColor: site.line, borderRadius: 22, padding };
  const blur = webStyle({ backdropFilter: 'blur(18px)', WebkitBackdropFilter: 'blur(18px)', transition: 'transform 220ms ease, border-color 220ms ease, box-shadow 220ms ease' });
  if (!hover) return <View style={[base, blur, style]}>{children}</View>;
  return (
    <Pressable
      accessible={false}
      focusable={false}
      style={((s: PressState) => [
        base, blur,
        s.hovered ? { borderColor: 'rgba(138,201,247,0.32)', transform: [{ translateY: -3 }] } : null,
        s.hovered ? webStyle({ boxShadow: '0 24px 60px -30px rgba(70,152,225,0.55)', cursor: 'default' }) : webStyle({ cursor: 'default' }),
        style,
      ]) as never}
    >
      {children}
    </Pressable>
  );
}

export function IconBadge({ icon, tone = 'blue', size = 44 }: { icon: IconName; tone?: 'blue' | 'gold' | 'green'; size?: number }) {
  const c = tone === 'gold' ? site.gold : tone === 'green' ? colors.success : site.blue;
  return (
    <View style={{ width: size, height: size, borderRadius: size * 0.32, alignItems: 'center', justifyContent: 'center', backgroundColor: `${c}22`, borderWidth: 1, borderColor: `${c}44` }}>
      <Ionicons name={icon} size={size * 0.48} color={tone === 'gold' ? site.goldText : tone === 'green' ? colors.success : site.blueText} />
    </View>
  );
}

export function Pill({ label, tone = 'blue', icon }: { label: string; tone?: 'blue' | 'gold' | 'green' | 'neutral'; icon?: IconName }) {
  const c = tone === 'gold' ? site.goldText : tone === 'green' ? colors.success : tone === 'neutral' ? site.muted : site.blueText;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingVertical: 6, paddingHorizontal: 12, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: site.lineStrong }}>
      {icon ? <Ionicons name={icon} size={13} color={c} /> : null}
      <Text style={{ fontFamily, color: c, fontSize: 12.5, fontWeight: '700', letterSpacing: 0.2 }}>{label}</Text>
    </View>
  );
}

export function Check({ children, color = site.text, tone = 'blue' }: { children: ReactNode; color?: string; tone?: 'blue' | 'gold' }) {
  return (
    <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
      <Ionicons name="checkmark-circle" size={19} color={tone === 'gold' ? site.gold : site.blue} style={{ marginTop: 2 }} />
      <Text style={{ fontFamily, color, fontSize: 15, lineHeight: 23, flex: 1 }}>{children}</Text>
    </View>
  );
}

/** Ambient background: deep navy with blue/gold glows. Place as the first child of a relative container. */
export function Glow({ variant = 'hero' }: { variant?: 'hero' | 'band' | 'soft' }) {
  const id = `g-${variant}`;
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Svg width="100%" height="100%" preserveAspectRatio="none">
        <Defs>
          <LinearGradient id={`${id}-base`} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={variant === 'band' ? '#132037' : '#0E1626'} stopOpacity="1" />
            <Stop offset="1" stopColor={site.bg} stopOpacity="1" />
          </LinearGradient>
          <RadialGradient id={`${id}-blue`} cx="0.78" cy="0.18" rx="0.55" ry="0.55" fx="0.78" fy="0.18">
            <Stop offset="0" stopColor={site.blue} stopOpacity={variant === 'soft' ? 0.16 : 0.32} />
            <Stop offset="1" stopColor={site.blue} stopOpacity="0" />
          </RadialGradient>
          <RadialGradient id={`${id}-gold`} cx="0.12" cy="0.9" rx="0.5" ry="0.5" fx="0.12" fy="0.9">
            <Stop offset="0" stopColor={site.gold} stopOpacity={variant === 'soft' ? 0.08 : 0.18} />
            <Stop offset="1" stopColor={site.gold} stopOpacity="0" />
          </RadialGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${id}-base)`} />
        <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${id}-blue)`} />
        <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${id}-gold)`} />
      </Svg>
    </View>
  );
}

/** Text with a blue→gold gradient on web; solid gold-ish elsewhere. */
export function GradientText({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) {
  const web = WEB
    ? ({ backgroundImage: `linear-gradient(100deg, ${site.blueText} 0%, #FFFFFF 45%, ${site.goldText} 100%)`, WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' } as TextStyle)
    : { color: site.blueText };
  return <Text style={[style, web]}>{children}</Text>;
}

/** Splits text on [Fill-in fields] and highlights them in gold. */
export function RichText({ text, style }: { text: string; style?: StyleProp<TextStyle> }) {
  const parts = text.split(/(\[[^\]]+\])/g);
  return (
    <Text style={style}>
      {parts.map((p, i) =>
        /^\[[^\]]+\]$/.test(p) ? (
          <Text key={i} style={{ color: site.goldText, backgroundColor: 'rgba(211,153,67,0.12)', fontWeight: '700' }}>{p}</Text>
        ) : (
          <Text key={i}>{p}</Text>
        ),
      )}
    </Text>
  );
}

/** Responsive grid: `cols` columns, equal widths, `gap` gutters. */
export function Grid({ cols, gap = 20, children, style }: { cols: number; gap?: number; children: ReactNode[]; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -gap / 2, rowGap: gap }, style]}>
      {children.map((c, i) => (
        <View key={i} style={{ width: `${100 / cols}%`, paddingHorizontal: gap / 2 }}>
          {c}
        </View>
      ))}
    </View>
  );
}

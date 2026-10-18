// Page shell for the public website: <head> tags, sticky nav, scroll area, footer
// and in-page anchors (e.g. "Features" on the home page).
import Head from 'expo-router/head';
import { router, usePathname } from 'expo-router';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, Text, View, type LayoutChangeEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { APP_NAME } from '../../lib/config';
import { useSession } from '../../lib/session';
import { DEMO_HREF, FOOTER_LINKS, NAV_LINKS, SIGN_UP_HREF, SITE_TAGLINE } from '../../lib/site';
import { CTAButton, Container, Ionicons, P, SiteLink, TextLink, fontFamily, site, useBreakpoint, webStyle } from './primitives';
import { StoreBadges } from './StoreBadges';

type AnchorCtx = { register: (id: string) => (e: LayoutChangeEvent) => void; scrollTo: (id: string) => void };
const Anchors = createContext<AnchorCtx>({ register: () => () => {}, scrollTo: () => {} });

/** onLayout handler that lets the nav scroll to this section. Use on a direct child of the page. */
export const useAnchor = (id: string) => useContext(Anchors).register(id);

export function Logo({ size = 34 }: { size?: number }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <View
        style={[
          { width: size, height: size, borderRadius: size * 0.3, alignItems: 'center', justifyContent: 'center', backgroundColor: site.blue, borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)' },
          webStyle({ backgroundImage: `linear-gradient(135deg, ${site.blue} 0%, #2F5F9C 60%, ${site.gold} 140%)` }),
        ]}
      >
        <Ionicons name="airplane" size={size * 0.52} color="#FFFFFF" style={{ transform: [{ rotate: '-35deg' }] }} />
      </View>
      <Text style={{ fontFamily, color: site.text, fontSize: size * 0.56, fontWeight: '800', letterSpacing: -0.5 }}>{APP_NAME}</Text>
    </View>
  );
}

function Nav({ onAnchor }: { onAnchor: (id: string) => void }) {
  const { isMobile, isTablet } = useBreakpoint();
  const compact = isMobile || isTablet;
  const [open, setOpen] = useState(false);
  const { session } = useSession();
  const insets = useSafeAreaInsets();
  const pathname = usePathname();

  const go = (href: string) => {
    setOpen(false);
    const [path, hash] = href.split('#');
    if (hash) onAnchor(hash);
    else if (path && path !== pathname) router.push(path as never);
  };

  const links = NAV_LINKS.map((l) => {
    const active = !l.href.includes('#') && pathname === l.href;
    return { ...l, active };
  });

  return (
    <View style={{ zIndex: 50, paddingTop: insets.top }}>
      <View
        style={[
          { backgroundColor: 'rgba(11,16,26,0.82)', borderBottomWidth: 1, borderBottomColor: site.line },
          webStyle({ backdropFilter: 'saturate(160%) blur(18px)', WebkitBackdropFilter: 'saturate(160%) blur(18px)' }),
        ]}
      >
        <Container style={{ height: 68, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <SiteLink href="/welcome" label={`${APP_NAME} home`} style={() => webStyle({ cursor: 'pointer' })}>
            <Logo />
          </SiteLink>
          {compact ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              {!isMobile ? <CTAButton href={session ? '/' : SIGN_UP_HREF} label={session ? 'Open app' : 'Start free trial'} size="sm" /> : null}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={open ? 'Close menu' : 'Open menu'}
                accessibilityState={{ expanded: open }}
                onPress={() => setOpen((o) => !o)}
                style={{ width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: site.lineStrong }}
              >
                <Ionicons name={open ? 'close' : 'menu'} size={22} color={site.text} />
              </Pressable>
            </View>
          ) : (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 30 }}>
              {links.map((l) => (
                <NavItem key={l.label} label={l.label} active={l.active} onPress={() => go(l.href)} href={l.href.includes('#') ? undefined : l.href} />
              ))}
              <View style={{ width: 1, height: 22, backgroundColor: site.lineStrong }} />
              {session ? (
                <CTAButton href="/" label="Open app" size="sm" icon="arrow-forward" />
              ) : (
                <>
                  <TextLink href="/sign-in">Sign in</TextLink>
                  <CTAButton href={SIGN_UP_HREF} label="Start free trial" size="sm" />
                </>
              )}
            </View>
          )}
        </Container>
      </View>
      {compact && open ? (
        <View
          style={[
            { position: 'absolute', left: 0, right: 0, top: insets.top + 68, backgroundColor: 'rgba(11,16,26,0.97)', borderBottomWidth: 1, borderBottomColor: site.line, paddingVertical: 12 },
            webStyle({ backdropFilter: 'blur(18px)', boxShadow: '0 30px 60px -20px rgba(0,0,0,0.6)' }),
          ]}
        >
          <Container style={{ gap: 4 }}>
            {[...links, ...(session ? [] : [{ label: 'Sign in', href: '/sign-in', active: false }]), { label: 'Explore the demo', href: DEMO_HREF, active: false }].map((l) => (
              <Pressable
                key={l.label}
                accessibilityRole="link"
                onPress={() => go(l.href)}
                style={({ pressed }) => ({ paddingVertical: 14, paddingHorizontal: 4, borderBottomWidth: 1, borderBottomColor: site.line, opacity: pressed ? 0.7 : 1, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' })}
              >
                <Text style={{ fontFamily, color: l.active ? site.blueText : site.text, fontSize: 18, fontWeight: '700' }}>{l.label}</Text>
                <Ionicons name="chevron-forward" size={18} color={site.faint} />
              </Pressable>
            ))}
            <View style={{ paddingTop: 16, paddingBottom: 8 }}>
              <CTAButton href={session ? '/' : SIGN_UP_HREF} label={session ? 'Open app' : 'Start your 14-day free trial'} full />
            </View>
          </Container>
        </View>
      ) : null}
    </View>
  );
}

function NavItem({ label, active, onPress, href }: { label: string; active: boolean; onPress: () => void; href?: string }) {
  if (href) return <TextLink href={href} color={active ? site.text : site.muted}>{label}</TextLink>;
  return (
    <Pressable accessibilityRole="link" onPress={onPress} style={webStyle({ cursor: 'pointer' })}>
      {(s) => <Text style={{ fontFamily, color: (s as { hovered?: boolean }).hovered ? site.text : site.muted, fontSize: 15, fontWeight: '600' }}>{label}</Text>}
    </Pressable>
  );
}

function Footer() {
  const { isMobile } = useBreakpoint();
  const year = new Date().getFullYear();
  return (
    <View style={{ borderTopWidth: 1, borderTopColor: site.line, backgroundColor: '#090D15', paddingTop: 56, paddingBottom: 40 }}>
      <Container>
        <View style={{ flexDirection: isMobile ? 'column' : 'row', justifyContent: 'space-between', gap: 32 }}>
          <View style={{ maxWidth: 380, gap: 14 }}>
            <Logo size={30} />
            <P size="sm">{SITE_TAGLINE}. FAA autofill, AI condition reports, SOPs, scheduling, quotes, payments and true job costing — in one clear view.</P>
            <StoreBadges compact />
          </View>
          <View style={{ flexDirection: 'row', gap: 56, flexWrap: 'wrap' }}>
            <View style={{ gap: 12 }}>
              <Text style={{ fontFamily, color: site.faint, fontSize: 12, fontWeight: '800', letterSpacing: 1.6 }}>PRODUCT</Text>
              <TextLink href="/welcome" size={14}>Overview</TextLink>
              <TextLink href="/pricing" size={14}>Pricing</TextLink>
              <TextLink href={DEMO_HREF} size={14}>Explore the demo</TextLink>
              <TextLink href={SIGN_UP_HREF} size={14}>Start free trial</TextLink>
            </View>
            <View style={{ gap: 12 }}>
              <Text style={{ fontFamily, color: site.faint, fontSize: 12, fontWeight: '800', letterSpacing: 1.6 }}>COMPANY</Text>
              {FOOTER_LINKS.map((l) => <TextLink key={l.href} href={l.href} size={14}>{l.label}</TextLink>)}
            </View>
          </View>
        </View>
        <View style={{ marginTop: 44, paddingTop: 24, borderTopWidth: 1, borderTopColor: site.line, flexDirection: isMobile ? 'column' : 'row', justifyContent: 'space-between', gap: 12 }}>
          <Text style={{ fontFamily, color: site.faint, fontSize: 13 }}>© {year} {APP_NAME}. All rights reserved.</Text>
          <View style={{ flexDirection: 'row', gap: 20, flexWrap: 'wrap' }}>
            {FOOTER_LINKS.map((l) => <TextLink key={l.href} href={l.href} size={13} color={site.faint}>{l.label}</TextLink>)}
          </View>
        </View>
      </Container>
    </View>
  );
}

export function SitePage({ title, description, children, footer = true, initialSection }: { title: string; description: string; children: ReactNode; footer?: boolean; initialSection?: string }) {
  const scroll = useRef<ScrollView>(null);
  const positions = useRef<Record<string, number>>({});
  const pending = useRef<string | null>(null);
  const pathname = usePathname();

  const scrollTo = useCallback((id: string) => {
    const y = positions.current[id];
    if (y == null) {
      pending.current = id;
      if (pathname !== '/welcome') router.push(`/welcome?section=${id}` as never);
      return;
    }
    scroll.current?.scrollTo({ y: Math.max(0, y - 8), animated: true });
  }, [pathname]);

  const register = useCallback((id: string) => (e: LayoutChangeEvent) => {
    positions.current[id] = e.nativeEvent.layout.y;
    if (pending.current === id) {
      pending.current = null;
      setTimeout(() => scroll.current?.scrollTo({ y: Math.max(0, e.nativeEvent.layout.y - 8), animated: true }), 50);
    }
  }, []);

  // Arriving from another page via /welcome?section=features.
  useEffect(() => {
    if (initialSection) scrollTo(initialSection);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialSection]);

  const ctx = useMemo(() => ({ register, scrollTo }), [register, scrollTo]);
  const fullTitle = title === APP_NAME ? `${APP_NAME} — ${SITE_TAGLINE}` : `${title} · ${APP_NAME}`;

  return (
    <Anchors.Provider value={ctx}>
      <Head>
        <title>{fullTitle}</title>
        <meta name="description" content={description} />
        <meta property="og:title" content={fullTitle} />
        <meta property="og:description" content={description} />
        <meta property="og:type" content="website" />
        <meta name="theme-color" content={site.bg} />
      </Head>
      <View style={{ flex: 1, backgroundColor: site.bg }}>
        <Nav onAnchor={scrollTo} />
        <ScrollView ref={scroll} style={{ flex: 1, backgroundColor: site.bg }} contentContainerStyle={{ flexGrow: 1 }}>
          {children}
          {footer ? <Footer /> : null}
        </ScrollView>
      </View>
    </Anchors.Provider>
  );
}

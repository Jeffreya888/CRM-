import { Text, View } from 'react-native';
import { SitePage } from '../../components/site/SitePage';
import {
  CTAButton, Check, Container, Eyebrow, Glass, Glow, GradientText, Grid, Heading, IconBadge, Ionicons, P, Section, SectionIntro,
  fontFamily, site, useBreakpoint,
} from '../../components/site/primitives';
import { APP_NAME } from '../../lib/config';
import { DEMO_HREF, ENTERPRISE_HREF, FRANCHISE_FEATURES, FRANCHISE_WALLS, PRELAUNCH } from '../../lib/site';

/** Franchise brands: Franchise HQ on top of each franchisee's own Tarmo. */
export default function Franchises() {
  const { isMobile, isDesktop, isTablet } = useBreakpoint();
  return (
    <SitePage title="Franchise software for detailing brands"
      description={`${APP_NAME} Franchise HQ: see every location side by side, push SOPs and prices, route leads by territory, and send royalty statements, while each franchisee keeps its own books.`}>
      <View style={{ position: 'relative', overflow: 'hidden' }}>
        <Glow variant="hero" />
        <Container style={{ paddingTop: isMobile ? 40 : 84, paddingBottom: isMobile ? 48 : 88 }}>
          <View style={{ flexDirection: isDesktop ? 'row' : 'column', gap: isDesktop ? 56 : 36, alignItems: isDesktop ? 'center' : 'stretch' }}>
            <View style={{ flex: isDesktop ? 1 : undefined, maxWidth: 600 }}>
              <Eyebrow>Franchise HQ</Eyebrow>
              <Heading level={1}>
                Many owners. <GradientText>One standard.</GradientText>
              </Heading>
              <P size="lg" style={{ marginTop: 18 }}>
                Built for aircraft, marine and auto detailing franchises. Every franchisee runs their business on {APP_NAME}; HQ sees every location
                side by side, sets the standards, routes the leads and sends the royalty statements.
              </P>
              <View style={{ flexDirection: isMobile ? 'column' : 'row', gap: 12, marginTop: 28 }}>
                <CTAButton href={ENTERPRISE_HREF} label="Talk to us" icon="arrow-forward" size="lg" full={isMobile} />
                {!PRELAUNCH ? <CTAButton href={DEMO_HREF} label="Explore the demo" icon="play-circle-outline" variant="outline" size="lg" full={isMobile} /> : null}
              </View>
            </View>
            <HqPreview />
          </View>
        </Container>
      </View>

      <Section>
        <SectionIntro eyebrow="What HQ gets" title="Run the whole network from one screen." body="Everything a franchisor needs to grow the brand without losing the standard that built it." />
        <Grid cols={isMobile ? 1 : isTablet ? 2 : 4} gap={isMobile ? 16 : 20}>
          {FRANCHISE_FEATURES.map((f) => (
            <Glass key={f.title} hover style={{ flex: 1 }} padding={24}>
              <IconBadge icon={f.icon} tone={f.tone} />
              <Heading level={3} style={{ marginTop: 16 }}>{f.title}</Heading>
              <P size="sm" style={{ marginTop: 8 }}>{f.body}</P>
            </Glass>
          ))}
        </Grid>
      </Section>

      <Section tint>
        <View style={{ flexDirection: isDesktop ? 'row' : 'column', gap: isDesktop ? 64 : 32, alignItems: isDesktop ? 'center' : 'stretch' }}>
          <View style={{ flex: isDesktop ? 1 : undefined }}>
            <Eyebrow>For franchisees</Eyebrow>
            <Heading level={2}>Their business stays theirs.</Heading>
            <P size="lg" style={{ marginTop: 16 }}>
              Franchisees join your network with an invite code and keep full ownership of their customers and money. That&apos;s what makes owners
              say yes, and it keeps HQ focused on standards and growth instead of each location&apos;s day-to-day records.
            </P>
          </View>
          <View style={{ flex: isDesktop ? 1 : undefined, gap: 14 }}>
            {FRANCHISE_WALLS.map((w) => (
              <Glass key={w} padding={18} style={{ flexDirection: 'row', gap: 14, alignItems: 'flex-start' }}>
                <IconBadge icon="shield-checkmark-outline" tone="green" size={38} />
                <Text style={{ fontFamily, color: site.text, fontSize: 15, lineHeight: 22, flex: 1 }}>{w}</Text>
              </Glass>
            ))}
          </View>
        </View>
      </Section>

      <Section>
        <Glass padding={isMobile ? 26 : 44} style={{ alignItems: 'center' }}>
          <Eyebrow center>Enterprise &amp; franchise</Eyebrow>
          <Heading level={2} center>Pricing built around your network.</Heading>
          <P size="lg" center style={{ marginTop: 14, maxWidth: 680 }}>
            Franchisees subscribe at network pricing, or HQ covers every location on one bill. Either way HQ gets Franchise HQ, onboarding for every crew and help moving your data.
            Tell us about your brand and we&apos;ll put together a plan.
          </P>
          <View style={{ marginTop: 22, gap: 10, alignSelf: 'center' }}>
            <Check>Aviation, marine and auto detailing brands</Check>
            <Check>Works for 3 locations or 300</Check>
            <Check>Your SOPs and prices loaded for you</Check>
          </View>
          <View style={{ marginTop: 26 }}>
            <CTAButton href={ENTERPRISE_HREF} label="Talk to us" icon="arrow-forward" size="lg" />
          </View>
        </Glass>
      </Section>
    </SitePage>
  );
}

/** A static picture of the HQ dashboard: totals, a benchmark and a location leaderboard. */
function HqPreview() {
  const { isMobile, isDesktop } = useBreakpoint();
  const rows = [
    { name: 'Houston', revenue: '$51.9k', close: '80%', qc: '100%' },
    { name: 'Scottsdale', revenue: '$29.2k', close: '50%', qc: '100%' },
    { name: 'Dallas', revenue: '$28.9k', close: '60%', qc: '90%' },
    { name: 'Austin', revenue: '$7.6k', close: '20%', qc: '70%' },
  ];
  return (
    <Glass padding={isMobile ? 18 : 24} style={{ flex: isDesktop ? 1 : undefined, maxWidth: 560, width: '100%' as any, alignSelf: 'center' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <IconBadge icon="git-network-outline" tone="blue" size={36} />
        <View style={{ flex: 1 }}>
          <Text style={{ fontFamily, color: site.text, fontSize: 16, fontWeight: '800' }}>Network · October</Text>
          <Text style={{ fontFamily, color: site.muted, fontSize: 12.5 }}>Royalty 6% · Marketing fund 2%</Text>
        </View>
      </View>
      <View style={{ flexDirection: 'row', gap: 10, marginBottom: 14 }}>
        {[['Revenue', '$117.5k'], ['Close rate', '62%'], ['QC pass', '93%']].map(([k, v]) => (
          <View key={k} style={{ flex: 1, padding: 12, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: site.line }}>
            <Text style={{ fontFamily, color: site.muted, fontSize: 12 }}>{k}</Text>
            <Text style={{ fontFamily, color: site.text, fontSize: 19, fontWeight: '800', marginTop: 2 }}>{v}</Text>
          </View>
        ))}
      </View>
      <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', padding: 10, borderRadius: 10, backgroundColor: 'rgba(211,153,67,0.12)', marginBottom: 12 }}>
        <Ionicons name="alert-circle-outline" size={16} color={site.goldText} />
        <Text style={{ fontFamily, color: site.goldText, fontSize: 13, flex: 1 }}>Austin: QC pass rate 70% vs 93% network</Text>
      </View>
      {rows.map((r, i) => (
        <View key={r.name} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 9, borderTopWidth: i ? 1 : 0, borderTopColor: site.line }}>
          <Text style={{ fontFamily, color: site.faint, fontSize: 13, fontWeight: '800', width: 28 }}>#{i + 1}</Text>
          <Text style={{ fontFamily, color: site.text, fontSize: 14.5, fontWeight: '700', flex: 1 }}>{r.name}</Text>
          <Text style={{ fontFamily, color: site.text, fontSize: 14, fontWeight: '700', width: 72, textAlign: 'right' }}>{r.revenue}</Text>
          <Text style={{ fontFamily, color: site.muted, fontSize: 13, width: 58, textAlign: 'right' }}>{r.close}</Text>
          <Text style={{ fontFamily, color: site.muted, fontSize: 13, width: 52, textAlign: 'right' }}>{r.qc}</Text>
        </View>
      ))}
      <Text style={{ fontFamily, color: site.faint, fontSize: 11.5, marginTop: 8 }}>Sample data</Text>
    </Glass>
  );
}

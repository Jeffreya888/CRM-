import { Text, View } from 'react-native';
import { Faq } from '../../components/site/Faq';
import { SitePage } from '../../components/site/SitePage';
import { SupportForm } from '../../components/site/SupportForm';
import {
  CTAButton, Container, Eyebrow, Glass, Glow, GradientText, Grid, Heading, IconBadge, Ionicons, P, Section, SectionIntro, SiteLink,
  fontFamily, site, useBreakpoint, webStyle, type IconName,
} from '../../components/site/primitives';
import { APP_NAME, SUPPORT_EMAIL } from '../../lib/config';
import { DEMO_HREF, GETTING_STARTED, SUPPORT_FAQ, TROUBLESHOOTING } from '../../lib/site';

export default function Support() {
  const { isMobile, isDesktop } = useBreakpoint();
  return (
    <SitePage title="Support" description={`Get help with ${APP_NAME}: contact support, follow the getting-started guide, and find answers about billing, cancelling, data export and texting.`}>
      <View style={{ position: 'relative', overflow: 'hidden' }}>
        <Glow variant="hero" />
        <Container style={{ paddingTop: isMobile ? 44 : 88, paddingBottom: isMobile ? 40 : 72 }}>
          <Eyebrow>Support</Eyebrow>
          <Heading level={1} style={{ maxWidth: 820 }}>
            Help that keeps your crew <GradientText>moving.</GradientText>
          </Heading>
          <P size="lg" style={{ marginTop: 18, maxWidth: 640 }}>
            Get set up in an afternoon, find quick answers, or send us a note. A real person reads every message.
          </P>
          <View style={{ flexDirection: isMobile ? 'column' : 'row', gap: 12, marginTop: 30 }}>
            <SiteLink
              href={`mailto:${SUPPORT_EMAIL}`}
              label={`Email ${SUPPORT_EMAIL}`}
              style={(s) => [
                { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 16, borderRadius: 16, borderWidth: 1, borderColor: s.hovered ? 'rgba(138,201,247,0.4)' : site.lineStrong, backgroundColor: 'rgba(255,255,255,0.04)' },
                webStyle({ cursor: 'pointer', transition: 'border-color 160ms ease' }),
              ]}
            >
              <Ionicons name="mail-outline" size={22} color={site.blueText} />
              <View>
                <Text style={{ fontFamily, color: site.faint, fontSize: 12, fontWeight: '700' }}>EMAIL SUPPORT</Text>
                <Text style={{ fontFamily, color: site.text, fontSize: 16, fontWeight: '700' }}>{SUPPORT_EMAIL}</Text>
              </View>
            </SiteLink>
            <CTAButton href={DEMO_HREF} label="Explore the demo" icon="play-circle-outline" variant="outline" size="lg" full={isMobile} />
          </View>
        </Container>
      </View>

      <Section>
        <SectionIntro eyebrow="Getting started" title="Your first seven steps." body="Follow these in order and you’ll have quoted, completed and invoiced your first job — usually in a single afternoon." center={false} />
        <Grid cols={isDesktop ? 2 : 1} gap={isMobile ? 12 : 18}>
          {GETTING_STARTED.map((s, i) => (
            <Glass key={s.title} hover padding={isMobile ? 20 : 24} style={{ flex: 1, flexDirection: 'row', gap: 18, alignItems: 'flex-start' }}>
              <View style={{ alignItems: 'center', gap: 10 }}>
                <View style={[{ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: site.blue }, webStyle({ backgroundImage: `linear-gradient(135deg, ${site.blue}, #2F5F9C)` })]}>
                  <Text style={{ fontFamily, color: '#FFFFFF', fontSize: 16, fontWeight: '800' }}>{i + 1}</Text>
                </View>
              </View>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Ionicons name={s.icon} size={17} color={site.goldText} />
                  <Heading level={3} style={{ fontSize: 18, flex: 1 }}>{s.title}</Heading>
                </View>
                <P size="sm" style={{ marginTop: 6 }}>{s.body}</P>
              </View>
            </Glass>
          ))}
        </Grid>
      </Section>

      <Section tint>
        <View style={{ flexDirection: isDesktop ? 'row' : 'column', gap: isDesktop ? 48 : 28, alignItems: 'flex-start' }}>
          <View style={{ flex: isDesktop ? 0.8 : undefined, width: isDesktop ? undefined : '100%' }}>
            <Eyebrow>Contact</Eyebrow>
            <Heading level={2}>Talk to us.</Heading>
            <P size="lg" style={{ marginTop: 14 }}>
              Questions about setup, billing or a feature you need? Send a message and we’ll reply by email.
            </P>
            <View style={{ gap: 14, marginTop: 26 }}>
              <InfoRow icon="mail-outline" title="Email" body={SUPPORT_EMAIL} />
              <InfoRow icon="card-outline" title="Billing" body="Subscribed on the web? Manage or cancel in Settings → Manage billing. Subscribed in the app? Apple or Google bills you; manage it in your store account settings." />
              <InfoRow icon="shield-checkmark-outline" title="Your privacy" body="We’ll never ask for your password or verification codes." />
            </View>
          </View>
          <View style={{ flex: isDesktop ? 1.2 : undefined, width: isDesktop ? undefined : '100%' }}>
            <SupportForm />
          </View>
        </View>
      </Section>

      <Section>
        <SectionIntro eyebrow="Troubleshooting" title="Quick fixes for common snags." />
        <Grid cols={isMobile ? 1 : 2} gap={isMobile ? 12 : 18}>
          {TROUBLESHOOTING.map((t) => (
            <Glass key={t.title} padding={24} style={{ flex: 1, flexDirection: 'row', gap: 16 }}>
              <IconBadge icon={t.icon} tone="gold" />
              <View style={{ flex: 1 }}>
                <Heading level={3} style={{ fontSize: 18 }}>{t.title}</Heading>
                <P size="sm" style={{ marginTop: 6 }}>{t.body}</P>
              </View>
            </Glass>
          ))}
        </Grid>
      </Section>

      <Section tint>
        <SectionIntro eyebrow="FAQ" title="Frequently asked questions." />
        <Faq items={SUPPORT_FAQ} />
        <View style={{ alignItems: 'center', marginTop: 40 }}>
          <CTAButton center href="/pricing" label="See plans & pricing" variant="outline" icon="arrow-forward" />
        </View>
      </Section>
    </SitePage>
  );
}

function InfoRow({ icon, title, body }: { icon: IconName; title: string; body: string }) {
  return (
    <View style={{ flexDirection: 'row', gap: 14, alignItems: 'flex-start' }}>
      <IconBadge icon={icon} size={40} />
      <View style={{ flex: 1 }}>
        <Text style={{ fontFamily, color: site.text, fontSize: 15, fontWeight: '700' }}>{title}</Text>
        <P size="sm">{body}</P>
      </View>
    </View>
  );
}

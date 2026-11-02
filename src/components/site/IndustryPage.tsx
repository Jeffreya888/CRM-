// One-industry landing page (aviation, marine): speaks only to that kind of
// detailer, so the link in ads, emails and posts never shows car or boat tools
// to an aircraft detailer (or the other way around).
import { View } from 'react-native';
import { SitePage } from './SitePage';
import {
  CTAButton, Check, Container, Eyebrow, Glass, Glow, GradientText, Grid, Heading, IconBadge, P, Section, SectionIntro, useBreakpoint, type IconName,
} from './primitives';
import { PRELAUNCH, SIGN_UP_HREF, TRIAL_CTA } from '../../lib/site';

export type Industry = {
  title: string;
  description: string;
  eyebrow: string;
  headline: string;
  highlight: string;
  intro: string;
  proof: string[];
  features: { icon: IconName; title: string; body: string }[];
  onlyTitle: string;
  onlyBody: string;
};

export function IndustryPage({ x }: { x: Industry }) {
  const { isMobile, isTablet, isDesktop } = useBreakpoint();
  return (
    <SitePage title={x.title} description={x.description}>
      <View style={{ position: 'relative', overflow: 'hidden' }}>
        <Glow variant="hero" />
        <Container style={{ paddingTop: isMobile ? 44 : 96, paddingBottom: isMobile ? 48 : 88, alignItems: isDesktop ? 'flex-start' : 'center' }}>
          <Eyebrow center={!isDesktop}>{x.eyebrow}</Eyebrow>
          <Heading level={1} center={!isDesktop} style={{ maxWidth: 900 }}>
            {x.headline} <GradientText>{x.highlight}</GradientText>
          </Heading>
          <P size="lg" center={!isDesktop} style={{ marginTop: 20, maxWidth: 680 }}>{x.intro}</P>
          <View style={{ flexDirection: isMobile ? 'column' : 'row', gap: 12, marginTop: 30, alignSelf: isMobile ? 'stretch' : isDesktop ? 'flex-start' : 'center' }}>
            <CTAButton href={SIGN_UP_HREF} label={TRIAL_CTA} icon="arrow-forward" size="lg" full={isMobile} />
            <CTAButton href="/pricing" label="See pricing" variant="outline" size="lg" full={isMobile} />
          </View>
          <View style={{ flexDirection: isMobile ? 'column' : 'row', flexWrap: 'wrap', gap: isMobile ? 10 : 24, marginTop: 28 }}>
            {x.proof.map((p) => <Check key={p} tone="gold">{p}</Check>)}
          </View>
        </Container>
      </View>

      <Section>
        <SectionIntro eyebrow="What you get" title="Everything you need. Nothing you don’t." />
        <Grid cols={isMobile ? 1 : isTablet ? 2 : 3} gap={isMobile ? 16 : 20}>
          {x.features.map((f) => (
            <Glass key={f.title} hover style={{ flex: 1 }} padding={26}>
              <IconBadge icon={f.icon} tone="gold" />
              <Heading level={3} style={{ marginTop: 18, fontSize: 20 }}>{f.title}</Heading>
              <P size="sm" style={{ marginTop: 8 }}>{f.body}</P>
            </Glass>
          ))}
        </Grid>
      </Section>

      <Section tint>
        <View style={{ maxWidth: 820, alignSelf: 'center', alignItems: 'center' }}>
          <IconBadge icon="options-outline" tone="blue" size={56} />
          <Heading level={2} center style={{ marginTop: 20 }}>{x.onlyTitle}</Heading>
          <P size="lg" center style={{ marginTop: 14 }}>{x.onlyBody}</P>
          <View style={{ marginTop: 28 }}>
            <CTAButton center href={SIGN_UP_HREF} label={TRIAL_CTA} icon="arrow-forward" size="lg" variant="gold" />
          </View>
          {PRELAUNCH ? <P size="sm" center style={{ marginTop: 14 }}>Founding members get their first year at a lower price.</P> : null}
        </View>
      </Section>
    </SitePage>
  );
}

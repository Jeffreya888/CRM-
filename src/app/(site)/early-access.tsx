import { Text, View } from 'react-native';
import { EarlyAccessForm } from '../../components/site/EarlyAccessForm';
import { SitePage } from '../../components/site/SitePage';
import { Check, Container, Eyebrow, Glow, GradientText, Heading, P, fontFamily, site, useBreakpoint } from '../../components/site/primitives';
import { APP_NAME, APP_TAGLINE } from '../../lib/config';
import { FOUNDING, PLANS } from '../../lib/plans';

export default function EarlyAccess() {
  const { isMobile, isDesktop } = useBreakpoint();
  return (
    <SitePage title="Early access" description={`Join the ${APP_NAME} early access list. ${APP_TAGLINE}`}>
      <View style={{ position: 'relative', overflow: 'hidden' }}>
        <Glow variant="hero" />
        <Container style={{ paddingTop: isMobile ? 40 : 84, paddingBottom: isMobile ? 56 : 104 }}>
          <View style={{ flexDirection: isDesktop ? 'row' : 'column', gap: isDesktop ? 56 : 32, alignItems: isDesktop ? 'flex-start' : 'stretch' }}>
            <View style={{ flex: isDesktop ? 1 : undefined, maxWidth: 520 }}>
              <Eyebrow>Early access</Eyebrow>
              <Heading level={1}>
                Be first on <GradientText>Tarmo.</GradientText>
              </Heading>
              <P size="lg" style={{ marginTop: 18 }}>{APP_TAGLINE} Join the list and we’ll email you the day it opens, with your founding member offer.</P>
              <View style={{ marginTop: 26, gap: 12 }}>
                <Check>AI photo quotes with built-in pricing for aircraft, boats and cars</Check>
                <Check>Step-by-step SOPs and an AI assistant that knows them</Check>
                <Check>Scheduling, invoices, card payments and true job profit in one app</Check>
              </View>
              <View style={{ marginTop: 28, padding: 18, borderRadius: 16, backgroundColor: 'rgba(211,153,67,0.12)', borderWidth: 1, borderColor: 'rgba(211,153,67,0.35)', gap: 10 }}>
                <Text style={{ fontFamily, color: site.goldText, fontSize: 12, fontWeight: '800', letterSpacing: 1.4 }}>FOUNDING MEMBER OFFER</Text>
                {PLANS.map((p) => (
                  <View key={p.id} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
                    <Text style={{ fontFamily, color: site.text, fontSize: 16, fontWeight: '700' }}>{p.name}</Text>
                    <Text style={{ fontFamily, color: site.muted, fontSize: 15 }}>
                      <Text style={{ color: site.text, fontWeight: '800' }}>${FOUNDING.monthly[p.id].toFixed(2)}/mo</Text>
                      {'  '}<Text style={{ textDecorationLine: 'line-through' }}>${p.monthly.toFixed(2)}</Text>
                    </Text>
                  </View>
                ))}
                <Text style={{ fontFamily, color: site.muted, fontSize: 13.5, lineHeight: 19 }}>
                  Your first {FOUNDING.months} months at the founding price when you subscribe within {FOUNDING.windowDays} days of launch. Then regular pricing. Cancel anytime.
                </Text>
              </View>
            </View>
            <View style={{ flex: isDesktop ? 1 : undefined }}>
              <EarlyAccessForm />
            </View>
          </View>
        </Container>
      </View>
    </SitePage>
  );
}

import { View } from 'react-native';
import { EarlyAccessForm } from '../../components/site/EarlyAccessForm';
import { SitePage } from '../../components/site/SitePage';
import { Check, Container, Eyebrow, Glow, GradientText, Heading, P, useBreakpoint } from '../../components/site/primitives';
import { APP_NAME, APP_TAGLINE } from '../../lib/config';

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
              <P size="lg" style={{ marginTop: 18 }}>{APP_TAGLINE} Join the list and we’ll email you the day it opens.</P>
              <View style={{ marginTop: 26, gap: 12 }}>
                <Check>AI photo quotes with built-in pricing for aircraft, boats and cars</Check>
                <Check>Step-by-step SOPs and an AI assistant that knows them</Check>
                <Check>Scheduling, invoices, card payments and true job profit in one app</Check>
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

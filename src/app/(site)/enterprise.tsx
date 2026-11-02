import { View } from 'react-native';
import { EnterpriseForm } from '../../components/site/EnterpriseForm';
import { SitePage } from '../../components/site/SitePage';
import { Check, Container, Eyebrow, Glow, GradientText, Heading, P, useBreakpoint } from '../../components/site/primitives';
import { APP_NAME } from '../../lib/config';
import { ENTERPRISE_POINTS } from '../../lib/site';

export default function Enterprise() {
  const { isMobile, isDesktop } = useBreakpoint();
  return (
    <SitePage title="Enterprise" description={`${APP_NAME} Enterprise: custom pricing for national detailing networks, franchise systems and FBO chains.`}>
      <View style={{ position: 'relative', overflow: 'hidden' }}>
        <Glow variant="hero" />
        <Container style={{ paddingTop: isMobile ? 40 : 84, paddingBottom: isMobile ? 56 : 104 }}>
          <View style={{ flexDirection: isDesktop ? 'row' : 'column', gap: isDesktop ? 56 : 32, alignItems: isDesktop ? 'flex-start' : 'stretch' }}>
            <View style={{ flex: isDesktop ? 1 : undefined, maxWidth: 540 }}>
              <Eyebrow>Enterprise</Eyebrow>
              <Heading level={1}>
                One standard at <GradientText>every location.</GradientText>
              </Heading>
              <P size="lg" style={{ marginTop: 18 }}>
                For national detailing networks, franchise systems and FBO chains. Every crew works from the same SOPs and prices, and you see every location in one place. Pricing is built around your operation.
              </P>
              <View style={{ marginTop: 26, gap: 12 }}>
                {ENTERPRISE_POINTS.map((p) => <Check key={p}>{p}</Check>)}
              </View>
            </View>
            <View style={{ flex: isDesktop ? 1 : undefined }}>
              <EnterpriseForm />
            </View>
          </View>
        </Container>
      </View>
    </SitePage>
  );
}

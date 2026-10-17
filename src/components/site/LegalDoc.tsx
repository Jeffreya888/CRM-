// Renders a legal document (privacy policy, terms) with a table of contents.
import { Platform, Pressable, Text, View } from 'react-native';
import { SUPPORT_EMAIL } from '../../lib/config';
import { Container, Eyebrow, Glass, Glow, Heading, P, RichText, SiteLink, fontFamily, site, useBreakpoint, webStyle } from './primitives';

export type LegalBlock = string | string[];
export type LegalSection = { title: string; body: LegalBlock[] };

const fill = (s: string) => s.replace(/\{email\}/g, SUPPORT_EMAIL);

function jump(i: number) {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return;
  document.getElementById(`legal-${i}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

export function LegalDoc({ eyebrow, title, intro, sections }: { eyebrow: string; title: string; intro: string[]; sections: LegalSection[] }) {
  const { isMobile, isDesktop } = useBreakpoint();
  const text = { fontFamily, color: '#C9D1DD', fontSize: 16, lineHeight: 27 } as const;

  return (
    <View>
      <View style={{ position: 'relative', overflow: 'hidden' }}>
        <Glow variant="soft" />
        <Container style={{ paddingTop: isMobile ? 40 : 80, paddingBottom: isMobile ? 32 : 48 }}>
          <Eyebrow>{eyebrow}</Eyebrow>
          <Heading level={1} style={{ fontSize: isMobile ? 36 : 56, lineHeight: isMobile ? 40 : 60 }}>{title}</Heading>
          <RichText text="Last updated [Effective date]" style={{ fontFamily, color: site.muted, fontSize: 15, marginTop: 14 }} />
        </Container>
      </View>
      <Container style={{ paddingBottom: isMobile ? 56 : 96 }}>
        <View style={{ flexDirection: isDesktop ? 'row' : 'column', gap: 48, alignItems: 'flex-start' }}>
          {isDesktop ? (
            <View style={[{ width: 260 }, webStyle({ position: 'sticky', top: 24 })]}>
              <Text style={{ fontFamily, color: site.faint, fontSize: 12, fontWeight: '800', letterSpacing: 1.6, marginBottom: 12 }}>ON THIS PAGE</Text>
              {sections.map((s, i) => (
                <Pressable key={s.title} accessibilityRole="link" onPress={() => jump(i)} style={webStyle({ cursor: 'pointer' })}>
                  {(st) => (
                    <Text style={{ fontFamily, color: (st as { hovered?: boolean }).hovered ? site.text : site.muted, fontSize: 13.5, lineHeight: 19, paddingVertical: 5 }}>
                      {i + 1}. {s.title}
                    </Text>
                  )}
                </Pressable>
              ))}
            </View>
          ) : null}
          <View style={{ flex: 1, maxWidth: 780, width: '100%' }}>
            <View style={{ gap: 14, marginBottom: 12 }}>
              {intro.map((p) => <RichText key={p} text={fill(p)} style={text} />)}
            </View>
            {sections.map((s, i) => (
              <View key={s.title} nativeID={`legal-${i}`} style={{ marginTop: 40 }}>
                <Heading level={2} style={{ fontSize: isMobile ? 22 : 26, lineHeight: isMobile ? 28 : 32, letterSpacing: -0.5, marginBottom: 14 }}>
                  {i + 1}. {s.title}
                </Heading>
                <View style={{ gap: 14 }}>
                  {s.body.map((b, j) =>
                    typeof b === 'string' ? (
                      <RichText key={j} text={fill(b)} style={text} />
                    ) : (
                      <View key={j} style={{ gap: 10, paddingLeft: 4 }}>
                        {b.map((li) => (
                          <View key={li} style={{ flexDirection: 'row', gap: 12 }}>
                            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: site.blue, marginTop: 11 }} />
                            <RichText text={fill(li)} style={[text, { flex: 1 }]} />
                          </View>
                        ))}
                      </View>
                    ),
                  )}
                </View>
              </View>
            ))}
            <Glass style={{ marginTop: 48 }} padding={isMobile ? 20 : 28}>
              <Heading level={3}>Questions about this document?</Heading>
              <P style={{ marginTop: 6 }}>Email us and a real person will get back to you.</P>
              <View style={{ flexDirection: 'row', gap: 20, marginTop: 14, flexWrap: 'wrap' }}>
                <SiteLink href={`mailto:${SUPPORT_EMAIL}`} label={`Email ${SUPPORT_EMAIL}`} style={() => webStyle({ cursor: 'pointer' })}>
                  <Text style={{ fontFamily, color: site.blueText, fontSize: 16, fontWeight: '700' }}>{SUPPORT_EMAIL}</Text>
                </SiteLink>
                <SiteLink href="/support" label="Support" style={() => webStyle({ cursor: 'pointer' })}>
                  <Text style={{ fontFamily, color: site.blueText, fontSize: 16, fontWeight: '700' }}>Visit Support →</Text>
                </SiteLink>
              </View>
            </Glass>
          </View>
        </View>
      </Container>
    </View>
  );
}

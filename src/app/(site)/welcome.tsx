import { useLocalSearchParams } from 'expo-router';
import { Text, View } from 'react-native';
import { Faq } from '../../components/site/Faq';
import { FloatCard, PhoneMockup } from '../../components/site/PhoneMockup';
import { SitePage, useAnchor } from '../../components/site/SitePage';
import { StoreBadges } from '../../components/site/StoreBadges';
import {
  CTAButton, Check, Container, Eyebrow, Glass, Glow, GradientText, Grid, Heading, IconBadge, Ionicons, P, Pill, Section, SectionIntro,
  fontFamily, site, useBreakpoint, webStyle,
} from '../../components/site/primitives';
import { APP_NAME } from '../../lib/config';
import { PLANS } from '../../lib/plans';
import {
  AIRCRAFT_MODELS, BOAT_MODELS, BUSINESS_TYPES, DEMO_HREF, FEATURES, GUIDE_COUNT, GUIDE_EXAMPLES, HOME_FAQ, SECURITY, SIGN_UP_HREF, TRIAL_DAYS, WORKFLOW,
} from '../../lib/site';

export default function Welcome() {
  const { section } = useLocalSearchParams<{ section?: string }>();
  return (
    <SitePage
      title={APP_NAME}
      description={`${APP_NAME} is the all-in-one CRM for aircraft, auto and marine detailers: scheduling, before/after photos, Good/Better/Best quotes, invoices, card payments, service guides and a ${AIRCRAFT_MODELS}-model aircraft price guide. Start a ${TRIAL_DAYS}-day free trial.`}
      initialSection={typeof section === 'string' ? section : undefined}
    >
      <Hero />
      <ProofBand />
      <Workflow />
      <Included />
      <Features />
      <BusinessTypes />
      <Security />
      <PlansTeaser />
      <FaqSection />
      <FinalCta />
    </SitePage>
  );
}

function Hero() {
  const { isMobile, isDesktop } = useBreakpoint();
  return (
    <View style={{ position: 'relative', overflow: 'hidden' }}>
      <Glow variant="hero" />
      <Container style={{ paddingTop: isMobile ? 40 : 84, paddingBottom: isMobile ? 56 : 104 }}>
        <View style={{ flexDirection: isDesktop ? 'row' : 'column', alignItems: 'center', gap: isDesktop ? 48 : 56 }}>
          <View style={{ flex: isDesktop ? 1.15 : undefined, alignItems: isDesktop ? 'flex-start' : 'center', maxWidth: 640 }}>
            <Pill icon="sparkles" label="For aircraft, auto & marine detailers" tone="gold" />
            <View style={{ height: 24 }} />
            <Heading level={1} center={!isDesktop}>
              Your work is flawless.{'\n'}
              <GradientText>Now run the business that way.</GradientText>
            </Heading>
            <P size="lg" center={!isDesktop} style={{ marginTop: 22, maxWidth: 560 }}>
              {APP_NAME} is the all-in-one CRM for detailing companies. Schedule your crew, document every surface, send quotes customers love to approve, and get paid by card — with service guides and an aircraft price guide built in.
            </P>
            <View style={{ flexDirection: isMobile ? 'column' : 'row', gap: 12, marginTop: 32, alignSelf: isMobile ? 'stretch' : isDesktop ? 'flex-start' : 'center' }}>
              <CTAButton href={SIGN_UP_HREF} label={`Start your ${TRIAL_DAYS}-day free trial`} icon="arrow-forward" size="lg" full={isMobile} />
              <CTAButton href={DEMO_HREF} label="Explore the demo" icon="play-circle-outline" variant="outline" size="lg" full={isMobile} />
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 18, marginTop: 20, justifyContent: isDesktop ? 'flex-start' : 'center' }}>
              {['Every feature included', 'No card required', 'Cancel anytime'].map((x) => (
                <View key={x} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Ionicons name="checkmark" size={15} color={site.goldText} />
                  <Text style={{ fontFamily, color: site.muted, fontSize: 13.5, fontWeight: '600' }}>{x}</Text>
                </View>
              ))}
            </View>
            <View style={{ marginTop: 28 }}>
              <StoreBadges />
            </View>
          </View>
          <View style={{ flex: isDesktop ? 1 : undefined, alignItems: 'center', justifyContent: 'center', minHeight: isMobile ? undefined : 640 }}>
            <PhoneMockup style={isDesktop ? webStyle({ transform: 'rotate(-2deg)' }) : undefined} />
            {!isMobile ? (
              <>
                <FloatCard icon="checkmark-done" title="Invoice paid" body="INV-2207 · $2,350.00 by card" tone="green" style={{ top: 70, left: isDesktop ? -30 : -10 }} />
                <FloatCard icon="images" title="12 after photos" body="Attached to N512FR · signed off" tone="blue" style={{ bottom: 120, right: isDesktop ? -40 : -10 }} />
                <FloatCard icon="repeat" title="Care plan renewed" body="Monthly wash · next visit Nov 11" tone="gold" style={{ bottom: 18, left: isDesktop ? 0 : 10 }} />
              </>
            ) : null}
          </View>
        </View>
      </Container>
    </View>
  );
}

function ProofBand() {
  const { isMobile } = useBreakpoint();
  const items = [
    { value: String(AIRCRAFT_MODELS), label: 'aircraft models in the price guide' },
    { value: String(GUIDE_COUNT), label: 'step-by-step service guides' },
    { value: String(BOAT_MODELS), label: 'boat models in the catalog' },
    { value: '1', label: 'app for the office, the ramp and your customers' },
  ];
  return (
    <View style={{ borderTopWidth: 1, borderBottomWidth: 1, borderColor: site.line, backgroundColor: 'rgba(255,255,255,0.015)' }}>
      <Container style={{ paddingVertical: isMobile ? 28 : 36 }}>
        <Grid cols={isMobile ? 2 : 4} gap={24}>
          {items.map((it) => (
            <View key={it.label} style={{ alignItems: isMobile ? 'flex-start' : 'center' }}>
              <Text style={{ fontFamily, color: site.text, fontSize: isMobile ? 30 : 40, fontWeight: '800', letterSpacing: -1 }}>{it.value}</Text>
              <Text style={{ fontFamily, color: site.muted, fontSize: 13.5, marginTop: 4, textAlign: isMobile ? 'left' : 'center' }}>{it.label}</Text>
            </View>
          ))}
        </Grid>
      </Container>
    </View>
  );
}

function Workflow() {
  const { isMobile, isDesktop } = useBreakpoint();
  return (
    <Section>
      <SectionIntro eyebrow="How it works" title="Plan it. Document it. Get paid for it." body="One continuous flow from the first quote to the final payment — so nothing slips between the hangar, the office and the bank." />
      <Grid cols={isDesktop ? 3 : 1} gap={isMobile ? 16 : 22}>
        {WORKFLOW.map((w) => (
          <Glass key={w.step} hover style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 22 }}>
              <IconBadge icon={w.icon} tone={w.step === '02' ? 'gold' : w.step === '03' ? 'green' : 'blue'} />
              <Text style={{ fontFamily, color: 'rgba(255,255,255,0.08)', fontSize: 54, fontWeight: '800', letterSpacing: -2 }}>{w.step}</Text>
            </View>
            <Heading level={3}>{w.title}</Heading>
            <P style={{ marginTop: 10, marginBottom: 18 }}>{w.body}</P>
            <View style={{ gap: 10 }}>
              {w.points.map((p) => <Check key={p}>{p}</Check>)}
            </View>
          </Glass>
        ))}
      </Grid>
    </Section>
  );
}

function Included() {
  const { isMobile, isDesktop } = useBreakpoint();
  const models = [
    { name: 'Pilatus PC-12', cls: 'Single turboprop', w: 0.42 },
    { name: 'King Air 350i', cls: 'Twin turboprop', w: 0.55 },
    { name: 'Citation CJ3+', cls: 'Light jet', w: 0.62 },
    { name: 'Gulfstream G280', cls: 'Super-midsize jet', w: 0.82 },
    { name: 'Global 7500', cls: 'Ultra long range', w: 1 },
  ];
  return (
    <View style={{ position: 'relative', overflow: 'hidden' }}>
      <Glow variant="band" />
      <Section>
        <View style={{ maxWidth: 820, alignSelf: 'center', marginBottom: 48 }}>
          <Eyebrow center>Included on every plan</Eyebrow>
          <Heading level={2} center>
            Training programs cost thousands. Pricing apps cost extra.{' '}
            <GradientText>{APP_NAME} includes both.</GradientText>
          </Heading>
          <P size="lg" center style={{ marginTop: 16 }}>
            Bring a new technician up to standard with step-by-step service guides, and quote with confidence using a price guide built for aviation — no add-ons, no extra subscriptions.
          </P>
        </View>
        <Grid cols={isDesktop ? 2 : 1} gap={isMobile ? 16 : 24}>
          <Glass style={{ flex: 1 }} padding={isMobile ? 22 : 32}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 18 }}>
              <IconBadge icon="school-outline" tone="gold" />
              <View style={{ flex: 1 }}>
                <Heading level={3}>Step-by-step service guides</Heading>
                <P size="sm">{GUIDE_COUNT} guides across aircraft, vehicles and watercraft</P>
              </View>
            </View>
            <View style={{ gap: 8 }}>
              {GUIDE_EXAMPLES.map((g, i) => (
                <View key={g} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11, paddingHorizontal: 14, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.035)', borderWidth: 1, borderColor: site.line }}>
                  <Text style={{ fontFamily, color: site.goldText, fontSize: 12, fontWeight: '800', width: 20 }}>{String(i + 1).padStart(2, '0')}</Text>
                  <Text style={{ fontFamily, color: site.text, fontSize: 14.5, fontWeight: '600', flex: 1 }}>{g}</Text>
                  <Ionicons name="chevron-forward" size={15} color={site.faint} />
                </View>
              ))}
              <P size="sm" style={{ marginTop: 6 }}>…and more, each with supplies, steps and safety notes your crew can follow on the job.</P>
            </View>
          </Glass>
          <Glass style={{ flex: 1 }} padding={isMobile ? 22 : 32}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 18 }}>
              <IconBadge icon="pricetags-outline" tone="blue" />
              <View style={{ flex: 1 }}>
                <Heading level={3}>Aircraft price guide</Heading>
                <P size="sm">{AIRCRAFT_MODELS} aircraft models, sized and ready to quote</P>
              </View>
            </View>
            <View style={{ gap: 12 }}>
              {models.map((m) => (
                <View key={m.name} style={{ gap: 6 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text style={{ fontFamily, color: site.text, fontSize: 14.5, fontWeight: '700' }}>{m.name}</Text>
                    <Text style={{ fontFamily, color: site.muted, fontSize: 13 }}>{m.cls}</Text>
                  </View>
                  <View style={{ height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
                    <View style={[{ height: 6, width: `${m.w * 100}%`, borderRadius: 3, backgroundColor: site.blue }, webStyle({ backgroundImage: `linear-gradient(90deg, ${site.blue}, ${site.gold})` })]} />
                  </View>
                </View>
              ))}
            </View>
            <View style={{ marginTop: 20, gap: 10 }}>
              <Check>Suggested prices by service and aircraft size</Check>
              <Check>Adjust to your market with your own rates</Check>
              <Check>Vehicle and boat sizes priced the same way</Check>
            </View>
          </Glass>
        </Grid>
      </Section>
    </View>
  );
}

function Features() {
  const { isMobile, isTablet } = useBreakpoint();
  const onLayout = useAnchor('features');
  return (
    <View onLayout={onLayout}>
      <Section>
        <SectionIntro eyebrow="Everything in one place" title="Every part of the business, finally in one app." body="Replace the calendar app, the spreadsheet, the invoicing tool and the group text. Each piece knows about the others." />
        <Grid cols={isMobile ? 1 : isTablet ? 2 : 3} gap={isMobile ? 16 : 20}>
          {FEATURES.map((f) => (
            <Glass key={f.id} hover style={{ flex: 1 }} padding={26}>
              <IconBadge icon={f.icon} tone={f.tone} />
              <Heading level={3} style={{ marginTop: 18 }}>{f.title}</Heading>
              <P size="sm" style={{ marginTop: 6, marginBottom: 16 }}>{f.body}</P>
              <View style={{ gap: 8 }}>
                {f.bullets.map((b) => (
                  <View key={b} style={{ flexDirection: 'row', gap: 9 }}>
                    <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: f.tone === 'gold' ? site.gold : site.blue, marginTop: 8 }} />
                    <Text style={{ fontFamily, color: '#C9D1DD', fontSize: 14, lineHeight: 21, flex: 1 }}>{b}</Text>
                  </View>
                ))}
              </View>
            </Glass>
          ))}
        </Grid>
      </Section>
    </View>
  );
}

function BusinessTypes() {
  const { isMobile, isDesktop } = useBreakpoint();
  return (
    <Section tint>
      <SectionIntro eyebrow="Built for what you detail" title="Aircraft first. Vehicles and watercraft when you’re ready." body="Choose your business types when you sign up and add more anytime. Forms, sizes and pricing adapt to what you actually service." />
      <Grid cols={isDesktop ? 3 : 1} gap={isMobile ? 16 : 22}>
        {BUSINESS_TYPES.map((b, i) => (
          <Glass key={b.title} hover style={{ flex: 1 }}>
            <View style={{ width: 64, height: 64, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: i === 0 ? 'rgba(211,153,67,0.14)' : 'rgba(70,152,225,0.14)', borderWidth: 1, borderColor: i === 0 ? 'rgba(211,153,67,0.35)' : 'rgba(70,152,225,0.35)' }}>
              <Ionicons name={b.icon} size={30} color={i === 0 ? site.goldText : site.blueText} />
            </View>
            <Heading level={3} style={{ marginTop: 20 }}>{b.title}</Heading>
            <P style={{ marginTop: 8, marginBottom: 16 }}>{b.body}</P>
            <View style={{ gap: 9 }}>
              {b.examples.map((e) => <Check key={e} tone={i === 0 ? 'gold' : 'blue'}>{e}</Check>)}
            </View>
          </Glass>
        ))}
      </Grid>
    </Section>
  );
}

function Security() {
  const { isMobile, isDesktop } = useBreakpoint();
  return (
    <Section>
      <View style={{ flexDirection: isDesktop ? 'row' : 'column', gap: isDesktop ? 64 : 32, alignItems: isDesktop ? 'center' : 'stretch' }}>
        <View style={{ flex: isDesktop ? 0.9 : undefined }}>
          <Eyebrow>Security</Eyebrow>
          <Heading level={2}>Your customers trust you. You can trust us with them.</Heading>
          <P size="lg" style={{ marginTop: 16 }}>
            Tail numbers, gate codes, owner contacts and prices are sensitive. {APP_NAME} keeps each company’s data walled off, lets you decide exactly who sees what, and never sells your data.
          </P>
        </View>
        <View style={{ flex: isDesktop ? 1.1 : undefined, gap: isMobile ? 12 : 16 }}>
          {SECURITY.map((s) => (
            <Glass key={s.title} hover padding={22} style={{ flexDirection: 'row', gap: 16, alignItems: 'flex-start' }}>
              <IconBadge icon={s.icon} tone="green" />
              <View style={{ flex: 1 }}>
                <Heading level={3} style={{ fontSize: 18 }}>{s.title}</Heading>
                <P size="sm" style={{ marginTop: 4 }}>{s.body}</P>
              </View>
            </Glass>
          ))}
        </View>
      </View>
    </Section>
  );
}

function PlansTeaser() {
  const { isMobile, isDesktop } = useBreakpoint();
  return (
    <Section tint>
      <SectionIntro eyebrow="Pricing" title="Simple plans that grow with your crew." body={`Every plan includes the service guides, the price guide and the customer portal. Try everything free for ${TRIAL_DAYS} days.`} />
      <Grid cols={isDesktop ? 3 : 1} gap={isMobile ? 14 : 20}>
        {PLANS.map((p) => {
          const featured = p.id === 'team';
          return (
            <Glass key={p.id} hover style={[{ flex: 1 }, featured ? { borderColor: 'rgba(211,153,67,0.45)' } : null]}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Heading level={3}>{p.name}</Heading>
                {featured ? <Pill label="Most popular" tone="gold" /> : null}
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 4, marginTop: 14 }}>
                <Text style={{ fontFamily, color: site.text, fontSize: 40, fontWeight: '800', letterSpacing: -1.5 }}>${p.monthly.toFixed(2)}</Text>
                <Text style={{ fontFamily, color: site.muted, fontSize: 15, marginBottom: 8 }}>/mo</Text>
              </View>
              <P size="sm" style={{ marginTop: 4 }}>{p.blurb}</P>
              <View style={{ height: 1, backgroundColor: site.line, marginVertical: 18 }} />
              <View style={{ gap: 9 }}>
                <Check>{p.seats === Infinity ? 'Unlimited team members' : p.seats === 1 ? '1 user' : `Up to ${p.seats} team members`}</Check>
                <Check>{p.texts.toLocaleString('en-US')} customer texts / month</Check>
                <Check>{p.feeBps / 100}% platform fee on card payments</Check>
              </View>
            </Glass>
          );
        })}
      </Grid>
      <View style={{ alignItems: 'center', marginTop: 36 }}>
        <CTAButton href="/pricing" label="Compare plans & yearly pricing" icon="arrow-forward" variant="outline" />
      </View>
    </Section>
  );
}

function FaqSection() {
  return (
    <Section>
      <SectionIntro eyebrow="FAQ" title="Questions, answered." />
      <Faq items={HOME_FAQ} />
    </Section>
  );
}

function FinalCta() {
  const { isMobile } = useBreakpoint();
  return (
    <Container style={{ paddingBottom: isMobile ? 56 : 104 }}>
      <View style={{ position: 'relative', overflow: 'hidden', borderRadius: 32, borderWidth: 1, borderColor: site.lineStrong }}>
        <Glow variant="hero" />
        <View style={{ paddingVertical: isMobile ? 48 : 80, paddingHorizontal: isMobile ? 22 : 64, alignItems: 'center' }}>
          <Eyebrow center>Ready when you are</Eyebrow>
          <Heading level={2} center style={{ maxWidth: 760 }}>Make every job look as good on paper as it does on the ramp.</Heading>
          <P size="lg" center style={{ marginTop: 16, maxWidth: 620 }}>
            Start free for {TRIAL_DAYS} days with every feature unlocked. No card required — pick a plan only when it’s earning its keep.
          </P>
          <View style={{ flexDirection: isMobile ? 'column' : 'row', gap: 12, marginTop: 32, alignSelf: isMobile ? 'stretch' : 'center' }}>
            <CTAButton href={SIGN_UP_HREF} label={`Start your ${TRIAL_DAYS}-day free trial`} icon="arrow-forward" size="lg" variant="gold" full={isMobile} />
            <CTAButton href={DEMO_HREF} label="Explore the demo" variant="outline" size="lg" full={isMobile} />
          </View>
          <View style={{ marginTop: 28 }}>
            <StoreBadges />
          </View>
        </View>
      </View>
    </Container>
  );
}

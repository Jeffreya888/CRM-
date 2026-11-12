// Public booking pages at gettarmo.com/book/<slug>:
// - a company's own page (its website links to it, or embeds it with ?embed=1): the booking goes into that company's Tarmo;
// - a franchise brand's page: the request goes to the location that covers the customer's airport (or zip code), else HQ.
import { useLocalSearchParams } from 'expo-router';
import Head from 'expo-router/head';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Text, TextInput, View } from 'react-native';
import { CompanyBooking, type CompanyInfo } from '../../../components/site/CompanyBooking';
import { Input } from '../../../components/site/SupportForm';
import { CTAButton, Container, Glass, Glow, Heading, Ionicons, P, fontFamily, site, useBreakpoint } from '../../../components/site/primitives';
import { APP_NAME } from '../../../lib/config';
import { callFunction, friendlyError } from '../../../lib/supabase';
import { colors } from '../../../lib/theme';

type Info = { name: string; locations: { name: string; airports: string[] }[] };
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export default function BookingPage() {
  const { slug, embed } = useLocalSearchParams<{ slug: string; embed?: string }>();
  const [company, setCompany] = useState<CompanyInfo | null | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    callFunction<CompanyInfo>('website-booking', { action: 'info', slug })
      .then((d) => { if (alive) setCompany(d); })
      .catch(() => { if (alive) setCompany(null); });
    return () => { alive = false; };
  }, [slug]);
  if (company === undefined) {
    return <View style={{ flex: 1, backgroundColor: site.bg, minHeight: '100%' as any, alignItems: 'center', justifyContent: 'center', padding: 40 }}><ActivityIndicator color={site.blueText} /></View>;
  }
  if (company) {
    return (
      <>
        <Head><title>{`Book a detail · ${company.name}`}</title><meta name="description" content={`Request a detail from ${company.name}.`} /></Head>
        <CompanyBooking slug={slug} info={company} embed={embed === '1'} />
      </>
    );
  }
  return <BrandBooking />;
}

function BrandBooking() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { isMobile } = useBreakpoint();
  const [info, setInfo] = useState<Info | null>(null);
  const [missing, setMissing] = useState(false);
  const [f, setF] = useState({ name: '', email: '', phone: '', company: '', airport: '', zip: '', asset: '', service: '', when: '', notes: '', website: '' });
  const [errors, setErrors] = useState<Partial<Record<'name' | 'email' | 'place', string>>>({});
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null | undefined>(undefined);
  const set = (k: keyof typeof f) => (v: string) => setF((s) => ({ ...s, [k]: v }));

  useEffect(() => {
    let alive = true;
    callFunction<Info>('brand-request', { action: 'info', slug })
      .then((d) => { if (alive) setInfo(d); })
      .catch(() => { if (alive) setMissing(true); });
    return () => { alive = false; };
  }, [slug]);

  const submit = async () => {
    const e: typeof errors = {};
    if (f.name.trim().length < 2) e.name = 'Please enter your name.';
    if (!EMAIL_RE.test(f.email.trim())) e.email = 'Please enter a valid email address.';
    if (!f.airport.trim() && !f.zip.trim()) e.place = 'Enter an airport code or a zip code so we can find your nearest location.';
    setErrors(e);
    setFailure(null);
    if (Object.keys(e).length) return;
    setBusy(true);
    try {
      const r = await callFunction<{ location: string | null }>('brand-request', {
        action: 'submit', slug, name: f.name, email: f.email, phone: f.phone, company: f.company, airport: f.airport, zip: f.zip,
        asset: f.asset, service: f.service, notes: [f.when.trim() ? `When: ${f.when.trim()}` : '', f.notes.trim()].filter(Boolean).join('\n'),
        website: f.website,
      });
      setSentTo(r.location);
    } catch (err: any) {
      setFailure(/fetch|network/i.test(err.message ?? '') ? 'We couldn’t reach the server. Check your connection and try again.' : friendlyError(err.message));
    } finally {
      setBusy(false);
    }
  };

  const title = info ? `Book a detail · ${info.name}` : 'Book a detail';
  return (
    <View style={{ flex: 1, backgroundColor: site.bg, minHeight: '100%' as any }}>
      <Head><title>{title}</title><meta name="description" content={info ? `Request a detail from ${info.name}. We'll send it to your nearest location.` : 'Request a detail.'} /></Head>
      <View style={{ position: 'relative', overflow: 'hidden' }}>
        <Glow variant="hero" />
        <Container style={{ paddingTop: isMobile ? 36 : 72, paddingBottom: 72, maxWidth: 720 }}>
          {missing ? (
            <Glass>
              <Heading level={2}>This page isn’t available</Heading>
              <P style={{ marginTop: 10 }}>Check the link with the company that sent it.</P>
            </Glass>
          ) : !info ? (
            <ActivityIndicator color={site.blueText} />
          ) : sentTo !== undefined ? (
            <Glass>
              <Ionicons name="checkmark-circle" size={40} color={colors.success} />
              <Heading level={2} style={{ marginTop: 12 }}>Request sent</Heading>
              <P style={{ marginTop: 10 }}>
                {sentTo ? `${sentTo} has your request and will contact you to confirm a time.` : `${info.name} has your request and will contact you to confirm a time.`}
              </P>
            </Glass>
          ) : (
            <>
              <Text style={{ fontFamily, color: site.goldText, fontSize: 13, fontWeight: '800', letterSpacing: 1.4 }}>BOOK A DETAIL</Text>
              <Heading level={1} style={{ marginTop: 8 }}>{info.name}</Heading>
              <P size="lg" style={{ marginTop: 12 }}>Tell us where your aircraft, boat or vehicle is and what it needs. We’ll send your request to the nearest location.</P>
              {info.locations.length ? (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 18 }}>
                  {info.locations.map((l) => (
                    <View key={l.name} style={{ paddingVertical: 6, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, borderColor: site.lineStrong }}>
                      <Text style={{ fontFamily, color: site.muted, fontSize: 13 }}>
                        {l.name}{l.airports.length ? ` · ${l.airports.join(', ')}` : ''}
                      </Text>
                    </View>
                  ))}
                </View>
              ) : null}
              <Glass style={{ marginTop: 28, gap: 16 }}>
                <View style={{ flexDirection: isMobile ? 'column' : 'row', gap: 16 }}>
                  <Input label="Your name" value={f.name} onChangeText={set('name')} error={errors.name} grow autoComplete="name" />
                  <Input label="Company" optional value={f.company} onChangeText={set('company')} grow autoComplete="organization" />
                </View>
                <View style={{ flexDirection: isMobile ? 'column' : 'row', gap: 16 }}>
                  <Input label="Email" value={f.email} onChangeText={set('email')} error={errors.email} grow keyboardType="email-address" autoCapitalize="none" autoComplete="email" />
                  <Input label="Phone" optional value={f.phone} onChangeText={set('phone')} grow keyboardType="phone-pad" autoComplete="tel" />
                </View>
                <View style={{ flexDirection: isMobile ? 'column' : 'row', gap: 16 }}>
                  <Input label="Airport code" value={f.airport} onChangeText={(v) => set('airport')(v.toUpperCase())} grow autoCapitalize="characters" placeholder="e.g. KHOU" />
                  <Input label="Or zip code" value={f.zip} onChangeText={set('zip')} grow keyboardType="number-pad" placeholder="If not at an airport" />
                </View>
                {errors.place ? <Text style={{ fontFamily, color: colors.danger, fontSize: 13 }}>{errors.place}</Text> : null}
                <View style={{ flexDirection: isMobile ? 'column' : 'row', gap: 16 }}>
                  <Input label="Aircraft, boat or vehicle" optional value={f.asset} onChangeText={set('asset')} grow placeholder="e.g. Citation XLS+, N123AB" />
                  <Input label="Service" optional value={f.service} onChangeText={set('service')} grow placeholder="e.g. exterior wash and brightwork" />
                </View>
                <Input label="When would you like it done?" optional value={f.when} onChangeText={set('when')} placeholder="e.g. Before Friday's 9am departure" />
                <Input label="Anything else?" optional value={f.notes} onChangeText={set('notes')} multiline placeholder="Hangar, FBO, access notes…" />
                {/* Honeypot: hidden from people, filled in by bots. */}
                <View style={{ position: 'absolute', left: -10000, width: 1, height: 1, overflow: 'hidden' }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                  <TextInput value={f.website} onChangeText={set('website')} tabIndex={-1} accessibilityLabel="Website" />
                </View>
                {failure ? <Text style={{ fontFamily, color: colors.danger, fontSize: 14 }}>{failure}</Text> : null}
                <CTAButton label={busy ? 'Sending…' : 'Request a detail'} icon="paper-plane-outline" onPress={submit} disabled={busy} full />
              </Glass>
              <P size="sm" center style={{ marginTop: 18 }}>Booking by {APP_NAME}</P>
            </>
          )}
        </Container>
      </View>
    </View>
  );
}

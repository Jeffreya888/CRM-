// A company's own public booking page: gettarmo.com/book/<slug> (add ?embed=1 inside an iframe on the company's website).
// The booking lands in the company's Tarmo as a customer, an aircraft / boat / vehicle, a lead and a request.
import { createElement, useState } from 'react';
import { Image, Platform, Pressable, Text, TextInput, View } from 'react-native';
import { Input } from './SupportForm';
import { CTAButton, Container, Glass, Glow, Heading, Ionicons, P, fontFamily, site, useBreakpoint } from './primitives';
import { APP_NAME } from '../../lib/config';
import { callFunction, friendlyError } from '../../lib/supabase';
import { colors } from '../../lib/theme';

type AssetType = 'aircraft' | 'watercraft' | 'vehicle';
export type CompanyInfo = {
  name: string; logo_url: string | null; phone: string | null; website: string | null; message: string | null;
  business_types: AssetType[]; services: { id: string; name: string; description: string | null; asset_type: AssetType }[];
};
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const ASSET: Record<AssetType, { label: string; id: string; idHint: string; desc: string; descHint: string; where: string; whereHint: string }> = {
  aircraft: { label: 'Aircraft', id: 'Tail number', idHint: 'e.g. N550GV', desc: 'Make and model', descHint: 'e.g. Gulfstream G550', where: 'Airport or FBO', whereHint: 'e.g. KHOU, Signature' },
  watercraft: { label: 'Boat', id: 'Boat name', idHint: 'e.g. Sea Breeze', desc: 'Make, model and length', descHint: 'e.g. Sea Ray 45 ft', where: 'Marina or address', whereHint: 'e.g. Lakewood Yacht Club, slip 12' },
  vehicle: { label: 'Vehicle', id: 'Plate or VIN', idHint: 'Optional', desc: 'Year, make and model', descHint: 'e.g. 2024 Porsche 911', where: 'Address', whereHint: 'Where should we come, or will you drop it off?' },
};

/** A date picker on the web, a text field elsewhere. Value is YYYY-MM-DD. */
function DateInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const style = { fontFamily, color: site.text, fontSize: 16, borderRadius: 14, border: `1px solid ${site.lineStrong}`, padding: '12px 16px', background: 'rgba(255,255,255,0.04)', colorScheme: 'dark', width: '100%', boxSizing: 'border-box' };
  if (Platform.OS === 'web') {
    const min = new Date().toISOString().slice(0, 10);
    return createElement('input', { type: 'date', value, min, onChange: (e: any) => onChange(e.target.value), 'aria-label': 'Preferred date', style });
  }
  return <TextInput value={value} onChangeText={onChange} placeholder="YYYY-MM-DD" placeholderTextColor={site.faint}
    style={{ fontFamily, color: site.text, fontSize: 16, borderRadius: 14, borderWidth: 1, borderColor: site.lineStrong, paddingHorizontal: 16, paddingVertical: 13 }} />;
}

export function CompanyBooking({ slug, info, embed }: { slug: string; info: CompanyInfo; embed: boolean }) {
  const { isMobile } = useBreakpoint();
  const types = (['aircraft', 'watercraft', 'vehicle'] as AssetType[]).filter((t) => info.business_types.includes(t));
  const [type, setType] = useState<AssetType>(types[0] ?? 'aircraft');
  const [f, setF] = useState({ name: '', email: '', phone: '', company: '', assetId: '', assetDesc: '', serviceId: '', where: '', date1: '', date2: '', notes: '', website: '' });
  const [errors, setErrors] = useState<Partial<Record<'name' | 'email', string>>>({});
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const set = (k: keyof typeof f) => (v: string) => setF((s) => ({ ...s, [k]: v }));
  const a = ASSET[type];
  const services = info.services.filter((s) => s.asset_type === type);

  const submit = async () => {
    const e: typeof errors = {};
    if (f.name.trim().length < 2) e.name = 'Please enter your name.';
    if (!EMAIL_RE.test(f.email.trim())) e.email = 'Please enter a valid email address.';
    setErrors(e);
    setFailure(null);
    if (Object.keys(e).length) return;
    setBusy(true);
    try {
      await callFunction('website-booking', {
        action: 'submit', slug, name: f.name, email: f.email, phone: f.phone, company: f.company,
        asset_type: type, asset_id: f.assetId, asset_desc: f.assetDesc, service_id: f.serviceId || undefined, location: f.where,
        preferred: [f.date1, f.date2].filter(Boolean).map((d) => `${d}T12:00:00`), notes: f.notes, website: f.website,
      });
      setDone(true);
    } catch (err: any) {
      setFailure(/fetch|network/i.test(err.message ?? '') ? 'We couldn’t reach the server. Check your connection and try again.' : friendlyError(err.message));
    } finally {
      setBusy(false);
    }
  };

  const chip = (selected: boolean) => ({
    paddingVertical: 9, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1,
    borderColor: selected ? site.blue : site.lineStrong, backgroundColor: selected ? 'rgba(79,140,255,0.16)' : 'transparent',
  });
  const row = { flexDirection: (isMobile ? 'column' : 'row') as 'column' | 'row', gap: 16 };

  return (
    <View style={{ flex: 1, backgroundColor: site.bg, minHeight: '100%' as any }}>
      <View style={{ position: 'relative', overflow: 'hidden' }}>
        {embed ? null : <Glow variant="hero" />}
        <Container style={{ paddingTop: embed ? 20 : isMobile ? 36 : 64, paddingBottom: embed ? 24 : 72, maxWidth: 720 }}>
          {done ? (
            <Glass>
              <Ionicons name="checkmark-circle" size={40} color={colors.success} />
              <Heading level={2} style={{ marginTop: 12 }}>Request sent</Heading>
              <P style={{ marginTop: 10 }}>
                {info.name} has your request and will contact you to confirm the details and a time. We emailed you a copy.
                {info.phone ? ` Questions? Call ${info.phone}.` : ''}
              </P>
            </Glass>
          ) : (
            <>
              {embed ? null : (
                <>
                  {info.logo_url ? <Image source={{ uri: info.logo_url }} style={{ width: 160, height: 56, marginBottom: 14 }} resizeMode="contain" accessibilityLabel={info.name} /> : null}
                  <Text style={{ fontFamily, color: site.goldText, fontSize: 13, fontWeight: '800', letterSpacing: 1.4 }}>BOOK A DETAIL</Text>
                  <Heading level={1} style={{ marginTop: 8 }}>{info.name}</Heading>
                  <P size="lg" style={{ marginTop: 12 }}>{info.message || 'Tell us what needs detailing and when. We’ll confirm the details and a time with you.'}</P>
                </>
              )}
              <Glass style={{ marginTop: embed ? 0 : 28, gap: 16 }}>
                {types.length > 1 ? (
                  <View style={{ gap: 8 }}>
                    <Text style={{ fontFamily, color: site.text, fontSize: 14, fontWeight: '700' }}>What needs detailing?</Text>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                      {types.map((t) => (
                        <Pressable key={t} onPress={() => { setType(t); set('serviceId')(''); }} style={chip(type === t)} accessibilityRole="button" accessibilityState={{ selected: type === t }}>
                          <Text style={{ fontFamily, color: site.text, fontSize: 14, fontWeight: '600' }}>{ASSET[t].label}</Text>
                        </Pressable>
                      ))}
                    </View>
                  </View>
                ) : null}
                <View style={row}>
                  <Input label={a.id} optional={type === 'vehicle'} value={f.assetId} grow autoCapitalize={type === 'aircraft' ? 'characters' : 'words'}
                    onChangeText={(v) => set('assetId')(type === 'aircraft' ? v.toUpperCase() : v)} placeholder={a.idHint} />
                  <Input label={a.desc} optional value={f.assetDesc} onChangeText={set('assetDesc')} grow placeholder={a.descHint} />
                </View>
                {services.length ? (
                  <View style={{ gap: 8 }}>
                    <Text style={{ fontFamily, color: site.text, fontSize: 14, fontWeight: '700' }}>Service <Text style={{ color: site.faint, fontWeight: '500' }}>(optional)</Text></Text>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                      {services.slice(0, 16).map((s) => (
                        <Pressable key={s.id} onPress={() => set('serviceId')(f.serviceId === s.id ? '' : s.id)} style={chip(f.serviceId === s.id)} accessibilityRole="button" accessibilityState={{ selected: f.serviceId === s.id }}>
                          <Text style={{ fontFamily, color: site.text, fontSize: 14 }}>{s.name}</Text>
                        </Pressable>
                      ))}
                    </View>
                  </View>
                ) : null}
                <Input label={a.where} optional value={f.where} onChangeText={set('where')} placeholder={a.whereHint} />
                <View style={row}>
                  <View style={{ flex: 1, gap: 7 }}>
                    <Text style={{ fontFamily, color: site.text, fontSize: 14, fontWeight: '700' }}>Preferred date <Text style={{ color: site.faint, fontWeight: '500' }}>(optional)</Text></Text>
                    <DateInput value={f.date1} onChange={set('date1')} />
                  </View>
                  <View style={{ flex: 1, gap: 7 }}>
                    <Text style={{ fontFamily, color: site.text, fontSize: 14, fontWeight: '700' }}>Backup date <Text style={{ color: site.faint, fontWeight: '500' }}>(optional)</Text></Text>
                    <DateInput value={f.date2} onChange={set('date2')} />
                  </View>
                </View>
                <View style={row}>
                  <Input label="Your name" value={f.name} onChangeText={set('name')} error={errors.name} grow autoComplete="name" />
                  <Input label="Company" optional value={f.company} onChangeText={set('company')} grow autoComplete="organization" />
                </View>
                <View style={row}>
                  <Input label="Email" value={f.email} onChangeText={set('email')} error={errors.email} grow keyboardType="email-address" autoCapitalize="none" autoComplete="email" />
                  <Input label="Phone" optional value={f.phone} onChangeText={set('phone')} grow keyboardType="phone-pad" autoComplete="tel" />
                </View>
                {errors.name || errors.email ? <Text style={{ fontFamily, color: colors.danger, fontSize: 13 }}>{errors.name ?? errors.email}</Text> : null}
                <Input label="Anything else?" optional value={f.notes} onChangeText={set('notes')} multiline placeholder="Condition, access notes, deadlines…" />
                {/* Honeypot: hidden from people, filled in by bots. */}
                <View style={{ position: 'absolute', left: -10000, width: 1, height: 1, overflow: 'hidden' }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                  <TextInput value={f.website} onChangeText={set('website')} tabIndex={-1} accessibilityLabel="Website" />
                </View>
                {failure ? <Text style={{ fontFamily, color: colors.danger, fontSize: 14 }}>{failure}</Text> : null}
                <CTAButton label={busy ? 'Sending…' : 'Request a detail'} icon="paper-plane-outline" onPress={submit} disabled={busy} full />
              </Glass>
              <P size="sm" center style={{ marginTop: 14 }}>Booking by {APP_NAME}</P>
            </>
          )}
        </Container>
      </View>
    </View>
  );
}

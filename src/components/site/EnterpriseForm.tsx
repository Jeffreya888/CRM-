// Enterprise enquiry form → enterprise-inquiry function (no sign-in).
import { useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { SUPPORT_EMAIL } from '../../lib/config';
import { callFunction, friendlyError } from '../../lib/supabase';
import { colors } from '../../lib/theme';
import { Chip, Group } from './EarlyAccessForm';
import { CTAButton, Glass, Heading, Ionicons, P, fontFamily, useBreakpoint } from './primitives';
import { Input } from './SupportForm';

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const LOCATIONS = ['2–5', '6–20', '21–100', '100+'];
const TYPES = [
  { value: 'aircraft', label: 'Aircraft' },
  { value: 'watercraft', label: 'Boats & yachts' },
  { value: 'vehicle', label: 'Cars & trucks' },
];

type Errors = Partial<Record<'name' | 'email' | 'company' | 'locations', string>>;

export function EnterpriseForm() {
  const { isMobile } = useBreakpoint();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [company, setCompany] = useState('');
  const [phone, setPhone] = useState('');
  const [locations, setLocations] = useState<string | null>(null);
  const [types, setTypes] = useState<string[]>([]);
  const [message, setMessage] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const submit = async () => {
    const e: Errors = {};
    if (name.trim().length < 2) e.name = 'Please enter your name.';
    if (!EMAIL_RE.test(email.trim())) e.email = 'Please enter a valid email address.';
    if (company.trim().length < 2) e.company = 'Please enter your company.';
    if (!locations) e.locations = 'Pick one.';
    setErrors(e);
    setFailure(null);
    if (Object.keys(e).length) return;
    setBusy(true);
    try {
      await callFunction('enterprise-inquiry', {
        name: name.trim(), email: email.trim(), company: company.trim(), phone: phone.trim(), locations, business_types: types, message: message.trim(),
      });
      setSent(true);
    } catch (err: any) {
      const msg = /fetch|network/i.test(err.message ?? '') ? 'We couldn’t reach the server. Check your connection and try again.' : friendlyError(err.message);
      setFailure(/[.!?]$/.test(msg) ? msg : `${msg}.`);
    } finally {
      setBusy(false);
    }
  };

  if (sent) {
    return (
      <Glass padding={isMobile ? 24 : 36} style={{ alignItems: 'center' }}>
        <View accessibilityLiveRegion="polite" style={{ alignItems: 'center' }}>
          <View style={{ width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(76,195,138,0.15)', borderWidth: 1, borderColor: 'rgba(76,195,138,0.4)' }}>
            <Ionicons name="checkmark" size={32} color={colors.success} />
          </View>
          <Heading level={3} center style={{ marginTop: 18 }}>Thanks, we’ll be in touch</Heading>
          <P center style={{ marginTop: 6, maxWidth: 440 }}>
            We’ll reply to {email.trim().toLowerCase()} to set up a call.
          </P>
        </View>
      </Glass>
    );
  }

  return (
    <Glass padding={isMobile ? 20 : 32}>
      <Heading level={3}>Talk to us about Enterprise</Heading>
      <P size="sm" style={{ marginTop: 4, marginBottom: 22 }}>Tell us about your operation and we’ll put together a plan and pricing for you.</P>
      <View style={{ gap: 18 }}>
        <View style={{ flexDirection: isMobile ? 'column' : 'row', gap: 18 }}>
          <Input grow={!isMobile} label="Your name" value={name} onChangeText={setName} autoComplete="name" textContentType="name" error={errors.name} placeholder="Alex Rivera" />
          <Input grow={!isMobile} label="Work email" value={email} onChangeText={setEmail} autoComplete="email" textContentType="emailAddress" keyboardType="email-address" autoCapitalize="none" error={errors.email} placeholder="you@company.com" />
        </View>
        <View style={{ flexDirection: isMobile ? 'column' : 'row', gap: 18 }}>
          <Input grow={!isMobile} label="Company" value={company} onChangeText={setCompany} autoComplete="organization" textContentType="organizationName" error={errors.company} placeholder="Skyline Aviation" />
          <Input grow={!isMobile} label="Phone" optional value={phone} onChangeText={setPhone} autoComplete="tel" textContentType="telephoneNumber" keyboardType="phone-pad" placeholder="(555) 555-0100" />
        </View>
        <Group id="ent-locations" label="How many locations or airports?" error={errors.locations}>
          {LOCATIONS.map((l) => <Chip key={l} role="radio" label={l} on={locations === l} onPress={() => setLocations(l)} />)}
        </Group>
        <Group id="ent-types" label="What do you detail? (optional)">
          {TYPES.map((t) => <Chip key={t.value} role="checkbox" label={t.label} on={types.includes(t.value)} onPress={() => setTypes((cur) => (cur.includes(t.value) ? cur.filter((x) => x !== t.value) : [...cur, t.value]))} />)}
        </Group>
        <Input label="Anything we should know?" optional value={message} onChangeText={setMessage} multiline numberOfLines={4} maxLength={3000} placeholder="Current software, timeline, what matters most…" />
        {failure ? (
          <View accessibilityLiveRegion="polite" style={{ flexDirection: 'row', gap: 10, padding: 14, borderRadius: 12, backgroundColor: colors.dangerSoft, borderWidth: 1, borderColor: 'rgba(239,90,90,0.35)' }}>
            <Ionicons name="alert-circle" size={18} color={colors.danger} style={{ marginTop: 1 }} />
            <Text style={{ fontFamily, color: '#F6C3C3', fontSize: 14, lineHeight: 20, flex: 1 }}>{failure} You can also email us at {SUPPORT_EMAIL}.</Text>
          </View>
        ) : null}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <CTAButton label={busy ? 'Sending…' : 'Talk to us'} icon={busy ? undefined : 'arrow-forward'} onPress={submit} disabled={busy} full={isMobile} />
          {busy ? <ActivityIndicator color={colors.primary} /> : null}
        </View>
      </View>
    </Glass>
  );
}

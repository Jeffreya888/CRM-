// Public early access form → RPC join_early_access (anon allowed).
import { useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { SUPPORT_EMAIL } from '../../lib/config';
import { callFunction, friendlyError } from '../../lib/supabase';
import { colors } from '../../lib/theme';
import { CTAButton, Glass, Heading, Ionicons, P, fontFamily, site, useBreakpoint, webStyle } from './primitives';
import { Input } from './SupportForm';

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const TYPES = [
  { value: 'aircraft', label: 'Aircraft' },
  { value: 'watercraft', label: 'Boats & yachts' },
  { value: 'vehicle', label: 'Cars & trucks' },
];
const CREW = ['Just me', '2-5', '6-15', '16+'];

export function Chip({ label, on, onPress, role }: { label: string; on: boolean; onPress: () => void; role: 'checkbox' | 'radio' }) {
  return (
    <Pressable
      accessibilityRole={role}
      accessibilityState={{ checked: on }}
      onPress={onPress}
      style={(s) => [
        { paddingVertical: 9, paddingHorizontal: 15, borderRadius: 999, borderWidth: 1, borderColor: on ? site.blue : (s as { hovered?: boolean }).hovered ? 'rgba(255,255,255,0.3)' : site.lineStrong, backgroundColor: on ? 'rgba(70,152,225,0.18)' : 'transparent' },
        webStyle({ cursor: 'pointer', transition: 'all 160ms ease' }),
      ]}
    >
      <Text style={{ fontFamily, color: on ? site.blueText : site.muted, fontSize: 14, fontWeight: '700' }}>{label}</Text>
    </Pressable>
  );
}

export function Group({ id, label, children, error }: { id: string; label: string; children: React.ReactNode; error?: string }) {
  return (
    <View style={{ gap: 9 }}>
      <Text nativeID={id} style={{ fontFamily, color: site.text, fontSize: 14, fontWeight: '700' }}>{label}</Text>
      <View accessibilityLabelledBy={id} style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{children}</View>
      {error ? <Text style={{ fontFamily, color: colors.danger, fontSize: 13 }}>{error}</Text> : null}
    </View>
  );
}

type Errors = Partial<Record<'name' | 'email' | 'types', string>>;

export function EarlyAccessForm() {
  const { isMobile } = useBreakpoint();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [company, setCompany] = useState('');
  const [types, setTypes] = useState<string[]>([]);
  const [crew, setCrew] = useState<string | null>(null);
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [done, setDone] = useState<'new' | 'updated' | null>(null);

  const toggle = (t: string) => setTypes((cur) => (cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t]));

  const submit = async () => {
    const e: Errors = {};
    if (name.trim().length < 2) e.name = 'Please enter your name.';
    if (!EMAIL_RE.test(email.trim())) e.email = 'Please enter a valid email address.';
    if (!types.length) e.types = 'Pick at least one.';
    setErrors(e);
    setFailure(null);
    if (Object.keys(e).length) return;
    setBusy(true);
    try {
      const res = await callFunction<{ existing: boolean }>('early-access', {
        name: name.trim(), email: email.trim(), company: company.trim(), business_types: types, crew_size: crew,
      });
      setDone(res.existing ? 'updated' : 'new');
    } catch (e: any) {
      const msg = /fetch|network/i.test(e.message ?? '') ? 'We couldn’t reach the server. Check your connection and try again.' : friendlyError(e.message);
      setFailure(/[.!?]$/.test(msg) ? msg : `${msg}.`);
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <Glass padding={isMobile ? 24 : 36} style={{ alignItems: 'center' }}>
        <View accessibilityLiveRegion="polite" style={{ alignItems: 'center' }}>
          <View style={{ width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(76,195,138,0.15)', borderWidth: 1, borderColor: 'rgba(76,195,138,0.4)' }}>
            <Ionicons name="checkmark" size={32} color={colors.success} />
          </View>
          <Heading level={3} center style={{ marginTop: 18 }}>{done === 'new' ? 'You’re on the list' : 'You’re already on the list'}</Heading>
          <P center style={{ marginTop: 6, maxWidth: 440 }}>
            Thanks, {name.trim().split(' ')[0]}. {done === 'new'
              ? `We’ve sent a welcome email to ${email.trim().toLowerCase()} with your founding member offer. Check your inbox (and spam, just in case).`
              : 'We’ve updated your details. We’ll email you the day Tarmo opens.'}
          </P>
        </View>
      </Glass>
    );
  }

  return (
    <Glass padding={isMobile ? 20 : 32}>
      <Heading level={3}>Join the early access list</Heading>
      <P size="sm" style={{ marginTop: 4, marginBottom: 22 }}>Be first in when Tarmo opens. No payment details, no spam.</P>
      <View style={{ gap: 18 }}>
        <View style={{ flexDirection: isMobile ? 'column' : 'row', gap: 18 }}>
          <Input grow={!isMobile} label="Your name" value={name} onChangeText={setName} autoComplete="name" textContentType="name" error={errors.name} placeholder="Alex Rivera" />
          <Input grow={!isMobile} label="Email" value={email} onChangeText={setEmail} autoComplete="email" textContentType="emailAddress" keyboardType="email-address" autoCapitalize="none" error={errors.email} placeholder="you@company.com" />
        </View>
        <Input label="Company" optional value={company} onChangeText={setCompany} autoComplete="organization" textContentType="organizationName" placeholder="Rivera Aviation Detailing" />
        <Group id="ea-types" label="What do you detail?" error={errors.types}>
          {TYPES.map((t) => <Chip key={t.value} role="checkbox" label={t.label} on={types.includes(t.value)} onPress={() => toggle(t.value)} />)}
        </Group>
        <Group id="ea-crew" label="Crew size (optional)">
          {CREW.map((c) => <Chip key={c} role="radio" label={c} on={crew === c} onPress={() => setCrew(crew === c ? null : c)} />)}
        </Group>
        {failure ? (
          <View accessibilityLiveRegion="polite" style={{ flexDirection: 'row', gap: 10, padding: 14, borderRadius: 12, backgroundColor: colors.dangerSoft, borderWidth: 1, borderColor: 'rgba(239,90,90,0.35)' }}>
            <Ionicons name="alert-circle" size={18} color={colors.danger} style={{ marginTop: 1 }} />
            <Text style={{ fontFamily, color: '#F6C3C3', fontSize: 14, lineHeight: 20, flex: 1 }}>
              {failure} You can also email us at {SUPPORT_EMAIL}.
            </Text>
          </View>
        ) : null}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <CTAButton label={busy ? 'Joining…' : 'Get early access'} icon={busy ? undefined : 'arrow-forward'} onPress={submit} disabled={busy} full={isMobile} />
          {busy ? <ActivityIndicator color={site.blueText} /> : null}
        </View>
      </View>
    </Glass>
  );
}

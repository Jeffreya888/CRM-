// Public contact form → RPC submit_support_message (anon allowed).
import { useState } from 'react';
import { ActivityIndicator, Pressable, Text, TextInput, View, type TextInputProps } from 'react-native';
import { SUPPORT_EMAIL } from '../../lib/config';
import { SUPPORT_TOPICS } from '../../lib/site';
import { friendlyError, supabase } from '../../lib/supabase';
import { colors } from '../../lib/theme';
import { CTAButton, Glass, Heading, Ionicons, P, fontFamily, site, useBreakpoint, webStyle } from './primitives';

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

function Input({ label, error, optional, grow, ...props }: TextInputProps & { label: string; error?: string | null; optional?: boolean; grow?: boolean }) {
  const [focus, setFocus] = useState(false);
  return (
    <View style={grow ? { gap: 7, flex: 1 } : { gap: 7 }}>
      <Text style={{ fontFamily, color: site.text, fontSize: 14, fontWeight: '700' }}>
        {label}
        {optional ? <Text style={{ color: site.faint, fontWeight: '500' }}> (optional)</Text> : null}
      </Text>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={site.faint}
        onFocus={() => setFocus(true)}
        onBlur={() => setFocus(false)}
        {...props}
        style={[
          {
            fontFamily, color: site.text, fontSize: 16, borderRadius: 14, borderWidth: 1, paddingHorizontal: 16, paddingVertical: 13,
            backgroundColor: 'rgba(255,255,255,0.04)',
            borderColor: error ? colors.danger : focus ? site.blue : site.lineStrong,
            minHeight: props.multiline ? 150 : undefined,
            textAlignVertical: props.multiline ? 'top' : 'center',
          },
          webStyle({ outlineStyle: 'none', transition: 'border-color 160ms ease', boxShadow: focus ? '0 0 0 4px rgba(70,152,225,0.18)' : 'none' }),
        ]}
      />
      {error ? <Text style={{ fontFamily, color: colors.danger, fontSize: 13 }}>{error}</Text> : null}
    </View>
  );
}

type Errors = Partial<Record<'name' | 'email' | 'message', string>>;

export function SupportForm() {
  const { isMobile } = useBreakpoint();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [company, setCompany] = useState('');
  const [topic, setTopic] = useState(SUPPORT_TOPICS[0]!);
  const [message, setMessage] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const validate = (): Errors => {
    const e: Errors = {};
    if (name.trim().length < 2) e.name = 'Please enter your name.';
    if (!EMAIL_RE.test(email.trim())) e.email = 'Please enter a valid email address.';
    if (message.trim().length < 10) e.message = 'Please write at least 10 characters.';
    else if (message.length > 5000) e.message = 'Please keep your message under 5,000 characters.';
    return e;
  };

  const submit = async () => {
    const e = validate();
    setErrors(e);
    setFailure(null);
    if (Object.keys(e).length) return;
    setBusy(true);
    const { error } = await supabase.rpc('submit_support_message', {
      p_name: name.trim(), p_email: email.trim(), p_company: company.trim(), p_topic: topic, p_message: message.trim(),
    });
    setBusy(false);
    if (error) {
      setFailure(friendlyError(error.message));
      return;
    }
    setSent(true);
  };

  const reset = () => {
    setMessage('');
    setSent(false);
  };

  if (sent) {
    return (
      <Glass padding={isMobile ? 24 : 36} style={{ alignItems: 'center' }}>
        <View accessibilityLiveRegion="polite" style={{ alignItems: 'center' }}>
          <View style={{ width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(76,195,138,0.15)', borderWidth: 1, borderColor: 'rgba(76,195,138,0.4)' }}>
            <Ionicons name="checkmark" size={32} color={colors.success} />
          </View>
          <Heading level={3} center style={{ marginTop: 18 }}>Message sent</Heading>
          <P center style={{ marginTop: 6, maxWidth: 420 }}>
            Thanks, {name.trim().split(' ')[0]}. We’ll reply to {email.trim()} by email. If it’s urgent, you can also write to {SUPPORT_EMAIL}.
          </P>
          <View style={{ marginTop: 22 }}>
            <CTAButton center label="Send another message" variant="outline" onPress={reset} />
          </View>
        </View>
      </Glass>
    );
  }

  return (
    <Glass padding={isMobile ? 20 : 32}>
      <Heading level={3}>Send us a message</Heading>
      <P size="sm" style={{ marginTop: 4, marginBottom: 22 }}>Please don’t include passwords, verification codes, card numbers or customer records.</P>
      <View style={{ gap: 18 }}>
        <View style={{ flexDirection: isMobile ? 'column' : 'row', gap: 18 }}>
          <Input grow={!isMobile} label="Your name" value={name} onChangeText={setName} autoComplete="name" textContentType="name" error={errors.name} placeholder="Alex Rivera" />
          <Input grow={!isMobile} label="Email" value={email} onChangeText={setEmail} autoComplete="email" textContentType="emailAddress" keyboardType="email-address" autoCapitalize="none" error={errors.email} placeholder="you@company.com" />
        </View>
        <Input label="Company" optional value={company} onChangeText={setCompany} autoComplete="organization" textContentType="organizationName" placeholder="Rivera Aviation Detailing" />
        <View style={{ gap: 9 }}>
          <Text nativeID="topic-label" style={{ fontFamily, color: site.text, fontSize: 14, fontWeight: '700' }}>Topic</Text>
          <View accessibilityRole="radiogroup" accessibilityLabelledBy="topic-label" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {SUPPORT_TOPICS.map((t) => {
              const on = t === topic;
              return (
                <Pressable
                  key={t}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: on }}
                  onPress={() => setTopic(t)}
                  style={(s) => [
                    { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1, borderColor: on ? site.blue : (s as { hovered?: boolean }).hovered ? 'rgba(255,255,255,0.3)' : site.lineStrong, backgroundColor: on ? 'rgba(70,152,225,0.18)' : 'transparent' },
                    webStyle({ cursor: 'pointer', transition: 'all 160ms ease' }),
                  ]}
                >
                  <Text style={{ fontFamily, color: on ? site.blueText : site.muted, fontSize: 13.5, fontWeight: '700' }}>{t}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
        <Input label="Message" value={message} onChangeText={setMessage} multiline numberOfLines={6} maxLength={5000} error={errors.message} placeholder="How can we help?" />
        {failure ? (
          <View accessibilityLiveRegion="polite" style={{ flexDirection: 'row', gap: 10, padding: 14, borderRadius: 12, backgroundColor: colors.dangerSoft, borderWidth: 1, borderColor: 'rgba(239,90,90,0.35)' }}>
            <Ionicons name="alert-circle" size={18} color={colors.danger} style={{ marginTop: 1 }} />
            <Text style={{ fontFamily, color: '#F6C3C3', fontSize: 14, lineHeight: 20, flex: 1 }}>
              {failure} You can also email us at {SUPPORT_EMAIL}.
            </Text>
          </View>
        ) : null}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <CTAButton label={busy ? 'Sending…' : 'Send message'} icon={busy ? undefined : 'paper-plane-outline'} onPress={submit} disabled={busy} full={isMobile} />
          {busy ? <ActivityIndicator color={site.blueText} /> : null}
        </View>
      </View>
    </Glass>
  );
}

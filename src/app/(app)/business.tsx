import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { Button, ErrorBanner, Field, Screen, Section } from '../../components/ui';
import { useOrg } from '../../lib/session';
import { SOCIALS } from '../../lib/social';
import { friendlyError, supabase } from '../../lib/supabase';
import { colors } from '../../lib/theme';

export default function BusinessProfile() {
  const { org, orgId, refresh } = useOrg();
  const [v, setV] = useState<Record<string, string>>({
    name: org.name, email: org.email ?? '', phone: org.phone ?? '', website: org.website ?? '', address: org.address ?? '', logo_url: org.logo_url ?? '',
    instagram: org.instagram ?? '', facebook: org.facebook ?? '', youtube: org.youtube ?? '', linkedin: org.linkedin ?? '',
  });
  const [error, setError] = useState<string | null>(null);
  const set = (k: string) => (x: string) => setV((s) => ({ ...s, [k]: x }));

  const save = async () => {
    setError(null);
    if (!v.name!.trim()) return setError('Business name is required');
    const row = Object.fromEntries(Object.entries(v).map(([k, x]) => [k, x.trim() || null]));
    const { error } = await supabase.from('organizations').update(row).eq('id', orgId);
    if (error) return setError(friendlyError(error.message));
    await refresh();
    router.back();
  };

  return (
    <Screen footer={<Button title="Save" onPress={save} />}>
      <Stack.Screen options={{ title: 'Business Profile' }} />
      <ErrorBanner message={error} />
      <Field label="Business name *" icon="business-outline" value={v.name} onChangeText={set('name')} />
      <Field label="Email" icon="mail-outline" placeholder="info@yourcompany.com" value={v.email} onChangeText={set('email')} autoCapitalize="none" keyboardType="email-address" />
      <Field label="Phone" icon="call-outline" placeholder="(555) 123-4567" value={v.phone} onChangeText={set('phone')} keyboardType="phone-pad" />
      <Field label="Website" icon="globe-outline" placeholder="yourcompany.com" value={v.website} onChangeText={set('website')} autoCapitalize="none" keyboardType="url" />
      <Field label="Address" icon="location-outline" placeholder="Full address" value={v.address} onChangeText={set('address')} />
      <Field label="Logo URL" icon="image-outline" placeholder="https://… (shown on quotes and invoices)" value={v.logo_url} onChangeText={set('logo_url')} autoCapitalize="none" keyboardType="url" />
      <Section title="Social Media" icon="share-social-outline" iconColor={colors.textMuted}>
        {SOCIALS.map((s) => (
          <Field key={s.key} label={s.label} icon={s.icon} iconColor={s.fg} placeholder={s.placeholder} value={v[s.key]} onChangeText={set(s.key)} autoCapitalize="none" />
        ))}
      </Section>
    </Screen>
  );
}

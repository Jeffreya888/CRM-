import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { Button, Card, ErrorBanner, Field, IconButton, Ionicons, Row, Screen, Section, T } from '../../../components/ui';
import { AIRCRAFT_CATEGORIES, categoryLabel, guessCategory } from '../../../lib/pricing';
import { PLANS } from '../../../lib/plans';
import { useOrg } from '../../../lib/session';
import { friendlyError, supabase } from '../../../lib/supabase';
import { colors, radius, space } from '../../../lib/theme';
import type { AircraftCategory } from '../../../lib/types';

type NewAircraft = { type: string; tail: string; category: AircraftCategory };

/** Quick customer creation with their aircraft (full details live in /customers/edit). */
export default function NewCustomer() {
  const { orgId, plan, session } = useOrg();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [company, setCompany] = useState('');
  const [address, setAddress] = useState('');
  const [type, setType] = useState('');
  const [tail, setTail] = useState('');
  const [planes, setPlanes] = useState<NewAircraft[]>([]);
  const [error, setError] = useState<string | null>(null);

  const addPlane = () => {
    if (!tail.trim()) return setError('Enter the registration (tail number) to add an aircraft');
    setError(null);
    setPlanes((p) => [...p, { type: type.trim(), tail: tail.trim().toUpperCase().replace(/\s/g, ''), category: guessCategory(type) }]);
    setType('');
    setTail('');
  };
  // Cycle the guessed class if it's wrong.
  const cycleClass = (i: number) => setPlanes((ps) => ps.map((p, j) => {
    if (j !== i) return p;
    const idx = AIRCRAFT_CATEGORIES.findIndex((c) => c.value === p.category);
    return { ...p, category: AIRCRAFT_CATEGORIES[(idx + 1) % AIRCRAFT_CATEGORIES.length]!.value };
  }));

  const valid = name.trim().length > 1 && /\S+@\S+\.\S+/.test(email.trim()) && phone.replace(/\D/g, '').length >= 7;

  const create = async () => {
    setError(null);
    // An aircraft typed but not yet added counts too.
    const all = tail.trim() ? [...planes, { type: type.trim(), tail: tail.trim().toUpperCase().replace(/\s/g, ''), category: guessCategory(type) }] : planes;
    try {
      const limit = PLANS.find((p) => p.id === plan)?.customerLimit;
      if (limit) {
        const { count } = await supabase.from('customers').select('id', { count: 'exact', head: true }).eq('org_id', orgId);
        if ((count ?? 0) >= limit) {
          setError(`Your plan includes ${limit} customers. Upgrade for unlimited.`);
          router.push('/paywall');
          return;
        }
      }
      const { data: c, error } = await supabase.from('customers').insert({
        org_id: orgId, name: name.trim(), email: email.trim(), phone: phone.trim(),
        company: company.trim() || null, billing_address: address.trim() || null, created_by: session!.user.id,
      }).select('id').single();
      if (error) throw error;
      if (all.length) {
        const { error: aErr } = await supabase.from('aircraft').insert(all.map((p) => {
          const [manufacturer, ...rest] = p.type.split(/\s+/);
          return { org_id: orgId, customer_id: c.id, tail_number: p.tail, manufacturer: rest.length ? manufacturer : null, model: rest.length ? rest.join(' ') : p.type || null, category: p.category };
        }));
        if (aErr) throw aErr;
      }
      router.replace(`/customers/${c.id}`);
    } catch (e: any) {
      setError(friendlyError(e.message));
    }
  };

  const small = { backgroundColor: colors.cardRaised, borderRadius: 10, paddingHorizontal: space.lg, paddingVertical: 13, fontSize: 16, color: colors.text, marginBottom: space.sm };

  return (
    <Screen footer={<Button title="Create Customer" onPress={create} disabled={!valid} />}>
      <Stack.Screen options={{ title: 'New Customer' }} />
      <ErrorBanner message={error} />
      <Field label="Name *" icon="person-outline" placeholder="Full name" value={name} onChangeText={setName} autoCapitalize="words" textContentType="name" />
      <Field label="Email *" icon="mail-outline" placeholder="email@example.com" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" textContentType="emailAddress" />
      <Field label="Phone *" icon="call-outline" placeholder="(555) 123-4567" value={phone} onChangeText={setPhone} keyboardType="phone-pad" textContentType="telephoneNumber" />
      <Field label="Company (Optional)" icon="business-outline" placeholder="Company name" value={company} onChangeText={setCompany} />
      <Field label="Address (Optional)" icon="location-outline" placeholder="Full address" value={address} onChangeText={setAddress} />

      <Section title="Aircraft">
        <Card>
          {planes.map((p, i) => (
            <Row key={i} style={{ marginBottom: space.sm, backgroundColor: colors.cardRaised, borderRadius: 10, padding: space.md }}>
              <Ionicons name="airplane" size={18} color={colors.warning} />
              <View style={{ flex: 1 }}>
                <T style={{ fontWeight: '600' }}>{p.tail}</T>
                <T variant="small">{p.type || 'Type not set'}</T>
              </View>
              <Pressable onPress={() => cycleClass(i)} style={{ backgroundColor: colors.primarySoft, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4 }}>
                <T variant="small" style={{ color: colors.primaryText }}>{categoryLabel(p.category)}</T>
              </Pressable>
              <IconButton icon="close" color={colors.textMuted} label="Remove aircraft" onPress={() => setPlanes((ps) => ps.filter((_, j) => j !== i))} />
            </Row>
          ))}
          {planes.length ? <T variant="small" style={{ marginBottom: space.md }}>Tap the class to change it. It&apos;s used for size-based pricing.</T> : null}
          <T variant="muted" style={{ marginBottom: space.sm }}>Add Aircraft</T>
          <TextInput style={small} placeholder="Aircraft type (e.g., Cessna 172)" placeholderTextColor={colors.textFaint} value={type} onChangeText={setType} />
          <TextInput style={small} placeholder="Registration (e.g., N12345)" placeholderTextColor={colors.textFaint} value={tail} onChangeText={setTail} autoCapitalize="characters" />
          <Pressable onPress={addPlane} style={({ pressed }) => [{ ...small, marginBottom: 0, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6 }, pressed && { opacity: 0.7 }]}>
            <Ionicons name="add" size={20} color={colors.textMuted} />
            <T style={{ color: colors.textMuted }}>Add Aircraft</T>
          </Pressable>
        </Card>
      </Section>
    </Screen>
  );
}

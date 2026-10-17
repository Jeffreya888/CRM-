import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { notify } from '../../../components/FormSheet';
import { AssetDraftFields } from '../../../components/assets/AssetDraftFields';
import { Button, Card, ErrorBanner, Field, IconButton, Ionicons, Row, Screen, Section, Segmented, T } from '../../../components/ui';
import { assetIcon, draftIdentifier, draftToRow, emptyDraft, validateDraft, type AssetDraft } from '../../../lib/assets';
import { assetTypeInfo, categoryLabel } from '../../../lib/pricing';
import { useOrg } from '../../../lib/session';
import { friendlyError, supabase } from '../../../lib/supabase';
import { colors, radius, space } from '../../../lib/theme';
import type { AssetType } from '../../../lib/types';

/** Quick customer creation with their assets (more details live in /customers/edit). */
export default function NewCustomer() {
  const { orgId, session, businessTypes, perm } = useOrg();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [company, setCompany] = useState('');
  const [address, setAddress] = useState('');
  const [assets, setAssets] = useState<AssetDraft[]>([]);
  const [draft, setDraft] = useState<AssetDraft>(emptyDraft(businessTypes[0] ?? 'aircraft'));
  const [draftKey, setDraftKey] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const draftStarted = !!draftIdentifier(draft);

  const addAsset = () => {
    const msg = validateDraft(draft);
    if (msg) return setError(msg);
    const ident = draftIdentifier(draft).toLowerCase();
    if (assets.some((a) => draftIdentifier(a).toLowerCase() === ident)) return setError('You already added that one.');
    setError(null);
    setAssets((a) => [...a, draft]);
    setDraft(emptyDraft(draft.asset_type));
    setDraftKey((k) => k + 1);
  };

  const switchType = (t: AssetType) => {
    setDraft(emptyDraft(t));
    setDraftKey((k) => k + 1);
  };

  const emailOk = !email.trim() || /\S+@\S+\.\S+/.test(email.trim());
  const valid = name.trim().length > 1 && emailOk && (!!email.trim() || phone.replace(/\D/g, '').length >= 7);

  const create = async () => {
    setError(null);
    // An asset typed but not yet added counts too.
    const all = draftStarted ? [...assets, draft] : assets;
    for (const a of all) {
      const msg = validateDraft(a);
      if (msg) return setError(msg);
    }
    setSaving(true);
    try {
      const { data: c, error: cErr } = await supabase.from('customers').insert({
        org_id: orgId, name: name.trim(), email: email.trim() || null, phone: phone.trim() || null,
        company: company.trim() || null, billing_address: address.trim() || null, created_by: session!.user.id,
      }).select('id').single();
      if (cErr) throw cErr;
      if (all.length) {
        const { error: aErr } = await supabase.from('aircraft').insert(all.map((a) => ({ ...draftToRow(a), org_id: orgId, customer_id: c.id })));
        if (aErr) {
          // The customer is saved; say which part failed.
          notify('Customer saved, assets not added', friendlyError(aErr.message));
        }
      }
      router.replace(`/customers/${c.id}`);
    } catch (e: any) {
      setError(friendlyError(e.message));
    } finally {
      setSaving(false);
    }
  };

  if (!perm('edit_customers')) {
    return (
      <Screen>
        <Stack.Screen options={{ title: 'New customer' }} />
        <ErrorBanner message="You don't have permission to add customers. Ask your company owner." />
      </Screen>
    );
  }

  return (
    <Screen footer={<Button title="Create customer" onPress={create} disabled={!valid} loading={saving} />}>
      <Stack.Screen options={{ title: 'New customer' }} />
      <ErrorBanner message={error} />
      <Field label="Name *" icon="person-outline" placeholder="Full name" value={name} onChangeText={setName} autoCapitalize="words" textContentType="name" />
      <Field label="Email" icon="mail-outline" placeholder="email@example.com" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" textContentType="emailAddress"
        error={emailOk ? null : 'Check the email address'} />
      <Field label="Phone" icon="call-outline" placeholder="(555) 123-4567" value={phone} onChangeText={setPhone} keyboardType="phone-pad" textContentType="telephoneNumber"
        hint="Add an email or a phone number so you can reach them." />
      <Field label="Company (optional)" icon="business-outline" placeholder="Company name" value={company} onChangeText={setCompany} />
      <Field label="Address (optional)" icon="location-outline" placeholder="Billing address" value={address} onChangeText={setAddress} />

      <Section title="Assets" count={assets.length ? `${assets.length} added` : undefined}>
        {assets.map((a, i) => (
          <Row key={i} style={{ marginBottom: space.sm, backgroundColor: colors.card, borderRadius: radius.md, padding: space.md, borderWidth: 1, borderColor: colors.border }}>
            <Ionicons name={assetIcon(a.asset_type)} size={20} color={colors.warning} />
            <View style={{ flex: 1 }}>
              <T style={{ fontWeight: '600' }}>{draftIdentifier(a)}</T>
              <T variant="small">{[a.year, a.manufacturer, a.model].filter(Boolean).join(' ') || assetTypeInfo(a.asset_type).label} · {categoryLabel(a.category)}</T>
            </View>
            <IconButton icon="close" color={colors.textMuted} label="Remove" onPress={() => setAssets((xs) => xs.filter((_, j) => j !== i))} />
          </Row>
        ))}
        <Card>
          <T variant="h3" style={{ marginBottom: space.md }}>Add {assets.length ? 'another' : 'an'} asset</T>
          {businessTypes.length > 1 ? (
            <Segmented value={draft.asset_type} onChange={switchType}
              options={businessTypes.map((t) => ({ value: t, label: assetTypeInfo(t).label }))} />
          ) : null}
          <AssetDraftFields key={draftKey} draft={draft} onChange={setDraft} />
          <Button kind="secondary" icon="add" title={`Add ${assetTypeInfo(draft.asset_type).label.toLowerCase()}`} onPress={addAsset} />
        </Card>
        <T variant="small" style={{ marginTop: space.xs }}>Size class and length are used for size-based pricing. You can add photos and more details later.</T>
      </Section>
    </Screen>
  );
}

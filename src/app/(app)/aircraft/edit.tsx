import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Image } from 'react-native';
import { AssetDraftFields } from '../../../components/assets/AssetDraftFields';
import { confirmAction, FormFields, normalize, validate, type FieldDef, type FormValues } from '../../../components/FormSheet';
import { Button, Card, ErrorBanner, Field, Loading, Row, Screen, Section, Segmented, T } from '../../../components/ui';
import { draftFromAsset, draftToRow, emptyDraft, facilityKindInfo, validateDraft, type AssetDraft } from '../../../lib/assets';
import { pickImage, signedUrls, uploadImage } from '../../../lib/files';
import { useLookups } from '../../../lib/lookups';
import { assetTypeInfo } from '../../../lib/pricing';
import { useOrg } from '../../../lib/session';
import { friendlyError, supabase } from '../../../lib/supabase';
import { radius, space } from '../../../lib/theme';
import type { AssetType } from '../../../lib/types';

export default function AssetEdit() {
  const { id, customer_id, type } = useLocalSearchParams<{ id?: string; customer_id?: string; type?: AssetType }>();
  const { orgId, businessTypes, perm, role } = useOrg();
  const { customerOptions, locations } = useLookups();
  const startType: AssetType = type && businessTypes.includes(type) ? type : businessTypes[0] ?? 'aircraft';
  const [draft, setDraft] = useState<AssetDraft | null>(id ? null : emptyDraft(startType));
  const [draftKey, setDraftKey] = useState(0);
  const [values, setValues] = useState<FormValues | null>(id ? null : { customer_id: customer_id ?? null, active: true });
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!id) return;
    supabase.from('aircraft').select('*').eq('id', id).single().then(async ({ data, error: e }) => {
      if (e || !data) return setError(friendlyError(e?.message ?? 'Not found'));
      setDraft(draftFromAsset(data));
      setValues(data);
      if (data.photo_path) {
        try { setPhotoUri((await signedUrls([data.photo_path]))[data.photo_path] ?? null); } catch { /* photo optional */ }
      }
    });
  }, [id]);

  if (!draft || !values) return <Screen><Stack.Screen options={{ title: 'Edit asset' }} />{error ? <ErrorBanner message={error} /> : <Loading />}</Screen>;
  if (!perm('edit_customers')) return <Screen><Stack.Screen options={{ title: 'Asset' }} /><ErrorBanner message="You don't have permission to edit assets." /></Screen>;

  const t = draft.asset_type;
  const info = assetTypeInfo(t);
  // Facilities that suit this type first (airports for aircraft, marinas for boats, sites for vehicles).
  const wantKind = t === 'aircraft' ? 'airport' : t === 'watercraft' ? 'marina' : 'service_site';
  const facilityOptions = [...locations].sort((a, b) => Number(b.kind === wantKind) - Number(a.kind === wantKind))
    .map((l) => ({ value: l.id, label: [l.airport_code, l.name].filter(Boolean).join(' · '), hint: [facilityKindInfo(l.kind).label, l.fbo_name].filter(Boolean).join(' · ') }));

  const fields: FieldDef[] = [
    { key: 'customer_id', label: 'Owner / customer', type: 'select', options: customerOptions, allowClear: true },
    { key: 'home_location_id', label: t === 'aircraft' ? 'Home airport / FBO' : t === 'watercraft' ? 'Home marina' : 'Usual service site', type: 'select', options: facilityOptions, allowClear: true },
    { key: 'exterior_colors', label: 'Colors / paint scheme', type: 'text' },
    { key: 'paint_condition', label: t === 'watercraft' ? 'Gelcoat / paint condition' : 'Paint condition', type: 'text', placeholder: 'Excellent, oxidized, chips…' },
    { key: 'interior_notes', label: 'Interior notes', type: 'multiline', placeholder: 'Leather type, carpet, special products' },
    { key: 'coating_type', label: 'Coating / protection', type: 'text', placeholder: 'Ceramic brand, wax, sealant' },
    { key: 'coating_applied_on', label: 'Coating applied on', type: 'date' },
    { key: 'notes', label: 'Notes', type: 'multiline', placeholder: 'Sensors to avoid, owner preferences, access' },
    { key: 'active', label: 'Active', type: 'toggle', hint: 'Inactive assets are hidden from pickers (sold, moved away).' },
  ];

  const save = async () => {
    const msg = validateDraft(draft) ?? validate(fields, values);
    if (msg) return setError(msg);
    setSaving(true);
    setError(null);
    try {
      const row: Record<string, unknown> = { ...normalize(fields, values), ...draftToRow(draft) };
      if (photoUri && !photoUri.startsWith('http')) row.photo_path = await uploadImage(orgId, 'aircraft', photoUri);
      if (id) {
        const { error: e } = await supabase.from('aircraft').update(row).eq('id', id);
        if (e) throw e;
        router.back();
      } else {
        const { data, error: e } = await supabase.from('aircraft').insert({ ...row, org_id: orgId }).select('id').single();
        if (e) throw e;
        router.replace(`/aircraft/${data.id}`);
      }
    } catch (e: any) {
      const m = String(e.message ?? '');
      setError(m.includes('duplicate key') ? `${info.idLabel} "${draftToRow(draft).tail_number}" is already used by another asset.` : friendlyError(m));
    } finally {
      setSaving(false);
    }
  };

  const remove = () => confirmAction('Delete this asset?', 'Its reminders are deleted too. Assets with past jobs cannot be deleted. Mark them inactive instead.', async () => {
    const { error: e } = await supabase.from('aircraft').delete().eq('id', id!);
    if (e) setError(e.message.includes('foreign key') ? 'This asset has jobs or quotes. Turn off "Active" instead.' : friendlyError(e.message));
    else router.replace('/aircraft');
  }, true);

  return (
    <Screen footer={<Button title={id ? 'Save changes' : `Add ${info.label.toLowerCase()}`} onPress={save} loading={saving} />}>
      <Stack.Screen options={{ title: id ? `Edit ${info.label.toLowerCase()}` : 'New asset' }} />
      <ErrorBanner message={error} />
      {!id && businessTypes.length > 1 ? (
        <Segmented value={t} onChange={(nt) => { setDraft(emptyDraft(nt)); setDraftKey((k) => k + 1); }}
          options={businessTypes.map((x) => ({ value: x, label: assetTypeInfo(x).label }))} />
      ) : null}
      <AssetDraftFields key={draftKey} draft={draft} onChange={setDraft} />
      {t === 'aircraft' ? (
        <Row gap={space.sm}>
          <Field style={{ flex: 1 }} label="Year" keyboardType="number-pad" maxLength={4} value={draft.year} onChangeText={(v) => setDraft({ ...draft, year: v })} />
          <Field style={{ flex: 1 }} label="Serial number" autoCapitalize="characters" value={draft.serial_number} onChangeText={(v) => setDraft({ ...draft, serial_number: v })} />
        </Row>
      ) : null}

      <Section title="Photo">
        <Card>
          {photoUri ? <Image source={{ uri: photoUri }} style={{ width: '100%', height: 180, borderRadius: radius.md, marginBottom: space.sm }} /> : <T variant="muted" style={{ marginBottom: space.sm }}>No photo yet.</T>}
          <Row>
            <Button small kind="secondary" icon="camera-outline" title="Take photo" onPress={async () => { try { const u = await pickImage('camera'); if (u) setPhotoUri(u); } catch (e: any) { setError(e.message); } }} />
            <Button small kind="secondary" icon="images-outline" title="Choose" onPress={async () => { try { const u = await pickImage('library'); if (u) setPhotoUri(u); } catch (e: any) { setError(e.message); } }} />
          </Row>
        </Card>
      </Section>

      <Section title="Details">
        <FormFields fields={fields} values={values} setValue={(k, v) => setValues((s) => ({ ...s!, [k]: v }))} />
      </Section>
      {id && perm('delete_records') && ['owner', 'admin', 'manager'].includes(role ?? '') ? (
        <Button kind="ghost" icon="trash-outline" title="Delete asset" onPress={remove} />
      ) : null}
    </Screen>
  );
}

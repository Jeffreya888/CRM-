import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Image } from 'react-native';
import { AssetDraftFields } from '../../../components/assets/AssetDraftFields';
import { ConditionSelector } from '../../../components/assets/Condition';
import { FaaSuggestion, type FaaLookupState } from '../../../components/assets/FaaCard';
import { confirmAction, FormFields, normalize, validate, type FieldDef, type FormValues } from '../../../components/FormSheet';
import { Button, Card, ErrorBanner, Field, Loading, Row, Screen, Section, Segmented, T } from '../../../components/ui';
import { isLookupReady, lookupFaa, normalizeTail, rememberFaaModel, titleCase } from '../../../lib/faa';
import { draftFromAsset, draftToRow, emptyDraft, facilityKindInfo, validateDraft, type AssetDraft } from '../../../lib/assets';
import { pickImage, signedUrls, uploadImage } from '../../../lib/files';
import { useLookups } from '../../../lib/lookups';
import { assetTypeInfo } from '../../../lib/pricing';
import { useOrg } from '../../../lib/session';
import { friendlyError, supabase } from '../../../lib/supabase';
import { radius, space } from '../../../lib/theme';
import type { AssetType, ConditionLevel, FaaLookupFound } from '../../../lib/types';

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
  const [condition, setCondition] = useState<ConditionLevel | null>(null);
  // What the record held when loaded (edit mode): skip the FAA lookup for an unchanged, already-checked tail.
  const [orig, setOrig] = useState<{ tail: string; hasFaa: boolean; condition: ConditionLevel | null } | null>(null);
  const [faa, setFaa] = useState<{ tail: string; state: FaaLookupState } | null>(null);
  // FAA result the user applied with "Use these details" (saved into aircraft.faa).
  const [faaUsed, setFaaUsed] = useState<{ tail: string; data: FaaLookupFound } | null>(null);

  useEffect(() => {
    if (!id) return;
    supabase.from('aircraft').select('*').eq('id', id).single().then(async ({ data, error: e }) => {
      if (e || !data) return setError(friendlyError(e?.message ?? 'Not found'));
      setDraft(draftFromAsset(data));
      setValues(data);
      setCondition(data.condition_level ?? null);
      setOrig({ tail: normalizeTail(data.tail_number), hasFaa: !!data.faa, condition: data.condition_level ?? null });
      if (data.photo_path) {
        try { setPhotoUri((await signedUrls([data.photo_path]))[data.photo_path] ?? null); } catch { /* photo optional */ }
      }
    });
  }, [id]);

  // Debounced FAA lookup as a US tail number is typed (aircraft only).
  const tailKey = draft?.asset_type === 'aircraft' ? normalizeTail(draft.tail_number) : '';
  const shouldLookup = isLookupReady(tailKey) && !(orig && orig.hasFaa && orig.tail === tailKey);
  useEffect(() => {
    if (!shouldLookup || !orgId) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      setFaa({ tail: tailKey, state: { status: 'loading' } });
      try {
        const result = await lookupFaa(orgId, tailKey);
        if (!cancelled) setFaa({ tail: tailKey, state: { status: 'done', result } });
      } catch (e: any) {
        if (!cancelled) setFaa({ tail: tailKey, state: { status: 'error', message: friendlyError(e?.message ?? '') } });
      }
    }, 600);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [tailKey, shouldLookup, orgId]);

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

  const faaCurrent = shouldLookup && faa?.tail === tailKey ? faa.state : null;
  const faaApplied = !!faaUsed && faaUsed.tail === tailKey && t === 'aircraft';

  // Fills the form from the FAA result. Only runs when the user taps "Use these details".
  const applyFaa = (f: FaaLookupFound) => {
    const c = f.catalog;
    setDraft((d) => d && ({
      ...d,
      manufacturer: c?.manufacturer ?? titleCase(f.faa_manufacturer),
      model: c?.model ?? f.faa_model,
      model_id: c ? f.model_id : null,
      category: c?.category ?? d.category,
      length_ft: c?.length_ft != null ? String(c.length_ft) : d.length_ft,
      wingspan_ft: c?.wingspan_ft != null ? String(c.wingspan_ft) : d.wingspan_ft,
      year: f.year ? String(f.year) : d.year,
      serial_number: f.serial ?? d.serial_number,
    }));
    setDraftKey((k) => k + 1); // refresh the type text in the model picker
    setFaaUsed({ tail: tailKey, data: f });
  };

  const save = async () => {
    const msg = validateDraft(draft) ?? validate(fields, values);
    if (msg) return setError(msg);
    setSaving(true);
    setError(null);
    try {
      const row: Record<string, unknown> = { ...normalize(fields, values), ...draftToRow(draft) };
      if (photoUri && !photoUri.startsWith('http')) row.photo_path = await uploadImage(orgId, 'aircraft', photoUri);
      row.condition_level = condition;
      if (condition !== (orig?.condition ?? null)) row.condition_updated_at = new Date().toISOString();
      if (faaApplied) { row.faa = faaUsed!.data; row.faa_checked_at = new Date().toISOString(); }
      let savedId = id;
      if (id) {
        const { error: e } = await supabase.from('aircraft').update(row).eq('id', id);
        if (e) throw e;
      } else {
        const { data, error: e } = await supabase.from('aircraft').insert({ ...row, org_id: orgId }).select('id').single();
        if (e) throw e;
        savedId = data.id;
      }
      // Teach the FAA lookup when the user picked a different catalog model than suggested.
      if (faaApplied && draft.model_id && draft.model_id !== faaUsed!.data.model_id) {
        try { await rememberFaaModel(orgId, tailKey, draft.model_id); } catch { /* learning is best-effort */ }
      }
      if (id) router.back();
      else router.replace(`/aircraft/${savedId}`);
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
      <AssetDraftFields key={draftKey} draft={draft} onChange={setDraft}
        belowTail={faaCurrent ? (
          <FaaSuggestion state={faaCurrent} applied={faaApplied} needsModel={faaApplied && !draft.model_id}
            onUse={() => { if (faaCurrent.status === 'done' && faaCurrent.result.found) applyFaa(faaCurrent.result); }} />
        ) : null} />
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

      <Section title="Condition" icon="sparkles-outline">
        <ConditionSelector value={condition} onChange={setCondition} />
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

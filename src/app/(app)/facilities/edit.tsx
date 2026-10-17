import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { confirmAction, FormFields, normalize, validate, type FieldDef, type FormValues } from '../../../components/FormSheet';
import { Button, Card, ErrorBanner, Field, IconButton, Loading, Row, Screen, Section, Segmented, T } from '../../../components/ui';
import { FACILITY_KINDS, facilityKindsFor, SITE_TYPES, type FacilityKind } from '../../../lib/assets';
import { canEdit, isManager } from '../../../lib/plans';
import { useOrg } from '../../../lib/session';
import { friendlyError, supabase } from '../../../lib/supabase';
import { colors, space } from '../../../lib/theme';

type Fee = { name: string; amount: string };

export default function FacilityEdit() {
  const { id, kind: kindParam } = useLocalSearchParams<{ id?: string; kind?: FacilityKind }>();
  const { orgId, role, businessTypes, perm } = useOrg();
  const manager = isManager(role);
  const enabledKinds = facilityKindsFor(businessTypes);
  const startKind: FacilityKind = enabledKinds.some((k) => k.value === kindParam) ? kindParam! : enabledKinds[0]?.value ?? 'airport';
  const [values, setValues] = useState<FormValues | null>(id ? null : {
    kind: startKind, site_type: startKind === 'service_site' ? 'residence' : null, has_water: true, has_power: true, hangar_available: false, hangar_capacity: '1', active: true,
  });
  const [fees, setFees] = useState<Fee[]>([]);
  const [gate, setGate] = useState({ gate_code: '', notes: '' });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!id) return;
    (async () => {
      const [{ data, error: e }, sec] = await Promise.all([
        supabase.from('locations').select('*').eq('id', id).single(),
        manager ? supabase.from('location_secrets').select('gate_code, notes').eq('location_id', id).maybeSingle() : Promise.resolve({ data: null }),
      ]);
      if (e || !data) return setError(friendlyError(e?.message ?? 'Not found'));
      setValues({ ...data, hangar_capacity: String(data.hangar_capacity ?? 1), latitude: data.latitude ?? '', longitude: data.longitude ?? '' });
      setFees(((data.fees ?? []) as { name: string; amount: number }[]).map((f) => ({ name: f.name, amount: String(f.amount ?? '') })));
      if (sec.data) setGate({ gate_code: sec.data.gate_code ?? '', notes: sec.data.notes ?? '' });
    })();
  }, [id, manager]);

  if (!values) return <Screen><Stack.Screen options={{ title: 'Edit facility' }} />{error ? <ErrorBanner message={error} /> : <Loading />}</Screen>;
  if (!canEdit(role)) return <Screen><Stack.Screen options={{ title: 'Facility' }} /><ErrorBanner message="You don't have permission to edit facilities." /></Screen>;

  const kind = values.kind as FacilityKind;
  const kindOptions = FACILITY_KINDS.filter((k) => enabledKinds.includes(k) || k.value === kind);
  const isAirport = kind === 'airport';
  const isSite = kind === 'service_site';

  const fields: FieldDef[] = [
    ...(isSite ? [{ key: 'site_type', label: 'Site type', type: 'select', options: SITE_TYPES } as FieldDef] : []),
    ...(isAirport ? [{ key: 'airport_code', label: 'Airport code', type: 'text', placeholder: 'KTEB' } as FieldDef] : []),
    { key: 'name', label: 'Name', type: 'text', required: true, placeholder: isAirport ? 'Teterboro' : kind === 'marina' ? 'Bahia Mar Marina' : 'Smith residence, ABC fleet yard…' },
    { key: 'fbo_name', label: isAirport ? 'FBO / hangar' : kind === 'marina' ? 'Dock / slip' : 'Building / bay', type: 'text', placeholder: isAirport ? 'Signature, Atlantic, Million Air…' : undefined },
    { key: 'address', label: 'Address', type: 'multiline' },
    { key: 'contact_phone', label: isAirport ? 'FBO phone' : kind === 'marina' ? 'Dock master phone' : 'Site contact phone', type: 'phone' },
    { key: 'access_notes', label: 'Access notes', type: 'multiline', placeholder: 'Badge escort, where to park the van, check in at front desk' },
  ];
  const utilityFields: FieldDef[] = [
    { key: 'has_water', label: 'Water available', type: 'toggle' },
    { key: 'has_power', label: 'Power available', type: 'toggle' },
    { key: 'hangar_available', label: isAirport ? 'Hangar available' : 'Indoor space available', type: 'toggle', hint: 'Lets you book it for jobs.' },
    ...(values.hangar_available ? [
      { key: 'hangar_capacity', label: isAirport ? 'Hangar capacity (aircraft at once)' : 'Indoor capacity', type: 'number' } as FieldDef,
      { key: 'hangar_notes', label: isAirport ? 'Hangar size / door clearance' : 'Size / clearance notes', type: 'multiline', placeholder: 'Door 28 ft tall, fits up to G550' } as FieldDef,
    ] : []),
  ];
  const mapFields: FieldDef[] = [
    { key: 'latitude', label: 'Latitude', type: 'number', placeholder: '40.8501' },
    { key: 'longitude', label: 'Longitude', type: 'number', placeholder: '-74.0608' },
  ];
  const all = [...fields, ...utilityFields, ...mapFields, { key: 'active', label: 'Active', type: 'toggle' } as FieldDef];
  const setValue = (k: string, v: any) => setValues((s) => ({ ...s!, [k]: v }));

  const save = async () => {
    const msg = validate(all, values);
    if (msg) return setError(msg);
    const row = normalize(all, values);
    if ((row.latitude == null) !== (row.longitude == null)) return setError('Enter both latitude and longitude, or neither');
    if (row.latitude != null && (Math.abs(row.latitude) > 90 || Math.abs(row.longitude) > 180)) return setError('Those coordinates look wrong');
    const cleanFees = fees.filter((f) => f.name.trim()).map((f) => ({ name: f.name.trim(), amount: Number(String(f.amount).replace(/[^0-9.]/g, '')) || 0 }));
    const payload = {
      ...row,
      kind,
      site_type: isSite ? row.site_type ?? 'other' : null,
      airport_code: isAirport && row.airport_code ? String(row.airport_code).toUpperCase() : null,
      hangar_capacity: row.hangar_available ? Math.max(0, Math.round(row.hangar_capacity ?? 1)) : (row.hangar_capacity ?? 1),
      fees: cleanFees,
    };
    setSaving(true);
    setError(null);
    try {
      let locId = id;
      if (id) {
        const { error: e } = await supabase.from('locations').update(payload).eq('id', id);
        if (e) throw e;
      } else {
        const { data, error: e } = await supabase.from('locations').insert({ ...payload, org_id: orgId }).select('id').single();
        if (e) throw e;
        locId = data.id;
      }
      if (manager && locId) {
        const { error: se } = await supabase.from('location_secrets').upsert({
          location_id: locId, org_id: orgId, gate_code: gate.gate_code.trim() || null, notes: gate.notes.trim() || null,
        });
        if (se) throw se;
      }
      if (id) router.back(); else router.replace(`/facilities/${locId}`);
    } catch (e: any) {
      setError(friendlyError(e.message));
    } finally {
      setSaving(false);
    }
  };

  const remove = () => confirmAction('Delete this facility?', 'Assets and jobs linked to it keep their records but lose the link. You can archive it instead by turning off Active.', async () => {
    const { error: e } = await supabase.from('locations').delete().eq('id', id!);
    if (e) setError(friendlyError(e.message));
    else router.replace('/facilities');
  }, true);

  return (
    <Screen footer={<Button title={id ? 'Save changes' : 'Add facility'} onPress={save} loading={saving} />}>
      <Stack.Screen options={{ title: id ? 'Edit facility' : 'New facility' }} />
      <ErrorBanner message={error} />
      {kindOptions.length > 1 ? (
        <Segmented value={kind} onChange={(k) => setValues((s) => ({ ...s!, kind: k, site_type: k === 'service_site' ? s!.site_type ?? 'residence' : null }))}
          options={kindOptions.map((k) => ({ value: k.value, label: k.label }))} />
      ) : null}
      <FormFields fields={fields} values={values} setValue={setValue} />

      {manager ? (
        <Section title="Private gate / access code" icon="key-outline">
          <Card>
            <T variant="small" style={{ marginBottom: space.md }}>Only owners and managers can see this.</T>
            <Field label="Gate / access code" value={gate.gate_code} autoCapitalize="none" autoCorrect={false} onChangeText={(v) => setGate((g) => ({ ...g, gate_code: v }))} />
            <Field label="Private notes" multiline value={gate.notes} onChangeText={(v) => setGate((g) => ({ ...g, notes: v }))} placeholder="Door codes, lockbox, who to call after hours" />
          </Card>
        </Section>
      ) : null}

      <Section title="Water, power & hangar">
        <FormFields fields={utilityFields} values={values} setValue={setValue} />
      </Section>

      <Section title="Facility fees" icon="cash-outline">
        <Card>
          <T variant="small" style={{ marginBottom: space.md }}>Ramp, access or after-hours fees you pay here. They can be added to job costs.</T>
          {fees.map((f, i) => (
            <Row key={i} gap={space.sm} style={{ alignItems: 'flex-start' }}>
              <Field style={{ flex: 2 }} placeholder="Ramp fee" value={f.name} onChangeText={(v) => setFees((xs) => xs.map((x, j) => (j === i ? { ...x, name: v } : x)))} />
              <Field style={{ flex: 1 }} placeholder="$0" keyboardType="decimal-pad" value={f.amount} onChangeText={(v) => setFees((xs) => xs.map((x, j) => (j === i ? { ...x, amount: v } : x)))} />
              <View style={{ paddingTop: 10 }}>
                <IconButton icon="close-circle-outline" color={colors.textMuted} label="Remove fee" onPress={() => setFees((xs) => xs.filter((_, j) => j !== i))} />
              </View>
            </Row>
          ))}
          <Button small kind="secondary" icon="add" title="Add fee" style={{ alignSelf: 'flex-start' }} onPress={() => setFees((xs) => [...xs, { name: '', amount: '' }])} />
        </Card>
      </Section>

      <Section title="Map pin" icon="pin-outline">
        <Card>
          <T variant="small" style={{ marginBottom: space.md }}>
            Optional. Add coordinates for an exact spot (like a hangar or gate). Without them, directions use the address.
          </T>
          <Row gap={space.sm}>
            <View style={{ flex: 1 }}><FormFields fields={[mapFields[0]!]} values={values} setValue={setValue} /></View>
            <View style={{ flex: 1 }}><FormFields fields={[mapFields[1]!]} values={values} setValue={setValue} /></View>
          </Row>
          {values.latitude !== '' && values.latitude != null ? (
            <Button small kind="ghost" icon="home-outline" title="Use address instead" style={{ alignSelf: 'flex-start' }}
              onPress={() => setValues((s) => ({ ...s!, latitude: '', longitude: '' }))} />
          ) : null}
        </Card>
      </Section>

      <Section title="Status">
        <FormFields fields={[{ key: 'active', label: 'Active', type: 'toggle', hint: 'Archived facilities are hidden from pickers.' }]} values={values} setValue={setValue} />
      </Section>
      {id && manager && perm('delete_records') ? <Button kind="ghost" icon="trash-outline" title="Delete facility" onPress={remove} /> : null}
    </Screen>
  );
}

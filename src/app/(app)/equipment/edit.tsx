import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Image, View } from 'react-native';
import { PhotoField } from '../../../components/equipment/Sheets';
import { confirmAction, FormFields, normalize, validate, type FieldDef, type FormValues } from '../../../components/FormSheet';
import { Button, Card, ErrorBanner, Loading, Screen, Section, T } from '../../../components/ui';
import { signedUrls, uploadImage } from '../../../lib/files';
import { EQUIPMENT_STATUS, type Equipment, type EquipmentStatus } from '../../../lib/inventory';
import { useLookups } from '../../../lib/lookups';
import { isManager } from '../../../lib/plans';
import { useOrg } from '../../../lib/session';
import { friendlyError, supabase } from '../../../lib/supabase';
import { colors, radius, space } from '../../../lib/theme';

export default function EquipmentEdit() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { orgId, role, perm, can } = useOrg();
  const { memberOptions, locationOptions, branchOptions } = useLookups();
  const showMoney = perm('see_prices');
  const manager = isManager(role);
  const [values, setValues] = useState<FormValues | null>(id ? null : { status: 'in_service', bookable: false, usage_hours: '0' });
  const [photoPath, setPhotoPath] = useState<string | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [newPhoto, setNewPhoto] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!id) return;
    (async () => {
      const { data, error: e } = await supabase.from('equipment').select('*').eq('id', id).single();
      if (e || !data) return setError(friendlyError(e?.message ?? 'Equipment not found'));
      const eq = data as Equipment;
      setValues({ ...eq, usage_hours: String(eq.usage_hours ?? 0), purchase_cost: eq.purchase_cost == null ? '' : String(eq.purchase_cost) });
      setPhotoPath(eq.photo_path);
      if (eq.photo_path) {
        const urls = await signedUrls([eq.photo_path]).catch(() => ({} as Record<string, string>));
        setPhotoUrl(urls[eq.photo_path] ?? null);
      }
    })();
  }, [id]);

  if (!values) return <Screen><Stack.Screen options={{ title: 'Edit equipment' }} />{error ? <ErrorBanner message={error} /> : <Loading />}</Screen>;
  if (!manager) return <Screen><Stack.Screen options={{ title: 'Equipment' }} /><ErrorBanner message="Only owners and managers can add or edit equipment." /></Screen>;

  const status = (values.status ?? 'in_service') as EquipmentStatus;
  const basics: FieldDef[] = [
    { key: 'name', label: 'Name', type: 'text', required: true, placeholder: 'Hot-water pressure washer' },
    { key: 'category', label: 'Category', type: 'text', placeholder: 'Washer, polisher, lift, vehicle' },
    { key: 'serial_number', label: 'Serial #', type: 'text' },
    { key: 'status', label: 'Status', type: 'select', options: (Object.keys(EQUIPMENT_STATUS) as EquipmentStatus[]).map((s) => ({ value: s, label: EQUIPMENT_STATUS[s].label, hint: EQUIPMENT_STATUS[s].hint })) },
  ];
  const useFields: FieldDef[] = [
    { key: 'bookable', label: 'Bookable on jobs', type: 'toggle', hint: 'Can be reserved when scheduling, with conflict checks. While out of service it cannot be booked.' },
    { key: 'usage_hours', label: 'Usage hours (meter)', type: 'number', hint: 'Used for hour-based maintenance.' },
  ];
  const assignFields: FieldDef[] = [
    { key: 'assigned_user_id', label: 'Assigned to (person)', type: 'select', options: memberOptions, allowClear: true },
    { key: 'assigned_label', label: 'Van / hangar / shelf', type: 'text', placeholder: 'Van 2, Hangar 4' },
    { key: 'location_id', label: 'Facility', type: 'select', options: locationOptions, allowClear: true },
    ...(can('branches') && branchOptions.length ? [{ key: 'branch_id', label: 'Company location (branch)', type: 'select', options: branchOptions, allowClear: true } as FieldDef] : []),
  ];
  const purchaseFields: FieldDef[] = [
    { key: 'purchased_on', label: 'Purchased', type: 'date' },
    ...(showMoney ? [{ key: 'purchase_cost', label: 'Purchase cost ($)', type: 'money' } as FieldDef] : []),
    { key: 'warranty_expires_on', label: 'Warranty expires', type: 'date' },
    { key: 'notes', label: 'Notes', type: 'multiline' },
  ];
  const all = [...basics, ...useFields, ...assignFields, ...purchaseFields];
  const setValue = (k: string, v: any) => setValues((s) => ({ ...s!, [k]: v }));

  const save = async () => {
    const msg = validate(all, values);
    if (msg) return setError(msg);
    const row = normalize(all, values);
    if (row.usage_hours != null && row.usage_hours < 0) return setError('Usage hours cannot be negative');
    const payload: Record<string, any> = { ...row, usage_hours: row.usage_hours ?? 0, bookable: !!row.bookable };
    if (!showMoney) delete payload.purchase_cost;
    setSaving(true);
    setError(null);
    try {
      let eqId = id;
      if (id) {
        const { error: e } = await supabase.from('equipment').update(payload).eq('id', id);
        if (e) throw e;
      } else {
        const { data, error: e } = await supabase.from('equipment').insert({ ...payload, org_id: orgId }).select('id').single();
        if (e) throw e;
        eqId = data.id;
      }
      if (newPhoto && eqId) {
        const path = await uploadImage(orgId, `equipment/${eqId}`, newPhoto);
        const { error: pe } = await supabase.from('equipment').update({ photo_path: path }).eq('id', eqId);
        if (pe) throw pe;
        await supabase.from('equipment_files').insert({ org_id: orgId, equipment_id: eqId, kind: 'photo', title: 'Main photo', storage_path: path });
      } else if (id && !photoPath && values.photo_path) {
        await supabase.from('equipment').update({ photo_path: null }).eq('id', id);
      }
      if (id) router.back(); else router.replace(`/equipment/${eqId}`);
    } catch (e: any) {
      setError(friendlyError(e.message));
    } finally {
      setSaving(false);
    }
  };

  const remove = () => confirmAction('Delete this equipment?', 'Its maintenance schedule, service history, files and problem reports are deleted too. To keep history, set it to Retired instead.', async () => {
    const { error: e } = await supabase.from('equipment').delete().eq('id', id!);
    if (e) setError(friendlyError(e.message));
    else router.replace('/equipment');
  }, true);

  return (
    <Screen footer={<Button title={id ? 'Save changes' : 'Add equipment'} onPress={save} loading={saving} />}>
      <Stack.Screen options={{ title: id ? 'Edit equipment' : 'New equipment' }} />
      <ErrorBanner message={error} />
      <FormFields fields={basics} values={values} setValue={setValue} />
      {status === 'out_of_service' ? (
        <Card style={{ borderColor: colors.danger }}>
          <T style={{ color: colors.danger, fontWeight: '700' }}>Locked out of service</T>
          <T variant="muted">It can&apos;t be booked on jobs until you set it back to In service.</T>
        </Card>
      ) : null}

      <Section title="Use & booking" icon="calendar-outline">
        <FormFields fields={useFields} values={values} setValue={setValue} />
      </Section>

      <Section title="Assignment" icon="person-outline">
        <FormFields fields={assignFields} values={values} setValue={setValue} />
      </Section>

      <Section title="Purchase & warranty" icon="receipt-outline">
        <FormFields fields={purchaseFields} values={values} setValue={setValue} />
      </Section>

      <Section title="Main photo" icon="image-outline">
        {photoUrl && photoPath && !newPhoto ? (
          <View style={{ marginBottom: space.md }}>
            <Image source={{ uri: photoUrl }} style={{ width: '100%', height: 200, borderRadius: radius.md, backgroundColor: colors.card }} resizeMode="cover" />
            <Button small kind="ghost" icon="close-circle-outline" title="Remove photo" onPress={() => { setPhotoPath(null); setPhotoUrl(null); }} style={{ alignSelf: 'flex-start' }} />
          </View>
        ) : null}
        <PhotoField label={photoPath ? 'Replace photo' : 'Add a photo'} uri={newPhoto} onChange={setNewPhoto} />
      </Section>

      {id && perm('delete_records') ? <Button kind="ghost" icon="trash-outline" title="Delete equipment" onPress={remove} /> : null}
    </Screen>
  );
}

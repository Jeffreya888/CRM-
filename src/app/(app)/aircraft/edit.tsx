import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Image } from 'react-native';
import { FormFields, normalize, validate, type FieldDef, type FormValues } from '../../../components/FormSheet';
import { Button, Card, ErrorBanner, Loading, Row, Screen, T } from '../../../components/ui';
import { pickImage, signedUrls, uploadImage } from '../../../lib/files';
import { useLookups } from '../../../lib/lookups';
import { AIRCRAFT_CATEGORIES } from '../../../lib/pricing';
import { useOrg } from '../../../lib/session';
import { friendlyError, supabase } from '../../../lib/supabase';
import { radius, space } from '../../../lib/theme';

export default function AircraftEdit() {
  const { id, customer_id } = useLocalSearchParams<{ id?: string; customer_id?: string }>();
  const { orgId } = useOrg();
  const { customerOptions, locationOptions } = useLookups();
  const [values, setValues] = useState<FormValues | null>(id ? null : { category: 'light_jet', customer_id: customer_id ?? null, active: true });
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    supabase.from('aircraft').select('*').eq('id', id).single().then(async ({ data }) => {
      setValues(data);
      if (data?.photo_path) setPhotoUri((await signedUrls([data.photo_path]))[data.photo_path] ?? null);
    });
  }, [id]);

  const fields: FieldDef[] = [
    { key: 'tail_number', label: 'Tail number / registration', type: 'text', required: true, placeholder: 'N123AB' },
    { key: 'customer_id', label: 'Owner / customer', type: 'select', options: customerOptions, allowClear: true },
    { key: 'category', label: 'Aircraft class', type: 'select', options: AIRCRAFT_CATEGORIES.map((c) => ({ value: c.value, label: c.label, hint: c.examples })) },
    { key: 'manufacturer', label: 'Manufacturer', type: 'text', placeholder: 'Gulfstream, Cessna, Bombardier…' },
    { key: 'model', label: 'Model', type: 'text', placeholder: 'G650, Citation CJ4…' },
    { key: 'year', label: 'Year', type: 'number' },
    { key: 'serial_number', label: 'Serial number', type: 'text' },
    { key: 'length_ft', label: 'Length (ft)', type: 'number', hint: 'Used for per-foot pricing' },
    { key: 'wingspan_ft', label: 'Wingspan (ft)', type: 'number' },
    { key: 'home_location_id', label: 'Home base', type: 'select', options: locationOptions, allowClear: true },
    { key: 'exterior_colors', label: 'Paint scheme / colors', type: 'text' },
    { key: 'paint_condition', label: 'Paint condition', type: 'text', placeholder: 'Excellent, oxidized, chipped leading edges…' },
    { key: 'interior_notes', label: 'Interior notes', type: 'multiline', placeholder: 'Leather type, carpet, veneer, special products' },
    { key: 'coating_type', label: 'Coating / protection', type: 'text', placeholder: 'Ceramic brand, wax, sealant' },
    { key: 'coating_applied_on', label: 'Coating applied on', type: 'date' },
    { key: 'notes', label: 'Notes', type: 'multiline', placeholder: 'Sensors to avoid, owner preferences, access' },
    { key: 'active', label: 'Active', type: 'toggle' },
  ];

  if (!values) return <Loading />;

  const save = async () => {
    const msg = validate(fields, values);
    if (msg) return setError(msg);
    const row = normalize(fields, values);
    row.tail_number = String(row.tail_number).toUpperCase().replace(/\s/g, '');
    try {
      if (photoUri && !photoUri.startsWith("http")) {
        row.photo_path = await uploadImage(orgId, 'aircraft', photoUri);
      }
      if (id) {
        const { error } = await supabase.from('aircraft').update(row).eq('id', id);
        if (error) throw error;
        router.back();
      } else {
        const { data, error } = await supabase.from('aircraft').insert({ ...row, org_id: orgId }).select('id').single();
        if (error) throw error;
        router.replace(`/aircraft/${data.id}`);
      }
    } catch (e: any) {
      setError(friendlyError(e.message));
    }
  };

  return (
    <Screen footer={<Button title={id ? 'Save changes' : 'Add aircraft'} onPress={save} />}>
      <Stack.Screen options={{ title: id ? 'Edit aircraft' : 'New aircraft' }} />
      <ErrorBanner message={error} />
      <Card>
        {photoUri ? <Image source={{ uri: photoUri }} style={{ width: '100%', height: 180, borderRadius: radius.md, marginBottom: space.sm }} /> : <T variant="muted">No photo</T>}
        <Row>
          <Button small kind="secondary" icon="camera-outline" title="Take photo" onPress={async () => { try { const u = await pickImage('camera'); if (u) setPhotoUri(u); } catch (e: any) { setError(e.message); } }} />
          <Button small kind="secondary" icon="images-outline" title="Choose" onPress={async () => { const u = await pickImage('library'); if (u) setPhotoUri(u); }} />
        </Row>
      </Card>
      <FormFields fields={fields} values={values} setValue={(k, v) => setValues((s) => ({ ...s!, [k]: v }))} />
    </Screen>
  );
}

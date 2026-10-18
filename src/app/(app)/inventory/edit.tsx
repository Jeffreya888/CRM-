import { hasMax3Decimals } from '../../../components/inventory/qty';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { confirmAction, FormFields, normalize, validate, type FieldDef, type FormValues } from '../../../components/FormSheet';
import { ScannerModal } from '../../../components/Scanner';
import { Button, Card, ErrorBanner, IconTile, Loading, Row, Screen, Section, T } from '../../../components/ui';
import { normalizeUrl, openStorageFile, pickAndUploadDocument, type InventoryItem } from '../../../lib/inventory';
import { removeFile } from '../../../lib/files';
import { isManager } from '../../../lib/plans';
import { useOrg } from '../../../lib/session';
import { friendlyError, supabase } from '../../../lib/supabase';
import { space } from '../../../lib/theme';

export default function SupplyEdit() {
  const { id, barcode } = useLocalSearchParams<{ id?: string; barcode?: string }>();
  const { orgId, role, perm } = useOrg();
  const showMoney = perm('see_prices');
  const manager = isManager(role);
  const [values, setValues] = useState<FormValues | null>(id ? null : {
    unit: 'each', quantity: '0', par_level: '0', reorder_qty: '0', unit_cost: '0', active: true, barcode: barcode ?? '',
  });
  const [sdsPath, setSdsPath] = useState<string | null>(null);
  const [sdsName, setSdsName] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (!id) return;
    (async () => {
      const { data, error: e } = await supabase.from('inventory_items').select('*').eq('id', id).single();
      if (e || !data) return setError(friendlyError(e?.message ?? 'Item not found'));
      const it = data as InventoryItem;
      setValues({
        ...it,
        par_level: String(it.par_level ?? 0), reorder_qty: String(it.reorder_qty ?? 0), unit_cost: String(it.unit_cost ?? 0),
        barcode: it.barcode ?? '',
      });
      setSdsPath(it.sds_path);
    })();
  }, [id]);

  if (!values) return <Screen><Stack.Screen options={{ title: 'Edit supply' }} />{error ? <ErrorBanner message={error} /> : <Loading />}</Screen>;
  if (!manager) return <Screen><Stack.Screen options={{ title: 'Supply' }} /><ErrorBanner message="Only owners and managers can add or edit supplies." /></Screen>;

  const basics: FieldDef[] = [
    { key: 'name', label: 'Product name', type: 'text', required: true, placeholder: 'Aero Cosmetics Wash Wax ALL' },
    { key: 'category', label: 'Category', type: 'text', placeholder: 'Chemicals, towels, ceramic, PPE' },
    { key: 'sku', label: 'SKU / part #', type: 'text' },
    { key: 'unit', label: 'Unit', type: 'text', required: true, placeholder: 'gallon, bottle, case, each' },
    ...(!id ? [{ key: 'quantity', label: 'Starting quantity', type: 'number', hint: 'Decimals are fine (e.g. 2.5). Later changes go through Adjust, Mark received or Count so history stays accurate.' } as FieldDef] : []),
  ];
  const stockFields: FieldDef[] = [
    { key: 'par_level', label: 'Par level', type: 'number', hint: 'Alert and add to the reorder list when stock is at or below this.' },
    { key: 'reorder_qty', label: 'Reorder quantity', type: 'number', hint: 'How many to order each time.' },
    ...(showMoney ? [{ key: 'unit_cost', label: 'Cost per unit ($)', type: 'money', hint: 'Used for stock value and job profitability.' } as FieldDef] : []),
    { key: 'expires_on', label: 'Expiration date', type: 'date' },
  ];
  const vendorFields: FieldDef[] = [
    { key: 'vendor', label: 'Vendor', type: 'text' },
    { key: 'vendor_url', label: 'Vendor link (reorder page)', type: 'text', placeholder: 'https://…' },
    { key: 'vendor_email', label: 'Vendor email', type: 'email', placeholder: 'orders@vendor.com' },
  ];
  const safetyFields: FieldDef[] = [
    { key: 'approved_for', label: 'OEM approvals', type: 'multiline', placeholder: 'Boeing D6-17487, Gulfstream AMM approved, Airbus AIMM' },
  ];
  const tail: FieldDef[] = [{ key: 'active', label: 'Active', type: 'toggle', hint: 'Turn off for products you no longer stock. History is kept.' }];
  const all = [...basics, ...stockFields, ...vendorFields, ...safetyFields, ...tail, { key: 'barcode', label: 'Barcode', type: 'text' } as FieldDef];
  const setValue = (k: string, v: any) => setValues((s) => ({ ...s!, [k]: v }));

  const uploadSds = async () => {
    setUploading(true);
    setError(null);
    try {
      const r = await pickAndUploadDocument(orgId, 'sds', 'application/pdf');
      if (r) { setSdsPath(r.path); setSdsName(r.name); }
    } catch (e: any) {
      setError(friendlyError(e.message));
    } finally {
      setUploading(false);
    }
  };

  const save = async () => {
    const msg = validate(all, values);
    if (msg) return setError(msg);
    const row = normalize(all, values);
    for (const k of ['par_level', 'reorder_qty', 'quantity'] as const) {
      if (row[k] != null && (row[k] < 0 || !hasMax3Decimals(row[k]))) return setError('Quantities are zero or more, with at most 3 decimals');
    }
    if (row.vendor_email && !/^\S+@\S+\.\S+$/.test(row.vendor_email)) return setError('That vendor email looks wrong');
    const payload: Record<string, any> = {
      ...row,
      barcode: row.barcode ? String(row.barcode).trim() : null,
      vendor_url: row.vendor_url ? normalizeUrl(row.vendor_url) : null,
      vendor_email: row.vendor_email ? String(row.vendor_email).toLowerCase() : null,
      par_level: row.par_level ?? 0,
      reorder_qty: row.reorder_qty ?? 0,
      sds_path: sdsPath,
    };
    if (showMoney) payload.unit_cost = row.unit_cost ?? 0; else delete payload.unit_cost;
    delete payload.quantity;
    setSaving(true);
    setError(null);
    try {
      if (id) {
        const { error: e } = await supabase.from('inventory_items').update(payload).eq('id', id);
        if (e) throw e;
        router.back();
      } else {
        const { data, error: e } = await supabase.from('inventory_items').insert({ ...payload, org_id: orgId, quantity: 0 }).select('id').single();
        if (e) throw e;
        const start = Number(row.quantity) || 0;
        if (start > 0) {
          const { error: me } = await supabase.from('inventory_movements').insert({ org_id: orgId, item_id: data.id, delta: start, reason: 'adjustment', note: 'Starting quantity' });
          if (me) throw me;
        }
        router.replace(`/inventory/${data.id}`);
      }
    } catch (e: any) {
      const m: string = e.message ?? '';
      setError(m.includes('inventory_items_barcode') ? 'Another supply already uses that barcode.' : friendlyError(m));
    } finally {
      setSaving(false);
    }
  };

  const remove = () => confirmAction('Delete this supply?', 'Its stock history is deleted too. To keep history, turn off Active instead.', async () => {
    const { error: e } = await supabase.from('inventory_items').delete().eq('id', id!);
    if (e) setError(friendlyError(e.message));
    else router.replace('/inventory');
  }, true);

  return (
    <Screen footer={<Button title={id ? 'Save changes' : 'Add supply'} onPress={save} loading={saving} />}>
      <Stack.Screen options={{ title: id ? 'Edit supply' : 'New supply' }} />
      <ErrorBanner message={error} />
      <FormFields fields={basics} values={values} setValue={setValue} />

      <Section title="Barcode" icon="barcode-outline">
        <Card>
          <Row gap={space.sm}>
            <View style={{ flex: 1 }}>
              <T style={{ fontWeight: '600' }}>{values.barcode ? values.barcode : 'No barcode yet'}</T>
              <T variant="small">Scan the product&apos;s barcode so anyone can find it with the scanner.</T>
            </View>
            <Button small kind="secondary" icon="scan-outline" title={values.barcode ? 'Rescan' : 'Scan'} onPress={() => setScanning(true)} />
          </Row>
          <View style={{ marginTop: space.md }}>
            <FormFields fields={[{ key: 'barcode', label: 'Or type it', type: 'text', placeholder: '012345678905' }]} values={values} setValue={setValue} />
          </View>
        </Card>
      </Section>

      <Section title="Stock & reordering" icon="layers-outline">
        <FormFields fields={stockFields} values={values} setValue={setValue} />
      </Section>

      <Section title="Vendor" icon="storefront-outline">
        <FormFields fields={vendorFields} values={values} setValue={setValue} />
      </Section>

      <Section title="Safety & approvals" icon="shield-checkmark-outline">
        <Card>
          <Row gap={space.md}>
            <IconTile icon="document-text-outline" tone={sdsPath ? 'success' : 'neutral'} />
            <View style={{ flex: 1 }}>
              <T style={{ fontWeight: '600' }}>Safety data sheet (SDS)</T>
              <T variant="small">{sdsPath ? sdsName ?? 'PDF attached' : 'Attach the PDF so the crew can pull it up on the ramp.'}</T>
            </View>
          </Row>
          <Row gap={space.sm} style={{ marginTop: space.md, flexWrap: 'wrap' }}>
            <Button small kind="secondary" icon="cloud-upload-outline" title={sdsPath ? 'Replace PDF' : 'Upload PDF'} loading={uploading} onPress={uploadSds} />
            {sdsPath ? <Button small kind="ghost" icon="open-outline" title="View" onPress={() => openStorageFile(sdsPath).catch((e) => setError(friendlyError(e.message)))} /> : null}
            {sdsPath ? <Button small kind="ghost" icon="close-circle-outline" title="Remove" onPress={() => { if (!id) removeFile(sdsPath).catch(() => {}); setSdsPath(null); setSdsName(null); }} /> : null}
          </Row>
        </Card>
        <FormFields fields={safetyFields} values={values} setValue={setValue} />
      </Section>

      <FormFields fields={tail} values={values} setValue={setValue} />
      {id && perm('delete_records') ? <Button kind="ghost" icon="trash-outline" title="Delete supply" onPress={remove} /> : null}

      <ScannerModal visible={scanning} onClose={() => setScanning(false)} onScan={(c) => setValue('barcode', c)} title="Scan product barcode" />
    </Screen>
  );
}

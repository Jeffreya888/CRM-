import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { confirmAction, FormFields, normalize, validate, type FieldDef, type FormValues } from '../../../components/FormSheet';
import { Button, Card, ErrorBanner, Field, IconButton, Loading, Row, Screen, Section, T } from '../../../components/ui';
import { SERVICE_CATEGORIES } from '../../../components/status';
import { AIRCRAFT_CATEGORIES } from '../../../lib/pricing';
import { useOrg } from '../../../lib/session';
import { friendlyError, supabase } from '../../../lib/supabase';
import { colors, space } from '../../../lib/theme';

const CATEGORIES = SERVICE_CATEGORIES.map((v) => ({ value: v, label: v.replace('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase()) }));
const METHODS = [
  { value: 'per_foot', label: 'Per foot of aircraft length', hint: 'Most common for exterior work' },
  { value: 'per_category', label: 'By aircraft class', hint: 'Set a price for each class' },
  { value: 'flat', label: 'Flat price' },
  { value: 'hourly', label: 'Hourly', hint: 'Estimated hours × rate' },
];

export default function ServiceEdit() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { orgId } = useOrg();
  const [values, setValues] = useState<FormValues | null>(id ? null : { category: 'exterior', pricing_method: 'per_foot', taxable: true, active: true, base_price: '0', price_per_foot: '0', hourly_rate: '0' });
  const [catPrices, setCatPrices] = useState<Record<string, string>>({});
  const [steps, setSteps] = useState<string[]>([]);
  const [tiers, setTiers] = useState<{ name: string; detail: string; price: string }[]>([]);
  const [equipment, setEquipment] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    supabase.from('services').select('*').eq('id', id).single().then(({ data }) => {
      setValues(data);
      setCatPrices(Object.fromEntries(Object.entries(data?.category_prices ?? {}).map(([k, v]) => [k, String(v)])));
      setSteps(data?.checklist ?? []);
      setTiers((data?.pricing_tiers ?? []).map((t: any) => ({ name: t.name ?? '', detail: t.detail ?? '', price: String(t.price ?? '') })));
      setEquipment(data?.equipment ?? []);
    });
  }, [id]);
  if (!values) return <Loading />;

  const m = values.pricing_method;
  const fields: FieldDef[] = [
    { key: 'name', label: 'Service name', type: 'text', required: true },
    { key: 'description', label: 'Description (shown to customers)', type: 'multiline' },
    { key: 'category', label: 'Category', type: 'select', options: CATEGORIES },
    { key: 'pricing_method', label: 'Pricing method', type: 'select', options: METHODS },
    ...(m === 'per_foot' ? [{ key: 'price_per_foot', label: 'Price per foot ($)', type: 'money' } as FieldDef, { key: 'base_price', label: 'Minimum charge ($)', type: 'money' } as FieldDef] : []),
    ...(m === 'flat' ? [{ key: 'base_price', label: 'Price ($)', type: 'money', required: true } as FieldDef] : []),
    ...(m === 'per_category' ? [{ key: 'base_price', label: 'Default price if class not set ($)', type: 'money' } as FieldDef] : []),
    ...(m === 'hourly' ? [{ key: 'hourly_rate', label: 'Hourly rate ($)', type: 'money', required: true } as FieldDef] : []),
    { key: 'est_hours', label: 'Estimated hours (min)', type: 'number' },
    { key: 'est_hours_max', label: 'Estimated hours (max)', type: 'number', hint: 'Shown as a range, e.g. 4-6 hours' },
    { key: 'recurring_interval_days', label: 'Recommend again every (days)', type: 'number', hint: 'Creates automatic service reminders when a job is completed' },
    { key: 'taxable', label: 'Taxable', type: 'toggle' },
    { key: 'active', label: 'Show on menu', type: 'toggle' },
  ];

  const save = async () => {
    const msg = validate(fields, values);
    if (msg) return setError(msg);
    const row = normalize(fields, values);
    for (const k of ['base_price', 'price_per_foot', 'hourly_rate']) row[k] = Number(values[k]) || 0;
    row.category_prices = Object.fromEntries(Object.entries(catPrices).filter(([, v]) => v !== '' && !Number.isNaN(Number(v))).map(([k, v]) => [k, Number(v)]));
    row.checklist = steps.map((s) => s.trim()).filter(Boolean);
    row.equipment = equipment.map((s) => s.trim()).filter(Boolean);
    row.pricing_tiers = tiers.filter((t) => t.name.trim() && t.price !== '').map((t) => ({ name: t.name.trim(), detail: t.detail.trim() || null, price: Number(t.price) || 0 }));
    try {
      const { error } = id ? await supabase.from('services').update(row).eq('id', id) : await supabase.from('services').insert({ ...row, org_id: orgId });
      if (error) throw error;
      router.back();
    } catch (e: any) {
      setError(friendlyError(e.message));
    }
  };

  return (
    <Screen footer={<Button title="Save service" onPress={save} />}>
      <Stack.Screen options={{ title: id ? 'Edit service' : 'New service' }} />
      <ErrorBanner message={error} />
      <FormFields fields={fields} values={values} setValue={(k, v) => setValues((s) => ({ ...s!, [k]: v }))} />
      {m === 'per_category' ? (
        <Section title="Price by aircraft class">
          <Card>
            {AIRCRAFT_CATEGORIES.map((c) => (
              <Row key={c.value} style={{ justifyContent: 'space-between' }}>
                <View style={{ flex: 1 }}><T>{c.label}</T><T variant="small">{c.examples}</T></View>
                <Field style={{ width: 110 }} keyboardType="decimal-pad" placeholder="—" value={catPrices[c.value] ?? ''} onChangeText={(v) => setCatPrices((p) => ({ ...p, [c.value]: v }))} />
              </Row>
            ))}
          </Card>
        </Section>
      ) : null}
      <Section title="Pricing tiers" action={<Button small kind="ghost" icon="add" title="Tier" onPress={() => setTiers((t) => [...t, { name: '', detail: '', price: '' }])} />}>
        <T variant="small" style={{ marginBottom: space.sm }}>Optional fixed-price options, e.g. Small / Medium / Large interior. Each appears as a choice when creating a job.</T>
        {tiers.map((t, i) => (
          <Card key={i} style={{ padding: space.md }}>
            <Row>
              <Field style={{ flex: 2, marginBottom: 0 }} placeholder="Name (Small Interior)" value={t.name} onChangeText={(v) => setTiers((ts) => ts.map((x, j) => (j === i ? { ...x, name: v } : x)))} />
              <Field style={{ flex: 1, marginBottom: 0 }} placeholder="Price" keyboardType="decimal-pad" value={t.price} onChangeText={(v) => setTiers((ts) => ts.map((x, j) => (j === i ? { ...x, price: v.replace(/[^0-9.]/g, '') } : x)))} />
              <IconButton icon="close" color={colors.textMuted} onPress={() => setTiers((ts) => ts.filter((_, j) => j !== i))} />
            </Row>
            <Field style={{ marginBottom: 0, marginTop: space.sm }} placeholder="Details (4-6 seats)" value={t.detail} onChangeText={(v) => setTiers((ts) => ts.map((x, j) => (j === i ? { ...x, detail: v } : x)))} />
          </Card>
        ))}
      </Section>
      <Section title="Equipment needed" action={<Button small kind="ghost" icon="add" title="Item" onPress={() => setEquipment((e) => [...e, ''])} />}>
        {equipment.map((e, i) => (
          <Row key={i}>
            <Field style={{ flex: 1, marginBottom: space.sm }} value={e} placeholder="Steam cleaner" onChangeText={(v) => setEquipment((xs) => xs.map((x, j) => (j === i ? v : x)))} />
            <IconButton icon="close" color={colors.textMuted} onPress={() => setEquipment((xs) => xs.filter((_, j) => j !== i))} />
          </Row>
        ))}
      </Section>
      <Section title="Step-by-step checklist" action={<Button small kind="ghost" icon="add" title="Step" onPress={() => setSteps((s) => [...s, ''])} />}>
        <T variant="small" style={{ marginBottom: space.sm }}>Copied onto every job that includes this service.</T>
        {steps.map((st, i) => (
          <Row key={i}>
            <T variant="muted">{i + 1}.</T>
            <Field style={{ flex: 1, marginBottom: space.sm }} value={st} onChangeText={(v) => setSteps((s) => s.map((x, j) => (j === i ? v : x)))} />
            <IconButton icon="close" color={colors.textMuted} onPress={() => setSteps((s) => s.filter((_, j) => j !== i))} />
          </Row>
        ))}
      </Section>
      {id ? (
        <Button kind="ghost" icon="trash-outline" title="Delete service" style={{ marginTop: space.lg }} onPress={() => confirmAction('Delete service?', 'Past quotes and invoices keep their line items. Consider hiding it instead.', async () => {
          await supabase.from('services').delete().eq('id', id);
          router.back();
        }, true)} />
      ) : null}
    </Screen>
  );
}

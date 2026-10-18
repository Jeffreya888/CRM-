import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { confirmAction } from '../../../components/FormSheet';
import { ListEditor } from '../../../components/guides/ListEditor';
import { SERVICE_CATEGORIES } from '../../../components/status';
import { prettyCategory } from '../../../components/services/data';
import { Button, Card, EmptyState, ErrorBanner, Field, IconButton, Loading, Row, Screen, Section, Segmented, Select, T, ToggleRow } from '../../../components/ui';
import { assetTypeLabel, loadGuideLibrary, recurLabel, stepTitles } from '../../../lib/guides';
import { categoriesFor } from '../../../lib/pricing';
import { canSeeMoney } from '../../../lib/plans';
import { useOrg } from '../../../lib/session';
import { friendlyError, supabase } from '../../../lib/supabase';
import { colors, space } from '../../../lib/theme';
import type { AssetType, PricingMethod, RecurUnit, Service } from '../../../lib/types';
import { useQuery } from '../../../lib/useQuery';

const CATEGORIES = SERVICE_CATEGORIES.map((v) => ({ value: v, label: prettyCategory(v) }));
const methodsFor = (t: AssetType) => [
  { value: 'per_foot' as const, label: `Per foot of ${t === 'aircraft' ? 'aircraft' : t === 'vehicle' ? 'vehicle' : 'boat'} length`, hint: 'Most common for exterior work' },
  { value: 'per_sqft' as const, label: 'Per sq ft', hint: t === 'watercraft' ? 'Length × beam × rate' : t === 'vehicle' ? 'Length × width × rate' : 'Length × wingspan × rate' },
  { value: 'per_category' as const, label: 'By size class', hint: 'Set a price for each size' },
  { value: 'flat' as const, label: 'Flat price' },
  { value: 'hourly' as const, label: 'Hourly', hint: 'Estimated hours × rate' },
];

type Form = {
  name: string; description: string; asset_type: AssetType; category: string; pricing_method: PricingMethod;
  base_price: string; price_per_foot: string; hourly_rate: string; price_per_sqft: string;
  durUnit: 'min' | 'hours'; durMin: string; durMax: string;
  recur: 'none' | RecurUnit; recurEvery: string;
  guide_key: string | null; taxable: boolean; active: boolean; requires_cert: boolean;
};

const num = (v: string) => (v.trim() === '' ? null : Number(v.replace(/[^0-9.]/g, '')));
const fmt = (n: number) => String(+n.toFixed(2));

function toForm(s: Service): Form {
  const a = Number(s.est_hours) || 0;
  const b = Number(s.est_hours_max) || 0;
  const minutes = (a || b) && Math.max(a, b) < 1;
  const show = (h: number) => (h ? (minutes ? String(Math.round(h * 60)) : fmt(h)) : '');
  return {
    name: s.name, description: s.description ?? '', asset_type: s.asset_type ?? 'aircraft', category: s.category, pricing_method: s.pricing_method,
    base_price: String(s.base_price ?? 0), price_per_foot: String(s.price_per_foot ?? 0), hourly_rate: String(s.hourly_rate ?? 0), price_per_sqft: String(s.price_per_sqft ?? 0),
    durUnit: minutes ? 'min' : 'hours', durMin: show(a), durMax: show(b),
    recur: s.recur_every && s.recur_unit ? s.recur_unit : 'none', recurEvery: s.recur_every ? String(s.recur_every) : '',
    guide_key: s.guide_key, taxable: s.taxable, active: s.active, requires_cert: !!s.requires_cert,
  };
}

export default function ServiceEdit() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { orgId, role, perm, businessTypes } = useOrg();
  const editor = perm('see_prices') && canSeeMoney(role);
  const [form, setForm] = useState<Form | null>(id ? null : {
    name: '', description: '', asset_type: businessTypes[0] ?? 'aircraft', category: 'exterior', pricing_method: 'per_foot',
    base_price: '0', price_per_foot: '0', hourly_rate: '0', price_per_sqft: '0', durUnit: 'hours', durMin: '', durMax: '',
    recur: 'none', recurEvery: '', guide_key: null, taxable: true, active: true, requires_cert: false,
  });
  const [catPrices, setCatPrices] = useState<Record<string, string>>({});
  const [catHours, setCatHours] = useState<Record<string, string>>({});
  const [steps, setSteps] = useState<string[]>([]);
  const [tiers, setTiers] = useState<{ name: string; detail: string; price: string }[]>([]);
  const [equipment, setEquipment] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const lib = useQuery(() => loadGuideLibrary(orgId), [orgId]);

  useEffect(() => {
    if (!id) return;
    supabase.from('services').select('*').eq('id', id).maybeSingle().then(({ data, error: e }) => {
      if (e || !data) { setError(e ? friendlyError(e.message) : 'Service not found'); return; }
      const s = data as Service;
      setForm(toForm(s));
      setCatPrices(Object.fromEntries(Object.entries(s.category_prices ?? {}).map(([k, v]) => [k, String(v)])));
      setCatHours(Object.fromEntries(Object.entries(s.category_hours ?? {}).map(([k, v]) => [k, String(v)])));
      setSteps(s.checklist ?? []);
      setTiers((s.pricing_tiers ?? []).map((t) => ({ name: t.name ?? '', detail: t.detail ?? '', price: String(t.price ?? '') })));
      setEquipment(s.equipment ?? []);
    });
  }, [id]);

  if (!editor) return <Screen><EmptyState icon="lock-closed-outline" title="Managers only" body="Ask your manager to change services and prices." /></Screen>;
  if (!form) return error ? <Screen><ErrorBanner message={error} /></Screen> : <Loading />;
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => (f ? { ...f, [k]: v } : f));

  const guides = (lib.data?.guides ?? []).filter((r) => r.guide.asset_type === form.asset_type);
  const chosen = (lib.data?.guides ?? []).find((r) => r.guide.key === form.guide_key);
  const guideSteps = chosen ? stepTitles(chosen.guide) : [];
  const m = form.pricing_method;
  const sizes = categoriesFor(form.asset_type);
  const typeOptions = businessTypes.includes(form.asset_type) ? businessTypes : [...businessTypes, form.asset_type];

  const pickGuide = (key: string | null) => {
    set('guide_key', key);
    const g = (lib.data?.guides ?? []).find((r) => r.guide.key === key);
    if (!g) return;
    if (!steps.some((x) => x.trim())) setSteps(stepTitles(g.guide));
    if (!form.name.trim()) set('name', g.guide.title);
    if (!equipment.length && g.guide.tools.length) setEquipment(g.guide.tools.slice(0, 8));
  };

  const save = async () => {
    setError(null);
    if (!form.name.trim()) return setError('Service name is required');
    const money = ['base_price', 'price_per_foot', 'hourly_rate', 'price_per_sqft'] as const;
    for (const k of money) if (form[k].trim() !== '' && Number.isNaN(Number(form[k]))) return setError('Prices must be numbers');
    if (m === 'flat' && !(Number(form.base_price) > 0)) return setError('Enter the price');
    if (m === 'hourly' && !(Number(form.hourly_rate) > 0)) return setError('Enter the hourly rate');
    if (m === 'per_sqft' && !(Number(form.price_per_sqft) > 0)) return setError('Enter the price per square foot');
    const sizeMap = (src: Record<string, string>) => Object.fromEntries(Object.entries(src)
      .filter(([k, v]) => v.trim() !== '' && !Number.isNaN(Number(v)) && Number(v) >= 0 && sizes.some((c) => c.value === k)).map(([k, v]) => [k, Number(v)]));
    const toHours = (v: string) => {
      const n = num(v);
      if (n == null || Number.isNaN(n) || n <= 0) return null;
      return form.durUnit === 'min' ? Math.round((n / 60) * 100) / 100 : Math.round(n * 100) / 100;
    };
    let lo = toHours(form.durMin);
    let hi = toHours(form.durMax);
    if (lo != null && hi != null && hi < lo) [lo, hi] = [hi, lo];
    let recur_every: number | null = null;
    if (form.recur !== 'none') {
      recur_every = Math.floor(Number(form.recurEvery));
      if (!recur_every || recur_every < 1 || recur_every > 520) return setError(`Enter how many ${form.recur}s between visits (1–520)`);
    }
    const row = {
      name: form.name.trim(), description: form.description.trim() || null, asset_type: form.asset_type, category: form.category,
      pricing_method: m, base_price: Number(form.base_price) || 0, price_per_foot: Number(form.price_per_foot) || 0, hourly_rate: Number(form.hourly_rate) || 0,
      price_per_sqft: Number(form.price_per_sqft) || 0,
      category_prices: sizeMap(catPrices),
      category_hours: sizeMap(catHours),
      requires_cert: form.guide_key ? form.requires_cert : false,
      est_hours: lo, est_hours_max: hi,
      recur_every, recur_unit: form.recur === 'none' ? null : form.recur,
      guide_key: form.guide_key, taxable: form.taxable, active: form.active,
      checklist: steps.map((x) => x.trim()).filter(Boolean),
      equipment: equipment.map((x) => x.trim()).filter(Boolean),
      pricing_tiers: tiers.filter((t) => t.name.trim() && t.price !== '').map((t) => ({ name: t.name.trim(), detail: t.detail.trim() || null, price: Number(t.price) || 0 })),
    };
    const { error: e } = id ? await supabase.from('services').update(row).eq('id', id) : await supabase.from('services').insert({ ...row, org_id: orgId });
    if (e) return setError(friendlyError(e.message));
    router.back();
  };

  return (
    <Screen footer={<Button title="Save service" onPress={save} />}>
      <Stack.Screen options={{ title: id ? 'Edit service' : 'New service' }} />
      <ErrorBanner message={error} />

      <Select label="SOP (step-by-step procedure)" placeholder="No SOP" allowClear searchable={guides.length > 8} icon="book-outline" iconColor={colors.primary}
        value={form.guide_key} onChange={pickGuide}
        options={guides.map((r) => ({ value: r.guide.key, label: r.guide.title, hint: r.isCopy ? 'Your company copy' : `${r.guide.steps.length} steps` }))} />
      {!id && !form.guide_key ? <T variant="small" style={{ marginTop: -space.sm, marginBottom: space.lg }}>Pick an SOP to fill in the name, checklist and equipment for you.</T> : null}

      <Field label="Service name" value={form.name} placeholder="Exterior Wash" onChangeText={(v) => set('name', v)} />
      <Field label="Description (shown to customers)" multiline value={form.description} onChangeText={(v) => set('description', v)} />
      {typeOptions.length > 1 ? (
        <Select label="Applies to" inline value={form.asset_type} options={typeOptions.map((t) => ({ value: t, label: assetTypeLabel(t) }))}
          onChange={(v) => { if (v) { set('asset_type', v); if (chosen && chosen.guide.asset_type !== v) set('guide_key', null); } }} />
      ) : null}
      <Select label="Category" value={form.category} options={CATEGORIES} onChange={(v) => v && set('category', v)} />

      <Section title="Price">
        <Select label="Pricing method" value={m} options={methodsFor(form.asset_type)} onChange={(v) => v && set('pricing_method', v)} />
        {m === 'per_foot' ? (
          <>
            <Field label="Price per foot ($)" keyboardType="decimal-pad" value={form.price_per_foot} onChangeText={(v) => set('price_per_foot', v)} />
            <Field label="Minimum charge ($)" keyboardType="decimal-pad" value={form.base_price} onChangeText={(v) => set('base_price', v)} />
          </>
        ) : null}
        {m === 'per_sqft' ? (
          <>
            <Field label="Price per sq ft ($)" keyboardType="decimal-pad" value={form.price_per_sqft} onChangeText={(v) => set('price_per_sqft', v)}
              hint={`Square feet = length × ${form.asset_type === 'watercraft' ? 'beam' : form.asset_type === 'vehicle' ? 'width' : 'wingspan (beam for boats)'}. Typical size is used when a measurement is missing.`} />
            <Field label="Minimum charge ($)" keyboardType="decimal-pad" value={form.base_price} onChangeText={(v) => set('base_price', v)} />
          </>
        ) : null}
        {m === 'flat' ? <Field label="Price ($)" keyboardType="decimal-pad" value={form.base_price} onChangeText={(v) => set('base_price', v)} /> : null}
        {m === 'hourly' ? <Field label="Hourly rate ($)" keyboardType="decimal-pad" value={form.hourly_rate} onChangeText={(v) => set('hourly_rate', v)} /> : null}
        {m === 'per_category' ? (
          <Field label="Default price if size not set ($)" keyboardType="decimal-pad" value={form.base_price} onChangeText={(v) => set('base_price', v)} />
        ) : null}
        <ToggleRow label="Taxable" value={form.taxable} onChange={(v) => set('taxable', v)} />
      </Section>

      <Section title="How long it takes">
        <Segmented value={form.durUnit} onChange={(v) => set('durUnit', v)} options={[{ value: 'hours', label: 'Hours' }, { value: 'min', label: 'Minutes' }]} />
        <Row>
          <Field style={{ flex: 1 }} label={`From (${form.durUnit === 'min' ? 'min' : 'hours'})`} keyboardType="decimal-pad" value={form.durMin} onChangeText={(v) => set('durMin', v)} />
          <Field style={{ flex: 1 }} label={`To (${form.durUnit === 'min' ? 'min' : 'hours'})`} keyboardType="decimal-pad" value={form.durMax} placeholder="Optional" onChangeText={(v) => set('durMax', v)} />
        </Row>
        {chosen?.guide.time_estimate ? <T variant="small" style={{ marginTop: -space.sm }}>SOP estimate: {chosen.guide.time_estimate}</T> : null}
      </Section>

      <Section title="By size class">
        <T variant="small" style={{ marginBottom: space.sm }}>
          {m === 'per_category' ? 'Price and hours for each size. ' : 'Hours for each size (optional). '}
          Hours are used for scheduling and job costing; blank uses the time above.
        </T>
        <Card style={{ padding: space.md }}>
          <Row style={{ marginBottom: 4 }}>
            <T variant="small" style={{ flex: 1 }}>Size</T>
            {m === 'per_category' ? <T variant="small" style={{ width: 96 }}>Price ($)</T> : null}
            <T variant="small" style={{ width: 80 }}>Hours</T>
          </Row>
          {sizes.map((c) => (
            <Row key={c.value} style={{ alignItems: 'center' }}>
              <View style={{ flex: 1 }}><T>{c.label}</T>{c.examples ? <T variant="small" numberOfLines={1}>{c.examples}</T> : null}</View>
              {m === 'per_category' ? (
                <Field style={{ width: 96, marginBottom: space.sm }} keyboardType="decimal-pad" placeholder="—" accessibilityLabel={`${c.label} price`}
                  value={catPrices[c.value] ?? ''} onChangeText={(v) => setCatPrices((p) => ({ ...p, [c.value]: v.replace(/[^0-9.]/g, '') }))} />
              ) : null}
              <Field style={{ width: 80, marginBottom: space.sm }} keyboardType="decimal-pad" placeholder="—" accessibilityLabel={`${c.label} hours`}
                value={catHours[c.value] ?? ''} onChangeText={(v) => setCatHours((p) => ({ ...p, [c.value]: v.replace(/[^0-9.]/g, '') }))} />
            </Row>
          ))}
        </Card>
      </Section>

      <Section title="Recommend again">
        <Segmented value={form.recur} onChange={(v) => set('recur', v)} options={[{ value: 'none', label: 'Don’t repeat' }, { value: 'week', label: 'Weeks' }, { value: 'month', label: 'Months' }]} />
        {form.recur !== 'none' ? (
          <Field label={`Every how many ${form.recur}s?`} keyboardType="number-pad" value={form.recurEvery} placeholder={form.recur === 'week' ? '2' : '3'}
            onChangeText={(v) => set('recurEvery', v.replace(/\D/g, ''))}
            hint={`${recurLabel(Number(form.recurEvery) || null, form.recur) ?? 'Pick a number'}. For a year, use 12 months. Opted-in customers get an automatic Tentative follow-up job; others get a reminder.`} />
        ) : null}
      </Section>

      <ListEditor title="Job checklist" numbered reorder addLabel="Step" items={steps} onChange={setSteps}
        hint="Copied onto every job that includes this service." placeholder="Step" />
      {chosen && guideSteps.join('\n') !== steps.map((x) => x.trim()).filter(Boolean).join('\n') ? (
        <Button small kind="ghost" icon="refresh-outline" title="Use the SOP's steps" style={{ alignSelf: 'flex-start' }}
          onPress={() => confirmAction('Replace checklist?', `Replace this checklist with the ${guideSteps.length} steps from "${chosen.guide.title}"?`, () => setSteps(guideSteps))} />
      ) : null}

      <ListEditor title="Equipment needed" items={equipment} onChange={setEquipment} placeholder="Steam cleaner" addLabel="Item" />

      <Section title="Pricing tiers" action={<Button small kind="ghost" icon="add" title="Tier" onPress={() => setTiers((t) => [...t, { name: '', detail: '', price: '' }])} />}>
        <T variant="small" style={{ marginBottom: space.sm }}>Optional fixed-price options, e.g. Small / Medium / Large interior. Each appears as a choice when creating a job.</T>
        {tiers.map((t, i) => (
          <Card key={i} style={{ padding: space.md }}>
            <Row>
              <Field style={{ flex: 2, marginBottom: 0 }} placeholder="Name (Small Interior)" value={t.name} onChangeText={(v) => setTiers((ts) => ts.map((x, j) => (j === i ? { ...x, name: v } : x)))} />
              <Field style={{ flex: 1, marginBottom: 0 }} placeholder="Price" keyboardType="decimal-pad" value={t.price} onChangeText={(v) => setTiers((ts) => ts.map((x, j) => (j === i ? { ...x, price: v.replace(/[^0-9.]/g, '') } : x)))} />
              <IconButton icon="close" label="Remove tier" color={colors.textMuted} onPress={() => setTiers((ts) => ts.filter((_, j) => j !== i))} />
            </Row>
            <Field style={{ marginBottom: 0, marginTop: space.sm }} placeholder="Details (4-6 seats)" value={t.detail} onChangeText={(v) => setTiers((ts) => ts.map((x, j) => (j === i ? { ...x, detail: v } : x)))} />
          </Card>
        ))}
      </Section>

      {form.guide_key ? (
        <Section title="Who can do it">
          <ToggleRow label="Only certified technicians" value={form.requires_cert} onChange={(v) => set('requires_cert', v)}
            hint="Scheduling warns when someone not certified on this SOP is assigned. You can still override it." />
        </Section>
      ) : null}

      <Section title="Visibility">
        <ToggleRow label="Show on menu" hint="Hidden services stay on past jobs, quotes and invoices." value={form.active} onChange={(v) => set('active', v)} />
      </Section>

      {id && perm('delete_records') ? (
        <Button kind="ghost" icon="trash-outline" title="Delete service" style={{ marginTop: space.lg }} onPress={() => confirmAction('Delete service?', 'Past quotes and invoices keep their line items. Consider hiding it instead.', async () => {
          const { error: e } = await supabase.from('services').delete().eq('id', id);
          if (e) return setError(friendlyError(e.message));
          router.dismissTo('/services');
        }, true)} />
      ) : null}
    </Screen>
  );
}

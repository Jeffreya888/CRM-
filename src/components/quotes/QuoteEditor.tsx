import { addDays, format } from 'date-fns';
import { router, Stack } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import { AssessPhotosSheet } from '../ai/AssessPhotosSheet';
import { QuoteMarginBanner } from '../costing/QuoteMarginBanner';
import { DateTimeField } from '../DateTimeField';
import { confirmAction, FormSheet, notify } from '../FormSheet';
import { LineItemsEditor } from '../LineItemsEditor';
import { quoteTone } from '../status';
import { Badge, Button, Card, EmptyState, ErrorBanner, Field, IconButton, Loading, Row, Screen, Section, Segmented, Select, T, ToggleRow } from '../ui';
import { money } from '../../lib/format';
import { useLookups } from '../../lib/lookups';
import { computeTotals, CONDITION_LEVELS, conditionLabel, conditionPct, priceService, withCondition } from '../../lib/pricing';
import { useOrg } from '../../lib/session';
import { friendlyError, supabase } from '../../lib/supabase';
import { colors, space } from '../../lib/theme';
import { useQuery } from '../../lib/useQuery';
import type { ConditionLevel, LineItem, Quote, QuoteOption, Service } from '../../lib/types';
import { QuotePhotos, uploadQuotePhotos } from './QuotePhotos';
import { isTravelLine, TravelFeeSection } from './TravelFeeSection';
import { buildTemplateContent, DEFAULT_OPTION_NAMES, usePriceGuide } from './quoteUtils';
import { onlinePaymentsLive } from '../../lib/payments';

interface Pkg { key: string; name: string; description: string; items: LineItem[] }
type DepositType = 'none' | 'percent' | 'fixed';
interface Header {
  customer_id: string | null; aircraft_id: string | null; location_id: string | null; branch_id: string | null;
  issue_date: string; valid_until_at: string | null; discount: number; tax_rate: number; taxPct: string;
  notes: string; terms: string; deposit_type: DepositType; deposit_value: string;
  /** undefined = not chosen yet (follows the selected asset's condition). */
  condition_level: ConditionLevel | null | undefined; condition_pct: number;
  service_mode: 'mobile' | 'shop'; travel_miles: string;
}

let keySeq = 0;
const newKey = () => `k${++keySeq}`;
const num = (v: unknown) => Number(v) || 0;
const toItem = (x: any): LineItem => ({ ...x, quantity: num(x.quantity), unit_price: num(x.unit_price) });
const copyItems = (items: LineItem[]) => items.map(({ id: _id, option_id: _o, ...rest }) => ({ ...rest }));

function defaultDeadline() {
  const d = addDays(new Date(), 30);
  d.setHours(17, 0, 0, 0);
  return d.toISOString();
}

/**
 * Quote editor: customer + asset, approval deadline (date and time), optional
 * Good / Better / Best packages, deposit, photos and templates. Sent quotes
 * are locked; changing them creates a new version.
 */
export function QuoteEditor({ id, customerId, aircraftId }: { id?: string; customerId?: string; aircraftId?: string }) {
  const { org, orgId, session, perm, can, branchId, businessTypes } = useOrg();
  const lk = useLookups();
  const money$ = perm('see_prices');
  const canDiscount = perm('give_discounts');
  const [header, setHeader] = useState<Header | null>(id ? null : {
    customer_id: customerId || null, aircraft_id: aircraftId || null, location_id: null, branch_id: branchId,
    issue_date: format(new Date(), 'yyyy-MM-dd'), valid_until_at: defaultDeadline(), discount: 0,
    tax_rate: Number(org.tax_rate) || 0, taxPct: String(+(Number(org.tax_rate) * 100).toFixed(4)),
    notes: '', terms: org.default_quote_terms ?? '', deposit_type: 'none', deposit_value: '',
    condition_level: undefined, condition_pct: 0,
    service_mode: org.service_mode === 'shop' ? 'shop' : 'mobile', travel_miles: '',
  });
  const [status, setStatus] = useState<Quote['status']>('draft');
  const [number, setNumber] = useState<string | null>(null);
  const [savedDeposit, setSavedDeposit] = useState<number | null>(null);
  const [packages, setPackages] = useState<Pkg[] | null>(null);
  const [items, setItems] = useState<LineItem[]>([]);
  const [pendingPhotos, setPendingPhotos] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [templateSheet, setTemplateSheet] = useState(false);
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [photoSheet, setPhotoSheet] = useState(false);

  useEffect(() => {
    if (!id) return;
    let alive = true;
    Promise.all([
      supabase.from('quotes').select('*').eq('id', id).single(),
      supabase.from('quote_options').select('*').eq('quote_id', id).order('sort_order'),
      supabase.from('quote_items').select('*').eq('quote_id', id).order('sort_order'),
    ]).then(([d, o, i]) => {
      if (!alive) return;
      if (d.error || !d.data) { setLoadError(friendlyError(d.error?.message ?? 'Quote not found')); return; }
      const q = d.data as Quote;
      const opts = (o.data ?? []) as QuoteOption[];
      const rows = (i.data ?? []).map(toItem);
      setStatus(q.status);
      setNumber(q.number);
      setSavedDeposit(num(q.deposit_amount));
      setHeader({
        customer_id: q.customer_id, aircraft_id: q.aircraft_id, location_id: q.location_id, branch_id: q.branch_id,
        issue_date: q.issue_date, valid_until_at: q.valid_until_at ?? `${q.valid_until}T23:59:00`, discount: num(q.discount),
        tax_rate: num(q.tax_rate), taxPct: String(+(num(q.tax_rate) * 100).toFixed(4)),
        notes: q.notes ?? '', terms: q.terms ?? '', deposit_type: q.deposit_type ?? 'none',
        deposit_value: q.deposit_type && q.deposit_type !== 'none' ? String(num(q.deposit_value)) : '',
        condition_level: q.condition_level ?? null, condition_pct: num(q.condition_pct),
        service_mode: q.service_mode === 'shop' ? 'shop' : 'mobile',
        travel_miles: q.travel_miles != null ? String(num(q.travel_miles)) : '',
      });
      if (opts.length) {
        setPackages(opts.map((op) => ({ key: newKey(), name: op.name, description: op.description ?? '', items: rows.filter((r) => r.option_id === op.id) })));
        setItems([]);
      } else {
        setPackages(null);
        setItems(rows.filter((r) => !r.option_id));
      }
    });
    return () => { alive = false; };
  }, [id]);

  const templates = useQuery(async () => {
    if (id) return [];
    const { data } = await supabase.from('quote_templates').select('id, name, asset_type').eq('org_id', orgId).order('name');
    return (data ?? []) as { id: string; name: string; asset_type: string }[];
  }, [orgId, id]);

  const asset = useMemo(() => lk.aircraft.find((a) => a.id === header?.aircraft_id) ?? null, [lk.aircraft, header?.aircraft_id]);
  const guide = usePriceGuide(asset?.asset_type === 'aircraft' ? asset.model_id : null, org.price_adjust_pct);
  const services = useMemo(() => lk.services.filter((s) => !asset || !s.asset_type || s.asset_type === asset.asset_type), [lk.services, asset]);

  if (!money$) {
    return <Screen><Stack.Screen options={{ title: 'Quote' }} /><EmptyState icon="lock-closed-outline" title="Prices are hidden for your role" body="Ask your company owner for access to prices to create or edit quotes." /></Screen>;
  }
  if (loadError) return <Screen><Stack.Screen options={{ title: 'Quote' }} /><ErrorBanner message={loadError} /></Screen>;
  if (!header || lk.loading) return <Loading />;

  // ---------------------------------------------------------------------------
  // Locked: sent quotes can't change. Offer a new version instead.
  // ---------------------------------------------------------------------------
  if (id && status !== 'draft') {
    const newVersion = async () => {
      try {
        const { data, error } = await supabase.rpc('revise_quote', { p_quote: id });
        if (error) throw error;
        router.replace({ pathname: '/quotes/edit', params: { id: data as string } });
      } catch (e: any) {
        notify('Could not create a new version', friendlyError(e.message));
      }
    };
    return (
      <Screen>
        <Stack.Screen options={{ title: number ?? 'Quote' }} />
        <Card>
          <Row style={{ justifyContent: 'space-between', marginBottom: space.sm }}>
            <T variant="h3">This quote is locked</T>
            <Badge label={status} tone={quoteTone[status]} />
          </Row>
          <T variant="muted">
            {status === 'accepted'
              ? 'The customer accepted this quote, so it can no longer change. Create a new quote for extra work.'
              : 'It was already sent, so the customer sees exactly what they approve. To change anything, create a new version. The old link will tell the customer a newer version exists.'}
          </T>
          <Row style={{ marginTop: space.lg, flexWrap: 'wrap' }}>
            {status !== 'accepted' ? <Button icon="git-branch-outline" title="Create new version" onPress={newVersion} /> : null}
            <Button kind="secondary" title="Back to quote" onPress={() => router.replace(`/quotes/${id}`)} />
          </Row>
        </Card>
      </Screen>
    );
  }

  const set = <K extends keyof Header>(k: K, v: Header[K]) => setHeader((h) => ({ ...h!, [k]: v }));
  const setCustomer = (v: string | null) => setHeader((h) => {
    const c = lk.customers.find((x) => x.id === v);
    const next: Header = { ...h!, customer_id: v, aircraft_id: null };
    if (c && !id) { next.tax_rate = c.tax_exempt ? 0 : Number(org.tax_rate) || 0; next.taxPct = String(+(next.tax_rate * 100).toFixed(4)); }
    return next;
  });

  // ---------------------------------------------------------------------------
  // Condition pricing: new service lines get + condition %, existing service
  // lines are re-priced from their service after a confirm.
  // ---------------------------------------------------------------------------
  const mult = org.condition_multipliers;
  const condLevel: ConditionLevel | null = header.condition_level === undefined ? asset?.condition_level ?? null : header.condition_level;
  const condPct = header.condition_level === undefined ? conditionPct(condLevel, mult) : header.condition_pct;
  const basePrice = (s: Service) => guide.priceFor(s) ?? (s.pricing_method === 'hourly' ? num(s.hourly_rate) : priceService(s, asset));
  const priceFor = (s: Service): number | null => {
    const g = guide.priceFor(s);
    if (g != null) return withCondition(g, condPct);
    if (!condPct || s.pricing_method === 'hourly') return null; // hourly: rate adjusted in withNewLinePct
    return withCondition(priceService(s, asset), condPct);
  };
  /** LineItemsEditor prices a newly added hourly service at the plain rate; add the condition % to it. */
  const withNewLinePct = (prev: LineItem[], next: LineItem[]): LineItem[] => {
    if (!condPct || next.length !== prev.length + 1) return next;
    const last = next[next.length - 1]!;
    const s = last.service_id ? lk.services.find((x) => x.id === last.service_id) : null;
    if (!s || s.pricing_method !== 'hourly' || guide.priceFor(s) != null || prev.includes(last)) return next;
    return [...next.slice(0, -1), { ...last, unit_price: withCondition(num(s.hourly_rate), condPct) }];
  };
  const isServiceLine = (it: LineItem) => !!it.service_id && lk.services.some((x) => x.id === it.service_id);
  const repriceList = (list: LineItem[], p: number) => list.map((it) => {
    const s = it.service_id ? lk.services.find((x) => x.id === it.service_id) : null;
    return s ? { ...it, unit_price: withCondition(basePrice(s), p) } : it;
  });
  const applyCondition = (level: ConditionLevel | null) => {
    const p = conditionPct(level, mult);
    setHeader((h) => ({ ...h!, condition_level: level, condition_pct: p }));
    const n = (packages ? packages.flatMap((pk) => pk.items) : items).filter(isServiceLine).length;
    if (!n || p === condPct) return;
    confirmAction(
      `Re-price ${n} line${n === 1 ? '' : 's'} for ${level ? `${conditionLabel(level)} condition` : 'no condition adjustment'}?`,
      `Lines added from services are recalculated from the service price${p ? ` plus ${p}%` : ''}. Custom lines stay as they are.`,
      () => {
        setItems((list) => repriceList(list, p));
        setPackages((ps) => (ps ? ps.map((pk) => ({ ...pk, items: repriceList(pk.items, p) })) : ps));
      },
    );
  };
  const setAsset = (v: string | null) => {
    const a = lk.aircraft.find((x) => x.id === v) ?? null;
    set('aircraft_id', v);
    // Follow the new asset's condition unless someone already picked one by hand.
    if (header.condition_level === undefined) applyCondition(a?.condition_level ?? null);
    else if (a?.condition_level && a.condition_level !== condLevel) applyCondition(a.condition_level);
  };
  const conditionOptions = [
    { value: 'none', label: 'Not set', hint: 'No condition adjustment' },
    ...CONDITION_LEVELS.map((c) => {
      const p = conditionPct(c.value, mult);
      return { value: c.value as string, label: `${c.label}${p ? `  +${p}%` : ''}`, hint: c.hint };
    }),
  ];

  /** Puts the travel fee on the quote (every package), replacing an earlier travel line. */
  const applyTravel = (line: { description: string; unit_price: number } | null) => {
    const swap = (list: LineItem[]) => {
      const rest = list.filter((it) => !isTravelLine(it.description));
      return line ? [...rest, { service_id: null, description: line.description, quantity: 1, unit_price: line.unit_price, taxable: false }] : rest;
    };
    if (packages) setPackages((ps) => ps!.map((pk) => ({ ...pk, items: swap(pk.items) })));
    else setItems((list) => swap(list));
  };

  const togglePackages = (on: boolean) => {
    if (on) {
      setPackages(DEFAULT_OPTION_NAMES.map((name, i) => ({ key: newKey(), name, description: '', items: i === 0 ? items : [] })));
      setItems([]);
    } else {
      setItems(packages?.[0]?.items ?? []);
      setPackages(null);
    }
  };
  const updatePkg = (key: string, patch: Partial<Pkg>) => setPackages((ps) => ps!.map((p) => (p.key === key ? { ...p, ...patch } : p)));

  const totalsFor = (list: LineItem[]) => computeTotals(list, header.discount, header.tax_rate);
  const depositFor = (total: number) => {
    const v = num(header.deposit_value);
    if (header.deposit_type === 'percent') return Math.round(total * Math.min(v, 100)) / 100;
    if (header.deposit_type === 'fixed') return Math.min(v, total);
    return 0;
  };

  const assetLabel = businessTypes.length > 1 ? 'Aircraft, vehicle or boat' : 'Aircraft';
  const showBranches = can('branches') && lk.branches.length > 0;

  const validate = (): string | null => {
    if (!header.customer_id) return 'Choose a customer';
    if (!header.valid_until_at) return 'Set an approval deadline';
    if (new Date(header.valid_until_at).getTime() < Date.now()) return 'The approval deadline must be in the future';
    if (header.deposit_type === 'percent' && !(num(header.deposit_value) > 0 && num(header.deposit_value) <= 100)) return 'Deposit percent must be between 1 and 100';
    if (header.deposit_type === 'fixed' && !(num(header.deposit_value) > 0)) return 'Enter the deposit amount';
    if (packages) {
      if (packages.some((p) => !p.name.trim())) return 'Every package needs a name';
      if (packages.some((p) => !p.items.length)) return 'Every package needs at least one line item';
      if (packages.some((p) => p.items.some((i) => !i.description.trim()))) return 'Every line needs a description';
    } else {
      if (!items.length) return 'Add at least one line item';
      if (items.some((i) => !i.description.trim())) return 'Every line needs a description';
    }
    return null;
  };

  const save = async () => {
    setError(null);
    const msg = validate();
    if (msg) return setError(msg);
    setSaving(true);
    try {
      const deadline = new Date(header.valid_until_at!);
      const row = {
        customer_id: header.customer_id, aircraft_id: header.aircraft_id, location_id: header.location_id,
        branch_id: showBranches ? header.branch_id : header.branch_id ?? null,
        issue_date: header.issue_date, valid_until_at: deadline.toISOString(), valid_until: format(deadline, 'yyyy-MM-dd'),
        tax_rate: header.tax_rate, notes: header.notes.trim() || null, terms: header.terms.trim() || null,
        deposit_type: header.deposit_type, deposit_value: header.deposit_type === 'none' ? 0 : num(header.deposit_value),
        condition_level: condLevel, condition_pct: condLevel ? condPct : 0,
        service_mode: header.service_mode, travel_miles: header.travel_miles === '' ? null : num(header.travel_miles),
        ...(canDiscount ? { discount: header.discount } : {}),
      };
      let quoteId = id;
      if (id) {
        const { error: uErr } = await supabase.from('quotes').update(row).eq('id', id);
        if (uErr) throw uErr;
        const { error: iErr } = await supabase.from('quote_items').delete().eq('quote_id', id);
        if (iErr) throw iErr;
        const { error: oErr } = await supabase.from('quote_options').delete().eq('quote_id', id);
        if (oErr) throw oErr;
      } else {
        const { data: n, error: nErr } = await supabase.rpc('next_number', { p_org: orgId, p_kind: 'quote' });
        if (nErr) throw nErr;
        const { data, error: insErr } = await supabase.from('quotes')
          .insert({ ...row, org_id: orgId, number: n, created_by: session!.user.id, status: 'draft' }).select('id').single();
        if (insErr) throw insErr;
        quoteId = data.id as string;
      }
      const lineRow = (i: LineItem, n: number, optionId: string | null) => ({
        org_id: orgId, quote_id: quoteId, option_id: optionId, service_id: i.service_id, description: i.description.trim(),
        quantity: i.quantity || 1, unit_price: i.unit_price || 0, taxable: i.taxable, sort_order: n + 1,
      });
      if (packages) {
        const { data: opts, error: oErr } = await supabase.from('quote_options')
          .insert(packages.map((p, i) => ({ org_id: orgId, quote_id: quoteId, name: p.name.trim(), description: p.description.trim() || null, sort_order: i })))
          .select('id, sort_order');
        if (oErr) throw oErr;
        const bySort = new Map((opts ?? []).map((o: any) => [o.sort_order as number, o.id as string]));
        const rows = packages.flatMap((p, pi) => p.items.map((it, n) => lineRow(it, n, bySort.get(pi) ?? null)));
        const { error: iErr } = await supabase.from('quote_items').insert(rows);
        if (iErr) throw iErr;
      } else {
        const { error: iErr } = await supabase.from('quote_items').insert(items.map((it, n) => lineRow(it, n, null)));
        if (iErr) throw iErr;
      }
      if (pendingPhotos.length) {
        try { await uploadQuotePhotos(orgId, quoteId!, pendingPhotos); } catch (e: any) { notify('Quote saved, but a photo did not upload', friendlyError(e.message)); }
      }
      router.replace(`/quotes/${quoteId}`);
    } catch (e: any) {
      setError(friendlyError(e.message));
    } finally {
      setSaving(false);
    }
  };

  const startFromTemplate = async () => {
    setError(null);
    if (!templateId) return;
    if (!header.customer_id) return setError('Choose the customer first, then pick a template');
    try {
      const { data, error: rpcErr } = await supabase.rpc('quote_from_template', { p_template: templateId, p_customer: header.customer_id, p_aircraft: header.aircraft_id });
      if (rpcErr) throw rpcErr;
      if (header.branch_id || header.location_id) {
        await supabase.from('quotes').update({ branch_id: header.branch_id, location_id: header.location_id }).eq('id', data as string);
      }
      router.replace({ pathname: '/quotes/edit', params: { id: data as string } });
    } catch (e: any) {
      setError(friendlyError(e.message));
    }
  };

  const saveTemplate = async (v: Record<string, any>) => {
    const content = buildTemplateContent(packages, items, header.notes, header.terms);
    if (!content.options.some((o) => o.items.length)) throw new Error('Add some line items before saving a template');
    const { error: tErr } = await supabase.from('quote_templates').insert({
      org_id: orgId, name: String(v.name).trim(), asset_type: asset?.asset_type ?? businessTypes[0] ?? 'aircraft', content,
    });
    if (tErr) throw tErr;
    notify('Template saved', 'Start new quotes from it with "Start from template", or manage templates from the Quotes screen.');
  };

  const cur = org.currency;
  const singleTotals = totalsFor(items);

  return (
    <Screen footer={<Button title={id ? 'Save quote' : 'Create quote'} onPress={save} loading={saving} />}>
      <Stack.Screen options={{
        title: id ? `Edit ${number ?? 'quote'}` : 'New quote',
        headerRight: () => <IconButton icon="bookmark-outline" label="Save as template" onPress={() => setTemplateSheet(true)} />,
      }} />
      <ErrorBanner message={error} />
      {id ? <QuoteMarginBanner quoteId={id} note="Based on the last saved version." /> : null}

      {!id && (templates.data?.length ?? 0) > 0 ? (
        <Card>
          <T variant="h3" style={{ marginBottom: space.sm }}>Start from template</T>
          <Select label="Template" value={templateId} onChange={setTemplateId}
            options={(templates.data ?? []).map((t) => ({ value: t.id, label: t.name, hint: t.asset_type }))} />
          <Button small kind="secondary" icon="copy-outline" title="Use this template" disabled={!templateId} onPress={startFromTemplate} />
          {!header.customer_id ? <T variant="small" style={{ marginTop: space.sm }}>Choose the customer below first.</T> : null}
        </Card>
      ) : null}

      <Select label="Customer *" value={header.customer_id} options={lk.customerOptions} onChange={setCustomer} searchable />
      <Select label={assetLabel} value={header.aircraft_id} options={lk.aircraftOptions(header.customer_id)} onChange={setAsset} allowClear
        placeholder={header.customer_id ? 'Select…' : 'Choose a customer first'} />
      {guide.hasGuide ? <T variant="small" style={{ marginTop: -space.md, marginBottom: space.lg, color: colors.primaryText }}>Services use the Flight Ready price guide for this model{num(org.price_adjust_pct) ? ` (${num(org.price_adjust_pct) > 0 ? '+' : ''}${num(org.price_adjust_pct)}% regional adjustment)` : ''}.</T> : null}
      <Select label="Condition" value={condLevel ?? 'none'} options={conditionOptions} inline={false}
        onChange={(v) => applyCondition(!v || v === 'none' ? null : (v as ConditionLevel))} />
      <T variant="small" style={{ marginTop: -space.md, marginBottom: space.lg }}>
        {condLevel
          ? `${conditionLabel(condLevel)} condition${condPct ? `: service prices +${condPct}%` : ': no price change'}${header.condition_level === undefined || (asset?.condition_level === condLevel) ? ' (from the asset)' : ''}.`
          : 'Pick a condition to adjust service prices (set the percents in Settings).'}
      </T>
      {!id && header.customer_id ? (
        <Button small kind="ghost" icon="camera-outline" title="Start from photos (AI condition report)" onPress={() => setPhotoSheet(true)}
          style={{ alignSelf: 'flex-start', marginTop: -space.sm, marginBottom: space.md }} />
      ) : null}
      <Select label="Facility" value={header.location_id} options={lk.locationOptions} onChange={(v) => set('location_id', v)} allowClear />
      {showBranches ? <Select label="Company location" value={header.branch_id} options={lk.branchOptions} onChange={(v) => set('branch_id', v)} allowClear /> : null}
      <DateTimeField label="Quote date" mode="date" value={header.issue_date} allowClear={false} onChange={(v) => v && set('issue_date', v)} />
      <DateTimeField label="Approval deadline (date and time) *" mode="datetime" value={header.valid_until_at} onChange={(v) => set('valid_until_at', v)} />
      <T variant="small" style={{ marginTop: -space.md, marginBottom: space.lg }}>After this time the customer can no longer accept the quote online.</T>

      <TravelFeeSection org={org} mode={header.service_mode} onMode={(m) => set('service_mode', m)}
        miles={header.travel_miles} onMiles={(m) => set('travel_miles', m)} customerId={header.customer_id} locationId={header.location_id}
        onApply={applyTravel} />

      <Section title="Services" icon="list-outline">
        <ToggleRow label="Offer packages (Good / Better / Best)" hint="Up to 3 options; the customer picks one and signs." value={!!packages} onChange={togglePackages} />
        {packages ? (
          <>
            {packages.map((p, idx) => (
              <Card key={p.key} style={{ borderColor: colors.borderStrong }}>
                <Row style={{ marginBottom: space.sm }}>
                  <Badge label={`Option ${idx + 1}`} tone="primary" raw />
                  <View style={{ flex: 1 }} />
                  {packages.length > 1 ? (
                    <IconButton icon="trash-outline" color={colors.danger} label="Remove package" onPress={() => setPackages((ps) => ps!.filter((x) => x.key !== p.key))} />
                  ) : null}
                </Row>
                <Field label="Package name" value={p.name} onChangeText={(v) => updatePkg(p.key, { name: v })} placeholder="Good" />
                <Field label="Short description (optional)" value={p.description} onChangeText={(v) => updatePkg(p.key, { description: v })} placeholder="What makes this package different" />
                <LineItemsEditor
                  title={p.name.trim() || `Option ${idx + 1}`}
                  items={p.items}
                  onChange={(list) => updatePkg(p.key, { items: withNewLinePct(p.items, list) })}
                  services={services}
                  aircraft={asset}
                  priceFor={priceFor}
                  discount={header.discount}
                  onDiscount={(d) => set('discount', d)}
                  hideDiscount={!canDiscount || idx > 0}
                  taxRate={header.tax_rate}
                  currency={cur}
                />
                {idx === 0 && !canDiscount && header.discount ? <T variant="small">Discount {money(header.discount, cur)} (set by a manager)</T> : null}
              </Card>
            ))}
            {packages.length < 3 ? (
              <Button kind="secondary" icon="add" title="Add package" onPress={() => setPackages((ps) => [...ps!, {
                key: newKey(), name: DEFAULT_OPTION_NAMES[ps!.length] ?? `Option ${ps!.length + 1}`, description: '', items: copyItems(ps![ps!.length - 1]?.items ?? []),
              }])} />
            ) : null}
            {header.discount ? <T variant="small" style={{ marginTop: space.sm }}>The discount applies to whichever package the customer picks.</T> : null}
          </>
        ) : (
          <>
            <LineItemsEditor
              items={items}
              onChange={(list) => setItems(withNewLinePct(items, list))}
              services={services}
              aircraft={asset}
              priceFor={priceFor}
              discount={header.discount}
              onDiscount={(d) => set('discount', d)}
              hideDiscount={!canDiscount}
              taxRate={header.tax_rate}
              currency={cur}
            />
            {!canDiscount && header.discount ? <T variant="small">Discount {money(header.discount, cur)} (set by a manager)</T> : null}
          </>
        )}
      </Section>

      <Section title="Deposit" icon="wallet-outline">
        <Segmented<DepositType> value={header.deposit_type} onChange={(v) => set('deposit_type', v)}
          options={[{ value: 'none', label: 'No deposit' }, { value: 'percent', label: 'Percent' }, { value: 'fixed', label: 'Fixed amount' }]} />
        {header.deposit_type !== 'none' ? (
          <>
            <Field label={header.deposit_type === 'percent' ? 'Deposit (%)' : `Deposit (${cur})`} keyboardType="decimal-pad" value={header.deposit_value}
              onChangeText={(v) => set('deposit_value', v.replace(/[^0-9.]/g, ''))} placeholder={header.deposit_type === 'percent' ? '25' : '500'} />
            <Card style={{ backgroundColor: colors.cardRaised }}>
              <T variant="muted" style={{ marginBottom: 4 }}>Deposit due when the customer accepts (paid by card):</T>
              {packages ? packages.map((p) => (
                <Row key={p.key} style={{ justifyContent: 'space-between' }}>
                  <T>{p.name || 'Option'}</T><T variant="money">{money(depositFor(totalsFor(p.items).total), cur)}</T>
                </Row>
              )) : <T variant="money">{money(depositFor(singleTotals.total), cur)}</T>}
              {savedDeposit != null ? <T variant="small" style={{ marginTop: 4 }}>Last saved: {money(savedDeposit, cur)}</T> : null}
              {!onlinePaymentsLive(org) ? (
                <T variant="small" style={{ marginTop: 4, color: colors.warning }}>Card deposits need Stripe or Square payments turned on in Settings.</T>
              ) : null}
            </Card>
          </>
        ) : null}
      </Section>

      <Section title="Photos" icon="images-outline">
        <QuotePhotos quoteId={id} editable pending={pendingPhotos} onPendingChange={setPendingPhotos} />
      </Section>

      <Section title="Notes & terms" icon="document-text-outline">
        <Field label="Tax rate (%)" keyboardType="decimal-pad" value={header.taxPct}
          onChangeText={(v) => setHeader((h) => ({ ...h!, taxPct: v, tax_rate: (Number(v.replace(/[^0-9.]/g, '')) || 0) / 100 }))} />
        <Field label="Notes to customer" multiline value={header.notes} onChangeText={(v) => set('notes', v)} />
        <Field label="Terms" multiline value={header.terms} onChangeText={(v) => set('terms', v)} />
      </Section>

      <Button kind="ghost" icon="bookmark-outline" title="Save as template" onPress={() => setTemplateSheet(true)} />

      {!id ? (
        <AssessPhotosSheet visible={photoSheet} onClose={() => setPhotoSheet(false)} customerId={header.customer_id} aircraftId={header.aircraft_id}
          onQuoteCreated={(qid) => { setPhotoSheet(false); router.replace({ pathname: '/quotes/edit', params: { id: qid } }); }} />
      ) : null}

      <FormSheet
        visible={templateSheet}
        title="Save as template"
        initial={{ name: packages ? packages.map((p) => p.name).join(' / ') : (items[0]?.description ?? '') }}
        fields={[{ key: 'name', label: 'Template name', type: 'text', required: true, placeholder: 'e.g. Midsize jet full detail' }]}
        onClose={() => setTemplateSheet(false)}
        onSubmit={saveTemplate}
      />
    </Screen>
  );
}

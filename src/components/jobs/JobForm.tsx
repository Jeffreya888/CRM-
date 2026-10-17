import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { ask, crewList, EMPTY_SCHEDULE, isHardConflict, loadSchedule, localScheduleProblems, saveSchedule, type ScheduleValue } from '../../lib/conflicts';
import { money } from '../../lib/format';
import { guidePrices } from '../../lib/jobs';
import { useLookups } from '../../lib/lookups';
import { canAdmin } from '../../lib/plans';
import { ASSET_TYPES, assetTypeInfo, hoursLabel, priceService } from '../../lib/pricing';
import { useOrg } from '../../lib/session';
import { friendlyError, supabase } from '../../lib/supabase';
import { colors, radius, space } from '../../lib/theme';
import type { AssetType, Conflict, JobPriority, JobStatus, Service } from '../../lib/types';
import { Badge, Button, Card, ErrorBanner, Field, IconButton, Ionicons, Loading, Row, Screen, Section, Segmented, Select, T, ToggleRow, type Option } from '../ui';
import { ScheduleEditor } from './ScheduleEditor';

interface Line {
  key: string;
  service_id: string | null;
  description: string;
  quantity: number;
  unit_price: number;
  taxable: boolean;
  /** Where the price came from: Flight Ready guide, the service's own pricing, or typed by hand. */
  source: 'guide' | 'standard' | 'custom';
  tier?: number | null;
}

let lineSeq = 0;
const newKey = () => `l${++lineSeq}`;

function standardPrice(svc: Service, asset: any, tier?: number | null): { unit: number; qty: number } {
  const t = tier != null ? svc.pricing_tiers?.[tier] : undefined;
  if (t) return { unit: Number(t.price), qty: 1 };
  if (svc.pricing_method === 'hourly') return { unit: Number(svc.hourly_rate), qty: Number(svc.est_hours) || 1 };
  return { unit: priceService(svc, asset), qty: 1 };
}

const defaultStart = () => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(9, 0, 0, 0); return d.toISOString(); };

/** New/edit job form: asset → facility, branch, services (price guide), status and the schedule editor. */
export function JobForm({ jobId, params }: { jobId?: string; params: { customer_id?: string; aircraft_id?: string; start?: string; service_id?: string } }) {
  const { org, orgId, session, role, perm, can, businessTypes, branchId: sessionBranch } = useOrg();
  const uid = session!.user.id;
  const lk = useLookups();
  const showMoney = perm('see_prices');
  const admin = canAdmin(role);

  const [loaded, setLoaded] = useState(!jobId);
  const [assetType, setAssetType] = useState<AssetType>('aircraft');
  const [customerId, setCustomerId] = useState<string | null>(params.customer_id || null);
  const [aircraftId, setAircraftId] = useState<string | null>(params.aircraft_id || null);
  const [locationId, setLocationId] = useState<string | null>(null);
  const [inherited, setInherited] = useState(false);
  const [branch, setBranch] = useState<string | null>(null);
  const [branchTouched, setBranchTouched] = useState(!!jobId);
  const [status, setStatus] = useState<JobStatus>('scheduled');
  const [origStatus, setOrigStatus] = useState<JobStatus>('scheduled');
  const [priority, setPriority] = useState<JobPriority>('normal');
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [internal, setInternal] = useState('');
  const [parking, setParking] = useState('');
  const [weather, setWeather] = useState(false);
  const [careOptIn, setCareOptIn] = useState(false);
  const [lines, setLines] = useState<Line[]>([]);
  const [schedule, setSchedule] = useState<ScheduleValue>(() => {
    const s = params.start || defaultStart();
    return { ...EMPTY_SCHEDULE, start: s, end: new Date(new Date(s).getTime() + 2 * 3600e3).toISOString() };
  });
  const [conf, setConf] = useState<{ list: Conflict[]; checking: boolean }>({ list: [], checking: false });
  const [guide, setGuide] = useState<Record<string, number>>({});
  const [error, setError] = useState<string | null>(null);
  const [pickedService, setPickedService] = useState<string | null>(null);

  // Load an existing job.
  useEffect(() => {
    if (!jobId) return;
    let alive = true;
    (async () => {
      try {
        const [j, items, s] = await Promise.all([
          supabase.from('jobs').select('*, aircraft:aircraft(asset_type)').eq('id', jobId).single(),
          showMoney ? supabase.from('job_items').select('*').eq('job_id', jobId).order('sort_order') : Promise.resolve({ data: [] as any[], error: null }),
          loadSchedule(jobId),
        ]);
        if (j.error) throw j.error;
        if (!alive) return;
        const d = j.data as any;
        setCustomerId(d.customer_id); setAircraftId(d.aircraft_id); setLocationId(d.location_id); setBranch(d.branch_id);
        setStatus(d.status); setOrigStatus(d.status); setPriority(d.priority); setTitle(d.title ?? ''); setNotes(d.notes ?? '');
        setInternal(d.internal_notes ?? ''); setParking(d.parking_spot ?? ''); setWeather(!!d.weather_sensitive); setCareOptIn(!!d.care_opt_in);
        if (d.aircraft?.asset_type) setAssetType(d.aircraft.asset_type);
        setLines(((items.data ?? []) as any[]).map((x) => ({ key: newKey(), service_id: x.service_id, description: x.description, quantity: Number(x.quantity), unit_price: Number(x.unit_price), taxable: x.taxable, source: 'custom' })));
        const { locationId: _l, status: _s, confirmed: _c, ...v } = s;
        setSchedule(v);
        setLoaded(true);
      } catch (e: any) {
        if (alive) { setError(friendlyError(e.message)); setLoaded(true); }
      }
    })();
    return () => { alive = false; };
  }, [jobId, showMoney]);

  const asset = useMemo(() => lk.aircraft.find((a) => a.id === aircraftId) ?? null, [lk.aircraft, aircraftId]);

  // Default branch: the member's default branch, else the location filter.
  const me = lk.members.find((m) => m.user_id === uid);
  const effectiveBranch = branchTouched ? branch : branch ?? me?.default_branch_id ?? sessionBranch ?? null;

  // Prefill from a service (e.g. "Schedule a job" on a service).
  const [prefilled, setPrefilled] = useState(false);
  if (!prefilled && !jobId && params.service_id && lk.services.length) {
    setPrefilled(true);
    const svc = lk.services.find((s) => s.id === params.service_id);
    if (svc) {
      setAssetType(svc.asset_type ?? 'aircraft');
      const p = standardPrice(svc, null);
      setLines([{ key: newKey(), service_id: svc.id, description: svc.name, quantity: p.qty, unit_price: p.unit, taxable: svc.taxable, source: 'standard' }]);
    }
  }
  // Asset passed in the URL: inherit its type and facility once.
  const [assetInit, setAssetInit] = useState(false);
  if (!assetInit && !jobId && asset) {
    setAssetInit(true);
    setAssetType(asset.asset_type ?? 'aircraft');
    if (asset.home_location_id) { setLocationId(asset.home_location_id); setInherited(true); }
  }

  // Flight Ready price guide for the asset's model.
  const guideKeys = useMemo(() => lines.map((l) => lk.services.find((s) => s.id === l.service_id)?.guide_key ?? '').filter(Boolean), [lines, lk.services]);
  const modelId = asset?.model_id ?? null;
  const gkKey = JSON.stringify([modelId, [...new Set(guideKeys)].sort(), org.price_adjust_pct]);
  useEffect(() => {
    if (!showMoney) return;
    let alive = true;
    guidePrices(modelId, guideKeys, org.price_adjust_pct).then((map) => {
      if (!alive) return;
      setGuide(map);
      // Re-price lines that weren't typed by hand.
      setLines((ls) => ls.map((l) => {
        if (l.source === 'custom') return l;
        const svc = lk.services.find((s) => s.id === l.service_id);
        if (!svc) return l;
        const gp = svc.guide_key ? map[svc.guide_key] : undefined;
        if (gp != null && l.tier == null) return { ...l, unit_price: gp, quantity: 1, source: 'guide' };
        const p = standardPrice(svc, asset, l.tier);
        return { ...l, unit_price: p.unit, quantity: p.qty, source: 'standard' };
      }));
    }).catch(() => {});
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gkKey, showMoney, asset?.category, asset?.length_ft]);

  const typeServices = lk.services.filter((s) => s.active && (s.asset_type ?? 'aircraft') === assetType);
  const serviceOptions: Option[] = typeServices.flatMap((s) => {
    const hours = hoursLabel(s.est_hours, s.est_hours_max) ?? undefined;
    if (s.pricing_tiers?.length) return s.pricing_tiers.map((t, i) => ({ value: `${s.id}::${i}`, label: `${s.name} · ${t.name}`, hint: [showMoney ? money(t.price, org.currency) : null, t.detail, hours].filter(Boolean).join(' · ') }));
    return [{ value: s.id, label: s.name, hint: hours }];
  });

  const addService = (v: string | null) => {
    setPickedService(null);
    if (!v) return;
    const [sid, tierIdx] = v.split('::');
    const svc = lk.services.find((s) => s.id === sid);
    if (!svc) return;
    const tier = tierIdx != null ? Number(tierIdx) : null;
    const gp = svc.guide_key && tier == null ? guide[svc.guide_key] : undefined;
    const p = standardPrice(svc, asset, tier);
    const description = tier != null ? `${svc.name} (${svc.pricing_tiers[tier]!.name})` : svc.name;
    const next = [...lines, { key: newKey(), service_id: svc.id, description, quantity: gp != null ? 1 : p.qty, unit_price: gp ?? p.unit, taxable: svc.taxable, source: gp != null ? 'guide' as const : 'standard' as const, tier }];
    setLines(next);
    // Stretch the schedule to the estimated hours of all services.
    if (schedule.start && !jobId) {
      const hours = next.reduce((h, l) => { const s = lk.services.find((x) => x.id === l.service_id); return h + (Number(s?.est_hours_max ?? s?.est_hours) || 0); }, 0);
      if (hours > 0) setSchedule((sc) => ({ ...sc, end: new Date(new Date(sc.start!).getTime() + Math.min(24, Math.max(1, hours)) * 3600e3).toISOString() }));
    }
  };
  const updateLine = (key: string, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  const categories = useMemo(() => [...new Set(lines.map((l) => lk.services.find((s) => s.id === l.service_id)?.category).filter((x): x is string => !!x))], [lines, lk.services]);

  if (lk.loading || !loaded) return <Loading />;

  const assetOptions = lk.aircraft
    .filter((a) => (!customerId || a.customer_id === customerId) && (a.asset_type ?? 'aircraft') === assetType)
    .map<Option>((a) => ({ value: a.id, label: a.tail_number, hint: [a.manufacturer, a.model].filter(Boolean).join(' ') || undefined }));
  const typeInfo = assetTypeInfo(assetType);
  const facilityLabel = assetType === 'watercraft' ? 'Marina / facility' : assetType === 'vehicle' ? 'Service site' : 'Airport / FBO';
  const statusEditable = !jobId || origStatus === 'tentative' || origStatus === 'scheduled';
  const total = lines.reduce((s, l) => s + l.quantity * l.unit_price, 0);
  const hard = conf.list.some(isHardConflict);
  const blocked = hard || (conf.list.length > 0 && !admin);

  const save = async () => {
    setError(null);
    if (!customerId) return setError('Choose a customer.');
    if (!jobId && !lines.length && !title.trim()) return setError('Add at least one service (or a job summary).');
    const local = localScheduleProblems(schedule);
    if (local) return setError(local);
    if (conf.checking) return setError('Still checking the schedule — try again in a moment.');
    if (blocked) return setError(hard ? 'Fix the times to save.' : 'This schedule has conflicts. Only an owner or admin can override them.');
    let override = false;
    if (conf.list.length) {
      override = await ask('Override conflicts?', `${conf.list.map((c) => '• ' + c.message).join('\n')}\n\nSave anyway? The override is recorded on the job.`, 'Override and save', true);
      if (!override) return;
    }
    try {
      const header: Record<string, unknown> = {
        customer_id: customerId, aircraft_id: aircraftId, location_id: locationId,
        branch_id: can('branches') ? effectiveBranch : null,
        priority, weather_sensitive: weather, care_opt_in: careOptIn,
        parking_spot: parking.trim() || null, notes: notes.trim() || null, internal_notes: internal.trim() || null,
        title: title.trim() || lines.map((l) => l.description).join(', ') || null,
      };
      let id = jobId;
      if (jobId) {
        if (statusEditable && status !== origStatus && status === 'tentative') header.status = 'tentative';
        const { error: e } = await supabase.from('jobs').update(header).eq('id', jobId);
        if (e) throw e;
        if (showMoney) {
          const del = await supabase.from('job_items').delete().eq('job_id', jobId);
          if (del.error) throw del.error;
        }
      } else {
        const { data: number, error: nErr } = await supabase.rpc('next_number', { p_org: orgId, p_kind: 'job' });
        if (nErr) throw nErr;
        const { data, error: e } = await supabase.from('jobs').insert({
          ...header, org_id: orgId, number, status, created_by: uid,
          scheduled_start: schedule.start, scheduled_end: schedule.end,
          travel_before_min: schedule.travelBefore || 0, travel_after_min: schedule.travelAfter || 0,
        }).select('id').single();
        if (e) throw e;
        id = data.id as string;
        // The checklist comes from each service's steps (linked to the guide step).
        const steps = lines.flatMap((l, n) => {
          const svc = lk.services.find((s) => s.id === l.service_id);
          return (svc?.checklist ?? []).map((label, k) => ({ org_id: orgId, job_id: id, label, sort_order: (n + 1) * 100 + k, guide_key: svc?.guide_key ?? null, step_index: svc?.guide_key ? k : null }));
        });
        if (steps.length) await supabase.from('job_checklist_items').insert(steps);
      }
      if (showMoney && lines.length) {
        const { error: e } = await supabase.from('job_items').insert(lines.map((l, n) => ({
          org_id: orgId, job_id: id, service_id: l.service_id, description: l.description, quantity: l.quantity || 1, unit_price: l.unit_price || 0, taxable: l.taxable, sort_order: n + 1,
        })));
        if (e) throw e;
      }
      const hasSchedule = !!schedule.start || crewList(schedule).length > 0 || schedule.equipment.length > 0 || !!schedule.hangar;
      if (hasSchedule || jobId) {
        try {
          await saveSchedule(id!, schedule, { canOverride: admin, override, confirm: !!jobId && origStatus === 'tentative' && status === 'scheduled' });
        } catch (e: any) {
          if (!jobId) {
            notify('Job created', `The schedule could not be saved: ${friendlyError(e.message)}\n\nOpen "Time, crew & resources" on the job to try again.`);
            router.replace(`/jobs/${id}`);
            return;
          }
          throw e;
        }
      }
      if (jobId) router.back(); else router.replace(`/jobs/${id}`);
    } catch (e: any) {
      setError(friendlyError(e.message));
    }
  };

  return (
    <Screen footer={
      <View>
        {conf.list.length ? <T variant="small" style={{ marginBottom: 6, color: blocked ? colors.danger : colors.warning }}>
          {blocked ? (hard ? 'Fix the times to save.' : 'Resolve the conflicts to save. Only an owner or admin can override.') : 'Conflicts found — you can override as an owner/admin.'}
        </T> : null}
        <Button title={conf.list.length && !blocked ? 'Override and save' : jobId ? 'Save job' : 'Create job'} kind={conf.list.length && !blocked ? 'danger' : 'primary'}
          disabled={!customerId || blocked} onPress={save} />
      </View>
    }>
      <ErrorBanner message={error} />
      {businessTypes.length > 1 ? (
        <Segmented value={assetType} onChange={(t) => { setAssetType(t); setAircraftId(null); setLines([]); }}
          options={ASSET_TYPES.filter((a) => businessTypes.includes(a.value)).map((a) => ({ value: a.value, label: a.plural }))} />
      ) : null}
      <Select label="Customer *" placeholder="Select customer" icon="person-outline" iconColor={colors.primary}
        value={customerId} options={lk.customerOptions} searchable={lk.customerOptions.length > 8}
        onChange={(v) => { setCustomerId(v); setAircraftId(null); }} />
      <Select label={typeInfo.label} placeholder={customerId ? `Select ${typeInfo.label.toLowerCase()}` : 'Select a customer first'} icon={typeInfo.icon} iconColor={colors.warning}
        value={aircraftId} options={assetOptions} disabled={!customerId} allowClear searchable={assetOptions.length > 8}
        onChange={(v) => {
          setAircraftId(v);
          const a = lk.aircraft.find((x) => x.id === v);
          if (a?.home_location_id) { setLocationId(a.home_location_id); setInherited(true); } else setInherited(false);
        }} />
      <Select label={facilityLabel} placeholder="No facility" icon="location-outline" iconColor={colors.success}
        value={locationId} options={lk.locationOptions} allowClear searchable={lk.locationOptions.length > 8}
        onChange={(v) => { setLocationId(v); setInherited(false); }} />
      {inherited && locationId ? <T variant="small" style={{ marginTop: -10, marginBottom: space.lg }}>From the {typeInfo.label.toLowerCase()}&apos;s usual facility. You can change it.</T> : null}
      {can('branches') && lk.branches.length ? (
        <Select label="Company location" placeholder="No branch" icon="business-outline" value={effectiveBranch} options={lk.branchOptions} allowClear
          onChange={(v) => { setBranch(v); setBranchTouched(true); }} />
      ) : null}

      <Section title="Services" icon="construct-outline">
        {lines.map((l) => (
          <Card key={l.key} style={{ padding: space.md }}>
            <Row style={{ alignItems: 'flex-start' }}>
              <View style={{ flex: 1 }}>
                <T style={{ fontWeight: '600' }}>{l.description}</T>
                {showMoney ? (
                  <Row style={{ marginTop: 4, flexWrap: 'wrap' }}>
                    {l.source === 'guide' ? <Badge label="Flight Ready price guide" tone="success" raw /> : l.source === 'custom' ? <Badge label="Custom price" raw /> : <Badge label="Standard pricing" tone="info" raw />}
                    {l.source === 'guide' && Number(org.price_adjust_pct) ? <T variant="small">incl. {Number(org.price_adjust_pct) > 0 ? '+' : ''}{Number(org.price_adjust_pct)}% regional adjustment</T> : null}
                  </Row>
                ) : null}
              </View>
              <IconButton icon="close-circle-outline" color={colors.textMuted} label="Remove" onPress={() => setLines((ls) => ls.filter((x) => x.key !== l.key))} />
            </Row>
            {showMoney ? (
              <Row gap={space.md} style={{ marginTop: space.sm }}>
                <Field style={{ flex: 1, marginBottom: 0 }} label="Qty" keyboardType="decimal-pad" value={String(l.quantity)}
                  onChangeText={(t) => updateLine(l.key, { quantity: Number(t.replace(/[^0-9.]/g, '')) || 0 })} />
                <Field style={{ flex: 2, marginBottom: 0 }} label="Price" keyboardType="decimal-pad" value={String(l.unit_price)}
                  onChangeText={(t) => updateLine(l.key, { unit_price: Number(t.replace(/[^0-9.]/g, '')) || 0, source: 'custom' })} />
              </Row>
            ) : null}
          </Card>
        ))}
        <Select label={lines.length ? 'Add another service' : 'Add a service'} placeholder={typeServices.length ? 'Choose a service' : `No ${typeInfo.plural.toLowerCase()} services yet`}
          icon="add-circle-outline" iconColor={colors.success} value={pickedService} options={serviceOptions} searchable={serviceOptions.length > 10} onChange={addService} />
        {showMoney && lines.length ? (
          <Row style={{ justifyContent: 'space-between', marginTop: -6, marginBottom: space.md }}>
            <T variant="muted">Job value (before tax & discounts)</T>
            <T style={{ fontWeight: '700', color: colors.success }}>{money(total, org.currency)}</T>
          </Row>
        ) : null}
        {showMoney && asset && !asset.model_id && lines.length ? (
          <T variant="small" style={{ marginBottom: space.md }}>Tip: pick the model from the catalog on the {typeInfo.label.toLowerCase()} to use Flight Ready price-guide prices.</T>
        ) : null}
      </Section>

      <Section title="Status" icon="flag-outline">
        {statusEditable ? (
          <Row style={{ marginBottom: space.lg }}>
            {(['tentative', 'scheduled'] as const).map((s) => (
              <Pressable key={s} onPress={() => setStatus(s)} style={{ flex: 1, padding: space.md, borderRadius: radius.md, borderWidth: 1, borderStyle: s === 'tentative' ? 'dashed' : 'solid', borderColor: status === s ? colors.primary : colors.borderStrong, backgroundColor: status === s ? colors.primarySoft : colors.card }}>
                <T style={{ fontWeight: '700' }}>{s === 'tentative' ? 'Tentative' : 'Scheduled'}</T>
                <T variant="small">{s === 'tentative' ? 'Hold the time; confirm later' : 'Confirmed with the customer'}</T>
              </Pressable>
            ))}
          </Row>
        ) : <View style={{ marginBottom: space.md }}><Badge label={origStatus} /></View>}
        <Select label="Priority" value={priority} onChange={(v) => v && setPriority(v)} inline
          options={[{ value: 'low', label: 'Low' }, { value: 'normal', label: 'Normal' }, { value: 'high', label: 'High' }, { value: 'aog', label: 'AOG / urgent' }]} />
      </Section>

      <Section title="Time, crew & resources" icon="calendar-outline">
        <ScheduleEditor value={schedule} onChange={setSchedule} jobId={jobId} locationId={locationId} categories={categories}
          onConflicts={(list, checking) => setConf({ list, checking })} />
      </Section>

      <Section title="Details" icon="document-text-outline">
        <Field label="Job summary" placeholder="Defaults to the list of services" value={title} onChangeText={setTitle} />
        <Field label="Hangar / ramp spot" value={parking} onChangeText={setParking} />
        <ToggleRow label="Weather-sensitive (outdoor work)" value={weather} onChange={setWeather} />
        <ToggleRow label="Customer opted in to follow-up care" hint="When the job is completed, the next visit is created as Tentative for you to confirm." value={careOptIn} onChange={setCareOptIn} />
        <Field label="Notes (shown on the service report)" value={notes} onChangeText={setNotes} multiline />
        <Field label="Internal notes (staff only)" value={internal} onChangeText={setInternal} multiline />
      </Section>
      <Row style={{ marginTop: space.sm }}>
        <Ionicons name="information-circle-outline" size={16} color={colors.textMuted} />
        <T variant="small" style={{ flex: 1 }}>Discounts and tax are applied when you create the invoice.</T>
      </Row>
    </Screen>
  );
}

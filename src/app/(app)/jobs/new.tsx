import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { DateTimeField } from '../../../components/DateTimeField';
import { Button, ErrorBanner, Field, Loading, Screen, Select, type Option } from '../../../components/ui';
import { useLookups } from '../../../lib/lookups';
import { headlinePrice, hoursLabel, priceService } from '../../../lib/pricing';
import { useOrg } from '../../../lib/session';
import { friendlyError, supabase } from '../../../lib/supabase';
import { colors } from '../../../lib/theme';

const usd = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;

/** Quick job creation (the full editor at /jobs/edit handles crew, multiple services, etc.). */
export default function NewJob() {
  const params = useLocalSearchParams<{ customer_id?: string; aircraft_id?: string; start?: string }>();
  const { orgId, session } = useOrg();
  const lk = useLookups();
  const [customerId, setCustomerId] = useState<string | null>(params.customer_id || null);
  const [aircraftId, setAircraftId] = useState<string | null>(params.aircraft_id || null);
  const [service, setService] = useState<string | null>(null);
  const [start, setStart] = useState<string | null>(() => {
    if (params.start) return params.start;
    const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(9, 0, 0, 0);
    return d.toISOString();
  });
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);

  const aircraft = useMemo(() => lk.aircraft.find((a) => a.id === aircraftId) ?? null, [lk.aircraft, aircraftId]);

  // One option per service, plus one per pricing tier ("Interior Detail · Medium Interior").
  const serviceOptions = useMemo<Option[]>(() => lk.services.filter((s) => s.active).flatMap((s) => {
    const hours = hoursLabel(s.est_hours, s.est_hours_max);
    if (s.pricing_tiers?.length) {
      return s.pricing_tiers.map((t, i) => ({ value: `${s.id}::${i}`, label: `${s.name} · ${t.name}`, hint: [usd(t.price), t.detail, hours].filter(Boolean).join(' - ') }));
    }
    const price = s.pricing_method === 'hourly' ? headlinePrice(s) : aircraft || s.pricing_method === 'flat' ? usd(priceService(s, aircraft)) : headlinePrice(s);
    return [{ value: s.id, label: s.name, hint: [price, hours].filter(Boolean).join(' - ') }];
  }), [lk.services, aircraft]);

  if (lk.loading) return <Loading />;

  const create = async () => {
    setError(null);
    const [serviceId, tierIdx] = (service ?? '').split('::');
    const svc = lk.services.find((s) => s.id === serviceId);
    if (!customerId || !svc) return setError('Choose a customer and a service');
    const tier = tierIdx != null ? svc.pricing_tiers[Number(tierIdx)] : undefined;
    const qty = svc.pricing_method === 'hourly' ? Number(svc.est_hours) || 1 : 1;
    const unit = tier ? Number(tier.price) : svc.pricing_method === 'hourly' ? Number(svc.hourly_rate) : priceService(svc, aircraft);
    const hours = Number(svc.est_hours_max ?? svc.est_hours) || 4;
    try {
      const { data: number, error: nErr } = await supabase.rpc('next_number', { p_org: orgId, p_kind: 'job' });
      if (nErr) throw nErr;
      const title = tier ? `${svc.name} (${tier.name})` : svc.name;
      const { data: job, error } = await supabase.from('jobs').insert({
        org_id: orgId, number, customer_id: customerId, aircraft_id: aircraftId, title,
        location_id: aircraft?.home_location_id ?? null,
        scheduled_start: start, scheduled_end: start ? new Date(new Date(start).getTime() + hours * 3600e3).toISOString() : null,
        notes: notes.trim() || null, created_by: session!.user.id,
      }).select('id').single();
      if (error) throw error;
      const { error: iErr } = await supabase.from('job_items').insert({
        org_id: orgId, job_id: job.id, service_id: svc.id, description: title, quantity: qty, unit_price: unit, taxable: svc.taxable, sort_order: 1,
      });
      if (iErr) throw iErr;
      if (svc.checklist.length) {
        await supabase.from('job_checklist_items').insert(svc.checklist.map((label, k) => ({ org_id: orgId, job_id: job.id, label, sort_order: 100 + k })));
      }
      router.replace(`/jobs/${job.id}`);
    } catch (e: any) {
      setError(friendlyError(e.message));
    }
  };

  return (
    <Screen footer={<Button title="Create Job" onPress={create} disabled={!customerId || !service} />}>
      <Stack.Screen options={{ title: 'New Job' }} />
      <ErrorBanner message={error} />
      <Select label="Customer" placeholder="Select Customer" icon="person-outline" iconColor={colors.primary}
        value={customerId} options={lk.customerOptions} searchable={lk.customerOptions.length > 8}
        onChange={(v) => { setCustomerId(v); setAircraftId(null); }} />
      <Select label="Aircraft" placeholder={customerId ? 'Select Aircraft' : 'Select a customer first'} icon="airplane-outline" iconColor={colors.warning}
        value={aircraftId} options={lk.aircraftOptions(customerId)} inline disabled={!customerId} allowClear
        onChange={setAircraftId} />
      <Select label="Service" placeholder="Select Service" icon="construct-outline" iconColor={colors.success}
        value={service} options={serviceOptions} inline={serviceOptions.length <= 12} searchable={serviceOptions.length > 12}
        onChange={setService} />
      <DateTimeField label="Date & Time" value={start} onChange={setStart} />
      <Field label="Notes (Optional)" placeholder="Add any special instructions..." value={notes} onChangeText={setNotes} multiline />
    </Screen>
  );
}

import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable } from 'react-native';
import { FormFields, type FieldDef, type FormValues } from '../../../components/FormSheet';
import { LineItemsEditor } from '../../../components/LineItemsEditor';
import { Avatar, Button, ErrorBanner, Loading, Row, Screen, Section, T } from '../../../components/ui';
import { initials } from '../../../lib/format';
import { useLookups } from '../../../lib/lookups';
import { useOrg } from '../../../lib/session';
import { friendlyError, supabase } from '../../../lib/supabase';
import { colors, radius, space } from '../../../lib/theme';
import type { LineItem } from '../../../lib/types';

export default function JobEdit() {
  const params = useLocalSearchParams<{ id?: string; customer_id?: string; aircraft_id?: string; start?: string; then?: 'detail' }>();
  const { id } = params;
  const { org, orgId, session } = useOrg();
  const lk = useLookups();
  const [values, setValues] = useState<FormValues | null>(null);
  const [items, setItems] = useState<LineItem[]>([]);
  const [assignees, setAssignees] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) {
      const start = params.start ? new Date(params.start) : (() => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(9, 0, 0, 0); return d; })();
      setValues({
        customer_id: params.customer_id || null, aircraft_id: params.aircraft_id || null, status: 'scheduled', priority: 'normal',
        scheduled_start: start.toISOString(), scheduled_end: new Date(start.getTime() + 4 * 3600e3).toISOString(), weather_sensitive: false,
      });
      return;
    }
    Promise.all([
      supabase.from('jobs').select('*').eq('id', id).single(),
      supabase.from('job_items').select('*').eq('job_id', id).order('sort_order'),
      supabase.from('job_assignments').select('user_id').eq('job_id', id),
    ]).then(([j, i, a]) => {
      setValues(j.data);
      setItems((i.data ?? []).map((x: any) => ({ ...x, quantity: Number(x.quantity), unit_price: Number(x.unit_price) })));
      setAssignees((a.data ?? []).map((x) => x.user_id));
    });
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Default location from the aircraft's home base or customer's usual FBO.
  const aircraft = useMemo(() => lk.aircraft.find((a) => a.id === values?.aircraft_id) ?? null, [lk.aircraft, values?.aircraft_id]);
  useEffect(() => {
    if (!id && aircraft?.home_location_id && values && !values.location_id) setValues((v) => ({ ...v!, location_id: aircraft.home_location_id }));
  }, [aircraft?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!values || lk.loading) return <Loading />;

  const fields: FieldDef[] = [
    { key: 'customer_id', label: 'Customer', type: 'select', options: lk.customerOptions, required: true },
    { key: 'aircraft_id', label: 'Aircraft', type: 'select', options: lk.aircraftOptions(values.customer_id), allowClear: true },
    { key: 'location_id', label: 'Airport / FBO', type: 'select', options: lk.locationOptions, allowClear: true },
    { key: 'parking_spot', label: 'Hangar / ramp spot', type: 'text' },
    { key: 'scheduled_start', label: 'Start', type: 'datetime' },
    { key: 'scheduled_end', label: 'End', type: 'datetime' },
    { key: 'priority', label: 'Priority', type: 'select', options: [{ value: 'low', label: 'Low' }, { value: 'normal', label: 'Normal' }, { value: 'high', label: 'High' }, { value: 'aog', label: 'AOG / urgent' }] },
    { key: 'status', label: 'Status', type: 'select', options: ['scheduled', 'in_progress', 'on_hold', 'completed', 'cancelled'].map((s) => ({ value: s, label: s.replace('_', ' ') })) },
    { key: 'weather_sensitive', label: 'Weather-sensitive (outdoor ramp work)', type: 'toggle' },
    { key: 'title', label: 'Summary', type: 'text', placeholder: 'Defaults to the list of services' },
    { key: 'notes', label: 'Notes (visible on service report)', type: 'multiline' },
    { key: 'internal_notes', label: 'Internal notes (staff only)', type: 'multiline' },
  ];

  const save = async () => {
    setError(null);
    if (!values.customer_id) return setError('Choose a customer');
    if (values.scheduled_start && values.scheduled_end && new Date(values.scheduled_end) < new Date(values.scheduled_start)) return setError('End must be after start');
    try {
      const header = {
        customer_id: values.customer_id, aircraft_id: values.aircraft_id ?? null, location_id: values.location_id ?? null,
        parking_spot: values.parking_spot || null, scheduled_start: values.scheduled_start ?? null, scheduled_end: values.scheduled_end ?? null,
        priority: values.priority, status: values.status, weather_sensitive: !!values.weather_sensitive,
        title: values.title?.trim() || items.map((i) => i.description).join(', ') || null,
        notes: values.notes || null, internal_notes: values.internal_notes || null,
      };
      let jobId = id;
      if (id) {
        const { error } = await supabase.from('jobs').update(header).eq('id', id);
        if (error) throw error;
        await supabase.from('job_items').delete().eq('job_id', id);
        await supabase.from('job_assignments').delete().eq('job_id', id);
      } else {
        const { data: number, error: nErr } = await supabase.rpc('next_number', { p_org: orgId, p_kind: 'job' });
        if (nErr) throw nErr;
        const { data, error } = await supabase.from('jobs').insert({ ...header, org_id: orgId, number, created_by: session!.user.id }).select('id').single();
        if (error) throw error;
        jobId = data.id;
        // Seed the checklist from each service's default steps.
        const steps = items.flatMap((i, n) => (lk.services.find((s) => s.id === i.service_id)?.checklist ?? []).map((label, k) => ({ org_id: orgId, job_id: jobId, label, sort_order: (n + 1) * 100 + k })));
        if (steps.length) await supabase.from('job_checklist_items').insert(steps);
      }
      if (items.length) {
        const { error } = await supabase.from('job_items').insert(items.map((i, n) => ({
          org_id: orgId, job_id: jobId, service_id: i.service_id, description: i.description, quantity: i.quantity || 1, unit_price: i.unit_price || 0, taxable: i.taxable, sort_order: n + 1,
        })));
        if (error) throw error;
      }
      if (assignees.length) {
        const { error } = await supabase.from('job_assignments').insert(assignees.map((user_id) => ({ job_id: jobId, user_id, org_id: orgId })));
        if (error) throw error;
      }
      if (id && params.then === 'detail') router.replace(`/jobs/${id}`);
      else if (id) router.back();
      else router.replace(`/jobs/${jobId}`);
    } catch (e: any) {
      setError(friendlyError(e.message));
    }
  };

  return (
    <Screen footer={<Button title={id ? 'Save job' : 'Create job'} onPress={save} />}>
      <Stack.Screen options={{ title: id ? 'Edit job' : 'New job' }} />
      <ErrorBanner message={error} />
      <FormFields fields={fields.slice(0, 9)} values={values} setValue={(k, v) => setValues((s) => ({ ...s!, [k]: v, ...(k === 'customer_id' ? { aircraft_id: null } : {}) }))} />
      <Section title="Crew">
        <Row style={{ flexWrap: 'wrap' }}>
          {lk.members.map((m) => {
            const on = assignees.includes(m.user_id);
            return (
              <Pressable key={m.user_id} onPress={() => setAssignees((a) => (on ? a.filter((x) => x !== m.user_id) : [...a, m.user_id]))}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 6, padding: 6, paddingRight: 12, borderRadius: radius.pill, backgroundColor: on ? colors.primarySoft : colors.card, borderWidth: 1, borderColor: on ? colors.primary : colors.border }}>
                <Avatar size={26} label={initials(m.display_name)} color={m.color ?? colors.primary} />
                <T style={{ fontWeight: on ? '700' : '400' }}>{m.display_name ?? 'Member'}</T>
              </Pressable>
            );
          })}
        </Row>
      </Section>
      <Section title="Services">
        <LineItemsEditor items={items} onChange={setItems} services={lk.services} aircraft={aircraft} discount={0} onDiscount={() => {}} taxRate={org.tax_rate} currency={org.currency} hideDiscount />
      </Section>
      <Section title="Details">
        <FormFields fields={fields.slice(9)} values={values} setValue={(k, v) => setValues((s) => ({ ...s!, [k]: v }))} />
      </Section>
      <T variant="small" style={{ marginTop: space.sm }}>Discounts and tax are applied when you create the invoice.</T>
    </Screen>
  );
}

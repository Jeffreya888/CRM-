import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { DateTimeField } from '../../../components/DateTimeField';
import { Gate } from '../../../components/Gate';
import { CarePlanCard } from '../../../components/recurring/CarePlanCard';
import { Badge, Button, Card, EmptyState, ErrorBanner, Field, Loading, Row, Screen, Section, Segmented, Select, T, ToggleRow } from '../../../components/ui';
import { isoDate, money } from '../../../lib/format';
import { useLookups } from '../../../lib/lookups';
import { canSeeMoney } from '../../../lib/plans';
import { priceService } from '../../../lib/pricing';
import { describeRepeat, fmtInTz, NTH_LABELS, TIME_OPTIONS, utcToZoned, WEEKDAYS, zonedToUtc } from '../../../lib/recurring';
import { useOrg } from '../../../lib/session';
import { friendlyError, must, supabase } from '../../../lib/supabase';
import { colors, space } from '../../../lib/theme';
import type { RecurringSchedule } from '../../../lib/types';
import { useQuery } from '../../../lib/useQuery';

type Form = {
  customer_id: string | null; aircraft_id: string | null; service_id: string | null; location_id: string | null; branch_id: string | null;
  title: string; price: string; duration_min: string; day: string | null; time: string; every: string; unit: 'week' | 'month';
  usePattern: boolean; nth: string; weekday: string; end_rule: 'never' | 'on_date' | 'after'; end_on: string | null; max_visits: string;
  lead_days: string; create_as: 'tentative' | 'scheduled'; default_user_id: string | null; headsUp: boolean; heads_up_days: string;
  billing: 'per_visit' | 'care_plan'; care_plan_amount: string; annual_increase_pct: string; notes: string;
};

const num = (s: string) => (s.trim() === '' ? null : Number(s.replace(/[^0-9.-]/g, '')));

function blank(params: { customer_id?: string; aircraft_id?: string }): Form {
  const tomorrow = new Date(Date.now() + 864e5);
  return {
    customer_id: params.customer_id || null, aircraft_id: params.aircraft_id || null, service_id: null, location_id: null, branch_id: null,
    title: '', price: '', duration_min: '120', day: isoDate(tomorrow), time: '09:00', every: '1', unit: 'month',
    usePattern: false, nth: '1', weekday: String(tomorrow.getDay()), end_rule: 'never', end_on: null, max_visits: '',
    lead_days: '14', create_as: 'tentative', default_user_id: null, headsUp: true, heads_up_days: '3',
    billing: 'per_visit', care_plan_amount: '', annual_increase_pct: '0', notes: '',
  };
}

function fromRow(s: RecurringSchedule): Form {
  const z = utcToZoned(s.first_at, s.timezone);
  return {
    customer_id: s.customer_id, aircraft_id: s.aircraft_id, service_id: s.service_id, location_id: s.location_id, branch_id: s.branch_id,
    title: s.title ?? '', price: String(s.price ?? ''), duration_min: String(s.duration_min), day: z.day, time: z.time,
    every: String(s.every), unit: s.unit, usePattern: !!s.pattern, nth: String(s.pattern?.nth ?? 1), weekday: String(s.pattern?.weekday ?? 1),
    end_rule: s.end_rule, end_on: s.end_on, max_visits: s.max_visits ? String(s.max_visits) : '', lead_days: String(s.lead_days),
    create_as: s.create_as, default_user_id: s.default_user_id, headsUp: s.heads_up_days != null, heads_up_days: String(s.heads_up_days ?? 3),
    billing: s.billing, care_plan_amount: s.care_plan_amount != null ? String(s.care_plan_amount) : '', annual_increase_pct: String(s.annual_increase_pct ?? 0),
    notes: s.notes ?? '',
  };
}

export default function RecurringEdit() {
  return (
    <Gate feature="recurring">
      <EditInner />
    </Gate>
  );
}

function EditInner() {
  const params = useLocalSearchParams<{ id?: string; customer_id?: string; aircraft_id?: string }>();
  const id = params.id || null;
  const { org, orgId, role, perm, can } = useOrg();
  const lk = useLookups();
  const showMoney = perm('see_prices');

  const existing = useQuery(async () => {
    if (!id) return null;
    return (await must(supabase.from('recurring_schedules').select('*').eq('id', id).maybeSingle())) as RecurringSchedule | null;
  }, [id]);

  const [f, setF] = useState<Form | null>(null);
  if (!f && (!id || existing.data)) setF(existing.data ? fromRow(existing.data) : blank(params));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const tz = existing.data?.timezone ?? org.timezone ?? 'UTC';
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((s) => (s ? { ...s, [k]: v } : s));

  const firstAt = f?.day && f.time ? zonedToUtc(f.day, f.time, tz) : null;
  const pattern = f && f.unit === 'month' && f.usePattern ? { nth: Number(f.nth), weekday: Number(f.weekday) } : null;
  const every = Number(f?.every) || 0;
  const previewKey = [firstAt, tz, every, f?.unit, pattern, f?.end_rule, f?.end_on, f?.max_visits, existing.data?.skip_dates];
  const preview = useQuery(async () => {
    if (!f || !firstAt || every < 1 || every > 104) return [] as string[];
    if (f.end_rule === 'on_date' && !f.end_on) return [];
    if (f.end_rule === 'after' && !(Number(f.max_visits) > 0)) return [];
    const rows = await must(supabase.rpc('recurring_preview', {
      p_first: firstAt, p_tz: tz, p_every: every, p_unit: f.unit, p_pattern: pattern, p_count: 6,
      p_end_rule: f.end_rule, p_end_on: f.end_rule === 'on_date' ? f.end_on : null,
      p_max_visits: f.end_rule === 'after' ? Number(f.max_visits) : null, p_skip: existing.data?.skip_dates ?? [],
    }));
    return ((rows ?? []) as unknown[]).map((r) => (typeof r === 'string' ? r : String(Object.values(r as object)[0])));
  }, previewKey);

  if (!canSeeMoney(role)) {
    return <Screen><Stack.Screen options={{ title: 'Schedule' }} /><EmptyState icon="lock-closed-outline" title="Managers only" /></Screen>;
  }
  if (!f) {
    return existing.error
      ? <Screen><Stack.Screen options={{ title: 'Schedule' }} /><ErrorBanner message={existing.error} onRetry={existing.reload} /></Screen>
      : <><Stack.Screen options={{ title: 'Schedule' }} /><Loading /></>;
  }

  const asset = lk.aircraft.find((a) => a.id === f.aircraft_id) ?? null;
  const service = lk.services.find((s) => s.id === f.service_id) ?? null;
  const suggested = service ? priceService(service, asset) : null;
  const serviceOptions = lk.services
    .filter((s) => s.active !== false && (!asset || !s.asset_type || s.asset_type === asset.asset_type))
    .map((s) => ({ value: s.id, label: s.name, hint: showMoney ? money(priceService(s, asset)) : undefined }));

  const pickService = (sid: string | null) => {
    const s = lk.services.find((x) => x.id === sid);
    setF((cur) => cur && ({
      ...cur, service_id: sid,
      title: !cur.title || lk.services.some((x) => x.name === cur.title) ? s?.name ?? cur.title : cur.title,
      price: s && showMoney ? String(priceService(s, asset)) : cur.price,
      duration_min: s?.est_hours ? String(Math.round(Number(s.est_hours) * 60)) : cur.duration_min,
      every: s?.recur_every ? String(s.recur_every) : cur.every,
      unit: s?.recur_unit ?? cur.unit,
    }));
  };

  const pickDay = (day: string | null) => {
    setF((cur) => {
      if (!cur) return cur;
      if (!day) return { ...cur, day };
      const dt = new Date(day + 'T12:00:00');
      const nth = Math.ceil(dt.getDate() / 7);
      return { ...cur, day, weekday: String(dt.getDay()), nth: String(nth > 4 ? -1 : nth) };
    });
  };

  const save = async () => {
    setError(null);
    if (!f.customer_id) return setError('Choose a customer.');
    if (!f.day || !f.time) return setError('Choose the first visit date and time.');
    if (!(every >= 1 && every <= 104)) return setError('Repeat every must be between 1 and 104.');
    if (f.end_rule === 'on_date' && !f.end_on) return setError('Choose the end date.');
    if (f.end_rule === 'after' && !(Number(f.max_visits) > 0)) return setError('Enter how many visits.');
    if (f.billing === 'care_plan' && !(Number(f.care_plan_amount) >= 0 && f.care_plan_amount.trim())) return setError('Enter the monthly care plan amount.');
    const duration = Number(f.duration_min) || 120;
    if (duration < 15 || duration > 1440) return setError('Duration must be between 15 and 1440 minutes.');
    const row: Record<string, unknown> = {
      org_id: orgId, customer_id: f.customer_id, aircraft_id: f.aircraft_id, service_id: f.service_id, location_id: f.location_id,
      branch_id: f.branch_id, title: f.title.trim() || null, duration_min: duration,
      first_at: firstAt, timezone: tz, every, unit: f.unit, pattern,
      end_rule: f.end_rule, end_on: f.end_rule === 'on_date' ? f.end_on : null, max_visits: f.end_rule === 'after' ? Number(f.max_visits) : null,
      lead_days: Math.min(120, Math.max(0, Number(f.lead_days) || 0)), create_as: f.create_as, default_user_id: f.default_user_id,
      heads_up_days: f.headsUp ? Math.min(30, Math.max(0, Number(f.heads_up_days) || 0)) : null,
      notes: f.notes.trim() || null,
    };
    if (showMoney) {
      Object.assign(row, {
        price: num(f.price) ?? 0, billing: f.billing,
        care_plan_amount: f.billing === 'care_plan' ? num(f.care_plan_amount) : existing.data?.care_plan_amount ?? null,
        annual_increase_pct: Math.min(50, Math.max(0, num(f.annual_increase_pct) ?? 0)),
      });
    }
    setSaving(true);
    try {
      let sid = id;
      if (id) {
        // Changing the timing restarts the sequence from the new first date.
        const prev = existing.data!;
        const timingChanged = prev.first_at !== firstAt || prev.every !== every || prev.unit !== f.unit || JSON.stringify(prev.pattern) !== JSON.stringify(pattern);
        if (timingChanged) {
          // Upcoming visits at the old times are cancelled; every job releases its
          // occurrence number so the new sequence can start again from 0.
          await must(supabase.from('jobs').update({ status: 'cancelled' }).eq('recurring_schedule_id', id)
            .in('status', ['tentative', 'scheduled']).gt('scheduled_start', new Date().toISOString()));
          await must(supabase.from('jobs').update({ occurrence_index: null }).eq('recurring_schedule_id', id));
          row.next_index = 0;
        }
        await must(supabase.from('recurring_schedules').update(row).eq('id', id));
      } else {
        const created = await must(supabase.from('recurring_schedules').insert(row).select('id').single());
        sid = (created as { id: string }).id;
      }
      await supabase.rpc('generate_recurring_jobs', { p_org: orgId });
      router.replace({ pathname: '/recurring/[id]', params: { id: sid! } });
    } catch (e: any) {
      setError(friendlyError(e.message ?? String(e)));
    } finally {
      setSaving(false);
    }
  };

  const nthOptions = [1, 2, 3, 4, -1].map((n) => ({ value: String(n), label: NTH_LABELS[n]! }));
  const weekdayOptions = WEEKDAYS.map((w, i) => ({ value: String(i), label: w }));

  return (
    <Screen footer={<Button title={id ? 'Save schedule' : 'Create schedule'} icon="checkmark" onPress={save} loading={saving} />}>
      <Stack.Screen options={{ title: id ? 'Edit schedule' : 'New schedule' }} />
      <ErrorBanner message={error} />

      <Section title="What & who" icon="person-outline">
        <Select label="Customer *" value={f.customer_id} options={lk.customerOptions} searchable
          onChange={(v) => setF((c) => c && ({ ...c, customer_id: v, aircraft_id: c.aircraft_id && lk.aircraft.find((a) => a.id === c.aircraft_id)?.customer_id === v ? c.aircraft_id : null }))} />
        <Select label="Asset" value={f.aircraft_id} options={lk.aircraftOptions(f.customer_id)} allowClear placeholder="Aircraft, vehicle or boat"
          onChange={(v) => {
            const a = lk.aircraft.find((x) => x.id === v);
            setF((c) => c && ({ ...c, aircraft_id: v, location_id: c.location_id ?? a?.home_location_id ?? null }));
          }} />
        <Select label="Service" value={f.service_id} options={serviceOptions} allowClear searchable onChange={pickService} />
        <Field label="Title" value={f.title} onChangeText={(v) => set('title', v)} placeholder={service?.name ?? 'e.g. Monthly exterior wash'} />
        <Select label="Facility" value={f.location_id} options={lk.locationOptions} allowClear searchable placeholder="Airport, marina or site" onChange={(v) => set('location_id', v)} />
        {can('branches') && lk.branches.length ? (
          <Select label="Company location" value={f.branch_id} options={lk.branchOptions} allowClear onChange={(v) => set('branch_id', v)} />
        ) : null}
        <Select label="Default technician" value={f.default_user_id} options={lk.memberOptions} allowClear placeholder="Unassigned"
          onChange={(v) => set('default_user_id', v)} />
        <Row gap={space.md}>
          {showMoney ? (
            <Field style={{ flex: 1 }} label="Price per visit" value={f.price} onChangeText={(v) => set('price', v)} keyboardType="decimal-pad" placeholder="0.00"
              hint={suggested != null && String(suggested) !== f.price ? `Price guide: ${money(suggested)}` : undefined} />
          ) : null}
          <Field style={{ flex: 1 }} label="Duration (min)" value={f.duration_min} onChangeText={(v) => set('duration_min', v)} keyboardType="number-pad" />
        </Row>
        {showMoney && suggested != null && String(suggested) !== f.price ? (
          <Button small kind="ghost" icon="pricetag-outline" title={`Use price guide (${money(suggested)})`} onPress={() => set('price', String(suggested))} style={{ alignSelf: 'flex-start', marginTop: -space.sm, marginBottom: space.md }} />
        ) : null}
      </Section>

      <Section title="When" icon="calendar-outline">
        <T variant="small" style={{ marginBottom: space.md }}>
          Times are in your company time zone ({tz}). 9:00 AM stays 9:00 AM across daylight-saving changes.
          {id ? ' Changing the date or repeat replaces upcoming visits that have not started.' : ''}
        </T>
        <DateTimeField label="First visit date *" mode="date" value={f.day} onChange={pickDay} allowClear={false} />
        <Select label="Start time *" value={f.time} options={TIME_OPTIONS} onChange={(v) => v && set('time', v)} />
        <Row gap={space.md} style={{ alignItems: 'flex-start' }}>
          <Field style={{ width: 110 }} label="Repeat every" value={f.every} onChangeText={(v) => set('every', v.replace(/[^0-9]/g, ''))} keyboardType="number-pad" />
          <View style={{ flex: 1, paddingTop: 30 }}>
            <Segmented value={f.unit} onChange={(v) => set('unit', v)} options={[{ value: 'week', label: every === 1 ? 'Week' : 'Weeks' }, { value: 'month', label: every === 1 ? 'Month' : 'Months' }]} />
          </View>
        </Row>
        {f.unit === 'month' ? (
          <>
            <ToggleRow label="Use a weekday pattern" value={f.usePattern} onChange={(v) => set('usePattern', v)}
              hint={f.usePattern ? `e.g. the ${NTH_LABELS[Number(f.nth)]} ${WEEKDAYS[Number(f.weekday)]} of the month` : 'Otherwise the same day of the month (moved to month end when shorter).'} />
            {f.usePattern ? (
              <Row gap={space.md}>
                <View style={{ flex: 1 }}><Select label="Which" value={f.nth} options={nthOptions} inline onChange={(v) => v && set('nth', v)} /></View>
                <View style={{ flex: 1.4 }}><Select label="Day" value={f.weekday} options={weekdayOptions} inline onChange={(v) => v && set('weekday', v)} /></View>
              </Row>
            ) : null}
          </>
        ) : null}
        <T style={{ fontWeight: '600', marginBottom: 8 }}>Ends</T>
        <Segmented value={f.end_rule} onChange={(v) => set('end_rule', v)} options={[{ value: 'never', label: 'Never' }, { value: 'on_date', label: 'On a date' }, { value: 'after', label: 'After N visits' }]} />
        {f.end_rule === 'on_date' ? <DateTimeField label="Last date" mode="date" value={f.end_on} onChange={(v) => set('end_on', v)} /> : null}
        {f.end_rule === 'after' ? <Field label="Number of visits" value={f.max_visits} onChangeText={(v) => set('max_visits', v.replace(/[^0-9]/g, ''))} keyboardType="number-pad" /> : null}

        <Card style={{ backgroundColor: colors.cardRaised }}>
          <T variant="overline" style={{ marginBottom: space.sm }}>Next 6 visits · {describeRepeat(every || 1, f.unit, pattern)}</T>
          {preview.error ? <ErrorBanner message={preview.error} /> : null}
          {preview.loading && !preview.data?.length ? <T variant="muted">Working out dates…</T> : null}
          {(preview.data ?? []).map((t, i) => (
            <Row key={t} gap={space.sm} style={{ paddingVertical: 4 }}>
              <Badge label={String(i + 1)} tone="info" raw />
              <T>{fmtInTz(t, tz)}</T>
            </Row>
          ))}
          {!preview.loading && !preview.error && !(preview.data ?? []).length ? <T variant="muted">Fill in the date and repeat to see the dates.</T> : null}
        </Card>
      </Section>

      <Section title="Visits & heads-up" icon="time-outline">
        <Field label="Create each visit this many days ahead" value={f.lead_days} onChangeText={(v) => set('lead_days', v.replace(/[^0-9]/g, ''))} keyboardType="number-pad"
          hint="Visits are checked for conflicts and assigned to the default technician when free." />
        <T style={{ fontWeight: '600', marginBottom: 8 }}>Create visits as</T>
        <Segmented value={f.create_as} onChange={(v) => set('create_as', v)} options={[{ value: 'tentative', label: 'Tentative (I confirm)' }, { value: 'scheduled', label: 'Scheduled' }]} />
        <ToggleRow label="Send the customer a heads-up" value={f.headsUp} onChange={(v) => set('headsUp', v)}
          hint="Includes a link to request a different time through the customer portal." />
        {f.headsUp ? <Field label="Days before the visit" value={f.heads_up_days} onChangeText={(v) => set('heads_up_days', v.replace(/[^0-9]/g, ''))} keyboardType="number-pad" /> : null}
      </Section>

      {showMoney ? (
        <Section title="Billing" icon="card-outline">
          <Segmented value={f.billing} onChange={(v) => set('billing', v)} options={[{ value: 'per_visit', label: 'Invoice per visit' }, { value: 'care_plan', label: 'Monthly care plan' }]} />
          {f.billing === 'care_plan' ? (
            <>
              <Field label="Monthly amount" value={f.care_plan_amount} onChangeText={(v) => set('care_plan_amount', v)} keyboardType="decimal-pad" placeholder="0.00"
                hint="Charged to the customer's card on file each month by Stripe (platform fee applies). Visits are not invoiced separately." />
              {id && existing.data ? <CarePlanCard schedule={existing.data} onChanged={existing.reload} /> : (
                <T variant="small" style={{ marginBottom: space.md }}>Save the schedule first, then send the customer a link to put a card on file.</T>
              )}
            </>
          ) : null}
          <Field label="Annual price increase (%)" value={f.annual_increase_pct} onChangeText={(v) => set('annual_increase_pct', v)} keyboardType="decimal-pad"
            hint="Applied on each anniversary of the first visit, with notice to the customer. 0 for none." />
        </Section>
      ) : null}

      <Section title="Notes" icon="document-text-outline">
        <Field value={f.notes} onChangeText={(v) => set('notes', v)} multiline placeholder="Copied to each visit (gate code, products, preferences…)" />
      </Section>
    </Screen>
  );
}

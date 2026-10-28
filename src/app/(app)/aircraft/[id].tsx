import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Image, View } from 'react-native';
import { AssessPhotosSheet } from '../../../components/ai/AssessPhotosSheet';
import { AircraftDocuments } from '../../../components/assistant/AircraftDocuments';
import { ConditionBadge } from '../../../components/assets/Condition';
import { FaaRegistrationCard } from '../../../components/assets/FaaCard';
import { FormSheet } from '../../../components/FormSheet';
import { jobTone } from '../../../components/status';
import { Badge, Button, Card, ErrorBanner, IconButton, KeyValue, ListRow, Loading, Row, Screen, Section, Select, T } from '../../../components/ui';
import { APP_NAME } from '../../../lib/config';
import { assetModelName, facilityKindInfo, facilityTitle, widthLabel } from '../../../lib/assets';
import { isUsTail, lookupFaa } from '../../../lib/faa';
import { signedUrls } from '../../../lib/files';
import { date, dateTime } from '../../../lib/format';
import { useLookups } from '../../../lib/lookups';
import { canEdit, isManager } from '../../../lib/plans';
import { assetTypeInfo, categoryLabel } from '../../../lib/pricing';
import { useOrg } from '../../../lib/session';
import { friendlyError, supabase } from '../../../lib/supabase';
import { radius, space } from '../../../lib/theme';
import type { Aircraft } from '../../../lib/types';
import { useQuery } from '../../../lib/useQuery';

const COATING_WORDS = /ceramic|coating|wax|sealant|graphene|ppf|protection/i;

export default function AssetDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { orgId, role, perm, can } = useOrg();
  const { services, locations } = useLookups();
  const manager = isManager(role);
  const editable = perm('edit_customers');
  const [reminderSheet, setReminderSheet] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [assessOpen, setAssessOpen] = useState(false);
  const [faaMsg, setFaaMsg] = useState<string | null>(null);

  const q = useQuery(async () => {
    const none = Promise.resolve({ data: [] as any[], error: null });
    const [a, jobs, reminders, recurring] = await Promise.all([
      supabase.from('aircraft').select('*, customer:customers(id, name), home:locations(id, name, airport_code, kind, fbo_name)').eq('id', id).single(),
      supabase.from('jobs').select('id, number, title, status, scheduled_start, actual_end').eq('aircraft_id', id).order('scheduled_start', { ascending: false }).limit(50),
      supabase.from('service_reminders').select('*').eq('aircraft_id', id).in('status', ['upcoming', 'due', 'scheduled']).order('due_on'),
      manager ? supabase.from('recurring_schedules').select('id, title, every, unit, active, paused').eq('aircraft_id', id).order('created_at', { ascending: false }) : none,
    ]);
    if (a.error) throw a.error;
    let photo: string | null = null;
    if (a.data.photo_path) {
      try { photo = (await signedUrls([a.data.photo_path]))[a.data.photo_path] ?? null; } catch { /* photo optional */ }
    }
    return {
      a: a.data as Aircraft & { customer: { id: string; name: string } | null; home: { id: string; name: string; airport_code: string | null; kind: any; fbo_name: string | null } | null },
      jobs: (jobs.data ?? []) as any[], reminders: (reminders.data ?? []) as any[], recurring: (recurring.data ?? []) as any[], photo,
    };
  }, [id, manager]);

  if (q.loading) return <Loading />;
  if (!q.data) return <Screen><Stack.Screen options={{ title: 'Asset' }} /><ErrorBanner message={q.error ?? 'Not found'} onRetry={q.reload} /></Screen>;
  const { a, jobs, reminders, recurring, photo } = q.data;
  const t = a.asset_type ?? 'aircraft';
  const info = assetTypeInfo(t);
  const done = jobs.filter((j) => ['completed', 'invoiced'].includes(j.status));
  const lastService = done[0];
  const coatingJobs = done.filter((j) => COATING_WORDS.test(j.title ?? ''));

  const setHome = async (locId: string | null) => {
    setError(null);
    const { error: e } = await supabase.from('aircraft').update({ home_location_id: locId }).eq('id', id);
    if (e) setError(friendlyError(e.message));
    else q.reload();
  };

  const refreshFaa = async () => {
    setError(null);
    setFaaMsg(null);
    try {
      const r = await lookupFaa(orgId, a.tail_number);
      if (!r.found) {
        setFaaMsg(r.reason === 'no_data' ? 'FAA registry data is not available yet.' : r.reason === 'not_us' ? 'Only US registrations (N-numbers) can be checked.' : 'Not found in FAA registry.');
        return;
      }
      const { error: e } = await supabase.from('aircraft').update({ faa: r, faa_checked_at: new Date().toISOString() }).eq('id', id);
      if (e) throw e;
      q.reload();
    } catch (e: any) {
      setError(friendlyError(e?.message ?? ''));
    }
  };
  const showFaa = t === 'aircraft' && isUsTail(a.tail_number) && (!!a.faa || manager);

  return (
    <Screen refreshing={q.refreshing} onRefresh={q.refresh}>
      <Stack.Screen options={{
        title: a.tail_number,
        headerRight: () => editable ? <IconButton icon="create-outline" onPress={() => router.push({ pathname: '/aircraft/edit', params: { id } })} label="Edit" /> : null,
      }} />
      <ErrorBanner message={error} />
      {photo ? <Image source={{ uri: photo }} style={{ width: '100%', height: 200, borderRadius: radius.lg, marginBottom: space.md }} resizeMode="cover" /> : null}
      <Card>
        <Row gap={space.sm}>
          <Badge label={info.label} tone="warning" raw />
          {!a.active ? <Badge label="Inactive" tone="danger" /> : null}
        </Row>
        <T variant="h1" style={{ marginTop: space.sm }}>{a.tail_number}</T>
        <T variant="muted">{assetModelName(a) || categoryLabel(a.category)}</T>
        <Row style={{ marginTop: space.sm, flexWrap: 'wrap' }} gap={4}>
          <Badge label={categoryLabel(a.category)} tone="primary" raw />
          {a.length_ft ? <Badge label={`${a.length_ft} ft long`} raw /> : null}
          {a.wingspan_ft ? <Badge label={`${widthLabel(t)} ${a.wingspan_ft} ft`} raw /> : null}
          {a.model_id ? <Badge label="Catalog model" tone="success" raw /> : null}
        </Row>
        {a.condition_level ? <View style={{ marginTop: space.sm }}><ConditionBadge level={a.condition_level} updatedAt={a.condition_updated_at} /></View> : null}
        {manager ? (
          <Row style={{ marginTop: space.md, flexWrap: 'wrap' }}>
            {perm('see_prices') ? <Button small icon="document-text-outline" title="Quote" onPress={() => router.push({ pathname: '/quotes/edit', params: { customer_id: a.customer_id ?? '', aircraft_id: id } })} /> : null}
            <Button small kind="secondary" icon="construct-outline" title="Schedule job" onPress={() => router.push({ pathname: '/jobs/new', params: { customer_id: a.customer_id ?? '', aircraft_id: id } })} />
            {perm('see_prices') && can('recurring') && a.customer_id ? (
              <Button small kind="secondary" icon="repeat-outline" title="Recurring" onPress={() => router.push({ pathname: '/recurring/edit', params: { customer_id: a.customer_id, aircraft_id: id } })} />
            ) : null}
          </Row>
        ) : null}
        {canEdit(role) ? (
          <Row style={{ marginTop: space.sm, flexWrap: 'wrap' }}>
            <Button small kind="ghost" icon="camera-outline" title="Check condition from photos" onPress={() => setAssessOpen(true)} />
            <Button small kind="ghost" icon="sparkles-outline" title={`Ask ${APP_NAME}`}
              onPress={() => router.push({ pathname: '/assistant/[id]', params: { id: 'new', aircraft_id: id } })} />
          </Row>
        ) : null}
      </Card>

      <Section title="Details">
        <Card>
          <KeyValue label="Owner" value={a.customer?.name ?? 'No owner'} onPress={a.customer ? () => router.push(`/customers/${a.customer!.id}`) : undefined} />
          <KeyValue label="Type" value={assetModelName(a) || null} />
          {t === 'vehicle' ? <KeyValue label="Plate" value={a.plate} /> : null}
          {t === 'vehicle' ? <KeyValue label="VIN" value={a.vin} /> : null}
          {t === 'watercraft' ? <KeyValue label="Hull ID" value={a.hull_id} /> : null}
          {t === 'aircraft' ? <KeyValue label="Serial #" value={a.serial_number} /> : null}
          <KeyValue label="Size class" value={categoryLabel(a.category)} />
          <KeyValue label="Length" value={a.length_ft ? `${a.length_ft} ft` : null} />
          {t !== 'vehicle' ? <KeyValue label={widthLabel(t)} value={a.wingspan_ft ? `${a.wingspan_ft} ft` : null} /> : null}
          <KeyValue label="Colors" value={[a.exterior_colors, a.paint_condition].filter(Boolean).join(' · ')} />
          <KeyValue label="Interior" value={a.interior_notes} />
          <KeyValue label="Last serviced" value={lastService ? dateTime(lastService.actual_end ?? lastService.scheduled_start) : 'Never'} />
          <KeyValue label="Notes" value={a.notes} />
        </Card>
      </Section>

      {showFaa ? (
        <Section title="Registration (FAA)" icon="document-text-outline">
          <FaaRegistrationCard faa={a.faa} checkedAt={a.faa_checked_at} message={faaMsg} onRefresh={manager ? refreshFaa : undefined} />
        </Section>
      ) : null}

      <AircraftDocuments aircraftId={id} manager={manager} label={info.label.toLowerCase()} />

      <Section title={t === 'aircraft' ? 'Home airport / FBO' : t === 'watercraft' ? 'Home marina' : 'Usual service site'} icon="location-outline">
        <Card>
          {a.home ? (
            <ListRow icon={facilityKindInfo(a.home.kind).icon} title={facilityTitle(a.home)} subtitle={a.home.fbo_name ?? facilityKindInfo(a.home.kind).label}
              onPress={() => router.push(`/facilities/${a.home!.id}`)} />
          ) : <T variant="muted" style={{ marginBottom: space.sm }}>Not set. New jobs for this {info.label.toLowerCase()} start at its home facility.</T>}
          {editable ? (
            <View style={{ marginTop: space.md }}>
              <Select label={a.home ? 'Change' : 'Link a facility'} value={a.home_location_id} allowClear searchable
                options={locations.map((l) => ({ value: l.id, label: facilityTitle(l), hint: facilityKindInfo(l.kind).label }))}
                onChange={setHome} placeholder="Choose a facility" />
              {!locations.length ? <Button small kind="ghost" icon="add" title="Add a facility" onPress={() => router.push('/facilities/edit')} /> : null}
            </View>
          ) : null}
        </Card>
      </Section>

      <Section title="Coating history" icon="shield-checkmark-outline">
        <Card>
          {a.coating_type ? (
            <Row style={{ justifyContent: 'space-between' }}>
              <View style={{ flex: 1 }}>
                <T style={{ fontWeight: '600' }}>{a.coating_type}</T>
                <T variant="small">{a.coating_applied_on ? `Applied ${date(a.coating_applied_on)}` : 'Date not recorded'}</T>
              </View>
              <Badge label="Current" tone="success" />
            </Row>
          ) : <T variant="muted">No coating recorded.</T>}
          {coatingJobs.map((j) => (
            <Row key={j.id} style={{ marginTop: space.sm, justifyContent: 'space-between' }}>
              <T variant="muted" style={{ flex: 1 }} numberOfLines={1}>{j.title}</T>
              <T variant="small">{date(j.actual_end ?? j.scheduled_start)}</T>
            </Row>
          ))}
        </Card>
      </Section>

      <Section title="Service reminders" action={editable ? <Button small kind="ghost" icon="add" title="Add" onPress={() => setReminderSheet(true)} /> : null}>
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          {reminders.length ? reminders.map((r) => (
            <ListRow key={r.id} icon="notifications-outline" title={r.title} subtitle={`Due ${date(r.due_on)}${r.interval_days ? ` · every ${r.interval_days} days` : ''}`}
              right={<Badge label={r.status} tone={r.status === 'due' ? 'danger' : 'info'} />} />
          )) : <T variant="muted" style={{ padding: space.lg }}>Reminders are created automatically when recurring services are completed.</T>}
        </Card>
      </Section>

      {manager ? (
        <Section title="Recurring care">
          <Card style={{ padding: 0, overflow: 'hidden' }}>
            {recurring.length ? recurring.map((r) => (
              <ListRow key={r.id} icon="repeat-outline" title={r.title ?? 'Recurring care'} subtitle={`Every ${r.every} ${r.unit}${r.every === 1 ? '' : 's'}`}
                right={<Badge label={!r.active ? 'Ended' : r.paused ? 'Paused' : 'Active'} tone={!r.active ? 'neutral' : r.paused ? 'warning' : 'success'} raw />}
                onPress={() => router.push(`/recurring/${r.id}`)} />
            )) : <T variant="muted" style={{ padding: space.lg }}>No recurring schedules for this {info.label.toLowerCase()}.</T>}
          </Card>
        </Section>
      ) : null}

      <Section title={`Service history (${jobs.length})`}>
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          {jobs.length ? jobs.map((j) => (
            <ListRow key={j.id} title={`${j.number} · ${dateTime(j.scheduled_start)}`} subtitle={j.title} right={<Badge label={j.status} tone={jobTone[j.status] ?? 'neutral'} />} onPress={() => router.push(`/jobs/${j.id}`)} />
          )) : <T variant="muted" style={{ padding: space.lg }}>No jobs yet.</T>}
        </Card>
      </Section>

      <AssessPhotosSheet visible={assessOpen} aircraftId={id} customerId={a.customer_id}
        onClose={() => { setAssessOpen(false); q.reload(); }} />

      <FormSheet visible={reminderSheet} title="New reminder" onClose={() => setReminderSheet(false)}
        fields={[
          { key: 'service_id', label: 'Service', type: 'select', options: services.filter((s) => !s.asset_type || s.asset_type === t).map((s) => ({ value: s.id, label: s.name })), allowClear: true },
          { key: 'title', label: 'Title', type: 'text', placeholder: 'Monthly exterior wash' },
          { key: 'due_on', label: 'Due date', type: 'date', required: true },
          { key: 'interval_days', label: 'Repeat every (days)', type: 'number' },
        ]}
        onSubmit={async (v) => {
          const svc = services.find((s) => s.id === v.service_id);
          const title = v.title ?? svc?.name;
          if (!title) throw new Error('Pick a service or enter a title');
          const { error: e } = await supabase.from('service_reminders').insert({ ...v, title, org_id: orgId, aircraft_id: id });
          if (e) throw e;
          q.reload();
        }} />
    </Screen>
  );
}


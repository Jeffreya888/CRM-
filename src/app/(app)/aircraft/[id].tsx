import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Image, View } from 'react-native';
import { FormSheet } from '../../../components/FormSheet';
import { jobTone } from '../../../components/status';
import { Badge, Button, Card, ErrorBanner, IconButton, KeyValue, ListRow, Loading, Row, Screen, Section, T } from '../../../components/ui';
import { date, dateTime } from '../../../lib/format';
import { signedUrls } from '../../../lib/files';
import { useLookups } from '../../../lib/lookups';
import { categoryLabel } from '../../../lib/pricing';
import { canEdit, canSeeMoney } from '../../../lib/plans';
import { useOrg } from '../../../lib/session';
import { supabase } from '../../../lib/supabase';
import { colors, radius, space } from '../../../lib/theme';
import { useQuery } from '../../../lib/useQuery';

export default function AircraftDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { orgId, role } = useOrg();
  const { services } = useLookups();
  const [reminderSheet, setReminderSheet] = useState(false);

  const q = useQuery(async () => {
    const [a, jobs, reminders] = await Promise.all([
      supabase.from('aircraft').select('*, customer:customers(id, name), home:locations(name, airport_code)').eq('id', id).single(),
      supabase.from('jobs').select('id, number, title, status, scheduled_start, actual_end').eq('aircraft_id', id).order('scheduled_start', { ascending: false }).limit(50),
      supabase.from('service_reminders').select('*').eq('aircraft_id', id).in('status', ['upcoming', 'due', 'scheduled']).order('due_on'),
    ]);
    if (a.error) throw a.error;
    const photo = a.data.photo_path ? (await signedUrls([a.data.photo_path]))[a.data.photo_path] : null;
    return { a: a.data as any, jobs: jobs.data ?? [], reminders: reminders.data ?? [], photo };
  }, [id]);

  if (q.loading) return <Loading />;
  if (!q.data) return <Screen><ErrorBanner message={q.error ?? 'Not found'} /></Screen>;
  const { a, jobs, reminders, photo } = q.data;
  const lastService = jobs.find((j: any) => ['completed', 'invoiced'].includes(j.status));

  return (
    <Screen refreshing={q.refreshing} onRefresh={q.refresh}>
      <Stack.Screen options={{ title: a.tail_number, headerRight: () => canEdit(role) ? <IconButton icon="create-outline" onPress={() => router.push({ pathname: '/aircraft/edit', params: { id } })} label="Edit" /> : null }} />
      {photo ? <Image source={{ uri: photo }} style={{ width: '100%', height: 200, borderRadius: radius.lg, marginBottom: space.md }} /> : null}
      <Card>
        <T variant="h1">{a.tail_number}</T>
        <T variant="muted">{[a.year, a.manufacturer, a.model].filter(Boolean).join(' ') || categoryLabel(a.category)}</T>
        <Row style={{ marginTop: space.sm }} gap={4}>
          <Badge label={categoryLabel(a.category)} tone="primary" />
          {a.length_ft ? <Badge label={`${a.length_ft} ft`} /> : null}
          {!a.active ? <Badge label="Inactive" tone="danger" /> : null}
        </Row>
        {canSeeMoney(role) ? (
          <Row style={{ marginTop: space.md }}>
            <Button small icon="document-text-outline" title="Quote" onPress={() => router.push({ pathname: '/quotes/edit', params: { customer_id: a.customer_id ?? '', aircraft_id: id } })} />
            <Button small kind="secondary" icon="construct-outline" title="Schedule job" onPress={() => router.push({ pathname: '/jobs/edit', params: { customer_id: a.customer_id ?? '', aircraft_id: id } })} />
          </Row>
        ) : null}
      </Card>

      <Section title="Details">
        <Card>
          <KeyValue label="Owner" value={a.customer?.name} onPress={a.customer ? () => router.push(`/customers/${a.customer.id}`) : undefined} />
          <KeyValue label="Home base" value={a.home ? [a.home.airport_code, a.home.name].filter(Boolean).join(' · ') : null} />
          <KeyValue label="Serial #" value={a.serial_number} />
          <KeyValue label="Wingspan" value={a.wingspan_ft ? `${a.wingspan_ft} ft` : null} />
          <KeyValue label="Paint" value={[a.exterior_colors, a.paint_condition].filter(Boolean).join(' · ')} />
          <KeyValue label="Interior" value={a.interior_notes} />
          <KeyValue label="Coating" value={a.coating_type ? `${a.coating_type}${a.coating_applied_on ? ` (applied ${date(a.coating_applied_on)})` : ''}` : null} />
          <KeyValue label="Last serviced" value={lastService ? dateTime(lastService.actual_end ?? lastService.scheduled_start) : 'Never'} />
          <KeyValue label="Notes" value={a.notes} />
        </Card>
      </Section>

      <Section title="Service reminders" action={canEdit(role) ? <Button small kind="ghost" icon="add" title="Add" onPress={() => setReminderSheet(true)} /> : null}>
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          {reminders.length ? reminders.map((r: any) => (
            <ListRow key={r.id} icon="notifications-outline" title={r.title} subtitle={`Due ${date(r.due_on)}${r.interval_days ? ` · every ${r.interval_days} days` : ''}`}
              right={<Badge label={r.status} tone={r.status === 'due' ? 'danger' : 'info'} />} />
          )) : <T variant="muted" style={{ padding: space.lg }}>Reminders are created automatically when recurring services are completed.</T>}
        </Card>
      </Section>

      <Section title={`Service history (${jobs.length})`}>
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          {jobs.length ? jobs.map((j: any) => (
            <ListRow key={j.id} title={`${j.number} · ${dateTime(j.scheduled_start)}`} subtitle={j.title} right={<Badge label={j.status} tone={jobTone[j.status]} />} onPress={() => router.push(`/jobs/${j.id}`)} />
          )) : <T variant="muted" style={{ padding: space.lg }}>No jobs yet.</T>}
        </Card>
      </Section>
      <View style={{ height: 1, backgroundColor: colors.border }} />

      <FormSheet visible={reminderSheet} title="New reminder" onClose={() => setReminderSheet(false)}
        fields={[
          { key: 'service_id', label: 'Service', type: 'select', options: services.map((s) => ({ value: s.id, label: s.name })), allowClear: true },
          { key: 'title', label: 'Title', type: 'text', required: true, placeholder: 'Monthly exterior wash' },
          { key: 'due_on', label: 'Due date', type: 'date', required: true },
          { key: 'interval_days', label: 'Repeat every (days)', type: 'number' },
        ]}
        onSubmit={async (v) => {
          const svc = services.find((s) => s.id === v.service_id);
          const { error } = await supabase.from('service_reminders').insert({ ...v, title: v.title ?? svc?.name, org_id: orgId, aircraft_id: id });
          if (error) throw error;
          q.reload();
        }} />
    </Screen>
  );
}

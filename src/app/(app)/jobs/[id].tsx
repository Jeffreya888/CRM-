import { format } from 'date-fns';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import * as Linking from 'expo-linking';
import { useState } from 'react';
import { ActivityIndicator, ActionSheetIOS, Alert, Image, Modal, Platform, Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { confirmAction, FormSheet, notify } from '../../../components/FormSheet';
import { SignaturePad } from '../../../components/SignaturePad';
import { jobTone } from '../../../components/status';
import { Avatar, Badge, Button, Card, Divider, ErrorBanner, Field, IconButton, IconTile, Ionicons, KeyValue, ListRow, Loading, Row, Screen, Section, Stepper, T } from '../../../components/ui';
import { jobReportHtml, sharePdf } from '../../../lib/documents';
import { dateTime, duration, initials, money, relative } from '../../../lib/format';
import { pickImage, signedUrls, uploadImage } from '../../../lib/files';
import { canEdit, canSeeMoney } from '../../../lib/plans';
import { useOrg } from '../../../lib/session';
import { friendlyError, supabase } from '../../../lib/supabase';
import { colors, radius, space, toneColors, type Tone } from '../../../lib/theme';
import type { PhotoKind } from '../../../lib/types';
import { useQuery } from '../../../lib/useQuery';

const STATUS_STEP: Record<string, number> = { scheduled: 0, on_hold: 1, in_progress: 1, completed: 2, invoiced: 3 };

/** Asks camera vs. library (camera isn't available on web). */
function chooseSource(): Promise<'camera' | 'library' | null> {
  if (Platform.OS === 'web') return Promise.resolve('library');
  return new Promise((resolve) => {
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions({ options: ['Take Photo', 'Choose from Library', 'Cancel'], cancelButtonIndex: 2 },
        (i) => resolve(i === 0 ? 'camera' : i === 1 ? 'library' : null));
    } else {
      Alert.alert('Add photo', undefined, [
        { text: 'Take Photo', onPress: () => resolve('camera') },
        { text: 'Choose from Library', onPress: () => resolve('library') },
        { text: 'Cancel', style: 'cancel', onPress: () => resolve(null) },
      ]);
    }
  });
}

/** Tinted photo strip (Before = amber, After = green, Damage = red) with an "Add Photo" tile. */
function PhotoSection({ title, tone, photos, onAdd, onView, uploading, required, compact }: {
  title: string; tone: Tone; photos: { id: string; url?: string }[]; onAdd?: () => void; onView: (u: string) => void;
  uploading?: boolean; required?: boolean; compact?: boolean;
}) {
  const c = toneColors[tone];
  if (compact && !photos.length) {
    return onAdd ? <Button small kind="ghost" icon="warning-outline" title="Document damage" onPress={onAdd} style={{ alignSelf: 'flex-start' }} /> : null;
  }
  return (
    <View style={{ marginTop: space.md }}>
      <Row style={{ justifyContent: 'space-between', marginBottom: space.sm }}>
        <Row gap={space.sm}>
          <T style={{ color: c.fg, fontSize: 17, fontWeight: '700' }}>{title}</T>
          {required && !photos.length ? <Badge label="Required" tone="danger" /> : null}
        </Row>
        <T variant="muted">{photos.length} photo{photos.length === 1 ? '' : 's'}</T>
      </Row>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: space.sm, padding: space.md }}
        style={{ backgroundColor: c.bg, borderRadius: radius.lg, borderWidth: 1, borderColor: c.fg + '66' }}>
        {photos.map((p) => (
          <Pressable key={p.id} onPress={() => p.url && onView(p.url)}>
            <Image source={{ uri: p.url }} style={{ width: 92, height: 92, borderRadius: 10, backgroundColor: colors.cardRaised }} />
          </Pressable>
        ))}
        {onAdd ? (
          <Pressable onPress={onAdd} disabled={uploading}
            style={{ width: 92, height: 92, borderRadius: 10, borderWidth: 1.5, borderStyle: 'dashed', borderColor: c.fg, alignItems: 'center', justifyContent: 'center', gap: 4 }}>
            {uploading ? <ActivityIndicator color={c.fg} /> : <Ionicons name="camera-outline" size={24} color={c.fg} />}
            <T variant="small" style={{ color: c.fg }}>{uploading ? 'Uploading' : 'Add Photo'}</T>
          </Pressable>
        ) : !photos.length ? (
          <View style={{ width: 92, height: 92, borderRadius: 10, backgroundColor: colors.cardRaised, alignItems: 'center', justifyContent: 'center', gap: 4 }}>
            <Ionicons name="camera-outline" size={22} color={colors.textFaint} />
            <T variant="small" style={{ color: colors.textFaint }}>No photos</T>
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

export default function JobDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { org, orgId, role, session, can } = useOrg();
  const uid = session!.user.id;
  const money$ = canSeeMoney(role);
  const editable = canEdit(role);
  const [viewer, setViewer] = useState<string | null>(null);
  const [signing, setSigning] = useState(false);
  const [signer, setSigner] = useState('');
  const [stars, setStars] = useState(0);
  const [feedback, setFeedback] = useState('');
  const [newStep, setNewStep] = useState('');
  const [supplySheet, setSupplySheet] = useState(false);
  const [noteSheet, setNoteSheet] = useState(false);
  const [uploading, setUploading] = useState<PhotoKind | null>(null);
  const [now] = useState(() => Date.now());

  const q = useQuery(async () => {
    const [j, items, checklist, photos, time, crew, supplies, activity, inventory, invoice] = await Promise.all([
      supabase.from('jobs').select('*, customer:customers(id, name, phone, email), aircraft:aircraft(id, tail_number, manufacturer, model, category, length_ft, notes, interior_notes), location:locations(id, name, airport_code, fbo_name, address, access_notes, contact_phone, latitude, longitude)').eq('id', id).single(),
      supabase.from('job_items').select('*').eq('job_id', id).order('sort_order'),
      supabase.from('job_checklist_items').select('*').eq('job_id', id).order('sort_order'),
      supabase.from('job_photos').select('*').eq('job_id', id).order('created_at'),
      supabase.from('time_entries').select('*').eq('job_id', id).order('started_at', { ascending: false }),
      supabase.from('job_assignments').select('user_id').eq('job_id', id),
      supabase.from('inventory_movements').select('id, delta, item:inventory_items(name, unit, unit_cost)').eq('job_id', id),
      supabase.from('activities').select('*').eq('job_id', id).order('created_at', { ascending: false }),
      supabase.from('inventory_items').select('id, name, unit, quantity').eq('org_id', orgId).order('name'),
      money$ ? supabase.from('invoices').select('id, number, status').eq('job_id', id).maybeSingle() : Promise.resolve({ data: null }),
    ]);
    if (j.error) throw j.error;
    const members = await supabase.from('memberships').select('user_id, display_name, color').eq('org_id', orgId);
    const urls = await signedUrls((photos.data ?? []).map((p) => p.storage_path));
    return {
      j: j.data as any, items: items.data ?? [], checklist: checklist.data ?? [], photos: (photos.data ?? []).map((p) => ({ ...p, url: urls[p.storage_path] })),
      time: time.data ?? [], crew: (crew.data ?? []).map((c) => c.user_id), members: members.data ?? [], supplies: supplies.data ?? [],
      activity: activity.data ?? [], inventory: inventory.data ?? [], invoice: invoice.data as any,
    };
  }, [id]);

  if (q.loading) return <Loading />;
  if (!q.data) return <Screen><ErrorBanner message={q.error ?? 'Not found'} /></Screen>;
  const { j, items, checklist, photos, time, crew, members, supplies, activity, inventory, invoice } = q.data;
  const name = (u: string) => members.find((m) => m.user_id === u)?.display_name ?? 'Team member';
  const run = (fn: () => Promise<unknown>) => async () => { try { await fn(); q.reload(); } catch (e: any) { notify('Error', friendlyError(e.message)); } };
  const setStatus = (status: string) => run(async () => {
    const { error } = await supabase.from('jobs').update({ status }).eq('id', id);
    if (error) throw error;
    await supabase.from('activities').insert({ org_id: orgId, job_id: id, customer_id: j.customer_id, kind: 'status_change', body: `Status → ${status.replace('_', ' ')}`, created_by: uid });
  });

  const done = checklist.filter((c: any) => c.done).length;
  const myOpen = time.find((t: any) => t.user_id === uid && !t.ended_at);
  const totalMinutes = time.reduce((s: number, t: any) => s + ((t.ended_at ? new Date(t.ended_at).getTime() : now) - new Date(t.started_at).getTime()) / 60000, 0);
  const jobValue = items.reduce((s: number, i: any) => s + Number(i.quantity) * Number(i.unit_price), 0);

  const toggleStep = (c: any) => run(async () => {
    const { error } = await supabase.from('job_checklist_items').update({ done: !c.done, done_by: !c.done ? uid : null, done_at: !c.done ? new Date().toISOString() : null }).eq('id', c.id);
    if (error) throw error;
  });

  const addPhoto = (kind: PhotoKind) => async () => {
    try {
      const source = await chooseSource();
      if (!source) return;
      const uri = await pickImage(source);
      if (!uri) return;
      setUploading(kind);
      const path = await uploadImage(orgId, `jobs/${id}`, uri);
      const { error } = await supabase.from('job_photos').insert({ org_id: orgId, job_id: id, kind, storage_path: path, taken_by: uid });
      if (error) throw error;
      q.reload();
    } catch (e: any) {
      notify('Photo upload failed', e.message);
    } finally {
      setUploading(null);
    }
  };

  const afterCount = photos.filter((p: any) => p.kind === 'after').length;
  const photosOpen = editable && ['scheduled', 'in_progress', 'on_hold'].includes(j.status);
  const complete = () => {
    if (done < checklist.length) confirmAction('Checklist incomplete', `${checklist.length - done} step(s) aren't checked. Complete anyway?`, setStatus('completed'));
    else setStatus('completed')();
  };

  const clock = run(async () => {
    if (myOpen) {
      const { error } = await supabase.from('time_entries').update({ ended_at: new Date().toISOString() }).eq('id', myOpen.id);
      if (error) throw error;
    } else {
      // Close any clock running elsewhere, then start one on this job.
      await supabase.from('time_entries').update({ ended_at: new Date().toISOString() }).eq('org_id', orgId).eq('user_id', uid).is('ended_at', null);
      const { error } = await supabase.from('time_entries').insert({ org_id: orgId, user_id: uid, job_id: id });
      if (error) throw error;
      if (j.status === 'scheduled') await supabase.from('jobs').update({ status: 'in_progress' }).eq('id', id);
    }
  });

  const report = run(async () => {
    const html = jobReportHtml({
      org, job: j, customer: j.customer, aircraft: j.aircraft, location: j.location,
      checklist, photos: photos.filter((p: any) => p.url).map((p: any) => ({ url: p.url, kind: p.kind, caption: p.caption })),
    });
    await sharePdf(html, `Service report ${j.number}.pdf`);
  });

  const invoiceIt = run(async () => {
    const { data, error } = await supabase.rpc('create_invoice_from_job', { p_job: id });
    if (error) throw error;
    router.push(`/invoices/${data}`);
  });

  const footer = !editable ? undefined
    : j.status === 'scheduled' || j.status === 'on_hold' ? <Button icon="play" title={j.status === 'on_hold' ? 'Resume Job' : 'Start Job'} onPress={setStatus('in_progress')} />
    : j.status === 'in_progress' ? (afterCount
      ? <Button icon="checkmark-circle-outline" title="Complete Job" onPress={complete} />
      : <Button icon="checkmark-circle-outline" title="Add After Photos to Complete" disabled onPress={() => {}} />)
    : j.status === 'completed' && money$ && !invoice ? <Button icon="receipt-outline" title="Create Invoice" onPress={invoiceIt} />
    : invoice ? <Button kind="secondary" icon="receipt-outline" title={`View Invoice ${invoice.number}`} onPress={() => router.push(`/invoices/${invoice.id}`)} />
    : undefined;

  const maps = () => {
    const l = j.location;
    const qy = l.latitude && l.longitude ? `${l.latitude},${l.longitude}` : encodeURIComponent([l.fbo_name, l.name, l.airport_code, l.address].filter(Boolean).join(' '));
    Linking.openURL(Platform.OS === 'ios' ? `http://maps.apple.com/?q=${qy}` : `https://www.google.com/maps/search/?api=1&query=${qy}`);
  };

  return (
    <Screen refreshing={q.refreshing} onRefresh={q.refresh} footer={footer}>
      <Stack.Screen options={{ title: 'Job Details', headerRight: () => <Badge large label={j.status} tone={jobTone[j.status]} /> }} />

      <Card>
        <T variant="h3" style={{ marginBottom: space.md }}>Status</T>
        <Stepper steps={['Scheduled', 'In Progress', 'Completed', 'Invoiced']} current={STATUS_STEP[j.status] ?? 0} />
        {j.status === 'on_hold' || j.status === 'cancelled' ? <Badge label={j.status} tone={jobTone[j.status]} /> : null}
      </Card>

      <Card onPress={() => router.push(`/customers/${j.customer.id}`)}>
        <Row gap={space.md}>
          <IconTile icon="person-outline" tone="info" round size={44} />
          <View style={{ flex: 1 }}>
            <T variant="muted">Customer</T>
            <T style={{ fontSize: 20, fontWeight: '700' }}>{j.customer?.name}</T>
          </View>
          {j.customer?.phone ? <IconButton icon="call-outline" label="Call" onPress={() => Linking.openURL(`tel:${j.customer.phone}`)} /> : null}
          {j.customer?.phone ? <IconButton icon="chatbubble-outline" label="Text" onPress={() => Linking.openURL(`sms:${j.customer.phone}`)} /> : null}
        </Row>
      </Card>

      {j.aircraft ? (
        <Card onPress={() => router.push(`/aircraft/${j.aircraft.id}`)}>
          <Row gap={space.md}>
            <IconTile icon="airplane-outline" tone="warning" round size={44} />
            <View style={{ flex: 1 }}>
              <T variant="muted">Aircraft</T>
              <T style={{ fontSize: 17, fontWeight: '700' }}>{[j.aircraft.manufacturer, j.aircraft.model].filter(Boolean).join(' ') || j.aircraft.tail_number}</T>
              <T variant="muted">{j.aircraft.tail_number}</T>
            </View>
          </Row>
        </Card>
      ) : null}

      <Card>
        <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <Row gap={space.sm} style={{ flex: 1 }}>
            <Ionicons name="document-text-outline" size={22} color={colors.primary} />
            <T style={{ fontSize: 17, fontWeight: '700', flex: 1 }}>{j.title ?? 'Job'}</T>
          </Row>
          {money$ ? <T style={{ color: colors.success, fontSize: 18, fontWeight: '700' }}>{money(jobValue, org.currency).replace(/\.00$/, '')}</T> : null}
        </Row>
        {money$ && items.length > 1 ? items.map((i: any) => (
          <Row key={i.id} style={{ justifyContent: 'space-between', marginTop: 4, paddingLeft: 30 }}>
            <T variant="muted" style={{ flex: 1 }}>{i.description}</T>
            <T variant="muted">{money(Number(i.quantity) * Number(i.unit_price), org.currency)}</T>
          </Row>
        )) : null}
        <Row gap={space.sm} style={{ marginTop: space.md }}>
          <Ionicons name="calendar-outline" size={18} color={colors.textMuted} />
          <T style={{ color: colors.textMuted }}>{j.scheduled_start ? format(new Date(j.scheduled_start), 'EEEE, MMMM d, yyyy · h:mm a') : 'Not scheduled'}</T>
        </Row>
        {j.actual_start ? (
          <Row gap={space.sm} style={{ marginTop: 6 }}>
            <Ionicons name="time-outline" size={18} color={colors.textMuted} />
            <T style={{ color: colors.textMuted }}>Started at {format(new Date(j.actual_start), 'h:mm a')}{j.actual_end ? ` · Completed ${format(new Date(j.actual_end), 'MMM d, h:mm a')}` : ''}</T>
          </Row>
        ) : null}
        {j.notes ? <><Divider /><T variant="muted">{j.notes}</T></> : null}
      </Card>

      <PhotoSection title="Before Photos" tone="warning" photos={photos.filter((p: any) => p.kind === 'before')}
        onAdd={photosOpen ? addPhoto('before') : undefined} onView={setViewer} uploading={uploading === 'before'} />
      <PhotoSection title="After Photos" tone="success" photos={photos.filter((p: any) => p.kind === 'after')}
        required={j.status === 'in_progress'} onAdd={photosOpen ? addPhoto('after') : undefined} onView={setViewer} uploading={uploading === 'after'} />
      {photos.some((p: any) => p.kind === 'damage') || photosOpen ? (
        <PhotoSection title="Damage Photos" tone="danger" photos={photos.filter((p: any) => p.kind === 'damage')}
          onAdd={photosOpen ? addPhoto('damage') : undefined} onView={setViewer} uploading={uploading === 'damage'} compact />
      ) : null}

      {editable ? (
        <Row style={{ flexWrap: 'wrap', marginTop: space.sm }}>
          {j.status === 'in_progress' ? <Button small kind="secondary" icon="pause" title="Put on hold" onPress={setStatus('on_hold')} /> : null}
          {['completed', 'invoiced'].includes(j.status) ? <Button small kind="secondary" icon="document-outline" title="Service report PDF" onPress={report} /> : null}
          {money$ ? <Button small kind="secondary" icon="create-outline" title="Edit job" onPress={() => router.push({ pathname: '/jobs/edit', params: { id } })} /> : null}
        </Row>
      ) : null}

      {j.location ? (
        <Section title="Location">
          <Card>
            <Row style={{ justifyContent: 'space-between' }}>
              <View style={{ flex: 1 }}>
                <T style={{ fontWeight: '700' }}>{[j.location.airport_code, j.location.name].filter(Boolean).join(' · ')}</T>
                {j.location.fbo_name ? <T variant="muted">{j.location.fbo_name}</T> : null}
              </View>
              <Button small kind="secondary" icon="navigate-outline" title="Directions" onPress={maps} />
            </Row>
            {j.location.access_notes ? <T variant="muted" style={{ marginTop: space.sm }}>🔑 {j.location.access_notes}</T> : null}
            {j.location.contact_phone ? <KeyValue label="FBO phone" value={j.location.contact_phone} onPress={() => Linking.openURL(`tel:${j.location.contact_phone}`)} /> : null}
          </Card>
        </Section>
      ) : null}

      {j.aircraft?.notes || j.aircraft?.interior_notes || j.internal_notes ? (
        <Section title="Heads up">
          <Card style={{ backgroundColor: colors.warningSoft }}>
            {j.aircraft?.notes ? <T>✈️ {j.aircraft.notes}</T> : null}
            {j.aircraft?.interior_notes ? <T style={{ marginTop: 4 }}>💺 {j.aircraft.interior_notes}</T> : null}
            {j.internal_notes ? <T style={{ marginTop: 4 }}>📝 {j.internal_notes}</T> : null}
          </Card>
        </Section>
      ) : null}

      <Section title="Crew & time">
        <Card>
          <Row style={{ flexWrap: 'wrap' }}>
            {crew.length ? crew.map((u: string) => (
              <Row key={u} gap={4}><Avatar size={26} label={initials(name(u))} color={members.find((m) => m.user_id === u)?.color ?? colors.primary} /><T>{name(u)}</T></Row>
            )) : <T variant="muted">No one assigned</T>}
          </Row>
          <Row style={{ justifyContent: 'space-between', marginTop: space.md }}>
            <T variant="muted">Logged: <T style={{ fontWeight: '700' }}>{duration(totalMinutes)}</T></T>
            {editable ? <Button small kind={myOpen ? 'danger' : 'primary'} icon={myOpen ? 'stop' : 'play'} title={myOpen ? 'Clock out' : 'Clock in on this job'} onPress={clock} /> : null}
          </Row>
          {time.slice(0, 5).map((t: any) => (
            <T key={t.id} variant="small" style={{ marginTop: 4 }}>{name(t.user_id)} · {dateTime(t.started_at)} · {t.ended_at ? duration((new Date(t.ended_at).getTime() - new Date(t.started_at).getTime()) / 60000) : 'running'}</T>
          ))}
        </Card>
      </Section>

      <Section title={`Checklist ${checklist.length ? `(${done}/${checklist.length})` : ''}`}>
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          {checklist.length ? (
            <View style={{ height: 4, backgroundColor: colors.border }}>
              <View style={{ height: 4, width: `${(done / checklist.length) * 100}%`, backgroundColor: colors.success }} />
            </View>
          ) : null}
          {checklist.map((c: any) => (
            <Pressable key={c.id} disabled={!editable} onPress={toggleStep(c)} style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md, borderBottomWidth: 1, borderBottomColor: colors.border }}>
              <Ionicons name={c.done ? 'checkmark-circle' : 'ellipse-outline'} size={24} color={c.done ? colors.success : colors.textMuted} />
              <View style={{ flex: 1 }}>
                <T style={c.done ? { textDecorationLine: 'line-through', color: colors.textMuted } : undefined}>{c.label}</T>
                {c.done && c.done_by ? <T variant="small">{name(c.done_by)} · {relative(c.done_at)}</T> : null}
              </View>
            </Pressable>
          ))}
          {editable ? (
            <Row style={{ padding: space.sm }}>
              <Field style={{ flex: 1, marginBottom: 0 }} placeholder="Add a step" value={newStep} onChangeText={setNewStep} />
              <IconButton icon="add-circle" label="Add step" onPress={run(async () => {
                if (!newStep.trim()) return;
                await supabase.from('job_checklist_items').insert({ org_id: orgId, job_id: id, label: newStep.trim(), sort_order: 100000 + checklist.length });
                setNewStep('');
              })} />
            </Row>
          ) : null}
        </Card>
      </Section>

      {can('inventory') ? (
        <Section title="Supplies used" action={editable ? <Button small kind="ghost" icon="add" title="Log" onPress={() => setSupplySheet(true)} /> : null}>
          <Card style={{ padding: 0, overflow: 'hidden' }}>
            {supplies.length ? supplies.map((m: any) => (
              <ListRow key={m.id} icon="flask-outline" title={m.item?.name ?? 'Item'} subtitle={`${Math.abs(Number(m.delta))} ${m.item?.unit ?? ''}`} />
            )) : <T variant="muted" style={{ padding: space.lg }}>Track products used to keep inventory accurate.</T>}
          </Card>
        </Section>
      ) : null}

      <Section title="Customer sign-off">
        <Card>
          {j.signed_by ? (
            <View>
              <Row><Ionicons name="checkmark-circle" size={20} color={colors.success} /><T>Signed by <T style={{ fontWeight: '700' }}>{j.signed_by}</T> · {dateTime(j.signed_at)}</T></Row>
            </View>
          ) : editable ? (
            <>
              <T variant="muted" style={{ marginBottom: space.sm }}>Hand the device to the pilot or owner to approve the completed work.</T>
              <Button kind="secondary" icon="create-outline" title="Capture signature" onPress={() => setSigning(true)} />
            </>
          ) : <T variant="muted">Not signed</T>}
          {j.rating ? <T style={{ marginTop: space.sm }}>{'★'.repeat(j.rating)}{'☆'.repeat(5 - j.rating)} {j.feedback ?? ''}</T> : null}
        </Card>
      </Section>

      <Section title="Notes & activity" action={editable ? <Button small kind="ghost" icon="add" title="Note" onPress={() => setNoteSheet(true)} /> : null}>
        {j.notes ? <Card><T>{j.notes}</T></Card> : null}
        {activity.map((a: any) => (
          <Card key={a.id} style={{ padding: space.md }}>
            <Row style={{ justifyContent: 'space-between' }}><Badge label={a.kind} /><T variant="small">{relative(a.created_at)}</T></Row>
            <T style={{ marginTop: 4 }}>{a.body}</T>
          </Card>
        ))}
      </Section>

      {money$ ? (
        <Row style={{ marginTop: space.lg }}>
          {j.status !== 'cancelled' && j.status !== 'invoiced' ? <Button small kind="ghost" title="Cancel job" onPress={() => confirmAction('Cancel job?', 'The job stays on record as cancelled.', setStatus('cancelled'))} /> : null}
          <Button small kind="ghost" icon="trash-outline" title="Delete" onPress={() => confirmAction('Delete job?', 'Photos, checklist and time entries are removed.', async () => {
            const { error } = await supabase.from('jobs').delete().eq('id', id);
            if (error) notify('Could not delete', error.message); else router.back();
          }, true)} />
        </Row>
      ) : null}

      <Modal visible={!!viewer} transparent animationType="fade" onRequestClose={() => setViewer(null)}>
        <Pressable onPress={() => setViewer(null)} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', justifyContent: 'center' }}>
          {viewer ? <Image source={{ uri: viewer }} style={{ width: '100%', height: '80%' }} resizeMode="contain" /> : null}
        </Pressable>
      </Modal>

      <Modal visible={signing} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setSigning(false)}>
        <SafeAreaView style={{ flex: 1, padding: space.lg, backgroundColor: colors.bg }}>
          <T variant="h2" style={{ marginBottom: space.sm }}>Approve completed work</T>
          <T variant="muted" style={{ marginBottom: space.md }}>{j.aircraft?.tail_number} · {j.title}</T>
          <Field label="Full name" value={signer} onChangeText={setSigner} placeholder="Pilot / owner name" />
          <T variant="small" style={{ fontWeight: '600', color: colors.text, marginBottom: 6 }}>How did we do? (optional)</T>
          <Row style={{ marginBottom: space.md }}>
            {[1, 2, 3, 4, 5].map((n) => (
              <Pressable key={n} onPress={() => setStars(n)} hitSlop={6}>
                <Ionicons name={n <= stars ? 'star' : 'star-outline'} size={30} color={colors.accent} />
              </Pressable>
            ))}
          </Row>
          <Field placeholder="Comments (optional)" value={feedback} onChangeText={setFeedback} />
          <SignaturePad onCancel={() => setSigning(false)} onSave={async (svg) => {
            if (signer.trim().length < 2) return notify('Name required', 'Enter the name of the person signing.');
            await run(async () => {
              const { error } = await supabase.from('jobs').update({ signed_by: signer.trim(), signature_svg: svg, signed_at: new Date().toISOString(), rating: stars || null, feedback: feedback.trim() || null }).eq('id', id);
              if (error) throw error;
            })();
            setSigning(false);
          }} />
        </SafeAreaView>
      </Modal>

      <FormSheet visible={supplySheet} title="Log supplies used" onClose={() => setSupplySheet(false)}
        fields={[
          { key: 'item_id', label: 'Product', type: 'select', options: inventory.map((i: any) => ({ value: i.id, label: i.name, hint: `${Number(i.quantity)} ${i.unit} on hand` })), required: true },
          { key: 'qty', label: 'Quantity used', type: 'number', required: true },
        ]}
        onSubmit={async (v) => {
          const { error } = await supabase.from('inventory_movements').insert({ org_id: orgId, item_id: v.item_id, delta: -Math.abs(Number(v.qty)), reason: 'job_use', job_id: id, created_by: uid });
          if (error) throw error;
          q.reload();
        }} />

      <FormSheet visible={noteSheet} title="Add note" onClose={() => setNoteSheet(false)}
        fields={[{ key: 'body', label: 'Note', type: 'multiline', required: true }]}
        onSubmit={async (v) => {
          const { error } = await supabase.from('activities').insert({ org_id: orgId, job_id: id, customer_id: j.customer_id, kind: 'note', body: v.body, created_by: uid });
          if (error) throw error;
          q.reload();
        }} />
    </Screen>
  );
}

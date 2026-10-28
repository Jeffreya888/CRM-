import { format } from 'date-fns';
import * as Linking from 'expo-linking';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useRef, useState, type ReactNode } from 'react';
import { Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AssessPhotosSheet } from '../../../components/ai/AssessPhotosSheet';
import { EstimateVsActual } from '../../../components/costing/EstimateVsActual';
import { confirmAction, FormSheet, notify } from '../../../components/FormSheet';
import { ConditionCard, chooseSource, DamageSheet, GuideStepSheet, PhotoStrip, PhotoViewer, ProfitCard, type JobPhoto } from '../../../components/jobs/JobCards';
import { QC_BLOCK_MESSAGE, QualityCheck, qcBlocksCompletion } from '../../../components/jobs/QualityCheck';
import { ScheduleSheet } from '../../../components/jobs/ScheduleEditor';
import { StepTimeLine, StepTimesSummary, stepItems, stepTimings } from '../../../components/jobs/StepTimes';
import { SignaturePad } from '../../../components/SignaturePad';
import { Avatar, Badge, Button, Card, Divider, ErrorBanner, Field, IconButton, IconTile, Ionicons, KeyValue, Loading, Row, Section, SheetModal, Stepper, T, ToggleRow } from '../../../components/ui';
import { ask, confirmTentative } from '../../../lib/conflicts';
import { sharePdf } from '../../../lib/documents';
import { signedUrls } from '../../../lib/files';
import { dateTime, duration, initials, money, relative } from '../../../lib/format';
import { directionsUrl, errorCode, fetchGuide, JOB_STATUS_LABEL, MAX_JOB_PHOTOS, pickJobPhoto, serviceReportHtml, statusTone, uploadJobPhoto } from '../../../lib/jobs';
import { canAdmin, canEdit, isManager } from '../../../lib/plans';
import { assetTypeInfo } from '../../../lib/pricing';
import { useOrg } from '../../../lib/session';
import { callFunction, friendlyError, supabase } from '../../../lib/supabase';
import { colors, space } from '../../../lib/theme';
import type { PhotoKind, ServiceGuide } from '../../../lib/types';
import { useQuery } from '../../../lib/useQuery';

const minutesBetween = (a: string, b: string | null, now: number) => ((b ? new Date(b).getTime() : now) - new Date(a).getTime()) / 60000;

export default function JobDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { org, orgId, role, session, can, perm } = useOrg();
  const uid = session!.user.id;
  const showMoney = perm('see_prices');
  const reports = perm('see_reports');
  const editable = canEdit(role);
  const manager = isManager(role);
  const admin = canAdmin(role);

  const scrollRef = useRef<ScrollView>(null);
  const photoY = useRef(0);
  const [viewer, setViewer] = useState<JobPhoto | null>(null);
  const [signing, setSigning] = useState(false);
  const [signer, setSigner] = useState('');
  const [stars, setStars] = useState(0);
  const [feedback, setFeedback] = useState('');
  const [newStep, setNewStep] = useState('');
  const [supplySheet, setSupplySheet] = useState(false);
  const [noteSheet, setNoteSheet] = useState(false);
  const [damageSheet, setDamageSheet] = useState(false);
  const [scheduleSheet, setScheduleSheet] = useState<null | { confirm: boolean }>(null);
  const [stepItem, setStepItem] = useState<any>(null);
  const [uploading, setUploading] = useState<PhotoKind | null>(null);
  const [assessOpen, setAssessOpen] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const q = useQuery(async () => {
    const [j, items, checklist, photos, time, crew, supplies, activity, holds] = await Promise.all([
      supabase.from('jobs').select('*, customer:customers(id, name, phone, email), aircraft:aircraft(id, tail_number, manufacturer, model, category, length_ft, notes, interior_notes, asset_type), location:locations(*), branch:branches(id, name)').eq('id', id).single(),
      showMoney ? supabase.from('job_items').select('*').eq('job_id', id).order('sort_order') : Promise.resolve({ data: [] as any[] }),
      supabase.from('job_checklist_items').select('*').eq('job_id', id).order('sort_order'),
      supabase.from('job_photos').select('*').eq('job_id', id).order('created_at'),
      supabase.from('time_entries').select('*').eq('job_id', id).order('started_at', { ascending: false }),
      supabase.from('job_assignments').select('user_id, is_primary, confirmed').eq('job_id', id),
      supabase.from('inventory_movements').select('id, delta, auto, note, created_at, item:inventory_items(name, unit)').eq('job_id', id).eq('reason', 'job_use').order('created_at'),
      supabase.from('activities').select('*').eq('job_id', id).order('created_at', { ascending: false }).limit(30),
      supabase.from('resource_holds').select('id, starts_at, ends_at, equipment:equipment(id, name), location:locations(id, name, airport_code)').eq('job_id', id),
    ]);
    if (j.error) throw j.error;
    const job = j.data as any;
    const serviceIds = [...new Set(((items.data ?? []) as any[]).map((i) => i.service_id).filter(Boolean))] as string[];
    // SOPs behind the checklist steps, for per-step time estimates.
    const guideKeys = [...new Set(((checklist.data ?? []) as any[]).map((c) => c.guide_key).filter(Boolean))] as string[];
    const guideList = await Promise.all(guideKeys.map((k) => fetchGuide(orgId, k).catch(() => null)));
    const guides: Record<string, ServiceGuide | null> = Object.fromEntries(guideKeys.map((k, i) => [k, guideList[i] ?? null]));
    const [members, secret, invoice, expenses, inventory, followUp, menu] = await Promise.all([
      supabase.from('memberships').select('user_id, display_name, color').eq('org_id', orgId),
      manager && job.location_id ? supabase.from('location_secrets').select('gate_code, notes').eq('location_id', job.location_id).maybeSingle() : Promise.resolve({ data: null }),
      showMoney ? supabase.from('invoices').select('id, number, status').eq('job_id', id).neq('status', 'void').order('created_at', { ascending: false }).limit(1).maybeSingle() : Promise.resolve({ data: null }),
      showMoney ? supabase.from('expenses').select('id, description, amount, category').eq('job_id', id) : Promise.resolve({ data: [] as any[] }),
      can('inventory') ? supabase.from('inventory_items').select('id, name, unit, quantity').eq('org_id', orgId).eq('active', true).order('name') : Promise.resolve({ data: [] as any[] }),
      job.follow_up_of ? supabase.from('jobs').select('id, number').eq('id', job.follow_up_of).maybeSingle() : Promise.resolve({ data: null }),
      serviceIds.length ? supabase.from('service_menu').select('id, category').in('id', serviceIds) : Promise.resolve({ data: [] as any[] }),
    ]);
    const urls = await signedUrls((photos.data ?? []).map((p: any) => p.storage_path)).catch(() => ({} as Record<string, string>));
    return {
      j: job, items: (items.data ?? []) as any[], checklist: (checklist.data ?? []) as any[],
      photos: ((photos.data ?? []) as any[]).map((p) => ({ ...p, url: urls[p.storage_path] })) as JobPhoto[],
      time: (time.data ?? []) as any[], crew: (crew.data ?? []) as { user_id: string; is_primary: boolean; confirmed: boolean }[],
      members: (members.data ?? []) as any[], supplies: (supplies.data ?? []) as any[], activity: (activity.data ?? []) as any[],
      holds: (holds.data ?? []) as any[], secret: secret.data as any, invoice: invoice.data as any, expenses: (expenses.data ?? []) as any[],
      inventory: (inventory.data ?? []) as any[], followUp: followUp.data as any, guides,
      categories: [...new Set(((menu.data ?? []) as any[]).map((m) => m.category).filter(Boolean))] as string[],
    };
  }, [id, showMoney, manager]);

  if (q.loading && !q.data) return <Loading />;
  if (!q.data) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, padding: space.lg }}>
        <Stack.Screen options={{ title: 'Job' }} />
        <ErrorBanner message={q.error ?? 'This job was not found.'} onRetry={q.reload} />
      </View>
    );
  }
  const { j, items, checklist: allChecklist, photos, time, crew, members, supplies, activity, holds, secret, invoice, expenses, inventory, followUp, categories, guides } = q.data;
  // Quality-check items live in the same table (kind = 'qc') but have their own section.
  const checklist = stepItems(allChecklist);
  const qcItems = allChecklist.filter((c) => c.kind === 'qc');
  const timings = stepTimings(checklist, guides, j.actual_start);
  // Quality checks are a Team+ feature; on other plans the setting is ignored.
  const requireQc = !!org?.require_qc && can('quality_check');
  const qcBlocked = qcBlocksCompletion(requireQc, j.qc_status);
  const name = (u: string) => members.find((m) => m.user_id === u)?.display_name ?? 'Team member';
  const color = (u: string) => members.find((m) => m.user_id === u)?.color ?? colors.primary;
  const info = assetTypeInfo(j.aircraft?.asset_type ?? 'aircraft');
  const run = (fn: () => Promise<unknown>) => async () => { try { await fn(); q.reload(); } catch (e: any) { notify('Something went wrong', friendlyError(e.message)); } };

  const before = photos.filter((p) => p.kind === 'before');
  const after = photos.filter((p) => p.kind === 'after');
  const damage = photos.filter((p) => p.kind === 'damage');
  const photosOpen = editable && ['tentative', 'scheduled', 'in_progress', 'on_hold'].includes(j.status);
  const jumpToPhotos = () => scrollRef.current?.scrollTo({ y: Math.max(0, photoY.current - 12), animated: true });

  const addPhoto = async (kind: PhotoKind, caption?: string | null, picked?: Awaited<ReturnType<typeof pickJobPhoto>>) => {
    if (photos.length >= MAX_JOB_PHOTOS) { notify('Photo limit reached', 'A job can have at most 30 photos. Remove one before adding another.'); return; }
    let p = picked ?? null;
    if (!p) {
      const src = await chooseSource();
      if (!src) return;
      p = await pickJobPhoto(src);
    }
    if (!p) return;
    setUploading(kind);
    try {
      await uploadJobPhoto({ orgId, jobId: id, userId: uid, photo: p, kind: kind as any, caption, currentCount: photos.length });
      q.reload();
    } finally {
      setUploading(null);
    }
  };
  const tryAddPhoto = (kind: PhotoKind) => async () => {
    try { await addPhoto(kind); } catch (e: any) { notify('Photo not added', friendlyError(e.message)); }
  };

  /** Friendly prompt when photos are required, then jump to the photo section. */
  const needPhotos = async (kind: 'before' | 'after') => {
    const go = await ask(kind === 'before' ? 'Before photos needed' : 'After photos needed',
      kind === 'before' ? 'Take at least one before photo to start this job. It protects you if the customer asks about existing damage.'
        : 'Take at least one after photo to complete this job. It goes on the service report for the customer.',
      'Add photo');
    jumpToPhotos();
    if (go) await tryAddPhoto(kind)();
  };

  const setStatus = async (status: string) => {
    const { error } = await supabase.from('jobs').update({ status }).eq('id', id);
    if (error) {
      const code = errorCode(error.message);
      if (code === 'BEFORE_PHOTOS_REQUIRED') return needPhotos('before');
      if (code === 'AFTER_PHOTOS_REQUIRED') return needPhotos('after');
      if (code === 'QC_REQUIRED') { notify('Quality check needed', QC_BLOCK_MESSAGE); q.reload(); return; }
      notify('Could not update the job', friendlyError(error.message));
      return;
    }
    await supabase.from('activities').insert({ org_id: orgId, job_id: id, customer_id: j.customer_id, kind: 'status_change', body: `Status → ${JOB_STATUS_LABEL[status as keyof typeof JOB_STATUS_LABEL] ?? status}`, created_by: uid });
    q.reload();
  };

  const start = () => (before.length ? setStatus('in_progress') : needPhotos('before'));
  // Lets the customer know the crew is heading out (Automation center → On our way).
  const onOurWay = async () => {
    try {
      const { data, error } = await supabase.rpc('queue_on_our_way', { p_job: id });
      if (error) throw error;
      const ids = (data ?? []) as string[];
      if (!ids.length) return notify('Already sent', 'The customer was already told you are on the way.');
      for (const message_id of ids) await callFunction('send-message', { message_id });
      notify('Customer notified', 'We let the customer know you are on the way.');
    } catch (e: any) {
      notify('Could not send', friendlyError(e.message));
    }
  };
  const done = checklist.filter((c) => c.done).length;
  const complete = () => {
    if (!after.length) return needPhotos('after');
    if (qcBlocked) return notify('Quality check needed', `${QC_BLOCK_MESSAGE}${j.qc_status === 'pending' ? ' It has been sent and is waiting for a manager.' : ' Tap “Ready for quality check” below.'}`);
    if (done < checklist.length) confirmAction('Checklist incomplete', `${checklist.length - done} step(s) aren't checked. Complete anyway?`, () => setStatus('completed'));
    else setStatus('completed');
  };
  const confirmJob = async () => {
    try {
      const r = await confirmTentative(id, admin);
      if (r === 'needs_time') setScheduleSheet({ confirm: true });
      else if (r === 'saved') q.reload();
    } catch (e: any) {
      notify('Could not confirm', friendlyError(e.message));
    }
  };

  // Crew time: each person clocks their own time on this job.
  const myOpen = time.find((t) => t.user_id === uid && !t.ended_at);
  const clock = run(async () => {
    if (myOpen) {
      const { error } = await supabase.from('time_entries').update({ ended_at: new Date().toISOString() }).eq('id', myOpen.id);
      if (error) throw error;
    } else {
      // Close any clock running elsewhere, then start one on this job.
      await supabase.from('time_entries').update({ ended_at: new Date().toISOString() }).eq('org_id', orgId).eq('user_id', uid).is('ended_at', null);
      const { error } = await supabase.from('time_entries').insert({ org_id: orgId, user_id: uid, job_id: id });
      if (error) throw error;
    }
    setNow(() => Date.now());
  });
  const perPerson = Object.entries(time.reduce<Record<string, number>>((acc, t) => {
    acc[t.user_id] = (acc[t.user_id] ?? 0) + minutesBetween(t.started_at, t.ended_at, now);
    return acc;
  }, {}));
  const totalMinutes = perPerson.reduce((s, [, m]) => s + m, 0);

  const toggleStep = (c: any) => run(async () => {
    const { error } = await supabase.from('job_checklist_items').update({ done: !c.done, done_by: !c.done ? uid : null, done_at: !c.done ? new Date().toISOString() : null }).eq('id', c.id);
    if (error) throw error;
  });

  const report = run(async () => {
    const html = serviceReportHtml({
      org, job: j, customer: j.customer, aircraft: j.aircraft, location: j.location,
      checklist, photos: photos.filter((p) => p.url).map((p) => ({ url: p.url!, kind: p.kind, caption: p.caption })),
    });
    await sharePdf(html, `Service report ${j.number}.pdf`);
  });

  const invoiceIt = run(async () => {
    const { data, error } = await supabase.rpc('create_invoice_from_job', { p_job: id });
    if (error) throw error;
    router.push(`/invoices/${data}`);
  });

  const fees: { name: string; amount: number }[] = Array.isArray(j.location?.fees) ? j.location.fees : [];
  const feeAdded = (f: { name: string }) => expenses.some((e) => e.category === 'fees' && e.description === f.name);
  const addFee = (f: { name: string; amount: number }) => run(async () => {
    const { error } = await supabase.from('expenses').insert({
      org_id: orgId, job_id: id, category: 'fees', vendor: [j.location?.fbo_name, j.location?.name].filter(Boolean).join(' · ') || null,
      description: f.name, amount: Number(f.amount) || 0, branch_id: j.branch_id ?? null, created_by: uid,
    });
    if (error) throw error;
  });

  const mine = crew.find((c) => c.user_id === uid);
  const directions = j.location ? directionsUrl(j.location) : null;
  const jobValue = items.reduce((s, i) => s + Number(i.quantity) * Number(i.unit_price), 0);
  const steps = j.status === 'tentative' ? ['Tentative', 'Scheduled', 'In progress', 'Completed', 'Invoiced'] : ['Scheduled', 'In progress', 'Completed', 'Invoiced'];
  const stepIndex = (j.status === 'tentative' ? { tentative: 0 } : { scheduled: 0, on_hold: 1, in_progress: 1, completed: 2, invoiced: 3 } as Record<string, number>)[j.status] ?? 0;

  const footer = !editable ? null
    : j.status === 'tentative' ? (manager ? <Button icon="checkmark-circle-outline" title="Confirm job" onPress={confirmJob} /> : null)
    : j.status === 'scheduled' || j.status === 'on_hold' ? <Button icon="play" title={j.status === 'on_hold' ? 'Resume job' : before.length ? 'Start job' : 'Add before photos to start'} kind={before.length ? 'primary' : 'secondary'} onPress={start} />
    : j.status === 'in_progress' ? <Button icon={qcBlocked && after.length ? 'shield-checkmark-outline' : 'checkmark-circle-outline'} title={!after.length ? 'Add after photos to complete' : qcBlocked ? 'Complete job (quality check first)' : 'Complete job'} kind={after.length && !qcBlocked ? 'primary' : 'secondary'} onPress={complete} />
    : j.status === 'completed' && showMoney && !invoice && !j.covered_by_plan ? <Button icon="receipt-outline" title="Create invoice" onPress={invoiceIt} />
    : invoice ? <Button kind="secondary" icon="receipt-outline" title={`View invoice ${invoice.number}`} onPress={() => router.push(`/invoices/${invoice.id}`)} />
    : null;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Stack.Screen options={{ title: j.number ? `Job ${j.number}` : 'Job', headerRight: () => <Badge large label={JOB_STATUS_LABEL[j.status as keyof typeof JOB_STATUS_LABEL] ?? j.status} tone={statusTone[j.status]} raw /> }} />
      <ScrollView ref={scrollRef} contentContainerStyle={{ padding: space.lg, paddingBottom: 120 }} keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={q.refreshing} onRefresh={q.refresh} tintColor={colors.textMuted} />}>
        <ErrorBanner message={q.error} onRetry={q.reload} />

        {j.flagged ? (
          <Card style={{ backgroundColor: colors.dangerSoft, borderColor: colors.danger }}>
            <Row style={{ alignItems: 'flex-start' }}>
              <Ionicons name="flag" size={20} color={colors.danger} />
              <View style={{ flex: 1 }}>
                <T style={{ fontWeight: '700', color: colors.danger }}>Flagged: {j.flag_reason ?? 'needs attention'}</T>
                {j.feedback ? <T style={{ marginTop: 4 }}>“{j.feedback}”</T> : null}
                <T variant="small" style={{ marginTop: 4 }}>Reach out to the customer now to make it right.</T>
              </View>
            </Row>
            {manager ? (
              <Row style={{ marginTop: space.sm }}>
                {j.customer?.phone ? <Button small kind="secondary" icon="call-outline" title="Call customer" onPress={() => Linking.openURL(`tel:${j.customer.phone}`)} /> : null}
                <Button small kind="ghost" title="Mark resolved" onPress={run(async () => {
                  const { error } = await supabase.from('jobs').update({ flagged: false }).eq('id', id);
                  if (error) throw error;
                })} />
              </Row>
            ) : null}
          </Card>
        ) : null}

        <Card>
          <T variant="h3" style={{ marginBottom: space.md }}>Status</T>
          <Stepper steps={steps} current={stepIndex} />
          {j.status === 'tentative' ? <T variant="small" style={{ marginTop: space.md }}>Tentative jobs hold the time but aren&apos;t confirmed yet{followUp ? ` (follow-up visit from ${followUp.number})` : ''}. Confirm to schedule it.</T> : null}
          {j.status === 'on_hold' || j.status === 'cancelled' ? <View style={{ marginTop: space.sm }}><Badge label={j.status} tone={statusTone[j.status]} /></View> : null}
        </Card>

        <Card onPress={() => router.push(`/customers/${j.customer.id}`)}>
          <Row gap={space.md}>
            <IconTile icon="person-outline" tone="info" round size={44} />
            <View style={{ flex: 1 }}>
              <T variant="muted">Customer</T>
              <T style={{ fontSize: 19, fontWeight: '700' }}>{j.customer?.name}</T>
            </View>
            {j.customer?.phone ? <IconButton icon="call-outline" label="Call" onPress={() => Linking.openURL(`tel:${j.customer.phone}`)} /> : null}
            {j.customer?.phone ? <IconButton icon="chatbubble-outline" label="Text" onPress={() => Linking.openURL(`sms:${j.customer.phone}`)} /> : null}
          </Row>
        </Card>

        {j.aircraft ? (
          <Card onPress={() => router.push(`/aircraft/${j.aircraft.id}`)}>
            <Row gap={space.md}>
              <IconTile icon={info.icon} tone="warning" round size={44} />
              <View style={{ flex: 1 }}>
                <T variant="muted">{info.label}</T>
                <T style={{ fontSize: 17, fontWeight: '700' }}>{[j.aircraft.manufacturer, j.aircraft.model].filter(Boolean).join(' ') || j.aircraft.tail_number}</T>
                <T variant="muted">{j.aircraft.tail_number}</T>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
            </Row>
          </Card>
        ) : null}

        <Card>
          <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <Row gap={space.sm} style={{ flex: 1 }}>
              <Ionicons name="document-text-outline" size={22} color={colors.primary} />
              <T style={{ fontSize: 17, fontWeight: '700', flex: 1 }}>{j.title ?? 'Job'}</T>
            </Row>
            {showMoney && items.length ? <T style={{ color: colors.success, fontSize: 18, fontWeight: '700' }}>{money(jobValue, org.currency).replace(/\.00$/, '')}</T> : null}
          </Row>
          {showMoney && items.length > 1 ? items.map((i) => (
            <Row key={i.id} style={{ justifyContent: 'space-between', marginTop: 4, paddingLeft: 30 }}>
              <T variant="muted" style={{ flex: 1 }}>{i.description}</T>
              <T variant="muted">{money(Number(i.quantity) * Number(i.unit_price), org.currency)}</T>
            </Row>
          )) : null}
          <Row gap={space.sm} style={{ marginTop: space.md }}>
            <Ionicons name="calendar-outline" size={18} color={colors.textMuted} />
            <T style={{ color: colors.textMuted, flex: 1 }}>
              {j.scheduled_start ? `${format(new Date(j.scheduled_start), 'EEEE, MMM d, yyyy · h:mm a')}${j.scheduled_end ? ` – ${format(new Date(j.scheduled_end), 'h:mm a')}` : ''}` : 'Not scheduled yet'}
            </T>
          </Row>
          {j.travel_before_min || j.travel_after_min ? (
            <Row gap={space.sm} style={{ marginTop: 6 }}>
              <Ionicons name="car-outline" size={18} color={colors.textMuted} />
              <T style={{ color: colors.textMuted }}>Travel {j.travel_before_min || 0} min before · {j.travel_after_min || 0} min after</T>
            </Row>
          ) : null}
          {j.actual_start ? (
            <Row gap={space.sm} style={{ marginTop: 6 }}>
              <Ionicons name="time-outline" size={18} color={colors.textMuted} />
              <T style={{ color: colors.textMuted, flex: 1 }}>Started {format(new Date(j.actual_start), 'MMM d, h:mm a')}{j.actual_end ? ` · Completed ${format(new Date(j.actual_end), 'MMM d, h:mm a')}` : ''}</T>
            </Row>
          ) : null}
          {j.branch ? (
            <Row gap={space.sm} style={{ marginTop: 6 }}>
              <Ionicons name="business-outline" size={18} color={colors.textMuted} />
              <T style={{ color: colors.textMuted }}>{j.branch.name}</T>
            </Row>
          ) : null}
          {j.notes ? <><Divider /><T variant="muted">{j.notes}</T></> : null}
        </Card>

        <View onLayout={(e) => { photoY.current = e.nativeEvent.layout.y; }}>
          <PhotoStrip title="Before photos" tone="warning" photos={before} required={['scheduled', 'on_hold', 'tentative'].includes(j.status)}
            hint="Needed to start the job." onAdd={photosOpen ? tryAddPhoto('before') : undefined} onView={setViewer} uploading={uploading === 'before'} />
          <PhotoStrip title="After photos" tone="success" photos={after} required={j.status === 'in_progress'}
            hint="Needed to complete the job." onAdd={photosOpen ? tryAddPhoto('after') : undefined} onView={setViewer} uploading={uploading === 'after'} />
          <T variant="small" style={{ marginTop: 6 }}>{photos.length} of {MAX_JOB_PHOTOS} photos · JPG, PNG or WebP up to 10 MB</T>
        </View>

        <Section title="Damage documentation" icon="warning-outline" iconColor={colors.danger}
          action={photosOpen ? <Button small kind="ghost" icon="add" title="Add" onPress={() => setDamageSheet(true)} /> : null}>
          {damage.length ? damage.map((p) => (
            <Card key={p.id} onPress={() => setViewer(p)} style={{ padding: space.md }}>
              <Row>
                <Ionicons name="image-outline" size={20} color={colors.danger} />
                <T style={{ flex: 1 }}>{p.caption ?? 'Damage photo'}</T>
                <Ionicons name="expand-outline" size={18} color={colors.textMuted} />
              </Row>
            </Card>
          )) : <Card><T variant="muted">No damage recorded. Document any existing scratches, chips or stains before you start.</T></Card>}
        </Section>

        <Section title="Condition & service acceptance" icon="clipboard-outline">
          <ConditionCard job={j} editable={editable && j.status !== 'cancelled'} onChanged={q.reload} />
        </Section>

        {editable ? (
          <Row style={{ flexWrap: 'wrap', marginTop: space.md }}>
            {j.status === 'in_progress' ? <Button small kind="secondary" icon="pause" title="Put on hold" onPress={() => setStatus('on_hold')} /> : null}
            {['completed', 'invoiced'].includes(j.status) ? <Button small kind="secondary" icon="document-outline" title="Service report PDF" onPress={report} /> : null}
            {manager ? <Button small kind="secondary" icon="create-outline" title="Edit job" onPress={() => router.push({ pathname: '/jobs/edit', params: { id } })} /> : null}
            {(manager || mine) && j.status !== 'cancelled' ? <Button small kind="secondary" icon="sparkles-outline" title="Check condition" onPress={() => setAssessOpen(true)} /> : null}
          </Row>
        ) : null}

        {canEdit(role) && (j.status === 'scheduled' || j.status === 'tentative') ? (
          <Button kind="secondary" icon="car-outline" title="On our way" onPress={onOurWay} style={{ marginTop: space.md }} />
        ) : null}
        {j.location ? (
          <Section title={j.location.kind === 'marina' ? 'Marina' : j.location.kind === 'service_site' ? 'Service site' : 'Airport / FBO'} icon="location-outline">
            <Card>
              <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <Pressable style={{ flex: 1 }} onPress={() => router.push(`/facilities/${j.location.id}`)}>
                  <T style={{ fontWeight: '700', color: colors.primaryText }}>{[j.location.airport_code, j.location.name].filter(Boolean).join(' · ')}</T>
                  {j.location.fbo_name ? <T variant="muted">{j.location.fbo_name}</T> : null}
                  {j.location.address ? <T variant="small">{j.location.address}</T> : null}
                </Pressable>
                {directions ? <Button small kind="secondary" icon="navigate-outline" title="Directions" onPress={() => Linking.openURL(directions)} /> : null}
              </Row>
              {j.location.access_notes ? (
                <Row style={{ marginTop: space.sm, alignItems: 'flex-start' }}>
                  <Ionicons name="information-circle-outline" size={18} color={colors.textMuted} />
                  <T variant="muted" style={{ flex: 1 }}>{j.location.access_notes}</T>
                </Row>
              ) : null}
              {manager && secret?.gate_code ? (
                <Row style={{ marginTop: space.sm }}>
                  <Ionicons name="key-outline" size={18} color={colors.accent} />
                  <T>Gate / access code: <T style={{ fontWeight: '700' }}>{secret.gate_code}</T></T>
                </Row>
              ) : null}
              {manager && secret?.notes ? <T variant="small" style={{ marginTop: 4 }}>{secret.notes}</T> : null}
              <Row style={{ marginTop: space.sm, flexWrap: 'wrap' }}>
                {j.location.has_water === false ? <Badge label="No water" tone="warning" raw /> : <Badge label="Water" tone="info" raw />}
                {j.location.has_power === false ? <Badge label="No power" tone="warning" raw /> : <Badge label="Power" tone="info" raw />}
                {j.location.hangar_available ? <Badge label="Hangar available" tone="success" raw /> : null}
              </Row>
              {j.location.contact_phone ? <KeyValue label="Phone" value={j.location.contact_phone} onPress={() => Linking.openURL(`tel:${j.location.contact_phone}`)} /> : null}
              {j.parking_spot ? <KeyValue label="Spot" value={j.parking_spot} /> : null}
              {showMoney && fees.length ? (
                <View style={{ marginTop: space.sm }}>
                  <Divider />
                  <T style={{ fontWeight: '600', marginBottom: 4 }}>Facility fees</T>
                  {fees.map((f, i) => (
                    <Row key={i} style={{ justifyContent: 'space-between', paddingVertical: 4 }}>
                      <T style={{ flex: 1 }}>{f.name} · {money(f.amount, org.currency)}</T>
                      {feeAdded(f) ? <Badge label="Added to job costs" tone="success" raw />
                        : <Button small kind="ghost" icon="add" title="Add as job cost" onPress={addFee(f)} />}
                    </Row>
                  ))}
                </View>
              ) : null}
            </Card>
          </Section>
        ) : null}

        {j.aircraft?.notes || j.aircraft?.interior_notes || j.internal_notes ? (
          <Section title="Heads up" icon="alert-circle-outline" iconColor={colors.warning}>
            <Card style={{ backgroundColor: colors.warningSoft }}>
              {j.aircraft?.notes ? <T>{j.aircraft.notes}</T> : null}
              {j.aircraft?.interior_notes ? <T style={{ marginTop: 4 }}>Interior: {j.aircraft.interior_notes}</T> : null}
              {j.internal_notes ? <T style={{ marginTop: 4 }}>Staff note: {j.internal_notes}</T> : null}
            </Card>
          </Section>
        ) : null}

        <Section title="Crew & resources" icon="people-outline"
          action={manager ? <Button small kind="ghost" icon="create-outline" title="Edit" onPress={() => setScheduleSheet({ confirm: false })} /> : null}>
          <Card>
            {crew.length ? [...crew].sort((a, b) => Number(b.is_primary) - Number(a.is_primary)).map((c) => (
              <Row key={c.user_id} style={{ marginBottom: 8 }}>
                <Avatar size={30} label={initials(name(c.user_id))} color={color(c.user_id)} />
                <View style={{ flex: 1 }}>
                  <T style={{ fontWeight: '600' }}>{name(c.user_id)}{c.user_id === uid ? ' (you)' : ''}</T>
                  {c.is_primary ? <T variant="small">Primary technician</T> : null}
                </View>
                {c.confirmed ? <Badge label="Confirmed" tone="success" raw /> : <Badge label="Not confirmed" raw />}
              </Row>
            )) : <T variant="muted">No one assigned yet.</T>}
            {mine && OPEN(j.status) ? (
              <Button small kind={mine.confirmed ? 'ghost' : 'primary'} icon={mine.confirmed ? 'close-outline' : 'checkmark-outline'}
                title={mine.confirmed ? 'Undo my confirmation' : 'Confirm I’ll be there'} style={{ alignSelf: 'flex-start', marginTop: 4 }}
                onPress={run(async () => {
                  const { error } = await supabase.rpc('confirm_assignment', { p_job: id, p_confirmed: !mine.confirmed });
                  if (error) throw error;
                })} />
            ) : null}
            {holds.length ? (
              <>
                <Divider />
                {holds.map((h) => (
                  <Row key={h.id} style={{ marginBottom: 4 }}>
                    <Ionicons name={h.equipment ? 'construct-outline' : 'home-outline'} size={18} color={colors.textMuted} />
                    <T style={{ flex: 1 }}>{h.equipment ? h.equipment.name : `Hangar · ${[h.location?.airport_code, h.location?.name].filter(Boolean).join(' ')}`}</T>
                    <T variant="small">{format(new Date(h.starts_at), 'h:mm a')}–{format(new Date(h.ends_at), 'h:mm a')}</T>
                  </Row>
                ))}
              </>
            ) : null}
          </Card>
        </Section>

        <Section title="Crew time" icon="time-outline" count={`${duration(totalMinutes)} logged`}>
          <Card>
            {perPerson.length ? perPerson.map(([u, m]) => (
              <Row key={u} style={{ justifyContent: 'space-between', marginBottom: 4 }}>
                <T>{name(u)}{u === uid ? ' (you)' : ''}</T>
                <T style={{ fontWeight: '700' }}>{duration(m)}{time.some((t) => t.user_id === u && !t.ended_at) ? ' · on the clock' : ''}</T>
              </Row>
            )) : <T variant="muted">No time logged on this job yet.</T>}
            {manager && time.length ? (
              <View style={{ marginTop: space.sm }}>
                {time.slice(0, 12).map((t) => (
                  <T key={t.id} variant="small" style={{ marginTop: 2 }}>{name(t.user_id)} · {dateTime(t.started_at)} · {t.ended_at ? duration(minutesBetween(t.started_at, t.ended_at, now)) : 'running'}</T>
                ))}
              </View>
            ) : !manager ? <T variant="small" style={{ marginTop: 4 }}>You see your own time. Managers see everyone&apos;s.</T> : null}
            {editable && OPEN(j.status) ? (
              <Button small kind={myOpen ? 'danger' : 'primary'} icon={myOpen ? 'stop' : 'play'} title={myOpen ? 'Clock out' : 'Clock in on this job'}
                style={{ alignSelf: 'flex-start', marginTop: space.md }} onPress={clock} />
            ) : null}
          </Card>
        </Section>

        <Section title={`Checklist${checklist.length ? ` (${done}/${checklist.length})` : ''}`} icon="checkbox-outline">
          <Card style={{ padding: 0, overflow: 'hidden' }}>
            {checklist.length ? (
              <View style={{ height: 4, backgroundColor: colors.border }}>
                <View style={{ height: 4, width: `${(done / checklist.length) * 100}%`, backgroundColor: colors.success }} />
              </View>
            ) : null}
            <StepTimesSummary items={checklist} timings={timings} />
            {checklist.map((c) => (
              <View key={c.id} style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md, borderBottomWidth: 1, borderBottomColor: colors.border }}>
                <Pressable disabled={!editable} onPress={toggleStep(c)} hitSlop={8} accessibilityLabel={c.done ? 'Mark not done' : 'Mark done'}>
                  <Ionicons name={c.done ? 'checkmark-circle' : 'ellipse-outline'} size={26} color={c.done ? colors.success : colors.textMuted} />
                </Pressable>
                <Pressable style={{ flex: 1 }} onPress={c.guide_key ? () => setStepItem(c) : editable ? toggleStep(c) : undefined}>
                  <T style={c.done ? { textDecorationLine: 'line-through', color: colors.textMuted } : undefined}>{c.label}</T>
                  {c.done && c.done_by ? <T variant="small">{name(c.done_by)} · {relative(c.done_at)}</T> : null}
                  <StepTimeLine t={timings[c.id]} />
                </Pressable>
                {c.guide_key ? <IconButton icon="book-outline" color={colors.primaryText} label="How to do this step" onPress={() => setStepItem(c)} /> : null}
              </View>
            ))}
            {!checklist.length ? <T variant="muted" style={{ padding: space.lg }}>No checklist steps. Steps come from each service&apos;s SOP.</T> : null}
            {editable ? (
              <Row style={{ padding: space.sm }}>
                <Field style={{ flex: 1, marginBottom: 0 }} placeholder="Add a step" value={newStep} onChangeText={setNewStep} />
                <IconButton icon="add-circle" label="Add step" onPress={run(async () => {
                  if (!newStep.trim()) return;
                  const { error } = await supabase.from('job_checklist_items').insert({ org_id: orgId, job_id: id, label: newStep.trim(), sort_order: 100000 + checklist.length });
                  if (error) throw error;
                  setNewStep('');
                })} />
              </Row>
            ) : null}
          </Card>
        </Section>

        <QualityCheck job={j} items={qcItems} requireQc={requireQc} manager={manager} name={name} uid={uid} onChanged={q.reload}
          canCheck={editable && OPEN(j.status) && (manager || !!mine)} canSubmit={editable && (manager || !!mine)} />

        {can('inventory') ? (
          <Section title="Supplies used" icon="flask-outline" action={editable ? <Button small kind="ghost" icon="add" title="Log" onPress={() => setSupplySheet(true)} /> : null}>
            <Card style={{ padding: 0, overflow: 'hidden' }}>
              {supplies.length ? supplies.map((m) => (
                <Row key={m.id} style={{ padding: space.md, borderBottomWidth: 1, borderBottomColor: colors.border }}>
                  <Ionicons name="flask-outline" size={20} color={colors.primary} />
                  <T style={{ flex: 1 }}>{m.item?.name ?? 'Item'}</T>
                  <T style={{ fontWeight: '700' }}>{Math.abs(Number(m.delta))} {m.item?.unit ?? ''}</T>
                  {m.auto ? <Badge label="auto" tone="info" raw /> : null}
                </Row>
              )) : <T variant="muted" style={{ padding: space.lg }}>Log the products you use. Supplies set on each service are deducted automatically when the job is completed.</T>}
            </Card>
          </Section>
        ) : null}

        <Section title="Follow-up care" icon="repeat-outline">
          <Card>
            <ToggleRow label="Customer opted in to follow-up care" value={!!j.care_opt_in}
              hint={j.care_opt_in ? 'When this job is completed, the next visit is created as Tentative for you to confirm.' : 'Not opted in: a reminder is created instead of a follow-up visit.'}
              onChange={(v) => { if (editable) run(async () => { const { error } = await supabase.from('jobs').update({ care_opt_in: v }).eq('id', id); if (error) throw error; })(); }} />
          </Card>
        </Section>

        {reports ? (
          <Section title="Job profitability" icon="trending-up-outline" iconColor={colors.success}>
            <ProfitCard jobId={id} currency={org.currency} refreshKey={q.data} />
          </Section>
        ) : null}
        <EstimateVsActual jobId={id} />

        <Section title="Customer sign-off" icon="create-outline">
          <Card>
            {j.signed_by ? (
              <Row><Ionicons name="checkmark-circle" size={20} color={colors.success} /><T style={{ flex: 1 }}>Signed by <T style={{ fontWeight: '700' }}>{j.signed_by}</T> · {dateTime(j.signed_at)}</T></Row>
            ) : editable && ['in_progress', 'completed', 'invoiced'].includes(j.status) ? (
              <>
                <T variant="muted" style={{ marginBottom: space.sm }}>Hand the device to the pilot or owner to approve the completed work.</T>
                <Button kind="secondary" icon="create-outline" title="Capture signature" onPress={() => setSigning(true)} />
              </>
            ) : <T variant="muted">Not signed yet. The customer signs once the work is done.</T>}
            {j.rating ? <T style={{ marginTop: space.sm, color: j.rating <= 3 ? colors.danger : colors.accent }}>{'★'.repeat(j.rating)}{'☆'.repeat(5 - j.rating)} <T>{j.feedback ?? ''}</T></T> : null}
          </Card>
        </Section>

        <Section title="Notes & activity" icon="chatbox-ellipses-outline" action={editable ? <Button small kind="ghost" icon="add" title="Note" onPress={() => setNoteSheet(true)} /> : null}>
          {activity.length ? activity.map((a) => (
            <Card key={a.id} style={{ padding: space.md }}>
              <Row style={{ justifyContent: 'space-between' }}><Badge label={a.kind} /><T variant="small">{relative(a.created_at)}</T></Row>
              <T style={{ marginTop: 4 }}>{a.body}</T>
            </Card>
          )) : <Card><T variant="muted">No activity yet.</T></Card>}
        </Section>

        {manager ? (
          <Row style={{ marginTop: space.lg, flexWrap: 'wrap' }}>
            {!['cancelled', 'invoiced', 'completed'].includes(j.status) ? <Button small kind="ghost" title="Cancel job" onPress={() => confirmAction('Cancel job?', 'The job stays on record as cancelled.', () => setStatus('cancelled'))} /> : null}
            {perm('delete_records') ? <Button small kind="ghost" icon="trash-outline" title="Delete" onPress={() => confirmAction('Delete job?', 'Photos, checklist and time links are removed.', async () => {
              const { error } = await supabase.from('jobs').delete().eq('id', id);
              if (error) notify('Could not delete', friendlyError(error.message)); else router.back();
            }, true)} /> : null}
          </Row>
        ) : null}
      </ScrollView>

      {footer ? <SafeAreaView edges={['bottom']} style={{ padding: space.lg, paddingBottom: space.sm, backgroundColor: colors.bg }}>{footer}</SafeAreaView> : null}

      <PhotoViewer photo={viewer} onClose={() => setViewer(null)} />

      <DamageSheet visible={damageSheet} onClose={() => setDamageSheet(false)} onSave={async (desc, photo) => { await addPhoto('damage', desc, photo); }} />

      <AssessPhotosSheet visible={assessOpen} onClose={() => { setAssessOpen(false); q.reload(); }} jobId={id} aircraftId={j.aircraft_id} customerId={j.customer_id} />

      <GuideStepSheet item={stepItem} onClose={() => setStepItem(null)} onToggle={editable && stepItem ? toggleStep(stepItem) : undefined} />

      <ScheduleSheet visible={!!scheduleSheet} jobId={id} confirm={!!scheduleSheet?.confirm} categories={categories}
        title={scheduleSheet?.confirm ? 'Confirm job' : 'Time, crew & resources'} onClose={() => setScheduleSheet(null)} onSaved={q.reload} />

      <SignOffModal visible={signing} subtitle={[j.aircraft?.tail_number, j.title].filter(Boolean).join(' · ')}
        signer={signer} setSigner={setSigner} stars={stars} setStars={setStars} feedback={feedback} setFeedback={setFeedback}
        onClose={() => setSigning(false)}
        onSave={async (svg) => {
          if (signer.trim().length < 2) return notify('Name required', 'Enter the name of the person signing.');
          const { error } = await supabase.from('jobs').update({ signed_by: signer.trim(), signature_svg: svg, signed_at: new Date().toISOString(), rating: stars || null, feedback: feedback.trim() || null }).eq('id', id);
          if (error) return notify('Could not save', friendlyError(error.message));
          setSigning(false);
          q.reload();
        }} />

      <FormSheet visible={supplySheet} title="Log supplies used" onClose={() => setSupplySheet(false)}
        fields={[
          { key: 'item_id', label: 'Product', type: 'select', options: inventory.map((i) => ({ value: i.id, label: i.name, hint: `${Number(i.quantity)} ${i.unit} on hand` })), required: true },
          { key: 'qty', label: 'Amount used', type: 'number', required: true, placeholder: '1', hint: 'Decimals are fine, e.g. 0.25 (in the product\'s unit).' },
        ]}
        initial={{ qty: '1' }}
        onSubmit={async (v) => {
          const n = Math.round(Number(String(v.qty).replace(',', '.')) * 1000) / 1000;
          if (!Number.isFinite(n) || n <= 0) throw new Error('Enter how much you used, e.g. 1 or 0.25.');
          const { error } = await supabase.from('inventory_movements').insert({ org_id: orgId, item_id: v.item_id, delta: -n, reason: 'job_use', job_id: id, created_by: uid });
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
    </View>
  );
}

const OPEN = (s: string) => ['tentative', 'scheduled', 'in_progress', 'on_hold'].includes(s);

function SignOffModal({ visible, subtitle, signer, setSigner, stars, setStars, feedback, setFeedback, onClose, onSave }: {
  visible: boolean; subtitle: string; signer: string; setSigner: (s: string) => void; stars: number; setStars: (n: number) => void;
  feedback: string; setFeedback: (s: string) => void; onClose: () => void; onSave: (svg: string) => void;
}) {
  return (
    <ModalSheet visible={visible} onClose={onClose}>
      <T variant="h2" style={{ marginBottom: space.sm }}>Approve completed work</T>
      <T variant="muted" style={{ marginBottom: space.md }}>{subtitle}</T>
      <Field label="Full name" value={signer} onChangeText={setSigner} placeholder="Pilot / owner name" />
      <T variant="small" style={{ fontWeight: '600', color: colors.text, marginBottom: 6 }}>How did we do? (optional)</T>
      <Row style={{ marginBottom: space.md }}>
        {[1, 2, 3, 4, 5].map((n) => (
          <Pressable key={n} onPress={() => setStars(n)} hitSlop={6} accessibilityLabel={`${n} star${n === 1 ? '' : 's'}`}>
            <Ionicons name={n <= stars ? 'star' : 'star-outline'} size={30} color={colors.accent} />
          </Pressable>
        ))}
      </Row>
      <Field placeholder="Comments (optional)" value={feedback} onChangeText={setFeedback} />
      <SignaturePad onCancel={onClose} onSave={onSave} />
    </ModalSheet>
  );
}

function ModalSheet({ visible, onClose, children }: { visible: boolean; onClose: () => void; children: ReactNode }) {
  return (
    <SheetModal visible={visible} onClose={onClose}>
      <ScrollView contentContainerStyle={{ padding: space.lg }} keyboardShouldPersistTaps="handled">{children}</ScrollView>
    </SheetModal>
  );
}

import { format } from 'date-fns';
import { router, Stack } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Image, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AssessmentCard } from '../../components/ai/AssessmentCard';
import { DateTimeField } from '../../components/DateTimeField';
import { notify } from '../../components/FormSheet';
import { ConflictList, useSaveRules } from '../../components/jobs/ScheduleEditor';
import { Avatar, Badge, Button, Card, EmptyState, ErrorBanner, Loading, Row, Screen, Segmented, SheetModal, T } from '../../components/ui';
import { ask, fetchConflicts, EMPTY_SCHEDULE, localScheduleProblems } from '../../lib/conflicts';
import { quoteFromAssessment } from '../../lib/assess';
import { signedUrls } from '../../lib/files';
import { dateTime, initials, relative } from '../../lib/format';
import { skillScore } from '../../lib/jobs';
import { useLookups } from '../../lib/lookups';
import { isManager } from '../../lib/plans';
import { useOrg } from '../../lib/session';
import { friendlyError, supabase } from '../../lib/supabase';
import { colors, radius, space } from '../../lib/theme';
import type { BookingRequest, ConditionAssessment, Conflict } from '../../lib/types';
import { useQuery } from '../../lib/useQuery';

type Req = BookingRequest & {
  result_job_id: string | null;
  customer: { name: string; phone: string | null; email: string | null } | null;
  aircraft: { tail_number: string; manufacturer: string | null; model: string | null; home_location_id: string | null } | null;
  job: { number: string; scheduled_start: string | null; scheduled_end: string | null; location_id: string | null } | null;
  quote: { number: string } | null;
};

const KIND_LABEL: Record<string, string> = { booking: 'New booking', reschedule: 'Reschedule', quote_dates: 'Accepted quote — dates', photo_quote: 'Quote from photos' };

/** Customer booking / reschedule / quote-date requests waiting for approval. */
export default function Requests() {
  const { org, orgId, role, perm, branchId } = useOrg();
  const lk = useLookups();
  const [tab, setTab] = useState<'pending' | 'handled'>('pending');
  const [approving, setApproving] = useState<Req | null>(null);
  const [viewer, setViewer] = useState<string | null>(null);

  const q = useQuery(async () => {
    const { data, error } = await supabase.from('booking_requests')
      .select('*, customer:customers(name, phone, email), aircraft:aircraft(tail_number, manufacturer, model, home_location_id), job:jobs!booking_requests_job_id_fkey(number, scheduled_start, scheduled_end, location_id), quote:quotes(number)')
      .eq('org_id', orgId).order('created_at', { ascending: false }).limit(200);
    if (error) throw error;
    const rows = (data ?? []) as unknown as Req[];
    const sids = [...new Set(rows.map((r) => r.service_id).filter(Boolean))] as string[];
    const menu = sids.length ? await supabase.from('service_menu').select('id, name, category, est_hours').in('id', sids) : { data: [] };
    // Quote-from-photos requests: photo links and the AI condition report.
    const photoRows = rows.filter((r) => r.kind === 'photo_quote');
    const aids = photoRows.map((r) => r.assessment_id).filter(Boolean) as string[];
    const [urls, assessments] = await Promise.all([
      signedUrls([...new Set(photoRows.flatMap((r) => r.photo_paths ?? []))]).catch(() => ({} as Record<string, string>)),
      aids.length ? supabase.from('condition_assessments').select('*').in('id', aids).then((r) => (r.data ?? []) as ConditionAssessment[]) : Promise.resolve([] as ConditionAssessment[]),
    ]);
    return {
      rows, services: (menu.data ?? []) as { id: string; name: string; category: string; est_hours: number | null }[],
      urls, assessments: Object.fromEntries(assessments.map((a) => [a.id, a])) as Record<string, ConditionAssessment>,
    };
  }, [orgId]);

  if (!isManager(role)) {
    return <Screen><Stack.Screen options={{ title: 'Booking requests' }} /><EmptyState icon="lock-closed-outline" title="Managers only" body="Owners and managers approve booking requests." /></Screen>;
  }

  const rows = q.data?.rows ?? [];
  const pending = rows.filter((r) => r.status === 'pending');
  const handled = rows.filter((r) => r.status !== 'pending').slice(0, 30);
  const svc = (id: string | null) => q.data?.services.find((s) => s.id === id);

  const decline = async (r: Req) => {
    const ok = await ask('Decline this request?', `${r.customer?.name ?? 'The customer'} can send a new request from their portal.`, 'Decline', true);
    if (!ok) return;
    const { error } = await supabase.rpc('decline_booking_request', { p_request: r.id });
    if (error) notify('Could not decline', friendlyError(error.message)); else q.reload();
  };

  const createQuote = async (r: Req) => {
    try {
      const a = r.assessment_id ? q.data?.assessments[r.assessment_id] ?? null : null;
      const aircraft = r.aircraft_id ? lk.aircraft.find((x) => x.id === r.aircraft_id) ?? null : null;
      const quoteId = await quoteFromAssessment({
        org, assessment: a?.status === 'done' ? a : null, customerId: r.customer_id, aircraft, services: lk.services, branchId,
      });
      const { error } = await supabase.rpc('link_request_quote', { p_request: r.id, p_quote: quoteId });
      if (error) console.warn('link_request_quote failed', error.message);
      q.reload();
      router.push({ pathname: '/quotes/edit', params: { id: quoteId } });
    } catch (e: any) {
      notify('Could not create the quote', friendlyError(e.message));
    }
  };

  const list = tab === 'pending' ? pending : handled;
  return (
    <Screen refreshing={q.refreshing} onRefresh={q.refresh}>
      <Stack.Screen options={{ title: 'Booking requests' }} />
      <T variant="muted" style={{ marginBottom: space.md }}>Requests from the customer portal and accepted quotes. Approving creates (or moves) the job — conflict-checked.</T>
      <Segmented value={tab} onChange={setTab} options={[{ value: 'pending', label: 'Waiting', count: pending.length }, { value: 'handled', label: 'Handled', count: handled.length }]} />
      <ErrorBanner message={q.error} onRetry={q.reload} />
      {q.loading && !q.data ? <Loading /> : !list.length ? (
        <EmptyState icon="mail-open-outline" title={tab === 'pending' ? 'No requests waiting' : 'Nothing handled yet'}
          body={tab === 'pending' ? 'When customers ask for a visit or a new time in their portal, it shows up here.' : undefined} />
      ) : list.map((r) => {
        const s = svc(r.service_id);
        return (
          <Card key={r.id}>
            <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <View style={{ flex: 1 }}>
                <T style={{ fontWeight: '700', fontSize: 17 }}>{r.customer?.name ?? 'Customer'}</T>
                <T variant="muted">{[r.aircraft?.tail_number, [r.aircraft?.manufacturer, r.aircraft?.model].filter(Boolean).join(' ')].filter(Boolean).join(' · ') || 'No asset chosen'}</T>
              </View>
              <View style={{ alignItems: 'flex-end', gap: 4 }}>
                <Badge label={KIND_LABEL[r.kind] ?? r.kind} tone={r.kind === 'reschedule' ? 'warning' : r.kind === 'quote_dates' ? 'purple' : 'info'} raw />
                {r.status !== 'pending' ? <Badge label={r.status} tone={r.status === 'approved' ? 'success' : 'danger'} /> : null}
              </View>
            </Row>
            {s ? <T style={{ marginTop: space.sm }}>Service: {s.name}</T> : null}
            {r.quote ? <T variant="small">From quote {r.quote.number}</T> : null}
            {r.job ? <T variant="small">Job {r.job.number}{r.job.scheduled_start ? ` · now ${dateTime(r.job.scheduled_start)}` : ''}</T> : null}
            {r.kind === 'photo_quote' ? (
              <PhotoQuoteDetails r={r} urls={q.data?.urls ?? {}} assessment={r.assessment_id ? q.data?.assessments[r.assessment_id] ?? null : null} onOpen={setViewer} />
            ) : r.preferred?.length ? (
              <View style={{ marginTop: space.sm }}>
                <T variant="small" style={{ fontWeight: '600' }}>Preferred times</T>
                {r.preferred.map((p, i) => <T key={i} variant="muted">{i + 1}. {format(new Date(p), 'EEE, MMM d · h:mm a')}</T>)}
              </View>
            ) : <T variant="small" style={{ marginTop: space.sm }}>No preferred times given.</T>}
            {r.notes ? <T style={{ marginTop: space.sm, fontStyle: 'italic' }}>“{r.notes}”</T> : null}
            <T variant="small" style={{ marginTop: 6 }}>Received {relative(r.created_at)}</T>
            {r.status === 'pending' && r.kind === 'photo_quote' ? (
              <Row style={{ marginTop: space.md }}>
                <Button small kind="ghost" title="Decline" onPress={() => decline(r)} />
                {perm('see_prices') ? <Button small icon="document-text-outline" title="Create quote" onPress={() => createQuote(r)} style={{ flex: 1 }} /> : null}
              </Row>
            ) : r.status === 'pending' ? (
              <Row style={{ marginTop: space.md }}>
                <Button small kind="ghost" title="Decline" onPress={() => decline(r)} />
                <Button small icon="checkmark" title="Approve" onPress={() => setApproving(r)} style={{ flex: 1 }} />
              </Row>
            ) : r.quote_id && r.kind === 'photo_quote' && perm('see_prices') ? (
              <Button small kind="secondary" icon="document-text-outline" title="Open quote" style={{ marginTop: space.md, alignSelf: 'flex-start' }} onPress={() => router.push(`/quotes/${r.quote_id}`)} />
            ) : r.result_job_id ? (
              <Button small kind="secondary" icon="briefcase-outline" title="Open job" style={{ marginTop: space.md, alignSelf: 'flex-start' }} onPress={() => router.push(`/jobs/${r.result_job_id}`)} />
            ) : null}
          </Card>
        );
      })}
      <ApproveSheet req={approving} est={approving ? svc(approving.service_id)?.est_hours ?? null : null}
        category={approving ? svc(approving.service_id)?.category ?? null : null}
        members={lk.members} onClose={() => setApproving(null)} onDone={(jobId) => { setApproving(null); q.reload(); router.push(`/jobs/${jobId}`); }} />
      <Modal visible={!!viewer} animationType="fade" onRequestClose={() => setViewer(null)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: '#000' }}>
          <Row style={{ justifyContent: 'flex-end', padding: space.md }}>
            <Button small kind="secondary" title="Close" onPress={() => setViewer(null)} />
          </Row>
          {viewer ? <Image source={{ uri: viewer }} style={{ flex: 1 }} resizeMode="contain" /> : null}
        </SafeAreaView>
      </Modal>
    </Screen>
  );
}

function PhotoQuoteDetails({ r, urls, assessment, onOpen }: {
  r: Req; urls: Record<string, string>; assessment: ConditionAssessment | null; onOpen: (url: string) => void;
}) {
  const paths = r.photo_paths ?? [];
  return (
    <View style={{ marginTop: space.sm }}>
      {paths.length ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm, marginBottom: space.sm }}>
          {paths.map((p) => {
            const u = urls[p];
            return (
              <Pressable key={p} disabled={!u} onPress={() => u && onOpen(u)} accessibilityRole="imagebutton" accessibilityLabel="Open photo">
                {u ? <Image source={{ uri: u }} style={{ width: 104, height: 84, borderRadius: radius.md }} resizeMode="cover" />
                  : <View style={{ width: 104, height: 84, borderRadius: radius.md, backgroundColor: colors.cardRaised }} />}
              </Pressable>
            );
          })}
        </ScrollView>
      ) : null}
      {assessment ? (
        <View style={{ padding: space.md, borderRadius: radius.md, backgroundColor: colors.bgDeep }}>
          <AssessmentCard assessment={assessment} bare />
        </View>
      ) : (
        <T variant="small">{r.assessment_id ? 'Condition report not available.' : 'The condition report is on its way. Pull down to refresh.'}</T>
      )}
    </View>
  );
}

function ApproveSheet({ req, est, category, members, onClose, onDone }: {
  req: Req | null; est: number | null; category: string | null;
  members: { user_id: string; display_name: string | null; color: string | null; skills: string[]; role: string }[];
  onClose: () => void; onDone: (jobId: string) => void;
}) {
  const { orgId } = useOrg();
  const [start, setStart] = useState<string | null>(null);
  const [end, setEnd] = useState<string | null>(null);
  const [crew, setCrew] = useState<string[]>([]);
  const [initFor, setInitFor] = useState<string | null>(null);
  const [conflicts, setConflicts] = useState<Conflict[]>([]);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const rules = useSaveRules(conflicts, checking);

  // Prefill from the first preferred time (or the job's current time).
  if (req && initFor !== req.id) {
    setInitFor(req.id);
    const first = req.preferred?.[0] ?? req.job?.scheduled_start ?? null;
    const len = req.job?.scheduled_start && req.job?.scheduled_end
      ? new Date(req.job.scheduled_end).getTime() - new Date(req.job.scheduled_start).getTime()
      : Math.min(24, Math.max(1, Number(est) || 2)) * 3600e3;
    setStart(first);
    setEnd(first ? new Date(new Date(first).getTime() + len).toISOString() : null);
    setCrew([]);
    setError(null);
    setConflicts([]);
  }

  const locationId = req?.job?.location_id ?? req?.aircraft?.home_location_id ?? null;
  const key = JSON.stringify([req?.id, start, end, crew]);
  const alive = useRef(true);
  useEffect(() => {
    if (!req) return;
    alive.current = true;
    const t = setTimeout(async () => {
      setChecking(true);
      try {
        const v = { ...EMPTY_SCHEDULE, start, end, primary: crew[0] ?? null, crew: crew.slice(1) };
        const local = localScheduleProblems(v);
        const list = local ? [{ type: 'invalid', message: local }] : await fetchConflicts({ orgId, jobId: req.job_id, value: v, locationId });
        if (alive.current) setConflicts(list);
      } catch (e: any) {
        if (alive.current) setError(e.message);
      } finally {
        if (alive.current) setChecking(false);
      }
    }, 450);
    return () => { alive.current = false; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const sorted = [...members].filter((m) => m.role !== 'viewer')
    .map((m) => ({ ...m, score: category ? skillScore(m.skills, [category]) : 0 }))
    .sort((a, b) => b.score - a.score || (a.display_name ?? '').localeCompare(b.display_name ?? ''));

  const approve = async () => {
    if (!req) return;
    setError(null);
    if (!start || !end) return setError('Choose a start and end time.');
    if (rules.needsOverride) {
      const ok = await ask('Override conflicts?', `${conflicts.map((c) => '• ' + c.message).join('\n')}\n\nApprove anyway? The override is recorded on the job.`, 'Override and approve', true);
      if (!ok) return;
    }
    const { data, error: e } = await supabase.rpc('approve_booking_request', { p_request: req.id, p_start: start, p_end: end, p_crew: crew, p_override: rules.needsOverride });
    if (e) return setError(friendlyError(e.message));
    onDone(data as string);
  };

  return (
    <SheetModal visible={!!req} onClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <Row style={{ padding: space.lg, justifyContent: 'space-between' }}>
          <Button small kind="ghost" title="Cancel" onPress={onClose} />
          <T variant="h3">Approve request</T>
          <View style={{ width: 70 }} />
        </Row>
        <ScrollView contentContainerStyle={{ padding: space.lg, paddingBottom: 140 }} keyboardShouldPersistTaps="handled">
          <ErrorBanner message={error} />
          <T style={{ fontWeight: '700', fontSize: 17 }}>{req?.customer?.name}</T>
          <T variant="muted" style={{ marginBottom: space.md }}>{req?.aircraft?.tail_number ?? ''}{req?.notes ? ` · “${req.notes}”` : ''}</T>
          {req?.preferred?.length ? (
            <Row style={{ flexWrap: 'wrap', marginBottom: space.md }}>
              {req.preferred.map((p) => {
                const on = start === p;
                return (
                  <Pressable key={p} onPress={() => { const len = start && end ? new Date(end).getTime() - new Date(start).getTime() : 2 * 3600e3; setStart(p); setEnd(new Date(new Date(p).getTime() + len).toISOString()); }}
                    style={{ paddingVertical: 8, paddingHorizontal: 12, borderRadius: radius.pill, borderWidth: 1, borderColor: on ? colors.primary : colors.borderStrong, backgroundColor: on ? colors.primarySoft : 'transparent' }}>
                    <T variant="muted" style={on ? { color: colors.primaryText } : undefined}>{format(new Date(p), 'EEE MMM d · h:mm a')}</T>
                  </Pressable>
                );
              })}
            </Row>
          ) : null}
          <DateTimeField key={`s${initFor}`} label="Start" value={start} onChange={(s) => {
            const len = start && end ? new Date(end).getTime() - new Date(start).getTime() : 2 * 3600e3;
            setStart(s); setEnd(s ? new Date(new Date(s).getTime() + len).toISOString() : end);
          }} />
          <DateTimeField key={`e${initFor}`} label="End" value={end} onChange={setEnd} />
          <T style={{ fontWeight: '600', fontSize: 15, marginBottom: 4 }}>Crew</T>
          <T variant="small" style={{ marginBottom: 8 }}>The first person you pick is the primary technician.{category ? ' Qualified techs are listed first.' : ''}</T>
          <Row style={{ flexWrap: 'wrap', marginBottom: space.lg }}>
            {sorted.map((m) => {
              const idx = crew.indexOf(m.user_id);
              const on = idx >= 0;
              return (
                <Pressable key={m.user_id} onPress={() => setCrew((c) => (on ? c.filter((x) => x !== m.user_id) : [...c, m.user_id]))}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 6, padding: 6, paddingRight: 12, borderRadius: radius.pill, backgroundColor: on ? colors.primarySoft : colors.card, borderWidth: 1, borderColor: on ? colors.primary : colors.border }}>
                  <Avatar size={24} label={initials(m.display_name)} color={m.color ?? colors.primary} />
                  <View>
                    <T style={{ fontWeight: on ? '700' : '400' }}>{m.display_name ?? 'Member'}{idx === 0 ? ' · primary' : ''}</T>
                    {m.score > 0 ? <T variant="small" style={{ color: colors.success }}>Skilled match</T> : null}
                  </View>
                </Pressable>
              );
            })}
          </Row>
          <ConflictList conflicts={conflicts} checking={checking} />
        </ScrollView>
        <SafeAreaView edges={['bottom']} style={{ padding: space.lg, paddingBottom: space.sm, borderTopWidth: 1, borderTopColor: colors.border }}>
          {rules.message ? <T variant="small" style={{ marginBottom: 8, color: rules.blocked ? colors.danger : colors.warning }}>{rules.message}</T> : null}
          <Button title={rules.needsOverride ? 'Override and approve' : 'Approve & schedule'} kind={rules.needsOverride ? 'danger' : 'primary'}
            icon="checkmark" disabled={rules.blocked || checking || !start || !end} onPress={approve} />
        </SafeAreaView>
      </KeyboardAvoidingView>
    </SheetModal>
  );
}

import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { Image, Pressable, View } from 'react-native';
import { ResolveToken } from '../../../components/equipment/ResolveToken';
import { ReportProblemSheet, ServiceLogSheet } from '../../../components/equipment/Sheets';
import { confirmAction, FormSheet, notify, type FieldDef } from '../../../components/FormSheet';
import { Badge, Button, Card, ErrorBanner, IconButton, IconTile, KeyValue, ListRow, Loading, Row, Screen, Section, T } from '../../../components/ui';
import { date, money, relative } from '../../../lib/format';
import { pickImage, removeFile, signedUrls, uploadImage } from '../../../lib/files';
import {
  daysLabel, daysUntil, EQUIPMENT_STATUS, FILE_KINDS, fmtNum, maintenanceState, openStorageFile, pickAndUploadDocument, todayIso,
  UUID_RE, warrantyBadge, type EquipFile, type EquipFileKind, type EquipIssue, type Equipment, type MaintenanceDue, type ServiceLog,
} from '../../../lib/inventory';
import { useLookups } from '../../../lib/lookups';
import { canEdit, isManager } from '../../../lib/plans';
import { useOrg } from '../../../lib/session';
import { friendlyError, must, supabase } from '../../../lib/supabase';
import { colors, radius, space } from '../../../lib/theme';
import { useQuery } from '../../../lib/useQuery';

/**
 * Equipment detail. Also accepts a QR token in place of the id, so the deep
 * link tarmo://equipment/<qr_token> (which routes here) resolves too.
 */
export default function EquipmentRoute() {
  const { id, from } = useLocalSearchParams<{ id: string; from?: string }>();
  if (id && !UUID_RE.test(id)) return <ResolveToken token={id} />;
  return <EquipmentDetail id={id} fromQr={from === 'qr'} />;
}

type FileRow = EquipFile & { url?: string };
type IssueRow = EquipIssue & { url?: string };

function EquipmentDetail({ id, fromQr }: { id: string; fromQr: boolean }) {
  const { orgId, role, perm, can, session } = useOrg();
  const { memberName, locations, branches } = useLookups();
  const showMoney = perm('see_prices');
  const manager = isManager(role);
  const writable = canEdit(role);
  const me = session?.user.id ?? '';
  const [reporting, setReporting] = useState(false);
  const [logging, setLogging] = useState<{ maintenanceId: string | null } | null>(null);
  const [schedule, setSchedule] = useState<Partial<MaintenanceDue> | null>(null);
  const [hoursOpen, setHoursOpen] = useState(false);
  const [pendingFile, setPendingFile] = useState<{ path: string; name: string; mime: string } | null>(null);
  const [showResolved, setShowResolved] = useState(false);
  const [busy, setBusy] = useState(false);
  const fileSaved = useRef(false);
  const [error, setError] = useState<string | null>(null);

  const q = useQuery(async () => {
    const [eq, due, log, files, issues] = await Promise.all([
      must(supabase.from('equipment').select('*').eq('id', id).single()),
      must(supabase.from('equipment_maintenance_due').select('*').eq('equipment_id', id).order('name')),
      must(supabase.from('equipment_service_log').select('*').eq('equipment_id', id).order('performed_on', { ascending: false }).order('created_at', { ascending: false })),
      must(supabase.from('equipment_files').select('*').eq('equipment_id', id).order('created_at', { ascending: false })),
      must(supabase.from('equipment_issues').select('*').eq('equipment_id', id).order('created_at', { ascending: false })),
    ]);
    const e = eq as Equipment;
    const f = (files ?? []) as FileRow[];
    const iss = (issues ?? []) as IssueRow[];
    const imagePaths = [e.photo_path, ...f.filter((x) => x.kind === 'photo').map((x) => x.storage_path), ...iss.map((x) => x.photo_path)].filter(Boolean) as string[];
    const urls = await signedUrls([...new Set(imagePaths)]).catch(() => ({} as Record<string, string>));
    return {
      eq: e,
      photoUrl: e.photo_path ? urls[e.photo_path] ?? null : null,
      due: (due ?? []) as MaintenanceDue[],
      log: (log ?? []) as ServiceLog[],
      files: f.map((x) => ({ ...x, url: urls[x.storage_path] })),
      issues: iss.map((x) => ({ ...x, url: x.photo_path ? urls[x.photo_path] : undefined })),
    };
  }, [id]);

  if (!q.data) {
    return (
      <Screen>
        <Stack.Screen options={{ title: 'Equipment' }} />
        {q.error ? <ErrorBanner message={q.error} onRetry={q.reload} /> : <Loading />}
      </Screen>
    );
  }

  const { eq: e, photoUrl, due, log, files, issues } = q.data;
  const st = EQUIPMENT_STATUS[e.status] ?? EQUIPMENT_STATUS.in_service;
  const locked = e.status === 'out_of_service';
  const warranty = warrantyBadge(e.warranty_expires_on);
  const wDays = daysUntil(e.warranty_expires_on);
  const openIssues = issues.filter((i) => i.status === 'open');
  const resolvedIssues = issues.filter((i) => i.status === 'resolved');
  const mine = e.assigned_user_id === me;
  const facility = locations.find((l) => l.id === e.location_id);
  const branch = branches.find((b) => b.id === e.branch_id);
  const scheduleName = (mid: string | null) => (mid ? due.find((m) => m.id === mid)?.name ?? 'Maintenance' : null);

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try { await fn(); q.reload(); } catch (err: any) { setError(friendlyError(err.message)); } finally { setBusy(false); }
  };
  const update = (patch: Partial<Equipment>) => run(async () => {
    const { error: e2 } = await supabase.from('equipment').update(patch).eq('id', e.id);
    if (e2) throw e2;
  });

  const checkOut = () => update({ assigned_user_id: mine ? null : me });
  const toggleLock = () => {
    if (locked) update({ status: 'in_service' });
    else confirmAction('Take out of service?', 'It will be locked: nobody can book it on jobs until you put it back in service.', () => update({ status: 'out_of_service' }));
  };
  const resolve = (issue: IssueRow) => run(async () => {
    const { error: e2 } = await supabase.from('equipment_issues').update({ status: 'resolved', resolved_at: new Date().toISOString() }).eq('id', issue.id);
    if (e2) throw e2;
  });

  const addPhoto = (src: 'camera' | 'library') => run(async () => {
    const uri = await pickImage(src);
    if (!uri) return;
    const path = await uploadImage(orgId, `equipment/${e.id}`, uri);
    const { error: e2 } = await supabase.from('equipment_files').insert({ org_id: orgId, equipment_id: e.id, kind: 'photo', title: `Photo ${date(todayIso())}`, storage_path: path });
    if (e2) throw e2;
    if (!e.photo_path) await supabase.from('equipment').update({ photo_path: path }).eq('id', e.id);
  });
  const addDocument = () => run(async () => {
    const r = await pickAndUploadDocument(orgId, `equipment/${e.id}`);
    if (r) { fileSaved.current = false; setPendingFile(r); }
  });
  const deleteFile = (f: FileRow) => confirmAction('Delete this file?', f.title, () => run(async () => {
    const { error: e2 } = await supabase.from('equipment_files').delete().eq('id', f.id);
    if (e2) throw e2;
    if (e.photo_path === f.storage_path) await supabase.from('equipment').update({ photo_path: null }).eq('id', e.id);
    await removeFile(f.storage_path);
  }), true);
  const open = (path: string) => openStorageFile(path).catch((err) => notify('Could not open', friendlyError(err.message)));

  const scheduleFields: FieldDef[] = [
    { key: 'name', label: 'What needs doing', type: 'text', required: true, placeholder: 'Pump oil change, replace filters' },
    { key: 'every_days', label: 'Every (days)', type: 'number', placeholder: '90' },
    { key: 'every_hours', label: 'Every (usage hours)', type: 'number', placeholder: '250' },
    { key: 'last_done_on', label: 'Last done on', type: 'date' },
    { key: 'last_done_hours', label: 'Last done at (hours)', type: 'number' },
    { key: 'notes', label: 'Notes', type: 'multiline' },
  ];

  return (
    <Screen refreshing={q.refreshing} onRefresh={q.refresh}>
      <Stack.Screen options={{
        title: e.name,
        headerRight: () => manager ? <Button small kind="secondary" icon="create-outline" title="Edit" onPress={() => router.push({ pathname: '/equipment/edit', params: { id: e.id } })} /> : null,
      }} />
      <ErrorBanner message={error ?? q.error} onRetry={q.error ? q.reload : undefined} />

      {photoUrl ? (
        <Pressable onPress={() => open(e.photo_path!)}>
          <Image source={{ uri: photoUrl }} style={{ width: '100%', height: 200, borderRadius: radius.lg, marginBottom: space.md, backgroundColor: colors.card }} resizeMode="cover" />
        </Pressable>
      ) : null}

      {locked ? (
        <Card style={{ borderColor: colors.danger, backgroundColor: colors.dangerSoft }}>
          <Row gap={space.md}>
            <IconTile icon="lock-closed" tone="danger" />
            <View style={{ flex: 1 }}>
              <T style={{ fontWeight: '800', color: colors.danger }}>Out of service — locked</T>
              <T variant="muted">It can&apos;t be booked on jobs until it is back in service.</T>
            </View>
          </Row>
        </Card>
      ) : null}

      <Card>
        <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }} gap={space.md}>
          <View style={{ flex: 1 }}>
            <T variant="h3">{e.name}</T>
            <T variant="muted">{[e.category, e.serial_number ? `S/N ${e.serial_number}` : null].filter(Boolean).join(' · ') || 'Equipment'}</T>
          </View>
          <Badge label={st.label} tone={st.tone} large raw />
        </Row>
        <Row gap={4} style={{ marginTop: space.md, flexWrap: 'wrap' }}>
          <Badge label={`${fmtNum(e.usage_hours)} h`} tone="neutral" raw />
          {e.bookable ? <Badge label="Bookable" tone="info" raw /> : <Badge label="Not bookable" tone="neutral" raw />}
          {openIssues.length ? <Badge label={`${openIssues.length} open problem${openIssues.length === 1 ? '' : 's'}`} tone="danger" raw /> : null}
          {warranty ? <Badge label={warranty.label} tone={warranty.tone} raw /> : null}
        </Row>
      </Card>

      <Card style={fromQr ? { borderColor: colors.primary } : undefined}>
        {fromQr ? <T variant="overline" style={{ marginBottom: space.sm }}>Scanned label · quick actions</T> : null}
        <Row gap={space.sm} style={{ flexWrap: 'wrap' }}>
          <Button small kind="danger" icon="warning-outline" title="Report problem" onPress={() => setReporting(true)} />
          {writable ? <Button small kind="secondary" icon={mine ? 'return-down-back-outline' : 'hand-left-outline'} title={mine ? 'Return' : 'Check out to me'} loading={busy} onPress={checkOut} /> : null}
          {writable ? <Button small kind="secondary" icon="speedometer-outline" title="Update hours" onPress={() => setHoursOpen(true)} /> : null}
          {manager ? <Button small kind="secondary" icon="build-outline" title="Log service" onPress={() => setLogging({ maintenanceId: null })} /> : null}
          {manager ? <Button small kind={locked ? 'primary' : 'secondary'} icon={locked ? 'lock-open-outline' : 'lock-closed-outline'} title={locked ? 'Back in service' : 'Out of service'} onPress={toggleLock} /> : null}
          <Button small kind="ghost" icon="qr-code-outline" title="QR label" onPress={() => router.push({ pathname: '/equipment/label', params: { id: e.id } })} />
        </Row>
      </Card>

      {openIssues.length || resolvedIssues.length ? (
        <Section title="Problems" icon="alert-circle-outline" iconColor={colors.danger}
          action={resolvedIssues.length ? <Button small kind="ghost" title={showResolved ? 'Hide resolved' : `Resolved (${resolvedIssues.length})`} onPress={() => setShowResolved((v) => !v)} /> : undefined}>
          {openIssues.length === 0 ? <Card><T variant="muted">No open problems.</T></Card> : null}
          {[...openIssues, ...(showResolved ? resolvedIssues : [])].map((i) => (
            <Card key={i.id} style={{ padding: space.md }}>
              <Row gap={space.md} style={{ alignItems: 'flex-start' }}>
                {i.url ? (
                  <Pressable onPress={() => open(i.photo_path!)}>
                    <Image source={{ uri: i.url }} style={{ width: 64, height: 64, borderRadius: radius.md, backgroundColor: colors.cardRaised }} />
                  </Pressable>
                ) : <IconTile icon="warning-outline" tone={i.status === 'open' ? 'danger' : 'neutral'} />}
                <View style={{ flex: 1 }}>
                  <T>{i.description}</T>
                  <T variant="small">{`${i.reported_by ? memberName(i.reported_by) : 'Someone'} · ${relative(i.created_at)}${i.status === 'resolved' && i.resolved_at ? ` · resolved ${relative(i.resolved_at)}` : ''}`}</T>
                </View>
                {i.status === 'open' && manager ? <Button small kind="secondary" title="Resolve" onPress={() => resolve(i)} /> : i.status === 'resolved' ? <Badge label="Resolved" tone="success" raw /> : null}
              </Row>
            </Card>
          ))}
        </Section>
      ) : null}

      <Section title="Maintenance schedule" icon="build-outline"
        action={manager ? <Button small kind="ghost" icon="add" title="Add" onPress={() => setSchedule({})} /> : undefined}>
        {due.length === 0 ? (
          <Card><T variant="muted">{manager ? 'Add what needs doing and how often — by days, usage hours, or both. We flag it when it is due.' : 'No maintenance schedule yet.'}</T></Card>
        ) : due.map((m) => {
          const s = maintenanceState(m, Number(e.usage_hours));
          const tone = s.state === 'overdue' ? 'danger' : s.state === 'soon' ? 'warning' : 'success';
          const every = [m.every_days ? `every ${m.every_days} days` : null, m.every_hours ? `every ${fmtNum(m.every_hours)} h` : null].filter(Boolean).join(' or ');
          return (
            <Card key={m.id} style={{ padding: space.md }} onPress={manager ? () => setSchedule(m) : undefined}>
              <Row gap={space.md}>
                <IconTile icon="build-outline" tone={tone} />
                <View style={{ flex: 1 }}>
                  <T style={{ fontWeight: '700' }}>{m.name}</T>
                  <T variant="small">{`${every}${m.last_done_on ? ` · last ${date(m.last_done_on)}` : ''}${m.last_done_hours != null ? ` at ${fmtNum(m.last_done_hours)} h` : ''}`}</T>
                  <T variant="small" style={{ color: tone === 'success' ? colors.textMuted : tone === 'danger' ? colors.danger : colors.warning }}>{s.label}</T>
                </View>
                {manager ? <Button small kind={s.state === 'ok' ? 'secondary' : 'primary'} title="Done" onPress={() => setLogging({ maintenanceId: m.id })} /> : <Badge label={s.state === 'overdue' ? 'Overdue' : s.state === 'soon' ? 'Due soon' : 'OK'} tone={tone} raw />}
              </Row>
            </Card>
          );
        })}
      </Section>

      <Section title="Service history" icon="time-outline" count={log.length ? String(log.length) : undefined}>
        {log.length === 0 ? <Card><T variant="muted">No service logged yet.{manager ? ' Use “Log service” after any maintenance or repair.' : ''}</T></Card> : (
          <View style={{ borderRadius: radius.md, overflow: 'hidden' }}>
            {log.map((l) => (
              <ListRow key={l.id} icon={l.receipt_path ? 'receipt-outline' : 'build-outline'} tone="primary"
                title={scheduleName(l.maintenance_id) ?? (l.notes?.split('\n')[0] || 'Service')}
                subtitle={[l.vendor, scheduleName(l.maintenance_id) ? l.notes : null].filter(Boolean).join(' · ') || null}
                meta={[date(l.performed_on), l.hours_at != null ? `${fmtNum(l.hours_at)} h` : null, showMoney && Number(l.cost) ? `${money(l.cost)}${l.expense_id ? ' · in expenses' : ''}` : null, l.created_by ? memberName(l.created_by) : null].filter(Boolean).join(' · ')}
                right={l.receipt_path ? <Button small kind="ghost" icon="receipt-outline" title="Receipt" onPress={() => open(l.receipt_path!)} /> : undefined} />
            ))}
          </View>
        )}
        {showMoney && log.some((l) => Number(l.cost) > 0) ? (
          <T variant="small" style={{ marginTop: space.sm }}>{`Total spent: ${money(log.reduce((s, l) => s + Number(l.cost || 0), 0))}. Service costs are booked as Repairs in Business expenses automatically.`}</T>
        ) : null}
      </Section>

      <Section title="Assignment" icon="person-outline">
        <Card>
          <KeyValue label="Person" value={e.assigned_user_id ? memberName(e.assigned_user_id) + (mine ? ' (you)' : '') : 'Nobody'} />
          <KeyValue label="Van / hangar" value={e.assigned_label} />
          <KeyValue label="Facility" value={facility ? [facility.airport_code, facility.name].filter(Boolean).join(' · ') : null} />
          {can('branches') ? <KeyValue label="Branch" value={branch?.name} /> : null}
        </Card>
      </Section>

      <Section title="Details" icon="information-circle-outline">
        <Card>
          <KeyValue label="Usage hours" value={`${fmtNum(e.usage_hours)} h`} />
          <KeyValue label="Last serviced" value={e.last_serviced_on ? date(e.last_serviced_on) : null} />
          <KeyValue label="Purchased" value={e.purchased_on ? date(e.purchased_on) : null} />
          {showMoney ? <KeyValue label="Purchase cost" value={e.purchase_cost != null ? money(e.purchase_cost) : null} /> : null}
          <KeyValue label="Warranty" value={e.warranty_expires_on ? `${date(e.warranty_expires_on)}${wDays != null ? (wDays < 0 ? ' (expired)' : ` (expires ${daysLabel(wDays)})`) : ''}` : null} />
          <KeyValue label="Notes" value={e.notes} />
          {warranty && wDays != null && wDays >= 0 ? <T variant="small" style={{ marginTop: space.sm, color: colors.warning }}>We&apos;ll send a reminder before the warranty runs out.</T> : null}
        </Card>
      </Section>

      <Section title="Photos & documents" icon="folder-open-outline">
        {manager ? (
          <Row gap={space.sm} style={{ flexWrap: 'wrap', marginBottom: space.md }}>
            <Button small kind="secondary" icon="camera-outline" title="Take photo" onPress={() => addPhoto('camera')} />
            <Button small kind="secondary" icon="images-outline" title="Add photo" onPress={() => addPhoto('library')} />
            <Button small kind="secondary" icon="document-attach-outline" title="Add manual / warranty / receipt" onPress={addDocument} />
          </Row>
        ) : null}
        {files.length === 0 ? <Card><T variant="muted">No files yet. Keep manuals, warranty papers, receipts and photos here.</T></Card> : (
          <>
            {files.some((f) => f.kind === 'photo' && f.url) ? (
              <Row gap={space.sm} style={{ flexWrap: 'wrap', marginBottom: space.md }}>
                {files.filter((f) => f.kind === 'photo' && f.url).map((f) => (
                  <Pressable key={f.id} onPress={() => open(f.storage_path)} onLongPress={manager ? () => deleteFile(f) : undefined}>
                    <Image source={{ uri: f.url }} style={{ width: 96, height: 96, borderRadius: radius.md, backgroundColor: colors.card }} />
                  </Pressable>
                ))}
              </Row>
            ) : null}
            <View style={{ borderRadius: radius.md, overflow: 'hidden' }}>
              {files.filter((f) => f.kind !== 'photo').map((f) => (
                <ListRow key={f.id} icon={f.kind === 'manual' ? 'book-outline' : f.kind === 'warranty' ? 'shield-checkmark-outline' : f.kind === 'receipt' ? 'receipt-outline' : 'document-outline'}
                  title={f.title} subtitle={FILE_KINDS.find((k) => k.value === f.kind)?.label} meta={date(f.created_at)}
                  onPress={() => open(f.storage_path)}
                  right={manager ? <IconButton icon="trash-outline" color={colors.textMuted} label="Delete file" onPress={() => deleteFile(f)} /> : undefined} />
              ))}
            </View>
            {manager && files.some((f) => f.kind === 'photo') ? <T variant="small" style={{ marginTop: space.sm }}>Press and hold a photo to delete it.</T> : null}
          </>
        )}
      </Section>

      <ReportProblemSheet visible={reporting} equipment={e} orgId={orgId} userId={me} onClose={() => setReporting(false)}
        onDone={() => { q.reload(); notify('Problem reported', 'Thanks — the office has been alerted.'); }} />
      <ServiceLogSheet visible={!!logging} equipment={e} orgId={orgId} schedules={due} showMoney={showMoney}
        presetMaintenanceId={logging?.maintenanceId} onClose={() => setLogging(null)} onDone={q.reload} />
      <FormSheet
        visible={hoursOpen}
        title="Update usage hours"
        initial={{ usage_hours: fmtNum(e.usage_hours) }}
        fields={[{ key: 'usage_hours', label: 'Hour meter reading', type: 'number', required: true, hint: `Currently ${fmtNum(e.usage_hours)} h. Hour-based maintenance is calculated from this.` }]}
        onClose={() => setHoursOpen(false)}
        onSubmit={async (v) => {
          const h = Number(v.usage_hours);
          if (!Number.isFinite(h) || h < 0) throw new Error('Enter the hour meter reading');
          if (h < Number(e.usage_hours) && !manager) throw new Error('The reading can’t go down. Ask a manager if the meter was replaced.');
          const { error: e2 } = await supabase.from('equipment').update({ usage_hours: Math.round(h * 10) / 10 }).eq('id', e.id);
          if (e2) throw e2;
          q.reload();
        }}
      />
      <FormSheet
        visible={!!schedule}
        title={schedule?.id ? 'Edit maintenance' : 'New maintenance'}
        initial={schedule ? {
          name: schedule.name ?? '', every_days: schedule.every_days ?? '', every_hours: schedule.every_hours ?? '',
          last_done_on: schedule.last_done_on ?? null, last_done_hours: schedule.last_done_hours ?? '', notes: schedule.notes ?? '',
        } : {}}
        fields={scheduleFields}
        onClose={() => setSchedule(null)}
        onSubmit={async (v) => {
          if (!v.every_days && !v.every_hours) throw new Error('Set how often: every N days, every N hours, or both');
          if ((v.every_days != null && (v.every_days <= 0 || !Number.isInteger(v.every_days))) || (v.every_hours != null && v.every_hours <= 0)) throw new Error('Intervals must be more than zero (days are whole numbers)');
          const row = { name: v.name, every_days: v.every_days, every_hours: v.every_hours, last_done_on: v.last_done_on, last_done_hours: v.last_done_hours, notes: v.notes };
          const { error: e2 } = schedule?.id
            ? await supabase.from('equipment_maintenance').update(row).eq('id', schedule.id)
            : await supabase.from('equipment_maintenance').insert({ ...row, org_id: orgId, equipment_id: e.id });
          if (e2) throw e2;
          q.reload();
        }}
        onDelete={schedule?.id ? async () => {
          const { error: e2 } = await supabase.from('equipment_maintenance').delete().eq('id', schedule.id!);
          if (e2) throw e2;
          q.reload();
        } : undefined}
      />
      <FormSheet
        visible={!!pendingFile}
        title="Save file"
        initial={pendingFile ? { title: pendingFile.name.replace(/\.[^.]+$/, ''), kind: /warrant/i.test(pendingFile.name) ? 'warranty' : /receipt|invoice/i.test(pendingFile.name) ? 'receipt' : pendingFile.mime.startsWith('image/') ? 'photo' : 'manual' } : {}}
        fields={[
          { key: 'title', label: 'Title', type: 'text', required: true },
          { key: 'kind', label: 'Type', type: 'select', options: FILE_KINDS },
        ]}
        onClose={() => {
          if (pendingFile && !fileSaved.current) removeFile(pendingFile.path).catch(() => {});
          setPendingFile(null);
        }}
        onSubmit={async (v) => {
          if (!pendingFile) return;
          const { error: e2 } = await supabase.from('equipment_files').insert({
            org_id: orgId, equipment_id: e.id, kind: (v.kind ?? 'other') as EquipFileKind, title: v.title, storage_path: pendingFile.path,
          });
          if (e2) throw e2;
          fileSaved.current = true;
          setPendingFile(null);
          q.reload();
        }}
      />
    </Screen>
  );
}

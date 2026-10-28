import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActionSheetIOS, ActivityIndicator, Alert, Image, Modal, Platform, Pressable, ScrollView, View } from 'react-native';
import { dateTime, money } from '../../lib/format';
import { fetchGuide, pickJobPhoto, type PickedPhoto } from '../../lib/jobs';
import { useOrg } from '../../lib/session';
import { friendlyError, supabase } from '../../lib/supabase';
import { colors, radius, space, toneColors, type Tone } from '../../lib/theme';
import type { GuideStep, ServiceGuide } from '../../lib/types';
import { useQuery } from '../../lib/useQuery';
import { SignaturePad } from '../SignaturePad';
import { Badge, Button, Card, ErrorBanner, Field, Ionicons, Loading, Row, SheetModal, T } from '../ui';

/** Asks camera vs. library (camera isn't available on web). */
export function chooseSource(): Promise<'camera' | 'library' | null> {
  if (Platform.OS === 'web') return Promise.resolve('library');
  return new Promise((resolve) => {
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions({ options: ['Take Photo', 'Choose from Library', 'Cancel'], cancelButtonIndex: 2 },
        (i) => resolve(i === 0 ? 'camera' : i === 1 ? 'library' : null));
    } else {
      Alert.alert('Add photo', 'JPG, PNG or WebP, up to 10 MB.', [
        { text: 'Take Photo', onPress: () => resolve('camera') },
        { text: 'Choose from Library', onPress: () => resolve('library') },
        { text: 'Cancel', style: 'cancel', onPress: () => resolve(null) },
      ]);
    }
  });
}

export interface JobPhoto { id: string; kind: string; url?: string; caption: string | null; storage_path: string }

/** Tinted photo strip (Before = amber, After = green, Damage = red) with an "Add photo" tile. */
export function PhotoStrip({ title, tone, photos, onAdd, onView, uploading, required, hint }: {
  title: string; tone: Tone; photos: JobPhoto[]; onAdd?: () => void; onView: (p: JobPhoto) => void;
  uploading?: boolean; required?: boolean; hint?: string;
}) {
  const c = toneColors[tone];
  return (
    <View style={{ marginTop: space.md }}>
      <Row style={{ justifyContent: 'space-between', marginBottom: space.sm }}>
        <Row gap={space.sm}>
          <T style={{ color: c.fg, fontSize: 17, fontWeight: '700' }}>{title}</T>
          {required && !photos.length ? <Badge label="Required" tone="danger" raw /> : null}
        </Row>
        <T variant="muted">{photos.length} photo{photos.length === 1 ? '' : 's'}</T>
      </Row>
      {hint && !photos.length ? <T variant="small" style={{ marginBottom: 6 }}>{hint}</T> : null}
      <ScrollView horizontal showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: space.sm, padding: space.md }}
        style={{ backgroundColor: c.bg, borderRadius: radius.lg, borderWidth: 1, borderColor: c.fg + '66' }}>
        {photos.map((p) => (
          <Pressable key={p.id} onPress={() => onView(p)}>
            <Image source={{ uri: p.url }} style={{ width: 92, height: 92, borderRadius: 10, backgroundColor: colors.cardRaised }} />
          </Pressable>
        ))}
        {onAdd ? (
          <Pressable onPress={onAdd} disabled={uploading}
            style={{ width: 92, height: 92, borderRadius: 10, borderWidth: 1.5, borderStyle: 'dashed', borderColor: c.fg, alignItems: 'center', justifyContent: 'center', gap: 4 }}>
            {uploading ? <ActivityIndicator color={c.fg} /> : <Ionicons name="camera-outline" size={24} color={c.fg} />}
            <T variant="small" style={{ color: c.fg }}>{uploading ? 'Uploading' : 'Add photo'}</T>
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

/** Full-screen photo viewer with caption. */
export function PhotoViewer({ photo, onClose }: { photo: JobPhoto | null; onClose: () => void }) {
  return (
    <Modal visible={!!photo} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable onPress={onClose} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', justifyContent: 'center' }}>
        {photo?.url ? <Image source={{ uri: photo.url }} style={{ width: '100%', height: '75%' }} resizeMode="contain" /> : null}
        {photo?.caption ? <T style={{ color: colors.white, padding: space.lg, textAlign: 'center' }}>{photo.caption}</T> : null}
      </Pressable>
    </Modal>
  );
}

/** Damage documentation: description + photo, saved as a damage photo with caption. */
export function DamageSheet({ visible, onClose, onSave }: { visible: boolean; onClose: () => void; onSave: (description: string, photo: PickedPhoto) => Promise<void> }) {
  const [desc, setDesc] = useState('');
  const [photo, setPhoto] = useState<PickedPhoto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const close = () => { setDesc(''); setPhoto(null); setError(null); onClose(); };
  const pick = async () => {
    setError(null);
    try {
      const src = await chooseSource();
      if (!src) return;
      const p = await pickJobPhoto(src);
      if (p) setPhoto(p);
    } catch (e: any) { setError(e.message); }
  };
  const save = async () => {
    if (desc.trim().length < 3) return setError('Describe the damage (where it is and what it looks like).');
    if (!photo) return setError('Add a photo of the damage.');
    setBusy(true);
    try { await onSave(desc.trim(), photo); close(); } catch (e: any) { setError(friendlyError(e.message)); } finally { setBusy(false); }
  };
  return (
    <SheetModal visible={visible} onClose={close}>
      <Row style={{ padding: space.lg, justifyContent: 'space-between' }}>
        <Button small kind="ghost" title="Cancel" onPress={close} />
        <T variant="h3">Document damage</T>
        <Button small title="Save" loading={busy} onPress={save} />
      </Row>
      <ScrollView contentContainerStyle={{ padding: space.lg }} keyboardShouldPersistTaps="handled">
        <ErrorBanner message={error} />
        <T variant="muted" style={{ marginBottom: space.md }}>Record existing damage before you start (or anything found during the job). It appears on the service report.</T>
        <Field label="Description *" placeholder="e.g. 3-inch scratch on left wing leading edge, near the fuel cap" value={desc} onChangeText={setDesc} multiline />
        {photo ? (
          <View style={{ alignItems: 'center', marginBottom: space.md }}>
            <Image source={{ uri: photo.uri }} style={{ width: 220, height: 220, borderRadius: radius.md }} />
            <Button small kind="ghost" title="Replace photo" onPress={pick} />
          </View>
        ) : <Button kind="secondary" icon="camera-outline" title="Add photo *" onPress={pick} />}
      </ScrollView>
    </SheetModal>
  );
}

/** Guide step detail for a checklist item (inline sheet) with a link to the full guide. */
export function GuideStepSheet({ item, onClose, onToggle }: {
  item: { id: string; label: string; done: boolean; guide_key: string | null; step_index: number | null } | null;
  onClose: () => void; onToggle?: () => void;
}) {
  const { orgId } = useOrg();
  const q = useQuery(async () => (item?.guide_key ? fetchGuide(orgId, item.guide_key) : null), [item?.guide_key, orgId]);
  const g = q.data as ServiceGuide | null | undefined;
  const step: GuideStep | undefined = g && item?.step_index != null ? g.steps?.[item.step_index] : undefined;
  return (
    <SheetModal visible={!!item} onClose={onClose}>
      <Row style={{ padding: space.lg, justifyContent: 'space-between' }}>
        <T variant="h3" style={{ flex: 1 }} numberOfLines={1}>{g?.title ?? 'Step'}</T>
        <Button small kind="secondary" title="Done" onPress={onClose} />
      </Row>
      <ScrollView contentContainerStyle={{ padding: space.lg, paddingBottom: 60 }}>
        {q.loading ? <Loading /> : (
          <>
            {item?.step_index != null ? <T variant="overline">Step {item.step_index + 1}{g?.steps?.length ? ` of ${g.steps.length}` : ''}</T> : null}
            <T variant="h2" style={{ marginTop: 4 }}>{step?.title ?? item?.label}</T>
            {step?.detail ? <T style={{ marginTop: space.md, lineHeight: 23 }}>{step.detail}</T> : !g ? <T variant="muted" style={{ marginTop: space.md }}>No SOP is linked to this step.</T> : null}
            {step?.caution ? (
              <Card style={{ backgroundColor: colors.warningSoft, marginTop: space.lg }}>
                <Row style={{ alignItems: 'flex-start' }}>
                  <Ionicons name="warning-outline" size={20} color={colors.warning} />
                  <T style={{ flex: 1 }}>{step.caution}</T>
                </Row>
              </Card>
            ) : null}
            {g?.donts?.length ? (
              <View style={{ marginTop: space.lg }}>
                <T style={{ fontWeight: '700', marginBottom: 6 }}>Never</T>
                {g.donts.slice(0, 5).map((d, i) => <T key={i} variant="muted" style={{ marginBottom: 4 }}>• {d}</T>)}
              </View>
            ) : null}
            <T variant="small" style={{ marginTop: space.lg }}>Always follow the manufacturer&apos;s maintenance manual and use OEM-approved products.</T>
            <Row style={{ marginTop: space.lg, flexWrap: 'wrap' }}>
              {onToggle && item ? <Button icon={item.done ? 'arrow-undo-outline' : 'checkmark-circle-outline'} title={item.done ? 'Mark not done' : 'Mark done'} onPress={() => { onToggle(); onClose(); }} /> : null}
              {g ? <Button kind="secondary" icon="book-outline" title="Open full guide" onPress={() => { onClose(); router.push({ pathname: '/guides/[id]', params: { id: item?.guide_key ?? g.key, step: String(item?.step_index ?? '') } }); }} /> : null}
            </Row>
          </>
        )}
      </ScrollView>
    </SheetModal>
  );
}

/** Job profitability (only for people with "see reports"). Pass the loaded job as `refreshKey` so it updates after changes. */
export function ProfitCard({ jobId, currency, refreshKey }: { jobId: string; currency: string; refreshKey?: unknown }) {
  const q = useQuery(async () => {
    const { data, error } = await supabase.rpc('job_profitability', { p_job: jobId });
    if (error) throw new Error(friendlyError(error.message));
    return data as { revenue: number; labor: number | null; labor_minutes: number; labor_unknown_minutes: number; supplies: number | null; job_expenses: number; gross: number | null; net: number | null; margin_pct: number | null };
  }, [jobId]);
  const { reload } = q;
  const seenKey = useRef(refreshKey);
  useEffect(() => {
    if (seenKey.current === refreshKey) return;
    seenKey.current = refreshKey;
    reload();
  }, [refreshKey, reload]);
  const p = q.data;
  const fmt = (n: number | null | undefined) => (n == null ? 'Unknown' : money(n, currency));
  const line = (label: string, v: number | null | undefined, minus = false, bold = false) => (
    <Row style={{ justifyContent: 'space-between', paddingVertical: 4 }}>
      <T variant={bold ? 'body' : 'muted'} style={bold ? { fontWeight: '700' } : undefined}>{label}</T>
      <T style={{ fontWeight: bold ? '800' : '600', color: v == null ? colors.textMuted : bold ? (Number(v) >= 0 ? colors.success : colors.danger) : colors.text }}>
        {v == null ? 'Unknown' : `${minus && Number(v) !== 0 ? '−' : ''}${fmt(v)}`}
      </T>
    </Row>
  );
  return (
    <Card>
      <ErrorBanner message={q.error} onRetry={q.reload} />
      {!p ? (q.loading ? <ActivityIndicator color={colors.primary} /> : null) : (
        <>
          {line('Revenue (excl. tax)', p.revenue)}
          {line(`Labor${p.labor_minutes ? ` (${Math.round(p.labor_minutes / 6) / 10} h)` : ''}`, p.labor, true)}
          {line('Supplies', p.supplies, true)}
          <View style={{ height: 1, backgroundColor: colors.border, marginVertical: 4 }} />
          {line('Gross profit', p.gross, false, true)}
          {line('Job expenses', p.job_expenses, true)}
          {line('Net profit', p.net, false, true)}
          <Row style={{ justifyContent: 'space-between', paddingVertical: 4 }}>
            <T variant="muted">Margin</T>
            <T style={{ fontWeight: '700' }}>{p.margin_pct == null ? 'Unknown' : `${p.margin_pct}%`}</T>
          </Row>
          {p.labor == null || p.supplies == null ? (
            <T variant="small" style={{ marginTop: 6 }}>
              {p.labor == null ? `${Math.round(p.labor_unknown_minutes)} min of crew time has no hourly rate (set pay rates under Team). ` : ''}
              {p.supplies == null ? 'Some supplies have no unit cost (set it in the Supply room).' : ''}
            </T>
          ) : null}
        </>
      )}
    </Card>
  );
}

/** Condition report + customer signature (versioned; editing the report clears the signature). */
export function ConditionCard({ job, editable, onChanged }: {
  job: { id: string; condition_report: string | null; condition_signature_svg: string | null; condition_signed_by: string | null; condition_signed_at: string | null; condition_version: number };
  editable: boolean; onChanged: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState('');
  const [signing, setSigning] = useState(false);
  const [signer, setSigner] = useState('');
  const [error, setError] = useState<string | null>(null);
  const signed = !!job.condition_signature_svg;

  const saveText = async () => {
    setError(null);
    const { error: e } = await supabase.from('jobs').update({ condition_report: text.trim() || null }).eq('id', job.id);
    if (e) return setError(friendlyError(e.message));
    setEditing(false);
    onChanged();
  };
  const sign = async (svg: string) => {
    if (signer.trim().length < 2) { setError('Enter the name of the person signing.'); return; }
    const { error: e } = await supabase.from('jobs').update({ condition_signature_svg: svg, condition_signed_by: signer.trim(), condition_signed_at: new Date().toISOString() }).eq('id', job.id);
    if (e) { setError(friendlyError(e.message)); return; }
    setSigning(false);
    setSigner('');
    onChanged();
  };

  return (
    <Card>
      <ErrorBanner message={error} />
      <Row style={{ justifyContent: 'space-between' }}>
        <T variant="muted">{job.condition_report ? `Version ${Math.max(1, job.condition_version)}` : 'No condition report yet'}</T>
        {signed ? <Badge label="Signed" tone="success" raw /> : job.condition_report ? <Badge label="Needs signature" tone="warning" raw /> : null}
      </Row>
      {editing ? (
        <View style={{ marginTop: space.md }}>
          {signed ? <T variant="small" style={{ color: colors.warning, marginBottom: 6 }}>Changing the report clears the customer&apos;s signature — they will need to sign the new version.</T> : null}
          <Field placeholder="Existing scratches, chips, stains, missing parts… and the services the customer accepts." value={text} onChangeText={setText} multiline />
          <Row>
            <Button small kind="ghost" title="Cancel" onPress={() => setEditing(false)} />
            <Button small title="Save report" onPress={saveText} />
          </Row>
        </View>
      ) : job.condition_report ? <T style={{ marginTop: space.sm }}>{job.condition_report}</T> : null}
      {signed && !editing ? (
        <Row style={{ marginTop: space.sm }}>
          <Ionicons name="checkmark-circle" size={18} color={colors.success} />
          <T variant="muted" style={{ flex: 1 }}>Signed by <T style={{ fontWeight: '700' }}>{job.condition_signed_by}</T> · {dateTime(job.condition_signed_at)}</T>
        </Row>
      ) : null}
      {editable && !editing ? (
        <Row style={{ marginTop: space.md, flexWrap: 'wrap' }}>
          <Button small kind="secondary" icon="create-outline" title={job.condition_report ? 'Edit report' : 'Write condition report'} onPress={() => { setText(job.condition_report ?? ''); setEditing(true); }} />
          {job.condition_report && !signed ? <Button small icon="pencil-outline" title="Customer signs" onPress={() => setSigning(true)} /> : null}
        </Row>
      ) : null}
      <SheetModal visible={signing} onClose={() => setSigning(false)} style={{ padding: space.lg }}>
        <ScrollView keyboardShouldPersistTaps="handled">
          <T variant="h2" style={{ marginBottom: space.sm }}>Condition & service acceptance</T>
          <T variant="muted" style={{ marginBottom: space.sm }}>Version {Math.max(1, job.condition_version)}</T>
          <Card><T>{job.condition_report}</T></Card>
          <ErrorBanner message={error} />
          <Field label="Full name" value={signer} onChangeText={setSigner} placeholder="Customer / pilot name" />
          <SignaturePad onCancel={() => setSigning(false)} onSave={sign} />
        </ScrollView>
      </SheetModal>
    </Card>
  );
}

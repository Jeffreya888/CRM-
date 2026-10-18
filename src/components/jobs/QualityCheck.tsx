// Quality check section on the job screen (docs/competitive-edge.md §4).
import { format, isToday } from 'date-fns';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { relative } from '../../lib/format';
import { friendlyError, supabase } from '../../lib/supabase';
import { colors, space } from '../../lib/theme';
import type { Job } from '../../lib/types';
import { notify } from '../FormSheet';
import { Badge, Button, Card, Field, Ionicons, Row, Section, T } from '../ui';

export interface QcItem { id: string; label: string; done: boolean; done_by: string | null; done_at: string | null }

/** True when the company requires a passed quality check and this job does not have one yet. */
export const qcBlocksCompletion = (requireQc: boolean | null | undefined, status: string | null | undefined) => !!requireQc && status !== 'passed';

export const QC_BLOCK_MESSAGE = 'A manager must pass the quality check first.';

/**
 * QC items (job_checklist_items.kind = 'qc') as checkboxes, then:
 * crew → Ready for quality check (submit_for_qc); manager → Pass / Needs work (qc_decision).
 * Hidden when the job has no QC items and the company does not require QC.
 */
export function QualityCheck({ job, items, requireQc, canCheck, canSubmit, manager, name, uid, onChanged }: {
  job: Pick<Job, 'id' | 'status' | 'qc_status' | 'qc_by' | 'qc_at' | 'qc_notes'>;
  items: QcItem[];
  requireQc: boolean;
  /** May tick QC items (crew or manager on an open job). */
  canCheck: boolean;
  /** May send the job for a quality check (assigned crew or manager). */
  canSubmit: boolean;
  manager: boolean;
  name: (userId: string) => string;
  uid: string;
  onChanged: () => void;
}) {
  const [failing, setFailing] = useState(false);
  const [note, setNote] = useState('');
  if (!items.length && !requireQc) return null;

  const status = job.qc_status ?? 'not_required';
  const open = ['scheduled', 'in_progress', 'on_hold'].includes(job.status);
  const doneCount = items.filter((i) => i.done).length;
  const when = job.qc_at ? (isToday(new Date(job.qc_at)) ? format(new Date(job.qc_at), 'h:mm a') : format(new Date(job.qc_at), 'MMM d, h:mm a')) : null;
  const by = job.qc_by ? name(job.qc_by) : null;

  const toggle = async (c: QcItem) => {
    const { error } = await supabase.from('job_checklist_items')
      .update({ done: !c.done, done_by: !c.done ? uid : null, done_at: !c.done ? new Date().toISOString() : null }).eq('id', c.id);
    if (error) return notify('Could not update', friendlyError(error.message));
    onChanged();
  };
  const submit = async () => {
    const { error } = await supabase.rpc('submit_for_qc', { p_job: job.id });
    if (error) return notify('Could not send for quality check', friendlyError(error.message));
    notify('Sent for quality check', 'Your manager has been notified.');
    onChanged();
  };
  const decide = async (pass: boolean) => {
    if (!pass && !note.trim()) return notify('Add a note', 'Tell the crew what needs work.');
    const { error } = await supabase.rpc('qc_decision', { p_job: job.id, p_pass: pass, p_notes: pass ? (note.trim() || null) : note.trim() });
    if (error) return notify('Could not save the quality check', friendlyError(error.message));
    setFailing(false);
    setNote('');
    onChanged();
  };

  const badge = status === 'passed' ? <Badge label={`QC passed${by ? ` by ${by}` : ''}${when ? ` · ${when}` : ''}`} tone="success" raw />
    : status === 'failed' ? <Badge label="Needs work" tone="danger" raw />
    : status === 'pending' ? <Badge label="Waiting for quality check" tone="warning" raw />
    : requireQc ? <Badge label="Quality check required" tone="neutral" raw /> : null;

  return (
    <Section title="Quality check" icon="shield-checkmark-outline" iconColor={colors.success} count={items.length ? `${doneCount}/${items.length}` : undefined}>
      <Card style={{ padding: 0, overflow: 'hidden' }}>
        <View style={{ padding: space.md, gap: 6 }}>
          {badge ? <Row style={{ flexWrap: 'wrap' }}>{badge}</Row> : null}
          {status === 'failed' && job.qc_notes ? (
            <T style={{ color: colors.danger }}>Needs work: {job.qc_notes}{by ? <T variant="small"> — {by}{job.qc_at ? `, ${relative(job.qc_at)}` : ''}</T> : null}</T>
          ) : null}
          {status === 'passed' && job.qc_notes ? <T variant="muted">{job.qc_notes}</T> : null}
          {status === 'pending' && job.qc_at ? <T variant="small">Sent {relative(job.qc_at)}{by ? ` by ${by}` : ''}</T> : null}
          {!items.length ? <T variant="muted">A manager checks the finished work before the job can be completed.</T> : null}
        </View>

        {items.map((c) => (
          <View key={c.id} style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.md, paddingVertical: space.sm, borderTopWidth: 1, borderTopColor: colors.border }}>
            <Pressable disabled={!canCheck} onPress={() => toggle(c)} hitSlop={8} accessibilityRole="checkbox" accessibilityState={{ checked: c.done }}>
              <Ionicons name={c.done ? 'checkmark-circle' : 'ellipse-outline'} size={24} color={c.done ? colors.success : colors.textMuted} />
            </Pressable>
            <View style={{ flex: 1 }}>
              <T style={c.done ? { color: colors.textMuted } : undefined}>{c.label}</T>
              {c.done && c.done_by ? <T variant="small">{name(c.done_by)} · {relative(c.done_at)}</T> : null}
            </View>
          </View>
        ))}

        {open && (canSubmit || manager) ? (
          <View style={{ padding: space.md, borderTopWidth: 1, borderTopColor: colors.border, gap: space.sm }}>
            {canSubmit && (status === 'not_required' || status === 'failed') ? (
              <Button small icon="send-outline" title="Ready for quality check" style={{ alignSelf: 'flex-start' }} onPress={submit} />
            ) : null}
            {manager && status !== 'passed' ? (
              failing ? (
                <>
                  <Field label="What needs work?" multiline value={note} onChangeText={setNote} placeholder="Streaks on the left wing leading edge" style={{ marginBottom: space.sm }} />
                  <Row style={{ flexWrap: 'wrap' }}>
                    <Button small kind="danger" icon="refresh-outline" title="Send back to crew" onPress={() => decide(false)} />
                    <Button small kind="ghost" title="Cancel" onPress={() => { setFailing(false); setNote(''); }} />
                  </Row>
                </>
              ) : (
                <Row style={{ flexWrap: 'wrap' }}>
                  <Button small icon="checkmark-circle-outline" title="Pass" onPress={() => decide(true)} />
                  <Button small kind="secondary" icon="alert-circle-outline" title="Needs work" onPress={() => setFailing(true)} />
                </Row>
              )
            ) : null}
            {manager && status !== 'passed' && items.length > 0 && doneCount < items.length ? (
              <T variant="small">{items.length - doneCount} quality item{items.length - doneCount === 1 ? '' : 's'} not ticked yet.</T>
            ) : null}
          </View>
        ) : null}
      </Card>
    </Section>
  );
}

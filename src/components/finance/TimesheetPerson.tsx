import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { FormSheet } from '../FormSheet';
import { Avatar, Badge, Button, Card, Ionicons, Row, T } from '../ui';
import { dateTime, duration, initials, money, time } from '../../lib/format';
import { must, supabase } from '../../lib/supabase';
import { colors, space } from '../../lib/theme';

export interface PersonSummary {
  user_id: string; name: string; minutes: number; open_entries: number; unapproved: number; entries: number;
  hourly_rate: number | null; overtime_multiplier: number | null; overtime_minutes: number;
}
export interface TimeEntry {
  id: string; user_id: string; started_at: string; ended_at: string | null; approved: boolean; notes: string | null;
  job: { number: string; title: string | null; customer: { name: string } | null } | null;
}

const entryMins = (e: TimeEntry) => ((e.ended_at ? new Date(e.ended_at).getTime() : Date.now()) - new Date(e.started_at).getTime()) / 60000;

/** One person in a pay period: totals + flags, expands to their clock entries. */
export function TimesheetPerson({
  p, entries, color, canApprove, canFix, locked, showPay, onApprove, onChanged, startOpen,
}: {
  p: PersonSummary; entries: TimeEntry[]; color?: string | null; canApprove: boolean; canFix: boolean; locked: boolean; showPay: boolean;
  onApprove: () => Promise<void>; onChanged: () => void; startOpen?: boolean;
}) {
  const [open, setOpen] = useState(!!startOpen);
  const [edit, setEdit] = useState<TimeEntry | null>(null);
  const ot = Number(p.overtime_minutes) > 0;
  const rate = p.hourly_rate != null ? Number(p.hourly_rate) : null;
  const pay = rate != null ? ((Number(p.minutes) - Number(p.overtime_minutes)) / 60) * rate + (Number(p.overtime_minutes) / 60) * rate * Number(p.overtime_multiplier ?? 1.5) : null;
  return (
    <Card style={{ padding: 0, overflow: 'hidden' }}>
      <Pressable onPress={() => setOpen((o) => !o)} style={({ pressed }) => [{ padding: space.lg }, pressed && { backgroundColor: colors.cardRaised }]}>
        <Row gap={space.md}>
          <Avatar label={initials(p.name)} color={color ?? undefined} />
          <View style={{ flex: 1 }}>
            <T style={{ fontWeight: '700' }} numberOfLines={1}>{p.name}</T>
            <T variant="muted">{duration(Number(p.minutes))}{ot ? ` · ${duration(Number(p.overtime_minutes))} overtime` : ''}{showPay && pay != null ? ` · ${money(pay)}` : ''}</T>
          </View>
          <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textMuted} />
        </Row>
        <Row style={{ flexWrap: 'wrap', marginTop: space.sm }} gap={6}>
          {ot ? <Badge raw label="Over 40 h in a week" tone="warning" /> : null}
          {Number(p.open_entries) > 0 ? <Badge raw label={`${p.open_entries} missing clock-out`} tone="danger" /> : null}
          {Number(p.unapproved) > 0 ? <Badge raw label={`${p.unapproved} to approve`} tone="info" /> : Number(p.entries) > 0 && !Number(p.open_entries) ? <Badge raw label="All approved" tone="success" /> : null}
          {showPay && rate == null && Number(p.minutes) > 0 ? <Badge raw label="No pay rate" tone="neutral" /> : null}
          {Number(p.entries) === 0 ? <Badge raw label="No time this period" tone="neutral" /> : null}
        </Row>
      </Pressable>
      {open ? (
        <View style={{ borderTopWidth: 1, borderTopColor: colors.border }}>
          {entries.length === 0 ? <T variant="muted" style={{ padding: space.lg }}>No clock entries in this period.</T> : null}
          {entries.map((e) => (
            <Pressable key={e.id} disabled={!canFix || locked} onPress={() => setEdit(e)}
              style={({ pressed }) => [{ paddingVertical: space.md, paddingHorizontal: space.lg, borderBottomWidth: 1, borderBottomColor: colors.border }, pressed && { backgroundColor: colors.cardRaised }]}>
              <Row style={{ justifyContent: 'space-between' }}>
                <T style={{ flex: 1 }}>{dateTime(e.started_at)} → {e.ended_at ? time(e.ended_at) : '…'}</T>
                <T style={{ fontWeight: '700', fontVariant: ['tabular-nums'] }}>{duration(entryMins(e))}</T>
              </Row>
              <Row style={{ justifyContent: 'space-between', marginTop: 2 }}>
                <T variant="small" numberOfLines={1} style={{ flex: 1 }}>
                  {[e.job ? `Job ${e.job.number}${e.job.customer ? ` · ${e.job.customer.name}` : ''}` : 'No job', e.notes].filter(Boolean).join(' · ')}
                </T>
                {!e.ended_at ? <Badge label="still clocked in" tone="danger" /> : e.approved ? <Badge label="approved" tone="success" /> : <Badge label="pending" tone="neutral" />}
              </Row>
            </Pressable>
          ))}
          {canApprove && !locked && Number(p.unapproved) > 0 ? (
            <View style={{ padding: space.md }}>
              <Button small icon="checkmark-done-outline" title={`Approve ${p.name.split(' ')[0]}'s hours`} onPress={onApprove} />
            </View>
          ) : null}
          {canFix && !locked && entries.length ? <T variant="small" style={{ paddingHorizontal: space.lg, paddingBottom: space.md }}>Tap an entry to fix its start or end time.</T> : null}
        </View>
      ) : null}
      <FormSheet visible={!!edit} title="Fix time entry" initial={edit ? { started_at: edit.started_at, ended_at: edit.ended_at, notes: edit.notes ?? '' } : {}}
        onClose={() => setEdit(null)}
        fields={[
          { key: 'started_at', label: 'Clock in', type: 'datetime', required: true },
          { key: 'ended_at', label: 'Clock out', type: 'datetime' },
          { key: 'notes', label: 'Notes', type: 'text' },
        ]}
        onSubmit={async (v) => {
          if (v.ended_at && new Date(v.ended_at) < new Date(v.started_at)) throw new Error('Clock out must be after clock in.');
          await must(supabase.from('time_entries').update({ started_at: v.started_at, ended_at: v.ended_at, notes: v.notes }).eq('id', edit!.id));
          onChanged();
        }}
        onDelete={async () => { await must(supabase.from('time_entries').delete().eq('id', edit!.id)); onChanged(); }}
      />
    </Card>
  );
}

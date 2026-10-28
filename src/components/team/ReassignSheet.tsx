import { useState, type ReactNode } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { Avatar, Button, ErrorBanner, Ionicons, Row, SheetModal, T } from '../ui';
import { initials } from '../../lib/format';
import { friendlyError } from '../../lib/supabase';
import { colors, radius, space } from '../../lib/theme';

export type ReassignChoice = { kind: 'member'; userId: string } | { kind: 'unassigned' } | { kind: 'keep' };

/** Asks who takes over a person's open jobs and recurring schedules before a role change or deactivation. */
export function ReassignSheet({ visible, title, body, people, allowKeep, confirmLabel, danger, onClose, onConfirm }: {
  visible: boolean; title: string; body: string; people: { user_id: string; display_name: string | null; color: string | null; role: string }[];
  allowKeep: boolean; confirmLabel: string; danger?: boolean; onClose: () => void; onConfirm: (c: ReassignChoice) => Promise<void>;
}) {
  const [choice, setChoice] = useState<ReassignChoice | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [was, setWas] = useState(visible);
  if (visible !== was) { setWas(visible); if (visible) { setChoice(allowKeep ? { kind: 'keep' } : null); setError(null); } }

  const opt = (key: string, selected: boolean, onPress: () => void, left: ReactNode, label: string, hint?: string) => (
    <Pressable key={key} onPress={onPress} style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md, borderRadius: radius.md, backgroundColor: selected ? colors.primarySoft : colors.card, marginBottom: 6 }, pressed && { opacity: 0.8 }]}>
      {left}
      <View style={{ flex: 1 }}>
        <T>{label}</T>
        {hint ? <T variant="small">{hint}</T> : null}
      </View>
      {selected ? <Ionicons name="checkmark-circle" size={22} color={colors.primary} /> : null}
    </Pressable>
  );

  return (
    <SheetModal visible={visible} onClose={onClose}>
      <Row style={{ padding: space.lg, justifyContent: 'space-between' }}>
        <Button small kind="ghost" title="Cancel" onPress={onClose} />
        <T variant="h3">{title}</T>
        <View style={{ width: 60 }} />
      </Row>
      <ScrollView contentContainerStyle={{ padding: space.lg, paddingBottom: 64 }}>
        <ErrorBanner message={error} />
        <T variant="muted" style={{ marginBottom: space.lg }}>{body}</T>
        <T style={{ fontWeight: '700', marginBottom: space.sm }}>Who takes over their open jobs and recurring schedules?</T>
        {allowKeep ? opt('keep', choice?.kind === 'keep', () => setChoice({ kind: 'keep' }), <Ionicons name="person-outline" size={22} color={colors.textMuted} />, 'Keep them assigned', 'Their work stays with them') : null}
        {people.map((p) => opt(p.user_id, choice?.kind === 'member' && choice.userId === p.user_id, () => setChoice({ kind: 'member', userId: p.user_id }),
          <Avatar label={initials(p.display_name)} color={p.color ?? undefined} size={32} />, p.display_name ?? 'Team member', p.role))}
        {opt('none', choice?.kind === 'unassigned', () => setChoice({ kind: 'unassigned' }), <Ionicons name="remove-circle-outline" size={22} color={colors.textMuted} />, 'Leave unassigned', 'Jobs stay on the schedule with nobody assigned')}
        <Button style={{ marginTop: space.lg }} kind={danger ? 'danger' : 'primary'} title={confirmLabel} disabled={!choice}
          onPress={async () => { try { await onConfirm(choice!); onClose(); } catch (e: any) { setError(friendlyError(e.message)); } }} />
      </ScrollView>
    </SheetModal>
  );
}

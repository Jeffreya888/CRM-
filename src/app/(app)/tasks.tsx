import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { CrudList } from '../../components/CrudList';
import { Ionicons, Segmented, T } from '../../components/ui';
import { dateTime } from '../../lib/format';
import { useLookups } from '../../lib/lookups';
import { useOrg } from '../../lib/session';
import { supabase } from '../../lib/supabase';
import { colors, space } from '../../lib/theme';

type Task = { id: string; title: string; details: string | null; due_at: string | null; assigned_to: string | null; done: boolean; customer: { name: string } | null };

export default function Tasks() {
  const { session } = useOrg();
  const { memberOptions, customerOptions } = useLookups();
  const [view, setView] = useState<'mine' | 'open' | 'done'>('mine');
  const uid = session!.user.id;
  return (
    <CrudList<Task>
      title="Tasks"
      table="tasks"
      select="*, customer:customers(name)"
      deps={[view]}
      filter={(q) => (view === 'done' ? q.eq('done', true) : view === 'mine' ? q.eq('done', false).eq('assigned_to', uid) : q.eq('done', false))}
      order={[{ column: 'due_at' }]}
      emptyIcon="checkbox-outline"
      emptyTitle={view === 'done' ? 'Nothing completed yet' : 'All caught up'}
      defaults={{ assigned_to: uid }}
      toRow={(v, existing) => { const { customer: _c, ...rest } = v; return existing ? rest : { ...rest, created_by: uid }; }}
      fields={[
        { key: 'title', label: 'Task', type: 'text', required: true, placeholder: 'Follow up on G650 ceramic quote' },
        { key: 'details', label: 'Details', type: 'multiline' },
        { key: 'due_at', label: 'Due', type: 'datetime' },
        { key: 'assigned_to', label: 'Assigned to', type: 'select', options: memberOptions, allowClear: true },
        { key: 'customer_id', label: 'Customer', type: 'select', options: customerOptions, allowClear: true },
      ]}
      header={() => <Segmented value={view} onChange={setView} options={[{ value: 'mine', label: 'Mine' }, { value: 'open', label: 'All open' }, { value: 'done', label: 'Done' }]} />}
      renderRow={(t, edit, reload) => {
        const overdue = !t.done && t.due_at && new Date(t.due_at) < new Date();
        return (
          <Pressable onPress={edit} style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.lg, backgroundColor: colors.card, borderBottomWidth: 1, borderBottomColor: colors.border }}>
            <Pressable hitSlop={10} onPress={async () => { await supabase.from('tasks').update({ done: !t.done, done_at: !t.done ? new Date().toISOString() : null }).eq('id', t.id); reload(); }}>
              <Ionicons name={t.done ? 'checkmark-circle' : 'ellipse-outline'} size={26} color={t.done ? colors.success : colors.textMuted} />
            </Pressable>
            <View style={{ flex: 1 }}>
              <T style={t.done ? { textDecorationLine: 'line-through', color: colors.textMuted } : { fontWeight: '600' }}>{t.title}</T>
              <T variant="small" style={overdue ? { color: colors.danger } : undefined}>{[t.due_at ? dateTime(t.due_at) : null, t.customer?.name].filter(Boolean).join(' · ')}</T>
            </View>
          </Pressable>
        );
      }}
    />
  );
}

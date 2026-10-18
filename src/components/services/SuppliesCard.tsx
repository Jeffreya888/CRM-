import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { friendlyError, supabase } from '../../lib/supabase';
import { colors, space } from '../../lib/theme';
import { useQuery } from '../../lib/useQuery';
import { confirmAction } from '../FormSheet';
import { Button, Card, ErrorBanner, Field, IconButton, Row, Section, Select, T, ToggleRow } from '../ui';

type Supply = { item_id: string; quantity: number; per_foot: boolean | null; item: { id: string; name: string; unit: string | null } | null };
type Item = { id: string; name: string; unit: string | null; vendor: string | null };

/** Supplies a service uses; deducted from the supply room automatically when a job is completed. */
export function SuppliesCard({ serviceId, orgId, manager }: { serviceId: string; orgId: string; manager: boolean }) {
  const [adding, setAdding] = useState(false);
  const [itemId, setItemId] = useState<string | null>(null);
  const [qty, setQty] = useState('1');
  const [perFoot, setPerFoot] = useState(false);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const q = useQuery(async () => {
    const [s, i] = await Promise.all([
      supabase.from('service_supplies').select('item_id, quantity, per_foot, item:inventory_items(id, name, unit)').eq('service_id', serviceId),
      manager ? supabase.from('inventory_items').select('id, name, unit, vendor').eq('org_id', orgId).eq('active', true).order('name') : Promise.resolve({ data: [] as Item[], error: null }),
    ]);
    if (s.error) throw s.error;
    return { supplies: (s.data ?? []) as unknown as Supply[], items: (i.data ?? []) as Item[] };
  }, [serviceId, orgId, manager]);

  const supplies = q.data?.supplies ?? [];
  const used = new Set(supplies.map((s) => s.item_id));
  const options = (q.data?.items ?? []).filter((i) => !used.has(i.id)).map((i) => ({ value: i.id, label: i.name, hint: [i.unit, i.vendor].filter(Boolean).join(' · ') || undefined }));

  const update = async (item_id: string, patch: { quantity?: number; per_foot?: boolean }) => {
    setError(null);
    const { error: e } = await supabase.from('service_supplies').update(patch).eq('service_id', serviceId).eq('item_id', item_id);
    if (e) return setError(friendlyError(e.message));
    q.reload();
  };
  const commitQty = (s: Supply) => {
    const raw = edits[s.item_id];
    if (raw == null) return;
    setEdits(({ [s.item_id]: _drop, ...rest }) => rest);
    const n = parseQty(raw);
    if (n == null) return setError('Quantity must be more than 0, e.g. 1 or 0.25');
    if (n !== Number(s.quantity)) update(s.item_id, { quantity: n });
  };
  const add = async () => {
    setError(null);
    const n = parseQty(qty);
    if (!itemId) return setError('Choose a supply');
    if (n == null) return setError('Quantity must be more than 0, e.g. 1 or 0.25');
    const { error: e } = await supabase.from('service_supplies').insert({ service_id: serviceId, item_id: itemId, org_id: orgId, quantity: n, per_foot: perFoot });
    if (e) return setError(friendlyError(e.message));
    setAdding(false); setItemId(null); setQty('1'); setPerFoot(false);
    q.reload();
  };
  const chosenUnit = (q.data?.items ?? []).find((i) => i.id === itemId)?.unit ?? null;
  const remove = (s: Supply) => confirmAction('Remove supply?', `${s.item?.name ?? 'This item'} will no longer be deducted for this service.`, async () => {
    const { error: e } = await supabase.from('service_supplies').delete().eq('service_id', serviceId).eq('item_id', s.item_id);
    if (e) return setError(friendlyError(e.message));
    q.reload();
  }, true);

  if (!manager && !supplies.length) return null;
  return (
    <Section title="Supplies used" icon="cube-outline" iconColor={colors.accent}
      action={manager && !adding ? <Button small kind="ghost" icon="add" title="Supply" onPress={() => setAdding(true)} /> : undefined}>
      <ErrorBanner message={error ?? q.error} />
      <Card style={{ padding: 0, overflow: 'hidden' }}>
        {supplies.length === 0 && !q.loading ? (
          <T variant="muted" style={{ padding: space.lg }}>No supplies yet. Add what this service uses and it will be taken out of the supply room when a job is completed.</T>
        ) : null}
        {supplies.map((s, i) => (
          <Row key={s.item_id} style={{ padding: space.md, paddingLeft: space.lg, borderTopWidth: i ? 1 : 0, borderTopColor: colors.border }}>
            <View style={{ flex: 1 }}>
              <T style={{ fontWeight: '600' }}>{s.item?.name ?? 'Supply item'}</T>
              <T variant="small">{fmtQty(s.quantity)} {s.item?.unit ?? 'each'} {s.per_foot ? 'per foot of length' : 'per job'}</T>
            </View>
            {manager ? (
              <Row gap={4}>
                <Field style={{ width: 76, marginBottom: 0 }} keyboardType="decimal-pad" accessibilityLabel="Quantity"
                  value={edits[s.item_id] ?? fmtQty(s.quantity)} onChangeText={(v) => setEdits((e) => ({ ...e, [s.item_id]: cleanQty(v) }))}
                  onBlur={() => commitQty(s)} returnKeyType="done" />
                <PerFootChip on={!!s.per_foot} onPress={() => update(s.item_id, { per_foot: !s.per_foot })} />
                <IconButton icon="trash-outline" label="Remove" color={colors.textMuted} onPress={() => remove(s)} />
              </Row>
            ) : null}
          </Row>
        ))}
      </Card>
      {adding ? (
        <Card>
          {options.length === 0 ? (
            <T variant="muted" style={{ marginBottom: space.md }}>No more supplies to add. Add items in the Supply room first.</T>
          ) : (
            <>
              <Select label="Supply" value={itemId} options={options} onChange={setItemId} searchable placeholder="Choose from your supply room" />
              <Field label={`Quantity ${perFoot ? 'per foot of length' : 'per job'}${chosenUnit ? ` (${chosenUnit})` : ''}`} keyboardType="decimal-pad" value={qty}
                onChangeText={(v) => setQty(cleanQty(v))} hint="Decimals are fine, e.g. 0.25." />
              <ToggleRow label="Per foot of length" value={perFoot} onChange={setPerFoot}
                hint="Multiply by the length of the aircraft, vehicle or boat (e.g. 0.02 gal per foot)." />
            </>
          )}
          <Row style={{ justifyContent: 'flex-end' }}>
            <Button small kind="ghost" title="Cancel" onPress={() => { setAdding(false); setError(null); }} />
            {options.length ? <Button small title="Add supply" onPress={add} /> : null}
          </Row>
        </Card>
      ) : null}
    </Section>
  );
}

/** Keeps digits and one decimal point, at most 3 decimals. */
const cleanQty = (v: string) => {
  const t = v.replace(',', '.').replace(/[^0-9.]/g, '');
  const [a, ...rest] = t.split('.');
  return rest.length ? `${a}.${rest.join('').slice(0, 3)}` : a ?? '';
};
const parseQty = (v: string): number | null => {
  const n = Math.round(Number(v) * 1000) / 1000;
  return Number.isFinite(n) && n > 0 ? n : null;
};
const fmtQty = (n: number | string) => String(+Number(n).toFixed(3));

function PerFootChip({ on, onPress }: { on: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="switch" accessibilityState={{ checked: on }} accessibilityLabel="Per foot of length"
      style={{ paddingHorizontal: 8, paddingVertical: 6, borderRadius: 12, borderWidth: 1, borderColor: on ? colors.primary : colors.border, backgroundColor: on ? colors.primarySoft : 'transparent' }}>
      <T variant="small" style={{ color: on ? colors.primaryText : colors.textMuted, fontWeight: on ? '700' : '400' }}>/ft</T>
    </Pressable>
  );
}

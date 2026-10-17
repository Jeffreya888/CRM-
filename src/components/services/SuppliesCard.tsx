import { useState } from 'react';
import { View } from 'react-native';
import { friendlyError, supabase } from '../../lib/supabase';
import { colors, space } from '../../lib/theme';
import { useQuery } from '../../lib/useQuery';
import { confirmAction } from '../FormSheet';
import { Button, Card, ErrorBanner, Field, IconButton, Row, Section, Select, T } from '../ui';

type Supply = { item_id: string; quantity: number; item: { id: string; name: string; unit: string | null } | null };
type Item = { id: string; name: string; unit: string | null; vendor: string | null };

/** Supplies a service uses; deducted from the supply room automatically when a job is completed. */
export function SuppliesCard({ serviceId, orgId, manager }: { serviceId: string; orgId: string; manager: boolean }) {
  const [adding, setAdding] = useState(false);
  const [itemId, setItemId] = useState<string | null>(null);
  const [qty, setQty] = useState('1');
  const [error, setError] = useState<string | null>(null);

  const q = useQuery(async () => {
    const [s, i] = await Promise.all([
      supabase.from('service_supplies').select('item_id, quantity, item:inventory_items(id, name, unit)').eq('service_id', serviceId),
      manager ? supabase.from('inventory_items').select('id, name, unit, vendor').eq('org_id', orgId).eq('active', true).order('name') : Promise.resolve({ data: [] as Item[], error: null }),
    ]);
    if (s.error) throw s.error;
    return { supplies: (s.data ?? []) as unknown as Supply[], items: (i.data ?? []) as Item[] };
  }, [serviceId, orgId, manager]);

  const supplies = q.data?.supplies ?? [];
  const used = new Set(supplies.map((s) => s.item_id));
  const options = (q.data?.items ?? []).filter((i) => !used.has(i.id)).map((i) => ({ value: i.id, label: i.name, hint: [i.unit, i.vendor].filter(Boolean).join(' · ') || undefined }));

  const setQuantity = async (item_id: string, quantity: number) => {
    setError(null);
    if (quantity < 1) return;
    const { error: e } = await supabase.from('service_supplies').update({ quantity }).eq('service_id', serviceId).eq('item_id', item_id);
    if (e) return setError(friendlyError(e.message));
    q.reload();
  };
  const add = async () => {
    setError(null);
    const n = Math.floor(Number(qty));
    if (!itemId) return setError('Choose a supply');
    if (!n || n < 1) return setError('Quantity must be a whole number of 1 or more');
    const { error: e } = await supabase.from('service_supplies').insert({ service_id: serviceId, item_id: itemId, org_id: orgId, quantity: n });
    if (e) return setError(friendlyError(e.message));
    setAdding(false); setItemId(null); setQty('1');
    q.reload();
  };
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
              <T variant="small">{s.quantity} {s.item?.unit ?? 'each'} per job</T>
            </View>
            {manager ? (
              <Row gap={0}>
                <IconButton icon="remove-circle-outline" label="Less" color={s.quantity > 1 ? colors.textMuted : colors.border} onPress={() => setQuantity(s.item_id, s.quantity - 1)} />
                <T style={{ minWidth: 24, textAlign: 'center', fontWeight: '700' }}>{s.quantity}</T>
                <IconButton icon="add-circle-outline" label="More" color={colors.textMuted} onPress={() => setQuantity(s.item_id, s.quantity + 1)} />
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
              <Field label="Quantity per job (whole units)" keyboardType="number-pad" value={qty} onChangeText={(v) => setQty(v.replace(/\D/g, ''))} />
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

import { FormSheet, type FieldDef } from '../FormSheet';
import type { Option } from '../ui';
import { money } from '../../lib/format';
import type { InventoryItem, StockLocation } from '../../lib/inventory';
import { supabase } from '../../lib/supabase';

export type StockMode = 'adjust' | 'receive' | 'transfer';
const NONE = '__none__';

/**
 * Stock changes for one item. Every change is an inventory movement so the
 * history (and job costs) stay accurate:
 * - adjust: restock / correction / waste
 * - receive: "Mark received" for an order (+qty at the purchase cost)
 * - transfer: two movements, −qty from one location and +qty to another (Fleet)
 */
export function StockSheet({
  item,
  mode,
  orgId,
  locations,
  useLocations,
  showMoney,
  perLocation,
  onClose,
  onDone,
}: {
  item: InventoryItem | null;
  mode: StockMode;
  orgId: string;
  locations: StockLocation[];
  useLocations: boolean;
  showMoney: boolean;
  /** Quantity per stock_location_id ('' = not at a location). Needed for transfers. */
  perLocation?: Record<string, number>;
  onClose: () => void;
  onDone: () => void;
}) {
  const locOptions: Option[] = [{ value: NONE, label: 'Main stock (no location)' }, ...locations.filter((l) => l.active).map((l) => ({ value: l.id, label: l.name }))];
  const locField = (key: string, label: string): FieldDef => ({ key, label, type: 'select', options: locOptions.map((o) => ({ ...o, hint: perLocation ? `${perLocation[o.value === NONE ? '' : o.value] ?? 0} on hand` : undefined })) });
  const unit = item?.unit ?? 'each';

  let fields: FieldDef[] = [];
  let initial: Record<string, any> = {};
  let title = '';
  if (mode === 'adjust') {
    title = `Adjust ${item?.name ?? ''}`;
    initial = { reason: 'purchase', location: NONE };
    fields = [
      { key: 'reason', label: 'What happened?', type: 'select', options: [
        { value: 'purchase', label: 'Restock / purchase (+)' },
        { value: 'job_use', label: 'Used on a job (−)' },
        { value: 'adjustment', label: 'Correction (+ or −)' },
        { value: 'waste', label: 'Waste / damaged / expired (−)' },
      ] },
      { key: 'delta', label: `Quantity (${unit})`, type: 'number', required: true, hint: 'Whole units. For corrections, use a negative number to reduce.' },
      ...(useLocations ? [locField('location', 'Location')] : []),
      { key: 'note', label: 'Note', type: 'text' },
    ];
  } else if (mode === 'receive') {
    title = `Received ${item?.name ?? ''}`;
    initial = { delta: String(Number(item?.reorder_qty) || ''), unit_cost: showMoney ? String(item?.unit_cost ?? '') : undefined, location: NONE };
    fields = [
      { key: 'delta', label: `Quantity received (${unit})`, type: 'number', required: true },
      ...(showMoney ? [{ key: 'unit_cost', label: `Cost per ${unit} ($)`, type: 'money', hint: item ? `Currently ${money(item.unit_cost)}. This cost flows into job profitability.` : undefined } as FieldDef] : []),
      ...(useLocations ? [locField('location', 'Received at')] : []),
      { key: 'note', label: 'Note', type: 'text', placeholder: 'PO #, invoice #' },
    ];
  } else {
    title = `Transfer ${item?.name ?? ''}`;
    initial = { from: NONE, to: locations.find((l) => l.active)?.id ?? NONE };
    fields = [
      locField('from', 'From'),
      locField('to', 'To'),
      { key: 'delta', label: `Quantity (${unit})`, type: 'number', required: true },
      { key: 'note', label: 'Note', type: 'text', placeholder: 'Loaded Van 2 for the week' },
    ];
  }

  return (
    <FormSheet
      visible={!!item}
      title={title.trim()}
      initial={initial}
      fields={fields}
      onClose={onClose}
      onSubmit={async (v) => {
        if (!item) return;
        const raw = Number(v.delta);
        if (!raw || !Number.isFinite(raw)) throw new Error('Enter a quantity other than zero');
        if (!Number.isInteger(raw)) throw new Error('Supplies are counted in whole units');
        const loc = (k: string) => (v[k] && v[k] !== NONE ? (v[k] as string) : null);
        const base = { org_id: orgId, item_id: item.id, note: v.note ?? null };

        if (mode === 'transfer') {
          const qty = Math.abs(raw);
          const from = loc('from');
          const to = loc('to');
          if (from === to) throw new Error('Choose two different locations');
          const available = perLocation?.[from ?? ''] ?? 0;
          if (qty > available) throw new Error(`Only ${available} ${unit} at that location`);
          const { error } = await supabase.from('inventory_movements').insert([
            { ...base, delta: -qty, reason: 'transfer', stock_location_id: from },
            { ...base, delta: qty, reason: 'transfer', stock_location_id: to },
          ]);
          if (error) throw error;
        } else if (mode === 'receive') {
          const qty = Math.abs(raw);
          const cost = showMoney && v.unit_cost != null ? Number(v.unit_cost) : null;
          if (cost != null && cost < 0) throw new Error('Cost cannot be negative');
          const { error } = await supabase.from('inventory_movements').insert({
            ...base, delta: qty, reason: 'purchase', stock_location_id: loc('location'), ...(cost != null ? { unit_cost: cost } : {}),
          });
          if (error) throw error;
          if (cost != null && cost !== Number(item.unit_cost)) {
            const { error: e2 } = await supabase.from('inventory_items').update({ unit_cost: cost }).eq('id', item.id);
            if (e2) throw e2;
          }
        } else {
          let delta = raw;
          if (v.reason === 'purchase') delta = Math.abs(raw);
          if (v.reason === 'waste' || v.reason === 'job_use') delta = -Math.abs(raw);
          const { error } = await supabase.from('inventory_movements').insert({ ...base, delta, reason: v.reason ?? 'adjustment', stock_location_id: loc('location') });
          if (error) throw error;
        }
        onDone();
      }}
    />
  );
}

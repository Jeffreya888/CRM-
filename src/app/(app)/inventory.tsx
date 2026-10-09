import { useState } from 'react';
import { View } from 'react-native';
import { CrudList } from '../../components/CrudList';
import { FormSheet } from '../../components/FormSheet';
import { Gate } from '../../components/Gate';
import { Badge, Button, Card, ListRow, Row, Segmented, T } from '../../components/ui';
import { date, money, titleCase } from '../../lib/format';
import { canSeeMoney } from '../../lib/plans';
import { useOrg } from '../../lib/session';
import { supabase } from '../../lib/supabase';
import { colors, space } from '../../lib/theme';

type Item = { id: string; name: string; sku: string | null; unit: string; quantity: number; reorder_level: number; unit_cost: number; vendor: string | null; approved_for: string | null };
type Equip = { id: string; name: string; serial_number: string | null; status: string; next_service_due: string | null; last_serviced_on: string | null; notes: string | null };

export default function Inventory() {
  const { orgId, role, session } = useOrg();
  const [tab, setTab] = useState<'supplies' | 'equipment'>('supplies');
  const [restock, setRestock] = useState<Item | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const money$ = canSeeMoney(role);
  const switcher = <Segmented value={tab} onChange={setTab} options={[{ value: 'supplies', label: 'Supplies' }, { value: 'equipment', label: 'Equipment' }]} />;

  return (
    <Gate feature="inventory">
      <View style={{ flex: 1 }}>
        {tab === 'supplies' ? (
          <CrudList<Item>
            title="Inventory"
            table="inventory_items"
            deps={[reloadKey]}
            order={[{ column: 'name' }]}
            emptyIcon="cube-outline"
            emptyTitle="No supplies tracked"
            emptyBody="Add wash concentrate, polish, towels, ceramic kits. Get alerts when stock runs low."
            searchKeys={(i) => [i.name, i.sku, i.vendor]}
            defaults={{ unit: 'each', quantity: '0', reorder_level: '0', unit_cost: '0' }}
            toRow={(v, existing) => {
              const row: Record<string, any> = { ...v, unit_cost: Number(v.unit_cost) || 0, reorder_level: Number(v.reorder_level) || 0 };
              // Quantity changes go through movements so history stays accurate.
              if (existing) delete row.quantity; else row.quantity = Number(v.quantity) || 0;
              return row;
            }}
            fields={[
              { key: 'name', label: 'Product', type: 'text', required: true },
              { key: 'sku', label: 'SKU / part #', type: 'text' },
              { key: 'unit', label: 'Unit', type: 'text', placeholder: 'gallon, bottle, each' },
              { key: 'quantity', label: 'Starting quantity', type: 'number', hint: 'For existing items use Restock / Adjust' },
              { key: 'reorder_level', label: 'Reorder when at or below', type: 'number' },
              { key: 'unit_cost', label: 'Cost per unit ($)', type: 'money' },
              { key: 'vendor', label: 'Vendor', type: 'text' },
              { key: 'approved_for', label: 'Approvals / notes', type: 'multiline', placeholder: 'OEM approvals (e.g. Boeing D6-17487), MSDS location' },
            ]}
            header={(rows) => (
              <View>
                {switcher}
                {money$ ? <Card><T variant="muted">Stock value</T><T variant="h3">{money(rows.reduce((s, r) => s + Number(r.quantity) * Number(r.unit_cost), 0))}</T></Card> : null}
              </View>
            )}
            renderRow={(i, edit) => {
              const low = Number(i.quantity) <= Number(i.reorder_level);
              return (
                <ListRow icon="flask-outline" title={i.name} subtitle={`${Number(i.quantity)} ${i.unit} on hand`} meta={[i.vendor, money$ && Number(i.unit_cost) ? `${money(i.unit_cost)}/${i.unit}` : null].filter(Boolean).join(' · ')}
                  right={<Row gap={4}>{low ? <Badge label="Low" tone="danger" /> : null}<Button small kind="secondary" title="Adjust" onPress={() => setRestock(i)} /></Row>}
                  onPress={edit} />
              );
            }}
          />
        ) : (
          <CrudList<Equip>
            title="Equipment"
            table="equipment"
            order={[{ column: 'name' }]}
            emptyIcon="hammer-outline"
            emptyTitle="No equipment tracked"
            emptyBody="Pressure washers, polishers, lifts, extractors, vans. Track service dates."
            searchKeys={(e) => [e.name, e.serial_number]}
            defaults={{ status: 'in_service' }}
            fields={[
              { key: 'name', label: 'Name', type: 'text', required: true },
              { key: 'serial_number', label: 'Serial #', type: 'text' },
              { key: 'status', label: 'Status', type: 'select', options: ['in_service', 'needs_service', 'out_of_service', 'retired'].map((s) => ({ value: s, label: titleCase(s) })) },
              { key: 'purchased_on', label: 'Purchased', type: 'date' },
              { key: 'last_serviced_on', label: 'Last serviced', type: 'date' },
              { key: 'next_service_due', label: 'Next service due', type: 'date' },
              { key: 'notes', label: 'Notes', type: 'multiline' },
            ]}
            header={() => switcher}
            renderRow={(e, edit) => {
              const due = e.next_service_due && e.next_service_due <= new Date().toISOString().slice(0, 10);
              return (
                <ListRow icon="hammer-outline" title={e.name} subtitle={e.serial_number} meta={e.next_service_due ? `Service due ${date(e.next_service_due)}` : null}
                  right={<Badge label={due ? 'service due' : e.status} tone={due || e.status !== 'in_service' ? 'warning' : 'success'} />} onPress={edit} />
              );
            }}
          />
        )}
        <FormSheet
          visible={!!restock}
          title={`Adjust ${restock?.name ?? ''}`}
          initial={{ reason: 'purchase' }}
          fields={[
            { key: 'reason', label: 'Reason', type: 'select', options: [{ value: 'purchase', label: 'Restock / purchase (+)' }, { value: 'adjustment', label: 'Count correction (±)' }, { value: 'waste', label: 'Waste / damaged (−)' }] },
            { key: 'delta', label: 'Quantity', type: 'number', required: true, hint: 'For corrections, use a negative number to reduce' },
          ]}
          onClose={() => setRestock(null)}
          onSubmit={async (v) => {
            let delta = Number(v.delta);
            if (v.reason === 'purchase') delta = Math.abs(delta);
            if (v.reason === 'waste') delta = -Math.abs(delta);
            if (!delta) throw new Error('Quantity cannot be zero');
            const { error } = await supabase.from('inventory_movements').insert({ org_id: orgId, item_id: restock!.id, delta, reason: v.reason, created_by: session!.user.id });
            if (error) throw error;
            setReloadKey((k) => k + 1);
          }}
        />
        <View style={{ height: space.sm, backgroundColor: colors.bg }} />
      </View>
    </Gate>
  );
}

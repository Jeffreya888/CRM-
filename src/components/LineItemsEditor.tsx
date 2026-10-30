import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { money } from '../lib/format';
import { computeTotals, priceService, pricingSummary, type PriceableAircraft } from '../lib/pricing';
import { colors, space } from '../lib/theme';
import type { LineItem, Service } from '../lib/types';
import { Button, Card, Divider, Field, IconButton, Row, SearchBar, SheetModal, T } from './ui';

/**
 * Editable list of line items. Picking a service auto-prices it for the
 * selected aircraft (per-foot, per-class, hourly or flat).
 */
export function LineItemsEditor({
  items,
  onChange,
  services,
  aircraft,
  discount,
  onDiscount,
  taxRate,
  currency = 'USD',
  hideDiscount,
  priceFor,
  title,
}: {
  items: LineItem[];
  onChange: (items: LineItem[]) => void;
  services: Service[];
  aircraft: PriceableAircraft | null;
  discount: number;
  onDiscount: (n: number) => void;
  taxRate: number;
  currency?: string;
  hideDiscount?: boolean;
  /** Optional price override for a service (e.g. the Tarmo price guide for this model). Return null to use normal pricing. */
  priceFor?: (s: Service) => number | null;
  /** Optional label shown above the total (e.g. the package name). */
  title?: string;
}) {
  const [picker, setPicker] = useState(false);
  const [q, setQ] = useState('');
  const totals = computeTotals(items, discount, taxRate);
  const update = (i: number, patch: Partial<LineItem>) => onChange(items.map((it, j) => (j === i ? { ...it, ...patch } : it)));

  const addLine = (line: LineItem) => {
    onChange([...items, line]);
    setPicker(false);
    setQ('');
  };

  const guidePrice = (s: Service) => (priceFor ? priceFor(s) : null);
  const suggested = (s: Service) => guidePrice(s) ?? priceService(s, aircraft);

  const addService = (s: Service) => {
    const guide = guidePrice(s);
    onChange([
      ...items,
      {
        service_id: s.id,
        description: s.name,
        quantity: s.pricing_method === 'hourly' && guide == null ? Number(s.est_hours) || 1 : 1,
        unit_price: guide ?? (s.pricing_method === 'hourly' ? Number(s.hourly_rate) : priceService(s, aircraft)),
        taxable: s.taxable,
      },
    ]);
    setPicker(false);
    setQ('');
  };

  const repriceAll = () =>
    onChange(items.map((it) => {
      const s = services.find((x) => x.id === it.service_id);
      if (!s) return it;
      const guide = guidePrice(s);
      if (guide != null) return { ...it, unit_price: guide };
      if (s.pricing_method === 'hourly') return it;
      return { ...it, unit_price: priceService(s, aircraft) };
    }));

  const visible = services.filter((s) => s.active && (!q || s.name.toLowerCase().includes(q.toLowerCase())));

  return (
    <View>
      {items.map((it, i) => (
        <Card key={i} style={{ padding: space.md }}>
          <Row>
            <View style={{ flex: 1 }}>
              <Field value={it.description} onChangeText={(v) => update(i, { description: v })} placeholder="Description" style={{ marginBottom: space.sm }} />
            </View>
            <IconButton icon="trash-outline" color={colors.danger} label="Remove line" onPress={() => onChange(items.filter((_, j) => j !== i))} />
          </Row>
          <Row>
            <Field style={{ flex: 1, marginBottom: 0 }} label="Qty" keyboardType="decimal-pad" value={String(it.quantity)}
              onChangeText={(v) => update(i, { quantity: Number(v.replace(/[^0-9.]/g, '')) || 0 })} />
            <Field style={{ flex: 2, marginBottom: 0 }} label="Rate" keyboardType="decimal-pad" value={String(it.unit_price)}
              onChangeText={(v) => update(i, { unit_price: Number(v.replace(/[^0-9.]/g, '')) || 0 })} />
            <View style={{ flex: 2, alignItems: 'flex-end', paddingTop: 22 }}>
              <T variant="money">{money(it.quantity * it.unit_price, currency)}</T>
              <Pressable onPress={() => update(i, { taxable: !it.taxable })}>
                <T variant="small" style={{ color: it.taxable ? colors.primary : colors.textMuted }}>{it.taxable ? 'Taxable' : 'No tax'}</T>
              </Pressable>
            </View>
          </Row>
        </Card>
      ))}
      <Row>
        <Button style={{ flex: 1 }} kind="secondary" icon="add" title="Add service" onPress={() => setPicker(true)} />
        <Button style={{ flex: 1 }} kind="ghost" icon="create-outline" title="Custom line"
          onPress={() => onChange([...items, { service_id: null, description: '', quantity: 1, unit_price: 0, taxable: true }])} />
      </Row>
      {aircraft && items.some((i) => i.service_id) ? (
        <Button kind="ghost" small icon="refresh" title="Re-price for selected asset" onPress={repriceAll} />
      ) : null}

      <Card style={{ marginTop: space.md }}>
        <Row style={{ justifyContent: 'space-between' }}><T variant="muted">Subtotal</T><T>{money(totals.subtotal, currency)}</T></Row>
        {hideDiscount ? null : <Row style={{ justifyContent: 'space-between', marginTop: space.sm }}>
          <T variant="muted">Discount ($)</T>
          <Field style={{ width: 120, marginBottom: 0 }} keyboardType="decimal-pad" value={discount ? String(discount) : ''} placeholder="0"
            onChangeText={(v) => onDiscount(Number(v.replace(/[^0-9.]/g, '')) || 0)} />
        </Row>}
        <Row style={{ justifyContent: 'space-between', marginTop: space.sm }}>
          <T variant="muted">Tax ({(taxRate * 100).toFixed(2)}%)</T><T>{money(totals.tax, currency)}</T>
        </Row>
        <Divider />
        <Row style={{ justifyContent: 'space-between' }}><T variant="h3">{title ? `${title} total` : 'Total'}</T><T variant="h3">{money(totals.total, currency)}</T></Row>
      </Card>

      <SheetModal visible={picker} onClose={() => setPicker(false)}>
        <Row style={{ padding: space.lg, justifyContent: 'space-between' }}>
          <T variant="h3">Add service</T>
          <Button small kind="secondary" title="Close" onPress={() => setPicker(false)} />
        </Row>
        <View style={{ paddingHorizontal: space.lg }}><SearchBar value={q} onChange={setQ} placeholder="Search services" /></View>
        <ScrollView contentContainerStyle={{ padding: space.lg }}>
          {visible.map((s) => s.pricing_tiers?.length ? (
            // Tiered services: one choice per tier (e.g. Small / Medium / Large interior).
            s.pricing_tiers.map((t, i) => (
              <Card key={`${s.id}-${i}`} onPress={() => addLine({ service_id: s.id, description: `${s.name} (${t.name})`, quantity: 1, unit_price: Number(t.price), taxable: s.taxable })} style={{ padding: space.md }}>
                <Row style={{ justifyContent: 'space-between' }}>
                  <View style={{ flex: 1 }}>
                    <T style={{ fontWeight: '600' }}>{s.name} · {t.name}</T>
                    {t.detail ? <T variant="small">{t.detail}</T> : null}
                  </View>
                  <T variant="money">{money(t.price, currency)}</T>
                </Row>
              </Card>
            ))
          ) : (
            <Card key={s.id} onPress={() => addService(s)} style={{ padding: space.md }}>
              <Row style={{ justifyContent: 'space-between' }}>
                <View style={{ flex: 1 }}>
                  <T style={{ fontWeight: '600' }}>{s.name}</T>
                  <T variant="small">{guidePrice(s) != null ? 'Price guide for this model' : pricingSummary(s)}{s.est_hours ? ` · ~${s.est_hours}h` : ''}</T>
                </View>
                <T variant="money">{money(guidePrice(s) ?? (s.pricing_method === 'hourly' ? (Number(s.est_hours) || 1) * s.hourly_rate : suggested(s)), currency)}</T>
              </Row>
            </Card>
          ))}
          {!aircraft ? <T variant="small">Tip: pick the aircraft, vehicle or boat first for size-based pricing.</T> : null}
        </ScrollView>
      </SheetModal>
    </View>
  );
}

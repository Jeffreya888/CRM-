import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { notify } from '../../components/FormSheet';
import { Gate } from '../../components/Gate';
import { StockSheet } from '../../components/inventory/StockSheet';
import { Scanner } from '../../components/Scanner';
import { Badge, Button, Card, ErrorBanner, IconButton, IconTile, Row, Screen, Segmented, Select, T } from '../../components/ui';
import { expiryBadge, fmtNum, isLow, parseScan, type InventoryItem, type StockLocation } from '../../lib/inventory';
import { canEdit, isManager } from '../../lib/plans';
import { useOrg } from '../../lib/session';
import { friendlyError, must, supabase } from '../../lib/supabase';
import { colors, space } from '../../lib/theme';
import { useQuery } from '../../lib/useQuery';

type Mode = 'any' | 'supply' | 'equipment';
type Found =
  | { kind: 'item'; item: InventoryItem }
  | { kind: 'missing'; code: string }
  | { kind: 'error'; message: string };

const NONE = '__none__';

/**
 * Scan a supply barcode (find it, or create it with that barcode, and quickly
 * add/remove stock) or an equipment QR label (opens the equipment).
 */
export default function Scan() {
  return (
    <>
      <Stack.Screen options={{ title: 'Scan' }} />
      <Gate feature="inventory">
        <ScanInner />
      </Gate>
    </>
  );
}

function ScanInner() {
  const params = useLocalSearchParams<{ mode?: Mode }>();
  const { orgId, role, perm, can } = useOrg();
  const [mode, setMode] = useState<Mode>(params.mode === 'equipment' || params.mode === 'supply' ? params.mode : 'any');
  const [busy, setBusy] = useState(false);
  const [found, setFound] = useState<Found | null>(null);
  const [qty, setQty] = useState(1);
  const [location, setLocation] = useState<string>(NONE);
  const [adjust, setAdjust] = useState<InventoryItem | null>(null);
  const manager = isManager(role);
  const writable = canEdit(role);
  const fleet = can('stock_locations');

  const locs = useQuery(async () => (fleet
    ? ((await must(supabase.from('stock_locations').select('*').eq('org_id', orgId).eq('active', true).order('name'))) ?? []) as StockLocation[]
    : []), [orgId, fleet]);
  const locations = locs.data ?? [];

  const onScan = async (raw: string) => {
    if (busy) return;
    setBusy(true);
    setFound(null);
    setQty(1);
    try {
      const r = parseScan(raw);
      if (r.kind === 'equipment') {
        if (mode === 'supply') throw new Error('That is an equipment label. Switch to "Equipment" to open it.');
        const { data, error } = await supabase.rpc('equipment_by_qr', { p_token: r.token });
        if (error) throw error;
        if (!data) throw new Error('This label isn’t in your company’s equipment.');
        setBusy(false);
        router.push({ pathname: '/equipment/[id]', params: { id: data as string, from: 'qr' } });
        return;
      }
      if (mode === 'equipment') {
        // Typed tokens without the tarmo:// prefix still work.
        const { data } = await supabase.rpc('equipment_by_qr', { p_token: r.code });
        if (data) {
          setBusy(false);
          router.push({ pathname: '/equipment/[id]', params: { id: data as string, from: 'qr' } });
          return;
        }
        throw new Error('That is not a Tarmo equipment label. Print labels from Equipment → QR label.');
      }
      const rows = ((await must(supabase.from('inventory_items').select('*').eq('org_id', orgId).or(`barcode.eq.${quote(r.code)},sku.eq.${quote(r.code)}`).limit(2))) ?? []) as InventoryItem[];
      const item = rows.find((x) => x.barcode === r.code) ?? rows[0];
      setFound(item ? { kind: 'item', item } : { kind: 'missing', code: r.code });
    } catch (e: any) {
      setFound({ kind: 'error', message: friendlyError(e.message) });
    }
    setBusy(false);
  };

  const move = async (direction: 1 | -1) => {
    if (found?.kind !== 'item') return;
    const it = found.item;
    try {
      const { error } = await supabase.from('inventory_movements').insert({
        org_id: orgId, item_id: it.id, delta: direction * qty, reason: direction > 0 ? 'purchase' : 'job_use',
        stock_location_id: location === NONE ? null : location, note: 'Scanned',
      });
      if (error) throw error;
      const { data } = await supabase.from('inventory_items').select('*').eq('id', it.id).single();
      if (data) setFound({ kind: 'item', item: data as InventoryItem });
      setQty(1);
    } catch (e: any) {
      notify('Could not update stock', friendlyError(e.message));
    }
  };

  const reload = async () => {
    if (found?.kind !== 'item') return;
    const { data } = await supabase.from('inventory_items').select('*').eq('id', found.item.id).single();
    if (data) setFound({ kind: 'item', item: data as InventoryItem });
  };

  return (
    <Screen>
      <Segmented value={mode} onChange={(m) => { setMode(m); setFound(null); }} options={[
        { value: 'any' as const, label: 'Anything' },
        { value: 'supply' as const, label: 'Supplies' },
        { value: 'equipment' as const, label: 'Equipment' },
      ]} />
      <Scanner
        onScan={onScan}
        paused={busy || !!found}
        types={mode === 'equipment' ? ['qr'] : undefined}
        manualLabel={mode === 'equipment' ? 'Or type the label code' : 'Or type the barcode / SKU'}
      />

      {found?.kind === 'error' ? (
        <>
          <ErrorBanner message={found.message} />
          <Button kind="secondary" icon="scan-outline" title="Scan again" onPress={() => setFound(null)} />
        </>
      ) : null}

      {found?.kind === 'missing' ? (
        <Card>
          <Row gap={space.md}>
            <IconTile icon="help-circle-outline" tone="warning" />
            <View style={{ flex: 1 }}>
              <T style={{ fontWeight: '700' }}>No supply with this code</T>
              <T variant="muted" numberOfLines={2}>{found.code}</T>
            </View>
          </Row>
          <Row gap={space.sm} style={{ marginTop: space.md, flexWrap: 'wrap' }}>
            {manager ? <Button small icon="add" title="Create supply with this barcode" onPress={() => router.push({ pathname: '/inventory/edit', params: { barcode: found.code } })} /> : null}
            <Button small kind="secondary" icon="scan-outline" title="Scan again" onPress={() => setFound(null)} />
          </Row>
          {!manager ? <T variant="small" style={{ marginTop: space.sm }}>Ask a manager to add it, or to add this barcode to an existing supply.</T> : null}
        </Card>
      ) : null}

      {found?.kind === 'item' ? (() => {
        const it = found.item;
        const exp = expiryBadge(it.expires_on);
        return (
          <Card>
            <Row gap={space.md}>
              <IconTile icon="flask-outline" tone={isLow(it) ? 'danger' : 'primary'} />
              <View style={{ flex: 1 }}>
                <T style={{ fontWeight: '700' }}>{it.name}</T>
                <T variant="muted">{`${fmtNum(it.quantity)} ${it.unit} on hand${Number(it.par_level) > 0 ? ` · par ${fmtNum(it.par_level)}` : ''}`}</T>
                <Row gap={4} style={{ marginTop: 4, flexWrap: 'wrap' }}>
                  {isLow(it) ? <Badge label="Low" tone="danger" /> : null}
                  {exp ? <Badge label={exp.label} tone={exp.tone} raw /> : null}
                </Row>
              </View>
            </Row>
            {writable && it.active !== false ? (
              <View style={{ marginTop: space.lg }}>
                {fleet && locations.length ? (
                  <Select label="Location" value={location} onChange={(v) => setLocation(v ?? NONE)}
                    options={[{ value: NONE, label: 'Main stock (no location)' }, ...locations.map((l) => ({ value: l.id, label: l.name }))]} />
                ) : null}
                <Row style={{ justifyContent: 'center', marginBottom: space.md }} gap={space.lg}>
                  <IconButton icon="remove-circle-outline" label="Less" onPress={() => setQty((n) => Math.max(1, n - 1))} />
                  <T style={{ fontSize: 28, fontWeight: '800', color: colors.text, minWidth: 48, textAlign: 'center' }}>{qty}</T>
                  <IconButton icon="add-circle-outline" label="More" onPress={() => setQty((n) => n + 1)} />
                </Row>
                <Row gap={space.sm}>
                  <Button style={{ flex: 1 }} kind="secondary" icon="remove" title={`Take out ${qty}`} onPress={() => move(-1)} />
                  <Button style={{ flex: 1 }} icon="add" title={`Add ${qty}`} onPress={() => move(1)} />
                </Row>
                <T variant="small" style={{ marginTop: space.sm, textAlign: 'center' }}>Take out = used. Add = restocked. For waste or corrections use More options.</T>
              </View>
            ) : null}
            <Row gap={space.sm} style={{ marginTop: space.md, flexWrap: 'wrap' }}>
              <Button small kind="ghost" icon="open-outline" title="Open supply" onPress={() => router.push(`/inventory/${it.id}`)} />
              {writable ? <Button small kind="ghost" icon="options-outline" title="More options" onPress={() => setAdjust(it)} /> : null}
              <Button small kind="secondary" icon="scan-outline" title="Scan next" onPress={() => setFound(null)} />
            </Row>
          </Card>
        );
      })() : null}

      <StockSheet
        item={adjust}
        mode="adjust"
        orgId={orgId}
        locations={locations}
        useLocations={fleet && locations.length > 0}
        showMoney={perm('see_prices')}
        onClose={() => setAdjust(null)}
        onDone={reload}
      />
    </Screen>
  );
}

/** Quotes a value for a PostgREST `or=` filter. */
function quote(v: string): string {
  return `"${v.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

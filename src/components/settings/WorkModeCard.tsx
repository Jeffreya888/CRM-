import { useState } from 'react';
import { View } from 'react-native';
import { Button, Card, Divider, ErrorBanner, Field, IconButton, Row, Segmented, T } from '../ui';
import { money } from '../../lib/format';
import { geocode } from '../../lib/geo';
import { friendlyError, supabase } from '../../lib/supabase';
import { colors, space } from '../../lib/theme';
import { travelFee, type TravelSettings } from '../../lib/travel';
import type { Organization } from '../../lib/types';

type Mode = Organization['service_mode'];
type FeeMode = Organization['travel_fee_mode'];
const num = (v: unknown) => (v == null || v === '' ? '' : String(+Number(v).toFixed(2)));
const clean = (v: string) => v.replace(/[^0-9.]/g, '');

const MODES: { value: Mode; label: string }[] = [
  { value: 'mobile', label: 'Mobile' },
  { value: 'shop', label: 'Shop' },
  { value: 'both', label: 'Both' },
];
const MODE_HINT: Record<Mode, string> = {
  mobile: 'You go to the customer: directions, travel fees, On our way texts and a daily route.',
  shop: 'Customers bring it in: check-in at drop-off, Ready for pickup texts and shop bays on the calendar.',
  both: 'Some jobs mobile, some in your shop. Pick on each quote and job.',
};

/**
 * Settings → "Where you work" (owner/admin): mobile, shop or both; the base
 * address (shop, or where mobile crews start); shop bays; travel fee rules.
 */
export function WorkModeCard({ org, onChanged }: { org: Organization; onChanged: () => Promise<void> }) {
  const initial = {
    mode: org.service_mode ?? 'mobile',
    address: org.base_address ?? '',
    bays: org.shop_bays ? String(org.shop_bays) : '',
    hours: org.shop_hours ?? '',
    fee: org.travel_fee_mode ?? 'off',
    free: num(org.travel_free_miles ?? 0),
    rate: num(org.travel_rate_per_mile ?? 0),
    min: num(org.travel_min_fee ?? 0),
    radius: num(org.service_radius_miles),
    zones: (org.travel_zones ?? []).map((z) => ({ miles: num(z.up_to_miles), fee: num(z.fee) })),
  };
  const [v, setV] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const dirty = JSON.stringify(v) !== JSON.stringify(saved);
  const set = <K extends keyof typeof initial>(k: K, val: (typeof initial)[K]) => setV((s) => ({ ...s, [k]: val }));
  const mobile = v.mode !== 'shop';
  const shop = v.mode !== 'mobile';

  const settings: TravelSettings = {
    travel_fee_mode: v.fee, travel_free_miles: Number(v.free) || 0, travel_rate_per_mile: Number(v.rate) || 0,
    travel_min_fee: Number(v.min) || 0, service_radius_miles: Number(v.radius) || null,
    travel_zones: v.zones.map((z) => ({ up_to_miles: Number(z.miles) || 0, fee: Number(z.fee) || 0 })),
  };
  const example = (m: number) => {
    const t = travelFee(settings, m);
    return t.noZone ? 'outside your zones' : t.fee ? money(t.fee, org.currency) : 'free';
  };

  const save = async () => {
    setError(null);
    setNote(null);
    const bays = Number(v.bays) || 0;
    if (bays < 0 || bays > 200) return setError('Shop bays should be between 0 and 200.');
    if (v.fee === 'zones' && settings.travel_zones.some((z) => z.up_to_miles <= 0)) return setError('Each zone needs a distance in miles.');
    setBusy(true);
    try {
      const patch: Record<string, unknown> = {
        service_mode: v.mode, base_address: v.address.trim() || null, shop_bays: bays, shop_hours: v.hours.trim() || null,
        travel_fee_mode: v.fee, travel_free_miles: settings.travel_free_miles, travel_rate_per_mile: settings.travel_rate_per_mile,
        travel_min_fee: settings.travel_min_fee, service_radius_miles: settings.service_radius_miles,
        travel_zones: [...settings.travel_zones].sort((a, b) => a.up_to_miles - b.up_to_miles),
      };
      if (v.address.trim() !== (org.base_address ?? '')) {
        patch.base_lat = null;
        patch.base_lng = null;
        if (v.address.trim()) {
          try {
            const p = await geocode(v.address.trim());
            if (p) { patch.base_lat = p.lat; patch.base_lng = p.lng; setNote(`Found: ${p.matched}`); }
            else setNote("We couldn't find that address on the map, so travel distances need to be entered by hand.");
          } catch {
            setNote("Address lookup is unavailable right now. Save again later to turn on automatic distances.");
          }
        }
      }
      const { error: e } = await supabase.from('organizations').update(patch).eq('id', org.id);
      if (e) throw new Error(friendlyError(e.message));
      setSaved(v);
      await onChanged();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <ErrorBanner message={error} />
      <Segmented value={v.mode} options={MODES} onChange={(m) => set('mode', m)} />
      <T variant="small" style={{ marginTop: -space.sm, marginBottom: space.md }}>{MODE_HINT[v.mode]}</T>

      <Field label={shop ? 'Shop address' : 'Where your crews start'} icon="location-outline" value={v.address} onChangeText={(t) => set('address', t)}
        placeholder="123 Hangar Rd, Austin, TX 78719" hint={mobile ? 'Travel distances are measured from here.' : 'Shown to customers in the pickup message.'} />
      {note ? <T variant="small" style={{ marginTop: -space.sm, marginBottom: space.md }}>{note}</T> : null}

      {shop ? (
        <Row gap={space.md} style={{ alignItems: 'flex-start' }}>
          <Field style={{ flex: 1 }} label="Shop bays" keyboardType="number-pad" value={v.bays} onChangeText={(t) => set('bays', t.replace(/[^0-9]/g, ''))}
            placeholder="0" hint="The calendar won't book more at once. 0 = no limit." />
          <Field style={{ flex: 1 }} label="Pickup hours" value={v.hours} onChangeText={(t) => set('hours', t)} placeholder="Mon–Sat 8–6" />
        </Row>
      ) : null}

      {mobile ? (
        <>
          <Divider />
          <T style={{ fontWeight: '600', marginBottom: space.sm }}>Travel fee on quotes</T>
          <Segmented value={v.fee} onChange={(f: FeeMode) => set('fee', f)}
            options={[{ value: 'off', label: 'None' }, { value: 'per_mile', label: 'Per mile' }, { value: 'zones', label: 'By distance zone' }]} />
          {v.fee === 'per_mile' ? (
            <Row gap={space.md} style={{ alignItems: 'flex-start' }}>
              <Field style={{ flex: 1 }} label="Free miles" keyboardType="decimal-pad" value={v.free} onChangeText={(t) => set('free', clean(t))} placeholder="10" />
              <Field style={{ flex: 1 }} label={`Per mile (${org.currency})`} keyboardType="decimal-pad" value={v.rate} onChangeText={(t) => set('rate', clean(t))} placeholder="1.50" />
              <Field style={{ flex: 1 }} label="Minimum" keyboardType="decimal-pad" value={v.min} onChangeText={(t) => set('min', clean(t))} placeholder="0" />
            </Row>
          ) : null}
          {v.fee === 'zones' ? (
            <View style={{ marginBottom: space.md }}>
              {v.zones.map((z, i) => (
                <Row key={i} gap={space.md}>
                  <Field style={{ flex: 1 }} label={i === 0 ? 'Up to (miles)' : undefined} keyboardType="decimal-pad" value={z.miles}
                    onChangeText={(t) => set('zones', v.zones.map((x, k) => (k === i ? { ...x, miles: clean(t) } : x)))} placeholder="15" />
                  <Field style={{ flex: 1 }} label={i === 0 ? `Fee (${org.currency})` : undefined} keyboardType="decimal-pad" value={z.fee}
                    onChangeText={(t) => set('zones', v.zones.map((x, k) => (k === i ? { ...x, fee: clean(t) } : x)))} placeholder="0" />
                  <IconButton icon="trash-outline" label="Remove zone" onPress={() => set('zones', v.zones.filter((_, k) => k !== i))} />
                </Row>
              ))}
              <Button small kind="secondary" icon="add" title="Add zone" style={{ alignSelf: 'flex-start' }}
                onPress={() => set('zones', [...v.zones, { miles: '', fee: '' }])} />
            </View>
          ) : null}
          <Field label="Service area (miles, optional)" keyboardType="decimal-pad" value={v.radius} onChangeText={(t) => set('radius', clean(t))}
            placeholder="60" hint="Quotes farther than this show a warning." />
          {v.fee !== 'off' ? (
            <T variant="small" style={{ color: colors.textMuted, marginBottom: space.md }}>
              Example: 10 mi → {example(10)} · 25 mi → {example(25)} · 50 mi → {example(50)}
            </T>
          ) : null}
        </>
      ) : null}

      <Button title={dirty ? 'Save where you work' : 'Saved'} icon="checkmark" onPress={save} loading={busy} disabled={!dirty} />
    </Card>
  );
}

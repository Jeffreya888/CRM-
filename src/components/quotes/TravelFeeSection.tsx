import { useState } from 'react';
import { View } from 'react-native';
import { Button, Card, Field, Ionicons, Row, Section, Segmented, T } from '../ui';
import { money } from '../../lib/format';
import { pointOf } from '../../lib/geo';
import { supabase } from '../../lib/supabase';
import { colors, space } from '../../lib/theme';
import { drivingMiles, travelFee, type Point } from '../../lib/travel';
import type { Organization } from '../../lib/types';

/** Line items whose description starts with this are travel fee lines (replaced, not duplicated). */
export const TRAVEL_LINE = 'Travel fee';
export const isTravelLine = (description: string) => description.startsWith(TRAVEL_LINE);

/**
 * Quote → "Where": mobile or shop, and for mobile work the travel fee from the
 * company's settings (distance estimated from the base address to the
 * facility or the customer's service address; editable).
 */
export function TravelFeeSection({ org, mode, onMode, miles, onMiles, customerId, locationId, onApply }: {
  org: Organization; mode: 'mobile' | 'shop'; onMode: (m: 'mobile' | 'shop') => void;
  miles: string; onMiles: (m: string) => void; customerId: string | null; locationId: string | null;
  onApply: (line: { description: string; unit_price: number } | null) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const base = pointOf(org.base_lat, org.base_lng);
  const feeOn = org.travel_fee_mode !== 'off';
  const m = Number(miles);
  const quote = miles !== '' && Number.isFinite(m) ? travelFee(org, m) : null;

  const estimate = async () => {
    setNote(null);
    if (!base) return setNote('Add your base address in Settings → Where you work to estimate distances.');
    setBusy(true);
    try {
      let dest: Point | null = null;
      let from = '';
      if (locationId) {
        const { data } = await supabase.from('locations').select('name, latitude, longitude').eq('id', locationId).maybeSingle();
        dest = pointOf(data?.latitude, data?.longitude);
        from = data?.name ?? 'the facility';
      }
      if (!dest && customerId) {
        const { data } = await supabase.from('customers').select('service_address, service_lat, service_lng').eq('id', customerId).maybeSingle();
        dest = pointOf(data?.service_lat, data?.service_lng);
        from = data?.service_address ?? '';
      }
      if (!dest) return setNote("No map location for this customer yet. Add their service address on the customer page, or type the miles.");
      const d = drivingMiles(base, dest);
      onMiles(String(d));
      setNote(`About ${d} miles to ${from}. Adjust it if you know the exact drive.`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Section title="Where" icon="navigate-outline">
      {org.service_mode === 'both' ? (
        <Segmented value={mode} onChange={onMode} options={[{ value: 'mobile', label: 'We come to them' }, { value: 'shop', label: 'They bring it in' }]} />
      ) : null}
      {mode === 'shop' ? (
        <Card><Row><Ionicons name="storefront-outline" size={20} color={colors.textMuted} /><T variant="muted" style={{ flex: 1 }}>Drop-off at {org.base_address ?? 'your shop'}. No travel fee.</T></Row></Card>
      ) : feeOn ? (
        <Card>
          <Row gap={space.md} style={{ alignItems: 'flex-end' }}>
            <Field style={{ flex: 1, marginBottom: 0 }} label="Distance one way (miles)" keyboardType="decimal-pad" value={miles}
              onChangeText={(t) => onMiles(t.replace(/[^0-9.]/g, ''))} placeholder="0" />
            <Button small kind="secondary" icon="map-outline" title="Estimate" onPress={estimate} loading={busy} />
          </Row>
          {note ? <T variant="small" style={{ marginTop: space.sm }}>{note}</T> : null}
          {quote ? (
            <View style={{ marginTop: space.md }}>
              {quote.outsideArea ? (
                <Row gap={6} style={{ marginBottom: space.sm }}>
                  <Ionicons name="warning-outline" size={16} color={colors.warning} />
                  <T variant="small" style={{ color: colors.warning, flex: 1 }}>
                    {quote.noZone ? 'Farther than your last travel zone. Set the fee by hand if you take the job.' : `Outside your ${org.service_radius_miles}-mile service area.`}
                  </T>
                </Row>
              ) : null}
              <Row style={{ justifyContent: 'space-between' }}>
                <T>Travel fee</T>
                <T style={{ fontWeight: '700' }}>{quote.fee ? money(quote.fee, org.currency) : 'Free'}</T>
              </Row>
              <Button small icon="add" title={quote.fee ? 'Add to quote' : 'Remove travel fee line'} style={{ marginTop: space.sm, alignSelf: 'flex-start' }}
                onPress={() => onApply(quote.fee ? { description: quote.label, unit_price: quote.fee } : null)} />
            </View>
          ) : null}
        </Card>
      ) : (
        <T variant="small">Mobile job. Set up a travel fee in Settings → Where you work to add it here automatically.</T>
      )}
    </Section>
  );
}

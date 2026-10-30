import { useState } from 'react';
import { View } from 'react-native';
import { Button, Field, Ionicons, Row, T } from '../ui';
import { callFunction, supabase } from '../../lib/supabase';
import { colors, space } from '../../lib/theme';
import type { AircraftCategory } from '../../lib/types';
import { categoryLabel, VEHICLE_CATEGORIES } from '../../lib/pricing';
import { classifyVehicle, isValidVin, normalizeVin, parseNhtsa, tidyMake } from '../../lib/vin';

export type VinFound = {
  vin: string; manufacturer: string; model: string; year: number | null;
  category: AircraftCategory; model_id: string | null; length_ft: number | null;
};

/** Finds the catalog model for a decoded make/model (e.g. "TOYOTA" + "RAV4"). */
async function catalogMatch(make: string, model: string) {
  const { data } = await supabase.from('aircraft_models').select('id, manufacturer, model, category, length_ft')
    .ilike('manufacturer', make).in('category', VEHICLE_CATEGORIES.map((c) => c.value)).limit(200);
  const m = model.toLowerCase();
  const rows = (data ?? []) as { id: string; manufacturer: string; model: string; category: AircraftCategory; length_ft: number | null }[];
  // Exact name first, then the longest catalog name the decoded model starts with ("Silverado 1500 LT" → "Silverado 1500").
  return rows.find((r) => r.model.toLowerCase() === m)
    ?? rows.filter((r) => m.startsWith(r.model.toLowerCase()) || r.model.toLowerCase().startsWith(m))
      .sort((a, b) => b.model.length - a.model.length)[0] ?? null;
}

/**
 * VIN field with "Look up": fills year, make, model and size class from
 * NHTSA's database (like the FAA lookup for aircraft). Everything stays editable.
 */
export function VinLookup({ vin, onVin, onFound }: { vin: string; onVin: (v: string) => void; onFound: (f: VinFound) => void }) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ tone: 'ok' | 'warn'; text: string } | null>(null);
  const v = normalizeVin(vin);

  const lookup = async () => {
    setNote(null);
    if (!isValidVin(v)) {
      setNote({ tone: 'warn', text: v.length === 17 ? 'That VIN doesn’t pass the check digit. Check for typos (it never uses I, O or Q).' : 'A VIN has 17 letters and numbers.' });
      return;
    }
    setBusy(true);
    try {
      const d = parseNhtsa(await callFunction('vin-lookup', { vin: v }));
      if (!d) { setNote({ tone: 'warn', text: 'No match for this VIN. Enter the make and model below.' }); return; }
      const make = tidyMake(d.make);
      const hit = d.model ? await catalogMatch(make, d.model) : null;
      const category = hit?.category ?? classifyVehicle(d);
      onFound({
        vin: v, manufacturer: hit?.manufacturer ?? make, model: hit?.model ?? d.model ?? '', year: d.year,
        category, model_id: hit?.id ?? null, length_ft: hit?.length_ft ?? null,
      });
      setNote({ tone: 'ok', text: `${[d.year, make, d.model, d.trim].filter(Boolean).join(' ')} · ${categoryLabel(category)}` });
    } catch (e: any) {
      setNote({ tone: 'warn', text: e.message ?? 'VIN lookup is unavailable right now.' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ marginBottom: space.md }}>
      <Row gap={space.sm} style={{ alignItems: 'flex-end' }}>
        <Field style={{ flex: 1, marginBottom: 0 }} label="VIN (optional)" placeholder="17 characters" autoCapitalize="characters" autoCorrect={false}
          maxLength={17} value={vin} onChangeText={(t) => { onVin(t.toUpperCase()); setNote(null); }} />
        <Button small kind="secondary" icon="search-outline" title="Look up" onPress={lookup} loading={busy} disabled={v.length < 11} />
      </Row>
      {note ? (
        <Row gap={6} style={{ marginTop: space.xs }}>
          <Ionicons name={note.tone === 'ok' ? 'checkmark-circle' : 'alert-circle-outline'} size={16} color={note.tone === 'ok' ? colors.success : colors.warning} />
          <T variant="small" style={{ flex: 1, color: note.tone === 'ok' ? colors.success : colors.warning }}>{note.text}</T>
        </Row>
      ) : (
        <T variant="small" style={{ marginTop: space.xs }}>Fills in year, make, model and size class.</T>
      )}
    </View>
  );
}

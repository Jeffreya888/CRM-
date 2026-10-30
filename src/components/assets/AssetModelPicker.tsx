import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { searchModels, widthLabel } from '../../lib/assets';
import { categoryLabel } from '../../lib/pricing';
import { colors, radius, space } from '../../lib/theme';
import type { AircraftModel } from '../../lib/types';
import { Badge, Field, Ionicons, Row, T } from '../ui';

/**
 * Type-ahead over the built-in model catalog (`aircraft_models`): aircraft for
 * `assetType="aircraft"`, boats for `assetType="watercraft"`. Typing "G650" lists
 * "Gulfstream G650ER"; picking one calls `onPick` with manufacturer, model,
 * size class and dimensions so the form can fill them in. Anything typed that
 * isn't picked stays as free text (`onChangeText`), so custom entries work too.
 *
 * Reusable: `import { AssetModelPicker } from '../components/assets/AssetModelPicker'`.
 */
export function AssetModelPicker({
  assetType,
  text,
  onChangeText,
  onPick,
  selectedId,
  label,
  placeholder,
}: {
  assetType: 'aircraft' | 'watercraft' | 'vehicle';
  /** Current free text (usually "Manufacturer Model"). */
  text: string;
  onChangeText: (text: string) => void;
  onPick: (model: AircraftModel) => void;
  /** model_id currently linked, to show the "From catalog" badge. */
  selectedId?: string | null;
  label?: string;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<AircraftModel[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || text.trim().length < 2) return;
    let cancelled = false;
    const t = setTimeout(async () => {
      setBusy(true);
      try {
        const r = await searchModels(text, assetType);
        if (!cancelled) { setResults(r); setError(null); }
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? 'Search failed');
      } finally {
        if (!cancelled) setBusy(false);
      }
    }, 250);
    return () => { cancelled = true; clearTimeout(t); };
  }, [text, open, assetType]);

  const boats = assetType === 'watercraft';
  const cars = assetType === 'vehicle';
  const showList = open && text.trim().length >= 2;

  return (
    <View style={{ marginBottom: space.lg }}>
      <Field
        label={label ?? (boats || cars ? 'Make & model' : 'Aircraft type')}
        icon="search"
        placeholder={placeholder ?? (boats ? 'e.g. Boston Whaler 280 Outrage' : cars ? 'e.g. Toyota Tacoma, Tahoe, Model Y' : 'e.g. G650, Citation CJ4, King Air 350')}
        value={text}
        autoCorrect={false}
        onChangeText={(v) => {
          onChangeText(v);
          setOpen(true);
          if (v.trim().length < 2) setResults([]);
        }}
        hint={selectedId && !showList ? undefined : boats ? 'Pick a model to fill in size and beam, or keep typing your own.' : cars ? 'Pick a model to set the size class, or keep typing your own.' : 'Pick a model to fill in size class, length and wingspan, or keep typing your own.'}
        style={{ marginBottom: selectedId && !showList ? space.sm : 0 }}
      />
      {selectedId && !showList ? (
        <Row gap={6}>
          <Badge label="From catalog" tone="success" raw />
          <T variant="small">Size details filled in. Edit them if needed.</T>
        </Row>
      ) : null}
      {showList ? (
        <View style={{ marginTop: space.sm, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, overflow: 'hidden' }}>
          {busy && !results.length ? <ActivityIndicator color={colors.primary} style={{ padding: space.md }} /> : null}
          {error ? <T variant="small" style={{ color: colors.danger, padding: space.md }}>{error}</T> : null}
          {!busy && !error && !results.length ? (
            <T variant="muted" style={{ padding: space.md }}>No catalog match. We&apos;ll save what you typed.</T>
          ) : null}
          {results.slice(0, 8).map((m, i) => (
            <Pressable
              key={m.id}
              onPress={() => { onPick(m); setOpen(false); }}
              style={({ pressed }) => [
                { paddingVertical: 10, paddingHorizontal: space.md, flexDirection: 'row', alignItems: 'center', gap: space.sm },
                i > 0 && { borderTopWidth: 1, borderTopColor: colors.border },
                pressed && { backgroundColor: colors.cardRaised },
              ]}
            >
              <Ionicons name={boats ? 'boat-outline' : cars ? (m.category === 'motorcycle' ? 'bicycle-outline' : 'car-outline') : m.category === 'helicopter' ? 'navigate-outline' : 'airplane-outline'} size={18} color={colors.primaryText} />
              <View style={{ flex: 1 }}>
                <T style={{ fontWeight: '600' }}>{m.manufacturer} {m.model}</T>
                <T variant="small">
                  {[categoryLabel(m.category), m.length_ft ? `${m.length_ft} ft long` : null, m.wingspan_ft ? `${widthLabel(assetType).toLowerCase()} ${m.wingspan_ft} ft` : null].filter(Boolean).join(' · ')}
                </T>
              </View>
            </Pressable>
          ))}
          <Pressable onPress={() => setOpen(false)} style={({ pressed }) => [{ padding: space.md, borderTopWidth: 1, borderTopColor: colors.border }, pressed && { backgroundColor: colors.cardRaised }]}>
            <T variant="muted">{text.trim() ? `Use "${text.trim()}" as typed` : 'Close'}</T>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

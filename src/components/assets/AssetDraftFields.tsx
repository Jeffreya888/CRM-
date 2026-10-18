import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { boatClassForLength, splitFreeText, widthLabel, type AssetDraft } from '../../lib/assets';
import { categoriesFor } from '../../lib/pricing';
import { space } from '../../lib/theme';
import { Field, Row, Select } from '../ui';
import { AssetModelPicker } from './AssetModelPicker';

/**
 * The type-specific fields of an asset:
 * - aircraft: catalog type picker, tail number, class, length, wingspan
 * - vehicle: make, model, year, plate, VIN, size class
 * - watercraft: catalog boat picker, vessel name, hull id, class, length, beam
 */
export function AssetDraftFields({ draft, onChange, belowTail }: {
  draft: AssetDraft;
  onChange: (d: AssetDraft) => void;
  /** Rendered right under the tail number / vessel name (e.g. the FAA card). */
  belowTail?: ReactNode;
}) {
  const set = (patch: Partial<AssetDraft>) => onChange({ ...draft, ...patch });
  const t = draft.asset_type;
  const [typeText, setTypeText] = useState([draft.manufacturer, draft.model].filter(Boolean).join(' '));
  const classOptions = categoriesFor(t).map((c) => ({ value: c.value, label: c.label, hint: c.examples || undefined }));

  if (t === 'vehicle') {
    return (
      <View>
        <Row gap={space.sm}>
          <Field style={{ flex: 1 }} label="Make" placeholder="Porsche" value={draft.manufacturer} onChangeText={(v) => set({ manufacturer: v })} />
          <Field style={{ flex: 1 }} label="Model" placeholder="911 Carrera" value={draft.model} onChangeText={(v) => set({ model: v })} />
        </Row>
        <Row gap={space.sm}>
          <Field style={{ flex: 1 }} label="Year" placeholder="2022" keyboardType="number-pad" maxLength={4} value={draft.year} onChangeText={(v) => set({ year: v })} />
          <Field style={{ flex: 1 }} label="License plate" placeholder="ABC1234" autoCapitalize="characters" value={draft.plate} onChangeText={(v) => set({ plate: v })} />
        </Row>
        <Field label="VIN (optional)" autoCapitalize="characters" autoCorrect={false} maxLength={17} value={draft.vin} onChangeText={(v) => set({ vin: v })} />
        <Field label="Nickname (optional)" placeholder="e.g. Blue Tahoe" hint="Shown instead of the plate if set." value={draft.tail_number} onChangeText={(v) => set({ tail_number: v })} />
        <Select label="Size class" value={draft.category} options={classOptions} onChange={(v) => v && set({ category: v })} inline />
        <Field label="Length (ft, optional)" keyboardType="decimal-pad" value={draft.length_ft} onChangeText={(v) => set({ length_ft: v })} />
      </View>
    );
  }

  const boats = t === 'watercraft';
  const tailField = (
    <>
      <Field
        label={boats ? 'Vessel name *' : 'Tail number *'}
        placeholder={boats ? 'Sea Breeze' : 'N123AB'}
        autoCapitalize={boats ? 'words' : 'characters'}
        autoCorrect={false}
        value={draft.tail_number}
        onChangeText={(v) => set({ tail_number: v })}
      />
      {belowTail}
    </>
  );
  return (
    <View>
      {/* Aircraft: the tail number comes first so the FAA lookup can fill in the rest. */}
      {boats ? null : tailField}
      <AssetModelPicker
        assetType={boats ? 'watercraft' : 'aircraft'}
        text={typeText}
        selectedId={draft.model_id}
        onChangeText={(text) => {
          setTypeText(text);
          const g = splitFreeText(text, t, Number(draft.length_ft) || null);
          set({ manufacturer: g.manufacturer, model: g.model, model_id: null, category: boats ? draft.category : g.category });
        }}
        onPick={(m) => { setTypeText(`${m.manufacturer} ${m.model}`); set({
          manufacturer: m.manufacturer, model: m.model, model_id: m.id, category: m.category,
          length_ft: m.length_ft != null ? String(m.length_ft) : draft.length_ft,
          wingspan_ft: m.wingspan_ft != null ? String(m.wingspan_ft) : draft.wingspan_ft,
        }); }}
      />
      {boats ? tailField : null}
      {boats ? (
        <Row gap={space.sm}>
          <Field style={{ flex: 1 }} label="Hull ID (optional)" autoCapitalize="characters" value={draft.hull_id} onChangeText={(v) => set({ hull_id: v })} />
          <Field style={{ flex: 1 }} label="Year" keyboardType="number-pad" maxLength={4} value={draft.year} onChangeText={(v) => set({ year: v })} />
        </Row>
      ) : null}
      <Select label={boats ? 'Boat class' : 'Size class'} value={draft.category} options={classOptions} onChange={(v) => v && set({ category: v })} searchable={!boats} />
      <Row gap={space.sm}>
        <Field
          style={{ flex: 1 }} label="Length (ft)" keyboardType="decimal-pad" value={draft.length_ft}
          onChangeText={(v) => set(boats && !draft.model_id ? { length_ft: v, category: boatClassForLength(Number(v) || null) } : { length_ft: v })}
        />
        <Field style={{ flex: 1 }} label={`${widthLabel(t)} (ft)`} keyboardType="decimal-pad" value={draft.wingspan_ft} onChangeText={(v) => set({ wingspan_ft: v })} />
      </Row>
    </View>
  );
}

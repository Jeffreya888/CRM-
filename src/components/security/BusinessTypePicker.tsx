import { Pressable, View } from 'react-native';
import { assetTypeInfo } from '../../lib/pricing';
import { colors, radius, space } from '../../lib/theme';
import type { AssetType } from '../../lib/types';
import { Ionicons, Row, T } from '../ui';

export const businessTypesKey = (v: AssetType[]) => [...v].sort().join(',');

const ORDER: AssetType[] = ['aircraft', 'watercraft', 'vehicle'];
const HINTS: Record<AssetType, string> = {
  aircraft: 'Private, charter and corporate aircraft',
  watercraft: 'Boats and yachts',
  vehicle: 'Cars, trucks, vans, RVs and motorcycles',
};

/** Normalizes saved metadata to a list of business types (defaults to aircraft). */
export function toBusinessTypes(raw: unknown): AssetType[] {
  const list = Array.isArray(raw) ? ORDER.filter((t) => raw.includes(t)) : [];
  return list.length ? list : ['aircraft'];
}

/** "What do you detail?" at sign-up and onboarding: any combination, at least one. */
export function BusinessTypePicker({ value, onChange }: { value: AssetType[]; onChange: (v: AssetType[]) => void }) {
  const toggle = (t: AssetType) => {
    const next = value.includes(t) ? value.filter((x) => x !== t) : [...value, t];
    if (next.length) onChange(ORDER.filter((x) => next.includes(x)));
  };
  return (
    <View style={{ gap: space.sm, marginBottom: space.lg }}>
      {ORDER.map((t) => {
        const on = value.includes(t);
        const info = assetTypeInfo(t);
        return (
          <Pressable key={t} accessibilityRole="checkbox" accessibilityState={{ checked: on }} onPress={() => toggle(t)}
            style={({ pressed }) => [{
              borderWidth: 1.5, borderColor: on ? colors.primary : colors.borderStrong, backgroundColor: on ? colors.primarySoft : colors.input,
              borderRadius: radius.md, padding: space.md,
            }, pressed && { opacity: 0.8 }]}>
            <Row gap={space.md}>
              <Ionicons name={info.icon} size={22} color={on ? colors.primaryText : colors.textMuted} />
              <View style={{ flex: 1 }}>
                <T style={{ fontWeight: '700' }}>{info.plural}</T>
                <T variant="small">{HINTS[t]}</T>
              </View>
              <Ionicons name={on ? 'checkbox' : 'square-outline'} size={22} color={on ? colors.primary : colors.textFaint} />
            </Row>
          </Pressable>
        );
      })}
      <T variant="small">Pick everything you detail. You’ll only see tools for these, and you can add more later in Settings. Your price stays the same.</T>
    </View>
  );
}

import { Pressable, View } from 'react-native';
import { assetTypeInfo, BUSINESS_TYPE_CHOICES } from '../../lib/pricing';
import { colors, radius, space } from '../../lib/theme';
import type { AssetType } from '../../lib/types';
import { Ionicons, Row, T } from '../ui';

export const businessTypesKey = (v: AssetType[]) => [...v].sort().join(',');

/** Normalizes saved metadata to one of the three choices (defaults to aircraft only). */
export function toBusinessTypes(raw: unknown): AssetType[] {
  const list = Array.isArray(raw) ? raw.filter((x): x is AssetType => x === 'aircraft' || x === 'vehicle' || x === 'watercraft') : [];
  const match = BUSINESS_TYPE_CHOICES.find((c) => businessTypesKey(c.value) === businessTypesKey(list.includes('aircraft') ? list : ['aircraft', ...list]));
  return match ? match.value : ['aircraft'];
}

/** The three "what do you detail?" choices shown at sign-up and onboarding. */
export function BusinessTypePicker({ value, onChange }: { value: AssetType[]; onChange: (v: AssetType[]) => void }) {
  return (
    <View style={{ gap: space.sm, marginBottom: space.lg }}>
      {BUSINESS_TYPE_CHOICES.map((c) => {
        const on = businessTypesKey(c.value) === businessTypesKey(value);
        return (
          <Pressable key={c.label} accessibilityRole="radio" accessibilityState={{ checked: on }} onPress={() => onChange(c.value)}
            style={({ pressed }) => [{
              borderWidth: 1.5, borderColor: on ? colors.primary : colors.borderStrong, backgroundColor: on ? colors.primarySoft : colors.input,
              borderRadius: radius.md, padding: space.md,
            }, pressed && { opacity: 0.8 }]}>
            <Row gap={space.md}>
              <Row gap={4}>
                {c.value.map((t) => <Ionicons key={t} name={assetTypeInfo(t).icon} size={20} color={on ? colors.primaryText : colors.textMuted} />)}
              </Row>
              <View style={{ flex: 1 }}>
                <T style={{ fontWeight: '700' }}>{c.label}</T>
                <T variant="small">{c.hint}</T>
              </View>
              <Ionicons name={on ? 'radio-button-on' : 'radio-button-off'} size={22} color={on ? colors.primary : colors.textFaint} />
            </Row>
          </Pressable>
        );
      })}
      <T variant="small">You can add more later in Settings. Your price stays the same.</T>
    </View>
  );
}

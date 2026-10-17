import { View } from 'react-native';
import { colors, space } from '../../lib/theme';
import { Card, Ionicons, Section, T, type IconName } from '../ui';

/** A titled card with a bullet list (products, tools, prep, do-nots...). */
export function BulletSection({ title, icon, items, color, bullet = 'ellipse' }: {
  title: string; icon: IconName; items: string[]; color?: string; bullet?: 'ellipse' | 'close-circle' | 'checkmark-circle' | 'camera';
}) {
  if (!items.length) return null;
  const c = color ?? colors.primary;
  return (
    <Section title={title} icon={icon} iconColor={c}>
      <Card>
        {items.map((x, i) => (
          <View key={i} style={{ flexDirection: 'row', gap: space.sm, paddingVertical: 5, alignItems: 'flex-start' }}>
            <Ionicons name={bullet} size={bullet === 'ellipse' ? 7 : 16} color={c} style={{ marginTop: bullet === 'ellipse' ? 8 : 3 }} />
            <T style={{ flex: 1, lineHeight: 22 }}>{x}</T>
          </View>
        ))}
      </Card>
    </Section>
  );
}

export function StepNumber({ n, active }: { n: number; active?: boolean }) {
  return (
    <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: active ? colors.primary : colors.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
      <T variant="small" style={{ color: active ? colors.white : colors.primaryText, fontWeight: '800' }}>{n}</T>
    </View>
  );
}

/** Highlighted caution text under a step. */
export function Caution({ text }: { text: string }) {
  return (
    <View style={{ flexDirection: 'row', gap: space.sm, backgroundColor: colors.warningSoft, borderRadius: 10, padding: space.md, marginTop: space.sm, alignItems: 'flex-start' }}>
      <Ionicons name="warning" size={18} color={colors.warning} style={{ marginTop: 1 }} />
      <T style={{ flex: 1, color: colors.warning, lineHeight: 21 }}>{text}</T>
    </View>
  );
}

export function Disclaimer({ text }: { text: string }) {
  return (
    <View style={{ flexDirection: 'row', gap: space.sm, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: space.md, marginTop: space.lg, alignItems: 'flex-start' }}>
      <Ionicons name="information-circle-outline" size={18} color={colors.textMuted} style={{ marginTop: 1 }} />
      <T variant="muted" style={{ flex: 1 }}>{text}</T>
    </View>
  );
}

import { format } from 'date-fns';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Row, T } from '../ui';
import { money } from '../../lib/format';
import { colors, space } from '../../lib/theme';

/** Horizontal single-series bars: label + value in text ink, bar in one hue. */
export function BarList<R extends Record<string, any>>({ rows, valueKey, labelKey, format: fmt = (n: number) => money(n), label, sub, empty = 'No data in this period.' }: {
  rows: R[]; valueKey: keyof R & string; labelKey: keyof R & string; format?: (n: number) => string; label?: (r: R) => string; sub?: (r: R) => string | null; empty?: string;
}) {
  if (!rows.length) return <T variant="muted">{empty}</T>;
  const max = Math.max(...rows.map((r) => Math.abs(Number(r[valueKey]))), 1);
  return (
    <View style={{ gap: space.md }}>
      {rows.map((r, i) => {
        const v = Number(r[valueKey]);
        return (
          <View key={`${r[labelKey]}-${i}`}>
            <Row style={{ justifyContent: 'space-between', marginBottom: 4 }}>
              <View style={{ flex: 1 }}>
                <T numberOfLines={1}>{label ? label(r) : String(r[labelKey])}</T>
                {sub?.(r) ? <T variant="small" numberOfLines={1}>{sub(r)}</T> : null}
              </View>
              <T style={{ fontWeight: '700', fontVariant: ['tabular-nums'], color: v < 0 ? colors.danger : colors.text }}>{fmt(v)}</T>
            </Row>
            <View style={{ height: 8, borderRadius: 4, backgroundColor: colors.bg }}>
              <View style={{ height: 8, borderRadius: 4, width: `${Math.max((Math.abs(v) / max) * 100, 1)}%`, backgroundColor: v < 0 ? colors.danger : colors.primary }} />
            </View>
          </View>
        );
      })}
    </View>
  );
}

/** Monthly revenue columns; tap a column to read its exact value. */
export function MonthBars({ rows }: { rows: { month: string; revenue: number }[] }) {
  const [sel, setSel] = useState<string | null>(null);
  if (!rows.length) return <T variant="muted">No payments in this period.</T>;
  const max = Math.max(...rows.map((r) => Number(r.revenue)), 1);
  const active = rows.find((r) => r.month === sel) ?? rows[rows.length - 1]!;
  return (
    <View>
      <T variant="muted">{format(new Date(active.month + '-01T00:00:00'), 'MMMM yyyy')}</T>
      <T variant="h3" style={{ marginBottom: space.md }}>{money(active.revenue)}</T>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', height: 140, gap: 2, borderBottomWidth: 1, borderBottomColor: colors.border }}>
        {rows.map((r) => (
          <Pressable key={r.month} onPress={() => setSel(r.month)} style={{ flex: 1, height: '100%', justifyContent: 'flex-end' }} accessibilityLabel={`${r.month}: ${money(r.revenue)}`}>
            <View style={{ height: `${Math.max((Number(r.revenue) / max) * 100, 1)}%`, backgroundColor: r.month === active.month ? colors.primary : colors.primarySoft, borderTopLeftRadius: 4, borderTopRightRadius: 4 }} />
          </Pressable>
        ))}
      </View>
      <Row style={{ justifyContent: 'space-between', marginTop: 4 }}>
        <T variant="small">{format(new Date(rows[0]!.month + '-01T00:00:00'), 'MMM yyyy')}</T>
        <T variant="small">{format(new Date(rows[rows.length - 1]!.month + '-01T00:00:00'), 'MMM yyyy')}</T>
      </Row>
    </View>
  );
}

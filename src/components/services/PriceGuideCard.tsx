import { useState } from 'react';
import { View } from 'react-native';
import { money } from '../../lib/format';
import { adjustPrice, categoryLabel } from '../../lib/pricing';
import { supabase } from '../../lib/supabase';
import { colors, space } from '../../lib/theme';
import type { AircraftCategory } from '../../lib/types';
import { useQuery } from '../../lib/useQuery';
import { Button, Card, Ionicons, Row, SearchBar, Section, T } from '../ui';

type Row_ = { price: number; model: { manufacturer: string; model: string; category: AircraftCategory } | null };

/** Tarmo price guide: suggested price per aircraft model for this service (money users only). */
export function PriceGuideCard({ guideKey, adjustPct }: { guideKey: string | null; adjustPct: number | null | undefined }) {
  const [search, setSearch] = useState('');
  const [all, setAll] = useState(false);
  const q = useQuery(async () => {
    if (!guideKey) return [] as Row_[];
    const r = await supabase.from('price_guide').select('price, model:aircraft_models(manufacturer, model, category)').eq('guide_key', guideKey);
    if (r.error) throw r.error;
    return ((r.data ?? []) as unknown as Row_[])
      .filter((x) => x.model)
      .sort((a, b) => `${a.model!.manufacturer} ${a.model!.model}`.localeCompare(`${b.model!.manufacturer} ${b.model!.model}`));
  }, [guideKey]);

  const rows = q.data ?? [];
  const pct = Number(adjustPct) || 0;
  const s = search.trim().toLowerCase();
  const filtered = rows.filter((r) => !s || `${r.model!.manufacturer} ${r.model!.model}`.toLowerCase().includes(s));
  const shown = all || s ? filtered : filtered.slice(0, 8);

  return (
    <Section title="Tarmo price guide" icon="pricetags-outline" iconColor={colors.success}>
      {q.loading ? null : rows.length === 0 ? (
        <Card>
          <Row gap={space.md} style={{ alignItems: 'flex-start' }}>
            <Ionicons name="time-outline" size={22} color={colors.textMuted} />
            <View style={{ flex: 1 }}>
              <T style={{ fontWeight: '700' }}>Coming soon: suggested prices per aircraft model</T>
              <T variant="muted" style={{ marginTop: 2 }}>
                We&apos;re adding a suggested price for every aircraft model. Your regional adjustment{pct ? ` (${pct > 0 ? '+' : ''}${pct}%)` : ''} will be applied automatically. Your own prices above are always used on quotes and jobs.
              </T>
            </View>
          </Row>
        </Card>
      ) : (
        <>
          <T variant="small" style={{ marginBottom: space.sm }}>
            Suggested prices per model{pct ? `, including your ${pct > 0 ? '+' : ''}${pct}% regional adjustment` : ''}. Change the adjustment in Settings.
          </T>
          {rows.length > 8 ? <SearchBar value={search} onChange={setSearch} placeholder="Search aircraft models..." /> : null}
          <Card style={{ padding: 0, overflow: 'hidden' }}>
            {shown.map((r, i) => (
              <Row key={`${r.model!.manufacturer}-${r.model!.model}`} style={{ justifyContent: 'space-between', paddingHorizontal: space.lg, paddingVertical: space.md, borderTopWidth: i ? 1 : 0, borderTopColor: colors.border }}>
                <View style={{ flex: 1 }}>
                  <T style={{ fontWeight: '600' }}>{r.model!.manufacturer} {r.model!.model}</T>
                  <T variant="small">{categoryLabel(r.model!.category)}</T>
                </View>
                <T style={{ color: colors.success, fontWeight: '700' }}>{money(adjustPrice(Number(r.price), pct))}</T>
              </Row>
            ))}
            {shown.length === 0 ? <T variant="muted" style={{ padding: space.lg }}>No models match.</T> : null}
          </Card>
          {!s && filtered.length > 8 ? (
            <Button small kind="ghost" title={all ? 'Show fewer' : `Show all ${filtered.length} models`} onPress={() => setAll((v) => !v)} />
          ) : null}
        </>
      )}
    </Section>
  );
}

import { View } from 'react-native';
import { Ionicons, Row, T } from '../ui';
import { money } from '../../lib/format';
import { useOrg } from '../../lib/session';
import { supabase } from '../../lib/supabase';
import { colors, radius, space } from '../../lib/theme';
import { useQuery } from '../../lib/useQuery';
import { hoursText } from './costingFormat';

/** public.quote_estimate result (docs/competitive-edge.md §11). */
export interface QuoteEstimate {
  hourly_cost: number;
  options: { option_id: string | null; name: string; revenue: number; est_hours: number; labor: number; supplies: number; cost: number; profit: number; margin_pct: number | null }[];
}

const LOW_MARGIN = 30;

/**
 * Slim "Est. cost $410 · margin 62% · 6.0 h" banner for a saved quote. Only for
 * people who can see reports; hidden on any error so it never gets in the way.
 */
export function QuoteMarginBanner({ quoteId, selectedOptionId, refreshKey, note }: { quoteId: string; selectedOptionId?: string | null; refreshKey?: unknown; note?: string }) {
  const { perm } = useOrg();
  if (!perm('see_reports')) return null;
  return <Banner quoteId={quoteId} selectedOptionId={selectedOptionId} refreshKey={refreshKey} note={note} />;
}

function Banner({ quoteId, selectedOptionId, refreshKey, note }: { quoteId: string; selectedOptionId?: string | null; refreshKey?: unknown; note?: string }) {
  const { org } = useOrg();
  const cur = org.currency;
  const q = useQuery(async () => {
    const { data, error } = await supabase.rpc('quote_estimate', { p_quote: quoteId });
    if (error) throw error;
    return data as QuoteEstimate | null;
  }, [quoteId, refreshKey]);
  const all = (q.error ? [] : q.data?.options ?? []).filter((o) => Number(o.revenue) > 0 || Number(o.cost) > 0);
  if (!all.length) return null;

  const chosen = selectedOptionId ? all.find((o) => o.option_id === selectedOptionId) : null;
  const shown = chosen ? [chosen] : all;
  const low = (m: number | null) => m != null && Number(m) < LOW_MARGIN;
  const anyLow = shown.some((o) => low(o.margin_pct));
  const line = (o: QuoteEstimate['options'][number]) =>
    `Est. cost ${money(o.cost, cur)} · margin ${o.margin_pct == null ? '—' : `${Math.round(Number(o.margin_pct))}%`} · ${hoursText(o.est_hours)}`;

  return (
    <View style={{
      borderRadius: radius.md, borderWidth: 1, paddingVertical: space.sm, paddingHorizontal: space.md, marginBottom: space.md,
      borderColor: anyLow ? colors.danger : colors.border, backgroundColor: anyLow ? colors.dangerSoft : colors.cardRaised,
    }}>
      {shown.length === 1 ? (
        <Row gap={6}>
          <Ionicons name="calculator-outline" size={15} color={low(shown[0]!.margin_pct) ? colors.danger : colors.primaryText} />
          <T variant="small" style={{ flex: 1, color: low(shown[0]!.margin_pct) ? colors.danger : colors.text }}>
            {shown.length < all.length || all.length > 1 ? `${shown[0]!.name}: ` : ''}{line(shown[0]!)}
          </T>
        </Row>
      ) : shown.map((o, i) => (
        <Row key={o.option_id ?? i} gap={6} style={{ paddingVertical: 1 }}>
          {i === 0 ? <Ionicons name="calculator-outline" size={15} color={colors.primaryText} /> : <View style={{ width: 15 }} />}
          <T variant="small" style={{ flex: 1, color: low(o.margin_pct) ? colors.danger : colors.text }}>
            <T variant="small" style={{ fontWeight: '700', color: low(o.margin_pct) ? colors.danger : colors.text }}>{o.name || `Option ${i + 1}`}: </T>{line(o)}
          </T>
        </Row>
      ))}
      {anyLow ? <T variant="small" style={{ color: colors.danger, marginTop: 2 }}>Margin is under {LOW_MARGIN}% — check the price or estimated hours.</T> : null}
      {note ? <T variant="small" style={{ marginTop: 2 }}>{note}</T> : null}
    </View>
  );
}

// Founder dashboard: the companies to contact this week.
import * as Linking from 'expo-linking';
import { Card, ErrorBanner, IconButton, ListRow, Loading, Section, T } from '../ui';
import { colors } from '../../lib/theme';
import { date, relative, titleCase } from '../../lib/format';
import { must, supabase } from '../../lib/supabase';
import { useQuery } from '../../lib/useQuery';

type Item = { id: string; name: string; owner_email: string | null; trial_ends_at?: string; last_active?: string | null; plan?: string; status?: string; locations?: number; hq_org_id?: string };
export type AttentionData = { trials_ending: Item[]; payment_failed: Item[]; inactive_paid: Item[]; networks_overdue: Item[] };

export const attentionCount = (a?: AttentionData | null) =>
  a ? a.trials_ending.length + a.payment_failed.length + a.inactive_paid.length + a.networks_overdue.length : undefined;

export function useAttention() {
  return useQuery(async () => (await must(supabase.rpc('platform_attention'))) as AttentionData, []);
}

export function Attention({ q, onOpen }: { q: ReturnType<typeof useAttention>; onOpen: (orgId: string) => void }) {
  const a = q.data;
  const email = (i: Item) => (i.owner_email
    ? <IconButton icon="mail-outline" color={colors.primary} label={`Email ${i.owner_email}`} onPress={() => Linking.openURL(`mailto:${i.owner_email}`)} />
    : undefined);
  const group = (title: string, icon: any, hint: string, items: Item[], meta: (i: Item) => string, tone: 'warning' | 'danger' | 'info') => (
    <Section title={title} icon={icon} count={String(items.length)}>
      {items.length === 0 ? <T variant="muted">{hint}</T> : (
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          {items.map((i) => (
            <ListRow key={i.id} icon="business-outline" tone={tone} title={i.name} subtitle={i.owner_email ?? 'No owner email'} meta={meta(i)}
              onPress={() => onOpen(i.hq_org_id ?? i.id)} right={email(i)} />
          ))}
        </Card>
      )}
    </Section>
  );
  return (
    <>
      <T variant="muted" style={{ marginBottom: 8 }}>Tap a company to see its details and help it, or tap the envelope to email the owner.</T>
      <ErrorBanner message={q.error} onRetry={q.reload} />
      {q.loading || !a ? <Loading /> : (
        <>
          {group('Payment failed', 'card-outline', 'No failed payments.', a.payment_failed, (i) => `${titleCase(i.plan ?? '')} · ${String(i.status ?? '').replace('_', ' ')}`, 'danger')}
          {group('Franchise invoices overdue', 'git-network-outline', 'No overdue franchise invoices.', a.networks_overdue, (i) => `${i.locations ?? 0} locations · ${String(i.status ?? '').replace('_', ' ')}`, 'danger')}
          {group('Trials ending in 3 days', 'time-outline', 'No trials ending in the next 3 days.', a.trials_ending, (i) => `ends ${date(i.trial_ends_at!)} · active ${i.last_active ? relative(i.last_active) : 'never'}`, 'warning')}
          {group('Paying, but inactive 14+ days', 'moon-outline', 'Every paying company used Tarmo in the last 14 days.', a.inactive_paid, (i) => `${titleCase(i.plan ?? '')} · last active ${i.last_active ? relative(i.last_active) : 'never'}`, 'info')}
        </>
      )}
    </>
  );
}

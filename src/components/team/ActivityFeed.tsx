import { useState } from 'react';
import { View } from 'react-native';
import { Button, Card, EmptyState, ErrorBanner, ListRow, Loading, type IconName } from '../ui';
import { dateTime } from '../../lib/format';
import { must, supabase } from '../../lib/supabase';
import { useQuery } from '../../lib/useQuery';
import type { Tone } from '../../lib/theme';

export interface AuditRow { id: number; actor: string | null; action: string; entity: string; entity_id: string | null; summary: string | null; created_at: string }

export const ENTITY_LABELS: Record<string, string> = {
  customers: 'Customer', aircraft: 'Asset', jobs: 'Job', quotes: 'Quote', invoices: 'Invoice', payments: 'Payment', services: 'Service', expenses: 'Expense',
  inventory_items: 'Supply item', equipment: 'Equipment', locations: 'Facility', opportunities: 'Lead', branches: 'Company location',
  memberships: 'Team member', pay_periods: 'Pay period',
};
export const entityLabel = (e: string) => ENTITY_LABELS[e] ?? e.replace(/_/g, ' ').replace(/\b\w/, (c) => c.toUpperCase());

const ACTION: Record<string, { icon: IconName; tone: Tone; verb: string }> = {
  created: { icon: 'add-circle-outline', tone: 'success', verb: 'created' },
  updated: { icon: 'create-outline', tone: 'primary', verb: 'updated' },
  deleted: { icon: 'trash-outline', tone: 'danger', verb: 'deleted' },
  closed: { icon: 'lock-closed-outline', tone: 'info', verb: 'closed' },
  reopened: { icon: 'lock-open-outline', tone: 'warning', verb: 'reopened' },
};

const PAGE = 40;

/** Audit log feed (owner/admin; RLS enforces it). */
export function ActivityFeed({ orgId, actor, entity, nameOf }: { orgId: string; actor?: string | null; entity?: string | null; nameOf?: (id: string | null) => string }) {
  const [limit, setLimit] = useState(PAGE);
  const q = useQuery(async () => {
    let qq = supabase.from('audit_log').select('*').eq('org_id', orgId).order('created_at', { ascending: false }).limit(limit);
    if (actor) qq = qq.eq('actor', actor);
    if (entity) qq = qq.eq('entity', entity);
    return ((await must(qq)) ?? []) as AuditRow[];
  }, [orgId, actor, entity, limit]);
  const rows = q.data ?? [];
  if (!q.data) return q.error ? <ErrorBanner message={q.error} onRetry={q.reload} /> : <Loading />;
  return (
    <View>
      <ErrorBanner message={q.error} onRetry={q.reload} />
      {rows.length === 0 ? (
        <Card><EmptyState icon="pulse-outline" title="No activity yet" body="Changes to customers, jobs, quotes, invoices, expenses and the team show up here." /></Card>
      ) : (
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          {rows.map((r) => {
            const a = ACTION[r.action] ?? { icon: 'ellipse-outline' as IconName, tone: 'neutral' as Tone, verb: r.action };
            return (
              <ListRow key={r.id} icon={a.icon} tone={a.tone}
                title={`${entityLabel(r.entity)} ${a.verb}${r.summary ? `: ${r.summary}` : ''}`}
                subtitle={[actor ? null : nameOf?.(r.actor) ?? null, dateTime(r.created_at)].filter(Boolean).join(' · ')} />
            );
          })}
        </Card>
      )}
      {rows.length >= limit ? <Button kind="ghost" title="Load more" onPress={() => setLimit((l) => l + PAGE)} /> : null}
    </View>
  );
}

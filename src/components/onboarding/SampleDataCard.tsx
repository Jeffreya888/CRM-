// "Try with sample data": explore Tarmo with example customers, assets, a quote and jobs, then clear it all.
import { router } from 'expo-router';
import { useState } from 'react';
import { confirmAction, notify } from '../FormSheet';
import { Button, Card, ErrorBanner, Row, T } from '../ui';
import { canAdmin } from '../../lib/plans';
import { useOrg } from '../../lib/session';
import { friendlyError, must, supabase } from '../../lib/supabase';
import { space } from '../../lib/theme';
import { useQuery } from '../../lib/useQuery';

export function SampleDataCard({ onChanged }: { onChanged?: () => void }) {
  const { orgId, role, isDemo } = useOrg();
  const q = useQuery(async () => {
    const [{ data: has }, { count }] = await Promise.all([
      supabase.rpc('has_sample_data', { p_org: orgId }),
      supabase.from('customers').select('id', { count: 'exact', head: true }).eq('org_id', orgId).eq('is_sample', false),
    ]);
    return { has: has === true, real: count ?? 0 };
  }, [orgId]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (isDemo || !canAdmin(role) || !q.data) return null;
  // Offer it to new companies; once real customers exist, only the "clear" option remains.
  if (!q.data.has && q.data.real >= 3) return null;
  const run = async (fn: () => Promise<unknown>, done: () => void) => {
    setBusy(true);
    setError(null);
    try { await fn(); await q.reload(); onChanged?.(); done(); } catch (e: any) { setError(friendlyError(e.message)); } finally { setBusy(false); }
  };
  const load = () => run(() => must(supabase.rpc('load_sample_data', { p_org: orgId })), () =>
    notify('Sample data added', 'Look around: a paid job, a job tomorrow with its SOP checklist, and a quote waiting on the customer. Everything sample is marked “Sample”.'));
  const clear = () => confirmAction('Remove sample data?', 'Removes the sample customers, assets, quote, jobs and invoice. Your own records stay.', () =>
    run(() => must(supabase.rpc('clear_sample_data', { p_org: orgId })), () => notify('Sample data removed', 'You’re starting fresh with your own records.')));

  return (
    <Card>
      <T style={{ fontWeight: '700' }}>{q.data.has ? 'You’re looking at sample data' : 'Try Tarmo with sample data'}</T>
      <T variant="muted" style={{ marginTop: 4 }}>
        {q.data.has
          ? 'Sample customers, assets, a quote and jobs are in your account. Remove them whenever you’re ready to start with your own.'
          : 'See how everything fits together before adding your own: two customers, their aircraft, a quote, a job tomorrow and a paid job. Remove it in one tap.'}
      </T>
      <ErrorBanner message={error} />
      <Row style={{ flexWrap: 'wrap', marginTop: space.md }} gap={space.sm}>
        {q.data.has ? (
          <>
            <Button small icon="briefcase-outline" title="See the sample jobs" onPress={() => router.push('/jobs')} />
            <Button small kind="secondary" icon="trash-outline" title="Remove sample data" onPress={clear} loading={busy} />
          </>
        ) : (
          <Button small icon="sparkles-outline" title="Add sample data" onPress={load} loading={busy} />
        )}
      </Row>
    </Card>
  );
}

// QuickBooks Online: connect, see what's been sent, sync now, choose how far back, disconnect.
// One-way: customers, invoices and payments go from Tarmo to QuickBooks every 10 minutes.
import * as Linking from 'expo-linking';
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Platform, View } from 'react-native';
import { confirmAction, notify } from '../FormSheet';
import { Badge, Button, Card, ErrorBanner, Field, Loading, Row, T } from '../ui';
import { date, relative } from '../../lib/format';
import { go } from '../../lib/billing';
import { callFunction, friendlyError, must, supabase } from '../../lib/supabase';
import { colors, space } from '../../lib/theme';
import { useQuery } from '../../lib/useQuery';

type Status = {
  connected: boolean; company_name?: string | null; environment?: string; connected_at?: string; sync_from?: string;
  last_sync_at?: string | null; last_error?: string | null; needs_reconnect?: boolean;
  customers?: number; invoices?: number; payments?: number; failed?: number;
  recent_errors?: { kind: string; label: string | null; error: string; at: string }[];
};

export function QuickBooksCard({ orgId, isDemo }: { orgId: string; isDemo: boolean }) {
  const params = useLocalSearchParams<{ quickbooks?: string }>();
  const q = useQuery(async () => (await must(supabase.rpc('quickbooks_status', { p_org: orgId }))) as Status, [orgId]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [from, setFrom] = useState('');
  const s = q.data;
  const run = async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key);
    setError(null);
    try { await fn(); await q.reload(); } catch (e: any) { setError(friendlyError(e.message)); } finally { setBusy(null); }
  };
  const connect = () => run('connect', async () => {
    const { url } = await callFunction<{ url: string }>('quickbooks', { action: 'connect', org_id: orgId });
    if (Platform.OS === 'web') go(url); else await Linking.openURL(url);
  });
  const sync = () => run('sync', async () => {
    const r = await callFunction<{ invoices: number; payments: number; error?: string }>('quickbooks', { action: 'sync', org_id: orgId });
    if (r.error) throw new Error(r.error);
    notify('Synced', r.invoices || r.payments ? `Sent ${r.invoices} invoice${r.invoices === 1 ? '' : 's'} and ${r.payments} payment${r.payments === 1 ? '' : 's'}.` : 'Everything is already in QuickBooks.');
  });
  const disconnect = () => confirmAction('Disconnect QuickBooks?', 'Nothing more is sent. What is already in QuickBooks stays there.', () =>
    run('disconnect', () => callFunction('quickbooks', { action: 'disconnect', org_id: orgId })));
  const saveFrom = () => run('from', async () => {
    await must(supabase.rpc('quickbooks_set_sync_from', { p_org: orgId, p_from: from }));
    notify('Saved', 'Invoices from that date are sent on the next sync.');
    setFrom('');
  });

  if (q.loading) return <Card><Loading /></Card>;
  return (
    <Card>
      {params.quickbooks === 'connected' && s?.connected ? <T style={{ color: colors.success, marginBottom: space.sm }}>QuickBooks is connected. Your invoices are on their way.</T> : null}
      {params.quickbooks === 'failed' ? <T style={{ color: colors.danger, marginBottom: space.sm }}>QuickBooks didn&apos;t connect. Please try again.</T> : null}
      <ErrorBanner message={error ?? q.error} onRetry={q.reload} />
      {!s?.connected ? (
        <>
          <T variant="muted" style={{ marginBottom: space.md }}>
            Send your customers, invoices and payments to QuickBooks Online automatically, so your books are always up to date without
            typing anything twice. It goes one way, Tarmo to QuickBooks, every 10 minutes.
          </T>
          <Button icon="link-outline" title="Connect QuickBooks" onPress={connect} loading={busy === 'connect'} disabled={isDemo} />
          {isDemo ? <T variant="small" style={{ marginTop: space.sm }}>Not available in the demo workspace.</T> : null}
        </>
      ) : (
        <>
          <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }} gap={space.sm}>
            <View style={{ flex: 1 }}>
              <T style={{ fontWeight: '700' }}>{s.company_name ?? 'QuickBooks Online'}</T>
              <T variant="small">
                {s.last_sync_at ? `Last synced ${relative(s.last_sync_at)}` : 'First sync on its way'} · sending invoices from {s.sync_from ? date(s.sync_from) : '—'}
              </T>
            </View>
            {s.needs_reconnect ? <Badge label="Reconnect" tone="danger" raw /> : s.last_error ? <Badge label="Needs attention" tone="warning" raw /> : <Badge label="Connected" tone="success" raw />}
          </Row>
          <Row style={{ flexWrap: 'wrap', marginTop: space.sm }} gap={space.lg}>
            <T variant="small">{s.customers ?? 0} customers</T>
            <T variant="small">{s.invoices ?? 0} invoices</T>
            <T variant="small">{s.payments ?? 0} payments</T>
            {s.failed ? <T variant="small" style={{ color: colors.warning }}>{s.failed} couldn&apos;t be sent</T> : null}
          </Row>
          {s.last_error ? <T variant="small" style={{ color: colors.warning, marginTop: space.sm }}>{s.last_error}</T> : null}
          {(s.recent_errors ?? []).map((e, i) => (
            <T key={i} variant="small" style={{ marginTop: 2 }}>• {e.label ?? e.kind}: {e.error}</T>
          ))}
          <Row style={{ flexWrap: 'wrap', marginTop: space.md }} gap={space.sm}>
            {s.needs_reconnect
              ? <Button small icon="link-outline" title="Reconnect" onPress={connect} loading={busy === 'connect'} />
              : <Button small icon="sync-outline" title="Sync now" onPress={sync} loading={busy === 'sync'} />}
            <Button small kind="ghost" icon="close-circle-outline" title="Disconnect" onPress={disconnect} loading={busy === 'disconnect'} />
          </Row>
          <Row style={{ alignItems: 'flex-end', marginTop: space.md }} gap={space.sm}>
            <Field label="Also send invoices from (YYYY-MM-DD)" value={from} onChangeText={setFrom} placeholder="e.g. 2026-01-01" style={{ flex: 1 }} />
            <Button small kind="secondary" title="Save" onPress={saveFrom} loading={busy === 'from'} disabled={!/^\d{4}-\d{2}-\d{2}$/.test(from)} />
          </Row>
          <T variant="small" style={{ marginTop: space.xs }}>
            Tax is added as a line on each invoice using the item “Sales tax (from Tarmo)”; ask your accountant how they&apos;d like it mapped.
          </T>
        </>
      )}
    </Card>
  );
}

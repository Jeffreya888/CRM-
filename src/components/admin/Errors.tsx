// Platform admin → Errors: crashes in the app and failures in server functions, grouped.
import { useState } from 'react';
import { View } from 'react-native';
import { Badge, Button, Card, ErrorBanner, Loading, Row, T, ToggleRow } from '../ui';
import { relative } from '../../lib/format';
import { friendlyError, must, supabase } from '../../lib/supabase';
import { colors, space } from '../../lib/theme';
import { useQuery } from '../../lib/useQuery';

export type AppError = {
  id: string; kind: 'app' | 'server'; source: string; message: string; stack: string | null; route: string | null; platform: string | null;
  app_version: string | null; count: number; companies: number; last_company: string | null; first_seen: string; last_seen: string; resolved_at: string | null;
};

export function useErrors(includeFixed = false) {
  return useQuery(async () => (await must(supabase.rpc('platform_errors', { p_include_resolved: includeFixed }))) as AppError[], [includeFixed]);
}

export function Errors() {
  const [showFixed, setShowFixed] = useState(false);
  const q = useErrors(showFixed);
  const [open, setOpen] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const mark = async (e: AppError, fixed: boolean) => {
    setError(null);
    try { await must(supabase.rpc('platform_resolve_error', { p_id: e.id, p_resolved: fixed })); await q.reload(); }
    catch (err: any) { setError(friendlyError(err.message)); }
  };
  const rows = q.data ?? [];
  return (
    <>
      <T variant="muted" style={{ marginBottom: space.sm }}>
        Crashes in the app and failures on the server, grouped so the same problem shows once with a count. You get an email when
        something new breaks or an error spikes. Mark an error fixed once it&apos;s resolved; it comes back here if it happens again.
      </T>
      <ToggleRow label="Show fixed errors" value={showFixed} onChange={setShowFixed} />
      <ErrorBanner message={q.error ?? error} onRetry={q.reload} />
      {q.loading ? <Loading /> : rows.length === 0 ? (
        <Card><T variant="muted">No errors{showFixed ? '' : ' to look at'}. </T></Card>
      ) : rows.map((e) => (
        <Card key={e.id} onPress={() => setOpen(open === e.id ? null : e.id)}>
          <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }} gap={space.sm}>
            <View style={{ flex: 1 }}>
              <Row style={{ flexWrap: 'wrap' }} gap={space.xs}>
                <Badge label={e.kind === 'app' ? `App · ${e.platform ?? '?'}` : `Server · ${e.source}`} tone={e.kind === 'app' ? 'info' : 'purple'} raw />
                {e.resolved_at ? <Badge label="Fixed" tone="success" raw /> : null}
              </Row>
              <T style={{ fontWeight: '700', marginTop: space.xs }} numberOfLines={open === e.id ? undefined : 2}>{e.message}</T>
              <T variant="small">
                {e.count}× · {e.companies} compan{e.companies === 1 ? 'y' : 'ies'} · last {relative(e.last_seen)}
                {e.route ? ` · ${e.route}` : ''}{e.last_company ? ` · latest: ${e.last_company}` : ''}
              </T>
            </View>
            <T style={{ fontWeight: '800', fontSize: 18, color: e.count >= 25 ? colors.danger : colors.text }}>{e.count}</T>
          </Row>
          {open === e.id ? (
            <View style={{ marginTop: space.sm }}>
              <T variant="small">First seen {relative(e.first_seen)}{e.app_version ? ` · app ${e.app_version}` : ''}</T>
              {e.stack ? (
                <View style={{ backgroundColor: colors.bgDeep, borderRadius: 8, padding: space.sm, marginTop: space.sm }}>
                  <T variant="small" style={{ fontFamily: 'monospace' }}>{e.stack.slice(0, 1500)}</T>
                </View>
              ) : null}
              <Button small kind={e.resolved_at ? 'secondary' : 'primary'} icon={e.resolved_at ? 'refresh' : 'checkmark'} style={{ marginTop: space.sm, alignSelf: 'flex-start' }}
                title={e.resolved_at ? 'Reopen' : 'Mark fixed'} onPress={() => mark(e, !e.resolved_at)} />
            </View>
          ) : null}
        </Card>
      ))}
    </>
  );
}

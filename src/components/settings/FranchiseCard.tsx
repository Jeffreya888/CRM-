import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { confirmAction } from '../FormSheet';
import { Button, Card, ErrorBanner, Field, IconTile, Row, T, ToggleRow } from '../ui';
import { useOrg } from '../../lib/session';
import { APP_NAME } from '../../lib/config';
import { joinNetwork, leaveNetwork, loadFranchise, loadStatements, updateMember } from '../../lib/franchise';
import { date, money } from '../../lib/format';
import { colors, space } from '../../lib/theme';
import { useQuery } from '../../lib/useQuery';

/**
 * Settings → "Franchise network": a franchisee joins its HQ's network with an invite code,
 * chooses whether HQ sees job details (totals are always shared), or leaves.
 */
export function FranchiseCard({ orgId, owner }: { orgId: string; owner: boolean }) {
  const q = useQuery(async () => {
    const f = await loadFranchise(orgId);
    const statements = f.membership ? await loadStatements({ orgId }).catch(() => []) : [];
    return { ...f, statements };
  }, [orgId]);
  const { org, plan } = useOrg();
  const coveredByHq = org?.billing_source === 'franchise';
  const onStore = (org?.billing_source === 'app_store' || org?.billing_source === 'play_store') && plan !== 'trial' && plan !== 'expired';
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try { await fn(); await q.reload(); } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  };
  if (q.loading) return null;
  const hq = q.data?.hq;
  const mem = q.data?.membership;

  if (hq) {
    return (
      <Card onPress={() => router.push('/franchise')}>
        <Row gap={space.md}>
          <IconTile icon="git-network-outline" tone="primary" />
          <View style={{ flex: 1 }}>
            <T style={{ fontWeight: '700' }}>You run {hq.name}</T>
            <T variant="small">Open Franchise HQ for locations, standards and royalties.</T>
          </View>
        </Row>
      </Card>
    );
  }

  if (mem) {
    return (
      <Card>
        <Row gap={space.md} style={{ marginBottom: space.md }}>
          <IconTile icon="git-network-outline" tone="primary" />
          <View style={{ flex: 1 }}>
            <T style={{ fontWeight: '700' }}>{mem.network?.name ?? 'Franchise network'}</T>
            <T variant="small">{mem.location_name ?? 'This location'}{mem.territory ? ` · ${mem.territory}` : ''}</T>
          </View>
        </Row>
        <T variant="muted" style={{ marginBottom: space.md }}>
          Your customers, books and payments stay yours. HQ sees your totals (revenue, jobs, quality and ratings) and sets the standards marked
          &quot;HQ standard&quot; in your services and SOPs.
        </T>
        {owner ? (
          <ToggleRow label="Share job details with HQ" value={mem.share_details}
            hint="Job number, date, aircraft, invoice total, QC result and rating. Never customer names or contact details."
            onChange={(v) => run(() => updateMember(orgId, { shareDetails: v }))} />
        ) : null}
        {(q.data?.statements ?? []).length ? (
          <View style={{ marginBottom: space.md }}>
            <T style={{ fontWeight: '700', marginBottom: space.xs }}>Royalty statements</T>
            {(q.data?.statements ?? []).map((st) => (
              <Row key={st.id} style={{ justifyContent: 'space-between', paddingVertical: 4 }} gap={space.sm}>
                <T style={{ flex: 1 }}>{new Date(`${st.month}T12:00:00Z`).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })}</T>
                <T variant="small">{money(st.total)} · {st.status === 'paid' ? `Paid ${st.paid_at ? date(st.paid_at) : ''}` : 'Unpaid'}</T>
              </Row>
            ))}
          </View>
        ) : null}
        {coveredByHq ? <T variant="small" style={{ marginBottom: space.sm }}>Your {APP_NAME} plan is paid for by HQ.</T> : null}
        {onStore && mem.network?.billing_mode ? (
          <View style={{ marginBottom: space.sm, padding: space.sm, borderRadius: 10, backgroundColor: colors.warningSoft }}>
            <T variant="small" style={{ fontWeight: '700' }}>
              {mem.network.billing_mode === 'all_in' ? 'HQ pays for your plan' : 'Get 15% off on the web'}
            </T>
            <T variant="small">
              {mem.network.billing_mode === 'all_in'
                ? `You also pay through ${org?.billing_source === 'play_store' ? 'Google Play' : 'the App Store'}. Cancel that subscription in your phone settings so you aren't charged twice; your plan stays active.`
                : `You pay through ${org?.billing_source === 'play_store' ? 'Google Play' : 'the App Store'}, which can't apply your network's discount. Cancel it in your phone settings, then subscribe at gettarmo.com for 15% off.`}
            </T>
          </View>
        ) : null}
        <ErrorBanner message={error} />
        {owner ? (
          <Button small kind="ghost" icon="exit-outline" title="Leave network" disabled={busy}
            onPress={() => confirmAction('Leave the franchise network?', `HQ stops seeing your totals. You keep your copies of HQ standards, and you can edit them.${coveredByHq ? ' Your plan is paid by HQ: after leaving you have 14 days to choose a plan of your own.' : ''}`, () => run(() => leaveNetwork(orgId)))} />
        ) : null}
      </Card>
    );
  }

  return (
    <Card>
      <T variant="muted" style={{ marginBottom: space.md }}>
        Part of a franchise? Enter the invite code from your franchise HQ. Your customers, books and payments stay yours; HQ sees your totals and shares its standards.
      </T>
      {owner ? (
        <>
          <Field label="Invite code" value={code} onChangeText={(t) => setCode(t.toUpperCase())} autoCapitalize="characters" placeholder="e.g. 7F3A9C21" />
          <Field label="Location name (optional)" value={name} onChangeText={setName} placeholder="e.g. Houston Hobby" />
          <ErrorBanner message={error} />
          <Button title="Join network" icon="git-network-outline" loading={busy} disabled={code.trim().length < 6}
            onPress={() => run(() => joinNetwork(orgId, code, name))} />
        </>
      ) : <T variant="small">Only the company owner can join a franchise network.</T>}
    </Card>
  );
}

import { Stack } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { PlatformMetrics, usePlatformMetrics } from '../../components/admin/PlatformMetrics';
import { notify } from '../../components/FormSheet';
import { Badge, Button, Card, EmptyState, ErrorBanner, Field, Ionicons, Loading, Row, Screen, Section, Segmented, StatTile, T } from '../../components/ui';
import { dateTime, relative, titleCase } from '../../lib/format';
import { useSession } from '../../lib/session';
import { callFunction, friendlyError, must, supabase } from '../../lib/supabase';
import { colors, space } from '../../lib/theme';
import { useQuery } from '../../lib/useQuery';

type Health = {
  companies_by_plan: Record<string, number>;
  demo_companies: number;
  billing_annual: number;
  texting_pending: number;
  support_open: number;
  last_worker_runs: { worker: string; ran_at: string; ok: boolean; details: unknown }[];
};
type PendingTexting = { id: string; name: string; email: string | null; phone: string | null; sms_status: string; sms_number: string | null };
type PendingIntegration = { id: string; provider: string; management_company: string; contact_name: string | null; contact_email: string | null; status: string; created_at: string; company: string };
type Pending = { texting: PendingTexting[]; integrations: PendingIntegration[] };
type SupportMessage = { id: string; name: string; email: string; company: string | null; topic: string | null; message: string; handled: boolean; created_at: string };

const CHECKLIST: [string, string][] = [
  ['Domain & support email', 'Buy the domain, set up the support inbox, set EXPO_PUBLIC_PORTAL_URL and EXPO_PUBLIC_SUPPORT_EMAIL.'],
  ['Supabase production', 'Production project, daily backups / point-in-time restore, and one tested restore.'],
  ['Email (Resend)', 'Verify the sending domain; set the webhook for delivery and bounce tracking.'],
  ['Apple', 'Apple Developer account, App Store Connect app, six subscriptions (Solo/Team/Fleet × monthly/yearly) and text packs.'],
  ['Google Play', 'Play Console app and the same products.'],
  ['RevenueCat', 'Entitlements, current offering with all six packages, text-pack offering, and the webhook.'],
  ['Stripe Connect (Express)', 'Live keys, Connect settings, and the stripe-webhook endpoint.'],
  ['Texting (Telnyx)', 'Account, brand / campaign registration, telnyx-webhook.'],
  ['Builds', 'EAS build and submit for iOS and Android; production update channel.'],
  ['Legal pages', 'Fill in legal name, address and state in privacy and terms; lawyer review.'],
  ['Pilot company', 'Run one real company end to end: quote → job → photos → invoice → payment → review.'],
  ['Go / no-go', 'Worker runs green, support inbox monitored, backups verified, App Review demo access works.'],
];

/** Tarmo platform admin (founder only). */
export default function PlatformAdmin() {
  const { session } = useSession();
  const uid = session?.user.id ?? '';
  const access = useQuery(async () => {
    const { data } = await supabase.from('platform_admins').select('user_id').eq('user_id', uid).maybeSingle();
    return !!data;
  }, [uid]);

  if (access.data === undefined) return <><Stack.Screen options={{ title: 'Platform admin' }} /><Loading /></>;
  if (!access.data) {
    return (
      <Screen>
        <Stack.Screen options={{ title: 'Platform admin' }} />
        <EmptyState icon="lock-closed-outline" title="Not available" body="This area is only for the Tarmo team." />
      </Screen>
    );
  }
  return <AdminBody />;
}

function AdminBody() {
  const [tab, setTab] = useState<'metrics' | 'health' | 'support' | 'actions' | 'launch'>('metrics');
  const [showHandled, setShowHandled] = useState(false);

  const health = useQuery(async () => ({ ...((await must(supabase.rpc('platform_health'))) as Health), fetchedAt: Date.now() }), []);
  const support = useQuery(async () => {
    let q = supabase.from('support_messages').select('*').order('created_at', { ascending: false }).limit(100);
    if (!showHandled) q = q.eq('handled', false);
    return (await must(q)) as SupportMessage[];
  }, [showHandled]);

  const pending = useQuery(async () => (await must(supabase.rpc('platform_pending'))) as Pending, []);
  const metrics = usePlatformMetrics();
  const h = health.data;
  const plans = h?.companies_by_plan ?? {};
  const paying = (plans.solo ?? 0) + (plans.team ?? 0) + (plans.fleet ?? 0);

  const markHandled = async (m: SupportMessage) => {
    try {
      await callFunction('admin-action', { action: 'support_handled', id: m.id });
      await Promise.all([support.reload(), health.reload()]);
    } catch (e: any) {
      notify('Could not update', friendlyError(e.message));
    }
  };

  return (
    <Screen refreshing={metrics.refreshing || health.refreshing || support.refreshing} onRefresh={() => { metrics.refresh(); health.refresh(); support.refresh(); pending.refresh(); }}>
      <Stack.Screen options={{ title: 'Platform admin' }} />
      <Segmented value={tab} onChange={setTab} options={[
        { value: 'metrics', label: 'Metrics' },
        { value: 'health', label: 'Health' },
        { value: 'support', label: 'Support', count: h?.support_open },
        { value: 'actions', label: 'Texting & integrations', count: h?.texting_pending },
        { value: 'launch', label: 'Launch checklist' },
      ]} />

      {tab === 'metrics' ? <PlatformMetrics q={metrics} /> : null}

      {tab === 'health' ? (
        <>
          <ErrorBanner message={health.error} onRetry={health.refresh} />
          <Row gap={space.md} style={{ flexWrap: 'wrap', marginBottom: space.md }}>
            <StatTile label="Paying companies" value={h ? paying : '—'} icon="business-outline" tone="success" />
            <StatTile label="On trial" value={h ? plans.trial ?? 0 : '—'} icon="time-outline" tone="warning" />
          </Row>
          <Row gap={space.md} style={{ flexWrap: 'wrap', marginBottom: space.md }}>
            <StatTile label="Yearly subscribers" value={h?.billing_annual ?? '—'} icon="calendar-outline" tone="info" />
            <StatTile label="Demo workspaces" value={h?.demo_companies ?? '—'} icon="flask-outline" tone="purple" />
          </Row>
          <Row gap={space.md} style={{ flexWrap: 'wrap' }}>
            <StatTile label="Texting pending" value={h?.texting_pending ?? '—'} icon="chatbubble-ellipses-outline" tone="warning" onPress={() => setTab('actions')} />
            <StatTile label="Open support" value={h?.support_open ?? '—'} icon="mail-unread-outline" tone="danger" onPress={() => setTab('support')} />
          </Row>

          <Section title="Companies by plan">
            <Card>
              {Object.keys(plans).length === 0 ? <T variant="muted">No companies yet.</T> : null}
              {Object.entries(plans).sort().map(([p, n]) => (
                <Row key={p} style={{ justifyContent: 'space-between', paddingVertical: 4 }}>
                  <T>{titleCase(p)}</T><T variant="money">{n}</T>
                </Row>
              ))}
            </Card>
          </Section>

          <Section title="Background workers">
            <Card>
              {(h?.last_worker_runs ?? []).length === 0 ? <T variant="muted">No worker runs recorded yet. Check that the automation worker cron is scheduled.</T> : null}
              {(h?.last_worker_runs ?? []).map((w, i) => {
                const stale = (h?.fetchedAt ?? 0) - new Date(w.ran_at).getTime() > 30 * 60_000;
                return (
                  <Row key={w.worker} gap={space.md} style={{ paddingVertical: space.sm, borderTopWidth: i ? 1 : 0, borderTopColor: colors.border }}>
                    <Ionicons name={w.ok ? 'checkmark-circle' : 'close-circle'} size={22} color={w.ok ? colors.success : colors.danger} />
                    <View style={{ flex: 1 }}>
                      <T style={{ fontWeight: '600' }}>{w.worker}</T>
                      <T variant="small">Last run {relative(w.ran_at)} · {dateTime(w.ran_at)}</T>
                    </View>
                    <Badge raw label={w.ok ? (stale ? 'Stale' : 'OK') : 'Failed'} tone={w.ok ? (stale ? 'warning' : 'success') : 'danger'} />
                  </Row>
                );
              })}
            </Card>
          </Section>
        </>
      ) : null}

      {tab === 'support' ? (
        <>
          <ErrorBanner message={support.error} onRetry={support.refresh} />
          <Segmented value={showHandled ? 'all' : 'open'} onChange={(v) => setShowHandled(v === 'all')}
            options={[{ value: 'open', label: 'Open' }, { value: 'all', label: 'All' }]} />
          {!support.loading && (support.data ?? []).length === 0 ? <EmptyState icon="mail-open-outline" title="No support messages" body="Messages from the website contact form show up here." /> : null}
          {(support.data ?? []).map((m) => (
            <Card key={m.id}>
              <Row style={{ justifyContent: 'space-between' }}>
                <View style={{ flex: 1 }}>
                  <T style={{ fontWeight: '700' }}>{m.name}{m.company ? ` · ${m.company}` : ''}</T>
                  <T variant="small">{m.email} · {relative(m.created_at)}</T>
                </View>
                {m.handled ? <Badge label="handled" tone="success" /> : m.topic ? <Badge raw label={m.topic} tone="info" /> : null}
              </Row>
              <T style={{ marginTop: space.sm }}>{m.message}</T>
              {!m.handled ? <Button small kind="secondary" icon="checkmark" title="Mark handled" style={{ alignSelf: 'flex-start', marginTop: space.md }} onPress={() => markHandled(m)} /> : null}
            </Card>
          ))}
        </>
      ) : null}

      {tab === 'actions' ? (
        <>
          <ErrorBanner message={pending.error} onRetry={pending.refresh} />
          <Section title="Waiting for a texting number" count={pending.data ? String(pending.data.texting.length) : undefined}>
            {pending.data && pending.data.texting.length === 0 ? <Card><T variant="muted">No companies are waiting for texting.</T></Card> : null}
            {(pending.data?.texting ?? []).map((o) => (
              <TextingRow key={o.id} org={o} onDone={() => Promise.all([pending.reload(), health.reload()])} />
            ))}
          </Section>
          <Section title="Scheduling integration requests" count={pending.data ? String(pending.data.integrations.length) : undefined}>
            {pending.data && pending.data.integrations.length === 0 ? <Card><T variant="muted">No open integration requests.</T></Card> : null}
            {(pending.data?.integrations ?? []).map((r) => (
              <IntegrationRow key={r.id} req={r} onDone={pending.reload} />
            ))}
          </Section>
        </>
      ) : null}

      {tab === 'launch' ? (
        <>
          <T variant="muted" style={{ marginBottom: space.md }}>Founder launch checklist (private; never shown to subscribers).</T>
          {CHECKLIST.map(([title, body], i) => (
            <Card key={title}>
              <Row gap={space.md} style={{ alignItems: 'flex-start' }}>
                <T style={{ fontWeight: '800', color: colors.primaryText, width: 22 }}>{i + 1}</T>
                <View style={{ flex: 1 }}>
                  <T style={{ fontWeight: '700' }}>{title}</T>
                  <T variant="muted">{body}</T>
                </View>
              </Row>
            </Card>
          ))}
        </>
      ) : null}

    </Screen>
  );
}

function TextingRow({ org, onDone }: { org: PendingTexting; onDone: () => Promise<unknown> }) {
  const [number, setNumber] = useState(org.sms_number ?? '');
  const set = async (status: 'active' | 'suspended') => {
    const n = number.trim();
    if (status === 'active' && !/^\+?[0-9 ()-]{10,}$/.test(n)) return notify('Texting number needed', 'Enter the company’s texting number, e.g. +15551234567.');
    try {
      await callFunction('admin-action', { action: 'set_sms', org_id: org.id, status, number: n || undefined });
      await onDone();
    } catch (e: any) {
      notify('Could not update', friendlyError(e.message));
    }
  };
  return (
    <Card>
      <T style={{ fontWeight: '700' }}>{org.name}</T>
      <T variant="small" style={{ marginBottom: space.md }}>{[org.email, org.phone].filter(Boolean).join(' · ') || 'No contact details'}</T>
      <Field label="Texting number" icon="call-outline" placeholder="+15551234567" value={number} onChangeText={setNumber} keyboardType="phone-pad" autoCapitalize="none" />
      <Row style={{ flexWrap: 'wrap' }}>
        <Button small icon="checkmark" title="Activate texting" onPress={() => set('active')} />
        <Button small kind="ghost" title="Suspend" onPress={() => set('suspended')} />
      </Row>
    </Card>
  );
}

const INTEGRATION_STATUSES = ['prepared', 'sent_to_vendor', 'approved', 'live', 'declined'] as const;

function IntegrationRow({ req, onDone }: { req: PendingIntegration; onDone: () => Promise<unknown> }) {
  const set = async (status: string) => {
    if (status === req.status) return;
    try {
      await callFunction('admin-action', { action: 'set_integration', id: req.id, status });
      await onDone();
    } catch (e: any) {
      notify('Could not update', friendlyError(e.message));
    }
  };
  return (
    <Card>
      <Row style={{ justifyContent: 'space-between' }}>
        <View style={{ flex: 1 }}>
          <T style={{ fontWeight: '700' }}>{req.company}</T>
          <T variant="small">{titleCase(req.provider)} · {req.management_company} · {relative(req.created_at)}</T>
          {req.contact_name || req.contact_email ? <T variant="small">{[req.contact_name, req.contact_email].filter(Boolean).join(' · ')}</T> : null}
        </View>
        <Badge label={req.status} tone={req.status === 'approved' ? 'success' : 'info'} />
      </Row>
      <View style={{ marginTop: space.md }}>
        <Segmented value={req.status} onChange={set} options={INTEGRATION_STATUSES.map((s) => ({ value: s, label: titleCase(s) }))} />
      </View>
    </Card>
  );
}

import * as Clipboard from 'expo-clipboard';
import * as Linking from 'expo-linking';
import { Stack } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { ActivityLog, AdminTeam } from '../../components/admin/AdminTeam';
import { Announcements } from '../../components/admin/Announcements';
import { Attention, attentionCount, useAttention } from '../../components/admin/Attention';
import { Companies } from '../../components/admin/Companies';
import { EnterpriseAdmin } from '../../components/admin/EnterpriseAdmin';
import { Errors, useErrors } from '../../components/admin/Errors';
import { Growth } from '../../components/admin/Growth';
import { FeatureUsage, InvestorUpdate } from '../../components/admin/InvestorUpdate';
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
type EarlyAccess = { id: string; name: string; email: string; company: string | null; business_types: string[]; crew_size: string | null; created_at: string; unsubscribed_at: string | null };
const TYPE_LABEL: Record<string, string> = { aircraft: 'Aircraft', watercraft: 'Boats', vehicle: 'Cars' };
type SupportMessage = {
  id: string; name: string; email: string; company: string | null; topic: string | null; message: string; handled: boolean; created_at: string;
  source?: string; plan?: string | null; route?: string | null; platform?: string | null; app_version?: string | null; org_id?: string | null;
};

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
  // 'owner' sees everything; 'support' sees companies, needs attention, errors, support and early access.
  const access = useQuery(async () => {
    const { data } = await supabase.rpc('platform_my_role');
    return (data === 'owner' || data === 'support' ? data : null) as 'owner' | 'support' | null;
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
  return <AdminBody owner={access.data === 'owner'} />;
}

type Tab = 'metrics' | 'growth' | 'usage' | 'investor' | 'attention' | 'companies' | 'errors' | 'health' | 'support' | 'early' | 'actions'
  | 'enterprise' | 'announcements' | 'activity' | 'team' | 'launch';
const SUPPORT_TABS: Tab[] = ['attention', 'companies', 'errors', 'support', 'early'];

function AdminBody({ owner }: { owner: boolean }) {
  const [tab, setTab] = useState<Tab>(owner ? 'metrics' : 'attention');
  const [openCompany, setOpenCompany] = useState<string | null>(null);
  const attention = useAttention();
  const errorsQ = useErrors(false);
  const [showHandled, setShowHandled] = useState(false);

  const health = useQuery(async () => (owner ? { ...((await must(supabase.rpc('platform_health'))) as Health), fetchedAt: Date.now() } : null), [owner]);
  const support = useQuery(async () => {
    let q = supabase.from('support_messages').select('*').order('created_at', { ascending: false }).limit(100);
    if (!showHandled) q = q.eq('handled', false);
    return (await must(q)) as SupportMessage[];
  }, [showHandled]);

  const early = useQuery(async () => (await must(supabase.from('early_access').select('*').order('created_at', { ascending: false }).limit(1000))) as EarlyAccess[], []);
  const copyEmails = async () => {
    const emails = (early.data ?? []).filter((e) => !e.unsubscribed_at).map((e) => e.email);
    await Clipboard.setStringAsync(emails.join(', '));
    notify('Copied', `${emails.length} emails copied (unsubscribed people left out).`);
  };
  const pending = useQuery(async () => (owner ? ((await must(supabase.rpc('platform_pending'))) as Pending) : null), [owner]);
  const metrics = usePlatformMetrics(owner);
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
    <Screen refreshing={metrics.refreshing || health.refreshing || support.refreshing} onRefresh={() => { metrics.refresh(); health.refresh(); support.refresh(); pending.refresh(); early.refresh(); attention.refresh(); }}>
      <Stack.Screen options={{ title: 'Platform admin' }} />
      <Segmented value={tab} onChange={setTab} options={([
        { value: 'metrics', label: 'Metrics' },
        { value: 'growth', label: 'Growth & funnel' },
        { value: 'usage', label: 'Feature usage' },
        { value: 'investor', label: 'Investor update' },
        { value: 'attention', label: 'Needs attention', count: attentionCount(attention.data) },
        { value: 'companies', label: 'Companies' },
        { value: 'errors', label: 'Errors', count: errorsQ.data?.length },
        { value: 'health', label: 'Health' },
        { value: 'support', label: 'Support', count: h ? h.support_open : support.data?.filter((m) => !m.handled).length },
        { value: 'early', label: 'Early access', count: early.data?.length },
        { value: 'actions', label: 'Texting & integrations', count: h?.texting_pending },
        { value: 'enterprise', label: 'Enterprise & franchise' },
        { value: 'announcements', label: 'Announcements' },
        { value: 'activity', label: 'Activity log' },
        { value: 'team', label: 'Admin team' },
        { value: 'launch', label: 'Launch checklist' },
      ] as { value: Tab; label: string; count?: number }[]).filter((o) => owner || SUPPORT_TABS.includes(o.value))} />

      {tab === 'metrics' ? <PlatformMetrics q={metrics} /> : null}
      {tab === 'enterprise' ? <EnterpriseAdmin /> : null}
      {tab === 'growth' ? <Growth /> : null}
      {tab === 'usage' ? <FeatureUsage /> : null}
      {tab === 'investor' ? <InvestorUpdate /> : null}
      {tab === 'announcements' ? <Announcements /> : null}
      {tab === 'activity' ? <ActivityLog /> : null}
      {tab === 'team' ? <AdminTeam /> : null}
      {tab === 'errors' ? <Errors /> : null}
      {tab === 'attention' ? <Attention q={attention} onOpen={(id) => { setOpenCompany(id); setTab('companies'); }} /> : null}
      {tab === 'companies' ? <Companies owner={owner} openId={openCompany} onOpened={() => setOpenCompany(null)} /> : null}

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

      {tab === 'early' ? (
        <>
          <ErrorBanner message={early.error} onRetry={early.refresh} />
          {early.data?.length ? (
            <Row style={{ justifyContent: 'space-between', marginBottom: space.md }}>
              <T variant="muted">{early.data.length} on the list</T>
              <Button small kind="secondary" icon="copy-outline" title="Copy all emails" onPress={copyEmails} />
            </Row>
          ) : null}
          {!early.loading && (early.data ?? []).length === 0 ? <EmptyState icon="people-outline" title="No sign-ups yet" body="People who join the early access list on the website show up here." /> : null}
          {(early.data ?? []).map((e) => (
            <Card key={e.id}>
              <T style={{ fontWeight: '700' }}>{e.name}{e.company ? ` · ${e.company}` : ''}</T>
              <T variant="small">{e.email} · {relative(e.created_at)}</T>
              <Row gap={6} style={{ marginTop: space.sm, flexWrap: 'wrap' }}>
                {e.business_types.map((t) => <Badge key={t} raw label={TYPE_LABEL[t] ?? t} tone="info" />)}
                {e.crew_size ? <Badge raw label={`Crew ${e.crew_size}`} tone="neutral" /> : null}
                {e.unsubscribed_at ? <Badge raw label="Unsubscribed" tone="warning" /> : null}
              </Row>
            </Card>
          ))}
        </>
      ) : null}

      {tab === 'support' ? (
        <>
          <ErrorBanner message={support.error} onRetry={support.refresh} />
          <Segmented value={showHandled ? 'all' : 'open'} onChange={(v) => setShowHandled(v === 'all')}
            options={[{ value: 'open', label: 'Open' }, { value: 'all', label: 'All' }]} />
          {!support.loading && (support.data ?? []).length === 0 ? <EmptyState icon="mail-open-outline" title="No support messages" body="Messages from the website contact form and the app show up here." /> : null}
          {(support.data ?? []).map((m) => (
            <Card key={m.id}>
              <Row style={{ justifyContent: 'space-between' }}>
                <View style={{ flex: 1 }}>
                  <T style={{ fontWeight: '700' }}>{m.name}{m.company ? ` · ${m.company}` : ''}</T>
                  <T variant="small">{m.email} · {relative(m.created_at)}</T>
                  {m.source === 'app' ? (
                    <T variant="small">In the app{m.plan ? ` · ${titleCase(m.plan)}` : ''}{m.route ? ` · ${m.route}` : ''}{m.platform ? ` · ${m.platform}` : ''}{m.app_version ? ` ${m.app_version}` : ''}</T>
                  ) : null}
                </View>
                {m.handled ? <Badge label="handled" tone="success" /> : m.topic ? <Badge raw label={m.topic} tone="info" /> : null}
              </Row>
              <T style={{ marginTop: space.sm }}>{m.message}</T>
              <Row style={{ flexWrap: 'wrap', marginTop: space.md }} gap={space.sm}>
                <Button small icon="mail-outline" title="Reply" onPress={() => Linking.openURL(`mailto:${m.email}?subject=${encodeURIComponent(`Re: ${m.topic ?? 'your message'} · Tarmo`)}`)} />
                {m.org_id ? <Button small kind="secondary" icon="business-outline" title="Open company" onPress={() => { setOpenCompany(m.org_id!); setTab('companies'); }} /> : null}
                {!m.handled ? <Button small kind="secondary" icon="checkmark" title="Mark handled" onPress={() => markHandled(m)} /> : null}
              </Row>
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

import { format } from 'date-fns';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useSetupCardDismissed, useSetupSteps } from '../../../components/dashboard/useSetupSteps';
import { BranchSwitcher, GettingStartedCard, NeedsAttention, ProfitCard, QuickAction, type AttentionItem, type ProfitMonth } from '../../../components/dashboard/widgets';
import { notify } from '../../../components/FormSheet';
import { jobTone } from '../../../components/status';
import { Badge, Button, Card, ErrorBanner, Grid, IconTile, Ionicons, ListRow, ResponsiveRow, Row, Screen, Section, StatTile, T, type IconName } from '../../../components/ui';
import { duration, money, time, titleCase } from '../../../lib/format';
import { useColumns, useIsDesktop } from '../../../lib/layout';
import { assetTypeInfo } from '../../../lib/pricing';
import { canAdmin, canSeeMoney } from '../../../lib/plans';
import { useOrg } from '../../../lib/session';
import { friendlyError, supabase } from '../../../lib/supabase';
import type { AssetType, Branch } from '../../../lib/types';
import { colors, space, type Tone } from '../../../lib/theme';
import { useQuery } from '../../../lib/useQuery';

type Stats = Record<string, any>;
type JobRow = {
  id: string; title: string | null; status: string; scheduled_start: string | null; updated_at?: string;
  customer: { name: string } | null; aircraft: { tail_number: string; asset_type: AssetType | null } | null;
};

const ACTIVITY_ICON: Record<string, [IconName, Tone]> = {
  tentative: ['help-circle-outline', 'warning'],
  scheduled: ['calendar-outline', 'info'],
  in_progress: ['time-outline', 'warning'],
  on_hold: ['pause-outline', 'neutral'],
  completed: ['checkmark-circle-outline', 'success'],
  invoiced: ['document-text-outline', 'purple'],
  cancelled: ['close-circle-outline', 'danger'],
};

const plural = (n: number, one: string, many = one + 's') => `${n} ${n === 1 ? one : many}`;
const short = (n: unknown) => money(Number(n ?? 0)).replace(/\.00$/, '');

export default function Dashboard() {
  const { orgId, org, role, plan, trialDays, session, profile, perm, can, branchId, setBranchId } = useOrg();
  const uid = session!.user.id;
  const seePrices = perm('see_prices');
  const seeReports = perm('see_reports');
  const manager = canSeeMoney(role);
  const admin = canAdmin(role);
  const branchesAllowed = can('branches');
  const desktop = useIsDesktop();
  const tileFit = useColumns(6, 175);

  const branchQ = useQuery(async () => {
    if (!branchesAllowed) return [] as Branch[];
    const { data } = await supabase.from('branches').select('*').eq('org_id', orgId).eq('active', true).order('name');
    return (data ?? []) as Branch[];
  }, [orgId, branchesAllowed]);
  const branches = branchQ.data ?? [];
  // A remembered location that was deactivated (or a downgrade) falls back to all locations.
  const branch = branchesAllowed ? branches.find((b) => b.id === branchId)?.id ?? null : null;

  const q = useQuery(async () => {
    const start = new Date(); start.setHours(0, 0, 0, 0);
    const end = new Date(start); end.setDate(end.getDate() + 1);
    const jobCols = 'id, title, status, scheduled_start, updated_at, customer:customers(name), aircraft:aircraft(tail_number, asset_type)';
    let todayQ = supabase.from('jobs').select(jobCols).eq('org_id', orgId)
      .gte('scheduled_start', start.toISOString()).lt('scheduled_start', end.toISOString())
      .neq('status', 'cancelled').order('scheduled_start');
    let recentQ = supabase.from('jobs').select(jobCols).eq('org_id', orgId).order('updated_at', { ascending: false }).limit(6);
    if (branch) { todayQ = todayQ.eq('branch_id', branch); recentQ = recentQ.eq('branch_id', branch); }
    const [stats, today, recent, clock] = await Promise.all([
      supabase.rpc('dashboard_stats', { p_org: orgId, p_branch: branch }),
      todayQ,
      recentQ,
      supabase.from('time_entries').select('id, started_at').eq('org_id', orgId).eq('user_id', uid).is('ended_at', null).maybeSingle(),
    ]);
    if (stats.error) throw stats.error;
    if (today.error) throw today.error;
    return { stats: (stats.data ?? {}) as Stats, today: (today.data ?? []) as unknown as JobRow[], recent: (recent.data ?? []) as unknown as JobRow[], clock: clock.data };
  }, [orgId, branch]);

  const setup = useSetupSteps();
  const setupCard = useSetupCardDismissed(orgId);

  const s = q.data?.stats ?? {};
  const clock = q.data?.clock;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!clock) return;
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, [clock]);

  const toggleClock = async () => {
    try {
      const { error } = clock
        ? await supabase.from('time_entries').update({ ended_at: new Date().toISOString() }).eq('id', clock.id)
        : await supabase.from('time_entries').insert({ org_id: orgId, user_id: uid });
      if (error) throw error;
      q.reload();
    } catch (e: any) {
      notify('Time clock', friendlyError(e.message));
    }
  };

  const refresh = async () => { await Promise.all([q.refresh(), branchQ.reload(), setup.refresh()]); };

  const today = q.data?.today ?? [];
  const n = (k: string) => (s[k] == null ? '—' : String(s[k]));
  const num = (k: string) => Number(s[k]) || 0;

  const attention: AttentionItem[] = [];
  if (num('jobs_tentative')) attention.push({ key: 'tentative', icon: 'help-circle-outline', tone: 'warning', title: `${plural(num('jobs_tentative'), 'tentative job')} to confirm`, href: '/jobs?filter=tentative' });
  if (num('jobs_flagged')) attention.push({ key: 'flagged', icon: 'flag-outline', tone: 'danger', title: `${plural(num('jobs_flagged'), 'flagged job')}`, subtitle: 'Low ratings or issues to follow up', href: '/jobs?filter=flagged' });
  if (num('booking_requests')) attention.push({ key: 'requests', icon: 'mail-unread-outline', tone: 'info', title: `${plural(num('booking_requests'), 'booking request')} waiting`, href: '/requests' });
  if (seePrices && num('outstanding')) attention.push({ key: 'outstanding', icon: 'receipt-outline', tone: num('overdue') ? 'danger' : 'info', title: `${money(s.outstanding)} outstanding`, subtitle: num('overdue') ? `${money(s.overdue)} overdue` : null, href: '/invoices' });
  if (num('reminders_due')) attention.push({ key: 'reminders', icon: 'notifications-outline', tone: 'warning', title: `${plural(num('reminders_due'), 'service reminder')} due soon`, href: '/reminders' });
  if (num('leads_due')) attention.push({ key: 'leads', icon: 'funnel-outline', tone: 'purple', title: `${plural(num('leads_due'), 'lead')} due for follow-up`, href: '/leads' });
  if (manager && num('time_off_requests')) attention.push({ key: 'timeoff', icon: 'airplane-outline', tone: 'info', title: `${plural(num('time_off_requests'), 'time-off request')} to review`, href: '/scheduling' });
  if (num('low_stock')) attention.push({ key: 'stock', icon: 'cube-outline', tone: 'danger', title: `${plural(num('low_stock'), 'supply item')} low on stock`, href: '/inventory' });
  if (num('equipment_issues')) attention.push({ key: 'equipment', icon: 'construct-outline', tone: 'warning', title: `${plural(num('equipment_issues'), 'equipment issue')} open`, href: '/equipment' });

  const name = profile?.full_name?.trim() || session?.user.email || 'there';
  const branchName = branch ? branches.find((b) => b.id === branch)?.name : null;
  const showSetup = admin && !setup.loading && !setup.allDone && !setupCard.dismissed;

  const todayCard = (
    <>
      <Card>
        <Row style={{ justifyContent: 'space-between', marginBottom: today.length ? space.sm : 0 }}>
          <View style={{ flex: 1 }}>
            <T variant="h3">Today&apos;s schedule</T>
            {branchName ? <T variant="small">{branchName}</T> : null}
          </View>
          <Badge large raw label={plural(today.length, 'job')} tone="info" />
        </Row>
        {q.loading && !q.data ? <T variant="muted" style={{ marginTop: space.sm }}>Loading…</T> : null}
        {!q.loading && today.length === 0 ? <T variant="muted" style={{ marginTop: space.sm }}>Nothing scheduled today.</T> : null}
        {today.map((j, i) => (
          <Pressable key={j.id} onPress={() => router.push(`/jobs/${j.id}`)}
            style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md, borderTopWidth: i ? 1 : 0, borderTopColor: colors.border }, pressed && { opacity: 0.7 }]}>
            <IconTile icon={assetTypeInfo(j.aircraft?.asset_type).icon} tone={j.status === 'tentative' ? 'warning' : 'info'} round size={40} />
            <View style={{ flex: 1 }}>
              <T style={{ fontWeight: '600' }} numberOfLines={1}>{j.customer?.name ?? '—'}</T>
              <T variant="muted" numberOfLines={1}>{[time(j.scheduled_start), j.title ?? j.aircraft?.tail_number].filter(Boolean).join(' · ')}</T>
            </View>
            <Badge label={j.status} tone={j.status === 'tentative' ? 'warning' : jobTone[j.status]} />
          </Pressable>
        ))}
      </Card>
    </>
  );
  // Desktop key numbers: one row when the window is wide enough, otherwise two even rows.
  const tiles = [
    <StatTile key="ip" label="In progress" value={n('jobs_in_progress')} icon="time-outline" tone="warning" onPress={() => router.push('/jobs?filter=in_progress')} />,
    <StatTile key="sc" label="Scheduled" value={n('jobs_scheduled')} icon="calendar-outline" tone="info" onPress={() => router.push('/jobs?filter=scheduled')} />,
    <StatTile key="co" label="Completed" value={n('jobs_completed')} icon="checkmark-circle-outline" tone="success" onPress={() => router.push('/jobs?filter=completed')} />,
    <StatTile key="cu" label="Customers" value={n('customers')} icon="briefcase-outline" tone="purple" onPress={() => router.push('/customers')} />,
    ...(seePrices && q.data ? [
      <StatTile key="mtd" label="Paid this month" value={short(s.revenue_mtd)} icon="trending-up" tone="success" onPress={() => router.push('/invoices')} />,
      <StatTile key="tp" label="Total paid" value={short(s.total_paid)} icon="wallet-outline" tone="primary" onPress={() => router.push('/invoices')} />,
    ] : []),
  ];
  const tileColumns = tileFit >= tiles.length ? tiles.length : Math.ceil(tiles.length / 2);

  const actionButtons = [
    manager ? <QuickAction key="job" primary icon="add" label="New job" onPress={() => router.push('/jobs/new')} /> : null,
    perm('edit_customers') ? <QuickAction key="customer" icon="person-add-outline" label="Customer" onPress={() => router.push('/customers/new')} /> : null,
    seePrices ? <QuickAction key="quote" icon="document-text-outline" label="Quote" onPress={() => router.push('/quotes/edit')} /> : null,
    <QuickAction key="schedule" icon="calendar-outline" label="Schedule" onPress={() => router.push('/schedule')} primary={!manager} />,
  ];
  const quickActions = (
    <>
      <Section title="Quick actions">
        {desktop ? <Grid columns={2} gap={space.sm} rowGap={space.sm}>{actionButtons}</Grid> : (
          <Row gap={space.sm} style={{ flexWrap: 'wrap' }}>
            {actionButtons}
          </Row>
        )}
      </Section>
    </>
  );
  const clockCard = (
    <>
      <Card style={{ marginTop: space.md, backgroundColor: clock ? colors.successSoft : colors.card }}>
        <Row style={{ justifyContent: 'space-between' }}>
          <Row gap={space.md} style={{ flex: 1 }}>
            <IconTile icon="stopwatch-outline" tone={clock ? 'success' : 'neutral'} />
            <View style={{ flex: 1 }}>
              <T variant="muted">Time clock</T>
              <T style={{ fontWeight: '700' }}>{clock ? `On the clock · ${duration((now - new Date(clock.started_at).getTime()) / 60000)}` : 'Off the clock'}</T>
            </View>
          </Row>
          <Button small kind={clock ? 'danger' : 'primary'} icon={clock ? 'stop' : 'play'} title={clock ? 'Clock out' : 'Clock in'} onPress={toggleClock} />
        </Row>
      </Card>
    </>
  );
  const profitSection = (
    <>
      {seeReports && q.data ? (
        <Section title="Profitability overview">
          <ProfitCard data={(s.profit_month ?? null) as ProfitMonth} monthLabel={format(new Date(), 'MMMM')} />
        </Section>
      ) : null}
    </>
  );
  const revenueSection = (
    <>
      {seePrices && q.data ? (
        <Section title="Revenue" count={branchName ?? undefined}>
          <Row gap={space.md} style={{ flexWrap: 'wrap', marginBottom: space.md }}>
            <StatTile label="Total paid" value={short(s.total_paid)} icon="wallet-outline" tone="primary" onPress={() => router.push('/invoices')} />
            <StatTile label="Paid this month" value={short(s.revenue_mtd)} icon="trending-up" tone="success" onPress={() => router.push('/invoices')} />
          </Row>
          <Card style={{ paddingVertical: space.md }}>
            <Row style={{ justifyContent: 'space-between' }}>
              <Row gap={space.sm}><Ionicons name="calendar-outline" size={18} color={colors.textMuted} /><T variant="muted">Paid this week</T></Row>
              <T variant="money">{short(s.revenue_week)}</T>
            </Row>
          </Card>
        </Section>
      ) : null}
    </>
  );
  const overviewSection = (
    <>
      <Section title="Overview">
        <Row gap={space.md} style={{ marginBottom: space.md, flexWrap: 'wrap' }}>
          <StatTile label="In progress" value={n('jobs_in_progress')} icon="time-outline" tone="warning" onPress={() => router.push('/jobs?filter=in_progress')} />
          <StatTile label="Scheduled" value={n('jobs_scheduled')} icon="calendar-outline" tone="info" onPress={() => router.push('/jobs?filter=scheduled')} />
        </Row>
        <Row gap={space.md} style={{ flexWrap: 'wrap' }}>
          <StatTile label="Completed" value={n('jobs_completed')} icon="checkmark-circle-outline" tone="success" onPress={() => router.push('/jobs?filter=completed')} />
          <StatTile label="Customers" value={n('customers')} icon="briefcase-outline" tone="purple" onPress={() => router.push('/customers')} />
        </Row>
      </Section>
    </>
  );
  const attentionSection = (
    <>
      {q.data ? (
        <Section title="Needs attention" count={attention.length ? String(attention.length) : undefined}>
          <NeedsAttention items={attention} />
        </Section>
      ) : null}
    </>
  );
  const recentSection = (
    <>
      <Section title="Recent activity">
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          {q.data && (q.data.recent ?? []).length === 0 ? <T variant="muted" style={{ padding: space.lg }}>No jobs yet. Create your first job to see activity here.</T> : null}
          {(q.data?.recent ?? []).map((j) => {
            const [icon, tone] = ACTIVITY_ICON[j.status] ?? ['ellipse-outline', 'neutral'];
            return (
              <ListRow key={j.id} icon={icon} tone={tone} title={j.title ?? 'Job'}
                subtitle={[j.customer?.name, j.aircraft?.tail_number].filter(Boolean).join(' · ')}
                right={<T variant="small">{titleCase(j.status)}</T>}
                onPress={() => router.push(`/jobs/${j.id}`)} />
            );
          })}
        </Card>
      </Section>
    </>
  );

  return (
    <Screen refreshing={q.refreshing} onRefresh={refresh} kicker={`Welcome back, ${name.split(' ')[0]}`} title={org.name}
      subtitle={`${name} · ${titleCase(role)} · ${format(new Date(), 'EEEE, MMMM d')}`}>
      <ErrorBanner message={q.error} onRetry={q.refresh} />

      {plan === 'trial' || plan === 'expired' ? (
        <Card onPress={() => router.push('/paywall')} style={{ backgroundColor: plan === 'expired' ? colors.dangerSoft : colors.warningSoft, borderColor: 'transparent' }}>
          <Row>
            <Ionicons name={plan === 'expired' ? 'alert-circle' : 'time-outline'} size={20} color={plan === 'expired' ? colors.danger : colors.warning} />
            <T style={{ flex: 1, fontWeight: '600', color: plan === 'expired' ? colors.danger : colors.warning }}>
              {plan === 'expired' ? 'Your plan has ended. Tap to choose a plan.' : `${plural(trialDays, 'day')} left in your free trial`}
            </T>
            <Ionicons name="chevron-forward" size={18} color={plan === 'expired' ? colors.danger : colors.warning} />
          </Row>
        </Card>
      ) : null}

      {/* On desktop the company location is picked in the sidebar. */}
      {!desktop && branchesAllowed && branches.length > 0 ? (
        <BranchSwitcher branches={branches} value={branch} onChange={setBranchId} />
      ) : null}

      {showSetup ? <GettingStartedCard steps={setup.steps} doneCount={setup.doneCount} onDismiss={setupCard.dismiss} /> : null}


      {desktop ? (
        <>
          {/* Desktop: key numbers in one row, then the day on the left and tools on the right. */}
          <View style={{ marginBottom: space.lg }}>
            <Grid columns={tileColumns} gap={space.md} rowGap={space.md}>{tiles}</Grid>
          </View>
          <ResponsiveRow weights={[1.6, 1]}>
            <View>
              {todayCard}
              {attentionSection}
              {recentSection}
            </View>
            <View>
              <View style={{ marginTop: -space.lg }}>{quickActions}</View>
              {clockCard}
              {profitSection}
              {seePrices && q.data ? (
                <Card style={{ paddingVertical: space.md }}>
                  <Row style={{ justifyContent: 'space-between' }}>
                    <Row gap={space.sm}><Ionicons name="calendar-outline" size={18} color={colors.textMuted} /><T variant="muted">Paid this week</T></Row>
                    <T variant="money">{short(s.revenue_week)}</T>
                  </Row>
                </Card>
              ) : null}
            </View>
          </ResponsiveRow>
        </>
      ) : (
        <>
          {todayCard}
          {quickActions}
          {clockCard}
          {profitSection}
          {revenueSection}
          {overviewSection}
          {attentionSection}
          {recentSection}
        </>
      )}
    </Screen>
  );
}

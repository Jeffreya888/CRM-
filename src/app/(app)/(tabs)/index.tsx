import { router, type Href } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { notify } from '../../../components/FormSheet';
import { jobTone } from '../../../components/status';
import { Badge, Button, Card, ErrorBanner, IconTile, Ionicons, ListRow, Row, Screen, Section, StatTile, T, type IconName } from '../../../components/ui';
import { duration, money } from '../../../lib/format';
import { canSeeMoney } from '../../../lib/plans';
import { useOrg } from '../../../lib/session';
import { friendlyError, supabase } from '../../../lib/supabase';
import { colors, radius, space, type Tone } from '../../../lib/theme';
import { useQuery } from '../../../lib/useQuery';

type Stats = Record<string, number | null>;
type JobRow = { id: string; title: string | null; status: string; customer: { name: string } | null; aircraft: { tail_number: string } | null };

const ACTIVITY_ICON: Record<string, [IconName, Tone]> = {
  scheduled: ['calendar-outline', 'info'],
  in_progress: ['time-outline', 'warning'],
  on_hold: ['pause-outline', 'neutral'],
  completed: ['checkmark-circle-outline', 'success'],
  invoiced: ['document-text-outline', 'purple'],
  cancelled: ['close-circle-outline', 'danger'],
};

function QuickAction({ icon, label, onPress, primary }: { icon: IconName; label: string; onPress: () => void; primary?: boolean }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [{
      flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 18, borderRadius: radius.md, gap: 8,
      backgroundColor: primary ? colors.primary : colors.cardRaised, borderWidth: 1, borderColor: primary ? colors.primary : colors.borderStrong,
    }, pressed && { opacity: 0.8 }]}>
      <Ionicons name={icon} size={26} color={primary ? colors.white : colors.textMuted} />
      <T style={{ fontSize: 14, fontWeight: '600', color: primary ? colors.white : colors.text }} numberOfLines={1}>{label}</T>
    </Pressable>
  );
}

export default function Dashboard() {
  const { orgId, org, role, plan, trialDays, session } = useOrg();
  const manager = canSeeMoney(role);
  const uid = session!.user.id;

  const q = useQuery(async () => {
    const start = new Date(); start.setHours(0, 0, 0, 0);
    const end = new Date(start); end.setDate(end.getDate() + 1);
    const jobCols = 'id, title, status, customer:customers(name), aircraft:aircraft(tail_number)';
    const [stats, today, recent, clock] = await Promise.all([
      supabase.rpc('dashboard_stats', { p_org: orgId }),
      supabase.from('jobs').select(jobCols).eq('org_id', orgId)
        .gte('scheduled_start', start.toISOString()).lt('scheduled_start', end.toISOString())
        .neq('status', 'cancelled').order('scheduled_start'),
      supabase.from('jobs').select(jobCols).eq('org_id', orgId).order('updated_at', { ascending: false }).limit(5),
      supabase.from('time_entries').select('id, started_at').eq('org_id', orgId).eq('user_id', uid).is('ended_at', null).maybeSingle(),
    ]);
    if (stats.error) throw stats.error;
    return { stats: stats.data as Stats, today: (today.data ?? []) as unknown as JobRow[], recent: (recent.data ?? []) as unknown as JobRow[], clock: clock.data };
  }, [orgId]);

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

  const today = q.data?.today ?? [];
  const n = (k: string) => (s[k] == null ? '—' : String(s[k]));

  return (
    <Screen refreshing={q.refreshing} onRefresh={q.refresh} kicker="Welcome back to" title={org.name}>
      <ErrorBanner message={q.error} onRetry={q.refresh} />

      {plan === 'trial' || plan === 'expired' ? (
        <Card onPress={() => router.push('/paywall')} style={{ backgroundColor: plan === 'expired' ? colors.dangerSoft : colors.warningSoft, borderColor: 'transparent' }}>
          <Row>
            <Ionicons name={plan === 'expired' ? 'alert-circle' : 'time-outline'} size={20} color={plan === 'expired' ? colors.danger : colors.warning} />
            <T style={{ flex: 1, fontWeight: '600', color: plan === 'expired' ? colors.danger : colors.warning }}>
              {plan === 'expired' ? 'Your plan has ended. Tap to choose a plan.' : `${trialDays} day${trialDays === 1 ? '' : 's'} left in your free trial`}
            </T>
            <Ionicons name="chevron-forward" size={18} color={plan === 'expired' ? colors.danger : colors.warning} />
          </Row>
        </Card>
      ) : null}

      <Card>
        <Row style={{ justifyContent: 'space-between', marginBottom: today.length ? space.sm : 0 }}>
          <T variant="h3">Today&apos;s Schedule</T>
          <Badge large raw label={`${today.length} job${today.length === 1 ? '' : 's'}`} tone="info" />
        </Row>
        {today.length === 0 ? <T variant="muted" style={{ marginTop: space.sm }}>Nothing scheduled today.</T> : null}
        {today.map((j, i) => (
          <Pressable key={j.id} onPress={() => router.push(`/jobs/${j.id}`)}
            style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md, borderTopWidth: i ? 1 : 0, borderTopColor: colors.border }}>
            <IconTile icon="airplane-outline" tone="info" round size={40} />
            <View style={{ flex: 1 }}>
              <T style={{ fontWeight: '600' }} numberOfLines={1}>{j.customer?.name ?? '—'}</T>
              <T variant="muted" numberOfLines={1}>{j.title ?? j.aircraft?.tail_number}</T>
            </View>
            <Badge label={j.status} tone={jobTone[j.status]} />
          </Pressable>
        ))}
      </Card>

      <Section title="Quick Actions">
        <Row gap={space.md}>
          {manager ? <QuickAction primary icon="add" label="New Job" onPress={() => router.push('/jobs/new')} /> : null}
          {manager ? <QuickAction icon="person-add-outline" label="New Customer" onPress={() => router.push('/customers/new')} /> : null}
          <QuickAction icon="calendar-outline" label="Schedule" onPress={() => router.push('/schedule')} primary={!manager} />
        </Row>
      </Section>

      <Card style={{ marginTop: space.md, backgroundColor: clock ? colors.successSoft : colors.card }}>
        <Row style={{ justifyContent: 'space-between' }}>
          <Row gap={space.md}>
            <IconTile icon="stopwatch-outline" tone={clock ? 'success' : 'neutral'} />
            <View>
              <T variant="muted">Time clock</T>
              <T style={{ fontWeight: '700' }}>{clock ? `On the clock · ${duration((now - new Date(clock.started_at).getTime()) / 60000)}` : 'Off the clock'}</T>
            </View>
          </Row>
          <Button small kind={clock ? 'danger' : 'primary'} icon={clock ? 'stop' : 'play'} title={clock ? 'Clock out' : 'Clock in'} onPress={toggleClock} />
        </Row>
      </Card>

      {manager ? (
        <Section title="Revenue">
          <Row gap={space.md}>
            <StatTile label="This Week" value={money(s.revenue_week).replace(/\.00$/, '')} icon="logo-usd" tone="info" onPress={() => router.push('/reports')} />
            <StatTile label="This Month" value={money(s.revenue_mtd).replace(/\.00$/, '')} icon="trending-up" tone="success" onPress={() => router.push('/reports')} />
          </Row>
        </Section>
      ) : null}

      <Section title="Overview">
        <Row gap={space.md} style={{ marginBottom: space.md }}>
          <StatTile label="In Progress" value={n('jobs_in_progress')} icon="time-outline" tone="warning" onPress={() => router.push({ pathname: '/jobs', params: { filter: 'in_progress' } })} />
          <StatTile label="Scheduled" value={n('jobs_scheduled')} icon="calendar-outline" tone="info" onPress={() => router.push({ pathname: '/jobs', params: { filter: 'scheduled' } })} />
        </Row>
        <Row gap={space.md}>
          <StatTile label="Completed" value={n('jobs_completed')} icon="checkmark-circle-outline" tone="success" onPress={() => router.push({ pathname: '/jobs', params: { filter: 'completed' } })} />
          <StatTile label="Customers" value={n('customers')} icon="briefcase-outline" tone="purple" onPress={() => router.push('/customers')} />
        </Row>
      </Section>

      {(Number(s.reminders_due) || Number(s.low_stock) || (manager && Number(s.outstanding))) ? (
        <Section title="Needs Attention">
          <Card style={{ padding: 0, overflow: 'hidden' }}>
            {Number(s.reminders_due) ? <ListRow icon="notifications-outline" tone="warning" title={`${s.reminders_due} service reminder${Number(s.reminders_due) === 1 ? '' : 's'} due soon`} onPress={() => router.push('/reminders' as Href)} /> : null}
            {manager && Number(s.outstanding) ? <ListRow icon="receipt-outline" tone={Number(s.overdue) ? 'danger' : 'info'} title={`${money(s.outstanding)} outstanding`} subtitle={Number(s.overdue) ? `${money(s.overdue)} overdue` : null} onPress={() => router.push('/invoices')} /> : null}
            {Number(s.low_stock) ? <ListRow icon="cube-outline" tone="danger" title={`${s.low_stock} supply item${Number(s.low_stock) === 1 ? '' : 's'} low on stock`} onPress={() => router.push('/inventory')} /> : null}
          </Card>
        </Section>
      ) : null}

      <Section title="Recent Activity">
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          {(q.data?.recent ?? []).length === 0 ? <T variant="muted" style={{ padding: space.lg }}>No jobs yet.</T> : null}
          {(q.data?.recent ?? []).map((j) => {
            const [icon, tone] = ACTIVITY_ICON[j.status] ?? ['ellipse-outline', 'neutral'];
            return (
              <ListRow key={j.id} icon={icon} tone={tone} title={j.title ?? 'Job'}
                subtitle={[j.customer?.name, j.aircraft?.tail_number].filter(Boolean).join(' - ')}
                right={<T variant="small">{j.status.replace('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase())}</T>}
                onPress={() => router.push(`/jobs/${j.id}`)} />
            );
          })}
        </Card>
      </Section>
    </Screen>
  );
}

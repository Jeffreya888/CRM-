import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { jobTone } from '../../../components/status';
import { notify } from '../../../components/FormSheet';
import { Badge, Button, Card, ErrorBanner, Ionicons, ListRow, Row, Screen, Section, StatTile, T } from '../../../components/ui';
import { duration, moneyShort, time } from '../../../lib/format';
import { canSeeMoney } from '../../../lib/plans';
import { useOrg } from '../../../lib/session';
import { friendlyError, supabase } from '../../../lib/supabase';
import { colors, space } from '../../../lib/theme';
import type { Job } from '../../../lib/types';
import { useQuery } from '../../../lib/useQuery';

type Stats = Record<string, number | null>;

export default function Dashboard() {
  const { orgId, org, role, plan, trialDays, session, profile } = useOrg();
  const money = canSeeMoney(role);
  const uid = session!.user.id;

  const q = useQuery(async () => {
    const start = new Date(); start.setHours(0, 0, 0, 0);
    const end = new Date(start); end.setDate(end.getDate() + 1);
    const [stats, jobs, clock] = await Promise.all([
      supabase.rpc('dashboard_stats', { p_org: orgId }),
      supabase.from('jobs')
        .select('id, number, title, status, priority, scheduled_start, aircraft:aircraft(tail_number, model), location:locations(airport_code, name), customer:customers(name)')
        .eq('org_id', orgId).gte('scheduled_start', start.toISOString()).lt('scheduled_start', end.toISOString())
        .neq('status', 'cancelled').order('scheduled_start'),
      supabase.from('time_entries').select('id, started_at, job_id').eq('org_id', orgId).eq('user_id', uid).is('ended_at', null).maybeSingle(),
    ]);
    if (stats.error) throw stats.error;
    return { stats: stats.data as Stats, jobs: (jobs.data ?? []) as unknown as Job[], clock: clock.data };
  }, [orgId]);

  const s = q.data?.stats ?? {};
  const clock = q.data?.clock;
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!clock) return;
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, [clock]);

  const toggleClock = async () => {
    try {
      if (clock) {
        const { error } = await supabase.from('time_entries').update({ ended_at: new Date().toISOString() }).eq('id', clock.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('time_entries').insert({ org_id: orgId, user_id: uid });
        if (error) throw error;
      }
      q.reload();
    } catch (e: any) {
      notify('Time clock', friendlyError(e.message));
    }
  };

  const hello = profile?.full_name?.split(' ')[0];

  return (
    <Screen refreshing={q.refreshing} onRefresh={q.refresh}>
      <T variant="h2">{hello ? `Hi, ${hello}` : org.name}</T>
      <T variant="muted" style={{ marginBottom: space.md }}>{new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</T>

      {plan === 'trial' || plan === 'expired' ? (
        <Card onPress={() => router.push('/paywall')} style={{ backgroundColor: plan === 'expired' ? colors.dangerSoft : colors.warningSoft }}>
          <Row>
            <Ionicons name={plan === 'expired' ? 'alert-circle' : 'time-outline'} size={22} color={plan === 'expired' ? colors.danger : colors.warning} />
            <T style={{ flex: 1, fontWeight: '600' }}>
              {plan === 'expired' ? 'Your plan has ended. Tap to choose a plan.' : `${trialDays} day${trialDays === 1 ? '' : 's'} left in your free trial. See plans`}
            </T>
          </Row>
        </Card>
      ) : null}
      <ErrorBanner message={q.error} onRetry={q.refresh} />

      <Card style={{ backgroundColor: clock ? colors.successSoft : colors.card }}>
        <Row style={{ justifyContent: 'space-between' }}>
          <View>
            <T variant="overline">Time clock</T>
            <T variant="h3">{clock ? `On the clock · ${duration((now - new Date(clock.started_at).getTime()) / 60000)}` : 'Off the clock'}</T>
          </View>
          <Button small kind={clock ? 'danger' : 'primary'} icon={clock ? 'stop' : 'play'} title={clock ? 'Clock out' : 'Clock in'} onPress={toggleClock} />
        </Row>
      </Card>

      <Row style={{ flexWrap: 'wrap' }} gap={space.md}>
        <StatTile label="Jobs today" value={s.jobs_today ?? '—'} icon="today-outline" onPress={() => router.push('/schedule')} />
        <StatTile label="In progress" value={s.jobs_in_progress ?? '—'} icon="construct-outline" tone="warning" onPress={() => router.push('/jobs')} />
        {money ? (
          <>
            <StatTile label="Revenue this month" value={moneyShort(s.revenue_mtd)} icon="trending-up-outline" tone="success" onPress={() => router.push('/reports')} />
            <StatTile label="Outstanding" value={moneyShort(s.outstanding)} icon="receipt-outline" tone={Number(s.overdue) > 0 ? 'danger' : 'info'} onPress={() => router.push('/invoices')} />
            <StatTile label="Open quotes" value={s.open_quotes ?? '—'} icon="document-text-outline" tone="info" onPress={() => router.push('/quotes')} />
            <StatTile label="Weighted pipeline" value={moneyShort(s.pipeline_value)} icon="funnel-outline" tone="primary" onPress={() => router.push('/pipeline')} />
          </>
        ) : null}
        <StatTile label="Reminders due (14d)" value={s.reminders_due ?? '—'} icon="notifications-outline" tone="warning" onPress={() => router.push('/reminders')} />
        <StatTile label="Low stock items" value={s.low_stock ?? '—'} icon="cube-outline" tone={Number(s.low_stock) > 0 ? 'danger' : 'neutral'} onPress={() => router.push('/inventory')} />
      </Row>

      {money ? (
        <Section title="Quick actions">
          <Row style={{ flexWrap: 'wrap' }}>
            <Button small kind="secondary" icon="document-text-outline" title="New quote" onPress={() => router.push('/quotes/edit')} />
            <Button small kind="secondary" icon="construct-outline" title="New job" onPress={() => router.push('/jobs/edit')} />
            <Button small kind="secondary" icon="person-add-outline" title="New customer" onPress={() => router.push('/customers/edit')} />
            <Button small kind="secondary" icon="receipt-outline" title="New invoice" onPress={() => router.push('/invoices/edit')} />
          </Row>
        </Section>
      ) : null}

      <Section title="Today's jobs" action={<Button small kind="ghost" title="Schedule" onPress={() => router.push('/schedule')} />}>
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          {(q.data?.jobs ?? []).length === 0 ? (
            <T variant="muted" style={{ padding: space.lg }}>Nothing scheduled today.</T>
          ) : (
            q.data!.jobs.map((j) => (
              <ListRow
                key={j.id}
                icon="airplane-outline"
                title={`${time(j.scheduled_start)} · ${j.aircraft?.tail_number ?? j.number}`}
                subtitle={j.title ?? j.customer?.name}
                meta={[j.location?.airport_code, j.location?.name].filter(Boolean).join(' · ')}
                right={<Badge label={j.status} tone={jobTone[j.status]} />}
                onPress={() => router.push(`/jobs/${j.id}`)}
              />
            ))
          )}
        </Card>
      </Section>
    </Screen>
  );
}

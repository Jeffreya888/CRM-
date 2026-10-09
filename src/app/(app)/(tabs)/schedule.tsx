import { addDays, format, isSameDay, startOfWeek } from 'date-fns';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { jobTone, priorityTone } from '../../../components/status';
import { Badge, Card, EmptyState, ErrorBanner, Fab, IconButton, Ionicons, Row, Screen, T } from '../../../components/ui';
import { time } from '../../../lib/format';
import { canSeeMoney } from '../../../lib/plans';
import { useOrg } from '../../../lib/session';
import { supabase } from '../../../lib/supabase';
import { colors, radius, space } from '../../../lib/theme';
import type { Job } from '../../../lib/types';
import { useQuery } from '../../../lib/useQuery';

/** Week view with day strip; technicians can filter to "my jobs". */
export default function Schedule() {
  const { orgId, role, session } = useOrg();
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [day, setDay] = useState(new Date());
  const [mine, setMine] = useState(role === 'technician');

  const q = useQuery(async () => {
    const { data, error } = await supabase.from('jobs')
      .select('id, number, title, status, priority, scheduled_start, scheduled_end, weather_sensitive, aircraft:aircraft(tail_number, model), location:locations(airport_code, name), customer:customers(name), job_assignments(user_id)')
      .eq('org_id', orgId)
      .gte('scheduled_start', weekStart.toISOString())
      .lt('scheduled_start', addDays(weekStart, 7).toISOString())
      .neq('status', 'cancelled')
      .order('scheduled_start');
    if (error) throw error;
    return (data ?? []) as unknown as Job[];
  }, [orgId, weekStart.getTime()]);

  const uid = session!.user.id;
  const jobs = (q.data ?? []).filter((j) => !mine || j.job_assignments?.some((a) => a.user_id === uid));
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const dayJobs = jobs.filter((j) => j.scheduled_start && isSameDay(new Date(j.scheduled_start), day));

  const shift = (n: number) => {
    const ws = addDays(weekStart, n * 7);
    setWeekStart(ws);
    setDay(ws);
  };

  return (
    <View style={{ flex: 1 }}>
      <Screen refreshing={q.refreshing} onRefresh={q.refresh}>
        <Row style={{ justifyContent: 'space-between' }}>
          <IconButton icon="chevron-back" onPress={() => shift(-1)} label="Previous week" />
          <Pressable onPress={() => { const ws = startOfWeek(new Date(), { weekStartsOn: 1 }); setWeekStart(ws); setDay(new Date()); }}>
            <T variant="h3">{format(weekStart, 'MMM d')} – {format(addDays(weekStart, 6), 'MMM d')}</T>
          </Pressable>
          <IconButton icon="chevron-forward" onPress={() => shift(1)} label="Next week" />
        </Row>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, marginVertical: space.md }}>
          {days.map((d) => {
            const active = isSameDay(d, day);
            const count = jobs.filter((j) => j.scheduled_start && isSameDay(new Date(j.scheduled_start), d)).length;
            return (
              <Pressable key={d.toISOString()} onPress={() => setDay(d)}
                style={{ width: 52, paddingVertical: 8, borderRadius: radius.md, alignItems: 'center', backgroundColor: active ? colors.primary : colors.card }}>
                <T variant="small" style={{ color: active ? '#C7D2FE' : colors.textMuted }}>{format(d, 'EEE')}</T>
                <T variant="h3" style={{ color: active ? colors.white : colors.text }}>{format(d, 'd')}</T>
                <View style={{ height: 6, flexDirection: 'row', gap: 2, marginTop: 2 }}>
                  {Array.from({ length: Math.min(count, 4) }).map((_, i) => (
                    <View key={i} style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: active ? colors.accent : colors.primary }} />
                  ))}
                </View>
              </Pressable>
            );
          })}
        </ScrollView>
        <Row style={{ justifyContent: 'space-between', marginBottom: space.sm }}>
          <T variant="overline">{format(day, 'EEEE, MMMM d')}</T>
          <Pressable onPress={() => setMine((m) => !m)}>
            <Row gap={4}>
              <Ionicons name={mine ? 'checkbox' : 'square-outline'} size={18} color={colors.primary} />
              <T variant="muted">My jobs only</T>
            </Row>
          </Pressable>
        </Row>
        <ErrorBanner message={q.error} />
        {dayJobs.length === 0 ? (
          <EmptyState icon="calendar-clear-outline" title="No jobs this day" />
        ) : (
          dayJobs.map((j) => (
            <Card key={j.id} onPress={() => router.push(`/jobs/${j.id}`)} style={{ borderLeftWidth: 4, borderLeftColor: colors.primary }}>
              <Row style={{ justifyContent: 'space-between' }}>
                <T variant="h3">{time(j.scheduled_start)}{j.scheduled_end ? ` – ${time(j.scheduled_end)}` : ''}</T>
                <Row gap={4}>
                  {j.priority !== 'normal' ? <Badge label={j.priority} tone={priorityTone[j.priority]} /> : null}
                  <Badge label={j.status} tone={jobTone[j.status]} />
                </Row>
              </Row>
              <T style={{ fontWeight: '600', marginTop: 4 }}>{j.aircraft?.tail_number ?? '—'} · {j.customer?.name}</T>
              <T variant="muted" numberOfLines={2}>{j.title}</T>
              <Row gap={4} style={{ marginTop: 4 }}>
                <Ionicons name="location-outline" size={14} color={colors.textMuted} />
                <T variant="small">{[j.location?.airport_code, j.location?.name].filter(Boolean).join(' · ') || 'No location'}</T>
                {j.weather_sensitive ? <><Ionicons name="rainy-outline" size={14} color={colors.warning} /><T variant="small">Weather-sensitive</T></> : null}
              </Row>
            </Card>
          ))
        )}
      </Screen>
      {canSeeMoney(role) ? <Fab onPress={() => router.push({ pathname: '/jobs/edit', params: { start: (() => { const d = new Date(day); d.setHours(9, 0, 0, 0); return d.toISOString(); })() } })} label="New job" /> : null}
    </View>
  );
}

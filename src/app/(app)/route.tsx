import { addDays, format, isSameDay, startOfDay } from 'date-fns';
import * as Linking from 'expo-linking';
import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { Badge, Button, Card, EmptyState, ErrorBanner, IconButton, Ionicons, Loading, Row, Screen, Segmented, T } from '../../components/ui';
import { pointOf } from '../../lib/geo';
import { directionsUrl } from '../../lib/jobs';
import { isManager } from '../../lib/plans';
import { useOrg } from '../../lib/session';
import { supabase } from '../../lib/supabase';
import { colors, space } from '../../lib/theme';
import { drivingMiles, routeUrl, type Point } from '../../lib/travel';
import { useQuery } from '../../lib/useQuery';

type Stop = {
  id: string; number: string; title: string | null; status: string; scheduled_start: string; scheduled_end: string | null;
  service_mode: string | null; service_address: string | null; service_lat: number | null; service_lng: number | null;
  on_my_way_at: string | null; travel_before_min: number;
  customer: { name: string; phone: string | null; service_address: string | null; service_lat: number | null; service_lng: number | null } | null;
  aircraft: { tail_number: string | null } | null;
  location: { name: string | null; airport_code: string | null; fbo_name: string | null; address: string | null; latitude: number | null; longitude: number | null } | null;
  job_assignments: { user_id: string }[];
};

/** Where a stop is: its own address, the facility, or the customer's service address. */
function placeOf(s: Stop): { text: string | null; point: Point | null } {
  if (s.service_address) return { text: s.service_address, point: pointOf(s.service_lat, s.service_lng) };
  if (s.location) {
    const l = s.location;
    return { text: l.address ?? [l.fbo_name, l.name, l.airport_code].filter(Boolean).join(' ') ?? null, point: pointOf(l.latitude, l.longitude) };
  }
  return { text: s.customer?.service_address ?? null, point: pointOf(s.customer?.service_lat, s.customer?.service_lng) };
}

/**
 * The day's mobile stops in order (by start time), with one-tap directions
 * per stop and the whole route in Google Maps. Shop jobs are counted, not routed.
 */
export default function RouteScreen() {
  const { org, orgId, role, session, branchId } = useOrg();
  const uid = session?.user.id;
  const manager = isManager(role);
  const [day, setDay] = useState(() => startOfDay(new Date()));
  const [who, setWho] = useState<'me' | 'all'>(manager ? 'all' : 'me');

  const q = useQuery(async () => {
    const from = startOfDay(day);
    let jq = supabase.from('jobs')
      .select('id, number, title, status, scheduled_start, scheduled_end, service_mode, service_address, service_lat, service_lng, on_my_way_at, travel_before_min, customer:customers(name, phone, service_address, service_lat, service_lng), aircraft:aircraft(tail_number), location:locations(name, airport_code, fbo_name, address, latitude, longitude), job_assignments(user_id)')
      .eq('org_id', orgId).in('status', ['tentative', 'scheduled', 'in_progress', 'on_hold', 'completed'])
      .gte('scheduled_start', from.toISOString()).lt('scheduled_start', addDays(from, 1).toISOString()).order('scheduled_start');
    if (branchId) jq = jq.eq('branch_id', branchId);
    const { data, error } = await jq;
    if (error) throw error;
    return (data ?? []) as unknown as Stop[];
  }, [orgId, day.getTime(), branchId]);

  if (q.loading && !q.data) return <Loading />;
  const all = (q.data ?? []).filter((s) => who === 'all' || s.job_assignments.some((a) => a.user_id === uid));
  const stops = all.filter((s) => s.service_mode !== 'shop');
  const shopCount = all.length - stops.length;
  const places = stops.map(placeOf);
  const base = pointOf(org.base_lat, org.base_lng);
  // Leg distances (estimates) where both ends are on the map.
  const legs = places.map((p, i) => {
    const prev = i === 0 ? base : places[i - 1]!.point;
    return prev && p.point ? drivingMiles(prev, p.point) : null;
  });
  const total = legs.reduce<number>((n, m) => n + (m ?? 0), 0);
  const full = routeUrl(places.map((p) => (p.point ? `${p.point.lat},${p.point.lng}` : p.text ?? '')).filter(Boolean), org.base_address);
  const today = isSameDay(day, new Date());

  return (
    <Screen refreshing={q.refreshing} onRefresh={q.refresh}>
      <Stack.Screen options={{ title: 'Route' }} />
      <ErrorBanner message={q.error} onRetry={q.reload} />
      <Row style={{ justifyContent: 'space-between', marginBottom: space.md }}>
        <IconButton icon="chevron-back" label="Previous day" onPress={() => setDay((d) => addDays(d, -1))} />
        <View style={{ alignItems: 'center' }}>
          <T style={{ fontWeight: '700' }}>{today ? 'Today' : format(day, 'EEEE')}</T>
          <T variant="small">{format(day, 'MMM d, yyyy')}</T>
        </View>
        <IconButton icon="chevron-forward" label="Next day" onPress={() => setDay((d) => addDays(d, 1))} />
      </Row>
      {manager ? <Segmented value={who} onChange={setWho} options={[{ value: 'all', label: 'Whole team' }, { value: 'me', label: 'My stops' }]} /> : null}

      {stops.length ? (
        <Card style={{ marginBottom: space.md }}>
          <Row style={{ justifyContent: 'space-between' }}>
            <View>
              <T style={{ fontWeight: '700' }}>{stops.length} stop{stops.length === 1 ? '' : 's'}</T>
              <T variant="small">{total ? `About ${Math.round(total)} miles of driving` : 'Add addresses to see driving distance'}{org.base_address ? ` from ${org.base_address}` : ''}</T>
            </View>
            {full ? <Button small icon="map-outline" title="Open route" onPress={() => Linking.openURL(full)} /> : null}
          </Row>
        </Card>
      ) : null}

      {stops.map((s, i) => {
        const p = places[i]!;
        const dir = p.point ? directionsUrl({ latitude: p.point.lat, longitude: p.point.lng }) : p.text ? directionsUrl({ address: p.text }) : null;
        const done = s.status === 'completed';
        return (
          <Card key={s.id} onPress={() => router.push(`/jobs/${s.id}`)} style={done ? { opacity: 0.6 } : undefined}>
            <Row style={{ alignItems: 'flex-start' }}>
              <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: done ? colors.successSoft : colors.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
                {done ? <Ionicons name="checkmark" size={16} color={colors.success} /> : <T style={{ fontWeight: '700', color: colors.primaryText }}>{i + 1}</T>}
              </View>
              <View style={{ flex: 1 }}>
                <Row style={{ justifyContent: 'space-between' }}>
                  <T style={{ fontWeight: '700' }}>{format(new Date(s.scheduled_start), 'h:mm a')} · {s.customer?.name ?? 'Customer'}</T>
                  {s.on_my_way_at && !done ? <Badge raw label="On the way" tone="info" /> : null}
                </Row>
                <T variant="muted">{[s.aircraft?.tail_number, s.title].filter(Boolean).join(' · ') || s.number}</T>
                <T variant="small">{p.text ?? 'No address yet'}{legs[i] != null ? ` · ~${legs[i]} mi` : ''}</T>
              </View>
            </Row>
            <Row style={{ marginTop: space.sm, flexWrap: 'wrap' }}>
              {dir ? <Button small kind="secondary" icon="navigate-outline" title="Directions" onPress={() => Linking.openURL(dir)} /> : null}
              {s.customer?.phone ? <Button small kind="ghost" icon="call-outline" title="Call" onPress={() => Linking.openURL(`tel:${s.customer!.phone!.replace(/[^0-9+]/g, '')}`)} /> : null}
            </Row>
          </Card>
        );
      })}

      {!stops.length ? (
        <EmptyState icon="navigate-outline" title="No mobile stops" body={who === 'me' ? 'Nothing assigned to you on this day.' : 'No mobile jobs scheduled on this day.'} />
      ) : null}
      {shopCount ? <T variant="small" style={{ marginTop: space.md }}>{shopCount} shop job{shopCount === 1 ? '' : 's'} this day (not on the route).</T> : null}
    </Screen>
  );
}

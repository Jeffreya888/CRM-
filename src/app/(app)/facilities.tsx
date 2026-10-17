import { router, Stack } from 'expo-router';
import * as Linking from 'expo-linking';
import { useState } from 'react';
import { FlatList, View } from 'react-native';
import { Badge, Button, Card, EmptyState, ErrorBanner, IconButton, IconTile, Row, SearchBar, Segmented, T } from '../../components/ui';
import { directionsUrl, FACILITY_KINDS, facilityKindInfo, facilityKindsFor, facilityTitle, siteTypeLabel, type FacilityKind } from '../../lib/assets';
import { canEdit } from '../../lib/plans';
import { useOrg } from '../../lib/session';
import { must, supabase } from '../../lib/supabase';
import { colors, space } from '../../lib/theme';
import type { Location } from '../../lib/types';
import { useQuery } from '../../lib/useQuery';

/** Airports/FBOs, marinas and service sites where the work happens (not company branches). */
export default function Facilities() {
  const { orgId, role, businessTypes } = useOrg();
  const [kind, setKind] = useState<FacilityKind | 'all'>('all');
  const [search, setSearch] = useState('');
  const [showInactive, setShowInactive] = useState(false);

  const q = useQuery(async () => {
    const [locs, reqs] = await Promise.all([
      must(supabase.from('locations').select('*').eq('org_id', orgId).order('airport_code', { nullsFirst: false }).order('name')),
      must(supabase.from('facility_requirements').select('location_id').eq('org_id', orgId)),
    ]);
    const reqCount: Record<string, number> = {};
    for (const r of (reqs ?? []) as { location_id: string }[]) reqCount[r.location_id] = (reqCount[r.location_id] ?? 0) + 1;
    return { locs: (locs ?? []) as Location[], reqCount };
  }, [orgId]);

  const all = (q.data?.locs ?? []).filter((l) => showInactive || l.active !== false);
  const kinds = FACILITY_KINDS.filter((k) => facilityKindsFor(businessTypes).includes(k) || all.some((l) => l.kind === k.value));
  const s = search.trim().toLowerCase();
  const rows = all
    .filter((l) => kind === 'all' || l.kind === kind)
    .filter((l) => !s || [l.name, l.airport_code, l.fbo_name, l.address].some((x) => x?.toLowerCase().includes(s)));
  const inactive = (q.data?.locs ?? []).filter((l) => l.active === false).length;
  const title = kinds.length === 1 ? kinds[0]!.plural : 'Facilities';
  const writable = canEdit(role);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Stack.Screen options={{
        title,
        headerRight: () => writable ? <Button small icon="add" title="Add" onPress={() => router.push({ pathname: '/facilities/edit', params: kind !== 'all' ? { kind } : {} })} /> : null,
      }} />
      <FlatList
        data={rows}
        keyExtractor={(l) => l.id}
        refreshing={q.refreshing}
        onRefresh={q.refresh}
        contentContainerStyle={{ padding: space.lg, paddingBottom: 110 }}
        ListHeaderComponent={
          <View>
            <T variant="muted" style={{ marginBottom: space.md }}>Where you do the work: access, water and power, vendor rules and fees. Company branches live in Settings.</T>
            <SearchBar value={search} onChange={setSearch} placeholder="Code, name, FBO, address" />
            {kinds.length > 1 ? (
              <Segmented value={kind} onChange={setKind} options={[
                { value: 'all' as const, label: 'All', count: all.length },
                ...kinds.map((k) => ({ value: k.value, label: k.plural, count: all.filter((l) => l.kind === k.value).length })),
              ]} />
            ) : null}
            {inactive ? (
              <Button small kind="ghost" style={{ alignSelf: 'flex-start', marginBottom: space.sm }} title={showInactive ? 'Hide archived' : `Show archived (${inactive})`} onPress={() => setShowInactive((v) => !v)} />
            ) : null}
            <ErrorBanner message={q.error} onRetry={q.reload} />
          </View>
        }
        renderItem={({ item: l }) => {
          const info = facilityKindInfo(l.kind);
          const dir = directionsUrl(l);
          const reqs = q.data?.reqCount[l.id] ?? 0;
          return (
            <Card onPress={() => router.push(`/facilities/${l.id}`)}>
              <Row gap={space.md} style={{ alignItems: 'flex-start' }}>
                <IconTile icon={info.icon} tone={l.kind === 'airport' ? 'primary' : l.kind === 'marina' ? 'info' : 'warning'} />
                <View style={{ flex: 1 }}>
                  <T style={{ fontWeight: '700' }} numberOfLines={1}>{facilityTitle(l) + (l.active === false ? ' (archived)' : '')}</T>
                  <T variant="muted" numberOfLines={1}>{[l.kind === 'service_site' ? siteTypeLabel(l.site_type) : info.label, l.fbo_name].filter(Boolean).join(' · ')}</T>
                  {l.address ? <T variant="small" numberOfLines={1}>{l.address}</T> : null}
                  <Row gap={4} style={{ marginTop: 6, flexWrap: 'wrap' }}>
                    <Badge label={l.has_water ? 'Water' : 'No water'} tone={l.has_water ? 'success' : 'warning'} raw />
                    <Badge label={l.has_power ? 'Power' : 'No power'} tone={l.has_power ? 'success' : 'warning'} raw />
                    {l.hangar_available ? <Badge label={`Hangar${l.hangar_capacity > 1 ? ` ×${l.hangar_capacity}` : ''}`} tone="info" raw /> : null}
                    {reqs ? <Badge label={`${reqs} requirement${reqs === 1 ? '' : 's'}`} tone="purple" raw /> : null}
                    {(l.fees ?? []).length ? <Badge label={`${l.fees.length} fee${l.fees.length === 1 ? '' : 's'}`} raw /> : null}
                  </Row>
                </View>
                <View>
                  {l.contact_phone ? <IconButton icon="call-outline" label="Call" onPress={() => Linking.openURL(`tel:${l.contact_phone}`)} /> : null}
                  {dir ? <IconButton icon="navigate-outline" label="Directions" onPress={() => Linking.openURL(dir)} /> : null}
                </View>
              </Row>
            </Card>
          );
        }}
        ListEmptyComponent={q.loading ? null : (
          <EmptyState icon="location-outline" title={s ? 'No matches' : 'No facilities yet'}
            body={s ? 'Try a different code or name.' : 'Save the airports, marinas and service sites you work at, with access codes, water and power, and vendor requirements.'}
            action={writable && !s ? <Button icon="add" title="Add a facility" onPress={() => router.push('/facilities/edit')} /> : undefined} />
        )}
      />
    </View>
  );
}

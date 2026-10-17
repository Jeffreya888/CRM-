import { router, Stack, useLocalSearchParams } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import * as Linking from 'expo-linking';
import { useState } from 'react';
import { Image, Pressable, View } from 'react-native';
import { confirmAction, FormSheet, notify, type FieldDef } from '../../../components/FormSheet';
import { Badge, Button, Card, EmptyState, ErrorBanner, IconButton, Ionicons, KeyValue, ListRow, Loading, Row, Screen, Section, T } from '../../../components/ui';
import {
  assetIcon, certMatches, directionsUrl, expiryState, facilityKindInfo, facilityTitle, mapUrl, REQUIREMENT_KINDS, siteTypeLabel,
} from '../../../lib/assets';
import { pickImage, removeFile, signedUrls, uploadImage } from '../../../lib/files';
import { date, money } from '../../../lib/format';
import { useLookups } from '../../../lib/lookups';
import { canEdit, isManager } from '../../../lib/plans';
import { useOrg } from '../../../lib/session';
import { friendlyError, supabase } from '../../../lib/supabase';
import { colors, radius, space } from '../../../lib/theme';
import type { Location } from '../../../lib/types';
import { useQuery } from '../../../lib/useQuery';

type Req = { id: string; name: string; kind: string; applies_to: 'company' | 'person'; notes: string | null };
type Cert = { id: string; name: string; kind: string; user_id: string | null; requirement_id: string | null; expires_on: string | null };

const REQ_FIELDS: FieldDef[] = [
  { key: 'name', label: 'Requirement', type: 'text', required: true, placeholder: '$2M insurance naming Signature, KTEB ramp badge' },
  { key: 'kind', label: 'Type', type: 'select', options: REQUIREMENT_KINDS },
  { key: 'applies_to', label: 'Who needs it', type: 'select', options: [{ value: 'company', label: 'The company (one document)' }, { value: 'person', label: 'Each crew member' }] },
  { key: 'notes', label: 'Notes', type: 'multiline', placeholder: 'Where to apply, renewal steps, contact' },
];

export default function FacilityDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { orgId, role, perm } = useOrg();
  const { members, memberName } = useLookups();
  const manager = isManager(role);
  const writable = canEdit(role);
  const [reqSheet, setReqSheet] = useState<{ open: boolean; row?: Req }>({ open: false });
  const [docFor, setDocFor] = useState<Req | null>(null);
  const [showCode, setShowCode] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const q = useQuery(async () => {
    const none = Promise.resolve({ data: null as any, error: null });
    const [l, reqs, certs, secret, assets] = await Promise.all([
      supabase.from('locations').select('*').eq('id', id).single(),
      supabase.from('facility_requirements').select('id, name, kind, applies_to, notes').eq('location_id', id).order('created_at'),
      supabase.from('certifications').select('id, name, kind, user_id, requirement_id, expires_on').eq('org_id', orgId),
      manager ? supabase.from('location_secrets').select('gate_code, notes').eq('location_id', id).maybeSingle() : none,
      supabase.from('aircraft').select('id, tail_number, manufacturer, model, asset_type').eq('home_location_id', id).eq('active', true).order('tail_number'),
    ]);
    if (l.error) throw l.error;
    const loc = l.data as Location;
    const photoUrls = loc.photos?.length ? await signedUrls(loc.photos).catch(() => ({} as Record<string, string>)) : {};
    return {
      l: loc, reqs: (reqs.data ?? []) as Req[], certs: (certs.data ?? []) as Cert[],
      secret: secret.data as { gate_code: string | null; notes: string | null } | null, assets: (assets.data ?? []) as any[], photoUrls,
    };
  }, [id, orgId, manager]);

  if (q.loading) return <Loading />;
  if (!q.data) return <Screen><Stack.Screen options={{ title: 'Facility' }} /><ErrorBanner message={q.error ?? 'Not found'} onRetry={q.reload} /></Screen>;
  const { l, reqs, certs, secret, assets, photoUrls } = q.data;
  const info = facilityKindInfo(l.kind);
  const dir = directionsUrl(l);
  const map = mapUrl(l);
  const crew = members.filter((m) => m.role !== 'viewer');
  const isAirport = l.kind === 'airport';

  const addPhoto = async (source: 'camera' | 'library') => {
    setError(null);
    try {
      const uri = await pickImage(source);
      if (!uri) return;
      setBusy(true);
      const path = await uploadImage(orgId, `facilities/${id}`, uri);
      const { error: e } = await supabase.from('locations').update({ photos: [...(l.photos ?? []), path] }).eq('id', id);
      if (e) { await removeFile(path); throw new Error(friendlyError(e.message)); }
      q.reload();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  const removePhoto = (path: string) => confirmAction('Remove photo?', 'This deletes the photo for everyone.', async () => {
    const { error: e } = await supabase.from('locations').update({ photos: (l.photos ?? []).filter((p) => p !== path) }).eq('id', id);
    if (e) return setError(friendlyError(e.message));
    await removeFile(path);
    q.reload();
  }, true);

  const reqStatus = (r: Req) => {
    if (r.applies_to === 'company') {
      const docs = certs.filter((c) => c.user_id === null && certMatches(c, r));
      const best = docs.sort((a, b) => (b.expires_on ?? '9999').localeCompare(a.expires_on ?? '9999'))[0];
      return { docs, best, state: best ? expiryState(best.expires_on) : { label: 'Missing', tone: 'danger' as const } };
    }
    const per = crew.map((m) => {
      const mine = certs.filter((c) => c.user_id === m.user_id && certMatches(c, r))
        .sort((a, b) => (b.expires_on ?? '9999').localeCompare(a.expires_on ?? '9999'))[0];
      return { m, cert: mine, state: mine ? expiryState(mine.expires_on) : null };
    });
    const ok = per.filter((p) => p.state && p.state.tone !== 'danger').length;
    const warn = per.some((p) => p.state?.tone === 'warning');
    return { per, ok, state: { label: `${ok} of ${crew.length} crew`, tone: ok === crew.length ? (warn ? 'warning' as const : 'success' as const) : 'danger' as const } };
  };

  return (
    <Screen refreshing={q.refreshing} onRefresh={q.refresh}>
      <Stack.Screen options={{
        title: l.airport_code || l.name,
        headerRight: () => writable ? <IconButton icon="create-outline" label="Edit" onPress={() => router.push({ pathname: '/facilities/edit', params: { id } })} /> : null,
      }} />
      <ErrorBanner message={error} />
      <Card>
        <Row gap={space.sm} style={{ flexWrap: 'wrap' }}>
          <Badge label={l.kind === 'service_site' ? siteTypeLabel(l.site_type) ?? info.label : info.label} tone="primary" raw />
          {l.active === false ? <Badge label="Archived" tone="neutral" raw /> : null}
        </Row>
        <T variant="h2" style={{ marginTop: space.sm }}>{facilityTitle(l)}</T>
        {l.fbo_name ? <T variant="muted">{l.fbo_name}</T> : null}
        {l.address ? <T style={{ marginTop: space.sm }}>{l.address}</T> : null}
        <Row style={{ marginTop: space.md, flexWrap: 'wrap' }}>
          {dir ? <Button small icon="navigate-outline" title="Directions" onPress={() => Linking.openURL(dir)} /> : null}
          {l.contact_phone ? <Button small kind="secondary" icon="call-outline" title={isAirport ? 'Call FBO' : 'Call'} onPress={() => Linking.openURL(`tel:${l.contact_phone}`)} /> : null}
        </Row>
      </Card>

      <Section title="Map pin" icon="pin-outline">
        <Card>
          {l.latitude != null && l.longitude != null ? (
            <Pressable onPress={() => map && Linking.openURL(map)} style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: space.md }, pressed && { opacity: 0.6 }]}>
              <View style={{ width: 56, height: 56, borderRadius: radius.md, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="location" size={30} color={colors.primaryText} />
              </View>
              <View style={{ flex: 1 }}>
                <T style={{ fontWeight: '600' }}>{Number(l.latitude).toFixed(5)}, {Number(l.longitude).toFixed(5)}</T>
                <T variant="small">Tap to open in Maps</T>
              </View>
              <Ionicons name="open-outline" size={18} color={colors.textMuted} />
            </Pressable>
          ) : (
            <View>
              <T variant="muted">{l.address ? 'No pin set. Maps and directions use the address.' : 'Add an address or a map pin to get directions.'}</T>
              {map ? <Button small kind="ghost" icon="map-outline" title="Open address in Maps" style={{ alignSelf: 'flex-start', marginTop: space.sm }} onPress={() => Linking.openURL(map)} /> : null}
            </View>
          )}
        </Card>
      </Section>

      <Section title="Access" icon="key-outline">
        <Card>
          {manager ? (
            <View style={{ marginBottom: space.sm }}>
              <Row style={{ justifyContent: 'space-between' }}>
                <View style={{ flex: 1 }}>
                  <T variant="muted">Gate / access code</T>
                  <T style={{ fontWeight: '700', fontSize: 20, letterSpacing: 2 }}>{secret?.gate_code ? (showCode ? secret.gate_code : '••••••') : 'Not set'}</T>
                </View>
                {secret?.gate_code ? (
                  <Row gap={0}>
                    <IconButton icon={showCode ? 'eye-off-outline' : 'eye-outline'} label={showCode ? 'Hide code' : 'Show code'} onPress={() => setShowCode((v) => !v)} />
                    <IconButton icon="copy-outline" label="Copy code" onPress={async () => { await Clipboard.setStringAsync(secret.gate_code!); notify('Code copied'); }} />
                  </Row>
                ) : null}
              </Row>
              {secret?.notes ? <T variant="small" style={{ marginTop: 4 }}>{secret.notes}</T> : null}
              <T variant="small" style={{ marginTop: 4, color: colors.textFaint }}>Visible to owners and managers only.</T>
            </View>
          ) : null}
          <KeyValue label="Access notes" value={l.access_notes ?? (manager ? null : 'Ask your manager for gate codes.')} />
          <Row gap={6} style={{ flexWrap: 'wrap', marginTop: space.sm }}>
            <Badge label={l.has_water ? 'Water available' : 'No water'} tone={l.has_water ? 'success' : 'warning'} raw />
            <Badge label={l.has_power ? 'Power available' : 'No power'} tone={l.has_power ? 'success' : 'warning'} raw />
            <Badge label={l.hangar_available ? `${isAirport ? 'Hangar' : 'Indoor space'} · fits ${l.hangar_capacity}` : `No ${isAirport ? 'hangar' : 'indoor space'}`} tone={l.hangar_available ? 'info' : 'neutral'} raw />
          </Row>
          {l.hangar_available && l.hangar_notes ? <T variant="small" style={{ marginTop: space.sm }}>{l.hangar_notes}</T> : null}
        </Card>
      </Section>

      <Section title="Vendor requirements" icon="shield-checkmark-outline"
        action={manager ? <Button small kind="ghost" icon="add" title="Add" onPress={() => setReqSheet({ open: true })} /> : null}>
        {reqs.length ? reqs.map((r) => {
          const st = reqStatus(r);
          return (
            <Card key={r.id} onPress={manager ? () => setReqSheet({ open: true, row: r }) : undefined}>
              <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <View style={{ flex: 1 }}>
                  <T style={{ fontWeight: '700' }}>{r.name}</T>
                  <T variant="small">{REQUIREMENT_KINDS.find((k) => k.value === r.kind)?.label ?? r.kind} · {r.applies_to === 'company' ? 'Company document' : 'Each crew member'}</T>
                </View>
                <Badge label={st.state.label} tone={st.state.tone} raw />
              </Row>
              {r.notes ? <T variant="small" style={{ marginTop: 4 }}>{r.notes}</T> : null}
              {'docs' in st && st.docs ? (
                st.docs.length ? st.docs.map((c) => {
                  const e = expiryState(c.expires_on);
                  return (
                    <Row key={c.id} style={{ marginTop: space.sm, justifyContent: 'space-between' }}>
                      <T variant="muted" style={{ flex: 1 }} numberOfLines={1}>{c.name}</T>
                      <T variant="small" style={{ color: e.tone === 'danger' ? colors.danger : e.tone === 'warning' ? colors.warning : colors.textMuted }}>
                        {c.expires_on ? `${e.label === 'Valid' ? 'Expires' : e.label} · ${date(c.expires_on)}` : 'No expiry'}
                      </T>
                    </Row>
                  );
                }) : (
                  <Row style={{ marginTop: space.sm, justifyContent: 'space-between' }}>
                    <T variant="small" style={{ color: colors.danger, flex: 1 }}>No matching company document on file.</T>
                    {manager ? <Button small kind="secondary" icon="add" title="Add document" onPress={() => setDocFor(r)} /> : null}
                  </Row>
                )
              ) : null}
              {'per' in st && st.per ? (
                <View style={{ marginTop: space.sm }}>
                  {st.per.filter((p) => !p.state || p.state.tone !== 'success').slice(0, 6).map((p) => (
                    <Row key={p.m.user_id} style={{ justifyContent: 'space-between' }}>
                      <T variant="small" style={{ color: colors.text }}>{memberName(p.m.user_id)}</T>
                      <T variant="small" style={{ color: !p.state || p.state.tone === 'danger' ? colors.danger : colors.warning }}>
                        {!p.state ? 'Missing' : `${p.state.label}${p.cert?.expires_on ? ` · ${date(p.cert.expires_on)}` : ''}`}
                      </T>
                    </Row>
                  ))}
                </View>
              ) : null}
            </Card>
          );
        }) : (
          <Card><T variant="muted">No requirements. Add insurance certificates, badges or vendor registration this {isAirport ? 'FBO' : 'site'} asks for, and get warned before they expire.</T></Card>
        )}
      </Section>

      <Section title="Facility fees" icon="cash-outline">
        <Card>
          {(l.fees ?? []).length ? l.fees.map((f, i) => (
            <Row key={i} style={{ justifyContent: 'space-between', paddingVertical: 4 }}>
              <T>{f.name}</T>
              {perm('see_prices') ? <T variant="money">{money(f.amount)}</T> : null}
            </Row>
          )) : <T variant="muted">No fees recorded.</T>}
        </Card>
      </Section>

      <Section title="Site photos" icon="images-outline" count={l.photos?.length ? String(l.photos.length) : undefined}>
        {l.photos?.length ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginBottom: space.md }}>
            {l.photos.map((p) => (
              <Pressable key={p} onLongPress={manager ? () => removePhoto(p) : undefined} onPress={() => photoUrls[p] && Linking.openURL(photoUrls[p]!)}
                style={{ width: '31%', aspectRatio: 1, borderRadius: radius.md, overflow: 'hidden', backgroundColor: colors.card }}>
                {photoUrls[p] ? <Image source={{ uri: photoUrls[p] }} style={{ width: '100%', height: '100%' }} /> : null}
              </Pressable>
            ))}
          </View>
        ) : <T variant="muted" style={{ marginBottom: space.md }}>Add photos of the parking spot, water hookup or hangar door so the crew knows what to expect.</T>}
        {writable ? (
          <Row>
            <Button small kind="secondary" icon="camera-outline" title="Take photo" loading={busy} onPress={() => addPhoto('camera')} />
            <Button small kind="secondary" icon="images-outline" title="Choose" disabled={busy} onPress={() => addPhoto('library')} />
          </Row>
        ) : null}
        {manager && l.photos?.length ? <T variant="small" style={{ marginTop: space.sm }}>Press and hold a photo to remove it.</T> : null}
      </Section>

      <Section title={`Based here (${assets.length})`}>
        {assets.length ? (
          <Card style={{ padding: 0, overflow: 'hidden' }}>
            {assets.map((a) => (
              <ListRow key={a.id} icon={assetIcon(a.asset_type)} tone="warning" title={a.tail_number} subtitle={[a.manufacturer, a.model].filter(Boolean).join(' ')} onPress={() => router.push(`/aircraft/${a.id}`)} />
            ))}
          </Card>
        ) : <EmptyState icon="location-outline" title="No assets based here" body="Link a home facility on an asset so new jobs start here automatically." />}
      </Section>

      <FormSheet visible={reqSheet.open} title={reqSheet.row ? 'Edit requirement' : 'New requirement'} fields={REQ_FIELDS}
        initial={reqSheet.row ?? { kind: 'coi', applies_to: 'company' }}
        onClose={() => setReqSheet({ open: false })}
        onSubmit={async (v) => {
          if (reqSheet.row) {
            const { error: e } = await supabase.from('facility_requirements').update(v).eq('id', reqSheet.row.id);
            if (e) throw e;
          } else {
            const { error: e } = await supabase.from('facility_requirements').insert({ ...v, org_id: orgId, location_id: id });
            if (e) throw e;
          }
          q.reload();
        }}
        onDelete={reqSheet.row ? async () => {
          const { error: e } = await supabase.from('facility_requirements').delete().eq('id', reqSheet.row!.id);
          if (e) throw e;
          q.reload();
        } : undefined} />
      <FormSheet visible={!!docFor} title="Company document" initial={{ name: docFor?.name ?? '' }}
        fields={[
          { key: 'name', label: 'Document name', type: 'text', required: true },
          { key: 'issued_on', label: 'Issued on', type: 'date' },
          { key: 'expires_on', label: 'Expires on', type: 'date' },
        ]}
        onClose={() => setDocFor(null)}
        onSubmit={async (v) => {
          if (!docFor) return;
          const { error: e } = await supabase.from('certifications').insert({ ...v, org_id: orgId, user_id: null, requirement_id: docFor.id, kind: docFor.kind });
          if (e) throw e;
          q.reload();
        }} />
    </Screen>
  );
}

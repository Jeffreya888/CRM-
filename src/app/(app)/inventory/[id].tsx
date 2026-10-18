import { router, Stack, useLocalSearchParams } from 'expo-router';
import * as Linking from 'expo-linking';
import { useState } from 'react';
import { View } from 'react-native';
import { notify } from '../../../components/FormSheet';
import { StockSheet, type StockMode } from '../../../components/inventory/StockSheet';
import { Badge, Button, Card, EmptyState, ErrorBanner, IconTile, KeyValue, ListRow, Loading, Row, Screen, Section, T } from '../../../components/ui';
import { date, dateTime, money } from '../../../lib/format';
import { fmtQty as fmtNum } from '../../../components/inventory/qty';
import {
  expiryBadge, isLow, normalizeUrl, openStorageFile, REASON_LABELS, reorderMailto,
  type InventoryItem, type Movement, type StockByLocation, type StockLocation,
} from '../../../lib/inventory';
import { useLookups } from '../../../lib/lookups';
import { canEdit, isManager } from '../../../lib/plans';
import { useOrg } from '../../../lib/session';
import { callFunction, friendlyError, must, supabase } from '../../../lib/supabase';
import { colors, space } from '../../../lib/theme';
import { useQuery } from '../../../lib/useQuery';

type MovementRow = Movement & { job: { id: string; number: string; title: string | null } | null };

export default function SupplyDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { orgId, org, role, perm, can } = useOrg();
  const { memberName } = useLookups();
  const showMoney = perm('see_prices');
  const manager = isManager(role);
  const writable = canEdit(role);
  const fleet = can('stock_locations');
  const [sheet, setSheet] = useState<StockMode | null>(null);
  const [showAll, setShowAll] = useState(false);

  const q = useQuery(async () => {
    const [item, moves, links, locs, byLoc] = await Promise.all([
      must(supabase.from('inventory_items').select('*').eq('id', id).single()),
      must(supabase.from('inventory_movements').select('*, job:jobs(id, number, title)').eq('item_id', id).order('created_at', { ascending: false }).limit(200)),
      must(supabase.from('service_supplies').select('service_id, quantity').eq('item_id', id)),
      fleet ? must(supabase.from('stock_locations').select('*').eq('org_id', orgId).order('name')) : Promise.resolve([]),
      fleet ? must(supabase.from('stock_by_location').select('item_id, stock_location_id, quantity').eq('item_id', id)) : Promise.resolve([]),
    ]);
    const svcLinks = (links ?? []) as { service_id: string; quantity: number }[];
    let services: { id: string; name: string; quantity: number }[] = [];
    if (svcLinks.length) {
      const ids = svcLinks.map((l) => l.service_id);
      const { data } = await (showMoney
        ? supabase.from('services').select('id, name').in('id', ids)
        : supabase.from('service_menu').select('id, name').in('id', ids));
      const names = new Map(((data ?? []) as { id: string; name: string }[]).map((s) => [s.id, s.name]));
      services = svcLinks.map((l) => ({ id: l.service_id, name: names.get(l.service_id) ?? 'Service', quantity: l.quantity }));
    }
    return {
      item: item as InventoryItem,
      moves: (moves ?? []) as MovementRow[],
      services,
      locations: (locs ?? []) as StockLocation[],
      byLoc: (byLoc ?? []) as StockByLocation[],
    };
  }, [id, orgId, fleet, showMoney]);

  if (!q.data) {
    return (
      <Screen>
        <Stack.Screen options={{ title: 'Supply' }} />
        {q.error ? <ErrorBanner message={q.error} onRetry={q.reload} /> : <Loading />}
      </Screen>
    );
  }

  const { item: i, moves, services, locations, byLoc } = q.data;
  const low = isLow(i);
  const exp = expiryBadge(i.expires_on);
  const total = Number(i.quantity);
  const perLocation: Record<string, number> = {};
  let located = 0;
  for (const r of byLoc) {
    if (r.stock_location_id) { perLocation[r.stock_location_id] = Number(r.quantity); located += Number(r.quantity); }
  }
  perLocation[''] = total - located;
  const useLocations = fleet && locations.length > 0;
  const mailto = reorderMailto(i, org?.name);
  const locName = (lid: string | null) => (lid ? locations.find((l) => l.id === lid)?.name ?? 'Location' : null);

  const reorder = async () => {
    try {
      if (i.vendor_url) await Linking.openURL(normalizeUrl(i.vendor_url));
      else if (mailto) await Linking.openURL(mailto);
      else notify('No vendor link or email', 'Edit this supply and add the vendor’s reorder link or email to reorder in one tap.');
    } catch {
      notify('Could not open', i.vendor_url ?? i.vendor_email ?? '');
    }
  };
  const emailVendor = async () => {
    try {
      const r = await callFunction<{ emailed: number }>('send-reorder', { org_id: orgId, item_ids: [i.id] });
      notify('Order emailed', r?.emailed ? `Sent to ${i.vendor_email}.` : 'Nothing was sent. Check the vendor email.');
    } catch (e: any) {
      notify('Could not send', friendlyError(e.message));
    }
  };

  const shown = showAll ? moves : moves.slice(0, 25);

  return (
    <Screen refreshing={q.refreshing} onRefresh={q.refresh}>
      <Stack.Screen options={{
        title: i.name,
        headerRight: () => manager ? <Button small kind="secondary" icon="create-outline" title="Edit" onPress={() => router.push({ pathname: '/inventory/edit', params: { id: i.id } })} /> : null,
      }} />
      <ErrorBanner message={q.error} onRetry={q.reload} />

      <Card>
        <Row gap={space.md}>
          <IconTile icon="flask-outline" tone={low ? 'danger' : 'primary'} size={52} />
          <View style={{ flex: 1 }}>
            <T style={{ fontSize: 28, fontWeight: '800', color: colors.text }}>{fmtNum(total)} <T variant="muted">{i.unit}</T></T>
            <T variant="muted">{Number(i.par_level) > 0 ? `Par ${fmtNum(i.par_level)} · reorder ${fmtNum(i.reorder_qty)}` : 'No par level set'}</T>
          </View>
        </Row>
        <Row gap={4} style={{ marginTop: space.md, flexWrap: 'wrap' }}>
          {low ? <Badge label="Low — on reorder list" tone="danger" raw /> : <Badge label="In stock" tone="success" raw />}
          {exp ? <Badge label={exp.label} tone={exp.tone} raw /> : null}
          {i.active === false ? <Badge label="Inactive" tone="neutral" raw /> : null}
          {i.category ? <Badge label={i.category} tone="info" raw /> : null}
        </Row>
        {showMoney ? (
          <T variant="small" style={{ marginTop: space.md }}>{`${money(i.unit_cost)} per ${i.unit} · ${money(Math.max(0, total) * Number(i.unit_cost))} on the shelf`}</T>
        ) : null}
      </Card>

      {writable ? (
        <Row gap={space.sm} style={{ flexWrap: 'wrap' }}>
          <Button small icon="swap-vertical-outline" title="Adjust stock" onPress={() => setSheet('adjust')} />
          {manager ? <Button small kind="secondary" icon="cube-outline" title="Mark received" onPress={() => setSheet('receive')} /> : null}
          {manager ? <Button small kind="secondary" icon="cart-outline" title="Reorder" onPress={reorder} /> : null}
          {manager && i.vendor_email ? <Button small kind="secondary" icon="mail-outline" title="Email order" onPress={emailVendor} /> : null}
          {useLocations ? <Button small kind="secondary" icon="swap-horizontal-outline" title="Transfer" onPress={() => setSheet('transfer')} /> : null}
        </Row>
      ) : null}

      {fleet ? (
        <Section title="Stock by location" icon="car-outline" action={manager ? <Button small kind="ghost" title="Manage" onPress={() => router.push('/inventory/locations')} /> : undefined}>
          {locations.length === 0 ? (
            <Card><T variant="muted">Add your shop, vans and hangars to track where stock lives and move it between them.</T></Card>
          ) : (
            <View style={{ borderRadius: 12, overflow: 'hidden' }}>
              {perLocation[''] !== 0 ? <ListRow icon="home-outline" tone="neutral" title="Main stock (no location)" right={<T style={{ fontWeight: '700' }}>{fmtNum(perLocation[''])}</T>} /> : null}
              {locations.filter((l) => l.active || perLocation[l.id]).map((l) => (
                <ListRow key={l.id} icon={l.kind === 'van' ? 'car-outline' : l.kind === 'hangar' ? 'airplane-outline' : 'business-outline'}
                  title={l.name} subtitle={l.active ? null : 'Inactive'} right={<T style={{ fontWeight: '700' }}>{fmtNum(perLocation[l.id] ?? 0)}</T>} />
              ))}
            </View>
          )}
        </Section>
      ) : null}

      <Section title="Details" icon="information-circle-outline">
        <Card>
          <KeyValue label="SKU" value={i.sku} />
          <KeyValue label="Barcode" value={i.barcode} />
          <KeyValue label="Vendor" value={i.vendor} />
          <KeyValue label="Reorder link" value={i.vendor_url} onPress={i.vendor_url ? () => Linking.openURL(normalizeUrl(i.vendor_url!)).catch(() => {}) : undefined} />
          <KeyValue label="Vendor email" value={i.vendor_email} onPress={mailto ? () => Linking.openURL(mailto).catch(() => {}) : undefined} />
          <KeyValue label="Expires" value={i.expires_on ? date(i.expires_on) : null} />
          <KeyValue label="OEM approvals" value={i.approved_for} />
          {!i.sku && !i.barcode && !i.vendor && !i.approved_for && !i.expires_on ? <T variant="muted">No extra details yet.</T> : null}
          <Row gap={space.sm} style={{ marginTop: space.md }}>
            {i.sds_path
              ? <Button small kind="secondary" icon="document-text-outline" title="Safety data sheet (SDS)" onPress={() => openStorageFile(i.sds_path!).catch((e) => notify('Could not open', friendlyError(e.message)))} />
              : <T variant="small">No SDS attached{manager ? ' — add the PDF from Edit.' : '.'}</T>}
          </Row>
        </Card>
      </Section>

      <Section title="Used by services" icon="sparkles-outline">
        <Card>
          {services.length ? services.map((s) => (
            <Row key={s.id} style={{ justifyContent: 'space-between', paddingVertical: 6 }}>
              <T style={{ flex: 1 }}>{s.name}</T>
              <T variant="muted">{`${s.quantity} ${i.unit} per job`}</T>
            </Row>
          )) : <T variant="muted">Not linked to any service.</T>}
          <T variant="small" style={{ marginTop: space.sm }}>These amounts are taken out of stock automatically when a job with the service is completed. Set them on each service.</T>
        </Card>
      </Section>

      <Section title="History" icon="time-outline" count={moves.length ? String(moves.length) : undefined}>
        {moves.length === 0 ? <EmptyState icon="time-outline" title="No stock changes yet" /> : (
          <View style={{ borderRadius: 12, overflow: 'hidden' }}>
            {shown.map((m) => {
              const r = REASON_LABELS[m.reason] ?? REASON_LABELS.adjustment;
              const d = Number(m.delta);
              const where = locName(m.stock_location_id);
              return (
                <ListRow key={m.id} icon={r.icon} tone={r.tone}
                  title={`${d > 0 ? '+' : ''}${fmtNum(d)} ${i.unit} · ${r.label}${m.auto ? ' (auto)' : ''}`}
                  subtitle={[m.job ? `Job ${m.job.number}${m.job.title ? ` — ${m.job.title}` : ''}` : null, where, m.note].filter(Boolean).join(' · ') || null}
                  meta={[dateTime(m.created_at), m.created_by ? memberName(m.created_by) : 'System', showMoney && m.unit_cost != null ? `${money(m.unit_cost)}/${i.unit} · ${money(Math.abs(d) * Number(m.unit_cost))}` : null].filter(Boolean).join(' · ')}
                  onPress={m.job ? () => router.push(`/jobs/${m.job!.id}`) : undefined} />
              );
            })}
          </View>
        )}
        {moves.length > shown.length ? <Button kind="ghost" title={`Show all ${moves.length}`} onPress={() => setShowAll(true)} /> : null}
      </Section>

      <StockSheet
        item={sheet ? i : null}
        mode={sheet ?? 'adjust'}
        orgId={orgId}
        locations={locations}
        useLocations={useLocations}
        showMoney={showMoney}
        perLocation={perLocation}
        onClose={() => setSheet(null)}
        onDone={q.reload}
      />
    </Screen>
  );
}

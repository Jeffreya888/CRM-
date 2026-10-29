import { format } from 'date-fns';
import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { confirmAction, notify } from '../FormSheet';
import { SignaturePad } from '../SignaturePad';
import { Badge, Button, Card, Divider, Field, Ionicons, KeyValue, Row, SheetModal, T } from '../ui';
import { geocode } from '../../lib/geo';
import { directionsUrl } from '../../lib/jobs';
import { callFunction, friendlyError, supabase } from '../../lib/supabase';
import { colors, radius, space } from '../../lib/theme';

export type ServiceMode = 'mobile' | 'shop';

/** Sends queued customer messages right away (anything left queued goes out with the worker). */
async function sendNow(ids: string[]) {
  for (const message_id of ids) await callFunction('send-message', { message_id });
}

/** "Mobile" / "In shop" with a switch for managers. */
export function ServiceModeRow({ jobId, mode, canChange, onChanged }: { jobId: string; mode: ServiceMode; canChange: boolean; onChanged: () => void }) {
  const flip = async () => {
    const next: ServiceMode = mode === 'shop' ? 'mobile' : 'shop';
    const { error } = await supabase.from('jobs').update({ service_mode: next }).eq('id', jobId);
    if (error) return notify('Could not change', friendlyError(error.message));
    onChanged();
  };
  return (
    <Row gap={space.sm} style={{ marginTop: 6 }}>
      <Ionicons name={mode === 'shop' ? 'storefront-outline' : 'car-outline'} size={18} color={colors.textMuted} />
      <T style={{ color: colors.textMuted, flex: 1 }}>{mode === 'shop' ? 'In our shop (drop-off & pickup)' : 'Mobile (we go to the customer)'}</T>
      {canChange ? <Button small kind="ghost" title={mode === 'shop' ? 'Make mobile' : 'Make shop job'} onPress={flip} /> : null}
    </Row>
  );
}

const ETAS = [10, 15, 20, 30, 45, 60, 90];

/**
 * Mobile job: where to go (job address, or the customer's service address),
 * directions, and "On our way" with an arrival time.
 */
export function MobileStopCard({ job, customer, canEdit, canNotify, onChanged }: {
  job: { id: string; status: string; service_address: string | null; on_my_way_at: string | null; eta_minutes: number | null; location: any };
  customer: { service_address?: string | null } | null;
  canEdit: boolean; canNotify: boolean; onChanged: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [addr, setAddr] = useState(job.service_address ?? '');
  const [etaOpen, setEtaOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const address = job.service_address || customer?.service_address || null;
  const dir = address ? directionsUrl({ address }) : null;
  const open = ['tentative', 'scheduled', 'on_hold', 'in_progress'].includes(job.status);

  const saveAddress = async () => {
    setBusy(true);
    try {
      const a = addr.trim();
      let point: { lat: number; lng: number } | null = null;
      if (a) point = await geocode(a).catch(() => null);
      const { error } = await supabase.from('jobs').update({ service_address: a || null, service_lat: point?.lat ?? null, service_lng: point?.lng ?? null }).eq('id', job.id);
      if (error) throw error;
      setEditing(false);
      onChanged();
    } catch (e: any) {
      notify('Could not save', friendlyError(e.message));
    } finally {
      setBusy(false);
    }
  };

  const onOurWay = async (eta: number | null) => {
    setEtaOpen(false);
    try {
      const { data, error } = await supabase.rpc('queue_on_our_way', { p_job: job.id, p_eta: eta });
      if (error) throw error;
      const ids = (data ?? []) as string[];
      if (!ids.length) return notify('Already sent', 'The customer was already told you are on the way.');
      await sendNow(ids);
      notify('Customer notified', eta ? `We told the customer you'll arrive in about ${eta} minutes.` : 'We let the customer know you are on the way.');
      onChanged();
    } catch (e: any) {
      notify('Could not send', friendlyError(e.message));
    }
  };

  // A facility (FBO, marina, service site) has its own card; this one is for street addresses.
  if (job.location && !address && !canNotify) return null;
  return (
    <Card>
      {!job.location || address ? (
        <>
          <Row style={{ alignItems: 'flex-start' }}>
            <Ionicons name="home-outline" size={20} color={colors.primaryText} />
            <View style={{ flex: 1 }}>
              <T style={{ fontWeight: '600' }}>Service address</T>
              <T variant="muted">{address ?? 'No address yet. Add where the crew should go.'}</T>
              {!job.service_address && customer?.service_address ? <T variant="small">From the customer&apos;s profile</T> : null}
            </View>
            {dir ? <Button small kind="secondary" icon="navigate-outline" title="Directions" onPress={() => Linking.openURL(dir)} /> : null}
          </Row>
          {canEdit && !editing ? (
            <Button small kind="ghost" icon="create-outline" title={job.service_address ? 'Change address' : 'Set address for this job'} onPress={() => setEditing(true)} style={{ alignSelf: 'flex-start', marginTop: space.xs }} />
          ) : null}
          {editing ? (
            <View style={{ marginTop: space.md }}>
              <Field label="Address for this job" value={addr} onChangeText={setAddr} placeholder="500 Lake Dr, Austin, TX" icon="location-outline" />
              <Row>
                <Button small title="Save" onPress={saveAddress} loading={busy} />
                <Button small kind="ghost" title="Cancel" onPress={() => setEditing(false)} />
              </Row>
            </View>
          ) : null}
        </>
      ) : null}
      {canNotify && open ? (
        <>
          {!job.location || address ? <Divider /> : null}
          {job.on_my_way_at ? (
            <Row gap={space.sm}>
              <Ionicons name="checkmark-circle" size={20} color={colors.success} />
              <T variant="muted" style={{ flex: 1 }}>
                Customer told you&apos;re on the way at {format(new Date(job.on_my_way_at), 'h:mm a')}{job.eta_minutes ? ` · arriving in about ${job.eta_minutes} min` : ''}
              </T>
            </Row>
          ) : (
            <Button kind="secondary" icon="car-outline" title="On our way" onPress={() => setEtaOpen(true)} />
          )}
        </>
      ) : null}

      <SheetModal visible={etaOpen} onClose={() => setEtaOpen(false)}>
        <ScrollView contentContainerStyle={{ padding: space.lg }}>
          <T variant="h2" style={{ marginBottom: space.sm }}>When will you arrive?</T>
          <T variant="muted" style={{ marginBottom: space.md }}>We&apos;ll text the customer that you&apos;re on the way, with this arrival time.</T>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginBottom: space.md }}>
            {ETAS.map((m) => (
              <Pressable key={m} onPress={() => onOurWay(m)} accessibilityRole="button"
                style={({ pressed }) => [{ paddingVertical: 12, paddingHorizontal: 16, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.input }, pressed && { opacity: 0.7 }]}>
                <T style={{ fontWeight: '600' }}>{m < 60 ? `${m} min` : `${m / 60 === 1 ? '1 hour' : `${m / 60} hours`}`}</T>
              </Pressable>
            ))}
          </View>
          <Button kind="ghost" title="Send without a time" onPress={() => onOurWay(null)} />
        </ScrollView>
      </SheetModal>
    </Card>
  );
}

/**
 * Shop job: check-in at drop-off (mileage/hours, keys, notes, customer
 * signature; before photos are the intake photos), "Ready for pickup"
 * message, and pickup.
 */
export function ShopVisitCard({ job, assetType, canEdit, canNotify, invoiceId, onChanged }: {
  job: {
    id: string; status: string; checked_in_at: string | null; checkin_odometer: string | null; checkin_keys: string | null; checkin_notes: string | null;
    checkin_signed_by: string | null; checkin_signature_svg: string | null; ready_at: string | null; picked_up_at: string | null;
  };
  assetType: string | null; canEdit: boolean; canNotify: boolean; invoiceId: string | null; onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [odo, setOdo] = useState(job.checkin_odometer ?? '');
  const [keys, setKeys] = useState(job.checkin_keys ?? '');
  const [notes, setNotes] = useState(job.checkin_notes ?? '');
  const [signer, setSigner] = useState(job.checkin_signed_by ?? '');
  const hoursLabel = assetType === 'watercraft' || assetType === 'aircraft' ? 'Engine hours' : 'Mileage';

  const save = async (svg: string) => {
    if (signer.trim().length < 2) return notify('Name required', 'Enter the name of the person dropping off.');
    const { error } = await supabase.from('jobs').update({
      checkin_odometer: odo.trim() || null, checkin_keys: keys.trim() || null, checkin_notes: notes.trim() || null,
      checkin_signed_by: signer.trim(), checkin_signature_svg: svg,
    }).eq('id', job.id);
    if (error) return notify('Could not save', friendlyError(error.message));
    setOpen(false);
    onChanged();
  };

  const ready = async () => {
    try {
      const { data, error } = await supabase.rpc('queue_ready_for_pickup', { p_job: job.id });
      if (error) throw error;
      const ids = (data ?? []) as string[];
      if (!ids.length) return notify('Already sent', 'The customer was already told it is ready.');
      await sendNow(ids);
      notify('Customer notified', 'We let the customer know it is ready for pickup.');
      onChanged();
    } catch (e: any) {
      notify('Could not send', friendlyError(e.message));
    }
  };

  const pickedUp = () => confirmAction('Picked up?', 'Mark that the customer took it home.', async () => {
    const { error } = await supabase.from('jobs').update({ picked_up_at: new Date().toISOString() }).eq('id', job.id);
    if (error) return notify('Could not save', friendlyError(error.message));
    onChanged();
    if (invoiceId) router.push(`/invoices/${invoiceId}`);
  });

  const finished = ['completed', 'invoiced'].includes(job.status);
  return (
    <Card>
      <Row style={{ justifyContent: 'space-between', marginBottom: space.sm }}>
        <T style={{ fontWeight: '600' }}>Drop-off & pickup</T>
        <Badge raw label={job.picked_up_at ? 'Picked up' : job.ready_at ? 'Ready for pickup' : job.checked_in_at ? 'In the shop' : 'Not checked in'}
          tone={job.picked_up_at ? 'success' : job.ready_at ? 'info' : job.checked_in_at ? 'warning' : 'neutral'} />
      </Row>
      {job.checked_in_at ? (
        <>
          <KeyValue label="Checked in" value={format(new Date(job.checked_in_at), 'MMM d, h:mm a')} />
          {job.checkin_odometer ? <KeyValue label={hoursLabel} value={job.checkin_odometer} /> : null}
          {job.checkin_keys ? <KeyValue label="Keys" value={job.checkin_keys} /> : null}
          {job.checkin_signed_by ? <KeyValue label="Signed by" value={job.checkin_signed_by} /> : null}
          {job.checkin_notes ? <T variant="muted" style={{ marginTop: 4 }}>{job.checkin_notes}</T> : null}
        </>
      ) : (
        <T variant="muted">At drop-off: take before photos (they&apos;re the intake photos), note the {hoursLabel.toLowerCase()} and keys, and have the customer sign.</T>
      )}
      {job.ready_at ? <KeyValue label="Ready text sent" value={format(new Date(job.ready_at), 'MMM d, h:mm a')} /> : null}
      {job.picked_up_at ? <KeyValue label="Picked up" value={format(new Date(job.picked_up_at), 'MMM d, h:mm a')} /> : null}

      <Row style={{ flexWrap: 'wrap', marginTop: space.md }}>
        {canEdit && !job.picked_up_at ? (
          <Button small kind={job.checked_in_at ? 'secondary' : 'primary'} icon="log-in-outline" title={job.checked_in_at ? 'Edit check-in' : 'Check in'} onPress={() => setOpen(true)} />
        ) : null}
        {canNotify && finished && !job.ready_at && !job.picked_up_at ? <Button small icon="chatbubble-ellipses-outline" title="Ready for pickup" onPress={ready} /> : null}
        {canEdit && finished && !job.picked_up_at ? <Button small kind="secondary" icon="exit-outline" title="Picked up" onPress={pickedUp} /> : null}
      </Row>

      <SheetModal visible={open} onClose={() => setOpen(false)}>
        <ScrollView contentContainerStyle={{ padding: space.lg }} keyboardShouldPersistTaps="handled">
          <T variant="h2" style={{ marginBottom: space.sm }}>Check in</T>
          <T variant="muted" style={{ marginBottom: space.md }}>Take before photos on the job too. They show the condition it arrived in.</T>
          <Field label={hoursLabel} value={odo} onChangeText={setOdo} placeholder={hoursLabel === 'Mileage' ? '42,180 mi' : '1,240 hrs'} />
          <Field label="Keys" value={keys} onChangeText={setKeys} placeholder="Hook 7 · 2 keys + fob" />
          <Field label="Notes" value={notes} onChangeText={setNotes} placeholder="Personal items, existing chips, customer requests" multiline />
          <Field label="Customer name" value={signer} onChangeText={setSigner} placeholder="Name of the person dropping off" />
          <SignaturePad onCancel={() => setOpen(false)} onSave={save} />
        </ScrollView>
      </SheetModal>
    </Card>
  );
}

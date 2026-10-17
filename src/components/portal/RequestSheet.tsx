import { useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { DateTimeField } from '../DateTimeField';
import { Button, ErrorBanner, Field, IconButton, Row, Select, T } from '../ui';
import { dateTime } from '../../lib/format';
import { sendPortalRequest, type PortalAsset, type PortalService, type PortalUpcomingJob } from '../../lib/portal';
import { colors, space } from '../../lib/theme';

export type RequestTarget = { kind: 'booking'; assetId?: string | null } | { kind: 'reschedule'; job: PortalUpcomingJob };

/** Booking request (asset, service, up to 3 times) or reschedule request for an upcoming job. */
export function RequestSheet({ target, token, assets, services, onClose, onSent }: {
  target: RequestTarget | null; token: string; assets: PortalAsset[]; services: PortalService[];
  onClose: () => void; onSent: (message: string) => void;
}) {
  const [assetId, setAssetId] = useState<string | null>(null);
  const [serviceId, setServiceId] = useState<string | null>(null);
  const [dates, setDates] = useState<(string | null)[]>([null]);
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [shownFor, setShownFor] = useState<RequestTarget | null>(null);

  // Reset the form each time the sheet opens for a new target.
  if (target !== shownFor) {
    setShownFor(target);
    if (target) {
      setAssetId(target.kind === 'booking' ? target.assetId ?? (assets.length === 1 ? assets[0]!.id : null) : target.job.aircraft_id);
      setServiceId(null);
      setDates([null]);
      setNotes('');
      setError(null);
    }
  }

  const asset = assets.find((a) => a.id === assetId) ?? null;
  const serviceOptions = services
    .filter((s) => !asset || !s.asset_type || s.asset_type === asset.asset_type)
    .map((s) => ({ value: s.id, label: s.name }));

  const submit = async () => {
    if (!target) return;
    setError(null);
    const preferred = dates.filter(Boolean).map((d) => new Date(d!).toISOString());
    if (!preferred.length) return setError('Pick at least one date and time that works for you.');
    if (preferred.some((p) => new Date(p).getTime() < Date.now())) return setError('Pick dates in the future.');
    if (target.kind === 'booking' && assets.length && !assetId) return setError('Choose what needs service.');
    setBusy(true);
    try {
      await sendPortalRequest(token, target.kind === 'booking'
        ? { kind: 'booking', aircraft_id: assetId, service_id: serviceId, preferred, notes: notes.trim() || null }
        : { kind: 'reschedule', job_id: target.job.id, aircraft_id: target.job.aircraft_id, preferred, notes: notes.trim() || null });
      onSent(target.kind === 'booking' ? 'Request sent! We will confirm a time with you.' : 'Reschedule request sent! We will confirm the new time with you.');
      onClose();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const title = target?.kind === 'reschedule' ? 'Request a new time' : 'Request service';

  return (
    <Modal visible={!!target} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
          <View style={{ maxWidth: 640, width: '100%', alignSelf: 'center', flex: 1 }}>
            <Row style={{ padding: space.lg, justifyContent: 'space-between' }}>
              <T variant="h3">{title}</T>
              <Button small kind="secondary" title="Close" onPress={onClose} />
            </Row>
            <ScrollView contentContainerStyle={{ padding: space.lg, paddingBottom: 64 }} keyboardShouldPersistTaps="handled">
              <ErrorBanner message={error} />
              {target?.kind === 'reschedule' ? (
                <View style={{ marginBottom: space.lg }}>
                  <T style={{ fontWeight: '600' }}>{target.job.title ?? `Job ${target.job.number}`}</T>
                  <T variant="muted">Currently {dateTime(target.job.scheduled_start)}{target.job.tail_number ? ` · ${target.job.tail_number}` : ''}</T>
                </View>
              ) : (
                <>
                  {assets.length ? (
                    <Select label="What needs service?" value={assetId} onChange={setAssetId}
                      options={assets.map((a) => ({ value: a.id, label: a.tail_number, hint: [a.manufacturer, a.model].filter(Boolean).join(' ') || undefined }))} />
                  ) : null}
                  {serviceOptions.length ? (
                    <Select label="Service (optional)" value={serviceId} onChange={setServiceId} options={serviceOptions} allowClear />
                  ) : null}
                </>
              )}
              <T style={{ fontWeight: '600', marginBottom: space.sm }}>Preferred dates and times (up to 3)</T>
              {dates.map((v, i) => (
                <Row key={i} style={{ alignItems: 'flex-start' }}>
                  <View style={{ flex: 1 }}>
                    <DateTimeField label={`Choice ${i + 1}`} mode="datetime" value={v} onChange={(x) => setDates((ds) => ds.map((y, j) => (j === i ? x : y)))} />
                  </View>
                  {dates.length > 1 ? <IconButton icon="trash-outline" color={colors.danger} label="Remove" onPress={() => setDates((ds) => ds.filter((_, j) => j !== i))} /> : null}
                </Row>
              ))}
              {dates.length < 3 ? <Button small kind="ghost" icon="add" title="Add another time" onPress={() => setDates((ds) => [...ds, null])} /> : null}
              <Field label="Notes (optional)" multiline value={notes} onChangeText={setNotes}
                placeholder={target?.kind === 'reschedule' ? 'Why the change, or any time windows that work' : 'What you need, location, access details…'} style={{ marginTop: space.md }} />
              <Button title="Send request" icon="send-outline" onPress={submit} loading={busy} />
              <T variant="small" style={{ marginTop: space.md }}>This is a request. You&apos;ll get a confirmation once the time is booked.</T>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

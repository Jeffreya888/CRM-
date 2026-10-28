import { useState, type ReactNode } from 'react';
import { Image, KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { DateTimeField } from '../DateTimeField';
import { Button, ErrorBanner, Field, Row, Select, SheetModal, T } from '../ui';
import { pickImage, uploadImage } from '../../lib/files';
import { fmtNum, todayIso, type MaintenanceDue } from '../../lib/inventory';
import { friendlyError, supabase } from '../../lib/supabase';
import { colors, radius, space } from '../../lib/theme';

/** Take or choose one photo; shows a preview. */
export function PhotoField({ label, uri, onChange }: { label: string; uri: string | null; onChange: (uri: string | null) => void }) {
  const [error, setError] = useState<string | null>(null);
  const pick = async (src: 'camera' | 'library') => {
    try { const u = await pickImage(src); if (u) onChange(u); } catch (e: any) { setError(e.message); }
  };
  return (
    <View style={{ marginBottom: space.lg }}>
      <T style={{ marginBottom: 8, fontWeight: '600' }}>{label}</T>
      <ErrorBanner message={error} />
      {uri ? <Image source={{ uri }} style={{ width: '100%', height: 200, borderRadius: radius.md, marginBottom: space.sm, backgroundColor: colors.card }} resizeMode="cover" /> : null}
      <Row gap={space.sm} style={{ flexWrap: 'wrap' }}>
        <Button small kind="secondary" icon="camera-outline" title={uri ? 'Retake' : 'Take photo'} onPress={() => pick('camera')} />
        <Button small kind="secondary" icon="images-outline" title="Choose photo" onPress={() => pick('library')} />
        {uri ? <Button small kind="ghost" icon="close-circle-outline" title="Remove" onPress={() => onChange(null)} /> : null}
      </Row>
    </View>
  );
}

function Sheet({ visible, title, onClose, onSave, saveLabel = 'Save', children, error }: {
  visible: boolean; title: string; onClose: () => void; onSave: () => Promise<void>; saveLabel?: string; children: ReactNode; error: string | null;
}) {
  return (
    <SheetModal visible={visible} onClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <Row style={{ padding: space.lg, justifyContent: 'space-between' }}>
          <Button small kind="ghost" title="Cancel" onPress={onClose} />
          <T variant="h3" numberOfLines={1} style={{ flexShrink: 1 }}>{title}</T>
          <Button small title={saveLabel} onPress={onSave} />
        </Row>
        <ScrollView contentContainerStyle={{ padding: space.lg, paddingBottom: 64 }} keyboardShouldPersistTaps="handled">
          <ErrorBanner message={error} />
          {children}
        </ScrollView>
      </KeyboardAvoidingView>
    </SheetModal>
  );
}

/** Any team member can report a problem (with a photo). Owners/managers are notified by the server. */
export function ReportProblemSheet({ visible, equipment, orgId, userId, onClose, onDone }: {
  visible: boolean; equipment: { id: string; name: string } | null; orgId: string; userId: string; onClose: () => void; onDone: () => void;
}) {
  const [description, setDescription] = useState('');
  const [photo, setPhoto] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [wasVisible, setWasVisible] = useState(visible);
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) { setDescription(''); setPhoto(null); setError(null); }
  }

  const save = async () => {
    if (!equipment) return;
    if (!description.trim()) return setError('Describe the problem');
    try {
      const photo_path = photo ? await uploadImage(orgId, `equipment/${equipment.id}/issues`, photo) : null;
      const { error: e } = await supabase.from('equipment_issues').insert({
        org_id: orgId, equipment_id: equipment.id, description: description.trim(), photo_path, reported_by: userId,
      });
      if (e) throw e;
      onDone();
      onClose();
    } catch (e: any) {
      setError(friendlyError(e.message));
    }
  };

  return (
    <Sheet visible={visible} title="Report a problem" onClose={onClose} onSave={save} saveLabel="Send" error={error}>
      <T variant="muted" style={{ marginBottom: space.lg }}>
        {`Tell the office what's wrong with ${equipment?.name ?? 'this equipment'}. Owners and managers get an alert right away, and it is marked as needing service.`}
      </T>
      <Field label="What's wrong? *" multiline value={description} onChangeText={setDescription} placeholder="Pump loses pressure after 10 minutes, hose leaking at the wand" />
      <PhotoField label="Photo" uri={photo} onChange={setPhoto} />
    </Sheet>
  );
}

/** Log a service (managers). The database rolls the schedule forward and books the cost as an expense. */
export function ServiceLogSheet({ visible, equipment, orgId, schedules, showMoney, presetMaintenanceId, onClose, onDone }: {
  visible: boolean; equipment: { id: string; name: string; usage_hours: number } | null; orgId: string; schedules: MaintenanceDue[];
  showMoney: boolean; presetMaintenanceId?: string | null; onClose: () => void; onDone: () => void;
}) {
  const [v, setV] = useState({ maintenance_id: '' as string, performed_on: todayIso(), hours_at: '', cost: '', vendor: '', notes: '' });
  const [receipt, setReceipt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [wasVisible, setWasVisible] = useState(visible);
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) {
      setV({ maintenance_id: presetMaintenanceId ?? '', performed_on: todayIso(), hours_at: equipment ? fmtNum(equipment.usage_hours) : '', cost: '', vendor: '', notes: '' });
      setReceipt(null);
      setError(null);
    }
  }
  const set = (k: keyof typeof v, x: string) => setV((s) => ({ ...s, [k]: x }));

  const save = async () => {
    if (!equipment) return;
    const hours = v.hours_at.trim() === '' ? null : Number(v.hours_at);
    const cost = v.cost.trim() === '' ? 0 : Number(v.cost.replace(/[^0-9.]/g, ''));
    if (hours != null && (!Number.isFinite(hours) || hours < 0)) return setError('Hours must be a number');
    if (!Number.isFinite(cost) || cost < 0) return setError('Cost must be a number');
    if (!v.maintenance_id && !v.notes.trim()) return setError('Choose the maintenance item or add a note about what was done');
    try {
      const receipt_path = receipt ? await uploadImage(orgId, `equipment/${equipment.id}/receipts`, receipt) : null;
      const { error: e } = await supabase.from('equipment_service_log').insert({
        org_id: orgId, equipment_id: equipment.id, maintenance_id: v.maintenance_id || null, performed_on: v.performed_on || todayIso(),
        hours_at: hours, cost: showMoney ? cost : 0, vendor: v.vendor.trim() || null, notes: v.notes.trim() || null, receipt_path,
      });
      if (e) throw e;
      onDone();
      onClose();
    } catch (e: any) {
      setError(friendlyError(e.message));
    }
  };

  return (
    <Sheet visible={visible} title="Log service" onClose={onClose} onSave={save} error={error}>
      <Select label="Maintenance item" value={v.maintenance_id || null} allowClear placeholder="General repair / other"
        options={schedules.map((m) => ({ value: m.id, label: m.name }))} onChange={(x) => set('maintenance_id', x ?? '')} />
      <DateTimeField label="Date" mode="date" value={v.performed_on} onChange={(x) => set('performed_on', x ?? todayIso())} allowClear={false} />
      <Field label="Usage hours at service" value={v.hours_at} onChangeText={(x) => set('hours_at', x)} keyboardType="decimal-pad" />
      {showMoney ? (
        <Field label="Cost ($)" value={v.cost} onChangeText={(x) => set('cost', x)} keyboardType="decimal-pad"
          hint="Any cost is added to Business expenses automatically (category Repairs), so it shows in Profit & loss." />
      ) : null}
      <Field label="Vendor / shop" value={v.vendor} onChangeText={(x) => set('vendor', x)} />
      <Field label="Notes" multiline value={v.notes} onChangeText={(x) => set('notes', x)} placeholder="Changed pump oil, replaced O-rings" />
      <PhotoField label="Receipt photo" uri={receipt} onChange={setReceipt} />
    </Sheet>
  );
}

import { useState } from 'react';
import { Image, KeyboardAvoidingView, Linking, Platform, ScrollView, View } from 'react-native';
import { DateTimeField } from '../DateTimeField';
import { confirmAction } from '../FormSheet';
import { Button, Card, ErrorBanner, Field, Ionicons, type Option, Row, Segmented, Select, SheetModal, T } from '../ui';
import { pickImage, signedUrls, uploadImage } from '../../lib/files';
import { categoryInfo, categoryOptions, PAYMENT_METHODS, ymd, type ExpenseRow } from '../../lib/finance';
import { money } from '../../lib/format';
import { callFunction, friendlyError, must, supabase } from '../../lib/supabase';
import { colors, radius, space } from '../../lib/theme';

export type ExpenseRecord = ExpenseRow & { job_id: string | null; branch_id: string | null; created_by?: string | null };
export interface JobLite { id: string; number: string; title: string | null; location: { name: string; airport_code: string | null } | null }

type Draft = {
  kind: 'expense' | 'mileage'; amount: string; vendor: string; description: string; category: string; spent_on: string;
  job_id: string | null; branch_id: string | null; payment_method: string | null; notes: string; miles: string; receipt_path: string | null;
};

const toDraft = (e: ExpenseRecord | null, branchId: string | null): Draft => ({
  kind: e?.kind ?? 'expense', amount: e ? String(e.amount) : '', vendor: e?.vendor ?? '', description: e?.description ?? '', category: e?.category ?? 'supplies',
  spent_on: e?.spent_on ?? ymd(new Date()), job_id: e?.job_id ?? null, branch_id: e?.branch_id ?? branchId, payment_method: e?.payment_method ?? null,
  notes: e?.notes ?? '', miles: e?.miles != null ? String(e.miles) : '', receipt_path: e?.receipt_path ?? null,
});

/** Create/edit a business expense or mileage entry, with receipt photo auto-fill. */
export function ExpenseEditor({
  visible, expense, onClose, onSaved, orgId, userId, jobs, branchOptions, showBranches, mileageRate, defaultBranchId, canDelete,
}: {
  visible: boolean; expense: ExpenseRecord | null; onClose: () => void; onSaved: () => void; orgId: string; userId: string;
  jobs: JobLite[]; branchOptions: Option[]; showBranches: boolean; mileageRate: number; defaultBranchId: string | null; canDelete: boolean;
}) {
  const [d, setD] = useState<Draft>(() => toDraft(expense, defaultBranchId));
  const [error, setError] = useState<string | null>(null);
  const [scanNote, setScanNote] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [was, setWas] = useState(visible);
  if (visible !== was) {
    setWas(visible);
    if (visible) { setD(toDraft(expense, defaultBranchId)); setError(null); setScanNote(null); setPreview(null); }
  }
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((s) => ({ ...s, [k]: v }));

  const addReceipt = async (source: 'camera' | 'library') => {
    setError(null);
    try {
      const uri = await pickImage(source);
      if (!uri) return;
      setPreview(uri);
      setScanning(true);
      const path = await uploadImage(orgId, 'receipts', uri);
      setD((s) => ({ ...s, receipt_path: path }));
      try {
        const r = await callFunction<{ vendor?: string | null; amount?: number | null; date?: string | null; category?: string | null }>('scan-receipt', { org_id: orgId, path });
        const filled: string[] = [];
        setD((s) => {
          const n = { ...s };
          if (r?.vendor && !s.vendor) { n.vendor = r.vendor; filled.push('vendor'); }
          if (r?.amount != null && !s.amount) { n.amount = String(r.amount); filled.push('amount'); }
          if (r?.date && /^\d{4}-\d{2}-\d{2}$/.test(r.date)) { n.spent_on = r.date; filled.push('date'); }
          if (r?.category && categoryOptions.some((c) => c.value === r.category)) { n.category = r.category; filled.push('category'); }
          return n;
        });
        setScanNote(filled.length ? `We read the ${filled.join(', ')} from the receipt. Please check before saving.` : 'Receipt saved. We couldn’t read it automatically, so fill in the details.');
      } catch {
        setScanNote('Receipt saved. Auto-fill isn’t available right now, so fill in the details.');
      }
    } catch (e: any) {
      setError(friendlyError(e.message));
    } finally {
      setScanning(false);
    }
  };

  const viewReceipt = async () => {
    if (!d.receipt_path) return;
    try {
      const urls = await signedUrls([d.receipt_path]);
      const u = urls[d.receipt_path];
      if (u) setPreview(u);
    } catch (e: any) { setError(e.message); }
  };

  const miles = Number(d.miles.replace(/[^0-9.]/g, ''));
  const rate = expense?.kind === 'mileage' && expense.mileage_rate != null ? Number(expense.mileage_rate) : mileageRate;

  const save = async () => {
    setError(null);
    try {
      const base = {
        kind: d.kind, vendor: d.vendor.trim() || null, description: d.description.trim() || null, spent_on: d.spent_on, job_id: d.job_id,
        branch_id: showBranches ? d.branch_id : expense?.branch_id ?? null, payment_method: d.payment_method, notes: d.notes.trim() || null, receipt_path: d.receipt_path,
      };
      let row: Record<string, unknown>;
      if (d.kind === 'mileage') {
        if (!(miles > 0)) throw new Error('Enter the miles driven');
        row = { ...base, miles, amount: Math.round(miles * rate * 100) / 100, category: 'vehicle', mileage_rate: expense?.kind === 'mileage' ? expense.mileage_rate : null };
      } else {
        const amount = Number(d.amount.replace(/[^0-9.]/g, ''));
        if (!d.amount.trim() || Number.isNaN(amount)) throw new Error('Enter the amount');
        row = { ...base, amount, category: d.category, miles: null, mileage_rate: null };
      }
      if (expense) await must(supabase.from('expenses').update(row).eq('id', expense.id));
      else await must(supabase.from('expenses').insert({ ...row, org_id: orgId, created_by: userId }));
      onSaved();
      onClose();
    } catch (e: any) { setError(friendlyError(e.message)); }
  };

  const jobOptions: Option[] = jobs.map((j) => ({ value: j.id, label: `${j.number}${j.title ? ` · ${j.title}` : ''}`, hint: j.location ? [j.location.airport_code, j.location.name].filter(Boolean).join(' · ') : undefined }));
  const job = jobs.find((j) => j.id === d.job_id);

  return (
    <SheetModal visible={visible} onClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <Row style={{ padding: space.lg, justifyContent: 'space-between' }}>
          <Button small kind="ghost" title="Cancel" onPress={onClose} />
          <T variant="h3">{expense ? 'Edit expense' : 'New expense'}</T>
          <Button small title="Save" onPress={save} disabled={scanning} />
        </Row>
        <ScrollView contentContainerStyle={{ padding: space.lg, paddingBottom: 64 }} keyboardShouldPersistTaps="handled">
          <ErrorBanner message={error} />
          <Segmented value={d.kind} onChange={(v) => set('kind', v)} options={[{ value: 'expense', label: 'Expense' }, { value: 'mileage', label: 'Mileage' }]} />

          {d.kind === 'expense' ? (
            <Card>
              <Row style={{ justifyContent: 'space-between' }}>
                <T style={{ fontWeight: '700' }}>Receipt</T>
                {d.receipt_path ? <Button small kind="ghost" icon="eye-outline" title="View" onPress={viewReceipt} /> : null}
              </Row>
              {preview ? (
                <Image source={{ uri: preview }} style={{ width: '100%', height: 220, borderRadius: radius.md, marginTop: space.sm, backgroundColor: colors.bgDeep }} resizeMode="contain" />
              ) : null}
              {scanning ? <T variant="muted" style={{ marginTop: space.sm }}>Reading your receipt…</T> : null}
              {scanNote ? (
                <Row style={{ marginTop: space.sm, alignItems: 'flex-start' }}>
                  <Ionicons name="sparkles-outline" size={16} color={colors.primaryText} />
                  <T variant="small" style={{ flex: 1, color: colors.primaryText }}>{scanNote}</T>
                </Row>
              ) : null}
              <Row gap={space.sm} style={{ marginTop: space.md }}>
                {Platform.OS !== 'web' ? <Button small style={{ flex: 1 }} kind="secondary" icon="camera-outline" title="Take photo" onPress={() => addReceipt('camera')} disabled={scanning} /> : null}
                <Button small style={{ flex: 1 }} kind="secondary" icon="image-outline" title={d.receipt_path ? 'Replace' : 'Choose photo'} onPress={() => addReceipt('library')} disabled={scanning} />
              </Row>
              {!d.receipt_path ? <T variant="small" style={{ marginTop: space.sm }}>Snap the receipt and we&apos;ll fill in the vendor, amount and date for you.</T> : null}
            </Card>
          ) : null}

          {d.kind === 'mileage' ? (
            <>
              <Field label="Miles driven *" value={d.miles} onChangeText={(t) => set('miles', t)} keyboardType="decimal-pad" placeholder="0"
                hint={`At ${money(rate)}/mile = ${money((miles || 0) * rate)}. Change the rate under Mileage & export.`} />
              <Field label="Trip" value={d.description} onChangeText={(t) => set('description', t)} placeholder="Shop → KTEB and back" />
            </>
          ) : (
            <>
              <Field label="Amount *" value={d.amount} onChangeText={(t) => set('amount', t)} keyboardType="decimal-pad" placeholder="0.00" />
              <Field label="Vendor" value={d.vendor} onChangeText={(t) => set('vendor', t)} placeholder="Who you paid" />
              <Field label="Description" value={d.description} onChangeText={(t) => set('description', t)} />
              <Select label="Category" value={d.category} options={categoryOptions} onChange={(v) => v && set('category', v)} searchable />
              <T variant="small" style={{ marginTop: -space.md, marginBottom: space.lg }}>{categoryInfo(d.category).line}</T>
            </>
          )}
          <DateTimeField label="Date" mode="date" value={d.spent_on} onChange={(v) => v && set('spent_on', v)} allowClear={false} />
          <Select label={d.kind === 'mileage' ? 'Drove to a job (optional)' : 'For a job (optional)'} value={d.job_id} options={jobOptions} onChange={(v) => set('job_id', v)} allowClear searchable placeholder="Not tied to a job" />
          {d.kind === 'mileage' && job?.location ? (
            <T variant="small" style={{ marginTop: -space.md, marginBottom: space.lg }}>
              Facility: {[job.location.airport_code, job.location.name].filter(Boolean).join(' · ')}. Check your map app for the distance and type the round-trip miles above.
            </T>
          ) : null}
          {d.kind === 'expense' ? (
            <T variant="small" style={{ marginTop: -space.md, marginBottom: space.lg }}>
              Don&apos;t re-enter job supplies or labor — they&apos;re counted automatically from the supply room and timesheets.
            </T>
          ) : null}
          {showBranches ? <Select label="Company location" value={d.branch_id} options={branchOptions} onChange={(v) => set('branch_id', v)} allowClear placeholder="Whole company" /> : null}
          {d.kind === 'expense' ? <Select label="Paid with" value={d.payment_method} options={PAYMENT_METHODS} onChange={(v) => set('payment_method', v)} allowClear inline /> : null}
          <Field label="Notes" value={d.notes} onChangeText={(t) => set('notes', t)} multiline />
          {expense && d.receipt_path && Platform.OS === 'web' ? (
            <Button kind="ghost" icon="open-outline" title="Open receipt in a new tab" onPress={async () => {
              const u = (await signedUrls([d.receipt_path!]))[d.receipt_path!]; if (u) Linking.openURL(u);
            }} />
          ) : null}
          {expense && canDelete ? (
            <View style={{ marginTop: space.lg }}>
              <Button kind="ghost" icon="trash-outline" title="Delete expense" onPress={() => confirmAction('Delete this expense?', 'This cannot be undone.', async () => {
                try { await must(supabase.from('expenses').delete().eq('id', expense.id)); onSaved(); onClose(); } catch (e: any) { setError(friendlyError(e.message)); }
              }, true)} />
            </View>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </SheetModal>
  );
}

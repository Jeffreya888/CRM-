// Per-asset documents (manual chapters, approved products, customer
// instructions) that the "Ask" assistant reads and cites for this asset.
import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import {
  addAircraftDoc, deleteAircraftDoc, DOC_KINDS, docKindLabel, fileSize, loadAircraftDocs, MAX_AIRCRAFT_DOCS, pickAircraftDoc, type PickedDoc,
} from '../../lib/assistant';
import { date } from '../../lib/format';
import { openStorageFile } from '../../lib/inventory';
import { useOrg } from '../../lib/session';
import { friendlyError } from '../../lib/supabase';
import { colors, space } from '../../lib/theme';
import type { AircraftDocument, AircraftDocumentKind } from '../../lib/types';
import { useQuery } from '../../lib/useQuery';
import { confirmAction, notify } from '../FormSheet';
import { Badge, Button, Card, ErrorBanner, Field, IconButton, Ionicons, ListRow, Row, Section, Select, SheetModal, T } from '../ui';

const KIND_TONE: Record<AircraftDocumentKind, 'info' | 'success' | 'purple' | 'neutral'> = {
  manual: 'info', approved_products: 'success', instructions: 'purple', other: 'neutral',
};

export function AircraftDocuments({ aircraftId, manager, label = 'aircraft' }: { aircraftId: string; manager: boolean; label?: string }) {
  const { orgId, session } = useOrg();
  const q = useQuery(() => loadAircraftDocs(aircraftId), [aircraftId]);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const docs = q.data ?? [];
  const full = docs.length >= MAX_AIRCRAFT_DOCS;

  const open = async (d: AircraftDocument) => {
    try { await openStorageFile(d.storage_path); } catch (e: any) { setError(e?.message ?? String(e)); }
  };
  const remove = (d: AircraftDocument) => confirmAction('Delete this document?', `"${d.title}" will be removed and the assistant will stop using it.`, async () => {
    try { await deleteAircraftDoc(d); q.reload(); } catch (e: any) { notify('Could not delete', friendlyError(e?.message ?? String(e))); }
  }, true);

  return (
    <Section title="Documents" icon="document-attach-outline" count={docs.length ? `${docs.length} of ${MAX_AIRCRAFT_DOCS}` : undefined}
      action={manager ? <Button small kind="ghost" icon="add" title="Add" disabled={full} onPress={() => { setError(null); setAdding(true); }} /> : null}>
      <ErrorBanner message={error ?? q.error} />
      <Card style={{ padding: 0, overflow: 'hidden' }}>
        {docs.map((d) => (
          <ListRow key={d.id} icon={d.mime_type === 'application/pdf' ? 'document-text-outline' : 'image-outline'} tone={KIND_TONE[d.kind] === 'neutral' ? 'primary' : KIND_TONE[d.kind]}
            title={d.title}
            subtitle={[fileSize(d.size_bytes), date(d.created_at)].filter(Boolean).join(' · ')}
            meta={d.notes}
            onPress={() => open(d)}
            right={
              <Row gap={4}>
                <Badge label={docKindLabel(d.kind)} tone={KIND_TONE[d.kind]} raw />
                {manager ? <IconButton icon="trash-outline" color={colors.textMuted} label={`Delete ${d.title}`} onPress={() => remove(d)} /> : null}
              </Row>
            } />
        ))}
        <Row gap={space.sm} style={{ padding: space.lg, alignItems: 'flex-start', borderTopWidth: docs.length ? 1 : 0, borderTopColor: colors.border }}>
          <Ionicons name="sparkles-outline" size={16} color={colors.primaryText} style={{ marginTop: 2 }} />
          <T variant="small" style={{ flex: 1 }}>
            {docs.length ? '' : `No documents for this ${label} yet. `}
            The Ask assistant uses these documents for this {label} and cites them.
            {manager ? ` Add manual chapters, approved-product lists or the owner's instructions (PDF or image, up to 20 MB, ${MAX_AIRCRAFT_DOCS} per ${label}).` : ''}
          </T>
        </Row>
      </Card>
      {manager ? (
        <AddDocSheet visible={adding} onClose={() => setAdding(false)}
          onSave={async (v) => {
            await addAircraftDoc({ orgId, aircraftId, userId: session!.user.id, ...v });
            setAdding(false);
            q.reload();
          }} />
      ) : null}
    </Section>
  );
}

function AddDocSheet({ visible, onClose, onSave }: {
  visible: boolean; onClose: () => void;
  onSave: (v: { title: string; kind: AircraftDocumentKind; notes: string | null; file: PickedDoc }) => Promise<void>;
}) {
  const [file, setFile] = useState<PickedDoc | null>(null);
  const [title, setTitle] = useState('');
  const [kind, setKind] = useState<AircraftDocumentKind>('manual');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const reset = () => { setFile(null); setTitle(''); setKind('manual'); setNotes(''); setError(null); };
  const close = () => { if (busy) return; reset(); onClose(); };

  const choose = async () => {
    setError(null);
    try {
      const f = await pickAircraftDoc();
      if (!f) return;
      setFile(f);
      if (!title.trim()) setTitle(f.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').slice(0, 200));
    } catch (e: any) {
      setError(e?.message ?? String(e));
    }
  };
  const save = async () => {
    if (!file) return setError('Choose a file first.');
    if (!title.trim()) return setError('Give the document a title.');
    setBusy(true);
    setError(null);
    try {
      await onSave({ title: title.trim(), kind, notes: notes.trim() || null, file });
      reset();
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <SheetModal visible={visible} onClose={close}>
      <Row style={{ padding: space.lg, justifyContent: 'space-between' }}>
        <T variant="h3">Add document</T>
        <Button small kind="secondary" title="Cancel" onPress={close} />
      </Row>
      <ScrollView contentContainerStyle={{ padding: space.lg, paddingTop: 0 }} keyboardShouldPersistTaps="handled">
        <ErrorBanner message={error} />
        <Card onPress={choose} style={{ borderStyle: 'dashed', borderColor: colors.borderStrong }}>
          <Row gap={space.md}>
            <Ionicons name={file ? (file.mime === 'application/pdf' ? 'document-text' : 'image') : 'cloud-upload-outline'} size={28} color={colors.primaryText} />
            <View style={{ flex: 1 }}>
              <T style={{ fontWeight: '700' }} numberOfLines={1}>{file ? file.name : 'Choose a PDF or image'}</T>
              <T variant="small">{file ? [fileSize(file.size), 'Tap to choose another'].filter(Boolean).join(' · ') : 'PDF, JPG, PNG or WebP · up to 20 MB'}</T>
            </View>
          </Row>
        </Card>
        <Field label="Title" value={title} onChangeText={setTitle} placeholder="e.g. Chapter 12 – Exterior cleaning" maxLength={200} />
        <Select label="Kind" value={kind} inline options={DOC_KINDS} onChange={(v) => v && setKind(v)} />
        <Field label="Notes (optional)" value={notes} onChangeText={setNotes} placeholder="What's in it, which pages matter" multiline />
        <Button icon="checkmark" title="Save document" loading={busy} disabled={!file} onPress={save} />
      </ScrollView>
    </SheetModal>
  );
}

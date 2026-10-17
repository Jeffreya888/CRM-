import * as DocumentPicker from 'expo-document-picker';
import * as Linking from 'expo-linking';
import { useState } from 'react';
import { View } from 'react-native';
import { FormSheet, notify } from '../FormSheet';
import { Badge, Button, Card, EmptyState, ErrorBanner, IconButton, ListRow, T } from '../ui';
import { removeFile, signedUrls, uploadFile } from '../../lib/files';
import { date } from '../../lib/format';
import { friendlyError, must, supabase } from '../../lib/supabase';
import { space } from '../../lib/theme';
import { useQuery } from '../../lib/useQuery';
import { CERT_KINDS, certKindLabel, daysUntil, EXPIRING_DAYS } from './constants';

export interface Certification {
  id: string; org_id: string; user_id: string | null; name: string; kind: string; issued_on: string | null; expires_on: string | null; document_path: string | null;
}

export function expiryBadge(expires: string | null) {
  const d = daysUntil(expires);
  if (d == null) return null;
  if (d < 0) return <Badge raw label="Expired" tone="danger" />;
  if (d <= EXPIRING_DAYS) return <Badge raw label={`Expires in ${d} day${d === 1 ? '' : 's'}`} tone="warning" />;
  return null;
}

/** Certifications for one person (userId) or company documents (userId = null). */
export function Certifications({ orgId, userId, canEdit, emptyBody }: { orgId: string; userId: string | null; canEdit: boolean; emptyBody?: string }) {
  const q = useQuery(async () => {
    let qq = supabase.from('certifications').select('*').eq('org_id', orgId).order('expires_on', { ascending: true, nullsFirst: false });
    qq = userId ? qq.eq('user_id', userId) : qq.is('user_id', null);
    return ((await must(qq)) ?? []) as Certification[];
  }, [orgId, userId]);
  const [edit, setEdit] = useState<Certification | 'new' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const cur = edit && edit !== 'new' ? edit : null;

  const attach = async (c: Certification) => {
    setError(null);
    try {
      const r = await DocumentPicker.getDocumentAsync({ type: ['application/pdf', 'image/*'], copyToCacheDirectory: true });
      const a = r.canceled ? null : r.assets[0];
      if (!a) return;
      const ext = a.name.split('.').pop() ?? 'pdf';
      const path = await uploadFile(orgId, 'certifications', a.uri, a.mimeType ?? 'application/pdf', ext);
      await must(supabase.from('certifications').update({ document_path: path }).eq('id', c.id));
      if (c.document_path) removeFile(c.document_path).catch(() => {});
      q.reload();
    } catch (e: any) { setError(friendlyError(e.message)); }
  };
  const view = async (c: Certification) => {
    try {
      const u = (await signedUrls([c.document_path!]))[c.document_path!];
      if (u) Linking.openURL(u); else notify('Document not found');
    } catch (e: any) { setError(e.message); }
  };

  const rows = q.data ?? [];
  return (
    <View>
      <ErrorBanner message={error ?? q.error} />
      {rows.length === 0 && q.data ? (
        <Card><EmptyState icon="ribbon-outline" title={userId ? 'No certifications' : 'No company documents'} body={emptyBody ?? (userId ? 'Add airport badges, ramp safety and coating-brand certifications with their expiration dates.' : 'Add your certificate of insurance, registrations and licenses so you know when they expire.')} /></Card>
      ) : rows.length ? (
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          {rows.map((c) => (
            <ListRow key={c.id} icon={c.kind === 'coi' ? 'shield-checkmark-outline' : 'ribbon-outline'} tone={daysUntil(c.expires_on) != null && daysUntil(c.expires_on)! <= EXPIRING_DAYS ? 'warning' : 'primary'}
              title={c.name} subtitle={`${certKindLabel(c.kind)}${c.expires_on ? ` · expires ${date(c.expires_on)}` : ' · no expiration'}`}
              meta={c.issued_on ? `Issued ${date(c.issued_on)}` : null}
              right={
                <View style={{ alignItems: 'flex-end', gap: 4 }}>
                  {expiryBadge(c.expires_on)}
                  <View style={{ flexDirection: 'row' }}>
                    {c.document_path ? <IconButton icon="document-attach-outline" label="View document" onPress={() => view(c)} /> : null}
                    {canEdit ? <IconButton icon="cloud-upload-outline" label="Upload document" onPress={() => attach(c)} /> : null}
                  </View>
                </View>
              }
              onPress={canEdit ? () => setEdit(c) : undefined} />
          ))}
        </Card>
      ) : null}
      {canEdit ? <Button small kind="secondary" icon="add" title={userId ? 'Add certification' : 'Add company document'} style={{ marginTop: space.sm, alignSelf: 'flex-start' }} onPress={() => setEdit('new')} /> : null}
      <FormSheet visible={!!edit} title={cur ? 'Edit' : userId ? 'New certification' : 'New company document'}
        initial={cur ? { ...cur } : { kind: userId ? 'badge' : 'coi' }} onClose={() => setEdit(null)}
        fields={[
          { key: 'name', label: 'Name', type: 'text', required: true, placeholder: userId ? 'KTEB ramp badge' : 'Certificate of insurance ($2M)' },
          { key: 'kind', label: 'Type', type: 'select', options: CERT_KINDS },
          { key: 'issued_on', label: 'Issued', type: 'date' },
          { key: 'expires_on', label: 'Expires', type: 'date' },
        ]}
        onSubmit={async (v) => {
          const row = { name: v.name, kind: v.kind ?? 'other', issued_on: v.issued_on, expires_on: v.expires_on };
          if (cur) await must(supabase.from('certifications').update(row).eq('id', cur.id));
          else await must(supabase.from('certifications').insert({ ...row, org_id: orgId, user_id: userId }));
          q.reload();
        }}
        onDelete={cur ? async () => {
          await must(supabase.from('certifications').delete().eq('id', cur.id));
          if (cur.document_path) removeFile(cur.document_path).catch(() => {});
          q.reload();
        } : undefined} />
      {canEdit && rows.some((c) => !c.document_path) ? <T variant="small" style={{ marginTop: space.sm }}>Tap the upload icon to attach a photo or PDF of the document.</T> : null}
    </View>
  );
}

import { useState } from 'react';
import { Image, Platform, Pressable, ScrollView, View } from 'react-native';
import { pickImage, removeFile, signedUrls, uploadImage } from '../../lib/files';
import { useOrg } from '../../lib/session';
import { friendlyError, supabase } from '../../lib/supabase';
import { colors, radius, space } from '../../lib/theme';
import { useQuery } from '../../lib/useQuery';
import { confirmAction, notify } from '../FormSheet';
import { Button, Ionicons, Row, T } from '../ui';

export interface QuotePhotoRow { id: string; storage_path: string; caption: string | null }

const THUMB = 104;

/** Uploads local photos to "<orgId>/quotes/<quoteId>/…" and records them on the quote. */
export async function uploadQuotePhotos(orgId: string, quoteId: string, uris: string[]) {
  for (const uri of uris) {
    const path = await uploadImage(orgId, `quotes/${quoteId}`, uri);
    const { error } = await supabase.from('quote_photos').insert({ org_id: orgId, quote_id: quoteId, storage_path: path });
    if (error) throw new Error(friendlyError(error.message));
  }
}

/**
 * Photos attached to a quote. With a saved quote they upload immediately;
 * before the first save they are kept in `pending` and uploaded by the editor.
 */
export function QuotePhotos({ quoteId, editable, pending, onPendingChange }: {
  quoteId?: string | null;
  editable: boolean;
  pending?: string[];
  onPendingChange?: (uris: string[]) => void;
}) {
  const { orgId } = useOrg();
  const [busy, setBusy] = useState(false);
  const q = useQuery(async () => {
    if (!quoteId) return { rows: [] as QuotePhotoRow[], urls: {} as Record<string, string> };
    const { data, error } = await supabase.from('quote_photos').select('id, storage_path, caption').eq('quote_id', quoteId).order('created_at');
    if (error) throw error;
    const rows = (data ?? []) as QuotePhotoRow[];
    const urls = await signedUrls(rows.map((r) => r.storage_path)).catch(() => ({} as Record<string, string>));
    return { rows, urls };
  }, [quoteId]);

  const add = async (source: 'camera' | 'library') => {
    try {
      const uri = await pickImage(source);
      if (!uri) return;
      if (!quoteId) { onPendingChange?.([...(pending ?? []), uri]); return; }
      setBusy(true);
      await uploadQuotePhotos(orgId, quoteId, [uri]);
      await q.reload();
    } catch (e: any) {
      notify('Could not add photo', friendlyError(e.message));
    } finally {
      setBusy(false);
    }
  };

  const remove = (row: QuotePhotoRow) => confirmAction('Remove photo?', 'It will no longer show on this quote.', async () => {
    const { error } = await supabase.from('quote_photos').delete().eq('id', row.id);
    if (error) return notify('Could not remove photo', friendlyError(error.message));
    // Older versions of the quote may share the file, so only delete it when nothing else uses it.
    const { count } = await supabase.from('quote_photos').select('id', { count: 'exact', head: true }).eq('storage_path', row.storage_path);
    if (!count) await removeFile(row.storage_path).catch(() => {});
    q.reload();
  }, true);

  const rows = q.data?.rows ?? [];
  const local = pending ?? [];
  const empty = !rows.length && !local.length;

  return (
    <View>
      {empty ? (
        <T variant="muted" style={{ marginBottom: space.md }}>
          {editable ? 'Add photos of problem areas so the customer sees exactly what you will fix.' : 'No photos attached.'}
        </T>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm, paddingBottom: space.md }}>
          {rows.map((r) => (
            <View key={r.id}>
              {q.data?.urls[r.storage_path] ? (
                <Image source={{ uri: q.data.urls[r.storage_path] }} style={{ width: THUMB, height: THUMB, borderRadius: radius.md }} resizeMode="cover" />
              ) : (
                <View style={{ width: THUMB, height: THUMB, borderRadius: radius.md, backgroundColor: colors.cardRaised, alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="image-outline" size={28} color={colors.textFaint} />
                </View>
              )}
              {editable ? <RemoveDot onPress={() => remove(r)} /> : null}
            </View>
          ))}
          {local.map((uri, i) => (
            <View key={uri + i}>
              <Image source={{ uri }} style={{ width: THUMB, height: THUMB, borderRadius: radius.md, opacity: 0.85 }} resizeMode="cover" />
              <RemoveDot onPress={() => onPendingChange?.(local.filter((_, j) => j !== i))} />
            </View>
          ))}
        </ScrollView>
      )}
      {editable ? (
        <Row>
          {Platform.OS !== 'web' ? <Button small kind="secondary" icon="camera-outline" title="Take photo" loading={busy} onPress={() => add('camera')} /> : null}
          <Button small kind="secondary" icon="images-outline" title="Choose photo" loading={busy} onPress={() => add('library')} />
        </Row>
      ) : null}
      {local.length ? <T variant="small" style={{ marginTop: space.sm }}>Photos upload when you save the quote.</T> : null}
    </View>
  );
}

function RemoveDot({ onPress }: { onPress: () => void }) {
  return (
    <Pressable accessibilityLabel="Remove photo" onPress={onPress} hitSlop={8}
      style={{ position: 'absolute', top: 4, right: 4, width: 26, height: 26, borderRadius: 13, backgroundColor: 'rgba(0,0,0,0.65)', alignItems: 'center', justifyContent: 'center' }}>
      <Ionicons name="close" size={16} color={colors.white} />
    </Pressable>
  );
}

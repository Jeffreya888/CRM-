import * as WebBrowser from 'expo-web-browser';
import { signedUrls } from './files';
import { supabase } from './supabase';
import type { TrainingMedia } from './types';

/** Signed thumbnail URLs keyed by media id. */
export async function thumbnails(media: TrainingMedia[]): Promise<Record<string, string>> {
  const paths = media.map((m) => m.thumbnail_path).filter((p): p is string => !!p);
  const urls = await signedUrls(paths);
  return Object.fromEntries(media.filter((m) => m.thumbnail_path && urls[m.thumbnail_path]).map((m) => [m.id, urls[m.thumbnail_path!]!]));
}

/** Opens a video/document and records that this user has watched it. */
export async function openMedia(m: TrainingMedia, userId: string) {
  const url = m.url ?? (m.storage_path ? (await signedUrls([m.storage_path], 4 * 3600))[m.storage_path] : null);
  if (!url) throw new Error('This item has no file or link');
  await supabase.from('training_progress').upsert(
    { media_id: m.id, user_id: userId, org_id: m.org_id },
    { onConflict: 'media_id,user_id', ignoreDuplicates: true },
  );
  await WebBrowser.openBrowserAsync(url);
}

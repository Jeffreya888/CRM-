import * as ImagePicker from 'expo-image-picker';
import { randomUUID } from 'expo-crypto';
import { supabase } from './supabase';

const BUCKET = 'org-files';

/** Opens the camera (or library) and returns a local image uri, or null. */
export async function pickImage(source: 'camera' | 'library'): Promise<string | null> {
  if (source === 'camera') {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) throw new Error('Camera permission is needed to take job photos. Enable it in Settings.');
  }
  const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.7, exif: false };
  const res = source === 'camera' ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
  if (res.canceled || !res.assets?.[0]) return null;
  return res.assets[0].uri;
}

/** Uploads a local file to "<orgId>/<folder>/<uuid>.jpg" and returns the storage path. */
export async function uploadImage(orgId: string, folder: string, uri: string): Promise<string> {
  const body = await (await fetch(uri)).arrayBuffer();
  const path = `${orgId}/${folder}/${randomUUID()}.jpg`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, body, { contentType: 'image/jpeg' });
  if (error) throw new Error(error.message);
  return path;
}

export async function signedUrls(paths: string[], expiresIn = 3600): Promise<Record<string, string>> {
  if (!paths.length) return {};
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrls(paths, expiresIn);
  if (error) throw new Error(error.message);
  return Object.fromEntries((data ?? []).filter((d) => d.signedUrl).map((d) => [d.path!, d.signedUrl as string]));
}

export async function removeFile(path: string) {
  await supabase.storage.from(BUCKET).remove([path]);
}

/** Uploads any local file (video, PDF…) and returns its storage path. */
export async function uploadFile(orgId: string, folder: string, uri: string, contentType: string, ext: string): Promise<string> {
  const body = await (await fetch(uri)).arrayBuffer();
  const path = `${orgId}/${folder}/${randomUUID()}.${ext.replace(/^\./, '') || 'bin'}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, body, { contentType });
  if (error) throw new Error(error.message.includes('exceeded') || error.message.includes('too large') ? 'File is too large. For long videos, paste a YouTube or Vimeo link instead.' : error.message);
  return path;
}

/** Picks a video from the library. */
export async function pickVideo(): Promise<{ uri: string; mime: string; ext: string; durationMin: number | null } | null> {
  const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['videos'], quality: 1 });
  if (res.canceled || !res.assets?.[0]) return null;
  const a = res.assets[0];
  const ext = (a.fileName?.split('.').pop() ?? a.mimeType?.split('/').pop() ?? 'mp4').toLowerCase();
  return { uri: a.uri, mime: a.mimeType ?? 'video/mp4', ext, durationMin: a.duration ? Math.max(1, Math.round(a.duration / 60000)) : null };
}

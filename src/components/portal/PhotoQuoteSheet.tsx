import { useState } from 'react';
import { Image, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, ErrorBanner, Field, Ionicons, Row, Select, T } from '../ui';
import { MAX_ASSESS_PHOTOS, pickAssessPhotos, sendPhotoQuote, type PickedPhoto } from '../../lib/assess';
import type { PortalAsset } from '../../lib/portal';
import { colors, radius, space } from '../../lib/theme';

/** Customer portal: "Get a quote from photos" — pick an asset (optional), add photos and a note, send. */
export function PhotoQuoteSheet({ visible, token, assets, onClose, onSent }: {
  visible: boolean; token: string; assets: PortalAsset[]; onClose: () => void; onSent: (message: string) => void;
}) {
  const [assetId, setAssetId] = useState<string | null>(null);
  const [photos, setPhotos] = useState<PickedPhoto[]>([]);
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [wasVisible, setWasVisible] = useState(false);

  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) {
      setAssetId(assets.length === 1 ? assets[0]!.id : null);
      setPhotos([]); setNotes(''); setError(null); setProgress(null);
    }
  }

  const add = async (source: 'camera' | 'library') => {
    setError(null);
    try {
      const picked = await pickAssessPhotos(source, MAX_ASSESS_PHOTOS - photos.length);
      if (picked.length) setPhotos((p) => [...p, ...picked].slice(0, MAX_ASSESS_PHOTOS));
    } catch (e: any) {
      setError(e.message);
    }
  };

  const submit = async () => {
    setError(null);
    if (!photos.length) return setError('Add at least one photo.');
    setBusy(true);
    try {
      setProgress(`Uploading photos (0 of ${photos.length})…`);
      await sendPhotoQuote(token, { photos, aircraftId: assetId, notes: notes.trim() || null },
        (n) => setProgress(`Uploading photos (${n} of ${photos.length})…`));
      onSent("Thanks! We've got your photos. We'll send your quote soon.");
      onClose();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
          <View style={{ maxWidth: 640, width: '100%', alignSelf: 'center', flex: 1 }}>
            <Row style={{ padding: space.lg, justifyContent: 'space-between' }}>
              <T variant="h3">Get a quote from photos</T>
              <Button small kind="secondary" title="Close" onPress={onClose} />
            </Row>
            <ScrollView contentContainerStyle={{ padding: space.lg, paddingTop: 0, paddingBottom: 64 }} keyboardShouldPersistTaps="handled">
              <ErrorBanner message={error} />
              <T variant="muted" style={{ marginBottom: space.md }}>
                Send up to {MAX_ASSESS_PHOTOS} photos: the whole outside, close-ups of anything dirty or worn, and the inside. We&apos;ll review them and send you a quote.
              </T>
              {assets.length ? (
                <Select label="Which one? (optional)" value={assetId} onChange={setAssetId} allowClear
                  options={assets.map((a) => ({ value: a.id, label: a.tail_number, hint: [a.manufacturer, a.model].filter(Boolean).join(' ') || undefined }))} />
              ) : null}
              {photos.length ? (
                <Row style={{ flexWrap: 'wrap', marginBottom: space.md }} gap={space.sm}>
                  {photos.map((p, i) => (
                    <View key={`${p.uri}-${i}`}>
                      <Image source={{ uri: p.uri }} style={{ width: 96, height: 96, borderRadius: radius.md, backgroundColor: colors.cardRaised }} />
                      {!busy ? (
                        <Pressable accessibilityRole="button" accessibilityLabel="Remove photo" hitSlop={8} onPress={() => setPhotos((ps) => ps.filter((_, j) => j !== i))}
                          style={{ position: 'absolute', top: 4, right: 4, width: 24, height: 24, borderRadius: 12, backgroundColor: 'rgba(0,0,0,0.65)', alignItems: 'center', justifyContent: 'center' }}>
                          <Ionicons name="close" size={16} color={colors.white} />
                        </Pressable>
                      ) : null}
                    </View>
                  ))}
                </Row>
              ) : null}
              {photos.length < MAX_ASSESS_PHOTOS && !busy ? (
                <Row style={{ marginBottom: space.md }}>
                  <Button kind="secondary" icon="camera-outline" title="Take photo" onPress={() => add('camera')} style={{ flex: 1 }} />
                  <Button kind="secondary" icon="images-outline" title="Choose photos" onPress={() => add('library')} style={{ flex: 1 }} />
                </Row>
              ) : null}
              <Field label="Note (optional)" multiline value={notes} onChangeText={setNotes} placeholder="What you'd like done, where it's parked, timing…" />
              <Button title="Send photos" icon="send-outline" onPress={submit} loading={busy} disabled={!photos.length} />
              {progress ? <T variant="small" style={{ marginTop: space.sm, textAlign: 'center' }}>{progress}</T> : null}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

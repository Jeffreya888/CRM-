import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Image, Modal, Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { notify } from '../FormSheet';
import { Button, ErrorBanner, Ionicons, Row, T } from '../ui';
import { applyAssessment, MAX_ASSESS_PHOTOS, pickAssessPhotos, quoteFromAssessment, runAssessment, uploadAssessmentPhotos, type PickedPhoto } from '../../lib/assess';
import { useLookups } from '../../lib/lookups';
import { isManager } from '../../lib/plans';
import { conditionLabel } from '../../lib/pricing';
import { useOrg } from '../../lib/session';
import { friendlyError } from '../../lib/supabase';
import { colors, radius, space } from '../../lib/theme';
import type { ConditionAssessment } from '../../lib/types';
import { AssessmentCard } from './AssessmentCard';

type Step = 'pick' | 'running' | 'result';

/**
 * Shared "Check condition from photos" sheet: pick or take up to 6 photos,
 * run the AI check, then create a quote or save the condition to the asset.
 */
export function AssessPhotosSheet(props: {
  visible: boolean; onClose: () => void;
  aircraftId?: string | null; customerId?: string | null; jobId?: string | null; quoteId?: string | null;
  onQuoteCreated?: (quoteId: string) => void;
}) {
  const { visible, onClose, aircraftId, jobId, quoteId, onQuoteCreated } = props;
  const { org, orgId, role, perm, branchId } = useOrg();
  const lk = useLookups();
  const [photos, setPhotos] = useState<PickedPhoto[]>([]);
  const [step, setStep] = useState<Step>('pick');
  const [progress, setProgress] = useState('');
  const [result, setResult] = useState<ConditionAssessment | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [wasVisible, setWasVisible] = useState(false);

  // Start fresh each time the sheet opens.
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) { setPhotos([]); setStep('pick'); setResult(null); setError(null); setSaved(false); setProgress(''); }
  }

  const aircraft = aircraftId ? lk.aircraft.find((a) => a.id === aircraftId) ?? null : null;
  const customerId = props.customerId ?? aircraft?.customer_id ?? null;
  const canQuote = perm('see_prices') && !!customerId;
  const canSave = isManager(role) && !!aircraftId;
  const assetWord = aircraft?.asset_type === 'vehicle' ? 'vehicle' : aircraft?.asset_type === 'watercraft' ? 'boat' : 'aircraft';

  const add = async (source: 'camera' | 'library') => {
    setError(null);
    try {
      const picked = await pickAssessPhotos(source, MAX_ASSESS_PHOTOS - photos.length);
      if (picked.length) setPhotos((p) => [...p, ...picked].slice(0, MAX_ASSESS_PHOTOS));
    } catch (e: any) {
      setError(e.message);
    }
  };

  const check = async () => {
    if (!photos.length) return;
    setError(null);
    setStep('running');
    try {
      setProgress(`Uploading photos (0 of ${photos.length})…`);
      const paths = await uploadAssessmentPhotos(orgId, photos.map((p) => p.uri), (n) => setProgress(`Uploading photos (${n} of ${photos.length})…`));
      setProgress('Checking condition… this usually takes under a minute.');
      const row = await runAssessment({ orgId, paths, aircraftId, customerId, jobId, quoteId });
      setResult(row);
      setStep('result');
    } catch (e: any) {
      setError(friendlyError(e.message));
      setStep('pick');
    }
  };

  const createQuote = async () => {
    if (!customerId) return;
    try {
      const id = await quoteFromAssessment({
        org, assessment: result?.status === 'done' ? result : null, customerId, aircraft, services: lk.services, branchId,
      });
      onClose();
      if (onQuoteCreated) onQuoteCreated(id);
      else router.push({ pathname: '/quotes/edit', params: { id } });
    } catch (e: any) {
      notify('Could not create the quote', friendlyError(e.message));
    }
  };

  const saveCondition = async () => {
    if (!result) return;
    try {
      await applyAssessment(result.id);
      setSaved(true);
      lk.reload();
    } catch (e: any) {
      notify('Could not save the condition', friendlyError(e.message));
    }
  };

  const done = result?.status === 'done';

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
        <View style={{ maxWidth: 640, width: '100%', alignSelf: 'center', flex: 1 }}>
          <Row style={{ padding: space.lg, justifyContent: 'space-between' }}>
            <View style={{ flex: 1 }}>
              <T variant="h3">Check condition</T>
              {aircraft ? <T variant="small">{[aircraft.tail_number, [aircraft.manufacturer, aircraft.model].filter(Boolean).join(' ')].filter(Boolean).join(' · ')}</T> : null}
            </View>
            <Button small kind="secondary" title="Close" onPress={onClose} />
          </Row>
          <ScrollView contentContainerStyle={{ padding: space.lg, paddingTop: 0, paddingBottom: 64 }} keyboardShouldPersistTaps="handled">
            <ErrorBanner message={error} />

            {step === 'pick' ? (
              <>
                <T variant="muted" style={{ marginBottom: space.md }}>
                  Add up to {MAX_ASSESS_PHOTOS} clear photos: the whole exterior, close-ups of dirty or worn areas, and the interior.
                </T>
                <Thumbs photos={photos} onRemove={(i) => setPhotos((p) => p.filter((_, j) => j !== i))} />
                {photos.length < MAX_ASSESS_PHOTOS ? (
                  <Row style={{ marginBottom: space.lg }}>
                    <Button kind="secondary" icon="camera-outline" title="Take photo" onPress={() => add('camera')} style={{ flex: 1 }} />
                    <Button kind="secondary" icon="images-outline" title="Choose photos" onPress={() => add('library')} style={{ flex: 1 }} />
                  </Row>
                ) : null}
                <Button icon="sparkles-outline" title="Check condition" disabled={!photos.length} onPress={check} />
                <T variant="small" style={{ marginTop: space.md }}>AI estimate — please confirm on site.</T>
              </>
            ) : null}

            {step === 'running' ? (
              <View style={{ alignItems: 'center', paddingVertical: space.xxl, gap: space.md }}>
                <ActivityIndicator size="large" color={colors.primaryText} />
                <T style={{ textAlign: 'center' }}>{progress}</T>
                <Thumbs photos={photos} />
              </View>
            ) : null}

            {step === 'result' && result ? (
              <>
                <AssessmentCard assessment={{ ...result, applied_at: saved ? new Date().toISOString() : result.applied_at }} />
                {done && canQuote ? <Button icon="document-text-outline" title="Create quote" onPress={createQuote} style={{ marginBottom: space.sm }} /> : null}
                {done && canSave && result.overall ? (
                  saved ? (
                    <Row style={{ justifyContent: 'center', marginVertical: space.sm }}>
                      <Ionicons name="checkmark-circle" size={18} color={colors.success} />
                      <T style={{ color: colors.success }}>Saved: {conditionLabel(result.overall)} condition</T>
                    </Row>
                  ) : (
                    <Button kind="secondary" icon="save-outline" title={`Save condition to ${assetWord}`} onPress={saveCondition} style={{ marginBottom: space.sm }} />
                  )
                ) : null}
                <Button kind="ghost" icon="refresh-outline" title={done ? 'Check other photos' : 'Try again'} onPress={() => { setStep('pick'); setResult(null); setSaved(false); }} />
              </>
            ) : null}
          </ScrollView>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

function Thumbs({ photos, onRemove }: { photos: PickedPhoto[]; onRemove?: (i: number) => void }) {
  if (!photos.length) return null;
  return (
    <Row style={{ flexWrap: 'wrap', marginBottom: space.md }} gap={space.sm}>
      {photos.map((p, i) => (
        <View key={`${p.uri}-${i}`}>
          <Image source={{ uri: p.uri }} style={{ width: 96, height: 96, borderRadius: radius.md, backgroundColor: colors.cardRaised }} />
          {onRemove ? (
            <Pressable accessibilityRole="button" accessibilityLabel="Remove photo" onPress={() => onRemove(i)} hitSlop={8}
              style={{ position: 'absolute', top: 4, right: 4, width: 24, height: 24, borderRadius: 12, backgroundColor: 'rgba(0,0,0,0.65)', alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="close" size={16} color={colors.white} />
            </Pressable>
          ) : null}
        </View>
      ))}
    </Row>
  );
}

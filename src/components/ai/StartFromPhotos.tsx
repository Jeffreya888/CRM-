import { useState } from 'react';
import { Modal, Platform, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Row, Select, T } from '../ui';
import { useLookups } from '../../lib/lookups';
import { useOrg } from '../../lib/session';
import { colors, space } from '../../lib/theme';
import { AssessPhotosSheet } from './AssessPhotosSheet';

/** "Start from photos" on the quotes list: choose the customer (and asset), then check photos and build the quote. */
export function StartFromPhotosButton({ style }: { style?: object }) {
  const { businessTypes } = useOrg();
  const lk = useLookups();
  const [picking, setPicking] = useState(false);
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [aircraftId, setAircraftId] = useState<string | null>(null);
  const [sheet, setSheet] = useState(false);
  const assetOptions = customerId ? lk.aircraftOptions(customerId) : [];
  const assetLabel = businessTypes.length > 1 ? 'Aircraft, vehicle or boat (optional)' : 'Aircraft (optional)';

  return (
    <>
      <Button small kind="secondary" icon="camera-outline" title="Start from photos" style={style}
        onPress={() => { setCustomerId(null); setAircraftId(null); setPicking(true); }} />
      <Modal visible={picking} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setPicking(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
          <View style={{ maxWidth: 640, width: '100%', alignSelf: 'center', flex: 1 }}>
            <Row style={{ padding: space.lg, justifyContent: 'space-between' }}>
              <T variant="h3">Quote from photos</T>
              <Button small kind="secondary" title="Close" onPress={() => setPicking(false)} />
            </Row>
            <ScrollView contentContainerStyle={{ padding: space.lg, paddingTop: 0 }} keyboardShouldPersistTaps="handled">
              <T variant="muted" style={{ marginBottom: space.md }}>
                Add a few photos and we&apos;ll suggest the condition and services, then build a draft quote you can review.
              </T>
              <Select label="Customer" value={customerId} searchable options={lk.customerOptions}
                onChange={(v) => {
                  setCustomerId(v);
                  const mine = v ? lk.aircraftOptions(v) : [];
                  setAircraftId(mine.length === 1 ? mine[0]!.value : null);
                }} />
              {assetOptions.length ? (
                <Select label={assetLabel} value={aircraftId} options={assetOptions} onChange={setAircraftId} allowClear />
              ) : null}
              <Button title="Next: add photos" icon="arrow-forward" disabled={!customerId} style={{ marginTop: space.md }}
                onPress={() => {
                  setPicking(false);
                  // iOS can't present a sheet while another is still closing.
                  if (Platform.OS === 'ios') setTimeout(() => setSheet(true), 450); else setSheet(true);
                }} />
            </ScrollView>
          </View>
        </SafeAreaView>
      </Modal>
      <AssessPhotosSheet visible={sheet} onClose={() => setSheet(false)} customerId={customerId} aircraftId={aircraftId} />
    </>
  );
}

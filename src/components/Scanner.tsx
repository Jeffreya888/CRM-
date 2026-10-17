import { CameraView, useCameraPermissions, type BarcodeType } from 'expo-camera';
import { useRef, useState, type ReactNode } from 'react';
import { Linking, Modal, Platform, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, radius, space } from '../lib/theme';
import { Button, Field, IconButton, Row, T } from './ui';

const ALL_TYPES: BarcodeType[] = ['qr', 'ean13', 'ean8', 'upc_a', 'upc_e', 'code128', 'code39', 'code93', 'itf14', 'codabar', 'datamatrix', 'pdf417', 'aztec'];

/**
 * Camera barcode / QR scanner with a "type the code" fallback (always shown on
 * web, and whenever the camera is unavailable or not allowed).
 * Calls `onScan` once per distinct code; set `paused` while handling a result.
 */
export function Scanner({
  onScan,
  paused,
  types = ALL_TYPES,
  height = 280,
  manualLabel = 'Or type the code',
}: {
  onScan: (code: string) => void;
  paused?: boolean;
  types?: BarcodeType[];
  height?: number;
  manualLabel?: string;
}) {
  const native = Platform.OS !== 'web';
  const [permission, requestPermission] = useCameraPermissions();
  const [torch, setTorch] = useState(false);
  const [manual, setManual] = useState('');
  const last = useRef<{ code: string; at: number } | null>(null);

  const handle = (code: string) => {
    const now = Date.now();
    // The camera reports the same code many times per second; ignore repeats for a moment.
    if (last.current && last.current.code === code && now - last.current.at < 2500) return;
    last.current = { code, at: now };
    onScan(code);
  };

  const submitManual = () => {
    const c = manual.trim();
    if (!c) return;
    setManual('');
    last.current = null;
    onScan(c);
  };

  let camera: ReactNode = null;
  if (native) {
    if (!permission) {
      camera = <View style={[styles.box, { height }]} />;
    } else if (!permission.granted) {
      camera = (
        <View style={[styles.box, styles.center, { height }]}>
          <T style={{ textAlign: 'center', marginBottom: space.md }}>Allow camera access to scan barcodes and QR labels.</T>
          {permission.canAskAgain
            ? <Button small title="Allow camera" icon="camera-outline" onPress={requestPermission} />
            : <Button small kind="secondary" title="Open Settings" icon="settings-outline" onPress={() => Linking.openSettings()} />}
        </View>
      );
    } else {
      camera = (
        <View style={[styles.box, { height }]}>
          <CameraView
            style={StyleSheet.absoluteFill}
            facing="back"
            enableTorch={torch}
            barcodeScannerSettings={{ barcodeTypes: types }}
            onBarcodeScanned={paused ? undefined : (r) => r.data && handle(r.data)}
          />
          <View pointerEvents="none" style={styles.frame} />
          <View style={styles.torch}>
            <IconButton icon={torch ? 'flashlight' : 'flashlight-outline'} color={colors.white} label="Flashlight" onPress={() => setTorch((t) => !t)} />
          </View>
          {paused ? <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.45)' }]} /> : null}
        </View>
      );
    }
  }

  return (
    <View>
      {camera}
      {native && permission?.granted ? <T variant="small" style={{ textAlign: 'center', marginTop: space.sm, marginBottom: space.md }}>Hold the code inside the frame.</T> : null}
      {!native ? <T variant="muted" style={{ marginBottom: space.md }}>Camera scanning works in the phone app. Here, type or paste the code (a USB barcode scanner also works).</T> : null}
      <Row gap={space.sm} style={{ alignItems: 'flex-start' }}>
        <Field
          style={{ flex: 1, marginBottom: space.md }}
          label={manualLabel}
          value={manual}
          onChangeText={setManual}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="Barcode or label code"
          returnKeyType="search"
          onSubmitEditing={submitManual}
          icon="barcode-outline"
        />
        <Button small title="Find" onPress={submitManual} disabled={!manual.trim()} style={{ marginTop: 30 }} />
      </Row>
    </View>
  );
}

/** Full-screen scanner sheet that returns one code (e.g. to fill a barcode field). */
export function ScannerModal({ visible, onClose, onScan, title = 'Scan barcode', types }: {
  visible: boolean; onClose: () => void; onScan: (code: string) => void; title?: string; types?: BarcodeType[];
}) {
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
        <Row style={{ padding: space.lg, justifyContent: 'space-between' }}>
          <T variant="h3">{title}</T>
          <Button small kind="secondary" title="Close" onPress={onClose} />
        </Row>
        <View style={{ paddingHorizontal: space.lg }}>
          {visible ? <Scanner types={types} onScan={(c) => { onScan(c); onClose(); }} /> : null}
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  box: { borderRadius: radius.lg, overflow: 'hidden', backgroundColor: colors.bgDeep, borderWidth: 1, borderColor: colors.border },
  center: { alignItems: 'center', justifyContent: 'center', padding: space.xl },
  frame: { position: 'absolute', left: '15%', right: '15%', top: '22%', bottom: '22%', borderWidth: 2, borderColor: 'rgba(255,255,255,0.85)', borderRadius: radius.md },
  torch: { position: 'absolute', right: space.sm, top: space.sm, backgroundColor: 'rgba(0,0,0,0.4)', borderRadius: 20 },
});

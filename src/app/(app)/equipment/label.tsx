import { Stack, useLocalSearchParams } from 'expo-router';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { useState } from 'react';
import { Platform, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { notify } from '../../../components/FormSheet';
import { Button, Card, EmptyState, ErrorBanner, Loading, Row, Screen, T } from '../../../components/ui';
import { equipmentQrUrl, labelsHtml, type Equipment } from '../../../lib/inventory';
import { useOrg } from '../../../lib/session';
import { friendlyError, must, supabase } from '../../../lib/supabase';
import { space } from '../../../lib/theme';
import { useQuery } from '../../../lib/useQuery';

type LabelEq = Pick<Equipment, 'id' | 'name' | 'serial_number' | 'qr_token' | 'assigned_label'>;

/** Printable QR labels: one item (?id=) or every piece of equipment in service. */
export default function EquipmentLabels() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { orgId, org } = useOrg();
  const [busy, setBusy] = useState<'print' | 'share' | null>(null);

  const q = useQuery(async () => {
    let query = supabase.from('equipment').select('id, name, serial_number, qr_token, assigned_label').eq('org_id', orgId);
    query = id ? query.eq('id', id) : query.neq('status', 'retired').order('name');
    return ((await must(query)) ?? []) as LabelEq[];
  }, [orgId, id]);

  const items = q.data ?? [];
  const html = () => labelsHtml(items, org?.name);

  const print = async () => {
    setBusy('print');
    try {
      if (Platform.OS === 'web') {
        const w = window.open('', '_blank');
        if (!w) throw new Error('Allow pop-ups to print labels.');
        w.document.write(html());
        w.document.close();
        w.focus();
        setTimeout(() => w.print(), 300);
      } else {
        await Print.printAsync({ html: html() });
      }
    } catch (e: any) {
      notify('Could not print', friendlyError(e.message ?? String(e)));
    } finally {
      setBusy(null);
    }
  };

  const share = async () => {
    setBusy('share');
    try {
      const { uri } = await Print.printToFileAsync({ html: html() });
      if (!(await Sharing.isAvailableAsync())) throw new Error('Sharing is not available on this device.');
      await Sharing.shareAsync(uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle: 'Equipment labels' });
    } catch (e: any) {
      notify('Could not share', friendlyError(e.message ?? String(e)));
    } finally {
      setBusy(null);
    }
  };

  const title = id ? 'QR label' : 'QR labels';
  if (!q.data) return <Screen><Stack.Screen options={{ title }} />{q.error ? <ErrorBanner message={q.error} onRetry={q.reload} /> : <Loading />}</Screen>;

  return (
    <Screen
      refreshing={q.refreshing}
      onRefresh={q.refresh}
      footer={items.length ? (
        <Row gap={space.sm}>
          <Button style={{ flex: 1 }} icon="print-outline" title="Print" loading={busy === 'print'} onPress={print} />
          {Platform.OS !== 'web' ? <Button style={{ flex: 1 }} kind="secondary" icon="share-outline" title="Share PDF" loading={busy === 'share'} onPress={share} /> : null}
        </Row>
      ) : undefined}
    >
      <Stack.Screen options={{ title }} />
      <T variant="muted" style={{ marginBottom: space.md }}>
        Stick a label on each piece of equipment. Anyone on your team can scan it with Flight Ready to see its history, check it out, or report a problem.
      </T>
      {items.length === 0 ? <EmptyState icon="qr-code-outline" title="No equipment to label" /> : null}
      <Row gap={space.md} style={{ flexWrap: 'wrap', justifyContent: 'center' }}>
        {items.map((e) => (
          <Card key={e.id} style={{ alignItems: 'center', width: 220, backgroundColor: '#FFFFFF' }}>
            <QRCode value={equipmentQrUrl(e.qr_token)} size={150} color="#000000" backgroundColor="#FFFFFF" ecl="M" />
            <View style={{ marginTop: space.md, alignItems: 'center' }}>
              <T style={{ color: '#000', fontWeight: '700', textAlign: 'center' }}>{e.name}</T>
              {e.serial_number ? <T variant="small" style={{ color: '#333' }}>{`S/N ${e.serial_number}`}</T> : null}
              {e.assigned_label ? <T variant="small" style={{ color: '#333' }}>{e.assigned_label}</T> : null}
            </View>
          </Card>
        ))}
      </Row>
    </Screen>
  );
}

import { useLocalSearchParams } from 'expo-router';
import { ResolveToken } from '../../../../components/equipment/ResolveToken';

/** /equipment/qr/<token>: resolves a QR label token and opens the equipment. */
export default function EquipmentByQr() {
  const { token } = useLocalSearchParams<{ token: string }>();
  return <ResolveToken token={token ?? ''} />;
}

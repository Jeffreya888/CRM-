import { router, Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { Button, EmptyState, Loading, Screen } from '../ui';
import { friendlyError, supabase } from '../../lib/supabase';

/** Looks up an equipment QR token and replaces the route with that equipment's page. */
export function ResolveToken({ token }: { token: string }) {
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    (async () => {
      const { data, error: e } = await supabase.rpc('equipment_by_qr', { p_token: token });
      if (!alive) return;
      if (e) setError(friendlyError(e.message));
      else if (!data) setError('This label isn’t in your company’s equipment. It may belong to another company, or the item was deleted.');
      else router.replace({ pathname: '/equipment/[id]', params: { id: data as string, from: 'qr' } });
    })();
    return () => { alive = false; };
  }, [token]);
  return (
    <Screen>
      <Stack.Screen options={{ title: 'Equipment label' }} />
      {error ? (
        <EmptyState icon="qr-code-outline" title="Label not found" body={error}
          action={<Button title="Scan again" icon="scan-outline" onPress={() => router.replace({ pathname: '/scan', params: { mode: 'equipment' } })} />} />
      ) : <Loading />}
    </Screen>
  );
}

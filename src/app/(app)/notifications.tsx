import * as Notifications from 'expo-notifications';
import { Stack } from 'expo-router';
import * as Linking from 'expo-linking';
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { notify } from '../../components/FormSheet';
import { Button, Card, ErrorBanner, IconTile, Row, Screen, T, ToggleRow } from '../../components/ui';
import { registerForPush } from '../../lib/notifications';
import { canSeeMoney } from '../../lib/plans';
import { useOrg } from '../../lib/session';
import { supabase } from '../../lib/supabase';
import { space } from '../../lib/theme';
import type { NotificationPrefs } from '../../lib/types';

const DEFAULTS: Required<NotificationPrefs> = { job_assignments: true, service_reminders: true, payments: true, quote_accepted: true };

export default function NotificationSettings() {
  const { profile, session, role, refresh } = useOrg();
  const [prefs, setPrefs] = useState<Required<NotificationPrefs>>({ ...DEFAULTS, ...(profile?.notification_prefs ?? {}) });
  const [permission, setPermission] = useState<'granted' | 'denied' | 'undetermined' | 'unsupported'>(Platform.OS === 'web' ? 'unsupported' : 'undetermined');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    Notifications.getPermissionsAsync().then((p) => setPermission(p.granted ? 'granted' : p.canAskAgain ? 'undetermined' : 'denied'));
  }, []);

  const toggle = (k: keyof NotificationPrefs) => async (v: boolean) => {
    const next = { ...prefs, [k]: v };
    setPrefs(next);
    const { error } = await supabase.from('profiles').update({ notification_prefs: next }).eq('id', session!.user.id);
    if (error) setError(error.message);
    else refresh();
  };

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Notifications' }} />
      <ErrorBanner message={error} />
      <Card>
        <Row gap={space.md}>
          <IconTile icon="notifications-outline" tone={permission === 'granted' ? 'success' : 'warning'} />
          <T style={{ flex: 1 }}>
            {permission === 'granted' ? 'Push notifications are on for this device.'
              : permission === 'unsupported' ? 'Push notifications work in the iPhone and Android app.'
              : permission === 'denied' ? 'Notifications are turned off in your phone settings.'
              : 'Turn on notifications to get job and reminder alerts.'}
          </T>
        </Row>
        {permission === 'undetermined' ? (
          <Button style={{ marginTop: space.md }} title="Turn on notifications" onPress={async () => {
            await registerForPush(session!.user.id);
            const p = await Notifications.getPermissionsAsync();
            setPermission(p.granted ? 'granted' : 'denied');
          }} />
        ) : null}
        {permission === 'denied' ? <Button style={{ marginTop: space.md }} kind="secondary" title="Open phone settings" onPress={() => Linking.openSettings().catch(() => notify('Open Settings → Notifications'))} /> : null}
      </Card>
      <Card>
        <ToggleRow label="Job assignments" hint="The evening before a job you're assigned to" value={prefs.job_assignments} onChange={toggle('job_assignments')} />
        <ToggleRow label="Service reminders due" hint="When a customer's recurring service comes due" value={prefs.service_reminders} onChange={toggle('service_reminders')} />
        {canSeeMoney(role) ? <ToggleRow label="Payments received" hint="When a customer pays an invoice online" value={prefs.payments} onChange={toggle('payments')} /> : null}
      </Card>
    </Screen>
  );
}

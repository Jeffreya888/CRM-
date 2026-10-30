import * as Linking from 'expo-linking';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, View } from 'react-native';
import { DEMO_TITLE } from '../../lib/demo';
import { date, titleCase } from '../../lib/format';
import { registerForPush } from '../../lib/notifications';
import { canSeeMoney, isOwner } from '../../lib/plans';
import { currentPushToken, pushDisabledHere, removeThisDevicePush, setPushDisabledHere } from '../../lib/security';
import { useOrg } from '../../lib/session';
import { callFunction, friendlyError, supabase } from '../../lib/supabase';
import { colors, space } from '../../lib/theme';
import type { NotificationPrefs } from '../../lib/types';
import { confirmAction, notify } from '../FormSheet';
import { Badge, Button, Card, Divider, IconTile, ListRow, Row, Section, T, ToggleRow } from '../ui';

const DEFAULT_PREFS: Required<NotificationPrefs> = { job_assignments: true, service_reminders: true, payments: true, quote_accepted: true, private_lock_screen: true };

type PushState = 'loading' | 'on' | 'off' | 'denied' | 'unsupported';

async function readPushState(userId: string): Promise<PushState> {
  if (Platform.OS === 'web') return 'unsupported';
  const perm = await Notifications.getPermissionsAsync();
  if (!perm.granted) return perm.canAskAgain ? 'off' : 'denied';
  if (await pushDisabledHere()) return 'off';
  const token = await currentPushToken();
  if (!token) return 'unsupported';
  const { data } = await supabase.from('push_tokens').select('token').eq('token', token).eq('user_id', userId).maybeSingle();
  return data ? 'on' : 'off';
}

/** 7. Push on this phone + notification types + private lock screen. */
export function PushSection() {
  const { profile, session, role, refresh } = useOrg();
  const uid = session!.user.id;
  const [prefs, setPrefs] = useState<Required<NotificationPrefs>>({ ...DEFAULT_PREFS, ...(profile?.notification_prefs ?? {}) });
  const [state, setState] = useState<PushState>('loading');

  useEffect(() => {
    let alive = true;
    readPushState(uid).then((s) => { if (alive) setState(s); }).catch(() => { if (alive) setState('unsupported'); });
    return () => { alive = false; };
  }, [uid]);

  const toggle = (k: keyof NotificationPrefs) => async (v: boolean) => {
    const next = { ...prefs, [k]: v };
    setPrefs(next);
    const { error } = await supabase.from('profiles').update({ notification_prefs: next }).eq('id', uid);
    if (error) {
      setPrefs(prefs);
      notify('Could not save', error.message);
    } else refresh();
  };

  const setDevice = async (on: boolean) => {
    if (on) {
      await setPushDisabledHere(false);
      await registerForPush(uid).catch(() => {});
    } else {
      await removeThisDevicePush(uid);
    }
    setState(await readPushState(uid));
  };

  return (
    <Section title="Notifications" icon="notifications-outline">
      <Card>
        <Row gap={space.md} style={{ marginBottom: space.md }}>
          <IconTile icon="phone-portrait-outline" tone={state === 'on' ? 'success' : 'warning'} />
          <View style={{ flex: 1 }}>
            <T>Push on this phone</T>
            <T variant="small">
              {state === 'loading' ? 'Checking…'
                : state === 'on' ? 'This phone gets job and reminder alerts.'
                : state === 'denied' ? 'Notifications are turned off for Tarmo in your phone settings.'
                : state === 'unsupported' ? 'Push notifications work in the iPhone and Android app.'
                : 'This phone won’t get alerts. Your other devices are not affected.'}
            </T>
          </View>
          {state === 'loading' ? <ActivityIndicator color={colors.primary} /> : null}
        </Row>
        {state === 'on' || state === 'off' ? (
          <ToggleRow label="Send notifications to this phone" value={state === 'on'} onChange={setDevice} />
        ) : null}
        {state === 'denied' ? (
          <Button kind="secondary" title="Open phone settings" onPress={() => Linking.openSettings().catch(() => notify('Open Settings → Notifications → Tarmo'))} />
        ) : null}
        <Divider />
        <T variant="overline" style={{ marginBottom: space.md }}>Notify me about</T>
        <ToggleRow label="Job assignments" hint="The evening before a job you’re assigned to" value={prefs.job_assignments} onChange={toggle('job_assignments')} />
        <ToggleRow label="Service reminders due" hint="When a customer’s recurring service comes due" value={prefs.service_reminders} onChange={toggle('service_reminders')} />
        {canSeeMoney(role) ? <ToggleRow label="Payments received" hint="When a customer pays an invoice online" value={prefs.payments} onChange={toggle('payments')} /> : null}
        <Divider />
        <ToggleRow label="Private lock screen" hint="Notifications won't show customer names or amounts." value={prefs.private_lock_screen} onChange={toggle('private_lock_screen')} />
      </Card>
    </Section>
  );
}

/** 9. My companies: switch / leave. */
export function CompaniesSection() {
  const { memberships, org, switchOrg, refresh } = useOrg();
  if (!memberships.length) return null;

  const leave = (orgId: string, name: string) =>
    confirmAction(`Leave ${name}?`, 'You’ll lose access to this company. Your open jobs there will be unassigned. An admin can invite you again later.', async () => {
      const { error } = await supabase.rpc('leave_company', { p_org: orgId });
      if (error) return notify('Could not leave', friendlyError(error.message));
      await refresh();
    }, true);

  return (
    <Section title="My companies" icon="business-outline" count={String(memberships.length)}>
      <Card>
        {memberships.map((m) => {
          const current = m.org_id === org.id;
          const name = m.organization?.name ?? 'Company';
          return (
            <ListRow
              key={m.id}
              icon="business-outline"
              tone={current ? 'success' : 'primary'}
              title={name}
              subtitle={titleCase(m.role)}
              right={
                <Row gap={space.xs}>
                  {current ? <Badge label="Current" tone="success" raw /> : <Button small kind="secondary" title="Switch" onPress={async () => { await switchOrg(m.org_id); router.replace('/'); }} />}
                  {m.role !== 'owner' ? <Button small kind="ghost" title="Leave" onPress={() => leave(m.org_id, name)} /> : null}
                </Row>
              }
            />
          );
        })}
        <T variant="small" style={{ marginTop: space.sm }}>Owners can’t leave their own company. Transfer ownership in Team first.</T>
      </Card>
    </Section>
  );
}

/** 10. Owner data export + delete account + sign out. */
export function DataSection() {
  const { org, orgId, role, signOut } = useOrg();
  const owner = isOwner(role);

  const exportData = async () => {
    try {
      const { url } = await callFunction<{ url: string }>('export-data', { org_id: orgId });
      if (!url) throw new Error('The export did not return a download link.');
      if (Platform.OS === 'web') window.open(url, '_blank');
      else await WebBrowser.openBrowserAsync(url);
    } catch (e: any) {
      notify('Export failed', friendlyError(e.message));
    }
  };

  const deleteAccount = () =>
    confirmAction(
      'Delete your account?',
      owner
        ? `This permanently deletes your login AND ${org.name} with all customers, jobs, photos and invoices (unless another owner exists). Active App Store subscriptions must be cancelled separately in Settings → Apple ID → Subscriptions.`
        : 'This permanently deletes your login and removes you from the team.',
      async () => {
        const { error } = await supabase.rpc('delete_my_account');
        if (error) return notify('Could not delete', friendlyError(error.message));
        await signOut();
      },
      true,
    );

  return (
    <>
      {owner ? (
        <Section title="Export your data" icon="download-outline">
          <Card>
            <T>Download everything in {org.name} as one ZIP file: spreadsheets (CSV) of customers, assets, jobs, quotes, invoices, payments, expenses and time entries, a list of your PDFs, and your job photos.</T>
            <T variant="small" style={{ marginTop: space.xs }}>Large companies can take a minute. The download link expires after a while for security.</T>
            <Button style={{ marginTop: space.md }} icon="archive-outline" title="Export all data (ZIP)" onPress={exportData} />
          </Card>
        </Section>
      ) : null}
      <Section title="Account" icon="person-outline">
        <Card>
          <ListRow icon="log-out-outline" title="Sign out" subtitle="Sign out of this device" onPress={signOut} />
          <ListRow icon="trash-outline" tone="danger" title="Delete account" subtitle={owner ? 'Deletes your login and your company' : 'Deletes your login'} onPress={deleteAccount} />
        </Card>
      </Section>
    </>
  );
}

/** Shown instead of security settings in the demo workspace. */
export function DemoStatusCard() {
  const { org, signOut } = useOrg();
  return (
    <Card style={{ borderColor: colors.warning }}>
      <Row gap={space.md}>
        <IconTile icon="sparkles" tone="warning" />
        <View style={{ flex: 1 }}>
          <T variant="h3">{DEMO_TITLE}</T>
          <T variant="muted">Private sample company · expires {org.demo_expires_at ? date(org.demo_expires_at) : 'soon'}.</T>
        </View>
      </Row>
      <T style={{ marginTop: space.md }}>You’re exploring with a temporary demo login. Emails, texts and payments are not really sent. Password, email, two-step sign-in, push, data export and account deletion are turned off in the demo.</T>
      <T variant="small" style={{ marginTop: space.sm }}>Everything here is deleted automatically when the demo expires.</T>
      <Button style={{ marginTop: space.md }} icon="person-add-outline" title="Create my real account" onPress={async () => {
        await signOut();
        setTimeout(() => router.replace('/sign-up'), 50);
      }} />
      <Button style={{ marginTop: space.sm }} kind="ghost" title="Exit demo" onPress={signOut} />
    </Card>
  );
}

import type { Factor } from '@supabase/supabase-js';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, View } from 'react-native';
import { relative } from '../../lib/format';
import { canAdmin } from '../../lib/plans';
import { currentSessionId, describeUserAgent, LOCK_AFTER_OPTIONS, useAppLock, type LockAfter } from '../../lib/security';
import { useOrg } from '../../lib/session';
import { friendlyError, supabase } from '../../lib/supabase';
import { colors, space } from '../../lib/theme';
import { useQuery } from '../../lib/useQuery';
import { confirmAction, notify } from '../FormSheet';
import { Badge, Button, Card, Divider, EmptyState, ErrorBanner, ListRow, Row, Section, Segmented, T, ToggleRow } from '../ui';
import { biometricsReady, unlockWithBiometrics } from './AppLockGate';
import { useAal } from './TwoFactorGate';
import { TotpEnroll } from './TotpSetup';

/** 3. Face ID / fingerprint app lock (this device only). */
export function AppLockSection() {
  const { loaded, enabled, after, load, save } = useAppLock();
  const [ready, setReady] = useState<{ ok: boolean; reason?: string; label: string } | null>(null);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    let alive = true;
    biometricsReady().then((r) => { if (alive) setReady(r); }).catch(() => { if (alive) setReady({ ok: false, reason: 'App lock is not available on this device.', label: 'Face ID / fingerprint' }); });
    return () => { alive = false; };
  }, []);

  const label = ready?.label ?? 'Face ID / fingerprint';
  return (
    <Section title="App lock" icon="finger-print-outline">
      <Card>
        {!loaded || !ready ? <ActivityIndicator color={colors.primary} /> : !ready.ok ? (
          <T variant="muted">{ready.reason}</T>
        ) : (
          <>
            <ToggleRow
              label={`Lock with ${label}`}
              hint="Ask for Face ID, fingerprint or your phone passcode to open Tarmo on this device."
              value={enabled}
              onChange={async (v) => {
                // Confirm it works before turning it on, so nobody locks themselves out.
                if (v && !(await unlockWithBiometrics(`Turn on ${label} lock`))) return;
                await save({ enabled: v });
              }}
            />
            {enabled ? (
              <>
                <T style={{ marginBottom: space.sm }}>Lock after I’ve been away</T>
                <Segmented value={String(after) as `${LockAfter}`} options={LOCK_AFTER_OPTIONS} onChange={(v) => save({ after: Number(v) as LockAfter })} />
              </>
            ) : null}
          </>
        )}
      </Card>
    </Section>
  );
}

/** 4. Two-step sign-in with an authenticator app; owners/admins can require it. */
export function TwoStepSection() {
  const { org, orgId, role, refresh } = useOrg();
  const aal = useAal();
  const [enrolling, setEnrolling] = useState(false);
  const q = useQuery(async () => {
    const { data, error } = await supabase.auth.mfa.listFactors();
    if (error) throw new Error(error.message);
    return (data?.totp ?? []) as Factor[];
  }, []);
  const factors = q.data ?? [];
  const has = factors.length > 0;

  const remove = (f: Factor) =>
    confirmAction(
      'Turn off two-step sign-in?',
      org.require_2fa ? 'Your company requires two-step sign-in, so you’ll be asked to set it up again.' : 'You’ll only need your password to sign in.',
      async () => {
        const { error } = await supabase.auth.mfa.unenroll({ factorId: f.id });
        if (error) return notify('Could not turn off', error.message.includes('aal2') ? 'Sign out and back in with your code, then try again.' : error.message);
        await supabase.auth.refreshSession().catch(() => {});
        q.reload();
      },
      true,
    );

  const setRequired = async (v: boolean) => {
    if (v && (!has || aal.level !== 'aal2')) {
      return notify('Set it up for yourself first', 'Turn on two-step sign-in for your own account before requiring it for the team.');
    }
    const { error } = await supabase.from('organizations').update({ require_2fa: v }).eq('id', orgId);
    if (error) return notify('Could not save', friendlyError(error.message));
    await refresh();
  };

  return (
    <Section title="Two-step sign-in" icon="shield-checkmark-outline">
      <Card>
        <ErrorBanner message={q.error} onRetry={q.reload} />
        {q.loading ? <ActivityIndicator color={colors.primary} /> : enrolling ? (
          <TotpEnroll onDone={() => { setEnrolling(false); q.reload(); notify('Two-step sign-in is on', 'Next time you sign in we’ll ask for a code from your authenticator app.'); }} onCancel={() => { setEnrolling(false); q.reload(); }} />
        ) : (
          <>
            <Row style={{ justifyContent: 'space-between', marginBottom: space.md }}>
              <View style={{ flex: 1 }}>
                <T>{has ? 'On' : 'Off'}</T>
                <T variant="small">After your password, enter a 6-digit code from an authenticator app. Stops anyone who learns your password.</T>
              </View>
              <Badge label={has ? 'On' : 'Off'} tone={has ? 'success' : 'neutral'} />
            </Row>
            {factors.map((f) => (
              <ListRow key={f.id} icon="phone-portrait-outline" tone="success" title={f.friendly_name || 'Authenticator app'} subtitle={`Added ${relative(f.created_at)}`}
                right={<Button small kind="ghost" title="Remove" onPress={() => remove(f)} />} />
            ))}
            {!has ? <Button icon="qr-code-outline" title="Set up authenticator app" onPress={() => setEnrolling(true)} /> : null}
          </>
        )}
        {canAdmin(role) ? (
          <>
            <Divider />
            <ToggleRow
              label="Require two-step sign-in for the whole team"
              hint="Everyone must set up an authenticator app before they can open the company."
              value={!!org.require_2fa}
              onChange={setRequired}
            />
          </>
        ) : org.require_2fa ? (
          <T variant="small" style={{ marginTop: space.md }}>Your company requires two-step sign-in.</T>
        ) : null}
      </Card>
    </Section>
  );
}

interface SessionRow { id: string; created_at: string; updated_at: string | null; user_agent: string | null; ip: string | null; aal: string | null }

/** 5. Signed-in devices: list, sign out one, sign out everywhere else. */
export function DevicesSection() {
  const { session } = useOrg();
  const current = currentSessionId(session);
  const q = useQuery(async () => {
    const { data, error } = await supabase.rpc('my_sessions');
    if (error) throw new Error(error.message);
    return (data ?? []) as SessionRow[];
  }, []);
  const rows = q.data ?? [];
  const others = rows.filter((r) => r.id !== current);

  const deviceIcon = (ua: string | null) => {
    const d = describeUserAgent(ua);
    return /iphone|android|ipad/i.test(d) ? 'phone-portrait-outline' as const : 'desktop-outline' as const;
  };

  return (
    <Section title="Signed-in devices" icon="phone-portrait-outline" count={rows.length ? String(rows.length) : undefined}>
      <Card>
        <ErrorBanner message={q.error} onRetry={q.reload} />
        {q.loading ? <ActivityIndicator color={colors.primary} /> : rows.length === 0 ? (
          <EmptyState icon="phone-portrait-outline" title="No sessions found" />
        ) : rows.map((r) => {
          const isMe = r.id === current;
          return (
            <ListRow
              key={r.id}
              icon={deviceIcon(r.user_agent)}
              tone={isMe ? 'success' : 'primary'}
              title={isMe && Platform.OS !== 'web' ? 'This device' : describeUserAgent(r.user_agent)}
              subtitle={`${isMe ? 'Active now' : `Last active ${relative(r.updated_at ?? r.created_at)}`}${r.ip ? ` · ${r.ip}` : ''}`}
              meta={`Signed in ${relative(r.created_at)}${r.aal === 'aal2' ? ' · two-step verified' : ''}`}
              right={isMe ? <Badge label="This device" tone="success" raw /> : (
                <Button small kind="ghost" title="Sign out" onPress={() => confirmAction('Sign out this device?', 'It will need to sign in again within about an hour, or right away when it next refreshes.', async () => {
                  const { error } = await supabase.rpc('revoke_session', { p_session: r.id });
                  if (error) return notify('Could not sign out', error.message);
                  q.reload();
                })} />
              )}
            />
          );
        })}
        {others.length ? (
          <Button style={{ marginTop: space.md }} kind="secondary" icon="log-out-outline" title="Sign out everywhere else" onPress={() =>
            confirmAction('Sign out all other devices?', 'Every phone, tablet and browser except this one will be signed out.', async () => {
              const { data, error } = await supabase.rpc('revoke_other_sessions', { p_keep: current });
              if (error) return notify('Could not sign out', error.message);
              notify('Done', `Signed out ${data ?? 0} other session${data === 1 ? '' : 's'}.`);
              q.reload();
            })} />
        ) : null}
        <T variant="small" style={{ marginTop: space.sm }}>We email you when your account signs in on a new device.</T>
      </Card>
    </Section>
  );
}

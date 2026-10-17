import * as Linking from 'expo-linking';
import { useEffect, useState } from 'react';
import { Image, Platform, Pressable, View } from 'react-native';
import { pickImage, signedUrls } from '../../lib/files';
import { initials } from '../../lib/format';
import { passwordProblem, PASSWORD_MAX, PASSWORD_MIN, uploadAvatar } from '../../lib/security';
import { useOrg } from '../../lib/session';
import { friendlyError, supabase } from '../../lib/supabase';
import { colors, space } from '../../lib/theme';
import { FormSheet, notify } from '../FormSheet';
import { Avatar, Badge, Button, Card, Divider, ErrorBanner, Field, Ionicons, KeyValue, Row, Section, T } from '../ui';
import { linkAppleId, useAppleAvailable } from './AppleSignIn';

function useAvatarUrl(path: string | null | undefined, version: number) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!path) return;
    let alive = true;
    signedUrls([path]).then((m) => { if (alive) setUrl(m[path] ? `${m[path]}${m[path]!.includes('?') ? '&' : '?'}v=${version}` : null); }).catch(() => {});
    return () => { alive = false; };
  }, [path, version]);
  return path ? url : null;
}

/** 1. Profile: name, photo, phone, login email. */
export function ProfileSection() {
  const { profile, session, orgId, refresh } = useOrg();
  const [editing, setEditing] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);
  const [version, setVersion] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const avatar = useAvatarUrl(profile?.avatar_url, version);
  const uid = session!.user.id;
  const pendingEmail = session?.user.new_email;
  const name = profile?.full_name || session?.user.email || 'You';

  const changePhoto = async (source: 'camera' | 'library') => {
    setError(null);
    try {
      const uri = await pickImage(source);
      if (!uri) return;
      setBusy(true);
      await uploadAvatar(orgId, uid, uri);
      setVersion((v) => v + 1);
      await refresh();
    } catch (e: any) {
      setError(friendlyError(e.message));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Section title="Profile" icon="person-circle-outline">
      <Card>
        <ErrorBanner message={error} />
        <Row gap={space.lg}>
          <Pressable onPress={() => changePhoto('library')} accessibilityLabel="Change photo">
            {avatar ? (
              <Image source={{ uri: avatar }} style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: colors.cardRaised }} />
            ) : (
              <Avatar label={initials(name)} size={72} />
            )}
            <View style={{ position: 'absolute', right: -2, bottom: -2, backgroundColor: colors.primary, borderRadius: 12, padding: 4 }}>
              <Ionicons name="camera" size={14} color={colors.white} />
            </View>
          </Pressable>
          <View style={{ flex: 1 }}>
            <T variant="h3">{name}</T>
            <T variant="muted">{session?.user.email}</T>
            {profile?.phone ? <T variant="small">{profile.phone}</T> : null}
          </View>
        </Row>
        <Row style={{ marginTop: space.md, flexWrap: 'wrap' }}>
          <Button small kind="secondary" icon="images-outline" title={busy ? 'Uploading…' : 'Choose photo'} disabled={busy} onPress={() => changePhoto('library')} />
          {Platform.OS !== 'web' ? <Button small kind="secondary" icon="camera-outline" title="Take photo" disabled={busy} onPress={() => changePhoto('camera')} /> : null}
          <Button small kind="secondary" icon="create-outline" title="Edit name & phone" onPress={() => setEditing(true)} />
        </Row>
        <Divider />
        <KeyValue label="Login email" value={session?.user.email ?? '—'} />
        {pendingEmail ? (
          <T variant="small" style={{ color: colors.warning, marginBottom: space.sm }}>
            Waiting for confirmation: we sent a link to {pendingEmail}. Your login changes after you open it.
          </T>
        ) : null}
        <Button small kind="ghost" icon="mail-outline" title="Change email" onPress={() => setEmailOpen(true)} />
      </Card>

      <FormSheet
        visible={editing}
        title="Your profile"
        initial={{ full_name: profile?.full_name ?? '', phone: profile?.phone ?? '' }}
        fields={[
          { key: 'full_name', label: 'Your name', type: 'text', required: true },
          { key: 'phone', label: 'Mobile phone', type: 'phone', hint: 'Shown to your team on jobs and the schedule' },
        ]}
        onClose={() => setEditing(false)}
        onSubmit={async (v) => {
          const { error } = await supabase.from('profiles').update({ full_name: v.full_name, phone: v.phone }).eq('id', uid);
          if (error) throw new Error(error.message);
          await supabase.rpc('set_my_display_name', { p_name: v.full_name });
          await supabase.auth.updateUser({ data: { full_name: v.full_name } }).catch(() => {});
          await refresh();
        }}
      />
      <FormSheet
        visible={emailOpen}
        title="Change email"
        initial={{ email: '' }}
        fields={[{ key: 'email', label: 'New email address', type: 'email', required: true, hint: 'We’ll send a confirmation link to the new address. Your login stays the same until you open it.' }]}
        onClose={() => setEmailOpen(false)}
        onSubmit={async (v) => {
          const email = String(v.email).toLowerCase();
          if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error('Enter a valid email address.');
          if (email === session?.user.email?.toLowerCase()) throw new Error('That is already your login email.');
          const { error } = await supabase.auth.updateUser({ email }, { emailRedirectTo: Linking.createURL('/account') });
          if (error) throw new Error(error.message);
          notify('Check your new inbox', `We sent a confirmation link to ${email}. Open it to finish the change. You may also get a notice at your current address.`);
        }}
      />
    </Section>
  );
}

/** 2. Change password + reset email. */
export function PasswordSection() {
  const { session } = useOrg();
  const [open, setOpen] = useState(false);
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [error, setError] = useState<string | null>(null);
  const email = session?.user.email ?? '';

  const save = async () => {
    setError(null);
    const p = passwordProblem(pw);
    if (p) return setError(p);
    if (pw !== pw2) return setError('The two passwords don’t match.');
    const { error } = await supabase.auth.updateUser({ password: pw });
    if (error) {
      if (/reauth|recent/i.test(error.message)) return setError('For security, use “Email me a reset link” below to change your password.');
      return setError(error.message);
    }
    setPw(''); setPw2(''); setOpen(false);
    notify('Password changed', 'Use your new password next time you sign in.');
  };

  const sendReset = async () => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: Linking.createURL('/') });
    if (error) notify('Could not send', error.message);
    else notify('Reset link sent', `Check ${email} for a link to choose a new password.`);
  };

  return (
    <Section title="Password" icon="key-outline">
      <Card>
        {open ? (
          <>
            <ErrorBanner message={error} />
            <Field label="New password" value={pw} onChangeText={setPw} secureTextEntry maxLength={PASSWORD_MAX} hint={`${PASSWORD_MIN}–${PASSWORD_MAX} characters`} textContentType="newPassword" autoComplete="new-password" />
            <Field label="Repeat new password" value={pw2} onChangeText={setPw2} secureTextEntry maxLength={PASSWORD_MAX} textContentType="newPassword" onSubmitEditing={save} />
            <Row>
              <Button style={{ flex: 1 }} kind="ghost" title="Cancel" onPress={() => { setOpen(false); setError(null); }} />
              <Button style={{ flex: 1 }} title="Save password" onPress={save} disabled={!pw || !pw2} />
            </Row>
          </>
        ) : (
          <Button kind="secondary" icon="lock-closed-outline" title="Change password" onPress={() => setOpen(true)} />
        )}
        <Button style={{ marginTop: space.sm }} kind="ghost" icon="mail-outline" title="Email me a reset link" onPress={sendReset} disabled={!email} />
        <T variant="small" style={{ textAlign: 'center' }}>Forgot your current password? The reset link lets you pick a new one.</T>
      </Card>
    </Section>
  );
}

/** 8. Sign in with Apple status / linking. */
export function AppleSection() {
  const { session } = useOrg();
  const available = useAppleAvailable();
  const [linkedNow, setLinkedNow] = useState(false);
  const linked = linkedNow || !!session?.user.identities?.some((i) => i.provider === 'apple');
  if (!linked && !available) return null;
  return (
    <Section title="Sign in with Apple" icon="logo-apple">
      <Card>
        <Row style={{ justifyContent: 'space-between' }}>
          <View style={{ flex: 1 }}>
            <T>{linked ? 'Apple ID linked' : 'Apple ID not linked'}</T>
            <T variant="small">{linked ? 'You can sign in with Apple on any iPhone or iPad.' : 'Link your Apple ID to sign in with Face ID instead of a password.'}</T>
          </View>
          {linked ? <Badge label="Linked" tone="success" /> : null}
        </Row>
        {!linked ? (
          <Button style={{ marginTop: space.md }} kind="secondary" icon="logo-apple" title="Link Apple ID" onPress={async () => {
            try {
              if (await linkAppleId()) setLinkedNow(true);
            } catch (e: any) {
              notify('Could not link Apple ID', e.message);
            }
          }} />
        ) : null}
      </Card>
    </Section>
  );
}

import * as Clipboard from 'expo-clipboard';
import { useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, ScrollView, Share, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { notify } from '../FormSheet';
import { Button, Card, ErrorBanner, Field, Ionicons, Row, Select, T } from '../ui';
import { APP_NAME, PORTAL_URL } from '../../lib/config';
import { date } from '../../lib/format';
import { callFunction, friendlyError, supabase } from '../../lib/supabase';
import { colors, space } from '../../lib/theme';
import { INVITE_ROLES } from './constants';

export const inviteLink = (token: string) => (PORTAL_URL ? `${PORTAL_URL}/invite/${token}` : null);

type Result = { id: string; code: string; token: string; expires_at: string; email: string; emailed: boolean; emailError: string | null };

/** Invite by email: creates the invitation, emails it, then shows the link + code to share. */
export function InviteSheet({ visible, onClose, orgId, orgName, canInviteAdmin, onInvited }: {
  visible: boolean; onClose: () => void; orgId: string; orgName: string; canInviteAdmin: boolean; onInvited: () => void;
}) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<string>('technician');
  const [error, setError] = useState<string | null>(null);
  const [unverified, setUnverified] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [was, setWas] = useState(visible);
  if (visible !== was) {
    setWas(visible);
    if (visible) { setEmail(''); setRole('technician'); setError(null); setUnverified(false); setResult(null); }
  }

  const send = async () => {
    setError(null); setUnverified(false);
    const { data, error: err } = await supabase.rpc('invite_member', { p_org: orgId, p_email: email.trim(), p_role: role });
    if (err) {
      if (err.message.includes('EMAIL_UNVERIFIED')) setUnverified(true);
      setError(friendlyError(err.message));
      return;
    }
    const inv = data as { id: string; code: string; token: string; expires_at: string };
    let emailed = false; let emailError: string | null = null;
    try { await callFunction('send-invite', { invitation_id: inv.id }); emailed = true; } catch (e: any) { emailError = friendlyError(e.message); }
    setResult({ ...inv, email: email.trim().toLowerCase(), emailed, emailError });
    onInvited();
  };

  const link = result ? inviteLink(result.token) : null;
  const shareText = result ? `You're invited to join ${orgName} on ${APP_NAME}.${link ? `\n\nOpen this link to accept: ${link}` : ''}\n\nOr sign up with ${result.email} in the app and enter invite code: ${result.code}\n\nThe invitation expires ${date(result.expires_at)}.` : '';

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
          <Row style={{ padding: space.lg, justifyContent: 'space-between' }}>
            <Button small kind="ghost" title={result ? 'Done' : 'Cancel'} onPress={onClose} />
            <T variant="h3">Invite a team member</T>
            <View style={{ width: 60 }} />
          </Row>
          <ScrollView contentContainerStyle={{ padding: space.lg, paddingBottom: 64 }} keyboardShouldPersistTaps="handled">
            {!result ? (
              <>
                <ErrorBanner message={error} />
                {unverified ? (
                  <Card>
                    <T style={{ fontWeight: '700' }}>Verify your email first</T>
                    <T variant="muted" style={{ marginTop: 4 }}>To protect your company, you need to confirm your own login email before inviting staff. Open the confirmation email we sent you (check spam), or go to Account &amp; security to resend it.</T>
                  </Card>
                ) : null}
                <Field label="Email *" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} placeholder="name@company.com" icon="mail-outline" />
                <Select label="Role" value={role} onChange={(v) => v && setRole(v)} inline
                  options={INVITE_ROLES.filter((r) => canInviteAdmin || r.value !== 'admin').map((r) => ({ value: r.value, label: r.label, hint: r.hint }))} />
                <T variant="small" style={{ marginBottom: space.lg }}>They get an email with a link and a code. Invitations expire after 7 days; inviting the same email again cancels the old one.</T>
                <Button icon="send-outline" title="Send invitation" disabled={!email.trim()} onPress={send} />
              </>
            ) : (
              <>
                <Card>
                  <Row>
                    <Ionicons name={result.emailed ? 'checkmark-circle' : 'alert-circle'} size={22} color={result.emailed ? colors.success : colors.warning} />
                    <T style={{ flex: 1, fontWeight: '700' }}>{result.emailed ? `Invitation emailed to ${result.email}` : 'Invitation created'}</T>
                  </Row>
                  {result.emailError ? <T variant="small" style={{ marginTop: 4 }}>We couldn&apos;t send the email ({result.emailError}). Share the link or code below instead.</T> : null}
                  <T variant="small" style={{ marginTop: 4 }}>Expires {date(result.expires_at)}.</T>
                </Card>
                {link ? (
                  <Card>
                    <T variant="muted">Invite link</T>
                    <T style={{ marginVertical: 4 }}>{link}</T>
                    <Button small kind="secondary" icon="copy-outline" title="Copy link" onPress={async () => { await Clipboard.setStringAsync(link); notify('Link copied'); }} />
                  </Card>
                ) : null}
                <Card>
                  <T variant="muted">Invite code</T>
                  <T style={{ fontSize: 28, fontWeight: '800', letterSpacing: 3, marginVertical: 4 }}>{result.code}</T>
                  <Button small kind="secondary" icon="copy-outline" title="Copy code" onPress={async () => { await Clipboard.setStringAsync(result.code); notify('Code copied'); }} />
                </Card>
                <Button icon="share-outline" title="Share invitation" onPress={async () => { try { await Share.share({ message: shareText }); } catch {} }} />
              </>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

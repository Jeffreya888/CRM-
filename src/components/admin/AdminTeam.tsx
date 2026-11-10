// Platform admin → Activity (who did what) and Team (owners and support staff). Owners only.
import { useState } from 'react';
import { View } from 'react-native';
import { confirmAction, notify } from '../FormSheet';
import { Badge, Button, Card, ErrorBanner, Field, IconButton, Loading, Row, Section, Segmented, T } from '../ui';
import { relative, titleCase } from '../../lib/format';
import { friendlyError, must, supabase } from '../../lib/supabase';
import { colors, space } from '../../lib/theme';
import { useQuery } from '../../lib/useQuery';

type Entry = { id: number; actor: string; action: string; company: string | null; details: Record<string, unknown>; at: string };

const ACTIONS: Record<string, string> = {
  trial_extended: 'Extended a trial', plan_comped: 'Gave free time on a plan', error_marked_fixed: 'Marked an error fixed', error_reopened: 'Reopened an error',
  admin_team_set: 'Changed the admin team', admin_team_removed: 'Removed someone from the admin team', texting_status_set: 'Changed texting status',
  integration_status_set: 'Updated an integration request', support_message_handled: 'Handled a support message', enterprise_settings_set: 'Changed Enterprise settings',
  franchise_billing_set: 'Set franchise billing', franchise_quote_sent: 'Sent a franchise quote', franchise_invoice_billing_started: 'Started franchise invoice billing',
  announcement_posted: 'Posted an announcement', announcement_ended: 'Ended an announcement',
};

const detailText = (d: Record<string, unknown>) =>
  Object.entries(d).filter(([, v]) => v !== null && v !== '' && typeof v !== 'object').map(([k, v]) => `${k.replace(/_/g, ' ')}: ${v}`).join(' · ');

export function ActivityLog() {
  const q = useQuery(async () => (await must(supabase.rpc('platform_activity', { p_limit: 300 }))) as Entry[], []);
  return (
    <>
      <T variant="muted" style={{ marginBottom: space.sm }}>Every admin action, newest first: who did it, for which company, and when.</T>
      <ErrorBanner message={q.error} onRetry={q.reload} />
      {q.loading ? <Loading /> : (q.data ?? []).length === 0 ? <Card><T variant="muted">No admin actions yet.</T></Card> : (
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          {(q.data ?? []).map((e, i) => (
            <View key={e.id} style={{ padding: space.md, borderTopWidth: i ? 1 : 0, borderTopColor: colors.border }}>
              <Row style={{ justifyContent: 'space-between' }} gap={space.sm}>
                <T style={{ fontWeight: '700', flex: 1 }}>{ACTIONS[e.action] ?? titleCase(e.action.replace(/_/g, ' '))}</T>
                <T variant="small">{relative(e.at)}</T>
              </Row>
              <T variant="small">{e.actor}{e.company ? ` · ${e.company}` : ''}</T>
              {detailText(e.details) ? <T variant="small" style={{ color: colors.textFaint }}>{detailText(e.details)}</T> : null}
            </View>
          ))}
        </Card>
      )}
    </>
  );
}

type Member = { user_id: string; email: string; role: 'owner' | 'support'; added_at: string; last_sign_in: string | null; me: boolean };

export function AdminTeam() {
  const q = useQuery(async () => (await must(supabase.rpc('platform_team'))) as Member[], []);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'support' | 'owner'>('support');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async (fn: () => Promise<unknown>, done: string) => {
    setBusy(true);
    setError(null);
    try { await fn(); await q.reload(); notify('Done', done); } catch (e: any) { setError(friendlyError(e.message)); } finally { setBusy(false); }
  };
  return (
    <>
      <Section title="Who can open Platform admin" icon="people-outline">
        {q.loading ? <Loading /> : (
          <Card style={{ padding: 0, overflow: 'hidden' }}>
            {(q.data ?? []).map((m, i) => (
              <Row key={m.user_id} style={{ padding: space.md, borderTopWidth: i ? 1 : 0, borderTopColor: colors.border, alignItems: 'center' }} gap={space.sm}>
                <View style={{ flex: 1 }}>
                  <T style={{ fontWeight: '600' }}>{m.email}{m.me ? ' (you)' : ''}</T>
                  <T variant="small">Added {relative(m.added_at)} · last signed in {m.last_sign_in ? relative(m.last_sign_in) : 'never'}</T>
                </View>
                <Badge label={m.role === 'owner' ? 'Owner' : 'Support'} tone={m.role === 'owner' ? 'primary' : 'info'} raw />
                {!m.me ? (
                  <IconButton icon="trash-outline" color={colors.textMuted} label={`Remove ${m.email}`}
                    onPress={() => confirmAction(`Remove ${m.email}?`, 'They lose access to Platform admin right away.', () =>
                      run(() => must(supabase.rpc('platform_remove_admin', { p_user: m.user_id })), `${m.email} removed.`))} />
                ) : null}
              </Row>
            ))}
          </Card>
        )}
      </Section>
      <Section title="Add someone" icon="person-add-outline">
        <Card>
          <T variant="muted" style={{ marginBottom: space.md }}>
            Support can answer support messages, look up companies, see who needs attention, work on errors and extend trials. They can&apos;t see
            revenue or the investor update, give free time, or change billing, limits, franchise settings, announcements or this team.
            They need a Tarmo account first.
          </T>
          <Field label="Their Tarmo account email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />
          <Segmented value={role} onChange={setRole} options={[{ value: 'support', label: 'Support' }, { value: 'owner', label: 'Owner (full access)' }]} />
          <ErrorBanner message={error ?? q.error} />
          <Button icon="person-add-outline" title={`Add as ${role === 'owner' ? 'owner' : 'support'}`} loading={busy} disabled={!/^\S+@\S+\.\S+$/.test(email.trim())}
            onPress={() => run(() => must(supabase.rpc('platform_set_admin', { p_email: email.trim(), p_role: role })), `${email.trim()} can now open Platform admin.`).then(() => setEmail(''))} />
        </Card>
      </Section>
    </>
  );
}

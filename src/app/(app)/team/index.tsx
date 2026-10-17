import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { confirmAction, notify } from '../../../components/FormSheet';
import { Certifications } from '../../../components/team/Certifications';
import { daysUntil, EXPIRING_DAYS, roleLabel } from '../../../components/team/constants';
import { InviteSheet } from '../../../components/team/InviteSheet';
import { RolePermissions } from '../../../components/team/RolePermissions';
import { Avatar, Badge, Button, Card, ErrorBanner, IconButton, ListRow, Loading, Row, Screen, Section, Segmented, T } from '../../../components/ui';
import { date, initials, relative } from '../../../lib/format';
import { canAdmin, isManager, isOwner, planFor, seatLimit } from '../../../lib/plans';
import { useOrg } from '../../../lib/session';
import { callFunction, friendlyError, must, supabase } from '../../../lib/supabase';
import { colors, radius, space } from '../../../lib/theme';
import type { Membership } from '../../../lib/types';
import { useQuery } from '../../../lib/useQuery';

type Invite = { id: string; email: string; role: string; code: string; token: string; expires_at: string; created_at: string; sent_at: string | null };
type Tab = 'members' | 'roles' | 'documents';

export default function Team() {
  const { org, orgId, role, plan, session, refresh } = useOrg();
  const admin = canAdmin(role);
  const owner = isOwner(role);
  const [tab, setTab] = useState<Tab>('members');
  const [invite, setInvite] = useState(false);
  const [showInactive, setShowInactive] = useState(false);

  const q = useQuery(async () => {
    const soon = new Date(Date.now() + EXPIRING_DAYS * 864e5).toISOString().slice(0, 10);
    const [m, i, c] = await Promise.all([
      must(supabase.from('memberships').select('*').eq('org_id', orgId).order('created_at')),
      admin ? must(supabase.from('invitations').select('*').eq('org_id', orgId).is('accepted_at', null).is('revoked_at', null).order('created_at', { ascending: false })) : Promise.resolve([]),
      must(supabase.from('certifications').select('user_id, expires_on').eq('org_id', orgId).not('user_id', 'is', null).lte('expires_on', soon)),
    ]);
    return { members: (m ?? []) as Membership[], invites: (i ?? []) as Invite[], expiring: (c ?? []) as { user_id: string; expires_on: string }[] };
  }, [orgId, admin]);

  const members = q.data?.members ?? [];
  const active = members.filter((m) => m.active);
  const inactive = members.filter((m) => !m.active);
  const limit = seatLimit(plan);
  const full = Number.isFinite(limit) && active.length >= limit;
  const pct = Number.isFinite(limit) && limit > 0 ? Math.min(1, active.length / limit) : 0.15;
  const nextPlan = plan === 'solo' ? planFor('team') : planFor('integrations');

  const resend = async (i: Invite) => {
    try {
      const expired = new Date(i.expires_at) < new Date();
      let id = i.id;
      if (expired) {
        const r = await must(supabase.rpc('invite_member', { p_org: orgId, p_email: i.email, p_role: i.role }));
        id = (r as any).id;
      }
      await callFunction('send-invite', { invitation_id: id });
      q.reload();
      notify('Invitation sent', `We emailed ${i.email} again${expired ? ' with a fresh 7-day link' : ''}.`);
    } catch (e: any) { notify('Could not resend', friendlyError(e.message)); }
  };
  const revoke = (i: Invite) => confirmAction('Cancel this invitation?', `The link and code ${i.code} will stop working.`, async () => {
    try { await must(supabase.rpc('revoke_invitation', { p_invitation: i.id })); q.reload(); } catch (e: any) { notify('Could not cancel', friendlyError(e.message)); }
  }, true);

  const certFlags = (uid: string) => {
    const mine = (q.data?.expiring ?? []).filter((c) => c.user_id === uid);
    if (!mine.length) return null;
    const expired = mine.some((c) => (daysUntil(c.expires_on) ?? 1) < 0);
    return <Badge raw label={expired ? 'Cert expired' : 'Cert expiring'} tone={expired ? 'danger' : 'warning'} />;
  };

  return (
    <Screen refreshing={q.refreshing} onRefresh={q.refresh}>
      <Stack.Screen options={{ title: 'Team roles & access' }} />
      <ErrorBanner message={q.error} onRetry={q.reload} />
      <Card>
        <Row style={{ justifyContent: 'space-between' }}>
          <T variant="muted">Seats</T>
          {admin ? <IconButton icon="pulse-outline" label="Activity log" onPress={() => router.push('/activity')} /> : null}
        </Row>
        <T variant="h2">{Number.isFinite(limit) ? `${active.length} of ${limit} seats used` : `${active.length} seat${active.length === 1 ? '' : 's'} used · unlimited`}</T>
        <View style={{ height: 8, borderRadius: radius.pill, backgroundColor: colors.bg, marginVertical: space.sm }}>
          <View style={{ height: 8, borderRadius: radius.pill, width: `${pct * 100}%`, backgroundColor: full ? colors.warning : colors.primary }} />
        </View>
        {full ? (
          <View style={{ marginTop: space.sm }}>
            <T variant="muted">{plan === 'solo' ? 'The Solo plan is for one person.' : 'All seats are in use.'} Upgrade to {nextPlan.name} to add more people, or deactivate someone to free a seat.</T>
            {owner ? <Button style={{ marginTop: space.sm }} icon="rocket-outline" title="See plans" onPress={() => router.push('/paywall')} /> : null}
          </View>
        ) : admin ? <Button style={{ marginTop: space.sm }} icon="person-add-outline" title="Invite team member" onPress={() => setInvite(true)} /> : null}
      </Card>

      <Segmented value={tab} onChange={setTab} options={[
        { value: 'members', label: 'Members', count: active.length },
        { value: 'roles', label: 'Roles & permissions' },
        { value: 'documents', label: 'Company documents' },
      ]} />

      {!q.data ? (q.error ? null : <Loading />) : tab === 'members' ? (
        <>
          <Card style={{ padding: 0, overflow: 'hidden' }}>
            {active.map((m) => (
              <ListRow key={m.id} left={<Avatar label={initials(m.display_name)} color={m.color ?? colors.primary} />}
                title={(m.display_name ?? 'Team member') + (m.user_id === session!.user.id ? ' (you)' : '')}
                subtitle={[roleLabel(m.role), m.skills?.length ? m.skills.slice(0, 3).join(', ') + (m.skills.length > 3 ? '…' : '') : null].filter(Boolean).join(' · ')}
                right={<Row gap={6}>{certFlags(m.user_id)}<T variant="muted">›</T></Row>}
                onPress={() => router.push(`/team/${m.user_id}`)} />
            ))}
          </Card>

          {admin && q.data.invites.length ? (
            <Section title="Pending invitations" count={`${q.data.invites.length}`}>
              <Card style={{ padding: 0, overflow: 'hidden' }}>
                {q.data.invites.map((i) => {
                  const expired = new Date(i.expires_at) < new Date();
                  return (
                    <View key={i.id} style={{ padding: space.lg, borderBottomWidth: 1, borderBottomColor: colors.border }}>
                      <Row style={{ justifyContent: 'space-between' }}>
                        <T style={{ fontWeight: '600', flex: 1 }} numberOfLines={1}>{i.email}</T>
                        {expired ? <Badge raw label="Expired" tone="danger" /> : <Badge raw label={`Expires ${date(i.expires_at)}`} tone="info" />}
                      </Row>
                      <T variant="muted">{roleLabel(i.role)} · code {i.code} · invited {relative(i.created_at)}{i.sent_at ? ` · emailed ${relative(i.sent_at)}` : ''}</T>
                      <Row style={{ marginTop: space.sm }}>
                        <Button small kind="secondary" icon="send-outline" title="Resend" onPress={() => resend(i)} />
                        <Button small kind="ghost" icon="close-circle-outline" title="Revoke" onPress={() => revoke(i)} />
                      </Row>
                    </View>
                  );
                })}
              </Card>
            </Section>
          ) : null}

          {inactive.length ? (
            <Section title="Deactivated" action={<Button small kind="ghost" title={showInactive ? 'Hide' : `Show (${inactive.length})`} onPress={() => setShowInactive((s) => !s)} />}>
              {showInactive ? (
                <Card style={{ padding: 0, overflow: 'hidden' }}>
                  {inactive.map((m) => (
                    <ListRow key={m.id} left={<Avatar label={initials(m.display_name)} />} title={m.display_name ?? 'Former member'}
                      subtitle={`${roleLabel(m.role)}${m.deactivated_at ? ` · deactivated ${date(m.deactivated_at)}` : ''}`}
                      right={<Badge label="inactive" />} onPress={admin ? () => router.push(`/team/${m.user_id}`) : undefined} />
                  ))}
                </Card>
              ) : <T variant="small">History is kept; deactivated people don&apos;t use a seat.</T>}
            </Section>
          ) : null}
        </>
      ) : tab === 'roles' ? (
        <RolePermissions orgId={orgId} current={org.role_permissions} isOwner={owner} onSaved={refresh} />
      ) : (
        <>
          <T variant="muted" style={{ marginBottom: space.md }}>Certificates of insurance, registrations and licenses for the whole company. Facilities can require them.</T>
          <Certifications orgId={orgId} userId={null} canEdit={isManager(role)} />
        </>
      )}

      <InviteSheet visible={invite} onClose={() => setInvite(false)} orgId={orgId} orgName={org.name} canInviteAdmin={owner} onInvited={q.reload} />
    </Screen>
  );
}

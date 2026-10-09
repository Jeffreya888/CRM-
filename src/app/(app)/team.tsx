import { Stack } from 'expo-router';
import { useState } from 'react';
import { Share } from 'react-native';
import { confirmAction, FormSheet, notify } from '../../components/FormSheet';
import { Gate } from '../../components/Gate';
import { Avatar, Badge, Button, Card, ErrorBanner, ListRow, Screen, Section, T } from '../../components/ui';
import { APP_NAME } from '../../lib/config';
import { initials, money, relative, titleCase } from '../../lib/format';
import { canAdmin, PLANS } from '../../lib/plans';
import { useOrg } from '../../lib/session';
import { friendlyError, supabase } from '../../lib/supabase';
import { colors, space } from '../../lib/theme';
import { useQuery } from '../../lib/useQuery';

const ROLES = [
  { value: 'admin', label: 'Admin', hint: 'Everything, including billing and team' },
  { value: 'manager', label: 'Manager', hint: 'Quotes, invoices, pricing, reports, scheduling' },
  { value: 'technician', label: 'Technician', hint: 'Assigned jobs, checklists, photos, time clock. No pricing.' },
  { value: 'viewer', label: 'Viewer', hint: 'Read-only' },
];
const COLORS = ['#2563EB', '#16A34A', '#D97706', '#DC2626', '#7C3AED', '#0891B2', '#DB2777', '#4B5563'];

export default function Team() {
  const { org, orgId, role, plan, session } = useOrg();
  const admin = canAdmin(role);
  const [invite, setInvite] = useState(false);
  const [edit, setEdit] = useState<any>(null);
  const q = useQuery(async () => {
    const [m, i] = await Promise.all([
      supabase.from('memberships').select('*').eq('org_id', orgId).order('created_at'),
      admin ? supabase.from('invitations').select('*').eq('org_id', orgId).is('accepted_at', null).order('created_at', { ascending: false }) : Promise.resolve({ data: [] }),
    ]);
    if (m.error) throw m.error;
    return { members: m.data ?? [], invites: (i.data ?? []) as any[] };
  }, [orgId]);
  const seats = PLANS.find((p) => p.id === plan)?.seats ?? (plan === 'trial' ? 10 : 0);
  const active = (q.data?.members ?? []).filter((m: any) => m.active).length;

  return (
    <Gate feature="team">
      <Screen refreshing={q.refreshing} onRefresh={q.refresh}>
        <Stack.Screen options={{ title: 'Team' }} />
        <ErrorBanner message={q.error} />
        <Card>
          <T variant="muted">Seats used</T>
          <T variant="h2">{active} / {seats === Infinity ? '∞' : seats}</T>
          {admin ? <Button style={{ marginTop: space.sm }} icon="person-add-outline" title="Invite team member" onPress={() => setInvite(true)} /> : null}
        </Card>
        <Section title="Members">
          <Card style={{ padding: 0, overflow: 'hidden' }}>
            {(q.data?.members ?? []).map((m: any) => (
              <ListRow key={m.id} left={<Avatar label={initials(m.display_name)} color={m.color ?? colors.primary} />}
                title={(m.display_name ?? 'Member') + (m.user_id === session!.user.id ? ' (you)' : '')}
                subtitle={titleCase(m.role)} meta={m.hourly_rate && admin ? `${money(m.hourly_rate)}/hr` : null}
                right={!m.active ? <Badge label="inactive" tone="neutral" /> : undefined}
                onPress={admin && m.role !== 'owner' ? () => setEdit(m) : undefined} />
            ))}
          </Card>
        </Section>
        {admin && q.data?.invites.length ? (
          <Section title="Pending invites">
            <Card style={{ padding: 0, overflow: 'hidden' }}>
              {q.data.invites.map((i: any) => (
                <ListRow key={i.id} icon="mail-outline" title={i.email} subtitle={`${titleCase(i.role)} · code ${i.code}`} meta={`Sent ${relative(i.created_at)}`}
                  onPress={() => confirmAction('Revoke invite?', `Code ${i.code} will stop working.`, async () => { await supabase.from('invitations').delete().eq('id', i.id); q.reload(); }, true)} />
              ))}
            </Card>
          </Section>
        ) : null}

        <FormSheet visible={invite} title="Invite" initial={{ role: 'technician' }} onClose={() => setInvite(false)}
          fields={[{ key: 'email', label: 'Email', type: 'email', required: true }, { key: 'role', label: 'Role', type: 'select', options: ROLES }]}
          onSubmit={async (v) => {
            const { data: code, error } = await supabase.rpc('invite_member', { p_org: orgId, p_email: v.email, p_role: v.role });
            if (error) throw new Error(friendlyError(error.message));
            q.reload();
            const msg = `You're invited to join ${org.name} on ${APP_NAME}. Download the app, create an account with ${v.email}, then enter invite code: ${code}`;
            try { await Share.share({ message: msg }); } catch { notify('Invite code', String(code)); }
          }} />
        <FormSheet visible={!!edit} title={edit?.display_name ?? 'Member'} initial={edit ? { ...edit, hourly_rate: edit.hourly_rate ?? '' } : {}} onClose={() => setEdit(null)}
          fields={[
            { key: 'display_name', label: 'Display name', type: 'text' },
            { key: 'role', label: 'Role', type: 'select', options: ROLES },
            { key: 'hourly_rate', label: 'Hourly pay rate ($)', type: 'money', hint: 'Used for labor cost on time sheets' },
            { key: 'color', label: 'Calendar color', type: 'select', options: COLORS.map((c, n) => ({ value: c, label: `Color ${n + 1}`, hint: c })) },
            { key: 'active', label: 'Active (inactive members cannot sign in to this company)', type: 'toggle' },
          ]}
          onSubmit={async (v) => {
            const { error } = await supabase.from('memberships').update(v).eq('id', edit.id);
            if (error) throw error;
            q.reload();
          }}
          onDelete={async () => { const { error } = await supabase.from('memberships').delete().eq('id', edit.id); if (error) throw error; q.reload(); }} />
      </Screen>
    </Gate>
  );
}

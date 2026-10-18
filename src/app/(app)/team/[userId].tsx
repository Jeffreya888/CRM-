import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { confirmAction, notify } from '../../../components/FormSheet';
import { MemberSops } from '../../../components/guides/MemberSops';
import { ActivityFeed } from '../../../components/team/ActivityFeed';
import { Certifications } from '../../../components/team/Certifications';
import { INVITE_ROLES, MEMBER_COLORS, PAY_TYPES, roleLabel, SKILLS } from '../../../components/team/constants';
import { ReassignSheet, type ReassignChoice } from '../../../components/team/ReassignSheet';
import {
  Avatar, Badge, Button, Card, EmptyState, ErrorBanner, Field, KeyValue, ListRow, Loading, Row, Screen, Section, Select, T,
} from '../../../components/ui';
import { date, initials, money } from '../../../lib/format';
import { useLookups } from '../../../lib/lookups';
import { canAdmin, isManager, isOwner } from '../../../lib/plans';
import { useOrg } from '../../../lib/session';
import { friendlyError, must, supabase } from '../../../lib/supabase';
import { colors, radius, space } from '../../../lib/theme';
import type { MemberPay, Membership, Profile, Role } from '../../../lib/types';
import { useQuery } from '../../../lib/useQuery';

type Pending = { kind: 'role'; role: Role } | { kind: 'deactivate' } | null;

export default function MemberProfile() {
  const { userId } = useLocalSearchParams<{ userId: string }>();
  const { orgId, role, session, can, refresh, businessTypes } = useOrg();
  const admin = canAdmin(role);
  const owner = isOwner(role);
  const self = session?.user.id === userId;
  const { members, branchOptions } = useLookups();

  const q = useQuery(async () => {
    const [m, p, pay] = await Promise.all([
      must(supabase.from('memberships').select('*').eq('org_id', orgId).eq('user_id', userId).maybeSingle()),
      must(supabase.from('profiles').select('id, full_name, phone, avatar_url').eq('id', userId).maybeSingle()),
      admin || self ? must(supabase.from('member_pay').select('*').eq('org_id', orgId).eq('user_id', userId).maybeSingle()) : Promise.resolve(null),
    ]);
    return { m: m as Membership | null, profile: p as Pick<Profile, 'id' | 'full_name' | 'phone' | 'avatar_url'> | null, pay: pay as MemberPay | null };
  }, [orgId, userId, admin]);

  const [pending, setPending] = useState<Pending>(null);
  const [error, setError] = useState<string | null>(null);
  const m = q.data?.m;

  if (!q.data) return <Screen><Stack.Screen options={{ title: 'Team member' }} />{q.error ? <ErrorBanner message={q.error} onRetry={q.reload} /> : <Loading />}</Screen>;
  if (!m) return <Screen><Stack.Screen options={{ title: 'Team member' }} /><EmptyState icon="person-outline" title="Not found" body="This person isn't on your team." /></Screen>;

  const editable = admin;
  const others = members.filter((x) => x.user_id !== userId);
  const canManageThis = admin && m.role !== 'owner' && !self;

  const updateMembership = async (patch: Partial<Membership>) => {
    setError(null);
    try { await must(supabase.from('memberships').update(patch).eq('id', m.id)); q.reload(); if (self) refresh(); } catch (e: any) { setError(friendlyError(e.message)); }
  };

  const doPending = async (c: ReassignChoice) => {
    if (!pending) return;
    const to = c.kind === 'member' ? c.userId : null;
    if (pending.kind === 'deactivate') {
      await must(supabase.rpc('update_member', { p_org: orgId, p_user: userId, p_role: null, p_active: false, p_reassign_to: to }));
    } else {
      // The server hands work off automatically only when someone becomes a viewer; otherwise do it here if asked.
      if (c.kind !== 'keep' && pending.role !== 'viewer') await must(supabase.rpc('reassign_member_work', { p_org: orgId, p_from: userId, p_to: to }));
      await must(supabase.rpc('update_member', { p_org: orgId, p_user: userId, p_role: pending.role, p_active: null, p_reassign_to: to }));
    }
    q.reload();
  };

  const reactivate = async () => {
    try { await must(supabase.rpc('update_member', { p_org: orgId, p_user: userId, p_role: null, p_active: true, p_reassign_to: null })); q.reload(); }
    catch (e: any) { notify('Could not reactivate', friendlyError(e.message)); }
  };
  const transfer = () => confirmAction('Transfer ownership?',
    `${m.display_name ?? 'This person'} becomes the owner (subscription, billing and deleting the company). You become an admin. This can only be undone by the new owner.`,
    async () => {
      try { await must(supabase.rpc('transfer_ownership', { p_org: orgId, p_user: userId })); await refresh(); q.reload(); notify('Ownership transferred'); }
      catch (e: any) { notify('Could not transfer', friendlyError(e.message)); }
    });

  return (
    <Screen refreshing={q.refreshing} onRefresh={q.refresh}>
      <Stack.Screen options={{ title: m.display_name ?? 'Team member' }} />
      <ErrorBanner message={error} />
      <Card>
        <Row gap={space.md}>
          <Avatar label={initials(m.display_name)} color={m.color ?? colors.primary} size={56} />
          <View style={{ flex: 1 }}>
            <T variant="h3">{m.display_name ?? 'Team member'}{self ? ' (you)' : ''}</T>
            <Row gap={6} style={{ marginTop: 4 }}>
              <Badge label={roleLabel(m.role)} raw tone={m.role === 'owner' ? 'purple' : 'primary'} />
              {!m.active ? <Badge raw label={`Deactivated${m.deactivated_at ? ' ' + date(m.deactivated_at) : ''}`} /> : null}
            </Row>
          </View>
        </Row>
      </Card>

      <Section title="Profile" icon="person-outline">
        <Card>
          <ProfileEditor m={m} phone={q.data.profile?.phone ?? null} fullName={q.data.profile?.full_name ?? null} editable={editable} self={self} userId={userId}
            onSaveMembership={updateMembership} onPhoneSaved={q.reload} />
        </Card>
      </Section>

      {admin ? (
        <Section title="Pay" icon="cash-outline">
          <Card><PayEditor orgId={orgId} userId={userId} pay={q.data.pay} onSaved={q.reload} /></Card>
        </Section>
      ) : self && q.data.pay?.hourly_rate != null ? (
        <Section title="Pay" icon="cash-outline"><Card><KeyValue label="Hourly rate" value={`${money(q.data.pay.hourly_rate)}/h`} /></Card></Section>
      ) : null}

      {can('branches') ? (
        <Section title="Default company location" icon="business-outline">
          <Select value={m.default_branch_id} options={branchOptions} onChange={(v) => updateMembership({ default_branch_id: v })} allowClear placeholder="No default" disabled={!editable} />
        </Section>
      ) : null}

      <Section title="Skills" icon="sparkles-outline">
        <SkillsEditor skills={m.skills ?? []} editable={editable} onSave={(skills) => updateMembership({ skills })} />
      </Section>

      {m.role !== 'viewer' ? (
        <Section title="Certified for" icon="book-outline" iconColor={colors.success}>
          <MemberSops orgId={orgId} userId={userId} manager={isManager(role)} businessTypes={businessTypes} />
        </Section>
      ) : null}

      <Section title="Certifications" icon="ribbon-outline">
        <Certifications orgId={orgId} userId={userId} canEdit={isManager(role)} />
      </Section>

      <Section title="Schedule">
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          <ListRow icon="calendar-outline" title="Working hours & time off" subtitle="Set in Crew scheduling" onPress={() => router.push('/scheduling')} />
          <ListRow icon="time-outline" title="Timesheets" subtitle="Hours and approvals" onPress={() => router.push('/timesheets')} />
        </Card>
      </Section>

      {canManageThis ? (
        <Section title="Role & access" icon="key-outline">
          <Card>
            {m.active ? (
              <>
                <Select label="Role" value={m.role} inline
                  options={INVITE_ROLES.filter((r) => owner || r.value !== 'admin' || m.role === 'admin').map((r) => ({ value: r.value, label: r.label, hint: r.hint }))}
                  onChange={(v) => { if (v && v !== m.role) setPending({ kind: 'role', role: v as Role }); }} />
                <Button kind="danger" icon="person-remove-outline" title="Deactivate" onPress={() => setPending({ kind: 'deactivate' })} />
                <T variant="small" style={{ marginTop: space.sm }}>Deactivating keeps their history (jobs, time, photos) and frees their seat. They can no longer sign in to this company.</T>
              </>
            ) : (
              <>
                <T variant="muted">This person is deactivated. Their history is kept.</T>
                <Button style={{ marginTop: space.md }} icon="person-add-outline" title="Reactivate" onPress={reactivate} />
              </>
            )}
          </Card>
          {owner && m.active ? <Button kind="ghost" icon="swap-horizontal-outline" title="Transfer ownership to this person" onPress={transfer} /> : null}
        </Section>
      ) : null}

      {admin ? (
        <Section title="Activity" icon="pulse-outline">
          <ActivityFeed orgId={orgId} actor={userId} />
        </Section>
      ) : null}

      <ReassignSheet visible={!!pending} onClose={() => setPending(null)} people={others}
        title={pending?.kind === 'deactivate' ? 'Deactivate' : 'Change role'}
        body={pending?.kind === 'deactivate'
          ? `${m.display_name ?? 'This person'} will lose access to this company. Their history is kept and their seat is freed.`
          : `Change ${m.display_name ?? 'this person'} from ${roleLabel(m.role)} to ${roleLabel(pending?.kind === 'role' ? pending.role : null)}.`}
        allowKeep={pending?.kind === 'role' && pending.role !== 'viewer'}
        confirmLabel={pending?.kind === 'deactivate' ? 'Deactivate' : 'Change role'} danger={pending?.kind === 'deactivate'}
        onConfirm={doPending} />
    </Screen>
  );
}

function ProfileEditor({ m, phone, fullName, editable, self, userId, onSaveMembership, onPhoneSaved }: {
  m: Membership; phone: string | null; fullName: string | null; editable: boolean; self: boolean; userId: string;
  onSaveMembership: (p: Partial<Membership>) => Promise<void>; onPhoneSaved: () => void;
}) {
  const [name, setName] = useState(m.display_name ?? '');
  const [ph, setPh] = useState(phone ?? '');
  const [err, setErr] = useState<string | null>(null);
  return (
    <View>
      <ErrorBanner message={err} />
      {editable ? (
        <Row style={{ alignItems: 'flex-end' }}>
          <Field style={{ flex: 1, marginBottom: space.md }} label="Display name" value={name} onChangeText={setName} />
          {name !== (m.display_name ?? '') ? <Button small title="Save" style={{ marginBottom: space.md }} onPress={() => onSaveMembership({ display_name: name.trim() || null })} /> : null}
        </Row>
      ) : <KeyValue label="Name" value={m.display_name ?? fullName ?? '—'} />}
      {self ? (
        <Row style={{ alignItems: 'flex-end' }}>
          <Field style={{ flex: 1, marginBottom: space.md }} label="Phone" value={ph} onChangeText={setPh} keyboardType="phone-pad" />
          {ph !== (phone ?? '') ? <Button small title="Save" style={{ marginBottom: space.md }} onPress={async () => {
            try { await must(supabase.from('profiles').update({ phone: ph.trim() || null }).eq('id', userId)); onPhoneSaved(); } catch (e: any) { setErr(friendlyError(e.message)); }
          }} /> : null}
        </Row>
      ) : <KeyValue label="Phone" value={phone ?? 'Not shared'} />}
      <T style={{ fontWeight: '600', marginBottom: space.sm }}>Calendar color</T>
      <Row style={{ flexWrap: 'wrap' }} gap={10}>
        {MEMBER_COLORS.map((c) => (
          <Pressable key={c} disabled={!editable} onPress={() => onSaveMembership({ color: c })} accessibilityLabel={`Color ${c}`}
            style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: c, borderWidth: 3, borderColor: m.color === c ? colors.white : 'transparent', opacity: editable || m.color === c ? 1 : 0.4 }} />
        ))}
      </Row>
    </View>
  );
}

function PayEditor({ orgId, userId, pay, onSaved }: { orgId: string; userId: string; pay: MemberPay | null; onSaved: () => void }) {
  const [rate, setRate] = useState(pay?.hourly_rate != null ? String(pay.hourly_rate) : '');
  const [type, setType] = useState<string>(pay?.pay_type ?? 'hourly');
  const [ot, setOt] = useState(String(pay?.overtime_multiplier ?? 1.5));
  const [err, setErr] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const save = async () => {
    setErr(null); setSaved(false);
    const r = rate.trim() === '' ? null : Number(rate);
    const o = Number(ot);
    if (r != null && (Number.isNaN(r) || r < 0)) return setErr('Enter a valid hourly rate');
    if (Number.isNaN(o) || o < 1) return setErr('Overtime multiplier must be 1 or more');
    try {
      await must(supabase.from('member_pay').upsert({ org_id: orgId, user_id: userId, hourly_rate: r, pay_type: type, overtime_multiplier: o, updated_at: new Date().toISOString() }, { onConflict: 'org_id,user_id' }));
      setSaved(true); onSaved();
    } catch (e: any) { setErr(friendlyError(e.message)); }
  };
  return (
    <View>
      <ErrorBanner message={err} />
      <T variant="small" style={{ marginBottom: space.md }}>Private to owners and admins. Used for labor cost on jobs, timesheets and profit &amp; loss.</T>
      <Select label="Pay type" value={type} options={PAY_TYPES} onChange={(v) => v && setType(v)} inline />
      <Row gap={space.md}>
        <Field style={{ flex: 1 }} label={type === 'hourly' ? 'Hourly rate ($)' : 'Cost per hour for job costing ($)'} value={rate} onChangeText={setRate} keyboardType="decimal-pad" placeholder="e.g. 28" />
        <Field style={{ flex: 1 }} label="Overtime ×" value={ot} onChangeText={setOt} keyboardType="decimal-pad" />
      </Row>
      <Row>
        <Button small title="Save pay" onPress={save} />
        {saved ? <T variant="small" style={{ color: colors.success }}>Saved</T> : null}
      </Row>
    </View>
  );
}

function SkillsEditor({ skills, editable, onSave }: { skills: string[]; editable: boolean; onSave: (s: string[]) => Promise<void> }) {
  const [custom, setCustom] = useState('');
  const all = [...new Set([...SKILLS, ...skills])];
  const toggle = (s: string) => onSave(skills.includes(s) ? skills.filter((x) => x !== s) : [...skills, s]);
  if (!editable && !skills.length) return <T variant="muted">No skills listed yet.</T>;
  return (
    <View>
      <Row style={{ flexWrap: 'wrap' }} gap={8}>
        {(editable ? all : skills).map((s) => {
          const on = skills.includes(s);
          return (
            <Pressable key={s} disabled={!editable} onPress={() => toggle(s)}
              style={{ paddingVertical: 7, paddingHorizontal: 14, borderRadius: radius.pill, borderWidth: 1, borderColor: on ? colors.primary : colors.borderStrong, backgroundColor: on ? colors.primary : 'transparent' }}>
              <T variant="muted" style={{ color: on ? colors.white : colors.textMuted }}>{s}</T>
            </Pressable>
          );
        })}
      </Row>
      {editable ? (
        <Row style={{ marginTop: space.md, alignItems: 'flex-end' }}>
          <Field style={{ flex: 1, marginBottom: 0 }} placeholder="Add another skill" value={custom} onChangeText={setCustom} autoCapitalize="none" />
          <Button small kind="secondary" title="Add" disabled={!custom.trim()} onPress={async () => { const s = custom.trim().toLowerCase(); if (!skills.includes(s)) await onSave([...skills, s]); setCustom(''); }} />
        </Row>
      ) : null}
      {editable ? <T variant="small" style={{ marginTop: space.sm }}>The scheduler suggests people with matching skills first.</T> : null}
    </View>
  );
}

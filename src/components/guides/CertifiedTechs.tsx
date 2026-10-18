import { useState } from 'react';
import { View } from 'react-native';
import { relative } from '../../lib/format';
import { SKILL_LEVELS, skillLabel, type SkillLevel } from '../../lib/guides';
import { friendlyError, supabase } from '../../lib/supabase';
import { colors, space } from '../../lib/theme';
import type { ServiceSkill } from '../../lib/types';
import { useQuery } from '../../lib/useQuery';
import { confirmAction, notify } from '../FormSheet';
import { Badge, Button, Card, Divider, Row, Section, Segmented, Select, T } from '../ui';

const tone = (l: string) => (l === 'trainer' ? 'purple' : l === 'certified' ? 'success' : 'warning') as 'purple' | 'success' | 'warning';

/** Sets (or with null removes) a person's level on an SOP. Returns true on success. */
export async function setSkill(orgId: string, userId: string, guideKey: string, level: SkillLevel | null): Promise<boolean> {
  const { error } = await supabase.rpc('set_skill', { p_org: orgId, p_user: userId, p_guide_key: guideKey, p_level: level });
  if (error) { notify('Could not save', friendlyError(error.message)); return false; }
  return true;
}

/**
 * "Certified technicians" on an SOP (service_skills). Techs can ask for a sign-off;
 * managers certify, make trainers, remove, or add anyone on the team.
 */
export function CertifiedTechs({ orgId, guideKey, uid, manager, canRequest }: {
  orgId: string; guideKey: string; uid: string; manager: boolean; canRequest: boolean;
}) {
  const [addUser, setAddUser] = useState<string | null>(null);
  const [addLevel, setAddLevel] = useState<SkillLevel>('certified');

  const q = useQuery(async () => {
    const [s, m] = await Promise.all([
      supabase.from('service_skills').select('*').eq('org_id', orgId).eq('guide_key', guideKey),
      supabase.from('memberships').select('user_id, display_name, role, active').eq('org_id', orgId).eq('active', true),
    ]);
    if (s.error) throw s.error;
    return { skills: (s.data ?? []) as ServiceSkill[], members: (m.data ?? []) as { user_id: string; display_name: string | null; role: string }[] };
  }, [orgId, guideKey]);

  const skills = q.data?.skills ?? [];
  const members = q.data?.members ?? [];
  const name = (u: string | null) => members.find((m) => m.user_id === u)?.display_name ?? 'Team member';
  const mine = skills.find((s) => s.user_id === uid);
  const order: Record<string, number> = { trainer: 0, certified: 1, training: 2 };
  const rows = [...skills].sort((a, b) => (order[a.level] ?? 3) - (order[b.level] ?? 3) || name(a.user_id).localeCompare(name(b.user_id)));
  const addable = members.filter((m) => m.role !== 'viewer' && !skills.some((s) => s.user_id === m.user_id));

  const change = async (u: string, level: SkillLevel | null) => { if (await setSkill(orgId, u, guideKey, level)) q.reload(); };
  const request = async () => {
    const { error } = await supabase.rpc('request_skill_signoff', { p_org: orgId, p_guide_key: guideKey });
    if (error) return notify('Could not send request', friendlyError(error.message));
    notify('Request sent', 'Your manager will be asked to sign you off on this SOP.');
    q.reload();
  };

  const certifiedMine = mine && (mine.level === 'certified' || mine.level === 'trainer');
  const requested = !!mine?.requested_at && !certifiedMine;

  return (
    <Section title="Certified technicians" icon="ribbon-outline" iconColor={colors.success} count={skills.length ? String(skills.filter((s) => s.level !== 'training').length) : undefined}>
      <Card>
        {q.error ? <T variant="small" style={{ color: colors.danger }}>{q.error}</T> : null}
        {!q.loading && !rows.length ? <T variant="muted">No one is certified on this SOP yet.</T> : null}
        {rows.map((s, i) => (
          <View key={s.user_id}>
            {i ? <Divider /> : null}
            <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <View style={{ flex: 1 }}>
                <T style={{ fontWeight: '600' }}>{name(s.user_id)}{s.user_id === uid ? ' (you)' : ''}</T>
                <T variant="small">
                  {s.level !== 'training' && s.certified_at ? `${skillLabel(s.level)} ${relative(s.certified_at)}${s.certified_by ? ` by ${name(s.certified_by)}` : ''}`
                    : s.requested_at ? `Asked for sign-off ${relative(s.requested_at)}` : 'Learning this SOP'}
                </T>
              </View>
              <Badge label={s.level === 'training' && s.requested_at ? 'Requested' : skillLabel(s.level)} tone={tone(s.level)} raw />
            </Row>
            {manager ? (
              <Row style={{ flexWrap: 'wrap', marginTop: 6 }} gap={6}>
                {s.level === 'training' ? <Button small icon="checkmark-circle-outline" title="Certify" onPress={() => change(s.user_id, 'certified')} /> : null}
                {s.level !== 'trainer' ? <Button small kind="secondary" icon="school-outline" title="Make trainer" onPress={() => change(s.user_id, 'trainer')} /> : null}
                {s.level === 'trainer' ? <Button small kind="secondary" title="Certified only" onPress={() => change(s.user_id, 'certified')} /> : null}
                <Button small kind="ghost" icon="close-outline" title="Remove" onPress={() => confirmAction('Remove certification?', `${name(s.user_id)} will no longer be listed for this SOP.`, () => { change(s.user_id, null); }, true)} />
              </Row>
            ) : null}
          </View>
        ))}

        {canRequest && !certifiedMine ? (
          <View style={{ marginTop: rows.length ? space.md : space.sm }}>
            {requested ? (
              <Row><Badge label="Requested" tone="warning" raw /><T variant="small" style={{ flex: 1 }}>Your manager has been asked to sign you off.</T></Row>
            ) : !manager ? (
              <Button small kind="secondary" icon="hand-right-outline" title="Request sign-off" style={{ alignSelf: 'flex-start' }} onPress={request} />
            ) : null}
          </View>
        ) : null}

        {manager && addable.length ? (
          <View style={{ marginTop: space.md }}>
            <Divider />
            <Select label="Add person" placeholder="Choose a team member" value={addUser} searchable={addable.length > 8}
              options={addable.map((m) => ({ value: m.user_id, label: m.display_name ?? 'Team member', hint: m.role }))} onChange={setAddUser} />
            {addUser ? (
              <>
                <Segmented value={addLevel} onChange={setAddLevel} options={SKILL_LEVELS} />
                <Button small icon="add" title={`Add as ${skillLabel(addLevel).toLowerCase()}`} style={{ alignSelf: 'flex-start' }}
                  onPress={async () => { if (await setSkill(orgId, addUser, guideKey, addLevel)) { setAddUser(null); q.reload(); } }} />
              </>
            ) : null}
          </View>
        ) : null}
      </Card>
    </Section>
  );
}

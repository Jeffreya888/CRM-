import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { loadGuideLibrary, SKILL_LEVELS, skillLabel, type SkillLevel } from '../../lib/guides';
import { supabase } from '../../lib/supabase';
import { colors, space } from '../../lib/theme';
import type { ServiceSkill } from '../../lib/types';
import { useQuery } from '../../lib/useQuery';
import { confirmAction } from '../FormSheet';
import { Badge, Button, Card, Divider, IconButton, ListRow, Segmented, Select, T } from '../ui';
import { PlanUpsellRow } from '../plans/PlanUpsell';
import { useSession } from '../../lib/session';
import { setSkill } from './CertifiedTechs';

const tone = (l: string) => (l === 'trainer' ? 'purple' : l === 'certified' ? 'success' : 'warning') as 'purple' | 'success' | 'warning';

/** "Certified for" on a team member: the SOPs they are certified on, with a quick add for managers. */
export function MemberSops(props: { orgId: string; userId: string; manager: boolean; businessTypes: string[] }) {
  const { can } = useSession();
  if (can('certification')) return <MemberSopsList {...props} />;
  return (
    <Card style={{ paddingBottom: 0 }}>
      <PlanUpsellRow feature="certification" label="Technician certification" hint="Track which SOPs each person is certified on." />
    </Card>
  );
}

function MemberSopsList({ orgId, userId, manager, businessTypes }: { orgId: string; userId: string; manager: boolean; businessTypes: string[] }) {
  const [key, setKey] = useState<string | null>(null);
  const [level, setLevel] = useState<SkillLevel>('certified');

  const q = useQuery(async () => {
    const [s, lib] = await Promise.all([
      supabase.from('service_skills').select('*').eq('org_id', orgId).eq('user_id', userId),
      loadGuideLibrary(orgId),
    ]);
    if (s.error) throw s.error;
    return { skills: (s.data ?? []) as ServiceSkill[], guides: lib.guides.map((r) => r.guide).filter((g) => businessTypes.includes(g.asset_type)) };
  }, [orgId, userId, businessTypes.join(',')]);

  const skills = q.data?.skills ?? [];
  const guides = q.data?.guides ?? [];
  const title = (k: string) => guides.find((g) => g.key === k)?.title ?? 'SOP';
  const order: Record<string, number> = { trainer: 0, certified: 1, training: 2 };
  const rows = skills.filter((s) => guides.some((g) => g.key === s.guide_key))
    .sort((a, b) => (order[a.level] ?? 3) - (order[b.level] ?? 3) || title(a.guide_key).localeCompare(title(b.guide_key)));
  const addable = guides.filter((g) => !skills.some((s) => s.guide_key === g.key));

  return (
    <Card style={{ padding: 0, overflow: 'hidden' }}>
      {q.error ? <T variant="small" style={{ color: colors.danger, padding: space.md }}>{q.error}</T> : null}
      {!q.loading && !rows.length ? <T variant="muted" style={{ padding: space.lg }}>Not certified on any SOP yet.</T> : null}
      {rows.map((s) => (
        <ListRow key={s.guide_key} icon="ribbon-outline" tone={tone(s.level)} title={title(s.guide_key)}
          subtitle={s.level === 'training' && s.requested_at ? 'Asked for sign-off' : skillLabel(s.level)}
          onPress={() => router.push(`/guides/${s.guide_key}`)}
          right={manager ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              {s.level === 'training' ? <Button small title="Certify" onPress={async () => { if (await setSkill(orgId, userId, s.guide_key, 'certified')) q.reload(); }} />
                : <Badge label={skillLabel(s.level)} tone={tone(s.level)} raw />}
              <IconButton icon="close" label="Remove" color={colors.textMuted} onPress={() => confirmAction('Remove certification?', `Remove ${title(s.guide_key)} from this person?`, async () => {
                if (await setSkill(orgId, userId, s.guide_key, null)) q.reload();
              }, true)} />
            </View>
          ) : <Badge label={s.level === 'training' && s.requested_at ? 'Requested' : skillLabel(s.level)} tone={tone(s.level)} raw />} />
      ))}
      {manager && addable.length ? (
        <View style={{ padding: space.md }}>
          {rows.length ? <Divider /> : null}
          <Select label="Quick add" placeholder="Choose an SOP" value={key} searchable={addable.length > 8} icon="book-outline"
            options={addable.map((g) => ({ value: g.key, label: g.title }))} onChange={setKey} />
          {key ? (
            <>
              <Segmented value={level} onChange={setLevel} options={SKILL_LEVELS} />
              <Button small icon="add" title={`Add as ${skillLabel(level).toLowerCase()}`} style={{ alignSelf: 'flex-start' }}
                onPress={async () => { if (await setSkill(orgId, userId, key, level)) { setKey(null); q.reload(); } }} />
            </>
          ) : null}
        </View>
      ) : null}
    </Card>
  );
}

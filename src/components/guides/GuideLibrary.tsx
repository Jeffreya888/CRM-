import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { assetTypeLabel, minutesLabel, stepMinutesTotal, type GuideLibraryData } from '../../lib/guides';
import { assetTypeInfo } from '../../lib/pricing';
import { friendlyError, supabase } from '../../lib/supabase';
import { colors, space } from '../../lib/theme';
import type { AssetType } from '../../lib/types';
import { notify } from '../FormSheet';
import { Button, Card, EmptyState, Ionicons, ListRow, Row, SearchBar, Section, Segmented, T } from '../ui';

/**
 * The SOP library (Training center tab and /guides). Pass the loaded
 * library; `onChanged` reloads it after a manager shows a hidden guide again.
 */
export function GuideLibrary({ lib, loading, orgId, manager, businessTypes, onChanged }: {
  lib: GuideLibraryData | undefined; loading: boolean; orgId: string; manager: boolean; businessTypes: AssetType[]; onChanged: () => void;
}) {
  const [type, setType] = useState<'all' | AssetType>('all');
  const [search, setSearch] = useState('');
  const [showHidden, setShowHidden] = useState(false);

  const enabled = (lib?.guides ?? []).filter((r) => businessTypes.includes(r.guide.asset_type));
  const s = search.trim().toLowerCase();
  const rows = enabled
    .filter((r) => type === 'all' || r.guide.asset_type === type)
    .filter((r) => !s || [r.guide.title, r.guide.summary].some((x) => x?.toLowerCase().includes(s)));
  const hidden = (lib?.hiddenDefaults ?? []).filter((g) => businessTypes.includes(g.asset_type));

  const unhide = async (guideId: string) => {
    const { error } = await supabase.from('hidden_guides').delete().eq('org_id', orgId).eq('guide_id', guideId);
    if (error) return notify('Could not show SOP', friendlyError(error.message));
    onChanged();
  };

  return (
    <View>
      <Card style={{ backgroundColor: colors.primarySoft, borderColor: colors.primarySoft }}>
        <Row gap={space.md} style={{ alignItems: 'flex-start' }}>
          <Ionicons name="book-outline" size={22} color={colors.primaryText} />
          <View style={{ flex: 1 }}>
            <T style={{ fontWeight: '700' }}>SOPs — Standard Operating Procedures, included free with Flight Ready</T>
            <T variant="muted" style={{ marginTop: 2 }}>
              Written for detailers: products, tools, prep and protection, numbered steps, things to never do, and quality checks. Each SOP&apos;s steps become the job checklist automatically.
              {manager ? ' You can hide an SOP, or duplicate it and make it your own.' : ''}
            </T>
          </View>
        </Row>
      </Card>

      {businessTypes.length > 1 ? (
        <Segmented value={type} onChange={setType} options={[
          { value: 'all', label: 'All', count: enabled.length },
          ...businessTypes.map((t) => ({ value: t, label: assetTypeLabel(t), count: enabled.filter((r) => r.guide.asset_type === t).length })),
        ]} />
      ) : null}
      <SearchBar value={search} onChange={setSearch} placeholder="Search SOPs..." />

      {!loading && rows.length === 0 ? (
        <EmptyState icon="book-outline" title={s ? 'No matching SOPs' : 'No SOPs here yet'}
          body={s ? 'Try a different search.' : 'SOPs for this type of work will appear here.'} />
      ) : null}

      {rows.length ? (
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          {rows.map((r) => (
            <ListRow key={r.guide.id} icon={assetTypeInfo(r.guide.asset_type).icon} tone={r.isCopy ? 'purple' : 'info'}
              title={r.guide.title}
              subtitle={[`${r.guide.steps.length} steps`, stepMinutesTotal(r.guide.steps) ? `~${minutesLabel(stepMinutesTotal(r.guide.steps))}` : r.guide.time_estimate?.split('·')[0]?.trim()].filter(Boolean).join(' · ')}
              meta={r.isCopy ? (r.platform ? 'Your company copy' : 'Your company SOP') : 'Flight Ready SOP'}
              onPress={() => router.push(`/guides/${r.guide.key}`)} />
          ))}
        </Card>
      ) : null}

      {manager ? (
        <Button kind="secondary" icon="add" title="Write your own SOP" style={{ marginTop: space.lg }} onPress={() => router.push('/guides/edit')} />
      ) : null}

      {manager && hidden.length ? (
        <Section title={`Hidden SOPs (${hidden.length})`} icon="eye-off-outline" iconColor={colors.textMuted}
          action={<Button small kind="ghost" title={showHidden ? 'Hide list' : 'Show list'} onPress={() => setShowHidden((v) => !v)} />}>
          {showHidden ? (
            <Card style={{ padding: 0, overflow: 'hidden' }}>
              {hidden.map((g) => (
                <ListRow key={g.id} icon="eye-off-outline" tone="neutral" title={g.title} subtitle={assetTypeLabel(g.asset_type)}
                  right={<Button small kind="ghost" title="Show again" onPress={() => unhide(g.id)} />} />
              ))}
            </Card>
          ) : <T variant="small">Your team does not see these. Show one again any time.</T>}
        </Section>
      ) : null}
    </View>
  );
}

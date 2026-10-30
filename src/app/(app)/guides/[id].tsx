import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useRef } from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';
import { confirmAction, notify } from '../../../components/FormSheet';
import { CertifiedTechs } from '../../../components/guides/CertifiedTechs';
import { BulletSection, Caution, Disclaimer, StepNumber } from '../../../components/guides/GuideBits';
import { MediaCard } from '../../../components/MediaCard';
import { Badge, Button, Card, EmptyState, ErrorBanner, Ionicons, KeyValue, Loading, Row, Section, T } from '../../../components/ui';
import { assetTypeLabel, findGuide, GUIDE_DISCLAIMER, loadGuideLibrary, minutesLabel, stepMinutesTotal } from '../../../lib/guides';
import { canEdit, canSeeMoney } from '../../../lib/plans';
import { useOrg } from '../../../lib/session';
import { friendlyError, supabase } from '../../../lib/supabase';
import { colors, space } from '../../../lib/theme';
import { openMedia, thumbnails } from '../../../lib/training';
import type { TrainingMedia } from '../../../lib/types';
import { useQuery } from '../../../lib/useQuery';

/** SOP (step-by-step service guide) viewer. `id` is a guide key (preferred) or guide id; `?step=<index>` highlights a step. */
export default function GuideViewer() {
  const { id, step } = useLocalSearchParams<{ id: string; step?: string }>();
  const { orgId, role, session } = useOrg();
  const manager = canSeeMoney(role);
  const focus = step != null && step !== '' && !Number.isNaN(Number(step)) ? Number(step) : null;

  const scrollRef = useRef<ScrollView>(null);
  const stepsY = useRef<number | null>(null);
  const stepY = useRef<number | null>(null);
  const scrolled = useRef(false);
  const tryScroll = () => {
    if (scrolled.current || stepsY.current == null || stepY.current == null) return;
    scrolled.current = true;
    const y = Math.max(0, stepsY.current + stepY.current - 12);
    setTimeout(() => scrollRef.current?.scrollTo({ y, animated: true }), 50);
  };

  const q = useQuery(async () => {
    const lib = await loadGuideLibrary(orgId);
    const found = findGuide(lib, id);
    if (!found) return { found: null, media: [] as TrainingMedia[], thumbs: {} as Record<string, string> };
    const m = await supabase.from('training_media').select('*, service:services(name, category)')
      .eq('org_id', orgId).eq('guide_key', found.guide.key).order('sort_order');
    const media = (m.data ?? []) as TrainingMedia[];
    return { found, media, thumbs: await thumbnails(media) };
  }, [orgId, id]);

  if (q.loading && !q.data) return <Loading />;
  const found = q.data?.found;
  if (!found) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, padding: space.lg }}>
        <Stack.Screen options={{ title: 'SOP' }} />
        <ErrorBanner message={q.error} />
        <EmptyState icon="book-outline" title="SOP not found" body="This SOP may have been removed or hidden by your company."
          action={<Button kind="secondary" title="Browse SOPs" onPress={() => router.replace('/guides')} />} />
      </View>
    );
  }
  const { guide: g, isCopy, platform, hiddenDefault } = found;
  const media = q.data?.media ?? [];
  const totalMin = stepMinutesTotal(g.steps);
  const stepMedia = (i: number) => media.filter((m) => m.step_index === i);
  const generalMedia = media.filter((m) => m.step_index == null || m.step_index >= g.steps.length);
  const open = (m: TrainingMedia) => openMedia(m, session!.user.id).catch((e) => notify('Could not open', e.message));

  const hide = () => confirmAction('Hide this SOP?', 'Your team will no longer see this Tarmo SOP. You can show it again from the SOP library.', async () => {
    const { error } = await supabase.from('hidden_guides').insert({ org_id: orgId, guide_id: g.id });
    if (error) return notify('Could not hide SOP', friendlyError(error.message));
    router.back();
  });
  const unhide = async () => {
    const { error } = await supabase.from('hidden_guides').delete().eq('org_id', orgId).eq('guide_id', g.id);
    if (error) return notify('Could not show SOP', friendlyError(error.message));
    q.reload();
  };
  const removeCopy = () => confirmAction(
    platform ? 'Delete your copy?' : 'Delete this SOP?',
    platform ? 'Your edits will be removed and the Tarmo SOP will be used again.' : 'This SOP will be removed for everyone in your company.',
    async () => {
      const { error } = await supabase.from('service_guides').delete().eq('id', g.id);
      if (error) return notify('Could not delete', friendlyError(error.message));
      if (platform) q.reload(); else router.back();
    }, true);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Stack.Screen options={{ title: g.title }} />
      <ScrollView ref={scrollRef} contentContainerStyle={{ padding: space.lg, paddingBottom: 110 }}
        refreshControl={<RefreshControl refreshing={q.refreshing} onRefresh={q.refresh} tintColor={colors.textMuted} />}>
        <ErrorBanner message={q.error} />
        {hiddenDefault ? (
          <Card style={{ backgroundColor: colors.warningSoft, borderColor: colors.warningSoft }}>
            <Row gap={space.md}>
              <Ionicons name="eye-off-outline" size={20} color={colors.warning} />
              <T style={{ flex: 1, color: colors.warning }}>Hidden for your company. Your team does not see this SOP.</T>
              {manager ? <Button small kind="secondary" title="Show again" onPress={unhide} /> : null}
            </Row>
          </Card>
        ) : null}

        <Card>
          <Row style={{ flexWrap: 'wrap' }} gap={6}>
            <Badge label={assetTypeLabel(g.asset_type)} tone="info" raw />
            <Badge label={isCopy ? (platform ? 'Company copy' : 'Company SOP') : 'Tarmo SOP'} tone={isCopy ? 'purple' : 'success'} raw />
          </Row>
          <T style={{ color: colors.textMuted, lineHeight: 22, marginTop: space.md }}>{g.summary}</T>
          <View style={{ marginTop: space.sm }}>
            <KeyValue label="Time estimate" value={g.time_estimate} />
            <KeyValue label="Crew" value={g.crew} />
            <KeyValue label="Steps" value={String(g.steps.length)} />
            {totalMin ? <KeyValue label="Step times add up to" value={`~${minutesLabel(totalMin)}`} /> : null}
          </View>
        </Card>

        {canEdit(role) && !hiddenDefault ? (
          <Button small kind="secondary" icon="sparkles-outline" title="Ask about this SOP" style={{ alignSelf: 'flex-start', marginTop: space.sm }}
            onPress={() => router.push({ pathname: '/assistant/[id]', params: { id: 'new', guide_key: g.key } })} />
        ) : null}

        {manager ? (
          <Row style={{ flexWrap: 'wrap', marginTop: space.sm }}>
            {isCopy ? (
              <>
                <Button small kind="secondary" icon="create-outline" title="Edit SOP" onPress={() => router.push({ pathname: '/guides/edit', params: { id: g.id } })} />
                <Button small kind="ghost" icon="trash-outline" title={platform ? 'Delete my copy' : 'Delete SOP'} onPress={removeCopy} />
              </>
            ) : (
              <>
                <Button small kind="secondary" icon="copy-outline" title="Duplicate & edit" onPress={() => router.push({ pathname: '/guides/edit', params: { from: g.id } })} />
                {!hiddenDefault ? <Button small kind="ghost" icon="eye-off-outline" title="Hide default" onPress={hide} /> : null}
              </>
            )}
          </Row>
        ) : null}

        <BulletSection title="Products" icon="flask-outline" items={g.products} />
        <BulletSection title="Tools & equipment" icon="construct-outline" items={g.tools} color={colors.warning} />
        <BulletSection title="Prep & protection" icon="shield-checkmark-outline" items={g.prep} color={colors.success} />

        <View onLayout={(e) => { stepsY.current = e.nativeEvent.layout.y; tryScroll(); }}>
          <Section title="Steps" icon="list-outline" count={totalMin ? `~${minutesLabel(totalMin)} total` : undefined}>
            {g.steps.length === 0 ? <T variant="muted">No steps yet.</T> : null}
            {g.steps.map((st, i) => {
              const active = focus === i;
              const vids = stepMedia(i);
              return (
                <View key={i} onLayout={active ? (e) => { stepY.current = e.nativeEvent.layout.y + space.lg; tryScroll(); } : undefined}>
                  <Card style={active ? { borderColor: colors.primary, borderWidth: 2 } : undefined}>
                    <Row gap={space.md} style={{ alignItems: 'flex-start' }}>
                      <StepNumber n={i + 1} active={active} />
                      <View style={{ flex: 1 }}>
                        <T style={{ fontWeight: '700', fontSize: 16 }}>{st.title}</T>
                        {st.detail ? <T variant="muted" style={{ marginTop: 4, lineHeight: 21 }}>{st.detail}</T> : null}
                        {st.minutes || st.products?.length ? (
                          <Row gap={6} style={{ flexWrap: 'wrap', marginTop: space.sm }}>
                            {st.minutes ? <Badge label={`~${minutesLabel(st.minutes)}`} tone="info" raw /> : null}
                            {(st.products ?? []).map((p) => <Badge key={p} label={p} tone="neutral" raw />)}
                          </Row>
                        ) : null}
                      </View>
                    </Row>
                    {st.caution ? <Caution text={st.caution} /> : null}
                    {vids.length ? (
                      <View style={{ marginTop: space.md }}>
                        {vids.map((m) => <MediaCard key={m.id} m={m} thumb={q.data?.thumbs[m.id]} onPress={() => open(m)} compact />)}
                      </View>
                    ) : null}
                    {manager ? (
                      <Button small kind="ghost" icon="videocam-outline" title="Attach a video to this step" style={{ alignSelf: 'flex-start', marginTop: space.sm }}
                        onPress={() => router.push({ pathname: '/training', params: { attach: g.key, step: String(i) } })} />
                    ) : null}
                  </Card>
                </View>
              );
            })}
          </Section>
        </View>

        {!hiddenDefault ? (
          <CertifiedTechs orgId={orgId} guideKey={g.key} uid={session!.user.id} manager={manager} canRequest={canEdit(role)} />
        ) : null}

        <BulletSection title="Never do this" icon="close-circle-outline" items={g.donts} color={colors.danger} bullet="close-circle" />
        <BulletSection title="Quality checks" icon="checkmark-done-outline" items={g.quality_checks} color={colors.success} bullet="checkmark-circle" />
        <BulletSection title="Photos to take" icon="camera-outline" items={g.photos} color={colors.primary} bullet="camera" />

        {generalMedia.length ? (
          <Section title="Videos & documents" icon="play-circle-outline" iconColor={colors.success}>
            {generalMedia.map((m) => <MediaCard key={m.id} m={m} thumb={q.data?.thumbs[m.id]} onPress={() => open(m)} />)}
          </Section>
        ) : null}

        <Disclaimer text={GUIDE_DISCLAIMER} />
      </ScrollView>
    </View>
  );
}

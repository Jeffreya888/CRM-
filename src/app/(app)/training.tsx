import * as DocumentPicker from 'expo-document-picker';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { confirmAction, notify } from '../../components/FormSheet';
import { GuideLibrary } from '../../components/guides/GuideLibrary';
import { MediaCard } from '../../components/MediaCard';
import { Button, Card, EmptyState, ErrorBanner, Fab, Field, IconTile, Ionicons, ListRow, Row, Screen, SearchBar, Section, Segmented, Select, T } from '../../components/ui';
import { pickImage, pickVideo, uploadFile, uploadImage } from '../../lib/files';
import { loadGuideLibrary } from '../../lib/guides';
import { canSeeMoney } from '../../lib/plans';
import { useOrg } from '../../lib/session';
import { friendlyError, supabase } from '../../lib/supabase';
import { colors, radius, space } from '../../lib/theme';
import { openMedia, thumbnails } from '../../lib/training';
import type { TrainingMedia } from '../../lib/types';
import { useQuery } from '../../lib/useQuery';

type Draft = { id?: string; kind: 'video' | 'document'; title: string; service_id: string | null; url: string; duration_min: string; description: string;
  guide_key: string | null; step_index: number | null;
  file?: { uri: string; mime: string; ext: string; name: string } | null; thumb?: string | null; storage_path?: string | null; thumbnail_path?: string | null };

const blank = (service_id: string | null = null, guide_key: string | null = null, step_index: number | null = null): Draft =>
  ({ kind: 'video', title: '', service_id, url: '', duration_min: '', description: '', file: null, thumb: null, guide_key, step_index });

export default function TrainingCenter() {
  const { add, attach, step, tab: tabParam } = useLocalSearchParams<{ add?: string; attach?: string; step?: string; tab?: string }>();
  const { orgId, role, session, businessTypes } = useOrg();
  const uid = session!.user.id;
  const manager = canSeeMoney(role);
  const attachStep = step != null && step !== '' && !Number.isNaN(Number(step)) ? Number(step) : null;
  const [tab, setTab] = useState<'guides' | 'media'>(add || attach || tabParam === 'media' ? 'media' : 'guides');
  const [search, setSearch] = useState('');
  const [draft, setDraft] = useState<Draft | null>(() => (manager && (add || attach) ? blank(add ?? null, attach ?? null, attach ? attachStep ?? 0 : null) : null));
  const lib = useQuery(() => loadGuideLibrary(orgId), [orgId]);
  // The technician's own SOP certifications (service_skills).
  const skills = useQuery(async () => {
    const { data, error } = await supabase.from('service_skills').select('guide_key, level').eq('org_id', orgId).eq('user_id', uid);
    if (error) return [] as { guide_key: string; level: string }[];
    return (data ?? []) as { guide_key: string; level: string }[];
  }, [orgId, uid]);
  const [error, setError] = useState<string | null>(null);

  const q = useQuery(async () => {
    const [m, p, s] = await Promise.all([
      supabase.from('training_media').select('*, service:services(name, category)').eq('org_id', orgId).order('sort_order').order('created_at'),
      supabase.from('training_progress').select('media_id').eq('user_id', uid),
      supabase.from('services').select('id, name').eq('org_id', orgId).order('name'),
    ]);
    if (m.error) throw m.error;
    const media = (m.data ?? []) as TrainingMedia[];
    return { media, watched: new Set((p.data ?? []).map((x) => x.media_id)), services: s.data ?? [], thumbs: await thumbnails(media) };
  }, [orgId]);

  const media = q.data?.media ?? [];
  const s = search.toLowerCase();
  const visible = media.filter((m) => !s || [m.title, m.description, m.service?.name, m.service?.category].some((x) => x?.toLowerCase().includes(s)));
  const videos = visible.filter((m) => m.kind === 'video');
  const docs = visible.filter((m) => m.kind === 'document');
  const allVideos = media.filter((m) => m.kind === 'video');
  const watchedCount = allVideos.filter((m) => q.data?.watched.has(m.id)).length;
  const pct = allVideos.length ? Math.round((watchedCount / allVideos.length) * 100) : 0;

  const guideOptions = (lib.data?.guides ?? []).filter((r) => businessTypes.includes(r.guide.asset_type)).map((r) => ({ value: r.guide.key, label: r.guide.title, hint: `${r.guide.steps.length} steps` }));
  const guideByKey = (key: string | null) => (lib.data?.guides ?? []).find((r) => r.guide.key === key)?.guide ?? null;
  const stepCaption = (m: TrainingMedia) => {
    const g = guideByKey(m.guide_key);
    if (!g) return null;
    return m.step_index != null && g.steps[m.step_index] ? `${g.title} · Step ${m.step_index + 1}: ${g.steps[m.step_index]!.title}` : g.title;
  };
  const draftGuide = guideByKey(draft?.guide_key ?? null);
  const enabledKeys = new Set((lib.data?.guides ?? []).filter((r) => businessTypes.includes(r.guide.asset_type)).map((r) => r.guide.key));
  const certifiedCount = (skills.data ?? []).filter((x) => enabledKeys.has(x.guide_key) && (x.level === 'certified' || x.level === 'trainer')).length;
  const trainingCount = (skills.data ?? []).filter((x) => enabledKeys.has(x.guide_key) && x.level === 'training').length;
  const certPct = enabledKeys.size ? Math.round((certifiedCount / enabledKeys.size) * 100) : 0;

  const save = async () => {
    if (!draft) return;
    setError(null);
    if (!draft.title.trim()) return setError('Give it a title');
    if (!draft.url.trim() && !draft.file && !draft.storage_path) return setError(draft.kind === 'video' ? 'Paste a video link or upload a video' : 'Paste a link or upload a document');
    try {
      let storage_path = draft.storage_path ?? null;
      if (draft.file) storage_path = await uploadFile(orgId, 'training', draft.file.uri, draft.file.mime, draft.file.ext);
      let thumbnail_path = draft.thumbnail_path ?? null;
      if (draft.thumb && !draft.thumb.startsWith('http')) thumbnail_path = await uploadImage(orgId, 'training', draft.thumb);
      const row = {
        kind: draft.kind, title: draft.title.trim(), service_id: draft.service_id, description: draft.description.trim() || null,
        guide_key: draft.guide_key, step_index: draft.guide_key ? draft.step_index : null,
        url: draft.url.trim() || null, storage_path: draft.url.trim() ? null : storage_path, thumbnail_path,
        duration_min: Number(draft.duration_min) || null,
      };
      const { error } = draft.id
        ? await supabase.from('training_media').update(row).eq('id', draft.id)
        : await supabase.from('training_media').insert({ ...row, org_id: orgId, created_by: uid, sort_order: media.length });
      if (error) throw error;
      setDraft(null);
      q.reload();
    } catch (e: any) {
      setError(friendlyError(e.message));
    }
  };

  const remove = () => draft?.id && confirmAction('Delete this item?', 'It will be removed for everyone.', async () => {
    await supabase.from('training_media').delete().eq('id', draft.id!);
    setDraft(null);
    q.reload();
  }, true);

  const edit = (m: TrainingMedia) => setDraft({
    id: m.id, kind: m.kind, title: m.title, service_id: m.service_id, url: m.url ?? '', duration_min: m.duration_min ? String(m.duration_min) : '',
    description: m.description ?? '', storage_path: m.storage_path, thumbnail_path: m.thumbnail_path, thumb: q.data?.thumbs[m.id] ?? null,
    guide_key: m.guide_key, step_index: m.step_index,
  });

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Screen refreshing={tab === 'guides' ? lib.refreshing : q.refreshing} onRefresh={tab === 'guides' ? () => { lib.refresh(); skills.reload(); } : q.refresh}>
        <Stack.Screen options={{ title: 'Training Center' }} />
        <Segmented value={tab} onChange={setTab} options={[
          { value: 'guides', label: 'SOPs', count: lib.data?.guides.filter((r) => businessTypes.includes(r.guide.asset_type)).length },
          { value: 'media', label: 'Videos & documents', count: media.length },
        ]} />
        {tab === 'guides' ? (
          <>
            <ErrorBanner message={lib.error} onRetry={lib.reload} />
            {enabledKeys.size ? (
              <Card>
                <Row style={{ justifyContent: 'space-between' }}>
                  <T variant="h3">Your certifications</T>
                  <T style={{ color: colors.success, fontSize: 20, fontWeight: '800' }}>{certifiedCount} of {enabledKeys.size}</T>
                </Row>
                <View style={{ height: 8, borderRadius: 4, backgroundColor: colors.cardRaised, marginVertical: space.md }}>
                  <View style={{ height: 8, borderRadius: 4, width: `${certPct}%`, backgroundColor: colors.success }} />
                </View>
                <T variant="muted">
                  {certifiedCount ? `Certified on ${certifiedCount} SOP${certifiedCount === 1 ? '' : 's'}.` : 'Not certified on any SOP yet.'}
                  {trainingCount ? ` ${trainingCount} in training.` : ''} Open an SOP and tap Request sign-off when you are ready.
                </T>
              </Card>
            ) : null}
            <GuideLibrary lib={lib.data} loading={lib.loading} orgId={orgId} manager={manager} businessTypes={businessTypes} onChanged={lib.reload} />
          </>
        ) : (
        <>
        <ErrorBanner message={q.error} />
        <Card>
          <Row style={{ justifyContent: 'space-between' }}>
            <T variant="h3">Your Progress</T>
            <T style={{ color: colors.primary, fontSize: 24, fontWeight: '800' }}>{pct}%</T>
          </Row>
          <View style={{ height: 8, borderRadius: 4, backgroundColor: colors.cardRaised, marginVertical: space.md }}>
            <View style={{ height: 8, borderRadius: 4, width: `${pct}%`, backgroundColor: colors.primary }} />
          </View>
          <T variant="muted">{watchedCount} of {allVideos.length} videos watched</T>
        </Card>
        <SearchBar value={search} onChange={setSearch} placeholder="Search training content..." />

        {!q.loading && media.length === 0 ? (
          <EmptyState icon="school-outline" title="No training content yet"
            body={manager ? 'Add how-to videos and product documents so every technician details the same way. Attach a video to an SOP step and techs see it right under that step.' : 'Your manager hasn\'t added training content yet.'} />
        ) : null}

        {videos.length ? (
          <Section title={`Training Videos (${videos.length})`} icon="play" iconColor={colors.success}>
            {videos.map((m) => (
              <View key={m.id}>
                <MediaCard m={m} thumb={q.data?.thumbs[m.id]} watched={q.data?.watched.has(m.id)} caption={stepCaption(m)} onPress={() => openMedia(m, uid).then(q.reload).catch((e) => notify('Could not open', e.message))} />
                {manager ? <Pressable onPress={() => edit(m)} style={{ position: 'absolute', right: 8, top: 8, padding: 6 }}><Ionicons name="ellipsis-horizontal" size={18} color={colors.textMuted} /></Pressable> : null}
              </View>
            ))}
          </Section>
        ) : null}

        {docs.length ? (
          <Section title={`Documents (${docs.length})`} icon="document-text-outline">
            <Card style={{ padding: 0, overflow: 'hidden' }}>
              {docs.map((m) => (
                <ListRow key={m.id} icon="document-text-outline" tone="info" title={m.title} subtitle={stepCaption(m) ?? m.service?.name ?? m.description}
                  right={manager ? <Pressable hitSlop={10} onPress={() => edit(m)}><Ionicons name="ellipsis-horizontal" size={18} color={colors.textMuted} /></Pressable> : undefined}
                  onPress={() => openMedia(m, uid).then(q.reload).catch((e) => notify('Could not open', e.message))} />
              ))}
            </Card>
          </Section>
        ) : null}
        </>
        )}
      </Screen>
      {manager && tab === 'media' ? <Fab onPress={() => setDraft(blank())} label="Add training content" /> : null}

      <Modal visible={!!draft} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setDraft(null)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
            <Row style={{ padding: space.lg, justifyContent: 'space-between' }}>
              <Button small kind="ghost" title="Cancel" onPress={() => setDraft(null)} />
              <T variant="h3">{draft?.id ? 'Edit' : 'Add'} training</T>
              <Button small title="Save" onPress={save} />
            </Row>
            {draft ? (
              <ScrollView contentContainerStyle={{ padding: space.lg, paddingBottom: 64 }} keyboardShouldPersistTaps="handled">
                <ErrorBanner message={error} />
                <Segmented value={draft.kind} onChange={(kind) => setDraft({ ...draft, kind, file: null })} options={[{ value: 'video', label: 'Video' }, { value: 'document', label: 'Document' }]} />
                <Field label="Title" placeholder={draft.kind === 'video' ? 'Exterior Detail Masterclass' : 'Leather Product Sheet'} value={draft.title} onChangeText={(title) => setDraft({ ...draft, title })} />
                <Select label="Service" placeholder="General (not tied to a service)" icon="sparkles-outline" iconColor={colors.success}
                  value={draft.service_id} allowClear options={(q.data?.services ?? []).map((x) => ({ value: x.id, label: x.name }))} onChange={(service_id) => setDraft({ ...draft, service_id })} />
                <Select label="SOP step (optional)" placeholder="Not attached to an SOP" icon="book-outline" allowClear searchable={guideOptions.length > 8}
                  value={draft.guide_key} options={guideOptions} onChange={(guide_key) => setDraft({ ...draft, guide_key, step_index: guide_key ? 0 : null })} />
                {draftGuide ? (
                  <Select label="Show under step" placeholder="Choose a step" value={draft.step_index != null ? String(draft.step_index) : null}
                    options={draftGuide.steps.map((st, i) => ({ value: String(i), label: `${i + 1}. ${st.title}` }))}
                    onChange={(v) => setDraft({ ...draft, step_index: v == null ? null : Number(v) })} />
                ) : null}
                <Field label="Link" icon="link-outline" placeholder={draft.kind === 'video' ? 'YouTube, Vimeo or Google Drive link' : 'Link to PDF or web page'} autoCapitalize="none" keyboardType="url"
                  value={draft.url} onChangeText={(url) => setDraft({ ...draft, url })} hint="Paste a link, or upload a file below. Unlisted YouTube links work great for long videos." />
                <Card style={{ backgroundColor: colors.cardRaised }}>
                  <Row style={{ justifyContent: 'space-between' }}>
                    <Row gap={space.md} style={{ flex: 1 }}>
                      <IconTile icon={draft.kind === 'video' ? 'videocam-outline' : 'document-attach-outline'} tone="info" />
                      <T style={{ flex: 1 }} numberOfLines={2}>{draft.file ? draft.file.name : draft.storage_path ? 'File uploaded' : 'No file uploaded'}</T>
                    </Row>
                    <Button small kind="secondary" title="Upload" onPress={async () => {
                      try {
                        if (draft.kind === 'video') {
                          const v = await pickVideo();
                          if (v) setDraft({ ...draft, url: '', file: { uri: v.uri, mime: v.mime, ext: v.ext, name: `Video (${v.ext})` }, duration_min: draft.duration_min || (v.durationMin ? String(v.durationMin) : '') });
                        } else {
                          const r = await DocumentPicker.getDocumentAsync({ type: ['application/pdf', 'image/*', 'text/plain'], copyToCacheDirectory: true });
                          const a = r.canceled ? null : r.assets[0];
                          if (a) setDraft({ ...draft, url: '', file: { uri: a.uri, mime: a.mimeType ?? 'application/pdf', ext: a.name.split('.').pop() ?? 'pdf', name: a.name } });
                        }
                      } catch (e: any) { setError(e.message); }
                    }} />
                  </Row>
                </Card>
                {draft.kind === 'video' ? (
                  <>
                    <Field label="Length (minutes)" keyboardType="number-pad" value={draft.duration_min} onChangeText={(duration_min) => setDraft({ ...draft, duration_min: duration_min.replace(/\D/g, '') })} />
                    <Row style={{ justifyContent: 'space-between', marginBottom: space.lg }}>
                      <T style={{ fontWeight: '600' }}>Thumbnail</T>
                      <Button small kind="secondary" icon="image-outline" title={draft.thumb ? 'Change' : 'Choose image'} onPress={async () => { const u = await pickImage('library'); if (u) setDraft({ ...draft, thumb: u }); }} />
                    </Row>
                  </>
                ) : null}
                <Field label="Description (optional)" multiline value={draft.description} onChangeText={(description) => setDraft({ ...draft, description })} />
                {draft.id ? <Button kind="ghost" icon="trash-outline" title="Delete" onPress={remove} /> : null}
              </ScrollView>
            ) : null}
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>
      <View style={{ height: radius.sm }} />
    </View>
  );
}

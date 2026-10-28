import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { AiAllowance, AiLimitCard, useAiAllowance, type AiLimitKind } from '../../../components/ai/AiAllowance';
import { AnswerBody, Thinking, UserBubble } from '../../../components/assistant/ChatBits';
import { confirmAction, notify } from '../../../components/FormSheet';
import { chooseSource } from '../../../components/jobs/JobCards';
import { Badge, EmptyState, ErrorBanner, IconButton, Ionicons, Loading, Row, T } from '../../../components/ui';
import { pickAssessPhotos, type PickedPhoto } from '../../../lib/assess';
import {
  AiLimitError, askAssistant, ASSISTANT_SUGGESTIONS, deleteThread, loadNewThreadContext, loadThread, MAX_ASSISTANT_PHOTOS,
  REVIEW_NOTICE, uploadAssistantPhotos,
} from '../../../lib/assistant';
import { APP_NAME } from '../../../lib/config';
import { signedUrls } from '../../../lib/files';
import { dateTime } from '../../../lib/format';
import { findGuide, loadGuideLibrary } from '../../../lib/guides';
import { useIsDesktop } from '../../../lib/layout';
import { canEdit, isManager } from '../../../lib/plans';
import { useOrg } from '../../../lib/session';
import { friendlyError } from '../../../lib/supabase';
import { colors, radius, space } from '../../../lib/theme';
import type { AssistantMessage } from '../../../lib/types';
import { useQuery } from '../../../lib/useQuery';

type Params = { id: string; job_id?: string; aircraft_id?: string; guide_key?: string; step?: string; q?: string };

/** "Ask <APP_NAME>" chat. `id` is a thread id or `new` (with optional job_id, aircraft_id, guide_key, step = 0-based SOP step, q = prefilled question). */
export default function AssistantChat() {
  const params = useLocalSearchParams<Params>();
  const { orgId, role, session } = useOrg();
  const uid = session?.user.id ?? '';
  const desktop = useIsDesktop();
  const isNew = !params.id || params.id === 'new';
  const stepIndex = params.step != null && params.step !== '' && !Number.isNaN(Number(params.step)) ? Number(params.step) : null;

  const [threadId, setThreadId] = useState<string | null>(isNew ? null : params.id);
  const [local, setLocal] = useState<AssistantMessage[]>([]);
  const [pending, setPending] = useState<{ text: string; photos: string[] } | null>(null);
  const [text, setText] = useState(() => (isNew && typeof params.q === 'string' ? params.q : ''));
  const [photos, setPhotos] = useState<PickedPhoto[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [limit, setLimit] = useState<AiLimitKind | null>(null);
  const [allowanceKey, setAllowanceKey] = useState(0);
  const scrollRef = useRef<ScrollView>(null);

  const allowance = useAiAllowance(allowanceKey);

  // Existing conversation (loaded once; new messages are appended locally).
  const q = useQuery(async () => {
    if (isNew) return null;
    const d = await loadThread(orgId, params.id);
    if (!d) return null;
    const paths = d.messages.flatMap((m) => m.photo_paths);
    let urls: Record<string, string> = {};
    try { urls = await signedUrls(paths); } catch { /* thumbnails are optional */ }
    return { ...d, urls };
  }, [orgId, params.id, isNew]);

  // Context for a new question: job number, asset, SOP title.
  const jobId = isNew ? params.job_id || null : q.data?.thread.job_id ?? null;
  const aircraftId = isNew ? params.aircraft_id || null : q.data?.thread.aircraft_id ?? null;
  const guideKey = isNew ? params.guide_key || null : q.data?.thread.guide_key ?? null;
  const ctx = useQuery(async () => {
    const [base, lib] = await Promise.all([
      loadNewThreadContext(jobId, aircraftId),
      guideKey ? loadGuideLibrary(orgId).catch(() => null) : Promise.resolve(null),
    ]);
    const g = lib && guideKey ? findGuide(lib, guideKey)?.guide ?? null : null;
    return { ...base, guide: g ? { title: g.title, step: isNew && stepIndex != null ? g.steps[stepIndex]?.title ?? null : null } : null };
  }, [orgId, jobId, aircraftId, guideKey, stepIndex, isNew]);

  if (!isNew && q.loading && !q.data) return <><Stack.Screen options={{ title: `Ask ${APP_NAME}` }} /><Loading /></>;
  if (!isNew && !q.data) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, padding: space.lg }}>
        <Stack.Screen options={{ title: `Ask ${APP_NAME}` }} />
        <ErrorBanner message={q.error} onRetry={q.reload} />
        <EmptyState icon="chatbubbles-outline" title="Conversation not found" body="It may have been deleted." />
      </View>
    );
  }

  const thread = q.data?.thread ?? null;
  const mine = !thread || thread.user_id === uid;
  const messages = [...(q.data?.messages ?? []), ...local];
  const urls = q.data?.urls ?? {};
  const editable = canEdit(role);
  const busy = !!pending;
  const title = thread?.title ?? (messages[0]?.content.slice(0, 60) || `Ask ${APP_NAME}`);

  const addPhotos = async () => {
    setError(null);
    try {
      const source = await chooseSource();
      if (!source) return;
      const picked = await pickAssessPhotos(source, MAX_ASSISTANT_PHOTOS - photos.length);
      if (picked.length) setPhotos((p) => [...p, ...picked].slice(0, MAX_ASSISTANT_PHOTOS));
    } catch (e: any) {
      setError(e?.message ?? String(e));
    }
  };

  const send = async (override?: string) => {
    const message = (override ?? text).trim();
    if (!message || busy) return;
    setError(null);
    setLimit(null);
    const sentPhotos = photos;
    setPending({ text: message, photos: sentPhotos.map((p) => p.uri) });
    setText('');
    setPhotos([]);
    try {
      const photoPaths = sentPhotos.length ? await uploadAssistantPhotos(orgId, uid, sentPhotos) : [];
      const r = await askAssistant({
        orgId, threadId, message, photoPaths,
        jobId: threadId ? undefined : jobId, aircraftId: threadId ? undefined : aircraftId,
        guideKey: threadId ? undefined : guideKey, stepIndex: threadId ? undefined : stepIndex,
      });
      setThreadId(r.thread_id);
      // Show the photos from this device (no signed URL needed).
      setLocal((l) => [...l, { ...r.user_message, photo_paths: sentPhotos.map((p) => p.uri) }, r.assistant_message]);
    } catch (e: any) {
      // Give the question back so nothing typed is lost.
      setText(message);
      setPhotos(sentPhotos);
      if (e instanceof AiLimitError || e?.code === 'ai_limit') setLimit(e.kind === 'check' ? 'check' : 'question');
      else setError(friendlyError(e?.message ?? String(e)));
    } finally {
      setPending(null);
      setAllowanceKey((k) => k + 1);
    }
  };

  const remove = () => confirmAction('Delete this conversation?', 'It will be removed for you and your managers.', async () => {
    try {
      await deleteThread(threadId!);
      if (router.canGoBack()) router.back(); else router.replace('/assistant');
    } catch (e: any) {
      notify('Could not delete', friendlyError(e?.message ?? String(e)));
    }
  }, true);

  const column = desktop ? { width: '100%' as const, maxWidth: 860, alignSelf: 'center' as const } : null;
  const c = ctx.data;
  const contextChips = [
    c?.job ? { icon: 'construct-outline' as const, label: `Job ${c.job.number ?? ''}`.trim(), onPress: () => router.push(`/jobs/${c.job!.id}`) } : null,
    c?.aircraft ? { icon: 'airplane-outline' as const, label: c.aircraft.tail_number, onPress: () => router.push(`/aircraft/${c.aircraft!.id}`) } : null,
    c?.guide && guideKey ? {
      icon: 'book-outline' as const,
      label: c.guide.step ? `${c.guide.title} · step ${(stepIndex ?? 0) + 1}` : c.guide.title,
      onPress: () => router.push({ pathname: '/guides/[id]', params: stepIndex != null && isNew ? { id: guideKey, step: String(stepIndex) } : { id: guideKey } }),
    } : null,
  ].filter((x): x is NonNullable<typeof x> => !!x);

  const question = (i: number) => {
    for (let j = i - 1; j >= 0; j--) if (messages[j]!.role === 'user') return messages[j]!.content;
    return null;
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Stack.Screen options={{
        title,
        headerRight: () => (threadId && mine ? <IconButton icon="trash-outline" color={colors.textMuted} label="Delete conversation" onPress={remove} /> : null),
      }} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={Platform.OS === 'ios' ? 100 : 0}>
        <ScrollView ref={scrollRef} keyboardShouldPersistTaps="handled"
          contentContainerStyle={[{ padding: space.lg, paddingBottom: space.xl, flexGrow: 1 }, column]}
          onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}>
          {mine && !limit ? <AiAllowance allowance={allowance.data} kind="question" /> : null}
          {!isManager(role) ? (
            <Row gap={6} style={{ marginBottom: space.md }}>
              <Ionicons name="eye-outline" size={14} color={colors.textFaint} />
              <T variant="small" style={{ flex: 1, color: colors.textFaint }}>{REVIEW_NOTICE}</T>
            </Row>
          ) : null}
          {!mine && thread ? (
            <View style={{ backgroundColor: colors.infoSoft, borderRadius: radius.md, padding: space.md, marginBottom: space.md }}>
              <T style={{ color: colors.primaryText }}>Asked by {q.data?.askerName} · {dateTime(thread.created_at)}</T>
            </View>
          ) : null}
          {contextChips.length ? (
            <Row gap={6} style={{ flexWrap: 'wrap', marginBottom: space.md }}>
              <T variant="small">About</T>
              {contextChips.map((chip) => (
                <Pressable key={chip.label} onPress={chip.onPress} style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.pill, backgroundColor: colors.cardRaised }, pressed && { opacity: 0.7 }]}>
                  <Ionicons name={chip.icon} size={13} color={colors.textMuted} />
                  <Text style={{ color: colors.text, fontSize: 13, fontWeight: '600' }} numberOfLines={1}>{chip.label}</Text>
                </Pressable>
              ))}
            </Row>
          ) : null}

          {messages.length === 0 && !pending ? (
            <View style={{ flex: 1, justifyContent: 'center', paddingVertical: space.xl }}>
              <View style={{ alignItems: 'center', marginBottom: space.lg }}>
                <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="sparkles" size={28} color={colors.primaryText} />
                </View>
                <T variant="h3" style={{ marginTop: space.md, textAlign: 'center' }}>What can I help with?</T>
                <T variant="muted" style={{ textAlign: 'center', marginTop: 4, maxWidth: 460 }}>
                  Answers come from your company&apos;s SOPs, this aircraft&apos;s documents and general detailing know-how, with sources.
                </T>
              </View>
              <View style={{ gap: space.sm }}>
                {ASSISTANT_SUGGESTIONS.map((s) => (
                  <Pressable key={s} onPress={() => setText(s)}
                    style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: space.sm, padding: space.md, borderRadius: radius.md, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }, pressed && { backgroundColor: colors.cardRaised }]}>
                    <Ionicons name="help-circle-outline" size={18} color={colors.primaryText} />
                    <T style={{ flex: 1 }}>{s}</T>
                    <Ionicons name="arrow-up-outline" size={16} color={colors.textMuted} style={{ transform: [{ rotate: '45deg' }] }} />
                  </Pressable>
                ))}
              </View>
            </View>
          ) : null}

          {messages.map((m, i) => (m.role === 'user'
            ? <UserBubble key={m.id ?? i} text={m.content} photos={m.photo_paths.map((p) => urls[p] ?? (p.includes('://') || p.startsWith('blob:') || p.startsWith('data:') ? p : '')).filter(Boolean)} />
            : <AnswerBody key={m.id ?? i} m={m} jobId={thread?.job_id ?? jobId} canAddNotes={editable} question={question(i)} />
          ))}
          {pending ? (
            <>
              <UserBubble text={pending.text} photos={pending.photos} pending />
              <Thinking />
            </>
          ) : null}
          {limit ? <AiLimitCard kind={limit} /> : null}
          <ErrorBanner message={error} />
        </ScrollView>

        {mine && editable ? (
          <View style={{ borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.bg }}>
            <View style={[{ paddingHorizontal: space.lg, paddingTop: space.sm, paddingBottom: Platform.OS === 'ios' ? space.xl : space.md }, column]}>
              {photos.length ? (
                <>
                  <Row gap={space.sm} style={{ marginBottom: space.sm }}>
                    {photos.map((p, i) => (
                      <View key={p.uri + i}>
                        <Image source={{ uri: p.uri }} style={{ width: 56, height: 56, borderRadius: radius.sm, backgroundColor: colors.cardRaised }} />
                        <Pressable accessibilityLabel="Remove photo" onPress={() => setPhotos((ps) => ps.filter((_, j) => j !== i))}
                          style={{ position: 'absolute', top: -6, right: -6, backgroundColor: colors.bg, borderRadius: 10 }}>
                          <Ionicons name="close-circle" size={20} color={colors.textMuted} />
                        </Pressable>
                      </View>
                    ))}
                  </Row>
                  <Row gap={4} style={{ marginBottom: space.sm }}>
                    <Ionicons name="camera-outline" size={14} color={colors.warning} />
                    <T variant="small" style={{ color: colors.warning }}>
                      Photo questions use an AI check{allowance.data ? ` (${allowance.data.left.toLocaleString('en-US')} left)` : ''}.
                    </T>
                  </Row>
                </>
              ) : null}
              <Row gap={space.sm} style={{ alignItems: 'flex-end' }}>
                <Pressable accessibilityLabel="Attach photos" disabled={busy || photos.length >= MAX_ASSISTANT_PHOTOS} onPress={addPhotos}
                  style={({ pressed }) => [{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border }, (pressed || photos.length >= MAX_ASSISTANT_PHOTOS) && { opacity: 0.5 }]}>
                  <Ionicons name="camera-outline" size={22} color={colors.primaryText} />
                </Pressable>
                <View style={{ flex: 1, backgroundColor: colors.input, borderRadius: 22, borderWidth: 1, borderColor: colors.borderStrong, paddingHorizontal: 14, paddingVertical: Platform.OS === 'ios' ? 11 : 4, minHeight: 44, justifyContent: 'center' }}>
                  <TextInput value={text} onChangeText={setText} multiline placeholder={messages.length ? 'Ask a follow-up…' : 'Ask a question…'}
                    placeholderTextColor={colors.textFaint} maxLength={2000}
                    style={{ color: colors.text, fontSize: 16, maxHeight: 140, paddingVertical: Platform.OS === 'web' ? 8 : 0, ...(Platform.OS === 'web' ? { outlineStyle: 'none' as any } : null) }}
                    onKeyPress={Platform.OS === 'web' ? (e: any) => {
                      if (e.nativeEvent.key === 'Enter' && !e.nativeEvent.shiftKey) { e.preventDefault?.(); send(); }
                    } : undefined} />
                </View>
                <Pressable accessibilityLabel="Send" disabled={busy || !text.trim()} onPress={() => send()}
                  style={({ pressed }) => [{ width: 44, height: 44, borderRadius: 22, backgroundColor: text.trim() && !busy ? colors.primary : colors.cardRaised, alignItems: 'center', justifyContent: 'center' }, pressed && { opacity: 0.7 }]}>
                  <Ionicons name="arrow-up" size={22} color={text.trim() && !busy ? colors.white : colors.textFaint} />
                </Pressable>
              </Row>
              {photos.length === 0 ? (
                <T variant="small" style={{ marginTop: 6, color: colors.textFaint }}>
                  Add up to {MAX_ASSISTANT_PHOTOS} photos · Photo questions use an AI check
                </T>
              ) : null}
            </View>
          </View>
        ) : !mine ? (
          <View style={[{ padding: space.lg, borderTopWidth: 1, borderTopColor: colors.border }, column]}>
            <Badge label="Read-only: only the person who asked can reply" tone="neutral" raw />
          </View>
        ) : null}
      </KeyboardAvoidingView>
    </View>
  );
}

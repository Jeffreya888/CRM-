// Pieces of the "Ask" chat: light markdown, source chips, safety banners, bubbles.
import { router } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { ActivityIndicator, Image, Pressable, Text, View, type StyleProp, type TextStyle } from 'react-native';
import { appendToJobNotes, openAircraftDocument, sourceLabel } from '../../lib/assistant';
import { colors, radius, space } from '../../lib/theme';
import type { AssistantMessage, AssistantSafety, AssistantSource } from '../../lib/types';
import { notify } from '../FormSheet';
import { Button, Ionicons, Row, T, type IconName } from '../ui';

// ---------------------------------------------------------------------------
// Markdown-ish text: paragraphs, numbered / bulleted lists, headings, **bold**
// ---------------------------------------------------------------------------
const baseText: TextStyle = { color: colors.text, fontSize: 16, lineHeight: 23 };

function Inline({ text, style }: { text: string; style?: StyleProp<TextStyle> }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g).filter(Boolean);
  return (
    <Text style={[baseText, style]}>
      {parts.map((p, i) => (p.startsWith('**') && p.endsWith('**') && p.length > 4
        ? <Text key={i} style={{ fontWeight: '700' }}>{p.slice(2, -2)}</Text>
        : p.replace(/(^|\s)\*(\S[^*]*\S|\S)\*(?=\s|$|[.,;:!?])/g, '$1$2')))}
    </Text>
  );
}

type Block =
  | { kind: 'p'; text: string }
  | { kind: 'h'; text: string }
  | { kind: 'ol'; items: { n: string; text: string }[] }
  | { kind: 'ul'; items: string[] };

export function parseBlocks(src: string): Block[] {
  const blocks: Block[] = [];
  let para: string[] = [];
  const flush = () => { if (para.length) { blocks.push({ kind: 'p', text: para.join(' ') }); para = []; } };
  for (const raw of src.replace(/\r/g, '').split('\n')) {
    const line = raw.trim();
    if (!line) { flush(); continue; }
    const ol = /^(\d{1,2})[.)]\s+(.*)$/.exec(line);
    const ul = /^[-*•]\s+(.*)$/.exec(line);
    const h = /^#{1,6}\s+(.*)$/.exec(line);
    const last = blocks[blocks.length - 1];
    if (ol) {
      flush();
      if (last?.kind === 'ol') last.items.push({ n: ol[1]!, text: ol[2]! });
      else blocks.push({ kind: 'ol', items: [{ n: ol[1]!, text: ol[2]! }] });
    } else if (ul) {
      flush();
      if (last?.kind === 'ul') last.items.push(ul[1]!);
      else blocks.push({ kind: 'ul', items: [ul[1]!] });
    } else if (h) {
      flush();
      blocks.push({ kind: 'h', text: h[1]! });
    } else if (!para.length && (last?.kind === 'ol' || last?.kind === 'ul') && /^\s{2,}/.test(raw)) {
      // Indented continuation of the previous list item.
      if (last.kind === 'ol') last.items[last.items.length - 1]!.text += ` ${line}`;
      else last.items[last.items.length - 1] += ` ${line}`;
    } else {
      para.push(line);
    }
  }
  flush();
  return blocks;
}

export function Markdown({ text, color }: { text: string; color?: string }) {
  const style = color ? { color } : undefined;
  return (
    <View style={{ gap: space.sm }}>
      {parseBlocks(text).map((b, i) => {
        if (b.kind === 'p') return <Inline key={i} text={b.text} style={style} />;
        if (b.kind === 'h') return <Inline key={i} text={b.text} style={[style, { fontWeight: '700', fontSize: 17 }]} />;
        if (b.kind === 'ol') {
          return (
            <View key={i} style={{ gap: 6 }}>
              {b.items.map((it, j) => (
                <View key={j} style={{ flexDirection: 'row', gap: space.sm }}>
                  <Text style={[baseText, style, { fontWeight: '700', minWidth: 22, color: color ?? colors.primaryText }]}>{it.n}.</Text>
                  <View style={{ flex: 1 }}><Inline text={it.text} style={style} /></View>
                </View>
              ))}
            </View>
          );
        }
        return (
          <View key={i} style={{ gap: 6 }}>
            {b.items.map((it, j) => (
              <View key={j} style={{ flexDirection: 'row', gap: space.sm }}>
                <Text style={[baseText, style, { color: color ?? colors.primaryText }]}>•</Text>
                <View style={{ flex: 1 }}><Inline text={it} style={style} /></View>
              </View>
            ))}
          </View>
        );
      })}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Sources
// ---------------------------------------------------------------------------
const SOURCE_ICON: Record<AssistantSource['type'], IconName> = {
  sop: 'book-outline', aircraft_doc: 'document-attach-outline', job: 'construct-outline', general: 'bulb-outline',
};

export function SourceChips({ sources, jobId }: { sources: AssistantSource[]; jobId: string | null }) {
  if (!sources.length) return null;
  const open = async (s: AssistantSource) => {
    try {
      if (s.type === 'sop' && s.key) {
        const step = s.step != null && Number(s.step) >= 1 ? String(Number(s.step) - 1) : undefined;
        router.push({ pathname: '/guides/[id]', params: step != null ? { id: s.key, step } : { id: s.key } });
      } else if (s.type === 'aircraft_doc' && s.document_id) {
        await openAircraftDocument(s.document_id);
      } else if (s.type === 'job' && (s.key || jobId)) {
        router.push(`/jobs/${s.key || jobId}`);
      }
    } catch (e: any) {
      notify('Could not open', e?.message ?? String(e));
    }
  };
  return (
    <View style={{ marginTop: space.sm }}>
      <T variant="small" style={{ marginBottom: 4 }}>Sources</T>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {sources.map((s, i) => {
          const pressable = (s.type === 'sop' && !!s.key) || (s.type === 'aircraft_doc' && !!s.document_id) || (s.type === 'job' && !!(s.key || jobId));
          return (
            <Pressable key={i} disabled={!pressable} onPress={() => open(s)}
              style={({ pressed }) => [{
                flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 6, maxWidth: '100%',
                borderRadius: radius.pill, backgroundColor: pressable ? colors.primarySoft : colors.cardRaised,
              }, pressed && { opacity: 0.7 }]}>
              <Ionicons name={SOURCE_ICON[s.type] ?? 'bulb-outline'} size={14} color={pressable ? colors.primaryText : colors.textMuted} />
              <Text numberOfLines={1} style={{ color: pressable ? colors.primaryText : colors.textMuted, fontSize: 13, fontWeight: '600', flexShrink: 1 }}>{sourceLabel(s)}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Safety banners
// ---------------------------------------------------------------------------
const SAFETY: Record<AssistantSafety, { title: string; body: string; icon: IconName; fg: string; bg: string }> = {
  damage: {
    title: 'Stop & report',
    body: 'Photograph it and tell your supervisor/maintenance before continuing.',
    icon: 'warning-outline', fg: colors.warning, bg: colors.warningSoft,
  },
  injury: {
    title: 'Get help first',
    body: 'If someone is hurt, call for help (911 or your local emergency number) and tell your supervisor right away.',
    icon: 'medkit-outline', fg: colors.danger, bg: colors.dangerSoft,
  },
  aircraft_systems: {
    title: 'Crew authorization needed',
    body: 'Don’t operate aircraft systems unless the crew authorizes it.',
    icon: 'hand-left-outline', fg: colors.warning, bg: colors.warningSoft,
  },
};

export function SafetyBanner({ safety, onAddToNotes }: { safety: AssistantSafety; onAddToNotes?: () => Promise<void> }) {
  const s = SAFETY[safety];
  const [added, setAdded] = useState(false);
  if (!s) return null;
  return (
    <View style={{ backgroundColor: s.bg, borderRadius: radius.md, padding: space.md, marginBottom: space.sm, borderLeftWidth: 3, borderLeftColor: s.fg }}>
      <Row gap={space.sm} style={{ alignItems: 'flex-start' }}>
        <Ionicons name={s.icon} size={20} color={s.fg} style={{ marginTop: 1 }} />
        <View style={{ flex: 1 }}>
          <T style={{ fontWeight: '700', color: s.fg }}>{s.title}</T>
          <T style={{ marginTop: 2, fontSize: 15 }}>{s.body}</T>
        </View>
      </Row>
      {onAddToNotes ? (
        added ? (
          <Row gap={6} style={{ marginTop: space.sm }}>
            <Ionicons name="checkmark-circle" size={16} color={colors.success} />
            <T variant="small" style={{ color: colors.success }}>Added to the job&apos;s staff notes</T>
          </Row>
        ) : (
          <Button small kind="secondary" icon="document-text-outline" title="Add to job notes" style={{ alignSelf: 'flex-start', marginTop: space.sm }}
            onPress={async () => {
              try { await onAddToNotes(); setAdded(true); } catch (e: any) { notify('Could not add the note', e?.message ?? String(e)); }
            }} />
        )
      ) : null}
    </View>
  );
}

export const addToNotes = (jobId: string, question: string | null, answer: string) => () => appendToJobNotes(jobId, question, answer);

// ---------------------------------------------------------------------------
// Bubbles
// ---------------------------------------------------------------------------
export function UserBubble({ text, photos, pending }: { text: string; photos?: string[]; pending?: boolean }) {
  return (
    <View style={{ alignSelf: 'flex-end', maxWidth: '85%', marginBottom: space.md, opacity: pending ? 0.8 : 1 }}>
      {photos?.length ? (
        <View style={{ flexDirection: 'row', gap: 6, justifyContent: 'flex-end', marginBottom: 6 }}>
          {photos.map((u, i) => <Image key={i} source={{ uri: u }} style={{ width: 72, height: 72, borderRadius: radius.md, backgroundColor: colors.cardRaised }} />)}
        </View>
      ) : null}
      <View style={{ backgroundColor: colors.primary, borderRadius: 18, borderBottomRightRadius: 4, paddingHorizontal: 14, paddingVertical: 10 }}>
        <Text style={{ color: colors.white, fontSize: 16, lineHeight: 22 }}>{text}</Text>
      </View>
    </View>
  );
}

export function AssistantBubble({ children, failed }: { children: ReactNode; failed?: boolean }) {
  return (
    <View style={{ alignSelf: 'flex-start', maxWidth: '92%', width: '92%', marginBottom: space.md }}>
      <Row gap={6} style={{ marginBottom: 4 }}>
        <Ionicons name="sparkles" size={14} color={failed ? colors.textMuted : colors.primaryText} />
        <T variant="small">Assistant</T>
      </Row>
      <View style={{
        backgroundColor: colors.card, borderRadius: 18, borderTopLeftRadius: 4, padding: 14,
        borderWidth: 1, borderColor: failed ? colors.dangerSoft : colors.border,
      }}>
        {children}
      </View>
    </View>
  );
}

export function Thinking() {
  return (
    <AssistantBubble>
      <Row gap={space.sm}>
        <ActivityIndicator color={colors.primaryText} size="small" />
        <T variant="muted">Thinking…</T>
      </Row>
    </AssistantBubble>
  );
}

export function AnswerBody({ m, jobId, canAddNotes, question }: { m: AssistantMessage; jobId: string | null; canAddNotes: boolean; question: string | null }) {
  const failed = m.status !== 'done';
  return (
    <AssistantBubble failed={failed}>
      {m.safety ? <SafetyBanner safety={m.safety} onAddToNotes={m.safety === 'damage' && jobId && canAddNotes && !failed ? addToNotes(jobId, question, m.content) : undefined} /> : null}
      <Markdown text={m.content} color={failed ? colors.textMuted : undefined} />
      {!failed ? <SourceChips sources={m.sources} jobId={jobId} /> : null}
    </AssistantBubble>
  );
}

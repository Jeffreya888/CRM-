import { Image, Pressable, View } from 'react-native';
import { colors, radius, space } from '../lib/theme';
import type { TrainingMedia } from '../lib/types';
import { Badge, Ionicons, Row, T } from './ui';

/**
 * Video/document row with thumbnail and play button (service detail, guides,
 * Training Center). `compact` is the smaller version shown under a guide step;
 * `caption` replaces the service line (e.g. "Exterior Wash · Step 4").
 */
export function MediaCard({ m, thumb, onPress, watched, compact, caption }: {
  m: TrainingMedia; thumb?: string; onPress: () => void; watched?: boolean; compact?: boolean; caption?: string | null;
}) {
  const w = compact ? 84 : 120;
  const h = compact ? 60 : 92;
  const sub = caption ?? m.service?.name ?? null;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`Open ${m.title}`}
      style={({ pressed }) => [{ flexDirection: 'row', backgroundColor: pressed ? colors.cardRaised : compact ? colors.cardRaised : colors.card, borderRadius: compact ? radius.md : radius.lg, borderWidth: 1, borderColor: colors.border, overflow: 'hidden', marginBottom: compact ? space.sm : space.md }]}>
      <View style={{ width: w, height: h, backgroundColor: compact ? colors.bgDeep : colors.cardRaised, alignItems: 'center', justifyContent: 'center' }}>
        {thumb ? <Image source={{ uri: thumb }} style={{ position: 'absolute', width: '100%', height: '100%' }} /> : null}
        <View style={{ width: compact ? 30 : 38, height: compact ? 30 : 38, borderRadius: 19, backgroundColor: 'rgba(255,255,255,0.92)', alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name={m.kind === 'video' ? 'play' : 'document-text'} size={compact ? 16 : 20} color="#111" style={m.kind === 'video' ? { marginLeft: 3 } : undefined} />
        </View>
      </View>
      <View style={{ flex: 1, padding: compact ? space.sm : space.md, justifyContent: 'center', gap: 2 }}>
        {compact ? null : (
          <Row gap={6}>
            {m.service?.category ? <Badge label={m.service.category} tone="success" /> : <Badge label={m.kind} tone="success" />}
            {watched ? <Ionicons name="checkmark-circle" size={16} color={colors.success} /> : null}
          </Row>
        )}
        <T style={{ fontWeight: '600' }} numberOfLines={2}>{m.title}</T>
        {sub && !compact ? <T variant="muted" numberOfLines={1}>{sub}</T> : null}
        {m.duration_min ? <T variant="small">{m.duration_min} min{compact && watched ? ' · watched' : ''}</T> : null}
      </View>
    </Pressable>
  );
}

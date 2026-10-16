import { Image, Pressable, View } from 'react-native';
import { colors, radius, space } from '../lib/theme';
import type { TrainingMedia } from '../lib/types';
import { Badge, Ionicons, Row, T } from './ui';

/** Video/document row with thumbnail and play button (service detail + Training Center). */
export function MediaCard({ m, thumb, onPress, watched }: { m: TrainingMedia; thumb?: string; onPress: () => void; watched?: boolean }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [{ flexDirection: 'row', backgroundColor: pressed ? colors.cardRaised : colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, overflow: 'hidden', marginBottom: space.md }]}>
      <View style={{ width: 120, height: 92, backgroundColor: colors.cardRaised, alignItems: 'center', justifyContent: 'center' }}>
        {thumb ? <Image source={{ uri: thumb }} style={{ position: 'absolute', width: '100%', height: '100%' }} /> : null}
        <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(255,255,255,0.92)', alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name={m.kind === 'video' ? 'play' : 'document-text'} size={20} color="#111" style={m.kind === 'video' ? { marginLeft: 3 } : undefined} />
        </View>
      </View>
      <View style={{ flex: 1, padding: space.md, justifyContent: 'center', gap: 2 }}>
        <Row gap={6}>
          {m.service?.category ? <Badge label={m.service.category} tone="success" /> : <Badge label={m.kind} tone="success" />}
          {watched ? <Ionicons name="checkmark-circle" size={16} color={colors.success} /> : null}
        </Row>
        <T style={{ fontWeight: '600' }} numberOfLines={2}>{m.title}</T>
        {m.service?.name ? <T variant="muted" numberOfLines={1}>{m.service.name}</T> : null}
        {m.duration_min ? <T variant="small">{m.duration_min} min</T> : null}
      </View>
    </Pressable>
  );
}

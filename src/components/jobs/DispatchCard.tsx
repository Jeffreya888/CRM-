import { Platform, Pressable, View, type ViewStyle } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { colors, radius } from '../../lib/theme';
import { T } from '../ui';

export interface DispatchJob {
  id: string; number: string; title: string | null; status: string; flagged: boolean;
  scheduled_start: string | null; scheduled_end: string | null;
  customer: { name: string } | null; aircraft: { tail_number: string } | null;
  location: { airport_code: string | null; name: string } | null;
  job_assignments: { user_id: string; is_primary: boolean; confirmed: boolean }[];
}

/**
 * A job card on the dispatch board. On phones/tablets: long-press and drag to
 * another technician column or time. On the web: tap to select, then tap a
 * column (handled by the board).
 */
export function DispatchCard({ job, style, selected, isPrimary, label, onTap, onDragStart, onDrop }: {
  job: DispatchJob; style: ViewStyle; selected: boolean; isPrimary: boolean; label: string;
  onTap: () => void;
  onDragStart: () => void;
  /** absolute pointer position (window) and where in the card it was grabbed. Returns nothing; the board decides. */
  onDrop: (absX: number, absY: number, grabY: number) => void;
}) {
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const lifted = useSharedValue(0);
  const grab = useSharedValue(0);
  const anim = useAnimatedStyle(() => ({
    transform: [{ translateX: tx.value }, { translateY: ty.value }, { scale: 1 + lifted.value * 0.04 }],
    zIndex: lifted.value ? 100 : 1,
    shadowOpacity: lifted.value * 0.5,
    elevation: lifted.value * 8,
  }));

  const tentative = job.status === 'tentative';
  const bg = job.flagged ? colors.dangerSoft : tentative ? colors.cardRaised : isPrimary ? colors.primarySoft : colors.infoSoft;
  const border = selected ? colors.accent : job.flagged ? colors.danger : tentative ? colors.textMuted : colors.primary;
  const body = (
    <View style={{ flex: 1, padding: 6, borderRadius: radius.sm, backgroundColor: bg, borderWidth: selected ? 2 : 1, borderColor: border, borderStyle: tentative ? 'dashed' : 'solid', overflow: 'hidden' }}>
      <T variant="small" style={{ color: colors.text, fontWeight: '700' }} numberOfLines={1}>{label}</T>
      <T variant="small" numberOfLines={1} style={{ color: colors.text }}>{job.aircraft?.tail_number ?? job.number} · {job.customer?.name ?? ''}</T>
      <T variant="small" numberOfLines={2}>{job.title ?? ''}{!isPrimary ? ' · crew' : ''}{tentative ? ' · tentative' : ''}</T>
    </View>
  );

  if (Platform.OS === 'web') {
    return (
      <Pressable onPress={onTap} style={[style, { padding: 1 }]} accessibilityLabel={`Job ${job.number}`}>
        {body}
      </Pressable>
    );
  }

  const pan = Gesture.Pan()
    .runOnJS(true)
    .activateAfterLongPress(280)
    .onStart((e) => {
      grab.set(e.y);
      lifted.set(1);
      onDragStart();
    })
    .onUpdate((e) => {
      tx.set(e.translationX);
      ty.set(e.translationY);
    })
    .onEnd((e, success) => {
      if (success) onDrop(e.absoluteX, e.absoluteY, grab.get());
    })
    .onFinalize(() => {
      lifted.set(0);
      tx.set(withTiming(0, { duration: 150 }));
      ty.set(withTiming(0, { duration: 150 }));
    });
  const tap = Gesture.Tap().runOnJS(true).onEnd((_e, success) => { if (success) onTap(); });

  return (
    <GestureDetector gesture={Gesture.Exclusive(pan, tap)}>
      <Animated.View style={[style, { padding: 1, shadowColor: '#000', shadowRadius: 8, shadowOffset: { width: 0, height: 4 } }, anim]} accessibilityLabel={`Job ${job.number}. Long-press to move.`}>
        {body}
      </Animated.View>
    </GestureDetector>
  );
}

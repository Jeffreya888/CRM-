// "3 updates waiting to send": shown while checklist steps, clock times or photos are saved on the phone.
import { Pressable, View } from 'react-native';
import { Ionicons, T } from './ui';
import { tr, useLang } from '../lib/i18n';
import { flushQueue, useOfflineQueue } from '../lib/offlineQueue';
import { colors, space } from '../lib/theme';

export function OfflineBanner() {
  const lang = useLang();
  const ops = useOfflineQueue((s) => s.ops);
  const lastError = useOfflineQueue((s) => s.lastError);
  if (!ops.length && !lastError) return null;
  const photos = ops.filter((o) => o.kind === 'photo').length;
  const es = lang === 'es';
  return (
    <View style={{ backgroundColor: ops.length ? colors.warningSoft : colors.dangerSoft, paddingHorizontal: space.md, paddingVertical: 8 }}>
      {ops.length ? (
        <Pressable onPress={() => void flushQueue()} accessibilityRole="button" style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Ionicons name="cloud-offline-outline" size={16} color={colors.warning} />
          <T variant="small" style={{ flex: 1, color: colors.text }}>
            {es
              ? `${ops.length} ${ops.length === 1 ? 'cambio' : 'cambios'}${photos ? ` (${photos} foto${photos === 1 ? '' : 's'})` : ''} ${tr(lang, 'waiting to send. They send automatically when you’re back online.')}`
              : `${ops.length} update${ops.length === 1 ? '' : 's'}${photos ? ` (${photos} photo${photos === 1 ? '' : 's'})` : ''} waiting to send. They send automatically when you’re back online.`}
          </T>
          <T variant="small" style={{ color: colors.primaryText, fontWeight: '700' }}>{tr(lang, 'Retry')}</T>
        </Pressable>
      ) : (
        <Pressable onPress={() => useOfflineQueue.setState({ lastError: null })} accessibilityRole="button" style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Ionicons name="alert-circle-outline" size={16} color={colors.danger} />
          <T variant="small" style={{ flex: 1, color: colors.text }}>{lastError}</T>
          <T variant="small" style={{ color: colors.primaryText, fontWeight: '700' }}>{tr(lang, 'Dismiss')}</T>
        </Pressable>
      )}
    </View>
  );
}

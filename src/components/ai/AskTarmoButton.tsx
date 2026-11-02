// "Ask Tarmo" in the top bar of every app screen. On a job, aircraft or SOP it passes that context along.
import { router } from 'expo-router';
import { Pressable, Text } from 'react-native';
import { Ionicons } from '../ui';
import { APP_NAME } from '../../lib/config';
import { useIsDesktop } from '../../lib/layout';
import { canEdit } from '../../lib/plans';
import { useOrg } from '../../lib/session';
import { colors, radius, space } from '../../lib/theme';

type Params = Record<string, string | string[] | undefined> | undefined;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Assistant context for the screen with this route name and params ("jobs/[id]", { id }). */
export function askContext(routeName: string, params: Params): Record<string, string> {
  const id = one(params?.id);
  if (!id) return {};
  if (routeName === 'jobs/[id]' && UUID.test(id)) return { job_id: id };
  if (routeName === 'aircraft/[id]' && UUID.test(id)) return { aircraft_id: id };
  if (routeName === 'guides/[id]' && /^[a-z0-9_]{1,64}$/.test(id)) return { guide_key: id };
  return {};
}

export function AskTarmoButton({ context }: { context?: Record<string, string> }) {
  const { role } = useOrg();
  const desktop = useIsDesktop();
  if (!canEdit(role)) return null;
  const about = context?.job_id ? ' about this job' : context?.aircraft_id ? ' about this aircraft' : context?.guide_key ? ' about this SOP' : '';
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`Ask ${APP_NAME}${about}`} hitSlop={6}
      onPress={() => router.push({ pathname: '/assistant/[id]', params: { id: 'new', ...context } })}
      style={({ pressed }) => [{
        flexDirection: 'row', alignItems: 'center', gap: 6, height: 38, paddingHorizontal: desktop ? space.md : 10,
        borderRadius: radius.pill, backgroundColor: colors.primarySoft,
      }, pressed && { opacity: 0.7 }]}>
      <Ionicons name="sparkles" size={18} color={colors.primaryText} />
      {desktop ? <Text style={{ color: colors.primaryText, fontWeight: '700', fontSize: 14 }}>Ask {APP_NAME}</Text> : null}
    </Pressable>
  );
}

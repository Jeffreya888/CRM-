import { router } from 'expo-router';
import { View } from 'react-native';
import { money } from '../../lib/format';
import { CARE_PLAN_LABEL, describeRepeat, fmtInTz, scheduleState, type Pattern } from '../../lib/recurring';
import { space } from '../../lib/theme';
import type { RecurringSchedule } from '../../lib/types';
import { Badge, ListRow, Row, StatTile } from '../ui';

export type ScheduleListItem = RecurringSchedule & {
  customer: { name: string } | null;
  aircraft: { tail_number: string } | null;
  service: { name: string } | null;
};

export const STATE_TONE = { active: 'success', paused: 'warning', ended: 'neutral' } as const;
export const CARE_PLAN_TONE: Record<string, 'success' | 'warning' | 'danger' | 'neutral'> = {
  pending: 'warning', active: 'success', past_due: 'danger', canceled: 'neutral',
};

export function ScheduleRow({ s, showMoney, techName, nextAt }: { s: ScheduleListItem; showMoney: boolean; techName?: string | null; nextAt?: string | null }) {
  const state = scheduleState(s);
  const title = s.title || s.service?.name || 'Recurring care';
  const who = [s.customer?.name, s.aircraft?.tail_number].filter(Boolean).join(' · ');
  const repeat = describeRepeat(s.every, s.unit, s.pattern as Pattern);
  const price = showMoney ? (s.billing === 'care_plan' ? `${money(s.care_plan_amount)}/mo plan` : `${money(s.price)}/visit`) : null;
  const meta = [repeat, nextAt && state === 'active' ? `next ${fmtInTz(nextAt, s.timezone, false)}` : null, price].filter(Boolean).join(' · ');
  return (
    <ListRow icon="repeat-outline" tone={state === 'active' ? 'primary' : 'neutral'} title={title} subtitle={`${who}${techName ? ` · ${techName}` : !s.default_user_id ? ' · No technician' : ''}`}
      meta={meta}
      right={
        <View style={{ alignItems: 'flex-end', gap: 4 }}>
          <Badge label={state} tone={STATE_TONE[state]} />
          {s.billing === 'care_plan' && s.care_plan_status ? <Badge label={CARE_PLAN_LABEL[s.care_plan_status] ?? s.care_plan_status} tone={CARE_PLAN_TONE[s.care_plan_status]} raw /> : null}
        </View>
      }
      onPress={() => router.push({ pathname: '/recurring/[id]', params: { id: s.id } })} />
  );
}

export function PlanHealth({ active, mrr, visitsThisMonth, unassigned, showMoney, onUnassigned }: {
  active: number; mrr: number; visitsThisMonth: number; unassigned: number; showMoney: boolean; onUnassigned?: () => void;
}) {
  return (
    <View style={{ gap: space.md, marginBottom: space.lg }}>
      <Row gap={space.md} style={{ flexWrap: 'wrap' }}>
        <StatTile label="Active schedules" value={active} icon="repeat-outline" />
        {showMoney ? <StatTile label="Monthly recurring revenue" value={money(mrr).replace(/\.\d\d$/, '')} icon="trending-up-outline" tone="success" /> : null}
      </Row>
      <Row gap={space.md} style={{ flexWrap: 'wrap' }}>
        <StatTile label="Visits this month" value={visitsThisMonth} icon="calendar-outline" tone="info" />
        <StatTile label="No technician" value={unassigned} icon="person-remove-outline" tone={unassigned ? 'warning' : 'neutral'} onPress={onUnassigned} />
      </Row>
    </View>
  );
}

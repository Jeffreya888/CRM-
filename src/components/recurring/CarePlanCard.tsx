import * as Clipboard from 'expo-clipboard';
import { useState } from 'react';
import { Share } from 'react-native';
import { money } from '../../lib/format';
import { CARE_PLAN_LABEL } from '../../lib/recurring';
import { callFunction, friendlyError } from '../../lib/supabase';
import { space } from '../../lib/theme';
import type { RecurringSchedule } from '../../lib/types';
import { confirmAction, notify } from '../FormSheet';
import { Badge, Button, Card, ErrorBanner, Row, T } from '../ui';
import { CARE_PLAN_TONE } from './RecurringBits';

/** Monthly care plan: send the card-on-file link (Stripe or Square), show status, cancel. */
export function CarePlanCard({ schedule, onChanged }: { schedule: RecurringSchedule; onChanged: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const status = schedule.care_plan_status;
  const start = async () => {
    setError(null);
    try {
      const r = await callFunction<{ url?: string }>('care-plan', { action: 'start', schedule_id: schedule.id });
      onChanged();
      if (r?.url) {
        setLink(r.url);
        try { await Share.share({ message: `Set up your monthly care plan: ${r.url}`, url: r.url }); } catch {}
      }
    } catch (e: any) { setError(friendlyError(e.message ?? String(e))); }
  };
  const cancel = () => confirmAction('Cancel care plan?', 'The customer will no longer be charged monthly.', async () => {
    try { await callFunction('care-plan', { action: 'cancel', schedule_id: schedule.id }); onChanged(); notify('Care plan canceled'); }
    catch (e: any) { setError(friendlyError(e.message ?? String(e))); }
  });
  return (
    <Card>
      <ErrorBanner message={error} />
      <Row style={{ justifyContent: 'space-between', marginBottom: space.sm }}>
        <T style={{ fontWeight: '600' }}>Card on file</T>
        <Badge label={status ? CARE_PLAN_LABEL[status] ?? status : 'Not started'} tone={status ? CARE_PLAN_TONE[status] : 'neutral'} raw />
      </Row>
      {status === 'active' ? <T variant="muted" style={{ marginBottom: space.md }}>The customer is charged {money(schedule.care_plan_amount)} every month.</T> : null}
      {status === 'past_due' ? <T variant="muted" style={{ marginBottom: space.md }}>The last charge failed. Send a new link so they can update their card.</T> : null}
      {status !== 'active' ? <Button small icon="send-outline" title={status === 'pending' || status === 'past_due' ? 'Send card-on-file link again' : 'Send card-on-file link'} onPress={start} /> : null}
      {link ? (
        <Row gap={space.sm} style={{ marginTop: space.md }}>
          <T variant="small" numberOfLines={1} style={{ flex: 1 }}>{link}</T>
          <Button small kind="secondary" icon="copy-outline" title="Copy" onPress={async () => { await Clipboard.setStringAsync(link); notify('Link copied'); }} />
        </Row>
      ) : null}
      {status && status !== 'canceled' ? <Button small kind="ghost" icon="close-circle-outline" title="Cancel care plan" onPress={cancel} style={{ marginTop: space.sm, alignSelf: 'flex-start' }} /> : null}
    </Card>
  );
}

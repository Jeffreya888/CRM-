import * as Clipboard from 'expo-clipboard';
import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { AutomationCard } from '../../../components/automations/AutomationCard';
import { AUTOMATION_ORDER, hourLabel } from '../../../components/automations/meta';
import { notify } from '../../../components/FormSheet';
import { Gate } from '../../../components/Gate';
import { Button, Card, EmptyState, ErrorBanner, ListRow, Loading, Row, Screen, Section, Select, T } from '../../../components/ui';
import { PORTAL_URL } from '../../../lib/config';
import { canAdmin, canSeeMoney } from '../../../lib/plans';
import { useOrg } from '../../../lib/session';
import { friendlyError, must, supabase } from '../../../lib/supabase';
import { space } from '../../../lib/theme';
import type { Automation } from '../../../lib/types';
import { useQuery } from '../../../lib/useQuery';

type Row_ = Automation & { updated_at: string };

export default function Automations() {
  return (
    <Gate feature="reminders">
      <Inner />
    </Gate>
  );
}

function Inner() {
  const { org, orgId, role, refresh } = useOrg();
  const editable = canAdmin(role);
  const q = useQuery(async () => (await must(supabase.from('automations').select('*').eq('org_id', orgId))) as Row_[], [orgId]);

  if (!canSeeMoney(role)) return <Screen><Stack.Screen options={{ title: 'Automations' }} /><EmptyState icon="lock-closed-outline" title="Managers only" /></Screen>;
  if (q.loading && !q.data) return <><Stack.Screen options={{ title: 'Automations' }} /><Loading /></>;

  const rows = AUTOMATION_ORDER.map((k) => (q.data ?? []).find((r) => r.key === k)).filter(Boolean) as Row_[];
  const portal = `${PORTAL_URL}/portal/c/${org.public_slug}`;

  return (
    <Screen refreshing={q.refreshing} onRefresh={q.refresh}>
      <Stack.Screen options={{ title: 'Automations' }} />
      <ErrorBanner message={q.error} onRetry={q.reload} />
      <T variant="muted" style={{ marginBottom: space.md }}>
        Messages Flight Ready sends to your customers for you.{editable ? '' : ' Only the owner or an admin can change these.'}
      </T>
      <Card style={{ padding: 0, overflow: 'hidden' }}>
        <ListRow icon="mail-outline" title="Message log" subtitle="Every email and text, with delivery status" onPress={() => router.push('/messages')} />
        <ListRow icon="chatbubbles-outline" title="Customer texting" subtitle={org.sms_status === 'active' ? `On · ${org.sms_number ?? ''}` : 'Optional · off by default'} onPress={() => router.push('/texting')} />
      </Card>

      <Section title="Automations" icon="flash-outline">
        {!rows.length && !q.error ? <EmptyState icon="flash-outline" title="No automations yet" body="Pull down to refresh." /> : null}
        {rows.map((a) => (
          <AutomationCard key={`${a.key}:${a.updated_at}`} a={a} editable={editable} smsActive={org.sms_status === 'active' && org.sms_enabled}
            hasReviewLink={!!org.google_review_url} onSaved={q.reload} />
        ))}
      </Section>

      <QuietHours start={org.quiet_hours_start} end={org.quiet_hours_end} editable={editable} orgId={orgId} onSaved={refresh} />

      <Section title="Customer portal" icon="globe-outline">
        <Card>
          <T variant="muted" style={{ marginBottom: space.md }}>
            Customers sign in with a one-time code sent to their email to see their assets, upcoming visits, photos, quotes and invoices, and to request bookings.
          </T>
          <T numberOfLines={2} style={{ marginBottom: space.md }}>{PORTAL_URL ? portal : 'The portal web address is not configured yet.'}</T>
          {PORTAL_URL ? (
            <Button small kind="secondary" icon="copy-outline" title="Copy portal link" style={{ alignSelf: 'flex-start' }}
              onPress={async () => { await Clipboard.setStringAsync(portal); notify('Link copied'); }} />
          ) : null}
        </Card>
      </Section>
    </Screen>
  );
}

const HOURS = Array.from({ length: 24 }, (_, h) => ({ value: String(h), label: hourLabel(h) }));
const END_HOURS = Array.from({ length: 24 }, (_, i) => ({ value: String(i + 1), label: hourLabel(i + 1) }));

function QuietHours({ start, end, editable, orgId, onSaved }: { start: number; end: number; editable: boolean; orgId: string; onSaved: () => Promise<void> }) {
  const [s, setS] = useState(String(start));
  const [e, setE] = useState(String(end));
  const [error, setError] = useState<string | null>(null);
  const dirty = s !== String(start) || e !== String(end);
  const save = async () => {
    setError(null);
    if (Number(s) >= Number(e)) return setError('The end time must be after the start time.');
    const { error: err } = await supabase.from('organizations').update({ quiet_hours_start: Number(s), quiet_hours_end: Number(e) }).eq('id', orgId);
    if (err) return setError(friendlyError(err.message));
    await onSaved();
    notify('Quiet hours saved');
  };
  return (
    <Section title="Quiet hours for texts" icon="moon-outline">
      <Card>
        <ErrorBanner message={error} />
        <T variant="muted" style={{ marginBottom: space.md }}>
          Texts are only sent between these hours in your company time zone; anything outside waits until the window opens. Emails are not held.
        </T>
        <Row gap={space.md}>
          <View style={{ flex: 1 }}><Select label="Send from" value={s} options={HOURS} disabled={!editable} onChange={(v) => v && setS(v)} /></View>
          <View style={{ flex: 1 }}><Select label="Until" value={e} options={END_HOURS} disabled={!editable} onChange={(v) => v && setE(v)} /></View>
        </Row>
        {dirty && editable ? <Button small icon="checkmark" title="Save quiet hours" onPress={save} style={{ alignSelf: 'flex-start' }} /> : null}
      </Card>
    </Section>
  );
}

// Calendar sync: a private link that adds Tarmo jobs to Google Calendar, Apple Calendar or Outlook.
// The calendar app checks the link on its own schedule, so new and changed jobs show up automatically.
import * as Clipboard from 'expo-clipboard';
import * as Linking from 'expo-linking';
import { useState } from 'react';
import { confirmAction, notify } from '../FormSheet';
import { Button, Card, ErrorBanner, Row, Section, Segmented, T } from '../ui';
import { SUPABASE_URL } from '../../lib/config';
import { useOrg } from '../../lib/session';
import { friendlyError, must, supabase } from '../../lib/supabase';
import { space } from '../../lib/theme';
import { useQuery } from '../../lib/useQuery';

type Scope = 'mine' | 'all';

export const feedUrl = (token: string) => `${SUPABASE_URL}/functions/v1/calendar-feed?token=${token}`;
export const webcalUrl = (token: string) => feedUrl(token).replace(/^https?:\/\//, 'webcal://');
export const googleUrl = (token: string) => `https://calendar.google.com/calendar/render?cid=${encodeURIComponent(webcalUrl(token))}`;

export function CalendarSyncSection() {
  const { orgId, role } = useOrg();
  const manager = role === 'owner' || role === 'admin' || role === 'manager';
  const [scope, setScope] = useState<Scope>('mine');
  const q = useQuery(async () => (await must(supabase.rpc('calendar_feed_token', { p_org: orgId, p_scope: scope }))) as string, [orgId, scope]);
  const [error, setError] = useState<string | null>(null);
  const token = q.data;
  const open = async (url: string) => { try { await Linking.openURL(url); } catch (e: any) { setError(friendlyError(e.message)); } };
  const reset = () => confirmAction('Make a new link?', 'The old link stops working. Calendars that use it stop updating until you add the new one.', async () => {
    try { await must(supabase.rpc('calendar_feed_token', { p_org: orgId, p_scope: scope, p_reset: true })); await q.reload(); notify('New link ready', 'Add it to your calendar again.'); }
    catch (e: any) { setError(friendlyError(e.message)); }
  });

  return (
    <Section title="Calendar sync" icon="calendar-outline">
      <Card>
        <T variant="muted" style={{ marginBottom: space.md }}>
          Add your Tarmo jobs to Google Calendar, Apple Calendar or Outlook. New and changed jobs show up on their own (Google can take a few hours).
          The link is private: anyone with it can see the jobs, so don&apos;t share it.
        </T>
        {manager ? (
          <Segmented value={scope} onChange={setScope} options={[{ value: 'mine', label: 'My jobs' }, { value: 'all', label: 'All company jobs' }]} />
        ) : null}
        <ErrorBanner message={error ?? q.error} onRetry={q.reload} />
        {token ? (
          <>
            <Row style={{ flexWrap: 'wrap' }} gap={space.sm}>
              <Button small icon="logo-google" title="Google Calendar" onPress={() => open(googleUrl(token))} />
              <Button small kind="secondary" icon="calendar-outline" title="Apple Calendar / Outlook" onPress={() => open(webcalUrl(token))} />
            </Row>
            <Row style={{ flexWrap: 'wrap', marginTop: space.sm }} gap={space.sm}>
              <Button small kind="ghost" icon="copy-outline" title="Copy link"
                onPress={async () => { await Clipboard.setStringAsync(feedUrl(token)); notify('Link copied', 'In Outlook on the web: Add calendar → Subscribe from web, then paste it.'); }} />
              <Button small kind="ghost" icon="refresh-outline" title="New link" onPress={reset} />
            </Row>
          </>
        ) : null}
      </Card>
    </Section>
  );
}

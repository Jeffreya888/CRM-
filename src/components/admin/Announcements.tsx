// Platform admin → Announcements: a banner every customer sees in the app, optionally emailed too. Owners only.
import { useState } from 'react';
import { View } from 'react-native';
import { confirmAction, notify } from '../FormSheet';
import { Badge, Button, Card, ErrorBanner, Field, Loading, Row, Section, Segmented, T, ToggleRow } from '../ui';
import { date, relative } from '../../lib/format';
import { friendlyError, must, supabase } from '../../lib/supabase';
import { colors, space } from '../../lib/theme';
import { useQuery } from '../../lib/useQuery';

type Item = {
  id: string; title: string; body: string; level: 'info' | 'warning'; audience: 'all' | 'owners'; url: string | null;
  ends_at: string | null; ended_at: string | null; send_email: boolean; emailed_at: string | null; created_at: string;
  active: boolean; recipients: number; emails_sent: number;
};

export function Announcements() {
  const q = useQuery(async () => (await must(supabase.rpc('platform_announcements_list'))) as Item[], []);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [url, setUrl] = useState('');
  const [level, setLevel] = useState<'info' | 'warning'>('info');
  const [audience, setAudience] = useState<'all' | 'owners'>('all');
  const [days, setDays] = useState('7');
  const [email, setEmail] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const urlOk = !url.trim() || /^(https:\/\/|\/)/.test(url.trim());
  const daysOk = Number.isInteger(Number(days)) && Number(days) >= 1 && Number(days) <= 90;

  const post = () => confirmAction(
    email ? 'Post and email?' : 'Post this announcement?',
    `${audience === 'all' ? 'Everyone' : 'Company owners and admins'} will see it in the app for ${days} days${email ? ', and get it by email' : ''}.`,
    async () => {
      setBusy(true);
      setError(null);
      try {
        await must(supabase.rpc('platform_post_announcement', {
          p_title: title.trim(), p_body: body.trim(), p_level: level, p_audience: audience, p_days: Number(days), p_email: email, p_url: url.trim() || null,
        }));
        setTitle(''); setBody(''); setUrl(''); setEmail(false);
        await q.reload();
        notify('Posted', email ? 'It shows in the app now. Emails go out over the next few minutes.' : 'It shows in the app now.');
      } catch (e: any) { setError(friendlyError(e.message)); } finally { setBusy(false); }
    });

  const end = (a: Item) => confirmAction(`End “${a.title}”?`, 'It stops showing in the app right away. Emails already sent stay sent.', async () => {
    try { await must(supabase.rpc('platform_end_announcement', { p_id: a.id })); await q.reload(); } catch (e: any) { notify('Could not end it', friendlyError(e.message)); }
  });

  return (
    <>
      <Section title="New announcement" icon="megaphone-outline">
        <Card>
          <T variant="muted" style={{ marginBottom: space.md }}>Shows as a banner at the top of the app until it ends or the person closes it. Use it for new features, maintenance or price changes.</T>
          <Field label="Title" value={title} onChangeText={setTitle} maxLength={120} placeholder="New: Spanish for technicians" />
          <Field label="Message (optional)" value={body} onChangeText={setBody} maxLength={1000} multiline placeholder="Each technician can switch in Account & security → Language." />
          <Field label="Link (optional)" value={url} onChangeText={setUrl} autoCapitalize="none" placeholder="/account or https://gettarmo.com/…" error={urlOk ? null : 'Start with https:// or /'} />
          <T style={{ fontWeight: '600', marginBottom: space.xs }}>Who sees it</T>
          <Segmented value={audience} onChange={setAudience} options={[{ value: 'all', label: 'Everyone' }, { value: 'owners', label: 'Owners & admins' }]} />
          <T style={{ fontWeight: '600', marginVertical: space.xs }}>Style</T>
          <Segmented value={level} onChange={setLevel} options={[{ value: 'info', label: 'News' }, { value: 'warning', label: 'Important' }]} />
          <Field label="Show for (days)" value={days} onChangeText={setDays} keyboardType="number-pad" error={daysOk ? null : '1 to 90 days'} style={{ marginTop: space.md }} />
          <ToggleRow label="Also email it" value={email} onChange={setEmail} hint="Sent once to each person who would see it, from Tarmo." />
          <ErrorBanner message={error ?? q.error} />
          <Button icon="send-outline" title={email ? 'Post and email' : 'Post'} loading={busy} disabled={!title.trim() || !urlOk || !daysOk} onPress={post} />
        </Card>
      </Section>

      <Section title="Posted" icon="time-outline">
        {q.loading ? <Loading /> : (q.data ?? []).length === 0 ? <Card><T variant="muted">Nothing posted yet.</T></Card> : (q.data ?? []).map((a) => (
          <Card key={a.id}>
            <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }} gap={space.sm}>
              <View style={{ flex: 1 }}>
                <T style={{ fontWeight: '700' }}>{a.title}</T>
                {a.body ? <T variant="small">{a.body}</T> : null}
                <T variant="small" style={{ color: colors.textFaint, marginTop: 4 }}>
                  {a.audience === 'all' ? 'Everyone' : 'Owners & admins'} · {a.recipients} people · posted {relative(a.created_at)}
                  {a.active ? (a.ends_at ? ` · until ${date(a.ends_at)}` : '') : ' · ended'}
                  {a.send_email ? ` · ${a.emails_sent} of ${a.recipients} emailed` : ''}
                </T>
              </View>
              <Badge label={a.active ? 'Showing' : 'Ended'} tone={a.active ? (a.level === 'warning' ? 'warning' : 'success') : 'neutral'} raw />
            </Row>
            {a.active ? <Button small kind="ghost" icon="stop-circle-outline" title="End now" onPress={() => end(a)} style={{ marginTop: space.sm, alignSelf: 'flex-start' }} /> : null}
          </Card>
        ))}
      </Section>
    </>
  );
}

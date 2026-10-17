import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { SvgXml } from 'react-native-svg';
import { copyLink, emailDocument, exportPdf, shareLink } from '../../../components/DocumentActions';
import { confirmAction, FormSheet, notify } from '../../../components/FormSheet';
import { QuotePhotos } from '../../../components/quotes/QuotePhotos';
import { countdown, deadlineOf, declineLabel, DECLINE_REASONS, effectiveStatus, viewedLabel } from '../../../components/quotes/quoteUtils';
import { quoteTone } from '../../../components/status';
import { Badge, Button, Card, Divider, EmptyState, ErrorBanner, IconButton, Ionicons, KeyValue, ListRow, Loading, Row, Screen, Section, T } from '../../../components/ui';
import { safeSignatureSvg } from '../../../lib/documents';
import { date, dateTime, money } from '../../../lib/format';
import { isManager } from '../../../lib/plans';
import { useOrg } from '../../../lib/session';
import { friendlyError, supabase } from '../../../lib/supabase';
import { colors, radius, space } from '../../../lib/theme';
import { useQuery } from '../../../lib/useQuery';
import type { LineItem, Quote, QuoteOption } from '../../../lib/types';

type Detail = Quote & {
  created_at: string; follow_ups_sent: number; last_follow_up_at: string | null; signature_svg: string | null;
  customer: { id: string; name: string; email: string | null } | null;
  aircraft: { id: string; tail_number: string; manufacturer: string | null; model: string | null } | null;
  location: { name: string; airport_code: string | null } | null;
  branch: { name: string } | null;
};
interface TimelineItem { at: string; icon: React.ComponentProps<typeof Ionicons>['name']; text: string; tone?: string }

export default function QuoteDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { org, role, perm } = useOrg();
  const [declineSheet, setDeclineSheet] = useState(false);
  const [deadlineSheet, setDeadlineSheet] = useState(false);
  const allowed = perm('see_prices');

  const q = useQuery(async () => {
    if (!allowed) return null;
    const [d, options, items, jobs, requests, messages] = await Promise.all([
      supabase.from('quotes').select('*, customer:customers(id, name, email), aircraft:aircraft(id, tail_number, manufacturer, model), location:locations(name, airport_code), branch:branches(name)').eq('id', id).single(),
      supabase.from('quote_options').select('*').eq('quote_id', id).order('sort_order'),
      supabase.from('quote_items').select('*').eq('quote_id', id).order('sort_order'),
      supabase.from('jobs').select('id, number, status, scheduled_start').eq('quote_id', id).neq('status', 'cancelled').order('created_at'),
      supabase.from('booking_requests').select('id, kind, status, preferred, notes, created_at').eq('quote_id', id).order('created_at'),
      supabase.from('messages').select('id, channel, status, subject, automation_key, created_at, sent_at').eq('quote_id', id).order('created_at').limit(50),
    ]);
    if (d.error) throw d.error;
    const doc = d.data as unknown as Detail;
    // Version chain: all quotes sharing the base number ("Q-1001", "Q-1001-v2", …).
    const base = doc.number.replace(/-v\d+$/, '');
    const { data: chain } = await supabase.from('quotes').select('id, number, version, status, created_at, superseded_by')
      .eq('org_id', doc.org_id).or(`number.eq."${base}",number.like."${base}-v%"`).order('version');
    return {
      d: doc,
      options: (options.data ?? []) as QuoteOption[],
      items: (items.data ?? []) as LineItem[],
      jobs: (jobs.data ?? []) as { id: string; number: string; status: string; scheduled_start: string | null }[],
      requests: (requests.data ?? []) as { id: string; kind: string; status: string; preferred: string[]; notes: string | null; created_at: string }[],
      messages: (messages.data ?? []) as { id: string; channel: string; status: string; subject: string | null; automation_key: string | null; created_at: string }[],
      versions: (chain ?? []) as { id: string; number: string; version: number; status: Quote['status']; created_at: string; superseded_by: string | null }[],
    };
  }, [id, allowed]);

  if (!allowed) return <Screen><Stack.Screen options={{ title: 'Quote' }} /><EmptyState icon="lock-closed-outline" title="Quotes are hidden for your role" body="Ask your company owner for access to prices." /></Screen>;
  if (q.loading) return <Loading />;
  if (!q.data) return <Screen><Stack.Screen options={{ title: 'Quote' }} /><ErrorBanner message={q.error ?? 'Quote not found'} onRetry={q.reload} /></Screen>;

  const { d, options, items, jobs, requests, messages, versions } = q.data;
  const cur = org.currency;
  const status = effectiveStatus(d);
  const deadline = deadlineOf(d);
  const chosen = options.find((o) => o.id === d.selected_option_id) ?? null;
  const job = jobs[0] ?? null;
  const manager = isManager(role);
  const superseded = !!d.superseded_by;
  const canRevise = !superseded && ['sent', 'viewed', 'declined', 'expired'].includes(d.status);
  const openStatus = d.status === 'sent' || d.status === 'viewed';
  const run = (fn: () => Promise<unknown>) => async () => { try { await fn(); await q.reload(); } catch (e: any) { notify('Something went wrong', friendlyError(e.message)); } };

  const send = run(async () => {
    if (!d.customer?.email) throw new Error('This customer has no email address. Add one, or copy the link and send it yourself.');
    if (deadline && deadline.getTime() < Date.now()) throw new Error('The approval deadline has passed. Edit the quote (or create a new version) with a later deadline first.');
    await emailDocument('quote', id);
  });

  const newVersion = run(async () => {
    const { data, error } = await supabase.rpc('revise_quote', { p_quote: id });
    if (error) throw error;
    router.push({ pathname: '/quotes/edit', params: { id: data as string } });
  });

  const convert = run(async () => {
    if (job) { router.push(`/jobs/${job.id}`); return; }
    const start = new Date(); start.setDate(start.getDate() + 1); start.setHours(9, 0, 0, 0);
    const { data, error } = await supabase.rpc('convert_quote_to_job', { p_quote: id, p_start: start.toISOString() });
    if (error) throw error;
    router.push({ pathname: '/jobs/edit', params: { id: data as string, then: 'detail' } });
  });

  const markSent = run(async () => {
    const { error } = await supabase.from('quotes').update({ status: 'sent' }).eq('id', id);
    if (error) throw error;
  });

  // Timeline from tracking columns, requests and the message log.
  const timeline: TimelineItem[] = [
    { at: d.created_at, icon: 'create-outline', text: `Created${d.version > 1 ? ` (version ${d.version})` : ''}` },
    d.sent_at ? { at: d.sent_at, icon: 'paper-plane-outline', text: 'Sent to customer' } : null,
    d.first_viewed_at ? { at: d.first_viewed_at, icon: 'eye-outline', text: 'First opened by customer' } : null,
    d.last_viewed_at && d.last_viewed_at !== d.first_viewed_at ? { at: d.last_viewed_at, icon: 'eye-outline', text: `Last opened (${d.view_count}× total)` } : null,
    d.last_follow_up_at ? { at: d.last_follow_up_at, icon: 'repeat-outline', text: `Automatic follow-up sent (${d.follow_ups_sent} total)` } : null,
    d.accepted_at ? { at: d.accepted_at, icon: 'checkmark-circle-outline', text: `Accepted${d.accepted_name ? ` by ${d.accepted_name}` : ''}${chosen ? ` · ${chosen.name}` : ''}` } : null,
    d.deposit_paid_at ? { at: d.deposit_paid_at, icon: 'card-outline', text: `Deposit paid (${money(d.deposit_amount, cur)})` } : null,
    d.declined_at ? { at: d.declined_at, icon: 'close-circle-outline', text: `Declined · ${declineLabel(d.decline_reason)}` } : null,
    ...requests.map((r) => ({ at: r.created_at, icon: 'calendar-outline' as const, text: `Customer suggested ${r.preferred.length} date${r.preferred.length === 1 ? '' : 's'} (${r.status})` })),
    ...messages.map((m) => ({ at: m.created_at, icon: (m.channel === 'sms' ? 'chatbubble-outline' : 'mail-outline') as TimelineItem['icon'], text: `${m.subject ?? (m.automation_key ? 'Automatic message' : 'Message')} · ${m.status}` })),
  ].filter(Boolean) as TimelineItem[];
  timeline.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());

  const signature = safeSignatureSvg(d.signature_svg);

  return (
    <Screen refreshing={q.refreshing} onRefresh={q.refresh}>
      <Stack.Screen options={{
        title: d.number,
        headerRight: () => d.status === 'draft' ? <IconButton icon="create-outline" label="Edit" onPress={() => router.push({ pathname: '/quotes/edit', params: { id } })} /> : null,
      }} />

      {superseded ? (
        <Card style={{ backgroundColor: colors.warningSoft, borderColor: colors.warningSoft }}>
          <Row>
            <Ionicons name="git-branch-outline" size={20} color={colors.warning} />
            <T style={{ flex: 1 }}>This version was replaced. The customer&apos;s old link points them to the newer one.</T>
          </Row>
          <Button small kind="secondary" title="Open newest version" style={{ marginTop: space.sm, alignSelf: 'flex-start' }} onPress={() => router.replace(`/quotes/${d.superseded_by}`)} />
        </Card>
      ) : null}

      <Card>
        <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <View style={{ flex: 1 }}>
            <T variant="overline">Quote {d.number}{d.version > 1 ? ` · v${d.version}` : ''}</T>
            <T variant="h1">{options.length > 1 && !chosen ? `From ${money(Math.min(...options.map((o) => Number(o.total))), cur)}` : money(chosen?.total ?? d.total, cur)}</T>
            {options.length > 1 ? <T variant="muted">{chosen ? `${chosen.name} package` : `${options.length} packages to choose from`}</T> : null}
          </View>
          <Badge label={status} tone={quoteTone[status]} large />
        </Row>
        <Divider />
        <KeyValue label="Customer" value={d.customer?.name} onPress={d.customer ? () => router.push(`/customers/${d.customer!.id}`) : undefined} />
        <KeyValue label="Asset" value={d.aircraft ? [d.aircraft.tail_number, d.aircraft.manufacturer, d.aircraft.model].filter(Boolean).join(' ') : null}
          onPress={d.aircraft ? () => router.push(`/aircraft/${d.aircraft!.id}`) : undefined} />
        <KeyValue label="Facility" value={d.location ? [d.location.airport_code, d.location.name].filter(Boolean).join(' · ') : null} />
        <KeyValue label="Location" value={d.branch?.name} />
        <KeyValue label="Quote date" value={date(d.issue_date)} />
        <KeyValue label="Approve by" value={deadline ? `${dateTime(deadline)}${openStatus ? ` · ${countdown(deadline)}` : ''}` : null} />
        {job ? <KeyValue label="Job" value={`${job.number} · ${job.status.replace('_', ' ')}`} onPress={() => router.push(`/jobs/${job.id}`)} /> : null}
      </Card>

      <Row style={{ flexWrap: 'wrap', marginBottom: space.sm }}>
        {!superseded && d.status !== 'accepted' && d.status !== 'declined' ? (
          <Button small icon="mail-outline" title={d.status === 'draft' ? 'Send' : 'Resend'} onPress={send} />
        ) : null}
        <Button small kind="secondary" icon="link-outline" title="Copy link" onPress={run(async () => {
          if (d.status === 'draft') await supabase.from('quotes').update({ status: 'sent' }).eq('id', id);
          await copyLink('quote', d.public_token);
        })} />
        <Button small kind="secondary" icon="share-outline" title="Share" onPress={run(async () => {
          if (d.status === 'draft') await supabase.from('quotes').update({ status: 'sent' }).eq('id', id);
          await shareLink('quote', d.public_token, d.number, org.name);
        })} />
        <Button small kind="secondary" icon="document-outline" title="PDF" onPress={run(() => exportPdf(org, 'quote', id))} />
      </Row>
      {d.status === 'draft' ? <T variant="small" style={{ marginBottom: space.md }}>Copying or sharing the link marks the quote as sent and locks it.</T> : null}

      <Section title="Tracking" icon="eye-outline">
        <Card>
          <KeyValue label="Sent" value={d.sent_at ? dateTime(d.sent_at) : 'Not sent yet'} />
          <KeyValue label="Opened" value={viewedLabel(d) ?? (d.sent_at ? 'Not opened yet' : '—')} />
          {d.first_viewed_at ? <KeyValue label="First opened" value={dateTime(d.first_viewed_at)} /> : null}
          {d.follow_ups_sent ? <KeyValue label="Follow-ups" value={`${d.follow_ups_sent} sent${d.last_follow_up_at ? ` · last ${dateTime(d.last_follow_up_at)}` : ''}`} /> : null}
        </Card>
      </Section>

      {d.deposit_type !== 'none' || Number(d.deposit_amount) > 0 ? (
        <Section title="Deposit" icon="wallet-outline">
          <Card>
            <KeyValue label="Deposit" value={`${money(d.deposit_amount, cur)}${d.deposit_type === 'percent' ? ` (${Number(d.deposit_value)}%)` : ''}`} />
            <KeyValue label="Status" value={d.deposit_paid_at ? <Badge label={`Paid ${date(d.deposit_paid_at)}`} tone="success" raw /> : d.status === 'accepted' ? <Badge label="Waiting for payment" tone="warning" raw /> : 'Due when accepted'} />
            {d.deposit_paid_at ? <T variant="small">The deposit is credited automatically on the invoice for this job.</T> : null}
          </Card>
        </Section>
      ) : null}

      {d.status === 'accepted' ? (
        <Section title="Accepted" icon="checkmark-circle-outline" iconColor={colors.success}>
          <Card>
            <KeyValue label="Signed by" value={d.accepted_name ?? 'Marked accepted in the app'} />
            <KeyValue label="When" value={dateTime(d.accepted_at)} />
            {chosen ? <KeyValue label="Package" value={`${chosen.name} · ${money(chosen.total, cur)}`} /> : null}
            {signature ? (
              <View style={{ backgroundColor: colors.white, borderRadius: radius.md, padding: space.sm, marginTop: space.sm, alignItems: 'center' }}>
                <SvgXml xml={signature} width="100%" height={120} />
              </View>
            ) : null}
          </Card>
        </Section>
      ) : null}

      {d.status === 'declined' ? (
        <Section title="Declined" icon="close-circle-outline" iconColor={colors.danger}>
          <Card>
            <KeyValue label="Reason" value={declineLabel(d.decline_reason)} />
            <KeyValue label="Note" value={d.decline_note} />
            <KeyValue label="When" value={dateTime(d.declined_at)} />
          </Card>
        </Section>
      ) : null}

      {requests.length ? (
        <Section title="Preferred dates from customer" icon="calendar-outline">
          {requests.map((r) => (
            <Card key={r.id}>
              <Row style={{ justifyContent: 'space-between' }}><T variant="muted">{dateTime(r.created_at)}</T><Badge label={r.status} tone={r.status === 'approved' ? 'success' : r.status === 'declined' ? 'danger' : 'warning'} /></Row>
              {r.preferred.map((p) => <T key={p} style={{ marginTop: 4 }}>• {dateTime(p)}</T>)}
              {r.notes ? <T variant="muted" style={{ marginTop: 4 }}>{r.notes}</T> : null}
            </Card>
          ))}
          {manager ? <Button small kind="secondary" title="Review requests" onPress={() => router.push('/requests')} /> : null}
        </Section>
      ) : null}

      {options.length ? (
        <Section title={options.length > 1 ? 'Packages' : 'Line items'} icon="layers-outline">
          {options.map((o) => (
            <Card key={o.id} style={chosen?.id === o.id ? { borderColor: colors.success, borderWidth: 2 } : undefined}>
              <Row style={{ justifyContent: 'space-between' }}>
                <T variant="h3">{o.name}</T>
                {chosen?.id === o.id ? <Badge label="Chosen" tone="success" raw /> : null}
              </Row>
              {o.description ? <T variant="muted">{o.description}</T> : null}
              <ItemRows items={items.filter((i) => i.option_id === o.id)} cur={cur} />
              <Divider />
              <KeyValue label="Subtotal" value={money(o.subtotal, cur)} />
              {Number(d.discount) ? <KeyValue label="Discount" value={`−${money(Math.min(Number(d.discount), Number(o.subtotal)), cur)}`} /> : null}
              <KeyValue label={`Tax (${(Number(d.tax_rate) * 100).toFixed(2)}%)`} value={money(o.tax, cur)} />
              <KeyValue label="Total" value={<T variant="money">{money(o.total, cur)}</T>} />
            </Card>
          ))}
        </Section>
      ) : (
        <Section title="Line items" icon="list-outline">
          <Card>
            <ItemRows items={items} cur={cur} />
            <Divider />
            <KeyValue label="Subtotal" value={money(d.subtotal, cur)} />
            {Number(d.discount) ? <KeyValue label="Discount" value={`−${money(d.discount, cur)}`} /> : null}
            <KeyValue label={`Tax (${(Number(d.tax_rate) * 100).toFixed(2)}%)`} value={money(d.tax, cur)} />
            <KeyValue label="Total" value={<T variant="money">{money(d.total, cur)}</T>} />
          </Card>
        </Section>
      )}

      <Section title="Photos" icon="images-outline">
        <QuotePhotos quoteId={id} editable={d.status === 'draft'} />
      </Section>

      {d.notes ? <Section title="Notes"><Card><T>{d.notes}</T></Card></Section> : null}
      {d.terms ? <Section title="Terms"><Card><T variant="muted">{d.terms}</T></Card></Section> : null}

      {versions.length > 1 ? (
        <Section title="Version history" icon="git-branch-outline">
          <Card style={{ padding: 0, overflow: 'hidden' }}>
            {versions.map((v) => (
              <ListRow key={v.id} icon={v.id === id ? 'radio-button-on' : 'radio-button-off'} tone={v.id === id ? 'primary' : 'neutral'}
                title={`Version ${v.version} · ${v.number}`} subtitle={`${v.superseded_by ? 'Replaced' : v.status} · created ${date(v.created_at)}`}
                onPress={v.id === id ? undefined : () => router.replace(`/quotes/${v.id}`)} />
            ))}
          </Card>
        </Section>
      ) : null}

      <Section title="Timeline" icon="time-outline">
        <Card>
          {timeline.map((t, i) => (
            <Row key={i} style={{ alignItems: 'flex-start', paddingVertical: 6 }}>
              <Ionicons name={t.icon} size={18} color={colors.primaryText} style={{ marginTop: 2 }} />
              <View style={{ flex: 1 }}>
                <T>{t.text}</T>
                <T variant="small">{dateTime(t.at)}</T>
              </View>
            </Row>
          ))}
        </Card>
      </Section>

      <Section title="Actions">
        {manager && (d.status === 'accepted' || openStatus || job) && !superseded ? (
          <Button icon="construct-outline" title={job ? `Open job ${job.number}` : 'Convert to job'} onPress={convert} style={{ marginBottom: space.sm }} />
        ) : null}
        {canRevise ? <Button kind="secondary" icon="git-branch-outline" title="New version" onPress={newVersion} style={{ marginBottom: space.sm }} /> : null}
        <Row style={{ flexWrap: 'wrap' }}>
          {d.status === 'draft' ? <Button small kind="secondary" icon="create-outline" title="Edit" onPress={() => router.push({ pathname: '/quotes/edit', params: { id } })} /> : null}
          {d.status === 'draft' ? <Button small kind="secondary" title="Mark as sent" onPress={markSent} /> : null}
          {openStatus && !superseded ? <Button small kind="secondary" icon="time-outline" title="Change deadline" onPress={() => setDeadlineSheet(true)} /> : null}
          {(openStatus || status === 'expired') && !superseded ? <Button small kind="ghost" title="Mark declined" onPress={() => setDeclineSheet(true)} /> : null}
          {d.status === 'draft' && perm('delete_records') ? (
            <Button small kind="ghost" icon="trash-outline" title="Delete" onPress={() => confirmAction('Delete quote?', 'This cannot be undone.', run(async () => {
              const { error } = await supabase.from('quotes').delete().eq('id', id);
              if (error) throw error;
              router.back();
            }), true)} />
          ) : null}
        </Row>
        {manager && openStatus ? <T variant="small" style={{ marginTop: space.sm }}>Customer said yes by phone? &quot;Convert to job&quot; marks the quote accepted and creates the job.</T> : null}
      </Section>

      <FormSheet
        visible={declineSheet}
        title="Mark declined"
        initial={{ reason: 'price' }}
        fields={[
          { key: 'reason', label: 'Reason', type: 'select', options: DECLINE_REASONS, required: true },
          { key: 'note', label: 'Note', type: 'multiline' },
        ]}
        onClose={() => setDeclineSheet(false)}
        onSubmit={async (v) => {
          const { error } = await supabase.from('quotes').update({ status: 'declined', declined_at: new Date().toISOString(), decline_reason: v.reason, decline_note: v.note }).eq('id', id);
          if (error) throw error;
          q.reload();
        }}
      />
      <FormSheet
        visible={deadlineSheet}
        title="Approval deadline"
        initial={{ valid_until_at: d.valid_until_at ?? deadline?.toISOString() ?? null }}
        fields={[{ key: 'valid_until_at', label: 'Customer can accept until', type: 'datetime', required: true }]}
        onClose={() => setDeadlineSheet(false)}
        onSubmit={async (v) => {
          const at = new Date(v.valid_until_at);
          if (at.getTime() < Date.now()) throw new Error('Pick a time in the future');
          const { error } = await supabase.from('quotes').update({ valid_until_at: at.toISOString() }).eq('id', id);
          if (error) throw error;
          q.reload();
        }}
      />
    </Screen>
  );
}

function ItemRows({ items, cur }: { items: LineItem[]; cur: string }) {
  if (!items.length) return <T variant="muted" style={{ paddingVertical: 4 }}>No line items.</T>;
  return (
    <>
      {items.map((i, n) => (
        <Row key={i.id ?? n} style={{ justifyContent: 'space-between', paddingVertical: 4 }}>
          <T style={{ flex: 1 }}>{i.description}{Number(i.quantity) !== 1 ? ` × ${Number(i.quantity)}` : ''}</T>
          <T variant="money">{money(Number(i.quantity) * Number(i.unit_price), cur)}</T>
        </Row>
      ))}
    </>
  );
}

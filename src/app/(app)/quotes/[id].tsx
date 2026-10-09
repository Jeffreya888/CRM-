import { router, Stack, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';
import { emailDocument, exportPdf, shareLink } from '../../../components/DocumentActions';
import { confirmAction, notify } from '../../../components/FormSheet';
import { quoteTone } from '../../../components/status';
import { Badge, Button, Card, Divider, ErrorBanner, IconButton, KeyValue, Loading, Row, Screen, Section, T } from '../../../components/ui';
import { date, dateTime, money } from '../../../lib/format';
import { useOrg } from '../../../lib/session';
import { friendlyError, supabase } from '../../../lib/supabase';
import { space } from '../../../lib/theme';
import { useQuery } from '../../../lib/useQuery';

export default function QuoteDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { org } = useOrg();
  const q = useQuery(async () => {
    const [d, items, job] = await Promise.all([
      supabase.from('quotes').select('*, customer:customers(id, name, email), aircraft:aircraft(id, tail_number, model), location:locations(name, airport_code)').eq('id', id).single(),
      supabase.from('quote_items').select('*').eq('quote_id', id).order('sort_order'),
      supabase.from('jobs').select('id, number').eq('quote_id', id).maybeSingle(),
    ]);
    if (d.error) throw d.error;
    return { d: d.data as any, items: items.data ?? [], job: job.data };
  }, [id]);

  if (q.loading) return <Loading />;
  if (!q.data) return <Screen><ErrorBanner message={q.error ?? 'Not found'} /></Screen>;
  const { d, items, job } = q.data;
  const run = (fn: () => Promise<unknown>) => async () => { try { await fn(); q.reload(); } catch (e: any) { notify('Error', friendlyError(e.message)); } };
  const setStatus = (status: string) => run(async () => { const { error } = await supabase.from('quotes').update({ status }).eq('id', id); if (error) throw error; });

  const convert = run(async () => {
    const { data, error } = await supabase.rpc('convert_quote_to_job', { p_quote: id, p_start: null });
    if (error) throw error;
    router.push({ pathname: '/jobs/edit', params: { id: data } });
  });

  return (
    <Screen refreshing={q.refreshing} onRefresh={q.refresh}>
      <Stack.Screen options={{ title: d.number, headerRight: () => ['draft', 'sent', 'viewed'].includes(d.status) ? <IconButton icon="create-outline" label="Edit" onPress={() => router.push({ pathname: '/quotes/edit', params: { id } })} /> : null }} />
      <Card>
        <Row style={{ justifyContent: 'space-between' }}>
          <View>
            <T variant="overline">Quote {d.number}</T>
            <T variant="h1">{money(d.total, org.currency)}</T>
          </View>
          <Badge label={d.status} tone={quoteTone[d.status]} />
        </Row>
        <KeyValue label="Customer" value={d.customer?.name} onPress={() => router.push(`/customers/${d.customer.id}`)} />
        <KeyValue label="Aircraft" value={d.aircraft ? `${d.aircraft.tail_number} ${d.aircraft.model ?? ''}` : null} onPress={d.aircraft ? () => router.push(`/aircraft/${d.aircraft.id}`) : undefined} />
        <KeyValue label="Location" value={d.location ? [d.location.airport_code, d.location.name].filter(Boolean).join(' · ') : null} />
        <KeyValue label="Issued" value={date(d.issue_date)} />
        <KeyValue label="Valid until" value={date(d.valid_until)} />
        {d.accepted_at ? <KeyValue label="Accepted" value={`${dateTime(d.accepted_at)}${d.accepted_name ? ` by ${d.accepted_name}` : ''}`} /> : null}
        {job ? <KeyValue label="Job" value={job.number} onPress={() => router.push(`/jobs/${job.id}`)} /> : null}
      </Card>

      <Row style={{ flexWrap: 'wrap' }}>
        <Button small icon="mail-outline" title="Email" onPress={run(() => emailDocument('quote', id))} />
        <Button small kind="secondary" icon="share-outline" title="Share link" onPress={() => shareLink('quote', d.public_token, d.number, org.name)} />
        <Button small kind="secondary" icon="document-outline" title="PDF" onPress={run(() => exportPdf(org, 'quote', id))} />
      </Row>

      <Section title="Line items">
        <Card>
          {items.map((i: any) => (
            <Row key={i.id} style={{ justifyContent: 'space-between', paddingVertical: 4 }}>
              <T style={{ flex: 1 }}>{i.description}{Number(i.quantity) !== 1 ? ` × ${Number(i.quantity)}` : ''}</T>
              <T variant="money">{money(Number(i.quantity) * Number(i.unit_price), org.currency)}</T>
            </Row>
          ))}
          <Divider />
          <KeyValue label="Subtotal" value={money(d.subtotal, org.currency)} />
          {Number(d.discount) ? <KeyValue label="Discount" value={`−${money(d.discount, org.currency)}`} /> : null}
          <KeyValue label={`Tax (${(Number(d.tax_rate) * 100).toFixed(2)}%)`} value={money(d.tax, org.currency)} />
          <KeyValue label="Total" value={money(d.total, org.currency)} />
        </Card>
      </Section>
      {d.notes ? <Section title="Notes"><Card><T>{d.notes}</T></Card></Section> : null}

      <Section title="Actions">
        {!job ? <Button icon="construct-outline" title="Convert to job" onPress={convert} style={{ marginBottom: space.sm }} /> : null}
        <Row style={{ flexWrap: 'wrap' }}>
          {d.status === 'draft' ? <Button small kind="secondary" title="Mark sent" onPress={setStatus('sent')} /> : null}
          {['sent', 'viewed', 'draft'].includes(d.status) ? <Button small kind="secondary" title="Mark accepted" onPress={setStatus('accepted')} /> : null}
          {['sent', 'viewed', 'draft'].includes(d.status) ? <Button small kind="ghost" title="Mark declined" onPress={setStatus('declined')} /> : null}
          {d.status === 'draft' ? (
            <Button small kind="ghost" icon="trash-outline" title="Delete" onPress={() => confirmAction('Delete quote?', 'This cannot be undone.', async () => {
              await supabase.from('quotes').delete().eq('id', id);
              router.back();
            }, true)} />
          ) : null}
        </Row>
      </Section>
    </Screen>
  );
}

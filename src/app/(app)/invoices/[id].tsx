import { router, Stack, useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { View } from 'react-native';
import { copyLink, emailDocument, exportPdf, orgForDocument, shareLink } from '../../../components/DocumentActions';
import { confirmAction, FormSheet, notify } from '../../../components/FormSheet';
import { invoiceTone } from '../../../components/status';
import { Badge, Button, Card, Divider, EmptyState, ErrorBanner, IconButton, Ionicons, KeyValue, ListRow, Loading, Row, Screen, Section, T } from '../../../components/ui';
import { date, dateTime, money, titleCase } from '../../../lib/format';
import { onlinePaymentsLive } from '../../../lib/payments';
import { canAdmin } from '../../../lib/plans';
import { inPersonSupported, openReaderSettings, takeInPersonPayment } from '../../../lib/squareReader';
import { useOrg } from '../../../lib/session';
import { callFunction, friendlyError, supabase } from '../../../lib/supabase';
import { colors, space } from '../../../lib/theme';
import { useQuery } from '../../../lib/useQuery';

const METHODS = ['card', 'ach', 'check', 'cash', 'wire', 'other'].map((m) => ({ value: m, label: m.toUpperCase() === 'ACH' ? 'ACH' : titleCase(m) }));

export default function InvoiceDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { org, orgId, role, session, can, perm } = useOrg();
  const allowed = perm('see_prices');
  const [paySheet, setPaySheet] = useState(false);
  const q = useQuery(async () => {
    const [d, items, payments] = await Promise.all([
      supabase.from('invoices').select('*, customer:customers(id, name, email), aircraft:aircraft(id, tail_number, model), job:jobs(id, number), branch:branches(name)').eq('id', id).single(),
      supabase.from('invoice_items').select('*').eq('invoice_id', id).order('sort_order'),
      supabase.from('payments').select('*').eq('invoice_id', id).order('received_at', { ascending: false }),
    ]);
    if (d.error) throw d.error;
    return { d: d.data as any, items: items.data ?? [], payments: payments.data ?? [] };
  }, [id]);

  if (!allowed) return <Screen><EmptyState icon="lock-closed-outline" title="Invoices are hidden for your role" body="Ask your company owner for access to prices." /></Screen>;
  if (q.loading) return <Loading />;
  if (!q.data) return <Screen><ErrorBanner message={q.error ?? 'Not found'} /></Screen>;
  const { d, items, payments } = q.data;
  const cur = org.currency;
  const run = (fn: () => Promise<unknown>) => async () => { try { await fn(); q.reload(); } catch (e: any) { notify('Error', friendlyError(e.message)); } };
  const update = (patch: Record<string, unknown>) => run(async () => { const { error } = await supabase.from('invoices').update(patch).eq('id', id); if (error) throw error; });
  const open = Number(d.balance) > 0 && d.status !== 'void';
  const direct = org.payment_mode === 'direct';
  const shown = orgForDocument(org, d.org_snapshot);
  const reviewUrl: string | null = d.org_snapshot?.google_review_url ?? org.google_review_url ?? null;
  const isLateFee = (desc: string) => /late fee/i.test(desc ?? '');
  const isDeposit = (p: any) => /^deposit/i.test(p.reference ?? '');

  const collectCard = run(async () => {
    if (!onlinePaymentsLive(org)) {
      notify('Set up payments first', canAdmin(role) ? 'Go to Settings → Payments to connect Stripe or Square.' : 'Ask your company owner to connect Stripe or Square in Settings.');
      return;
    }
    const { url } = await callFunction<{ url: string }>('invoice-checkout', { invoice_id: id });
    await WebBrowser.openBrowserAsync(url);
  });

  // Square: Tap to Pay on this phone or a paired Square reader.
  const inPerson = org.payment_mode === 'square' && org.square_charges_enabled && !org.is_demo && inPersonSupported() && d.status !== 'draft';
  const tapToPay = async () => {
    try {
      const r = await takeInPersonPayment(id);
      if (r.status === 'paid') notify('Payment received', 'The card payment was recorded on this invoice.');
      else if (r.status === 'failed') notify('Payment not completed', r.message);
      q.reload();
    } catch (e: any) {
      notify('Payment not completed', friendlyError(e.message));
    }
  };
  const readers = async () => {
    try { await openReaderSettings(); } catch (e: any) { notify('Card readers', friendlyError(e.message)); }
  };

  return (
    <Screen refreshing={q.refreshing} onRefresh={q.refresh}>
      <Stack.Screen options={{ title: d.number, headerRight: () => d.status !== 'void' && payments.length === 0 ? <IconButton icon="create-outline" label="Edit" onPress={() => router.push({ pathname: '/invoices/edit', params: { id } })} /> : null }} />
      <Card>
        <Row style={{ justifyContent: 'space-between' }}>
          <View>
            <T variant="overline">Invoice {d.number}</T>
            <T variant="h1">{money(d.total, cur)}</T>
            {Number(d.amount_paid) > 0 ? <T variant="muted">{money(d.amount_paid, cur)} paid · <T style={{ color: Number(d.balance) > 0 ? colors.danger : colors.success, fontWeight: '700' }}>{money(d.balance, cur)} due</T></T> : null}
          </View>
          <View style={{ alignItems: 'flex-end', gap: 6 }}>
            <Badge label={d.status} tone={invoiceTone[d.status]} />
            {d.covered_by_plan ? <Badge label="Covered by care plan" tone="purple" raw /> : null}
          </View>
        </Row>
        <KeyValue label="Customer" value={d.customer?.name} onPress={() => router.push(`/customers/${d.customer.id}`)} />
        <KeyValue label="Aircraft" value={d.aircraft ? `${d.aircraft.tail_number} ${d.aircraft.model ?? ''}` : null} />
        <KeyValue label="Job" value={d.job?.number} onPress={d.job ? () => router.push(`/jobs/${d.job.id}`) : undefined} />
        <KeyValue label="Issued" value={date(d.issue_date)} />
        <KeyValue label="Due" value={date(d.due_date)} />
        <KeyValue label="Location" value={d.branch?.name} />
        {d.sent_at ? <KeyValue label="Last sent" value={dateTime(d.sent_at)} /> : null}
        {d.org_snapshot ? <KeyValue label="From" value={`${shown.name}${shown.phone ? ` · ${shown.phone}` : ''}`} /> : null}
        {d.org_snapshot ? <T variant="small">Company details were saved when this invoice was sent, so later profile changes don&apos;t alter it.</T> : null}
      </Card>
      {d.covered_by_plan ? (
        <Card style={{ backgroundColor: colors.purpleSoft, borderColor: colors.purpleSoft }}>
          <Row><Ionicons name="shield-checkmark-outline" size={20} color={colors.purple} /><T style={{ flex: 1 }}>This visit is covered by the customer&apos;s monthly care plan, so no payment is needed for it.</T></Row>
        </Card>
      ) : null}
      {d.late_fee_applied_at ? (
        <Card style={{ backgroundColor: colors.dangerSoft, borderColor: colors.dangerSoft }}>
          <Row><Ionicons name="alarm-outline" size={20} color={colors.danger} /><T style={{ flex: 1 }}>A late fee was added on {date(d.late_fee_applied_at)} because the invoice was overdue.</T></Row>
        </Card>
      ) : null}

      <Row style={{ flexWrap: 'wrap' }}>
        <Button small icon="mail-outline" title={d.status === 'draft' ? 'Send' : 'Resend'} onPress={run(() => emailDocument('invoice', id))} />
        <Button small kind="secondary" icon="link-outline" title="Copy link" onPress={async () => { if (d.status === 'draft') await supabase.from('invoices').update({ status: 'sent' }).eq('id', id); await copyLink('invoice', d.public_token); q.reload(); }} />
        <Button small kind="secondary" icon="share-outline" title="Share link" onPress={async () => { if (d.status === 'draft') await supabase.from('invoices').update({ status: 'sent' }).eq('id', id); await shareLink('invoice', d.public_token, d.number, org.name); q.reload(); }} />
        <Button small kind="secondary" icon="document-outline" title="PDF" onPress={run(() => exportPdf(org, 'invoice', id))} />
      </Row>

      {open ? (
        <Section title="Get paid">
          {inPerson && can('online_payments') && !d.covered_by_plan ? (
            <Button icon="phone-portrait-outline" title={`Tap to Pay · ${money(d.balance, cur)}`} onPress={tapToPay} style={{ marginBottom: space.sm }} />
          ) : null}
          <Row>
            {can('online_payments') && !direct && !d.covered_by_plan ? <Button style={{ flex: 1 }} kind={inPerson ? 'secondary' : 'primary'} icon="card-outline" title={inPerson ? 'Pay link' : 'Take card payment'} onPress={collectCard} /> : null}
            <Button style={{ flex: 1 }} kind="secondary" icon="cash-outline" title="Record payment" onPress={() => setPaySheet(true)} />
          </Row>
          {inPerson ? <Button small kind="ghost" icon="bluetooth-outline" title="Pair a Square card reader" onPress={readers} style={{ marginTop: space.xs, alignSelf: 'flex-start' }} /> : null}
          {direct ? <T variant="small" style={{ marginTop: space.sm }}>Your company takes payment directly (no card checkout). The customer&apos;s payment page shows how to reach you. Record payments here when they arrive.</T> : null}
        </Section>
      ) : null}
      {d.status === 'draft' ? <Button kind="secondary" title="Mark as sent" onPress={update({ status: 'sent', sent_at: new Date().toISOString() })} style={{ marginTop: space.sm }} /> : null}

      <Section title="Line items">
        <Card>
          {items.map((i: any) => (
            <Row key={i.id} style={{ justifyContent: 'space-between', paddingVertical: 4 }}>
              <T style={[{ flex: 1 }, isLateFee(i.description) && { color: colors.danger }]}>{i.description}{Number(i.quantity) !== 1 ? ` × ${Number(i.quantity)}` : ''}</T>
              <T variant="money" style={isLateFee(i.description) ? { color: colors.danger } : undefined}>{money(Number(i.quantity) * Number(i.unit_price), cur)}</T>
            </Row>
          ))}
          <Divider />
          <KeyValue label="Subtotal" value={money(d.subtotal, cur)} />
          {Number(d.discount) ? <KeyValue label="Discount" value={`−${money(d.discount, cur)}`} /> : null}
          <KeyValue label={`Tax (${(Number(d.tax_rate) * 100).toFixed(2)}%)`} value={money(d.tax, cur)} />
          <KeyValue label="Total" value={money(d.total, cur)} />
        </Card>
      </Section>

      <Section title={`Payments (${payments.length})`}>
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          {payments.length ? payments.map((p: any) => (
            <ListRow key={p.id} icon={isDeposit(p) ? 'wallet-outline' : 'checkmark-circle-outline'} tone={isDeposit(p) ? 'purple' : 'primary'}
              title={`${money(p.amount, cur)}${isDeposit(p) ? ' · Deposit' : ''}`} subtitle={`${titleCase(p.method)} · ${dateTime(p.received_at)}`}
              meta={[p.reference, Number(p.platform_fee) ? `Processing fee ${money(p.platform_fee, cur)}` : null].filter(Boolean).join(' · ')}
              onPress={!p.stripe_payment_intent_id ? () => confirmAction('Delete payment?', 'The invoice balance will be recalculated.', run(async () => { await supabase.from('payments').delete().eq('id', p.id); }), true) : undefined} />
          )) : <T variant="muted" style={{ padding: space.lg }}>No payments yet.</T>}
        </Card>
      </Section>

      {d.notes ? <Section title="Notes"><Card><T>{d.notes}</T></Card></Section> : null}

      <Section title="Google review" icon="star-outline" iconColor={colors.warning}>
        <Card>
          {reviewUrl ? (
            <>
              <T>&quot;Enjoyed our work? Leave us a Google review&quot; appears on this invoice, its PDF and the payment page.</T>
              <T variant="small" style={{ marginTop: 4 }} numberOfLines={1}>{reviewUrl}</T>
            </>
          ) : (
            <T variant="muted">Add your Google review link in Settings to show it on every invoice and payment page.</T>
          )}
        </Card>
      </Section>

      <Row style={{ marginTop: space.lg, flexWrap: 'wrap' }}>
        {d.status !== 'void' && payments.length === 0 ? <Button small kind="ghost" title="Void invoice" onPress={() => confirmAction('Void invoice?', 'It stays on record but no longer counts as owed.', update({ status: 'void' }))} /> : null}
        {d.status === 'draft' ? <Button small kind="ghost" icon="trash-outline" title="Delete draft" onPress={() => confirmAction('Delete invoice?', 'This cannot be undone.', async () => { await supabase.from('invoices').delete().eq('id', id); router.back(); }, true)} /> : null}
      </Row>

      <FormSheet
        visible={paySheet}
        title="Record payment"
        initial={{ amount: String(d.balance), method: 'check', received_at: new Date().toISOString() }}
        fields={[
          { key: 'amount', label: 'Amount', type: 'money', required: true },
          { key: 'method', label: 'Method', type: 'select', options: METHODS },
          { key: 'reference', label: 'Reference', type: 'text', placeholder: 'Check #, transaction id…' },
          { key: 'received_at', label: 'Received', type: 'datetime', required: true },
        ]}
        onClose={() => setPaySheet(false)}
        onSubmit={async (v) => {
          if (!(Number(v.amount) > 0)) throw new Error('Amount must be greater than zero');
          const { error } = await supabase.from('payments').insert({ ...v, org_id: orgId, invoice_id: id, recorded_by: session!.user.id });
          if (error) throw error;
          q.reload();
        }}
      />
    </Screen>
  );
}

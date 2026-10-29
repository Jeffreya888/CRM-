import { isPast } from 'date-fns';
import { useState } from 'react';
import { Linking, View } from 'react-native';
import { invoiceTone } from '../status';
import { Badge, Button, Card, Divider, ErrorBanner, Ionicons, Row, Section, T } from '../ui';
import { date, money } from '../../lib/format';
import { PORTAL_URL } from '../../lib/config';
import { callFunction } from '../../lib/supabase';
import { colors, space } from '../../lib/theme';
import { SquarePayForm } from '../payments/SquarePayForm';
import { Notice } from './PortalShell';
import { goToCheckout, publicError, type PublicDoc } from './publicDoc';

/** Customer view of an invoice: items, late fee, balance, payment and the Google review link. */
export function PublicInvoice({ d, token, paid }: { d: PublicDoc; token: string; paid?: boolean }) {
  const doc = d.doc;
  const cur = d.org.currency ?? 'USD';
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<'paid' | 'pending' | null>(null);
  const balance = Number(doc.balance) || 0;
  const due = balance > 0 && !['void', 'paid'].includes(doc.status);
  const overdue = due && (doc.status === 'overdue' || isPast(new Date(`${doc.due_date}T23:59:59`)));
  const direct = d.org.payment_mode === 'direct' || !d.org.accepts_cards;
  const isLateFee = (s: string) => /late fee/i.test(s ?? '');

  const pay = async () => {
    setError(null);
    try {
      const { url } = await callFunction<{ url: string }>('invoice-checkout', { public_token: token });
      await goToCheckout(url);
    } catch (e: any) {
      setError(publicError(e.message));
    }
  };

  return (
    <View>
      <Card>
        <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <View style={{ flex: 1 }}>
            <T variant="overline">Invoice {doc.number}</T>
            <T variant="h1">{money(due ? balance : doc.total, cur)}</T>
            <T variant="muted">{due ? `Due ${date(doc.due_date)}` : doc.status === 'paid' ? 'Paid in full' : `Total ${money(doc.total, cur)}`}</T>
          </View>
          <View style={{ alignItems: 'flex-end', gap: 6 }}>
            <Badge label={overdue && doc.status !== 'overdue' ? 'overdue' : doc.status} tone={invoiceTone[overdue ? 'overdue' : doc.status]} />
            {doc.covered_by_plan ? <Badge label="Care plan" tone="purple" raw /> : null}
          </View>
        </Row>
        <Divider />
        <Row style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: space.md }}>
          <View>
            <T variant="overline">Bill to</T>
            <T style={{ fontWeight: '600' }}>{d.customer.name}</T>
            {d.customer.company ? <T variant="muted">{d.customer.company}</T> : null}
          </View>
          {d.aircraft ? (
            <View>
              <T variant="overline">{d.aircraft.asset_type === 'vehicle' ? 'Vehicle' : d.aircraft.asset_type === 'watercraft' ? 'Vessel' : 'Aircraft'}</T>
              <T style={{ fontWeight: '600' }}>{d.aircraft.tail_number}</T>
              {d.aircraft.model ? <T variant="muted">{d.aircraft.model}</T> : null}
            </View>
          ) : null}
          <View>
            <T variant="overline">Issued</T>
            <T style={{ fontWeight: '600' }}>{date(doc.issue_date)}</T>
          </View>
        </Row>
      </Card>

      {doc.covered_by_plan ? (
        <Notice tone="info" icon="shield-checkmark-outline" title="Covered by your care plan" body="This visit is included in your monthly care plan." />
      ) : null}

      <Card>
        {d.items.map((i, n) => (
          <Row key={i.id ?? n} style={{ justifyContent: 'space-between', paddingVertical: 6 }}>
            <T style={[{ flex: 1 }, isLateFee(i.description) && { color: colors.danger }]}>{i.description}{Number(i.quantity) !== 1 ? ` × ${Number(i.quantity)}` : ''}</T>
            <T variant="money" style={isLateFee(i.description) ? { color: colors.danger } : undefined}>{money(Number(i.quantity) * Number(i.unit_price), cur)}</T>
          </Row>
        ))}
        <Divider />
        <Row style={{ justifyContent: 'space-between' }}><T variant="muted">Subtotal</T><T>{money(doc.subtotal, cur)}</T></Row>
        {Number(doc.discount) ? <Row style={{ justifyContent: 'space-between' }}><T variant="muted">Discount</T><T>−{money(doc.discount, cur)}</T></Row> : null}
        {Number(doc.tax) ? <Row style={{ justifyContent: 'space-between' }}><T variant="muted">Tax</T><T>{money(doc.tax, cur)}</T></Row> : null}
        <Row style={{ justifyContent: 'space-between', marginTop: 4 }}><T variant="h3">Total</T><T variant="h3">{money(doc.total, cur)}</T></Row>
        {Number(doc.amount_paid) > 0 ? (
          <>
            <Row style={{ justifyContent: 'space-between' }}><T variant="muted">Paid (including any deposit)</T><T>−{money(doc.amount_paid, cur)}</T></Row>
            <Row style={{ justifyContent: 'space-between' }}><T variant="h3">Balance</T><T variant="h3">{money(balance, cur)}</T></Row>
          </>
        ) : null}
        {doc.late_fee_applied_at ? (
          <T variant="small" style={{ color: colors.danger, marginTop: space.sm }}>A late fee was added on {date(doc.late_fee_applied_at)} because payment was past due.</T>
        ) : null}
        {doc.notes ? <T variant="muted" style={{ marginTop: space.md }}>{doc.notes}</T> : null}
      </Card>

      <ErrorBanner message={error} />
      {paid || result === 'paid' ? <Notice tone="success" icon="checkmark-circle" title="Payment received. Thank you!" body="A receipt is on its way to your email." /> : null}
      {result === 'pending' ? <Notice tone="info" icon="time" title="Bank payment processing" body="Thank you. Bank payments take a few business days to clear." /> : null}

      {due && !paid && !result ? (
        direct ? (
          <Card>
            <T variant="h3">Pay your detailer directly</T>
            <T variant="muted" style={{ marginVertical: space.sm }}>
              {d.org.name} takes payment directly (check, bank transfer, cash or card in person). Reach out to arrange payment of {money(balance, cur)}.
            </T>
            <Row style={{ flexWrap: 'wrap' }}>
              {d.org.phone ? <Button small kind="secondary" icon="call-outline" title={d.org.phone} onPress={() => Linking.openURL(`tel:${d.org.phone!.replace(/[^0-9+]/g, '')}`).catch(() => {})} /> : null}
              {d.org.email ? <Button small kind="secondary" icon="mail-outline" title="Email" onPress={() => Linking.openURL(`mailto:${d.org.email}?subject=${encodeURIComponent(`Invoice ${doc.number}`)}`).catch(() => {})} /> : null}
            </Row>
          </Card>
        ) : d.org.payment_mode === 'square' ? (
          <Card>
            <T variant="h3" style={{ marginBottom: space.sm }}>Pay {money(balance, cur)}</T>
            <SquarePayForm kind="invoice" token={token} pageUrl={`${PORTAL_URL}/portal/invoice/${token}`}
              buttonLabel={`Pay ${money(balance, cur)}`} onDone={(s) => setResult(s === 'pending' ? 'pending' : 'paid')} />
          </Card>
        ) : (
          <Button title={`Pay ${money(balance, cur)}`} icon="card-outline" onPress={pay} />
        )
      ) : null}

      {d.org.google_review_url ? (
        <Section title="Enjoyed our work?" icon="star" iconColor={colors.warning}>
          <Card onPress={() => Linking.openURL(d.org.google_review_url!).catch(() => {})}>
            <Row>
              <Ionicons name="logo-google" size={22} color={colors.primaryText} />
              <T style={{ flex: 1 }}>Leave us a Google review. It takes a minute and helps a small business a lot.</T>
              <Ionicons name="open-outline" size={18} color={colors.textMuted} />
            </Row>
          </Card>
        </Section>
      ) : null}
    </View>
  );
}

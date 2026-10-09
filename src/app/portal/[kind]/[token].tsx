import { Stack, useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { Platform, View } from 'react-native';
import { invoiceTone, quoteTone } from '../../../components/status';
import { Badge, Button, Card, Divider, EmptyState, ErrorBanner, Field, Ionicons, Loading, Row, Screen, T } from '../../../components/ui';
import { APP_NAME } from '../../../lib/config';
import { date, money } from '../../../lib/format';
import { callFunction, supabase } from '../../../lib/supabase';
import { colors, space } from '../../../lib/theme';
import { useQuery } from '../../../lib/useQuery';

/**
 * Public customer portal (no login). Deployed with the web build, e.g.
 * https://yourapp.expo.app/portal/invoice/<token>. Customers can review and
 * accept quotes or pay invoices by card/ACH (Stripe Checkout).
 */
export default function Portal() {
  const { kind, token, paid } = useLocalSearchParams<{ kind: 'quote' | 'invoice'; token: string; paid?: string }>();
  const [name, setName] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const q = useQuery(async () => {
    const { data, error } = await supabase.rpc('get_public_document', { p_kind: kind, p_token: token });
    if (error) throw error;
    return data as any;
  }, [kind, token]);

  if (q.loading) return <Loading />;
  const d = q.data;
  if (!d) return <Screen><EmptyState icon="document-outline" title="Document not found" body="This link may have expired. Contact the business that sent it." /></Screen>;

  const doc = d.doc;
  const cur = d.org.currency ?? 'USD';
  const isQuote = d.kind === 'quote';

  const accept = async () => {
    setError(null);
    const { data: ok, error } = await supabase.rpc('accept_public_quote', { p_token: token, p_name: name });
    if (error) return setError(error.message);
    if (!ok) return setError('This quote can no longer be accepted. It may have expired.');
    setMsg(`Thank you, ${name}! Your approval has been sent to ${d.org.name}. They'll be in touch to confirm scheduling.`);
    q.reload();
  };

  const pay = async () => {
    setError(null);
    try {
      const { url } = await callFunction<{ url: string }>('invoice-checkout', { public_token: token });
      if (Platform.OS === 'web') window.location.href = url;
      else await WebBrowser.openBrowserAsync(url);
    } catch (e: any) {
      setError(e.message);
    }
  };

  return (
    <Screen>
      <Stack.Screen options={{ headerShown: false, title: `${isQuote ? 'Quote' : 'Invoice'} ${doc.number}` }} />
      <View style={{ maxWidth: 720, width: '100%', alignSelf: 'center' }}>
        <Card>
          <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <View style={{ flex: 1 }}>
              <T variant="h2">{d.org.name}</T>
              <T variant="muted">{[d.org.phone, d.org.email].filter(Boolean).join(' · ')}</T>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <T variant="overline">{isQuote ? 'Quote' : 'Invoice'}</T>
              <T variant="h3">{doc.number}</T>
              <Badge label={doc.status} tone={(isQuote ? quoteTone : invoiceTone)[doc.status]} />
            </View>
          </Row>
          <Divider />
          <Row style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
            <View>
              <T variant="overline">For</T>
              <T style={{ fontWeight: '600' }}>{d.customer.name}</T>
              {d.customer.company ? <T variant="muted">{d.customer.company}</T> : null}
            </View>
            {d.aircraft ? (
              <View>
                <T variant="overline">Aircraft</T>
                <T style={{ fontWeight: '600' }}>{d.aircraft.tail_number}</T>
                <T variant="muted">{d.aircraft.model}</T>
              </View>
            ) : null}
            <View>
              <T variant="overline">{isQuote ? 'Valid until' : 'Due'}</T>
              <T style={{ fontWeight: '600' }}>{date(isQuote ? doc.valid_until : doc.due_date)}</T>
            </View>
          </Row>
        </Card>

        <Card>
          {d.items.map((i: any) => (
            <Row key={i.id} style={{ justifyContent: 'space-between', paddingVertical: 6 }}>
              <T style={{ flex: 1 }}>{i.description}{Number(i.quantity) !== 1 ? ` × ${Number(i.quantity)}` : ''}</T>
              <T variant="money">{money(Number(i.quantity) * Number(i.unit_price), cur)}</T>
            </Row>
          ))}
          <Divider />
          <Row style={{ justifyContent: 'space-between' }}><T variant="muted">Subtotal</T><T>{money(doc.subtotal, cur)}</T></Row>
          {Number(doc.discount) ? <Row style={{ justifyContent: 'space-between' }}><T variant="muted">Discount</T><T>−{money(doc.discount, cur)}</T></Row> : null}
          {Number(doc.tax) ? <Row style={{ justifyContent: 'space-between' }}><T variant="muted">Tax</T><T>{money(doc.tax, cur)}</T></Row> : null}
          <Row style={{ justifyContent: 'space-between', marginTop: 4 }}><T variant="h3">Total</T><T variant="h3">{money(doc.total, cur)}</T></Row>
          {!isQuote && Number(doc.amount_paid) > 0 ? (
            <>
              <Row style={{ justifyContent: 'space-between' }}><T variant="muted">Paid</T><T>−{money(doc.amount_paid, cur)}</T></Row>
              <Row style={{ justifyContent: 'space-between' }}><T variant="h3">Balance</T><T variant="h3">{money(doc.balance, cur)}</T></Row>
            </>
          ) : null}
          {doc.notes ? <T variant="muted" style={{ marginTop: space.md }}>{doc.notes}</T> : null}
          {doc.terms ? <T variant="small" style={{ marginTop: space.sm }}>{doc.terms}</T> : null}
        </Card>

        <ErrorBanner message={error} />
        {msg || paid ? (
          <Card style={{ backgroundColor: colors.successSoft }}>
            <Row><Ionicons name="checkmark-circle" size={22} color={colors.success} /><T style={{ flex: 1 }}>{msg ?? 'Payment received. Thank you!'}</T></Row>
          </Card>
        ) : null}

        {isQuote && ['sent', 'viewed'].includes(doc.status) && !msg ? (
          <Card>
            <T variant="h3" style={{ marginBottom: space.sm }}>Accept this quote</T>
            <Field label="Type your full name to approve" value={name} onChangeText={setName} placeholder="Full name" />
            <Button title="Accept quote" icon="checkmark" onPress={accept} disabled={name.trim().length < 2} />
          </Card>
        ) : null}
        {isQuote && doc.status === 'accepted' && doc.accepted_name ? (
          <T variant="muted" style={{ textAlign: 'center' }}>Accepted by {doc.accepted_name} on {date(doc.accepted_at)}</T>
        ) : null}

        {!isQuote && Number(doc.balance) > 0 && !['void', 'paid'].includes(doc.status) && !paid ? (
          d.org.accepts_cards ? (
            <Button title={`Pay ${money(doc.balance, cur)}`} icon="card-outline" onPress={pay} />
          ) : (
            <T variant="muted" style={{ textAlign: 'center' }}>Please contact {d.org.name} for payment options.</T>
          )
        ) : null}
        <T variant="small" style={{ textAlign: 'center', marginTop: space.xl }}>Powered by {APP_NAME}</T>
      </View>
    </Screen>
  );
}

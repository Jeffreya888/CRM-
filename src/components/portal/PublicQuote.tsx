import { useEffect, useState } from 'react';
import { Image, ScrollView, View } from 'react-native';
import { SvgXml } from 'react-native-svg';
import { DateTimeField } from '../DateTimeField';
import { SignaturePad } from '../SignaturePad';
import { countdown, DECLINE_REASONS } from '../quotes/quoteUtils';
import { quoteTone } from '../status';
import { Badge, Button, Card, Divider, ErrorBanner, Field, IconButton, Ionicons, Row, Section, Segmented, T } from '../ui';
import { safeSignatureSvg } from '../../lib/documents';
import { date, dateTime, money } from '../../lib/format';
import { callFunction, supabase } from '../../lib/supabase';
import { colors, radius, space } from '../../lib/theme';
import type { LineItem, QuoteOption } from '../../lib/types';
import { Notice } from './PortalShell';
import { goToCheckout, publicError, type PublicDoc } from './publicDoc';

type Reason = (typeof DECLINE_REASONS)[number]['value'];

/** Customer view of a quote: packages, accept + sign, deposit, preferred dates, decline. */
export function PublicQuote({ d, token, depositReturn }: { d: PublicDoc; token: string; depositReturn?: 'paid' | 'cancelled' | null }) {
  const doc = d.doc;
  const cur = d.org.currency ?? 'USD';
  const options = (d.options ?? []) as QuoteOption[];
  const items = d.items ?? [];
  const deadline = doc.valid_until_at ? new Date(doc.valid_until_at) : doc.valid_until ? new Date(`${doc.valid_until}T23:59:00`) : null;

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);

  const [status, setStatus] = useState<string>(doc.status);
  const [choice, setChoice] = useState<string | null>(doc.selected_option_id ?? (options.length === 1 ? options[0]!.id : null));
  const [name, setName] = useState('');
  const [signing, setSigning] = useState(false);
  const [signature, setSignature] = useState<string | null>(null);
  const [depositDue, setDepositDue] = useState<number>(doc.deposit_paid_at ? 0 : Number(doc.deposit_amount) || 0);
  const [datesSent, setDatesSent] = useState<boolean>(!!d.job_requested);
  const [dates, setDates] = useState<(string | null)[]>([null]);
  const [dateNotes, setDateNotes] = useState('');
  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState<Reason>('price');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [photos, setPhotos] = useState<string[] | null>(null);
  const photoCount = Number(d.photo_count) || 0;

  // Quote photos are private files. The `portal` function signs them for a quote link
  // when it supports it; otherwise the customer is pointed to their portal.
  useEffect(() => {
    if (!photoCount) return;
    let alive = true;
    callFunction<{ urls: string[] | Record<string, string> }>('portal', { action: 'quote_photos', quote_token: token })
      .then((r) => { if (alive) setPhotos(Array.isArray(r?.urls) ? r.urls.filter(Boolean) : Object.values(r?.urls ?? {})); })
      .catch(() => { if (alive) setPhotos([]); });
    return () => { alive = false; };
  }, [photoCount, token]);

  const expired = status === 'expired' || ((status === 'sent' || status === 'viewed') && !!deadline && deadline.getTime() < now);
  const superseded = !!d.superseded;
  const canRespond = (status === 'sent' || status === 'viewed') && !expired && !superseded;
  const chosen = options.find((o) => o.id === choice) ?? null;
  const shownTotal = chosen ? Number(chosen.total) : Number(doc.total);
  const depositEstimate = (total: number) => {
    const v = Number(doc.deposit_value) || 0;
    if (doc.deposit_type === 'percent') return Math.round(total * Math.min(v, 100)) / 100;
    if (doc.deposit_type === 'fixed') return Math.min(v, total);
    return 0;
  };

  const accept = async () => {
    setError(null);
    if (options.length && !choice) return setError('Choose one of the packages first.');
    if (name.trim().length < 2) return setError('Type your full name.');
    if (!signature) return setError('Please sign in the box.');
    const { data, error: e } = await supabase.rpc('accept_public_quote', { p_token: token, p_name: name.trim(), p_option: choice, p_signature: signature });
    if (e) return setError(publicError(e.message));
    const r = data as { ok: boolean; deposit_due?: number } | null;
    if (!r?.ok) return setError('This quote can no longer be accepted. It may have expired or been replaced. Please contact us.');
    setStatus('accepted');
    setDepositDue(Number(r.deposit_due) || 0);
  };

  const payDeposit = async () => {
    setError(null);
    try {
      const { url } = await callFunction<{ url: string }>('quote-deposit-checkout', { token });
      await goToCheckout(url);
    } catch (e: any) {
      setError(publicError(e.message));
    }
  };

  const sendDates = async () => {
    setError(null);
    const picked = dates.filter(Boolean).map((x) => new Date(x!).toISOString());
    if (!picked.length) return setError('Pick at least one date and time.');
    if (picked.some((p) => new Date(p).getTime() < Date.now())) return setError('Pick dates in the future.');
    const { data, error: e } = await supabase.rpc('request_quote_dates', { p_token: token, p_dates: picked, p_notes: dateNotes.trim() || null });
    if (e) return setError(publicError(e.message));
    if (!data) return setError('We could not save your dates. Please contact us.');
    setDatesSent(true);
  };

  const decline = async () => {
    setError(null);
    const { data, error: e } = await supabase.rpc('decline_public_quote', { p_token: token, p_reason: reason, p_note: note.trim() || null });
    if (e) return setError(publicError(e.message));
    if (!data) return setError('This quote can no longer be changed.');
    setStatus('declined');
    setDeclining(false);
  };

  const showDeposit = status === 'accepted' && depositDue > 0 && depositReturn !== 'paid';
  const signatureSvg = safeSignatureSvg(doc.signature_svg);

  return (
    <View>
      {/* Summary */}
      <Card>
        <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <View style={{ flex: 1 }}>
            <T variant="overline">Quote {doc.number}{Number(doc.version) > 1 ? ` · version ${doc.version}` : ''}</T>
            <T variant="h1">{options.length > 1 && !chosen ? `From ${money(Math.min(...options.map((o) => Number(o.total))), cur)}` : money(shownTotal, cur)}</T>
            <T variant="muted">For {d.customer.name}{d.customer.company ? ` · ${d.customer.company}` : ''}</T>
            {d.aircraft ? <T variant="muted">{d.aircraft.tail_number}{d.aircraft.model ? ` · ${d.aircraft.model}` : ''}</T> : null}
          </View>
          <Badge label={expired && status !== 'expired' ? 'expired' : status} tone={quoteTone[expired ? 'expired' : status]} />
        </Row>
        {deadline && canRespond ? (
          <View style={{ marginTop: space.md, padding: space.md, borderRadius: radius.md, backgroundColor: colors.cardRaised }}>
            <Row>
              <Ionicons name="time-outline" size={18} color={colors.warning} />
              <T style={{ fontWeight: '700' }}>{countdown(deadline, new Date(now))}</T>
            </Row>
            <T variant="small">Please respond by {dateTime(deadline)}</T>
          </View>
        ) : null}
      </Card>

      {superseded ? (
        <Notice tone="warning" icon="git-branch-outline" title="This quote was updated"
          body={`${d.org.name} sent a newer version of this quote. Please use the link in their latest message, or contact them for it.`} />
      ) : expired ? (
        <Notice tone="warning" icon="hourglass-outline" title="The approval deadline has passed"
          body={`This quote can no longer be accepted online. Contact ${d.org.name} for an updated quote.`} />
      ) : null}

      {/* Packages or line items */}
      {options.length > 1 ? (
        <Section title="Choose a package" icon="layers-outline">
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.md }}>
            {options.map((o) => {
              const selected = choice === o.id;
              const lines = items.filter((i) => i.option_id === o.id);
              return (
                <Card key={o.id} style={{ flexGrow: 1, flexBasis: 220, minWidth: 220, marginBottom: 0, borderWidth: selected ? 2 : 1, borderColor: selected ? colors.primary : colors.border }}>
                  <Row style={{ justifyContent: 'space-between' }}>
                    <T variant="h3">{o.name}</T>
                    {selected ? <Ionicons name="checkmark-circle" size={22} color={colors.primary} /> : null}
                  </Row>
                  {o.description ? <T variant="muted">{o.description}</T> : null}
                  <T variant="h2" style={{ marginVertical: space.sm }}>{money(o.total, cur)}</T>
                  {lines.map((i, n) => (
                    <Row key={i.id ?? n} style={{ alignItems: 'flex-start', paddingVertical: 2 }} gap={6}>
                      <Ionicons name="checkmark" size={16} color={colors.success} style={{ marginTop: 2 }} />
                      <T style={{ flex: 1 }}>{i.description}{Number(i.quantity) !== 1 ? ` × ${Number(i.quantity)}` : ''}</T>
                    </Row>
                  ))}
                  <Divider />
                  <Totals cur={cur} subtotal={o.subtotal} discount={Math.min(Number(doc.discount) || 0, Number(o.subtotal))} tax={o.tax} total={o.total} compact />
                  {doc.deposit_type && doc.deposit_type !== 'none' ? <T variant="small">Deposit on acceptance: {money(depositEstimate(Number(o.total)), cur)}</T> : null}
                  {canRespond ? (
                    <Button small kind={selected ? 'primary' : 'secondary'} title={selected ? 'Chosen' : 'Choose'} icon={selected ? 'checkmark' : undefined}
                      onPress={() => setChoice(o.id)} style={{ marginTop: space.md }} />
                  ) : status === 'accepted' && doc.selected_option_id === o.id ? <Badge label="Your choice" tone="success" raw /> : null}
                </Card>
              );
            })}
          </View>
        </Section>
      ) : (
        <Card>
          <ItemList items={options.length === 1 ? items.filter((i) => i.option_id === options[0]!.id) : items} cur={cur} />
          <Divider />
          {options.length === 1
            ? <Totals cur={cur} subtotal={options[0]!.subtotal} discount={Math.min(Number(doc.discount) || 0, Number(options[0]!.subtotal))} tax={options[0]!.tax} total={options[0]!.total} />
            : <Totals cur={cur} subtotal={doc.subtotal} discount={doc.discount} tax={doc.tax} total={doc.total} />}
          {Number(doc.deposit_amount) > 0 ? <T variant="muted" style={{ marginTop: space.sm }}>Deposit due on acceptance: {money(doc.deposit_amount, cur)}</T> : null}
        </Card>
      )}

      {/* Photos */}
      {photoCount > 0 ? (
        <Section title="Photos" icon="images-outline">
          {photos && photos.length ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm }}>
              {photos.map((u) => <Image key={u} source={{ uri: u }} style={{ width: 180, height: 140, borderRadius: radius.md }} resizeMode="cover" />)}
            </ScrollView>
          ) : (
            <Card><Row><Ionicons name="images-outline" size={20} color={colors.textMuted} />
              <T variant="muted" style={{ flex: 1 }}>{photos === null ? 'Loading photos…' : `${photoCount} photo${photoCount === 1 ? '' : 's'} — view ${photoCount === 1 ? 'it' : 'them'} in your customer portal, or ask ${d.org.name} to send them.`}</T>
            </Row></Card>
          )}
        </Section>
      ) : null}

      {doc.notes ? <Section title="Notes"><Card><T>{doc.notes}</T></Card></Section> : null}
      {doc.terms ? <Section title="Terms"><Card><T variant="muted">{doc.terms}</T></Card></Section> : null}

      <View style={{ marginTop: space.lg }}><ErrorBanner message={error} /></View>

      {/* Accept */}
      {canRespond && !declining ? (
        <Card>
          <T variant="h3">Accept this quote</T>
          {options.length > 1 ? <T variant="muted" style={{ marginBottom: space.md }}>{chosen ? `You chose ${chosen.name} · ${money(chosen.total, cur)}` : 'Choose a package above first.'}</T> : <View style={{ height: space.md }} />}
          <Field label="Your full name" value={name} onChangeText={setName} placeholder="Full name" autoComplete="name" />
          {signature && !signing ? (
            <View style={{ marginBottom: space.lg }}>
              <View style={{ backgroundColor: colors.white, borderRadius: radius.md, alignItems: 'center', padding: space.sm }}>
                <SvgXml xml={safeSignatureSvg(signature) ?? ''} width="100%" height={110} />
              </View>
              <Button small kind="ghost" title="Sign again" onPress={() => { setSignature(null); setSigning(true); }} />
            </View>
          ) : signing ? (
            <View style={{ marginBottom: space.lg }}>
              <SignaturePad onSave={(svg) => { setSignature(svg); setSigning(false); }} onCancel={() => setSigning(false)} />
            </View>
          ) : (
            <Button kind="secondary" icon="create-outline" title="Add your signature" onPress={() => setSigning(true)} style={{ marginBottom: space.lg }} />
          )}
          {Number(doc.deposit_amount) > 0 || (chosen && depositEstimate(Number(chosen.total)) > 0) ? (
            <T variant="small" style={{ marginBottom: space.md }}>
              A deposit of {money(chosen ? depositEstimate(Number(chosen.total)) : doc.deposit_amount, cur)} is due after you accept{d.org.accepts_cards ? ' (pay securely by card)' : ''}.
            </T>
          ) : null}
          <Button title={`Accept${chosen ? ` ${chosen.name}` : ''} · ${money(shownTotal, cur)}`} icon="checkmark" onPress={accept}
            disabled={(options.length > 1 && !choice) || name.trim().length < 2 || !signature} />
          <Button kind="ghost" title="Decline this quote" onPress={() => setDeclining(true)} style={{ marginTop: space.sm }} />
        </Card>
      ) : null}

      {/* Decline */}
      {canRespond && declining ? (
        <Card>
          <Row style={{ justifyContent: 'space-between' }}>
            <T variant="h3">Decline this quote</T>
            <IconButton icon="close" label="Back" onPress={() => setDeclining(false)} color={colors.textMuted} />
          </Row>
          <T variant="muted" style={{ marginBottom: space.md }}>Could you tell us why? It helps {d.org.name} improve.</T>
          <Segmented<Reason> value={reason} onChange={setReason} options={DECLINE_REASONS} />
          <Field label="Anything else? (optional)" multiline value={note} onChangeText={setNote} />
          <Button kind="danger" title="Decline quote" onPress={decline} />
        </Card>
      ) : null}

      {/* After acceptance */}
      {status === 'accepted' ? (
        <>
          <Notice tone="success" icon="checkmark-circle" title={`Thank you${doc.accepted_name ? `, ${doc.accepted_name}` : name ? `, ${name.trim()}` : ''}!`}
            body={`Your approval was sent to ${d.org.name}${chosen ? ` for the ${chosen.name} package` : ''}.${doc.accepted_at ? ` Accepted ${date(doc.accepted_at)}.` : ''}`}>
            {signatureSvg ? (
              <View style={{ backgroundColor: colors.white, borderRadius: radius.md, padding: space.sm, marginTop: space.sm }}>
                <SvgXml xml={signatureSvg} width="100%" height={90} />
              </View>
            ) : null}
          </Notice>

          {depositReturn === 'paid' || doc.deposit_paid_at ? (
            <Notice tone="success" icon="card" title="Deposit received" body="Thank you. It will be credited on your final invoice." />
          ) : null}
          {showDeposit ? (
            <Card>
              <T variant="h3">Pay your deposit</T>
              <T variant="muted" style={{ marginVertical: space.sm }}>{money(depositDue, cur)} secures your booking.</T>
              {depositReturn === 'cancelled' ? <T variant="small" style={{ color: colors.warning, marginBottom: space.sm }}>The payment was not completed. You can try again.</T> : null}
              {d.org.accepts_cards ? (
                <Button icon="card-outline" title={`Pay deposit · ${money(depositDue, cur)}`} onPress={payDeposit} />
              ) : (
                <T>Please arrange the deposit directly with {d.org.name}{d.org.phone ? ` (${d.org.phone})` : ''}.</T>
              )}
            </Card>
          ) : null}

          {datesSent ? (
            <Notice tone="info" icon="calendar" title="Scheduling" body={`${d.org.name} has your request and will confirm a date with you.`} />
          ) : (
            <Card>
              <T variant="h3">Pick preferred dates</T>
              <T variant="muted" style={{ marginVertical: space.sm }}>Suggest up to 5 dates and times that work for you. {d.org.name} will confirm one.</T>
              {dates.map((v, i) => (
                <Row key={i} style={{ alignItems: 'flex-start' }}>
                  <View style={{ flex: 1 }}>
                    <DateTimeField label={`Option ${i + 1}`} mode="datetime" value={v} onChange={(x) => setDates((ds) => ds.map((y, j) => (j === i ? x : y)))} />
                  </View>
                  {dates.length > 1 ? <IconButton icon="trash-outline" color={colors.danger} label="Remove date" onPress={() => setDates((ds) => ds.filter((_, j) => j !== i))} /> : null}
                </Row>
              ))}
              {dates.length < 5 ? <Button small kind="ghost" icon="add" title="Add another date" onPress={() => setDates((ds) => [...ds, null])} /> : null}
              <Field label="Notes (optional)" multiline value={dateNotes} onChangeText={setDateNotes} placeholder="Hangar access, contact on site…" />
              <Button icon="send-outline" title="Send dates" onPress={sendDates} disabled={!dates.some(Boolean)} />
            </Card>
          )}
        </>
      ) : null}

      {status === 'declined' ? (
        <Notice tone="info" icon="information-circle" title="You declined this quote"
          body={`Thanks for letting us know. If anything changes, contact ${d.org.name}.`} />
      ) : null}
    </View>
  );
}

function ItemList({ items, cur }: { items: LineItem[]; cur: string }) {
  return (
    <>
      {items.map((i, n) => (
        <Row key={i.id ?? n} style={{ justifyContent: 'space-between', paddingVertical: 6 }}>
          <T style={{ flex: 1 }}>{i.description}{Number(i.quantity) !== 1 ? ` × ${Number(i.quantity)}` : ''}</T>
          <T variant="money">{money(Number(i.quantity) * Number(i.unit_price), cur)}</T>
        </Row>
      ))}
    </>
  );
}

export function Totals({ cur, subtotal, discount, tax, total, compact }: { cur: string; subtotal: number; discount: number; tax: number; total: number; compact?: boolean }) {
  return (
    <View>
      <Row style={{ justifyContent: 'space-between' }}><T variant="muted">Subtotal</T><T>{money(subtotal, cur)}</T></Row>
      {Number(discount) ? <Row style={{ justifyContent: 'space-between' }}><T variant="muted">Discount</T><T>−{money(discount, cur)}</T></Row> : null}
      {Number(tax) ? <Row style={{ justifyContent: 'space-between' }}><T variant="muted">Tax</T><T>{money(tax, cur)}</T></Row> : null}
      <Row style={{ justifyContent: 'space-between', marginTop: 4 }}><T variant={compact ? 'body' : 'h3'} style={{ fontWeight: '700' }}>Total</T><T variant={compact ? 'money' : 'h3'}>{money(total, cur)}</T></Row>
    </View>
  );
}

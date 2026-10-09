import { router, Stack, useLocalSearchParams } from 'expo-router';
import * as Linking from 'expo-linking';
import { useState } from 'react';
import { View } from 'react-native';
import { confirmAction, FormSheet, notify, type FieldDef } from '../../../components/FormSheet';
import { invoiceTone, jobTone, quoteTone } from '../../../components/status';
import { Badge, Button, Card, ErrorBanner, IconButton, KeyValue, ListRow, Loading, Row, Screen, Section, Segmented, T } from '../../../components/ui';
import { date, dateTime, money, relative, titleCase } from '../../../lib/format';
import { categoryLabel } from '../../../lib/pricing';
import { canEdit, canSeeMoney } from '../../../lib/plans';
import { useOrg } from '../../../lib/session';
import { supabase } from '../../../lib/supabase';
import { colors, space } from '../../../lib/theme';
import { useQuery } from '../../../lib/useQuery';

const CONTACT_FIELDS: FieldDef[] = [
  { key: 'name', label: 'Name', type: 'text', required: true },
  { key: 'role', label: 'Role', type: 'text', placeholder: 'Chief pilot, DOM, scheduler, owner…' },
  { key: 'email', label: 'Email', type: 'email' },
  { key: 'phone', label: 'Phone', type: 'phone' },
  { key: 'is_primary', label: 'Primary contact', type: 'toggle' },
];

const ACTIVITY_KINDS = [
  { value: 'note', label: 'Note' }, { value: 'call', label: 'Call' }, { value: 'email', label: 'Email' },
  { value: 'sms', label: 'Text' }, { value: 'meeting', label: 'Meeting' },
];

export default function CustomerDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { orgId, role, session } = useOrg();
  const money$ = canSeeMoney(role);
  const [contactSheet, setContactSheet] = useState<{ open: boolean; row?: any }>({ open: false });
  const [activitySheet, setActivitySheet] = useState(false);
  const [tab, setTab] = useState<'jobs' | 'quotes' | 'invoices'>('jobs');

  const q = useQuery(async () => {
    const [c, contacts, aircraft, jobs, quotes, invoices, activities] = await Promise.all([
      supabase.from('customers').select('*, location:locations(name, airport_code)').eq('id', id).single(),
      supabase.from('contacts').select('*').eq('customer_id', id).order('is_primary', { ascending: false }),
      supabase.from('aircraft').select('id, tail_number, manufacturer, model, category').eq('customer_id', id).order('tail_number'),
      supabase.from('jobs').select('id, number, title, status, scheduled_start, aircraft:aircraft(tail_number)').eq('customer_id', id).order('scheduled_start', { ascending: false }).limit(50),
      money$ ? supabase.from('quotes').select('id, number, status, total, issue_date').eq('customer_id', id).order('created_at', { ascending: false }).limit(50) : Promise.resolve({ data: [] }),
      money$ ? supabase.from('invoices').select('id, number, status, total, balance, due_date').eq('customer_id', id).order('created_at', { ascending: false }).limit(50) : Promise.resolve({ data: [] }),
      supabase.from('activities').select('*').eq('customer_id', id).order('created_at', { ascending: false }).limit(50),
    ]);
    if (c.error) throw c.error;
    return { c: c.data, contacts: contacts.data ?? [], aircraft: aircraft.data ?? [], jobs: jobs.data ?? [], quotes: quotes.data ?? [], invoices: invoices.data ?? [], activities: activities.data ?? [] } as any;
  }, [id]);

  if (q.loading) return <Loading />;
  if (!q.data) return <Screen><ErrorBanner message={q.error ?? 'Not found'} /></Screen>;
  const { c, contacts, aircraft, jobs, quotes, invoices, activities } = q.data;
  const lifetime = invoices.reduce((s: number, i: any) => s + (i.status !== 'void' ? Number(i.total) : 0), 0);
  const balance = invoices.reduce((s: number, i: any) => s + (['sent', 'partial', 'overdue'].includes(i.status) ? Number(i.balance) : 0), 0);

  const saveContact = async (v: any) => {
    if (contactSheet.row) {
      const { error } = await supabase.from('contacts').update(v).eq('id', contactSheet.row.id);
      if (error) throw error;
    } else {
      const { error } = await supabase.from('contacts').insert({ ...v, org_id: orgId, customer_id: id });
      if (error) throw error;
    }
    q.reload();
  };

  return (
    <Screen refreshing={q.refreshing} onRefresh={q.refresh}>
      <Stack.Screen options={{ title: c.name, headerRight: () => canEdit(role) ? <IconButton icon="create-outline" onPress={() => router.push({ pathname: '/customers/edit', params: { id } })} label="Edit" /> : null }} />
      <Card>
        <Row style={{ justifyContent: 'space-between' }}>
          <View style={{ flex: 1 }}>
            <T variant="h2">{c.name}</T>
            <T variant="muted">{[c.company, titleCase(c.kind)].filter(Boolean).join(' · ')}</T>
          </View>
          <Badge label={c.status} tone={c.status === 'active' ? 'success' : c.status === 'lead' ? 'info' : 'neutral'} />
        </Row>
        {c.tags?.length ? <Row style={{ flexWrap: 'wrap', marginTop: space.sm }} gap={4}>{c.tags.map((t: string) => <Badge key={t} label={t} tone="primary" />)}</Row> : null}
        <Row style={{ marginTop: space.md }}>
          {c.phone ? <Button small kind="secondary" icon="call-outline" title="Call" onPress={() => Linking.openURL(`tel:${c.phone}`)} /> : null}
          {c.phone ? <Button small kind="secondary" icon="chatbubble-outline" title="Text" onPress={() => Linking.openURL(`sms:${c.phone}`)} /> : null}
          {c.email ? <Button small kind="secondary" icon="mail-outline" title="Email" onPress={() => Linking.openURL(`mailto:${c.email}`)} /> : null}
        </Row>
      </Card>

      {money$ ? (
        <Row gap={space.md}>
          <Card style={{ flex: 1 }}><T variant="muted">Lifetime billed</T><T variant="h3">{money(lifetime)}</T></Card>
          <Card style={{ flex: 1 }}><T variant="muted">Balance due</T><T variant="h3" style={{ color: balance > 0 ? colors.danger : colors.text }}>{money(balance)}</T></Card>
        </Row>
      ) : null}

      {money$ ? (
        <Row style={{ flexWrap: 'wrap' }}>
          <Button small icon="document-text-outline" title="New quote" onPress={() => router.push({ pathname: '/quotes/edit', params: { customer_id: id } })} />
          <Button small kind="secondary" icon="construct-outline" title="New job" onPress={() => router.push({ pathname: '/jobs/edit', params: { customer_id: id } })} />
          <Button small kind="secondary" icon="receipt-outline" title="New invoice" onPress={() => router.push({ pathname: '/invoices/edit', params: { customer_id: id } })} />
        </Row>
      ) : null}

      <Section title="Details">
        <Card>
          <KeyValue label="Email" value={c.email} onPress={c.email ? () => Linking.openURL(`mailto:${c.email}`) : undefined} />
          <KeyValue label="Phone" value={c.phone} onPress={c.phone ? () => Linking.openURL(`tel:${c.phone}`) : undefined} />
          <KeyValue label="Billing address" value={c.billing_address} />
          <KeyValue label="Usual location" value={c.location ? [c.location.airport_code, c.location.name].filter(Boolean).join(' · ') : null} />
          <KeyValue label="Source" value={c.source} />
          {money$ ? <KeyValue label="Terms" value={c.payment_terms_days != null ? `Net ${c.payment_terms_days}` : null} /> : null}
          {money$ ? <KeyValue label="Discount" value={Number(c.discount_pct) ? `${c.discount_pct}%` : null} /> : null}
          {c.tax_exempt ? <KeyValue label="Tax" value="Exempt" /> : null}
          <KeyValue label="Notes" value={c.notes} />
          <KeyValue label="Customer since" value={date(c.created_at)} />
        </Card>
      </Section>

      <Section title={`Aircraft (${aircraft.length})`} action={canEdit(role) ? <Button small kind="ghost" icon="add" title="Add" onPress={() => router.push({ pathname: '/aircraft/edit', params: { customer_id: id } })} /> : null}>
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          {aircraft.length ? aircraft.map((a: any) => (
            <ListRow key={a.id} icon="airplane-outline" title={a.tail_number} subtitle={[a.manufacturer, a.model].filter(Boolean).join(' ')} meta={categoryLabel(a.category)} onPress={() => router.push(`/aircraft/${a.id}`)} />
          )) : <T variant="muted" style={{ padding: space.lg }}>No aircraft yet.</T>}
        </Card>
      </Section>

      <Section title="Contacts" action={canEdit(role) ? <Button small kind="ghost" icon="add" title="Add" onPress={() => setContactSheet({ open: true })} /> : null}>
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          {contacts.length ? contacts.map((ct: any) => (
            <ListRow key={ct.id} icon="person-outline" title={ct.name + (ct.is_primary ? ' ★' : '')} subtitle={ct.role} meta={[ct.phone, ct.email].filter(Boolean).join(' · ')}
              right={ct.phone ? <IconButton icon="call-outline" onPress={() => Linking.openURL(`tel:${ct.phone}`)} label="Call" /> : undefined}
              onPress={canEdit(role) ? () => setContactSheet({ open: true, row: ct }) : undefined} />
          )) : <T variant="muted" style={{ padding: space.lg }}>Add pilots, schedulers, DOMs and other contacts.</T>}
        </Card>
      </Section>

      <Section title="History">
        <Segmented value={tab} onChange={setTab} options={[{ value: 'jobs', label: `Jobs (${jobs.length})` }, ...(money$ ? [{ value: 'quotes' as const, label: `Quotes (${quotes.length})` }, { value: 'invoices' as const, label: `Invoices (${invoices.length})` }] : [])]} />
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          {tab === 'jobs' && jobs.map((j: any) => (
            <ListRow key={j.id} title={`${j.number} · ${j.aircraft?.tail_number ?? ''}`} subtitle={j.title} meta={dateTime(j.scheduled_start)} right={<Badge label={j.status} tone={jobTone[j.status]} />} onPress={() => router.push(`/jobs/${j.id}`)} />
          ))}
          {tab === 'quotes' && quotes.map((x: any) => (
            <ListRow key={x.id} title={x.number} subtitle={money(x.total)} meta={date(x.issue_date)} right={<Badge label={x.status} tone={quoteTone[x.status]} />} onPress={() => router.push(`/quotes/${x.id}`)} />
          ))}
          {tab === 'invoices' && invoices.map((x: any) => (
            <ListRow key={x.id} title={x.number} subtitle={`${money(x.total)} · balance ${money(x.balance)}`} meta={`Due ${date(x.due_date)}`} right={<Badge label={x.status} tone={invoiceTone[x.status]} />} onPress={() => router.push(`/invoices/${x.id}`)} />
          ))}
        </Card>
      </Section>

      <Section title="Activity" action={canEdit(role) ? <Button small kind="ghost" icon="add" title="Log" onPress={() => setActivitySheet(true)} /> : null}>
        {activities.length ? activities.map((a: any) => (
          <Card key={a.id} style={{ padding: space.md }}>
            <Row style={{ justifyContent: 'space-between' }}>
              <Badge label={a.kind} tone={a.kind === 'system' ? 'neutral' : 'primary'} />
              <T variant="small">{relative(a.created_at)}</T>
            </Row>
            <T style={{ marginTop: 6 }}>{a.body}</T>
          </Card>
        )) : <T variant="muted">No activity logged yet.</T>}
      </Section>

      {canSeeMoney(role) ? (
        <Button kind="ghost" icon="trash-outline" title="Delete customer" style={{ marginTop: space.xl }}
          onPress={() => confirmAction('Delete customer?', 'Their contacts and activity are deleted. Customers with jobs, quotes or invoices cannot be deleted. Mark them inactive instead.', async () => {
            const { error } = await supabase.from('customers').delete().eq('id', id);
            if (error) notify('Could not delete', error.message.includes('foreign key') ? 'This customer has jobs, quotes or invoices. Mark them inactive instead.' : error.message);
            else router.back();
          }, true)} />
      ) : null}

      <FormSheet visible={contactSheet.open} title={contactSheet.row ? 'Edit contact' : 'New contact'} fields={CONTACT_FIELDS} initial={contactSheet.row ?? { is_primary: contacts.length === 0 }}
        onClose={() => setContactSheet({ open: false })} onSubmit={saveContact}
        onDelete={contactSheet.row ? async () => { await supabase.from('contacts').delete().eq('id', contactSheet.row.id); q.reload(); } : undefined} />
      <FormSheet visible={activitySheet} title="Log activity" initial={{ kind: 'note' }}
        fields={[{ key: 'kind', label: 'Type', type: 'select', options: ACTIVITY_KINDS }, { key: 'body', label: 'Details', type: 'multiline', required: true }]}
        onClose={() => setActivitySheet(false)}
        onSubmit={async (v) => {
          const { error } = await supabase.from('activities').insert({ ...v, org_id: orgId, customer_id: id, created_by: session!.user.id });
          if (error) throw error;
          q.reload();
        }} />
    </Screen>
  );
}

import { router, Stack, useLocalSearchParams } from 'expo-router';
import * as Linking from 'expo-linking';
import { useState } from 'react';
import { View } from 'react-native';
import { AutomationExceptionsCard, ConsentCard } from '../../../components/customers/CommsCards';
import { PortalCard } from '../../../components/customers/PortalCard';
import { confirmAction, FormSheet, notify, type FieldDef } from '../../../components/FormSheet';
import { invoiceTone, jobTone, quoteTone } from '../../../components/status';
import { Badge, Button, Card, EmptyState, ErrorBanner, IconButton, Ionicons, KeyValue, ListRow, Loading, Row, Screen, Section, Segmented, T } from '../../../components/ui';
import { assetIcon, assetModelName, CUSTOMER_KINDS, facilityTitle } from '../../../lib/assets';
import { date, dateTime, money, relative } from '../../../lib/format';
import { isManager } from '../../../lib/plans';
import { assetTypeInfo, categoryLabel } from '../../../lib/pricing';
import { useOrg } from '../../../lib/session';
import { friendlyError, supabase } from '../../../lib/supabase';
import { colors, space } from '../../../lib/theme';
import type { AssetType, Customer } from '../../../lib/types';
import { useQuery } from '../../../lib/useQuery';

const CONTACT_FIELDS: FieldDef[] = [
  { key: 'name', label: 'Name', type: 'text', required: true },
  { key: 'role', label: 'Role', type: 'text', placeholder: 'Chief pilot, captain, fleet manager, scheduler…' },
  { key: 'email', label: 'Email', type: 'email' },
  { key: 'phone', label: 'Phone', type: 'phone' },
  { key: 'is_primary', label: 'Primary contact', type: 'toggle' },
];

const ACTIVITY_KINDS = [
  { value: 'note', label: 'Note' }, { value: 'call', label: 'Call' }, { value: 'email', label: 'Email' },
  { value: 'sms', label: 'Text' }, { value: 'meeting', label: 'Meeting' },
];
const ACTIVITY_ICON: Record<string, any> = {
  note: 'document-text-outline', call: 'call-outline', email: 'mail-outline', sms: 'chatbubble-outline',
  meeting: 'people-outline', status_change: 'swap-horizontal-outline', system: 'flash-outline',
};

type C = Customer & { location: { name: string; airport_code: string | null } | null };

export default function CustomerDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { orgId, role, session, perm, can, businessTypes } = useOrg();
  const money$ = perm('see_prices');
  const manager = isManager(role);
  const editable = perm('edit_customers');
  const [contactSheet, setContactSheet] = useState<{ open: boolean; row?: any }>({ open: false });
  const [activitySheet, setActivitySheet] = useState(false);
  const [tab, setTab] = useState<'jobs' | 'quotes' | 'invoices' | 'recurring'>('jobs');

  const q = useQuery(async () => {
    const none = Promise.resolve({ data: [] as any[], error: null });
    const [c, contacts, assets, jobs, quotes, invoices, recurring, activities] = await Promise.all([
      supabase.from('customers').select('*, location:locations(name, airport_code)').eq('id', id).single(),
      supabase.from('contacts').select('*').eq('customer_id', id).order('is_primary', { ascending: false }),
      supabase.from('aircraft').select('id, tail_number, manufacturer, model, year, category, asset_type, active, length_ft').eq('customer_id', id).order('tail_number'),
      supabase.from('jobs').select('id, number, title, status, scheduled_start, aircraft:aircraft(tail_number)').eq('customer_id', id).order('scheduled_start', { ascending: false }).limit(50),
      money$ ? supabase.from('quotes').select('id, number, status, total, issue_date').eq('customer_id', id).order('created_at', { ascending: false }).limit(50) : none,
      money$ ? supabase.from('invoices').select('id, number, status, total, balance, due_date').eq('customer_id', id).order('created_at', { ascending: false }).limit(50) : none,
      manager ? supabase.from('recurring_schedules').select('id, title, every, unit, active, paused, aircraft:aircraft(tail_number)').eq('customer_id', id).order('created_at', { ascending: false }) : none,
      supabase.from('activities').select('*').eq('customer_id', id).order('created_at', { ascending: false }).limit(50),
    ]);
    if (c.error) throw c.error;
    return {
      c: c.data as C, contacts: contacts.data ?? [], assets: (assets.data ?? []) as any[], jobs: jobs.data ?? [] as any[],
      quotes: quotes.data ?? [] as any[], invoices: invoices.data ?? [] as any[], recurring: recurring.data ?? [] as any[], activities: activities.data ?? [] as any[],
    };
  }, [id, money$, manager]);

  if (q.loading) return <Loading />;
  if (!q.data) return <Screen><Stack.Screen options={{ title: 'Customer' }} /><ErrorBanner message={q.error ?? 'Not found'} onRetry={q.reload} /></Screen>;
  const { c, contacts, assets, jobs, quotes, invoices, recurring, activities } = q.data;
  const lifetime = invoices.reduce((s: number, i: any) => s + (i.status !== 'void' ? Number(i.total) : 0), 0);
  const balance = invoices.reduce((s: number, i: any) => s + (['sent', 'partial', 'overdue'].includes(i.status) ? Number(i.balance) : 0), 0);
  const kindLabel = CUSTOMER_KINDS.find((k) => k.value === c.kind)?.label;

  // Types to show: enabled ones, plus any type this customer already has.
  const types = (['aircraft', 'vehicle', 'watercraft'] as AssetType[]).filter((t) => businessTypes.includes(t) || assets.some((a) => a.asset_type === t));

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
      <Stack.Screen options={{
        title: c.name,
        headerRight: () => editable ? <IconButton icon="create-outline" onPress={() => router.push({ pathname: '/customers/edit', params: { id } })} label="Edit" /> : null,
      }} />
      <Card>
        <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <View style={{ flex: 1 }}>
            <T variant="h2">{c.name}</T>
            <T variant="muted">{[c.company, kindLabel].filter(Boolean).join(' · ')}</T>
          </View>
          <Badge label={c.status} tone={c.status === 'active' ? 'success' : c.status === 'lead' ? 'info' : 'neutral'} />
        </Row>
        <Row gap={6} style={{ flexWrap: 'wrap', marginTop: space.sm }}>
          {c.sms_opted_out ? <Badge label="Opted out of texts" tone="danger" raw /> : null}
          {(c.automation_exceptions ?? []).length ? <Badge label={`${c.automation_exceptions.length} automation${c.automation_exceptions.length === 1 ? '' : 's'} off`} tone="warning" raw /> : null}
          {c.tags?.map((t: string) => <Badge key={t} label={t} tone="primary" raw />)}
        </Row>
        <Row style={{ marginTop: space.md, flexWrap: 'wrap' }}>
          {c.phone ? <Button small kind="secondary" icon="call-outline" title="Call" onPress={() => Linking.openURL(`tel:${c.phone}`)} /> : null}
          {manager ? <Button small kind="secondary" icon="chatbubbles-outline" title="Message" onPress={() => router.push(`/messages/${id}`)} /> : null}
          {c.email ? <Button small kind="secondary" icon="mail-outline" title="Email" onPress={() => Linking.openURL(`mailto:${c.email}`)} /> : null}
        </Row>
      </Card>

      {money$ ? (
        <Row gap={space.md}>
          <Card style={{ flex: 1 }}><T variant="muted">Lifetime billed</T><T variant="h3">{money(lifetime)}</T></Card>
          <Card style={{ flex: 1 }}><T variant="muted">Balance due</T><T variant="h3" style={{ color: balance > 0 ? colors.danger : colors.text }}>{money(balance)}</T></Card>
        </Row>
      ) : null}

      {manager ? (
        <Row style={{ flexWrap: 'wrap' }}>
          {money$ ? <Button small icon="document-text-outline" title="New quote" onPress={() => router.push({ pathname: '/quotes/edit', params: { customer_id: id } })} /> : null}
          <Button small kind="secondary" icon="construct-outline" title="New job" onPress={() => router.push({ pathname: '/jobs/new', params: { customer_id: id } })} />
          {money$ && can('recurring') ? <Button small kind="secondary" icon="repeat-outline" title="Recurring care" onPress={() => router.push({ pathname: '/recurring/edit', params: { customer_id: id } })} /> : null}
        </Row>
      ) : null}

      <Section title={`Assets (${assets.length})`} action={editable ? <Button small kind="ghost" icon="add" title="Add" onPress={() => router.push({ pathname: '/aircraft/edit', params: { customer_id: id } })} /> : null}>
        {assets.length ? types.filter((t) => assets.some((a) => a.asset_type === t)).map((t) => {
          const list = assets.filter((a) => a.asset_type === t);
          return (
            <View key={t} style={{ marginBottom: space.md }}>
              <T variant="overline" style={{ marginBottom: 6 }}>{assetTypeInfo(t).plural} ({list.length})</T>
              <Card style={{ padding: 0, overflow: 'hidden' }}>
                {list.map((a) => (
                  <ListRow key={a.id} icon={assetIcon(a.asset_type)} tone="warning" title={a.tail_number + (a.active ? '' : ' (inactive)')}
                    subtitle={assetModelName(a) || null} meta={[categoryLabel(a.category), a.length_ft ? `${a.length_ft} ft` : null].filter(Boolean).join(' · ')}
                    onPress={() => router.push(`/aircraft/${a.id}`)} />
                ))}
              </Card>
            </View>
          );
        }) : (
          <Card><T variant="muted">No assets yet. Add their {businessTypes.map((t) => assetTypeInfo(t).plural.toLowerCase()).join(', ').replace(/, ([^,]*)$/, ' or $1')}.</T></Card>
        )}
      </Section>

      <Section title="Details">
        <Card>
          <KeyValue label="Email" value={c.email} onPress={c.email ? () => Linking.openURL(`mailto:${c.email}`) : undefined} />
          <KeyValue label="Phone" value={c.phone} onPress={c.phone ? () => Linking.openURL(`tel:${c.phone}`) : undefined} />
          <KeyValue label="Billing address" value={c.billing_address} />
          <KeyValue label="Usual facility" value={c.location ? facilityTitle(c.location) : null} />
          <KeyValue label="Source" value={c.source} />
          {money$ ? <KeyValue label="Terms" value={c.payment_terms_days != null ? `Net ${c.payment_terms_days}` : 'Company default'} /> : null}
          {money$ ? <KeyValue label="Discount" value={Number(c.discount_pct) ? `${c.discount_pct}%` : null} /> : null}
          {c.tax_exempt ? <KeyValue label="Tax" value="Exempt" /> : null}
          <KeyValue label="Notes" value={c.notes} />
          <KeyValue label="Customer since" value={date(c.created_at)} />
        </Card>
      </Section>

      <Section title="Contacts" action={editable ? <Button small kind="ghost" icon="add" title="Add" onPress={() => setContactSheet({ open: true })} /> : null}>
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          {contacts.length ? contacts.map((ct: any) => (
            <ListRow key={ct.id} icon="person-outline" title={ct.name + (ct.is_primary ? ' ★' : '')} subtitle={ct.role} meta={[ct.phone, ct.email].filter(Boolean).join(' · ')}
              right={ct.phone ? <IconButton icon="call-outline" onPress={() => Linking.openURL(`tel:${ct.phone}`)} label="Call" /> : undefined}
              onPress={editable ? () => setContactSheet({ open: true, row: ct }) : undefined} />
          )) : <T variant="muted" style={{ padding: space.lg }}>Add pilots, captains, schedulers and other people you deal with.</T>}
        </Card>
      </Section>

      <Section title="Texting" icon="chatbubble-ellipses-outline">
        <ConsentCard c={c} editable={editable} onChanged={q.reload} />
      </Section>

      {manager ? (
        <Section title="Automatic messages" icon="flash-outline">
          <AutomationExceptionsCard c={c} editable={editable} onChanged={q.reload} />
        </Section>
      ) : null}

      {manager ? (
        <Section title="Customer portal" icon="globe-outline">
          <PortalCard customerId={id} enabled={c.portal_enabled} email={c.email} onChanged={q.reload} />
        </Section>
      ) : null}

      <Section title="History">
        <Segmented value={tab} onChange={setTab} options={[
          { value: 'jobs' as const, label: 'Jobs', count: jobs.length },
          ...(money$ ? [{ value: 'quotes' as const, label: 'Quotes', count: quotes.length }, { value: 'invoices' as const, label: 'Invoices', count: invoices.length }] : []),
          ...(manager ? [{ value: 'recurring' as const, label: 'Recurring', count: recurring.length }] : []),
        ]} />
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          {tab === 'jobs' && (jobs.length ? jobs.map((j: any) => (
            <ListRow key={j.id} title={[j.number, j.aircraft?.tail_number].filter(Boolean).join(' · ')} subtitle={j.title} meta={dateTime(j.scheduled_start)}
              right={<Badge label={j.status} tone={jobTone[j.status] ?? 'neutral'} />} onPress={() => router.push(`/jobs/${j.id}`)} />
          )) : <T variant="muted" style={{ padding: space.lg }}>No jobs yet.</T>)}
          {tab === 'quotes' && (quotes.length ? quotes.map((x: any) => (
            <ListRow key={x.id} title={x.number} subtitle={money(x.total)} meta={date(x.issue_date)} right={<Badge label={x.status} tone={quoteTone[x.status]} />} onPress={() => router.push(`/quotes/${x.id}`)} />
          )) : <T variant="muted" style={{ padding: space.lg }}>No quotes yet.</T>)}
          {tab === 'invoices' && (invoices.length ? invoices.map((x: any) => (
            <ListRow key={x.id} title={x.number} subtitle={`${money(x.total)} · balance ${money(x.balance)}`} meta={`Due ${date(x.due_date)}`} right={<Badge label={x.status} tone={invoiceTone[x.status]} />} onPress={() => router.push(`/invoices/${x.id}`)} />
          )) : <T variant="muted" style={{ padding: space.lg }}>No invoices yet.</T>)}
          {tab === 'recurring' && (recurring.length ? recurring.map((r: any) => (
            <ListRow key={r.id} icon="repeat-outline" title={r.title ?? 'Recurring care'} subtitle={[r.aircraft?.tail_number, `Every ${r.every} ${r.unit}${r.every === 1 ? '' : 's'}`].filter(Boolean).join(' · ')}
              right={<Badge label={!r.active ? 'Ended' : r.paused ? 'Paused' : 'Active'} tone={!r.active ? 'neutral' : r.paused ? 'warning' : 'success'} raw />}
              onPress={() => router.push(`/recurring/${r.id}`)} />
          )) : <T variant="muted" style={{ padding: space.lg }}>No recurring care schedules.</T>)}
        </Card>
      </Section>

      <Section title="Activity" action={editable ? <Button small kind="ghost" icon="add" title="Log" onPress={() => setActivitySheet(true)} /> : null}>
        {activities.length ? (
          <View style={{ borderLeftWidth: 2, borderLeftColor: colors.borderStrong, marginLeft: 10, paddingLeft: space.md }}>
            {activities.map((a: any) => (
              <View key={a.id} style={{ marginBottom: space.md }}>
                <Row gap={space.sm} style={{ marginLeft: -(space.md + 11) }}>
                  <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.borderStrong }}>
                    <Ionicons name={ACTIVITY_ICON[a.kind] ?? 'ellipse-outline'} size={12} color={colors.primaryText} />
                  </View>
                  <T variant="small" style={{ fontWeight: '700', color: colors.text }}>{ACTIVITY_KINDS.find((k) => k.value === a.kind)?.label ?? (a.kind === 'system' ? 'Update' : 'Status change')}</T>
                  <T variant="small">{relative(a.created_at)}</T>
                </Row>
                <T style={{ marginTop: 2 }}>{a.body}</T>
              </View>
            ))}
          </View>
        ) : <EmptyState icon="time-outline" title="No activity yet" body="Log calls, emails and notes so the whole team knows what was said." />}
      </Section>

      {manager && perm('delete_records') ? (
        <Button kind="ghost" icon="trash-outline" title="Delete customer" style={{ marginTop: space.xl }}
          onPress={() => confirmAction('Delete customer?', 'Their contacts and activity are deleted. Customers with jobs, quotes or invoices cannot be deleted. Mark them inactive instead.', async () => {
            const { error } = await supabase.from('customers').delete().eq('id', id);
            if (error) notify('Could not delete', error.message.includes('foreign key') ? 'This customer has jobs, quotes or invoices. Mark them inactive instead.' : friendlyError(error.message));
            else router.back();
          }, true)} />
      ) : null}

      <FormSheet visible={contactSheet.open} title={contactSheet.row ? 'Edit contact' : 'New contact'} fields={CONTACT_FIELDS} initial={contactSheet.row ?? { is_primary: contacts.length === 0 }}
        onClose={() => setContactSheet({ open: false })} onSubmit={saveContact}
        onDelete={contactSheet.row ? async () => {
          const { error } = await supabase.from('contacts').delete().eq('id', contactSheet.row.id);
          if (error) throw error;
          q.reload();
        } : undefined} />
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

import * as Clipboard from 'expo-clipboard';
import * as Linking from 'expo-linking';
import { Stack } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { notify } from '../../components/FormSheet';
import { Gate } from '../../components/Gate';
import {
  Badge, Button, Card, EmptyState, ErrorBanner, Field, IconTile, Ionicons, ListRow, Loading, Row, Screen, Section, T, ToggleRow,
} from '../../components/ui';
import { dateTime, relative } from '../../lib/format';
import { canAdmin } from '../../lib/plans';
import { useOrg } from '../../lib/session';
import { friendlyError, must, supabase } from '../../lib/supabase';
import { colors, space, type Tone } from '../../lib/theme';
import { useQuery } from '../../lib/useQuery';

type Provider = 'fl3xx' | 'leon' | 'schedaero' | 'airplane_manager' | 'avianis' | 'flight_schedule_pro';
type Status = 'prepared' | 'sent_to_vendor' | 'approved' | 'live' | 'declined';
type Req = { id: string; provider: Provider; management_company: string; contact_name: string | null; contact_email: string | null; notes: string | null; status: Status; created_at: string; updated_at: string };
type ExtEvent = { id: string; provider: string; tail_number: string | null; title: string | null; starts_at: string; ends_at: string | null; location: string | null };

const PROVIDERS: { value: Provider; name: string; blurb: string }[] = [
  { value: 'fl3xx', name: 'FL3XX', blurb: 'Charter & fractional flight operations' },
  { value: 'leon', name: 'Leon', blurb: 'Flight scheduling for charter operators' },
  { value: 'schedaero', name: 'Schedaero', blurb: 'Part 91/135 scheduling & quoting' },
  { value: 'airplane_manager', name: 'Airplane Manager', blurb: 'Aircraft management scheduling' },
  { value: 'avianis', name: 'Avianis', blurb: 'Flight operations & scheduling' },
  { value: 'flight_schedule_pro', name: 'Flight Schedule Pro', blurb: 'Flight school & club scheduling' },
];
const providerName = (p: string) => PROVIDERS.find((x) => x.value === p)?.name ?? p;
const STATUS: Record<Status, { label: string; tone: Tone }> = {
  prepared: { label: 'Prepared · not sent', tone: 'neutral' },
  sent_to_vendor: { label: 'Sent to vendor', tone: 'info' },
  approved: { label: 'Approved', tone: 'success' },
  live: { label: 'Live sync', tone: 'success' },
  declined: { label: 'Declined', tone: 'danger' },
};
const NOT_SENT_WARNING = 'Saved in Flight Ready. Not sent to vendor. No schedule is syncing.';

function letter(r: Pick<Req, 'provider' | 'management_company' | 'contact_name' | 'notes'>, orgName: string, signer: string | null) {
  return `Hello${r.contact_name ? ` ${r.contact_name}` : ''},

We request authorized read-only flight/cleaning schedule access for our organization. Please confirm eligibility, partner approval, organization scope, API fees, sandbox access, supported fields, rate limits and production approval requirements.

Requesting company: ${orgName} (aircraft detailing, using Flight Ready)
Schedule owner: ${r.management_company}
System: ${providerName(r.provider)}
Access needed: read-only — aircraft tail numbers, upcoming flight/arrival times and locations, and any cleaning or detailing requests. No write access is needed.
${r.notes ? `\nNotes: ${r.notes}\n` : ''}
${r.management_company} has authorized us to request this access on their behalf.

Thank you,
${signer ?? orgName}
${orgName}`;
}

export default function Integrations() {
  return (
    <Gate feature="integrations">
      <IntegrationsScreen />
    </Gate>
  );
}

function IntegrationsScreen() {
  const { orgId, org, role, profile } = useOrg();
  const admin = canAdmin(role);
  const [form, setForm] = useState<Provider | null>(null);
  const [viewing, setViewing] = useState<Req | null>(null);

  const q = useQuery(async () => {
    const [r, e] = await Promise.all([
      admin ? must(supabase.from('integration_requests').select('*').eq('org_id', orgId).order('created_at', { ascending: false })) : Promise.resolve([]),
      must(supabase.from('external_schedule_events').select('id, provider, tail_number, title, starts_at, ends_at, location').eq('org_id', orgId)
        .gte('starts_at', new Date(Date.now() - 6 * 3600e3).toISOString()).order('starts_at').limit(50)),
    ]);
    return { reqs: (r ?? []) as Req[], events: (e ?? []) as ExtEvent[] };
  }, [orgId, admin]);
  const reqs = q.data?.reqs ?? [];

  const markSent = async (r: Req) => {
    try {
      await must(supabase.from('integration_requests').update({ status: 'sent_to_vendor' }).eq('id', r.id));
      q.reload();
      setViewing((v) => (v && v.id === r.id ? { ...v, status: 'sent_to_vendor' } : v));
    } catch (e: any) { notify('Could not update', friendlyError(e.message)); }
  };

  return (
    <Screen refreshing={q.refreshing} onRefresh={q.refresh}>
      <Stack.Screen options={{ title: 'Scheduling integrations' }} />
      <ErrorBanner message={q.error} onRetry={q.reload} />
      <Card>
        <T variant="muted">Connect the flight-scheduling software your customers (aircraft management companies) use, so their upcoming flights show next to your jobs. Each vendor must approve partner API access first — we prepare the request for you.</T>
      </Card>

      {admin ? (
        <Section title="Scheduling software" icon="airplane-outline">
          {PROVIDERS.map((p) => {
            const mine = reqs.filter((r) => r.provider === p.value);
            const latest = mine[0];
            return (
              <Card key={p.value}>
                <Row gap={space.md}>
                  <IconTile icon="sync-outline" tone="purple" />
                  <View style={{ flex: 1 }}>
                    <T style={{ fontWeight: '700' }}>{p.name}</T>
                    <T variant="small">{p.blurb}</T>
                  </View>
                  {latest ? <Badge raw label={STATUS[latest.status].label} tone={STATUS[latest.status].tone} /> : <Badge raw label="Not connected" />}
                </Row>
                {mine.map((r) => (
                  <ListRow key={r.id} icon="document-text-outline" tone="neutral" title={r.management_company}
                    subtitle={`${STATUS[r.status].label} · updated ${relative(r.updated_at)}`} onPress={() => setViewing(r)} />
                ))}
                <Button small kind="secondary" icon="create-outline" title="Prepare vendor access request" style={{ marginTop: space.md, alignSelf: 'flex-start' }} onPress={() => setForm(p.value)} />
              </Card>
            );
          })}
        </Section>
      ) : null}

      <Section title="External schedule" icon="calendar-outline" count={q.data?.events.length ? `${q.data.events.length} upcoming` : undefined}>
        {!q.data ? (q.error ? null : <Loading />) : q.data.events.length === 0 ? (
          <Card><EmptyState icon="cloud-offline-outline" title="No external flights yet" body="Live sync turns on per vendor once their partner API access is approved." /></Card>
        ) : (
          <Card style={{ padding: 0, overflow: 'hidden' }}>
            {q.data.events.map((e) => (
              <ListRow key={e.id} icon="airplane-outline" tone="info" title={[e.tail_number, e.title].filter(Boolean).join(' · ') || 'Flight'}
                subtitle={`${dateTime(e.starts_at)}${e.location ? ` · ${e.location}` : ''}`} meta={`From ${providerName(e.provider)} · read-only`} />
            ))}
          </Card>
        )}
      </Section>

      <Section title="Accounting" icon="calculator-outline">
        <Card>
          <Row gap={space.md}>
            <IconTile icon="logo-usd" tone="success" />
            <View style={{ flex: 1 }}>
              <T style={{ fontWeight: '700' }}>QuickBooks Online</T>
              <T variant="small">Sync invoices, payments, expenses and payroll hours.</T>
            </View>
            <Badge raw label="Coming soon (Phase 2)" tone="warning" />
          </Row>
          <T variant="small" style={{ marginTop: space.sm }}>Until then, use the CSV exports in Profit &amp; loss, Business expenses and Timesheets.</T>
        </Card>
      </Section>

      <RequestForm provider={form} onClose={() => setForm(null)} orgId={orgId}
        onSaved={(r) => { q.reload(); setForm(null); setViewing(r); }} />
      <LetterSheet req={viewing} orgName={org.name} signer={profile?.full_name ?? null} onClose={() => setViewing(null)} onMarkSent={markSent} />
    </Screen>
  );
}

function RequestForm({ provider, onClose, onSaved, orgId }: { provider: Provider | null; onClose: () => void; onSaved: (r: Req) => void; orgId: string }) {
  const [v, setV] = useState({ management_company: '', contact_name: '', contact_email: '', notes: '' });
  const [authority, setAuthority] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [was, setWas] = useState(provider);
  if (provider !== was) { setWas(provider); if (provider) { setV({ management_company: '', contact_name: '', contact_email: '', notes: '' }); setAuthority(false); setError(null); } }
  const set = (k: keyof typeof v) => (t: string) => setV((s) => ({ ...s, [k]: t }));

  const save = async () => {
    setError(null);
    if (!v.management_company.trim()) return setError('Enter the management company that owns the schedule');
    if (v.contact_email.trim() && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v.contact_email.trim())) return setError('Enter a valid contact email');
    if (!authority) return setError('Confirm that the schedule owner has authorized this request');
    try {
      const r = await must(supabase.from('integration_requests').insert({
        org_id: orgId, provider, management_company: v.management_company.trim(), contact_name: v.contact_name.trim() || null,
        contact_email: v.contact_email.trim() || null, notes: v.notes.trim() || null, status: 'prepared',
      }).select('*').single());
      onSaved(r as Req);
    } catch (e: any) { setError(friendlyError(e.message)); }
  };

  return (
    <Modal visible={!!provider} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
          <Row style={{ padding: space.lg, justifyContent: 'space-between' }}>
            <Button small kind="ghost" title="Cancel" onPress={onClose} />
            <T variant="h3">{provider ? providerName(provider) : ''} access</T>
            <Button small title="Prepare" onPress={save} />
          </Row>
          <ScrollView contentContainerStyle={{ padding: space.lg, paddingBottom: 64 }} keyboardShouldPersistTaps="handled">
            <ErrorBanner message={error} />
            <Field label="Management company that owns the schedule *" value={v.management_company} onChangeText={set('management_company')} placeholder="Skyline Aircraft Management" />
            <Field label="Contact name" value={v.contact_name} onChangeText={set('contact_name')} />
            <Field label="Contact email" value={v.contact_email} onChangeText={set('contact_email')} keyboardType="email-address" autoCapitalize="none" />
            <Field label="Notes" value={v.notes} onChangeText={set('notes')} multiline placeholder="Which aircraft or bases, anything the vendor should know" />
            <ToggleRow label="I confirm the schedule owner has authorized this request" value={authority} onChange={setAuthority}
              hint="Vendors only share a schedule with the operator's permission." />
            <Card>
              <Row style={{ alignItems: 'flex-start' }}>
                <Ionicons name="information-circle-outline" size={18} color={colors.warning} />
                <T variant="small" style={{ flex: 1 }}>{NOT_SENT_WARNING} We generate a request letter you can copy or email to the vendor.</T>
              </Row>
            </Card>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

function LetterSheet({ req, orgName, signer, onClose, onMarkSent }: { req: Req | null; orgName: string; signer: string | null; onClose: () => void; onMarkSent: (r: Req) => Promise<void> }) {
  const text = req ? letter(req, orgName, signer) : '';
  const subject = req ? `Read-only schedule access request — ${orgName} / ${req.management_company}` : '';
  return (
    <Modal visible={!!req} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
        <Row style={{ padding: space.lg, justifyContent: 'space-between' }}>
          <Button small kind="ghost" title="Close" onPress={onClose} />
          <T variant="h3">Request letter</T>
          <View style={{ width: 60 }} />
        </Row>
        {req ? (
          <ScrollView contentContainerStyle={{ padding: space.lg, paddingBottom: 64 }}>
            <Card style={{ borderColor: colors.warning }}>
              <Row style={{ alignItems: 'flex-start' }}>
                <Ionicons name="alert-circle-outline" size={18} color={colors.warning} />
                <T style={{ flex: 1, color: colors.warning, fontWeight: '600' }}>
                  {req.status === 'prepared' ? NOT_SENT_WARNING : req.status === 'sent_to_vendor' ? 'Sent to vendor. Waiting for their partner approval — no schedule is syncing yet.' : STATUS[req.status].label}
                </T>
              </Row>
            </Card>
            <Row gap={6} style={{ marginBottom: space.md }}>
              <Badge raw label={providerName(req.provider)} tone="purple" />
              <Badge raw label={STATUS[req.status].label} tone={STATUS[req.status].tone} />
            </Row>
            <Card><T style={{ lineHeight: 22 }}>{text}</T></Card>
            <Row gap={space.sm} style={{ flexWrap: 'wrap' }}>
              <Button small kind="secondary" icon="copy-outline" title="Copy letter" onPress={async () => { await Clipboard.setStringAsync(text); notify('Letter copied'); }} />
              <Button small kind="secondary" icon="mail-outline" title="Email" onPress={() => Linking.openURL(`mailto:${encodeURIComponent(req.contact_email ?? '')}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}`)} />
              {req.status === 'prepared' ? <Button small icon="checkmark-done-outline" title="Mark sent to vendor" onPress={() => onMarkSent(req)} /> : null}
            </Row>
          </ScrollView>
        ) : null}
      </SafeAreaView>
    </Modal>
  );
}

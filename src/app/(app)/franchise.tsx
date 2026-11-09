import * as Clipboard from 'expo-clipboard';
import { router, Stack } from 'expo-router';
import { useState } from 'react';
import * as Linking from 'expo-linking';
import { Platform, View } from 'react-native';
import { confirmAction, notify } from '../../components/FormSheet';
import { AccountsTab, AnnouncementsTab, ComplianceTab, StatementsPanel } from '../../components/franchise/HqTabs';
import {
  Badge, Button, Card, EmptyState, ErrorBanner, Field, IconTile, Ionicons, Loading, Row, Screen, Section, Segmented, Select, StatTile, T, ToggleRow,
} from '../../components/ui';
import { APP_NAME, PORTAL_URL } from '../../lib/config';
import { date, money, moneyShort } from '../../lib/format';
import { shareTextFile } from '../../lib/finance';
import {
  createDemoFranchise, createNetwork, leaveNetwork, loadLeadCounts, loadTerritories, parseCodes, setBookingPage, setTerritories, loadDashboard, loadFranchise, loadLocationJobs, loadMembers, loadRoyalties, newInviteCode, pushStandards,
  updateMember, updateNetwork, type FranchiseMember, type FranchiseNetwork, type LocationJob, type Territory,
} from '../../lib/franchise';
import { avgTicket, closeRate, insights, networkTotals, qcRate, royaltyCsv, type LocationStats } from '../../lib/franchiseReport';
import { canAdmin, franchiseQuote } from '../../lib/plans';
import { go } from '../../lib/billing';
import { useOrg } from '../../lib/session';
import { callFunction, friendlyError, supabase } from '../../lib/supabase';
import { colors, space } from '../../lib/theme';
import { useQuery } from '../../lib/useQuery';

type Tab = 'dashboard' | 'locations' | 'standards' | 'royalties' | 'news' | 'accounts' | 'compliance';
type Period = 'month' | 'last_month' | 'quarter' | 'year';

const pct = (n: number | null) => (n == null ? '—' : `${n}%`);

function periodRange(p: Period): { from: Date; to: Date; label: string } {
  const now = new Date();
  const start = (y: number, m: number) => new Date(y, m, 1);
  switch (p) {
    case 'last_month': return { from: start(now.getFullYear(), now.getMonth() - 1), to: start(now.getFullYear(), now.getMonth()), label: 'Last month' };
    case 'quarter': return { from: new Date(now.getTime() - 90 * 86400000), to: new Date(now.getTime() + 86400000), label: 'Last 90 days' };
    case 'year': return { from: start(now.getFullYear(), 0), to: new Date(now.getTime() + 86400000), label: 'This year' };
    default: return { from: start(now.getFullYear(), now.getMonth()), to: new Date(now.getTime() + 86400000), label: 'This month' };
  }
}

const lastMonths = (n: number) => Array.from({ length: n }, (_, i) => {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - i);
  const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  return { value, label: d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) };
});

/** Franchise HQ: network totals and benchmarks, locations, pushed standards and royalties. */
export default function FranchiseHQ() {
  const { org, orgId, role } = useOrg();
  const admin = canAdmin(role);
  const q = useQuery(() => loadFranchise(orgId), [orgId]);
  const [tab, setTab] = useState<Tab>('dashboard');

  if (q.loading) return <Loading />;
  const hq = q.data?.hq ?? null;
  const membership = q.data?.membership ?? null;

  return (
    <Screen refreshing={q.refreshing} onRefresh={q.refresh} wide>
      <Stack.Screen options={{ title: 'Franchise HQ' }} />
      <ErrorBanner message={q.error} onRetry={q.reload} />
      {!admin ? (
        <EmptyState icon="lock-closed-outline" title="For owners and admins" body="Ask your company owner for access to Franchise HQ." />
      ) : membership ? (
        <EmptyState icon="business-outline" title={`A location in ${membership.network?.name ?? 'a franchise network'}`}
          body="Your franchise HQ manages the network. See what you share with HQ in Settings → Franchise network."
          action={<Button title="Open settings" onPress={() => router.push('/settings')} />} />
      ) : !hq ? (
        org.is_demo ? <DemoNetwork onCreated={q.reload} /> : <CreateNetwork orgId={orgId} defaultName={org.name} allowed={!!org.franchise_hq_enabled} onCreated={q.reload} />
      ) : (
        <>
          <Card>
            <Row gap={space.md}>
              <IconTile icon="git-network-outline" tone="primary" />
              <View style={{ flex: 1 }}>
                <T variant="h3">{hq.name}</T>
                <T variant="small">Royalty {Number(hq.royalty_pct)}% · Marketing fund {Number(hq.marketing_pct)}%</T>
              </View>
            </Row>
          </Card>
          <Segmented<Tab> value={tab} onChange={setTab} options={[
            { value: 'dashboard', label: 'Dashboard' },
            { value: 'locations', label: 'Locations' },
            { value: 'standards', label: 'Standards' },
            { value: 'royalties', label: 'Royalties' },
            { value: 'compliance', label: 'Compliance' },
            { value: 'news', label: 'Announcements' },
            { value: 'accounts', label: 'National accounts' },
          ]} />
          {tab === 'dashboard' ? <Dashboard net={hq} /> : null}
          {tab === 'locations' ? <Locations net={hq} onChanged={q.reload} /> : null}
          {tab === 'standards' ? <Standards net={hq} onChanged={q.reload} /> : null}
          {tab === 'royalties' ? <Royalties net={hq} /> : null}
          {tab === 'compliance' ? <ComplianceTab net={hq} /> : null}
          {tab === 'news' ? <AnnouncementsTab net={hq} /> : null}
          {tab === 'accounts' ? <AccountsTab net={hq} /> : null}
        </>
      )}
    </Screen>
  );
}

function DemoNetwork({ onCreated }: { onCreated: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const go = async () => {
    setBusy(true);
    setError(null);
    try { await createDemoFranchise(); onCreated(); } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  };
  return (
    <Section title="Franchise HQ" icon="git-network-outline">
      <Card>
        <T variant="muted" style={{ marginBottom: space.md }}>
          See how a franchise brand runs on {APP_NAME}: network totals and benchmarks across locations, standards pushed to every location,
          a brand playbook for Ask {APP_NAME}, and a monthly royalty report. This loads four sample locations with sample jobs and payments.
        </T>
        <ErrorBanner message={error} />
        <Button title="Explore a sample franchise network" icon="git-network-outline" onPress={go} loading={busy} />
      </Card>
    </Section>
  );
}

function CreateNetwork({ orgId, defaultName, allowed, onCreated }: { orgId: string; defaultName: string; allowed: boolean; onCreated: () => void }) {
  const [name, setName] = useState(defaultName);
  const [royalty, setRoyalty] = useState('6');
  const [marketing, setMarketing] = useState('2');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const create = async () => {
    setError(null);
    setBusy(true);
    try {
      await createNetwork(orgId, name, Number(royalty) || 0, Number(marketing) || 0);
      onCreated();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Section title="Set up your franchise network" icon="git-network-outline">
      <Card>
        <T variant="muted" style={{ marginBottom: space.md }}>
          Run every location from one place. Each franchisee keeps its own customers, books and payment account; HQ sees totals per location,
          sets the standards every location works to, and gets a monthly royalty report.
        </T>
        {!allowed ? (
          <>
            <Badge label="Enterprise & Franchise" tone="primary" />
            <T variant="small" style={{ marginTop: space.sm }}>
              Franchise HQ is part of Enterprise &amp; Franchise. Tell us about your brand and we&apos;ll set it up for you. Joining a network as a
              franchisee doesn&apos;t need it: use the invite code from your HQ in Settings.
            </T>
            <Button title="Talk to us" icon="arrow-forward" onPress={() => Linking.openURL(`${PORTAL_URL}/enterprise`)} style={{ marginTop: space.md }} />
          </>
        ) : (
          <>
            <Field label="Network name" value={name} onChangeText={setName} />
            <Row gap={space.md}>
              <Field label="Royalty %" value={royalty} onChangeText={setRoyalty} keyboardType="decimal-pad" style={{ flex: 1 }} />
              <Field label="Marketing fund %" value={marketing} onChangeText={setMarketing} keyboardType="decimal-pad" style={{ flex: 1 }} />
            </Row>
            <ErrorBanner message={error} />
            <Button title="Create franchise network" icon="add" onPress={create} loading={busy} disabled={!name.trim()} />
          </>
        )}
      </Card>
    </Section>
  );
}

function Dashboard({ net }: { net: FranchiseNetwork }) {
  const [period, setPeriod] = useState<Period>('month');
  const range = periodRange(period);
  const q = useQuery(() => loadDashboard(net.id, range.from, range.to), [net.id, period]);
  const [open, setOpen] = useState<string | null>(null);
  const rows = [...(q.data ?? [])].sort((a, b) => (a.is_hq === b.is_hq ? b.revenue - a.revenue : a.is_hq ? -1 : 1));
  const total = networkTotals(rows);
  const notes = insights(rows);
  return (
    <>
      <NetworkBillingCard net={net} />
      <Segmented<Period> value={period} onChange={setPeriod} options={[
        { value: 'month', label: 'This month' }, { value: 'last_month', label: 'Last month' },
        { value: 'quarter', label: '90 days' }, { value: 'year', label: 'This year' },
      ]} />
      <ErrorBanner message={q.error} onRetry={q.reload} />
      {q.loading ? <Loading /> : (
        <>
          <Row gap={space.md} style={{ flexWrap: 'wrap', marginBottom: space.lg }}>
            <StatTile label="Network revenue" value={moneyShort(total.revenue)} icon="cash-outline" tone="success" />
            <StatTile label="Jobs completed" value={total.jobs_completed} icon="briefcase-outline" />
            <StatTile label="Close rate" value={pct(closeRate(total))} icon="trending-up-outline" tone="info" />
            <StatTile label="Average ticket" value={avgTicket(total) == null ? '—' : moneyShort(avgTicket(total)!)} icon="receipt-outline" tone="purple" />
            <StatTile label="QC pass rate" value={pct(qcRate(total))} icon="shield-checkmark-outline" tone="success" />
            <StatTile label="Customer rating" value={total.avg_rating == null ? '—' : `${total.avg_rating} / 5`} icon="star-outline" tone="warning" />
          </Row>
          {notes.length ? (
            <Section title="Benchmarks" icon="podium-outline">
              <Card style={{ gap: space.sm }}>
                {notes.map((n, i) => (
                  <Row key={i} gap={space.sm}>
                    <Ionicons name={n.tone === 'success' ? 'trophy-outline' : 'alert-circle-outline'} size={18} color={n.tone === 'success' ? colors.success : colors.warning} />
                    <T style={{ flex: 1 }}><T style={{ fontWeight: '700' }}>{n.location_name}</T>: {n.text}</T>
                  </Row>
                ))}
              </Card>
            </Section>
          ) : null}
          <Section title={`Locations · ${range.label}`} icon="business-outline">
            {rows.length <= 1 ? <T variant="muted" style={{ marginBottom: space.md }}>No locations yet. Invite your franchisees from the Locations tab.</T> : null}
            {rows.map((r) => (
              <LocationCard key={r.org_id} net={net} row={r} rank={r.is_hq ? null : rows.filter((x) => !x.is_hq).indexOf(r) + 1}
                from={range.from} to={range.to} open={open === r.org_id}
                onToggle={() => setOpen(open === r.org_id ? null : r.org_id)} />
            ))}
          </Section>
          <T variant="small" style={{ marginBottom: space.lg }}>
            Totals only. Customer names and records stay with each location; job details show only for locations that share them.
          </T>
        </>
      )}
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ minWidth: 92, marginBottom: space.sm }}>
      <T variant="small">{label}</T>
      <T style={{ fontWeight: '700', fontVariant: ['tabular-nums'] }}>{value}</T>
    </View>
  );
}

function LocationCard({ net, row, rank, from, to, open, onToggle }: { net: FranchiseNetwork; row: LocationStats; rank: number | null; from: Date; to: Date; open: boolean; onToggle: () => void }) {
  const canOpen = !row.is_hq && row.share_details;
  const jobs = useQuery(async () => (open && canOpen ? loadLocationJobs(net.id, row.org_id, from, to) : [] as LocationJob[]), [open, row.org_id, from.getTime()]);
  return (
    <Card onPress={canOpen ? onToggle : undefined}>
      <Row style={{ justifyContent: 'space-between', marginBottom: space.sm }} gap={space.sm}>
        <View style={{ flex: 1 }}>
          <T style={{ fontWeight: '700', fontSize: 16 }} numberOfLines={1}>{rank ? `#${rank}  ` : ''}{row.location_name}</T>
          {row.territory ? <T variant="small">{row.territory}</T> : null}
        </View>
        {row.is_hq ? <Badge label="HQ" tone="primary" /> : row.share_details ? <Badge label={open ? 'Hide jobs' : 'View jobs'} tone="success" raw /> : null}
      </Row>
      <Row style={{ flexWrap: 'wrap' }} gap={space.md}>
        <Stat label="Revenue" value={money(row.revenue)} />
        <Stat label="Jobs" value={String(row.jobs_completed)} />
        <Stat label="Close rate" value={pct(closeRate(row))} />
        <Stat label="Avg ticket" value={avgTicket(row) == null ? '—' : money(avgTicket(row)!)} />
        <Stat label="QC pass" value={pct(qcRate(row))} />
        <Stat label="Rating" value={row.avg_rating == null ? '—' : `${row.avg_rating}`} />
        <Stat label="New customers" value={String(row.new_customers)} />
        <Stat label={`Ask ${APP_NAME}`} value={String(row.ai_questions)} />
        <Stat label="Team" value={String(row.team)} />
      </Row>
      {open && canOpen ? (
        <View style={{ marginTop: space.sm, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: space.sm }}>
          {jobs.loading ? <T variant="muted">Loading jobs…</T> : (jobs.data ?? []).length === 0 ? <T variant="muted">No jobs in this period.</T> : (jobs.data ?? []).map((j) => (
            <Row key={j.job_number} style={{ justifyContent: 'space-between', paddingVertical: 4 }} gap={space.sm}>
              <T style={{ flex: 1 }} numberOfLines={1}>{j.job_number} · {j.asset ?? 'Asset'} · {date(j.finished_at)}</T>
              <T variant="small">{j.invoice_total != null ? money(j.invoice_total) : '—'}{j.qc_status === 'passed' ? ' · QC ✓' : j.qc_status === 'failed' ? ' · QC ✗' : ''}</T>
            </Row>
          ))}
        </View>
      ) : null}
    </Card>
  );
}

function Locations({ net, onChanged }: { net: FranchiseNetwork; onChanged: () => void }) {
  const q = useQuery(async () => {
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const [members, territories, leads] = await Promise.all([
      loadMembers(net.id), loadTerritories(net.id), loadLeadCounts(net.id, monthStart, new Date(Date.now() + 86400000)),
    ]);
    return { members, territories, leads };
  }, [net.id]);
  const [error, setError] = useState<string | null>(null);
  const copy = async () => {
    await Clipboard.setStringAsync(net.invite_code);
    notify('Copied', 'Send this code to your franchisee. They enter it in Settings → Franchise network.');
  };
  const regenerate = () => confirmAction('Make a new invite code?', 'The old code stops working. Locations that already joined stay in the network.', async () => {
    try { await newInviteCode(net.id); onChanged(); } catch (e: any) { setError(e.message); }
  });
  return (
    <>
      <Section title="Invite a location" icon="person-add-outline">
        <Card>
          <T variant="muted">Each franchisee signs up for {APP_NAME} with their own company, then enters this code in Settings → Franchise network.</T>
          <T style={{ fontSize: 28, fontWeight: '800', letterSpacing: 4, marginVertical: space.md }}>{net.invite_code}</T>
          <Row gap={space.sm}>
            <Button small icon="copy-outline" title="Copy code" onPress={copy} />
            <Button small kind="secondary" icon="refresh-outline" title="New code" onPress={regenerate} />
          </Row>
        </Card>
      </Section>
      <ErrorBanner message={error ?? q.error} />
      <BookingPageCard net={net} unassigned={q.data?.leads.unassigned ?? 0} total={q.data?.leads.total ?? 0} onChanged={onChanged} />
      <Section title={`Locations (${(q.data?.members ?? []).length})`} icon="business-outline">
        {(q.data?.members ?? []).length === 0 && !q.loading ? <T variant="muted">No locations have joined yet.</T> : null}
        {(q.data?.members ?? []).map((m) => (
          <MemberCard key={m.org_id} m={m} net={net} territories={(q.data?.territories ?? []).filter((t) => t.org_id === m.org_id)}
            leads={q.data?.leads.byOrg[m.org_id] ?? 0} onChanged={() => { q.reload(); onChanged(); }} />
        ))}
      </Section>
    </>
  );
}

function BookingPageCard({ net, unassigned, total, onChanged }: { net: FranchiseNetwork; unassigned: number; total: number; onChanged: () => void }) {
  const [slug, setSlug] = useState(net.public_slug ?? net.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const url = net.public_slug ? `${PORTAL_URL}/book/${net.public_slug}` : null;
  const save = async (enabled: boolean) => {
    setBusy(true);
    setError(null);
    try { await setBookingPage(net.id, enabled, slug); onChanged(); } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  };
  return (
    <Section title="Brand booking page" icon="globe-outline">
      <Card>
        <T variant="muted" style={{ marginBottom: space.md }}>
          One booking page for the whole brand. Customers enter their airport or zip code, and each request goes straight to the location that
          covers it, into that location&apos;s Booking requests. Requests no location covers come to HQ.
        </T>
        <Field label="Page address" value={slug} onChangeText={setSlug} autoCapitalize="none" hint={`${PORTAL_URL}/book/${slug || '…'}`} />
        <ErrorBanner message={error} />
        <Row gap={space.sm} style={{ flexWrap: 'wrap' }}>
          {net.booking_enabled ? (
            <>
              <Button small icon="checkmark" title="Save address" onPress={() => save(true)} loading={busy} />
              {url ? <Button small kind="secondary" icon="open-outline" title="Open page" onPress={() => Linking.openURL(url)} /> : null}
              {url ? <Button small kind="secondary" icon="copy-outline" title="Copy link" onPress={async () => { await Clipboard.setStringAsync(url); notify('Copied', url); }} /> : null}
              <Button small kind="ghost" title="Turn off" onPress={() => save(false)} disabled={busy} />
            </>
          ) : <Button small icon="globe-outline" title="Turn on booking page" onPress={() => save(true)} loading={busy} />}
        </Row>
        {net.booking_enabled ? (
          <T variant="small" style={{ marginTop: space.sm }}>
            This month: {total} request{total === 1 ? '' : 's'}{unassigned ? `, ${unassigned} from areas no location covers yet (sent to HQ)` : ''}.
          </T>
        ) : null}
      </Card>
    </Section>
  );
}

function MemberCard({ m, net, territories, leads, onChanged }: { m: FranchiseMember; net: FranchiseNetwork; territories: Territory[]; leads: number; onChanged: () => void }) {
  const initialAirports = territories.filter((t) => t.kind === 'airport').map((t) => t.code).join(', ');
  const initialZips = territories.filter((t) => t.kind === 'zip').map((t) => t.code).join(', ');
  const [name, setName] = useState(m.location_name ?? '');
  const [territory, setTerritory] = useState(m.territory ?? '');
  const [airports, setAirports] = useState(initialAirports);
  const [zips, setZips] = useState(initialZips);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dirty = name !== (m.location_name ?? '') || territory !== (m.territory ?? '') || airports !== initialAirports || zips !== initialZips;
  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await updateMember(m.org_id, { locationName: name, territory });
      if (airports !== initialAirports || zips !== initialZips) await setTerritories(net.id, m.org_id, parseCodes(airports), parseCodes(zips));
      onChanged();
    } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  };
  const remove = () => confirmAction('Remove this location?', 'It leaves the network and keeps its own copies of your standards, unlocked.', async () => {
    try { await leaveNetwork(m.org_id); onChanged(); } catch (e: any) { setError(e.message); }
  });
  return (
    <Card>
      <Row gap={space.md}>
        <Field label="Location name" value={name} onChangeText={setName} style={{ flex: 1 }} />
        <Field label="Territory name" value={territory} onChangeText={setTerritory} placeholder="e.g. Greater Houston" style={{ flex: 1 }} />
      </Row>
      <Row gap={space.md}>
        <Field label="Airports it covers" value={airports} onChangeText={(t) => setAirports(t.toUpperCase())} placeholder="e.g. KHOU, KIAH, KSGR" autoCapitalize="characters" style={{ flex: 1 }} />
        <Field label="Zip codes it covers" value={zips} onChangeText={setZips} placeholder="e.g. 77002, 770 (3 digits = whole area)" style={{ flex: 1 }} />
      </Row>
      <T variant="small" style={{ marginBottom: space.sm }}>
        Joined {date(m.joined_at)} · {m.share_details ? 'Shares job details with HQ' : 'Shares totals only'} · {leads} booking request{leads === 1 ? '' : 's'} this month
      </T>
      <ErrorBanner message={error} />
      <Row gap={space.sm}>
        <Button small title="Save" onPress={save} loading={busy} disabled={!dirty} />
        <Button small kind="ghost" icon="exit-outline" title="Remove" onPress={remove} />
      </Row>
    </Card>
  );
}

type StdRow = { id: string; name: string; sub: string; push: boolean; lock: boolean; table: 'services' | 'service_guides' };

function Standards({ net, onChanged }: { net: FranchiseNetwork; onChanged: () => void }) {
  const q = useQuery(async () => {
    const [s, g] = await Promise.all([
      supabase.from('services').select('id, name, category, asset_type, franchise_push, franchise_lock').eq('org_id', net.hq_org_id).eq('active', true).order('asset_type').order('sort_order'),
      supabase.from('service_guides').select('id, title, asset_type, franchise_push, franchise_lock').eq('org_id', net.hq_org_id).eq('hidden', false).order('title'),
    ]);
    if (s.error) throw s.error;
    if (g.error) throw g.error;
    return {
      services: (s.data ?? []).map((r: any): StdRow => ({ id: r.id, name: r.name, sub: `${r.asset_type} · ${r.category}`, push: r.franchise_push, lock: r.franchise_lock, table: 'services' })),
      guides: (g.data ?? []).map((r: any): StdRow => ({ id: r.id, name: r.title, sub: r.asset_type, push: r.franchise_push, lock: r.franchise_lock, table: 'service_guides' })),
    };
  }, [net.hq_org_id]);
  const [name, setName] = useState(net.name);
  const [royalty, setRoyalty] = useState(String(Number(net.royalty_pct)));
  const [marketing, setMarketing] = useState(String(Number(net.marketing_pct)));
  const [playbook, setPlaybook] = useState(net.hq_playbook ?? '');
  const [busy, setBusy] = useState<'save' | 'push' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const setFlag = async (r: StdRow, patch: { franchise_push?: boolean; franchise_lock?: boolean }) => {
    const { error: e } = await supabase.from(r.table).update(patch).eq('id', r.id);
    if (e) setError(friendlyError(e.message)); else q.reload();
  };
  const save = async () => {
    setBusy('save');
    setError(null);
    try { await updateNetwork(net.id, name, Number(royalty) || 0, Number(marketing) || 0, playbook); onChanged(); notify('Saved', 'Network settings saved.'); }
    catch (e: any) { setError(e.message); } finally { setBusy(null); }
  };
  const push = () => confirmAction('Push standards to every location?', 'Locked items are replaced at every location; editable items are added where missing and otherwise left as each location changed them.', async () => {
    setBusy('push');
    setError(null);
    try { const n = await pushStandards(net.id); onChanged(); notify('Standards pushed', `Updated ${n} location${n === 1 ? '' : 's'}.`); }
    catch (e: any) { setError(e.message); } finally { setBusy(null); }
  });

  const list = (rows: StdRow[]) => rows.map((r) => (
    <Card key={r.id}>
      <Row style={{ justifyContent: 'space-between' }} gap={space.sm}>
        <View style={{ flex: 1 }}>
          <T style={{ fontWeight: '600' }} numberOfLines={1}>{r.name}</T>
          <T variant="small">{r.sub}</T>
        </View>
        {r.push ? <Badge label={r.lock ? 'Locked' : 'Editable'} tone={r.lock ? 'primary' : 'neutral'} raw /> : null}
      </Row>
      <View style={{ marginTop: space.sm }}>
        <ToggleRow label="Send to every location" value={r.push} onChange={(v) => setFlag(r, { franchise_push: v })} />
        {r.push ? <ToggleRow label="Locked (locations can't change it)" value={r.lock} onChange={(v) => setFlag(r, { franchise_lock: v })} /> : null}
      </View>
    </Card>
  ));

  return (
    <>
      <Section title="Brand playbook for Ask Tarmo" icon="sparkles-outline">
        <Card>
          <T variant="muted" style={{ marginBottom: space.md }}>
            The brand&apos;s products, methods and rules. Every location&apos;s Ask {APP_NAME} follows this first, before the location&apos;s own playbook.
          </T>
          <Field label="Brand playbook" multiline value={playbook} onChangeText={setPlaybook} maxLength={8000} hint={`${playbook.length.toLocaleString('en-US')} of 8,000 characters`} />
          <Field label="Network name" value={name} onChangeText={setName} />
          <Row gap={space.md}>
            <Field label="Royalty %" value={royalty} onChangeText={setRoyalty} keyboardType="decimal-pad" style={{ flex: 1 }} />
            <Field label="Marketing fund %" value={marketing} onChangeText={setMarketing} keyboardType="decimal-pad" style={{ flex: 1 }} />
          </Row>
          <Button title="Save" onPress={save} loading={busy === 'save'} />
        </Card>
      </Section>
      <Section title="Push to locations" icon="cloud-upload-outline">
        <Card>
          <T variant="muted">Choose which services, prices and SOPs every location gets below, then push. New locations get them when they join.</T>
          <T variant="small" style={{ marginTop: space.xs }}>{net.standards_pushed_at ? `Last pushed ${date(net.standards_pushed_at)}` : 'Not pushed yet'}</T>
          <Button title="Push standards to every location" icon="cloud-upload-outline" onPress={push} loading={busy === 'push'} style={{ marginTop: space.md }} />
        </Card>
      </Section>
      <ErrorBanner message={error ?? q.error} />
      <Section title="Services and prices" icon="pricetags-outline">{q.loading ? <Loading /> : list(q.data?.services ?? [])}</Section>
      <Section title="Your SOPs" icon="school-outline">
        {!q.loading && !(q.data?.guides ?? []).length ? <T variant="muted">The {APP_NAME} SOP library is already shared with every location. Your own SOPs (and edited copies) appear here to push.</T> : null}
        {list(q.data?.guides ?? [])}
      </Section>
    </>
  );
}

function Royalties({ net }: { net: FranchiseNetwork }) {
  const months = lastMonths(12);
  const [month, setMonth] = useState(months[1]?.value ?? months[0].value);
  const q = useQuery(() => loadRoyalties(net.id, month), [net.id, month]);
  const rows = q.data ?? [];
  const sum = (k: 'gross_sales' | 'royalty' | 'marketing') => rows.reduce((n, r) => n + r[k], 0);
  const label = months.find((m) => m.value === month)?.label ?? month;
  const exportCsv = async () => {
    try { await shareTextFile(`Royalties ${month}.csv`, royaltyCsv(month, rows)); } catch (e: any) { notify('Export failed', e.message); }
  };
  return (
    <>
      <Select label="Month" value={month} options={months} onChange={(v) => v && setMonth(v)} />
      <ErrorBanner message={q.error} onRetry={q.reload} />
      <Row gap={space.md} style={{ flexWrap: 'wrap', marginBottom: space.lg }}>
        <StatTile label={`Gross sales · ${label}`} value={moneyShort(sum('gross_sales'))} icon="cash-outline" tone="success" />
        <StatTile label={`Royalties (${Number(net.royalty_pct)}%)`} value={moneyShort(sum('royalty'))} icon="ribbon-outline" />
        <StatTile label={`Marketing fund (${Number(net.marketing_pct)}%)`} value={moneyShort(sum('marketing'))} icon="megaphone-outline" tone="purple" />
      </Row>
      {q.loading ? <Loading /> : rows.length === 0 ? <T variant="muted">No locations yet.</T> : rows.map((r) => (
        <Card key={r.org_id}>
          <Row style={{ justifyContent: 'space-between' }} gap={space.sm}>
            <View style={{ flex: 1 }}>
              <T style={{ fontWeight: '700' }} numberOfLines={1}>{r.location_name}</T>
              <T variant="small">{r.payments} payment{r.payments === 1 ? '' : 's'}{r.territory ? ` · ${r.territory}` : ''}</T>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <T style={{ fontWeight: '700' }}>{money(r.royalty + r.marketing)} due</T>
              <T variant="small">on {money(r.gross_sales)} gross</T>
            </View>
          </Row>
        </Card>
      ))}
      <Button kind="secondary" icon="download-outline" title="Export CSV" onPress={exportCsv} disabled={!rows.length} style={{ marginTop: space.sm }} />
      <View style={{ marginTop: space.lg }}>
        <StatementsPanel net={net} month={month} label={label} names={Object.fromEntries(rows.map((r) => [r.org_id, r.location_name]))} />
      </View>
      <T variant="small" style={{ marginTop: space.md, marginBottom: space.lg }}>
        Gross sales are payments each location collected in {APP_NAME} that month (card, Square and recorded payments). {APP_NAME} reports what&apos;s due; you invoice
        franchisees as you do today.
      </T>
    </>
  );
}

/** HQ's Tarmo bill for the network: start card billing, or see what's billed. Support sets the plan first. */
function NetworkBillingCard({ net }: { net: FranchiseNetwork }) {
  const { role } = useOrg();
  const q = useQuery(() => callFunction<{ mode: 'all_in' | 'split' | null; founding: boolean; status: string | null; active: boolean; locations: number; billed_locations: number; monthly_cents: number | null; paid_through: string | null }>(
    'franchise-billing', { action: 'status', network_id: net.id }), [net.id]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const s = q.data;
  if (!s?.mode) return null;
  const open = (url: string) => (Platform.OS === 'web' ? go(url) : Linking.openURL(url));
  const quote = franchiseQuote(s.locations);
  const monthly = s.mode === 'all_in' ? (s.founding ? quote.foundingAllIn : quote.allIn) : quote.split.hq;
  const start = async () => {
    setBusy(true);
    setError(null);
    try { open((await callFunction<{ url: string }>('franchise-billing', { action: 'checkout', network_id: net.id })).url); }
    catch (e: any) { setError(e.message); } finally { setBusy(false); }
  };
  const manage = async () => {
    setBusy(true);
    setError(null);
    try { open((await callFunction<{ url: string }>('billing-portal', { org_id: net.hq_org_id })).url); } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  };
  const what = s.mode === 'all_in'
    ? `${s.locations} location${s.locations === 1 ? '' : 's'}, every franchisee covered on Team${s.founding ? ' (founding network rate, first 12 months)' : ''}`
    : `Franchise HQ for ${s.locations} location${s.locations === 1 ? '' : 's'}; franchisees pay their own plan with 15% off`;
  return (
    <Card style={{ marginBottom: space.md }}>
      <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }} gap={space.sm}>
        <View style={{ flex: 1 }}>
          <T style={{ fontWeight: '700' }}>{APP_NAME} for your network</T>
          <T variant="small">{what}</T>
        </View>
        {s.active ? <Badge label={s.status === 'past_due' ? 'Payment due' : 'Active'} tone={s.status === 'past_due' ? 'warning' : 'success'} raw /> : null}
      </Row>
      <T style={{ fontWeight: '700', fontSize: 18, marginTop: space.sm }}>{money(monthly)}/month</T>
      <T variant="small">Updates automatically as locations join or leave{s.paid_through ? ` · paid through ${date(s.paid_through)}` : ''}.</T>
      <ErrorBanner message={error ?? q.error} />
      {role === 'owner' ? (
        s.active
          ? <Button small kind="secondary" icon="card-outline" title="Manage billing" onPress={manage} loading={busy} style={{ marginTop: space.sm }} />
          : <Button icon="card-outline" title="Start billing" onPress={start} loading={busy} style={{ marginTop: space.sm }} />
      ) : !s.active ? <T variant="small" style={{ marginTop: space.sm }}>Your company owner starts billing here.</T> : null}
    </Card>
  );
}

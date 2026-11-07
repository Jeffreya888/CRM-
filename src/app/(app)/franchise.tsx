import * as Clipboard from 'expo-clipboard';
import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { confirmAction, notify } from '../../components/FormSheet';
import {
  Badge, Button, Card, EmptyState, ErrorBanner, Field, IconTile, Ionicons, Loading, Row, Screen, Section, Segmented, Select, StatTile, T, ToggleRow,
} from '../../components/ui';
import { APP_NAME } from '../../lib/config';
import { date, money, moneyShort } from '../../lib/format';
import { shareTextFile } from '../../lib/finance';
import {
  createDemoFranchise, createNetwork, leaveNetwork, loadDashboard, loadFranchise, loadLocationJobs, loadMembers, loadRoyalties, newInviteCode, pushStandards,
  updateMember, updateNetwork, type FranchiseMember, type FranchiseNetwork, type LocationJob,
} from '../../lib/franchise';
import { avgTicket, closeRate, insights, networkTotals, qcRate, royaltyCsv, type LocationStats } from '../../lib/franchiseReport';
import { canAdmin } from '../../lib/plans';
import { useOrg } from '../../lib/session';
import { friendlyError, supabase } from '../../lib/supabase';
import { colors, space } from '../../lib/theme';
import { useQuery } from '../../lib/useQuery';

type Tab = 'dashboard' | 'locations' | 'standards' | 'royalties';
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
  const { org, orgId, role, plan } = useOrg();
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
        org.is_demo ? <DemoNetwork onCreated={q.reload} /> : <CreateNetwork orgId={orgId} defaultName={org.name} allowed={plan === 'fleet' || plan === 'trial'} onCreated={q.reload} />
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
          ]} />
          {tab === 'dashboard' ? <Dashboard net={hq} /> : null}
          {tab === 'locations' ? <Locations net={hq} onChanged={q.reload} /> : null}
          {tab === 'standards' ? <Standards net={hq} onChanged={q.reload} /> : null}
          {tab === 'royalties' ? <Royalties net={hq} /> : null}
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
            <Badge label="Fleet and Enterprise" tone="primary" />
            <T variant="small" style={{ marginTop: space.sm }}>Franchise HQ is part of the Fleet and Enterprise plans.</T>
            <Button title="See plans" onPress={() => router.push('/paywall')} style={{ marginTop: space.md }} />
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
  const q = useQuery(() => loadMembers(net.id), [net.id]);
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
      <Section title={`Locations (${(q.data ?? []).length})`} icon="business-outline">
        {(q.data ?? []).length === 0 && !q.loading ? <T variant="muted">No locations have joined yet.</T> : null}
        {(q.data ?? []).map((m) => <MemberCard key={m.org_id} m={m} onChanged={() => { q.reload(); onChanged(); }} />)}
      </Section>
    </>
  );
}

function MemberCard({ m, onChanged }: { m: FranchiseMember; onChanged: () => void }) {
  const [name, setName] = useState(m.location_name ?? '');
  const [territory, setTerritory] = useState(m.territory ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dirty = name !== (m.location_name ?? '') || territory !== (m.territory ?? '');
  const save = async () => {
    setBusy(true);
    setError(null);
    try { await updateMember(m.org_id, { locationName: name, territory }); onChanged(); } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  };
  const remove = () => confirmAction('Remove this location?', 'It leaves the network and keeps its own copies of your standards, unlocked.', async () => {
    try { await leaveNetwork(m.org_id); onChanged(); } catch (e: any) { setError(e.message); }
  });
  return (
    <Card>
      <Row gap={space.md}>
        <Field label="Location name" value={name} onChangeText={setName} style={{ flex: 1 }} />
        <Field label="Territory or airports" value={territory} onChangeText={setTerritory} placeholder="e.g. KHOU, KIAH" style={{ flex: 1 }} />
      </Row>
      <T variant="small" style={{ marginBottom: space.sm }}>
        Joined {date(m.joined_at)} · {m.share_details ? 'Shares job details with HQ' : 'Shares totals only'}
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
      <T variant="small" style={{ marginTop: space.md, marginBottom: space.lg }}>
        Gross sales are payments each location collected in {APP_NAME} that month (card, Square and recorded payments). {APP_NAME} reports what&apos;s due; you invoice
        franchisees as you do today.
      </T>
    </>
  );
}

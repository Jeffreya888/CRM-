// Franchise HQ tabs: announcements, national accounts, compliance, and royalty statements.
import { useState } from 'react';
import { View } from 'react-native';
import { confirmAction, notify } from '../FormSheet';
import { Badge, Button, Card, ErrorBanner, Field, IconButton, Loading, Row, Section, T } from '../ui';
import { APP_NAME } from '../../lib/config';
import { date, money } from '../../lib/format';
import {
  deleteAccount, deleteAnnouncement, loadAccountReport, loadAccounts, loadAnnouncements, loadCompliance, loadStatements, postAnnouncement,
  saveAccount, sendStatements, setStatementPaid, type FranchiseNetwork, type Statement,
} from '../../lib/franchise';
import { colors, space } from '../../lib/theme';
import { useQuery } from '../../lib/useQuery';

const rate = (passed: number, failed: number) => (passed + failed > 0 ? Math.round((passed / (passed + failed)) * 100) : null);

export function AnnouncementsTab({ net }: { net: FranchiseNetwork }) {
  const q = useQuery(() => loadAnnouncements(50), [net.id]);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const post = async () => {
    setBusy(true);
    setError(null);
    try {
      await postAnnouncement(net.id, title, body);
      setTitle('');
      setBody('');
      q.reload();
      notify('Posted', 'Every location sees it on their dashboard, and their managers get a notification.');
    } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  };
  const mine = (q.data ?? []).filter((a) => a.network_id === net.id);
  return (
    <>
      <Section title="Post to every location" icon="megaphone-outline">
        <Card>
          <Field label="Title" value={title} onChangeText={setTitle} maxLength={120} placeholder="e.g. New brightwork SOP starts Monday" />
          <Field label="Message" multiline value={body} onChangeText={setBody} maxLength={4000} placeholder="What changed, what to do, and by when." />
          <ErrorBanner message={error} />
          <Button title="Post announcement" icon="send-outline" onPress={post} loading={busy} disabled={!title.trim()} />
        </Card>
      </Section>
      <Section title="Posted" icon="time-outline">
        {q.loading ? <Loading /> : mine.length === 0 ? <T variant="muted">Nothing posted yet.</T> : mine.map((a) => (
          <Card key={a.id}>
            <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }} gap={space.sm}>
              <View style={{ flex: 1 }}>
                <T style={{ fontWeight: '700' }}>{a.title}</T>
                <T variant="small">{date(a.created_at)}</T>
                {a.body ? <T style={{ marginTop: space.xs }}>{a.body}</T> : null}
              </View>
              <IconButton icon="trash-outline" color={colors.textMuted} label="Delete announcement"
                onPress={() => confirmAction('Delete this announcement?', 'Locations stop seeing it.', async () => {
                  try { await deleteAnnouncement(a.id); q.reload(); } catch (e: any) { setError(e.message); }
                })} />
            </Row>
          </Card>
        ))}
      </Section>
    </>
  );
}

export function AccountsTab({ net }: { net: FranchiseNetwork }) {
  const yearStart = new Date(new Date().getFullYear(), 0, 1);
  const q = useQuery(async () => {
    const [accounts, report] = await Promise.all([loadAccounts(), loadAccountReport(net.id, yearStart, new Date(Date.now() + 86400000))]);
    return { accounts: accounts.filter((a) => a.network_id === net.id), report };
  }, [net.id]);
  const [name, setName] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const add = async () => {
    setBusy(true);
    setError(null);
    try { await saveAccount(net.id, null, name, notes); setName(''); setNotes(''); q.reload(); } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  };
  return (
    <>
      <Section title="Add a national account" icon="briefcase-outline">
        <Card>
          <T variant="muted" style={{ marginBottom: space.md }}>
            A customer served by several locations, like an aircraft management company or a charter operator. Each location tags its customer
            record with the account (Customers → Edit), and HQ sees the account&apos;s business across the network.
          </T>
          <Field label="Account name" value={name} onChangeText={setName} maxLength={120} placeholder="e.g. Sky Management Group" />
          <Field label="Notes" value={notes} onChangeText={setNotes} maxLength={2000} placeholder="Contract terms, contacts, pricing agreed" />
          <ErrorBanner message={error} />
          <Button title="Add account" icon="add" onPress={add} loading={busy} disabled={!name.trim()} />
        </Card>
      </Section>
      <Section title={`National accounts · this year`} icon="globe-outline">
        {q.loading ? <Loading /> : (q.data?.accounts ?? []).length === 0 ? <T variant="muted">No national accounts yet.</T> : (q.data?.accounts ?? []).map((a) => {
          const rows = (q.data?.report ?? []).filter((r) => r.account_id === a.id);
          const total = rows.reduce((n, r) => n + r.revenue, 0);
          return (
            <Card key={a.id}>
              <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }} gap={space.sm}>
                <View style={{ flex: 1 }}>
                  <T style={{ fontWeight: '700', fontSize: 16 }}>{a.name}</T>
                  {a.notes ? <T variant="small">{a.notes}</T> : null}
                </View>
                <T style={{ fontWeight: '700' }}>{money(total)}</T>
                <IconButton icon="trash-outline" color={colors.textMuted} label="Delete account"
                  onPress={() => confirmAction('Delete this national account?', 'Locations keep their customers; the tag is removed.', async () => {
                    try { await deleteAccount(a.id); q.reload(); } catch (e: any) { setError(e.message); }
                  })} />
              </Row>
              {rows.length === 0 ? <T variant="small" style={{ marginTop: space.sm }}>No location has tagged a customer with this account yet.</T> : rows.map((r) => (
                <Row key={r.org_id} style={{ justifyContent: 'space-between', marginTop: space.sm }} gap={space.sm}>
                  <T style={{ flex: 1 }} numberOfLines={1}>{r.location_name}</T>
                  <T variant="small">{r.jobs} job{r.jobs === 1 ? '' : 's'} · {money(r.revenue)}</T>
                </Row>
              ))}
            </Card>
          );
        })}
      </Section>
    </>
  );
}

export function ComplianceTab({ net }: { net: FranchiseNetwork }) {
  const q = useQuery(() => loadCompliance(net.id), [net.id]);
  return (
    <>
      <T variant="muted" style={{ marginBottom: space.md }}>
        Brand SOPs are the SOPs and services you push to locations. Coverage is the share of each location&apos;s managers and technicians
        certified on them (Team → skills). QC is this month&apos;s pass rate against last month&apos;s.
      </T>
      <ErrorBanner message={q.error} onRetry={q.reload} />
      {q.loading ? <Loading /> : (q.data ?? []).length === 0 ? <T variant="muted">No locations yet.</T> : (q.data ?? []).map((r) => {
        const coverage = r.possible > 0 ? Math.round((r.certified / r.possible) * 100) : null;
        const qcNow = rate(r.qc_passed_this, r.qc_failed_this);
        const qcLast = rate(r.qc_passed_last, r.qc_failed_last);
        const trend = qcNow != null && qcLast != null ? qcNow - qcLast : null;
        const behind = (coverage != null && coverage < 50) || (qcNow != null && qcNow < 85);
        return (
          <Card key={r.org_id}>
            <Row style={{ justifyContent: 'space-between' }} gap={space.sm}>
              <T style={{ fontWeight: '700', fontSize: 16, flex: 1 }} numberOfLines={1}>{r.location_name}</T>
              {behind ? <Badge label="Needs attention" tone="warning" raw /> : <Badge label="On standard" tone="success" raw />}
            </Row>
            <Row style={{ flexWrap: 'wrap', marginTop: space.sm }} gap={space.lg}>
              <View>
                <T variant="small">SOP certification</T>
                <T style={{ fontWeight: '700' }}>{coverage == null ? '—' : `${coverage}%`}</T>
                <T variant="small">{r.techs === 0 ? 'No team members yet' : r.brand_sops === 0 ? 'No brand SOPs pushed yet' : `${r.certified} of ${r.possible} (${r.techs} people × ${r.brand_sops} SOPs)`}</T>
              </View>
              <View>
                <T variant="small">QC pass rate this month</T>
                <T style={{ fontWeight: '700' }}>{qcNow == null ? '—' : `${qcNow}%`}</T>
                <T variant="small" style={{ color: trend == null ? colors.textMuted : trend >= 0 ? colors.success : colors.warning }}>
                  {trend == null ? 'No comparison yet' : `${trend >= 0 ? '+' : ''}${trend} pts vs last month`}
                </T>
              </View>
            </Row>
          </Card>
        );
      })}
    </>
  );
}

/** Statements for one month: create and email, then track paid / unpaid. */
export function StatementsPanel({ net, month, label, names }: { net: FranchiseNetwork; month: string; label: string; names: Record<string, string> }) {
  const q = useQuery(() => loadStatements({ networkId: net.id, month }), [net.id, month]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const current = month === `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
  const send = () => confirmAction(`Send ${label} statements?`, 'Creates each location’s statement and emails it to the location’s owners and admins. Paid statements are left as they are.', async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await sendStatements(net.id, month);
      q.reload();
      notify('Statements sent', `${r.emailed} emailed${r.failed ? `, ${r.failed} could not be emailed` : ''}.`);
    } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  });
  const toggle = async (s: Statement) => {
    try { await setStatementPaid(s.id, s.status !== 'paid'); q.reload(); } catch (e: any) { setError(e.message); }
  };
  return (
    <Section title={`Statements · ${label}`} icon="document-text-outline">
      <Card>
        {current ? <T variant="muted">Statements are made once a month is over.</T> : (
          <>
            {(q.data ?? []).length === 0 && !q.loading ? <T variant="muted" style={{ marginBottom: space.sm }}>No statements for {label} yet.</T> : null}
            {(q.data ?? []).map((s) => (
              <Row key={s.id} style={{ justifyContent: 'space-between', paddingVertical: 6 }} gap={space.sm}>
                <View style={{ flex: 1 }}>
                  <T style={{ fontWeight: '600' }} numberOfLines={1}>{names[s.org_id] ?? 'Location'} · {money(s.total)}</T>
                  <T variant="small">{s.sent_at ? `Emailed ${date(s.sent_at)}` : 'Not emailed'}{s.paid_at ? ` · Paid ${date(s.paid_at)}` : ''}</T>
                </View>
                <Button small kind={s.status === 'paid' ? 'secondary' : 'primary'} icon={s.status === 'paid' ? 'checkmark' : undefined}
                  title={s.status === 'paid' ? 'Paid' : 'Mark paid'} onPress={() => toggle(s)} />
              </Row>
            ))}
            <ErrorBanner message={error ?? q.error} />
            <Button title={(q.data ?? []).length ? 'Update and email statements' : 'Create and email statements'} icon="mail-outline"
              onPress={send} loading={busy} style={{ marginTop: space.sm }} />
            <T variant="small" style={{ marginTop: space.sm }}>{APP_NAME} reports what&apos;s due; you collect payment as you do today.</T>
          </>
        )}
      </Card>
    </Section>
  );
}

import { addDays, format } from 'date-fns';
import { Stack } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { DateTimeField } from '../../components/DateTimeField';
import { confirmAction, FormSheet, notify } from '../../components/FormSheet';
import { TimesheetPerson, type PersonSummary, type TimeEntry } from '../../components/finance/TimesheetPerson';
import { Gate } from '../../components/Gate';
import { Badge, Button, Card, EmptyState, ErrorBanner, IconButton, Loading, Row, Screen, Section, Segmented, Select, StatTile, T } from '../../components/ui';
import { PAYROLL_FORMATS, payrollCsv, type PayrollFormat } from '../../lib/csv';
import { escHtml, fromYmd, PDF_STYLE, rangeLabel, sharePdfFile, shareTextFile, ymd } from '../../lib/finance';
import { duration, money } from '../../lib/format';
import { useLookups } from '../../lib/lookups';
import { canAdmin, isManager, isOwner } from '../../lib/plans';
import { useOrg } from '../../lib/session';
import { friendlyError, must, supabase } from '../../lib/supabase';
import { space } from '../../lib/theme';
import { useQuery } from '../../lib/useQuery';

type Period = { starts_on: string; ends_on: string };
type PayPeriodRow = { id: string; starts_on: string; ends_on: string; status: 'closed' | 'reopened'; closed_at: string; reopened_at: string | null; reopen_reason: string | null };
const CADENCES = [
  { value: 'weekly', label: 'Weekly' }, { value: 'biweekly', label: 'Every 2 weeks' }, { value: 'semimonthly', label: 'Twice a month' },
] as const;

export default function Timesheets() {
  return (
    <Gate feature="timesheet_approvals">
      <TimesheetsScreen />
    </Gate>
  );
}

function TimesheetsScreen() {
  const { orgId, org, role, perm, refresh: refreshSession, session } = useOrg();
  const admin = canAdmin(role);
  const owner = isOwner(role);
  const canApprove = perm('approve_timesheets');
  const canFix = isManager(role);
  const { members } = useLookups();
  const [anchorDate, setAnchorDate] = useState(ymd(new Date()));
  const [showSettings, setShowSettings] = useState(false);
  const [reopen, setReopen] = useState(false);
  const [fmt, setFmt] = useState<PayrollFormat>('gusto');
  const [busy, setBusy] = useState<string | null>(null);

  const q = useQuery(async () => {
    const pr = await must(supabase.rpc('pay_period_for', { p_org: orgId, p_date: anchorDate }));
    const period = (Array.isArray(pr) ? pr[0] : pr) as Period;
    const from = new Date(period.starts_on + 'T00:00:00');
    const to = addDays(new Date(period.ends_on + 'T00:00:00'), 1);
    let eq = supabase.from('time_entries').select('id, user_id, started_at, ended_at, approved, notes, job:jobs(number, title, customer:customers(name))')
      .eq('org_id', orgId).gte('started_at', from.toISOString()).lt('started_at', to.toISOString()).order('started_at');
    if (!canApprove) eq = eq.eq('user_id', session!.user.id);
    const [summary, entries, locks] = await Promise.all([
      must(supabase.rpc('timesheet_summary', { p_org: orgId, p_from: period.starts_on, p_to: period.ends_on })),
      must(eq),
      must(supabase.from('pay_periods').select('*').eq('org_id', orgId).eq('starts_on', period.starts_on).maybeSingle()),
    ]);
    return { period, people: (summary ?? []) as PersonSummary[], entries: (entries ?? []) as unknown as TimeEntry[], lock: locks as PayPeriodRow | null };
  }, [orgId, anchorDate, canApprove]);

  const d = q.data;
  const locked = d?.lock?.status === 'closed';
  const people = d?.people ?? [];
  const totals = people.reduce((s, p) => ({
    minutes: s.minutes + Number(p.minutes), ot: s.ot + Number(p.overtime_minutes), open: s.open + Number(p.open_entries), un: s.un + Number(p.unapproved),
  }), { minutes: 0, ot: 0, open: 0, un: 0 });
  const isCurrent = d ? ymd(new Date()) >= d.period.starts_on && ymd(new Date()) <= d.period.ends_on : false;

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    try { await fn(); } catch (e: any) { notify('Something went wrong', friendlyError(e.message)); } finally { setBusy(null); }
  };
  const approve = (user: string | null) => run(user ?? 'all', async () => {
    const n = await must(supabase.rpc('approve_time', { p_org: orgId, p_from: d!.period.starts_on, p_to: d!.period.ends_on, p_user: user }));
    q.reload();
    notify('Hours approved', `${n} time ${n === 1 ? 'entry' : 'entries'} approved.`);
  });
  const close = () => confirmAction('Close this pay period?',
    'Hours in this period will be locked so nobody can change them. Only the owner can reopen it.',
    () => run('close', async () => {
      await must(supabase.rpc('close_pay_period', { p_org: orgId, p_start: d!.period.starts_on, p_end: d!.period.ends_on }));
      q.reload();
    }));

  const exportCsv = () => run('csv', async () => {
    const csv = payrollCsv(fmt, { from: d!.period.starts_on, to: d!.period.ends_on },
      people.map((p) => ({ ...p, minutes: Number(p.minutes), overtime_minutes: Number(p.overtime_minutes), hourly_rate: p.hourly_rate })),
      d!.entries.map((e) => ({ ...e, job_number: e.job?.number, customer: e.job?.customer?.name, service: e.job?.title })));
    await shareTextFile(`Timesheets ${fmt} ${d!.period.starts_on} to ${d!.period.ends_on}.csv`, csv);
  });
  const exportPdf = () => run('pdf', async () => {
    const rows = people.map((p) => {
      const rate = p.hourly_rate != null ? Number(p.hourly_rate) : null;
      const reg = Number(p.minutes) - Number(p.overtime_minutes);
      const pay = rate != null ? (reg / 60) * rate + (Number(p.overtime_minutes) / 60) * rate * Number(p.overtime_multiplier ?? 1.5) : null;
      return `<tr><td>${escHtml(p.name)}</td><td class="r">${(reg / 60).toFixed(2)}</td><td class="r">${(Number(p.overtime_minutes) / 60).toFixed(2)}</td><td class="r">${(Number(p.minutes) / 60).toFixed(2)}</td>
        <td>${[Number(p.open_entries) ? 'Missing clock-out' : '', Number(p.unapproved) ? `${p.unapproved} unapproved` : 'Approved'].filter(Boolean).join(', ')}</td>
        ${admin ? `<td class="r">${rate != null ? escHtml(money(rate)) : '—'}</td><td class="r">${pay != null ? escHtml(money(pay)) : '—'}</td>` : ''}</tr>`;
    }).join('');
    const html = `<html><head><meta charset="utf-8">${PDF_STYLE}</head><body>
      <h1>${escHtml(org.name)} · Timesheets</h1>
      <div class="muted">Pay period ${escHtml(rangeLabel(d!.period.starts_on, d!.period.ends_on))} · ${locked ? 'Closed' : 'Open'}</div>
      <h2>Hours by person</h2>
      <table><tr><th>Person</th><th class="r">Regular h</th><th class="r">Overtime h</th><th class="r">Total h</th><th>Status</th>${admin ? '<th class="r">Rate</th><th class="r">Est. gross pay</th>' : ''}</tr>${rows}
      <tr class="b"><td>Total</td><td class="r">${((totals.minutes - totals.ot) / 60).toFixed(2)}</td><td class="r">${(totals.ot / 60).toFixed(2)}</td><td class="r">${(totals.minutes / 60).toFixed(2)}</td><td></td>${admin ? '<td></td><td></td>' : ''}</tr></table>
      <p class="muted">Overtime = hours over 40 in a Monday–Sunday week.</p></body></html>`;
    await sharePdfFile(html, `Timesheets ${d!.period.starts_on}.pdf`);
  });

  const go = (dir: -1 | 1) => { if (d) setAnchorDate(ymd(addDays(fromYmd(dir < 0 ? d.period.starts_on : d.period.ends_on), dir))); };

  return (
    <Screen refreshing={q.refreshing} onRefresh={q.refresh}>
      <Stack.Screen options={{ title: canApprove ? 'Timesheet approvals' : 'My hours' }} />
      <ErrorBanner message={q.error} onRetry={q.reload} />
      {!d ? (q.error ? null : <Loading />) : (
        <>
          <Card>
            <Row style={{ justifyContent: 'space-between' }}>
              <IconButton icon="chevron-back" label="Previous pay period" onPress={() => go(-1)} />
              <View style={{ flex: 1, alignItems: 'center' }}>
                <T variant="muted">{isCurrent ? 'Current pay period' : 'Pay period'}</T>
                <T variant="h3" style={{ textAlign: 'center' }}>{format(fromYmd(d.period.starts_on), 'MMM d')} – {format(fromYmd(d.period.ends_on), 'MMM d, yyyy')}</T>
              </View>
              <IconButton icon="chevron-forward" label="Next pay period" onPress={() => go(1)} />
            </Row>
            <Row style={{ justifyContent: 'center', marginTop: space.sm, flexWrap: 'wrap' }} gap={6}>
              {locked ? <Badge raw label="Closed · locked" tone="success" /> : d.lock?.status === 'reopened' ? <Badge raw label="Reopened" tone="warning" /> : <Badge raw label="Open" tone="info" />}
              {!isCurrent ? <Button small kind="ghost" title="Jump to current" onPress={() => setAnchorDate(ymd(new Date()))} /> : null}
            </Row>
            {d.lock?.status === 'reopened' && d.lock.reopen_reason ? <T variant="small" style={{ textAlign: 'center', marginTop: 4 }}>Reopened: {d.lock.reopen_reason}</T> : null}
          </Card>

          <Row style={{ flexWrap: 'wrap' }} gap={space.md}>
            <StatTile label="Total hours" value={duration(totals.minutes)} icon="time-outline" />
            <StatTile label="Overtime" value={duration(totals.ot)} icon="flame-outline" tone={totals.ot ? 'warning' : 'neutral'} />
            <StatTile label="Missing clock-outs" value={totals.open} icon="alert-circle-outline" tone={totals.open ? 'danger' : 'neutral'} />
            <StatTile label="To approve" value={totals.un} icon="checkmark-done-outline" tone={totals.un ? 'info' : 'success'} />
          </Row>

          {canApprove && !locked && totals.un > 0 ? (
            <Button style={{ marginTop: space.lg }} icon="checkmark-done-outline" title={`Approve all (${totals.un})`} loading={busy === 'all'} onPress={() => approve(null)} />
          ) : null}

          <Section title={canApprove ? 'Team' : 'My hours'} count={canApprove ? `${people.length}` : undefined}>
            {people.length === 0 ? (
              <EmptyState icon="time-outline" title="No hours yet" body="Hours show up here when people clock in from the dashboard or a job." />
            ) : people.map((p) => (
              <TimesheetPerson key={p.user_id} p={p} entries={d.entries.filter((e) => e.user_id === p.user_id)}
                color={members.find((m) => m.user_id === p.user_id)?.color} canApprove={canApprove} canFix={canFix} locked={locked}
                showPay={admin} onApprove={() => approve(p.user_id)} onChanged={q.reload} startOpen={!canApprove} />
            ))}
            {!canApprove ? <T variant="small">Approved entries are final for payroll. Ask your manager if something looks wrong.</T> : null}
          </Section>

          {canApprove ? (
            <Section title="Export for payroll" icon="download-outline">
              <Card>
                <Select label="Format" value={fmt} onChange={(v) => v && setFmt(v)} options={PAYROLL_FORMATS} inline />
                <Row gap={space.sm}>
                  <Button style={{ flex: 1 }} kind="secondary" icon="document-text-outline" title="CSV" loading={busy === 'csv'} onPress={exportCsv} />
                  <Button style={{ flex: 1 }} kind="secondary" icon="print-outline" title="PDF summary" loading={busy === 'pdf'} onPress={exportPdf} />
                </Row>
                {totals.un > 0 || totals.open > 0 ? <T variant="small" style={{ marginTop: space.sm }}>Tip: approve hours and fix missing clock-outs before exporting.</T> : null}
              </Card>
            </Section>
          ) : null}

          {admin ? (
            <Section title="Close pay period" icon="lock-closed-outline">
              <Card>
                {locked ? (
                  <>
                    <T>This period is closed. Hours can&apos;t be changed.</T>
                    {owner ? <Button style={{ marginTop: space.md }} kind="secondary" icon="lock-open-outline" title="Reopen (owner)" onPress={() => setReopen(true)} />
                      : <T variant="small" style={{ marginTop: 4 }}>Only the owner can reopen it.</T>}
                  </>
                ) : (
                  <>
                    <T variant="muted">Closing locks every entry in this period. Do it after payroll is approved.</T>
                    <Button style={{ marginTop: space.md }} icon="lock-closed-outline" title="Close pay period" loading={busy === 'close'} onPress={close} />
                  </>
                )}
              </Card>
            </Section>
          ) : null}

          {admin ? (
            <Section title="Pay schedule" icon="calendar-outline" action={<Button small kind="ghost" title={showSettings ? 'Hide' : 'Change'} onPress={() => setShowSettings((s) => !s)} />}>
              <Card>
                <T>{CADENCES.find((c) => c.value === org.pay_period_cadence)?.label ?? 'Every 2 weeks'}{org.pay_period_cadence !== 'semimonthly' ? ` · starting ${format(fromYmd(org.pay_period_anchor), 'EEE, MMM d, yyyy')}` : ' · 1st–15th and 16th–end of month'}</T>
                {showSettings ? <CadenceEditor org={org} orgId={orgId} onSaved={async () => { await refreshSession(); q.reload(); setShowSettings(false); }} /> : null}
              </Card>
            </Section>
          ) : null}
        </>
      )}
      <FormSheet visible={reopen} title="Reopen pay period" initial={{ reason: '' }} onClose={() => setReopen(false)}
        fields={[{ key: 'reason', label: 'Reason (saved in the activity log)', type: 'multiline', required: true }]}
        onSubmit={async (v) => {
          await must(supabase.rpc('reopen_pay_period', { p_period: d!.lock!.id, p_reason: v.reason }));
          q.reload();
        }} />
    </Screen>
  );
}

function CadenceEditor({ org, orgId, onSaved }: { org: { pay_period_cadence: 'weekly' | 'biweekly' | 'semimonthly'; pay_period_anchor: string }; orgId: string; onSaved: () => Promise<void> }) {
  const [cadence, setCadence] = useState(org.pay_period_cadence);
  const [anchor, setAnchor] = useState<string | null>(org.pay_period_anchor);
  const [error, setError] = useState<string | null>(null);
  return (
    <View style={{ marginTop: space.lg }}>
      <ErrorBanner message={error} />
      <Segmented value={cadence} onChange={setCadence} options={CADENCES.map((c) => ({ ...c }))} />
      {cadence !== 'semimonthly' ? <DateTimeField label="First day of any pay period" mode="date" value={anchor} onChange={setAnchor} allowClear={false} /> : null}
      <Button title="Save pay schedule" onPress={async () => {
        try {
          await must(supabase.from('organizations').update({ pay_period_cadence: cadence, pay_period_anchor: anchor ?? org.pay_period_anchor }).eq('id', orgId));
          await onSaved();
        } catch (e: any) { setError(friendlyError(e.message)); }
      }} />
    </View>
  );
}

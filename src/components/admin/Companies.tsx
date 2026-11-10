// Founder dashboard: find any company, see how it's doing, and help it (more trial days, free time on a plan).
import * as Linking from 'expo-linking';
import { useState } from 'react';
import { View } from 'react-native';
import { confirmAction, notify } from '../FormSheet';
import { Badge, Button, Card, ErrorBanner, Field, ListRow, Loading, Row, Section, Segmented, T } from '../ui';
import { date, money, relative, titleCase } from '../../lib/format';
import { friendlyError, must, supabase } from '../../lib/supabase';
import { colors, space } from '../../lib/theme';
import { useQuery } from '../../lib/useQuery';

type Found = { id: string; name: string; plan: string; owner_email: string | null; created_at: string; last_active: string | null };
type Detail = Found & {
  email: string | null; phone: string | null; business_types: string[]; effective_plan: string; trial_ends_at: string | null; plan_expires_at: string | null;
  billing_source: string | null; billing_period: string | null; billing_status: string | null; extra_locations: number; branch_limit: number | null;
  discount_monthly: number; team: number; locations: number; customers: number; quotes: number; jobs_completed: number; invoices: number; payments: number;
  revenue_30d: number; ai_checks_30d: number; ai_questions_30d: number; texts_30d: number; franchise: { network: string; role: 'hq' | 'location' } | null;
};

const lastSeen = (v: string | null) => (v ? relative(v) : 'never');

export function Companies({ openId, onOpened, owner = true }: { openId?: string | null; onOpened?: () => void; owner?: boolean }) {
  const [query, setQuery] = useState('');
  const [rows, setRows] = useState<Found[] | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selected = openId ?? picked;
  const search = async () => {
    setBusy(true);
    setError(null);
    try { setRows((await must(supabase.rpc('platform_find_companies', { p_query: query }))) as Found[]); }
    catch (e: any) { setError(friendlyError(e.message)); } finally { setBusy(false); }
  };
  if (selected) return <CompanyDetail owner={owner} id={selected} onBack={() => { setPicked(null); onOpened?.(); }} />;
  return (
    <>
      <Card>
        <Field label="Company name or any team member's email" value={query} onChangeText={setQuery} onSubmitEditing={search} autoCapitalize="none" />
        <Button title="Search" icon="search" onPress={search} loading={busy} disabled={query.trim().length < 2} />
      </Card>
      <ErrorBanner message={error} />
      {rows && rows.length === 0 ? <T variant="muted">No companies found.</T> : null}
      {rows?.length ? (
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          {rows.map((o) => (
            <ListRow key={o.id} icon="business-outline" title={o.name} subtitle={o.owner_email ?? undefined}
              meta={`${titleCase(o.plan)} · active ${lastSeen(o.last_active)}`} onPress={() => setPicked(o.id)} />
          ))}
        </Card>
      ) : null}
    </>
  );
}

function CompanyDetail({ id, onBack, owner }: { id: string; onBack: () => void; owner: boolean }) {
  const q = useQuery(async () => (await must(supabase.rpc('platform_company', { p_org: id }))) as Detail, [id]);
  const [trialDays, setTrialDays] = useState('14');
  const [compPlan, setCompPlan] = useState<'solo' | 'team' | 'fleet'>('team');
  const [compDays, setCompDays] = useState('30');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const c = q.data;
  const act = (title: string, body: string, fn: () => Promise<unknown>, done: string) => confirmAction(title, body, async () => {
    setBusy(true);
    setError(null);
    try { await fn(); notify('Done', done); await q.reload(); } catch (e: any) { setError(friendlyError(e.message)); } finally { setBusy(false); }
  });
  const stat = (label: string, value: string | number) => (
    <View style={{ width: '50%', paddingVertical: 6, paddingRight: space.sm }}>
      <T variant="small">{label}</T>
      <T style={{ fontWeight: '700' }}>{value}</T>
    </View>
  );
  const nextStep = !c ? null
    : c.customers === 0 ? 'Hasn’t added a customer yet'
    : c.quotes === 0 ? 'Added customers but hasn’t made a quote'
    : c.jobs_completed === 0 ? 'Quoting, but no job completed yet'
    : c.payments === 0 ? 'Completing jobs, but not taking payments through Tarmo'
    : null;
  const paid = c && ['solo', 'team', 'fleet'].includes(c.effective_plan);

  return (
    <>
      <Button small kind="ghost" icon="arrow-back" title="All companies" onPress={onBack} style={{ alignSelf: 'flex-start', marginBottom: space.sm }} />
      <ErrorBanner message={q.error ?? error} onRetry={q.reload} />
      {q.loading || !c ? <Loading /> : (
        <>
          <Card>
            <T style={{ fontWeight: '800', fontSize: 20 }}>{c.name}</T>
            <Row style={{ flexWrap: 'wrap', marginTop: space.xs }} gap={space.sm}>
              <Badge label={titleCase(c.effective_plan)} tone={paid ? 'success' : c.effective_plan === 'trial' ? 'warning' : 'neutral'} raw />
              {c.billing_source ? <Badge label={c.billing_source === 'stripe' ? 'Web billing' : c.billing_source === 'franchise' ? 'Paid by franchise HQ' : 'App store billing'} tone="neutral" raw /> : null}
              {c.billing_status && c.billing_status !== 'active' ? <Badge label={`Stripe: ${c.billing_status.replace('_', ' ')}`} tone="danger" raw /> : null}
              {c.franchise ? <Badge label={`${c.franchise.role === 'hq' ? 'HQ of' : 'Location in'} ${c.franchise.network}`} tone="info" raw /> : null}
            </Row>
            <T variant="small" style={{ marginTop: space.sm }}>
              Joined {date(c.created_at)} · last active {lastSeen(c.last_active)}
              {c.effective_plan === 'trial' && c.trial_ends_at ? ` · trial ends ${date(c.trial_ends_at)}` : ''}
              {paid && c.plan_expires_at ? ` · paid through ${date(c.plan_expires_at)}` : ''}
            </T>
            {c.owner_email ? (
              <Button small kind="secondary" icon="mail-outline" title={`Email ${c.owner_email}`} style={{ marginTop: space.sm, alignSelf: 'flex-start' }}
                onPress={() => Linking.openURL(`mailto:${c.owner_email}`)} />
            ) : null}
          </Card>

          {nextStep ? (
            <Card style={{ backgroundColor: colors.warningSoft }}>
              <T style={{ fontWeight: '700' }}>Where they’re stuck</T>
              <T variant="small">{nextStep}</T>
            </Card>
          ) : null}

          <Section title="Usage" icon="stats-chart-outline">
            <Card>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                {stat('Team members', c.team)}
                {stat('Locations', c.locations)}
                {stat('Customers', c.customers)}
                {stat('Quotes', c.quotes)}
                {stat('Jobs completed', c.jobs_completed)}
                {stat('Invoices', c.invoices)}
                {stat('Payments in Tarmo (30 days)', money(Number(c.revenue_30d)))}
                {stat('AI checks / questions (30 days)', `${c.ai_checks_30d} / ${c.ai_questions_30d}`)}
                {stat('Texts sent (30 days)', c.texts_30d)}
                {stat('Billing', c.billing_period ? titleCase(c.billing_period) : '—')}
              </View>
              {c.extra_locations || c.branch_limit || Number(c.discount_monthly) ? (
                <T variant="small" style={{ marginTop: space.xs }}>
                  {[c.extra_locations ? `${c.extra_locations} extra locations` : '', c.branch_limit ? `location limit ${c.branch_limit}` : '',
                    Number(c.discount_monthly) ? `${money(Number(c.discount_monthly))}/mo discount` : ''].filter(Boolean).join(' · ')}
                </T>
              ) : null}
            </Card>
          </Section>

          <Section title="Help this company" icon="heart-outline">
            <Card>
              {!paid ? (
                <>
                  <T style={{ fontWeight: '700' }}>More trial days</T>
                  <Row gap={space.sm} style={{ alignItems: 'flex-end' }}>
                    <Field label="Days" value={trialDays} onChangeText={setTrialDays} keyboardType="number-pad" style={{ flex: 1 }} />
                    <Button title="Extend trial" icon="time-outline" loading={busy} disabled={!(Number(trialDays) >= 1 && Number(trialDays) <= 90)}
                      onPress={() => act('Extend the free trial?', `${c.name} gets ${trialDays} more days. The owner gets a notification.`,
                        () => must(supabase.rpc('platform_extend_trial', { p_org: c.id, p_days: Number(trialDays) })), `Trial extended by ${trialDays} days.`)} />
                  </Row>
                </>
              ) : null}
              {owner ? (<>
              <T style={{ fontWeight: '700', marginTop: paid ? 0 : space.md }}>Free time on a plan</T>
              <T variant="small" style={{ marginBottom: space.sm }}>For design partners or to make up for a problem. Companies paying through Stripe or an app store get a coupon there instead.</T>
              <Segmented value={compPlan} onChange={setCompPlan} options={[{ value: 'solo', label: 'Solo' }, { value: 'team', label: 'Team' }, { value: 'fleet', label: 'Fleet' }]} />
              <Row gap={space.sm} style={{ alignItems: 'flex-end' }}>
                <Field label="Days" value={compDays} onChangeText={setCompDays} keyboardType="number-pad" style={{ flex: 1 }} />
                <Button title="Give free time" icon="gift-outline" loading={busy} disabled={!(Number(compDays) >= 1 && Number(compDays) <= 366)}
                  onPress={() => act(`Give ${compDays} days of ${titleCase(compPlan)}?`, `${c.name} gets ${titleCase(compPlan)} free for ${compDays} days. The owner gets a notification.`,
                    () => must(supabase.rpc('platform_comp_plan', { p_org: c.id, p_plan: compPlan, p_days: Number(compDays) })), `${titleCase(compPlan)} free for ${compDays} days.`)} />
              </Row>
              </>) : paid ? <T variant="muted">Paid company: an owner can give free time if needed.</T> : null}
            </Card>
          </Section>
        </>
      )}
    </>
  );
}

import { router, Stack } from 'expo-router';
import * as Linking from 'expo-linking';
import { useState } from 'react';
import { Alert, Platform, View } from 'react-native';
import { FormSheet, type FieldDef } from '../../components/FormSheet';
import { Gate } from '../../components/Gate';
import { stageTone } from '../../components/status';
import { Badge, Button, Card, EmptyState, ErrorBanner, IconButton, Row, Screen, SearchBar, Segmented, Select, StatTile, T } from '../../components/ui';
import { LEAD_STAGES } from '../../lib/assets';
import { date, isoDate, money, moneyShort } from '../../lib/format';
import { useLookups } from '../../lib/lookups';
import { isManager } from '../../lib/plans';
import { useOrg } from '../../lib/session';
import { friendlyError, must, supabase } from '../../lib/supabase';
import { colors, space } from '../../lib/theme';
import type { Stage } from '../../lib/types';
import { useQuery } from '../../lib/useQuery';

type Lead = {
  id: string; title: string; stage: Stage; value: number; probability: number; follow_up_on: string | null; expected_close: string | null;
  source: string | null; assigned_to: string | null; lost_reason: string | null; notes: string | null; customer_id: string | null;
  contact_name: string | null; contact_email: string | null; contact_phone: string | null; asset_description: string | null;
  won_at: string | null; created_at: string; customer: { id: string; name: string } | null;
};

const LOST_REASONS = ['Price', 'Timing', 'Went with someone else', 'No response', 'Not a fit', 'Other'].map((l) => ({ value: l, label: l }));

function ask(title: string, message: string, yes: string, no: string): Promise<boolean> {
  if (Platform.OS === 'web') return Promise.resolve(confirm(`${title}\n\n${message}`));
  return new Promise((resolve) => Alert.alert(title, message, [
    { text: no, style: 'cancel', onPress: () => resolve(false) },
    { text: yes, onPress: () => resolve(true) },
  ], { cancelable: true, onDismiss: () => resolve(false) }));
}

export default function Leads() {
  const { role, perm } = useOrg();
  if (!isManager(role) || !perm('see_prices')) {
    return (
      <Screen>
        <Stack.Screen options={{ title: 'Leads & follow-ups' }} />
        <EmptyState icon="lock-closed-outline" title="Owners and managers only" body="Leads include prices, so only owners and managers who can see prices have access." />
      </Screen>
    );
  }
  return (
    <Gate feature="pipeline">
      <LeadsInner />
    </Gate>
  );
}

function LeadsInner() {
  const { orgId, session, perm } = useOrg();
  const { customerOptions, memberOptions, memberName } = useLookups();
  const [filter, setFilter] = useState<'open' | 'due' | Stage>('open');
  const [assignee, setAssignee] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [sheet, setSheet] = useState<{ open: boolean; row?: Lead }>({ open: false });
  const [lostFor, setLostFor] = useState<Lead | null>(null);
  const [error, setError] = useState<string | null>(null);
  const today = isoDate();

  const q = useQuery(async () => (await must(supabase.from('opportunities').select('*, customer:customers(id, name)')
    .eq('org_id', orgId).order('follow_up_on', { ascending: true, nullsFirst: false }).order('created_at', { ascending: false }))) as Lead[], [orgId]);
  const all = q.data ?? [];
  const isOpen = (l: Lead) => l.stage !== 'won' && l.stage !== 'lost';
  const isDue = (l: Lead) => isOpen(l) && !!l.follow_up_on && l.follow_up_on <= today;

  const s = search.trim().toLowerCase();
  const rows = all
    .filter((l) => (filter === 'open' ? isOpen(l) : filter === 'due' ? isDue(l) : l.stage === filter))
    .filter((l) => !assignee || (assignee === 'none' ? !l.assigned_to : l.assigned_to === assignee))
    .filter((l) => !s || [l.title, l.contact_name, l.contact_email, l.contact_phone, l.asset_description, l.customer?.name, l.source].some((x) => x?.toLowerCase().includes(s)));

  const open = all.filter(isOpen);
  const openValue = open.reduce((t, l) => t + Number(l.value), 0);
  const weighted = open.reduce((t, l) => t + (Number(l.value) * l.probability) / 100, 0);
  const monthStart = today.slice(0, 7);
  const wonMonth = all.filter((l) => l.stage === 'won' && (l.won_at ?? '').slice(0, 7) === monthStart).reduce((t, l) => t + Number(l.value), 0);
  const dueCount = all.filter(isDue).length;

  const fields: FieldDef[] = [
    { key: 'title', label: 'What they want', type: 'text', required: true, placeholder: 'Monthly wash, 3 aircraft' },
    { key: 'contact_name', label: 'Contact name', type: 'text' },
    { key: 'contact_phone', label: 'Contact phone', type: 'phone' },
    { key: 'contact_email', label: 'Contact email', type: 'email' },
    { key: 'customer_id', label: 'Existing customer (optional)', type: 'select', options: customerOptions, allowClear: true },
    { key: 'asset_description', label: 'Asset(s)', type: 'text', placeholder: 'G650 at KTEB, 2 Tahoes, 45 ft Viking' },
    { key: 'stage', label: 'Stage', type: 'select', options: LEAD_STAGES.filter((x) => x.value !== 'won' && x.value !== 'lost').map((x) => ({ value: x.value, label: x.label })) },
    { key: 'follow_up_on', label: 'Next follow-up', type: 'date' },
    { key: 'assigned_to', label: 'Assigned to', type: 'select', options: memberOptions, allowClear: true },
    { key: 'value', label: 'Estimated value ($)', type: 'money' },
    { key: 'probability', label: 'Chance of winning (%)', type: 'number', hint: 'Leave blank to use the stage default.' },
    { key: 'expected_close', label: 'Expected decision', type: 'date' },
    { key: 'source', label: 'Source', type: 'text', placeholder: 'Referral, website, FBO, trade show' },
    { key: 'notes', label: 'Notes', type: 'multiline' },
  ];

  const save = async (v: Record<string, any>) => {
    const stageP = LEAD_STAGES.find((x) => x.value === v.stage)?.p ?? 10;
    const row: Record<string, any> = { ...v, value: Number(v.value) || 0, probability: v.probability != null ? Math.max(0, Math.min(100, Math.round(Number(v.probability)))) : stageP };
    if (sheet.row) {
      const keep = sheet.row.stage === 'won' || sheet.row.stage === 'lost' ? { stage: sheet.row.stage } : {};
      const { error: e } = await supabase.from('opportunities').update({ ...row, ...keep }).eq('id', sheet.row.id);
      if (e) throw e;
    } else {
      const { error: e } = await supabase.from('opportunities').insert({ ...row, stage: row.stage ?? 'new', org_id: orgId, assigned_to: row.assigned_to ?? session?.user.id ?? null });
      if (e) throw e;
    }
    q.reload();
  };

  const setStage = async (l: Lead, stage: Stage) => {
    setError(null);
    const p = LEAD_STAGES.find((x) => x.value === stage)?.p ?? l.probability;
    const { error: e } = await supabase.from('opportunities').update({ stage, probability: Math.max(l.probability, p) }).eq('id', l.id);
    if (e) setError(friendlyError(e.message));
    else q.reload();
  };

  const markWon = async (l: Lead) => {
    setError(null);
    const { error: e } = await supabase.from('opportunities').update({ stage: 'won', probability: 100, won_at: new Date().toISOString(), lost_reason: null }).eq('id', l.id);
    if (e) return setError(friendlyError(e.message));
    if (!l.customer_id && l.contact_name && perm('edit_customers')) {
      const yes = await ask('Won! Add as a customer?', `Create a customer record for ${l.contact_name} from this lead?`, 'Create customer', 'Not now');
      if (yes) {
        const { data, error: ce } = await supabase.from('customers').insert({
          org_id: orgId, name: l.contact_name, email: l.contact_email, phone: l.contact_phone, status: 'active',
          source: l.source ?? 'Lead', notes: [l.asset_description ? `Assets: ${l.asset_description}` : null, l.notes].filter(Boolean).join('\n') || null,
          created_by: session?.user.id ?? null,
        }).select('id').single();
        if (ce) { setError(friendlyError(ce.message)); q.reload(); return; }
        await supabase.from('opportunities').update({ customer_id: data.id }).eq('id', l.id);
        q.reload();
        router.push(`/customers/${data.id}`);
        return;
      }
    }
    q.reload();
  };

  const nextStage = (st: Stage): Stage | null => ({ new: 'contacted', contacted: 'quoted', quoted: 'negotiating' } as Record<string, Stage>)[st] ?? null;

  return (
    <Screen refreshing={q.refreshing} onRefresh={q.refresh}>
      <Stack.Screen options={{ title: 'Leads', headerRight: () => <Button small icon="add" title="New lead" onPress={() => setSheet({ open: true })} /> }} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.md, marginBottom: space.lg }}>
        <StatTile label="Open pipeline" value={moneyShort(openValue)} icon="funnel-outline" />
        <StatTile label="Weighted" value={moneyShort(weighted)} icon="analytics-outline" tone="purple" />
        <StatTile label="Follow-ups due" value={dueCount} icon="alarm-outline" tone={dueCount ? 'danger' : 'neutral'} onPress={() => setFilter('due')} />
        <StatTile label="Won this month" value={moneyShort(wonMonth)} icon="trophy-outline" tone="success" onPress={() => setFilter('won')} />
      </View>
      <ErrorBanner message={error ?? q.error} onRetry={q.error ? q.reload : undefined} />
      <SearchBar value={search} onChange={setSearch} placeholder="Name, phone, asset, customer" />
      <Segmented value={filter} onChange={setFilter} options={[
        { value: 'open' as const, label: 'Open', count: open.length },
        { value: 'due' as const, label: 'Due follow-ups', count: dueCount },
        ...LEAD_STAGES.map((x) => ({ value: x.value, label: x.label, count: all.filter((l) => l.stage === x.value).length })),
      ]} />
      <Select label="Assigned to" value={assignee} allowClear placeholder="Everyone" onChange={setAssignee}
        options={[{ value: 'none', label: 'Unassigned' }, ...memberOptions]} />

      {rows.length ? rows.map((l) => {
        const overdue = isDue(l);
        const nxt = nextStage(l.stage);
        return (
          <Card key={l.id} onPress={() => setSheet({ open: true, row: l })}>
            <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <View style={{ flex: 1 }}>
                <T style={{ fontWeight: '700' }}>{l.title}</T>
                <T variant="muted">{[l.customer?.name ?? l.contact_name, l.asset_description].filter(Boolean).join(' · ') || 'No contact yet'}</T>
              </View>
              <Badge label={l.stage} tone={stageTone[l.stage]} />
            </Row>
            <Row gap={space.md} style={{ marginTop: space.sm, flexWrap: 'wrap' }}>
              <T variant="small" style={{ color: colors.text }}>{money(l.value)} · {l.probability}%</T>
              {l.follow_up_on && isOpenStage(l.stage) ? (
                <T variant="small" style={{ color: overdue ? colors.danger : colors.textMuted, fontWeight: overdue ? '700' : '400' }}>
                  {overdue ? (l.follow_up_on < today ? 'Follow-up overdue · ' : 'Follow up today · ') : 'Follow up '}{date(l.follow_up_on)}
                </T>
              ) : null}
              {l.assigned_to ? <T variant="small">{memberName(l.assigned_to)}</T> : null}
              {l.stage === 'won' && l.won_at ? <T variant="small">Won {date(l.won_at)}</T> : null}
              {l.stage === 'lost' && l.lost_reason ? <T variant="small">Lost: {l.lost_reason}</T> : null}
            </Row>
            {isOpenStage(l.stage) ? (
              <Row style={{ marginTop: space.md, flexWrap: 'wrap' }}>
                {l.contact_phone ? <IconButton icon="call-outline" label="Call" onPress={() => Linking.openURL(`tel:${l.contact_phone}`)} /> : null}
                {l.contact_email ? <IconButton icon="mail-outline" label="Email" onPress={() => Linking.openURL(`mailto:${l.contact_email}`)} /> : null}
                {nxt ? <Button small kind="secondary" title={`Mark ${LEAD_STAGES.find((x) => x.value === nxt)!.label.toLowerCase()}`} onPress={() => setStage(l, nxt)} /> : null}
                <Button small kind="secondary" icon="trophy-outline" title="Won" onPress={() => markWon(l)} />
                <Button small kind="ghost" title="Lost" onPress={() => setLostFor(l)} />
              </Row>
            ) : l.stage === 'won' && l.customer ? (
              <Button small kind="ghost" icon="person-outline" title={`Open ${l.customer.name}`} style={{ alignSelf: 'flex-start', marginTop: space.sm }} onPress={() => router.push(`/customers/${l.customer!.id}`)} />
            ) : null}
          </Card>
        );
      }) : q.loading ? null : (
        <EmptyState icon="funnel-outline" title={filter === 'due' ? 'No follow-ups due' : 'No leads here'}
          body={filter === 'due' ? 'You are all caught up.' : 'Track new inquiries, fleet bids and quotes you are waiting on, with a follow-up date for each.'}
          action={<Button icon="add" title="New lead" onPress={() => setSheet({ open: true })} />} />
      )}

      <FormSheet visible={sheet.open} title={sheet.row ? 'Edit lead' : 'New lead'} fields={fields}
        initial={sheet.row ? { ...sheet.row, value: String(sheet.row.value ?? ''), probability: String(sheet.row.probability ?? '') } : { stage: 'new', follow_up_on: today }}
        onClose={() => setSheet({ open: false })} onSubmit={save}
        onDelete={sheet.row && perm('delete_records') ? async () => {
          const { error: e } = await supabase.from('opportunities').delete().eq('id', sheet.row!.id);
          if (e) throw e;
          q.reload();
        } : undefined} />
      <FormSheet visible={!!lostFor} title="Mark as lost" initial={{ reason: 'Price' }}
        fields={[{ key: 'reason', label: 'Why did we lose it?', type: 'select', options: LOST_REASONS }, { key: 'note', label: 'Details (optional)', type: 'multiline' }]}
        onClose={() => setLostFor(null)}
        onSubmit={async (v) => {
          if (!lostFor) return;
          const reason = [v.reason, v.note].filter(Boolean).join(': ');
          const { error: e } = await supabase.from('opportunities').update({ stage: 'lost', probability: 0, lost_reason: reason || 'Other' }).eq('id', lostFor.id);
          if (e) throw e;
          q.reload();
        }} />
    </Screen>
  );
}

const isOpenStage = (s: Stage) => s !== 'won' && s !== 'lost';

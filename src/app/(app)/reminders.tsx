import { router } from 'expo-router';
import { useState } from 'react';
import { CrudList } from '../../components/CrudList';
import { Gate } from '../../components/Gate';
import { Badge, Button, ListRow, Row, Segmented, T } from '../../components/ui';
import { date, isoDate } from '../../lib/format';
import { useLookups } from '../../lib/lookups';
import { canEdit, isManager } from '../../lib/plans';
import { describeRepeat } from '../../lib/recurring';
import { useOrg } from '../../lib/session';
import { friendlyError, supabase } from '../../lib/supabase';
import { space } from '../../lib/theme';
import { notify } from '../../components/FormSheet';

type Reminder = {
  id: string; title: string; due_on: string; status: string; service_id: string | null;
  recur_every: number | null; recur_unit: 'week' | 'month' | null; aircraft_id: string;
  aircraft: { tail_number: string; customer_id: string | null; customer: { name: string } | null } | null;
};

export default function Reminders() {
  const { role, perm } = useOrg();
  const { aircraftOptions, services } = useLookups();
  const [view, setView] = useState<'open' | 'scheduled' | 'dismissed'>('open');
  const manager = isManager(role);

  const setStatus = async (id: string, status: string) => {
    const { error } = await supabase.from('service_reminders').update({ status }).eq('id', id);
    if (error) { notify('Could not update', friendlyError(error.message)); return false; }
    return true;
  };

  return (
    <Gate feature="reminders">
      <CrudList<Reminder>
        title="Service reminders"
        table="service_reminders"
        select="id, title, due_on, status, service_id, recur_every, recur_unit, aircraft_id, aircraft:aircraft(tail_number, customer_id, customer:customers(name))"
        deps={[view]}
        filter={(q) => (view === 'open' ? q.in('status', ['upcoming', 'due']) : q.eq('status', view))}
        order={[{ column: 'due_on', ascending: view === 'open' }]}
        emptyIcon="notifications-outline"
        emptyTitle={view === 'open' ? 'Nothing due' : view === 'scheduled' ? 'Nothing scheduled' : 'No dismissed reminders'}
        emptyBody="When a repeating service (monthly wash, ceramic top-up…) is completed for a customer who did not opt in to automatic visits, the next one appears here."
        searchKeys={(r) => [r.title, r.aircraft?.tail_number, r.aircraft?.customer?.name]}
        canWrite={canEdit(role) && manager}
        toRow={(v) => {
          const { aircraft: _a, ...rest } = v;
          if (!rest.recur_every) { rest.recur_every = null; rest.recur_unit = null; }
          else rest.recur_unit = rest.recur_unit ?? 'month';
          return rest;
        }}
        fields={[
          { key: 'aircraft_id', label: 'Asset', type: 'select', options: aircraftOptions(), required: true },
          { key: 'service_id', label: 'Service', type: 'select', options: services.map((s) => ({ value: s.id, label: s.name })), allowClear: true },
          { key: 'title', label: 'Title', type: 'text', required: true },
          { key: 'due_on', label: 'Due', type: 'date', required: true },
          { key: 'recur_every', label: 'Repeats every (leave empty for once)', type: 'number' },
          { key: 'recur_unit', label: 'Weeks or months', type: 'select', options: [{ value: 'week', label: 'Weeks' }, { value: 'month', label: 'Months' }] },
          { key: 'status', label: 'Status', type: 'select', options: [{ value: 'upcoming', label: 'Upcoming' }, { value: 'due', label: 'Due' }, { value: 'scheduled', label: 'Scheduled' }, { value: 'dismissed', label: 'Dismissed' }] },
        ]}
        defaults={() => ({ status: 'upcoming', recur_unit: 'month', due_on: isoDate() })}
        header={(rows) => {
          const today = isoDate();
          const due = rows.filter((r) => r.due_on <= today).length;
          return (
            <>
              <Segmented value={view} onChange={setView} options={[{ value: 'open', label: 'Due & upcoming' }, { value: 'scheduled', label: 'Scheduled' }, { value: 'dismissed', label: 'Dismissed' }]} />
              {view === 'open' && rows.length ? (
                <T variant="muted" style={{ marginBottom: space.md }}>{due} due now · {rows.length - due} upcoming</T>
              ) : null}
            </>
          );
        }}
        renderRow={(r, edit, reload) => {
          const today = isoDate();
          const overdue = view === 'open' && r.due_on < today;
          const dueNow = view === 'open' && r.due_on <= today;
          const repeat = r.recur_every && r.recur_unit ? ` · ${describeRepeat(r.recur_every, r.recur_unit)}` : '';
          const schedule = async () => {
            if (!(await setStatus(r.id, 'scheduled'))) return;
            reload();
            router.push({ pathname: '/jobs/new', params: { customer_id: r.aircraft?.customer_id ?? '', aircraft_id: r.aircraft_id, service_id: r.service_id ?? '' } });
          };
          const quote = async () => {
            if (!(await setStatus(r.id, 'scheduled'))) return;
            reload();
            router.push({ pathname: '/quotes/edit', params: { customer_id: r.aircraft?.customer_id ?? '', aircraft_id: r.aircraft_id } });
          };
          return (
            <ListRow icon="notifications-outline" tone={overdue ? 'danger' : dueNow ? 'warning' : 'info'}
              title={`${r.aircraft?.tail_number ?? ''} · ${r.title}`} subtitle={r.aircraft?.customer?.name}
              meta={`Due ${date(r.due_on)}${repeat}`}
              right={
                <Row gap={4} style={{ flexWrap: 'wrap', justifyContent: 'flex-end', maxWidth: 210 }}>
                  <Badge label={overdue ? 'overdue' : dueNow ? 'due' : r.status} tone={overdue ? 'danger' : dueNow || r.status === 'due' ? 'warning' : r.status === 'dismissed' ? 'neutral' : 'info'} />
                  {view === 'open' && manager ? (
                    <>
                      <Button small kind="secondary" icon="calendar-outline" title="Schedule" onPress={schedule} />
                      {perm('see_prices') ? <Button small kind="ghost" title="Quote" onPress={quote} /> : null}
                      <Button small kind="ghost" title="Dismiss" onPress={async () => { if (await setStatus(r.id, 'dismissed')) reload(); }} />
                    </>
                  ) : null}
                  {view === 'dismissed' && manager ? (
                    <Button small kind="ghost" title="Restore" onPress={async () => { if (await setStatus(r.id, 'upcoming')) reload(); }} />
                  ) : null}
                </Row>
              }
              onPress={manager ? edit : undefined} />
          );
        }}
      />
    </Gate>
  );
}

import { router } from 'expo-router';
import { useState } from 'react';
import { Gate } from '../../components/Gate';
import { CrudList } from '../../components/CrudList';
import { Badge, Button, ListRow, Row, Segmented } from '../../components/ui';
import { date } from '../../lib/format';
import { canSeeMoney } from '../../lib/plans';
import { useLookups } from '../../lib/lookups';
import { useOrg } from '../../lib/session';
import { supabase } from '../../lib/supabase';

type Reminder = { id: string; title: string; due_on: string; status: string; interval_days: number | null; aircraft_id: string; aircraft: { tail_number: string; customer_id: string | null; customer: { name: string } | null } | null };

export default function Reminders() {
  const { role } = useOrg();
  const { aircraftOptions, services } = useLookups();
  const [view, setView] = useState<'open' | 'scheduled' | 'dismissed'>('open');
  return (
    <Gate feature="reminders">
      <CrudList<Reminder>
        title="Service reminders"
        table="service_reminders"
        select="*, aircraft:aircraft(tail_number, customer_id, customer:customers(name))"
        deps={[view]}
        filter={(q) => (view === 'open' ? q.in('status', ['upcoming', 'due']) : q.eq('status', view))}
        order={[{ column: 'due_on' }]}
        emptyIcon="notifications-outline"
        emptyTitle="No reminders"
        emptyBody="When a recurring service (monthly wash, ceramic refresh…) is completed, the next one appears here automatically."
        searchKeys={(r) => [r.title, r.aircraft?.tail_number, r.aircraft?.customer?.name]}
        toRow={(v) => { const { aircraft: _a, ...rest } = v; return rest; }}
        fields={[
          { key: 'aircraft_id', label: 'Aircraft', type: 'select', options: aircraftOptions(), required: true },
          { key: 'service_id', label: 'Service', type: 'select', options: services.map((s) => ({ value: s.id, label: s.name })), allowClear: true },
          { key: 'title', label: 'Title', type: 'text', required: true },
          { key: 'due_on', label: 'Due', type: 'date', required: true },
          { key: 'interval_days', label: 'Repeat every (days)', type: 'number' },
          { key: 'status', label: 'Status', type: 'select', options: ['upcoming', 'due', 'scheduled', 'dismissed'].map((s) => ({ value: s, label: s })) },
        ]}
        defaults={{ status: 'upcoming' }}
        header={() => <Segmented value={view} onChange={setView} options={[{ value: 'open', label: 'Upcoming & due' }, { value: 'scheduled', label: 'Scheduled' }, { value: 'dismissed', label: 'Dismissed' }]} />}
        renderRow={(r, edit, reload) => {
          const overdue = r.due_on < new Date().toISOString().slice(0, 10);
          return (
            <ListRow icon="notifications-outline" title={`${r.aircraft?.tail_number ?? ''} · ${r.title}`} subtitle={r.aircraft?.customer?.name}
              meta={`Due ${date(r.due_on)}${r.interval_days ? ` · every ${r.interval_days}d` : ''}`}
              right={
                <Row gap={4}>
                  <Badge label={overdue && view === 'open' ? 'overdue' : r.status} tone={overdue ? 'danger' : r.status === 'due' ? 'warning' : 'info'} />
                  {view === 'open' && canSeeMoney(role) ? (
                    <Button small kind="secondary" title="Quote" onPress={async () => {
                      await supabase.from('service_reminders').update({ status: 'scheduled' }).eq('id', r.id);
                      reload();
                      router.push({ pathname: '/quotes/edit', params: { customer_id: r.aircraft?.customer_id ?? '', aircraft_id: r.aircraft_id } });
                    }} />
                  ) : null}
                </Row>
              }
              onPress={edit} />
          );
        }}
      />
    </Gate>
  );
}

import { startOfWeek } from 'date-fns';
import { useState } from 'react';
import { CrudList } from '../../components/CrudList';
import { Badge, Card, ListRow, Row, Segmented, T } from '../../components/ui';
import { dateTime, duration, money } from '../../lib/format';
import { useLookups } from '../../lib/lookups';
import { canSeeMoney } from '../../lib/plans';
import { useOrg } from '../../lib/session';

type Entry = { id: string; user_id: string; started_at: string; ended_at: string | null; approved: boolean; notes: string | null; job: { number: string; aircraft: { tail_number: string } | null } | null };

const mins = (e: Entry) => ((e.ended_at ? new Date(e.ended_at).getTime() : Date.now()) - new Date(e.started_at).getTime()) / 60000;

export default function Timesheets() {
  const { role, session } = useOrg();
  const manager = canSeeMoney(role);
  const { members, memberOptions } = useLookups();
  const [range, setRange] = useState<'week' | 'last' | 'all'>('week');
  const ws = startOfWeek(new Date(), { weekStartsOn: 1 });
  const from = range === 'week' ? ws : range === 'last' ? new Date(ws.getTime() - 7 * 864e5) : null;
  const to = range === 'last' ? ws : null;
  const name = (u: string) => members.find((m) => m.user_id === u)?.display_name ?? 'Member';

  return (
    <CrudList<Entry>
      title="Time sheets"
      table="time_entries"
      select="*, job:jobs(number, aircraft:aircraft(tail_number))"
      deps={[range]}
      filter={(q) => { let x = q; if (from) x = x.gte('started_at', from.toISOString()); if (to) x = x.lt('started_at', to.toISOString()); return x; }}
      order={[{ column: 'started_at', ascending: false }]}
      emptyIcon="time-outline"
      emptyTitle="No time logged"
      emptyBody="Clock in from the dashboard or a job."
      canDelete={manager}
      defaults={() => ({ user_id: session!.user.id, started_at: new Date(Date.now() - 3600e3).toISOString(), ended_at: new Date().toISOString() })}
      toRow={(v) => (manager ? v : { ...v, user_id: session!.user.id, approved: undefined })}
      fields={[
        ...(manager ? [{ key: 'user_id', label: 'Team member', type: 'select', options: memberOptions, required: true } as const] : []),
        { key: 'started_at', label: 'Start', type: 'datetime', required: true },
        { key: 'ended_at', label: 'End', type: 'datetime' },
        { key: 'notes', label: 'Notes', type: 'text' },
        ...(manager ? [{ key: 'approved', label: 'Approved for payroll', type: 'toggle' } as const] : []),
      ]}
      header={(rows) => {
        const byUser = Object.entries(rows.reduce<Record<string, number>>((acc, e) => ({ ...acc, [e.user_id]: (acc[e.user_id] ?? 0) + mins(e) }), {}));
        return (
          <>
            <Segmented value={range} onChange={setRange} options={[{ value: 'week', label: 'This week' }, { value: 'last', label: 'Last week' }, { value: 'all', label: 'All' }]} />
            {byUser.length ? (
              <Card>
                {byUser.map(([u, m]) => {
                  const rate = members.find((x) => x.user_id === u);
                  return (
                    <Row key={u} style={{ justifyContent: 'space-between', paddingVertical: 3 }}>
                      <T>{name(u)}</T>
                      <T style={{ fontWeight: '700' }}>{duration(m)}{manager && rate?.hourly_rate ? ` · ${money((m / 60) * rate.hourly_rate)}` : ''}{m / 60 > 40 && range !== 'all' ? ' ⚠️ OT' : ''}</T>
                    </Row>
                  );
                })}
              </Card>
            ) : null}
          </>
        );
      }}
      renderRow={(e, edit) => (
        <ListRow icon="time-outline" title={`${name(e.user_id)} · ${duration(mins(e))}`} subtitle={dateTime(e.started_at)}
          meta={[e.job ? `${e.job.number} ${e.job.aircraft?.tail_number ?? ''}` : null, e.notes].filter(Boolean).join(' · ')}
          right={!e.ended_at ? <Badge label="running" tone="warning" /> : e.approved ? <Badge label="approved" tone="success" /> : undefined} onPress={edit} />
      )}
    />
  );
}

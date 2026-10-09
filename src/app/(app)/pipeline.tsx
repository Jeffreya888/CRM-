import { useState } from 'react';
import { CrudList } from '../../components/CrudList';
import { Gate } from '../../components/Gate';
import { stageTone } from '../../components/status';
import { Badge, Card, ListRow, Row, Segmented, T } from '../../components/ui';
import { date, money, moneyShort } from '../../lib/format';
import { useLookups } from '../../lib/lookups';
import type { Stage } from '../../lib/types';

const STAGES: { value: Stage; label: string; p: number }[] = [
  { value: 'new', label: 'New', p: 10 }, { value: 'contacted', label: 'Contacted', p: 25 }, { value: 'quoted', label: 'Quoted', p: 50 },
  { value: 'negotiating', label: 'Negotiating', p: 75 }, { value: 'won', label: 'Won', p: 100 }, { value: 'lost', label: 'Lost', p: 0 },
];

type Opp = { id: string; title: string; stage: Stage; value: number; probability: number; expected_close: string | null; source: string | null; customer: { name: string } | null };

export default function Pipeline() {
  const { customerOptions, memberOptions } = useLookups();
  const [stage, setStage] = useState<Stage | 'open'>('open');
  return (
    <Gate feature="pipeline">
      <CrudList<Opp>
        title="Pipeline"
        table="opportunities"
        select="*, customer:customers(name)"
        deps={[stage]}
        filter={(q) => (stage === 'open' ? q.not('stage', 'in', '(won,lost)') : q.eq('stage', stage))}
        order={[{ column: 'expected_close' }]}
        emptyIcon="funnel-outline"
        emptyTitle="No opportunities"
        emptyBody="Track fleet contracts, management company bids and new-customer leads."
        searchKeys={(o) => [o.title, o.customer?.name, o.source]}
        defaults={{ stage: 'new', probability: '10' }}
        toRow={(v) => ({ ...v, value: Number(v.value) || 0, probability: v.probability != null ? Number(v.probability) : STAGES.find((s) => s.value === v.stage)?.p ?? 20 })}
        fields={[
          { key: 'title', label: 'Opportunity', type: 'text', required: true, placeholder: 'Monthly wash contract, 6 aircraft' },
          { key: 'customer_id', label: 'Customer / lead', type: 'select', options: customerOptions, allowClear: true },
          { key: 'stage', label: 'Stage', type: 'select', options: STAGES.map((s) => ({ value: s.value, label: s.label })) },
          { key: 'value', label: 'Value ($)', type: 'money' },
          { key: 'probability', label: 'Probability (%)', type: 'number' },
          { key: 'expected_close', label: 'Expected close', type: 'date' },
          { key: 'source', label: 'Source', type: 'text' },
          { key: 'assigned_to', label: 'Owner', type: 'select', options: memberOptions, allowClear: true },
          { key: 'lost_reason', label: 'Lost reason', type: 'text' },
          { key: 'notes', label: 'Notes', type: 'multiline' },
        ]}
        header={(rows) => (
          <>
            <Segmented value={stage} onChange={setStage} options={[{ value: 'open', label: 'Open' }, ...STAGES.map((s) => ({ value: s.value, label: s.label }))]} />
            <Row>
              <Card style={{ flex: 1 }}><T variant="muted">Total</T><T variant="h3">{moneyShort(rows.reduce((s, r) => s + Number(r.value), 0))}</T></Card>
              <Card style={{ flex: 1 }}><T variant="muted">Weighted</T><T variant="h3">{moneyShort(rows.reduce((s, r) => s + (Number(r.value) * r.probability) / 100, 0))}</T></Card>
            </Row>
          </>
        )}
        renderRow={(o, edit) => (
          <ListRow icon="funnel-outline" title={o.title} subtitle={[o.customer?.name, money(o.value)].filter(Boolean).join(' · ')}
            meta={[`${o.probability}%`, o.expected_close ? `close ${date(o.expected_close)}` : null, o.source].filter(Boolean).join(' · ')}
            right={<Badge label={o.stage} tone={stageTone[o.stage]} />} onPress={edit} />
        )}
      />
    </Gate>
  );
}

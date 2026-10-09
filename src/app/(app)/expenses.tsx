import { Gate } from '../../components/Gate';
import { CrudList } from '../../components/CrudList';
import { Badge, Card, ListRow, T } from '../../components/ui';
import { date, isoDate, money, titleCase } from '../../lib/format';
import { useOrg } from '../../lib/session';

const CATS = ['supplies', 'equipment', 'fuel', 'travel', 'labor', 'insurance', 'rent', 'marketing', 'software', 'fees', 'other'].map((v) => ({ value: v, label: titleCase(v) }));

type Expense = { id: string; category: string; vendor: string | null; description: string | null; amount: number; spent_on: string };

export default function Expenses() {
  const { session, org } = useOrg();
  const monthStart = isoDate(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  return (
    <Gate feature="expenses">
      <CrudList<Expense>
        title="Expenses"
        table="expenses"
        order={[{ column: 'spent_on', ascending: false }]}
        emptyIcon="wallet-outline"
        emptyTitle="No expenses logged"
        emptyBody="Track supplies, fuel, travel and equipment to see true profit in Reports."
        searchKeys={(e) => [e.vendor, e.description, e.category]}
        defaults={() => ({ category: 'supplies', spent_on: isoDate() })}
        toRow={(v, existing) => (existing ? v : { ...v, created_by: session!.user.id })}
        fields={[
          { key: 'amount', label: 'Amount', type: 'money', required: true },
          { key: 'category', label: 'Category', type: 'select', options: CATS },
          { key: 'vendor', label: 'Vendor', type: 'text' },
          { key: 'description', label: 'Description', type: 'text' },
          { key: 'spent_on', label: 'Date', type: 'date', required: true },
        ]}
        header={(rows) => (
          <Card>
            <T variant="muted">This month</T>
            <T variant="h2">{money(rows.filter((r) => r.spent_on >= monthStart).reduce((s, r) => s + Number(r.amount), 0), org.currency)}</T>
          </Card>
        )}
        renderRow={(e, edit) => (
          <ListRow icon="wallet-outline" title={money(e.amount, org.currency)} subtitle={[e.vendor, e.description].filter(Boolean).join(' · ')} meta={date(e.spent_on)} right={<Badge label={e.category} />} onPress={edit} />
        )}
      />
    </Gate>
  );
}

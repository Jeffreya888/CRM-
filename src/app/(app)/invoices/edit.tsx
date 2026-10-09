import { useLocalSearchParams } from 'expo-router';
import { addDays, format } from 'date-fns';
import { DocumentEditor } from '../../../components/DocumentEditor';
import { useOrg } from '../../../lib/session';

export default function InvoiceEdit() {
  const { id, customer_id } = useLocalSearchParams<{ id?: string; customer_id?: string }>();
  const { org } = useOrg();
  return (
    <DocumentEditor
      kind="invoice"
      id={id}
      defaults={{
        customer_id: customer_id || null,
        issue_date: format(new Date(), 'yyyy-MM-dd'),
        due_date: format(addDays(new Date(), org.payment_terms_days), 'yyyy-MM-dd'),
        tax_rate: org.tax_rate,
        discount: 0,
        notes: org.default_invoice_notes,
      }}
    />
  );
}

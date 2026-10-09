import { useLocalSearchParams } from 'expo-router';
import { addDays, format } from 'date-fns';
import { DocumentEditor } from '../../../components/DocumentEditor';
import { useOrg } from '../../../lib/session';

export default function QuoteEdit() {
  const { id, customer_id, aircraft_id } = useLocalSearchParams<{ id?: string; customer_id?: string; aircraft_id?: string }>();
  const { org } = useOrg();
  return (
    <DocumentEditor
      kind="quote"
      id={id}
      defaults={{
        customer_id: customer_id || null,
        aircraft_id: aircraft_id || null,
        issue_date: format(new Date(), 'yyyy-MM-dd'),
        valid_until: format(addDays(new Date(), 30), 'yyyy-MM-dd'),
        tax_rate: org.tax_rate,
        discount: 0,
        terms: org.default_quote_terms,
      }}
    />
  );
}

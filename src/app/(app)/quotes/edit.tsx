import { useLocalSearchParams } from 'expo-router';
import { QuoteEditor } from '../../../components/quotes/QuoteEditor';

export default function QuoteEdit() {
  const { id, customer_id, aircraft_id } = useLocalSearchParams<{ id?: string; customer_id?: string; aircraft_id?: string }>();
  // Remount when switching to a new version or a quote created from a template.
  return <QuoteEditor key={id ?? 'new'} id={id} customerId={customer_id} aircraftId={aircraft_id} />;
}

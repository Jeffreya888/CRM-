import { Stack, useLocalSearchParams } from 'expo-router';
import { JobForm } from '../../../components/jobs/JobForm';
import { EmptyState, Screen } from '../../../components/ui';
import { isManager } from '../../../lib/plans';
import { useOrg } from '../../../lib/session';

/** Edit job. Without an id this behaves like "New job" (kept for old links). */
export default function EditJob() {
  const params = useLocalSearchParams<{ id?: string; customer_id?: string; aircraft_id?: string; start?: string; service_id?: string }>();
  const { role } = useOrg();
  const title = params.id ? 'Edit job' : 'New job';
  if (!isManager(role)) {
    return (
      <Screen>
        <Stack.Screen options={{ title }} />
        <EmptyState icon="lock-closed-outline" title="Managers edit jobs" body="Ask an owner or manager to change this job." />
      </Screen>
    );
  }
  return (
    <>
      <Stack.Screen options={{ title }} />
      <JobForm key={params.id ?? 'new'} jobId={params.id} params={params} />
    </>
  );
}

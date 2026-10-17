import { Stack, useLocalSearchParams } from 'expo-router';
import { JobForm } from '../../../components/jobs/JobForm';
import { EmptyState, Screen } from '../../../components/ui';
import { isManager } from '../../../lib/plans';
import { useOrg } from '../../../lib/session';

/** New job: customer → asset → facility, services (price guide), status, time & crew. */
export default function NewJob() {
  const params = useLocalSearchParams<{ customer_id?: string; aircraft_id?: string; start?: string; service_id?: string }>();
  const { role } = useOrg();
  if (!isManager(role)) {
    return (
      <Screen>
        <Stack.Screen options={{ title: 'New job' }} />
        <EmptyState icon="lock-closed-outline" title="Managers create jobs" body="Ask an owner or manager to schedule this job." />
      </Screen>
    );
  }
  return (
    <>
      <Stack.Screen options={{ title: 'New job' }} />
      <JobForm params={params} />
    </>
  );
}

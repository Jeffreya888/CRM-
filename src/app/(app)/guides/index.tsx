import { Stack } from 'expo-router';
import { GuideLibrary } from '../../../components/guides/GuideLibrary';
import { ErrorBanner, Screen } from '../../../components/ui';
import { loadGuideLibrary } from '../../../lib/guides';
import { canSeeMoney } from '../../../lib/plans';
import { useOrg } from '../../../lib/session';
import { useQuery } from '../../../lib/useQuery';

/** SOP library (also a tab in the Training center). */
export default function Guides() {
  const { orgId, role, businessTypes } = useOrg();
  const q = useQuery(() => loadGuideLibrary(orgId), [orgId]);
  return (
    <Screen refreshing={q.refreshing} onRefresh={q.refresh}>
      <Stack.Screen options={{ title: 'SOPs' }} />
      <ErrorBanner message={q.error} onRetry={q.reload} />
      <GuideLibrary lib={q.data} loading={q.loading} orgId={orgId} manager={canSeeMoney(role)} businessTypes={businessTypes} onChanged={q.reload} />
    </Screen>
  );
}

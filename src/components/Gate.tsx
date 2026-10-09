import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { FEATURE_LABELS, PLANS, type Feature } from '../lib/plans';
import { useSession } from '../lib/session';
import { Button, EmptyState, Screen } from './ui';

/** Shows an upgrade prompt instead of children when the plan lacks a feature. */
export function Gate({ feature, children }: { feature: Feature; children: ReactNode }) {
  const { can } = useSession();
  if (can(feature)) return <>{children}</>;
  const plan = PLANS.find((p) => p.features.includes(feature));
  return (
    <Screen>
      <EmptyState
        icon="lock-closed-outline"
        title={`${FEATURE_LABELS[feature]}`}
        body={`Available on the ${plan?.name ?? 'Team'} plan and above.`}
        action={<Button title="See plans" icon="rocket-outline" onPress={() => router.push('/paywall')} />}
      />
    </Screen>
  );
}

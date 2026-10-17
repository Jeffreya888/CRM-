import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { FEATURE_LABELS, PLANS, type Feature } from '../lib/plans';
import { useSession } from '../lib/session';
import { Button, Card, EmptyState, Screen } from './ui';

/**
 * Shows an upgrade prompt instead of children when the plan lacks a feature.
 * `inline` renders the prompt as a card (inside an existing screen).
 */
export function Gate({ feature, children, inline, body }: { feature: Feature; children: ReactNode; inline?: boolean; body?: string }) {
  const { can, role } = useSession();
  if (can(feature)) return <>{children}</>;
  const plan = PLANS.find((p) => p.features.includes(feature));
  const owner = role === 'owner' || role === 'admin';
  const prompt = (
    <EmptyState
      icon="lock-closed-outline"
      title={`${FEATURE_LABELS[feature]}`}
      body={`${body ? body + ' ' : ''}Available on the ${plan?.name ?? 'Team'} plan${plan ? ` ($${plan.monthly.toFixed(2)}/mo)` : ''}${plan?.id === 'fleet' ? '' : ' and above'}.${owner ? '' : ' Ask your company owner to upgrade.'}`}
      action={owner ? <Button title="See plans" icon="rocket-outline" onPress={() => router.push('/paywall')} /> : undefined}
    />
  );
  return inline ? <Card>{prompt}</Card> : <Screen>{prompt}</Screen>;
}

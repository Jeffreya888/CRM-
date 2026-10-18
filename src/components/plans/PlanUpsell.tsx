import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Button, Ionicons, Row, T } from '../ui';
import { canAdmin, planFor, type Feature } from '../../lib/plans';
import { useSession } from '../../lib/session';
import { colors, space } from '../../lib/theme';

/**
 * Compact one-line upsell for a setting or small section the plan lacks, e.g.
 * "Quality check sign-off · Available on Team and above". Use `<Gate inline>`
 * for whole screens or panels instead.
 */
export function PlanUpsellRow({ feature, label, hint }: { feature: Feature; label: string; hint?: string }) {
  const { role } = useSession();
  const plan = planFor(feature);
  const admin = canAdmin(role);
  return (
    <Row style={{ justifyContent: 'space-between', marginBottom: space.lg, alignItems: 'flex-start' }}>
      <View style={{ flex: 1 }}>
        <Row gap={6}>
          <Ionicons name="lock-closed-outline" size={14} color={colors.textMuted} />
          <T style={{ flex: 1 }}>{label}</T>
        </Row>
        <T variant="small">
          {hint ? `${hint} ` : ''}Available on {plan.name}{plan.id === 'fleet' ? '' : ' and above'}.{admin ? '' : ' Ask your owner to upgrade.'}
        </T>
      </View>
      {admin ? <Button small kind="secondary" title="See plans" onPress={() => router.push('/paywall')} /> : null}
    </Row>
  );
}

/** Renders children when the plan has `feature`, otherwise the compact upsell row. */
export function FeatureRow({ feature, label, hint, children }: { feature: Feature; label: string; hint?: string; children: ReactNode }) {
  const { can } = useSession();
  if (can(feature)) return <>{children}</>;
  return <PlanUpsellRow feature={feature} label={label} hint={hint} />;
}

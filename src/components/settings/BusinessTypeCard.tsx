import { View } from 'react-native';
import { confirmAction, notify } from '../FormSheet';
import { Button, Card, IconTile, Ionicons, Row, T } from '../ui';
import { ASSET_TYPES } from '../../lib/pricing';
import { friendlyError, supabase } from '../../lib/supabase';
import type { AssetType } from '../../lib/types';
import { colors, space } from '../../lib/theme';

const ADD_INFO: Record<AssetType, string> = {
  aircraft: '',
  vehicle: 'cars, trucks, vans, RVs and motorcycles',
  watercraft: 'boats and yachts',
};

/**
 * Business types (asset categories). Types can be added but never removed;
 * the database enforces that and seeds the matching services when one is added.
 */
export function BusinessTypeCard({ orgId, types, editable, onChanged }: { orgId: string; types: AssetType[]; editable: boolean; onChanged: () => Promise<void> }) {
  const add = (t: AssetType) => {
    const info = ASSET_TYPES.find((a) => a.value === t)!;
    confirmAction(
      `Add ${info.plural.toLowerCase()}?`,
      `We'll add ${info.plural.toLowerCase()} (${ADD_INFO[t]}) to your company: asset sizes, starter services and prices you can edit, and step-by-step SOPs. ` +
        'Business types can be added but not removed later. Your plan price stays the same.',
      async () => {
        const next = ASSET_TYPES.map((a) => a.value).filter((v) => v === t || types.includes(v));
        const { error } = await supabase.from('organizations').update({ business_types: next }).eq('id', orgId);
        if (error) return notify('Could not add', friendlyError(error.message));
        await onChanged();
        notify(`${info.plural} added`, 'New services were added to your service menu. Review their prices in Services.');
      },
    );
  };

  return (
    <Card>
      <T variant="muted" style={{ marginBottom: space.md }}>
        What your company services. Forms, sizes and prices only show for the types you turn on.
      </T>
      {ASSET_TYPES.map((a, i) => {
        const on = types.includes(a.value);
        return (
          <Row key={a.value} gap={space.md} style={{ paddingVertical: space.sm, borderTopWidth: i ? 1 : 0, borderTopColor: colors.border }}>
            <IconTile icon={a.icon} tone={on ? 'success' : 'neutral'} size={36} />
            <View style={{ flex: 1 }}>
              <T style={{ fontWeight: '600' }}>{a.plural}</T>
              <T variant="small">{a.value === 'aircraft' ? 'Always included' : on ? 'Included' : `Add ${ADD_INFO[a.value]}`}</T>
            </View>
            {on ? <Ionicons name="checkmark-circle" size={22} color={colors.success} />
              : editable ? <Button small kind="secondary" icon="add" title="Add" onPress={() => add(a.value)} /> : <T variant="small">Off</T>}
          </Row>
        );
      })}
      <T variant="small" style={{ marginTop: space.sm }}>Business types can be added but not removed. The price of your plan doesn&apos;t change.</T>
    </Card>
  );
}

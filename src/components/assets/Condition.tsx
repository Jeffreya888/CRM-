import { View } from 'react-native';
import { date } from '../../lib/format';
import { CONDITION_LEVELS, conditionLabel } from '../../lib/pricing';
import { space } from '../../lib/theme';
import type { Tone } from '../../lib/theme';
import type { ConditionLevel } from '../../lib/types';
import { Badge, Row, Segmented, T } from '../ui';

/** Badge color per condition: light green → severe red. */
export function conditionTone(level: ConditionLevel | null | undefined): Tone {
  switch (level) {
    case 'light': return 'success';
    case 'moderate': return 'info';
    case 'heavy': return 'warning';
    case 'severe': return 'danger';
    default: return 'neutral';
  }
}

/** "Condition: Heavy" badge plus "updated Oct 3, 2026". Renders nothing when not set. */
export function ConditionBadge({ level, updatedAt }: { level: ConditionLevel | null | undefined; updatedAt?: string | null }) {
  if (!level) return null;
  return (
    <Row gap={6}>
      <Badge label={`Condition: ${conditionLabel(level)}`} tone={conditionTone(level)} raw />
      {updatedAt ? <T variant="small">updated {date(updatedAt)}</T> : null}
    </Row>
  );
}

/** Not set / Light / Moderate / Heavy / Severe chips with a one-line hint for the chosen level. */
export function ConditionSelector({ value, onChange }: { value: ConditionLevel | null; onChange: (v: ConditionLevel | null) => void }) {
  const hint = CONDITION_LEVELS.find((c) => c.value === value)?.hint;
  return (
    <View style={{ marginBottom: space.sm }}>
      <Segmented<ConditionLevel | 'none'>
        value={value ?? 'none'}
        onChange={(v) => onChange(v === 'none' ? null : v)}
        options={[{ value: 'none', label: 'Not set' }, ...CONDITION_LEVELS.map((c) => ({ value: c.value, label: c.label }))]}
      />
      <T variant="small" style={{ marginTop: -space.sm }}>
        {hint ?? 'How dirty or worn it usually is. Quotes use it to adjust prices.'}
      </T>
    </View>
  );
}

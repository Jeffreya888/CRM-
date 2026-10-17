import { Alert, Platform } from 'react-native';
import { colors, space } from '../../lib/theme';
import { Button, Field, IconButton, Row, Section, T } from '../ui';

/** Yes/no question that resolves to the answer (works on web too). */
export function ask(title: string, message: string, yes = 'Yes', no = 'Not now'): Promise<boolean> {
  if (Platform.OS === 'web') return Promise.resolve(window.confirm(`${title}\n\n${message}`));
  return new Promise((resolve) => {
    Alert.alert(title, message, [
      { text: no, style: 'cancel', onPress: () => resolve(false) },
      { text: yes, onPress: () => resolve(true) },
    ], { cancelable: true, onDismiss: () => resolve(false) });
  });
}

export const move = <X,>(xs: X[], i: number, d: -1 | 1): X[] => {
  const j = i + d;
  if (j < 0 || j >= xs.length) return xs;
  const out = [...xs];
  [out[i], out[j]] = [out[j]!, out[i]!];
  return out;
};

/** Editable list of short text lines with add / remove (and optional reorder). */
export function ListEditor({ title, hint, items, onChange, placeholder, numbered, reorder, addLabel = 'Add' }: {
  title: string; hint?: string; items: string[]; onChange: (items: string[]) => void; placeholder?: string;
  numbered?: boolean; reorder?: boolean; addLabel?: string;
}) {
  return (
    <Section title={title} action={<Button small kind="ghost" icon="add" title={addLabel} onPress={() => onChange([...items, ''])} />}>
      {hint ? <T variant="small" style={{ marginBottom: space.sm }}>{hint}</T> : null}
      {items.length === 0 ? <T variant="muted" style={{ marginBottom: space.sm }}>Nothing added yet.</T> : null}
      {items.map((x, i) => (
        <Row key={i} gap={4} style={{ alignItems: 'flex-start' }}>
          {numbered ? <T variant="muted" style={{ width: 22, marginTop: 14 }}>{i + 1}.</T> : null}
          <Field style={{ flex: 1, marginBottom: space.sm }} value={x} placeholder={placeholder}
            onChangeText={(v) => onChange(items.map((y, j) => (j === i ? v : y)))} />
          {reorder ? <IconButton icon="chevron-up" label="Move up" color={i ? colors.textMuted : colors.border} onPress={() => onChange(move(items, i, -1))} /> : null}
          {reorder ? <IconButton icon="chevron-down" label="Move down" color={i < items.length - 1 ? colors.textMuted : colors.border} onPress={() => onChange(move(items, i, 1))} /> : null}
          <IconButton icon="close" label="Remove" color={colors.textMuted} onPress={() => onChange(items.filter((_, j) => j !== i))} />
        </Row>
      ))}
    </Section>
  );
}

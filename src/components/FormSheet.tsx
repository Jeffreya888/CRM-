import { useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Modal, Platform, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { friendlyError } from '../lib/supabase';
import { colors, space } from '../lib/theme';
import { DateTimeField } from './DateTimeField';
import { Button, ErrorBanner, Field, Row, Select, T, ToggleRow, type Option } from './ui';

export type FieldDef =
  | { key: string; label: string; type: 'text' | 'multiline' | 'email' | 'phone'; placeholder?: string; required?: boolean; hint?: string }
  | { key: string; label: string; type: 'number' | 'money'; placeholder?: string; required?: boolean; hint?: string }
  | { key: string; label: string; type: 'select'; options: Option[]; required?: boolean; allowClear?: boolean }
  | { key: string; label: string; type: 'toggle'; hint?: string }
  | { key: string; label: string; type: 'date' | 'datetime'; required?: boolean };

export type FormValues = Record<string, any>;

/** Converts form strings to DB values (numbers, nulls for empty strings). */
export function normalize(fields: FieldDef[], values: FormValues): FormValues {
  const out: FormValues = {};
  for (const f of fields) {
    let v = values[f.key];
    if (f.type === 'number' || f.type === 'money') v = v === '' || v == null ? null : Number(String(v).replace(/[^0-9.-]/g, ''));
    else if (f.type === 'toggle') v = !!v;
    else if (typeof v === 'string') v = v.trim() === '' ? null : v.trim();
    out[f.key] = v ?? null;
  }
  return out;
}

export function validate(fields: FieldDef[], values: FormValues): string | null {
  for (const f of fields) {
    if ('required' in f && f.required) {
      const v = values[f.key];
      if (v == null || String(v).trim() === '') return `${f.label} is required`;
    }
    if ((f.type === 'number' || f.type === 'money') && values[f.key] !== '' && values[f.key] != null && Number.isNaN(Number(String(values[f.key]).replace(/[^0-9.-]/g, '')))) {
      return `${f.label} must be a number`;
    }
  }
  return null;
}

/** Renders a list of field definitions bound to a values object. */
export function FormFields({ fields, values, setValue }: { fields: FieldDef[]; values: FormValues; setValue: (k: string, v: any) => void }) {
  return (
    <>
      {fields.map((f) => {
        const v = values[f.key];
        switch (f.type) {
          case 'select':
            return <Select key={f.key} label={f.label} value={v} options={f.options} onChange={(x) => setValue(f.key, x)} allowClear={f.allowClear} searchable={f.options.length > 8} />;
          case 'toggle':
            return <ToggleRow key={f.key} label={f.label} hint={f.hint} value={!!v} onChange={(x) => setValue(f.key, x)} />;
          case 'date':
          case 'datetime':
            return <DateTimeField key={f.key} label={f.label} mode={f.type} value={v} onChange={(x) => setValue(f.key, x)} />;
          default:
            return (
              <Field
                key={f.key}
                label={f.label + ('required' in f && f.required ? ' *' : '')}
                hint={'hint' in f ? f.hint : undefined}
                placeholder={'placeholder' in f ? f.placeholder : undefined}
                value={v == null ? '' : String(v)}
                onChangeText={(x) => setValue(f.key, x)}
                multiline={f.type === 'multiline'}
                autoCapitalize={f.type === 'email' ? 'none' : 'sentences'}
                keyboardType={f.type === 'email' ? 'email-address' : f.type === 'phone' ? 'phone-pad' : f.type === 'number' || f.type === 'money' ? 'decimal-pad' : 'default'}
              />
            );
        }
      })}
    </>
  );
}

/** Modal form for quick create/edit of simple records. */
export function FormSheet({
  visible,
  title,
  fields,
  initial,
  onClose,
  onSubmit,
  onDelete,
}: {
  visible: boolean;
  title: string;
  fields: FieldDef[];
  initial?: FormValues;
  onClose: () => void;
  onSubmit: (values: FormValues) => Promise<void>;
  onDelete?: () => Promise<void>;
}) {
  const [values, setValues] = useState<FormValues>(initial ?? {});
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (visible) { setValues(initial ?? {}); setError(null); }
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = async () => {
    const msg = validate(fields, values);
    if (msg) return setError(msg);
    try {
      await onSubmit(normalize(fields, values));
      onClose();
    } catch (e: any) {
      setError(friendlyError(e.message));
    }
  };

  const confirmDelete = () => {
    if (!onDelete) return;
    const run = async () => {
      try { await onDelete(); onClose(); } catch (e: any) { setError(friendlyError(e.message)); }
    };
    if (Platform.OS === 'web') { if (confirm('Delete this record?')) run(); return; }
    Alert.alert('Delete?', 'This cannot be undone.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: run }]);
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
          <Row style={{ padding: space.lg, justifyContent: 'space-between' }}>
            <Button small kind="ghost" title="Cancel" onPress={onClose} />
            <T variant="h3">{title}</T>
            <Button small title="Save" onPress={submit} />
          </Row>
          <ScrollView contentContainerStyle={{ padding: space.lg, paddingBottom: 64 }} keyboardShouldPersistTaps="handled">
            <ErrorBanner message={error} />
            <FormFields fields={fields} values={values} setValue={(k, v) => setValues((s) => ({ ...s, [k]: v }))} />
            {onDelete ? (
              <View style={{ marginTop: space.lg }}>
                <Button kind="ghost" icon="trash-outline" title="Delete" onPress={confirmDelete} />
              </View>
            ) : null}
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

export function confirmAction(title: string, message: string, onConfirm: () => void, destructive = false) {
  if (Platform.OS === 'web') {
    if (confirm(`${title}\n\n${message}`)) onConfirm();
    return;
  }
  Alert.alert(title, message, [
    { text: 'Cancel', style: 'cancel' },
    { text: destructive ? 'Delete' : 'OK', style: destructive ? 'destructive' : 'default', onPress: onConfirm },
  ]);
}

export function notify(title: string, message?: string) {
  if (Platform.OS === 'web') alert(message ? `${title}\n\n${message}` : title);
  else Alert.alert(title, message);
}

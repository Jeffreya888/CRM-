import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { format, parse, isValid } from 'date-fns';
import { useState } from 'react';
import { Platform, Pressable, Text, TextInput, View } from 'react-native';
import { colors, radius, space } from '../lib/theme';
import { Ionicons, T } from './ui';

/**
 * Date or date+time input. Value is an ISO string ("yyyy-MM-dd" for dates,
 * full ISO timestamp for datetimes) or null.
 */
export function DateTimeField({
  label,
  value,
  onChange,
  mode = 'datetime',
  allowClear = true,
}: {
  label: string;
  value: string | null | undefined;
  onChange: (v: string | null) => void;
  mode?: 'date' | 'datetime';
  allowClear?: boolean;
}) {
  const current = value ? (mode === 'date' ? parse(value, 'yyyy-MM-dd', new Date()) : new Date(value)) : null;
  const display = current && isValid(current) ? format(current, mode === 'date' ? 'EEE, MMM d, yyyy' : 'EEE, MMM d, yyyy · h:mm a') : 'Not set';
  const emit = (d: Date) => onChange(mode === 'date' ? format(d, 'yyyy-MM-dd') : d.toISOString());
  const [iosOpen, setIosOpen] = useState(false);
  const webFormat = (d: Date | null) => (d && isValid(d) ? format(d, mode === 'date' ? 'yyyy-MM-dd' : "yyyy-MM-dd'T'HH:mm") : '');
  const [webText, setWebText] = useState(webFormat(current));
  // Keep the web input in sync when the value is changed from outside (e.g. a "2 h" shortcut).
  const [seenValue, setSeenValue] = useState(value ?? null);
  if ((value ?? null) !== seenValue) {
    setSeenValue(value ?? null);
    const parsed = webText ? parse(webText, mode === 'date' ? 'yyyy-MM-dd' : "yyyy-MM-dd'T'HH:mm", new Date()) : null;
    const same = parsed && isValid(parsed) && current && isValid(current) && webFormat(parsed) === webFormat(current);
    if (!same && !(value == null && !isValid(parsed ?? new Date(NaN)))) setWebText(webFormat(current));
  }

  const box = { backgroundColor: colors.input, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: space.lg, paddingVertical: 14, flexDirection: 'row' as const, alignItems: 'center' as const };

  if (Platform.OS === 'web') {
    return (
      <View style={{ marginBottom: space.lg }}>
        <T style={{ marginBottom: 8, fontWeight: '600', fontSize: 15 }}>{label}</T>
        <TextInput
          value={webText}
          placeholder={mode === 'date' ? 'YYYY-MM-DD' : 'YYYY-MM-DDTHH:mm'}
          onChangeText={(t) => {
            setWebText(t);
            const d = parse(t, mode === 'date' ? 'yyyy-MM-dd' : "yyyy-MM-dd'T'HH:mm", new Date());
            if (isValid(d)) emit(d);
            else if (!t) onChange(null);
          }}
          style={[box, { fontSize: 16, color: colors.text }]}
          // @ts-expect-error web-only prop renders a native date input
          type={mode === 'date' ? 'date' : 'datetime-local'}
        />
      </View>
    );
  }

  const open = () => {
    const base = current ?? new Date();
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: base,
        mode: 'date',
        onChange: (e, d) => {
          if (e.type !== 'set' || !d) return;
          if (mode === 'date') return emit(d);
          DateTimePickerAndroid.open({
            value: d,
            mode: 'time',
            onChange: (e2, t) => {
              if (e2.type !== 'set' || !t) return;
              const out = new Date(d);
              out.setHours(t.getHours(), t.getMinutes(), 0, 0);
              emit(out);
            },
          });
        },
      });
    } else {
      setIosOpen((o) => !o);
    }
  };

  return (
    <View style={{ marginBottom: space.lg }}>
      <T style={{ marginBottom: 8, fontWeight: '600', fontSize: 15 }}>{label}</T>
      <Pressable onPress={open} style={box}>
        <Ionicons name="calendar-outline" size={20} color={colors.primary} />
        <Text style={{ flex: 1, marginLeft: 8, fontSize: 16, color: current ? colors.text : colors.textMuted }}>{display}</Text>
        {allowClear && current ? (
          <Pressable hitSlop={10} onPress={() => onChange(null)}>
            <Ionicons name="close-circle" size={18} color={colors.textMuted} />
          </Pressable>
        ) : null}
      </Pressable>
      {Platform.OS === 'ios' && iosOpen ? (
        <DateTimePicker
          value={current ?? new Date()}
          mode={mode}
          display="inline"
          themeVariant="dark"
          minuteInterval={15}
          onChange={(_, d) => d && emit(d)}
        />
      ) : null}
    </View>
  );
}

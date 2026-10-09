import Ionicons from '@expo/vector-icons/Ionicons';
import { useState, type ComponentProps, type ReactNode } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, radius, space, toneColors, type Tone } from '../lib/theme';

export type IconName = ComponentProps<typeof Ionicons>['name'];
export { Ionicons };

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------
export function Screen({
  children,
  refreshing,
  onRefresh,
  scroll = true,
  padded = true,
  footer,
}: {
  children: ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void;
  scroll?: boolean;
  padded?: boolean;
  footer?: ReactNode;
}) {
  const body = scroll ? (
    <ScrollView
      contentContainerStyle={[padded && styles.screenPad, { paddingBottom: 96 }]}
      keyboardShouldPersistTaps="handled"
      refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} /> : undefined}
    >
      {children}
    </ScrollView>
  ) : (
    <View style={[{ flex: 1 }, padded && styles.screenPad]}>{children}</View>
  );
  return (
    <View style={styles.screen}>
      {body}
      {footer ? <SafeAreaView edges={['bottom']} style={styles.footer}>{footer}</SafeAreaView> : null}
    </View>
  );
}

export function Card({ children, style, onPress }: { children: ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void }) {
  if (onPress) {
    return (
      <Pressable onPress={onPress} style={({ pressed }) => [styles.card, pressed && { opacity: 0.85 }, style]}>
        {children}
      </Pressable>
    );
  }
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Row({ children, style, gap = space.sm }: { children: ReactNode; style?: StyleProp<ViewStyle>; gap?: number }) {
  return <View style={[{ flexDirection: 'row', alignItems: 'center', gap }, style]}>{children}</View>;
}

export function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <View style={{ marginTop: space.lg }}>
      <Row style={{ justifyContent: 'space-between', marginBottom: space.sm }}>
        <T variant="overline">{title}</T>
        {action}
      </Row>
      {children}
    </View>
  );
}

export function Divider() {
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginVertical: space.sm }} />;
}

// ---------------------------------------------------------------------------
// Text
// ---------------------------------------------------------------------------
type Variant = 'h1' | 'h2' | 'h3' | 'body' | 'muted' | 'small' | 'overline' | 'money';
export function T({ variant = 'body', children, style, numberOfLines }: { variant?: Variant; children: ReactNode; style?: StyleProp<TextStyle>; numberOfLines?: number }) {
  return <Text numberOfLines={numberOfLines} style={[styles[variant], style]}>{children}</Text>;
}

// ---------------------------------------------------------------------------
// Controls
// ---------------------------------------------------------------------------
type ButtonKind = 'primary' | 'secondary' | 'ghost' | 'danger';
export function Button({
  title,
  onPress,
  kind = 'primary',
  icon,
  loading,
  disabled,
  style,
  small,
}: {
  title: string;
  onPress: () => unknown;
  kind?: ButtonKind;
  icon?: IconName;
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  small?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const isBusy = loading || busy;
  const fg = kind === 'primary' || kind === 'danger' ? colors.white : kind === 'secondary' ? colors.primary : colors.text;
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled || isBusy}
      onPress={async () => {
        const r = onPress();
        if (r instanceof Promise) {
          setBusy(true);
          try { await r; } finally { setBusy(false); }
        }
      }}
      style={({ pressed }) => [
        styles.btn,
        small && styles.btnSmall,
        styles[`btn_${kind}`],
        (pressed || disabled) && { opacity: 0.6 },
        style,
      ]}
    >
      {isBusy ? (
        <ActivityIndicator color={fg} />
      ) : (
        <Row gap={6} style={{ justifyContent: 'center' }}>
          {icon ? <Ionicons name={icon} size={small ? 16 : 18} color={fg} /> : null}
          <Text style={[styles.btnText, small && { fontSize: 14 }, { color: fg }]}>{title}</Text>
        </Row>
      )}
    </Pressable>
  );
}

export function IconButton({ icon, onPress, color = colors.primary, label }: { icon: IconName; onPress: () => void; color?: string; label?: string }) {
  return (
    <Pressable accessibilityLabel={label} hitSlop={10} onPress={onPress} style={({ pressed }) => [{ padding: 6 }, pressed && { opacity: 0.5 }]}>
      <Ionicons name={icon} size={22} color={color} />
    </Pressable>
  );
}

export function Field({ label, hint, error, style, ...props }: TextInputProps & { label?: string; hint?: string; error?: string | null }) {
  return (
    <View style={[{ marginBottom: space.md }, style as any]}>
      {label ? <T variant="small" style={styles.label}>{label}</T> : null}
      <TextInput
        placeholderTextColor={colors.textMuted}
        {...props}
        style={[styles.input, props.multiline && { minHeight: 88, textAlignVertical: 'top' }, error ? { borderColor: colors.danger } : null]}
      />
      {error ? <T variant="small" style={{ color: colors.danger, marginTop: 4 }}>{error}</T> : hint ? <T variant="small" style={{ marginTop: 4 }}>{hint}</T> : null}
    </View>
  );
}

export function ToggleRow({ label, value, onChange, hint }: { label: string; value: boolean; onChange: (v: boolean) => void; hint?: string }) {
  return (
    <Row style={{ justifyContent: 'space-between', marginBottom: space.md }}>
      <View style={{ flex: 1 }}>
        <T>{label}</T>
        {hint ? <T variant="small">{hint}</T> : null}
      </View>
      <Switch value={value} onValueChange={onChange} trackColor={{ true: colors.primary }} />
    </Row>
  );
}

export interface Option<V extends string = string> { value: V; label: string; hint?: string }

/** Tap-to-open option list (works the same on iOS, Android and web). */
export function Select<V extends string>({
  label,
  value,
  options,
  onChange,
  placeholder = 'Select…',
  searchable,
  allowClear,
}: {
  label?: string;
  value: V | null | undefined;
  options: Option<V>[];
  onChange: (v: V | null) => void;
  placeholder?: string;
  searchable?: boolean;
  allowClear?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const current = options.find((o) => o.value === value);
  const filtered = q ? options.filter((o) => (o.label + ' ' + (o.hint ?? '')).toLowerCase().includes(q.toLowerCase())) : options;
  return (
    <View style={{ marginBottom: space.md }}>
      {label ? <T variant="small" style={styles.label}>{label}</T> : null}
      <Pressable onPress={() => setOpen(true)} style={[styles.input, { flexDirection: 'row', alignItems: 'center' }]}>
        <Text style={{ flex: 1, color: current ? colors.text : colors.textMuted, fontSize: 16 }} numberOfLines={1}>
          {current?.label ?? placeholder}
        </Text>
        <Ionicons name="chevron-down" size={18} color={colors.textMuted} />
      </Pressable>
      <Modal visible={open} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setOpen(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
          <Row style={{ padding: space.lg, justifyContent: 'space-between' }}>
            <T variant="h3">{label ?? 'Select'}</T>
            <Row>
              {allowClear && value ? <Button small kind="ghost" title="Clear" onPress={() => { onChange(null); setOpen(false); }} /> : null}
              <Button small kind="secondary" title="Done" onPress={() => setOpen(false)} />
            </Row>
          </Row>
          {searchable || options.length > 12 ? (
            <View style={{ paddingHorizontal: space.lg }}>
              <SearchBar value={q} onChange={setQ} />
            </View>
          ) : null}
          <FlatList
            data={filtered}
            keyExtractor={(o) => o.value}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ padding: space.lg }}
            renderItem={({ item }) => (
              <Pressable
                onPress={() => { onChange(item.value); setOpen(false); setQ(''); }}
                style={({ pressed }) => [styles.option, pressed && { backgroundColor: colors.primarySoft }]}
              >
                <View style={{ flex: 1 }}>
                  <T>{item.label}</T>
                  {item.hint ? <T variant="small">{item.hint}</T> : null}
                </View>
                {item.value === value ? <Ionicons name="checkmark" size={20} color={colors.primary} /> : null}
              </Pressable>
            )}
            ListEmptyComponent={<T variant="muted">No matches</T>}
          />
        </SafeAreaView>
      </Modal>
    </View>
  );
}

export function Segmented<V extends string>({ value, options, onChange }: { value: V; options: Option<V>[]; onChange: (v: V) => void }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingVertical: 2 }} style={{ marginBottom: space.md, flexGrow: 0 }}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable key={o.value} onPress={() => onChange(o.value)} style={[styles.chip, active && styles.chipActive]}>
            <Text style={[styles.chipText, active && { color: colors.white }]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

export function SearchBar({ value, onChange, placeholder = 'Search' }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <View style={[styles.input, { flexDirection: 'row', alignItems: 'center', marginBottom: space.md, paddingVertical: 0 }]}>
      <Ionicons name="search" size={18} color={colors.textMuted} />
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        autoCorrect={false}
        style={{ flex: 1, paddingVertical: 10, paddingHorizontal: 8, fontSize: 16, color: colors.text }}
      />
      {value ? <IconButton icon="close-circle" color={colors.textMuted} onPress={() => onChange('')} /> : null}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Display
// ---------------------------------------------------------------------------
export function Badge({ label, tone = 'neutral' }: { label: string; tone?: Tone }) {
  const c = toneColors[tone];
  return (
    <View style={[styles.badge, { backgroundColor: c.bg }]}>
      <Text style={[styles.badgeText, { color: c.fg }]}>{label.replace(/_/g, ' ')}</Text>
    </View>
  );
}

export function ListRow({
  title,
  subtitle,
  meta,
  right,
  left,
  onPress,
  icon,
}: {
  title: string;
  subtitle?: string | null;
  meta?: string | null;
  right?: ReactNode;
  left?: ReactNode;
  onPress?: () => void;
  icon?: IconName;
}) {
  return (
    <Pressable onPress={onPress} disabled={!onPress} style={({ pressed }) => [styles.listRow, pressed && { backgroundColor: '#F8FAFC' }]}>
      {left ?? (icon ? <View style={styles.rowIcon}><Ionicons name={icon} size={20} color={colors.primary} /></View> : null)}
      <View style={{ flex: 1 }}>
        <T style={{ fontWeight: '600' }} numberOfLines={1}>{title}</T>
        {subtitle ? <T variant="muted" numberOfLines={1}>{subtitle}</T> : null}
        {meta ? <T variant="small" numberOfLines={1}>{meta}</T> : null}
      </View>
      {right}
      {onPress && !right ? <Ionicons name="chevron-forward" size={18} color={colors.textMuted} /> : null}
    </Pressable>
  );
}

export function StatTile({ label, value, icon, tone = 'primary', onPress }: { label: string; value: string | number; icon: IconName; tone?: Tone; onPress?: () => void }) {
  const c = toneColors[tone];
  return (
    <Card onPress={onPress} style={{ flex: 1, minWidth: 150 }}>
      <View style={[styles.statIcon, { backgroundColor: c.bg }]}>
        <Ionicons name={icon} size={18} color={c.fg} />
      </View>
      <T variant="h2" style={{ marginTop: space.sm }}>{value}</T>
      <T variant="muted">{label}</T>
    </Card>
  );
}

export function KeyValue({ label, value, onPress }: { label: string; value: ReactNode; onPress?: () => void }) {
  if (value == null || value === '') return null;
  return (
    <Pressable disabled={!onPress} onPress={onPress} style={{ flexDirection: 'row', paddingVertical: 6, gap: space.md }}>
      <T variant="muted" style={{ width: 120 }}>{label}</T>
      {typeof value === 'string' || typeof value === 'number' ? (
        <T style={[{ flex: 1 }, onPress && { color: colors.primary }]}>{value}</T>
      ) : (
        <View style={{ flex: 1 }}>{value}</View>
      )}
    </Pressable>
  );
}

export function EmptyState({ icon = 'file-tray-outline', title, body, action }: { icon?: IconName; title: string; body?: string; action?: ReactNode }) {
  return (
    <View style={{ alignItems: 'center', padding: space.xxl, gap: space.sm }}>
      <Ionicons name={icon} size={44} color={colors.textMuted} />
      <T variant="h3" style={{ textAlign: 'center' }}>{title}</T>
      {body ? <T variant="muted" style={{ textAlign: 'center' }}>{body}</T> : null}
      {action ? <View style={{ marginTop: space.md }}>{action}</View> : null}
    </View>
  );
}

export function Loading() {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.xxl, backgroundColor: colors.bg }}>
      <ActivityIndicator size="large" color={colors.primary} />
    </View>
  );
}

export function ErrorBanner({ message, onRetry }: { message: string | null | undefined; onRetry?: () => void }) {
  if (!message) return null;
  return (
    <View style={styles.errorBanner}>
      <Ionicons name="alert-circle" size={18} color={colors.danger} />
      <T style={{ flex: 1, color: colors.danger }}>{message}</T>
      {onRetry ? <Button small kind="ghost" title="Retry" onPress={onRetry} /> : null}
    </View>
  );
}

export function Fab({ icon = 'add', onPress, label }: { icon?: IconName; onPress: () => void; label?: string }) {
  return (
    <Pressable accessibilityLabel={label ?? 'Add'} onPress={onPress} style={({ pressed }) => [styles.fab, pressed && { opacity: 0.85 }]}>
      <Ionicons name={icon} size={28} color={colors.white} />
    </Pressable>
  );
}

export function Avatar({ label, color = colors.primary, size = 36 }: { label: string; color?: string; size?: number }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: colors.white, fontWeight: '700', fontSize: size * 0.38 }}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  screenPad: { padding: space.lg },
  footer: { padding: space.lg, paddingBottom: space.sm, backgroundColor: colors.card, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: space.lg,
    marginBottom: space.md,
    shadowColor: '#0F172A',
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  h1: { fontSize: 28, fontWeight: '800', color: colors.text },
  h2: { fontSize: 22, fontWeight: '700', color: colors.text },
  h3: { fontSize: 18, fontWeight: '700', color: colors.text },
  body: { fontSize: 16, color: colors.text },
  muted: { fontSize: 14, color: colors.textMuted },
  small: { fontSize: 12, color: colors.textMuted },
  overline: { fontSize: 12, fontWeight: '700', letterSpacing: 0.8, color: colors.textMuted, textTransform: 'uppercase' },
  money: { fontSize: 16, fontWeight: '700', color: colors.text, fontVariant: ['tabular-nums'] },
  label: { marginBottom: 6, fontWeight: '600', color: colors.text },
  input: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    paddingVertical: 12,
    fontSize: 16,
    color: colors.text,
  },
  btn: { paddingVertical: 14, paddingHorizontal: space.lg, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', minHeight: 48 },
  btnSmall: { paddingVertical: 8, paddingHorizontal: space.md, minHeight: 36 },
  btn_primary: { backgroundColor: colors.primary },
  btn_secondary: { backgroundColor: colors.primarySoft },
  btn_ghost: { backgroundColor: 'transparent' },
  btn_danger: { backgroundColor: colors.danger },
  btnText: { fontSize: 16, fontWeight: '700' },
  chip: { paddingVertical: 7, paddingHorizontal: 14, borderRadius: radius.pill, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: 14, fontWeight: '600', color: colors.text },
  option: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: space.md, borderRadius: radius.md, backgroundColor: colors.card, marginBottom: 6 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill, alignSelf: 'flex-start' },
  badgeText: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4 },
  listRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md, paddingHorizontal: space.lg, backgroundColor: colors.card, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  rowIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  statIcon: { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  errorBanner: { flexDirection: 'row', alignItems: 'center', gap: space.sm, backgroundColor: colors.dangerSoft, padding: space.md, borderRadius: radius.md, marginBottom: space.md },
  fab: {
    position: 'absolute', right: space.xl, bottom: space.xl, width: 58, height: 58, borderRadius: 29, backgroundColor: colors.primary,
    alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 4,
  },
});

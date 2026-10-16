import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
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

/**
 * Page container. Pass `title` for the large in-page heading used on tab
 * screens (they have no native header), and `back` to show the round back
 * button next to it on pushed screens.
 */
export function Screen({
  children,
  refreshing,
  onRefresh,
  scroll = true,
  padded = true,
  footer,
  title,
  subtitle,
  back,
  right,
  kicker,
}: {
  children: ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void;
  scroll?: boolean;
  padded?: boolean;
  footer?: ReactNode;
  title?: string;
  subtitle?: string | null;
  back?: boolean;
  right?: ReactNode;
  kicker?: string;
}) {
  const heading = title ? <PageTitle title={title} subtitle={subtitle} back={back} right={right} kicker={kicker} /> : null;
  const body = scroll ? (
    <ScrollView
      contentContainerStyle={[padded && styles.screenPad, { paddingBottom: 110 }]}
      keyboardShouldPersistTaps="handled"
      refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={colors.textMuted} /> : undefined}
    >
      {heading}
      {children}
    </ScrollView>
  ) : (
    <View style={[{ flex: 1 }, padded && styles.screenPad]}>{heading}{children}</View>
  );
  const content = (
    <View style={styles.screen}>
      {body}
      {footer ? <SafeAreaView edges={['bottom']} style={styles.footer}>{footer}</SafeAreaView> : null}
    </View>
  );
  return title ? <SafeAreaView edges={['top']} style={styles.screen}>{content}</SafeAreaView> : content;
}

export function BackButton({ onPress }: { onPress?: () => void }) {
  return (
    <Pressable accessibilityLabel="Back" hitSlop={8} onPress={onPress ?? (() => (router.canGoBack() ? router.back() : router.replace('/')))}
      style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.6 }]}>
      <Ionicons name="arrow-back" size={20} color={colors.text} />
    </Pressable>
  );
}

export function PageTitle({ title, subtitle, back, right, kicker }: { title: string; subtitle?: string | null; back?: boolean; right?: ReactNode; kicker?: string }) {
  return (
    <View style={{ marginBottom: space.lg, marginTop: back ? 0 : space.lg }}>
      {kicker ? <T variant="muted" style={{ marginBottom: 2 }}>{kicker}</T> : null}
      <Row style={{ justifyContent: 'space-between' }} gap={space.md}>
        <Row gap={space.md} style={{ flex: 1 }}>
          {back ? <BackButton /> : null}
          <T variant={back ? 'h2' : 'h1'} numberOfLines={1} style={{ flexShrink: 1 }}>{title}</T>
        </Row>
        {right}
      </Row>
      {subtitle ? <T variant="muted" style={{ marginTop: 2 }}>{subtitle}</T> : null}
    </View>
  );
}

export function Card({ children, style, onPress }: { children: ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void }) {
  if (onPress) {
    return (
      <Pressable onPress={onPress} style={({ pressed }) => [styles.card, pressed && { backgroundColor: colors.cardRaised }, style]}>
        {children}
      </Pressable>
    );
  }
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Row({ children, style, gap = space.sm }: { children: ReactNode; style?: StyleProp<ViewStyle>; gap?: number }) {
  return <View style={[{ flexDirection: 'row', alignItems: 'center', gap }, style]}>{children}</View>;
}

export function Section({ title, action, children, icon, iconColor, titleColor, count }: {
  title: string; action?: ReactNode; children: ReactNode; icon?: IconName; iconColor?: string; titleColor?: string; count?: string;
}) {
  return (
    <View style={{ marginTop: space.lg }}>
      <Row style={{ justifyContent: 'space-between', marginBottom: space.md }}>
        <Row gap={space.sm} style={{ flex: 1 }}>
          {icon ? <Ionicons name={icon} size={20} color={iconColor ?? colors.primary} /> : null}
          <T variant="h3" style={titleColor ? { color: titleColor } : undefined}>{title}</T>
        </Row>
        {count ? <T variant="muted">{count}</T> : null}
        {action}
      </Row>
      {children}
    </View>
  );
}

export function Divider() {
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.borderStrong, marginVertical: space.md }} />;
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
  const fg = disabled ? colors.textFaint : kind === 'primary' || kind === 'danger' ? colors.white : kind === 'secondary' ? colors.text : colors.primaryText;
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
        disabled && styles.btnDisabled,
        pressed && { opacity: 0.75 },
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

export function IconButton({ icon, onPress, color = colors.primaryText, label }: { icon: IconName; onPress: () => void; color?: string; label?: string }) {
  return (
    <Pressable accessibilityLabel={label} hitSlop={10} onPress={onPress} style={({ pressed }) => [{ padding: 6 }, pressed && { opacity: 0.5 }]}>
      <Ionicons name={icon} size={22} color={color} />
    </Pressable>
  );
}

/** Text input with optional label and leading icon. */
export function Field({ label, hint, error, style, icon, iconColor, ...props }: TextInputProps & {
  label?: string; hint?: string; error?: string | null; icon?: IconName; iconColor?: string;
}) {
  return (
    <View style={[{ marginBottom: space.lg }, style as any]}>
      {label ? <T style={styles.label}>{label}</T> : null}
      <View style={[styles.input, styles.inputRow, props.multiline && { minHeight: 110, alignItems: 'flex-start' }, error ? { borderColor: colors.danger } : null]}>
        {icon ? <Ionicons name={icon} size={20} color={iconColor ?? colors.textMuted} style={{ marginRight: 12 }} /> : null}
        <TextInput
          placeholderTextColor={colors.textFaint}
          {...props}
          style={[styles.inputText, props.multiline && { minHeight: 90, textAlignVertical: 'top' }]}
        />
      </View>
      {error ? <T variant="small" style={{ color: colors.danger, marginTop: 4 }}>{error}</T> : hint ? <T variant="small" style={{ marginTop: 4 }}>{hint}</T> : null}
    </View>
  );
}

export function ToggleRow({ label, value, onChange, hint }: { label: string; value: boolean; onChange: (v: boolean) => void; hint?: string }) {
  return (
    <Row style={{ justifyContent: 'space-between', marginBottom: space.lg }}>
      <View style={{ flex: 1 }}>
        <T>{label}</T>
        {hint ? <T variant="small">{hint}</T> : null}
      </View>
      <Switch value={value} onValueChange={onChange} trackColor={{ true: colors.primary, false: colors.borderStrong }} thumbColor={colors.white} />
    </Row>
  );
}

export interface Option<V extends string = string> { value: V; label: string; hint?: string; count?: number }

/**
 * Dropdown. `inline` expands the options under the field (as on the New Job
 * screen); otherwise a searchable sheet opens, better for long lists.
 */
export function Select<V extends string>({
  label,
  value,
  options,
  onChange,
  placeholder = 'Select…',
  searchable,
  allowClear,
  icon,
  iconColor,
  inline,
  disabled,
}: {
  label?: string;
  value: V | null | undefined;
  options: Option<V>[];
  onChange: (v: V | null) => void;
  placeholder?: string;
  searchable?: boolean;
  allowClear?: boolean;
  icon?: IconName;
  iconColor?: string;
  inline?: boolean;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const current = options.find((o) => o.value === value);
  const filtered = q ? options.filter((o) => (o.label + ' ' + (o.hint ?? '')).toLowerCase().includes(q.toLowerCase())) : options;
  const useInline = inline && options.length <= 12 && !searchable;
  return (
    <View style={{ marginBottom: space.lg }}>
      {label ? <T style={styles.label}>{label}</T> : null}
      <Pressable disabled={disabled} onPress={() => setOpen((o) => !o)} style={[styles.input, styles.inputRow, disabled && { opacity: 0.55 }]}>
        {icon ? <Ionicons name={icon} size={20} color={iconColor ?? colors.textMuted} style={{ marginRight: 12 }} /> : null}
        <Text style={{ flex: 1, color: current ? colors.text : colors.textMuted, fontSize: 16 }} numberOfLines={1}>
          {current?.label ?? placeholder}
        </Text>
        <Ionicons name={open && useInline ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textMuted} />
      </Pressable>
      {useInline && open ? (
        <View style={styles.inlineList}>
          {options.length === 0 ? <T variant="muted" style={{ padding: space.lg }}>Nothing to choose yet</T> : null}
          {options.map((o, i) => (
            <Pressable key={o.value} onPress={() => { onChange(o.value); setOpen(false); }}
              style={({ pressed }) => [styles.inlineOption, i > 0 && styles.inlineDivider, (pressed || o.value === value) && { backgroundColor: colors.cardRaised }]}>
              <T>{o.label}</T>
              {o.hint ? <T variant="muted">{o.hint}</T> : null}
            </Pressable>
          ))}
          {allowClear && value ? (
            <Pressable onPress={() => { onChange(null); setOpen(false); }} style={[styles.inlineOption, styles.inlineDivider]}>
              <T variant="muted">Clear selection</T>
            </Pressable>
          ) : null}
        </View>
      ) : null}
      {!useInline ? (
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
                  style={({ pressed }) => [styles.option, pressed && { backgroundColor: colors.cardRaised }]}
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
      ) : null}
    </View>
  );
}

/** Horizontal filter chips; pass `count` on options to show "(n)". */
export function Segmented<V extends string>({ value, options, onChange }: { value: V; options: Option<V>[]; onChange: (v: V) => void }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 2 }} style={{ marginBottom: space.lg, flexGrow: 0 }}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable key={o.value} onPress={() => onChange(o.value)} style={[styles.chip, active && styles.chipActive]}>
            <Text style={[styles.chipText, active && { color: colors.white }]}>
              {o.label}
              {o.count != null ? <Text style={[styles.chipCount, active && { color: 'rgba(255,255,255,0.75)' }]}>{`  (${o.count})`}</Text> : null}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

export function SearchBar({ value, onChange, placeholder = 'Search' }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <View style={[styles.input, styles.inputRow, { marginBottom: space.lg, paddingVertical: 0 }]}>
      <Ionicons name="search" size={20} color={colors.textMuted} />
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={colors.textFaint}
        autoCorrect={false}
        style={{ flex: 1, paddingVertical: 13, paddingHorizontal: 10, fontSize: 16, color: colors.text }}
      />
      {value ? <IconButton icon="close-circle" color={colors.textMuted} onPress={() => onChange('')} /> : null}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Display
// ---------------------------------------------------------------------------
const pretty = (s: string) => s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

export function Badge({ label, tone = 'neutral', large, raw }: { label: string; tone?: Tone; large?: boolean; raw?: boolean }) {
  const c = toneColors[tone];
  return (
    <View style={[styles.badge, large && styles.badgeLarge, { backgroundColor: c.bg }]}>
      <Text style={[styles.badgeText, large && { fontSize: 15 }, { color: c.fg }]}>{raw ? label : pretty(label)}</Text>
    </View>
  );
}

/** Tinted rounded square (or circle) holding an icon, as on stat tiles and rows. */
export function IconTile({ icon, tone = 'primary', size = 40, round }: { icon: IconName; tone?: Tone; size?: number; round?: boolean }) {
  const c = toneColors[tone];
  return (
    <View style={{ width: size, height: size, borderRadius: round ? size / 2 : 10, backgroundColor: c.bg, alignItems: 'center', justifyContent: 'center' }}>
      <Ionicons name={icon} size={size * 0.5} color={c.fg} />
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
  tone = 'primary',
}: {
  title: string;
  subtitle?: string | null;
  meta?: string | null;
  right?: ReactNode;
  left?: ReactNode;
  onPress?: () => void;
  icon?: IconName;
  tone?: Tone;
}) {
  return (
    <Pressable onPress={onPress} disabled={!onPress} style={({ pressed }) => [styles.listRow, pressed && { backgroundColor: colors.cardRaised }]}>
      {left ?? (icon ? <IconTile icon={icon} tone={tone} size={40} /> : null)}
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
  return (
    <Card onPress={onPress} style={{ flex: 1, minWidth: 140, marginBottom: 0 }}>
      <IconTile icon={icon} tone={tone} size={40} />
      <T variant="muted" style={{ marginTop: space.md }}>{label}</T>
      <T style={{ fontSize: 26, fontWeight: '800', color: colors.text, marginTop: 2 }}>{value}</T>
    </Card>
  );
}

export function KeyValue({ label, value, onPress }: { label: string; value: ReactNode; onPress?: () => void }) {
  if (value == null || value === '') return null;
  return (
    <Pressable disabled={!onPress} onPress={onPress} style={{ flexDirection: 'row', paddingVertical: 6, gap: space.md }}>
      <T variant="muted" style={{ width: 120 }}>{label}</T>
      {typeof value === 'string' || typeof value === 'number' ? (
        <T style={[{ flex: 1 }, onPress && { color: colors.primaryText }]}>{value}</T>
      ) : (
        <View style={{ flex: 1 }}>{value}</View>
      )}
    </Pressable>
  );
}

export function EmptyState({ icon = 'file-tray-outline', title, body, action }: { icon?: IconName; title: string; body?: string; action?: ReactNode }) {
  return (
    <View style={{ alignItems: 'center', padding: space.xxl, gap: space.sm }}>
      <Ionicons name={icon} size={44} color={colors.textFaint} />
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
      <Ionicons name={icon} size={30} color={colors.white} />
    </Pressable>
  );
}

export function Avatar({ label, color, size = 36 }: { label: string; color?: string; size?: number }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color ?? colors.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: color ? colors.white : colors.primaryText, fontWeight: '700', fontSize: size * 0.38 }}>{label}</Text>
    </View>
  );
}

/** Numbered step tracker, e.g. Scheduled → In Progress → Completed → Invoiced. */
export function Stepper({ steps, current }: { steps: string[]; current: number }) {
  return (
    <Row gap={0} style={{ alignItems: 'flex-start' }}>
      {steps.map((s, i) => {
        const done = i <= current;
        return (
          <View key={s} style={{ flex: 1, alignItems: 'center' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', width: '100%' }}>
              <View style={{ flex: 1, height: 2, backgroundColor: i === 0 ? 'transparent' : i <= current ? colors.primary : colors.borderStrong }} />
              <View style={[styles.stepDot, done && { backgroundColor: colors.primary, borderColor: '#2D6CA6' }]}>
                {done ? <Ionicons name="checkmark-circle-outline" size={20} color={colors.white} /> : <Text style={{ color: colors.textMuted, fontSize: 12 }}>{i + 1}</Text>}
              </View>
              <View style={{ flex: 1, height: 2, backgroundColor: i === steps.length - 1 ? 'transparent' : i < current ? colors.primary : colors.borderStrong }} />
            </View>
            <T variant="small" style={{ marginTop: 6, color: done ? colors.primary : colors.textMuted }}>{s}</T>
          </View>
        );
      })}
    </Row>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  screenPad: { padding: space.lg },
  footer: { padding: space.lg, paddingBottom: space.sm, backgroundColor: colors.bg },
  backBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space.lg,
    marginBottom: space.md,
  },
  h1: { fontSize: 30, fontWeight: '800', color: colors.text },
  h2: { fontSize: 24, fontWeight: '700', color: colors.text },
  h3: { fontSize: 19, fontWeight: '700', color: colors.text },
  body: { fontSize: 16, color: colors.text },
  muted: { fontSize: 14, color: colors.textMuted },
  small: { fontSize: 12, color: colors.textMuted },
  overline: { fontSize: 12, fontWeight: '700', letterSpacing: 0.8, color: colors.textMuted, textTransform: 'uppercase' },
  money: { fontSize: 16, fontWeight: '700', color: colors.text, fontVariant: ['tabular-nums'] },
  label: { marginBottom: 8, fontWeight: '600', color: colors.text, fontSize: 15 },
  input: {
    backgroundColor: colors.input,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: space.lg,
    paddingVertical: 14,
  },
  inputRow: { flexDirection: 'row', alignItems: 'center' },
  inputText: { flex: 1, fontSize: 16, color: colors.text, padding: 0 },
  inlineList: { marginTop: space.sm, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, overflow: 'hidden' },
  inlineOption: { paddingVertical: 12, paddingHorizontal: space.lg },
  inlineDivider: { borderTopWidth: 1, borderTopColor: colors.border },
  btn: { paddingVertical: 15, paddingHorizontal: space.lg, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', minHeight: 52 },
  btnSmall: { paddingVertical: 8, paddingHorizontal: space.md, minHeight: 38, borderRadius: 10 },
  btn_primary: { backgroundColor: colors.primary },
  btn_secondary: { backgroundColor: colors.cardRaised, borderWidth: 1, borderColor: colors.borderStrong },
  btn_ghost: { backgroundColor: 'transparent' },
  btn_danger: { backgroundColor: colors.danger },
  btnDisabled: { backgroundColor: '#283041', borderColor: '#283041' },
  btnText: { fontSize: 17, fontWeight: '600' },
  chip: { paddingVertical: 9, paddingHorizontal: 18, borderRadius: radius.pill, backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.borderStrong },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: 16, fontWeight: '500', color: colors.textMuted },
  chipCount: { fontSize: 12, color: colors.textFaint },
  option: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: space.md, borderRadius: radius.md, backgroundColor: colors.card, marginBottom: 6 },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill, alignSelf: 'flex-start' },
  badgeLarge: { paddingHorizontal: 16, paddingVertical: 8 },
  badgeText: { fontSize: 12, fontWeight: '600' },
  listRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md, paddingHorizontal: space.lg, backgroundColor: colors.card, borderBottomWidth: 1, borderBottomColor: colors.border },
  errorBanner: { flexDirection: 'row', alignItems: 'center', gap: space.sm, backgroundColor: colors.dangerSoft, padding: space.md, borderRadius: radius.md, marginBottom: space.md },
  stepDot: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.cardRaised, borderWidth: 2, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  fab: {
    position: 'absolute', right: space.xl, bottom: space.xl, width: 60, height: 60, borderRadius: 30, backgroundColor: colors.primary,
    alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 6,
  },
});

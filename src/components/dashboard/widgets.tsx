import { router } from 'expo-router';
import { Pressable, View } from 'react-native';
import { Button, Card, IconButton, IconTile, Ionicons, ListRow, Row, Select, T, type IconName } from '../ui';
import type { Branch } from '../../lib/types';
import { money } from '../../lib/format';
import { colors, radius, space, type Tone } from '../../lib/theme';
import type { SetupStep } from './useSetupSteps';

export function QuickAction({ icon, label, onPress, primary }: { icon: IconName; label: string; onPress: () => void; primary?: boolean }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [{
      flexGrow: 1, flexBasis: '22%', minWidth: 76, alignItems: 'center', justifyContent: 'center', paddingVertical: 16, paddingHorizontal: 4, borderRadius: radius.md, gap: 6,
      backgroundColor: primary ? colors.primary : colors.cardRaised, borderWidth: 1, borderColor: primary ? colors.primary : colors.borderStrong,
    }, pressed && { opacity: 0.8 }]}>
      <Ionicons name={icon} size={24} color={primary ? colors.white : colors.textMuted} />
      <T style={{ fontSize: 13, fontWeight: '600', color: primary ? colors.white : colors.text, textAlign: 'center' }} numberOfLines={1}>{label}</T>
    </Pressable>
  );
}

/** "All locations" or one company location (Fleet). */
export function BranchSwitcher({ branches, value, onChange }: { branches: Branch[]; value: string | null; onChange: (id: string | null) => void }) {
  const ALL = '__all__';
  return (
    <Select
      label="Company location"
      icon="business-outline"
      value={value ?? ALL}
      inline
      options={[{ value: ALL, label: 'All locations', hint: 'Every location combined' }, ...branches.map((b) => ({ value: b.id, label: b.name, hint: b.address ?? undefined }))]}
      onChange={(v) => onChange(!v || v === ALL ? null : v)}
    />
  );
}

export type ProfitMonth = { revenue: number | string | null; gross: number | string | null; net: number | string | null; labor_unknown_minutes: number | string | null } | null;

function Figure({ label, value, tone }: { label: string; value: number | string | null | undefined; tone: Tone }) {
  const unknown = value == null;
  const n = Number(value);
  const color = unknown ? colors.textMuted : tone === 'success' && n < 0 ? colors.danger : tone === 'success' ? colors.success : colors.text;
  return (
    <View style={{ flex: 1, minWidth: 90 }}>
      <T variant="muted">{label}</T>
      <T style={{ fontSize: 22, fontWeight: '800', color, marginTop: 2 }} numberOfLines={1}>{unknown ? 'Unknown' : money(n).replace(/\.00$/, '')}</T>
    </View>
  );
}

export function ProfitCard({ data, monthLabel }: { data: ProfitMonth; monthLabel: string }) {
  const unknown = !data || data.gross == null || data.net == null;
  return (
    <Card onPress={() => router.push('/reports')}>
      <Row style={{ justifyContent: 'space-between', marginBottom: space.md }}>
        <Row gap={space.sm}>
          <IconTile icon="pie-chart-outline" tone="success" size={36} />
          <View>
            <T variant="h3">Profitability</T>
            <T variant="small">{monthLabel} so far · excluding tax</T>
          </View>
        </Row>
        <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
      </Row>
      <Row gap={space.md} style={{ flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <Figure label="Revenue" value={data?.revenue ?? null} tone="neutral" />
        <Figure label="Gross profit" value={data?.gross ?? null} tone="success" />
        <Figure label="Net profit" value={data?.net ?? null} tone="success" />
      </Row>
      {unknown ? (
        <Row gap={6} style={{ marginTop: space.md, alignItems: 'flex-start' }}>
          <Ionicons name="information-circle-outline" size={16} color={colors.warning} />
          <T variant="small" style={{ flex: 1, color: colors.warning }}>
            Some costs are unknown. Add pay rates for your team and supply costs so profit can be worked out.
          </T>
        </Row>
      ) : null}
    </Card>
  );
}

export interface AttentionItem { key: string; icon: IconName; tone: Tone; title: string; subtitle?: string | null; href: string }

export function NeedsAttention({ items }: { items: AttentionItem[] }) {
  if (!items.length) {
    return (
      <Card>
        <Row gap={space.md}>
          <IconTile icon="checkmark-done-outline" tone="success" />
          <T variant="muted" style={{ flex: 1 }}>All caught up. Nothing needs your attention right now.</T>
        </Row>
      </Card>
    );
  }
  return (
    <Card style={{ padding: 0, overflow: 'hidden' }}>
      {items.map((i) => <ListRow key={i.key} icon={i.icon} tone={i.tone} title={i.title} subtitle={i.subtitle} onPress={() => router.push(i.href)} />)}
    </Card>
  );
}

export function GettingStartedCard({ steps, doneCount, onDismiss }: { steps: SetupStep[]; doneCount: number; onDismiss: () => void }) {
  const next = steps.find((s) => !s.done);
  const pct = Math.round((doneCount / steps.length) * 100);
  return (
    <Card onPress={() => router.push('/getting-started')} style={{ borderColor: colors.primarySoft }}>
      <Row style={{ justifyContent: 'space-between' }}>
        <Row gap={space.sm} style={{ flex: 1 }}>
          <IconTile icon="rocket-outline" tone="primary" size={36} />
          <View style={{ flex: 1 }}>
            <T variant="h3">Getting started</T>
            <T variant="small">{doneCount} of {steps.length} steps done</T>
          </View>
        </Row>
        <IconButton icon="close" color={colors.textMuted} label="Hide getting started" onPress={onDismiss} />
      </Row>
      <View style={{ height: 6, borderRadius: 3, backgroundColor: colors.cardRaised, marginTop: space.md, overflow: 'hidden' }}>
        <View style={{ width: `${pct}%`, height: 6, backgroundColor: colors.primary }} />
      </View>
      {next ? (
        <Row style={{ marginTop: space.md, justifyContent: 'space-between' }} gap={space.md}>
          <T style={{ flex: 1 }} numberOfLines={2}>Next: {next.title}</T>
          <Button small title={next.action} onPress={() => router.push(next.href)} />
        </Row>
      ) : null}
    </Card>
  );
}

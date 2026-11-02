import AsyncStorage from '@react-native-async-storage/async-storage';
import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useSetupSteps } from '../../components/dashboard/useSetupSteps';
import { notify } from '../../components/FormSheet';
import { Button, Card, ErrorBanner, IconTile, Ionicons, Row, Screen, Section, T } from '../../components/ui';
import { APP_GUIDE } from '../../lib/appGuide';
import { colors, space } from '../../lib/theme';

export default function GettingStarted() {
  const { steps, doneCount, total, allDone, error, refresh, refreshing, loading } = useSetupSteps();
  const pct = Math.round((doneCount / total) * 100);
  const nextKey = steps.find((s) => !s.done)?.key;
  const [openGuide, setOpenGuide] = useState<string | null>(null);
  const showTipsAgain = async () => {
    await AsyncStorage.multiRemove(APP_GUIDE.map((g) => `first-tip-seen:${g.path}`)).catch(() => {});
    notify('Tips are back on', 'Each main screen shows its tip again the next time you open it.');
  };

  return (
    <Screen refreshing={refreshing} onRefresh={refresh}>
      <Stack.Screen options={{ title: 'Getting started' }} />
      <ErrorBanner message={error} onRetry={refresh} />
      <Card>
        <T variant="h3">{allDone ? 'You’re all set up' : `Your first ${total} steps`}</T>
        <T variant="muted" style={{ marginTop: 2 }}>
          {allDone ? 'Nice work. Your company is ready to run on Tarmo.' : 'Each step checks itself off as you go.'}
        </T>
        <View style={{ height: 8, borderRadius: 4, backgroundColor: colors.cardRaised, marginTop: space.md, overflow: 'hidden' }}>
          <View style={{ width: `${pct}%`, height: 8, backgroundColor: allDone ? colors.success : colors.primary }} />
        </View>
        <T variant="small" style={{ marginTop: 6 }}>{loading ? 'Checking…' : `${doneCount} of ${total} done`}</T>
      </Card>

      {steps.map((s, i) => {
        const next = s.key === nextKey;
        return (
          <Card key={s.key} style={next ? { borderColor: colors.primary } : undefined}>
            <Row gap={space.md} style={{ alignItems: 'flex-start' }}>
              <View style={{
                width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center',
                backgroundColor: s.done ? colors.successSoft : next ? colors.primarySoft : colors.cardRaised,
              }}>
                {s.done ? <Ionicons name="checkmark" size={18} color={colors.success} /> : <T style={{ fontWeight: '700', color: next ? colors.primaryText : colors.textMuted }}>{i + 1}</T>}
              </View>
              <View style={{ flex: 1 }}>
                <Row gap={6}>
                  <Ionicons name={s.icon} size={16} color={s.done ? colors.success : colors.textMuted} />
                  <T style={{ fontWeight: '700', flex: 1, color: s.done ? colors.textMuted : colors.text }}>{s.title}</T>
                </Row>
                <T variant="muted" style={{ marginTop: 4 }}>{s.note ?? s.body}</T>
                {!s.done || next ? (
                  <Button small style={{ alignSelf: 'flex-start', marginTop: space.md }} kind={next ? 'primary' : 'secondary'} title={s.action} onPress={() => router.push(s.href)} />
                ) : (
                  <Button small kind="ghost" style={{ alignSelf: 'flex-start', marginTop: space.xs }} title="Open" onPress={() => router.push(s.href)} />
                )}
              </View>
            </Row>
          </Card>
        );
      })}

      <Card onPress={() => router.push('/training')}>
        <Row gap={space.md}>
          <Ionicons name="school-outline" size={22} color={colors.primaryText} />
          <T style={{ flex: 1 }}>Train your crew with step-by-step SOPs (standard operating procedures) in the Training center.</T>
          <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
        </Row>
      </Card>
      <Section title="How Tarmo works">
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          {APP_GUIDE.map((g, i) => {
            const open = openGuide === g.path;
            return (
              <View key={g.path} style={i ? { borderTopWidth: 1, borderTopColor: colors.border } : undefined}>
                <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={() => setOpenGuide(open ? null : g.path)} style={{ padding: space.md }}>
                  <Row gap={space.md}>
                    <IconTile icon={g.icon} tone="primary" size={32} />
                    <T style={{ flex: 1, fontWeight: '600' }}>{g.title}</T>
                    <Ionicons name={open ? 'chevron-down' : 'chevron-forward'} size={18} color={colors.textMuted} />
                  </Row>
                </Pressable>
                {open ? (
                  <View style={{ paddingHorizontal: space.md, paddingBottom: space.md }}>
                    <T variant="muted">{g.body}</T>
                    <Button small kind="secondary" title={`Open ${g.title}`} onPress={() => router.push(g.path as never)} style={{ alignSelf: 'flex-start', marginTop: space.sm }} />
                  </View>
                ) : null}
              </View>
            );
          })}
        </Card>
        <Button small kind="ghost" icon="bulb-outline" title="Show screen tips again" onPress={showTipsAgain} style={{ alignSelf: 'flex-start', marginTop: space.sm }} />
      </Section>

      {steps.find((s) => s.key === 'invoice')?.done ? (
        <Card onPress={() => router.push('/automations')}>
          <Row gap={space.md}>
            <Ionicons name="flash-outline" size={22} color={colors.warning} />
            <T style={{ flex: 1 }}>Turn on job reminders, invoice reminders and review requests in the Automation center.</T>
            <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
          </Row>
        </Card>
      ) : null}
    </Screen>
  );
}

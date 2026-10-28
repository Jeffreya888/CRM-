import { router } from 'expo-router';
import { View } from 'react-native';
import { Button, Card, Ionicons, Row, T } from '../ui';
import { canAdmin } from '../../lib/plans';
import { useOrg } from '../../lib/session';
import { supabase } from '../../lib/supabase';
import { colors, space } from '../../lib/theme';
import { useQuery } from '../../lib/useQuery';

/**
 * Result of rpc ai_allowance: plan checks this calendar month plus purchased
 * extras, and the "Ask" assistant questions (plan questions, then the
 * question bank, then 10 questions per extra AI check).
 */
export interface AiAllowanceInfo {
  included: number; extra: number; used: number; left: number;
  questionsIncluded: number; questionsUsed: number; questionsLeft: number;
}

/** What ran out: photo checks or assistant questions. */
export type AiLimitKind = 'check' | 'question';

/**
 * True when an error from the assess-photos function means the company is out
 * of AI checks (HTTP 402, "AI_LIMIT: …"). Also matches the bare sentence in
 * case the code prefix was stripped by friendlyError.
 */
export function isAiLimitError(e: unknown): boolean {
  const msg = typeof e === 'string' ? e : (e as any)?.message ?? '';
  return /AI_LIMIT/.test(msg) || /used all (of )?your AI checks/i.test(msg) || (e as any)?.code === 'ai_limit';
}

/**
 * Loads this month's AI check allowance. Pass a changing `key` (e.g. a counter
 * bumped after each check) to reload. `data` stays undefined if it can't load.
 */
export function useAiAllowance(key: unknown = 0) {
  const { orgId } = useOrg();
  return useQuery<AiAllowanceInfo | null>(async () => {
    if (!orgId) return null;
    const { data, error } = await supabase.rpc('ai_allowance', { p_org: orgId });
    if (error) throw new Error(error.message);
    const d = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | null;
    if (!d) return null;
    const n = (v: unknown) => Math.max(0, Number(v) || 0);
    return {
      included: n(d.included), extra: n(d.extra), used: n(d.used), left: n(d.left),
      questionsIncluded: n(d.questions_included), questionsUsed: n(d.questions_used), questionsLeft: n(d.questions_left),
    };
  }, [orgId, key]);
}

const plural = (n: number, word: string) => `${n.toLocaleString('en-US')} ${word}${n === 1 ? '' : 's'}`;

/** "12 of 25 AI checks left this month (+50 extra)". */
export function allowanceLine(a: AiAllowanceInfo): string {
  const planLeft = Math.max(0, a.included - a.used);
  const extra = a.extra ? ` (+${a.extra.toLocaleString('en-US')} extra)` : '';
  if (!a.included) return `${plural(a.extra, 'extra AI check')} left`;
  return `${planLeft.toLocaleString('en-US')} of ${plural(a.included, 'AI check')} left this month${extra}`;
}

/** "212 of 300 questions left this month" (plus questions from extra checks). */
export function questionsLine(a: AiAllowanceInfo): string {
  const planLeft = Math.max(0, a.questionsIncluded - a.questionsUsed);
  const bonus = Math.max(0, a.questionsLeft - planLeft);
  const extra = bonus ? ` (+${bonus.toLocaleString('en-US')} extra)` : '';
  if (!a.questionsIncluded) return `${plural(a.questionsLeft, 'extra question')} left`;
  return `${planLeft.toLocaleString('en-US')} of ${plural(a.questionsIncluded, 'question')} left this month${extra}`;
}

/**
 * Shows how many AI photo checks (or, with `kind="question"`, assistant
 * questions) are left, or — when none are left (or `outOfChecks` is set
 * after a 402 from the server) — a card with "Buy more" and "Upgrade plan".
 */
export function AiAllowance({ allowance, outOfChecks, kind = 'check' }: { allowance: AiAllowanceInfo | null | undefined; outOfChecks?: boolean; kind?: AiLimitKind }) {
  const left = kind === 'question' ? allowance?.questionsLeft : allowance?.left;
  const out = outOfChecks || (!!allowance && (left ?? 0) <= 0);
  if (out) return <AiLimitCard kind={kind} />;
  if (!allowance) return null;
  return (
    <Row gap={6} style={{ marginBottom: space.md }}>
      <Ionicons name={kind === 'question' ? 'chatbubbles-outline' : 'sparkles-outline'} size={16} color={colors.primaryText} />
      <T variant="small" style={{ flex: 1 }}>{kind === 'question' ? questionsLine(allowance) : allowanceLine(allowance)}</T>
    </Row>
  );
}

/** The out-of-checks (or out-of-questions) card with the two ways to get more. */
export function AiLimitCard({ kind = 'check' }: { kind?: AiLimitKind }) {
  const { role, plan, isDemo } = useOrg();
  const admin = canAdmin(role);
  const showUpgrade = plan !== 'fleet';
  const q = kind === 'question';
  return (
    <Card style={{ backgroundColor: colors.warningSoft, borderColor: 'transparent' }}>
      <Row gap={space.sm} style={{ alignItems: 'flex-start' }}>
        <Ionicons name="sparkles-outline" size={20} color={colors.warning} style={{ marginTop: 2 }} />
        <View style={{ flex: 1 }}>
          <T style={{ fontWeight: '700' }}>{q ? 'You\u2019ve used all your questions this month' : 'You\u2019ve used all your AI checks this month'}</T>
          <T variant="muted" style={{ marginTop: 2 }}>
            {isDemo
              ? q ? 'The demo workspace includes 20 questions. Start your own company to get more.' : 'The demo workspace includes 5 AI checks. Start your own company to get more.'
              : admin
                ? q
                  ? 'Add a pack of extra AI checks (each one also adds 10 questions, and they never expire) or move to a bigger plan for more each month.'
                  : 'Add a pack of extra checks (they never expire) or move to a bigger plan for more each month.'
                : q ? 'Ask your owner to add more questions.' : 'Ask your owner to add more AI checks.'}
          </T>
        </View>
      </Row>
      {admin && !isDemo ? (
        <View style={{ gap: space.sm, marginTop: space.md }}>
          <Button icon="add-circle-outline" title={q ? 'Buy more questions' : 'Buy more AI checks'} onPress={() => router.push({ pathname: '/paywall', params: { section: 'ai' } })} />
          {showUpgrade ? <Button kind="secondary" icon="rocket-outline" title="Upgrade plan" onPress={() => router.push('/paywall')} /> : null}
        </View>
      ) : null}
    </Card>
  );
}

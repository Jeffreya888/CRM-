import { ActivityIndicator, View } from 'react-native';
import { Badge, Card, Ionicons, Row, T } from '../ui';
import { conditionLabel } from '../../lib/pricing';
import { colors, radius, space, type Tone } from '../../lib/theme';
import type { ConditionAssessment, ConditionLevel } from '../../lib/types';

export const CONDITION_TONE: Record<ConditionLevel, Tone> = { light: 'success', moderate: 'info', heavy: 'warning', severe: 'danger' };
const SEVERITY_COLOR = { low: colors.success, medium: colors.warning, high: colors.danger } as const;

type Props = {
  assessment: Pick<ConditionAssessment, 'status' | 'overall' | 'score' | 'summary' | 'findings' | 'suggestions' | 'error' | 'applied_at'>;
  /** Render without the surrounding Card (e.g. inside another card). */
  bare?: boolean;
};

/** Reusable view of an AI condition report: condition, score, summary, findings and suggested services. */
export function AssessmentCard({ assessment: a, bare }: Props) {
  const body = (
    <View>
      <Row style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: space.sm }}>
        <Row gap={6}>
          <Ionicons name="sparkles-outline" size={18} color={colors.purple} />
          <T style={{ fontWeight: '700' }}>Condition report</T>
        </Row>
        {a.status === 'done' && a.overall ? <Badge label={conditionLabel(a.overall)} tone={CONDITION_TONE[a.overall]} large raw /> : null}
      </Row>

      {a.status === 'pending' ? (
        <Row style={{ paddingVertical: space.sm }}>
          <ActivityIndicator color={colors.primaryText} />
          <T variant="muted">Checking the photos…</T>
        </Row>
      ) : a.status === 'failed' ? (
        <T style={{ color: colors.danger }}>{a.error ?? 'The photo check did not work. Please try again.'}</T>
      ) : (
        <>
          {a.score != null ? (
            <Row style={{ marginBottom: space.sm, alignItems: 'center' }}>
              <T style={{ fontSize: 22, fontWeight: '800' }}>{a.score}<T variant="muted">/10</T></T>
              <View style={{ flex: 1, height: 6, borderRadius: radius.pill, backgroundColor: colors.cardRaised, overflow: 'hidden' }}>
                <View style={{ width: `${a.score * 10}%`, height: '100%', backgroundColor: a.score >= 8 ? colors.success : a.score >= 5 ? colors.warning : colors.danger }} />
              </View>
            </Row>
          ) : null}
          {a.summary ? <T style={{ marginBottom: space.sm, lineHeight: 21 }}>{a.summary}</T> : null}

          {a.findings?.length ? (
            <View style={{ marginBottom: space.sm, gap: 6 }}>
              {a.findings.map((f, i) => (
                <Row key={i} style={{ alignItems: 'flex-start' }}>
                  <View style={{ width: 10, height: 10, borderRadius: 5, marginTop: 5, backgroundColor: SEVERITY_COLOR[f.severity] ?? colors.textMuted }} />
                  <View style={{ flex: 1 }}>
                    <T><T style={{ fontWeight: '600' }}>{f.area}:</T> {f.issue}</T>
                    {f.note ? <T variant="small">{f.note}</T> : null}
                  </View>
                </Row>
              ))}
            </View>
          ) : null}

          {a.suggestions?.length ? (
            <View style={{ marginBottom: space.sm }}>
              <T variant="small" style={{ fontWeight: '600', marginBottom: 6 }}>Suggested services</T>
              <Row style={{ flexWrap: 'wrap' }} gap={6}>
                {a.suggestions.map((s, i) => (
                  <View key={s.service_id ?? i} style={{ paddingVertical: 5, paddingHorizontal: 10, borderRadius: radius.pill, backgroundColor: colors.purpleSoft }}>
                    <T variant="small" style={{ color: colors.purple, fontWeight: '600' }}>{s.name}</T>
                  </View>
                ))}
              </Row>
            </View>
          ) : null}
        </>
      )}

      <Row gap={6} style={{ marginTop: 2 }}>
        <Ionicons name="information-circle-outline" size={14} color={colors.textFaint} />
        <T variant="small" style={{ color: colors.textFaint, flex: 1 }}>
          AI estimate — please confirm on site{a.applied_at ? ' · saved to the asset' : ''}
        </T>
      </Row>
    </View>
  );
  return bare ? body : <Card>{body}</Card>;
}

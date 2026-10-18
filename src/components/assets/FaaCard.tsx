import { ActivityIndicator, View } from 'react-native';
import { faaPlace, faaSummary, faaTypeName, faaWarning } from '../../lib/faa';
import { date, relative } from '../../lib/format';
import { colors, radius, space } from '../../lib/theme';
import type { FaaLookup, FaaLookupFound } from '../../lib/types';
import { Button, Card, Ionicons, KeyValue, Row, T } from '../ui';

/** Yellow note shown when the registration is not valid or expires soon. */
export function FaaWarningNote({ faa }: { faa: Pick<FaaLookupFound, 'status' | 'expires'> }) {
  const msg = faaWarning(faa);
  if (!msg) return null;
  return (
    <Row gap={6} style={{ marginTop: space.sm, padding: space.sm, borderRadius: radius.sm, backgroundColor: colors.warningSoft, alignItems: 'flex-start' }}>
      <Ionicons name="warning-outline" size={16} color={colors.warning} />
      <T variant="small" style={{ color: colors.warning, flex: 1 }}>{msg}</T>
    </Row>
  );
}

export type FaaLookupState = { status: 'loading' } | { status: 'done'; result: FaaLookup } | { status: 'error'; message: string };

/**
 * Compact card under the tail number field in the aircraft form.
 * Shows loading, "Not found in FAA registry", or the registration with
 * **Use these details**. `applied` switches the button to a confirmation.
 */
export function FaaSuggestion({ state, applied, needsModel, onUse }: {
  state: FaaLookupState;
  applied: boolean;
  /** True after applying when no catalog model was matched. */
  needsModel: boolean;
  onUse: () => void;
}) {
  const box = { marginTop: -space.sm, marginBottom: space.lg, padding: space.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card };
  if (state.status === 'loading') {
    return (
      <Row gap={space.sm} style={box}>
        <ActivityIndicator size="small" color={colors.primary} />
        <T variant="small">Checking the FAA registry…</T>
      </Row>
    );
  }
  if (state.status === 'error') return <T variant="small" style={{ marginTop: -space.sm, marginBottom: space.lg }}>Couldn&apos;t check the FAA registry right now.</T>;
  const r = state.result;
  if (!r.found) {
    if (r.reason === 'not_us') return null;
    return (
      <T variant="small" style={{ marginTop: -space.sm, marginBottom: space.lg }}>
        {r.reason === 'no_data' ? 'FAA registry data is not available yet.' : 'Not found in FAA registry.'}
      </T>
    );
  }
  return (
    <View style={box}>
      <Row gap={6} style={{ alignItems: 'flex-start' }}>
        <Ionicons name="document-text-outline" size={16} color={colors.primaryText} style={{ marginTop: 2 }} />
        <T style={{ flex: 1, fontSize: 14 }}><T style={{ fontWeight: '700', fontSize: 14 }}>FAA: </T>{faaSummary(r)}</T>
      </Row>
      <FaaWarningNote faa={r} />
      {applied ? (
        <Row gap={6} style={{ marginTop: space.sm }}>
          <Ionicons name="checkmark-circle" size={16} color={colors.success} />
          <T variant="small" style={{ color: colors.success, flex: 1 }}>
            {needsModel ? 'Details filled in. Pick the model from the catalog for size & pricing.' : 'Details filled in.'}
          </T>
        </Row>
      ) : (
        <Button small kind="secondary" icon="download-outline" title="Use these details" onPress={onUse} style={{ marginTop: space.sm, alignSelf: 'flex-start' }} />
      )}
    </View>
  );
}

/** "Registration (FAA)" details for the aircraft screen. */
export function FaaRegistrationCard({ faa, checkedAt, message, onRefresh }: {
  faa: FaaLookupFound | null;
  checkedAt: string | null;
  /** Result of the last refresh when nothing was found, e.g. "Not found in FAA registry." */
  message?: string | null;
  /** Shown to managers only. */
  onRefresh?: () => Promise<void>;
}) {
  return (
    <Card>
      {faa ? (
        <>
          <KeyValue label="Registered to" value={faa.owner} />
          <KeyValue label="Location" value={faaPlace(faa) || null} />
          <KeyValue label="FAA type" value={faaTypeName(faa)} />
          <KeyValue label="Year" value={faa.year ? String(faa.year) : null} />
          <KeyValue label="Serial #" value={faa.serial} />
          <KeyValue label="Status" value={[faa.status, faa.expires ? `expires ${date(faa.expires)}` : null].filter(Boolean).join(' · ') || null} />
          <FaaWarningNote faa={faa} />
          <T variant="small" style={{ marginTop: space.sm }}>
            {[faa.data_as_of ? `FAA data as of ${date(faa.data_as_of)}` : null, checkedAt ? `checked ${relative(checkedAt)}` : null].filter(Boolean).join(' · ')}
          </T>
        </>
      ) : (
        <T variant="muted">Not checked yet.{onRefresh ? ' Tap Refresh to look it up.' : ''}</T>
      )}
      {message ? <T variant="small" style={{ marginTop: space.sm }}>{message}</T> : null}
      {onRefresh ? <Button small kind="secondary" icon="refresh" title="Refresh" onPress={onRefresh} style={{ marginTop: space.md, alignSelf: 'flex-start' }} /> : null}
    </Card>
  );
}

// Import from a spreadsheet: customers, aircraft/vehicles/boats, or services and prices.
// Pick a CSV, check the columns Tarmo matched, preview, import. Duplicates are skipped.
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Platform, View } from 'react-native';
import { Button, Card, ErrorBanner, Row, Screen, Section, Segmented, Select, T } from '../../components/ui';
import { canAdmin } from '../../lib/plans';
import { useOrg } from '../../lib/session';
import { chunk, guessColumns, IMPORT_FIELDS, type ImportKind, mapRows, missingRequired, parseCsv } from '../../lib/spreadsheetImport';
import { friendlyError, must, supabase } from '../../lib/supabase';
import { colors, space } from '../../lib/theme';

const KINDS: { value: ImportKind; label: string; hint: string }[] = [
  { value: 'customers', label: 'Customers', hint: 'Names, companies, emails, phones and addresses.' },
  { value: 'assets', label: 'Aircraft, vehicles & boats', hint: 'Tail numbers, plates or boat names, make, model and owner. US aircraft are filled in from the FAA registry.' },
  { value: 'services', label: 'Services & prices', hint: 'Service names and prices. A service with the same name gets the new price.' },
];
const RPC: Record<ImportKind, string> = { customers: 'import_customers', assets: 'import_assets', services: 'import_services' };

type Result = Record<string, number>;

export default function Import() {
  const params = useLocalSearchParams<{ kind?: ImportKind }>();
  const { orgId, role } = useOrg();
  const [kind, setKind] = useState<ImportKind>(params.kind && RPC[params.kind] ? params.kind : 'customers');
  const [fileName, setFileName] = useState<string | null>(null);
  const [table, setTable] = useState<string[][] | null>(null);
  const [columns, setColumns] = useState<Record<string, number | null>>({});
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const manager = role === 'owner' || role === 'admin' || role === 'manager';

  const headers = table?.[0] ?? [];
  const rows = useMemo(() => (table ? mapRows(kind, table.slice(1), columns) : []), [table, kind, columns]);
  const unusable = missingRequired(kind, rows);
  const fields = IMPORT_FIELDS[kind];

  const pick = async () => {
    setError(null);
    setResult(null);
    try {
      const r = await DocumentPicker.getDocumentAsync({ type: ['text/csv', 'text/comma-separated-values', 'text/plain', 'application/vnd.ms-excel', '*/*'], copyToCacheDirectory: true, multiple: false });
      if (r.canceled || !r.assets?.[0]) return;
      const a = r.assets[0];
      if (/\.(xlsx|xls|numbers)$/i.test(a.name)) {
        setError('That’s an Excel or Numbers file. Open it and choose File → Save As (or Download) → CSV, then pick the CSV here.');
        return;
      }
      const text = Platform.OS === 'web' && (a as any).file ? await (a as any).file.text() : await new File(a.uri).text();
      const parsed = parseCsv(text);
      if (parsed.length < 2) { setError('That file has no rows to import. Make sure the first row has column names.'); return; }
      if (parsed.length > 5001) { setError('That file has more than 5,000 rows. Split it into smaller files and import each.'); return; }
      setFileName(a.name);
      setTable(parsed);
      setColumns(guessColumns(kind, parsed[0]));
    } catch (e: any) { setError(friendlyError(e.message)); }
  };

  const changeKind = (k: ImportKind) => {
    setKind(k);
    setResult(null);
    if (table) setColumns(guessColumns(k, table[0]));
  };

  const run = async () => {
    setBusy(true);
    setError(null);
    setResult(null);
    const total: Result = {};
    try {
      const batches = chunk(rows, 400);
      for (let i = 0; i < batches.length; i++) {
        setProgress(`Importing ${Math.min((i + 1) * 400, rows.length).toLocaleString('en-US')} of ${rows.length.toLocaleString('en-US')}…`);
        const r = (await must(supabase.rpc(RPC[kind], { p_org: orgId, p_rows: batches[i] }))) as Result;
        for (const [k, v] of Object.entries(r)) total[k] = (total[k] ?? 0) + Number(v);
      }
      setResult(total);
    } catch (e: any) {
      setError(friendlyError(e.message));
      if (Object.keys(total).length) setResult(total);
    } finally { setBusy(false); setProgress(null); }
  };

  if (!manager || (kind === 'services' && !canAdmin(role))) {
    return (
      <Screen>
        <Stack.Screen options={{ title: 'Import' }} />
        <Card><T variant="muted">Only owners, admins and managers can import. Ask your owner to import your records.</T></Card>
      </Screen>
    );
  }

  const summary = result ? [
    result.added ? `${result.added} added` : null,
    result.updated ? `${result.updated} prices updated` : null,
    result.skipped ? `${result.skipped} already in Tarmo (skipped)` : null,
    result.invalid ? `${result.invalid} missing a name, identifier or price (skipped)` : null,
    result.faa_filled ? `${result.faa_filled} filled in from the FAA registry` : null,
    result.owners_added ? `${result.owners_added} new owners added as customers` : null,
  ].filter(Boolean).join(' · ') : null;

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Import from a spreadsheet' }} />
      <Section title="1 · What are you importing?">
        <Segmented value={kind} onChange={changeKind} options={KINDS.map((k) => ({ value: k.value, label: k.label }))} />
        <T variant="muted">{KINDS.find((k) => k.value === kind)!.hint}</T>
      </Section>

      <Section title="2 · Choose the file">
        <Card>
          <T variant="muted" style={{ marginBottom: space.md }}>
            Export a CSV from your current software (Fieldd, Jobber, Housecall Pro, Shiny Jets, QuickBooks…) or save your spreadsheet as CSV.
            The first row should have column names.
          </T>
          <Button icon="document-attach-outline" title={fileName ? `Choose a different file (${fileName})` : 'Choose CSV file'} onPress={pick} disabled={busy} />
        </Card>
      </Section>

      <ErrorBanner message={error} />

      {table ? (
        <>
          <Section title="3 · Check the columns">
            <Card>
              <T variant="muted" style={{ marginBottom: space.sm }}>Tarmo matched these columns. Change any that are wrong.</T>
              {fields.map((f) => (
                <Select key={f.key} label={`${f.label}${f.required ? ' *' : ''}`} allowClear placeholder="Not in this file"
                  value={columns[f.key] == null ? null : String(columns[f.key])}
                  options={headers.map((h, i) => ({ value: String(i), label: h || `Column ${i + 1}` }))}
                  onChange={(v) => setColumns((c) => ({ ...c, [f.key]: v == null ? null : Number(v) }))} />
              ))}
            </Card>
          </Section>

          <Section title={`4 · Preview · ${rows.length.toLocaleString('en-US')} rows`}>
            <Card>
              {rows.slice(0, 5).map((r, i) => (
                <View key={i} style={{ paddingVertical: 6, borderTopWidth: i ? 1 : 0, borderTopColor: colors.border }}>
                  <T style={{ fontWeight: '600' }} numberOfLines={1}>{r.name ?? r.tail ?? r.company ?? '(no name)'}{r.price ? ` · $${r.price.replace(/^\$/, '')}` : ''}</T>
                  <T variant="small" numberOfLines={1}>{Object.entries(r).filter(([k]) => !['name', 'tail', 'price'].includes(k)).map(([, v]) => v).join(' · ') || '—'}</T>
                </View>
              ))}
              {rows.length > 5 ? <T variant="small" style={{ marginTop: space.xs }}>…and {(rows.length - 5).toLocaleString('en-US')} more</T> : null}
              {unusable ? <T variant="small" style={{ color: colors.warning, marginTop: space.sm }}>{unusable} row{unusable === 1 ? '' : 's'} will be skipped: no {kind === 'services' ? 'name or price' : kind === 'assets' ? 'identifier' : 'name'}.</T> : null}
              <T variant="small" style={{ marginTop: space.xs }}>Anything already in Tarmo is skipped, so it’s safe to import the same file twice.</T>
            </Card>
          </Section>

          <Button icon="cloud-upload-outline" title={busy ? progress ?? 'Importing…' : `Import ${rows.length.toLocaleString('en-US')} rows`} onPress={run} loading={busy}
            disabled={rows.length === 0 || fields.some((f) => f.required && columns[f.key] == null && !(kind === 'customers' && f.key === 'name' && (columns.first != null || columns.company != null)))} />
        </>
      ) : null}

      {summary ? (
        <Card style={{ marginTop: space.md, backgroundColor: colors.successSoft }}>
          <T style={{ fontWeight: '700' }}>Import finished</T>
          <T variant="small" style={{ marginTop: 2 }}>{summary}</T>
          <Row style={{ flexWrap: 'wrap', marginTop: space.sm }} gap={space.sm}>
            <Button small title={kind === 'customers' ? 'See customers' : kind === 'assets' ? 'See assets' : 'See services'}
              onPress={() => router.push(kind === 'customers' ? '/customers' : kind === 'assets' ? '/aircraft' : '/services')} />
            <Button small kind="secondary" title="Import another file" onPress={() => { setTable(null); setFileName(null); setResult(null); }} />
          </Row>
        </Card>
      ) : null}
    </Screen>
  );
}

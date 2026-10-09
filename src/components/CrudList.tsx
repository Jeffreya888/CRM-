import { Stack } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { FlatList, View } from 'react-native';
import { FormSheet, type FieldDef, type FormValues } from './FormSheet';
import { EmptyState, ErrorBanner, Fab, SearchBar, type IconName } from './ui';
import { useOrg } from '../lib/session';
import { supabase } from '../lib/supabase';
import { colors, space } from '../lib/theme';
import { useQuery } from '../lib/useQuery';

/**
 * Generic list + modal form over one table. Covers locations, expenses,
 * tasks, equipment, inventory, reminders and pipeline.
 */
export function CrudList<Row extends { id: string }>({
  title,
  table,
  select = '*',
  order,
  filter,
  fields,
  defaults,
  renderRow,
  searchKeys,
  header,
  emptyIcon = 'file-tray-outline',
  emptyTitle,
  emptyBody,
  canWrite = true,
  canDelete = true,
  toRow,
  deps = [],
}: {
  title: string;
  table: string;
  select?: string;
  order: { column: string; ascending?: boolean }[];
  filter?: (q: any) => any;
  fields: FieldDef[];
  defaults?: FormValues | (() => FormValues);
  renderRow: (row: Row, edit: () => void, reload: () => void) => ReactNode;
  searchKeys?: (row: Row) => (string | null | undefined)[];
  header?: (rows: Row[]) => ReactNode;
  emptyIcon?: IconName;
  emptyTitle: string;
  emptyBody?: string;
  canWrite?: boolean;
  canDelete?: boolean;
  /** Transform form values before insert/update. */
  toRow?: (v: FormValues, existing?: Row) => FormValues;
  deps?: unknown[];
}) {
  const { orgId } = useOrg();
  const [sheet, setSheet] = useState<{ open: boolean; row?: Row }>({ open: false });
  const [search, setSearch] = useState('');

  const q = useQuery(async () => {
    let query = supabase.from(table).select(select).eq('org_id', orgId);
    for (const o of order) query = query.order(o.column, { ascending: o.ascending ?? true, nullsFirst: false });
    if (filter) query = filter(query);
    const { data, error } = await query.limit(500);
    if (error) throw error;
    return (data ?? []) as unknown as Row[];
  }, [orgId, ...deps]);

  const s = search.toLowerCase();
  const rows = (q.data ?? []).filter((r) => !s || !searchKeys || searchKeys(r).some((x) => x?.toLowerCase().includes(s)));
  const edit = (row?: Row) => canWrite && setSheet({ open: true, row });
  const initial = sheet.row ?? (typeof defaults === 'function' ? defaults() : defaults);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Stack.Screen options={{ title }} />
      <FlatList
        data={rows}
        keyExtractor={(r) => r.id}
        refreshing={q.refreshing}
        onRefresh={q.refresh}
        ListHeaderComponent={
          <View style={{ padding: space.lg, paddingBottom: 0 }}>
            {searchKeys ? <SearchBar value={search} onChange={setSearch} /> : null}
            <ErrorBanner message={q.error} />
            {header?.(q.data ?? [])}
          </View>
        }
        renderItem={({ item }) => <>{renderRow(item, () => edit(item), q.reload)}</>}
        ListEmptyComponent={q.loading ? null : <EmptyState icon={emptyIcon} title={emptyTitle} body={emptyBody} />}
        contentContainerStyle={{ paddingBottom: 96 }}
      />
      {canWrite ? <Fab onPress={() => edit()} label={`New ${title}`} /> : null}
      <FormSheet
        visible={sheet.open}
        title={sheet.row ? 'Edit' : 'New'}
        fields={fields}
        initial={initial}
        onClose={() => setSheet({ open: false })}
        onSubmit={async (v) => {
          const row = toRow ? toRow(v, sheet.row) : v;
          const { error } = sheet.row
            ? await supabase.from(table).update(row).eq('id', sheet.row.id)
            : await supabase.from(table).insert({ ...row, org_id: orgId });
          if (error) throw error;
          q.reload();
        }}
        onDelete={sheet.row && canDelete ? async () => {
          const { error } = await supabase.from(table).delete().eq('id', sheet.row!.id);
          if (error) throw error;
          q.reload();
        } : undefined}
      />
    </View>
  );
}

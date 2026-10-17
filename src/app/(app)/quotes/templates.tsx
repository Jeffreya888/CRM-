import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { FlatList, View } from 'react-native';
import { FormSheet } from '../../../components/FormSheet';
import type { TemplateContent } from '../../../components/quotes/quoteUtils';
import { Badge, Button, EmptyState, ErrorBanner, ListRow, T } from '../../../components/ui';
import { money, titleCase } from '../../../lib/format';
import { useLookups } from '../../../lib/lookups';
import { useOrg } from '../../../lib/session';
import { friendlyError, supabase } from '../../../lib/supabase';
import { colors, space } from '../../../lib/theme';
import { useQuery } from '../../../lib/useQuery';

interface Template { id: string; name: string; asset_type: string; content: TemplateContent; created_at: string }

const summary = (c: TemplateContent) => {
  const opts = c.options ?? [];
  const totals = opts.map((o) => (o.items ?? []).reduce((s, i) => s + Number(i.quantity || 1) * Number(i.unit_price || 0), 0));
  if (opts.length > 1) return `${opts.map((o) => o.name).join(' / ')} · ${money(Math.min(...totals))}–${money(Math.max(...totals))}`;
  const n = opts[0]?.items?.length ?? 0;
  return `${n} line${n === 1 ? '' : 's'} · ${money(totals[0] ?? 0)} before tax`;
};

/** Saved quote templates: rename, edit notes/terms, delete, or start a quote from one. */
export default function QuoteTemplates() {
  const { orgId, perm, businessTypes } = useOrg();
  const lk = useLookups();
  const [editing, setEditing] = useState<Template | null>(null);
  const [using, setUsing] = useState<Template | null>(null);
  const [error, setError] = useState<string | null>(null);
  const allowed = perm('see_prices');

  const q = useQuery(async () => {
    if (!allowed) return [] as Template[];
    const { data, error: e } = await supabase.from('quote_templates').select('id, name, asset_type, content, created_at').eq('org_id', orgId).order('name');
    if (e) throw e;
    return (data ?? []) as Template[];
  }, [orgId, allowed]);

  if (!allowed) return <View style={{ flex: 1, backgroundColor: colors.bg }}><Stack.Screen options={{ title: 'Quote templates' }} /><EmptyState icon="lock-closed-outline" title="Templates are hidden for your role" /></View>;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Stack.Screen options={{ title: 'Quote templates' }} />
      <FlatList
        data={q.data ?? []}
        keyExtractor={(t) => t.id}
        refreshing={q.refreshing}
        onRefresh={q.refresh}
        ListHeaderComponent={
          <View style={{ padding: space.lg, paddingBottom: space.sm }}>
            <T variant="muted">Build a quote once, then tap &quot;Save as template&quot; in the quote editor. Start new quotes from a template here or from the New quote screen.</T>
            <ErrorBanner message={q.error ?? error} onRetry={q.reload} />
          </View>
        }
        renderItem={({ item: t }) => (
          <ListRow
            icon="bookmark-outline"
            title={t.name}
            subtitle={summary(t.content)}
            meta={businessTypes.length > 1 ? titleCase(t.asset_type) : null}
            right={(t.content.options?.length ?? 0) > 1 ? <Badge label="Packages" tone="purple" raw /> : undefined}
            onPress={() => setEditing(t)}
          />
        )}
        ListEmptyComponent={q.loading ? null : (
          <EmptyState icon="bookmarks-outline" title="No templates yet" body="Open any quote you send often, tap the bookmark icon and save it as a template."
            action={<Button title="New quote" icon="add" onPress={() => router.push('/quotes/edit')} />} />
        )}
        contentContainerStyle={{ paddingBottom: 96 }}
      />

      <FormSheet
        visible={!!editing}
        title="Edit template"
        initial={editing ? { name: editing.name, notes: editing.content.notes ?? '', terms: editing.content.terms ?? '', use: false } : {}}
        fields={[
          { key: 'name', label: 'Template name', type: 'text', required: true },
          { key: 'notes', label: 'Notes to customer', type: 'multiline' },
          { key: 'terms', label: 'Terms', type: 'multiline' },
          { key: 'use', label: 'Start a new quote from this template after saving', type: 'toggle' },
        ]}
        onClose={() => setEditing(null)}
        onSubmit={async (v) => {
          if (!editing) return;
          const content = { ...editing.content, notes: v.notes, terms: v.terms };
          const { error: e } = await supabase.from('quote_templates').update({ name: v.name, content }).eq('id', editing.id);
          if (e) throw e;
          const t = editing;
          q.reload();
          if (v.use) setTimeout(() => setUsing(t), 350);
        }}
        onDelete={editing ? async () => {
          const { error: e } = await supabase.from('quote_templates').delete().eq('id', editing.id);
          if (e) throw e;
          q.reload();
        } : undefined}
      />

      <FormSheet
        visible={!!using}
        title="New quote from template"
        initial={{}}
        fields={[
          { key: 'customer_id', label: 'Customer', type: 'select', options: lk.customerOptions, required: true },
          { key: 'aircraft_id', label: 'Aircraft, vehicle or boat (optional)', type: 'select', options: lk.aircraftOptions(), allowClear: true },
        ]}
        onClose={() => setUsing(null)}
        onSubmit={async (v) => {
          if (!using) return;
          setError(null);
          const asset = lk.aircraft.find((a) => a.id === v.aircraft_id);
          if (asset && asset.customer_id && asset.customer_id !== v.customer_id) throw new Error('That asset belongs to a different customer.');
          const { data, error: e } = await supabase.rpc('quote_from_template', { p_template: using.id, p_customer: v.customer_id, p_aircraft: v.aircraft_id ?? null });
          if (e) throw new Error(friendlyError(e.message));
          router.push({ pathname: '/quotes/edit', params: { id: data as string } });
        }}
      />
    </View>
  );
}

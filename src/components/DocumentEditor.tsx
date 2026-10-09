import { router, Stack } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { FormFields, type FieldDef, type FormValues } from './FormSheet';
import { LineItemsEditor } from './LineItemsEditor';
import { Button, ErrorBanner, Loading, Screen, Section } from './ui';
import { useLookups } from '../lib/lookups';
import { useOrg } from '../lib/session';
import { friendlyError, supabase } from '../lib/supabase';
import type { LineItem } from '../lib/types';

/**
 * Shared editor for quotes and invoices: header fields + priced line items.
 * Line items are replaced wholesale on save; DB triggers recompute totals.
 */
export function DocumentEditor({ kind, id, defaults }: { kind: 'quote' | 'invoice'; id?: string; defaults: FormValues }) {
  const { org, orgId, session } = useOrg();
  const lk = useLookups();
  const table = kind === 'quote' ? 'quotes' : 'invoices';
  const itemsTable = kind === 'quote' ? 'quote_items' : 'invoice_items';
  const fk = kind === 'quote' ? 'quote_id' : 'invoice_id';
  const [values, setValues] = useState<FormValues | null>(id ? null : defaults);
  const [items, setItems] = useState<LineItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    Promise.all([
      supabase.from(table).select('*').eq('id', id).single(),
      supabase.from(itemsTable).select('*').eq(fk, id).order('sort_order'),
    ]).then(([d, i]) => {
      setValues(d.data);
      setItems((i.data ?? []).map((x: any) => ({ ...x, quantity: Number(x.quantity), unit_price: Number(x.unit_price) })));
    });
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Apply customer tax exemption / discount when the customer changes on a new document.
  const customer = lk.customers.find((c) => c.id === values?.customer_id);
  useEffect(() => {
    if (id || !customer || !values) return;
    setValues((v) => ({ ...v!, tax_rate: customer.tax_exempt ? 0 : org.tax_rate }));
  }, [customer?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const aircraft = useMemo(() => lk.aircraft.find((a) => a.id === values?.aircraft_id) ?? null, [lk.aircraft, values?.aircraft_id]);

  if (!values || lk.loading) return <Loading />;

  const fields: FieldDef[] = [
    { key: 'customer_id', label: 'Customer', type: 'select', options: lk.customerOptions, required: true },
    { key: 'aircraft_id', label: 'Aircraft', type: 'select', options: lk.aircraftOptions(values.customer_id), allowClear: true },
    ...(kind === 'quote' ? [{ key: 'location_id', label: 'Location', type: 'select', options: lk.locationOptions, allowClear: true } as FieldDef] : []),
    { key: 'issue_date', label: 'Date', type: 'date', required: true },
    kind === 'quote' ? { key: 'valid_until', label: 'Valid until', type: 'date', required: true } : { key: 'due_date', label: 'Due date', type: 'date', required: true },
  ];

  const save = async () => {
    setError(null);
    if (!values.customer_id) return setError('Choose a customer');
    if (!items.length) return setError('Add at least one line item');
    if (items.some((i) => !i.description.trim())) return setError('Every line needs a description');
    try {
      const header: FormValues = {
        customer_id: values.customer_id, aircraft_id: values.aircraft_id ?? null, issue_date: values.issue_date,
        discount: Number(values.discount) || 0, tax_rate: Number(values.tax_rate) || 0, notes: values.notes ?? null,
      };
      if (kind === 'quote') Object.assign(header, { valid_until: values.valid_until, location_id: values.location_id ?? null, terms: values.terms ?? null });
      else header.due_date = values.due_date;

      let docId = id;
      if (id) {
        const { error } = await supabase.from(table).update(header).eq('id', id);
        if (error) throw error;
        const { error: delErr } = await supabase.from(itemsTable).delete().eq(fk, id);
        if (delErr) throw delErr;
      } else {
        const { data: number, error: nErr } = await supabase.rpc('next_number', { p_org: orgId, p_kind: kind });
        if (nErr) throw nErr;
        const { data, error } = await supabase.from(table).insert({ ...header, org_id: orgId, number, created_by: session!.user.id }).select('id').single();
        if (error) throw error;
        docId = data.id;
      }
      const rows = items.map((i, n) => ({
        org_id: orgId, [fk]: docId, service_id: i.service_id, description: i.description.trim(),
        quantity: i.quantity || 1, unit_price: i.unit_price || 0, taxable: i.taxable, sort_order: n + 1,
      }));
      const { error: iErr } = await supabase.from(itemsTable).insert(rows);
      if (iErr) throw iErr;
      router.replace(`/${table}/${docId}`);
    } catch (e: any) {
      setError(friendlyError(e.message));
    }
  };

  const title = kind === 'quote' ? (id ? 'Edit quote' : 'New quote') : (id ? 'Edit invoice' : 'New invoice');
  return (
    <Screen footer={<Button title={id ? 'Save' : `Create ${kind}`} onPress={save} />}>
      <Stack.Screen options={{ title }} />
      <ErrorBanner message={error} />
      <FormFields fields={fields} values={values} setValue={(k, v) => setValues((s) => ({ ...s!, [k]: v, ...(k === 'customer_id' ? { aircraft_id: null } : {}) }))} />
      <Section title="Services">
        <LineItemsEditor
          items={items}
          onChange={setItems}
          services={lk.services}
          aircraft={aircraft}
          discount={Number(values.discount) || 0}
          onDiscount={(d) => setValues((s) => ({ ...s!, discount: d }))}
          taxRate={Number(values.tax_rate) || 0}
          currency={org.currency}
        />
      </Section>
      <Section title="Notes">
        <FormFields
          fields={[
            { key: 'tax_rate_pct', label: 'Tax rate (%)', type: 'number' },
            { key: 'notes', label: kind === 'quote' ? 'Notes to customer' : 'Invoice notes', type: 'multiline' },
            ...(kind === 'quote' ? [{ key: 'terms', label: 'Terms', type: 'multiline' } as FieldDef] : []),
          ]}
          values={{ ...values, tax_rate_pct: values.tax_rate_pct ?? String(+(Number(values.tax_rate) * 100).toFixed(4)) }}
          setValue={(k, v) => setValues((s) => (k === 'tax_rate_pct' ? { ...s!, tax_rate_pct: v, tax_rate: (Number(v) || 0) / 100 } : { ...s!, [k]: v }))}
        />
      </Section>
    </Screen>
  );
}

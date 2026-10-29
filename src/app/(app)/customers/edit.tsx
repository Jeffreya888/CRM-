import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { FormFields, normalize, validate, type FieldDef, type FormValues } from '../../../components/FormSheet';
import { Button, Card, ErrorBanner, KeyValue, Loading, Screen, Section, T } from '../../../components/ui';
import { CUSTOMER_KINDS } from '../../../lib/assets';
import { geocode } from '../../../lib/geo';
import { useLookups } from '../../../lib/lookups';
import { useOrg } from '../../../lib/session';
import { friendlyError, supabase } from '../../../lib/supabase';
import { space } from '../../../lib/theme';

export default function CustomerEdit() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { orgId, session, perm } = useOrg();
  const { locationOptions } = useLookups();
  const money$ = perm('see_prices');
  const discounts = perm('give_discounts');
  const [values, setValues] = useState<FormValues | null>(id ? null : { kind: 'owner', status: 'active', tax_exempt: false, discount_pct: '' });
  const [error, setError] = useState<string | null>(null);
  const [initialAddress, setInitialAddress] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    supabase.from('customers').select('*').eq('id', id).single().then(({ data, error: e }) => {
      if (e) setError(friendlyError(e.message));
      else {
        setValues({ ...data, tags: (data?.tags ?? []).join(', ') });
        setInitialAddress(data?.service_address ?? null);
      }
    });
  }, [id]);

  const contactFields: FieldDef[] = [
    { key: 'name', label: 'Name', type: 'text', required: true, placeholder: 'Person or company name' },
    { key: 'company', label: 'Company', type: 'text' },
    { key: 'kind', label: 'Customer type', type: 'select', options: CUSTOMER_KINDS },
    { key: 'status', label: 'Status', type: 'select', options: [{ value: 'lead', label: 'Lead' }, { value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }] },
    { key: 'email', label: 'Email', type: 'email' },
    { key: 'phone', label: 'Phone', type: 'phone' },
    { key: 'service_address', label: 'Service address', type: 'text', placeholder: 'Where mobile crews go: home, office, marina slip', hint: 'Used for directions, travel fees and the route.' },
    { key: 'billing_address', label: 'Billing address', type: 'multiline' },
    { key: 'preferred_location_id', label: 'Preferred facility', type: 'select', options: locationOptions, allowClear: true },
    { key: 'source', label: 'How they found you', type: 'text', placeholder: 'Referral, FBO, website, trade show…' },
    { key: 'tags', label: 'Tags', type: 'text', placeholder: 'Comma separated, e.g. VIP, monthly' },
    { key: 'notes', label: 'Notes', type: 'multiline' },
  ];
  const billingFields: FieldDef[] = [
    ...(money$ ? [{ key: 'payment_terms_days', label: 'Payment terms (days)', type: 'number', hint: 'e.g. 30 for net 30. Leave blank for your company default.' } as FieldDef] : []),
    ...(money$ && discounts ? [{ key: 'discount_pct', label: 'Standing discount (%)', type: 'number', hint: 'Applied automatically to new quotes and invoices.' } as FieldDef] : []),
    { key: 'tax_exempt', label: 'Tax exempt', type: 'toggle', hint: 'No sales tax on their quotes and invoices.' },
  ];
  const fields = [...contactFields, ...billingFields];

  if (!values) return <Screen><Stack.Screen options={{ title: 'Edit customer' }} />{error ? <ErrorBanner message={error} /> : <Loading />}</Screen>;

  if (!perm('edit_customers')) {
    return <Screen><Stack.Screen options={{ title: 'Edit customer' }} /><ErrorBanner message="You don't have permission to edit customers." /></Screen>;
  }

  const save = async () => {
    const msg = validate(fields, values);
    if (msg) return setError(msg);
    if (values.email && !/\S+@\S+\.\S+/.test(String(values.email))) return setError('Check the email address');
    const row = normalize(fields, values);
    row.tags = String(values.tags ?? '').split(',').map((t) => t.trim()).filter(Boolean);
    if ('discount_pct' in row) {
      row.discount_pct = row.discount_pct ?? 0;
      if (row.discount_pct < 0 || row.discount_pct > 100) return setError('Discount must be between 0 and 100');
    }
    if (row.payment_terms_days != null && (row.payment_terms_days < 0 || row.payment_terms_days > 365)) return setError('Payment terms must be 0–365 days');
    // Map point for travel fees and routes (US addresses; skipped if lookup is unavailable).
    const addr = String(row.service_address ?? '').trim();
    if (addr !== String(initialAddress ?? '').trim()) {
      row.service_lat = null;
      row.service_lng = null;
      if (addr) {
        const p = await geocode(addr).catch(() => null);
        if (p) { row.service_lat = p.lat; row.service_lng = p.lng; }
      }
    }
    try {
      if (id) {
        const { error: e } = await supabase.from('customers').update(row).eq('id', id);
        if (e) throw e;
        router.back();
      } else {
        const { data, error: e } = await supabase.from('customers').insert({ ...row, org_id: orgId, created_by: session!.user.id }).select('id').single();
        if (e) throw e;
        router.replace(`/customers/${data.id}`);
      }
    } catch (e: any) {
      setError(friendlyError(e.message));
    }
  };

  const setValue = (k: string, v: any) => setValues((s) => ({ ...s!, [k]: v }));

  return (
    <Screen footer={<Button title={id ? 'Save changes' : 'Create customer'} onPress={save} />}>
      <Stack.Screen options={{ title: id ? 'Edit customer' : 'New customer' }} />
      <ErrorBanner message={error} />
      <FormFields fields={contactFields} values={values} setValue={setValue} />
      <Section title="Billing">
        <FormFields fields={billingFields} values={values} setValue={setValue} />
        {money$ && !discounts && Number(values.discount_pct) ? (
          <Card style={{ marginBottom: space.md }}>
            <KeyValue label="Discount" value={`${values.discount_pct}%`} />
            <T variant="small">Only people allowed to give discounts can change this.</T>
          </Card>
        ) : null}
      </Section>
      <T variant="small">Texting consent, automatic messages and portal access are on the customer page.</T>
    </Screen>
  );
}

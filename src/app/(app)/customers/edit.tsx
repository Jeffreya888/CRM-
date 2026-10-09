import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { FormFields, normalize, validate, type FieldDef, type FormValues } from '../../../components/FormSheet';
import { Button, ErrorBanner, Loading, Screen } from '../../../components/ui';
import { useLookups } from '../../../lib/lookups';
import { PLANS } from '../../../lib/plans';
import { useOrg } from '../../../lib/session';
import { friendlyError, supabase } from '../../../lib/supabase';

const KINDS = [
  ['owner', 'Aircraft owner'], ['management_company', 'Management company'], ['charter', 'Charter operator'], ['flight_school', 'Flight school'],
  ['fbo', 'FBO'], ['corporate', 'Corporate flight dept.'], ['government', 'Government / military'], ['other', 'Other'],
].map(([value, label]) => ({ value, label }));

export default function CustomerEdit() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { orgId, plan, session } = useOrg();
  const { locationOptions } = useLookups();
  const [values, setValues] = useState<FormValues | null>(id ? null : { kind: 'owner', status: 'active', tax_exempt: false, discount_pct: '' });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    supabase.from('customers').select('*').eq('id', id).single().then(({ data }) => setValues({ ...data, tags: (data?.tags ?? []).join(', ') }));
  }, [id]);

  const fields: FieldDef[] = [
    { key: 'name', label: 'Name', type: 'text', required: true, placeholder: 'Person or company name' },
    { key: 'company', label: 'Company', type: 'text' },
    { key: 'kind', label: 'Customer type', type: 'select', options: KINDS },
    { key: 'status', label: 'Status', type: 'select', options: [{ value: 'lead', label: 'Lead' }, { value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }] },
    { key: 'email', label: 'Email', type: 'email' },
    { key: 'phone', label: 'Phone', type: 'phone' },
    { key: 'billing_address', label: 'Billing address', type: 'multiline' },
    { key: 'preferred_location_id', label: 'Usual airport / FBO', type: 'select', options: locationOptions, allowClear: true },
    { key: 'source', label: 'Lead source', type: 'text', placeholder: 'Referral, FBO, website, trade show…' },
    { key: 'tags', label: 'Tags', type: 'text', placeholder: 'Comma separated, e.g. VIP, monthly' },
    { key: 'payment_terms_days', label: 'Payment terms (days)', type: 'number', hint: 'Leave blank for company default' },
    { key: 'discount_pct', label: 'Standing discount (%)', type: 'number' },
    { key: 'tax_exempt', label: 'Tax exempt', type: 'toggle' },
    { key: 'notes', label: 'Notes', type: 'multiline' },
  ];

  if (!values) return <Loading />;

  const save = async () => {
    const msg = validate(fields, values);
    if (msg) return setError(msg);
    const row = normalize(fields, values);
    row.tags = String(values.tags ?? '').split(',').map((t) => t.trim()).filter(Boolean);
    row.discount_pct = row.discount_pct ?? 0;
    try {
      if (id) {
        const { error } = await supabase.from('customers').update(row).eq('id', id);
        if (error) throw error;
        router.back();
      } else {
        const limit = PLANS.find((p) => p.id === plan)?.customerLimit;
        if (limit) {
          const { count } = await supabase.from('customers').select('id', { count: 'exact', head: true }).eq('org_id', orgId);
          if ((count ?? 0) >= limit) {
            setError(`Your plan includes ${limit} customers. Upgrade for unlimited.`);
            router.push('/paywall');
            return;
          }
        }
        const { data, error } = await supabase.from('customers').insert({ ...row, org_id: orgId, created_by: session!.user.id }).select('id').single();
        if (error) throw error;
        router.replace(`/customers/${data.id}`);
      }
    } catch (e: any) {
      setError(friendlyError(e.message));
    }
  };

  return (
    <Screen footer={<Button title={id ? 'Save changes' : 'Create customer'} onPress={save} />}>
      <Stack.Screen options={{ title: id ? 'Edit customer' : 'New customer' }} />
      <ErrorBanner message={error} />
      <FormFields fields={fields} values={values} setValue={(k, v) => setValues((s) => ({ ...s!, [k]: v }))} />
    </Screen>
  );
}

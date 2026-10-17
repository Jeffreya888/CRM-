import { router } from 'expo-router';
import { useState } from 'react';
import { TextInput, View } from 'react-native';
import { Avatar, Button, ErrorBanner, Row, T } from '../ui';
import { initials, money } from '../../lib/format';
import { friendlyError, must, supabase } from '../../lib/supabase';
import { colors, radius, space } from '../../lib/theme';
import { useQuery } from '../../lib/useQuery';
import type { MemberPay } from '../../lib/types';

type Member = { user_id: string; display_name: string | null; role: string; color: string | null };

/** "Timesheets & labor rates": every active member with an inline-editable hourly rate (owner/admin only). */
export function PayRatesPanel({ orgId, onChanged }: { orgId: string; onChanged?: () => void }) {
  const q = useQuery(async () => {
    const [m, p] = await Promise.all([
      must(supabase.from('memberships').select('user_id, display_name, role, color').eq('org_id', orgId).eq('active', true).order('display_name')),
      must(supabase.from('member_pay').select('*').eq('org_id', orgId)),
    ]);
    return { members: (m ?? []) as Member[], pay: (p ?? []) as MemberPay[] };
  }, [orgId]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);

  const save = async (userId: string) => {
    setError(null);
    const raw = drafts[userId];
    if (raw == null) return;
    const n = raw.trim() === '' ? null : Number(raw.replace(/[^0-9.]/g, ''));
    if (n != null && Number.isNaN(n)) return setError('Enter a number for the hourly rate');
    try {
      await must(supabase.from('member_pay').upsert({ org_id: orgId, user_id: userId, hourly_rate: n, updated_at: new Date().toISOString() }, { onConflict: 'org_id,user_id' }));
      setDrafts((d) => { const x = { ...d }; delete x[userId]; return x; });
      setSavedId(userId);
      q.reload();
      onChanged?.();
    } catch (e: any) { setError(friendlyError(e.message)); }
  };

  const members = q.data?.members ?? [];
  return (
    <View>
      <ErrorBanner message={error ?? q.error} />
      <T variant="muted" style={{ marginBottom: space.md }}>Hourly pay rates turn clocked hours into labor cost. Only owners and admins can see them.</T>
      {members.map((m) => {
        const pay = q.data?.pay.find((p) => p.user_id === m.user_id);
        const val = drafts[m.user_id] ?? (pay?.hourly_rate != null ? String(pay.hourly_rate) : '');
        const dirty = drafts[m.user_id] != null;
        return (
          <Row key={m.user_id} style={{ paddingVertical: 6 }} gap={space.md}>
            <Avatar label={initials(m.display_name)} color={m.color ?? undefined} size={32} />
            <View style={{ flex: 1 }}>
              <T numberOfLines={1} onPress={() => router.push(`/team/${m.user_id}`)}>{m.display_name ?? 'Team member'}</T>
              <T variant="small">{pay?.pay_type && pay.pay_type !== 'hourly' ? pay.pay_type.replace('_', ' ') : m.role}{savedId === m.user_id && !dirty ? ' · saved' : ''}</T>
            </View>
            <Row gap={4} style={{ backgroundColor: colors.input, borderRadius: radius.md, borderWidth: 1, borderColor: val ? colors.border : colors.warning, paddingHorizontal: 10 }}>
              <T variant="muted">$</T>
              <TextInput value={val} onChangeText={(t) => setDrafts((d) => ({ ...d, [m.user_id]: t }))} onBlur={() => dirty && save(m.user_id)}
                placeholder="—" placeholderTextColor={colors.textFaint} keyboardType="decimal-pad" accessibilityLabel={`Hourly rate for ${m.display_name ?? 'member'}`}
                style={{ width: 70, paddingVertical: 8, color: colors.text, fontSize: 16, textAlign: 'right' }} />
              <T variant="small">/h</T>
            </Row>
            {dirty ? <Button small title="Save" onPress={() => save(m.user_id)} /> : null}
          </Row>
        );
      })}
      {members.some((m) => q.data?.pay.find((p) => p.user_id === m.user_id)?.hourly_rate == null)
        ? <T variant="small" style={{ marginTop: space.sm, color: colors.warning }}>People without a rate show labor cost as “Unknown”.</T>
        : members.length ? <T variant="small" style={{ marginTop: space.sm }}>Average {money(avg(q.data?.pay ?? []))}/h</T> : null}
    </View>
  );
}

const avg = (p: MemberPay[]) => { const r = p.filter((x) => x.hourly_rate != null); return r.length ? r.reduce((s, x) => s + Number(x.hourly_rate), 0) / r.length : 0; };

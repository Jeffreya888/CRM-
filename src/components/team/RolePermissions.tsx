import { useState } from 'react';
import { Switch, View } from 'react-native';
import { Card, ErrorBanner, Row, Segmented, T } from '../ui';
import { DEFAULT_PERMISSIONS, PERMISSIONS, type Permission, type RolePermissions as Perms } from '../../lib/plans';
import { friendlyError, must, supabase } from '../../lib/supabase';
import { colors, space } from '../../lib/theme';
import { ROLE_INFO } from './constants';

type Editable = 'manager' | 'technician';

/** Role descriptions + owner-only permission toggles for managers and technicians. */
export function RolePermissions({ orgId, current, isOwner, onSaved }: { orgId: string; current: Perms | null | undefined; isOwner: boolean; onSaved: () => Promise<void> }) {
  const [role, setRole] = useState<Editable>('manager');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [local, setLocal] = useState<Perms | null>(null);
  const perms: Required<Perms> = {
    manager: { ...DEFAULT_PERMISSIONS.manager, ...(current?.manager ?? {}), ...(local?.manager ?? {}) },
    technician: { ...DEFAULT_PERMISSIONS.technician, ...(current?.technician ?? {}), ...(local?.technician ?? {}) },
  };

  const toggle = async (key: Permission, value: boolean) => {
    if (!isOwner) return;
    setError(null);
    const next = { ...perms, [role]: { ...perms[role], [key]: value } };
    setLocal(next);
    setSaving(true);
    try {
      await must(supabase.rpc('set_role_permissions', { p_org: orgId, p_perms: next }));
      await onSaved();
    } catch (e: any) {
      setError(friendlyError(e.message));
      setLocal(null);
    } finally { setSaving(false); }
  };

  return (
    <View>
      <Card style={{ padding: 0, overflow: 'hidden' }}>
        {ROLE_INFO.map((r, i) => (
          <View key={r.value} style={[{ padding: space.lg }, i > 0 && { borderTopWidth: 1, borderTopColor: colors.border }]}>
            <T style={{ fontWeight: '700' }}>{r.label}</T>
            <T variant="muted">{r.hint}</T>
          </View>
        ))}
      </Card>
      <Card>
        <T style={{ fontWeight: '700', marginBottom: space.sm }}>Fine-tune permissions</T>
        {!isOwner ? <T variant="small" style={{ marginBottom: space.md }}>Only the owner can change these.</T> : null}
        <ErrorBanner message={error} />
        <Segmented value={role} onChange={setRole} options={[{ value: 'manager', label: 'Managers' }, { value: 'technician', label: 'Technicians' }]} />
        {PERMISSIONS.map((p) => (
          <Row key={p.key} style={{ justifyContent: 'space-between', paddingVertical: 8 }}>
            <View style={{ flex: 1 }}>
              <T>{p.label}</T>
              <T variant="small">{p.hint}</T>
            </View>
            <Switch value={!!perms[role][p.key]} disabled={!isOwner || saving} onValueChange={(v) => toggle(p.key, v)}
              trackColor={{ true: colors.primary, false: colors.borderStrong }} thumbColor={colors.white} />
          </Row>
        ))}
        <T variant="small" style={{ marginTop: space.sm }}>Owners and admins can always do everything; viewers are always read-only with no money.</T>
      </Card>
    </View>
  );
}

import { useState } from 'react';
import { AuthShell } from '../components/AuthShell';
import { Button, Divider, ErrorBanner, Field, T, ToggleRow } from '../components/ui';
import { useSession } from '../lib/session';
import { friendlyError, supabase } from '../lib/supabase';
import { space } from '../lib/theme';

/** First run: create a company (starts the free trial) or join one with an invite code. */
export default function Onboarding() {
  const { refresh, signOut } = useSession();
  const [name, setName] = useState('');
  const [seed, setSeed] = useState(true);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);

  const create = async () => {
    setError(null);
    const { error } = await supabase.rpc('create_organization', { p_name: name.trim(), p_seed_services: seed });
    if (error) return setError(friendlyError(error.message));
    await refresh();
  };

  const join = async () => {
    setError(null);
    const { error } = await supabase.rpc('accept_invitation', { p_code: code.trim() });
    if (error) return setError(friendlyError(error.message));
    await refresh();
  };

  return (
    <AuthShell title="Set up your company">
      <ErrorBanner message={error} />
      <Field label="Company name" placeholder="e.g. Precision Aircraft Detailing" value={name} onChangeText={setName} />
      <ToggleRow label="Load starter price book" hint="12 common detailing services with per-foot and per-class pricing. Edit anytime." value={seed} onChange={setSeed} />
      <Button title="Create company & start free trial" onPress={create} disabled={name.trim().length < 2} />
      <T variant="small" style={{ marginTop: space.sm, textAlign: 'center' }}>14 days free with every feature. No card required.</T>
      <Divider />
      <T variant="overline" style={{ marginTop: space.md, marginBottom: space.sm }}>Joining a team?</T>
      <Field label="Invite code" placeholder="8-character code" autoCapitalize="characters" value={code} onChangeText={setCode} />
      <Button kind="secondary" title="Join team" onPress={join} disabled={code.trim().length < 6} />
      <Button kind="ghost" title="Sign out" onPress={signOut} style={{ marginTop: space.md }} />
    </AuthShell>
  );
}

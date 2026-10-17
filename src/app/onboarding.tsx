import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { AuthShell } from '../components/AuthShell';
import { BusinessTypePicker, toBusinessTypes } from '../components/security/BusinessTypePicker';
import { Button, Card, Divider, ErrorBanner, Field, IconTile, Row, T, ToggleRow } from '../components/ui';
import { ensureDemoWorkspace } from '../lib/demo';
import { isAnonymous, parseInvite, pendingInvite } from '../lib/security';
import { useSession } from '../lib/session';
import { friendlyError, supabase } from '../lib/supabase';
import { colors, space } from '../lib/theme';
import type { AssetType } from '../lib/types';

/** Builds the demo company for an anonymous (demo) sign-in. */
function DemoSetup() {
  const { refresh, signOut } = useSession();
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const refreshRef = useRef(refresh);
  useEffect(() => { refreshRef.current = refresh; });

  useEffect(() => {
    let alive = true;
    ensureDemoWorkspace()
      .then(() => refreshRef.current())
      .catch((e) => { if (alive) setError(e.message); });
    return () => { alive = false; };
  }, [attempt]);

  return (
    <AuthShell title="Building your demo company" subtitle="Sample customers, aircraft, jobs, quotes and invoices. Private to you.">
      {error ? (
        <>
          <ErrorBanner message={error} />
          <Button title="Try again" onPress={() => { setError(null); setAttempt((a) => a + 1); }} />
        </>
      ) : (
        <View style={{ alignItems: 'center', padding: space.lg }}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      )}
      <Button kind="ghost" title="Exit demo" onPress={signOut} style={{ marginTop: space.md }} />
    </AuthShell>
  );
}

/** First run: create a company (starts the free trial) or join one with an invite. */
export default function Onboarding() {
  const { session } = useSession();
  if (isAnonymous(session)) return <DemoSetup />;
  return <CreateOrJoin />;
}

function CreateOrJoin() {
  const { refresh, signOut, session } = useSession();
  const [name, setName] = useState('');
  const [types, setTypes] = useState<AssetType[]>(() => toBusinessTypes(session?.user.user_metadata?.business_types));
  const [seed, setSeed] = useState(true);
  const [code, setCode] = useState('');
  const [invite, setInvite] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    pendingInvite().then(setInvite);
  }, []);

  const create = async () => {
    setError(null);
    const { error } = await supabase.rpc('create_organization', { p_name: name.trim(), p_seed_services: seed, p_business_types: types });
    if (error) return setError(friendlyError(error.message));
    await refresh();
  };

  return (
    <AuthShell title="Set up your company" subtitle={session?.user.email ? `Signed in as ${session.user.email}` : undefined}>
      <ErrorBanner message={error} />
      {invite ? (
        <Card style={{ backgroundColor: colors.primarySoft, borderColor: colors.primary }}>
          <Row gap={space.md}>
            <IconTile icon="mail-open-outline" />
            <View style={{ flex: 1 }}>
              <T style={{ fontWeight: '700' }}>You have a team invitation</T>
              <T variant="small">Accept it to join your company instead of creating a new one.</T>
            </View>
          </Row>
          <Button style={{ marginTop: space.md }} title="Review invitation" onPress={() => router.push(`/invite/${encodeURIComponent(invite)}`)} />
        </Card>
      ) : null}

      <Field label="Company name" placeholder="e.g. Precision Aircraft Detailing" value={name} onChangeText={setName} icon="business-outline" />
      <T style={{ fontWeight: '600', marginBottom: space.sm }}>What do you detail?</T>
      <BusinessTypePicker value={types} onChange={setTypes} />
      <ToggleRow label="Load starter price book" hint="Common detailing services with size-based pricing for the types you picked. Edit anytime." value={seed} onChange={setSeed} />
      <Button title="Create company & start free trial" onPress={create} disabled={name.trim().length < 2} />
      <T variant="small" style={{ marginTop: space.sm, textAlign: 'center' }}>14 days free with every feature. No card required.</T>

      <Divider />
      <T variant="overline" style={{ marginTop: space.md, marginBottom: space.sm }}>Joining your company?</T>
      <Field label="Invite code or link" placeholder="8-character code from your email" autoCapitalize="none" autoCorrect={false} value={code} onChangeText={setCode} icon="people-outline" />
      <Button kind="secondary" title="Join team" disabled={parseInvite(code).length < 6} onPress={() => router.push(`/invite/${encodeURIComponent(parseInvite(code))}`)} />
      <Button kind="ghost" title="Sign out" onPress={signOut} style={{ marginTop: space.md }} />
    </AuthShell>
  );
}

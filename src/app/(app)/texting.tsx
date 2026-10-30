import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { notify } from '../../components/FormSheet';
import { Gate } from '../../components/Gate';
import { Badge, Button, Card, ErrorBanner, IconTile, Ionicons, Row, Screen, Section, T, ToggleRow } from '../../components/ui';
import { isOwner, PLANS, planInfo } from '../../lib/plans';
import { useOrg } from '../../lib/session';
import { callFunction, friendlyError, must, supabase } from '../../lib/supabase';
import { colors, radius, space, type Tone } from '../../lib/theme';
import { useQuery } from '../../lib/useQuery';

const STATUS: Record<string, { label: string; tone: Tone; body: string }> = {
  not_requested: { label: 'Not requested', tone: 'neutral', body: 'Texting is off. Request a number below whenever you are ready.' },
  pending: { label: 'Pending', tone: 'warning', body: 'We are registering your business with the phone carriers. This usually takes a few business days; we will let you know when it is ready.' },
  active: { label: 'Active', tone: 'success', body: 'Your texting number is ready.' },
  suspended: { label: 'Suspended', tone: 'danger', body: 'Texting is paused for your company. Contact Tarmo support to turn it back on.' },
};

export default function Texting() {
  return (
    <Gate feature="texting">
      <Inner />
    </Gate>
  );
}

function Inner() {
  const { org, orgId, role, plan, refresh } = useOrg();
  const owner = isOwner(role);
  const [error, setError] = useState<string | null>(null);
  const allowance = useQuery(async () => (await must(supabase.rpc('sms_allowance', { p_org: orgId }))) as { included: number; extra: number; used: number }, [orgId]);
  const st = STATUS[org.sms_status] ?? STATUS.not_requested!;
  const a = allowance.data;
  const total = a ? a.included + a.extra : 0;
  const pct = a && total ? Math.min(1, a.used / total) : 0;
  const pi = planInfo(plan);

  const request = async () => {
    setError(null);
    try {
      await callFunction('texting', { action: 'request_number', org_id: orgId });
      await refresh();
      notify('Request sent', 'We will set up your number and carrier registration. You will be notified when texting is ready.');
    } catch (e: any) { setError(friendlyError(e.message ?? String(e))); }
  };
  const toggle = async (v: boolean) => {
    setError(null);
    const { error: e } = await supabase.from('organizations').update({ sms_enabled: v }).eq('id', orgId);
    if (e) setError(friendlyError(e.message)); else await refresh();
  };

  return (
    <Screen refreshing={allowance.refreshing} onRefresh={async () => { await Promise.all([allowance.refresh(), refresh()]); }}>
      <Stack.Screen options={{ title: 'Customer texting' }} />
      <ErrorBanner message={error ?? allowance.error} />

      <Card>
        <Row gap={space.md} style={{ alignItems: 'flex-start' }}>
          <IconTile icon="chatbubbles-outline" />
          <View style={{ flex: 1 }}>
            <T style={{ fontWeight: '700', fontSize: 17 }}>Text your customers</T>
            <T variant="muted">
              Optional and off by default. Send appointment reminders, on-our-way texts, job-complete photos and have two-way conversations, from your own company number.
            </T>
          </View>
        </Row>
        <View style={{ marginTop: space.md, gap: 6 }}>
          {['Run by Tarmo: no Telnyx or phone-company account needed.', 'We handle carrier registration for your business.', 'Customers reply to your number and replies show in the conversation.'].map((t) => (
            <Row key={t} gap={space.sm}><Ionicons name="checkmark-circle" size={16} color={colors.success} /><T variant="muted" style={{ flex: 1 }}>{t}</T></Row>
          ))}
        </View>
      </Card>

      <Section title="Status" icon="pulse-outline" action={<Badge label={st.label} tone={st.tone} raw />}>
        <Card>
          <T variant="muted">{st.body}</T>
          {org.sms_status === 'active' && org.sms_number ? (
            <View style={{ marginTop: space.md }}>
              <T variant="overline">Your company number</T>
              <T style={{ fontSize: 24, fontWeight: '800', marginTop: 2 }}>{org.sms_number}</T>
            </View>
          ) : null}
          {org.sms_status === 'not_requested' ? (
            owner ? <Button icon="call-outline" title="Request a texting number" onPress={request} style={{ marginTop: space.md }} />
              : <T variant="small" style={{ marginTop: space.md }}>Only the company owner can request a texting number.</T>
          ) : null}
          {org.sms_status === 'active' ? (
            <View style={{ marginTop: space.md }}>
              {owner ? (
                <ToggleRow label="Send texts to customers" value={org.sms_enabled} onChange={toggle}
                  hint="Turn off anytime; automations then fall back to email." />
              ) : <T variant="muted">Texting is {org.sms_enabled ? 'on' : 'off'}.</T>}
              <Button small kind="secondary" icon="flash-outline" title="Choose which automations text" onPress={() => router.push('/automations')} style={{ alignSelf: 'flex-start' }} />
            </View>
          ) : null}
        </Card>
      </Section>

      <Section title="This month" icon="stats-chart-outline">
        <Card>
          {a ? (
            <>
              <Row style={{ justifyContent: 'space-between' }}>
                <T style={{ fontWeight: '700', fontSize: 22 }}>{a.used.toLocaleString()} <T variant="muted">of {total.toLocaleString()} texts</T></T>
              </Row>
              <View style={{ height: 10, borderRadius: radius.pill, backgroundColor: colors.cardRaised, marginVertical: space.md, overflow: 'hidden' }}>
                <View style={{ width: `${pct * 100}%`, height: '100%', backgroundColor: pct >= 0.9 ? colors.danger : pct >= 0.75 ? colors.warning : colors.primary }} />
              </View>
              <T variant="muted">
                {a.included.toLocaleString()} included with {pi ? `the ${pi.name} plan` : 'your plan'}{a.extra ? ` + ${a.extra.toLocaleString()} from text packs` : ''}. Resets on the 1st.
              </T>
              {pct >= 0.9 ? <T variant="small" style={{ color: colors.danger, marginTop: 4 }}>You are almost out of texts. When they run out, messages go by email instead.</T> : null}
            </>
          ) : <T variant="muted">{allowance.loading ? 'Loading…' : 'Usage is not available right now.'}</T>}
          {owner ? <Button small kind="secondary" icon="add-circle-outline" title="Buy extra text packs" onPress={() => router.push('/paywall')} style={{ alignSelf: 'flex-start', marginTop: space.md }} /> : null}
        </Card>
        <Card>
          <T variant="overline" style={{ marginBottom: space.sm }}>Texts included per month</T>
          {PLANS.map((p) => (
            <Row key={p.id} style={{ justifyContent: 'space-between', paddingVertical: 4 }}>
              <T style={p.id === plan ? { fontWeight: '700', color: colors.primaryText } : undefined}>{p.name}{p.id === plan ? ' (your plan)' : ''}</T>
              <T variant="muted">{p.texts.toLocaleString()}</T>
            </Row>
          ))}
        </Card>
      </Section>

      <Section title="Consent & STOP" icon="shield-checkmark-outline">
        <Card>
          <T variant="muted">
            Texts only go to customers who agreed to receive them. Record consent on each customer&apos;s page when they say yes.
            {'\n\n'}If a customer replies STOP, they are opted out automatically and no more texts are sent; replying START opts them back in.
            {'\n\n'}Texts are only sent during your quiet-hours window (set in Automations); anything outside waits until morning.
          </T>
        </Card>
      </Section>
    </Screen>
  );
}

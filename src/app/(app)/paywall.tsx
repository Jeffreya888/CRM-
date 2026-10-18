import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Platform, View } from 'react-native';
import { notify } from '../../components/FormSheet';
import { allowanceLine, useAiAllowance } from '../../components/ai/AiAllowance';
import { openSite, SITE } from '../../components/settings/links';
import { Badge, Button, Card, ErrorBanner, Ionicons, ListRow, Loading, Row, Screen, Section, Segmented, T } from '../../components/ui';
import { annualSavings, PLANS, type PlanInfo } from '../../lib/plans';
import { buy, buyAiPack, buyTextPack, loadAiPacks, loadPackages, loadTextPacks, purchasesAvailable, restore, type AiPack, type StorePackage, type TextPack } from '../../lib/purchases';
import { useSession } from '../../lib/session';
import { colors, space } from '../../lib/theme';

type Period = 'monthly' | 'annual';

/**
 * Subscription paywall. Purchases go through Apple / Google via RevenueCat;
 * the revenuecat-webhook function then upgrades the organization server-side.
 */
export default function Paywall() {
  const { plan, trialDays, role, refresh, org } = useSession();
  const [pkgs, setPkgs] = useState<StorePackage[] | null>(null);
  const [packs, setPacks] = useState<TextPack[]>([]);
  const [aiPacks, setAiPacks] = useState<AiPack[]>([]);
  const { section } = useLocalSearchParams<{ section?: string }>();
  const focusAi = section === 'ai';
  const allowance = useAiAllowance();
  const [period, setPeriod] = useState<Period>(() => org?.billing_period ?? 'monthly');
  const [error, setError] = useState<string | null>(null);
  const isOwner = role === 'owner' || role === 'admin';
  const store = Platform.OS === 'ios' ? 'Apple ID' : Platform.OS === 'android' ? 'Google Play' : 'app store';

  useEffect(() => {
    let alive = true;
    loadPackages()
      .then((p) => { if (alive) setPkgs(p); })
      .catch((e) => { if (alive) { setError(e.message); setPkgs([]); } });
    loadTextPacks().then((p) => { if (alive) setPacks(p); }).catch(() => {});
    loadAiPacks().then((p) => { if (alive) setAiPacks(p); }).catch(() => {});
    return () => { alive = false; };
  }, []);

  // The webhook may land a moment after the store confirms; poll briefly.
  const awaitUpgrade = async () => {
    for (let i = 0; i < 6; i++) {
      await refresh();
      await new Promise((r) => setTimeout(r, 1500));
    }
  };

  const purchase = async (p: StorePackage) => {
    setError(null);
    try {
      const info = await buy(p);
      if (!info) return;
      notify('Thank you!', 'Your subscription is active. It may take a few seconds to apply to your whole team.');
      await awaitUpgrade();
      if (router.canGoBack()) router.back();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const purchasePack = async (p: TextPack) => {
    setError(null);
    try {
      const info = await buyTextPack(p);
      if (!info) return;
      notify('Texts added', 'Your extra texts will be added to your company in a few seconds.');
      await awaitUpgrade();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const purchaseAiPack = async (p: AiPack) => {
    setError(null);
    try {
      const info = await buyAiPack(p);
      if (!info) return;
      notify('AI checks added', 'Your extra AI checks will be added to your company in a few seconds.');
      await awaitUpgrade();
      allowance.reload();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const doRestore = async () => {
    setError(null);
    try {
      const info = await restore();
      const active = !!info && Object.keys(info.entitlements.active).length > 0;
      notify(active ? 'Purchases restored' : 'No active subscription found');
      if (active) await awaitUpgrade();
    } catch (e: any) {
      setError(e.message);
    }
  };

  if (pkgs === null) return <Loading />;

  const pkgFor = (p: PlanInfo) => pkgs.find((x) => x.planId === p.id && x.period === period);
  const currentPeriod: Period = org?.billing_period ?? 'monthly';
  const maxSave = Math.max(...PLANS.map(annualSavings));
  const status = plan === 'trial'
    ? `${trialDays} day${trialDays === 1 ? '' : 's'} left in your free trial. Every feature is unlocked while you try it.`
    : plan === 'expired'
      ? 'Your plan has ended. Your data is safe. Choose a plan to keep working.'
      : `You're on ${PLANS.find((p) => p.id === plan)?.name ?? plan}, billed ${currentPeriod === 'annual' ? 'yearly' : 'monthly'}.`;

  const extraAi = org?.ai_extra_credits ?? 0;
  const aiSection = (
    <View style={focusAi ? { borderWidth: 2, borderColor: colors.primary, borderRadius: 16, padding: space.md, marginTop: space.lg } : undefined}>
      <Section title="Extra AI checks" icon="sparkles-outline">
        <T variant="muted" style={{ marginBottom: space.sm }}>
          {allowance.data ? `${allowanceLine(allowance.data)}. ` : ''}
          Extra checks are used after your monthly checks run out and never expire.{extraAi ? ` You have ${extraAi.toLocaleString('en-US')} extra AI checks.` : ''}
        </T>
        {aiPacks.length ? (
          <Card style={{ padding: 0, overflow: 'hidden' }}>
            {aiPacks.map((p) => (
              <ListRow key={p.productId} icon="sparkles-outline" tone="purple"
                title={p.checks ? `${p.checks.toLocaleString('en-US')} AI checks` : p.title} subtitle={p.checks ? 'One-time purchase' : null}
                right={<Button small kind="secondary" title={p.priceString} disabled={!isOwner} onPress={() => purchaseAiPack(p)} />} />
            ))}
          </Card>
        ) : (
          <T variant="small">
            {purchasesAvailable ? 'Extra AI check packs are not available right now. Please try again later.' : 'Extra AI checks are purchased in the Flight Ready iPhone or Android app.'}
          </T>
        )}
        {!isOwner ? <T variant="small" style={{ marginTop: space.sm }}>Ask your owner to add more AI checks.</T> : null}
      </Section>
    </View>
  );

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Plans', presentation: 'modal' }} />
      <View style={{ alignItems: 'center', marginBottom: space.lg }}>
        <Ionicons name="rocket-outline" size={40} color={colors.primary} />
        <T variant="h2" style={{ textAlign: 'center', marginTop: space.sm }}>Plans for every detailing business</T>
        <T variant="muted" style={{ textAlign: 'center', marginTop: 4 }}>{status}</T>
      </View>
      <ErrorBanner message={error} />
      {!isOwner ? <ErrorBanner message="Only the company owner or an admin can change the subscription." /> : null}
      {!purchasesAvailable ? (
        <ErrorBanner message={Platform.OS === 'web' ? 'Subscriptions are purchased in the Flight Ready iPhone or Android app.' : 'In-app purchases are not available right now. Please try again later.'} />
      ) : null}

      {focusAi ? aiSection : null}

      <Segmented value={period} onChange={setPeriod} options={[{ value: 'monthly', label: 'Monthly' }, { value: 'annual', label: `Yearly · save up to $${maxSave}` }]} />

      {PLANS.map((p) => {
        const pkg = pkgFor(p);
        const isCurrentPlan = plan === p.id;
        const isCurrent = isCurrentPlan && currentPeriod === period;
        const price = pkg?.priceString ?? (period === 'annual' ? `$${p.annual.toFixed(2)}` : `$${p.monthly.toFixed(2)}`);
        const popular = p.id === 'team';
        return (
          <Card key={p.id} style={popular ? { borderWidth: 2, borderColor: colors.primary } : isCurrentPlan ? { borderColor: colors.success } : undefined}>
            <Row style={{ justifyContent: 'space-between' }}>
              <T variant="h3">{p.name}</T>
              <Row gap={6}>
                {popular ? <Badge raw label="Most popular" tone="primary" /> : null}
                {isCurrentPlan ? <Badge raw label={`Current · ${currentPeriod === 'annual' ? 'yearly' : 'monthly'}`} tone="success" /> : null}
              </Row>
            </Row>
            <Row gap={6} style={{ alignItems: 'flex-end', marginTop: 4 }}>
              <T variant="h2">{price}</T>
              <T variant="muted" style={{ marginBottom: 4 }}>{period === 'annual' ? '/ year' : '/ month'}</T>
            </Row>
            {period === 'annual' ? <T style={{ color: colors.success, fontWeight: '600' }}>Save ${annualSavings(p)} a year (about 2 months free)</T> : null}
            {pkg?.introText ? <T style={{ color: colors.success, fontWeight: '600' }}>{pkg.introText}</T> : null}
            <T variant="muted" style={{ marginTop: space.xs, marginBottom: space.sm }}>{p.blurb}</T>
            {p.highlights.map((h) => (
              <Row key={h} gap={6} style={{ marginTop: 4, alignItems: 'flex-start' }}>
                <Ionicons name="checkmark-circle" size={16} color={colors.success} style={{ marginTop: 2 }} />
                <T variant="muted" style={{ flex: 1 }}>{h}</T>
              </Row>
            ))}
            <T variant="small" style={{ marginTop: space.sm }}>
              {p.seats === Infinity ? 'Unlimited team members' : p.seats === 1 ? '1 user' : `Up to ${p.seats} team members`} · {p.texts.toLocaleString('en-US')} texts / month · {p.aiChecks.toLocaleString('en-US')} AI photo checks / month · {(p.feeBps / 100).toFixed(1)}% platform fee on card payments
            </T>
            <Button style={{ marginTop: space.md }} kind={popular ? 'primary' : 'secondary'}
              title={isCurrent ? 'Current plan' : !pkg ? 'Available in the app' : isCurrentPlan ? `Switch to ${period === 'annual' ? 'yearly' : 'monthly'}` : `Choose ${p.name}`}
              disabled={!pkg || isCurrent || !isOwner} onPress={() => purchase(pkg!)} />
          </Card>
        );
      })}

      <Card style={{ backgroundColor: colors.infoSoft, borderColor: 'transparent' }}>
        <Row gap={space.sm} style={{ alignItems: 'flex-start' }}>
          <Ionicons name="gift-outline" size={20} color={colors.primaryText} />
          <T style={{ flex: 1 }}>New companies get a 14-day free trial with every feature. One subscription covers everyone at {org?.name ?? 'your company'}.</T>
        </Row>
      </Card>

      {packs.length ? (
        <Section title="Extra text packs" icon="chatbubble-ellipses-outline">
          <T variant="muted" style={{ marginBottom: space.sm }}>
            Need more customer texts this month? Extra texts are used after your monthly allowance runs out.{org?.sms_extra_credits ? ` You have ${org.sms_extra_credits.toLocaleString('en-US')} extra texts.` : ''}
          </T>
          <Card style={{ padding: 0, overflow: 'hidden' }}>
            {packs.map((p) => (
              <ListRow key={p.productId} icon="chatbubbles-outline" tone="success"
                title={p.texts ? `${p.texts.toLocaleString('en-US')} texts` : p.title} subtitle={p.texts ? 'One-time purchase' : null}
                right={<Button small kind="secondary" title={p.priceString} disabled={!isOwner} onPress={() => purchasePack(p)} />} />
            ))}
          </Card>
        </Section>
      ) : null}

      {focusAi ? null : aiSection}

      <Button style={{ marginTop: space.md }} kind="ghost" title="Restore purchases" onPress={doRestore} disabled={!purchasesAvailable} />
      <T variant="small" style={{ textAlign: 'center', marginTop: space.md }}>
        Payment is charged to your {store} account when you confirm. Subscriptions renew automatically at the same price for the same period (monthly or yearly)
        unless cancelled at least 24 hours before the end of the current period. Your account is charged for renewal within 24 hours before the period ends.
        Manage or cancel anytime in your {store} account settings. Any unused part of a free trial ends when you buy a subscription.
      </T>
      <Row style={{ justifyContent: 'center', flexWrap: 'wrap' }}>
        <Button small kind="ghost" title="Terms of Use" onPress={() => openSite(SITE.terms)} />
        <Button small kind="ghost" title="Privacy Policy" onPress={() => openSite(SITE.privacy)} />
      </Row>
    </Screen>
  );
}

import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Platform, View } from 'react-native';
import { notify } from '../../components/FormSheet';
import { allowanceLine, useAiAllowance } from '../../components/ai/AiAllowance';
import { BillingNotice } from '../../components/billing/BillingNotice';
import { openSite, SITE } from '../../components/settings/links';
import { Badge, Button, Card, ErrorBanner, Ionicons, ListRow, Loading, Row, Screen, Section, Segmented, T } from '../../components/ui';
import {
  formatPrice, loadWebCatalog, openBillingPortal, startPackCheckout, startPlanCheckout, storeLabel, storeManaged, webBilling, webManaged,
  type WebCatalog, type WebPack,
} from '../../lib/billing';
import { APP_NAME } from '../../lib/config';
import { date } from '../../lib/format';
import { annualSavings, PLANS, type PlanInfo } from '../../lib/plans';
import { buy, buyAiPack, buyTextPack, loadAiPacks, loadPackages, loadTextPacks, purchasesAvailable, restore, type AiPack, type StorePackage, type TextPack } from '../../lib/purchases';
import { useSession } from '../../lib/session';
import { colors, space } from '../../lib/theme';

type Period = 'monthly' | 'annual';

/**
 * Subscription paywall.
 * - iPhone / Android: Apple / Google in-app purchase via RevenueCat (revenuecat-webhook upgrades the company).
 * - Website: Stripe Checkout (billing-checkout; stripe-webhook upgrades the company).
 * The native apps never link to web checkout or web prices.
 */
export default function Paywall() {
  const { plan, trialDays, role, refresh, org } = useSession();
  const [pkgs, setPkgs] = useState<StorePackage[] | null>(webBilling ? [] : null);
  const [packs, setPacks] = useState<TextPack[]>([]);
  const [aiPacks, setAiPacks] = useState<AiPack[]>([]);
  const [catalog, setCatalog] = useState<WebCatalog | null>(webBilling ? null : { plans: [], packs: [] });
  const [busy, setBusy] = useState<string | null>(null);
  const { section, billing } = useLocalSearchParams<{ section?: string; billing?: string }>();
  const focusAi = section === 'ai';
  const allowance = useAiAllowance();
  const [period, setPeriod] = useState<Period>(() => org?.billing_period ?? 'monthly');
  const [error, setError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  // In-app purchase: owner or admin (existing rule). Web billing: owner only (enforced by the server too).
  const isOwner = webBilling ? role === 'owner' : role === 'owner' || role === 'admin';
  const store = Platform.OS === 'ios' ? 'Apple ID' : Platform.OS === 'android' ? 'Google Play' : 'app store';
  const orgId = org?.id ?? '';
  const onStore = storeManaged(org, plan);
  const onWeb = webManaged(org, plan);

  useEffect(() => {
    let alive = true;
    if (webBilling) {
      loadWebCatalog()
        .then((c) => { if (alive) setCatalog(c); })
        .catch((e) => { if (alive) { setError(e.message); setCatalog({ plans: [], packs: [] }); } });
    } else {
      loadPackages()
        .then((p) => { if (alive) setPkgs(p); })
        .catch((e) => { if (alive) { setError(e.message); setPkgs([]); } });
      loadTextPacks().then((p) => { if (alive) setPacks(p); }).catch(() => {});
      loadAiPacks().then((p) => { if (alive) setAiPacks(p); }).catch(() => {});
    }
    return () => { alive = false; };
  }, []);

  // Back from Stripe Checkout: the webhook lands a moment later, so poll until the company changes.
  const stateKey = `${org?.plan}|${org?.plan_expires_at}|${org?.stripe_subscription_id}|${org?.ai_extra_credits}|${org?.sms_extra_credits}`;
  const latest = useRef(stateKey);
  const refreshRef = useRef(refresh);
  useEffect(() => {
    latest.current = stateKey;
    refreshRef.current = refresh;
  });
  useEffect(() => {
    if (billing !== 'success') return;
    let alive = true;
    const start = latest.current;
    (async () => {
      for (let i = 0; i < 8 && alive; i++) {
        await new Promise((r) => setTimeout(r, 2000));
        if (!alive) return;
        await refreshRef.current().catch(() => {});
        await new Promise((r) => setTimeout(r, 50));
        if (latest.current !== start) {
          if (alive) setConfirmed(true);
          allowance.reload();
          return;
        }
      }
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [billing]);

  // The store webhook may land a moment after the store confirms; poll briefly.
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

  // Web (Stripe) actions: each redirects the browser to Stripe.
  const runWeb = async (key: string, fn: () => Promise<void>) => {
    setError(null);
    setBusy(key);
    try {
      await fn();
    } catch (e: any) {
      setError(e.message);
      setBusy(null);
    }
  };
  const subscribe = (p: PlanInfo) => runWeb(`plan:${p.id}`, () => startPlanCheckout(orgId, p.id, period));
  const buyWebPack = (p: WebPack) => runWeb(`pack:${p.id}`, () => startPackCheckout(orgId, p.kind, p.id));
  const manageBilling = () => runWeb('portal', () => openBillingPortal(orgId));

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

  if (pkgs === null || catalog === null) return <Loading />;

  const pkgFor = (p: PlanInfo) => pkgs.find((x) => x.planId === p.id && x.period === period);
  const webPriceFor = (p: PlanInfo) => catalog.plans.find((x) => x.plan === p.id && x.period === period);
  const currentPeriod: Period = org?.billing_period ?? 'monthly';
  const maxSave = Math.max(...PLANS.map(annualSavings));
  const status = plan === 'trial'
    ? `${trialDays} day${trialDays === 1 ? '' : 's'} left in your free trial. Every feature is unlocked while you try it.`
    : plan === 'expired'
      ? 'Your plan has ended. Your data is safe. Choose a plan to keep working.'
      : `You're on ${PLANS.find((p) => p.id === plan)?.name ?? plan}, billed ${currentPeriod === 'annual' ? 'yearly' : 'monthly'}.`;

  const webAiPacks = catalog.packs.filter((p) => p.kind === 'ai_pack');
  const webTextPacks = catalog.packs.filter((p) => p.kind === 'text_pack');
  const packBuyer = isOwner;

  const extraAi = org?.ai_extra_credits ?? 0;
  const aiRows = webBilling
    ? webAiPacks.map((p) => (
      <ListRow key={p.id} icon="sparkles-outline" tone="purple" title={`${p.quantity.toLocaleString('en-US')} AI checks`} subtitle="One-time purchase"
        right={<Button small kind="secondary" title={formatPrice(p.amount, p.currency) || 'Buy'} loading={busy === `pack:${p.id}`} disabled={!packBuyer || !!busy} onPress={() => buyWebPack(p)} />} />
    ))
    : aiPacks.map((p) => (
      <ListRow key={p.productId} icon="sparkles-outline" tone="purple"
        title={p.checks ? `${p.checks.toLocaleString('en-US')} AI checks` : p.title} subtitle={p.checks ? 'One-time purchase' : null}
        right={<Button small kind="secondary" title={p.priceString} disabled={!isOwner} onPress={() => purchaseAiPack(p)} />} />
    ));
  const aiSection = (
    <View style={focusAi ? { borderWidth: 2, borderColor: colors.primary, borderRadius: 16, padding: space.md, marginTop: space.lg } : undefined}>
      <Section title="Extra AI checks" icon="sparkles-outline">
        <T variant="muted" style={{ marginBottom: space.sm }}>
          {allowance.data ? `${allowanceLine(allowance.data)}. ` : ''}
          Extra checks are used after your monthly checks run out and never expire.{extraAi ? ` You have ${extraAi.toLocaleString('en-US')} extra AI checks.` : ''}
        </T>
        {aiRows.length ? (
          <Card style={{ padding: 0, overflow: 'hidden' }}>{aiRows}</Card>
        ) : (
          <T variant="small">
            {webBilling || purchasesAvailable ? 'Extra AI check packs are not available right now. Please try again later.' : `Extra AI checks are purchased in the ${APP_NAME} iPhone or Android app.`}
          </T>
        )}
        {!isOwner ? <T variant="small" style={{ marginTop: space.sm }}>Ask your owner to add more AI checks.</T> : null}
      </Section>
    </View>
  );

  const textRows = webBilling
    ? webTextPacks.map((p) => (
      <ListRow key={p.id} icon="chatbubbles-outline" tone="success" title={`${p.quantity.toLocaleString('en-US')} texts`} subtitle="One-time purchase"
        right={<Button small kind="secondary" title={formatPrice(p.amount, p.currency) || 'Buy'} loading={busy === `pack:${p.id}`} disabled={!packBuyer || !!busy} onPress={() => buyWebPack(p)} />} />
    ))
    : packs.map((p) => (
      <ListRow key={p.productId} icon="chatbubbles-outline" tone="success"
        title={p.texts ? `${p.texts.toLocaleString('en-US')} texts` : p.title} subtitle={p.texts ? 'One-time purchase' : null}
        right={<Button small kind="secondary" title={p.priceString} disabled={!isOwner} onPress={() => purchasePack(p)} />} />
    ));

  /** Plan button on the website (Stripe). null = no button. */
  const webButton = (p: PlanInfo, popular: boolean) => {
    if (onStore) return null; // managed on the phone; see the notice above
    const isCurrent = plan === p.id && currentPeriod === period;
    if (onWeb) {
      return (
        <Button style={{ marginTop: space.md }} kind="secondary" title={isCurrent ? 'Current plan' : 'Change in Manage billing'}
          disabled={isCurrent || !isOwner || !!busy} loading={busy === 'portal' && !isCurrent} onPress={manageBilling} />
      );
    }
    const price = webPriceFor(p);
    return (
      <Button style={{ marginTop: space.md }} kind={popular ? 'primary' : 'secondary'}
        title={!price ? 'Not available yet' : 'Start subscription'}
        loading={busy === `plan:${p.id}`} disabled={!price || !isOwner || !!busy} onPress={() => subscribe(p)} />
    );
  };

  /** Plan button in the iPhone / Android app (in-app purchase). */
  const nativeButton = (p: PlanInfo, popular: boolean, pkg: StorePackage | undefined) => {
    if (onWeb) return null; // billed on the web; never point to it from the app
    const isCurrentPlan = plan === p.id;
    const isCurrent = isCurrentPlan && currentPeriod === period;
    return (
      <Button style={{ marginTop: space.md }} kind={popular ? 'primary' : 'secondary'}
        title={isCurrent ? 'Current plan' : !pkg ? 'Not available right now' : isCurrentPlan ? `Switch to ${period === 'annual' ? 'yearly' : 'monthly'}` : `Choose ${p.name}`}
        disabled={!pkg || isCurrent || !isOwner} onPress={() => purchase(pkg!)} />
    );
  };

  const trialCarry = webBilling && plan === 'trial' && trialDays > 2 && org?.trial_ends_at;

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Plans', presentation: 'modal' }} />
      <View style={{ alignItems: 'center', marginBottom: space.lg }}>
        <Ionicons name="rocket-outline" size={40} color={colors.primary} />
        <T variant="h2" style={{ textAlign: 'center', marginTop: space.sm }}>Plans for every detailing business</T>
        <T variant="muted" style={{ textAlign: 'center', marginTop: 4 }}>{status}</T>
      </View>

      {webBilling && billing === 'success' ? (
        <BillingNotice tone="success" icon="checkmark-circle-outline"
          text={confirmed ? 'Thank you! Your purchase is complete and applied to your company.' : 'Thank you! Your payment went through. It can take a few seconds to apply to your company.'} />
      ) : null}
      {webBilling && billing === 'cancelled' ? (
        <BillingNotice tone="info" icon="information-circle-outline" text="Checkout was cancelled. You have not been charged." />
      ) : null}
      <ErrorBanner message={error} />
      {!isOwner ? (
        <ErrorBanner message={webBilling ? 'Ask your owner to choose a plan.' : 'Only the company owner or an admin can change the subscription.'} />
      ) : null}
      {!webBilling && !purchasesAvailable ? <ErrorBanner message="In-app purchases are not available right now. Please try again later." /> : null}

      {webBilling && onStore ? (
        <BillingNotice tone="info" icon="phone-portrait-outline"
          text={`Your subscription is managed in ${storeLabel(org)} on your phone. To change or cancel it, use your phone's subscription settings. Extra packs can still be bought here.`} />
      ) : null}
      {webBilling && onWeb ? (
        <BillingNotice tone="info" icon="card-outline" text="Your subscription is billed by card. Change your plan, update your card, see invoices or cancel in Manage billing."
          action={isOwner ? <Button small kind="secondary" title="Manage billing" loading={busy === 'portal'} disabled={!!busy} onPress={manageBilling} /> : null} />
      ) : null}
      {!webBilling && onWeb ? (
        <BillingNotice tone="info" icon="information-circle-outline" text="Your subscription is managed in your web account." />
      ) : null}
      {trialCarry ? (
        <BillingNotice tone="success" icon="gift-outline" text={`Subscribe now and keep your free trial: you won't be charged until it ends on ${date(org!.trial_ends_at)}.`} />
      ) : null}

      {focusAi ? aiSection : null}

      <Segmented value={period} onChange={setPeriod} options={[{ value: 'monthly', label: 'Monthly' }, { value: 'annual', label: `Yearly · save up to $${maxSave}` }]} />

      {PLANS.map((p) => {
        const pkg = webBilling ? undefined : pkgFor(p);
        const webPrice = webBilling ? webPriceFor(p) : undefined;
        const isCurrentPlan = plan === p.id;
        const price = pkg?.priceString ?? (webPrice ? formatPrice(webPrice.amount, webPrice.currency) : '');
        const shown = price || (period === 'annual' ? `$${p.annual.toFixed(2)}` : `$${p.monthly.toFixed(2)}`);
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
              <T variant="h2">{shown}</T>
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
            {webBilling ? webButton(p, popular) : nativeButton(p, popular, pkg)}
          </Card>
        );
      })}

      <Card style={{ backgroundColor: colors.infoSoft, borderColor: 'transparent' }}>
        <Row gap={space.sm} style={{ alignItems: 'flex-start' }}>
          <Ionicons name="gift-outline" size={20} color={colors.primaryText} />
          <T style={{ flex: 1 }}>New companies get a 14-day free trial with every feature. One subscription covers everyone at {org?.name ?? 'your company'}.</T>
        </Row>
      </Card>

      {textRows.length ? (
        <Section title="Extra text packs" icon="chatbubble-ellipses-outline">
          <T variant="muted" style={{ marginBottom: space.sm }}>
            Need more customer texts this month? Extra texts are used after your monthly allowance runs out.{org?.sms_extra_credits ? ` You have ${org.sms_extra_credits.toLocaleString('en-US')} extra texts.` : ''}
          </T>
          <Card style={{ padding: 0, overflow: 'hidden' }}>{textRows}</Card>
        </Section>
      ) : null}

      {focusAi ? null : aiSection}

      {webBilling ? (
        <T variant="small" style={{ textAlign: 'center', marginTop: space.md }}>
          Payments are processed securely by Stripe. Subscriptions renew automatically at the same price for the same period (monthly or yearly)
          until you cancel. Cancel anytime in Manage billing; you keep access until the end of the paid period. Extra packs are one-time purchases.
        </T>
      ) : (
        <>
          <Button style={{ marginTop: space.md }} kind="ghost" title="Restore purchases" onPress={doRestore} disabled={!purchasesAvailable} />
          <T variant="small" style={{ textAlign: 'center', marginTop: space.md }}>
            Payment is charged to your {store} account when you confirm. Subscriptions renew automatically at the same price for the same period (monthly or yearly)
            unless cancelled at least 24 hours before the end of the current period. Your account is charged for renewal within 24 hours before the period ends.
            Manage or cancel anytime in your {store} account settings. Any unused part of a free trial ends when you buy a subscription.
          </T>
        </>
      )}
      <Row style={{ justifyContent: 'center', flexWrap: 'wrap' }}>
        <Button small kind="ghost" title="Terms of Use" onPress={() => openSite(SITE.terms)} />
        <Button small kind="ghost" title="Privacy Policy" onPress={() => openSite(SITE.privacy)} />
      </Row>
    </Screen>
  );
}

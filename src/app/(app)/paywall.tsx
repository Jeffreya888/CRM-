import { router, Stack } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useState } from 'react';
import { Platform, View } from 'react-native';
import { notify } from '../../components/FormSheet';
import { Badge, Button, Card, ErrorBanner, Ionicons, Loading, Row, Screen, Segmented, T } from '../../components/ui';
import { PRIVACY_URL, TERMS_URL } from '../../lib/config';
import { FEATURE_LABELS, PLANS } from '../../lib/plans';
import { buy, loadPackages, purchasesAvailable, restore, type StorePackage } from '../../lib/purchases';
import { useSession } from '../../lib/session';
import { colors, space } from '../../lib/theme';

/**
 * Subscription paywall. Purchases go through Apple / Google via RevenueCat;
 * the revenuecat-webhook function then upgrades the organization server-side.
 */
export default function Paywall() {
  const { plan, trialDays, role, refresh, org } = useSession();
  const [pkgs, setPkgs] = useState<StorePackage[] | null>(null);
  const [period, setPeriod] = useState<'monthly' | 'annual'>('annual');
  const [error, setError] = useState<string | null>(null);
  const isOwner = role === 'owner' || role === 'admin';

  useEffect(() => {
    loadPackages().then(setPkgs).catch((e) => { setError(e.message); setPkgs([]); });
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
      notify('Thank you!', 'Your subscription is active. It may take a few seconds to apply to your team.');
      await awaitUpgrade();
      router.back();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const doRestore = async () => {
    setError(null);
    try {
      const info = await restore();
      const active = info && Object.keys(info.entitlements.active).length > 0;
      notify(active ? 'Purchases restored' : 'No active subscription found');
      if (active) await awaitUpgrade();
    } catch (e: any) {
      setError(e.message);
    }
  };

  if (pkgs === null) return <Loading />;
  const hasAnnual = pkgs.some((p) => p.period === 'annual');

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Choose a plan', presentation: 'modal' }} />
      <View style={{ alignItems: 'center', marginBottom: space.lg }}>
        <Ionicons name="rocket-outline" size={40} color={colors.primary} />
        <T variant="h2" style={{ textAlign: 'center', marginTop: space.sm }}>Grow your detailing business</T>
        <T variant="muted" style={{ textAlign: 'center' }}>
          {plan === 'trial' ? `${trialDays} day${trialDays === 1 ? '' : 's'} left in your free trial.` : plan === 'expired' ? 'Your plan has ended. Your data is safe. Pick a plan to keep working.' : `You're on the ${plan} plan.`}
        </T>
      </View>
      <ErrorBanner message={error} />
      {!isOwner ? <ErrorBanner message="Only the company owner or an admin can change the subscription." /> : null}
      {!purchasesAvailable ? (
        <ErrorBanner message={Platform.OS === 'web' ? 'Subscriptions are purchased in the iOS or Android app.' : 'In-app purchases are not configured yet (missing RevenueCat key).'} />
      ) : null}
      {hasAnnual ? (
        <Segmented value={period} onChange={setPeriod} options={[{ value: 'annual', label: 'Yearly (save ~17%)' }, { value: 'monthly', label: 'Monthly' }]} />
      ) : null}

      {PLANS.map((p) => {
        const pkg = pkgs.find((x) => x.planId === p.id && (!hasAnnual || x.period === period)) ?? pkgs.find((x) => x.planId === p.id);
        const current = plan === p.id;
        return (
          <Card key={p.id} style={p.id === 'team' ? { borderWidth: 2, borderColor: colors.primary } : undefined}>
            <Row style={{ justifyContent: 'space-between' }}>
              <T variant="h3">{p.name}</T>
              {p.id === 'team' ? <Badge label="Most popular" tone="primary" /> : null}
              {current ? <Badge label="Current" tone="success" /> : null}
            </Row>
            <T variant="h2" style={{ marginVertical: 4 }}>{pkg?.priceString ?? p.priceHint}{pkg ? (pkg.period === 'annual' ? '/yr' : '/mo') : ''}</T>
            {pkg?.introText ? <T style={{ color: colors.success, fontWeight: '600' }}>{pkg.introText}</T> : null}
            <T variant="muted" style={{ marginBottom: space.sm }}>{p.blurb}</T>
            <T variant="small">{p.seats === Infinity ? 'Unlimited' : p.seats} user{p.seats === 1 ? '' : 's'} · {p.customerLimit ? `${p.customerLimit} customers` : 'Unlimited customers'} · {(p.feeBps / 100).toFixed(1)}% online payment fee</T>
            <View style={{ marginTop: space.sm }}>
              {p.features.slice(0, 6).map((f) => (
                <Row key={f} gap={6} style={{ marginTop: 4 }}>
                  <Ionicons name="checkmark-circle" size={16} color={colors.success} />
                  <T variant="muted">{FEATURE_LABELS[f]}</T>
                </Row>
              ))}
            </View>
            <Button style={{ marginTop: space.md }} title={current ? 'Current plan' : `Choose ${p.name}`}
              disabled={!pkg || current || !isOwner} kind={p.id === 'team' ? 'primary' : 'secondary'} onPress={() => purchase(pkg!)} />
          </Card>
        );
      })}

      <Button kind="ghost" title="Restore purchases" onPress={doRestore} disabled={!purchasesAvailable} />
      <T variant="small" style={{ textAlign: 'center', marginTop: space.md }}>
        Subscriptions renew automatically unless cancelled at least 24 hours before the end of the current period. Payment is charged to your
        {Platform.OS === 'ios' ? ' Apple ID' : ' Google Play'} account. Manage or cancel anytime in your account settings. The subscription covers all of {org?.name ?? 'your company'}'s team members.
      </T>
      <Row style={{ justifyContent: 'center' }}>
        <Button small kind="ghost" title="Terms of Use" onPress={() => WebBrowser.openBrowserAsync(TERMS_URL)} />
        <Button small kind="ghost" title="Privacy Policy" onPress={() => WebBrowser.openBrowserAsync(PRIVACY_URL)} />
      </Row>
    </Screen>
  );
}

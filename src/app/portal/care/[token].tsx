import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { SquarePayForm } from '../../../components/payments/SquarePayForm';
import { Notice, PortalShell } from '../../../components/portal/PortalShell';
import { publicError } from '../../../components/portal/publicDoc';
import { Button, Card, EmptyState, ErrorBanner, Loading, T } from '../../../components/ui';
import { PORTAL_URL } from '../../../lib/config';
import { money } from '../../../lib/format';
import { supabase } from '../../../lib/supabase';
import { space } from '../../../lib/theme';

type CarePlan = {
  title: string; amount: number; status: 'pending' | 'active' | 'past_due' | 'canceled' | null;
  org: { name: string; email: string | null; phone: string | null; logo_url: string | null; currency: string | null; accepts_cards: boolean };
  customer: { name: string | null };
  aircraft: { tail_number: string; model: string | null } | null;
};

/**
 * Public monthly care plan page (Square), e.g. PORTAL_URL/portal/care/<token>.
 * The customer saves a card with Square and the first month is charged; the
 * same link updates the card later (or settles a failed charge).
 */
export default function CarePlanSignupPage() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const [plan, setPlan] = useState<CarePlan | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    let alive = true;
    supabase.rpc('get_public_care_plan', { p_token: token }).then(({ data, error: e }) => {
      if (!alive) return;
      if (e) setError(publicError(e.message));
      setPlan((data ?? null) as CarePlan | null);
    });
    return () => { alive = false; };
  }, [token]);

  if (plan === undefined) return <Loading />;
  if (!plan) {
    return (
      <PortalShell title="Not found">
        <ErrorBanner message={error} />
        <EmptyState icon="document-outline" title="Care plan not found" body="This link may have expired. Contact the business that sent it." />
      </PortalShell>
    );
  }

  const cur = plan.org.currency ?? 'USD';
  const what = plan.aircraft ? `${plan.title} · ${plan.aircraft.tail_number}${plan.aircraft.model ? ` (${plan.aircraft.model})` : ''}` : plan.title;
  const active = plan.status === 'active';
  const showForm = !done && plan.status !== 'canceled' && plan.org.accepts_cards && (!active || updating);

  return (
    <PortalShell title={`Care plan · ${plan.org.name}`} brand={plan.org}>
      <Card>
        <T variant="overline">Monthly care plan</T>
        <T variant="h2" style={{ marginTop: 4 }}>{what}</T>
        <T variant="money" style={{ marginTop: space.sm }}>{money(plan.amount, cur)} / month</T>
        <T variant="muted" style={{ marginTop: space.sm }}>
          {plan.org.name} looks after your {plan.aircraft ? 'aircraft' : 'asset'} on a regular schedule. Your card is charged automatically each month and you get a receipt every time.
        </T>
      </Card>

      {done ? (
        <Notice tone="success" icon="checkmark-circle" title={updating ? 'Card updated. Thank you!' : "You're all set. Thank you!"}
          body={updating ? 'Your next monthly charge will use this card.' : `Your first month (${money(plan.amount, cur)}) is paid. A receipt is on its way to your email.`} />
      ) : plan.status === 'canceled' ? (
        <Notice tone="warning" icon="close-circle" title="This care plan was canceled" body={`Contact ${plan.org.name} to restart it.`} />
      ) : plan.status === 'past_due' ? (
        <Notice tone="warning" icon="alert-circle" title="Your last payment didn't go through" body="Add a card below to settle this month and keep your plan going." />
      ) : active && !updating ? (
        <Notice tone="success" icon="checkmark-circle" title="Your care plan is active" body="Need to change the card it's charged to?">
          <Button small kind="secondary" icon="card-outline" title="Update card" onPress={() => setUpdating(true)} style={{ marginTop: space.sm, alignSelf: 'flex-start' }} />
        </Notice>
      ) : null}

      {!plan.org.accepts_cards && !done ? (
        <Notice tone="info" icon="information-circle" title="Online sign-up is unavailable" body={`Please contact ${plan.org.name}${plan.org.phone ? ` at ${plan.org.phone}` : ''} to set up your plan.`} />
      ) : null}

      {showForm ? (
        <Card>
          <T variant="h3" style={{ marginBottom: space.sm }}>{updating ? 'New card' : plan.status === 'past_due' ? 'Update your card' : 'Add your card'}</T>
          <SquarePayForm kind="care_plan" token={token} pageUrl={`${PORTAL_URL}/portal/care/${token}`}
            buttonLabel={updating ? 'Save card' : `Start plan · ${money(plan.amount, cur)}/month`} onDone={() => setDone(true)} />
        </Card>
      ) : null}
    </PortalShell>
  );
}

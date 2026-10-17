import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Faq } from '../../components/site/Faq';
import { SitePage } from '../../components/site/SitePage';
import {
  CTAButton, Check, Container, Eyebrow, Glass, Glow, GradientText, Grid, Heading, Ionicons, P, Pill, Section, SectionIntro,
  fontFamily, site, useBreakpoint, webStyle,
} from '../../components/site/primitives';
import { APP_NAME } from '../../lib/config';
import { FEATURE_LABELS, PLANS, annualSavings, type Feature, type PlanInfo } from '../../lib/plans';
import { AIRCRAFT_MODELS, GUIDE_COUNT, PRICING_FAQ, SIGN_UP_HREF, TRIAL_DAYS } from '../../lib/site';

type Period = 'monthly' | 'annual';

const money = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const seatsLabel = (p: PlanInfo) => (p.seats === Infinity ? 'Unlimited' : p.seats === 1 ? '1 user' : `Up to ${p.seats}`);
const feeLabel = (p: PlanInfo) => `${p.feeBps / 100}%`;

export default function Pricing() {
  const [period, setPeriod] = useState<Period>('monthly');
  const { isMobile, isDesktop } = useBreakpoint();
  return (
    <SitePage
      title="Pricing"
      description={`${APP_NAME} plans: Solo $39.99/mo, Team $89.99/mo, Fleet $189.99/mo — or save with yearly billing. ${TRIAL_DAYS}-day free trial with every feature, no card required.`}
    >
      <View style={{ position: 'relative', overflow: 'hidden' }}>
        <Glow variant="hero" />
        <Container style={{ paddingTop: isMobile ? 44 : 88, paddingBottom: isMobile ? 40 : 64, alignItems: 'center' }}>
          <Eyebrow center>Pricing</Eyebrow>
          <Heading level={1} center style={{ maxWidth: 860 }}>
            One price. <GradientText>Everything you need to run the job.</GradientText>
          </Heading>
          <P size="lg" center style={{ marginTop: 18, maxWidth: 640 }}>
            Every plan includes the service guides, the aircraft price guide, the customer portal and card payments. Start with a {TRIAL_DAYS}-day free trial of every feature — no card required to start.
          </P>
          <PeriodToggle value={period} onChange={setPeriod} />
        </Container>
      </View>

      <Container style={{ marginTop: isMobile ? 8 : 0 }}>
        <Grid cols={isDesktop ? 3 : 1} gap={isMobile ? 16 : 22}>
          {PLANS.map((p) => <PlanCard key={p.id} plan={p} period={period} />)}
        </Grid>
        <View style={{ marginTop: 24, flexDirection: isMobile ? 'column' : 'row', justifyContent: 'center', gap: isMobile ? 8 : 28, alignItems: 'center' }}>
          {[`${TRIAL_DAYS}-day free trial with every feature`, 'No card required to start', 'Cancel anytime in the App Store or Google Play'].map((x) => (
            <View key={x} style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
              <Ionicons name="checkmark-circle" size={16} color={site.goldText} />
              <Text style={{ fontFamily, color: site.muted, fontSize: 14 }}>{x}</Text>
            </View>
          ))}
        </View>
      </Container>

      <Section>
        <SectionIntro eyebrow="About the platform fee" title="Transparent on every payment." body="When customers pay you by card through Flight Ready — invoices, quote deposits or care plans — a small platform fee applies. It’s separate from Stripe’s standard processing fee and drops as your plan grows. Cash, checks and payments you record yourself carry no platform fee." />
        <Grid cols={isMobile ? 1 : 3} gap={16}>
          {PLANS.map((p) => (
            <Glass key={p.id} padding={24} style={{ flex: 1, alignItems: 'center' }}>
              <Text style={{ fontFamily, color: site.muted, fontSize: 14, fontWeight: '700' }}>{p.name}</Text>
              <Text style={{ fontFamily, color: site.text, fontSize: 44, fontWeight: '800', letterSpacing: -1.5, marginTop: 6 }}>{feeLabel(p)}</Text>
              <Text style={{ fontFamily, color: site.faint, fontSize: 13 }}>platform fee per card payment</Text>
            </Glass>
          ))}
        </Grid>
      </Section>

      <Section tint>
        <SectionIntro eyebrow="Compare plans" title="Every feature, side by side." />
        <CompareTable />
      </Section>

      <Section>
        <SectionIntro eyebrow="FAQ" title="Billing questions, answered." />
        <Faq items={PRICING_FAQ} />
        <View style={{ alignItems: 'center', marginTop: 48, gap: 14 }}>
          <CTAButton href={SIGN_UP_HREF} label={`Start your ${TRIAL_DAYS}-day free trial`} icon="arrow-forward" size="lg" variant="gold" />
          <P size="sm" center>Subscriptions are purchased in the app and billed by Apple or Google.</P>
        </View>
      </Section>
    </SitePage>
  );
}

function PeriodToggle({ value, onChange }: { value: Period; onChange: (p: Period) => void }) {
  const opts: { v: Period; label: string }[] = [{ v: 'monthly', label: 'Monthly' }, { v: 'annual', label: 'Yearly' }];
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel="Billing period" style={{ flexDirection: 'row', marginTop: 34, padding: 5, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: site.lineStrong }}>
      {opts.map((o) => {
        const on = value === o.v;
        return (
          <Pressable
            key={o.v}
            accessibilityRole="radio"
            accessibilityState={{ checked: on }}
            onPress={() => onChange(o.v)}
            style={[{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10, paddingHorizontal: 22, borderRadius: 999, backgroundColor: on ? site.blue : 'transparent' }, webStyle({ cursor: 'pointer', transition: 'background-color 180ms ease' })]}
          >
            <Text style={{ fontFamily, color: on ? '#FFFFFF' : site.muted, fontSize: 15, fontWeight: '700' }}>{o.label}</Text>
            {o.v === 'annual' ? (
              <View style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, backgroundColor: on ? 'rgba(255,255,255,0.22)' : 'rgba(211,153,67,0.18)' }}>
                <Text style={{ fontFamily, color: on ? '#FFFFFF' : site.goldText, fontSize: 11.5, fontWeight: '800' }}>2 months free</Text>
              </View>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

function PlanCard({ plan: p, period }: { plan: PlanInfo; period: Period }) {
  const featured = p.id === 'team';
  const annual = period === 'annual';
  return (
    <Glass hover padding={30} style={[{ flex: 1 }, featured ? [{ borderColor: 'rgba(211,153,67,0.5)', backgroundColor: 'rgba(36,32,28,0.72)' }, webStyle({ boxShadow: '0 40px 80px -40px rgba(211,153,67,0.45)' })] : null]}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Heading level={2} style={{ fontSize: 26, lineHeight: 32, letterSpacing: -0.6 }}>{p.name}</Heading>
        {featured ? <Pill label="Most popular" tone="gold" icon="star" /> : null}
      </View>
      <P size="sm" style={{ marginTop: 6, minHeight: 44 }}>{p.blurb}</P>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 6, marginTop: 18 }}>
        <Text style={{ fontFamily, color: site.text, fontSize: 46, fontWeight: '800', letterSpacing: -1.8 }}>{money(annual ? p.annual : p.monthly)}</Text>
        <Text style={{ fontFamily, color: site.muted, fontSize: 16, marginBottom: 10 }}>{annual ? '/yr' : '/mo'}</Text>
      </View>
      <Text style={{ fontFamily, color: annual ? site.goldText : site.faint, fontSize: 13.5, fontWeight: '600', minHeight: 20 }}>
        {annual ? `About ${money(p.annual / 12)}/mo · save $${annualSavings(p)} a year` : `or ${money(p.annual)}/yr billed yearly`}
      </Text>
      <View style={{ marginTop: 22 }}>
        <CTAButton href={SIGN_UP_HREF} label="Start free trial" variant={featured ? 'gold' : 'primary'} full />
      </View>
      <View style={{ flexDirection: 'row', marginTop: 24, borderRadius: 14, borderWidth: 1, borderColor: site.line, overflow: 'hidden' }}>
        {[
          { k: 'Team', v: seatsLabel(p) },
          { k: 'Texts / mo', v: p.texts.toLocaleString('en-US') },
          { k: 'Platform fee', v: feeLabel(p) },
        ].map((s, i) => (
          <View key={s.k} style={{ flex: 1, paddingVertical: 12, paddingHorizontal: 8, alignItems: 'center', borderLeftWidth: i ? 1 : 0, borderLeftColor: site.line, backgroundColor: 'rgba(255,255,255,0.02)' }}>
            <Text style={{ fontFamily, color: site.text, fontSize: 15, fontWeight: '800' }}>{s.v}</Text>
            <Text style={{ fontFamily, color: site.faint, fontSize: 11.5, marginTop: 2 }}>{s.k}</Text>
          </View>
        ))}
      </View>
      <View style={{ gap: 11, marginTop: 22 }}>
        {p.highlights.map((h) => <Check key={h} tone={featured ? 'gold' : 'blue'}>{h}</Check>)}
      </View>
    </Glass>
  );
}

type Cell = boolean | string;
type RowDef = { label: string; cells: [Cell, Cell, Cell] };

function compareRows(): { group: string; rows: RowDef[] }[] {
  const byPlan = (fn: (p: PlanInfo) => Cell) => PLANS.map(fn) as [Cell, Cell, Cell];
  const all: [Cell, Cell, Cell] = [true, true, true];
  const order: Feature[] = ['unlimited_customers', 'customer_portal', 'online_payments', 'reminders', 'recurring', 'texting', 'pipeline', 'inventory', 'expenses', 'reports', 'team', 'timesheet_approvals', 'branches', 'stock_locations', 'integrations'];
  return [
    {
      group: 'Plan limits',
      rows: [
        { label: 'Team members', cells: byPlan(seatsLabel) },
        { label: 'Customer texts per month', cells: byPlan((p) => p.texts.toLocaleString('en-US')) },
        { label: 'Platform fee on card payments', cells: byPlan(feeLabel) },
        { label: 'Monthly price', cells: byPlan((p) => money(p.monthly)) },
        { label: 'Yearly price', cells: byPlan((p) => money(p.annual)) },
      ],
    },
    {
      group: 'Included on every plan',
      rows: [
        { label: `${GUIDE_COUNT} step-by-step service guides`, cells: all },
        { label: `Aircraft price guide (${AIRCRAFT_MODELS} models)`, cells: all },
        { label: 'Before/after photos & condition sign-off', cells: all },
        { label: 'Good / Better / Best quotes & deposits', cells: all },
        { label: 'Roles, permissions & 2-step sign-in', cells: all },
      ],
    },
    {
      group: 'Features',
      rows: order.map((f) => ({ label: FEATURE_LABELS[f], cells: byPlan((p) => p.features.includes(f)) })),
    },
  ];
}

function CompareTable() {
  const { isMobile } = useBreakpoint();
  const groups = compareRows();
  const cellText = (c: Cell, i: number) =>
    typeof c === 'string' ? (
      <Text style={{ fontFamily, color: site.text, fontSize: isMobile ? 12.5 : 14.5, fontWeight: '700', textAlign: 'center' }}>{c}</Text>
    ) : c ? (
      <Ionicons name="checkmark-circle" size={isMobile ? 18 : 20} color={i === 1 ? site.gold : site.blue} accessibilityLabel="Included" />
    ) : (
      <Text accessibilityLabel="Not included" style={{ fontFamily, color: site.faint, fontSize: 16 }}>—</Text>
    );
  return (
    <Glass padding={0} style={{ overflow: 'hidden' }}>
      <View style={{ flexDirection: 'row', paddingVertical: 18, paddingHorizontal: isMobile ? 12 : 24, borderBottomWidth: 1, borderBottomColor: site.lineStrong, backgroundColor: 'rgba(255,255,255,0.03)' }}>
        <View style={{ flex: isMobile ? 1.5 : 2.4 }} />
        {PLANS.map((p) => (
          <View key={p.id} style={{ flex: 1, alignItems: 'center' }}>
            <Text style={{ fontFamily, color: p.id === 'team' ? site.goldText : site.text, fontSize: isMobile ? 14 : 17, fontWeight: '800' }}>{p.name}</Text>
          </View>
        ))}
      </View>
      {groups.map((g) => (
        <View key={g.group}>
          <View style={{ paddingVertical: 12, paddingHorizontal: isMobile ? 12 : 24, backgroundColor: 'rgba(70,152,225,0.06)' }}>
            <Text style={{ fontFamily, color: site.blueText, fontSize: 12, fontWeight: '800', letterSpacing: 1.4 }}>{g.group.toUpperCase()}</Text>
          </View>
          {g.rows.map((r) => (
            <View key={r.label} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: isMobile ? 12 : 24, borderTopWidth: 1, borderTopColor: site.line }}>
              <Text style={{ flex: isMobile ? 1.5 : 2.4, fontFamily, color: '#D5DBE5', fontSize: isMobile ? 13 : 15, paddingRight: 8 }}>{r.label}</Text>
              {r.cells.map((c, i) => (
                <View key={i} style={{ flex: 1, alignItems: 'center' }}>{cellText(c, i)}</View>
              ))}
            </View>
          ))}
        </View>
      ))}
    </Glass>
  );
}

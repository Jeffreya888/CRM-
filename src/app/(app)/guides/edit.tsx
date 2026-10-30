import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { confirmAction } from '../../../components/FormSheet';
import { ask, ListEditor, move } from '../../../components/guides/ListEditor';
import { Button, Card, EmptyState, ErrorBanner, Field, IconButton, Loading, Row, Screen, Section, Select, T } from '../../../components/ui';
import { assetTypeLabel, GUIDE_DISCLAIMER, minutesLabel, newGuideKey, normalizeSteps, stepMinutesTotal, stepTitles } from '../../../lib/guides';
import { canSeeMoney } from '../../../lib/plans';
import { useOrg } from '../../../lib/session';
import { friendlyError, supabase } from '../../../lib/supabase';
import { colors, space } from '../../../lib/theme';
import type { AssetType, GuideStep, ServiceGuide } from '../../../lib/types';

type Draft = {
  key: string; asset_type: AssetType; title: string; summary: string; time_estimate: string; crew: string;
  products: string[]; tools: string[]; prep: string[]; steps: GuideStep[]; donts: string[]; quality_checks: string[]; photos: string[];
  based_on: string | null;
};

const fromGuide = (g: ServiceGuide): Draft => ({
  key: g.key, asset_type: g.asset_type, title: g.title, summary: g.summary ?? '', time_estimate: g.time_estimate ?? '', crew: g.crew ?? '',
  products: g.products ?? [], tools: g.tools ?? [], prep: g.prep ?? [], steps: normalizeSteps(g.steps), donts: g.donts ?? [],
  quality_checks: g.quality_checks ?? [], photos: g.photos ?? [], based_on: g.based_on,
});

/**
 * Company SOP editor (table service_guides).
 *  - `?id=<company copy id>` edits the company's copy.
 *  - `?from=<platform guide id>` duplicates a Tarmo guide (saved as a copy with the same key).
 *  - no params writes a brand-new company guide.
 */
export default function GuideEdit() {
  const { id, from } = useLocalSearchParams<{ id?: string; from?: string }>();
  const { orgId, role, businessTypes } = useOrg();
  const manager = canSeeMoney(role);
  const [draft, setDraft] = useState<Draft | null>(id || from ? null : {
    key: newGuideKey(), asset_type: businessTypes[0] ?? 'aircraft', title: '', summary: '', time_estimate: '', crew: '',
    products: [], tools: [], prep: [], steps: [{ title: '', detail: '', caution: null }], donts: [], quality_checks: [], photos: [], based_on: null,
  });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const src = id ?? from;
    if (!src) return;
    supabase.from('service_guides').select('*').eq('id', src).maybeSingle().then(({ data, error: e }) => {
      if (e || !data) { setError(e ? friendlyError(e.message) : 'SOP not found'); return; }
      const g = data as ServiceGuide;
      setDraft(from ? { ...fromGuide(g), based_on: g.id } : fromGuide(g));
    });
  }, [id, from]);

  if (!manager) return <Screen><EmptyState icon="lock-closed-outline" title="Managers only" body="Ask your manager to edit SOPs." /></Screen>;
  if (!draft) return error ? <Screen><ErrorBanner message={error} /></Screen> : <Loading />;
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => (d ? { ...d, [k]: v } : d));
  const setStep = (i: number, patch: Partial<GuideStep>) => set('steps', draft.steps.map((s, j) => (j === i ? { ...s, ...patch } : s)));

  const list = (xs: string[]) => xs.map((x) => x.trim()).filter(Boolean);
  const productNames = list(draft.products);
  const totalMin = stepMinutesTotal(draft.steps);
  const toggleProduct = (i: number, p: string) => {
    const cur = draft.steps[i]?.products ?? [];
    setStep(i, { products: cur.includes(p) ? cur.filter((x) => x !== p) : [...cur, p] });
  };

  const save = async () => {
    setError(null);
    if (!draft.title.trim()) return setError('Give the SOP a title');
    if (!draft.summary.trim()) return setError('Add a short summary of what this service is');
    const steps = draft.steps
      .map((s) => {
        const out: GuideStep = { title: s.title.trim(), detail: s.detail.trim(), caution: s.caution?.trim() ? s.caution.trim() : null };
        const m = Math.round(Number(s.minutes) || 0);
        if (m > 0) out.minutes = m;
        const ps = (s.products ?? []).filter((p) => productNames.includes(p));
        if (ps.length) out.products = ps;
        return out;
      })
      .filter((s) => s.title);
    if (!steps.length) return setError('Add at least one step with a title');
    const row = {
      key: draft.key, asset_type: draft.asset_type, title: draft.title.trim(), summary: draft.summary.trim(),
      time_estimate: draft.time_estimate.trim() || null, crew: draft.crew.trim() || null,
      products: list(draft.products), tools: list(draft.tools), prep: list(draft.prep), steps,
      donts: list(draft.donts), quality_checks: list(draft.quality_checks), photos: list(draft.photos), based_on: draft.based_on,
    };
    try {
      const { error: e } = id
        ? await supabase.from('service_guides').update(row).eq('id', id)
        : await supabase.from('service_guides').insert({ ...row, org_id: orgId });
      if (e) throw e;
    } catch (e: any) {
      return setError(friendlyError(e.message));
    }

    // Offer to refresh the checklist on services that use this guide.
    const { data: using } = await supabase.from('services').select('id').eq('org_id', orgId).eq('guide_key', draft.key);
    if (using?.length) {
      const yes = await ask(
        'Update service checklists?',
        `${using.length} service${using.length === 1 ? ' uses' : 's use'} this SOP. Update the checklist on ${using.length === 1 ? 'it' : 'them'} to match the new steps? Jobs already created keep their checklist.`,
        'Update checklists',
      );
      if (yes) {
        const { error: e } = await supabase.from('services').update({ checklist: stepTitles({ steps }) }).eq('org_id', orgId).eq('guide_key', draft.key);
        if (e) setError(friendlyError(e.message));
      }
    }
    if (router.canGoBack()) router.back(); else router.replace(`/guides/${draft.key}`);
  };

  return (
    <Screen footer={<Button title={id ? 'Save SOP' : from ? 'Save my copy' : 'Create SOP'} onPress={save} />}>
      <Stack.Screen options={{ title: id ? 'Edit SOP' : from ? 'Duplicate SOP' : 'New SOP' }} />
      {from ? (
        <Card style={{ backgroundColor: colors.primarySoft, borderColor: colors.primarySoft }}>
          <T>Your company copy replaces the Tarmo SOP for your team. Delete your copy any time to go back to the original.</T>
        </Card>
      ) : null}
      <ErrorBanner message={error} />
      <Field label="Title" value={draft.title} placeholder="Exterior Wash" onChangeText={(v) => set('title', v)} />
      {businessTypes.length > 1 ? (
        <Select label="Type of work" value={draft.asset_type} inline
          options={businessTypes.map((t) => ({ value: t, label: assetTypeLabel(t) }))} onChange={(v) => v && set('asset_type', v)} />
      ) : null}
      <Field label="What it is" multiline value={draft.summary} placeholder="What the service does and when to sell it" onChangeText={(v) => set('summary', v)} />
      <Field label="Time estimate" value={draft.time_estimate} placeholder="Light jet 2–3 h · Midsize 3–4 h" onChangeText={(v) => set('time_estimate', v)} />
      <Field label="Crew" value={draft.crew} placeholder="2–3 technicians" onChangeText={(v) => set('crew', v)} />

      <ListEditor title="Products" items={draft.products} onChange={(v) => set('products', v)} placeholder="Approved aircraft cleaner" />
      <ListEditor title="Tools & equipment" items={draft.tools} onChange={(v) => set('tools', v)} placeholder="Microfiber towels" />
      <ListEditor title="Prep & protection" items={draft.prep} onChange={(v) => set('prep', v)} placeholder="Install pitot/static covers" />

      <Section title="Steps" count={totalMin ? `~${minutesLabel(totalMin)} total` : undefined} action={<Button small kind="ghost" icon="add" title="Step" onPress={() => set('steps', [...draft.steps, { title: '', detail: '', caution: null }])} />}>
        <T variant="small" style={{ marginBottom: space.sm }}>Step titles become the job checklist. Add minutes and products per step so the crew can compare their time with the plan.</T>
        {draft.steps.map((s, i) => (
          <Card key={i} style={{ padding: space.md }}>
            <Row style={{ justifyContent: 'space-between', marginBottom: space.sm }}>
              <T style={{ fontWeight: '700' }}>Step {i + 1}</T>
              <Row gap={0}>
                <IconButton icon="chevron-up" label="Move up" color={i ? colors.textMuted : colors.border} onPress={() => set('steps', move(draft.steps, i, -1))} />
                <IconButton icon="chevron-down" label="Move down" color={i < draft.steps.length - 1 ? colors.textMuted : colors.border} onPress={() => set('steps', move(draft.steps, i, 1))} />
                <IconButton icon="trash-outline" label="Remove step" color={colors.textMuted} onPress={() => set('steps', draft.steps.filter((_, j) => j !== i))} />
              </Row>
            </Row>
            <Field placeholder="Title (shown on the checklist)" value={s.title} onChangeText={(v) => setStep(i, { title: v })} style={{ marginBottom: space.sm }} />
            <Field placeholder="How to do it" multiline value={s.detail} onChangeText={(v) => setStep(i, { detail: v })} style={{ marginBottom: space.sm }} />
            <Field placeholder="Caution (optional, highlighted)" icon="warning-outline" iconColor={colors.warning} value={s.caution ?? ''} onChangeText={(v) => setStep(i, { caution: v })} style={{ marginBottom: space.sm }} />
            <Field placeholder="Minutes (optional)" icon="time-outline" keyboardType="number-pad" value={s.minutes ? String(s.minutes) : ''}
              onChangeText={(v) => { const n = Number(v.replace(/\D/g, '')); setStep(i, { minutes: n > 0 ? n : null }); }} style={{ marginBottom: productNames.length ? space.sm : 0 }} />
            {productNames.length ? (
              <View>
                <T variant="small" style={{ marginBottom: 6 }}>Products used in this step</T>
                <Row gap={6} style={{ flexWrap: 'wrap' }}>
                  {productNames.map((p) => {
                    const on = (s.products ?? []).includes(p);
                    return (
                      <Pressable key={p} onPress={() => toggleProduct(i, p)} accessibilityRole="checkbox" accessibilityState={{ checked: on }}
                        style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 14, borderWidth: 1, borderColor: on ? colors.primary : colors.border, backgroundColor: on ? colors.primarySoft : 'transparent' }}>
                        <T variant="small" style={{ color: on ? colors.primaryText : colors.textMuted, fontWeight: on ? '700' : '400' }}>{p}</T>
                      </Pressable>
                    );
                  })}
                </Row>
              </View>
            ) : null}
          </Card>
        ))}
      </Section>

      <ListEditor title="Never do this" items={draft.donts} onChange={(v) => set('donts', v)} placeholder="Never spray water into pitot tubes" />
      <ListEditor title="Quality checks" items={draft.quality_checks} onChange={(v) => set('quality_checks', v)} placeholder="No streaks on windows" />
      <ListEditor title="Photos to take" items={draft.photos} onChange={(v) => set('photos', v)} placeholder="Before: full left side" />

      <T variant="small" style={{ marginTop: space.lg }}>{GUIDE_DISCLAIMER}</T>
      {id ? (
        <View style={{ marginTop: space.lg }}>
          <Button kind="ghost" icon="trash-outline" title={draft.based_on ? 'Delete my copy' : 'Delete SOP'} onPress={() => confirmAction(
            draft.based_on ? 'Delete your copy?' : 'Delete this SOP?',
            draft.based_on ? 'The Tarmo SOP will be used again.' : 'This SOP will be removed for everyone in your company.',
            async () => {
              const { error: e } = await supabase.from('service_guides').delete().eq('id', id);
              if (e) return setError(friendlyError(e.message));
              router.replace('/guides');
            }, true)} />
        </View>
      ) : null}
    </Screen>
  );
}

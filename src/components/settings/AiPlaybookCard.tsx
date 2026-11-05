import { useState } from 'react';
import { Button, Card, ErrorBanner, Field, T } from '../ui';
import { APP_NAME } from '../../lib/config';
import { friendlyError, supabase } from '../../lib/supabase';
import { space } from '../../lib/theme';
import type { Organization } from '../../lib/types';

export const PLAYBOOK_MAX = 8000;

/**
 * Settings → "Ask Tarmo playbook" (owner/admin): the company's own products, methods and
 * standards. Only this company's assistant reads it; it wins over general guidance, never over safety.
 */
export function AiPlaybookCard({ org, onChanged }: { org: Organization; onChanged: () => Promise<void> }) {
  const [text, setText] = useState(org.ai_playbook ?? '');
  const [saved, setSaved] = useState(org.ai_playbook ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const save = async () => {
    setError(null);
    setBusy(true);
    try {
      const value = text.trim() ? text.trim().slice(0, PLAYBOOK_MAX) : null;
      const { error: e } = await supabase.from('organizations').update({ ai_playbook: value }).eq('id', org.id);
      if (e) throw new Error(friendlyError(e.message));
      setSaved(text);
      setDone(true);
      await onChanged();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <T variant="muted" style={{ marginBottom: space.md }}>
        Teach Ask {APP_NAME} your way: the products you use for each job, your standards and your rules. Only your company&apos;s
        assistant reads this, and it follows it over general advice (never over safety).
      </T>
      <Field label="Your playbook" multiline value={text} maxLength={PLAYBOOK_MAX}
        onChangeText={(t) => { setText(t); setDone(false); }}
        placeholder={'Example:\nDry wash: [product]. Brightwork: [cut] then [polish], then [sealant].\nNever use bleach on aircraft.\nAt airport gates, wait for the gate to close behind you.'}
        hint={`${text.length.toLocaleString('en-US')} of ${PLAYBOOK_MAX.toLocaleString('en-US')} characters`}
        style={{ marginBottom: space.sm }} />
      <ErrorBanner message={error} />
      <Button title={done ? 'Saved' : 'Save playbook'} icon={done ? 'checkmark' : undefined} onPress={save} loading={busy} disabled={text === saved} />
    </Card>
  );
}

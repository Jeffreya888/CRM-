import * as Clipboard from 'expo-clipboard';
import { useState } from 'react';
import { Share } from 'react-native';
import { PORTAL_URL } from '../../lib/config';
import { useOrg } from '../../lib/session';
import { friendlyError, supabase } from '../../lib/supabase';
import { colors, space } from '../../lib/theme';
import { useQuery } from '../../lib/useQuery';
import { confirmAction, notify } from '../FormSheet';
import { Badge, Button, Card, ErrorBanner, Row, T, ToggleRow } from '../ui';

/**
 * Customer portal access for one customer (managers only): the company portal
 * link, how many signed-in sessions are active, revoke, and on/off.
 */
export function PortalCard({ customerId, enabled, email, onChanged }: { customerId: string; enabled: boolean; email: string | null; onChanged: () => void }) {
  const { org } = useOrg();
  const [error, setError] = useState<string | null>(null);
  const link = PORTAL_URL ? `${PORTAL_URL.replace(/\/$/, '')}/portal/c/${org.public_slug}` : null;

  const q = useQuery(async () => {
    const { count, error: e } = await supabase.from('portal_sessions').select('id', { count: 'exact', head: true })
      .eq('customer_id', customerId).is('revoked_at', null).gt('expires_at', new Date().toISOString());
    if (e) throw e;
    return count ?? 0;
  }, [customerId]);
  const active = q.data ?? 0;

  const revoke = async () => {
    const { error: e } = await supabase.rpc('revoke_portal_access', { p_customer: customerId });
    if (e) throw new Error(friendlyError(e.message));
  };

  const toggle = async (v: boolean) => {
    setError(null);
    try {
      const { error: e } = await supabase.from('customers').update({ portal_enabled: v }).eq('id', customerId);
      if (e) throw new Error(friendlyError(e.message));
      if (!v && active) await revoke();
      onChanged();
      q.reload();
    } catch (e: any) {
      setError(e.message);
    }
  };

  return (
    <Card>
      <ErrorBanner message={error ?? q.error} />
      <ToggleRow label="Portal access" value={enabled} onChange={toggle}
        hint={enabled ? 'They can sign in with a one-time code sent to their email.' : 'Portal sign-in is turned off for this customer.'} />
      {enabled && !email ? <T variant="small" style={{ color: colors.warning, marginBottom: space.md }}>Add an email address so they can sign in.</T> : null}
      {link ? (
        <>
          <T variant="muted">Portal link</T>
          <T style={{ color: colors.primaryText, marginBottom: space.md }}>{link}</T>
          <Row style={{ flexWrap: 'wrap', marginBottom: space.md }}>
            <Button small kind="secondary" icon="copy-outline" title="Copy" onPress={async () => { await Clipboard.setStringAsync(link); notify('Link copied'); }} />
            <Button small kind="secondary" icon="share-outline" title="Share" onPress={async () => {
              try { await Share.share({ message: `See your jobs, photos, quotes and invoices here: ${link}` }); } catch { /* dismissed */ }
            }} />
          </Row>
        </>
      ) : <T variant="small" style={{ marginBottom: space.md }}>The portal web address isn&apos;t set up yet.</T>}
      <Row style={{ justifyContent: 'space-between' }}>
        <Row gap={space.sm}>
          <T variant="muted">Signed in now</T>
          <Badge label={q.loading ? '…' : `${active} session${active === 1 ? '' : 's'}`} tone={active ? 'success' : 'neutral'} raw />
        </Row>
        {active ? (
          <Button small kind="ghost" icon="log-out-outline" title="Revoke access"
            onPress={() => confirmAction('Revoke portal access?', 'They will be signed out everywhere and need a new code to get back in.', async () => {
              try { await revoke(); q.reload(); } catch (e: any) { setError(e.message); }
            })} />
        ) : null}
      </Row>
    </Card>
  );
}

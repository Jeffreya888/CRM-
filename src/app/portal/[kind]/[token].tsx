import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { PortalShell } from '../../../components/portal/PortalShell';
import { PublicInvoice } from '../../../components/portal/PublicInvoice';
import { PublicQuote } from '../../../components/portal/PublicQuote';
import { loadPublicDoc, publicError, type PublicDoc } from '../../../components/portal/publicDoc';
import { EmptyState, ErrorBanner, Loading } from '../../../components/ui';

/**
 * Public customer page for a quote or invoice link (no login), e.g.
 * PORTAL_URL/portal/quote/<token>. Quotes: choose a package, accept and sign,
 * pay a deposit, suggest dates or decline. Invoices: view and pay.
 * Stripe returns with ?paid=1 (invoice) or ?deposit=paid|cancelled (quote).
 */
export default function PublicDocumentPage() {
  const { kind, token, paid, deposit } = useLocalSearchParams<{ kind: string; token: string; paid?: string; deposit?: string }>();
  const [doc, setDoc] = useState<PublicDoc | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (force = false) => {
    try {
      const d = await loadPublicDoc(kind, token, force);
      setDoc(d);
      setError(null);
    } catch (e: any) {
      setError(publicError(e.message));
      setDoc((x) => (x === undefined ? null : x));
    } finally {
      setRefreshing(false);
    }
  }, [kind, token]);

  useEffect(() => {
    let alive = true;
    loadPublicDoc(kind, token)
      .then((d) => { if (alive) { setDoc(d); setError(null); } })
      .catch((e: any) => { if (alive) { setError(publicError(e.message)); setDoc(null); } });
    return () => { alive = false; };
  }, [kind, token]);

  if (kind !== 'quote' && kind !== 'invoice') {
    return <PortalShell title="Not found"><EmptyState icon="document-outline" title="Page not found" body="Check the link and try again." /></PortalShell>;
  }
  if (doc === undefined) return <Loading />;
  if (!doc) {
    return (
      <PortalShell title="Not found">
        <ErrorBanner message={error} onRetry={() => load(true)} />
        <EmptyState icon="document-outline" title={`${kind === 'quote' ? 'Quote' : 'Invoice'} not found`}
          body="This link may have expired or been replaced. Contact the business that sent it." />
      </PortalShell>
    );
  }

  const isQuote = doc.kind === 'quote';
  return (
    <PortalShell
      title={`${isQuote ? 'Quote' : 'Invoice'} ${doc.doc.number} · ${doc.org.name}`}
      brand={doc.org}
      refreshing={refreshing}
      onRefresh={isQuote ? undefined : () => { setRefreshing(true); load(true); }}
    >
      {isQuote ? (
        <PublicQuote d={doc} token={token} depositReturn={deposit === 'paid' || deposit === 'success' ? 'paid' : deposit === 'cancelled' || deposit === 'cancel' ? 'cancelled' : null} />
      ) : (
        <PublicInvoice d={doc} token={token} paid={!!paid && paid !== '0'} />
      )}
    </PortalShell>
  );
}

import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { PortalDashboard } from '../../../components/portal/PortalDashboard';
import { PortalLogin } from '../../../components/portal/PortalLogin';
import { PortalShell } from '../../../components/portal/PortalShell';
import { ErrorBanner, Loading } from '../../../components/ui';
import {
  clearPortalSession, fetchPortalData, fetchPortalFiles, loadPortalSession, PortalSessionExpired,
  type PortalData, type PortalSession,
} from '../../../lib/portal';

/**
 * Customer portal for one company: PORTAL_URL/portal/c/<org.public_slug>.
 * Email one-time-code sign-in; the session token is remembered per company
 * on this device until it expires or the company revokes access.
 */
export default function CustomerPortal() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const [session, setSession] = useState<PortalSession | null | undefined>(undefined);
  const [data, setData] = useState<PortalData | null>(null);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    let alive = true;
    loadPortalSession(slug).then((s) => { if (alive) setSession(s); });
    return () => { alive = false; };
  }, [slug]);

  const expire = useCallback(async () => {
    await clearPortalSession(slug);
    setData(null);
    setSession(null);
    setNotice('Your sign-in has expired. Enter your email to get a new code.');
  }, [slug]);

  // Photo links are short-lived, so sign them for the most recent visits only.
  const signPhotos = (token: string, d: PortalData) => {
    const paths = d.past_jobs.slice(0, 12).flatMap((j) => (j.photos ?? []).map((p) => p.path)).slice(0, 80);
    fetchPortalFiles(token, paths).then(setUrls).catch(() => {});
  };

  const load = useCallback(async (s: PortalSession) => {
    try {
      const d = await fetchPortalData(s.token);
      setData(d);
      setError(null);
      signPhotos(s.token, d);
    } catch (e: any) {
      if (e instanceof PortalSessionExpired) await expire();
      else setError(e.message);
    } finally {
      setRefreshing(false);
    }
  }, [expire]);

  useEffect(() => {
    if (!session) return;
    let alive = true;
    fetchPortalData(session.token)
      .then((d) => {
        if (!alive) return;
        setData(d);
        setError(null);
        signPhotos(session.token, d);
      })
      .catch((e: any) => {
        if (!alive) return;
        if (e instanceof PortalSessionExpired) expire();
        else setError(e.message);
      });
    return () => { alive = false; };
  }, [session, expire]);

  const signOut = async () => {
    await clearPortalSession(slug);
    setData(null);
    setUrls({});
    setNotice(null);
    setSession(null);
  };

  if (session === undefined) return <Loading />;

  if (!session) {
    return (
      <PortalShell title="Customer portal">
        <PortalLogin slug={slug} notice={notice} onSignedIn={(s) => { setNotice(null); setSession(s); }} />
      </PortalShell>
    );
  }

  if (!data) {
    return error ? (
      <PortalShell title="Customer portal">
        <ErrorBanner message={error} onRetry={() => load(session)} />
      </PortalShell>
    ) : <Loading />;
  }

  return (
    <PortalShell title={`${data.org.name} · Customer portal`} refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(session); }}>
      <ErrorBanner message={error} onRetry={() => load(session)} />
      <PortalDashboard data={data} token={session.token} photoUrls={urls} onSignOut={signOut} onChanged={() => load(session)} />
    </PortalShell>
  );
}

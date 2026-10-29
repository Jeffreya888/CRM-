import { Platform } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { supabase } from '../../lib/supabase';
import type { LineItem, QuoteOption } from '../../lib/types';

/** Shape returned by public.get_public_document (see supabase/migrations/20261017000300_sales.sql). */
export interface PublicDoc {
  kind: 'quote' | 'invoice';
  doc: Record<string, any>;
  items: LineItem[];
  options?: QuoteOption[];
  photo_count?: number;
  superseded?: boolean;
  job_requested?: boolean;
  org: {
    name: string; email: string | null; phone: string | null; address: string | null; logo_url: string | null; currency?: string;
    accepts_cards: boolean; timezone?: string; google_review_url?: string | null; website?: string | null;
    /** 'direct' shows "pay your detailer directly"; 'square' pays with Square's card form on the page. */
    payment_mode?: 'stripe' | 'square' | 'direct';
  };
  customer: { name: string; company: string | null; email: string | null; billing_address: string | null };
  aircraft: { tail_number: string; model: string | null; asset_type: string } | null;
}

// Opening a quote counts as a view, so never fetch the same link twice in a burst
// (mount + focus, React strict mode).
const cache = new Map<string, { at: number; p: Promise<PublicDoc | null> }>();

export function loadPublicDoc(kind: string, token: string, force = false): Promise<PublicDoc | null> {
  const key = `${kind}:${token}`;
  const hit = cache.get(key);
  if (!force && hit && Date.now() - hit.at < 15000) return hit.p;
  const p = (async () => {
    const { data, error } = await supabase.rpc('get_public_document', { p_kind: kind, p_token: token });
    if (error) throw new Error(error.message);
    return (data ?? null) as PublicDoc | null;
  })();
  cache.set(key, { at: Date.now(), p });
  p.catch(() => cache.delete(key));
  return p;
}

/** Sends the visitor to a hosted checkout page (Stripe). */
export async function goToCheckout(url: string) {
  if (Platform.OS === 'web' && typeof window !== 'undefined') window.location.href = url;
  else await WebBrowser.openBrowserAsync(url);
}

/** Strips a leading "CODE: " from database errors for customer-facing text. */
export const publicError = (m: string) => m.replace(/^[A-Z_]+:\s*/, '');

import * as Clipboard from 'expo-clipboard';
import { Share } from 'react-native';
import { documentHtml, portalLink, sharePdf } from '../lib/documents';
import { callFunction, supabase } from '../lib/supabase';
import type { Organization } from '../lib/types';
import { notify } from './FormSheet';

/** Loads everything needed to render a quote/invoice PDF. */
export async function loadDocument(kind: 'quote' | 'invoice', id: string) {
  const table = kind === 'quote' ? 'quotes' : 'invoices';
  const [d, items, extra] = await Promise.all([
    supabase.from(table).select('*, customer:customers(*), aircraft:aircraft(tail_number, manufacturer, model, asset_type)').eq('id', id).single(),
    supabase.from(kind === 'quote' ? 'quote_items' : 'invoice_items').select('*').eq(kind === 'quote' ? 'quote_id' : 'invoice_id', id).order('sort_order'),
    kind === 'quote'
      ? supabase.from('quote_options').select('*').eq('quote_id', id).order('sort_order')
      : supabase.from('payments').select('amount, method, reference, received_at').eq('invoice_id', id).order('received_at'),
  ]);
  if (d.error) throw d.error;
  return {
    doc: d.data as any,
    items: (items.data ?? []) as any[],
    options: kind === 'quote' ? ((extra.data ?? []) as any[]) : [],
    payments: kind === 'invoice' ? ((extra.data ?? []) as any[]) : [],
  };
}

/**
 * Company details for a document: sent invoices keep the snapshot taken when
 * they were sent, so later edits to the company profile don't change them.
 */
export function orgForDocument(org: Organization, snapshot: Record<string, string | null> | null | undefined): Organization {
  if (!snapshot) return org;
  const pick = (k: keyof Organization) => (k in snapshot ? (snapshot[k as string] as any) : org[k]);
  return { ...org, name: pick('name') ?? org.name, email: pick('email'), phone: pick('phone'), address: pick('address'), website: pick('website'), logo_url: pick('logo_url') };
}

export async function exportPdf(org: Organization, kind: 'quote' | 'invoice', id: string) {
  const { doc, items, options, payments } = await loadDocument(kind, id);
  const snapshot = kind === 'invoice' ? (doc.org_snapshot as Record<string, string | null> | null) : null;
  const html = documentHtml({
    org: orgForDocument(org, snapshot),
    kind,
    doc,
    items,
    customer: doc.customer,
    aircraft: doc.aircraft,
    options,
    payments,
    reviewUrl: kind === 'invoice' ? (snapshot?.google_review_url ?? org.google_review_url) : null,
    directPayment: kind === 'invoice' && org.payment_mode === 'direct',
  });
  await sharePdf(html, `${kind === 'quote' ? 'Quote' : 'Invoice'} ${doc.number}.pdf`);
}

export async function emailDocument(kind: 'quote' | 'invoice', id: string) {
  const r = await callFunction<{ sent: boolean }>('send-document', { kind, id });
  if (r.sent) notify('Sent', `The ${kind} was emailed to the customer with a link to ${kind === 'quote' ? 'accept it' : 'pay online'}.`);
}

export async function shareLink(kind: 'quote' | 'invoice', token: string, number: string, orgName: string) {
  const link = portalLink(kind, token);
  if (!link) return notify('Portal not configured', 'Set EXPO_PUBLIC_PORTAL_URL to share online links.');
  await Share.share({
    message: `${orgName}: ${kind === 'quote' ? 'Quote' : 'Invoice'} ${number}. ${kind === 'quote' ? 'Review and accept' : 'View and pay'} here: ${link}`,
    url: link,
  });
}

/** Copies the customer link for a quote or invoice. */
export async function copyLink(kind: 'quote' | 'invoice', token: string) {
  const link = portalLink(kind, token);
  if (!link) return notify('Portal not configured', 'Set EXPO_PUBLIC_PORTAL_URL to share online links.');
  await Clipboard.setStringAsync(link);
  notify('Link copied', link);
}

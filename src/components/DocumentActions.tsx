import { Share } from 'react-native';
import { documentHtml, portalLink, sharePdf } from '../lib/documents';
import { callFunction, supabase } from '../lib/supabase';
import type { Organization } from '../lib/types';
import { notify } from './FormSheet';

/** Loads everything needed to render a quote/invoice PDF. */
export async function loadDocument(kind: 'quote' | 'invoice', id: string) {
  const table = kind === 'quote' ? 'quotes' : 'invoices';
  const [d, items] = await Promise.all([
    supabase.from(table).select('*, customer:customers(*), aircraft:aircraft(tail_number, manufacturer, model)').eq('id', id).single(),
    supabase.from(kind === 'quote' ? 'quote_items' : 'invoice_items').select('*').eq(kind === 'quote' ? 'quote_id' : 'invoice_id', id).order('sort_order'),
  ]);
  if (d.error) throw d.error;
  return { doc: d.data as any, items: (items.data ?? []) as any[] };
}

export async function exportPdf(org: Organization, kind: 'quote' | 'invoice', id: string) {
  const { doc, items } = await loadDocument(kind, id);
  const html = documentHtml({ org, kind, doc, items, customer: doc.customer, aircraft: doc.aircraft });
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

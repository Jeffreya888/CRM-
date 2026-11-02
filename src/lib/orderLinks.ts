// "Order online" links for supplies bought from web stores. Groups low items by
// store and, where the store allows it, builds one link that opens a cart already
// filled with the right items and quantities:
//   - Shopify stores: the product link must include ?variant=<id> (it does when a
//     size or option is picked on the product page) → https://store/cart/<id>:<qty>,…
//   - Amazon: the link includes /dp/<ASIN> → Amazon's add-to-cart page.
// Other stores get the list of product links. The person reviews and pays on the
// store's own site; Tarmo never places or pays for an order.
// Kept in sync with supabase/functions/_shared/orderLinks.ts (same logic, Deno copy).

export type OnlineItem = { name: string; url: string; qty: number };
export type StoreCart = { store: string; cartUrl: string | null; items: OnlineItem[] };

const AMAZON = /(^|\.)amazon\.[a-z.]+$/i;
const ASIN = /\/(?:dp|gp\/product)\/([A-Z0-9]{10})(?:[/?]|$)/i;

function parse(raw: string): URL | null {
  try {
    const u = new URL(/^https?:\/\//i.test(raw.trim()) ? raw.trim() : `https://${raw.trim()}`);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u : null;
  } catch {
    return null;
  }
}

/** Groups online items by store and builds a pre-filled cart link where possible. */
export function buildCarts(items: OnlineItem[]): StoreCart[] {
  const byStore = new Map<string, { host: string; items: (OnlineItem & { u: URL })[] }>();
  for (const it of items) {
    const u = parse(it.url);
    if (!u) continue;
    const host = u.hostname.replace(/^www\./, '').toLowerCase();
    const g = byStore.get(host) ?? { host: u.hostname, items: [] };
    g.items.push({ ...it, qty: Math.max(1, Math.ceil(it.qty)), u });
    byStore.set(host, g);
  }
  return [...byStore.entries()].map(([store, g]) => {
    const clean = g.items.map(({ u, ...rest }) => ({ ...rest, url: u.toString() }));
    if (AMAZON.test(store)) {
      const asins = g.items.map((i) => i.u.pathname.match(ASIN)?.[1]?.toUpperCase());
      if (asins.every(Boolean)) {
        const q = asins.map((a, n) => `ASIN.${n + 1}=${a}&Quantity.${n + 1}=${g.items[n]!.qty}`).join('&');
        return { store, cartUrl: `https://${g.host}/gp/aws/cart/add.html?${q}`, items: clean };
      }
      return { store, cartUrl: null, items: clean };
    }
    const variants = g.items.map((i) => i.u.searchParams.get('variant'));
    if (variants.every((v) => v && /^\d+$/.test(v))) {
      const lines = variants.map((v, n) => `${v}:${g.items[n]!.qty}`).join(',');
      return { store, cartUrl: `https://${g.host}/cart/${lines}`, items: clean };
    }
    return { store, cartUrl: null, items: clean };
  });
}

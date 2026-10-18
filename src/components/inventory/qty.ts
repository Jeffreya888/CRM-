// Decimal supply quantities (up to 3 decimals, e.g. 0.25 gal). See docs/competitive-edge.md §8.

/** Parses a typed quantity ("2", "0.25", "1,5"); null when invalid, negative or more than 3 decimals. */
export function parseQty(s: string | null | undefined, { allowNegative = false } = {}): number | null {
  const t = String(s ?? '').trim().replace(',', '.');
  if (!(allowNegative ? /^-?(\d+\.?\d{0,3}|\.\d{1,3})$/ : /^(\d+\.?\d{0,3}|\.\d{1,3})$/).test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** True when a number has at most 3 decimals. */
export const hasMax3Decimals = (n: number) => Math.abs(Math.round(n * 1000) - n * 1000) < 1e-6;

/** "2", "0.25", "1.125". */
export const fmtQty = (n: number | string | null | undefined) => String(+Number(n ?? 0).toFixed(3));

/** Keeps what a person types to a decimal number with at most 3 decimals. */
export function cleanQtyInput(v: string, allowNegative = false): string {
  const neg = allowNegative && v.trim().startsWith('-');
  const t = v.replace(',', '.').replace(/[^0-9.]/g, '');
  const [a, ...rest] = t.split('.');
  return (neg ? '-' : '') + (rest.length ? `${a}.${rest.join('').slice(0, 3)}` : a ?? '');
}

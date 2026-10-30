// Supply room & equipment helpers (types, labels, scanning, QR labels, files).
import * as DocumentPicker from 'expo-document-picker';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';
import type { Tone } from './theme';
import { signedUrls, uploadFile } from './files';

// ---------------------------------------------------------------------------
// Types (mirror supabase/migrations/20261017000200_operations.sql)
// ---------------------------------------------------------------------------
export interface InventoryItem {
  id: string; org_id: string; name: string; sku: string | null; barcode: string | null; category: string | null;
  unit: string; quantity: number; par_level: number; reorder_qty: number; unit_cost: number;
  vendor: string | null; vendor_url: string | null; vendor_email: string | null; sds_path: string | null;
  approved_for: string | null; expires_on: string | null; active: boolean; created_at: string;
}

export type MovementReason = 'purchase' | 'job_use' | 'adjustment' | 'waste' | 'count' | 'transfer';
export interface Movement {
  id: string; org_id: string; item_id: string; delta: number; reason: MovementReason; job_id: string | null;
  stock_location_id: string | null; unit_cost: number | null; auto: boolean; note: string | null;
  created_by: string | null; created_at: string;
}

export type StockLocationKind = 'shop' | 'van' | 'branch' | 'hangar' | 'other';
export interface StockLocation { id: string; org_id: string; name: string; kind: StockLocationKind; branch_id: string | null; active: boolean }
export interface StockByLocation { item_id: string; stock_location_id: string | null; quantity: number }

export type EquipmentStatus = 'in_service' | 'needs_service' | 'out_of_service' | 'retired';
export interface Equipment {
  id: string; org_id: string; name: string; serial_number: string | null; category: string | null; status: EquipmentStatus;
  purchased_on: string | null; purchase_cost: number | null; last_serviced_on: string | null; next_service_due: string | null;
  notes: string | null; bookable: boolean; usage_hours: number; warranty_expires_on: string | null;
  assigned_user_id: string | null; assigned_label: string | null; location_id: string | null; branch_id: string | null;
  photo_path: string | null; qr_token: string; created_at: string;
}
export interface MaintenanceDue {
  id: string; org_id: string; equipment_id: string; name: string; every_days: number | null; every_hours: number | null;
  last_done_on: string | null; last_done_hours: number | null; notes: string | null; created_at: string;
  equipment_name: string; usage_hours: number; next_due_on: string | null; next_due_hours: number | null;
}
export interface ServiceLog {
  id: string; equipment_id: string; maintenance_id: string | null; performed_on: string; hours_at: number | null;
  cost: number; vendor: string | null; notes: string | null; receipt_path: string | null; expense_id: string | null;
  created_by: string | null; created_at: string;
}
export type EquipFileKind = 'manual' | 'warranty' | 'receipt' | 'photo' | 'other';
export interface EquipFile { id: string; equipment_id: string; kind: EquipFileKind; title: string; storage_path: string; created_at: string }
export interface EquipIssue {
  id: string; equipment_id: string; reported_by: string | null; description: string; photo_path: string | null;
  status: 'open' | 'resolved'; resolved_at: string | null; created_at: string;
}

// ---------------------------------------------------------------------------
// Labels
// ---------------------------------------------------------------------------
export const REASON_LABELS: Record<MovementReason, { label: string; icon: 'cart-outline' | 'construct-outline' | 'create-outline' | 'trash-outline' | 'clipboard-outline' | 'swap-horizontal-outline'; tone: Tone }> = {
  purchase: { label: 'Purchase / received', icon: 'cart-outline', tone: 'success' },
  job_use: { label: 'Used on job', icon: 'construct-outline', tone: 'primary' },
  adjustment: { label: 'Adjustment', icon: 'create-outline', tone: 'neutral' },
  waste: { label: 'Waste / damaged', icon: 'trash-outline', tone: 'danger' },
  count: { label: 'Count correction', icon: 'clipboard-outline', tone: 'warning' },
  transfer: { label: 'Transfer', icon: 'swap-horizontal-outline', tone: 'info' },
};

export const STOCK_LOCATION_KINDS: { value: StockLocationKind; label: string }[] = [
  { value: 'shop', label: 'Shop' },
  { value: 'van', label: 'Van / truck' },
  { value: 'branch', label: 'Branch' },
  { value: 'hangar', label: 'Hangar' },
  { value: 'other', label: 'Other' },
];

export const EQUIPMENT_STATUS: Record<EquipmentStatus, { label: string; tone: Tone; hint: string }> = {
  in_service: { label: 'In service', tone: 'success', hint: 'Working and available.' },
  needs_service: { label: 'Needs service', tone: 'warning', hint: 'Still usable, but needs attention soon.' },
  out_of_service: { label: 'Out of service', tone: 'danger', hint: 'Locked: it cannot be booked on jobs until it is back in service.' },
  retired: { label: 'Retired', tone: 'neutral', hint: 'No longer used. Kept for history.' },
};

export const FILE_KINDS: { value: EquipFileKind; label: string }[] = [
  { value: 'manual', label: 'Manual' },
  { value: 'warranty', label: 'Warranty' },
  { value: 'receipt', label: 'Receipt' },
  { value: 'photo', label: 'Photo' },
  { value: 'other', label: 'Other' },
];

// ---------------------------------------------------------------------------
// Date & stock helpers
// ---------------------------------------------------------------------------
export function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Whole days from today until a yyyy-MM-dd date (negative when past). */
export function daysUntil(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  const target = new Date(y!, m! - 1, d!);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((target.getTime() - today.getTime()) / 864e5);
}

export function daysLabel(n: number): string {
  if (n === 0) return 'today';
  if (n === 1) return 'tomorrow';
  if (n === -1) return 'yesterday';
  return n > 0 ? `in ${n} days` : `${-n} days ago`;
}

export const isLow = (i: Pick<InventoryItem, 'quantity' | 'par_level'>) => Number(i.par_level) > 0 && Number(i.quantity) <= Number(i.par_level);

export const EXPIRY_WARN_DAYS = 30;
/** Expiry state of a supply: null when fine or no date. */
export function expiryBadge(expires_on: string | null): { label: string; tone: Tone } | null {
  const d = daysUntil(expires_on);
  if (d == null) return null;
  if (d < 0) return { label: 'Expired', tone: 'danger' };
  if (d <= EXPIRY_WARN_DAYS) return { label: d === 0 ? 'Expires today' : `Expires ${daysLabel(d)}`, tone: 'warning' };
  return null;
}

export const WARRANTY_WARN_DAYS = 60;
export function warrantyBadge(iso: string | null): { label: string; tone: Tone } | null {
  const d = daysUntil(iso);
  if (d == null) return null;
  if (d < 0) return { label: 'Warranty expired', tone: 'neutral' };
  if (d <= WARRANTY_WARN_DAYS) return { label: `Warranty expires ${daysLabel(d)}`, tone: 'warning' };
  return null;
}

export const SOON_DAYS = 14;
export const SOON_HOURS = 10;
export type DueState = 'overdue' | 'soon' | 'ok';
/** Due status of a maintenance schedule by date and/or usage hours. */
export function maintenanceState(m: Pick<MaintenanceDue, 'next_due_on' | 'next_due_hours'>, usageHours: number): { state: DueState; label: string } {
  const parts: string[] = [];
  let state: DueState = 'ok';
  const bump = (s: DueState) => { if (s === 'overdue' || (s === 'soon' && state === 'ok')) state = s; };
  const d = daysUntil(m.next_due_on);
  if (d != null) {
    bump(d < 0 ? 'overdue' : d <= SOON_DAYS ? 'soon' : 'ok');
    parts.push(d < 0 ? `${-d} days overdue` : `due ${daysLabel(d)}`);
  }
  if (m.next_due_hours != null) {
    const left = Number(m.next_due_hours) - Number(usageHours || 0);
    bump(left <= 0 ? 'overdue' : left <= SOON_HOURS ? 'soon' : 'ok');
    parts.push(left <= 0 ? `${fmtNum(-left)} h over` : `${fmtNum(left)} h left (at ${fmtNum(m.next_due_hours)} h)`);
  }
  return { state, label: parts.join(' · ') || 'No schedule' };
}

export const fmtNum = (n: number | string | null | undefined) => {
  const v = Number(n ?? 0);
  return Number.isInteger(v) ? String(v) : String(Math.round(v * 1000) / 1000);  // supplies can be fractional (0.25 gal)
};

/** Accepts only whole, non-negative numbers typed by a person ("12", " 3 "). */
export function parseWhole(s: string | null | undefined): number | null {
  const t = String(s ?? '').trim();
  if (!/^\d+$/.test(t)) return null;
  return Number(t);
}

// ---------------------------------------------------------------------------
// Scanning & QR labels
// ---------------------------------------------------------------------------
export const APP_SCHEME = 'tarmo';
export const equipmentQrUrl = (token: string) => `${APP_SCHEME}://equipment/${token}`;

export type ScanResult = { kind: 'equipment'; token: string } | { kind: 'code'; code: string };
/** Recognises our equipment QR labels; anything else is a product barcode. */
export function parseScan(raw: string): ScanResult {
  const text = raw.trim();
  const m = /^(?:tarmo:\/\/|https?:\/\/[^/]+\/)(?:equipment\/(?:qr\/)?)([A-Za-z0-9]+)\/?$/i.exec(text);
  if (m) return { kind: 'equipment', token: m[1]! };
  return { kind: 'code', code: text };
}

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// react-native-qrcode-svg's own matrix generator (uses the bundled `qrcode` package).
// eslint-disable-next-line @typescript-eslint/no-require-imports
const genMatrix: (value: string, ecl: string) => number[][] = require('react-native-qrcode-svg/src/genMatrix').default;

/** Standalone SVG markup for a QR code (for printing). */
export function qrSvg(value: string, size = 160): string {
  const matrix = genMatrix(value, 'M');
  const n = matrix.length;
  const quiet = 2;
  const total = n + quiet * 2;
  let rects = '';
  matrix.forEach((row, y) => row.forEach((on, x) => {
    if (on) rects += `<rect x="${x + quiet}" y="${y + quiet}" width="1" height="1"/>`;
  }));
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${total} ${total}" shape-rendering="crispEdges"><rect width="${total}" height="${total}" fill="#fff"/><g fill="#000">${rects}</g></svg>`;
}

const esc = (s: string | null | undefined) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

/** Printable sheet of equipment QR labels. */
export function labelsHtml(items: Pick<Equipment, 'name' | 'serial_number' | 'qr_token' | 'assigned_label'>[], company?: string | null): string {
  const labels = items.map((e) => `
    <div class="label">
      ${qrSvg(equipmentQrUrl(e.qr_token), 150)}
      <div class="name">${esc(e.name)}</div>
      ${e.serial_number ? `<div class="meta">S/N ${esc(e.serial_number)}</div>` : ''}
      ${e.assigned_label ? `<div class="meta">${esc(e.assigned_label)}</div>` : ''}
      <div class="hint">${company ? esc(company) + ' · ' : ''}Scan in Tarmo to view history or report a problem</div>
    </div>`).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Equipment labels</title>
  <style>
    @page { margin: 12mm; }
    body { font-family: -apple-system, Helvetica, Arial, sans-serif; margin: 0; color: #000; }
    .sheet { display: flex; flex-wrap: wrap; gap: 8mm; }
    .label { width: 62mm; border: 1px dashed #999; border-radius: 3mm; padding: 4mm; text-align: center; page-break-inside: avoid; break-inside: avoid; }
    .label svg { width: 40mm; height: 40mm; }
    .name { font-weight: 700; font-size: 13pt; margin-top: 2mm; }
    .meta { font-size: 10pt; margin-top: 1mm; }
    .hint { font-size: 7pt; color: #555; margin-top: 2mm; }
  </style></head><body><div class="sheet">${labels}</div></body></html>`;
}

// ---------------------------------------------------------------------------
// Files
// ---------------------------------------------------------------------------
/** Opens a private storage file (PDF, image) through a short-lived signed link. */
export async function openStorageFile(path: string) {
  const urls = await signedUrls([path], 600);
  const url = urls[path];
  if (!url) throw new Error('Could not open the file. Try again.');
  if (Platform.OS === 'web') { await Linking.openURL(url); return; }
  await WebBrowser.openBrowserAsync(url);
}

/** Lets the person pick a document; returns the uploaded storage path and file name, or null. */
export async function pickAndUploadDocument(orgId: string, folder: string, type: string | string[] = '*/*'): Promise<{ path: string; name: string; mime: string } | null> {
  const res = await DocumentPicker.getDocumentAsync({ type, copyToCacheDirectory: true, multiple: false });
  if (res.canceled || !res.assets?.[0]) return null;
  const a = res.assets[0];
  const mime = a.mimeType ?? (a.name.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'application/octet-stream');
  const ext = (a.name.includes('.') ? a.name.split('.').pop() : mime.split('/').pop()) ?? 'bin';
  const path = await uploadFile(orgId, folder, a.uri, mime, ext.toLowerCase());
  return { path, name: a.name, mime };
}

/** Prefilled email to a vendor for one item. */
export function reorderMailto(item: Pick<InventoryItem, 'name' | 'sku' | 'unit' | 'reorder_qty' | 'par_level' | 'quantity' | 'vendor_email'>, company?: string | null): string | null {
  if (!item.vendor_email) return null;
  const qty = Number(item.reorder_qty) || Math.max(1, Number(item.par_level) * 2 - Number(item.quantity));
  const subject = `Order: ${item.name}`;
  const body = `Hello,\n\nPlease send:\n\n${qty} ${item.unit} — ${item.name}${item.sku ? ` (SKU ${item.sku})` : ''}\n\nThank you,\n${company ?? ''}`;
  return `mailto:${encodeURIComponent(item.vendor_email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

export function normalizeUrl(u: string): string {
  const t = u.trim();
  return /^https?:\/\//i.test(t) ? t : `https://${t}`;
}

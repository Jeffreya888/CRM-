// Spreadsheet import: read a CSV (from Excel, Google Sheets, Fieldd, Jobber, Housecall Pro, Shiny Jets…),
// guess which column is which, and turn rows into what the import functions expect.

export type ImportKind = 'customers' | 'assets' | 'services';

export const IMPORT_FIELDS: Record<ImportKind, { key: string; label: string; required?: boolean; synonyms: string[] }[]> = {
  customers: [
    { key: 'name', label: 'Name', required: true, synonyms: ['name', 'customer', 'customer name', 'client', 'client name', 'full name', 'contact', 'contact name', 'display name'] },
    { key: 'first', label: 'First name', synonyms: ['first name', 'first', 'firstname', 'given name'] },
    { key: 'last', label: 'Last name', synonyms: ['last name', 'last', 'lastname', 'surname', 'family name'] },
    { key: 'company', label: 'Company', synonyms: ['company', 'company name', 'business', 'business name', 'organization', 'account'] },
    { key: 'email', label: 'Email', synonyms: ['email', 'e-mail', 'email address', 'primary email'] },
    { key: 'phone', label: 'Phone', synonyms: ['phone', 'phone number', 'mobile', 'cell', 'telephone', 'primary phone', 'mobile phone'] },
    { key: 'address', label: 'Address', synonyms: ['address', 'billing address', 'street', 'street address', 'address 1', 'service address'] },
    { key: 'notes', label: 'Notes', synonyms: ['notes', 'note', 'comments', 'description'] },
  ],
  assets: [
    { key: 'tail', label: 'Tail number / plate / boat name', required: true, synonyms: ['tail', 'tail number', 'tail #', 'n-number', 'n number', 'registration', 'reg', 'plate', 'license plate', 'vessel', 'vessel name', 'boat name', 'hull', 'aircraft', 'vehicle', 'name'] },
    { key: 'type', label: 'Type (aircraft, car, boat)', synonyms: ['type', 'asset type', 'category', 'kind'] },
    { key: 'make', label: 'Make', synonyms: ['make', 'manufacturer', 'mfr', 'brand', 'builder'] },
    { key: 'model', label: 'Model', synonyms: ['model', 'aircraft model', 'vehicle model'] },
    { key: 'year', label: 'Year', synonyms: ['year', 'model year', 'yr'] },
    { key: 'serial', label: 'Serial / VIN / hull ID', synonyms: ['serial', 'serial number', 's/n', 'sn', 'vin', 'hull id', 'hin'] },
    { key: 'owner', label: 'Owner (name or email)', synonyms: ['owner', 'customer', 'customer name', 'client', 'owner name', 'owner email', 'customer email'] },
    { key: 'notes', label: 'Notes', synonyms: ['notes', 'note', 'comments'] },
  ],
  services: [
    { key: 'name', label: 'Service', required: true, synonyms: ['service', 'service name', 'name', 'item', 'product', 'description'] },
    { key: 'price', label: 'Price', required: true, synonyms: ['price', 'rate', 'amount', 'cost', 'unit price', 'base price'] },
    { key: 'hours', label: 'Hours', synonyms: ['hours', 'duration', 'time', 'est hours', 'estimated hours', 'labor hours'] },
    { key: 'category', label: 'Category', synonyms: ['category', 'group', 'type'] },
    { key: 'type', label: 'For (aircraft, car, boat)', synonyms: ['for', 'asset type', 'vehicle type'] },
  ],
};

/** RFC 4180 CSV: quoted fields, escaped quotes, commas/new lines inside quotes; also semicolon or tab files. */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, '');
  const firstLine = src.split(/\r?\n/, 1)[0] ?? '';
  const count = (ch: string) => firstLine.split(ch).length - 1;
  const delim = count('\t') > count(',') && count('\t') >= count(';') ? '\t' : count(';') > count(',') ? ';' : ',';
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') { field += '"'; i++; } else quoted = false;
      } else field += ch;
    } else if (ch === '"' && field === '') quoted = true;
    else if (ch === delim) { row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some((c) => c.trim() !== '')) rows.push(row);
      row = [];
    } else field += ch;
  }
  row.push(field);
  if (row.some((c) => c.trim() !== '')) rows.push(row);
  return rows;
}

/** Header compared without case, spaces, hyphens or punctuation: "E-mail", "e mail" and "EMAIL" all read "email". */
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9#/]/g, '');

/** Best column for each field: exact synonym match first, then a header that contains a synonym. */
export function guessColumns(kind: ImportKind, headers: string[]): Record<string, number | null> {
  const h = headers.map(norm);
  const used = new Set<number>();
  const out: Record<string, number | null> = {};
  for (const pass of ['exact', 'contains'] as const) {
    for (const f of IMPORT_FIELDS[kind]) {
      if (out[f.key] != null) continue;
      const idx = h.findIndex((x, i) => !used.has(i) && f.synonyms.map(norm).some((s) => (pass === 'exact' ? x === s : x.includes(s) && s.length >= 3)));
      if (idx >= 0) { out[f.key] = idx; used.add(idx); }
    }
  }
  for (const f of IMPORT_FIELDS[kind]) if (!(f.key in out)) out[f.key] = null;
  return out;
}

/** Rows (without the header) mapped to field objects for the import functions. */
export function mapRows(kind: ImportKind, rows: string[][], columns: Record<string, number | null>): Record<string, string>[] {
  return rows.map((r) => {
    const o: Record<string, string> = {};
    for (const f of IMPORT_FIELDS[kind]) {
      const i = columns[f.key];
      if (i != null && r[i] != null && r[i].trim() !== '') o[f.key] = r[i].trim();
    }
    if (kind === 'customers' && !o.name && (o.first || o.last)) o.name = [o.first, o.last].filter(Boolean).join(' ');
    delete o.first;
    delete o.last;
    return o;
  }).filter((o) => Object.keys(o).length > 0);
}

/** Rows that will be skipped as unusable (no name / identifier / price), for the preview. */
export function missingRequired(kind: ImportKind, rows: Record<string, string>[]): number {
  const req = IMPORT_FIELDS[kind].filter((f) => f.required).map((f) => f.key);
  return rows.filter((r) => req.some((k) => !r[k] && !(kind === 'customers' && k === 'name' && r.company))).length;
}

export const chunk = <T,>(xs: T[], n: number): T[][] => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n));

/**
 * CSV building + payroll export layouts (Finance & team area).
 *
 * Payroll layouts (one file per pay period):
 *
 * - **Gusto** ("Import hours" CSV, one row per person):
 *   `last_name, first_name, regular_hours, overtime_hours, double_overtime_hours, pay_period_start, pay_period_end`
 *   Hours are decimals with two places. Gusto matches people by first + last name, so
 *   make the team member display names match the names in Gusto.
 *
 * - **QuickBooks Online (time)** (time-activity import, one row per clock entry):
 *   `Date (MM/DD/YYYY), Employee, Customer, Service, Duration (hh:mm), Start time, End time, Billable, Description`
 *   Customer and Service come from the job the time was logged against (blank otherwise).
 *
 * - **ADP** (Workforce Now / RUN "paydata" batch, one row per person):
 *   `Co Code, Batch ID, File #, Employee Name, Reg Hours, O/T Hours, Rate, Period Start, Period End`
 *   Co Code and File # are left blank for you to fill in (ADP assigns them); Batch ID is
 *   `FR` + the period start date. Rate is only filled for owners/admins.
 *
 * - **Generic** (one row per clock entry, plus a totals row per person):
 *   `Employee, Date, Clock in, Clock out, Hours, Overtime hours (week), Job, Approved, Notes`
 */
import { format, parseISO } from 'date-fns';

export type Cell = string | number | boolean | null | undefined;

const esc = (v: Cell): string => {
  if (v == null) return '';
  const s = typeof v === 'number' ? (Number.isFinite(v) ? String(v) : '') : String(v);
  return /[",\n\r]/.test(s) || /^\s|\s$/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** Builds RFC 4180 CSV text (CRLF line endings, quoted when needed). */
export function toCsv(headers: string[], rows: Cell[][]): string {
  return [headers, ...rows].map((r) => r.map(esc).join(',')).join('\r\n') + '\r\n';
}

const h2 = (minutes: number) => Math.round((minutes / 60) * 100) / 100;
const hhmm = (minutes: number) => `${Math.floor(minutes / 60)}:${String(Math.round(minutes % 60)).padStart(2, '0')}`;

export function splitName(name: string): { first: string; last: string } {
  const parts = name.trim().split(/\s+/);
  if (parts.length < 2) return { first: parts[0] ?? '', last: '' };
  return { first: parts.slice(0, -1).join(' '), last: parts[parts.length - 1]! };
}

export interface PayrollPerson {
  user_id: string;
  name: string;
  minutes: number;
  overtime_minutes: number;
  hourly_rate: number | null;
}

export interface PayrollEntry {
  user_id: string;
  started_at: string;
  ended_at: string | null;
  approved: boolean;
  notes: string | null;
  job_number?: string | null;
  customer?: string | null;
  service?: string | null;
}

export type PayrollFormat = 'gusto' | 'quickbooks' | 'adp' | 'generic';
export const PAYROLL_FORMATS: { value: PayrollFormat; label: string; hint: string }[] = [
  { value: 'gusto', label: 'Gusto', hint: 'Hours import: regular + overtime per person' },
  { value: 'quickbooks', label: 'QuickBooks Online', hint: 'Time activities: one row per clock entry' },
  { value: 'adp', label: 'ADP', hint: 'Paydata batch: hours per person' },
  { value: 'generic', label: 'Spreadsheet (generic)', hint: 'Every clock entry with totals' },
];

const entryMinutes = (e: PayrollEntry) => (e.ended_at ? (new Date(e.ended_at).getTime() - new Date(e.started_at).getTime()) / 60000 : 0);

export function payrollCsv(fmt: PayrollFormat, period: { from: string; to: string }, people: PayrollPerson[], entries: PayrollEntry[]): string {
  const nameOf = (id: string) => people.find((p) => p.user_id === id)?.name ?? 'Team member';
  const withHours = people.filter((p) => p.minutes > 0);
  if (fmt === 'gusto') {
    return toCsv(
      ['last_name', 'first_name', 'regular_hours', 'overtime_hours', 'double_overtime_hours', 'pay_period_start', 'pay_period_end'],
      withHours.map((p) => {
        const n = splitName(p.name);
        return [n.last, n.first, h2(p.minutes - p.overtime_minutes).toFixed(2), h2(p.overtime_minutes).toFixed(2), '0.00', period.from, period.to];
      }),
    );
  }
  if (fmt === 'adp') {
    const batch = `FR${period.from.replace(/-/g, '')}`;
    return toCsv(
      ['Co Code', 'Batch ID', 'File #', 'Employee Name', 'Reg Hours', 'O/T Hours', 'Rate', 'Period Start', 'Period End'],
      withHours.map((p) => ['', batch, '', p.name, h2(p.minutes - p.overtime_minutes).toFixed(2), h2(p.overtime_minutes).toFixed(2),
        p.hourly_rate != null ? Number(p.hourly_rate).toFixed(2) : '', period.from, period.to]),
    );
  }
  const done = entries.filter((e) => e.ended_at).sort((a, b) => a.started_at.localeCompare(b.started_at));
  if (fmt === 'quickbooks') {
    return toCsv(
      ['Date', 'Employee', 'Customer', 'Service', 'Duration', 'Start time', 'End time', 'Billable', 'Description'],
      done.map((e) => [format(parseISO(e.started_at), 'MM/dd/yyyy'), nameOf(e.user_id), e.customer ?? '', e.service ?? '', hhmm(entryMinutes(e)),
        format(parseISO(e.started_at), 'h:mm a'), format(parseISO(e.ended_at!), 'h:mm a'), 'No',
        [e.job_number ? `Job ${e.job_number}` : null, e.notes].filter(Boolean).join(' · ')]),
    );
  }
  const rows: Cell[][] = [];
  for (const p of people) {
    const mine = done.filter((e) => e.user_id === p.user_id);
    if (!mine.length) continue;
    for (const e of mine) {
      rows.push([p.name, format(parseISO(e.started_at), 'yyyy-MM-dd'), format(parseISO(e.started_at), 'HH:mm'), format(parseISO(e.ended_at!), 'HH:mm'),
        h2(entryMinutes(e)).toFixed(2), '', e.job_number ?? '', e.approved ? 'Yes' : 'No', e.notes ?? '']);
    }
    rows.push([`${p.name} — total`, '', '', '', h2(p.minutes).toFixed(2), h2(p.overtime_minutes).toFixed(2), '', '', '']);
  }
  return toCsv(['Employee', 'Date', 'Clock in', 'Clock out', 'Hours', 'Overtime hours (week)', 'Job', 'Approved', 'Notes'], rows);
}

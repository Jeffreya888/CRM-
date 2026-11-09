// iCalendar (RFC 5545) feed for calendar subscriptions (Google Calendar, Apple Calendar, Outlook).

export type IcsEvent = {
  uid: string; start: Date; end: Date; summary: string; location?: string | null; description?: string | null;
  updated?: Date | null; cancelled?: boolean;
};

/** Escapes text per RFC 5545: backslash, semicolon, comma and line breaks. */
export function icsEscape(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

/** UTC timestamp, e.g. 20261109T153000Z. */
export function icsDate(d: Date): string {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/** Lines longer than 75 octets are folded: CRLF plus a space, without splitting a character. */
export function foldLine(line: string): string {
  const enc = new TextEncoder();
  if (enc.encode(line).length <= 75) return line;
  const out: string[] = [];
  let cur = "";
  let size = 0;
  for (const ch of line) {
    const n = enc.encode(ch).length;
    if (size + n > (out.length ? 74 : 75)) {
      out.push(cur);
      cur = "";
      size = 0;
    }
    cur += ch;
    size += n;
  }
  out.push(cur);
  return out.join("\r\n ");
}

export function buildCalendar(name: string, events: IcsEvent[], now = new Date()): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Tarmo//Jobs//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${icsEscape(name)}`,
    "X-PUBLISHED-TTL:PT1H",
    "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
  ];
  for (const e of events) {
    lines.push(
      "BEGIN:VEVENT",
      `UID:${e.uid}`,
      `DTSTAMP:${icsDate(e.updated ?? now)}`,
      `DTSTART:${icsDate(e.start)}`,
      `DTEND:${icsDate(e.end > e.start ? e.end : new Date(e.start.getTime() + 3600e3))}`,
      `SUMMARY:${icsEscape(e.summary)}`,
    );
    if (e.location) lines.push(`LOCATION:${icsEscape(e.location)}`);
    if (e.description) lines.push(`DESCRIPTION:${icsEscape(e.description)}`);
    if (e.cancelled) lines.push("STATUS:CANCELLED");
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.map(foldLine).join("\r\n") + "\r\n";
}

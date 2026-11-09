// deno test supabase/functions/_tests/ics_test.ts
import { buildCalendar, foldLine, icsEscape } from "../_shared/ics.ts";

Deno.test("escapes text", () => {
  if (icsEscape("a,b;c\\d\ne") !== String.raw`a\,b\;c\\d\ne`) throw new Error(icsEscape("a,b;c\\d\ne"));
});
Deno.test("folds long lines at 75 octets without splitting characters", () => {
  const f = foldLine("SUMMARY:" + "✈".repeat(60));
  for (const l of f.split("\r\n")) if (new TextEncoder().encode(l).length > 75) throw new Error("line too long");
  if (f.split("\r\n").slice(1).some((l) => !l.startsWith(" "))) throw new Error("continuation lines must start with a space");
});
Deno.test("builds a valid calendar", () => {
  const ics = buildCalendar("Jetgleam · Tarmo jobs", [{ uid: "1@gettarmo.com", start: new Date("2026-11-10T15:00:00Z"), end: new Date("2026-11-10T17:00:00Z"), summary: "N350EJ · Exterior wash", location: "KTEB, Signature" }], new Date("2026-11-09T00:00:00Z"));
  for (const want of ["BEGIN:VCALENDAR", "DTSTART:20261110T150000Z", "DTEND:20261110T170000Z", "SUMMARY:N350EJ · Exterior wash", "LOCATION:KTEB\\, Signature", "END:VCALENDAR"]) {
    if (!ics.includes(want)) throw new Error(`missing ${want}`);
  }
  if (!ics.includes("\r\n")) throw new Error("must use CRLF");
});

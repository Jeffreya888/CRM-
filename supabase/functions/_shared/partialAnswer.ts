/**
 * The "answer" text written so far in a streamed JSON reply like {"answer":"Rinse first.\n1. Wash…
 * Returns "" until the answer has started. Handles JSON escapes, including ones cut off mid-way.
 */
export function partialAnswer(raw: string): string {
  const m = /"answer"\s*:\s*"/.exec(raw);
  if (!m) return "";
  let out = "";
  for (let i = m.index + m[0].length; i < raw.length; i++) {
    const c = raw[i];
    if (c === '"') return out; // end of the answer string
    if (c !== "\\") { out += c; continue; }
    const n = raw[i + 1];
    if (n === undefined) return out; // escape cut off: wait for more text
    const simple: Record<string, string> = { n: "\n", t: "\t", r: "\r", b: "\b", f: "\f", '"': '"', "\\": "\\", "/": "/" };
    if (n in simple) { out += simple[n]; i++; continue; }
    if (n === "u") {
      const hex = raw.slice(i + 2, i + 6);
      if (hex.length < 4) return out;
      out += String.fromCharCode(parseInt(hex, 16));
      i += 5;
      continue;
    }
    i++;
  }
  return out;
}

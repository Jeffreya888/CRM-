// Owner data export: one ZIP with a CSV per record type, a list of quote and
// invoice links (each opens the printable/PDF view), and the company's
// photos and files from storage.
//
// POST { org_id } → { url }  (signed for 24 hours)
// Owner only; not available in demo workspaces.
//
// Memory: edge functions have a small heap, so photos are capped at
// EXPORT_PHOTO_MAX_MB (default 150 MB). Anything over the cap is listed in
// photos-not-included.csv with a 7-day download link. The ZIP is streamed to
// storage (stored, not re-compressed, for photos) instead of being built in memory.
import { JSZip } from "../_shared/deps.ts";
import type { SupabaseClient } from "../_shared/deps.ts";
import { adminClient, callerRole } from "../_shared/clients.ts";
import { error, json, portalUrl, preflight, readJson } from "../_shared/http.ts";

const BUCKET = "org-files";
const PAGE = 1000;
const MAX_LISTED_FILES = 20000;

// [file name, table, columns to drop]
const TABLES: [string, string, string[]][] = [
  ["customers", "customers", []],
  ["assets", "aircraft", []],
  ["contacts", "contacts", []],
  ["facilities", "locations", []],
  ["services", "services", []],
  ["jobs", "jobs", []],
  ["job_items", "job_items", []],
  ["quotes", "quotes", ["public_token", "deposit_payment_intent"]],
  ["quote_options", "quote_options", []],
  ["quote_items", "quote_items", []],
  ["invoices", "invoices", ["public_token"]],
  ["invoice_items", "invoice_items", []],
  ["payments", "payments", []],
  ["expenses", "expenses", []],
  ["time_entries", "time_entries", []],
  ["inventory", "inventory_items", []],
  ["equipment", "equipment", []],
  ["recurring_schedules", "recurring_schedules", []],
  ["messages", "messages", []],
];

function cell(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = typeof v === "object" ? JSON.stringify(v) : String(v);
  return /[",\r\n]/.test(s) || /^[=+\-@]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toCsv(rows: Record<string, unknown>[], drop: string[] = []): string {
  if (!rows.length) return "";
  const cols: string[] = [];
  const seen = new Set<string>(drop);
  for (const r of rows) for (const k of Object.keys(r)) if (!seen.has(k)) { seen.add(k); cols.push(k); }
  const out = [cols.join(",")];
  for (const r of rows) out.push(cols.map((c) => cell(r[c])).join(","));
  return out.join("\r\n") + "\r\n";
}

async function allRows(db: SupabaseClient, table: string, orgId: string): Promise<Record<string, unknown>[]> {
  const rows: Record<string, unknown>[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db.from(table).select("*").eq("org_id", orgId).order("id").range(from, from + PAGE - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
  }
  return rows;
}

type StoredFile = { path: string; size: number; updated: string | null };

/** Every file under <org_id>/ except previous exports (breadth-first). */
async function listFiles(db: SupabaseClient, orgId: string): Promise<StoredFile[]> {
  const files: StoredFile[] = [];
  const queue = [orgId];
  while (queue.length && files.length < MAX_LISTED_FILES) {
    const dir = queue.shift()!;
    for (let offset = 0; ; offset += PAGE) {
      const { data, error } = await db.storage.from(BUCKET).list(dir, { limit: PAGE, offset, sortBy: { column: "name", order: "asc" } });
      if (error) throw new Error(`storage: ${error.message}`);
      for (const e of data ?? []) {
        const full = `${dir}/${e.name}`;
        if (e.id === null) {
          if (full !== `${orgId}/exports`) queue.push(full);
        } else if (e.name !== ".emptyFolderPlaceholder") {
          files.push({ path: full, size: Number(e.metadata?.size ?? 0), updated: e.updated_at ?? e.created_at ?? null });
        }
      }
      if (!data || data.length < PAGE) break;
    }
  }
  return files;
}

const STORED_EXT = /\.(jpe?g|png|gif|webp|heic|heif|mp4|mov|m4v|zip|pdf)$/i; // already compressed

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  try {
    const { org_id } = await readJson<{ org_id?: string }>(req);
    if (!org_id) return error("org_id required");
    const caller = await callerRole(req, org_id);
    if (!caller || caller.role !== "owner") return error("Only the company owner can export all data", 403);
    const db = adminClient();
    const { data: org } = await db.from("organizations").select("name, is_demo").eq("id", org_id).maybeSingle();
    if (!org) return error("Company not found", 404);
    if (org.is_demo) return error("Data export isn't available in the demo workspace");

    const zip = new JSZip();
    const date = new Date().toISOString().slice(0, 10);
    const counts: Record<string, number> = {};

    // ---- Records ----
    let quotes: Record<string, unknown>[] = [];
    let invoices: Record<string, unknown>[] = [];
    for (const [name, table, drop] of TABLES) {
      const rows = await allRows(db, table, org_id);
      counts[name] = rows.length;
      if (table === "quotes") quotes = rows;
      if (table === "invoices") invoices = rows;
      zip.file(`data/${name}.csv`, toCsv(rows, drop) || "(no records)\r\n", { compression: "DEFLATE" });
    }

    // Printable documents: each link opens the quote/invoice page that prints to PDF.
    const portal = portalUrl();
    const docs = [
      ...quotes.filter((q) => q.status !== "draft").map((q) => ({
        type: "quote", number: q.number, status: q.status, total: q.total, date: String(q.created_at ?? "").slice(0, 10),
        link: `${portal}/portal/quote/${q.public_token}`,
      })),
      ...invoices.filter((i) => i.status !== "draft").map((i) => ({
        type: "invoice", number: i.number, status: i.status, total: i.total, date: i.issue_date,
        link: `${portal}/portal/invoice/${i.public_token}`,
      })),
    ];
    zip.file("documents.csv", toCsv(docs) || "(no sent quotes or invoices)\r\n", { compression: "DEFLATE" });

    // ---- Photos & files ----
    const budget = Number(Deno.env.get("EXPORT_PHOTO_MAX_MB") ?? 150) * 1024 * 1024;
    const files = await listFiles(db, org_id);
    let used = 0;
    const skipped: StoredFile[] = [];
    let included = 0;
    for (const f of files) {
      if (f.size <= 0 || used + f.size > budget) {
        skipped.push(f);
        continue;
      }
      const { data: blob, error: dlErr } = await db.storage.from(BUCKET).download(f.path);
      if (dlErr || !blob) {
        skipped.push(f);
        continue;
      }
      const bytes = new Uint8Array(await blob.arrayBuffer());
      used += bytes.byteLength;
      included++;
      zip.file(`files/${f.path.slice(org_id.length + 1)}`, bytes, {
        binary: true,
        compression: STORED_EXT.test(f.path) ? "STORE" : "DEFLATE",
        date: f.updated ? new Date(f.updated) : undefined,
      });
    }
    if (skipped.length) {
      const rows: Record<string, unknown>[] = [];
      for (let i = 0; i < skipped.length; i += 100) {
        const chunk = skipped.slice(i, i + 100);
        const { data: signed } = await db.storage.from(BUCKET).createSignedUrls(chunk.map((f) => f.path), 7 * 24 * 3600);
        const byPath = new Map((signed ?? []).map((s) => [s.path, s.signedUrl]));
        for (const f of chunk) {
          rows.push({ file: f.path.slice(org_id.length + 1), size_mb: (f.size / 1048576).toFixed(2), download_link_valid_7_days: byPath.get(f.path) ?? "" });
        }
      }
      zip.file("photos-not-included.csv", toCsv(rows), { compression: "DEFLATE" });
    }

    zip.file("README.txt", [
      `${org.name} — Flight Ready data export (${date})`,
      "",
      "data/*.csv           One spreadsheet per record type (open in Excel, Numbers or Google Sheets).",
      "documents.csv        Every sent quote and invoice with a link to its printable page (Print → Save as PDF).",
      "files/               Job photos, receipts and documents.",
      skipped.length ? `photos-not-included.csv  ${skipped.length} more file(s) over the size limit, with download links valid for 7 days.` : "",
      "",
      ...Object.entries(counts).map(([k, v]) => `${k}: ${v}`),
      `files included: ${included}`,
    ].filter((l, i, a) => l !== "" || a[i - 1] !== "").join("\r\n"), { compression: "DEFLATE" });

    // ---- Stream the ZIP to storage ----
    const helper = zip.generateInternalStream({ type: "uint8array", streamFiles: true, compression: "DEFLATE" });
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        helper
          .on("data", (chunk: Uint8Array) => {
            controller.enqueue(chunk);
            if ((controller.desiredSize ?? 1) <= 0) helper.pause();
          })
          .on("error", (e: Error) => controller.error(e))
          .on("end", () => controller.close());
      },
      pull() {
        helper.resume();
      },
    }, { highWaterMark: 8 });

    // Keep only the newest export.
    const { data: old } = await db.storage.from(BUCKET).list(`${org_id}/exports`, { limit: 100 });
    const oldPaths = (old ?? []).filter((o) => o.id !== null).map((o) => `${org_id}/exports/${o.name}`);
    const path = `${org_id}/exports/flight-ready-export-${date}.zip`;
    const { error: upErr } = await db.storage.from(BUCKET).upload(path, body, { contentType: "application/zip", upsert: true, duplex: "half" });
    if (upErr) throw new Error(`upload: ${upErr.message}`);
    const stale = oldPaths.filter((p) => p !== path);
    if (stale.length) await db.storage.from(BUCKET).remove(stale);

    const { data: signed, error: sErr } = await db.storage.from(BUCKET).createSignedUrl(path, 24 * 3600, { download: `flight-ready-export-${date}.zip` });
    if (sErr || !signed) throw new Error(`sign: ${sErr?.message}`);
    await db.from("audit_log").insert({
      org_id, actor: caller.userId, action: "export", entity: "organizations", entity_id: org_id,
      summary: `Full data export downloaded (${included} files included, ${skipped.length} linked)`,
    })
      .then(({ error }) => error && console.warn("audit_log insert skipped", error.message));
    return json({ url: signed.signedUrl, files_included: included, files_not_included: skipped.length });
  } catch (e) {
    console.error(e);
    return error("The export couldn't be created. Please try again, or contact support if it keeps failing.", 500);
  }
});

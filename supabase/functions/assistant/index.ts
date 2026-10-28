// "Ask" assistant for crews (docs/feature-plan "Ask" contract).
//
// POST { org_id, thread_id?, job_id?, aircraft_id?, guide_key?, step_index?, message, photo_paths?, use_documents? }
//   → { thread_id, user_message, assistant_message, charged }
// Aircraft documents are attached only when the question mentions a related
// word (products, polish, manual, …) or use_documents is true.
// Any active member except viewers. Text questions use claim_ai_question; a
// question with photos or attached aircraft documents uses one AI check
// (claim_ai_check); the response says which: charged 'question'|'check'. Out of allowance →
// 402 { error: "AI_LIMIT: …", code: "ai_limit", kind }. When the AI can't
// answer, the usage is given back and the assistant row is saved as 'failed'.
//
// Imported here (not in _shared/deps.ts) so other functions do not load the SDK.
// deno-lint-ignore no-import-prefix
import Anthropic from "npm:@anthropic-ai/sdk@0.130.0";
import { adminClient, callerRole } from "../_shared/clients.ts";
import { env, error, json, preflight, readJson } from "../_shared/http.ts";
import {
  ANSWER_SCHEMA,
  assetText,
  cleanAnswer,
  companyContext,
  DOC_BUDGET_BYTES,
  imageBlock,
  jobText,
  loadAsset,
  loadDocuments,
  loadJob,
  loadPhotos,
  loadSops,
  matchSops,
  MAX_FULL_SOPS,
  MAX_PHOTOS,
  wantsDocuments,
  sopCatalog,
  SYSTEM_PROMPT,
} from "../_shared/assistant.ts";

type Block = Anthropic.Beta.BetaContentBlockParam;
type Msg = Anthropic.Beta.BetaMessageParam;
// deno-lint-ignore no-explicit-any
type Row = Record<string, any>;

interface Body {
  org_id?: string;
  thread_id?: string | null;
  job_id?: string | null;
  aircraft_id?: string | null;
  guide_key?: string | null;
  step_index?: number | null;
  message?: string;
  photo_paths?: string[] | null;
  use_documents?: boolean | null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_MESSAGE = 2000;
const HISTORY = 10;
const RATE_LIMIT = 20;
const RATE_WINDOW_MIN = 10;
const CACHE = { type: "ephemeral" as const };

const FAIL = {
  generic: "Sorry, I couldn't answer that right now. Please try again in a minute. This question wasn't counted.",
  busy: "I'm busy right now. Please try again in a minute. This question wasn't counted.",
  refusal: "Sorry, I can't help with that one. Try asking it a different way, or check with your supervisor. This question wasn't counted.",
  cutoff: "My answer got cut off. Please try a shorter or more specific question. This question wasn't counted.",
};

const optId = (v: unknown) => (v == null || v === "" ? null : typeof v === "string" && UUID.test(v) ? v : undefined);

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== "POST") return error("Method not allowed", 405);

  let db: ReturnType<typeof adminClient> | null = null;
  let usage: number | null = null;
  let answered = false;
  try {
    const body = await readJson<Body>(req);
    const orgId = optId(body.org_id);
    if (!orgId) return error("org_id required");
    const message = typeof body.message === "string" ? body.message.trim() : "";
    if (!message) return error("Please type a question");
    if (message.length > MAX_MESSAGE) return error(`Please keep your question under ${MAX_MESSAGE} characters`);
    const threadIdIn = optId(body.thread_id);
    const jobIdIn = optId(body.job_id);
    const aircraftIdIn = optId(body.aircraft_id);
    if (threadIdIn === undefined || jobIdIn === undefined || aircraftIdIn === undefined) return error("Invalid id");
    const guideKeyIn = body.guide_key == null || body.guide_key === "" ? null : String(body.guide_key);
    if (guideKeyIn && !/^[a-z0-9_]{1,64}$/.test(guideKeyIn)) return error("Invalid guide_key");
    const stepIndex = Number.isInteger(body.step_index) && body.step_index! >= 0 && body.step_index! < 200 ? body.step_index! : null;
    const rawPaths = body.photo_paths ?? [];
    if (!Array.isArray(rawPaths) || rawPaths.some((p) => typeof p !== "string")) return error("Invalid photo_paths");
    const photoPaths = [...new Set(rawPaths as string[])];
    if (photoPaths.length > MAX_PHOTOS) return error(`You can add up to ${MAX_PHOTOS} photos to a question`);

    // --- Who is asking ------------------------------------------------------
    const caller = await callerRole(req, orgId);
    if (!caller) return error("You're not a member of this company", 403);
    if (caller.role === "viewer") return error("View-only members can't use Ask. Ask an owner for a crew role.", 403);
    const userId = caller.userId;
    const prefix = `${orgId}/assistant/${userId}/`;
    if (photoPaths.some((p) => !p.startsWith(prefix) || p.includes(".."))) return error("That photo does not belong to you", 403);

    db = adminClient();

    // --- Ids belong to the org (and the thread to the caller) ---------------
    let thread: Row | null = null;
    if (threadIdIn) {
      const { data } = await db.from("assistant_threads").select("*")
        .eq("id", threadIdIn).eq("org_id", orgId).eq("user_id", userId).maybeSingle();
      if (!data) return error("That conversation wasn't found", 404);
      thread = data;
    }
    const jobId: string | null = jobIdIn ?? thread?.job_id ?? null;
    const job = jobId ? await loadJob(db, orgId, jobId) : null;
    if (jobId && !job) return error("That job wasn't found", 404);
    const aircraftId: string | null = aircraftIdIn ?? thread?.aircraft_id ?? job?.row.aircraft_id ?? null;
    const asset = aircraftId ? await loadAsset(db, orgId, aircraftId) : null;
    if (aircraftIdIn && !asset) return error("That aircraft wasn't found", 404);
    const guideKey: string | null = guideKeyIn ?? thread?.guide_key ?? null;

    // --- Abuse limit: 20 questions per person per 10 minutes ----------------
    const since = new Date(Date.now() - RATE_WINDOW_MIN * 60_000).toISOString();
    const { count: recent, error: rateErr } = await db.from("assistant_messages")
      .select("id, assistant_threads!inner(user_id)", { count: "exact", head: true })
      .eq("org_id", orgId).eq("role", "user").eq("assistant_threads.user_id", userId).gte("created_at", since);
    if (rateErr) throw rateErr;
    if ((recent ?? 0) >= RATE_LIMIT) {
      return error("You've asked a lot of questions in the last few minutes. Please wait a little and try again.", 429);
    }

    // --- Photos (checked before anything is charged) ------------------------
    const { images, problem } = await loadPhotos(db, photoPaths);
    if (problem) return error(problem);

    // --- Aircraft documents (attached only when the question needs them) ----
    const attachDocs = body.use_documents === true || wantsDocuments(message);
    const docs = asset
      ? await loadDocuments(db, orgId, asset.id, DOC_BUDGET_BYTES - images.reduce((n, i) => n + i.bytes, 0), attachDocs)
      : null;

    // --- Allowance: photos or attached documents use one AI check -----------
    const kind: "question" | "check" = images.length || docs?.attached.size ? "check" : "question";
    const claim = kind === "check"
      ? await db.rpc("claim_ai_check", { p_org: orgId, p_source: "staff" })
      : await db.rpc("claim_ai_question", { p_org: orgId });
    if (claim.error) throw claim.error;
    if (claim.data == null) {
      return json({
        error: kind === "check"
          ? `AI_LIMIT: Your company has used all its AI checks for this month (questions with ${images.length ? "photos" : "aircraft documents"} use a check). An owner can add more checks or upgrade the plan.`
          : "AI_LIMIT: Your company has used all its questions for this month. An owner can add AI checks or upgrade the plan.",
        code: "ai_limit",
        kind,
      }, 402);
    }
    usage = Number(claim.data);

    // --- Thread + user message ---------------------------------------------
    if (!thread) {
      const flat = message.replace(/\s+/g, " ");
      const title = flat.length > 60 ? `${flat.slice(0, 57).trimEnd()}…` : flat;
      const { data, error: tErr } = await db.from("assistant_threads").insert({
        org_id: orgId, user_id: userId, job_id: jobId, aircraft_id: asset?.id ?? null, guide_key: guideKey, title,
      }).select("*").single();
      if (tErr || !data) throw tErr ?? new Error("thread insert failed");
      thread = data;
    }
    const threadId = thread!.id as string;

    const { data: past } = await db.from("assistant_messages")
      .select("role, content, photo_paths, status").eq("thread_id", threadId)
      .order("created_at", { ascending: false }).limit(HISTORY);

    const { data: userMsg, error: uErr } = await db.from("assistant_messages").insert({
      org_id: orgId, thread_id: threadId, role: "user", content: message, photo_paths: photoPaths, status: "done",
    }).select("*").single();
    if (uErr || !userMsg) throw uErr ?? new Error("message insert failed");

    // --- Context -------------------------------------------------------------
    const { data: org } = await db.from("organizations").select("name, business_types").eq("id", orgId).maybeSingle();
    const assetTypes = [...new Set([...(org?.business_types ?? []), ...(asset?.asset_type ? [asset.asset_type] : [])])] as string[];
    const catalog = await sopCatalog(db, orgId, assetTypes);

    // Thread SOPs (stable while the thread lasts → cached) and per-question matches.
    const threadKeys = [...new Set([...(guideKey ? [guideKey] : []), ...(job?.guideKeys ?? [])])]
      .filter((k) => catalog.has(k)).slice(0, MAX_FULL_SOPS);
    const extraKeys = matchSops(message, catalog, new Set(threadKeys), Math.min(3, MAX_FULL_SOPS - threadKeys.length));
    const focus = guideKey && stepIndex != null ? { key: guideKey, step: stepIndex + 1 } : undefined;
    const [threadSops, extraSops, companyText] = await Promise.all([
      loadSops(db, catalog, threadKeys, focus),
      loadSops(db, catalog, extraKeys),
      companyContext(db, orgId, org?.name ?? "", catalog),
    ]);
    const sopSteps = new Map([...threadSops, ...extraSops].map((s) => [s.key, s.steps]));

    // Reference message: documents + thread SOPs + asset, cached for follow-ups.
    const reference: Block[] = [...(docs?.blocks ?? [])];
    const refText: string[] = [];
    if (docs) {
      if (docs.attached.size) refText.push(`The ${docs.attached.size} document(s) above were uploaded by the company for this aircraft. They take priority over SOPs.`);
      if (docs.skipped.length) refText.push(`Not attached (too large to include): ${docs.skipped.join(", ")}. If one of these matters, tell the user to open it in the app.`);
      if (docs.listed && !attachDocs) {
        refText.push(`This aircraft has uploaded documents that were not attached to this question: ${docs.titles.join(", ")}. ` +
          "If one of them could settle the question, say so and tell the user to ask again mentioning the manual or document.");
      }
      if (!docs.listed) refText.push("No documents have been uploaded for this aircraft.");
    }
    if (asset) refText.push(assetText(asset));
    if (threadSops.length) refText.push(`# SOPs for this conversation\n${threadSops.map((s) => s.text).join("\n\n")}`);
    if (refText.length) reference.push({ type: "text", text: refText.join("\n\n") });
    if (reference.length) {
      const last = reference[reference.length - 1] as Block & { cache_control?: unknown };
      last.cache_control = CACHE;
    }

    const messages: Msg[] = [];
    if (reference.length) messages.push({ role: "user", content: reference });
    const history = ((past ?? []) as Row[]).reverse().filter((m) => m.status === "done" && m.content);
    for (const m of history) {
      if (!messages.length && m.role !== "user") continue;
      const photos = Array.isArray(m.photo_paths) && m.photo_paths.length ? ` [attached ${m.photo_paths.length} photo(s), not shown again]` : "";
      messages.push({ role: m.role === "assistant" ? "assistant" : "user", content: [{ type: "text", text: `${m.content}${m.role === "user" ? photos : ""}` }] });
    }
    if (history.length && messages.length) {
      const lastMsg = messages[messages.length - 1];
      const blocks = lastMsg.content as Block[];
      (blocks[blocks.length - 1] as Block & { cache_control?: unknown }).cache_control = CACHE;
    }

    const now: string[] = [];
    if (job) now.push(jobText(job.row));
    if (focus) {
      const t = catalog.get(focus.key)?.title;
      if (t) now.push(`The crew member opened this from step ${focus.step} of "${t}".`);
    }
    if (extraSops.length) now.push(`# Other SOPs that may be relevant\n${extraSops.map((s) => s.text).join("\n\n")}`);
    const question: Block[] = [
      ...images.map(imageBlock),
      { type: "text", text: `${now.length ? `${now.join("\n\n")}\n\n` : ""}# Question${images.length ? ` (with ${images.length} photo${images.length > 1 ? "s" : ""})` : ""}\n${message}` },
    ];
    messages.push({ role: "user", content: question });

    // --- Claude --------------------------------------------------------------
    let reply: { content: string; sources: unknown[]; safety: string | null; status: "done" | "failed" };
    try {
      const client = new Anthropic({ apiKey: env("ANTHROPIC_API_KEY"), maxRetries: 1, timeout: 110_000 });
      const response = await client.beta.messages.create({
        model: "claude-opus-5-5",
        max_tokens: 5000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default", // a declined request is retried server-side on Anthropic's recommended model
        output_config: { effort: "medium", format: { type: "json_schema", schema: ANSWER_SCHEMA } },
        system: [
          { type: "text", text: SYSTEM_PROMPT, cache_control: CACHE },
          { type: "text", text: companyText, cache_control: CACHE },
        ],
        messages,
      });
      const text = response.content.find((b) => b.type === "text");
      let parsed: Row | null = null;
      if (response.stop_reason !== "refusal" && response.stop_reason !== "max_tokens" && text && text.type === "text") {
        try {
          parsed = JSON.parse(text.text);
        } catch {
          parsed = null;
        }
      }
      const clean = parsed
        ? cleanAnswer(parsed, { catalog, sopSteps, docs: docs?.attached ?? new Map(), jobNumber: job ? String(job.row.number) : null })
        : null;
      if (clean?.answer) {
        reply = { content: clean.answer, sources: clean.sources, safety: clean.safety, status: "done" };
      } else {
        if (response.stop_reason === "refusal") console.warn("assistant refusal", response.stop_details?.category ?? null);
        reply = {
          content: response.stop_reason === "refusal" ? FAIL.refusal : response.stop_reason === "max_tokens" ? FAIL.cutoff : FAIL.generic,
          sources: [], safety: null, status: "failed",
        };
      }
    } catch (e) {
      let content = FAIL.generic;
      if (e instanceof Anthropic.RateLimitError) content = FAIL.busy;
      else if (e instanceof Anthropic.BadRequestError) console.error("Claude API bad request", e.status, e.message);
      else if (e instanceof Anthropic.APIError) console.error("Claude API error", e.status, e.message);
      else console.error("assistant failed", e);
      reply = { content, sources: [], safety: null, status: "failed" };
    }

    const { data: botMsg, error: bErr } = await db.from("assistant_messages").insert({
      org_id: orgId, thread_id: threadId, role: "assistant", content: reply.content,
      sources: reply.sources, safety: reply.safety, status: reply.status,
    }).select("*").single();
    if (bErr || !botMsg) throw bErr ?? new Error("message insert failed");
    answered = reply.status === "done";

    const { error: upErr } = await db.from("assistant_threads").update({ updated_at: new Date().toISOString() }).eq("id", threadId);
    if (upErr) console.error("assistant_threads update failed", upErr);

    return json({ thread_id: threadId, user_message: userMsg, assistant_message: botMsg, charged: kind });
  } catch (e) {
    console.error(e);
    return error("Something went wrong. Please try again.", 500);
  } finally {
    if (db && usage != null && !answered) {
      const { error: relErr } = await db.rpc("release_ai_check", { p_usage: usage });
      if (relErr) console.error("release_ai_check failed", relErr);
    }
  }
});

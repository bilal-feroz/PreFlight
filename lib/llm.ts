import { z } from "zod";
import { cached, isOffline, OfflineCacheMissError } from "./cache";

/**
 * One adapter for the LLM. It only extracts structure and writes wording;
 * it never produces scores that code could compute.
 *
 * Providers: groq | openai | gemini (OpenAI-compatible chat) and anthropic (messages API).
 * Models come from the provider's live model list unless LLM_MODEL is set
 * (comma-separated list allowed). Every call is cached to disk by prompt hash,
 * independent of the model, so the demo replays offline.
 *
 * Rate limits: several models are used as a pool; each model's remaining token
 * budget is tracked from response headers and 429s are retried on another
 * model or after the reset time.
 */

type Provider = "groq" | "openai" | "gemini" | "anthropic";
export type ModelTier = "smart" | "batch" | "judge";

const PROMPT_VERSION = 3;

function provider(): Provider {
  const p = (process.env.LLM_PROVIDER || "groq").toLowerCase();
  return (["groq", "openai", "gemini", "anthropic"].includes(p) ? p : "groq") as Provider;
}

const ENDPOINTS: Record<Provider, { chat: string; models: string }> = {
  groq: {
    chat: "https://api.groq.com/openai/v1/chat/completions",
    models: "https://api.groq.com/openai/v1/models",
  },
  openai: { chat: "https://api.openai.com/v1/chat/completions", models: "https://api.openai.com/v1/models" },
  gemini: {
    chat: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
    models: "https://generativelanguage.googleapis.com/v1beta/openai/models",
  },
  anthropic: { chat: "https://api.anthropic.com/v1/messages", models: "https://api.anthropic.com/v1/models" },
};

const EXCLUDE = /guard|whisper|orpheus|tts|audio|embed|vision|image|allam|search|realtime|transcribe|moderation|preview-\d{2}-\d{2}/i;

/** Preference order per tier; the first patterns that exist in the live list win. */
const PREFERENCES: Record<Provider, Record<ModelTier, RegExp[]>> = {
  groq: {
    smart: [/gpt-oss-120b/, /qwen3/, /llama-3\.3-70b/, /gpt-oss-20b/],
    judge: [/gpt-oss-120b/, /gpt-oss-20b/, /llama-3\.3-70b/, /qwen3/],
    batch: [/gpt-oss-120b/, /gpt-oss-20b/, /llama-3.3-70b/],
  },
  openai: {
    smart: [/^gpt-5(\.\d+)?$/, /^gpt-4\.1$/, /^gpt-4o$/],
    judge: [/^gpt-5(\.\d+)?-mini$/, /^gpt-4\.1-mini$/, /^gpt-4o-mini$/],
    batch: [/^gpt-5(\.\d+)?-mini$/, /^gpt-4\.1-mini$/, /^gpt-4o-mini$/],
  },
  gemini: {
    smart: [/gemini-[\d.]+-flash$/, /gemini-[\d.]+-pro$/],
    judge: [/gemini-[\d.]+-flash$/],
    batch: [/gemini-[\d.]+-flash$/, /gemini-[\d.]+-flash-lite$/],
  },
  anthropic: {
    smart: [/sonnet/, /haiku/],
    judge: [/haiku/, /sonnet/],
    batch: [/haiku/, /sonnet/],
  },
};

const MAX_POOL: Record<ModelTier, number> = { smart: 1, judge: 2, batch: 3 };

let modelList: Promise<string[]> | undefined;

async function listModels(): Promise<string[]> {
  const p = provider();
  const key = process.env.LLM_API_KEY!;
  const headers: Record<string, string> =
    p === "anthropic" ? { "x-api-key": key, "anthropic-version": "2023-06-01" } : { Authorization: `Bearer ${key}` };
  const res = await fetch(ENDPOINTS[p].models, { headers, signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`LLM model list failed (${res.status})`);
  const json = (await res.json()) as { data?: { id: string; created?: number; created_at?: string }[] };
  const rows = (json.data ?? []).map((m) => ({
    id: m.id.replace(/^models\//, ""),
    t: m.created ?? (m.created_at ? Date.parse(m.created_at) / 1000 : 0),
  }));
  // newest first so "latest version" wins within a pattern
  rows.sort((a, b) => b.t - a.t || b.id.localeCompare(a.id, undefined, { numeric: true }));
  return rows.map((r) => r.id).filter((id) => !EXCLUDE.test(id));
}

async function modelsFor(tier: ModelTier): Promise<string[]> {
  const pinned = process.env.LLM_MODEL?.split(",").map((s) => s.trim()).filter(Boolean);
  if (pinned?.length) return tier === "smart" ? pinned.slice(0, 1) : pinned;
  modelList ??= listModels().catch((e) => {
    modelList = undefined;
    throw e;
  });
  const all = await modelList;
  const picked: string[] = [];
  for (const re of PREFERENCES[provider()][tier]) {
    for (const id of all) {
      if (re.test(id) && !picked.includes(id)) {
        picked.push(id);
        break;
      }
    }
  }
  if (!picked.length && all.length) picked.push(all[0]);
  if (!picked.length) throw new Error("No usable LLM model found for this key");
  return picked.slice(0, MAX_POOL[tier]);
}

// ------------------------------------------------------------------ rate-limit aware scheduling

/** Token bucket per model, refilled continuously (Groq reports remaining tokens + time to full refill). */
type ModelState = { limit?: number; remaining?: number; at: number; rate: number; blockedUntil: number; inflight: number };
const states = new Map<string, ModelState>();
const stateOf = (id: string) => {
  let s = states.get(id);
  if (!s) states.set(id, (s = { at: 0, rate: 0, blockedUntil: 0, inflight: 0 }));
  return s;
};
function available(s: ModelState, now: number): number {
  if (s.remaining === undefined || s.limit === undefined) return Infinity;
  return Math.min(s.limit, s.remaining + (now - s.at) * s.rate);
}

function parseDuration(v: string | null): number | undefined {
  if (!v) return undefined;
  if (/^\d+(\.\d+)?$/.test(v)) return Number(v) * 1000;
  let ms = 0;
  const re = /(\d+(?:\.\d+)?)(ms|h|m|s)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(v))) {
    const n = Number(m[1]);
    ms += m[2] === "ms" ? n : m[2] === "s" ? n * 1000 : m[2] === "m" ? n * 60_000 : n * 3_600_000;
  }
  return ms || undefined;
}

async function acquire(pool: string[], estTokens: number): Promise<string> {
  for (;;) {
    const now = Date.now();
    let best: string | undefined;
    let bestScore = -Infinity;
    let wakeAt = Infinity;
    for (const id of pool) {
      const s = stateOf(id);
      const avail = available(s, now);
      const need = Math.min(estTokens, s.limit ?? estTokens);
      const blocked = s.blockedUntil > now;
      const short = avail < need;
      if (blocked || short || s.inflight >= 2) {
        const refillAt = short && s.rate > 0 ? now + (need - avail) / s.rate : now + 400;
        wakeAt = Math.min(wakeAt, blocked ? s.blockedUntil : refillAt);
        continue;
      }
      const score = (Number.isFinite(avail) ? avail : 1e9) - s.inflight * estTokens;
      if (score > bestScore) {
        bestScore = score;
        best = id;
      }
    }
    if (best) {
      const s = stateOf(best);
      s.inflight++;
      if (s.remaining !== undefined) {
        s.remaining = available(s, now) - estTokens;
        s.at = now;
      }
      return best;
    }
    await new Promise((r) => setTimeout(r, Math.min(Math.max(250, wakeAt - now), 15_000)));
  }
}

function release(id: string) {
  const s = stateOf(id);
  s.inflight = Math.max(0, s.inflight - 1);
}

class RateLimited extends Error {}

async function callModel(
  model: string,
  system: string,
  user: string,
  maxTokens: number,
): Promise<string> {
  const p = provider();
  const key = process.env.LLM_API_KEY!;
  const s = stateOf(model);
  let body: Record<string, unknown>;
  let headers: Record<string, string>;
  if (p === "anthropic") {
    headers = { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" };
    body = {
      model,
      max_tokens: maxTokens,
      temperature: 0.2,
      system,
      messages: [{ role: "user", content: user }],
    };
  } else {
    headers = { Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
    body = {
      model,
      temperature: 0.2,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      response_format: { type: "json_object" },
      ...(p === "gemini" ? { max_tokens: maxTokens } : { max_completion_tokens: maxTokens }),
    };
    if (p === "groq" && /gpt-oss/.test(model)) Object.assign(body, { reasoning_effort: "low", include_reasoning: false });
    if (p === "groq" && /qwen3/.test(model)) Object.assign(body, { reasoning_effort: "none", reasoning_format: "hidden" });
  }

  const send = (payload: Record<string, unknown>) =>
    fetch(ENDPOINTS[p].chat, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(45_000),
    });

  let res = await send(body);
  if (res.status === 400) {
    // some models reject optional reasoning params: retry once without them
    const text = await res.text();
    if (/reasoning|include_reasoning|response_format/i.test(text)) {
      const { reasoning_effort: _r, include_reasoning: _i, reasoning_format: _f, ...rest } = body;
      res = await send(/response_format/i.test(text) ? { ...rest, response_format: undefined } : rest);
    } else {
      throw new Error(`LLM ${model} 400: ${text.slice(0, 300)}`);
    }
  }

  const remaining = Number(res.headers.get("x-ratelimit-remaining-tokens"));
  const limit = Number(res.headers.get("x-ratelimit-limit-tokens"));
  const reset = parseDuration(res.headers.get("x-ratelimit-reset-tokens"));
  if (res.headers.get("x-ratelimit-remaining-tokens") !== null && Number.isFinite(remaining) && Number.isFinite(limit) && limit > 0) {
    s.limit = limit;
    s.remaining = remaining;
    s.at = Date.now();
    s.rate = reset && limit > remaining ? (limit - remaining) / reset : limit / 60_000;
  }
  if (res.status === 429 || res.status === 503 || res.status === 529) {
    const wait = parseDuration(res.headers.get("retry-after")) ?? reset ?? 8_000;
    s.blockedUntil = Date.now() + Math.min(wait, 65_000) + 250;
    throw new RateLimited(`LLM ${model} rate limited`);
  }
  if (!res.ok) throw new Error(`LLM ${model} ${res.status}: ${(await res.text()).slice(0, 300)}`);

  const json = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
    content?: { type: string; text?: string }[];
  };
  const text =
    p === "anthropic"
      ? (json.content ?? []).map((c) => c.text ?? "").join("")
      : (json.choices?.[0]?.message?.content ?? "");
  if (!text.trim()) throw new Error(`LLM ${model} returned empty content`);
  return text;
}

function extractJson(text: string): unknown {
  const cleaned = text.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(cleaned.slice(start, end + 1));
    throw new Error("No JSON object in model output");
  }
}

// ------------------------------------------------------------------ public API

const inflightLimit = (() => {
  let active = 0;
  const queue: (() => void)[] = [];
  const pump = () => {
    while (active < 3 && queue.length) {
      active++;
      queue.shift()!();
    }
  };
  return <T>(fn: () => Promise<T>) =>
    new Promise<T>((resolve, reject) => {
      queue.push(() =>
        fn()
          .then(resolve, reject)
          .finally(() => {
            active--;
            pump();
          }),
      );
      pump();
    });
})();

export type LlmJsonArgs<T> = {
  task: string;
  system: string;
  user: string;
  schema: z.ZodType<T>;
  tier?: ModelTier;
  maxTokens?: number;
};

export function llmAvailable(): boolean {
  return !isOffline() && Boolean(process.env.LLM_API_KEY);
}

/** JSON-returning LLM call, Zod-validated, one repair retry, disk-cached. */
export async function llmJson<T>({ task, system, user, schema, tier = "batch", maxTokens = 2048 }: LlmJsonArgs<T>): Promise<T> {
  const { value } = await cached("llm", { v: PROMPT_VERSION, task, system, user }, async () => {
    if (!llmAvailable()) throw new OfflineCacheMissError(`LLM task ${task}`);
    return inflightLimit(() => generate({ system, user, schema, tier, maxTokens }));
  });
  // cached values were validated when written; parse again to restore defaults/transforms
  return schema.parse(value);
}

async function generate<T>({
  system,
  user,
  schema,
  tier,
  maxTokens,
}: {
  system: string;
  user: string;
  schema: z.ZodType<T>;
  tier: ModelTier;
  maxTokens: number;
}): Promise<T> {
  const pool = await modelsFor(tier);
  const est = Math.ceil((system.length + user.length) / 3.4) + Math.ceil(maxTokens * 0.8);
  let lastError: unknown;
  let repairNote = "";
  let repairs = 0;
  let failures = 0;
  for (let attempt = 0; attempt < 10; attempt++) {
    const model = await acquire(pool, est);
    try {
      const text = await callModel(model, system, repairNote ? `${user}\n\n${repairNote}` : user, maxTokens);
      let parsed: unknown;
      try {
        parsed = extractJson(text);
        return schema.parse(parsed);
      } catch (e) {
        lastError = e;
        if (repairs >= 1) throw e;
        repairs++;
        const msg = e instanceof z.ZodError ? z.prettifyError(e).slice(0, 800) : String(e).slice(0, 300);
        repairNote = `Your previous answer was invalid:\n${msg}\nReturn ONLY one valid JSON object that matches the requested shape exactly.`;
      }
    } catch (e) {
      lastError = e;
      if (!(e instanceof RateLimited)) {
        if (repairs >= 1 && e instanceof z.ZodError) throw e;
        if (++failures > 2) throw e;
        // network/5xx: brief backoff then try again (possibly another model)
        await new Promise((r) => setTimeout(r, 1200));
      }
    } finally {
      release(model);
    }
  }
  throw lastError instanceof Error ? lastError : new Error("LLM call failed");
}

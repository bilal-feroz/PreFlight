import { z } from "zod";
import { cached, isOffline, OfflineCacheMissError } from "./cache";
import type { Video } from "./types";

/**
 * Typed adapter for the Oriane "Integration connect" REST API.
 * Docs: https://connect.oriane.xyz/rest/docs (field inventory in docs/oriane-fields.md)
 *
 *  POST /rest/assets            create a reusable text/image asset for visual search
 *  POST /rest/contents/search   search indexed social contents (Instagram, TikTok)
 *
 * Every call is disk-cached by request hash, limited to 3 concurrent requests,
 * and counted against a per-run budget.
 */

const BASE_URL = process.env.ORIANE_BASE_URL || "https://connect.oriane.xyz";

// ---------------------------------------------------------------- request types

type Op = "and" | "or";
export type TextOperand = { values: string[]; operator?: Op };
export type TextFilter = {
  exactMatch?: TextOperand;
  includesExactly?: TextOperand;
  includesFuzzy?: TextOperand;
  excludesExactly?: TextOperand;
  excludesFuzzy?: TextOperand;
  operator?: Op;
};
export type ListFilter<T = string> = { includes?: T[]; excludes?: T[]; operator?: Op };
export type AssetRef = { assetId: string; minScore?: number; maxScore?: number };
export type VisualFilter = {
  includes?: { values: AssetRef[]; operator?: Op };
  excludes?: { values: AssetRef[]; operator?: Op };
  operator?: Op;
};
export type RangeFilter = { min?: number; max?: number };

export type Filters = {
  id?: ListFilter;
  platform?: ListFilter<"instagram" | "tiktok">;
  format?: ListFilter<"image" | "video" | "carousel">;
  caption?: TextFilter;
  transcript?: TextFilter;
  hashtags?: TextFilter;
  captionLanguage?: ListFilter;
  transcriptLanguage?: ListFilter;
  locationCompleteAddress?: TextFilter;
  profileLocationCompleteAddress?: TextFilter;
  publishedAt?: { after?: string; before?: string };
  viewsCount?: RangeFilter;
  visualSimilarity?: VisualFilter;
};

export type SearchQuery = { name?: string; operator: Op; filters?: Filters; queries?: SearchQuery[] };

export type SortField =
  | "visualSimilarity"
  | "transcriptRelevance"
  | "viewsCount"
  | "likesCount"
  | "sharesCount"
  | "commentsCount"
  | "interactionsCount"
  | "engagementRatePerViews"
  | "engagementRatePerFollowers"
  | "profileFollowersCount"
  | "publishedAt";

export type SearchOptions = {
  sort?: string; // e.g. "visualSimilarity" or "publishedAt:desc,viewsCount"
  limit?: number; // 1..100
  offset?: number;
  projection?: "basic" | "default" | "full";
  aiSearchAnchor?: string;
};

// ---------------------------------------------------------------- response schema (lenient)

const RawContentSchema = z.looseObject({
  id: z.string(),
  platform: z.string(),
  platformId: z.string().optional(),
  profileHandle: z.string(),
  profileDisplayName: z.string().nullish(),
  format: z.string().nullish(),
  caption: z.string().nullish(),
  captionLanguage: z.string().nullish(),
  publishedAt: z.string().nullish(),
  thumbnailMediaUrl: z.string().nullish(),
  viewsCount: z.number().nullish(),
  likesCount: z.number().nullish(),
  sharesCount: z.number().nullish(),
  commentsCount: z.number().nullish(),
  interactionsCount: z.number().nullish(),
  engagementRatePerViews: z.number().nullish(),
  engagementRatePerFollowers: z.number().nullish(),
  profileFollowersCount: z.number().nullish(),
  duration: z.number().nullish(),
  hashtags: z.array(z.string()).nullish(),
  locationCompleteAddress: z.string().nullish(),
  profileLocationCompleteAddress: z.string().nullish(),
  transcript: z.string().nullish(),
  transcriptLanguage: z.string().nullish(),
  transcriptChunks: z
    .array(z.object({ startSeconds: z.number(), endSeconds: z.number(), text: z.string() }))
    .nullish(),
  frames: z
    .array(
      z.object({
        timestampSeconds: z.number(),
        visualSimilarityScore: z.number().nullish(),
        url: z.string(),
      }),
    )
    .nullish(),
  matchedQueries: z.array(z.string()).nullish(),
});
export type RawContent = z.infer<typeof RawContentSchema>;

const SearchResponseSchema = z.object({
  data: z.object({
    aggregations: z.record(z.string(), z.number().nullable()).optional(),
    results: z.array(RawContentSchema),
  }),
  metadata: z.looseObject({
    requestId: z.string().optional(),
    executionTime: z.number().optional(),
    pagination: z
      .object({
        offset: z.number(),
        limit: z.number(),
        totalCount: z.number(),
        aiSearchAnchor: z.string().optional(),
      })
      .optional(),
  }),
});
export type SearchResponse = z.infer<typeof SearchResponseSchema>;

// ---------------------------------------------------------------- errors, budget, concurrency

export class OrianeError extends Error {
  constructor(message: string, public status?: number, public code?: string) {
    super(message);
    this.name = "OrianeError";
  }
}

export class BudgetExceededError extends Error {
  constructor(max: number) {
    super(`Oriane call budget reached (${max} uncached calls this run)`);
    this.name = "BudgetExceededError";
  }
}

/** Per-run guard: counts uncached (credit-spending) calls and returned results. */
export type OrianeBudget = { maxCalls: number; calls: number; results: number; cacheHits: number };

export function createBudget(maxCalls = Number(process.env.ORIANE_MAX_CALLS_PER_RUN ?? 40)): OrianeBudget {
  return { maxCalls, calls: 0, results: 0, cacheHits: 0 };
}

function createLimiter(max: number) {
  let active = 0;
  const queue: (() => void)[] = [];
  const pump = () => {
    while (active < max && queue.length) {
      active++;
      queue.shift()!();
    }
  };
  return <T>(fn: () => Promise<T>) =>
    new Promise<T>((resolve, reject) => {
      queue.push(() => {
        fn()
          .then(resolve, reject)
          .finally(() => {
            active--;
            pump();
          });
      });
      pump();
    });
}

const limit = createLimiter(3);

/** ORIANE_API_KEY may hold several comma-separated keys: the next one is used when a key runs out of credits. */
function orianeKeys(): string[] {
  return (process.env.ORIANE_API_KEY ?? "").split(",").map((k) => k.trim()).filter(Boolean);
}

let activeKey = 0;

async function orianeFetch(path: string, body: unknown, budget?: OrianeBudget): Promise<unknown> {
  const keys = orianeKeys();
  if (isOffline() || !keys.length) throw new OfflineCacheMissError(`Oriane ${path}`);
  if (budget) {
    if (budget.calls >= budget.maxCalls) throw new BudgetExceededError(budget.maxCalls);
    budget.calls++;
  }
  return limit(async () => {
    let lastErr: unknown;
    let serverErrors = 0;
    while (serverErrors < 2) {
      const keyIndex = Math.min(activeKey, keys.length - 1);
      try {
        const res = await fetch(`${BASE_URL}${path}`, {
          method: "POST",
          headers: { Authorization: `Bearer ${keys[keyIndex]}`, "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(120_000),
        });
        const json = (await res.json().catch(() => null)) as
          | { error?: { message?: string; code?: string } }
          | null;
        if (res.ok) return json;
        const err = new OrianeError(
          json?.error?.message ?? `Oriane HTTP ${res.status}`,
          res.status,
          json?.error?.code,
        );
        // out of credits (402) or key rejected: move to the next key and retry
        if ([401, 402, 403].includes(res.status) && keyIndex < keys.length - 1) {
          activeKey = Math.max(activeKey, keyIndex + 1);
          console.warn(`[oriane] key ${keyIndex + 1} returned ${res.status}; switching to key ${keyIndex + 2}`);
          continue;
        }
        if (res.status < 500) throw err; // other 4xx: don't retry
        lastErr = err;
      } catch (e) {
        if (e instanceof OrianeError && (e.status ?? 500) < 500) throw e;
        lastErr = e;
      }
      serverErrors++;
      await new Promise((r) => setTimeout(r, 1500));
    }
    throw lastErr;
  });
}

// ---------------------------------------------------------------- endpoints

/** Text asset for visual (AI Vision) search. Cached by text. */
export async function createTextAsset(text: string, budget?: OrianeBudget, fresh = false): Promise<string> {
  const request = { endpoint: "/rest/assets", type: "text", text, ...(fresh ? { nonce: Date.now() } : {}) };
  const { value, hit } = await cached("oriane-assets", request, async () => {
    const json = (await orianeFetch("/rest/assets", { type: "text", text }, budget)) as { data: { id: string } };
    return json.data.id;
  });
  if (hit && budget) budget.cacheHits++;
  return value;
}

export async function searchContents(
  query: SearchQuery,
  opts: SearchOptions = {},
  budget?: OrianeBudget,
): Promise<{ response: SearchResponse; hit: boolean }> {
  const options: SearchOptions = { projection: "full", limit: 50, offset: 0, ...opts };
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(options)) if (v !== undefined) params.set(k, String(v));
  const request = { endpoint: "/rest/contents/search", query, options };
  const { value, hit } = await cached("oriane-search", request, async () => {
    const json = await orianeFetch(`/rest/contents/search?${params}`, query, budget);
    return SearchResponseSchema.parse(json);
  });
  if (budget) {
    if (hit) budget.cacheHits++;
    else budget.results += value.data.results.length;
  }
  return { response: value, hit };
}

/**
 * Visual search from a natural-language description. If a cached asset id has
 * expired server-side, the asset is recreated once.
 */
export async function searchVisual(
  description: string,
  extra: { filters?: Filters; queries?: SearchQuery[] } = {},
  opts: SearchOptions = {},
  budget?: OrianeBudget,
) {
  const run = async (assetId: string) =>
    searchContents(
      {
        name: description.slice(0, 60),
        operator: "and",
        filters: { ...extra.filters, visualSimilarity: { includes: { values: [{ assetId }] } } },
        ...(extra.queries ? { queries: extra.queries } : {}),
      },
      { sort: "visualSimilarity", ...opts },
      budget,
    );
  const assetId = await createTextAsset(description, budget);
  try {
    return await run(assetId);
  } catch (e) {
    if (e instanceof OrianeError && (e.status === 404 || e.status === 400) && /asset/i.test(e.message)) {
      return run(await createTextAsset(description, budget, true));
    }
    throw e;
  }
}

// ---------------------------------------------------------------- normalization

export function videoUrl(r: Pick<RawContent, "platform" | "platformId" | "profileHandle">): string {
  if (!r.platformId) return r.platform === "tiktok" ? `https://www.tiktok.com/@${r.profileHandle}` : `https://www.instagram.com/${r.profileHandle}/`;
  return r.platform === "tiktok"
    ? `https://www.tiktok.com/@${r.profileHandle}/video/${r.platformId}`
    : `https://www.instagram.com/p/${r.platformId}/`;
}

const n = (v: number | null | undefined) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
const s = (v: string | null | undefined) => (typeof v === "string" && v.trim() ? v.trim() : undefined);

export function normalizeVideo(r: RawContent): Video {
  const locationHints = [s(r.locationCompleteAddress), s(r.profileLocationCompleteAddress)].filter(
    (x): x is string => Boolean(x),
  );
  return {
    id: r.id,
    url: videoUrl(r),
    platform: r.platform,
    creator: r.profileHandle,
    creatorName: s(r.profileDisplayName),
    followers: n(r.profileFollowersCount),
    thumbnailUrl: s(r.thumbnailMediaUrl),
    publishedAt: s(r.publishedAt),
    views: n(r.viewsCount),
    likes: n(r.likesCount),
    comments: n(r.commentsCount),
    shares: n(r.sharesCount),
    transcript: s(r.transcript),
    caption: s(r.caption),
    hashtags: r.hashtags ?? undefined,
    language: s(r.transcriptLanguage) ?? s(r.captionLanguage),
    captionLanguage: s(r.captionLanguage),
    transcriptLanguage: s(r.transcriptLanguage),
    locationHints: locationHints.length ? locationHints : undefined,
    durationSec: n(r.duration),
    transcriptChunks: r.transcriptChunks?.map((c) => ({ start: c.startSeconds, end: c.endSeconds, text: c.text })),
    frames: r.frames?.map((f) => ({ t: f.timestampSeconds, score: n(f.visualSimilarityScore), url: f.url })),
    raw: r,
  };
}

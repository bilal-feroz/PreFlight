import { POOL } from "./config";
import {
  normalizeVideo,
  searchContents,
  searchVisual,
  type OrianeBudget,
  type SearchQuery,
  type SearchResponse,
} from "./oriane";
import type { ConceptExtraction } from "./prompts";
import type { MarketKey } from "./result-types";
import type { Video } from "./types";

export type ProbeSpec = {
  id: string;
  kind: "visual" | "spoken" | "baseline";
  text: string;
  market: MarketKey;
  limit: number;
};

export type Hit = { probe: string; rank: number; market: MarketKey };

export type PoolData = {
  videos: Map<string, Video>;
  hits: Map<string, Hit[]>;
  totals: Record<string, number>;
  probes: ProbeSpec[];
};

const UAE_LOCATIONS = ["Dubai", "Abu Dhabi", "United Arab Emirates", "Sharjah", "Ras al Khaimah", "Ajman"];

export function buildProbes(x: ConceptExtraction, prefix: string, reroute = false): ProbeSpec[] {
  const limit = reroute ? POOL.rerouteProbeLimit : POOL.globalProbeLimit;
  const global = x.probes.slice(0, 8).map<ProbeSpec>((p, k) => ({
    id: `${prefix}g${k}`,
    kind: p.mode,
    text: p.text,
    market: "global",
    limit,
  }));
  const firstVisual = x.probes.find((p) => p.mode === "visual")?.text ?? x.dna.hook;
  const probes: ProbeSpec[] = [...global];
  if (!reroute) {
    probes.push({ id: `${prefix}base`, kind: "baseline", text: x.topicKeywords.slice(0, 6).join(" "), market: "global", limit: POOL.baselineLimit });
  }
  const arabic = reroute ? x.arabicProbes.slice(0, 1) : x.arabicProbes.slice(0, 2);
  arabic.forEach((text, k) => probes.push({ id: `${prefix}ar${k}`, kind: "spoken", text, market: "arabic", limit: POOL.marketProbeLimit }));
  probes.push({ id: `${prefix}arv`, kind: "visual", text: firstVisual, market: "arabic", limit: POOL.marketProbeLimit });
  const uae = reroute ? x.uaeProbes.slice(0, 1) : x.uaeProbes.slice(0, 2);
  uae.forEach((text, k) => probes.push({ id: `${prefix}uae${k}`, kind: "visual", text, market: "uae", limit: POOL.marketProbeLimit }));
  return probes;
}

const topicGuard = (kw: string[]): SearchQuery => ({
  operator: "or",
  filters: {
    transcript: { includesFuzzy: { values: kw } },
    caption: { includesFuzzy: { values: kw } },
    hashtags: { includesFuzzy: { values: kw.map((k) => k.replace(/\s+/g, "")) } },
  },
});

const arabicGuard: SearchQuery = {
  operator: "or",
  filters: { transcriptLanguage: { includes: ["ar"] }, captionLanguage: { includes: ["ar"] } },
};

const UAE_TEXT = ["dubai", "abu dhabi", "emirates", "دبي", "أبوظبي", "الإمارات"];
const uaeGuard: SearchQuery = {
  operator: "or",
  filters: {
    caption: { includesFuzzy: { values: UAE_TEXT } },
    transcript: { includesFuzzy: { values: UAE_TEXT } },
    hashtags: { includesFuzzy: { values: ["dubai", "abudhabi", "uae", "دبي"] } },
    locationCompleteAddress: { includesFuzzy: { values: UAE_LOCATIONS } },
  },
};

function spokenQuery(text: string, exact: boolean): SearchQuery {
  const operand = { values: [text.replace(/[?!.,"“”]/g, "").trim()] };
  return {
    operator: "or",
    filters: exact
      ? { transcript: { includesExactly: operand }, caption: { includesExactly: operand } }
      : { transcript: { includesFuzzy: operand }, caption: { includesFuzzy: operand } },
  };
}

/** exact phrase first (precise); fall back to fuzzy only when the phrase is rare */
const MIN_EXACT = 8;

async function runProbe(p: ProbeSpec, keywords: string[], budget: OrianeBudget): Promise<SearchResponse> {
  const guards: SearchQuery[] = [];
  if (keywords.length) guards.push(topicGuard(keywords));
  if (p.market === "arabic" && p.kind === "visual") guards.push(arabicGuard);
  if (p.market === "uae") guards.push(uaeGuard);

  if (p.kind === "visual") {
    try {
      const { response } = await searchVisual(p.text, { queries: guards }, { limit: p.limit }, budget);
      return response;
    } catch (e) {
      if (guards.length < 2) throw e;
      // heavy nested filters can fail server-side: retry with the market guard only
      const { response } = await searchVisual(p.text, { queries: guards.slice(1) }, { limit: p.limit }, budget);
      return response;
    }
  }
  if (p.kind === "baseline") {
    const { response } = await searchContents(topicGuard(keywords), { sort: "transcriptRelevance", limit: p.limit }, budget);
    return response;
  }
  // spoken: phrase said in the video (or written in the caption), kept on-topic
  const build = (exact: boolean): SearchQuery =>
    p.market === "arabic" || !guards.length ? spokenQuery(p.text, exact) : { operator: "and", queries: [spokenQuery(p.text, exact), ...guards] };
  if (p.market !== "arabic") {
    const { response } = await searchContents(build(true), { sort: "transcriptRelevance", limit: p.limit }, budget);
    if (response.data.results.length >= MIN_EXACT) return response;
  }
  const { response } = await searchContents(build(false), { sort: "transcriptRelevance", limit: p.limit }, budget);
  return response;
}

/**
 * Runs probes (concurrency is enforced by the Oriane adapter), dedupes by
 * video id and caps the pool by interleaving probe rankings, so every probe
 * (including the market probes) is represented.
 */
export async function retrieve(
  probes: ProbeSpec[],
  keywords: string[],
  budget: OrianeBudget,
  maxVideos: number,
  onProbe?: (done: number, total: number, probe: ProbeSpec, found: number) => void,
  existing?: Set<string>,
): Promise<PoolData> {
  const kw = [...new Set(keywords.map((k) => k.trim()).filter((k) => k.length > 1))].slice(0, 10);
  let done = 0;
  const lists = await Promise.all(
    probes.map(async (p) => {
      try {
        const res = await runProbe(p, kw, budget);
        const videos = res.data.results.map(normalizeVideo).filter((v) => v.platform && v.id);
        onProbe?.(++done, probes.length, p, videos.length);
        return { p, videos, total: res.metadata.pagination?.totalCount ?? videos.length };
      } catch (e) {
        onProbe?.(++done, probes.length, p, 0);
        console.warn(`[retrieve] probe ${p.id} failed:`, e instanceof Error ? e.message : e);
        return { p, videos: [] as Video[], total: 0 };
      }
    }),
  );

  const videos = new Map<string, Video>();
  const hits = new Map<string, Hit[]>();
  const totals: Record<string, number> = {};
  for (const { p, videos: vs, total } of lists) {
    totals[p.id] = total;
    vs.forEach((v, rank) => {
      const h = hits.get(v.id) ?? [];
      h.push({ probe: p.id, rank, market: p.market });
      hits.set(v.id, h);
    });
  }

  // interleave by rank until the cap
  const maxLen = Math.max(0, ...lists.map((l) => l.videos.length));
  for (let rank = 0; rank < maxLen && videos.size < maxVideos; rank++) {
    for (const l of lists) {
      const v = l.videos[rank];
      if (!v || videos.has(v.id) || existing?.has(v.id)) continue;
      videos.set(v.id, v);
      if (videos.size >= maxVideos) break;
    }
  }
  for (const id of [...hits.keys()]) if (!videos.has(id) && !existing?.has(id)) hits.delete(id);
  return { videos, hits, totals, probes };
}

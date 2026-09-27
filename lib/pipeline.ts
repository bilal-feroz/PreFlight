import { bestFrameTime, compareAll, extractConcept, videoDnas, type VideoDNA } from "./analysis";
import { hashKey, readCache, writeCache } from "./cache";
import { POOL } from "./config";
import { detectFeatures } from "./features";
import { DIMENSION_NOUNS } from "./labels";
import { extendAirspace, layoutAirspace, type LayoutInput } from "./layout";
import { llmJson } from "./llm";
import { createBudget, type OrianeBudget } from "./oriane";
import { reroutePrompt, RerouteSchema, toCreativeDNA, type ConceptExtraction } from "./prompts";
import type {
  Airspace,
  Collision,
  PreflightResult,
  ProgressEvent,
  RerouteResult,
  SampleInfo,
  Territory,
  VideoCard,
} from "./result-types";
import { buildProbes, retrieve, type Hit } from "./retrieval";
import { creativePosition, isArabic, isUaeContext, responseModel } from "./scoring";
import { getVideo, prefetchThumbs, putVideos } from "./store";
import { clusterStats, openTerritory, type TerritoryContext } from "./territory";
import { DIMENSIONS, type CreativeDNA, type Match, type Video } from "./types";

type Emit = (e: ProgressEvent) => void;

type RunState = {
  runId: string;
  brief: string;
  dna: CreativeDNA;
  extraction: ConceptExtraction;
  poolIds: string[];
  hits: [string, Hit[]][];
  airspace: Airspace;
  territories: Territory[];
  territoryContext: Record<string, TerritoryContext>;
  orianeCalls: number;
};

// ------------------------------------------------------------------ helpers

function card(v: Video, dna: VideoDNA | undefined, match: Match | undefined): VideoCard {
  return {
    id: v.id,
    url: v.url,
    platform: v.platform,
    creator: v.creator,
    creatorName: v.creatorName,
    followers: v.followers,
    views: v.views,
    likes: v.likes,
    comments: v.comments,
    shares: v.shares,
    publishedAt: v.publishedAt,
    thumb: `/api/thumb/${v.id}`,
    hasThumb: Boolean(v.thumbnailUrl),
    language: v.language,
    durationSec: v.durationSec,
    format: dna?.format ?? "other",
    hook: dna?.hook || undefined,
    motifs: dna?.visualMotifs?.length ? dna.visualMotifs : undefined,
    snippet: match?.evidence.transcriptSnippet ?? (v.transcript ?? v.caption)?.replace(/\s+/g, " ").slice(0, 180),
    snippetT: match?.evidence.timestampSec,
    frameT: bestFrameTime(v),
    markets: { arabic: isArabic(v), uae: isUaeContext(v) },
  };
}

function topCollisions(matches: Map<string, Match>, videos: Map<string, Video>, n = 3): Collision[] {
  return [...matches.values()]
    .filter((m) => videos.get(m.videoId)?.thumbnailUrl)
    .sort((a, b) => b.overall - a.overall || (videos.get(b.videoId)?.views ?? 0) - (videos.get(a.videoId)?.views ?? 0))
    .slice(0, n)
    .map((m) => ({ id: m.videoId, overall: m.overall, dims: m.dims, shared: m.shared, different: m.different }));
}

function sampleInfo(videos: Video[], probes: number, budget: OrianeBudget): SampleInfo {
  const platforms: Record<string, number> = {};
  for (const v of videos) platforms[v.platform] = (platforms[v.platform] ?? 0) + 1;
  const dates = videos.map((v) => v.publishedAt).filter(Boolean).sort() as string[];
  return {
    n: videos.length,
    probes,
    platforms,
    dateRange: dates.length ? [dates[0], dates[dates.length - 1]] : null,
    orianeCalls: budget.calls + budget.cacheHits,
  };
}

function layoutItems(videos: Video[], dnas: Map<string, VideoDNA>, matches: Map<string, Match>): LayoutInput[] {
  return videos.map((v) => ({ id: v.id, format: dnas.get(v.id)?.format ?? "other", sim: matches.get(v.id)?.overall ?? 0 }));
}

/** keep the galaxy at <= galaxyMax nodes, dropping the least similar first but never the evidence */
function capNodes(ids: Video[], score: (v: Video) => number, keep: Set<string>): Video[] {
  if (ids.length <= POOL.galaxyMax) return ids;
  const sorted = [...ids].sort((a, b) => Number(keep.has(b.id)) - Number(keep.has(a.id)) || score(b) - score(a));
  return sorted.slice(0, POOL.galaxyMax);
}

async function loadVideos(ids: string[]): Promise<Video[]> {
  const out: Video[] = [];
  for (const id of ids) {
    const v = await getVideo(id);
    if (v) out.push({ ...v, raw: undefined });
  }
  return out;
}

const CROWDED_AT = 60;

// ------------------------------------------------------------------ Preflight

export async function runPreflight(brief: string, emit: Emit): Promise<PreflightResult> {
  const clean = brief.trim().replace(/\s+/g, " ");
  const runId = hashKey({ brief: clean }).slice(0, 16);
  const budget = createBudget();

  emit({ type: "stage", stage: "dna", label: "Reading your idea" });
  const { extraction, dna } = await extractConcept(clean);
  emit({ type: "dna", dna });

  const probes = buildProbes(extraction, "p");
  emit({ type: "stage", stage: "search", label: "Searching Oriane", detail: `${probes.length} probes` });
  const pool = await retrieve(probes, extraction.topicKeywords, budget, POOL.maxVideos, (done, total, p, found) =>
    emit({ type: "progress", stage: "search", done, total, detail: `“${p.text.slice(0, 64)}” · ${found} videos` }),
  );
  const videos = [...pool.videos.values()];
  if (!videos.length) throw new Error("Oriane returned no videos for this idea. Try describing what is seen or said.");
  await putVideos(videos);
  const thumbs = prefetchThumbs(videos);

  emit({ type: "stage", stage: "read", label: `Reading ${videos.length} videos`, detail: "speech, captions, hooks, formats" });
  const dnas = await videoDnas(videos, (done, total) => emit({ type: "progress", stage: "read", done, total }));
  const analyzed = videos.filter((v) => dnas.has(v.id));

  emit({ type: "stage", stage: "compare", label: "Comparing", detail: `${analyzed.length} videos × 6 dimensions` });
  const matches = await compareAll(
    dna,
    analyzed.map((v) => ({ video: v, dna: dnas.get(v.id)! })),
    (done, total) => emit({ type: "progress", stage: "compare", done, total }),
    clean,
  );

  emit({ type: "stage", stage: "map", label: "Mapping", detail: "crowding, lifecycle, market, airspace" });
  const scored = analyzed.filter((v) => matches.has(v.id));
  if (!scored.length) throw new Error("Could not compare any videos (language model unavailable). Try again in a minute.");
  const byId = new Map(scored.map((v) => [v.id, v]));
  const rm = responseModel(scored);
  const position = creativePosition(scored, matches, rm);
  const { territories, context } = openTerritory({ dna, videos: scored, dnas, matches, rm, position });
  const collisions = topCollisions(matches, byId);

  const keep = new Set([...collisions.map((c) => c.id), ...territories.flatMap((t) => t.evidence)]);
  const shown = capNodes(scored, (v) => matches.get(v.id)?.overall ?? 0, keep);
  const airspace = layoutAirspace(
    layoutItems(shown, dnas, matches),
    clusterStats(shown, dnas, rm),
    position.global.crowding.score >= CROWDED_AT,
  );
  await thumbs;

  const state: RunState = {
    runId,
    brief: clean,
    dna,
    extraction,
    poolIds: scored.map((v) => v.id),
    hits: [...pool.hits].filter(([id]) => byId.has(id)),
    airspace,
    territories,
    territoryContext: context,
    orianeCalls: budget.calls + budget.cacheHits,
  };
  await writeCache("runs", runId, { value: state });

  return {
    runId,
    brief: clean,
    dna,
    sample: sampleInfo(scored, probes.length, budget),
    features: (({ coverage: _c, ...f }) => f)(detectFeatures(scored)),
    position,
    collisions,
    videos: Object.fromEntries(scored.map((v) => [v.id, card(v, dnas.get(v.id), matches.get(v.id))])),
    airspace,
    territories,
  };
}

// ------------------------------------------------------------------ Reroute

export async function runReroute(runId: string, territoryId: string, emit: Emit): Promise<RerouteResult> {
  const state = (await readCache<{ value: RunState }>("runs", runId))?.value;
  if (!state) throw new Error("This run is no longer available. Run Preflight again first.");
  const territory = state.territories.find((t) => t.id === territoryId);
  const ctx = state.territoryContext[territoryId];
  if (!territory || !ctx) throw new Error("Unknown territory for this run.");
  const budget = createBudget();

  emit({ type: "stage", stage: "dna", label: "Rewriting the idea", detail: territory.name });
  const oldVideos = await loadVideos(state.poolIds);
  const oldDnas = await videoDnas(oldVideos);
  const oldPairs = oldVideos.filter((v) => oldDnas.has(v.id)).map((v) => ({ video: v, dna: oldDnas.get(v.id)! }));
  const beforeMatches = await compareAll(state.dna, oldPairs, undefined, state.brief);
  const rmOld = responseModel(oldVideos);
  const original = creativePosition(oldVideos, beforeMatches, rmOld).global;
  const sat = original.saturation;
  const dimsBySat = [...DIMENSIONS].sort((a, b) => sat[b] - sat[a]);

  const { system, user } = reroutePrompt({
    brief: state.brief,
    dna: state.dna,
    saturated: dimsBySat.slice(0, 3).map((d) => `${DIMENSION_NOUNS[d]} ${Math.round(sat[d] * 100)}%`),
    open: dimsBySat.slice(-2).map((d) => `${DIMENSION_NOUNS[d]} ${Math.round(sat[d] * 100)}%`),
    territory: { kind: territory.kind, name: territory.name, why: territory.why, instruction: ctx.instruction, examples: ctx.examples },
  });
  const rx = await llmJson({ task: "reroute", system, user, schema: RerouteSchema, tier: "smart", maxTokens: 2600 });
  const newDna = toCreativeDNA(rx.dna);
  emit({ type: "dna", dna: newDna });

  const probes = buildProbes(rx, "r", true);
  emit({ type: "stage", stage: "search", label: "Searching Oriane", detail: `${probes.length} probes for the rerouted idea` });
  const existing = new Set(state.poolIds);
  const room = Math.max(40, POOL.mergedMax - existing.size);
  const pool = await retrieve(
    probes,
    [...new Set([...rx.topicKeywords, ...state.extraction.topicKeywords])],
    budget,
    room,
    (done, total, p, found) => emit({ type: "progress", stage: "search", done, total, detail: `“${p.text.slice(0, 64)}” · ${found} videos` }),
    existing,
  );
  const newVideos = [...pool.videos.values()];
  await putVideos(newVideos);
  const thumbs = prefetchThumbs(newVideos);

  emit({ type: "stage", stage: "read", label: `Reading ${newVideos.length} new videos` });
  const newDnas = await videoDnas(newVideos, (done, total) => emit({ type: "progress", stage: "read", done, total }));
  const dnas = new Map([...oldDnas, ...newDnas]);
  const merged = [...oldVideos, ...newVideos].filter((v) => dnas.has(v.id));
  const pairs = merged.map((v) => ({ video: v, dna: dnas.get(v.id)! }));

  emit({ type: "stage", stage: "compare", label: "Comparing both ideas", detail: `same pool of ${merged.length} videos` });
  let doneA = 0;
  let doneB = 0;
  const report = () => emit({ type: "progress", stage: "compare", done: doneA + doneB, total: merged.length * 2 });
  const [mBefore, mAfter] = await Promise.all([
    compareAll(state.dna, pairs, (d) => ((doneA = d), report()), state.brief),
    compareAll(newDna, pairs, (d) => ((doneB = d), report()), rx.brief),
  ]);

  emit({ type: "stage", stage: "map", label: "Mapping", detail: "before / after on the same pool" });
  const scored = merged.filter((v) => mBefore.has(v.id) && mAfter.has(v.id));
  const byId = new Map(scored.map((v) => [v.id, v]));
  const rm = responseModel(scored);
  const before = creativePosition(scored, mBefore, rm);
  const after = creativePosition(scored, mAfter, rm);
  const collisionsAfter = topCollisions(mAfter, byId);

  const baseIds = new Set(state.airspace.nodes.map((n) => n.id));
  const newShown = scored.filter((v) => !baseIds.has(v.id));
  const keep = new Set(collisionsAfter.map((c) => c.id));
  const roomInGalaxy = Math.max(0, POOL.galaxyMax - baseIds.size);
  const newInGalaxy = [...newShown]
    .sort((a, b) => Number(keep.has(b.id)) - Number(keep.has(a.id)) || (mAfter.get(b.id)?.overall ?? 0) - (mAfter.get(a.id)?.overall ?? 0))
    .slice(0, roomInGalaxy);
  const galaxyVideos = [...scored.filter((v) => baseIds.has(v.id)), ...newInGalaxy];
  const airspace = extendAirspace(
    state.airspace,
    layoutItems(newInGalaxy, dnas, mBefore),
    galaxyVideos.map((v) => ({ id: v.id, format: dnas.get(v.id)?.format ?? "other", simAfter: mAfter.get(v.id)?.overall ?? 0 })),
    clusterStats(galaxyVideos, dnas, rm),
    state.airspace.crowded,
  );
  await thumbs;

  return {
    runId,
    territoryId,
    brief: rx.brief,
    dna: newDna,
    changes: rx.changes,
    before,
    after,
    collisionsAfter,
    airspace,
    videos: Object.fromEntries(scored.map((v) => [v.id, card(v, dnas.get(v.id), mAfter.get(v.id))])),
    sample: sampleInfo(scored, probes.length, budget),
  };
}

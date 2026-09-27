import { hashKey, readCache, writeCache } from "./cache";
import { LLM_BATCH } from "./config";
import { llmJson } from "./llm";
import {
  CompareBatchSchema,
  comparePrompt,
  ConceptExtractionSchema,
  conceptPrompt,
  toCreativeDNA,
  VideoDnaBatchSchema,
  videoDnaPrompt,
  type ConceptExtraction,
  type DnaLite,
} from "./prompts";
import { overallSimilarity } from "./scoring";
import { DIMENSIONS, type CreativeDNA, type Dimension, type Match, type Video } from "./types";

const VIDEO_DNA_VERSION = 3;
const COMPARE_VERSION = 4;

export async function extractConcept(brief: string): Promise<{ extraction: ConceptExtraction; dna: CreativeDNA }> {
  const { system, user } = conceptPrompt(brief);
  const extraction = await llmJson({ task: "concept", system, user, schema: ConceptExtractionSchema, tier: "smart", maxTokens: 2200 });
  return { extraction, dna: toCreativeDNA(extraction.dna) };
}

function chunks<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]);
      }
    }),
  );
  return out;
}

// ------------------------------------------------------------------ video DNA (per video, cached forever)

export type VideoDNA = DnaLite & { tone: string[] };

const dnaKey = (id: string) => hashKey({ v: VIDEO_DNA_VERSION, id });

function openingOf(v: Video): string | undefined {
  const early = v.transcriptChunks?.filter((c) => c.start < 3.5).map((c) => c.text).join(" ");
  return early || undefined;
}

export async function videoDnas(
  videos: Video[],
  onProgress?: (done: number, total: number) => void,
): Promise<Map<string, VideoDNA>> {
  const out = new Map<string, VideoDNA>();
  const todo: Video[] = [];
  for (const v of videos) {
    const hit = await readCache<{ value: VideoDNA }>("video-dna", dnaKey(v.id));
    if (hit) out.set(v.id, hit.value);
    else todo.push(v);
  }
  let done = out.size;
  onProgress?.(done, videos.length);
  const runBatch = async (batch: Video[], countProgress: boolean) => {
    try {
      const { system, user } = videoDnaPrompt(
        batch.map((v) => ({
          platform: v.platform,
          durationSec: v.durationSec,
          language: v.language,
          caption: v.caption,
          hashtags: v.hashtags,
          opening: openingOf(v),
          transcript: v.transcript,
        })),
      );
      const res = await llmJson({ task: "video-dna", system, user, schema: VideoDnaBatchSchema, tier: "batch", maxTokens: 2200 });
      for (const row of res.videos) {
        const v = batch[row.i - 1];
        if (!v) continue;
        const dna: VideoDNA = {
          format: row.format,
          hook: row.hook,
          narrativeArc: row.arc,
          visualMotifs: row.motifs,
          productInteraction: row.product,
          topic: row.topic,
          tone: row.tone,
          locationContext: row.location,
        };
        out.set(v.id, dna);
        await writeCache("video-dna", dnaKey(v.id), { value: dna });
      }
    } catch (e) {
      console.warn("[video-dna] batch failed:", e instanceof Error ? e.message : e);
    }
    if (countProgress) {
      done += batch.length;
      onProgress?.(Math.min(done, videos.length), videos.length);
    }
  };
  await mapLimit(chunks(todo, LLM_BATCH.size), LLM_BATCH.concurrency, (b) => runBatch(b, true));
  const skipped = todo.filter((v) => !out.has(v.id));
  if (skipped.length) await mapLimit(chunks(skipped, 10), LLM_BATCH.concurrency, (b) => runBatch(b, false));
  return out;
}

// ------------------------------------------------------------------ comparison (per concept × video, cached)

export function conceptKey(dna: CreativeDNA, brief?: string): string {
  return hashKey({ v: COMPARE_VERSION, dna, brief });
}

function evidenceText(v: Video): string {
  const opening = v.transcriptChunks?.length
    ? v.transcriptChunks.filter((c) => c.start < 6).map((c) => c.text).join(" ")
    : (v.transcript ?? "").slice(0, 110);
  return [opening, v.caption ? `caption: ${v.caption.slice(0, 70)}` : ""].filter(Boolean).join(" · ");
}

type CompareRow = { dims: Record<Dimension, number>; shared: string[]; different: string[] };

export async function compareAll(
  concept: CreativeDNA,
  videos: { video: Video; dna: VideoDNA }[],
  onProgress?: (done: number, total: number) => void,
  brief?: string,
): Promise<Map<string, Match>> {
  const ck = conceptKey(concept, brief);
  const rows = new Map<string, CompareRow>();
  const todo: { video: Video; dna: VideoDNA }[] = [];
  for (const item of videos) {
    const hit = await readCache<{ value: CompareRow }>("compare", `${ck}_${item.video.id}`);
    if (hit) rows.set(item.video.id, hit.value);
    else todo.push(item);
  }
  let done = rows.size;
  onProgress?.(done, videos.length);
  const runBatch = async (batch: { video: Video; dna: VideoDNA }[], countProgress: boolean) => {
    try {
      const { system, user } = comparePrompt(
        concept,
        batch.map((b) => ({ ...b.dna, evidence: evidenceText(b.video) })),
        brief,
      );
      const res = await llmJson({ task: "compare", system, user, schema: CompareBatchSchema, tier: "judge", maxTokens: 1800 });
      for (const r of res.r) {
        const item = batch[r.i - 1];
        if (!item) continue;
        const row: CompareRow = {
          dims: { hook: r.hook, narrative: r.narrative, visual: r.visual, format: r.format, topic: r.topic, product: r.product },
          shared: r.same,
          different: r.diff,
        };
        rows.set(item.video.id, row);
        await writeCache("compare", `${ck}_${item.video.id}`, { value: row });
      }
    } catch (e) {
      console.warn("[compare] batch failed:", e instanceof Error ? e.message : e);
    }
    if (countProgress) {
      done += batch.length;
      onProgress?.(Math.min(done, videos.length), videos.length);
    }
  };
  await mapLimit(chunks(todo, LLM_BATCH.size), LLM_BATCH.concurrency, (b) => runBatch(b, true));
  const skipped = todo.filter((t) => !rows.has(t.video.id));
  if (skipped.length) await mapLimit(chunks(skipped, 10), LLM_BATCH.concurrency, (b) => runBatch(b, false));

  const matches = new Map<string, Match>();
  for (const { video, dna } of videos) {
    const row = rows.get(video.id);
    if (!row) continue;
    const dims = Object.fromEntries(DIMENSIONS.map((d) => [d, row.dims[d] ?? 0])) as Record<Dimension, number>;
    const ev = bestEvidence(video, concept, row.shared, dna);
    matches.set(video.id, {
      videoId: video.id,
      dims,
      overall: overallSimilarity(dims),
      shared: row.shared,
      different: row.different,
      evidence: ev,
    });
  }
  return matches;
}

// ------------------------------------------------------------------ evidence (picked in code from the real transcript)

const STOP = new Set(
  "the a an and or but to of in on at for with from by is are was were be been this that it its i you he she they we me my your our their what which who how when where why do does did so just like really very can will not no yes".split(
    " ",
  ),
);

function terms(s: string): string[] {
  return s
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length > 2 && !STOP.has(w));
}

export function bestEvidence(
  video: Video,
  concept: CreativeDNA,
  shared: string[],
  dna?: VideoDNA,
): Match["evidence"] {
  const want = new Set(terms([concept.hook, ...concept.topic, concept.productInteraction, ...shared].join(" ")));
  const frames = video.frames?.filter((f) => typeof f.score === "number") ?? [];
  const bestFrame = frames.length ? frames.reduce((a, b) => ((b.score ?? 0) > (a.score ?? 0) ? b : a)) : undefined;
  const chunksList = video.transcriptChunks ?? [];
  let best: { text: string; t: number; score: number } | undefined;
  for (let i = 0; i < chunksList.length; i++) {
    // join with the next chunk so snippets read as a phrase
    const text = [chunksList[i].text, chunksList[i + 1]?.text].filter(Boolean).join(" ").trim();
    const overlap = terms(text).filter((w) => want.has(w)).length;
    const score = overlap + (chunksList[i].start < 4 ? 0.6 : 0) - i * 0.01;
    if (!best || score > best.score) best = { text, t: chunksList[i].start, score };
  }
  const snippet = best?.text ?? video.transcript ?? video.caption;
  return {
    transcriptSnippet: snippet ? snippet.replace(/\s+/g, " ").trim().slice(0, 180) : undefined,
    timestampSec: best?.t ?? bestFrame?.t,
    visualTags: dna?.visualMotifs,
  };
}

export function bestFrameTime(video: Video): number | undefined {
  const frames = video.frames?.filter((f) => typeof f.score === "number") ?? [];
  if (!frames.length) return undefined;
  return frames.reduce((a, b) => ((b.score ?? 0) > (a.score ?? 0) ? b : a)).t;
}

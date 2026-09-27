import {
  ARABIC_SCRIPT_SHARE,
  BANDS,
  CONFIDENCE,
  CROWDING,
  LIFECYCLE,
  LOW_DATA,
  MARKET_TIMING,
  SATURATION_DIM,
  UAE_TERMS,
  WEIGHTS,
} from "./config";
import { DIMENSION_NOUNS } from "./labels";
import type {
  CreativePosition,
  CrowdingResult,
  LifecycleResult,
  LifecycleStage,
  MarketKey,
  MarketTiming,
  PositionResult,
} from "./result-types";
import { DIMENSIONS, type Dimension, type Match, type Video } from "./types";

// ------------------------------------------------------------------ similarity & crowding

export function overallSimilarity(d: Record<Dimension, number>): number {
  const s = DIMENSIONS.reduce((acc, k) => acc + WEIGHTS[k] * (d[k] ?? 0), 0);
  return Math.round(s * 1000) / 1000;
}

export function crowding(matches: Match[]): CrowdingResult {
  const exact = matches.filter((m) => m.overall >= BANDS.exact).length;
  const close = matches.filter((m) => m.overall >= BANDS.close && m.overall < BANDS.exact).length;
  const medium = matches.filter((m) => m.overall >= BANDS.medium && m.overall < BANDS.close).length;
  const score = Math.round(
    100 *
      (CROWDING.wExact * Math.min(1, exact / CROWDING.exactCap) +
        CROWDING.wClose * Math.min(1, close / CROWDING.closeCap) +
        CROWDING.wMedium * Math.min(1, medium / CROWDING.mediumCap)),
  );
  const label = CROWDING.labels.find(([min]) => score >= min)![1];
  return { score, label, exact, close, medium };
}

export function saturation(matches: Match[]): Record<Dimension, number> {
  const relevant = matches.filter((m) => m.overall >= BANDS.relevant);
  const n = Math.max(1, relevant.length);
  return Object.fromEntries(
    DIMENSIONS.map((d) => [d, relevant.length ? relevant.filter((m) => m.dims[d] >= SATURATION_DIM).length / n : 0]),
  ) as Record<Dimension, number>;
}

export function confidence(relevantN: number): PositionResult["confidence"] {
  const level = relevantN >= CONFIDENCE.high ? "High" : relevantN >= CONFIDENCE.medium ? "Medium" : "Low";
  return { level, n: relevantN };
}

/** Templated from the highest and lowest saturated dimensions. */
export function insightSentence(sat: Record<Dimension, number>, crowd: CrowdingResult, relevant: number): string {
  if (relevant < 5) return "Too few similar videos in this sample to call it.";
  const sorted = [...DIMENSIONS].sort((a, b) => sat[b] - sat[a]);
  const high = sorted[0];
  const low = sorted[sorted.length - 1];
  if (sat[high] < 0.2) return "No single element of this idea is saturated yet.";
  if (crowd.score >= 45) return `Your ${DIMENSION_NOUNS[low]} isn't the problem. Your ${DIMENSION_NOUNS[high]} is.`;
  return `Your ${DIMENSION_NOUNS[high]} is familiar. The idea as a whole still has room.`;
}

// ------------------------------------------------------------------ relative response (age-matched)

const WEEK = 7 * 864e5;

function rawResponse(v: Video): number | undefined {
  if (typeof v.views !== "number") return undefined;
  if (typeof v.followers === "number" && v.followers > 0) return v.views / v.followers;
  return v.views;
}

function median(xs: number[]): number | undefined {
  if (!xs.length) return undefined;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
export { median };

export type ResponseModel = {
  anchor: number; // ms timestamp of the newest video in the pool
  /** relative response: raw response ÷ median raw response of pool videos published the same week (1 = typical) */
  rel: (v: Video) => number | undefined;
};

/** Normalizing by same-week pool videos removes the "newer videos had less time to collect views" bias. */
export function responseModel(pool: Video[]): ResponseModel {
  const dated = pool.filter((v) => v.publishedAt);
  const anchor = Math.max(...dated.map((v) => Date.parse(v.publishedAt!)), 0) || Date.now();
  const weekOf = (v: Video) => Math.floor((anchor - Date.parse(v.publishedAt!)) / WEEK);
  const byWeek = new Map<number, number[]>();
  for (const v of dated) {
    const r = rawResponse(v);
    if (r === undefined) continue;
    const w = weekOf(v);
    byWeek.set(w, [...(byWeek.get(w) ?? []), r]);
  }
  const all = pool.map(rawResponse).filter((x): x is number => x !== undefined);
  const poolMedian = median(all) ?? 1;
  const weekMedian = new Map([...byWeek].map(([w, xs]) => [w, xs.length >= 5 ? median(xs)! : poolMedian]));
  return {
    anchor,
    rel: (v) => {
      const r = rawResponse(v);
      if (r === undefined) return undefined;
      const base = v.publishedAt ? (weekMedian.get(weekOf(v)) ?? poolMedian) : poolMedian;
      return base > 0 ? r / base : undefined;
    },
  };
}

// ------------------------------------------------------------------ lifecycle

function pct(x: number) {
  return Math.round(Math.abs(x) * 100);
}

export function lifecycle(neighborhood: Video[], rm: ResponseModel): LifecycleResult {
  const L = LIFECYCLE;
  const start = rm.anchor - L.weeks * WEEK;
  const weekStarts = Array.from({ length: L.weeks }, (_, k) => new Date(start + k * WEEK).toISOString().slice(0, 10));
  const weekly = new Array(L.weeks).fill(0);
  const halves: [number[], number[]] = [[], []];
  let dated = 0;
  for (const v of neighborhood) {
    if (!v.publishedAt) continue;
    const t = Date.parse(v.publishedAt);
    if (t < start || t > rm.anchor) continue;
    const k = Math.min(L.weeks - 1, Math.floor((t - start) / WEEK));
    weekly[k]++;
    dated++;
    const r = rm.rel(v);
    if (r !== undefined) halves[k < L.weeks / 2 ? 0 : 1].push(r);
  }
  const prev = weekly.slice(0, L.weeks / 2).reduce((a, b) => a + b, 0);
  const last = weekly.slice(L.weeks / 2).reduce((a, b) => a + b, 0);
  const base: Omit<LifecycleResult, "stage" | "why"> = {
    weekly,
    weekStarts,
    supplyGrowth: null,
    attentionRatio: null,
    dated,
    neighborhood: neighborhood.length,
  };
  if (dated < L.minDated) {
    return {
      ...base,
      stage: "INSUFFICIENT",
      why: `Only ${dated} dated similar video${dated === 1 ? "" : "s"} in the last ${L.weeks} weeks of the sample, not enough to read a trend.`,
    };
  }
  const supplyGrowth = (last - prev) / Math.max(1, prev);
  const mPrev = median(halves[0]);
  const mLast = median(halves[1]);
  const attentionRatio = mPrev && mLast !== undefined ? mLast / mPrev : null;
  const supply = neighborhood.length;
  const high = supply >= L.highSupply;
  const attn = attentionRatio ?? 1;

  let stage: LifecycleStage;
  if (!high && supply < L.earlySupply && attn >= L.earlyAttention) stage = "EARLY";
  else if (supplyGrowth >= L.risingGrowth && attn >= L.risingAttention) stage = "RISING";
  else if (high && supplyGrowth < L.exhaustedGrowth && attn < L.exhaustedAttention) stage = "EXHAUSTED";
  else if (high && (supplyGrowth < L.decliningGrowth || attn < L.decliningAttention)) stage = "DECLINING";
  else if (high && supplyGrowth >= L.peakingGrowthLow && supplyGrowth < L.risingGrowth && attn >= L.peakingAttention) stage = "PEAKING";
  else stage = "STEADY";

  const supplyVerb = supplyGrowth > 0.05 ? `rose ${pct(supplyGrowth)}%` : supplyGrowth < -0.05 ? `dropped ${pct(supplyGrowth)}%` : "held flat";
  const attnPart =
    attentionRatio === null
      ? "relative response could not be compared"
      : attentionRatio > 1.05
        ? `relative response rose ${pct(attentionRatio - 1)}%`
        : attentionRatio < 0.95
          ? `relative response fell ${pct(1 - attentionRatio)}%`
          : "relative response held steady";
  const why =
    prev < 3
      ? `New similar videos went from ${prev} to ${last} across the two 6-week halves while ${attnPart}.`
      : `New similar videos ${supplyVerb} over the last 6 weeks while ${attnPart}.`;
  return { ...base, stage, supplyGrowth, attentionRatio, why };
}

// ------------------------------------------------------------------ markets

const UAE_RE = new RegExp(
  UAE_TERMS.map((t) => (/^[a-z .]+$/i.test(t) ? `\\b${t.replace(/\./g, "\\.").replace(/ /g, "\\s*")}\\b` : t)).join("|") + "|\\bAED\\b",
  "iu",
);

export function arabicShare(text: string): number {
  const letters = text.match(/\p{L}/gu)?.length ?? 0;
  if (!letters) return 0;
  const arabic = text.match(/[\u0600-\u06FF]/g)?.length ?? 0;
  return arabic / letters;
}

export function isArabic(v: Video): boolean {
  if (v.transcriptLanguage || v.captionLanguage) return v.transcriptLanguage === "ar" || v.captionLanguage === "ar";
  return arabicShare(`${v.transcript ?? ""} ${v.caption ?? ""}`) > ARABIC_SCRIPT_SHARE;
}

export function isUaeContext(v: Video): boolean {
  if (v.locationHints?.some((l) => UAE_RE.test(l))) return true;
  const text = [v.caption, v.transcript, ...(v.hashtags ?? [])].filter(Boolean).join(" ");
  return UAE_RE.test(text);
}

export function inMarket(v: Video, m: MarketKey): boolean {
  return m === "global" ? true : m === "arabic" ? isArabic(v) : isUaeContext(v);
}

// ------------------------------------------------------------------ Creative Position

export function positionFor(market: MarketKey, videos: Video[], matches: Map<string, Match>, rm: ResponseModel): PositionResult {
  const subset = videos.filter((v) => inMarket(v, market) && matches.has(v.id));
  const ms = subset.map((v) => matches.get(v.id)!);
  const relevant = ms.filter((m) => m.overall >= BANDS.relevant).length;
  const crowd = crowding(ms);
  const neighborhood = subset.filter((v) => matches.get(v.id)!.overall >= BANDS.neighborhood);
  const sat = saturation(ms);
  const lowData = market !== "global" && (subset.length < LOW_DATA.minVideos || relevant < LOW_DATA.minRelevant);
  return {
    market,
    n: subset.length,
    relevant,
    crowding: crowd,
    lifecycle: lifecycle(neighborhood, rm),
    confidence: confidence(relevant),
    saturation: sat,
    insight: insightSentence(sat, crowd, relevant),
    lowData,
  };
}

const LATE: LifecycleStage[] = ["PEAKING", "DECLINING", "EXHAUSTED"];
const EARLY: LifecycleStage[] = ["EARLY", "RISING"];

export function timingOf(p: PositionResult): MarketTiming {
  if (p.lowData) return "low-data";
  const c = p.crowding.score;
  if (c >= MARKET_TIMING.lateCrowding || (LATE.includes(p.lifecycle.stage) && c >= 40)) return "late";
  if (c < MARKET_TIMING.earlyCrowding || EARLY.includes(p.lifecycle.stage)) return "early";
  return "mid";
}

export function creativePosition(videos: Video[], matches: Map<string, Match>, rm: ResponseModel): CreativePosition {
  const global = positionFor("global", videos, matches, rm);
  const arabic = positionFor("arabic", videos, matches, rm);
  const uae = positionFor("uae", videos, matches, rm);
  const timing: Record<MarketKey, MarketTiming> = { global: timingOf(global), arabic: timingOf(arabic), uae: timingOf(uae) };

  const rel = (p: PositionResult): string => {
    if (p.lowData) return "low data";
    const gap = global.crowding.score - p.crowding.score;
    if (gap >= MARKET_TIMING.earlierGap) return "earlier";
    if (gap <= -MARKET_TIMING.earlierGap) return "more crowded";
    return "similar";
  };
  const g = timing.global === "low-data" ? "Low data globally" : `Globally ${timing.global === "mid" ? "mid-cycle" : timing.global}`;
  const ra = rel(arabic);
  const ru = rel(uae);
  const local = ra === ru ? `Arabic / UAE-context: ${ra}` : `Arabic: ${ra} · UAE-context: ${ru}`;
  return { global, arabic, uae, timing, marketLine: `${g} · ${local}` };
}

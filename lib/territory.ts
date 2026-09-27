import type { VideoDNA } from "./analysis";
import { BANDS, TERRITORY } from "./config";
import { FORMAT_NAMES, FORMAT_PLURAL } from "./labels";
import type { CreativePosition, LifecycleStage, MarketKey, Territory } from "./result-types";
import { inMarket, lifecycle, median, type ResponseModel } from "./scoring";
import type { CreativeDNA, FormatLabel, Match, Video } from "./types";

const STAGE_BONUS: Record<LifecycleStage, number> = {
  EARLY: 1.35,
  RISING: 1.3,
  STEADY: 1,
  INSUFFICIENT: 1,
  PEAKING: 0.85,
  DECLINING: 0.65,
  EXHAUSTED: 0.5,
};

export type ClusterStat = { supply: number; response: number | null };

/** supply + median relative response per format, over the given videos */
export function clusterStats(videos: Video[], dnas: Map<string, VideoDNA>, rm: ResponseModel): Map<FormatLabel, ClusterStat> {
  const groups = new Map<FormatLabel, Video[]>();
  for (const v of videos) {
    const f = dnas.get(v.id)?.format ?? "other";
    groups.set(f, [...(groups.get(f) ?? []), v]);
  }
  return new Map(
    [...groups].map(([f, vs]) => {
      const rs = vs.map(rm.rel).filter((x): x is number => x !== undefined);
      const m = median(rs);
      return [f, { supply: vs.length, response: m === undefined ? null : Math.round(m * 100) / 100 }];
    }),
  );
}

function mode<T>(xs: T[]): T | undefined {
  const c = new Map<T, number>();
  for (const x of xs) c.set(x, (c.get(x) ?? 0) + 1);
  let best: T | undefined;
  let n = -1;
  for (const [k, v] of c) if (v > n) [best, n] = [k, v];
  return best;
}

export function keepsLine(dna: CreativeDNA): string {
  const parts = [dna.topic[0], dna.locationContext[0], dna.productInteraction].filter((s) => s && s.trim());
  return parts.join(" · ");
}

export type TerritoryContext = {
  crowdFormat: FormatLabel;
  instruction: string;
  examples: string[];
};

export function openTerritory(args: {
  dna: CreativeDNA;
  videos: Video[];
  dnas: Map<string, VideoDNA>;
  matches: Map<string, Match>;
  rm: ResponseModel;
  position: CreativePosition;
}): { territories: Territory[]; context: Record<string, TerritoryContext> } {
  const { dna, videos, dnas, matches, rm, position } = args;
  const fmt = (v: Video) => dnas.get(v.id)?.format ?? "other";
  const neighborhood = videos.filter((v) => (matches.get(v.id)?.overall ?? 0) >= BANDS.neighborhood);
  const crowdFormat =
    mode(neighborhood.map(fmt).filter((f) => f !== "other")) ??
    mode(
      [...videos]
        .sort((a, b) => (matches.get(b.id)?.overall ?? 0) - (matches.get(a.id)?.overall ?? 0))
        .slice(0, 20)
        .map(fmt),
    ) ??
    dna.format;

  const topical = videos.filter((v) => (matches.get(v.id)?.dims.topic ?? 0) >= TERRITORY.topicMin);
  const byFormat = new Map<FormatLabel, Video[]>();
  for (const v of topical) byFormat.set(fmt(v), [...(byFormat.get(fmt(v)) ?? []), v]);
  const crowdSupply = byFormat.get(crowdFormat)?.length ?? 0;
  const crowdResp = median((byFormat.get(crowdFormat) ?? []).map(rm.rel).filter((x): x is number => x !== undefined)) ?? 1;

  const out: (Territory & { score: number })[] = [];
  const context: Record<string, TerritoryContext> = {};

  // REFORMAT: low supply + strong relative response inside this topic, not the crowd's format
  for (const [f, vs] of byFormat) {
    if (f === crowdFormat || f === dna.format || f === "other") continue;
    if (vs.length < TERRITORY.minEvidence) continue;
    const rs = vs.map(rm.rel).filter((x): x is number => x !== undefined);
    const resp = median(rs);
    if (resp === undefined || resp < TERRITORY.strongResponse) continue;
    if (crowdSupply && vs.length > crowdSupply * TERRITORY.lowerSupplyShare) continue;
    const life = lifecycle(vs, rm);
    const score = STAGE_BONUS[life.stage] * resp * (1 - vs.length / Math.max(crowdSupply, vs.length + 1));
    const evidence = [...vs]
      .filter((v) => v.thumbnailUrl)
      .sort((a, b) => (rm.rel(b) ?? 0) - (rm.rel(a) ?? 0))
      .slice(0, 3)
      .map((v) => v.id);
    const stronger = resp > crowdResp;
    const id = `reformat-${f}`;
    out.push({
      id,
      kind: "REFORMAT",
      hero: false,
      name: FORMAT_NAMES[f],
      statsLine: [
        `${vs.length} videos`,
        life.stage === "INSUFFICIENT" ? "too new to trend" : life.stage,
        "lower supply",
        stronger ? "stronger relative response" : `${resp.toFixed(1)}× median response`,
      ].join(" · "),
      why: `Most similar videos use ${FORMAT_PLURAL[crowdFormat]}. Response is ${stronger ? "stronger" : "solid"} in ${FORMAT_PLURAL[f]}, with ${
        crowdSupply >= vs.length * 2 ? "far " : ""
      }fewer videos.`,
      keeps: keepsLine(dna),
      format: f,
      supply: vs.length,
      response: Math.round(resp * 100) / 100,
      lifecycle: life.stage,
      evidence,
      score,
    });
    context[id] = {
      crowdFormat,
      instruction: `Adopt the ${FORMAT_NAMES[f]} format (${FORMAT_PLURAL[f]} are less common and draw stronger relative response in this topic). Build the opening, story beats and visuals around it.`,
      examples: evidence.map((id2) => dnas.get(id2)?.hook ?? "").filter(Boolean),
    };
  }

  // LOCALIZE: the idea is at least 25 points less crowded inside a market subset
  for (const m of ["arabic", "uae"] as MarketKey[]) {
    const p = position[m];
    const gap = position.global.crowding.score - p.crowding.score;
    if (p.lowData || gap < TERRITORY.localizeGap) continue;
    const subset = videos.filter((v) => inMarket(v, m) && matches.has(v.id));
    const resp = median(subset.map(rm.rel).filter((x): x is number => x !== undefined)) ?? null;
    const evidence = [...subset]
      .filter((v) => v.thumbnailUrl)
      .sort((a, b) => (matches.get(b.id)?.overall ?? 0) - (matches.get(a.id)?.overall ?? 0))
      .slice(0, 3)
      .map((v) => v.id);
    const label = m === "arabic" ? "Arabic-language content" : "UAE-context content";
    const gClose = position.global.crowding.exact + position.global.crowding.close;
    const lClose = p.crowding.exact + p.crowding.close;
    const id = `localize-${m}`;
    out.push({
      id,
      kind: "LOCALIZE",
      hero: false,
      name: m === "arabic" ? "Arabic-first" : "UAE-context first",
      statsLine: `${p.n} videos · ${p.lifecycle.stage === "INSUFFICIENT" ? "too few dated" : p.lifecycle.stage} · crowding ${p.crowding.score} vs ${position.global.crowding.score} global`,
      why: `Globally this idea reads ${position.global.crowding.label.toLowerCase()} with ${gClose} close matches. In ${label} it reads ${p.crowding.label.toLowerCase()}, with ${lClose}.`,
      keeps: `the full concept · ${keepsLine(dna)}`,
      market: m,
      supply: p.n,
      response: resp === null ? null : Math.round(resp * 100) / 100,
      lifecycle: p.lifecycle.stage,
      evidence,
      score: (gap / 25) * 1.1 * STAGE_BONUS[p.lifecycle.stage],
    });
    context[id] = {
      crowdFormat,
      instruction:
        m === "arabic"
          ? "Make it Arabic-first: Gulf Arabic dialogue and on-screen text, Gulf cultural codes, keep the format and product."
          : "Make it explicitly UAE-context: name real Dubai / Abu Dhabi places and Emirati codes, Arabic and English mixed, keep the product.",
      examples: evidence.map((id2) => dnas.get(id2)?.hook ?? "").filter(Boolean),
    };
  }

  out.sort((a, b) => b.score - a.score);
  const picked = out.slice(0, 3).map(({ score: _s, ...t }, k) => ({ ...t, hero: k === 0 }));
  return { territories: picked, context };
}

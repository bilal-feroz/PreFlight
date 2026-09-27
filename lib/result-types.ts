/**
 * Client-safe result contract between the pipeline (server) and the UI.
 * Every number in here is computed in code over real Oriane results.
 */
import type { CreativeDNA, Dimension, FormatLabel } from "./types";
import type { FeatureFlags } from "./features";

export type Vec3 = [number, number, number];

export type MarketKey = "global" | "arabic" | "uae";

export type LifecycleStage =
  | "EARLY"
  | "RISING"
  | "PEAKING"
  | "DECLINING"
  | "EXHAUSTED"
  | "STEADY"
  | "INSUFFICIENT";

export type LifecycleResult = {
  stage: LifecycleStage;
  /** 12 weekly counts of similar videos, oldest → newest. */
  weekly: number[];
  /** ISO date (yyyy-mm-dd) each week starts on. */
  weekStarts: string[];
  /** (last 6 weeks − previous 6) ÷ max(1, previous 6). null when not computable. */
  supplyGrowth: number | null;
  /** median relative response last 6 weeks ÷ previous 6. null when not computable. */
  attentionRatio: number | null;
  dated: number;
  neighborhood: number;
  /** One sentence built from the numbers above. */
  why: string;
};

export type CrowdingResult = {
  score: number; // 0..100
  label: "Crowded" | "Busy" | "Some room" | "Open";
  exact: number; // overall >= 0.85
  close: number; // 0.70..0.85
  medium: number; // 0.55..0.70
};

export type ConfidenceLevel = "High" | "Medium" | "Low";

export type PositionResult = {
  market: MarketKey;
  /** videos of this market in the analyzed sample */
  n: number;
  /** videos with overall >= 0.4 */
  relevant: number;
  crowding: CrowdingResult;
  lifecycle: LifecycleResult;
  confidence: { level: ConfidenceLevel; n: number };
  /** share (0..1) of relevant videos with that dimension >= 0.7 */
  saturation: Record<Dimension, number>;
  /** "Your topic isn't the problem. Your opening is." */
  insight: string;
  /** true when this subset is too small to read (shown as "Low data") */
  lowData: boolean;
};

export type MarketTiming = "early" | "mid" | "late" | "low-data";

export type CreativePosition = {
  global: PositionResult;
  arabic: PositionResult;
  uae: PositionResult;
  /** e.g. "Globally late · Arabic / UAE-context: earlier" */
  marketLine: string;
  timing: Record<MarketKey, MarketTiming>;
};

/** Everything the UI needs to show one real video (tooltip, card, drawer). */
export type VideoCard = {
  id: string;
  url: string;
  platform: string;
  creator: string;
  creatorName?: string;
  followers?: number;
  views?: number;
  likes?: number;
  comments?: number;
  shares?: number;
  publishedAt?: string;
  /** thumbnail proxy path: /api/thumb/<id> */
  thumb: string;
  hasThumb: boolean;
  language?: string;
  durationSec?: number;
  format: FormatLabel;
  hook?: string;
  motifs?: string[];
  /** short transcript (or caption) excerpt that best evidences the match */
  snippet?: string;
  /** seconds into the video where the snippet is spoken */
  snippetT?: number;
  /** seconds into the video of the best visual match frame (AI Vision probes only) */
  frameT?: number;
  markets: { arabic: boolean; uae: boolean };
};

export type Collision = {
  id: string;
  overall: number;
  dims: Record<Dimension, number>;
  shared: string[];
  different: string[];
};

export type GalaxyNode = {
  id: string;
  p: Vec3;
  cluster: FormatLabel;
  /** similarity to the current concept (0..1) */
  sim: number;
  /** similarity to the rerouted concept, after a reroute */
  simAfter?: number;
  /** added to the pool by the reroute probes */
  isNew?: boolean;
};

export type GalaxyCluster = {
  label: FormatLabel;
  center: Vec3;
  supply: number;
  /** median relative response vs the whole pool (1 = pool median). null if unknown */
  response: number | null;
};

export type Airspace = {
  nodes: GalaxyNode[];
  clusters: GalaxyCluster[];
  star: Vec3;
  /** set after a reroute: where the star flies to */
  starAfter?: Vec3;
  /** nodes near the star render crowded red when true */
  crowded: boolean;
  /** radius around the star considered "the crowd" */
  crowdRadius: number;
};

export type Territory = {
  id: string;
  kind: "REFORMAT" | "LOCALIZE";
  hero: boolean;
  /** e.g. "Blind test" or "Arabic-first" */
  name: string;
  /** "34 videos · RISING · lower supply · stronger relative response" */
  statsLine: string;
  /** "Most similar videos use street interviews. Response is stronger in blind tests, with far fewer videos." */
  why: string;
  /** what the rerouted idea keeps from the original brief */
  keeps: string;
  format?: FormatLabel;
  market?: MarketKey;
  supply: number;
  response: number | null;
  lifecycle: LifecycleStage;
  /** 3 real video ids */
  evidence: string[];
};

export type SampleInfo = {
  n: number;
  probes: number;
  platforms: Record<string, number>;
  dateRange: [string, string] | null;
  orianeCalls: number;
};

export type PreflightResult = {
  runId: string;
  brief: string;
  dna: CreativeDNA;
  sample: SampleInfo;
  features: FeatureFlags;
  position: CreativePosition;
  /** top 3 collisions (ids resolve in `videos`) */
  collisions: Collision[];
  /** every video in the pool, keyed by id */
  videos: Record<string, VideoCard>;
  airspace: Airspace;
  territories: Territory[];
};

export type RerouteResult = {
  runId: string;
  territoryId: string;
  brief: string;
  dna: CreativeDNA;
  /** up to 3 short lines: what changed and why */
  changes: string[];
  /** both scored against the same merged pool */
  before: CreativePosition;
  after: CreativePosition;
  collisionsAfter: Collision[];
  /** merged-pool airspace; star = original, starAfter = rerouted */
  airspace: Airspace;
  /** videos added by the reroute probes (ids resolve in `videos`) */
  videos: Record<string, VideoCard>;
  sample: SampleInfo;
};

export type StageKey = "dna" | "search" | "read" | "compare" | "map";

export type ProgressEvent =
  | { type: "stage"; stage: StageKey; label: string; detail?: string }
  | { type: "dna"; dna: CreativeDNA }
  | { type: "progress"; stage: StageKey; done: number; total: number; detail?: string }
  | { type: "result"; result: PreflightResult }
  | { type: "reroute"; result: RerouteResult }
  | { type: "error"; message: string };

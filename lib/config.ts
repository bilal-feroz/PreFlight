import type { Dimension } from "./types";

/** All scoring constants live here. Formulas live in lib/scoring.ts. */

export const WEIGHTS: Record<Dimension, number> = {
  hook: 0.25,
  narrative: 0.2,
  visual: 0.2,
  format: 0.15,
  topic: 0.1,
  product: 0.1,
};

export const BANDS = {
  exact: 0.85,
  close: 0.7,
  medium: 0.55,
  relevant: 0.4,
  /** lifecycle is computed on the concept's neighborhood */
  neighborhood: 0.55,
};

export const CROWDING = {
  exactCap: 8,
  closeCap: 20,
  mediumCap: 40,
  wExact: 0.5,
  wClose: 0.3,
  wMedium: 0.2,
  /** label thresholds (score >= value) */
  labels: [
    [70, "Crowded"],
    [45, "Busy"],
    [20, "Some room"],
    [0, "Open"],
  ] as const,
};

/** a dimension counts as saturated in a video when its score is >= this */
export const SATURATION_DIM = 0.7;

export const CONFIDENCE = { high: 80, medium: 30 };

/** market subsets below these sizes are shown as "Low data" */
export const LOW_DATA = { minVideos: 15, minRelevant: 8 };

export const LIFECYCLE = {
  weeks: 12,
  minDated: 12,
  earlySupply: 15,
  highSupply: 15,
  risingGrowth: 0.25,
  risingAttention: 0.9,
  earlyAttention: 1.0,
  peakingGrowthLow: -0.15,
  peakingAttention: 0.9,
  decliningGrowth: -0.15,
  decliningAttention: 0.8,
  exhaustedGrowth: -0.3,
  exhaustedAttention: 0.7,
};

export const MARKET_TIMING = {
  lateCrowding: 60,
  earlyCrowding: 35,
  /** a market reads "earlier" when its crowding is at least this many points below global */
  earlierGap: 15,
};

export const TERRITORY = {
  /** response >= 1.2x the pool median */
  strongResponse: 1.2,
  /** cluster supply must be at most this share of the concept's own format supply */
  lowerSupplyShare: 0.6,
  minEvidence: 3,
  /** topic dimension >= this = "in this topic" */
  topicMin: 0.5,
  /** LOCALIZE when a market's crowding is at least this many points below global */
  localizeGap: 25,
};

export const POOL = {
  maxVideos: Number(process.env.PREFLIGHT_POOL_MAX ?? 160),
  globalProbeLimit: 28,
  baselineLimit: 45,
  marketProbeLimit: 20,
  rerouteProbeLimit: 26,
  mergedMax: 320,
  galaxyMax: 300,
};

export const LLM_BATCH = { size: 15, concurrency: 3 };

export const UAE_TERMS = [
  "dubai",
  "abu dhabi",
  "abudhabi",
  "sharjah",
  "ajman",
  "fujairah",
  "ras al khaimah",
  "al ain",
  "uae",
  "u.a.e",
  "emirates",
  "emirati",
  "united arab emirates",
  "burj khalifa",
  "sheikh zayed",
  "dirham",
  "دبي",
  "أبوظبي",
  "ابوظبي",
  "أبو ظبي",
  "ابو ظبي",
  "الإمارات",
  "الامارات",
  "الشارقة",
  "برج خليفة",
  "الشيخ زايد",
  "درهم",
];

/** Arabic script share of transcript + caption above which a video counts as Arabic when no language field exists */
export const ARABIC_SCRIPT_SHARE = 0.3;

import type { Dimension, FormatLabel } from "./types";
import type { LifecycleStage, MarketKey } from "./result-types";

export const FORMAT_NAMES: Record<FormatLabel, string> = {
  street_interview: "Street interview",
  grwm: "Get ready with me",
  reaction: "Reaction",
  cinematic_story: "Cinematic story",
  tutorial: "Tutorial",
  unboxing: "Unboxing",
  review: "Review",
  blind_test: "Blind test",
  pov_skit: "POV skit",
  vlog: "Vlog",
  other: "Other",
};

/** plural noun form used inside sentences: "Most similar videos use street interviews." */
export const FORMAT_PLURAL: Record<FormatLabel, string> = {
  street_interview: "street interviews",
  grwm: "get-ready-with-me videos",
  reaction: "reactions",
  cinematic_story: "cinematic stories",
  tutorial: "tutorials",
  unboxing: "unboxings",
  review: "reviews",
  blind_test: "blind tests",
  pov_skit: "POV skits",
  vlog: "vlogs",
  other: "other formats",
};

export const DIMENSION_NAMES: Record<Dimension, string> = {
  hook: "Hook",
  narrative: "Narrative",
  visual: "Visual",
  format: "Format",
  topic: "Topic",
  product: "Product",
};

/** noun used in the insight sentence: "Your topic isn't the problem. Your opening is." */
export const DIMENSION_NOUNS: Record<Dimension, string> = {
  hook: "opening",
  narrative: "story arc",
  visual: "look",
  format: "format",
  topic: "topic",
  product: "product moment",
};

export const MARKET_NAMES: Record<MarketKey, string> = {
  global: "Global",
  arabic: "Arabic",
  uae: "UAE-context",
};

export const LIFECYCLE_ARROWS: Record<LifecycleStage, string> = {
  EARLY: "↗",
  RISING: "↑",
  PEAKING: "→",
  DECLINING: "↓",
  EXHAUSTED: "↓↓",
  STEADY: "→",
  INSUFFICIENT: "·",
};

export const LIFECYCLE_NAMES: Record<LifecycleStage, string> = {
  EARLY: "EARLY",
  RISING: "RISING",
  PEAKING: "PEAKING",
  DECLINING: "DECLINING",
  EXHAUSTED: "EXHAUSTED",
  STEADY: "STEADY",
  INSUFFICIENT: "INSUFFICIENT DATA",
};

export function compactNumber(n: number | undefined | null): string {
  if (n === undefined || n === null || !Number.isFinite(n)) return "n/a";
  if (n >= 1e9) return `${(n / 1e9).toFixed(n >= 1e10 ? 0 : 1)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(n >= 1e4 ? 0 : 1)}K`;
  return String(Math.round(n));
}

export function shortDate(iso: string | undefined): string {
  if (!iso) return "n/a";
  const d = new Date(iso);
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

export function timestamp(sec: number | undefined): string | undefined {
  if (sec === undefined || !Number.isFinite(sec)) return undefined;
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function pctSigned(x: number | null | undefined): string {
  if (x === null || x === undefined || !Number.isFinite(x)) return "n/a";
  const v = Math.round(x * 100);
  return `${v > 0 ? "+" : ""}${v}%`;
}

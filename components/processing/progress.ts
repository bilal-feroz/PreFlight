import type { ProgressEvent, StageKey } from "@/lib/result-types";

export const STAGE_ORDER: StageKey[] = ["dna", "search", "read", "compare", "map"];

/** Shown until the server sends its own label (which carries the real counts). */
export const STAGE_DEFAULTS: Record<StageKey, string> = {
  dna: "Reading your idea",
  search: "Searching Oriane",
  read: "Reading videos",
  compare: "Comparing",
  map: "Mapping",
};

export type StageState = "pending" | "active" | "done";

export type StageView = {
  key: StageKey;
  label: string;
  detail?: string;
  done?: number;
  total?: number;
  state: StageState;
};

export function deriveStages(events: ProgressEvent[]): { stages: StageView[]; error: string | null; finished: boolean } {
  const info = new Map<StageKey, { label?: string; detail?: string; done?: number; total?: number }>();
  let current = -1;
  let finished = false;
  let error: string | null = null;

  for (const e of events) {
    if (e.type === "stage") {
      const prev = info.get(e.stage) ?? {};
      info.set(e.stage, { ...prev, label: e.label, detail: e.detail ?? prev.detail });
      current = Math.max(current, STAGE_ORDER.indexOf(e.stage));
    } else if (e.type === "progress") {
      const prev = info.get(e.stage) ?? {};
      info.set(e.stage, { ...prev, done: e.done, total: e.total, detail: e.detail ?? prev.detail });
      current = Math.max(current, STAGE_ORDER.indexOf(e.stage));
    } else if (e.type === "result" || e.type === "reroute") {
      finished = true;
    } else if (e.type === "error") {
      error = e.message;
    }
  }

  const stages = STAGE_ORDER.map((key, i): StageView => {
    const s = info.get(key) ?? {};
    const state: StageState = finished || i < current ? "done" : i === current ? "active" : "pending";
    return { key, label: s.label ?? STAGE_DEFAULTS[key], detail: s.detail, done: s.done, total: s.total, state };
  });

  return { stages, error, finished };
}

/** The most recent stage label and its live counts. */
export function latestProgress(events: ProgressEvent[]): {
  stage: StageKey | null;
  label: string | null;
  detail?: string;
  done?: number;
  total?: number;
} {
  let stage: StageKey | null = null;
  let label: string | null = null;
  let detail: string | undefined;
  let done: number | undefined;
  let total: number | undefined;

  for (const e of events) {
    if (e.type === "stage") {
      stage = e.stage;
      label = e.label;
      detail = e.detail;
      done = undefined;
      total = undefined;
    } else if (e.type === "progress") {
      if (e.stage !== stage) {
        stage = e.stage;
        label = STAGE_DEFAULTS[e.stage];
        detail = undefined;
      }
      done = e.done;
      total = e.total;
      if (e.detail) detail = e.detail;
    }
  }
  return { stage, label, detail, done, total };
}

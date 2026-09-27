"use client";

import { useMemo } from "react";
import { motion, useReducedMotion } from "framer-motion";
import type { CreativeDNA } from "@/lib/types";
import type { ProgressEvent } from "@/lib/result-types";
import { FORMAT_NAMES } from "@/lib/labels";
import { Header } from "@/components/ui/Header";
import { Bar } from "@/components/ui/Bar";
import { cx } from "@/components/ui/cx";
import { EASE, rise, stagger } from "@/components/ui/motion";
import { useElementSize } from "@/components/ui/useElementSize";
import { GoldDust } from "@/components/landing/GoldDust";
import { deriveStages, type StageState, type StageView } from "./progress";

export type ProcessingProps = {
  brief: string;
  dna: CreativeDNA | null;
  events: ProgressEvent[];
  /** optional: shows the "How it works" button in the header */
  onHowItWorks?(): void;
};

type Thread = { key: string; label: string; get(d: CreativeDNA): string };

const THREADS: Thread[] = [
  { key: "hook", label: "Hook", get: (d) => d.hook },
  { key: "format", label: "Format", get: (d) => FORMAT_NAMES[d.format] ?? d.format },
  { key: "narrative", label: "Narrative", get: (d) => d.narrativeArc.join(" → ") },
  { key: "visual", label: "Visual", get: (d) => d.visualMotifs.slice(0, 2).join(", ") },
  { key: "topic", label: "Topic", get: (d) => d.topic.join(", ") },
  { key: "product", label: "Product", get: (d) => d.productInteraction },
];

const PLACEHOLDER_WIDTHS = ["62%", "38%", "54%", "46%", "34%", "58%"];

export function Processing({ brief, dna, events, onHowItWorks }: ProcessingProps) {
  const { stages, error } = useMemo(() => {
    const derived = deriveStages(events);
    if (!dna) return derived;
    // Creative DNA has arrived: the first stage is complete even before the next stage event.
    const fixed = derived.stages.map((s) => (s.key === "dna" && s.state === "active" ? { ...s, state: "done" as const } : s));
    return { ...derived, stages: fixed };
  }, [events, dna]);

  return (
    <div className="relative isolate flex min-h-dvh flex-col overflow-hidden bg-void">
      <GoldDust count={70} className="absolute inset-0 -z-10 opacity-70" />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-20 bg-[radial-gradient(60%_45%_at_20%_40%,rgb(255_181_71/0.07),transparent_70%)]"
      />
      <Header onHowItWorks={onHowItWorks} />

      <div className="mx-auto w-full max-w-3xl flex-1 px-5 pb-20 pt-4 sm:px-8 sm:pt-8">
        <motion.div variants={stagger(0.1)} initial="hidden" animate="show">
          <motion.p variants={rise} className="label-caps text-gold [text-shadow:0_0_16px_rgb(255_181_71/0.35)]">
            Creative Constellation
          </motion.p>
          <motion.blockquote
            variants={rise}
            className="mt-3 line-clamp-3 text-pretty font-serif text-[1.55rem] leading-snug text-cluster/85 sm:text-[2rem]"
          >
            &ldquo;{brief}&rdquo;
          </motion.blockquote>

          <motion.div variants={rise} className="mt-8 sm:mt-10">
            <DnaFan dna={dna} />
          </motion.div>

          <motion.div variants={rise} className="mt-10 border-t border-gold/10 pt-6">
            <StageList stages={stages} />
            {error && (
              <p role="alert" className="mt-4 text-[13px] text-crowded-soft">
                {error}
              </p>
            )}
          </motion.div>
        </motion.div>
      </div>
    </div>
  );
}

/** One gold line that splits into six threads, one per Creative DNA dimension. */
function DnaFan({ dna }: { dna: CreativeDNA | null }) {
  const [ref, size] = useElementSize<HTMLDivElement>();
  const reduce = useReducedMotion();
  const { w, h } = size;
  const ready = w > 0 && h > 0;
  const midY = h / 2;
  const splitX = w * 0.4;
  const rowY = (i: number) => (h * (i + 0.5)) / THREADS.length;
  const threadPath = (i: number) => {
    const y = rowY(i);
    const c1 = splitX + (w - splitX) * 0.55;
    const c2 = splitX + (w - splitX) * 0.3;
    return `M${splitX.toFixed(1)} ${midY.toFixed(1)} C${c1.toFixed(1)} ${midY.toFixed(1)} ${c2.toFixed(1)} ${y.toFixed(1)} ${w.toFixed(1)} ${y.toFixed(1)}`;
  };

  return (
    <div className="grid grid-cols-[52px_minmax(0,1fr)] sm:grid-cols-[150px_minmax(0,1fr)] md:grid-cols-[190px_minmax(0,1fr)]">
      <div ref={ref} className="relative" aria-hidden>
        {ready && (
          <svg
            className="absolute inset-0 overflow-visible"
            width={w}
            height={h}
            viewBox={`0 0 ${w} ${h}`}
            style={{ filter: "drop-shadow(0 0 3px rgb(255 181 71 / 0.55))" }}
          >
            <motion.path
              d={`M0 ${midY.toFixed(1)} L${splitX.toFixed(1)} ${midY.toFixed(1)}`}
              fill="none"
              className="stroke-gold"
              strokeWidth={1.4}
              strokeLinecap="round"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 0.8, ease: EASE }}
            />
            {THREADS.map((t, i) => (
              <g key={t.key}>
                <motion.path
                  d={threadPath(i)}
                  fill="none"
                  className="stroke-gold"
                  strokeWidth={1.1}
                  strokeLinecap="round"
                  initial={{ pathLength: 0, opacity: 0.3 }}
                  animate={{ pathLength: 1, opacity: dna ? 0.9 : 0.3 }}
                  transition={{
                    pathLength: { duration: 1.1, delay: 0.55 + i * 0.07, ease: EASE },
                    opacity: { duration: 0.6, delay: dna ? i * 0.08 : 0 },
                  }}
                />
                {!dna && !reduce && (
                  <motion.path
                    d={threadPath(i)}
                    fill="none"
                    className="stroke-gold-light"
                    strokeWidth={1.5}
                    strokeLinecap="round"
                    initial={{ pathLength: 0.16, pathOffset: -0.16, opacity: 0 }}
                    animate={{ pathOffset: [-0.16, 1], opacity: [0, 1, 1, 0] }}
                    transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut", delay: 1.3 + i * 0.2 }}
                  />
                )}
              </g>
            ))}
          </svg>
        )}
      </div>

      <ul className="grid grid-rows-6">
        {THREADS.map((t, i) => {
          const value = dna ? t.get(dna).trim() : "";
          return (
            <li
              key={t.key}
              className="relative flex min-h-16 flex-col justify-center gap-1 pl-4 sm:min-h-[4.25rem] sm:flex-row sm:items-center sm:justify-start sm:gap-4 sm:pl-5"
            >
              <span
                aria-hidden
                className={cx(
                  "absolute left-0 top-1/2 size-[7px] -translate-x-1/2 -translate-y-1/2 rounded-full transition-all duration-700",
                  dna ? "bg-gold shadow-[0_0_12px_2px_rgb(255_181_71/0.65)]" : "bg-gold/30",
                )}
              />
              <span className="label-caps shrink-0 text-gold/75 sm:w-20">{t.label}</span>
              <span className="min-w-0 flex-1">
                {dna ? (
                  <motion.span
                    initial={{ opacity: 0, x: -6 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.55, delay: 0.15 + i * 0.09, ease: EASE }}
                    className={cx(
                      "line-clamp-2 block text-[13.5px] leading-snug sm:text-[15px]",
                      value ? "text-cluster/90" : "text-cluster/35",
                    )}
                  >
                    {value || "Not specified"}
                  </motion.span>
                ) : (
                  <span className="shimmer block h-2 rounded-full" style={{ width: PLACEHOLDER_WIDTHS[i] }} />
                )}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function StageList({ stages }: { stages: StageView[] }) {
  return (
    <ol className="space-y-1" aria-live="polite">
      {stages.map((s) => (
        <li key={s.key} className="flex gap-3 py-1.5">
          <StageMark state={s.state} />
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-4">
              <span
                className={cx(
                  "text-[14px] transition-colors duration-500",
                  s.state === "active" ? "text-cluster" : s.state === "done" ? "text-cluster/60" : "text-cluster/30",
                )}
              >
                {s.label}
              </span>
              {s.total !== undefined && s.state !== "pending" && (
                <span className="shrink-0 font-mono text-[12px] tabular-nums text-gold/85">
                  {s.done ?? 0}/{s.total}
                </span>
              )}
            </div>
            {s.detail && s.state !== "pending" && (
              <p className={cx("mt-0.5 truncate text-[12px]", s.state === "active" ? "text-cluster/45" : "text-cluster/30")}>
                {s.detail}
              </p>
            )}
            {s.state === "active" && s.total ? <Bar value={(s.done ?? 0) / s.total} className="mt-2" /> : null}
          </div>
        </li>
      ))}
    </ol>
  );
}

function StageMark({ state }: { state: StageState }) {
  if (state === "done") {
    return (
      <svg viewBox="0 0 16 16" className="mt-[3px] size-4 shrink-0 stroke-gold" fill="none" strokeWidth={1.5} aria-hidden>
        <path d="M3.5 8.5l3 3 6-7" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  if (state === "active") {
    return (
      <span aria-hidden className="relative mt-[3px] grid size-4 shrink-0 place-items-center">
        <span className="absolute size-3 rounded-full bg-gold/30 animate-[pf-breathe_1.8s_ease-in-out_infinite]" />
        <span className="size-1.5 rounded-full bg-gold shadow-[0_0_10px_2px_rgb(255_181_71/0.6)]" />
      </span>
    );
  }
  return (
    <span aria-hidden className="mt-[3px] grid size-4 shrink-0 place-items-center">
      <span className="size-1.5 rounded-full border border-cluster/25" />
    </span>
  );
}

export default Processing;

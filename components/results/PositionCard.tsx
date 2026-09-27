"use client";

import { useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { Dimension } from "@/lib/types";
import type {
  ConfidenceLevel,
  CreativePosition,
  CrowdingResult,
  LifecycleStage,
  MarketKey,
  PositionResult,
} from "@/lib/result-types";
import { DIMENSION_NAMES, DIMENSION_NOUNS, LIFECYCLE_ARROWS, LIFECYCLE_NAMES, MARKET_NAMES } from "@/lib/labels";
import { Badge } from "@/components/ui/Badge";
import { Bar, type BarTone } from "@/components/ui/Bar";
import { CountUp } from "@/components/ui/CountUp";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { Sparkline, type SparkTone } from "@/components/ui/Sparkline";
import { cx } from "@/components/ui/cx";
import { DIM_ORDER, pct } from "@/components/ui/format";
import { EASE, rise } from "@/components/ui/motion";

type CrowdLabel = CrowdingResult["label"];

const CROWD_TEXT: Record<CrowdLabel, string> = {
  Crowded: "text-crowded-soft",
  Busy: "text-gold-deep",
  "Some room": "text-gold",
  Open: "text-gold",
};

const CROWD_GLOW: Record<CrowdLabel, string> = {
  Crowded: "[text-shadow:0_0_28px_rgb(181_71_58/0.6)]",
  Busy: "[text-shadow:0_0_28px_rgb(200_132_31/0.45)]",
  "Some room": "[text-shadow:0_0_28px_rgb(255_181_71/0.45)]",
  Open: "[text-shadow:0_0_28px_rgb(255_181_71/0.45)]",
};

const CROWD_BAR: Record<CrowdLabel, BarTone> = {
  Crowded: "red",
  Busy: "amber",
  "Some room": "gold",
  Open: "gold",
};

const STAGE_TEXT: Record<LifecycleStage, string> = {
  EARLY: "text-gold",
  RISING: "text-gold",
  STEADY: "text-gold-light/80",
  PEAKING: "text-gold-deep",
  DECLINING: "text-crowded-soft",
  EXHAUSTED: "text-crowded-soft",
  INSUFFICIENT: "text-cluster/50",
};

const STAGE_SPARK: Record<LifecycleStage, SparkTone> = {
  EARLY: "gold",
  RISING: "gold",
  STEADY: "gold",
  PEAKING: "gold",
  DECLINING: "red",
  EXHAUSTED: "red",
  INSUFFICIENT: "pale",
};

const CONFIDENCE_TEXT: Record<ConfidenceLevel, string> = {
  High: "text-gold",
  Medium: "text-cluster/85",
  Low: "text-crowded-soft",
};

/** lower = better timing; INSUFFICIENT is not ranked */
const STAGE_RANK: Partial<Record<LifecycleStage, number>> = {
  EARLY: 0,
  RISING: 1,
  STEADY: 2,
  PEAKING: 3,
  DECLINING: 4,
  EXHAUSTED: 5,
};

function topDimension(saturation: Record<Dimension, number>): Dimension {
  return DIM_ORDER.reduce((best, d) => ((saturation[d] ?? 0) > (saturation[best] ?? 0) ? d : best), DIM_ORDER[0]);
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt className="label-caps pt-[5px] text-cluster/45">{label}</dt>
      <dd className="min-w-0">{children}</dd>
    </>
  );
}

function StageLabel({ stage, className }: { stage: LifecycleStage; className?: string }) {
  if (stage === "INSUFFICIENT") return <Badge tone="neutral">{LIFECYCLE_NAMES.INSUFFICIENT}</Badge>;
  return (
    <span className={cx("whitespace-nowrap font-mono tracking-[0.08em]", STAGE_TEXT[stage], className)}>
      {LIFECYCLE_NAMES[stage]} {LIFECYCLE_ARROWS[stage]}
    </span>
  );
}

export type PositionCardProps = {
  position: CreativePosition;
  market: MarketKey;
  sampleN: number;
};

export function PositionCard({ position, market, sampleN }: PositionCardProps) {
  const r: PositionResult = position[market];
  const [openDim, setOpenDim] = useState<Dimension | null>(() => topDimension(position[market].saturation));
  const top = topDimension(r.saturation);
  const lc = r.lifecycle;

  return (
    <motion.section aria-label="Creative Position" variants={rise} initial="hidden" animate="show">
      <SectionTitle right={<Badge tone="gold">{MARKET_NAMES[market]}</Badge>}>Creative Position</SectionTitle>
      <GlassPanel glow className="p-5 sm:p-6">
        <dl className="grid grid-cols-[82px_minmax(0,1fr)] items-start gap-x-4 gap-y-5 sm:grid-cols-[96px_minmax(0,1fr)]">
          <Row label="Crowding">
            <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1.5">
              <CountUp
                value={r.crowding.score}
                className={cx(
                  "font-mono text-[40px] font-medium leading-none tracking-tight",
                  CROWD_TEXT[r.crowding.label],
                  CROWD_GLOW[r.crowding.label],
                )}
              />
              <span className={cx("text-[15px]", CROWD_TEXT[r.crowding.label])}>· {r.crowding.label}</span>
              {r.lowData && <Badge tone="neutral">Low data</Badge>}
            </div>
            <Bar value={r.crowding.score / 100} tone={CROWD_BAR[r.crowding.label]} className="mt-3 max-w-[260px]" />
            <p className="mt-2 font-mono text-[11px] text-cluster/40">
              {r.crowding.exact} exact · {r.crowding.close} close · {r.crowding.medium} medium
            </p>
          </Row>

          <Row label="Lifecycle">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <StageLabel stage={lc.stage} className="text-[15px]" />
              {lc.stage !== "INSUFFICIENT" && lc.weekly.length > 0 && (
                <span className="flex items-center gap-2">
                  <Sparkline
                    key={`${market}-${lc.weekly.join(",")}`}
                    values={lc.weekly}
                    tone={STAGE_SPARK[lc.stage]}
                    width={104}
                    height={28}
                    label={`Similar videos per week, last ${lc.weekly.length} weeks: ${lc.weekly.join(", ")}`}
                  />
                  <span className="font-mono text-[10px] text-cluster/35">{lc.weekly.length} wk</span>
                </span>
              )}
              {r.lowData && <Badge tone="neutral">Low data</Badge>}
            </div>
            {lc.why && <p className="mt-2 text-pretty text-[12.5px] leading-relaxed text-cluster/55">{lc.why}</p>}
          </Row>

          <Row label="Market">
            <p className="pt-[1px] text-[13.5px] leading-snug text-cluster/80">{position.marketLine}</p>
          </Row>

          <Row label="Confidence">
            <p className="pt-[1px] text-[13.5px] text-cluster/80">
              <span className={CONFIDENCE_TEXT[r.confidence.level]}>{r.confidence.level}</span>
              <span className="text-cluster/35"> · </span>
              <span className="font-mono">{r.confidence.n}</span> videos
            </p>
          </Row>
        </dl>

        <motion.p
          key={`${market}-${r.insight}`}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: EASE }}
          className="mt-8 text-balance font-serif text-[1.75rem] leading-[1.12] text-cluster sm:text-[2rem]"
        >
          {r.insight}
        </motion.p>

        <div className="mt-7">
          <p className="label-caps mb-2 text-cluster/45">Saturation by dimension</p>
          <ul className="space-y-0.5">
            {DIM_ORDER.map((d, i) => {
              const v = r.saturation[d] ?? 0;
              const p = pct(v);
              const open = openDim === d;
              return (
                <li key={d}>
                  <button
                    type="button"
                    aria-expanded={open}
                    onClick={() => setOpenDim(open ? null : d)}
                    className={cx(
                      "group grid w-full grid-cols-[72px_minmax(0,1fr)_40px] items-center gap-3 rounded-md px-1.5 py-[7px] text-left transition-colors hover:bg-white/[0.03]",
                      open && "bg-white/[0.025]",
                    )}
                  >
                    <span className={cx("text-[12.5px] transition-colors", open ? "text-cluster" : "text-cluster/65 group-hover:text-cluster")}>
                      {DIMENSION_NAMES[d]}
                    </span>
                    <Bar value={v} tone={d === top && v >= 0.5 ? "red" : "gold"} delay={0.1 + i * 0.05} />
                    <span className="text-right font-mono text-[12px] text-cluster/80">{p}%</span>
                  </button>
                  <AnimatePresence initial={false}>
                    {open && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.3, ease: EASE }}
                        className="overflow-hidden"
                      >
                        <p className="px-1.5 pb-2 pt-0.5 text-[13px] text-gold-light/90">
                          <span className="font-mono">{p}%</span> of similar videos share your {DIMENSION_NOUNS[d]}.
                        </p>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </li>
              );
            })}
          </ul>
        </div>

        <p className="mt-6 border-t border-white/[0.05] pt-4 text-[11.5px] text-cluster/40">
          In the analyzed sample of <span className="font-mono text-cluster/60">{sampleN}</span> videos.
        </p>
      </GlassPanel>
    </motion.section>
  );
}

export type PositionCompareProps = {
  before: CreativePosition;
  after: CreativePosition;
  market: MarketKey;
};

function CompareRow({ label, before, after, better, extra }: { label: string; before: ReactNode; after: ReactNode; better: boolean; extra?: ReactNode }) {
  return (
    <div className="border-t border-white/[0.05] py-3 first:border-t-0 first:pt-0">
      <div className="label-caps mb-1.5 text-cluster/40">{label}</div>
      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-baseline gap-3">
        <div className="min-w-0 text-cluster/45">{before}</div>
        <span aria-hidden className={cx("text-[13px]", better ? "text-gold" : "text-cluster/30")}>
          →
        </span>
        <div className={cx("flex min-w-0 flex-wrap items-baseline gap-x-2", better ? "text-gold" : "text-cluster/85")}>
          {after}
          {extra}
        </div>
      </div>
    </div>
  );
}

/** Before → after rows for a rerouted idea; improvements glow gold. */
export function PositionCompare({ before, after, market }: PositionCompareProps) {
  const b = before[market];
  const a = after[market];
  const delta = a.crowding.score - b.crowding.score;
  const crowdBetter = delta < 0;
  const rb = STAGE_RANK[b.lifecycle.stage];
  const ra = STAGE_RANK[a.lifecycle.stage];
  const lifeBetter = rb !== undefined && ra !== undefined && ra < rb;

  return (
    <GlassPanel className="p-4 sm:p-5">
      <div className="mb-3 flex items-center justify-between">
        <span className="label-caps text-cluster/45">Before → after</span>
        <Badge tone="gold">{MARKET_NAMES[market]}</Badge>
      </div>

      <CompareRow
        label="Crowding"
        better={crowdBetter}
        before={
          <span>
            <span className="font-mono text-[18px]">{b.crowding.score}</span> <span className="text-[12px]">{b.crowding.label}</span>
          </span>
        }
        after={
          <span className={crowdBetter ? "[text-shadow:0_0_20px_rgb(255_181_71/0.45)]" : undefined}>
            <span className="font-mono text-[18px]">{a.crowding.score}</span> <span className="text-[12px]">{a.crowding.label}</span>
          </span>
        }
        extra={
          delta !== 0 ? (
            <span className={cx("font-mono text-[11px]", crowdBetter ? "text-gold/80" : "text-crowded-soft")}>
              {delta > 0 ? `+${delta}` : `−${Math.abs(delta)}`}
            </span>
          ) : null
        }
      />

      <CompareRow
        label="Lifecycle"
        better={lifeBetter}
        before={<StageLabel stage={b.lifecycle.stage} className="text-[12.5px] text-cluster/45!" />}
        after={<StageLabel stage={a.lifecycle.stage} className={cx("text-[12.5px]", lifeBetter && "text-gold!")} />}
      />

      <CompareRow
        label="Confidence"
        better={false}
        before={
          <span className="text-[13px]">
            {b.confidence.level} · <span className="font-mono">{b.confidence.n}</span>
          </span>
        }
        after={
          <span className="text-[13px]">
            {a.confidence.level} · <span className="font-mono">{a.confidence.n}</span>
          </span>
        }
        extra={a.lowData ? <Badge tone="neutral">Low data</Badge> : null}
      />

      <div className="mt-3 border-t border-gold/10 pt-4">
        <span className="label-caps text-cluster/40">After</span>
        <p className="mt-1.5 text-balance font-serif text-[1.35rem] leading-snug text-cluster">{a.insight}</p>
      </div>
    </GlassPanel>
  );
}

export default PositionCard;

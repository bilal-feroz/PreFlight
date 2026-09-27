"use client";

import { motion } from "framer-motion";
import type { MarketKey, ProgressEvent, RerouteResult } from "@/lib/result-types";
import { Bar } from "@/components/ui/Bar";
import { Button } from "@/components/ui/Button";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { rise, stagger } from "@/components/ui/motion";
import { latestProgress } from "@/components/processing/progress";
import { PositionCompare } from "./PositionCard";

export type RerouteStatus = "idle" | "running" | "done" | "error";

export type RerouteProps = {
  status: RerouteStatus;
  events: ProgressEvent[];
  result: RerouteResult | null;
  market: MarketKey;
  error?: string | null;
  onPreflightAgain?(): void;
};

export function Reroute({ status, events, result, market, error, onPreflightAgain }: RerouteProps) {
  return (
    <section aria-label="Reroute">
      <SectionTitle>Reroute</SectionTitle>
      {status === "running" ? (
        <Running events={events} />
      ) : status === "error" ? (
        <GlassPanel className="border-crowded/45! p-5">
          <p role="alert" className="text-[13.5px] text-crowded-soft">
            {error || "The reroute could not be completed."}
          </p>
        </GlassPanel>
      ) : status === "done" && result ? (
        <Done result={result} market={market} onPreflightAgain={onPreflightAgain} />
      ) : (
        <GlassPanel className="p-5">
          <p className="text-[13.5px] text-cluster/55">Pick an Open Territory to reroute the idea.</p>
        </GlassPanel>
      )}
    </section>
  );
}

function Running({ events }: { events: ProgressEvent[] }) {
  const p = latestProgress(events);
  const hasTotal = p.total !== undefined && p.total > 0;
  return (
    <GlassPanel className="p-5" aria-live="polite">
      <div className="flex items-center gap-3">
        <span aria-hidden className="relative grid size-4 shrink-0 place-items-center">
          <span className="absolute size-3 rounded-full bg-gold/30 animate-[pf-breathe_1.8s_ease-in-out_infinite]" />
          <span className="size-1.5 rounded-full bg-gold shadow-[0_0_10px_2px_rgb(255_181_71/0.6)]" />
        </span>
        <span className="min-w-0 flex-1 truncate text-[14px] text-cluster/90">{p.label ?? "Rerouting"}</span>
        {hasTotal && (
          <span className="shrink-0 font-mono text-[12px] text-gold/85">
            {p.done ?? 0}/{p.total}
          </span>
        )}
      </div>
      {p.detail && <p className="mt-1.5 truncate pl-7 text-[12px] text-cluster/40">{p.detail}</p>}
      <div className="mt-4 pl-7">
        {hasTotal ? (
          <Bar value={(p.done ?? 0) / (p.total ?? 1)} />
        ) : (
          <span className="shimmer block h-[3px] w-full rounded-full" />
        )}
      </div>
    </GlassPanel>
  );
}

function Done({
  result,
  market,
  onPreflightAgain,
}: {
  result: RerouteResult;
  market: MarketKey;
  onPreflightAgain?(): void;
}) {
  const lessCrowded = result.after[market].crowding.score < result.before[market].crowding.score;
  return (
    <motion.div variants={stagger(0.1)} initial="hidden" animate="show" className="space-y-4">
      <motion.div variants={rise}>
        <GlassPanel glow className="p-5 sm:p-6">
          <span className="label-caps text-cluster/45">Rerouted idea</span>
          <blockquote className="mt-2.5 text-pretty font-serif text-[1.45rem] leading-snug text-cluster sm:text-[1.65rem]">
            &ldquo;{result.brief}&rdquo;
          </blockquote>
          {result.changes.length > 0 && (
            <ul className="mt-4 space-y-1.5 border-t border-gold/10 pt-4">
              {result.changes.slice(0, 3).map((c, i) => (
                <li key={`${c}-${i}`} className="flex gap-2.5 text-[13.5px] leading-snug text-cluster/75">
                  <span aria-hidden className="text-gold">
                    →
                  </span>
                  <span>{c}</span>
                </li>
              ))}
            </ul>
          )}
        </GlassPanel>
      </motion.div>

      <motion.div variants={rise}>
        <PositionCompare before={result.before} after={result.after} market={market} />
      </motion.div>

      <motion.p variants={rise} className="text-[12.5px] text-cluster/50">
        {lessCrowded
          ? "Less crowded in the analyzed dataset. Not a performance prediction."
          : "Not less crowded in the analyzed dataset. Not a performance prediction."}
      </motion.p>

      {onPreflightAgain && (
        <motion.div variants={rise}>
          <Button variant="primary" size="lg" onClick={onPreflightAgain}>
            Preflight again
          </Button>
        </motion.div>
      )}
    </motion.div>
  );
}

export default Reroute;

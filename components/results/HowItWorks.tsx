"use client";

import type { ReactNode } from "react";
import { motion } from "framer-motion";
import { Drawer } from "@/components/ui/Drawer";
import { EASE } from "@/components/ui/motion";

export type HowItWorksProps = {
  open: boolean;
  onClose(): void;
};

const PIPELINE: { step: string; note: string }[] = [
  { step: "CAMPAIGN", note: "Your idea, in plain words" },
  { step: "CREATIVE DNA", note: "Hook, format, narrative, visual, topic, product" },
  { step: "ORIANE", note: "Real Instagram and TikTok videos, searched by speech, captions and visuals" },
  { step: "CREATIVE POSITION", note: "Crowding, lifecycle, market, confidence" },
  { step: "COLLISIONS", note: "The closest real videos, with evidence" },
  { step: "CREATIVE AIRSPACE", note: "The analyzed sample mapped in 3D, your idea as a star" },
  { step: "OPEN TERRITORY", note: "Where the sample shows room" },
  { step: "REROUTE", note: "Rewrite the idea toward that territory, then compare before and after on the same pool" },
  { step: "PREFLIGHT AGAIN", note: "Run the rerouted idea through the full check" },
];

function Ar({ children }: { children: ReactNode }) {
  return (
    <bdi dir="rtl" lang="ar" className="font-sans">
      {children}
    </bdi>
  );
}

const FORMULAS: { title: string; body: ReactNode }[] = [
  {
    title: "Overall similarity",
    body: "0.25 hook + 0.20 narrative + 0.20 visual + 0.15 format + 0.10 topic + 0.10 product",
  },
  {
    title: "Crowding",
    body: (
      <>
        round(100 × (0.5·min(1, exact/8) + 0.3·min(1, close/20) + 0.2·min(1, medium/40)))
        <br />
        exact ≥ 0.85 · close 0.70–0.85 · medium 0.55–0.70
      </>
    ),
  },
  {
    title: "Dimension saturation",
    body: "% of relevant videos (overall ≥ 0.4) with that dimension ≥ 0.7",
  },
  {
    title: "Confidence",
    body: "relevant N ≥ 80 High · 30–79 Medium · < 30 Low",
  },
  {
    title: "Lifecycle",
    body: (
      <>
        videos with overall ≥ 0.55, 12 weeks ending at the newest video in the sample
        <br />
        supplyGrowth = (last 6 wk − previous 6) ÷ max(1, previous 6)
        <br />
        attentionRatio = median relative response last 6 wk ÷ previous 6
        <br />
        relative response = views ÷ followers, normalized to videos of the same week
        <br />
        EARLY / RISING / PEAKING / DECLINING / EXHAUSTED rules
        <br />
        under 12 dated videos = INSUFFICIENT DATA
      </>
    ),
  },
  {
    title: "Market",
    body: (
      <>
        Arabic = language field &quot;ar&quot; (else &gt;30% Arabic script)
        <br />
        UAE-context = tagged location or Dubai / Abu Dhabi / UAE / <Ar>دبي</Ar> / <Ar>الإمارات</Ar> / AED… in caption or
        transcript
      </>
    ),
  },
];

export function HowItWorks({ open, onClose }: HowItWorksProps) {
  return (
    <Drawer open={open} onClose={onClose} label="How it works" size="lg">
      <div className="space-y-9">
        <ol aria-label="Pipeline" className="relative">
          {PIPELINE.map((p, i) => (
            <motion.li
              key={p.step}
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.5, delay: 0.15 + i * 0.05, ease: EASE }}
              className="relative flex gap-4 pb-4 last:pb-0"
            >
              {i < PIPELINE.length - 1 && (
                <span
                  aria-hidden
                  className="absolute left-[8.5px] top-[18px] h-[calc(100%-18px)] w-px bg-linear-to-b from-gold/70 to-gold/25"
                />
              )}
              <span
                aria-hidden
                className="relative z-10 mt-px grid size-[18px] shrink-0 place-items-center rounded-full border border-gold/60 bg-void shadow-[0_0_14px_-2px_rgb(255_181_71/0.65)]"
              >
                <span className="size-1.5 rounded-full bg-gold" />
              </span>
              <div className="min-w-0">
                <p className="font-mono text-[12px] tracking-[0.16em] text-cluster/90">{p.step}</p>
                <p className="mt-0.5 text-[12.5px] leading-snug text-cluster/45">{p.note}</p>
              </div>
            </motion.li>
          ))}
        </ol>

        <div className="space-y-3">
          {FORMULAS.map((f) => (
            <div key={f.title} className="rounded-xl border border-gold/10 bg-white/[0.015] p-4">
              <h3 className="label-caps text-gold/85">{f.title}</h3>
              <p dir="ltr" className="mt-2 break-words font-mono text-[12px] leading-relaxed text-cluster/80">
                {f.body}
              </p>
            </div>
          ))}
        </div>

        <div className="border-t border-gold/10 pt-6">
          <h3 className="label-caps text-gold/85">Rules</h3>
          <p className="mt-3 text-pretty font-serif text-[1.3rem] leading-snug text-cluster/90">
            The LLM extracts structure and writes wording only; every score and count is computed in code over real
            Oriane results. Sample-based, not a performance prediction.
          </p>
        </div>
      </div>
    </Drawer>
  );
}

export default HowItWorks;

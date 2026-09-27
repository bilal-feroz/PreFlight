"use client";

import { Fragment } from "react";
import { motion } from "framer-motion";
import type { CreativeDNA } from "@/lib/types";
import { FORMAT_NAMES } from "@/lib/labels";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { rise } from "@/components/ui/motion";

export type DnaChipsProps = { dna: CreativeDNA };

type Row = { label: string; items: string[]; arc?: boolean };

function clean(items: (string | null | undefined)[]): string[] {
  return items.map((s) => (s ?? "").trim()).filter(Boolean);
}

export function DnaChips({ dna }: DnaChipsProps) {
  const rows: Row[] = [
    { label: "Hook", items: clean([dna.hook]) },
    { label: "Format", items: clean([FORMAT_NAMES[dna.format] ?? dna.format]) },
    { label: "Arc", items: clean(dna.narrativeArc), arc: true },
    { label: "Topic", items: clean(dna.topic) },
    { label: "Visual", items: clean(dna.visualMotifs) },
    { label: "Product", items: clean([dna.productInteraction]) },
    { label: "Tone", items: clean(dna.tone) },
    { label: "Location", items: clean(dna.locationContext) },
    { label: "CTA", items: clean([dna.cta]) },
  ].filter((r) => r.items.length > 0);

  return (
    <motion.section aria-label="Creative Constellation" variants={rise} initial="hidden" animate="show">
      <SectionTitle>Creative Constellation</SectionTitle>
      <GlassPanel className="p-4 sm:p-5">
        <dl className="grid grid-cols-[64px_minmax(0,1fr)] gap-x-4 gap-y-3 sm:grid-cols-[80px_minmax(0,1fr)]">
          {rows.map((r) => (
            <Fragment key={r.label}>
              <dt className="label-caps pt-[7px] text-cluster/45">{r.label}</dt>
              <dd className="flex min-w-0 flex-wrap items-center gap-1.5">
                {r.items.map((item, i) => (
                  <Fragment key={`${item}-${i}`}>
                    {r.arc && i > 0 && (
                      <span aria-hidden className="text-[12px] text-gold/50">
                        →
                      </span>
                    )}
                    <span className="inline-flex max-w-full items-center rounded-[10px] border border-gold/15 bg-gold/[0.035] px-2.5 py-1 text-[12.5px] leading-snug text-cluster/85">
                      {item}
                    </span>
                  </Fragment>
                ))}
              </dd>
            </Fragment>
          ))}
        </dl>
      </GlassPanel>
    </motion.section>
  );
}

export default DnaChips;

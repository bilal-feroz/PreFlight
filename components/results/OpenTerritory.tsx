"use client";

import { motion } from "framer-motion";
import type { Territory, VideoCard } from "@/lib/result-types";
import { LIFECYCLE_ARROWS, LIFECYCLE_NAMES } from "@/lib/labels";
import { Badge } from "@/components/ui/Badge";
import { Button, Spinner } from "@/components/ui/Button";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { Thumb } from "@/components/ui/Thumb";
import { cx } from "@/components/ui/cx";
import { handle, platformName } from "@/components/ui/format";
import { EASE } from "@/components/ui/motion";

export type OpenTerritoryProps = {
  territories: Territory[];
  videos: Record<string, VideoCard>;
  onReroute(territoryId: string): void;
  busy?: boolean;
  activeId?: string | null;
};

export function OpenTerritory({ territories, videos, onReroute, busy = false, activeId = null }: OpenTerritoryProps) {
  const hero = territories.find((t) => t.hero) ?? territories[0];
  const rest = hero ? territories.filter((t) => t.id !== hero.id).slice(0, 2) : [];

  return (
    <section aria-label="Open Territory">
      <SectionTitle>Open Territory</SectionTitle>
      {!hero ? (
        <p className="glass rounded-2xl p-5 text-[13.5px] text-cluster/60">No open territory the data supports in this sample.</p>
      ) : (
        <div className="space-y-3">
          <TerritoryCard territory={hero} videos={videos} size="lg" index={0} busy={busy} activeId={activeId} onReroute={onReroute} />
          {rest.map((t, i) => (
            <TerritoryCard key={t.id} territory={t} videos={videos} size="sm" index={i + 1} busy={busy} activeId={activeId} onReroute={onReroute} />
          ))}
        </div>
      )}
    </section>
  );
}

function TerritoryCard({
  territory: t,
  videos,
  size,
  index,
  busy,
  activeId,
  onReroute,
}: {
  territory: Territory;
  videos: Record<string, VideoCard>;
  size: "lg" | "sm";
  index: number;
  busy: boolean;
  activeId: string | null;
  onReroute(id: string): void;
}) {
  const lg = size === "lg";
  const active = activeId === t.id;
  const running = busy && active;
  const evidence = t.evidence
    .map((id) => videos[id])
    .filter((v): v is VideoCard => Boolean(v))
    .slice(0, 3);

  return (
    <motion.article
      initial={{ opacity: 0, y: 14 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-30px" }}
      transition={{ duration: 0.6, delay: index * 0.09, ease: EASE }}
      className={cx(
        "relative rounded-2xl transition-[border-color,box-shadow] duration-500",
        lg ? "glass-glow p-5 sm:p-6" : "glass p-4 sm:p-5",
        active && "border-gold/60! shadow-[0_0_60px_-18px_rgb(255_181_71/0.55),inset_0_0_48px_0_rgb(255_181_71/0.06)]!",
      )}
    >
      {lg && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-8 top-0 h-px bg-linear-to-r from-transparent via-gold/60 to-transparent"
        />
      )}

      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Badge tone={t.kind === "LOCALIZE" ? "pale" : "gold"}>{t.kind}</Badge>
          {active && !busy && <Badge tone="neutral">Selected</Badge>}
        </div>
        <span className="whitespace-nowrap font-mono text-[11px] tracking-[0.08em] text-cluster/50">
          {LIFECYCLE_NAMES[t.lifecycle]} {LIFECYCLE_ARROWS[t.lifecycle]}
        </span>
      </div>

      <h3 className={cx("mt-3 font-serif leading-[1.05] text-cluster", lg ? "text-[2.1rem] sm:text-[2.4rem]" : "text-[1.55rem]")}>{t.name}</h3>
      <p className={cx("mt-2 font-mono text-cluster/55", lg ? "text-[11.5px]" : "text-[11px]")}>{t.statsLine}</p>
      <p className={cx("mt-3 text-pretty leading-relaxed text-cluster/75", lg ? "text-[14px]" : "text-[13px]")}>{t.why}</p>

      {evidence.length > 0 && (
        <div className="mt-4 flex gap-2">
          {evidence.map((v) => (
            <a
              key={v.id}
              href={v.url}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`Open ${handle(v.creator)} on ${platformName(v.platform)}`}
              className="group/thumb block rounded-md transition-transform duration-300 hover:-translate-y-0.5"
            >
              <Thumb
                src={v.thumb}
                hasThumb={v.hasThumb}
                alt=""
                rounded="rounded-md"
                className={cx("transition-shadow group-hover/thumb:shadow-[0_0_20px_-4px_rgb(255_181_71/0.5)]", lg ? "w-14 sm:w-16" : "w-11")}
              />
            </a>
          ))}
        </div>
      )}

      <p className={cx("mt-4 text-cluster/60", lg ? "text-[13px]" : "text-[12.5px]")}>
        <span className="label-caps mr-1.5 text-gold/70">Keeps:</span>
        {t.keeps}
      </p>

      <div className="mt-5">
        <Button variant="outline" size={lg ? "md" : "sm"} disabled={busy} onClick={() => onReroute(t.id)} aria-busy={running}>
          {running ? (
            <>
              <Spinner /> Rerouting
            </>
          ) : (
            <>
              Reroute here <span aria-hidden>→</span>
            </>
          )}
        </Button>
      </div>
    </motion.article>
  );
}

export default OpenTerritory;

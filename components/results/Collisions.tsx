"use client";

import { motion } from "framer-motion";
import type { Collision, VideoCard } from "@/lib/result-types";
import { compactNumber, shortDate, timestamp } from "@/lib/labels";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { Thumb } from "@/components/ui/Thumb";
import { handle, pct, platformName } from "@/components/ui/format";
import { EASE } from "@/components/ui/motion";

export type CollisionsProps = {
  collisions: Collision[];
  videos: Record<string, VideoCard>;
  onHover(id: string | null): void;
  onOpen(id: string): void;
};

function lowerFirst(s: string): string {
  return s.length > 1 && s[1] === s[1].toLowerCase() ? s[0].toLowerCase() + s.slice(1) : s;
}

function upperFirst(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** "Same opening. Same interaction. Same reveal." for short elements, plain sentences otherwise. */
function sharedLine(shared: string[]): string {
  return shared
    .map((s) => s.trim().replace(/[.\s]+$/, ""))
    .filter(Boolean)
    .slice(0, 3)
    .map((s) => {
      if (/^same\b/i.test(s)) return `${upperFirst(s)}.`;
      if (s.split(/\s+/).length <= 3) return `Same ${lowerFirst(s)}.`;
      return `${upperFirst(s)}.`;
    })
    .join(" ");
}

export function Collisions({ collisions, videos, onHover, onOpen }: CollisionsProps) {
  const items = collisions.filter((c) => videos[c.id]).slice(0, 3);

  return (
    <section aria-label="Collisions">
      <SectionTitle>Collisions</SectionTitle>
      <p className="-mt-1 mb-4 text-[13px] text-cluster/50">The real videos closest to your idea.</p>
      {items.length === 0 ? (
        <p className="glass rounded-2xl p-5 text-[13.5px] text-cluster/55">No close collisions in this sample.</p>
      ) : (
        <ul className="space-y-3">
          {items.map((c, i) => (
            <CollisionCard key={c.id} collision={c} video={videos[c.id]} index={i} onHover={onHover} onOpen={onOpen} />
          ))}
        </ul>
      )}
    </section>
  );
}

function CollisionCard({
  collision,
  video,
  index,
  onHover,
  onOpen,
}: {
  collision: Collision;
  video: VideoCard;
  index: number;
  onHover(id: string | null): void;
  onOpen(id: string): void;
}) {
  const similarity = pct(collision.overall);
  const line = sharedLine(collision.shared);
  const when = timestamp(video.snippetT);
  const meta = [
    video.views !== undefined ? `${compactNumber(video.views)} views` : null,
    video.publishedAt ? shortDate(video.publishedAt) : null,
  ].filter(Boolean);

  return (
    <motion.li
      initial={{ opacity: 0, y: 14 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-30px" }}
      transition={{ duration: 0.6, delay: index * 0.09, ease: EASE }}
    >
      <button
        type="button"
        onMouseEnter={() => onHover(collision.id)}
        onMouseLeave={() => onHover(null)}
        onFocus={() => onHover(collision.id)}
        onBlur={() => onHover(null)}
        onClick={() => onOpen(collision.id)}
        aria-label={`${handle(video.creator)} on ${platformName(video.platform)}, ${similarity}% similar. Open evidence.`}
        className="glass group flex w-full gap-3.5 rounded-2xl p-3 text-left transition-[border-color,box-shadow,background-color] duration-300 hover:border-gold/45 hover:bg-white/[0.035] hover:shadow-[0_0_44px_-14px_rgb(255_181_71/0.5)] sm:gap-4 sm:p-3.5"
      >
        <Thumb src={video.thumb} hasThumb={video.hasThumb} alt="" className="w-[74px] sm:w-[88px]" />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="flex items-start justify-between gap-3">
            <span className="min-w-0">
              <span className="block truncate text-[14px] font-medium text-cluster">{handle(video.creator)}</span>
              <span className="label-caps mt-1 block text-cluster/40">{platformName(video.platform)}</span>
            </span>
            <span className="shrink-0 text-right">
              <span className="block font-mono text-[22px] leading-none text-gold [text-shadow:0_0_18px_rgb(255_181_71/0.45)]">
                {similarity}%
              </span>
              <span className="label-caps mt-1 block text-cluster/35">similar</span>
            </span>
          </span>
          {meta.length > 0 && <span className="mt-2 font-mono text-[11.5px] text-cluster/50">{meta.join(" · ")}</span>}
          {line && <span className="mt-2 text-[13px] leading-snug text-cluster/85">{line}</span>}
          {video.snippet && (
            <span className="mt-2 line-clamp-2 font-serif text-[15px] italic leading-snug text-cluster/60">
              &ldquo;{video.snippet}&rdquo;
              {when && <span className="ml-1.5 font-mono text-[11px] not-italic text-gold/70">{when}</span>}
            </span>
          )}
        </span>
      </button>
    </motion.li>
  );
}

export default Collisions;

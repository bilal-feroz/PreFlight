"use client";

import type { ReactNode } from "react";
import type { Collision, VideoCard } from "@/lib/result-types";
import { DIMENSION_NAMES, FORMAT_NAMES, compactNumber, shortDate, timestamp } from "@/lib/labels";
import { Badge } from "@/components/ui/Badge";
import { Bar } from "@/components/ui/Bar";
import { Drawer } from "@/components/ui/Drawer";
import { Thumb } from "@/components/ui/Thumb";
import { DIM_ORDER, handle, pct, platformName } from "@/components/ui/format";

export type EvidenceDrawerProps = {
  video: VideoCard | null;
  collision?: Collision | null;
  onClose(): void;
};

export function EvidenceDrawer({ video, collision, onClose }: EvidenceDrawerProps) {
  const match = video && collision && collision.id === video.id ? collision : null;
  return (
    <Drawer open={video !== null} onClose={onClose} label="Evidence">
      {video && <EvidenceBody video={video} collision={match} />}
    </Drawer>
  );
}

function Block({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <h3 className="label-caps mb-2 text-cluster/45">{label}</h3>
      {children}
    </div>
  );
}

function Stat({ label, value, className }: { label: string; value: number | undefined; className?: string }) {
  return (
    <div className={`rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2.5 ${className ?? ""}`}>
      <dt className="label-caps text-cluster/40">{label}</dt>
      <dd className="mt-1 font-mono text-[15px] text-cluster">{compactNumber(value)}</dd>
    </div>
  );
}

function EvidenceBody({ video, collision }: { video: VideoCard; collision: Collision | null }) {
  const platform = platformName(video.platform);
  const snippetAt = timestamp(video.snippetT);
  const frameAt = timestamp(video.frameT);
  const duration = timestamp(video.durationSec);
  const motifs = (video.motifs ?? []).filter(Boolean);

  return (
    <div className="space-y-7">
      <div className="relative flex h-[min(46vh,420px)] items-center justify-center overflow-hidden rounded-xl border border-gold/10 bg-[radial-gradient(70%_60%_at_50%_40%,rgb(255_181_71/0.1),transparent_70%)]">
        <Thumb
          src={video.thumb}
          hasThumb={video.hasThumb}
          alt={`Thumbnail of the video by ${handle(video.creator)}`}
          className="h-full shadow-[0_20px_60px_-20px_rgb(0_0_0/0.9)]"
          rounded="rounded-none"
        />
        {collision && (
          <span className="absolute right-3 top-3 rounded-full border border-gold/40 bg-black/60 px-2.5 py-1 font-mono text-[12px] text-gold backdrop-blur-sm">
            {pct(collision.overall)}% similar
          </span>
        )}
      </div>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[17px] font-medium text-cluster">{handle(video.creator)}</p>
          <p className="mt-0.5 text-[12.5px] text-cluster/50">
            {video.creatorName && video.creatorName !== video.creator ? `${video.creatorName} · ` : ""}
            {video.followers !== undefined ? (
              <>
                <span className="font-mono">{compactNumber(video.followers)}</span> followers
              </>
            ) : (
              platform
            )}
          </p>
        </div>
        <a
          href={video.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-gold/45 px-4 text-[12.5px] text-gold transition-[background-color,border-color] hover:border-gold/80 hover:bg-gold/[0.09]"
        >
          Open on {platform}
          <svg viewBox="0 0 12 12" className="size-2.5" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden>
            <path d="M4 2h6v6M10 2L2.5 9.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </a>
      </div>

      <dl className="grid grid-cols-3 gap-2">
        <Stat label="Views" value={video.views} />
        <Stat label="Likes" value={video.likes} />
        <Stat label="Comments" value={video.comments} />
        <Stat label="Shares" value={video.shares} />
        <div className="col-span-2 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2.5">
          <dt className="label-caps text-cluster/40">Saves</dt>
          <dd className="mt-1.5 text-[12px] text-cluster/40">not available</dd>
        </div>
      </dl>

      <p className="flex flex-wrap gap-x-3 gap-y-1 text-[12.5px] text-cluster/55">
        <span>
          Published <span className="font-mono text-cluster/80">{shortDate(video.publishedAt)}</span>
        </span>
        {duration && (
          <span>
            Length <span className="font-mono text-cluster/80">{duration}</span>
          </span>
        )}
        {video.language && (
          <span>
            Language <span className="font-mono uppercase text-cluster/80">{video.language}</span>
          </span>
        )}
        {video.markets.arabic && <Badge tone="gold">Arabic</Badge>}
        {video.markets.uae && <Badge tone="gold">UAE-context</Badge>}
      </p>

      {video.snippet && (
        <Block label="Transcript">
          <blockquote className="border-l border-gold/40 pl-4 font-serif text-[18px] italic leading-snug text-cluster/85">
            &ldquo;{video.snippet}&rdquo;
          </blockquote>
          {snippetAt && <p className="mt-2 pl-4 font-mono text-[11.5px] text-gold/75">at {snippetAt}</p>}
        </Block>
      )}

      <Block label="Detected">
        <dl className="grid grid-cols-[72px_minmax(0,1fr)] gap-x-4 gap-y-2 text-[13px]">
          <dt className="text-cluster/40">Format</dt>
          <dd className="text-cluster/85">{FORMAT_NAMES[video.format] ?? video.format}</dd>
          {video.hook && (
            <>
              <dt className="text-cluster/40">Hook</dt>
              <dd className="text-cluster/85">{video.hook}</dd>
            </>
          )}
          {motifs.length > 0 && (
            <>
              <dt className="text-cluster/40">Motifs</dt>
              <dd className="flex flex-wrap gap-1.5">
                {motifs.map((m, i) => (
                  <span key={`${m}-${i}`} className="rounded-md border border-gold/15 bg-gold/[0.035] px-2 py-0.5 text-[12px] text-cluster/80">
                    {m}
                  </span>
                ))}
              </dd>
            </>
          )}
          {frameAt && (
            <>
              <dt className="text-cluster/40">Frame</dt>
              <dd className="text-cluster/85">
                Best visual match at <span className="font-mono text-gold/85">{frameAt}</span>
              </dd>
            </>
          )}
        </dl>
      </Block>

      {collision && (
        <Block label="Similarity">
          <div className="mb-3 flex items-baseline gap-2">
            <span className="font-mono text-[28px] leading-none text-gold [text-shadow:0_0_20px_rgb(255_181_71/0.45)]">
              {pct(collision.overall)}%
            </span>
            <span className="text-[12px] text-cluster/45">overall</span>
          </div>
          <ul className="space-y-2">
            {DIM_ORDER.map((d, i) => {
              const v = collision.dims[d] ?? 0;
              return (
                <li key={d} className="grid grid-cols-[72px_minmax(0,1fr)_36px] items-center gap-3">
                  <span className="text-[12.5px] text-cluster/65">{DIMENSION_NAMES[d]}</span>
                  <Bar value={v} delay={0.15 + i * 0.05} />
                  <span className="text-right font-mono text-[12px] text-cluster/80">{pct(v)}</span>
                </li>
              );
            })}
          </ul>

          {(collision.shared.length > 0 || collision.different.length > 0) && (
            <div className="mt-5 grid gap-5 sm:grid-cols-2">
              {collision.shared.length > 0 && (
                <div>
                  <h4 className="label-caps mb-2 text-gold/80">Shared</h4>
                  <ul className="space-y-1.5">
                    {collision.shared.map((s, i) => (
                      <li key={`${s}-${i}`} className="flex gap-2.5 text-[13px] leading-snug text-cluster/80">
                        <span aria-hidden className="mt-[7px] size-1 shrink-0 rounded-full bg-gold" />
                        {s}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {collision.different.length > 0 && (
                <div>
                  <h4 className="label-caps mb-2 text-pale-blue/80">Different</h4>
                  <ul className="space-y-1.5">
                    {collision.different.map((s, i) => (
                      <li key={`${s}-${i}`} className="flex gap-2.5 text-[13px] leading-snug text-cluster/80">
                        <span aria-hidden className="mt-[7px] size-1 shrink-0 rounded-full bg-pale-blue" />
                        {s}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </Block>
      )}
    </div>
  );
}

export default EvidenceDrawer;

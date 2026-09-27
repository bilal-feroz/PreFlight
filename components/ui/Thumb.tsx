"use client";

import { useState } from "react";
import { cx } from "./cx";

export type ThumbProps = {
  src?: string;
  hasThumb?: boolean;
  alt: string;
  className?: string;
  /** rounding class, default rounded-lg */
  rounded?: string;
};

/** 9:16 video thumbnail. Falls back to a dark gold-tinted gradient block when missing or broken. */
export function Thumb({ src, hasThumb = true, alt, className, rounded = "rounded-lg" }: ThumbProps) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const showImg = Boolean(src) && hasThumb && failedSrc !== src;

  return (
    <span className={cx("relative block aspect-[9/16] shrink-0 overflow-hidden bg-[#0a0806]", rounded, className)}>
      <span
        aria-hidden
        className="absolute inset-0 bg-[radial-gradient(120%_70%_at_28%_8%,rgb(255_181_71/0.16),transparent_62%),linear-gradient(170deg,#17110a_0%,#0a0806_55%,#050505_100%)]"
      />
      {showImg && src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={alt}
          decoding="async"
          draggable={false}
          className="absolute inset-0 h-full w-full object-cover"
          onError={() => setFailedSrc(src)}
          ref={(el) => {
            if (el && el.complete && el.naturalWidth === 0) setFailedSrc(src);
          }}
        />
      ) : (
        <span aria-hidden className="absolute inset-0 grid place-items-center">
          <svg viewBox="0 0 24 24" className="size-5 opacity-40" fill="none">
            <circle cx="12" cy="12" r="10.5" className="stroke-gold" strokeWidth="0.75" />
            <path d="M10 8.5v7l5.5-3.5z" className="fill-gold" />
          </svg>
        </span>
      )}
      <span aria-hidden className="pointer-events-none absolute inset-0 rounded-[inherit] ring-1 ring-inset ring-white/[0.07]" />
    </span>
  );
}

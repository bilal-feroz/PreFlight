import type { HTMLAttributes } from "react";
import { cx } from "./cx";

export type GlassPanelProps = HTMLAttributes<HTMLElement> & {
  as?: "div" | "section" | "article" | "aside";
  /** hero treatment: brighter hairline, outer gold glow, top highlight */
  glow?: boolean;
};

export function GlassPanel({ as: Tag = "div", glow = false, className, children, ...rest }: GlassPanelProps) {
  return (
    <Tag className={cx(glow ? "glass-glow" : "glass", "relative rounded-2xl", className)} {...rest}>
      {glow && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-8 top-0 h-px bg-linear-to-r from-transparent via-gold/60 to-transparent"
        />
      )}
      {children}
    </Tag>
  );
}

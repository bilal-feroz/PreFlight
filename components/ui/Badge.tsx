import type { ReactNode } from "react";
import { cx } from "./cx";

export type BadgeTone = "gold" | "red" | "neutral" | "pale";

const TONES: Record<BadgeTone, string> = {
  gold: "border-gold/35 bg-gold/[0.07] text-gold",
  red: "border-crowded/55 bg-crowded/[0.12] text-crowded-soft",
  neutral: "border-white/[0.12] bg-white/[0.03] text-cluster/60",
  pale: "border-pale-blue/35 bg-pale-blue/[0.07] text-pale-blue",
};

export function Badge({ children, tone = "neutral", className }: { children: ReactNode; tone?: BadgeTone; className?: string }) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-[3px] font-mono text-[10px] uppercase leading-none tracking-[0.14em]",
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

"use client";

import { motion } from "framer-motion";
import { cx } from "./cx";
import { EASE } from "./motion";

export type BarTone = "gold" | "amber" | "red" | "pale";

const FILL: Record<BarTone, string> = {
  gold: "linear-gradient(90deg, var(--color-gold-deep), var(--color-gold))",
  amber: "linear-gradient(90deg, #8a5a14, var(--color-gold-deep))",
  red: "linear-gradient(90deg, #7d2f26, var(--color-crowded))",
  pale: "linear-gradient(90deg, #4f6d8f, var(--color-pale-blue))",
};

const GLOW: Record<BarTone, string> = {
  gold: "0 0 10px rgb(255 181 71 / 0.45)",
  amber: "0 0 10px rgb(200 132 31 / 0.4)",
  red: "0 0 10px rgb(181 71 58 / 0.55)",
  pale: "0 0 10px rgb(143 179 217 / 0.4)",
};

export type BarProps = {
  /** 0..1 */
  value: number;
  tone?: BarTone;
  className?: string;
  delay?: number;
  glow?: boolean;
};

/** Thin horizontal meter. Width animates whenever the value changes. */
export function Bar({ value, tone = "gold", className, delay = 0, glow = true }: BarProps) {
  const v = Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
  return (
    <span className={cx("relative block h-[3px] w-full rounded-full bg-white/[0.07]", className)}>
      <motion.span
        className="absolute inset-y-0 left-0 block rounded-full"
        style={{ background: FILL[tone], boxShadow: glow ? GLOW[tone] : undefined }}
        initial={{ width: 0 }}
        animate={{ width: `${v * 100}%` }}
        transition={{ duration: 0.9, ease: EASE, delay }}
      />
    </span>
  );
}

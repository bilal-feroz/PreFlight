"use client";

import { useId } from "react";
import { motion } from "framer-motion";
import type { MarketKey } from "@/lib/result-types";
import { MARKET_NAMES } from "@/lib/labels";
import { cx } from "@/components/ui/cx";

export type MarketToggleProps = {
  value: MarketKey;
  onChange(m: MarketKey): void;
  counts?: Partial<Record<MarketKey, number>>;
};

const ORDER: MarketKey[] = ["global", "arabic", "uae"];

export function MarketToggle({ value, onChange, counts }: MarketToggleProps) {
  const id = useId();
  return (
    <div
      role="group"
      aria-label="Market"
      className="glass inline-flex items-center gap-0.5 rounded-full p-1"
      style={{ backgroundColor: "rgb(8 7 6 / 0.6)" }}
    >
      {ORDER.map((m) => {
        const active = m === value;
        const count = counts?.[m];
        return (
          <button
            key={m}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(m)}
            className={cx(
              "relative rounded-full px-3 py-1.5 text-[12px] font-medium transition-colors duration-300 sm:px-3.5",
              active ? "text-gold" : "text-cluster/55 hover:text-cluster/90",
            )}
          >
            {active && (
              <motion.span
                layoutId={`${id}-pill`}
                aria-hidden
                className="absolute inset-0 rounded-full border border-gold/40 bg-gold/[0.12] shadow-[0_0_18px_-4px_rgb(255_181_71/0.55)]"
                transition={{ type: "spring", stiffness: 380, damping: 32 }}
              />
            )}
            <span className="relative flex items-baseline gap-1.5 whitespace-nowrap">
              {MARKET_NAMES[m]}
              {count !== undefined && (
                <span className={cx("font-mono text-[10px]", active ? "text-gold/75" : "text-cluster/35")}>{count}</span>
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export default MarketToggle;

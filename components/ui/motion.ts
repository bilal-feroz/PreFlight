import type { Variants } from "framer-motion";

export const EASE = [0.22, 1, 0.36, 1] as const;

/** Gentle fade + rise. Use with initial="hidden" animate="show". */
export const rise: Variants = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: { duration: 0.75, ease: EASE } },
};

export const fade: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { duration: 0.8, ease: EASE } },
};

/** Parent variants that stagger children using `rise` / `fade`. */
export function stagger(each = 0.08, delay = 0): Variants {
  return {
    hidden: {},
    show: { transition: { staggerChildren: each, delayChildren: delay } },
  };
}

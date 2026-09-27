"use client";

import { useEffect, useRef, useState } from "react";
import { animate, useReducedMotion } from "framer-motion";
import { EASE } from "./motion";

/** Integer that counts from its previous value to `value`. */
export function CountUp({ value, duration = 0.9, className }: { value: number; duration?: number; className?: string }) {
  const reduce = useReducedMotion();
  const [display, setDisplay] = useState(0);
  const shown = useRef(0);

  useEffect(() => {
    if (reduce) return;
    const controls = animate(shown.current, value, {
      duration,
      ease: EASE,
      onUpdate: (v) => {
        shown.current = v;
        setDisplay(Math.round(v));
      },
    });
    return () => controls.stop();
  }, [value, duration, reduce]);

  return <span className={className}>{reduce ? Math.round(value) : display}</span>;
}

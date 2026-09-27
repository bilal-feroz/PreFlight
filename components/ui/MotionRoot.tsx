"use client";

import type { ReactNode } from "react";
import { MotionConfig } from "framer-motion";

/** Honors the OS reduced-motion setting for every framer-motion animation. */
export function MotionRoot({ children }: { children: ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}

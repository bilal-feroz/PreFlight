"use client";

import { useId } from "react";
import { motion } from "framer-motion";
import { EASE } from "./motion";

export type SparkTone = "gold" | "red" | "pale";

const COLOR: Record<SparkTone, string> = {
  gold: "var(--color-gold)",
  red: "var(--color-crowded-soft)",
  pale: "var(--color-pale-blue)",
};

export type SparklineProps = {
  values: number[];
  width?: number;
  height?: number;
  tone?: SparkTone;
  className?: string;
  label?: string;
};

/** Minimal SVG sparkline: gold stroke, faint area fill, glowing dot on the last point. */
export function Sparkline({ values, width = 112, height = 30, tone = "gold", className, label }: SparklineProps) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  if (values.length === 0) return null;

  const pad = 3;
  const max = Math.max(...values.map((v) => (Number.isFinite(v) ? v : 0)));
  const top = max > 0 ? max : 1;
  const stepX = values.length > 1 ? (width - pad * 2) / (values.length - 1) : 0;
  const pts = values.map((v, i) => {
    const safe = Number.isFinite(v) ? Math.max(0, v) : 0;
    return [pad + i * stepX, height - pad - (safe / top) * (height - pad * 2)] as const;
  });
  const line = pts.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`).join(" ");
  const first = pts[0];
  const last = pts[pts.length - 1];
  const area = `${line} L${last[0].toFixed(2)} ${height} L${first[0].toFixed(2)} ${height} Z`;
  const color = COLOR[tone];
  const gid = `spark-${uid}`;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={className}
      role="img"
      aria-label={label ?? `Weekly counts: ${values.join(", ")}`}
      style={{ overflow: "visible" }}
    >
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" style={{ stopColor: color, stopOpacity: 0.26 }} />
          <stop offset="100%" style={{ stopColor: color, stopOpacity: 0 }} />
        </linearGradient>
      </defs>
      <path d={area} style={{ fill: `url(#${gid})` }} />
      <motion.path
        d={line}
        fill="none"
        style={{ stroke: color }}
        strokeWidth={1.3}
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 1.1, ease: EASE }}
      />
      <circle cx={last[0]} cy={last[1]} r={5} style={{ fill: color }} opacity={0.2} />
      <circle cx={last[0]} cy={last[1]} r={2.2} style={{ fill: color }} />
    </svg>
  );
}

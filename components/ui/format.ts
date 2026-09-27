import type { Dimension } from "@/lib/types";

/** Display order for dimension bars across the UI. */
export const DIM_ORDER: Dimension[] = ["hook", "format", "narrative", "visual", "topic", "product"];

const PLATFORM_NAMES: Record<string, string> = {
  instagram: "Instagram",
  tiktok: "TikTok",
  youtube: "YouTube",
};

export function platformName(platform: string | undefined): string {
  if (!platform) return "source";
  const key = platform.toLowerCase();
  return PLATFORM_NAMES[key] ?? key.charAt(0).toUpperCase() + key.slice(1);
}

export function handle(creator: string): string {
  return `@${creator.replace(/^@/, "")}`;
}

/** 0..1 → integer percent, clamped. */
export function pct(x: number): number {
  if (!Number.isFinite(x)) return 0;
  return Math.round(Math.max(0, Math.min(1, x)) * 100);
}

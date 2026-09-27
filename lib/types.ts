import { z } from "zod";

export const FORMAT_LABELS = [
  "street_interview",
  "grwm",
  "reaction",
  "cinematic_story",
  "tutorial",
  "unboxing",
  "review",
  "blind_test",
  "pov_skit",
  "vlog",
  "other",
] as const;

export const FormatLabelSchema = z.enum(FORMAT_LABELS);
export type FormatLabel = z.infer<typeof FormatLabelSchema>;

export const CreativeDNASchema = z.object({
  topic: z.array(z.string()).min(1),
  hook: z.string(), // what grabs attention in the first 3 seconds
  format: FormatLabelSchema,
  narrativeArc: z.array(z.string()), // e.g. ["intrigue", "question", "reveal"]
  visualMotifs: z.array(z.string()),
  productInteraction: z.string(),
  tone: z.array(z.string()),
  locationContext: z.array(z.string()),
  cta: z.string().nullable(),
});
export type CreativeDNA = z.infer<typeof CreativeDNASchema>;

export type TranscriptChunk = { start: number; end: number; text: string };
export type Frame = { t: number; score?: number; url: string };

export type Video = {
  id: string;
  url: string;
  platform: string;
  creator: string;
  creatorName?: string;
  followers?: number;
  thumbnailUrl?: string;
  publishedAt?: string;
  views?: number;
  likes?: number;
  comments?: number;
  shares?: number;
  saves?: number; // not provided by Oriane: always undefined
  transcript?: string;
  caption?: string;
  hashtags?: string[];
  visualLabels?: string[]; // not provided by Oriane: always undefined
  language?: string;
  captionLanguage?: string;
  transcriptLanguage?: string;
  locationHints?: string[];
  durationSec?: number;
  transcriptChunks?: TranscriptChunk[];
  frames?: Frame[];
  raw: unknown;
};

export const DIMENSIONS = ["hook", "narrative", "visual", "format", "topic", "product"] as const;
export type Dimension = (typeof DIMENSIONS)[number];

export type Match = {
  videoId: string;
  dims: Record<Dimension, number>; // 0..1
  overall: number; // computed in code, never by the LLM
  shared: string[];
  different: string[];
  evidence: { transcriptSnippet?: string; timestampSec?: number; visualTags?: string[] };
};

export type Concept = { brief: string; dna: CreativeDNA };

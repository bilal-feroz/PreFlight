import { z } from "zod";
import { FORMAT_LABELS, FormatLabelSchema, type CreativeDNA, type FormatLabel } from "./types";

// ------------------------------------------------------------------ tolerant output schemas

const SYNONYMS: [RegExp, FormatLabel][] = [
  [/street|interview|vox|asks? (people|strangers)/, "street_interview"],
  [/grwm|get ready/, "grwm"],
  [/blind|guess/, "blind_test"],
  [/react/, "reaction"],
  [/unbox|haul/, "unboxing"],
  [/tutorial|how.?to|guide|routine|layering/, "tutorial"],
  [/review|rating|rank|recommend/, "review"],
  [/pov|skit|comedy|sketch|meme/, "pov_skit"],
  [/vlog|day in|diary/, "vlog"],
  [/cinematic|story|film|commercial|\bad\b|campaign/, "cinematic_story"],
];

export function normalizeFormat(v: unknown): FormatLabel {
  const s = String(v ?? "").toLowerCase().trim().replace(/[\s-]+/g, "_");
  if ((FORMAT_LABELS as readonly string[]).includes(s)) return s as FormatLabel;
  const plain = s.replace(/_/g, " ");
  for (const [re, label] of SYNONYMS) if (re.test(plain)) return label;
  return "other";
}

const LlmFormat = z.preprocess(normalizeFormat, FormatLabelSchema);
const str = (max = 200) => z.preprocess((v) => (v == null ? "" : String(v)), z.string()).transform((s) => s.trim().slice(0, max));
const strList = (maxItems = 6) =>
  z
    .preprocess((v) => (Array.isArray(v) ? v : typeof v === "string" && v ? [v] : []), z.array(z.unknown()))
    .transform((a) =>
      a
        .map((x) => String(x ?? "").trim())
        .filter(Boolean)
        .slice(0, maxItems),
    );
/** Grade letters the judge returns; code maps them onto the similarity scale. */
export const GRADE_VALUE: Record<string, number> = { A: 0.95, B: 0.78, C: 0.6, D: 0.35, E: 0.05 };

const unit = z.preprocess((v) => {
  if (typeof v === "string" && /^[A-E]$/i.test(v.trim())) return GRADE_VALUE[v.trim().toUpperCase()];
  const n = typeof v === "string" ? Number(v) : v;
  if (typeof n !== "number" || !Number.isFinite(n)) return 0.3;
  const x = n > 1 ? n / (n > 10 ? 100 : 10) : n; // tolerate 0-10 or 0-100 scales
  return Math.min(1, Math.max(0, x));
}, z.number());

export const LlmDNASchema = z.object({
  topic: strList(4),
  hook: str(140),
  format: LlmFormat,
  narrativeArc: strList(6),
  visualMotifs: strList(6),
  productInteraction: str(120),
  tone: strList(4),
  locationContext: strList(4),
  cta: z.preprocess(
    (v) => (typeof v === "string" && v.trim() && !/^(none|null|n\/?a|no)$/i.test(v.trim()) ? v.trim() : null),
    z.string().nullable(),
  ),
});

export function toCreativeDNA(d: z.infer<typeof LlmDNASchema>): CreativeDNA {
  return {
    topic: d.topic.length ? d.topic : ["unspecified"],
    hook: d.hook,
    format: d.format,
    narrativeArc: d.narrativeArc,
    visualMotifs: d.visualMotifs,
    productInteraction: d.productInteraction,
    tone: d.tone,
    locationContext: d.locationContext,
    cta: d.cta,
  };
}

const ProbeSchema = z.object({
  mode: z.preprocess((v) => (/spoken|say|speech|audio|transcript/i.test(String(v)) ? "spoken" : "visual"), z.enum(["visual", "spoken"])),
  text: str(180),
});

export const ConceptExtractionSchema = z.object({
  dna: LlmDNASchema,
  probes: z.array(ProbeSchema).min(3).transform((a) => a.filter((p) => p.text.length > 3).slice(0, 8)),
  arabicProbes: strList(3),
  uaeProbes: strList(3),
  topicKeywords: strList(10),
});
export type ConceptExtraction = z.infer<typeof ConceptExtractionSchema>;

export const RerouteSchema = ConceptExtractionSchema.extend({
  brief: str(700),
  changes: strList(3),
});
export type RerouteExtraction = z.infer<typeof RerouteSchema>;

export const VideoDnaBatchSchema = z.object({
  videos: z.array(
    z.object({
      i: z.coerce.number(),
      format: LlmFormat,
      hook: str(120),
      arc: strList(5),
      motifs: strList(5),
      product: str(100),
      topic: strList(3),
      tone: strList(3),
      location: strList(3),
    }),
  ),
});

export const CompareBatchSchema = z.object({
  r: z.array(
    z.object({
      i: z.coerce.number(),
      hook: unit,
      narrative: unit,
      visual: unit,
      format: unit,
      topic: unit,
      product: unit,
      same: strList(3),
      diff: strList(2),
    }),
  ),
});

// ------------------------------------------------------------------ prompts

const JSON_ONLY = "Reply with one JSON object only. No prose, no markdown.";

const FORMAT_GUIDE =
  "street_interview (a person asks others a question on camera: strangers, passers-by, guests, a stranger stopping someone; the Q&A exchange is the content, staged or real) | grwm (get ready with me) | reaction | cinematic_story (scripted, ad-like or filmic story without a Q&A) | tutorial (how-to, routine) | unboxing (incl. hauls) | review (ONE creator talking to camera about, rating or recommending products) | blind_test (guessing or testing without knowing what it is) | pov_skit (POV, skit, comedy) | vlog | other";

const DNA_SHAPE = `{
   "topic": [2-4 short topic terms, e.g. "oud perfume"],
   "hook": "the concrete opening action in the first 3 seconds, who does or says what (max 16 words), e.g. 'a stranger stops the creator to ask what perfume they are wearing'",
   "format": one of ${FORMAT_LABELS.join(" | ")},
   "narrativeArc": [2-5 story beats, 1-3 words each, e.g. "intrigue", "question", "reveal"],
   "visualMotifs": [3-6 concrete on-screen elements, e.g. "city lights at night"],
   "productInteraction": "how the product appears or is used (max 12 words)",
   "tone": [2-4 adjectives],
   "locationContext": [places or settings, may be empty],
   "cta": "the call to action" or null
 }`;

const PROBE_SHAPE = `"probes": [6-8 items {"mode": "visual" | "spoken", "text": "..."}: at least 3 "visual" = one plain sentence describing what is SEEN on screen in videos like this (no brand names), at least 3 "spoken" = a SHORT phrase (3-6 words) that people commonly and literally SAY out loud in videos like this, e.g. "what perfume are you wearing", "you smell amazing"; never slogans, taglines or calls to action],
 "arabicProbes": [2 short phrases in Arabic (Gulf dialect) that people would say in videos like this],
 "uaeProbes": [2 one-sentence visual descriptions of this kind of video set in Dubai or Abu Dhabi],
 "topicKeywords": [4-8 single keywords for the product category, in English AND Arabic, e.g. "perfume", "fragrance", "oud", "عطر", "عود"]`;

export function conceptPrompt(brief: string) {
  return {
    system: `You are the Creative DNA extractor inside Preflight, a tool that checks campaign ideas against real Instagram and TikTok videos. You turn a campaign brief into structured Creative DNA and search probes. Be literal and specific. Never invent facts that are not in the brief. ${JSON_ONLY}`,
    user: `Campaign brief:
"""${brief.trim()}"""

Formats: ${FORMAT_GUIDE}

Return JSON with exactly these keys:
{
 "dna": ${DNA_SHAPE},
 ${PROBE_SHAPE}
}
Probes must describe the idea broadly enough to find similar videos by OTHER brands and creators.`,
  };
}

export type VideoForPrompt = {
  platform: string;
  durationSec?: number;
  language?: string;
  caption?: string;
  hashtags?: string[];
  opening?: string;
  transcript?: string;
};

const clip = (s: string | undefined, n: number) => (s ? s.replace(/\s+/g, " ").trim().slice(0, n) : "");

export function videoDnaPrompt(videos: VideoForPrompt[]) {
  const list = videos
    .map((v, k) => {
      const lines = [
        `[${k + 1}] ${v.platform}${v.durationSec ? ` · ${Math.round(v.durationSec)}s` : ""}${v.language ? ` · ${v.language}` : ""}`,
        v.caption ? `caption: ${clip(v.caption, 170)}` : "",
        v.hashtags?.length ? `hashtags: ${v.hashtags.slice(0, 6).map((h) => `#${h.replace(/^#/, "")}`).join(" ")}` : "",
        v.opening ? `opening (0-3s): "${clip(v.opening, 90)}"` : "",
        v.transcript ? `transcript: "${clip(v.transcript, 260)}"` : "transcript: none",
      ];
      return lines.filter(Boolean).join("\n");
    })
    .join("\n");
  return {
    system: `You label short social videos for Preflight. From each video's caption, hashtags and transcript you extract its Creative DNA. Use only evidence in the text; when unknown use "" or []. Never invent brands. ${JSON_ONLY}`,
    user: `Formats: ${FORMAT_GUIDE}

Videos:
${list}

Rule: if a video opens with one person asking another a question ("What perfume are you wearing?", "Do you have a favorite fragrance?", "What's your favourite scent?") and the other person answers, its format is street_interview, NOT review, even if products are named.

Return {"videos": [{"i": 1, "format": "...", "hook": "what grabs attention in the first 3 seconds, max 12 words", "arc": [2-4 story beats], "motifs": [2-4 likely on-screen elements], "product": "how a product appears, max 10 words, or empty", "topic": [1-3 terms], "tone": [1-2 adjectives], "location": [places mentioned]}]} with exactly one entry per video, in order, i = the number in brackets.`,
  };
}

export type DnaLite = {
  /** short real evidence: opening words + caption */
  evidence?: string;
  format: FormatLabel;
  hook: string;
  narrativeArc: string[];
  visualMotifs: string[];
  productInteraction: string;
  topic: string[];
  locationContext: string[];
};

function dnaLine(d: DnaLite) {
  return [
    `format: ${d.format}`,
    `hook: ${clip(d.hook, 90) || "?"}`,
    `arc: ${d.narrativeArc.join(" > ") || "?"}`,
    `visual: ${d.visualMotifs.join("; ") || "?"}`,
    `product: ${clip(d.productInteraction, 70) || "?"}`,
    `topic: ${d.topic.join(", ") || "?"}`,
    d.locationContext.length ? `place: ${d.locationContext.join(", ")}` : "",
    d.evidence ? `says/shows: "${clip(d.evidence, 150)}"` : "",
  ]
    .filter(Boolean)
    .join(" | ");
}

export function comparePrompt(concept: CreativeDNA, videos: DnaLite[], brief?: string) {
  const list = videos.map((d, k) => `[${k + 1}] ${dnaLine(d)}`).join("\n");
  return {
    system: `You compare a campaign idea with real social videos for Preflight. Rate similarity per dimension, honestly and consistently: the same video must always get the same scores. ${JSON_ONLY}`,
    user: `${brief ? `Campaign idea: """${brief.trim()}"""

` : ""}Its Creative DNA:
hook: ${concept.hook}
format: ${concept.format}
narrative: ${concept.narrativeArc.join(" > ")}
visual: ${concept.visualMotifs.join("; ")}
product: ${concept.productInteraction}
topic: ${concept.topic.join(", ")}
place: ${concept.locationContext.join(", ") || "any"}

Grade how close each real video is to the campaign idea on 6 dimensions. Judge the generic creative move, not exact wording, brand, product name or city.
Grades: A = same move (could stand in for the idea on this dimension) · B = close (same move, noticeably different execution) · C = related (same family, different move) · D = loose (only a faint link) · E = different.
- hook: the opening move. Two creators each presenting a fragrance to camera and giving a verdict = A or B. A person asking another about their scent vs a stranger asking what perfume you wear = A or B.
- narrative: the story beats (e.g. ranking countdown → #1 reveal; question → answer → reveal). Same beats = A/B.
- visual: the look and setting (to-camera selfie, bottle close-ups, street at night, studio, car...).
- format: review, street_interview, grwm, skit... Same format = A even if the topic differs.
- topic: same product category = A/B (any perfume/fragrance video vs a perfume idea is at least B).
- product: how the product is shown or used (spray test, bottle close-up, reveal at the end...).
Most videos here were retrieved because they are related, so E should be rare. Base grades on what the video says/shows, not only on its labels.

Videos:
${list}

Return {"r": [{"i": 1, "hook": "A-E", "narrative": "A-E", "visual": "A-E", "format": "A-E", "topic": "A-E", "product": "A-E", "same": [up to 3 shared elements, 2-5 words each], "diff": [up to 2 differences, 2-6 words each]}]} with exactly one entry per video, in order.`,
  };
}

export type RerouteInput = {
  brief: string;
  dna: CreativeDNA;
  saturated: string[];
  open: string[];
  territory: { kind: "REFORMAT" | "LOCALIZE"; name: string; why: string; instruction: string; examples: string[] };
};

export function reroutePrompt(input: RerouteInput) {
  return {
    system: `You are the Reroute writer inside Preflight. You rewrite a campaign idea so it moves away from what is already crowded in real social video, under hard constraints. You never promise performance. ${JSON_ONLY}`,
    user: `Original brief:
"""${input.brief.trim()}"""

Original Creative DNA:
${JSON.stringify(input.dna)}

Most saturated in the analyzed sample (move AWAY from these): ${input.saturated.join(", ")}
Least saturated (safe to keep): ${input.open.join(", ")}
Chosen territory: ${input.territory.kind} → ${input.territory.name}. ${input.territory.why}
Real videos in that territory open with: ${input.territory.examples.map((e) => `"${clip(e, 90)}"`).join("; ") || "n/a"}

Hard constraints:
1. Keep the brand objective, the brand and the product exactly.
2. Change the saturated dimensions listed above.
3. ${input.territory.instruction}
4. The new brief is 2-3 concrete, filmable sentences in the same voice as the original.

Formats: ${FORMAT_GUIDE}

Return JSON:
{
 "brief": "the rewritten brief",
 "dna": ${DNA_SHAPE},
 ${PROBE_SHAPE},
 "changes": [up to 3 lines like "Opening: stranger asks about scent → blindfolded guess"]
}`,
  };
}

/**
 * Phase 0: Oriane discovery. Runs 3 real searches and saves the raw responses
 * to data/cache/probe/ (gitignored), then prints which fields actually come back.
 *
 *   npm run probe
 */
import "./env";
import { promises as fs } from "node:fs";
import path from "node:path";
import { CACHE_ROOT } from "../lib/cache";
import { featureCoverage } from "../lib/features";
import {
  createBudget,
  normalizeVideo,
  searchContents,
  searchVisual,
  type SearchResponse,
} from "../lib/oriane";

const budget = createBudget(8);

const PROBES: { slug: string; label: string; run: () => Promise<{ response: SearchResponse; hit: boolean }> }[] = [
  {
    slug: "stranger-asks-perfume",
    label: "someone asks a stranger what perfume they're wearing (AI Vision)",
    run: () => searchVisual("someone asks a stranger what perfume they're wearing", {}, { limit: 50 }, budget),
  },
  {
    slug: "oud-perfume-review",
    label: "oud perfume review (spoken words OR caption)",
    run: () =>
      searchContents(
        {
          operator: "or",
          filters: {
            transcript: { includesFuzzy: { values: ["oud perfume review"] } },
            caption: { includesFuzzy: { values: ["oud perfume review"] } },
          },
        },
        { sort: "transcriptRelevance", limit: 50 },
        budget,
      ),
  },
  {
    slug: "arabic-oud",
    label: "عطر عود (spoken words OR caption OR hashtags)",
    run: () =>
      searchContents(
        {
          operator: "or",
          filters: {
            transcript: { includesFuzzy: { values: ["عطر عود"] } },
            caption: { includesFuzzy: { values: ["عطر عود"] } },
            hashtags: { includesFuzzy: { values: ["عطر", "عود"] } },
          },
        },
        { sort: "transcriptRelevance", limit: 50 },
        budget,
      ),
  },
];

const pct = (x: number) => `${Math.round(x * 100)}%`;

function tally(values: (string | undefined)[]) {
  const counts = new Map<string, number>();
  for (const v of values) counts.set(v ?? "∅", (counts.get(v ?? "∅") ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, c]) => `${k}:${c}`).join(" ");
}

async function main() {
  const outDir = path.join(CACHE_ROOT, "probe");
  await fs.mkdir(outDir, { recursive: true });

  for (const probe of PROBES) {
    const { response, hit } = await probe.run();
    await fs.writeFile(path.join(outDir, `${probe.slug}.json`), JSON.stringify(response, null, 2));
    const videos = response.data.results.map(normalizeVideo);
    const cov = featureCoverage(videos);
    const dates = videos.map((v) => v.publishedAt).filter(Boolean).sort() as string[];
    const weeksAgo = (d: string) => Math.round((Date.now() - Date.parse(d)) / (7 * 864e5));
    const in12w = dates.filter((d) => weeksAgo(d) <= 12).length;

    console.log(`\n=== ${probe.label}${hit ? "  [cache]" : ""}`);
    console.log(`total matching in index: ${response.metadata.pagination?.totalCount ?? "n/a"} · returned: ${videos.length}`);
    console.log(
      `coverage  dates ${pct(cov.hasDates)} · language ${pct(cov.hasLanguage)} · location ${pct(cov.hasLocation)} · thumbs ${pct(cov.hasThumbnails)} · transcript ${pct(cov.hasTranscript)} · followers ${pct(cov.hasFollowers)} · visualLabels ${pct(cov.hasVisualLabels)}`,
    );
    console.log(`dates     ${dates[0] ?? "-"} → ${dates.at(-1) ?? "-"} · within 12 weeks: ${in12w}/${dates.length}`);
    console.log(`language  ${tally(videos.map((v) => v.language))}`);
    console.log(`platform  ${tally(videos.map((v) => v.platform))}`);
    console.log(`frames w/ score: ${videos.filter((v) => v.frames?.some((f) => f.score !== undefined)).length} · chunks: ${videos.filter((v) => v.transcriptChunks?.length).length}`);
    console.log(`locations ${videos.flatMap((v) => v.locationHints ?? []).slice(0, 5).join(" | ") || "none"}`);
    for (const v of videos.slice(0, 6)) {
      console.log(
        `  · @${v.creator} ${v.platform} ${v.views ?? "?"} views ${v.publishedAt?.slice(0, 10) ?? ""} [${v.language ?? "?"}] ${(v.transcript ?? v.caption ?? "").replace(/\s+/g, " ").slice(0, 110)}`,
      );
    }
  }
  console.log(`\nbudget: ${budget.calls} uncached calls, ${budget.results} results, ${budget.cacheHits} cache hits`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

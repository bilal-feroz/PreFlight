/**
 * Run the full pipeline from the terminal (also warms the demo cache).
 *
 *   npm run preflight -- "your brief"            # default: the demo brief
 *   npm run preflight -- --reroute               # also reroute into the hero territory
 */
import "./env";
import { DEMO_BRIEF } from "../lib/demo";
import { runPreflight, runReroute } from "../lib/pipeline";
import type { ProgressEvent } from "../lib/result-types";

const args = process.argv.slice(2);
const reroute = args.includes("--reroute");
const brief = args.filter((a) => !a.startsWith("--")).join(" ") || DEMO_BRIEF;

const t0 = Date.now();
const log = (e: ProgressEvent) => {
  const s = ((Date.now() - t0) / 1000).toFixed(1).padStart(6);
  if (e.type === "stage") console.log(`${s}s  ▸ ${e.label}${e.detail ? ` (${e.detail})` : ""}`);
  else if (e.type === "progress") console.log(`${s}s    ${e.stage} ${e.done}/${e.total}${e.detail ? ` ${e.detail}` : ""}`);
  else if (e.type === "dna") console.log(`${s}s    DNA ${JSON.stringify(e.dna)}`);
};

async function main() {
  const r = await runPreflight(brief, log);
  const p = r.position;
  console.log(`\nrun ${r.runId} · sample ${r.sample.n} videos · ${r.sample.probes} probes · ${JSON.stringify(r.sample.platforms)} · ${r.sample.dateRange?.join(" → ")}`);
  for (const m of ["global", "arabic", "uae"] as const) {
    const x = p[m];
    console.log(
      `${m.padEnd(7)} n=${String(x.n).padEnd(4)} rel=${String(x.relevant).padEnd(4)} crowding ${x.crowding.score} ${x.crowding.label} (exact ${x.crowding.exact}, close ${x.crowding.close}, medium ${x.crowding.medium}) · ${x.lifecycle.stage} growth=${x.lifecycle.supplyGrowth?.toFixed(2)} attn=${x.lifecycle.attentionRatio?.toFixed(2)} weekly=[${x.lifecycle.weekly.join(",")}] · ${x.confidence.level}${x.lowData ? " · LOW DATA" : ""}`,
    );
    console.log(`        sat ${Object.entries(x.saturation).map(([k, v]) => `${k} ${Math.round(v * 100)}%`).join(" · ")} · "${x.insight}"`);
  }
  console.log(`market: ${p.marketLine}`);
  console.log(`why: ${p.global.lifecycle.why}`);
  console.log(`\ncollisions:`);
  for (const c of r.collisions) {
    const v = r.videos[c.id];
    console.log(`  ${c.overall.toFixed(2)} @${v.creator} ${v.platform} ${v.views} views ${v.publishedAt?.slice(0, 10)} [${v.format}] ${v.url}`);
    console.log(`       shared: ${c.shared.join(" | ")} · "${v.snippet?.slice(0, 100)}" @${v.snippetT}s`);
  }
  console.log(`\nclusters: ${r.airspace.clusters.map((c) => `${c.label}:${c.supply}(${c.response ?? "-"})`).join(" ")}`);
  console.log(`territories:`);
  for (const t of r.territories) console.log(`  ${t.hero ? "★" : " "} ${t.kind} ${t.name} — ${t.statsLine}\n      ${t.why}\n      keeps: ${t.keeps}`);

  if (reroute && r.territories[0]) {
    console.log(`\n── reroute → ${r.territories[0].name}`);
    const rr = await runReroute(r.runId, r.territories[0].id, log);
    console.log(`brief: ${rr.brief}\nchanges: ${rr.changes.join(" | ")}`);
    for (const m of ["global", "arabic", "uae"] as const) {
      console.log(
        `${m.padEnd(7)} before ${rr.before[m].crowding.score} ${rr.before[m].lifecycle.stage} → after ${rr.after[m].crowding.score} ${rr.after[m].lifecycle.stage} (n=${rr.after[m].n})`,
      );
    }
    console.log(`star ${JSON.stringify(rr.airspace.star)} → ${JSON.stringify(rr.airspace.starAfter)} · nodes ${rr.airspace.nodes.length}`);
  }
  console.log(`\ndone in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

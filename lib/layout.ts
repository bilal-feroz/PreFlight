import { createHash } from "node:crypto";
import type { Airspace, GalaxyCluster, GalaxyNode, Vec3 } from "./result-types";
import type { FormatLabel } from "./types";

/**
 * Deterministic Creative Airspace layout.
 * - One cluster per format, centers on a wide golden-angle spiral (XZ plane).
 * - The star sits in the cluster where its closest matches concentrate.
 * - Each video starts at a stable spot inside its cluster and is pulled toward the
 *   star by its similarity: distance to the star shrinks roughly with (1 − similarity).
 * Positions never depend on randomness, so repeat runs render identically, and a
 * reroute keeps existing nodes in place while the star moves.
 */

export type LayoutInput = { id: string; format: FormatLabel; sim: number; supplyResponse?: number | null };

function h01(s: string, salt = ""): number {
  return createHash("md5").update(s + salt).digest().readUInt32LE(0) / 0xffffffff;
}

const GOLDEN = Math.PI * (3 - Math.sqrt(5));

export function clusterCenters(labels: FormatLabel[], startIndex = 0): Map<FormatLabel, Vec3> {
  const out = new Map<FormatLabel, Vec3>();
  labels.forEach((label, k) => {
    const i = startIndex + k;
    const r = 2.6 + 2.35 * Math.sqrt(i + 0.35) * 1.45;
    const a = i * GOLDEN + 0.6;
    const y = (h01(label, "y") - 0.5) * 2.2;
    out.set(label, [Math.cos(a) * r, y, Math.sin(a) * r]);
  });
  return out;
}

/** The star's home is the cluster holding its closest matches: mean of the top 5 similarities (clusters with >= 3 videos). */
function starIn(centers: Map<FormatLabel, Vec3>, nodes: { format: FormatLabel; sim: number }[], ownFormat?: FormatLabel): Vec3 {
  // the idea sits in its own format's cluster when that cluster exists
  if (ownFormat && ownFormat !== "other" && centers.has(ownFormat)) {
    const c = centers.get(ownFormat)!;
    return [c[0] * 0.92, c[1] + 0.55, c[2] * 0.92];
  }
  const byCluster = new Map<FormatLabel, number[]>();
  for (const n of nodes) byCluster.set(n.format, [...(byCluster.get(n.format) ?? []), n.sim]);
  let home: FormatLabel | undefined;
  let best = -1;
  for (const [label, sims] of byCluster) {
    if (!centers.has(label) || sims.length < 3) continue;
    const top = [...sims].sort((a, b) => b - a).slice(0, 5);
    const score = top.reduce((a, b) => a + b, 0) / top.length;
    if (score > best) [home, best] = [label, score];
  }
  const c = (home && centers.get(home)) ?? [0, 0, 0];
  return [c[0] * 0.92, c[1] + 0.55, c[2] * 0.92];
}

function placeNode(id: string, center: Vec3, spread: number, star: Vec3, sim: number): Vec3 {
  // stable point in a flattened ball around the cluster center
  const u = h01(id, "u");
  const v = h01(id, "v");
  const w = h01(id, "w");
  const theta = u * Math.PI * 2;
  const rad = spread * Math.sqrt(v);
  const base: Vec3 = [center[0] + Math.cos(theta) * rad, center[1] + (w - 0.5) * spread * 0.55, center[2] + Math.sin(theta) * rad];
  const pull = Math.min(0.86, Math.max(0, (sim - 0.3) / 0.62));
  const p: Vec3 = [
    base[0] + (star[0] - base[0]) * pull,
    base[1] + (star[1] - base[1]) * pull,
    base[2] + (star[2] - base[2]) * pull,
  ];
  // keep a minimum gap around the star so close matches ring it instead of stacking
  const dx = p[0] - star[0];
  const dy = p[1] - star[1];
  const dz = p[2] - star[2];
  const d = Math.hypot(dx, dy, dz);
  const minD = 0.55 + (1 - sim) * 1.6;
  if (d < minD) {
    const k = d > 1e-6 ? minD / d : 1;
    const jitter: Vec3 = d > 1e-6 ? [dx, dy, dz] : [Math.cos(theta), (w - 0.5) * 0.6, Math.sin(theta)];
    return [star[0] + jitter[0] * k, star[1] + jitter[1] * k * 0.6, star[2] + jitter[2] * k];
  }
  return p;
}

export function layoutAirspace(
  items: LayoutInput[],
  clusterStats: Map<FormatLabel, { supply: number; response: number | null }>,
  crowded: boolean,
  ownFormat?: FormatLabel,
): Airspace {
  const labels = [...clusterStats.keys()].sort(
    (a, b) => (clusterStats.get(b)!.supply - clusterStats.get(a)!.supply) || a.localeCompare(b),
  );
  const centers = clusterCenters(labels);
  const star = starIn(centers, items, ownFormat);
  const nodes: GalaxyNode[] = items.map((it) => {
    const c = centers.get(it.format) ?? [0, 0, 0];
    const supply = clusterStats.get(it.format)?.supply ?? 1;
    const spread = Math.min(3.2, Math.max(0.9, Math.sqrt(supply) * 0.36));
    return { id: it.id, cluster: it.format, sim: round(it.sim), p: roundV(placeNode(it.id, c, spread, star, it.sim)) };
  });
  const clusters: GalaxyCluster[] = labels.map((label) => ({
    label,
    center: roundV(centers.get(label)!),
    supply: clusterStats.get(label)!.supply,
    response: clusterStats.get(label)!.response,
  }));
  return { nodes, clusters, star: roundV(star), crowded, crowdRadius: 2.4 };
}

/**
 * Reroute: keep every existing node where it is, append clusters for new formats,
 * place new videos relative to the new star, and compute where the star goes.
 */
export function extendAirspace(
  base: Airspace,
  newItems: LayoutInput[],
  allAfter: { id: string; format: FormatLabel; simAfter: number }[],
  clusterStats: Map<FormatLabel, { supply: number; response: number | null }>,
  crowdedAfter: boolean,
  afterFormat?: FormatLabel,
): Airspace {
  const centers = new Map(base.clusters.map((c) => [c.label, c.center] as [FormatLabel, Vec3]));
  const missing = [...new Set(newItems.map((n) => n.format))].filter((l) => !centers.has(l));
  for (const [l, c] of clusterCenters(missing, centers.size)) centers.set(l, c);
  const starAfter = starIn(centers, allAfter.map((a) => ({ format: a.format, sim: a.simAfter })), afterFormat);
  const afterById = new Map(allAfter.map((a) => [a.id, a.simAfter]));
  const nodes: GalaxyNode[] = [
    ...base.nodes.map((n) => ({ ...n, simAfter: round(afterById.get(n.id) ?? 0) })),
    ...newItems.map((it) => {
      const c = centers.get(it.format)!;
      const supply = clusterStats.get(it.format)?.supply ?? 1;
      const spread = Math.min(3.2, Math.max(0.9, Math.sqrt(supply) * 0.36));
      const simAfter = afterById.get(it.id) ?? 0;
      return {
        id: it.id,
        cluster: it.format,
        sim: round(it.sim),
        simAfter: round(simAfter),
        isNew: true,
        p: roundV(placeNode(it.id, c, spread, base.star, it.sim)),
      };
    }),
  ];
  const clusters: GalaxyCluster[] = [...centers].map(([label, center]) => ({
    label,
    center: roundV(center),
    supply: clusterStats.get(label)?.supply ?? 0,
    response: clusterStats.get(label)?.response ?? null,
  }));
  return { nodes, clusters, star: base.star, starAfter: roundV(starAfter), crowded: crowdedAfter, crowdRadius: base.crowdRadius };
}

const round = (x: number) => Math.round(x * 1000) / 1000;
const roundV = (v: Vec3): Vec3 => [round(v[0]), round(v[1]), round(v[2])];

import * as THREE from "three";
import type { Airspace as AirspaceData, MarketKey, VideoCard } from "@/lib/result-types";
import type { FormatLabel } from "@/lib/types";

/** Phone-screen size in world units (9:16) plus the glow padding around it. */
export const NODE_W = 0.32;
export const NODE_H = 0.57;
export const NODE_PAD = 0.11;
export const NODE_RADIUS = 0.04;
/** Instance capacity: 300 live nodes plus room for nodes fading out after a pool swap. */
export const NODE_CAPACITY = 640;
/** Opacity of nodes outside the selected market. */
export const FADED_OPACITY = 0.06;

export type NodeRec = {
  id: string;
  cluster: FormatLabel;
  /** animated world position */
  pos: THREE.Vector3;
  /** target world position (from the latest airspace) */
  to: THREE.Vector3;
  sim: number;
  simAfter: number;
  simCur: number;
  opacity: number;
  highlight: number;
  tone: number;
  /** 0..1 how deep inside the crowd around the original star this node sits (0 when not crowded) */
  crowd: number;
  /** same, around starAfter (only when the rerouted spot is itself crowded) */
  crowdAfter: number;
  /** entrance scale factor 0..1 */
  pop: number;
  /** short-lived flash when a node appears or an evidence filament reaches it */
  ping: number;
  phase: number;
  rand: number;
  /** seconds (scene clock) at which the node starts fading in */
  appearAt: number;
  /** delay to convert into appearAt on the next frame (set by sync) */
  pendingDelay: number | null;
  alive: boolean;
  isNew: boolean;
  /** final scale written this frame (used by picking) */
  drawScale: number;
};

export type PointerState = {
  x: number;
  y: number;
  inside: boolean;
  down: boolean;
  downX: number;
  downY: number;
  dragging: boolean;
};

export type LabelAnchor = { pos: THREE.Vector3 };

/** Mutable scene state shared by the star, nodes, filaments and the DOM overlay. */
export type Runtime = {
  star: THREE.Vector3;
  starVisible: boolean;
  flying: boolean;
  flight: { t: number };
  /** where the star rests (or is flying to) */
  at: THREE.Vector3;
  /** where the star should be (starAfter ?? star) */
  dest: THREE.Vector3;
  destIsAfter: boolean;
  /** 0 = dulled red-amber, 1 = bright gold */
  warm: number;
  flash: number;
  pulse: number;
  crowdReveal: number;
  /** the original star's spot is crowded (kept from the pre-reroute airspace) */
  crowded: boolean;
  /** the rerouted spot is crowded too */
  crowdedAfter: boolean;
  rerouted: boolean;
  introDone: boolean;
  synced: boolean;

  pointer: PointerState;
  hoveredId: string | null;

  list: NodeRec[];
  byId: Map<string, NodeRec>;
  /** evidence nodes a filament has reached (id -> 1) */
  evidenceLit: Map<string, number>;
  labels: LabelAnchor[];
  labelsShown: boolean;
};

export function createRuntime(): Runtime {
  return {
    star: new THREE.Vector3(0, 0, 0),
    starVisible: false,
    flying: false,
    flight: { t: 0 },
    at: new THREE.Vector3(0, 0, 0),
    dest: new THREE.Vector3(0, 0, 0),
    destIsAfter: false,
    warm: 1,
    flash: 0,
    pulse: 0.4,
    crowdReveal: 0,
    crowded: false,
    crowdedAfter: false,
    rerouted: false,
    introDone: false,
    synced: false,
    pointer: { x: 0, y: 0, inside: false, down: false, downX: 0, downY: 0, dragging: false },
    hoveredId: null,
    list: [],
    byId: new Map(),
    evidenceLit: new Map(),
    labels: [],
    labelsShown: false,
  };
}

/** Latest React props, read inside the render loop. */
export type LatestProps = {
  airspace: AirspaceData;
  videos: Record<string, VideoCard>;
  market: MarketKey;
  highlightId: string | null;
  evidenceIds: string[];
};

export type Fit = { center: THREE.Vector3; radius: number };

/** FNV-1a hash of a string mapped to [0, 1). */
export function hash01(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) / 4294967296;
}

export function smoothstep(e0: number, e1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

/** Center and radius of the layout in the XZ plane (robust to a few outliers). */
export function computeFit(airspace: AirspaceData): Fit {
  const nodes = airspace.nodes;
  if (nodes.length === 0) {
    const [x, y, z] = airspace.star;
    return { center: new THREE.Vector3(x, y, z), radius: 8 };
  }
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  let sumY = 0;
  for (const n of nodes) {
    minX = Math.min(minX, n.p[0]);
    maxX = Math.max(maxX, n.p[0]);
    minZ = Math.min(minZ, n.p[2]);
    maxZ = Math.max(maxZ, n.p[2]);
    sumY += n.p[1];
  }
  const cx = (minX + maxX) / 2;
  const cz = (minZ + maxZ) / 2;
  const cy = sumY / nodes.length;
  const d = nodes.map((n) => Math.hypot(n.p[0] - cx, n.p[2] - cz)).sort((a, b) => a - b);
  const r95 = d[Math.min(d.length - 1, Math.floor(d.length * 0.95))];
  return { center: new THREE.Vector3(cx, cy, cz), radius: Math.max(4, r95 + 0.9) };
}

/** Label anchor per cluster, placed above the cluster's spread. Order matches airspace.clusters. */
export function computeLabelAnchors(airspace: AirspaceData): LabelAnchor[] {
  return airspace.clusters.map((cl) => {
    const [cx, cy, cz] = cl.center;
    let maxY = cy;
    const dists: number[] = [];
    for (const n of airspace.nodes) {
      if (n.cluster !== cl.label) continue;
      const dd = Math.hypot(n.p[0] - cx, n.p[2] - cz);
      if (dd > 4) continue;
      dists.push(dd);
      maxY = Math.max(maxY, n.p[1]);
    }
    dists.sort((a, b) => a - b);
    const spread = dists.length ? dists[Math.floor(dists.length * 0.8)] : 0.8;
    const y = Math.min(maxY, cy + 2) + 0.55 + spread * 0.55;
    return { pos: new THREE.Vector3(cx, y, cz) };
  });
}

/** Merge a (possibly new) airspace into the node records, keeping identity by video id. */
export function syncAirspace(rt: Runtime, airspace: AirspaceData): void {
  const first = !rt.synced;
  const seen = new Set<string>();
  const [sx, sy, sz] = airspace.star;
  const after = airspace.starAfter;
  const fit = first ? computeFit(airspace) : null;
  const R = Math.max(0.001, airspace.crowdRadius);
  // a rerouted airspace carries `crowded` for the new spot; keep the original spot's flag
  if (!after || first) rt.crowded = airspace.crowded;
  rt.crowdedAfter = Boolean(after) && airspace.crowded;

  for (const n of airspace.nodes) {
    seen.add(n.id);
    const [x, y, z] = n.p;
    const crowd = rt.crowded ? smoothstep(R, R * 0.35, Math.hypot(x - sx, y - sy, z - sz)) : 0;
    const crowdAfter =
      after && rt.crowdedAfter ? smoothstep(R, R * 0.35, Math.hypot(x - after[0], y - after[1], z - after[2])) : 0;
    let rec = rt.byId.get(n.id);
    if (!rec) {
      const rand = hash01(n.id);
      let delay: number;
      if (fit) {
        const rr = Math.hypot(x - fit.center.x, z - fit.center.z) / fit.radius;
        delay = 0.15 + Math.min(1, rr) * 1.1 + rand * 0.25;
      } else {
        delay = 0.25 + rand * 0.9;
      }
      rec = {
        id: n.id,
        cluster: n.cluster,
        pos: new THREE.Vector3(x, y, z),
        to: new THREE.Vector3(x, y, z),
        sim: n.sim,
        simAfter: n.simAfter ?? n.sim,
        simCur: n.sim,
        opacity: 0,
        highlight: 0,
        tone: 0,
        crowd,
        crowdAfter,
        pop: first ? 0.55 : 0.3,
        ping: 0,
        phase: rand * Math.PI * 2,
        rand,
        appearAt: Infinity,
        pendingDelay: delay,
        alive: true,
        isNew: !first && (n.isNew ?? true),
        drawScale: 1,
      };
      rt.byId.set(n.id, rec);
      rt.list.push(rec);
    } else {
      rec.to.set(x, y, z);
      rec.cluster = n.cluster;
      rec.sim = n.sim;
      rec.simAfter = n.simAfter ?? n.sim;
      rec.crowd = crowd;
      rec.crowdAfter = crowdAfter;
      if (!rec.alive) {
        rec.alive = true;
        rec.appearAt = -Infinity;
      }
    }
  }
  for (const rec of rt.list) {
    if (!seen.has(rec.id)) rec.alive = false;
  }

  rt.labels = computeLabelAnchors(airspace);
  rt.synced = true;
}

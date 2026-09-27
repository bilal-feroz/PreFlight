"use client";

import { useLayoutEffect, useRef, type RefObject } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { Line2 } from "three/examples/jsm/lines/Line2.js";
import { LineGeometry } from "three/examples/jsm/lines/LineGeometry.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { getGlowTexture } from "./glow";
import { COLORS } from "./palette";
import type { LatestProps, Runtime } from "./runtime";

const SEGMENTS = 36;
const MAX_EVIDENCE = 6;
const POOL_SIZE = 1 + MAX_EVIDENCE * 2;
const GROW_SECONDS = 1.1;
const STAGGER = 0.22;
const HIGHLIGHT_GROW_SECONDS = 0.38;

type Fil = {
  line: Line2;
  mat: LineMaterial;
  buffer: THREE.InterleavedBuffer;
  head: THREE.Sprite;
  headMat: THREE.SpriteMaterial;
};

type EvidenceState = {
  id: string;
  order: number;
  fil: Fil | null;
  growStart: number | null;
  progress: number;
  opacity: number;
  alive: boolean;
  reached: boolean;
};

type Pool = {
  free: Fil[];
  all: Fil[];
  highlight: { fil: Fil; id: string | null; progress: number; opacity: number };
  evidence: EvidenceState[];
  evidenceKey: string;
};

function createFil(tex: THREE.Texture): Fil {
  const geom = new LineGeometry();
  geom.setPositions(new Float32Array((SEGMENTS + 1) * 3));
  const mat = new LineMaterial({
    color: 0xffffff,
    linewidth: 1.3,
    worldUnits: false,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
  const line = new Line2(geom, mat);
  line.frustumCulled = false;
  line.renderOrder = 4;
  line.visible = false;
  const buffer = (geom.getAttribute("instanceStart") as THREE.InterleavedBufferAttribute).data;
  const headMat = new THREE.SpriteMaterial({
    map: tex,
    color: COLORS.filament.clone(),
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
  const head = new THREE.Sprite(headMat);
  head.scale.setScalar(0.42);
  head.renderOrder = 4;
  head.visible = false;
  return { line, mat, buffer, head, headMat };
}

const _mid = new THREE.Vector3();
const _a = new THREE.Vector3();

function bezier(p0: THREE.Vector3, p1: THREE.Vector3, p2: THREE.Vector3, t: number, out: THREE.Vector3) {
  const u = 1 - t;
  return out.set(
    u * u * p0.x + 2 * u * t * p1.x + t * t * p2.x,
    u * u * p0.y + 2 * u * t * p1.y + t * t * p2.y,
    u * u * p0.z + 2 * u * t * p1.z + t * t * p2.z,
  );
}

const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

/** Draw the first `progress` of a slightly arched curve from `from` to `to`. */
function drawFil(
  f: Fil,
  from: THREE.Vector3,
  to: THREE.Vector3,
  progress: number,
  opacity: number,
  color: THREE.Color,
  width: number,
  showHead: boolean,
  res: { width: number; height: number },
) {
  const visible = opacity > 0.004 && progress > 0.001;
  f.line.visible = visible;
  f.head.visible = visible && showHead;
  if (!visible) return;
  const dist = from.distanceTo(to);
  _mid.addVectors(from, to).multiplyScalar(0.5);
  _mid.y += 0.2 + dist * 0.14;
  const arr = f.buffer.array as Float32Array;
  bezier(from, _mid, to, 0, _a);
  for (let k = 0; k < SEGMENTS; k++) {
    const o = k * 6;
    arr[o] = _a.x;
    arr[o + 1] = _a.y;
    arr[o + 2] = _a.z;
    bezier(from, _mid, to, (progress * (k + 1)) / SEGMENTS, _a);
    arr[o + 3] = _a.x;
    arr[o + 4] = _a.y;
    arr[o + 5] = _a.z;
  }
  f.buffer.needsUpdate = true;
  f.mat.color.copy(color);
  f.mat.opacity = opacity;
  f.mat.linewidth = width;
  f.mat.resolution.set(res.width, res.height);
  if (showHead) {
    f.head.position.copy(_a);
    f.headMat.opacity = opacity * Math.min(1, (1 - progress) * 4);
  }
}

type Props = { runtimeRef: RefObject<Runtime | null>; latestRef: RefObject<LatestProps | null> };

/** Gold filaments from the star: one to the highlighted node, and grown (draw-on) to evidence nodes. */
export function Filaments({ runtimeRef, latestRef }: Props) {
  const group = useRef<THREE.Group>(null);
  const poolRef = useRef<Pool | null>(null);

  useLayoutEffect(() => {
    const g = group.current;
    if (!g) return;
    const tex = getGlowTexture();
    const all = Array.from({ length: POOL_SIZE }, () => createFil(tex));
    for (const f of all) {
      g.add(f.line);
      g.add(f.head);
    }
    poolRef.current = {
      all,
      free: all.slice(1),
      highlight: { fil: all[0], id: null, progress: 0, opacity: 0 },
      evidence: [],
      evidenceKey: "",
    };
    return () => {
      for (const f of all) {
        g.remove(f.line);
        g.remove(f.head);
        f.line.geometry.dispose();
        f.mat.dispose();
        f.headMat.dispose();
      }
      poolRef.current = null;
    };
  }, []);

  useFrame((state, delta) => {
    const pool = poolRef.current;
    const r = runtimeRef.current;
    const L = latestRef.current;
    if (!pool || !r || !L) return;
    const dt = Math.min(delta, 0.05);
    const now = state.clock.elapsedTime;
    const res = state.size;

    // highlight filament (Collision card hover)
    const hl = pool.highlight;
    const hid = L.highlightId && r.byId.has(L.highlightId) ? L.highlightId : null;
    if (hid && hid !== hl.id) {
      hl.id = hid;
      hl.progress = 0;
    }
    const active = hid !== null;
    hl.progress = Math.min(1, hl.progress + dt / HIGHLIGHT_GROW_SECONDS);
    hl.opacity += ((active ? 1 : 0) - hl.opacity) * (1 - Math.exp(-(active ? 10 : 12) * dt));
    const hlNode = hl.id ? r.byId.get(hl.id) : undefined;
    if (!active && hl.opacity < 0.01) hl.id = null;
    if (hlNode && r.starVisible) {
      drawFil(hl.fil, r.star, hlNode.pos, easeOutCubic(hl.progress), hl.opacity, COLORS.filamentHover, 1.1, false, res);
    } else {
      drawFil(hl.fil, r.star, r.star, 0, 0, COLORS.filamentHover, 1.1, false, res);
    }

    // evidence filaments: reconcile with the latest ids
    const ids = L.evidenceIds.slice(0, MAX_EVIDENCE);
    const key = ids.join("|");
    if (key !== pool.evidenceKey) {
      pool.evidenceKey = key;
      const next = new Set(ids);
      for (let i = 0; i < pool.evidence.length; i++) {
        if (!next.has(pool.evidence[i].id)) pool.evidence[i].alive = false;
      }
      ids.forEach((id, order) => {
        const existing = pool.evidence.find((e) => e.id === id);
        if (existing) {
          existing.alive = true;
          existing.order = order;
        } else {
          pool.evidence.push({
            id,
            order,
            fil: pool.free.pop() ?? null,
            growStart: null,
            progress: 0,
            opacity: 0,
            alive: true,
            reached: false,
          });
        }
      });
    }

    // grow only once the star has landed where it is going
    const settled = r.introDone && !r.flying;
    const shimmer = 0.85 + 0.15 * Math.sin(now * 2.2);
    for (let i = pool.evidence.length - 1; i >= 0; i--) {
      const e = pool.evidence[i];
      const node = r.byId.get(e.id);
      if (e.alive && settled && e.growStart === null) e.growStart = now + 0.15 + e.order * STAGGER;
      if (e.growStart !== null && now >= e.growStart) {
        e.progress = Math.min(1, (now - e.growStart) / GROW_SECONDS);
      }
      const target = e.alive && node ? 1 : 0;
      e.opacity += (target - e.opacity) * (1 - Math.exp(-(target ? 5 : 7) * dt));
      if (e.alive && node && e.progress >= 1 && !e.reached) {
        e.reached = true;
        r.evidenceLit.set(e.id, 1);
        node.ping = 1;
      }
      if (!e.alive && e.opacity < 0.01) {
        if (e.fil) {
          drawFil(e.fil, r.star, r.star, 0, 0, COLORS.filament, 1.3, false, res);
          pool.free.push(e.fil);
        }
        r.evidenceLit.delete(e.id);
        pool.evidence.splice(i, 1);
        continue;
      }
      if (!e.fil) continue;
      if (node && e.progress > 0) {
        const p = easeOutCubic(e.progress);
        drawFil(e.fil, r.star, node.pos, p, e.opacity * (e.progress >= 1 ? shimmer : 1), COLORS.filament, 1.35, e.progress < 1, res);
      } else {
        drawFil(e.fil, r.star, r.star, 0, 0, COLORS.filament, 1.3, false, res);
      }
    }
  });

  return <group ref={group} />;
}

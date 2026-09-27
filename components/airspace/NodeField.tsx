"use client";

import { useEffect, useLayoutEffect, useRef, type RefObject } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { Airspace as AirspaceData, VideoCard } from "@/lib/result-types";
import { ThumbAtlas } from "./atlas";
import { COLORS } from "./palette";
import {
  FADED_OPACITY,
  NODE_CAPACITY,
  NODE_H,
  NODE_PAD,
  NODE_RADIUS,
  NODE_W,
  smoothstep,
  type LatestProps,
  type Runtime,
} from "./runtime";
import { nodeFragment, nodeVertex } from "./shaders";

export type OverlayRefs = {
  tooltip: RefObject<HTMLDivElement | null>;
  labels: RefObject<(HTMLDivElement | null)[]>;
  labelLayer: RefObject<HTMLDivElement | null>;
};

type Attr = THREE.InstancedBufferAttribute;

type NodeStore = {
  atlas: ThumbAtlas;
  mesh: THREE.InstancedMesh;
  material: THREE.ShaderMaterial;
  rect: Attr;
  tint: Attr;
  opacity: Attr;
  highlight: Attr;
  sim: Attr;
  tone: Attr;
  phase: Attr;
  order: number[];
  depth: Float32Array;
};

function createStore(): NodeStore {
  const atlas = new ThumbAtlas();
  const geometry = new THREE.PlaneGeometry(NODE_W + NODE_PAD * 2, NODE_H + NODE_PAD * 2);
  const attr = (name: string, size: number): Attr => {
    const a = new THREE.InstancedBufferAttribute(new Float32Array(NODE_CAPACITY * size), size);
    a.setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute(name, a);
    return a;
  };
  const rect = attr("aRect", 4);
  const tint = attr("aTint", 3);
  const opacity = attr("aOpacity", 1);
  const highlight = attr("aHighlight", 1);
  const sim = attr("aSim", 1);
  const tone = attr("aTone", 1);
  const phase = attr("aPhase", 1);

  const material = new THREE.ShaderMaterial({
    vertexShader: nodeVertex,
    fragmentShader: nodeFragment,
    uniforms: {
      uAtlas: { value: atlas.texture },
      uHalf: { value: new THREE.Vector2(NODE_W / 2, NODE_H / 2) },
      uQuadHalf: { value: new THREE.Vector2(NODE_W / 2 + NODE_PAD, NODE_H / 2 + NODE_PAD) },
      uRadius: { value: NODE_RADIUS },
      uPad: { value: NODE_PAD },
      uTime: { value: 0 },
    },
    transparent: true,
    depthWrite: false,
  });

  const mesh = new THREE.InstancedMesh(geometry, material, NODE_CAPACITY);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false;
  mesh.count = 0;
  mesh.renderOrder = 2;

  return {
    atlas,
    mesh,
    material,
    rect,
    tint,
    opacity,
    highlight,
    sim,
    tone,
    phase,
    order: [],
    depth: new Float32Array(NODE_CAPACITY),
  };
}

function updateNodes(r: Runtime, L: LatestProps, dt: number, now: number) {
  const { market, videos, highlightId } = L;
  const kPos = 1 - Math.exp(-3.2 * dt);
  const kHi = 1 - Math.exp(-10 * dt);
  const kSim = 1 - Math.exp(-2.4 * dt);
  const kTone = 1 - Math.exp(-3 * dt);
  const kPop = 1 - Math.exp(-4.5 * dt);
  const pingDecay = Math.exp(-1.6 * dt);
  const list = r.list;
  let keep = 0;
  for (let i = 0; i < list.length; i++) {
    const n = list[i];
    if (n.pendingDelay !== null) {
      n.appearAt = now + n.pendingDelay;
      n.pendingDelay = null;
    }
    const shown = now >= n.appearAt;
    if (shown && n.isNew) {
      n.ping = 1;
      n.isNew = false;
    }
    n.pos.lerp(n.to, kPos);

    let hl = 0;
    if (n.id === highlightId) hl = 1;
    else if (n.id === r.hoveredId) hl = 0.6;
    else if (r.evidenceLit.has(n.id)) hl = 0.5;

    let target = 1;
    if (!n.alive) target = 0;
    else if (market !== "global") {
      const v = videos[n.id];
      if (!v || !v.markets[market]) target = FADED_OPACITY;
      if (hl >= 0.5) target = 1;
    }
    if (!shown) target = 0;
    const rate = n.alive ? 2.2 + n.rand * 2.6 : 3.2;
    n.opacity += (target - n.opacity) * (1 - Math.exp(-rate * dt));
    n.highlight += (hl - n.highlight) * kHi;
    n.simCur += ((r.rerouted ? n.simAfter : n.sim) - n.simCur) * kSim;
    const toneTarget = Math.max(n.crowd * r.crowdReveal, r.rerouted ? n.crowdAfter : 0);
    n.tone += (toneTarget - n.tone) * kTone;
    if (shown) n.pop += (1 - n.pop) * kPop;
    n.ping *= pingDecay;

    if (!n.alive && n.opacity < 0.01) {
      r.byId.delete(n.id);
      continue;
    }
    list[keep++] = n;
  }
  list.length = keep;
}

const _pv = new THREE.Matrix4();
const _tint = new THREE.Color();

/** Screen-space pick of the nearest visible phone under the pointer (matches the billboarded quads). */
function pick(r: Runtime, camera: THREE.PerspectiveCamera, w: number, h: number): string | null {
  const p = r.pointer;
  if (!p.inside || p.dragging || !r.introDone || w === 0 || h === 0) return null;
  _pv.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
  const e = _pv.elements;
  const pe = camera.projectionMatrix.elements;
  const nx = (p.x / w) * 2 - 1;
  const ny = 1 - (p.y / h) * 2;
  const minHx = 8 / (w / 2);
  const minHy = 8 / (h / 2);
  let best: string | null = null;
  let bestW = Infinity;
  for (const n of r.list) {
    if (!n.alive || n.opacity < 0.35) continue;
    const { x, y, z } = n.pos;
    const cw = e[3] * x + e[7] * y + e[11] * z + e[15];
    if (cw <= camera.near) continue;
    const cx = (e[0] * x + e[4] * y + e[8] * z + e[12]) / cw;
    const cy = (e[1] * x + e[5] * y + e[9] * z + e[13]) / cw;
    const hx = Math.max(minHx, ((NODE_W / 2) * n.drawScale * pe[0]) / cw);
    const hy = Math.max(minHy, ((NODE_H / 2) * n.drawScale * pe[5]) / cw);
    if (Math.abs(nx - cx) <= hx && Math.abs(ny - cy) <= hy && cw < bestW) {
      bestW = cw;
      best = n.id;
    }
  }
  return best;
}

function moveToEnd(order: number[], r: Runtime, id: string | null) {
  if (!id) return;
  for (let i = 0; i < order.length; i++) {
    if (r.list[order[i]].id === id) {
      const v = order[i];
      order.splice(i, 1);
      order.push(v);
      return;
    }
  }
}

function writeInstances(s: NodeStore, r: Runtime, camera: THREE.Camera, highlightId: string | null) {
  const list = r.list;
  const count = Math.min(list.length, NODE_CAPACITY);
  const order = s.order;
  order.length = count;
  const cp = camera.position;
  for (let i = 0; i < count; i++) {
    order[i] = i;
    s.depth[i] = list[i].pos.distanceToSquared(cp);
  }
  // back to front for correct blending, focused phones last so they sit on top
  order.sort((a, b) => s.depth[b] - s.depth[a]);
  moveToEnd(order, r, r.hoveredId);
  moveToEnd(order, r, highlightId);

  const m = s.mesh.instanceMatrix.array as Float32Array;
  const rect = s.rect.array as Float32Array;
  const tint = s.tint.array as Float32Array;
  const opacity = s.opacity.array as Float32Array;
  const highlight = s.highlight.array as Float32Array;
  const sim = s.sim.array as Float32Array;
  const tone = s.tone.array as Float32Array;
  const phase = s.phase.array as Float32Array;

  for (let slot = 0; slot < count; slot++) {
    const n = list[order[slot]];
    const scale =
      (0.92 + 0.3 * n.simCur) * (1 + 0.75 * n.highlight + 0.25 * n.ping) * (0.3 + 0.7 * n.pop);
    n.drawScale = scale;
    const o = slot * 16;
    m[o] = scale;
    m[o + 1] = 0;
    m[o + 2] = 0;
    m[o + 3] = 0;
    m[o + 4] = 0;
    m[o + 5] = scale;
    m[o + 6] = 0;
    m[o + 7] = 0;
    m[o + 8] = 0;
    m[o + 9] = 0;
    m[o + 10] = scale;
    m[o + 11] = 0;
    m[o + 12] = n.pos.x;
    m[o + 13] = n.pos.y;
    m[o + 14] = n.pos.z;
    m[o + 15] = 1;

    s.atlas.writeRect(n.id, rect, slot * 4);

    const lit = Math.min(1, n.highlight + n.ping * 0.6);
    _tint.copy(COLORS.rimCool).lerp(COLORS.rimWarm, smoothstep(0.1, 0.8, n.simCur));
    _tint.lerp(COLORS.rimRed, Math.min(1, n.tone * 1.5));
    _tint.lerp(COLORS.rimHot, lit);
    tint[slot * 3] = _tint.r;
    tint[slot * 3 + 1] = _tint.g;
    tint[slot * 3 + 2] = _tint.b;

    opacity[slot] = n.opacity;
    highlight[slot] = lit;
    sim[slot] = n.simCur;
    tone[slot] = Math.min(0.75, n.tone * 0.8) * (1 - n.highlight * 0.6);
    phase[slot] = n.phase;
  }

  s.mesh.count = count;
  s.mesh.instanceMatrix.needsUpdate = true;
  s.rect.needsUpdate = true;
  s.tint.needsUpdate = true;
  s.opacity.needsUpdate = true;
  s.highlight.needsUpdate = true;
  s.sim.needsUpdate = true;
  s.tone.needsUpdate = true;
  s.phase.needsUpdate = true;
}

type Projected = { x: number; y: number; halfH: number; visible: boolean };
const _proj: Projected = { x: 0, y: 0, halfH: 0, visible: false };

function project(p: THREE.Vector3, scaleH: number, camera: THREE.PerspectiveCamera, w: number, h: number): Projected {
  const e = _pv.elements;
  const cw = e[3] * p.x + e[7] * p.y + e[11] * p.z + e[15];
  if (cw <= camera.near) {
    _proj.visible = false;
    return _proj;
  }
  const cx = (e[0] * p.x + e[4] * p.y + e[8] * p.z + e[12]) / cw;
  const cy = (e[1] * p.x + e[5] * p.y + e[9] * p.z + e[13]) / cw;
  _proj.x = (cx + 1) * 0.5 * w;
  _proj.y = (1 - cy) * 0.5 * h;
  _proj.halfH = ((scaleH * camera.projectionMatrix.elements[5]) / cw) * 0.5 * h;
  _proj.visible = true;
  return _proj;
}

function positionOverlay(r: Runtime, overlay: OverlayRefs, camera: THREE.PerspectiveCamera, w: number, h: number) {
  _pv.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);

  const tip = overlay.tooltip.current;
  const hovered = r.hoveredId ? r.byId.get(r.hoveredId) : undefined;
  if (tip && hovered) {
    const pr = project(hovered.pos, (NODE_H / 2) * hovered.drawScale, camera, w, h);
    if (pr.visible) {
      const tw = tip.offsetWidth;
      const th = tip.offsetHeight;
      const x = Math.min(Math.max(pr.x - tw / 2, 8), Math.max(8, w - tw - 8));
      let y = pr.y - pr.halfH - 12 - th;
      if (y < 8) y = pr.y + pr.halfH + 12;
      tip.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
    }
  }

  const els = overlay.labels.current;
  for (let i = 0; i < r.labels.length; i++) {
    const el = els[i];
    if (!el) continue;
    const pr = project(r.labels[i].pos, 0, camera, w, h);
    if (!pr.visible) {
      el.style.visibility = "hidden";
      continue;
    }
    el.style.visibility = "visible";
    el.style.transform = `translate3d(${pr.x.toFixed(1)}px, ${pr.y.toFixed(1)}px, 0) translate(-50%, -100%)`;
  }

  const layer = overlay.labelLayer.current;
  if (layer && r.labelsShown !== r.introDone) {
    r.labelsShown = r.introDone;
    layer.style.opacity = r.introDone ? "1" : "0";
  }
}

type Props = {
  runtimeRef: RefObject<Runtime | null>;
  latestRef: RefObject<LatestProps | null>;
  airspace: AirspaceData;
  videos: Record<string, VideoCard>;
  overlay: OverlayRefs;
  onHoverChange: (id: string | null) => void;
};

export function NodeField({ runtimeRef, latestRef, airspace, videos, overlay, onHoverChange }: Props) {
  const groupRef = useRef<THREE.Group>(null);
  const storeRef = useRef<NodeStore | null>(null);

  useLayoutEffect(() => {
    const group = groupRef.current;
    if (!group) return;
    const store = createStore();
    group.add(store.mesh);
    storeRef.current = store;
    return () => {
      group.remove(store.mesh);
      store.mesh.geometry.dispose();
      store.material.dispose();
      store.mesh.dispose();
      store.atlas.dispose();
      storeRef.current = null;
    };
  }, []);

  useEffect(() => {
    storeRef.current?.atlas.sync(
      airspace.nodes.map((n) => n.id),
      videos,
    );
  }, [airspace, videos]);

  useFrame((state, delta) => {
    const s = storeRef.current;
    const r = runtimeRef.current;
    const L = latestRef.current;
    if (!s || !r || !L) return;
    const dt = Math.min(delta, 0.05);
    const now = state.clock.elapsedTime;
    const camera = state.camera as THREE.PerspectiveCamera;
    const { width, height } = state.size;

    updateNodes(r, L, dt, now);
    s.atlas.flush(now);
    s.material.uniforms.uTime.value = now;

    camera.updateMatrixWorld();
    const hovered = pick(r, camera, width, height);
    if (hovered !== r.hoveredId) {
      r.hoveredId = hovered;
      onHoverChange(hovered);
    }

    writeInstances(s, r, camera, L.highlightId);
    positionOverlay(r, overlay, camera, width, height);

    const controls = state.controls as unknown as { autoRotate?: boolean } | null;
    if (controls && typeof controls.autoRotate === "boolean") {
      controls.autoRotate = r.introDone && r.hoveredId === null && !r.pointer.down;
    }
  });

  return <group ref={groupRef} />;
}

"use client";

import { useLayoutEffect, useMemo, useRef, type RefObject } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { getGlowTexture } from "./glow";
import { COLORS } from "./palette";
import type { Runtime } from "./runtime";
import { trailFragment, trailVertex } from "./shaders";

type StarProps = { runtimeRef: RefObject<Runtime | null> };

/** The concept: a hot core, a pulsing halo, a wide soft glow and a faint cross flare. */
export function Star({ runtimeRef }: StarProps) {
  const group = useRef<THREE.Group>(null);
  const coreMat = useRef<THREE.MeshBasicMaterial>(null);
  const halo = useRef<THREE.Sprite>(null);
  const haloMat = useRef<THREE.SpriteMaterial>(null);
  const outer = useRef<THREE.Sprite>(null);
  const outerMat = useRef<THREE.SpriteMaterial>(null);
  const flareH = useRef<THREE.Sprite>(null);
  const flareV = useRef<THREE.Sprite>(null);
  const flareHMat = useRef<THREE.SpriteMaterial>(null);
  const flareVMat = useRef<THREE.SpriteMaterial>(null);
  const tex = useMemo(() => getGlowTexture(), []);

  useFrame((state) => {
    const r = runtimeRef.current;
    const g = group.current;
    if (!r || !g) return;
    g.visible = r.starVisible;
    if (!r.starVisible) return;
    g.position.copy(r.star);
    const t = state.clock.elapsedTime;
    const w = r.warm;
    const beat = 0.5 + 0.5 * Math.sin(t * 2.3);
    const pulse = 1 + 0.16 * r.pulse * beat + 0.55 * r.flash;

    if (coreMat.current) {
      coreMat.current.color.copy(COLORS.coreDull).lerp(COLORS.coreBright, w).multiplyScalar(1 + r.flash * 0.9);
    }
    if (halo.current && haloMat.current) {
      halo.current.scale.setScalar(1.35 * pulse);
      haloMat.current.color.copy(COLORS.haloDull).lerp(COLORS.haloBright, w);
      haloMat.current.opacity = 0.7 + 0.3 * w;
    }
    if (outer.current && outerMat.current) {
      outer.current.scale.setScalar(3.6 * (1 + 0.05 * Math.sin(t * 1.1)) * (1 + 0.7 * r.flash));
      outerMat.current.color.copy(COLORS.outerDull).lerp(COLORS.outerBright, w);
      outerMat.current.opacity = 0.35 + 0.3 * w + 0.3 * r.flash;
    }
    const flareLen = (1.2 + 1.8 * w) * pulse;
    const flareOpacity = 0.18 + 0.5 * w + 0.3 * r.flash;
    if (flareH.current && flareHMat.current) {
      flareH.current.scale.set(flareLen, 0.055, 1);
      flareHMat.current.color.copy(COLORS.haloDull).lerp(COLORS.haloBright, w);
      flareHMat.current.opacity = flareOpacity;
    }
    if (flareV.current && flareVMat.current) {
      flareV.current.scale.set(flareLen * 0.7, 0.05, 1);
      flareVMat.current.color.copy(COLORS.haloDull).lerp(COLORS.haloBright, w);
      flareVMat.current.opacity = flareOpacity * 0.8;
    }
  });

  return (
    <group ref={group} visible={false}>
      <sprite ref={outer} renderOrder={6}>
        <spriteMaterial
          ref={outerMat}
          map={tex}
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </sprite>
      <sprite ref={halo} renderOrder={7}>
        <spriteMaterial
          ref={haloMat}
          map={tex}
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </sprite>
      <sprite ref={flareH} renderOrder={8}>
        <spriteMaterial
          ref={flareHMat}
          map={tex}
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </sprite>
      <sprite ref={flareV} renderOrder={8}>
        <spriteMaterial
          ref={flareVMat}
          map={tex}
          rotation={Math.PI / 2}
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </sprite>
      <mesh renderOrder={9}>
        <sphereGeometry args={[0.085, 20, 20]} />
        <meshBasicMaterial ref={coreMat} transparent depthWrite={false} toneMapped={false} />
      </mesh>
    </group>
  );
}

const TRAIL_POINTS = 56;
const TRAIL_STEP = 1 / 60;

type TrailStore = {
  mesh: THREE.Mesh;
  material: THREE.ShaderMaterial;
  positions: THREE.BufferAttribute;
  history: Float32Array;
  acc: number;
  primed: boolean;
};

const _p = new THREE.Vector3();
const _prev = new THREE.Vector3();
const _next = new THREE.Vector3();
const _tan = new THREE.Vector3();
const _view = new THREE.Vector3();
const _side = new THREE.Vector3();

/** Comet tail: a camera-facing ribbon through the star's recent positions. */
export function StarTrail({ runtimeRef }: StarProps) {
  const group = useRef<THREE.Group>(null);
  const storeRef = useRef<TrailStore | null>(null);

  useLayoutEffect(() => {
    const g = group.current;
    if (!g) return;
    const N = TRAIL_POINTS;
    const geometry = new THREE.BufferGeometry();
    const positions = new THREE.BufferAttribute(new Float32Array(N * 2 * 3), 3);
    positions.setUsage(THREE.DynamicDrawUsage);
    const alpha = new Float32Array(N * 2);
    const side = new Float32Array(N * 2);
    for (let i = 0; i < N; i++) {
      const a = Math.pow(1 - i / (N - 1), 1.5);
      alpha[i * 2] = a;
      alpha[i * 2 + 1] = a;
      side[i * 2] = -1;
      side[i * 2 + 1] = 1;
    }
    const index: number[] = [];
    for (let i = 0; i < N - 1; i++) {
      const a = i * 2;
      index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    geometry.setIndex(index);
    geometry.setAttribute("position", positions);
    geometry.setAttribute("aAlpha", new THREE.BufferAttribute(alpha, 1));
    geometry.setAttribute("aSide", new THREE.BufferAttribute(side, 1));
    const material = new THREE.ShaderMaterial({
      vertexShader: trailVertex,
      fragmentShader: trailFragment,
      uniforms: {
        uColor: { value: COLORS.trail.clone() },
        uHead: { value: COLORS.trailHead.clone() },
        uOpacity: { value: 0 },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.frustumCulled = false;
    mesh.renderOrder = 5;
    mesh.visible = false;
    g.add(mesh);
    storeRef.current = { mesh, material, positions, history: new Float32Array(N * 3), acc: 0, primed: false };
    return () => {
      g.remove(mesh);
      geometry.dispose();
      material.dispose();
      storeRef.current = null;
    };
  }, []);

  useFrame((state, delta) => {
    const s = storeRef.current;
    const r = runtimeRef.current;
    if (!s || !r) return;
    const N = TRAIL_POINTS;
    const h = s.history;
    const star = r.star;
    if (!r.starVisible) {
      s.primed = false;
      s.mesh.visible = false;
      return;
    }
    if (!s.primed) {
      for (let i = 0; i < N; i++) {
        h[i * 3] = star.x;
        h[i * 3 + 1] = star.y;
        h[i * 3 + 2] = star.z;
      }
      s.primed = true;
      s.acc = 0;
    }
    s.acc += Math.min(delta, 0.1);
    while (s.acc >= TRAIL_STEP) {
      h.copyWithin(3, 0, (N - 1) * 3);
      s.acc -= TRAIL_STEP;
    }
    h[0] = star.x;
    h[1] = star.y;
    h[2] = star.z;

    const spread = Math.hypot(h[0] - h[(N - 1) * 3], h[1] - h[(N - 1) * 3 + 1], h[2] - h[(N - 1) * 3 + 2]);
    if (spread < 0.02) {
      s.mesh.visible = false;
      return;
    }
    s.mesh.visible = true;
    s.material.uniforms.uOpacity.value = Math.min(1, spread / 1.2);

    const cam = state.camera.position;
    const arr = s.positions.array as Float32Array;
    _side.set(0, 1, 0);
    for (let i = 0; i < N; i++) {
      const ip = Math.max(0, i - 1);
      const inx = Math.min(N - 1, i + 1);
      _p.set(h[i * 3], h[i * 3 + 1], h[i * 3 + 2]);
      _prev.set(h[ip * 3], h[ip * 3 + 1], h[ip * 3 + 2]);
      _next.set(h[inx * 3], h[inx * 3 + 1], h[inx * 3 + 2]);
      _tan.subVectors(_prev, _next);
      if (_tan.lengthSq() > 1e-10) {
        _view.subVectors(cam, _p);
        const candidate = _tan.cross(_view);
        if (candidate.lengthSq() > 1e-10) _side.copy(candidate).normalize();
      }
      const width = 0.15 * Math.pow(1 - i / (N - 1), 0.85) + 0.004;
      const o = i * 6;
      arr[o] = _p.x - _side.x * width;
      arr[o + 1] = _p.y - _side.y * width;
      arr[o + 2] = _p.z - _side.z * width;
      arr[o + 3] = _p.x + _side.x * width;
      arr[o + 4] = _p.y + _side.y * width;
      arr[o + 5] = _p.z + _side.z * width;
    }
    s.positions.needsUpdate = true;
  });

  return <group ref={group} />;
}

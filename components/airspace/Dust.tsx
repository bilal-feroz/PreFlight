"use client";

import { useLayoutEffect, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { HEX } from "./palette";
import { dustFragment, dustVertex } from "./shaders";

const COUNT = 1200;

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type DustStore = { points: THREE.Points; material: THREE.ShaderMaterial };

/** Decorative gold/amber dust: additive points with slow drift and twinkle. */
export function Dust({ radius = 13 }: { radius?: number }) {
  const group = useRef<THREE.Group>(null);
  const storeRef = useRef<DustStore | null>(null);

  useLayoutEffect(() => {
    const g = group.current;
    if (!g) return;
    const rand = mulberry32(20240927);
    const gauss = () => {
      let u = 0;
      for (let i = 0; i < 4; i++) u += rand();
      return (u - 2) / 0.577;
    };
    const positions = new Float32Array(COUNT * 3);
    const colors = new Float32Array(COUNT * 3);
    const sizes = new Float32Array(COUNT);
    const phases = new Float32Array(COUNT);
    const gold = new THREE.Color(HEX.gold);
    const amber = new THREE.Color(HEX.amber);
    const light = new THREE.Color(HEX.lightGold);
    const white = new THREE.Color(HEX.clusterWhite);
    const col = new THREE.Color();
    for (let i = 0; i < COUNT; i++) {
      const inDisc = rand() < 0.74;
      let x: number;
      let y: number;
      let z: number;
      if (inDisc) {
        const rr = radius * (0.08 + 1.55 * Math.sqrt(rand()));
        const a = rand() * Math.PI * 2;
        x = Math.cos(a) * rr;
        z = Math.sin(a) * rr;
        y = gauss() * 1.6;
      } else {
        const rr = radius * (1.1 + rand() * 1.5);
        const u = rand() * 2 - 1;
        const a = rand() * Math.PI * 2;
        const s = Math.sqrt(1 - u * u);
        x = Math.cos(a) * s * rr;
        y = u * rr * 0.6;
        z = Math.sin(a) * s * rr;
      }
      positions[i * 3] = x;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = z;
      const pickC = rand();
      if (pickC < 0.45) col.copy(gold);
      else if (pickC < 0.8) col.copy(amber);
      else if (pickC < 0.94) col.copy(light);
      else col.copy(white).multiplyScalar(0.7);
      col.multiplyScalar(0.3 + rand() * 0.6);
      colors[i * 3] = col.r;
      colors[i * 3 + 1] = col.g;
      colors[i * 3 + 2] = col.b;
      sizes[i] = 0.025 + Math.pow(rand(), 3) * 0.075;
      phases[i] = rand() * Math.PI * 2;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("aColor", new THREE.BufferAttribute(colors, 3));
    geometry.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
    geometry.setAttribute("aPhase", new THREE.BufferAttribute(phases, 1));
    const material = new THREE.ShaderMaterial({
      vertexShader: dustVertex,
      fragmentShader: dustFragment,
      uniforms: { uTime: { value: 0 }, uScale: { value: 800 } },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const points = new THREE.Points(geometry, material);
    points.frustumCulled = false;
    points.renderOrder = 0;
    g.add(points);
    storeRef.current = { points, material };
    return () => {
      g.remove(points);
      geometry.dispose();
      material.dispose();
      storeRef.current = null;
    };
  }, [radius]);

  useFrame((state, delta) => {
    const s = storeRef.current;
    if (!s) return;
    const camera = state.camera as THREE.PerspectiveCamera;
    s.material.uniforms.uTime.value = state.clock.elapsedTime;
    s.material.uniforms.uScale.value =
      (state.size.height * state.viewport.dpr) / (2 * Math.tan(((camera.fov ?? 45) * Math.PI) / 360));
    s.points.rotation.y += Math.min(delta, 0.05) * 0.008;
  });

  return <group ref={group} />;
}

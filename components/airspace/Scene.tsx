"use client";

import { useLayoutEffect, useRef, type ComponentRef, type RefObject } from "react";
import { useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { Bloom, EffectComposer, Vignette } from "@react-three/postprocessing";
import type * as THREE from "three";
import type { Airspace as AirspaceData, MarketKey, VideoCard } from "@/lib/result-types";
import { runIntro, setDestination, settleWarmth } from "./director";
import { Dust } from "./Dust";
import { Filaments } from "./Filaments";
import { NodeField, type OverlayRefs } from "./NodeField";
import { HEX } from "./palette";
import { syncAirspace, type LatestProps, type Runtime } from "./runtime";
import { Star, StarTrail } from "./Star";

export type SceneProps = {
  runtimeRef: RefObject<Runtime | null>;
  airspace: AirspaceData;
  videos: Record<string, VideoCard>;
  market: MarketKey;
  highlightId: string | null;
  evidenceIds: string[];
  overlay: OverlayRefs;
  onHoverChange: (id: string | null) => void;
};

export function Scene({
  runtimeRef,
  airspace,
  videos,
  market,
  highlightId,
  evidenceIds,
  overlay,
  onHoverChange,
}: SceneProps) {
  const latestRef = useRef<LatestProps | null>(null);
  const controlsRef = useRef<ComponentRef<typeof OrbitControls>>(null);
  const get = useThree((s) => s.get);

  // effects below run in declaration order: props snapshot, node sync, intro, star destination
  useLayoutEffect(() => {
    latestRef.current = { airspace, videos, market, highlightId, evidenceIds };
  });

  useLayoutEffect(() => {
    const r = runtimeRef.current;
    if (!r) return;
    const wasCrowded = r.crowded;
    syncAirspace(r, airspace);
    if (r.introDone && !r.flying && !r.rerouted && wasCrowded !== r.crowded) settleWarmth(r);
  }, [airspace, runtimeRef]);

  useLayoutEffect(() => {
    const r = runtimeRef.current;
    const L = latestRef.current;
    if (!r || !L) return;
    const { camera, size } = get();
    return runIntro(r, camera as THREE.PerspectiveCamera, size, controlsRef.current, L.airspace);
  }, [get, runtimeRef]);

  const destKey = airspace.starAfter ? `a:${airspace.starAfter.join(",")}` : `s:${airspace.star.join(",")}`;
  useLayoutEffect(() => {
    const r = runtimeRef.current;
    const L = latestRef.current;
    if (!r || !L) return;
    setDestination(r, L.airspace);
  }, [destKey, runtimeRef]);

  return (
    <>
      <color attach="background" args={[HEX.bg]} />
      <Dust />
      <NodeField
        runtimeRef={runtimeRef}
        latestRef={latestRef}
        airspace={airspace}
        videos={videos}
        overlay={overlay}
        onHoverChange={onHoverChange}
      />
      <Filaments runtimeRef={runtimeRef} latestRef={latestRef} />
      <StarTrail runtimeRef={runtimeRef} />
      <Star runtimeRef={runtimeRef} />
      <OrbitControls
        ref={controlsRef}
        makeDefault
        enablePan={false}
        enableDamping
        dampingFactor={0.07}
        rotateSpeed={0.55}
        zoomSpeed={0.7}
        minDistance={2.5}
        maxDistance={60}
        minPolarAngle={0.12}
        maxPolarAngle={Math.PI * 0.58}
        autoRotate
        autoRotateSpeed={0.28}
      />
      <EffectComposer multisampling={4}>
        <Bloom mipmapBlur luminanceThreshold={0.2} luminanceSmoothing={0.6} intensity={1.1} radius={0.72} />
        <Vignette eskil={false} offset={0.28} darkness={0.72} />
      </EffectComposer>
    </>
  );
}

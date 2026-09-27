import gsap from "gsap";
import * as THREE from "three";
import type { Airspace as AirspaceData } from "@/lib/result-types";
import { computeFit, type Runtime } from "./runtime";

/** The subset of OrbitControls the choreography touches. */
export type ControlsLike = {
  enabled: boolean;
  target: THREE.Vector3;
  maxDistance: number;
  update: () => unknown;
};

const UP = new THREE.Vector3(0, 1, 0);
const INTRO_ELEVATION = 0.5;

/** Camera distance that frames a disc of `radius` for the given vertical fov and aspect. */
export function fitDistance(radius: number, fovDeg: number, aspect: number): number {
  const t = Math.tan((fovDeg * Math.PI) / 360);
  const horizontal = radius / (t * Math.max(aspect, 0.3));
  const vertical = (radius * 0.72) / t;
  return THREE.MathUtils.clamp(Math.max(horizontal, vertical) * 0.92, 9, 50);
}

function fromSpherical(center: THREE.Vector3, dist: number, elev: number, az: number, out: THREE.Vector3) {
  return out.set(
    center.x + dist * Math.cos(elev) * Math.sin(az),
    center.y + dist * Math.sin(elev),
    center.z + dist * Math.cos(elev) * Math.cos(az),
  );
}

function fly(
  r: Runtime,
  from: THREE.Vector3,
  ctrl: THREE.Vector3,
  to: THREE.Vector3,
  duration: number,
  ease: string,
  delay: number,
  onLand: () => void,
) {
  gsap.killTweensOf(r.flight);
  const curve = new THREE.QuadraticBezierCurve3(from.clone(), ctrl.clone(), to.clone());
  const end = to.clone();
  r.flight.t = 0;
  r.flying = true;
  gsap.to(r.flight, {
    t: 1,
    duration,
    ease,
    delay,
    onUpdate: () => {
      curve.getPoint(r.flight.t, r.star);
    },
    onComplete: () => {
      r.star.copy(end);
      r.flying = false;
      onLand();
    },
  });
}

/** Resting look of the star and the crowd tint, given whether the current spot is crowded. */
export function settleWarmth(r: Runtime, delay = 0): void {
  if (r.crowded) {
    gsap.to(r, { crowdReveal: 1, duration: 1.4, delay, ease: "power2.out", overwrite: "auto" });
    gsap.to(r, { warm: 0, pulse: 0.35, duration: 1.6, delay: delay + 0.1, ease: "power2.inOut", overwrite: "auto" });
  } else {
    gsap.to(r, { crowdReveal: 0, warm: 1, pulse: 0.6, duration: 0.9, delay, ease: "power2.out", overwrite: "auto" });
  }
}

function land(r: Runtime, kind: "arrive" | "reroute") {
  r.flash = 1;
  gsap.to(r, { flash: 0, duration: 1.3, ease: "power2.out", overwrite: "auto" });
  if (kind === "reroute") {
    r.rerouted = true;
    gsap.to(r, { warm: 1, pulse: 1, duration: 0.9, ease: "power2.out", overwrite: "auto" });
    // the old crowd stays faintly red as context for where the idea was
    gsap.to(r, { crowdReveal: r.crowded ? 0.45 : 0, duration: 1.2, ease: "power2.inOut", overwrite: "auto" });
  } else {
    r.rerouted = false;
    settleWarmth(r, 0.15);
  }
  r.introDone = true;
  travel(r);
}

/** Fly the resting star to r.dest if it is somewhere else (bezier arc, comet trail follows). */
export function travel(r: Runtime): void {
  if (r.flying || !r.introDone) return;
  if (r.at.distanceToSquared(r.dest) < 1e-6) return;
  const from = r.star.clone();
  const to = r.dest.clone();
  const dist = from.distanceTo(to);
  const ctrl = from.clone().lerp(to, 0.5);
  ctrl.y += 1.4 + dist * 0.3;
  const side = to.clone().sub(from).cross(UP);
  if (side.lengthSq() > 1e-8) ctrl.addScaledVector(side.normalize(), dist * 0.12);
  r.at.copy(to);
  const reroute = r.destIsAfter;
  if (reroute) gsap.to(r, { warm: 0.55, pulse: 0.7, duration: 0.8, ease: "power1.out", overwrite: "auto" });
  fly(r, from, ctrl, to, reroute ? 2.2 : 1.6, "power2.inOut", 0, () => land(r, reroute ? "reroute" : "arrive"));
}

/** Point the star at starAfter (after a reroute) or star, and travel there once the intro is done. */
export function setDestination(r: Runtime, airspace: AirspaceData): void {
  const d = airspace.starAfter ?? airspace.star;
  r.dest.set(d[0], d[1], d[2]);
  r.destIsAfter = Boolean(airspace.starAfter);
  travel(r);
}

/**
 * Mount choreography: the camera starts close and pulls back to an overview while the star
 * flies in from off-screen along a bezier arc. Returns a cleanup.
 */
export function runIntro(
  r: Runtime,
  camera: THREE.PerspectiveCamera,
  size: { width: number; height: number },
  controls: ControlsLike | null,
  airspace: AirspaceData,
): () => void {
  const fit = computeFit(airspace);
  const center = fit.center.clone();
  const aspect = size.width / Math.max(1, size.height);
  const dist = fitDistance(fit.radius, camera.fov, aspect);
  const starP = new THREE.Vector3(airspace.star[0], airspace.star[1], airspace.star[2]);

  // look at the layout from the star's side so the concept sits in the foreground
  const dx = starP.x - center.x;
  const dz = starP.z - center.z;
  const az = (Math.hypot(dx, dz) > 0.5 ? Math.atan2(dx, dz) : 0) + 0.35;

  const cam = { d: dist * 0.3, e: 0.16, a: az - 0.75 };
  const place = () => {
    fromSpherical(center, cam.d, cam.e, cam.a, camera.position);
    camera.lookAt(center);
  };
  place();
  if (controls) {
    controls.enabled = false;
    controls.target.copy(center);
    controls.maxDistance = dist * 1.7;
  }
  gsap.to(cam, {
    d: dist,
    e: INTRO_ELEVATION,
    a: az,
    duration: 2.7,
    ease: "power3.inOut",
    onUpdate: place,
    onComplete: () => {
      if (controls) {
        controls.enabled = true;
        controls.update();
      }
    },
  });

  // star enters from the upper left of the final framing
  const endPos = fromSpherical(center, dist, INTRO_ELEVATION, az, new THREE.Vector3());
  const fwd = center.clone().sub(endPos).normalize();
  const right = fwd.clone().cross(UP).normalize();
  const up = right.clone().cross(fwd).normalize();
  const p0 = starP
    .clone()
    .addScaledVector(right, -dist * 0.8)
    .addScaledVector(up, dist * 0.45)
    .addScaledVector(fwd, -dist * 0.2);
  const ctrl = p0.clone().lerp(starP, 0.5).addScaledVector(up, dist * 0.2).addScaledVector(right, dist * 0.08);

  r.star.copy(p0);
  r.at.copy(starP);
  r.starVisible = true;
  r.warm = 1;
  r.pulse = 0.5;
  r.flash = 0;
  r.crowdReveal = 0;
  r.rerouted = false;
  r.introDone = false;
  fly(r, p0, ctrl, starP, 2.5, "power2.out", 0.35, () => land(r, "arrive"));

  return () => {
    gsap.killTweensOf(cam);
    gsap.killTweensOf(r);
    gsap.killTweensOf(r.flight);
    r.flying = false;
    if (controls) controls.enabled = true;
  };
}

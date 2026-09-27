import * as THREE from "three";

export const HEX = {
  bg: "#050505",
  gold: "#FFB547",
  lightGold: "#FFD27A",
  amber: "#C8841F",
  clusterWhite: "#DDE6F2",
  paleBlue: "#8FB3D9",
  crowdRed: "#B5473A",
} as const;

export const FONT_SANS = "var(--font-inter, ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif)";
export const FONT_MONO = "var(--font-mono, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace)";

/** Linear-space colors (THREE.Color converts the sRGB hex on construction). */
const c = (hex: string, k = 1) => new THREE.Color(hex).multiplyScalar(k);

export const COLORS = {
  rimCool: c(HEX.paleBlue, 0.35),
  rimWarm: c(HEX.gold, 0.8),
  rimRed: c(HEX.crowdRed, 1.3),
  rimHot: c(HEX.lightGold, 1.7),

  coreBright: new THREE.Color(HEX.gold).lerp(new THREE.Color("#ffffff"), 0.3).multiplyScalar(4.2),
  coreDull: new THREE.Color(HEX.amber).lerp(new THREE.Color(HEX.crowdRed), 0.5).multiplyScalar(3.2),
  haloBright: c(HEX.lightGold, 1.25),
  haloDull: new THREE.Color(HEX.amber).lerp(new THREE.Color(HEX.crowdRed), 0.5).multiplyScalar(1.5),
  outerBright: c(HEX.gold, 0.6),
  outerDull: new THREE.Color(HEX.amber).lerp(new THREE.Color(HEX.crowdRed), 0.65).multiplyScalar(0.8),

  trail: c(HEX.gold, 1.0),
  trailHead: c(HEX.lightGold, 1.8),
  filament: c(HEX.lightGold, 1.8),
  filamentHover: c(HEX.lightGold, 1.5),
};

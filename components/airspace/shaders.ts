/** Phone-screen nodes: camera-facing instanced quads with a rounded-rect SDF, thumbnail atlas and gold rim glow. */
export const nodeVertex = /* glsl */ `
attribute vec4 aRect;
attribute vec3 aTint;
attribute float aOpacity;
attribute float aHighlight;
attribute float aSim;
attribute float aTone;
attribute float aPhase;

uniform float uTime;

varying vec2 vUv;
varying vec4 vRect;
varying vec3 vTint;
varying float vOpacity;
varying float vHighlight;
varying float vSim;
varying float vTone;

void main() {
  vUv = uv;
  vRect = aRect;
  vTint = aTint;
  vOpacity = aOpacity;
  vHighlight = aHighlight;
  vSim = aSim;
  vTone = aTone;

  vec3 center = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  float s = length(instanceMatrix[0].xyz);
  center.y += sin(uTime * 0.55 + aPhase) * 0.045;

  vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
  vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
  vec3 world = center + (right * position.x + up * position.y) * s;
  gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
}
`;

export const nodeFragment = /* glsl */ `
uniform sampler2D uAtlas;
uniform vec2 uHalf;
uniform vec2 uQuadHalf;
uniform float uRadius;
uniform float uPad;

varying vec2 vUv;
varying vec4 vRect;
varying vec3 vTint;
varying float vOpacity;
varying float vHighlight;
varying float vSim;
varying float vTone;

float sdRoundBox(vec2 p, vec2 b, float r) {
  vec2 q = abs(p) - b + vec2(r);
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}

void main() {
  vec2 p = (vUv - 0.5) * 2.0 * uQuadHalf;
  float d = sdRoundBox(p, uHalf, uRadius);
  float aa = max(fwidth(d), 1e-4);
  float body = 1.0 - smoothstep(-aa, aa, d);

  vec2 suv = clamp((p + uHalf) / (2.0 * uHalf), 0.0, 1.0);
  vec3 img = texture2D(uAtlas, vRect.xy + suv * vRect.zw).rgb;

  // crowd toning: keep the image's luminance, shift its hue toward the tint
  float lum = dot(img, vec3(0.2126, 0.7152, 0.0722));
  img = mix(img, vTint * (0.16 + lum * 1.7), vTone);

  float bright = 0.55 + 0.3 * vSim + 0.4 * vHighlight;
  vec3 col = img * bright + smoothstep(0.6, 1.0, suv.y) * 0.035;

  // thin luminous edge just inside the screen
  float edge = 1.0 - smoothstep(0.0, aa * 1.5, abs(d + aa * 1.2));
  col += vTint * edge * (0.22 + 0.35 * vSim + 1.1 * vHighlight);

  // soft outer glow
  float g = 1.0 - smoothstep(0.0, uPad, max(d, 0.0));
  g *= g;
  float glowA = g * g * (0.06 + 0.14 * vSim + 0.6 * vHighlight);
  vec3 glowCol = vTint * (0.7 + 0.9 * vHighlight);

  vec3 outCol = mix(glowCol, col, body);
  float a = max(body, glowA) * vOpacity;
  if (a < 0.003) discard;
  gl_FragColor = vec4(outCol, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

/** Decorative dust: soft round additive points with slow bob and twinkle. */
export const dustVertex = /* glsl */ `
attribute float aSize;
attribute float aPhase;
attribute vec3 aColor;

uniform float uTime;
uniform float uScale;

varying vec3 vColor;
varying float vTw;

void main() {
  vec3 p = position;
  p.y += sin(uTime * 0.22 + aPhase) * 0.22;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = clamp(aSize * uScale / max(-mv.z, 0.1), 1.0, 12.0);
  vColor = aColor;
  vTw = 0.55 + 0.45 * sin(uTime * (0.6 + fract(aPhase) * 1.4) + aPhase * 7.0);
}
`;

export const dustFragment = /* glsl */ `
varying vec3 vColor;
varying float vTw;

void main() {
  float r = length(gl_PointCoord - 0.5);
  float a = 1.0 - smoothstep(0.0, 0.5, r);
  a *= a;
  gl_FragColor = vec4(vColor, a * vTw);
  #include <colorspace_fragment>
}
`;

/** Comet trail ribbon: fades along its length and softly across its width. */
export const trailVertex = /* glsl */ `
attribute float aAlpha;
attribute float aSide;

varying float vAlpha;
varying float vSide;

void main() {
  vAlpha = aAlpha;
  vSide = aSide;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

export const trailFragment = /* glsl */ `
uniform vec3 uColor;
uniform vec3 uHead;
uniform float uOpacity;

varying float vAlpha;
varying float vSide;

void main() {
  float across = 1.0 - vSide * vSide;
  float a = vAlpha * across * uOpacity;
  vec3 col = mix(uColor, uHead, vAlpha * vAlpha);
  gl_FragColor = vec4(col, a);
  #include <colorspace_fragment>
}
`;

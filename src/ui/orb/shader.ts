export const vertex = /* glsl */ `
attribute vec2 uv;
attribute vec2 position;
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 0.0, 1.0);
}
`

// An amorphous, matte, softly lit blob (art direction: soft toon render, no
// outlines, gentle rim, subtle grain). Everything is driven by smoothed uniforms.
export const fragment = /* glsl */ `
precision highp float;
varying vec2 vUv;

uniform float uTime;    // flow time (accumulated at a phase-dependent speed)
uniform float uClock;   // wall clock seconds, for grain + ring spin
uniform float uAmp;     // edge displacement
uniform float uSwirl;   // interior swirl
uniform float uGlow;    // outer glow strength
uniform float uDesat;   // 0..1 offline desaturation
uniform float uReact;   // -1..1 reaction (positive flare / negative contract)
uniform float uWobble;  // cognitive wobble
uniform float uEnergy;  // speaking energy 0..1
uniform float uRing;    // tool ring 0..1
uniform float uBreath;  // -1..1 slow idle breathing
uniform float uDay;     // 0 dusk .. 1 daylight (glow becomes a soft tinted shadow)
uniform vec3 uC1;
uniform vec3 uC2;
uniform vec3 uC3;

float cmax(vec3 c) { return max(c.r, max(c.g, c.b)); }
float sat(vec3 c) { float m = cmax(c); return m > 1e-4 ? (m - min(c.r, min(c.g, c.b))) / m : 0.0; }

// Mixing like light, not paint: a plain lerp of two hues (amber + turquoise)
// loses saturation and brightness where they meet and turns muddy. This keeps
// the in-between as saturated and as bright as the two colours it comes from.
vec3 vivid(vec3 x, vec3 y, float t) {
  vec3 c = mix(x, y, t);
  float m = cmax(c);
  float s = sat(c);
  if (s > 1e-4) c = m - (m - c) * min(mix(sat(x), sat(y), t) / s, 2.5);
  return max(c, 0.0) * (mix(cmax(x), cmax(y), t) / max(m, 1e-4));
}

float hash(vec3 p) {
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}

float noise(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(hash(i), hash(i + vec3(1, 0, 0)), f.x),
        mix(hash(i + vec3(0, 1, 0)), hash(i + vec3(1, 1, 0)), f.x), f.y),
    mix(mix(hash(i + vec3(0, 0, 1)), hash(i + vec3(1, 0, 1)), f.x),
        mix(hash(i + vec3(0, 1, 1)), hash(i + vec3(1, 1, 1)), f.x), f.y),
    f.z);
}

float fbm(vec3 p) {
  float a = 0.5;
  float s = 0.0;
  for (int i = 0; i < 4; i++) {
    s += a * noise(p);
    p *= 2.03;
    a *= 0.5;
  }
  return s;
}

void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float r = length(p);
  float ang = atan(p.y, p.x);
  vec2 dir = vec2(cos(ang), sin(ang));

  // Silhouette: noise on the unit circle, so the edge stays continuous.
  float base = 0.6 * (1.0 + uReact * 0.07 + uBreath * 0.03);
  float n = fbm(vec3(dir * (1.25 + uWobble * 1.6), uTime * 0.55));
  float disp = (n - 0.5) * 2.0 * uAmp + sin(ang * 3.0 + uTime * 1.2) * uAmp * 0.3;
  float R = base + disp;
  float d = r - R;
  float body = 1.0 - smoothstep(-0.01, 0.01, d);

  // Interior: two swirled fbm fields blend the three mood colours.
  float sw = uSwirl * (1.0 - r) * 2.4 + uTime * 0.18;
  float cs = cos(sw);
  float sn = sin(sw);
  vec2 q = mat2(cs, -sn, sn, cs) * p;
  float f1 = fbm(vec3(q * 1.6, uTime * 0.32));
  float f2 = fbm(vec3(q * 3.0 + 4.0, uTime * 0.46));
  vec3 col = vivid(uC1, uC2, smoothstep(0.28, 0.72, f1));
  col = vivid(col, uC3, smoothstep(0.58, 0.9, f2) * 0.6);

  // Soft volume: darker toward the edge, broad low-contrast key light top-left.
  float rr = clamp(r / R, 0.0, 1.0);
  col *= mix(1.06, 0.5, pow(rr, 2.3));
  float key = smoothstep(0.95, 0.0, length(p - vec2(-0.26, 0.3)));
  col += key * 0.09 * vec3(1.0, 0.95, 0.85);

  // Gentle rim.
  float rim = smoothstep(0.72, 1.0, rr) * body;
  col += rim * mix(uC3, vec3(1.0), 0.25) * (0.22 + uEnergy * 0.5);

  col *= 1.0 + uEnergy * 0.22 + max(uReact, 0.0) * 0.32;
  col *= 1.0 + min(uReact, 0.0) * 0.25;

  float lum = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(col, vec3(lum) * mix(0.65, 0.9, uDay), uDesat);

  // Outer glow at dusk; in daylight a light glow reads as dirt on cream, so it
  // becomes a soft, mood-tinted contact shadow beneath the blob instead.
  float glow = exp(-max(d, 0.0) * 8.5) * (1.0 - body) * uGlow * (1.0 - uDay * 0.75);
  vec3 gcol = vivid(uC1, uC2, 0.5) * mix(1.0, 0.35, uDesat);
  float sd = length(p - vec2(0.0, -0.07)) - R;
  float shadow = exp(-max(sd, 0.0) * 7.0) * (1.0 - body) * 0.32 * uDay;
  vec3 scol = uC2 * 0.45;

  // Tool ring: a thin dashed orbit that spins while a tool runs.
  float ringR = R + 0.12;
  float ring = smoothstep(0.011, 0.0, abs(r - ringR)) * uRing;
  ring *= mix(0.2, 1.0, step(0.45, fract(ang / 6.2831853 * 4.0 - uClock * 0.4)));

  // Film grain.
  float g = hash(vec3(gl_FragCoord.xy, floor(uClock * 24.0))) - 0.5;
  col += g * 0.025 * body;

  vec3 ringCol = mix(vec3(0.94, 0.92, 0.82), vec3(0.34, 0.49, 0.54), uDay);
  vec3 outc = col * body + gcol * glow + scol * shadow + ringCol * ring;
  float a = clamp(body + glow * 0.85 + shadow + ring, 0.0, 1.0);
  gl_FragColor = vec4(outc, a);
}
`

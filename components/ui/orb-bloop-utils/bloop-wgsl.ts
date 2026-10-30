/**
 * Watercolor "bloop" orb — a single fullscreen fragment pass.
 *
 * vgpu generates the fullscreen vertex stage (uv in 0..1, origin top-left) and
 * packs the `ubo` object passed to `fx.set()` into this uniform buffer by member
 * name, so every field name below is part of the component's contract.
 *
 * Output is premultiplied (`blend: "premultiplied"` + a fully transparent clear),
 * which lets the shader own its own edge: alpha falls off sharply at the blob
 * boundary, so the orb sits crisply on the page with no additive halo.
 */

import { prepareShader } from "@vgpu/wgsl/prepare";
import type { ShaderSource } from "@vgpu/wgsl";

export const BLOOP_WGSL_SOURCE = /* wgsl */ `
struct OrbUniforms {
  time: f32,
  micLevel: f32,
  stateListen: f32,
  listenTimestamp: f32,
  stateThink: f32,
  thinkTimestamp: f32,
  stateSpeak: f32,
  speakTimestamp: f32,
  avgMag: vec4f,
  cumulativeAudio: vec4f,
  viewport: vec2f,
  watercolorStrength: f32,
  watercolorAnimated: f32,
  bloopColorMain: vec4f,
  bloopColorLow: vec4f,
  bloopColorMid: vec4f,
  bloopColorHigh: vec4f,
}

@group(0) @binding(0) var<uniform> ubo: OrbUniforms;

struct FragmentInput {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
}

fn hash21(p: vec2f) -> f32 {
  var q = fract(p * vec2f(123.34, 345.45));
  q = q + dot(q, q + 34.345);
  return fract(q.x * q.y);
}

fn vnoise(p: vec2f) -> f32 {
  let i = floor(p);
  let f = fract(p);
  let u = f * f * (3.0 - 2.0 * f);
  let a = hash21(i);
  let b = hash21(i + vec2f(1.0, 0.0));
  let c = hash21(i + vec2f(0.0, 1.0));
  let d = hash21(i + vec2f(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

fn fbm(p0: vec2f) -> f32 {
  var p = p0;
  var amp = 0.5;
  var sum = 0.0;
  for (var i = 0; i < 5; i = i + 1) {
    sum = sum + amp * vnoise(p);
    p = p * 2.03 + vec2f(19.7, 7.3);
    amp = amp * 0.5;
  }
  return sum;
}

fn rotate(p: vec2f, a: f32) -> vec2f {
  let c = cos(a);
  let s = sin(a);
  return vec2f(c * p.x - s * p.y, s * p.x + c * p.y);
}

@fragment fn fs_main(input: FragmentInput) -> @location(0) vec4f {
  let aspect = select(1.0, ubo.viewport.x / ubo.viewport.y, ubo.viewport.y > 0.0);
  var p = (input.uv - vec2f(0.5)) * 2.0;
  p.x = p.x * aspect;

  let t = ubo.time;

  // Entry ramps: 0 -> 1 over the first half second of a state, so transitions
  // ease instead of popping. The inactive states stay pinned at 0.
  let listenRamp = ubo.stateListen * smoothstep(0.0, 0.5, max(t - ubo.listenTimestamp, 0.0));
  let thinkRamp = ubo.stateThink * smoothstep(0.0, 0.5, max(t - ubo.thinkTimestamp, 0.0));
  let speakRamp = ubo.stateSpeak * smoothstep(0.0, 0.4, max(t - ubo.speakTimestamp, 0.0));
  let idleRamp = clamp(1.0 - (listenRamp + thinkRamp + speakRamp), 0.0, 1.0);

  let energy = clamp(ubo.avgMag.x, 0.0, 1.0);
  let lowBand = clamp(ubo.avgMag.y, 0.0, 1.0);
  let highBand = clamp(ubo.avgMag.w, 0.0, 1.0);
  let mic = clamp(ubo.micLevel, 0.0, 1.0);

  // Think spins the whole noise domain; idle barely drifts.
  let swirl = t * (0.14 + thinkRamp * 0.85);
  let q = rotate(p, swirl);

  // Domain warp gives the pigment its watercolor bleed.
  let wc = ubo.watercolorStrength;
  let warpScale = 1.6 + 1.4 * thinkRamp;
  let drift = ubo.watercolorAnimated * 0.25;
  let w1 = vec2f(
    fbm(q * warpScale + vec2f(t * 0.08 + drift, 0.0)),
    fbm(q * warpScale + vec2f(5.2, 1.3 - t * 0.06)),
  );
  let warped = q + (w1 - vec2f(0.5)) * (0.55 + 1.15 * wc);
  let turb = fbm(warped * (2.2 + 1.8 * wc) + vec2f(0.0, t * 0.12));

  // Radial distance, with the blob edge displaced by the pigment field.
  let r = length(p);
  let wobble = (turb - 0.5) * (0.10 + 0.34 * wc);

  // Listen: concentric rings driven by the live mic level.
  let ripple = listenRamp * 0.035 * sin(r * 16.0 - t * 5.5) * (0.35 + mic);
  // Speak: band-driven lobe pulse — low frequencies swell the body.
  let pulse = speakRamp * (0.055 * lowBand + 0.02 * sin(t * 9.0) * (0.4 + energy));
  // Think / idle: slow breathing at different cadences.
  let breathe = idleRamp * 0.028 * sin(t * 1.2) + thinkRamp * 0.022 * sin(t * 3.1);
  let bob = 0.012 * sin(t * 0.9) * idleRamp;

  let radius = 0.62 + bob + breathe + ripple + pulse + 0.03 * mic * listenRamp;
  let edge = r - radius - wobble * radius * 0.5;

  // A short smoothstep keeps the silhouette crisp instead of glowy.
  let softness = 0.035 + 0.05 * wc;
  let body = 1.0 - smoothstep(-softness, softness, edge);

  // Interior pigment: shade through the palette, brightest where the noise peaks.
  let shade = clamp(turb * 1.25 + 0.12 * sin(t * 0.7) - 0.12 * r, 0.0, 1.0);
  var col = mix(ubo.bloopColorLow.rgb, ubo.bloopColorMid.rgb, smoothstep(0.15, 0.62, shade));
  col = mix(
    col,
    ubo.bloopColorHigh.rgb,
    smoothstep(0.62, 0.98, shade + 0.22 * energy * (0.4 + 0.6 * speakRamp)),
  );
  col = mix(col, ubo.bloopColorMain.rgb, 0.32 + 0.26 * (1.0 - shade));

  // Specular-ish core highlight that drifts and brightens with the voice.
  let corePos = vec2f(-0.22 + 0.06 * sin(t * 0.8), -0.24 + 0.05 * cos(t * 0.6));
  let core = exp(-9.0 * length(p - corePos));
  col = col + ubo.bloopColorHigh.rgb * core * (0.30 + 0.55 * energy);

  // Listen shimmer: fine rings that track the mic level.
  let shimmer = smoothstep(0.4, 1.0, sin(r * 22.0 - t * 6.0));
  col = col + ubo.bloopColorHigh.rgb * listenRamp * 0.18 * shimmer * (0.3 + mic);

  // Speak rim: high band energy lifts the outer shell.
  let rim = smoothstep(0.55, 1.0, r / max(radius, 0.001));
  col = col + ubo.bloopColorMid.rgb * rim * speakRamp * 0.35 * highBand;

  // Think: a counter-rotating inner swirl, seeded by the cumulative audio.
  let swirlIn = fbm(rotate(p, -t * 0.9) * 3.4 + vec2f(ubo.cumulativeAudio.y * 0.4, 0.0));
  col = mix(col, ubo.bloopColorHigh.rgb, thinkRamp * 0.28 * smoothstep(0.55, 0.95, swirlIn));

  // Never let the body go flat black — the palette floor keeps it lit.
  col = max(col, ubo.bloopColorLow.rgb * 0.35);

  let alpha = clamp(body * (0.94 + 0.06 * turb), 0.0, 1.0);

  return vec4f(col * alpha, alpha);
}
`;

/**
 * `vgpu`'s `effect()` refuses raw WGSL strings — it wants a prepared artifact
 * carrying the reflection metadata. `prepareShader` is the runtime equivalent of
 * the `.wgsl` bundler loader, so the shader stays a plain string in source while
 * still reaching `effect()` in the shape it expects.
 */
export const BLOOP_WGSL: ShaderSource = prepareShader(BLOOP_WGSL_SOURCE, "orb-bloop.wgsl");

export default BLOOP_WGSL;

import type { CSSProperties } from "react";

/** Visual state of the orb. Drives the shader's state blend + transition ramps. */
export enum BloopState {
  idle = 0,
  listen = 1,
  think = 2,
  speak = 3,
}

/**
 * - `off`      no audio at all
 * - `ambient`  synthetic idle breathing (no audio graph is created)
 * - `element`  analyse a caller-provided `<audio>` element
 * - `src`      analyse an audio source URL (a detached `<audio>` is created)
 */
export type OrbAudioMode = "off" | "ambient" | "element" | "src";

export type OrbColorTuple = readonly [number, number, number];

export interface OrbBloopProps {
  audioMode?: OrbAudioMode;
  audioElement?: HTMLAudioElement | null;
  audioSrc?: string;
  state?: BloopState;
  /** Violet — the dominant body colour (RGB 0..1). */
  bloopColorMain?: OrbColorTuple;
  /** Deepest shadow tone. */
  bloopColorLow?: OrbColorTuple;
  /** Mid body tone. */
  bloopColorMid?: OrbColorTuple;
  /** Brightest highlight tone. */
  bloopColorHigh?: OrbColorTuple;
  /** Rendered size in CSS pixels. The backing store is 512x512. */
  size?: number;
  /** 0..1 — how strongly the domain-warped watercolor turbulence shapes the blob. */
  watercolorStrength?: number;
  /** Let the watercolor warp drift over time. */
  watercolorAnimated?: boolean;
  className?: string;
  style?: CSSProperties;
}

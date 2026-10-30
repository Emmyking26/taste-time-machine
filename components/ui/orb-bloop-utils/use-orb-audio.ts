"use client";

import { useEffect, useRef } from "react";
import { logger } from "./logger";
import type { OrbAudioMode } from "./types";

/** Frequency-band averages in the 0..255 range, refreshed by `update()`. */
export interface OrbAudioAnalyzer {
  update: () => void;
  allAvg: number;
  lowAvg: number;
  midAvg: number;
  highAvg: number;
}

export type OrbAudioAnalyzerRef = { current: OrbAudioAnalyzer | null };

/**
 * Builds a WebAudio analysis graph for the orb. Returns a ref that stays `null`
 * for `off`/`ambient` (the component then falls back to a synthetic idle pulse),
 * so callers can null-check instead of juggling optional effects.
 */
export function useOrbAudio(
  audioMode: OrbAudioMode,
  audioElement?: HTMLAudioElement | null,
  audioSrc?: string,
): OrbAudioAnalyzerRef {
  const analyzerRef = useRef<OrbAudioAnalyzer | null>(null);

  useEffect(() => {
    if (audioMode === "off" || audioMode === "ambient") {
      analyzerRef.current = null;
      return;
    }

    const element =
      audioMode === "element"
        ? (audioElement ?? null)
        : audioSrc
          ? new Audio(audioSrc)
          : null;

    if (!element) {
      analyzerRef.current = null;
      return;
    }

    let context: AudioContext | null = null;
    let source: MediaElementAudioSourceNode | null = null;
    let analyser: AnalyserNode | null = null;
    let bins: Uint8Array<ArrayBuffer> | null = null;
    let disposed = false;

    try {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) {
        analyzerRef.current = null;
        return;
      }

      context = new Ctor();
      source = context.createMediaElementSource(element);
      analyser = context.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.82;

      source.connect(analyser);
      analyser.connect(context.destination);

      bins = new Uint8Array(analyser.frequencyBinCount);

      const binsRef = { current: bins };
      const analyserRef = { current: analyser };

      analyzerRef.current = {
        update() {
          const node = analyserRef.current;
          const data = binsRef.current;
          if (!node || !data) return;

          node.getByteFrequencyData(data);

          let sum = 0;
          let low = 0;
          let mid = 0;
          let high = 0;

          const lowEnd = Math.max(1, Math.floor(data.length * 0.12));
          const midEnd = Math.max(lowEnd + 1, Math.floor(data.length * 0.45));

          for (let i = 0; i < data.length; i += 1) {
            const value = data[i];
            sum += value;
            if (i < lowEnd) low += value;
            else if (i < midEnd) mid += value;
            else high += value;
          }

          this.allAvg = sum / data.length;
          this.lowAvg = low / lowEnd;
          this.midAvg = mid / (midEnd - lowEnd);
          this.highAvg = high / Math.max(1, data.length - midEnd);
        },
        allAvg: 0,
        lowAvg: 0,
        midAvg: 0,
        highAvg: 0,
      };

      if (context.state === "suspended") {
        void context.resume().catch(() => {
          /* autoplay policy — the orb simply stays on its idle pulse */
        });
      }
    } catch (error) {
      logger.warn("OrbBloop audio analysis unavailable:", error);
      analyzerRef.current = null;
    }

    return () => {
      disposed = true;
      analyzerRef.current = null;
      try {
        source?.disconnect();
      } catch {
        /* already torn down */
      }
      try {
        analyser?.disconnect();
      } catch {
        /* already torn down */
      }
      void context?.close().catch(() => undefined);
      if (disposed) bins = null;
    };
  }, [audioMode, audioElement, audioSrc]);

  return analyzerRef;
}

/**
 * Runtime guards shared by the orb: don't burn GPU work for an off-screen or
 * hidden canvas, and degrade to a cheaper path on low-power devices.
 */

export interface GpuGateState {
  /** True while the canvas is off-screen or the document is hidden. */
  paused: boolean;
  /** True when the device/requested profile calls for the reduced path. */
  lowPower: boolean;
}

export interface GpuGate {
  readonly state: GpuGateState;
  /** Minimum milliseconds between rendered frames; 0 = every rAF. */
  readonly frameMs: number;
  readonly dispose: () => void;
}

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function constrainedDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  const nav = navigator as Navigator & { deviceMemory?: number };
  if (typeof nav.deviceMemory === "number" && nav.deviceMemory <= 2) return true;
  return typeof nav.hardwareConcurrency === "number" && nav.hardwareConcurrency <= 2;
}

/**
 * Synchronous visibility check against the viewport. Used to start work that is
 * already on screen without waiting on an IntersectionObserver callback, which
 * is only delivered when the host grants a rendering opportunity.
 */
function isElementVisible(el: HTMLElement): boolean {
  if (typeof window === "undefined") return false;
  if (el.offsetWidth <= 0 && el.offsetHeight <= 0) return false;
  const rect = el.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return false;
  return (
    rect.bottom > 0 &&
    rect.right > 0 &&
    rect.top < (window.innerHeight || 0) &&
    rect.left < (window.innerWidth || 0)
  );
}

/**
 * Watches the canvas so the render loop can pause when nothing is visible, and
 * reports whether the reduced (low-power) path should be used.
 */
export function attachGpuGate(canvas: HTMLCanvasElement): GpuGate {
  const state: GpuGateState = {
    paused: false,
    lowPower: prefersReducedMotion() || constrainedDevice(),
  };

  const disposers: Array<() => void> = [];

  if (typeof IntersectionObserver === "function") {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          state.paused = !entry.isIntersecting;
        }
      },
      { threshold: 0 },
    );
    observer.observe(canvas);
    disposers.push(() => observer.disconnect());
  }

  if (typeof document !== "undefined") {
    const onVisibility = () => {
      if (document.hidden) state.paused = true;
    };
    document.addEventListener("visibilitychange", onVisibility);
    disposers.push(() => document.removeEventListener("visibilitychange", onVisibility));
  }

  if (typeof window !== "undefined" && typeof window.matchMedia === "function") {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onMotionChange = () => {
      state.lowPower = query.matches || constrainedDevice();
    };
    if (typeof query.addEventListener === "function") {
      query.addEventListener("change", onMotionChange);
      disposers.push(() => query.removeEventListener("change", onMotionChange));
    }
  }

  return {
    state,
    frameMs: state.lowPower ? 1000 / 30 : 0,
    dispose: () => {
      for (const dispose of disposers) dispose();
    },
  };
}

/**
 * Runs `start` the first time the canvas scrolls into view (or immediately when
 * IntersectionObserver is unavailable). Returns a disposer for unmount.
 */
export function deferUntilVisible(canvas: HTMLCanvasElement, start: () => void): () => void {
  if (typeof IntersectionObserver !== "function") {
    start();
    return () => {};
  }

  let started = false;
  const begin = () => {
    if (started) return;
    started = true;
    observer.disconnect();
    start();
  };

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        begin();
        return;
      }
    },
    { threshold: 0 },
  );

  observer.observe(canvas);

  // If the canvas is already on screen, start now instead of waiting for the
  // observer's first callback — it isn't guaranteed to arrive promptly (some
  // embedders throttle rendering opportunities), and there's nothing to gain
  // from deferring work that is already visible.
  if (isElementVisible(canvas)) begin();

  return () => observer.disconnect();
}

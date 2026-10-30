type LogArgs = readonly unknown[];

const PREFIX = "[orb-bloop]";

function write(level: "error" | "warn" | "info" | "debug", args: LogArgs) {
  if (typeof console === "undefined") return;
  const fn = console[level];
  if (typeof fn !== "function") return;
  fn.call(console, PREFIX, ...args);
}

/**
 * Prefixed console passthrough. Errors always surface (a failed GPU init should
 * never be silent); the rest only log outside production builds.
 */
const verbose = process.env.NODE_ENV !== "production";

export const logger = {
  error: (...args: LogArgs) => write("error", args),
  warn: (...args: LogArgs) => {
    if (verbose) write("warn", args);
  },
  info: (...args: LogArgs) => {
    if (verbose) write("info", args);
  },
  debug: (...args: LogArgs) => {
    if (verbose) write("debug", args);
  },
};

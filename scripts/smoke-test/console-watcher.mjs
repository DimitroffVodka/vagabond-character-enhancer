/**
 * Captures console errors and warnings produced during a smoke test.
 * Wraps console.error / console.warn at module load and keeps a sliding buffer
 * with timestamps. Snapshot returns the current buffer length; collect returns
 * the slice from the snapshot index to now, filtered by level.
 *
 * The wrappers always pass through to the original console methods, so the
 * watcher is invisible to callers — output still appears in the dev console.
 */
const BUFFER = [];
const MAX = 1000;

// Guard against double-wrap if the module is somehow imported twice (e.g.,
// dev hot-reload, dynamic import). ES modules are singletons per import path
// in production, but the guard is cheap insurance.
if (!console.error.__vceWrapped) {
  const _origError = console.error.bind(console);
  const _origWarn  = console.warn.bind(console);

  console.error = (...args) => {
    BUFFER.push({ ts: Date.now(), level: "error", message: _format(args) });
    if (BUFFER.length > MAX) BUFFER.splice(0, BUFFER.length - MAX);
    _origError(...args);
  };
  console.warn = (...args) => {
    BUFFER.push({ ts: Date.now(), level: "warn", message: _format(args) });
    if (BUFFER.length > MAX) BUFFER.splice(0, BUFFER.length - MAX);
    _origWarn(...args);
  };
  console.error.__vceWrapped = true;
  console.warn.__vceWrapped = true;
}

function _format(args) {
  return args.map(a => {
    if (typeof a === "string") return a;
    if (a instanceof Error) return a.stack ?? a.message ?? String(a);
    if (a && typeof a === "object") {
      try { return JSON.stringify(a); } catch { return String(a); }
    }
    return String(a);
  }).join(" ");
}

export const ConsoleWatcher = {
  /** @returns {number} a token (current buffer length) */
  snapshot() {
    return BUFFER.length;
  },
  /**
   * Returns log entries from `snapshotIndex` onwards.
   * @param {number} snapshotIndex
   * @param {{level?: "error"|"warn"|"all"}} [opts]
   * @returns {Array<{ts:number, level:string, message:string}>}
   */
  collect(snapshotIndex, { level = "error" } = {}) {
    const slice = BUFFER.slice(snapshotIndex);
    if (level === "all") return slice;
    return slice.filter(e => e.level === level);
  }
};

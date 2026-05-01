/**
 * Module-level queue for files dropped into App and routed to the Importer
 * on mount (M-B.1 K2). File objects are not safe to store in Zustand state
 * (non-serializable, can't pass through Immer), so we use a tiny in-memory
 * slot drained by the Importer when it mounts.
 *
 * Lifetime: write → mount → drain-once → cleared. Survives a single React
 * commit cycle. If you need a different queue identity per Importer open,
 * key by `target`.
 */

let _pending = null;

export function queueImporterFiles(files) {
  _pending = files && files.length > 0 ? Array.from(files) : null;
}

export function drainImporterFiles() {
  const out = _pending;
  _pending = null;
  return out || [];
}

export function peekImporterFiles() {
  return _pending ? [..._pending] : [];
}

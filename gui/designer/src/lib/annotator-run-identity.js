/**
 * annotator-run-identity.js — job identity for the Annotator (ANN-INTEGRITY
 * seam BG-033 / observable point 7).
 *
 * A predictor run is launched asynchronously against a specific document and
 * scope. By the time its callback returns, the biolog may have edited the
 * sequence (new document epoch), switched plasmid (new entry), rotated the
 * origin (new topology) or narrowed the scope. A late reply that belongs to a
 * superseded run must be dropped — never merged into the current document's
 * results or verdict.
 *
 * A run key binds together everything that makes a run's answer valid:
 *
 *   entryId + document epoch + topology + frozen scope + a monotonic job number
 *
 * The Annotator captures the key when it launches a job and tags the callback
 * with it; the reducer compares the reply's key against the currently active
 * key and refuses a mismatch.
 *
 * Pure — no React, no store, no DOM.
 */

/** Deterministic signature of the frozen scope (full plasmid vs a region span). */
export function scopeSignature(scope) {
  if (!scope || typeof scope !== 'object') return 'none';
  if (scope.kind === 'region' && scope.region) {
    const r = scope.region;
    return `region:${r.start ?? '?'}:${r.end ?? '?'}:${r.strand ?? 1}`;
  }
  return scope.kind || 'full';
}

/** Canonical document identity. Scope is deliberately NOT part of it. */
export function documentSignature(ctx) {
  const c = ctx || {};
  return [
    c.entryId ?? '?',
    c.docEpoch ?? '?',
    c.topology ?? 'linear',
  ].join('|');
}

/** Frozen execution context for a plugin run, excluding the monotonic job id. */
export function runContextSignature(ctx) {
  return `${documentSignature(ctx)}|${scopeSignature(ctx?.scope)}`;
}

/**
 * Build the unique key for one job. Plugins from the same pipeline share this
 * key, while a later rerun against the same document still gets a new key.
 * @param {{entryId?:string, docEpoch?:number|string, topology?:string, scope?:Object, jobSeq?:number}} ctx
 */
export function makeRunKey(ctx) {
  const c = ctx || {};
  return `${runContextSignature(c)}|${c.jobSeq ?? 0}`;
}

/**
 * Whether a reply is stale relative to the active job. Production replies are
 * fail-closed: an untagged callback cannot prove which document it describes.
 */
export function isStaleReply(activeKey, replyKey) {
  return replyKey == null || activeKey == null || activeKey !== replyKey;
}

/** Monotonic job number successor. */
export function nextJob(prev) {
  const n = Number(prev);
  return Number.isFinite(n) && n >= 0 ? n + 1 : 1;
}

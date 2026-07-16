/**
 * search-worker-core — pure, worker-portable sequence search (P1.5).
 *
 * The benchmark put the sequence dimension at ~385-408 ms on a 1 MB corpus (gate
 * 50 ms) → it must run off the main thread. This module is that work, kept pure so
 * it is unit-testable and identical whether called in a worker or (fallback) inline.
 * One call searches ONE query across MANY documents → one worker round-trip per
 * search, not per document.
 *
 * No incremental index (DEC: keep the worker simple) — each search is a full scan.
 */
import { seqMatch } from './seq-match';

/**
 * @param {string} seqQuery
 * @param {Array<{id:string, seq:string, topology?:string}>} docs
 * @param {Object} [ctx] — bothStrands / maxMismatches / identityThreshold / limit
 * @returns {Object<string, Array>} docId → SearchOccurrence[] (only docs that hit)
 */
export function searchAllSequences(seqQuery, docs, ctx = {}) {
  const byId = {};
  if (!seqQuery || !Array.isArray(docs)) return byId;
  for (const d of docs) {
    if (!d || !d.id || !d.seq) continue;
    const occ = seqMatch(seqQuery, { seq: d.seq, topology: d.topology }, null, ctx);
    if (occ.length) byId[d.id] = occ;
  }
  return byId;
}

/** Worker message handler — echoes `id` so the client can correlate responses. */
export function handleSearchMessage(data) {
  const { id, seqQuery, docs, ctx } = data || {};
  return { id, byId: searchAllSequences(seqQuery, docs, ctx) };
}

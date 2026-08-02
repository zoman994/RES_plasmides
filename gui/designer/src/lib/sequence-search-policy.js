/**
 * sequence-search-policy — the tiny, kernel-free policy constants the MAIN-THREAD transport needs.
 *
 * `search-worker-client` (main thread) needs the §4.2.0 approximate-length limit and the ONE
 * topology rule to re-check worker replies and to rebuild the §4.2.0 route verdict — but it must NOT
 * drag the DNA kernel/scan/verifier onto the main thread to get them. Those two values used to live
 * in `seq-match.js`, whose transitive import graph is the whole gapped/linear engine; importing them
 * from there hoisted the kernel into the eager UI bundle.
 *
 * This leaf holds the definitions; `seq-match.js` re-exports them for backward compatibility, and the
 * client imports them from HERE. No engine imports live in this file, so it stays a true leaf.
 *
 * Pure. No module state.
 */

/**
 * Upper length for LIVE approximate search (SPEC §4.2.0). Exact search is not limited: finding a
 * pasted 400-nt insert verbatim is cheap and is exactly what the biologist expects to work.
 */
export const MAX_APPROX_QUERY_LEN = 100;

/**
 * The ONE way an effective topology is decided, so the engine, the worker core and the client can
 * never disagree about whether a search was circular. Diverging here would let a wrap-origin hit be
 * produced under one rule and rejected as impossible under another.
 * @param {'on'|'off'|'auto'|undefined} circularPref — the user override; 'auto'/absent follows the doc
 * @param {string|undefined} topology — the document's own topology
 * @returns {boolean}
 */
export function resolveCircular(circularPref, topology) {
  if (circularPref === 'on') return true;
  if (circularPref === 'off') return false;
  return topology === 'circular';
}

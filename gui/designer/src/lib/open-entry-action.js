/**
 * open-entry-action — the molecule-open behaviour behind a global-search entry pick
 * (REV #2 §10.4), factored out of LibraryWorkspace so the STANDARD selection path (dirty
 * guard → activate project → common→entry view → perEntryState → parked nav) is unit-testable
 * with injected primitives, not only through a full workspace render.
 *
 * Contract:
 *   • the dirty-guard runs FIRST; if the user cancels it, NOTHING changes (no view switch,
 *     no selection, no project activation, no nav) — the route is a clean no-op.
 *   • the nav occurrence is parked AFTER a confirmed select, never before.
 */
import { navFromLocation } from './nav-target';

/**
 * @param {{ getEntry:(id)=>Object|undefined, guardedSelect:(id)=>boolean,
 *   activateProject?:(projectId)=>void, setView:(view)=>void, setSelectedId:(id)=>void,
 *   initPerEntryState:(id)=>void, requestSequenceNav?:(id,target)=>void }} deps
 * @returns {(id:string, occurrence?:Object)=>void}
 */
export function makeOpenEntry(deps) {
  /**
   * @param {string} id
   * @param {Object} [occurrence] — the locus the row ranked
   * @param {string|number|null} [resultRevision] — the revision the RESULT was computed on. It is
   *   passed in, never re-derived from the entry here: stamping the current revision at click time
   *   is exactly how a stale locus passes the guard it was supposed to fail.
   */
  return function openEntry(id, occurrence, resultRevision = null, resultDocEpoch = null) {
    const entry = deps.getEntry(id);
    // U5-B — returns TRUE only when the molecule was really opened. Back capture must not be built
    // on the assumption that calling this navigated: a cancelled dirty guard and a missing entry
    // both leave the user exactly where they were, and a frame captured for either would offer a
    // return to a place they never left.
    if (!entry) return false;
    // Dirty guard FIRST — a cancelled unsaved-changes prompt leaves everything untouched.
    if (!deps.guardedSelect(id)) return false;
    if (entry.projectId) deps.activateProject?.(entry.projectId);
    deps.setView('entry');
    deps.setSelectedId(id);
    deps.initPerEntryState(id);
    // Park the jump AFTER the select — the inspector consumes it on mount.
    //
    // ALL the physical facts travel: every segment (an origin wrap has two, and the caret can only
    // hold one), the canonical strand (`both` survives), and `identityBps` for the overlay bucket.
    // The former `metricPct` was a float the store dropped on arrival — it never reached a pixel.
    const nav = occurrence?.location ? navFromLocation(occurrence.location, occurrence.metrics) : null;
    if (nav) {
      deps.requestSequenceNav?.(id, {
        segments: nav.segments, caret: nav.caret, strand: nav.strand, strandRaw: nav.strandRaw,
        wrapsOrigin: nav.wrapsOrigin, identityBps: nav.identityBps,
        // The revision the RESULT carried, and the document it names. Global search always runs on
        // the SAVED molecule, so its epoch is that revision's — never the open edit buffer's.
        revision: resultRevision,
        // The epoch the RESULT carried — never one derived here. `version` alone cannot see a saved
        // topology flip or an annotation edit, and those move what a coordinate means.
        docEpoch: resultDocEpoch,
      });
    }
    return true;
  };
}

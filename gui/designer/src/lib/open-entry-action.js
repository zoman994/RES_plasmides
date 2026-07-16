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
import { entryRevision } from './search-document-adapters';
import { metricPercent } from './search-result-format';

/**
 * @param {{ getEntry:(id)=>Object|undefined, guardedSelect:(id)=>boolean,
 *   activateProject?:(projectId)=>void, setView:(view)=>void, setSelectedId:(id)=>void,
 *   initPerEntryState:(id)=>void, requestSequenceNav?:(id,target)=>void }} deps
 * @returns {(id:string, occurrence?:Object)=>void}
 */
export function makeOpenEntry(deps) {
  return function openEntry(id, occurrence) {
    const entry = deps.getEntry(id);
    if (!entry) return;
    // Dirty guard FIRST — a cancelled unsaved-changes prompt leaves everything untouched.
    if (!deps.guardedSelect(id)) return;
    if (entry.projectId) deps.activateProject?.(entry.projectId);
    deps.setView('entry');
    deps.setSelectedId(id);
    deps.initPerEntryState(id);
    // Park the jump AFTER the select — the inspector consumes it on mount.
    const nav = occurrence?.location ? navFromLocation(occurrence.location) : null;
    if (nav) {
      deps.requestSequenceNav?.(id, {
        segments: nav.segments, caret: nav.caret, strand: nav.strand,
        revision: entryRevision(entry),
        metricPct: occurrence?.metrics ? metricPercent(occurrence.metrics) : 1,
      });
    }
  };
}

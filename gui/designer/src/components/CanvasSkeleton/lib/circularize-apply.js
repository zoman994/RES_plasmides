/**
 * circularize-apply — M-CIRCULARIZE C1. Pure: maps the CircularizeModal decision
 * ({ circular, method, applyToAll }) to the ordered store actions the editor
 * dispatches. Kept out of AssemblyShellBody so the file stays under the size
 * budget and the decision logic is unit-testable in isolation.
 *
 * Decision (Игорь 12.06): one method for the WHOLE assembly when «применить ко
 * всем», else only the closure junction (last→first). Topology is always set.
 * Single-fragment self-closure config is C3 (closureBoundary still guards <2).
 */
import { pairKeyFor } from './junction-derive';

export function circularizeActions({
  draftId, circular, method, applyToAll, isZoneTarget, segments,
}) {
  const out = [{ kind: 'topology', draftId, circular }];
  if (isZoneTarget && method) {
    if (applyToAll) {
      out.push({ kind: 'assemblyMethod', zoneId: draftId, method });
    } else if (circular) {
      const segs = segments || [];
      if (segs.length >= 2) {
        out.push({
          kind: 'closureMethod',
          zoneId: draftId,
          pairKey: pairKeyFor(segs[segs.length - 1].id, segs[0].id),
          method,
        });
      }
    }
  }
  return out;
}

/**
 * applyCircularize — thin imperative wrapper: dispatch the circularizeActions
 * through the skeleton `actions`. Keeps the editor's confirm handler tiny.
 */
export function applyCircularize(actions, params) {
  for (const a of circularizeActions(params)) {
    if (a.kind === 'topology') actions.setAssemblyDraftTopology(a.draftId, a.circular);
    else if (a.kind === 'assemblyMethod') actions.zoneDispatch({ type: 'SET_ASSEMBLY_METHOD', zoneId: a.zoneId, method: a.method });
    else if (a.kind === 'closureMethod') actions.zoneDispatch({ type: 'SET_BOUNDARY_OVERLAP', zoneId: a.zoneId, pairKey: a.pairKey, method: a.method, autoMode: 'manual' });
  }
}

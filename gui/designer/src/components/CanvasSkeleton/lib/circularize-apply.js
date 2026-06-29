/**
 * circularize-apply — RC-SEP (Игорь 25.06 «чётко разделить настройку стыков и
 * кольцевание»). CLEAN SEPARATION:
 *   • TOPOLOGY (линейная / кольцевая) is a header segmented toggle → SET_ZONE_TOPOLOGY,
 *     set directly by AssemblyShellBody (NOT here).
 *   • INTERNAL junctions live on the strip ромбы (per-boundary SET_BOUNDARY_OVERLAP).
 *   • THIS maps the «Замыкание» (closure-reaction) decision → SET_CLOSURE_METHOD, which
 *     stores the ring-closing reaction as ONE assembly property (zone.closureMethod),
 *     read by closureSeam (gate/display) + methodsFromJunctions (realise). It is NOT an
 *     internal junction and NOT the topology — fully decoupled.
 */

/** @returns {Array<{kind:'closureMethod', zoneId, method, enzyme}>} empty when no method. */
export function closureActions({ draftId, method, enzyme = null }) {
  if (!method) return [];
  return [{
    kind: 'closureMethod', zoneId: draftId, method, enzyme,
  }];
}

/** Dispatch the closure-method action through the skeleton `actions`. */
export function applyClosure(actions, params) {
  for (const a of closureActions(params)) {
    if (a.kind === 'closureMethod') {
      actions.zoneDispatch({
        type: 'SET_CLOSURE_METHOD', zoneId: a.zoneId, method: a.method, enzyme: a.enzyme,
      });
    }
  }
}

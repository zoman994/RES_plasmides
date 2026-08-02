/**
 * search-pick-route — kind-aware routing of a picked search result (REV #2 §10.4/§10.5).
 *
 * `onPickSearchResult(entityRef, occurrence)` maps to a discriminated action the surface
 * dispatches. Routing is BY `entityRef.kind` so an entry / project / primer that share a
 * local id never collide; `entityRef.id` stays RAW (the nav channel + store lookups match
 * the bare id). The enzyme route opens a CARD — the cut-site scan is a SEPARATE action on
 * the card, never an implicit `re:` query rewrite.
 *
 * Pure. No React/store imports.
 *
 * @typedef {{type:'openMolecule',id:string,occurrence:Object|null}
 *   |{type:'activateProject',id:string}
 *   |{type:'openPrimer',id:string}
 *   |{type:'openEnzymeCard',id:string}
 *   |{type:'unknown',kind:string,id:string}
 *   |{type:'none'}} SearchPickAction
 */

/**
 * @param {{kind?:string,id?:string}} entityRef
 * @param {Object} [occurrence] — best sequence occurrence (carries the jump location)
 * @returns {SearchPickAction}
 */
export function resolveSearchPick(entityRef, occurrence) {
  const kind = entityRef?.kind;
  const id = entityRef?.id;
  if (!kind || id == null) return { type: 'none' };
  switch (kind) {
    // U5-B — the REVISION the result was computed on travels with it. Re-deriving it from the
    // current entry at click time (what the sink used to do) makes every result look fresh: a hit
    // found on version N would pass the stale guard against version N+1 and select bases that have
    // moved. `null` when the producer carried none — unverifiable, not silently "current".
    case 'entry': return {
      type: 'openMolecule',
      id,
      occurrence: occurrence || null,
      revision: entityRef.revision ?? null,
      // The identity of the document the search READ. Recomputing it at click time would name
      // whatever the molecule is now — which is exactly the staleness the field exists to catch.
      docEpoch: entityRef.docEpoch ?? null,
    };
    case 'project': return { type: 'activateProject', id };
    case 'primer': return { type: 'openPrimer', id };
    case 'enzyme': return { type: 'openEnzymeCard', id };
    default: return { type: 'unknown', kind, id };
  }
}

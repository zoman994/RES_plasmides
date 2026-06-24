/**
 * assembly-mutation-plan — read over an assembly draft: for every segment
 * carrying in-editor mutations (recorded by ADD_PIECE_MUTATION as
 * length-preserving substitutions), derive the molecular MECHANISM that
 * realises the edit (KLD vs overlap-extension) + viability blockers,
 * reusing mutation-to-mechanism (Кирпич 1).
 *
 * Coordinate note: `draftFromZone` stores the MUTANT sequence on the
 * segment (applyPieceMutations) plus the substitution list. The mutagenesis
 * engine needs the WILD-TYPE template (it re-applies the mutations + designs
 * primers on the wild-type), so we revert the substitutions first.
 *
 * Pure: no store, no React. Wiring memo-izes this and surfaces it; Кирпич 3
 * realises the plan onto the canvas op-graph.
 */
import { deriveMutationMechanism, mechanismLabel } from './mutation-to-mechanism';

/**
 * wildTypeSequence — revert a segment's recorded substitutions to recover
 * the pre-edit template. Length-preserving (each substitution carries
 * `fromBase`); positions are LOCAL to the segment.
 */
export function wildTypeSequence(segment) {
  let wt = typeof segment.sequence === 'string' ? segment.sequence : '';
  for (const m of (segment.mutations || [])) {
    if (!m || !Number.isFinite(m.position) || !m.fromBase) continue;
    const len = m.toBase ? String(m.toBase).length : 1;
    wt = wt.slice(0, m.position) + m.fromBase + wt.slice(m.position + len);
  }
  return wt;
}

/** Fragment context for the mutagenesis engine, derived from the draft. */
function segmentContext(draft, segment) {
  const circular = !!(draft.topology && draft.topology.circular);
  const ctx = {
    topology: circular ? 'circular' : 'linear',
    // Standalone = the whole template is this one piece (the KLD case: edit a
    // picked plasmid). Multi-segment assemblies are not standalone.
    isStandalone: ((draft.segments || []).length === 1),
    length: (typeof segment.sequence === 'string' ? segment.sequence.length : 0),
  };
  // Only pass the No-PCR flag when explicitly false, so the ⚓ guard fires
  // exactly for non-amplifiable fragments.
  if (segment.needsAmplification === false) ctx.needsAmplification = false;
  return ctx;
}

/**
 * assemblyMutationPlan — per-segment derived mechanism for an edited draft.
 * @returns {{perSegment:Array<{segmentId,mechanism,label,blockers,mutationCount}>,
 *            count:number, anyBlocker:boolean}}
 */
export function assemblyMutationPlan(draft, { forceStrategy = null } = {}) {
  const segments = (draft && draft.segments) || [];
  const perSegment = [];
  for (const seg of segments) {
    const muts = Array.isArray(seg.mutations) ? seg.mutations : [];
    if (muts.length === 0) continue;
    const ctx = segmentContext(draft, seg);
    const derived = deriveMutationMechanism({
      templateSequence: wildTypeSequence(seg),
      editorMutations: muts,
      fragmentContext: ctx,
      options: { forceStrategy },
    });
    if (!derived.mechanism) continue;
    const plan = derived.plan || {};
    perSegment.push({
      segmentId: seg.id,
      mechanism: derived.mechanism,
      label: mechanismLabel(derived.mechanism),
      blockers: derived.blockers,
      mutationCount: derived.mutations.length,
      // Кирпич 4 — KLD is a valid alternative only on a circular standalone
      // template (reverse PCR of the whole plasmid); drives the swap affordance.
      canKld: ctx.topology === 'circular' && ctx.isStandalone !== false,
      // 3b — segment-local position of the (first) edit, so the wiring can map
      // it to an assembly coord and position the derived primer pair.
      anchorLocalPos: (derived.mutations[0] && derived.mutations[0].dnaPosition) || 0,
      // 3a — the wet-lab output derived from the edit: primers + protocol.
      // (KLD designs the pair here; overlap-extension leaves primers to the
      // assembly engine → primerCount 0 until realised.)
      primers: Array.isArray(plan.primers) ? plan.primers : [],
      primerCount: Array.isArray(plan.primers) ? plan.primers.length : 0,
      protocol: typeof plan.protocol === 'string' ? plan.protocol : '',
    });
  }
  return {
    perSegment,
    count: perSegment.length,
    anyBlocker: perSegment.some((p) => p.blockers.length > 0),
  };
}

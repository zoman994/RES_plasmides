/**
 * junction-derive — pure helpers for the per-junction config model
 * (SPEC_ASSEMBLY_JUNCTION_MODULE §4/§5, layer 3 step 1; J1/J2/J3).
 *
 * The home of `pairKey` and the boundary topology. The engine
 * (primer-derive A3) and the zone-slice both key `zone.junctions` through
 * `pairKeyFor` here — never building the key string themselves (carry-note:
 * one format, no drift).
 *
 *   pairKey            = `${leftSegmentId}__${rightSegmentId}`  (NOT an index —
 *                        survives reorder / split; in a zone draft
 *                        segment.id === piece.id, so the picker's
 *                        {fromPieceId,toPieceId} maps straight to a pairKey).
 *   internalBoundaries = the N−1 fuse junctions (role 'internal').
 *   closureBoundary    = the synthetic last↔first junction (role 'closure'),
 *                        ONLY when topology.circular (J2).
 *   seedJunction       = the default config record (J3 default = overlap).
 */
import { segmentBoundaries } from './assembly-model';
import { METHOD_TO_JUNCTION } from './zone-pieces-to-dag';
import { defaultJunctionParams } from '../canvas/junction-styles';

/** Default junction method (engine dict). J3 — default fuse is overlap PCR. */
export const DEFAULT_JUNCTION_METHOD = 'overlap_pcr';
const DEFAULT_BINDING_LENGTH = 20;

// Two-level method whitelists (J2, real engine-dict values; §9a).
export const INTERNAL_METHODS = ['overlap_pcr', 'restriction'];
export const CLOSURE_METHODS = ['gibson', 'golden_gate', 'kld', 'restriction', 'overlap_pcr'];

/** Stable junction key from the two flanking segment/piece ids. */
export function pairKeyFor(leftId, rightId) {
  return `${leftId}__${rightId}`;
}

/** Map an engine method → junction.kind (palette / inferEndRequirements). */
export function junctionKindForMethod(method) {
  return METHOD_TO_JUNCTION[method] || 'overlap';
}

// Reverse map junction.kind → canonical engine method (for the UI: JunctionControl
// edits in junction.kind via JunctionPopover, writes the engine method to
// zone.junctions). `preformed`/`ligation` (no overlap reaction) → direct_ligation.
const JUNCTION_KIND_TO_METHOD = {
  overlap: 'overlap_pcr',
  golden_gate: 'golden_gate',
  re_ligation: 'restriction',
  ligation: 'direct_ligation',
  kld: 'kld',
  preformed: 'direct_ligation',
};
export function methodForJunctionKind(kind) {
  return JUNCTION_KIND_TO_METHOD[kind] || DEFAULT_JUNCTION_METHOD;
}

/**
 * Seed a default config record for a junction (J3). `method` is an engine-dict
 * value (default `overlap_pcr`); overlap params come from junction-styles, and
 * the binding pair defaults to 20 / no-Tm (A1b back-compat).
 */
export function seedJunction(method = DEFAULT_JUNCTION_METHOD) {
  const params = defaultJunctionParams(junctionKindForMethod(method));
  return {
    method,
    overlapTarget: params.overlapTarget,
    overlapLength: params.overlapLength,
    overlapTm: params.overlapTm,
    bindingLength: DEFAULT_BINDING_LENGTH,
    bindingTm: null,
  };
}

/**
 * Internal fuse boundaries of a zone draft — the N−1 joins between
 * consecutive segments, keyed by segment-id pair. Each carries the assembly
 * offset (for UI positioning) and role 'internal'.
 */
export function internalBoundaries(draft) {
  let boundaries = [];
  try {
    boundaries = segmentBoundaries(draft).boundaries || [];
  } catch {
    return [];
  }
  const out = [];
  for (let i = 0; i < boundaries.length - 1; i += 1) {
    const L = boundaries[i];
    const R = boundaries[i + 1];
    if (!L || !R) continue;
    out.push({
      pairKey: pairKeyFor(L.segmentId, R.segmentId),
      leftId: L.segmentId,
      rightId: R.segmentId,
      role: 'internal',
      offset: L.endOnAssembly,
    });
  }
  return out;
}

/**
 * The synthetic closure junction (last↔first) — present ONLY when the zone is
 * circular (J2/J4). `segmentBoundaries` never returns it (it's not an internal
 * cut), so JUNCTION_MODULE synthesises it; null on linear topology.
 */
export function closureBoundary(draft) {
  if (!draft || !draft.topology || draft.topology.circular !== true) return null;
  let boundaries = [];
  try {
    boundaries = segmentBoundaries(draft).boundaries || [];
  } catch {
    return null;
  }
  if (boundaries.length < 2) return null;
  const last = boundaries[boundaries.length - 1];
  const first = boundaries[0];
  return {
    pairKey: pairKeyFor(last.segmentId, first.segmentId),
    leftId: last.segmentId,
    rightId: first.segmentId,
    role: 'closure',
    offset: last.endOnAssembly,
  };
}

/** All junctions of a draft (internal + closure-when-circular). */
export function allBoundaries(draft) {
  const closure = closureBoundary(draft);
  const internal = internalBoundaries(draft);
  return closure ? [...internal, closure] : internal;
}

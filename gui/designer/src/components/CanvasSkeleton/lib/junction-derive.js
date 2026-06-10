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
import { defaultJunctionParams, junctionStroke, junctionFill } from '../canvas/junction-styles';

/** Default junction method (engine dict). J3 — default fuse is overlap PCR. */
export const DEFAULT_JUNCTION_METHOD = 'overlap_pcr';
const DEFAULT_BINDING_TM = 60; // annealing Tm target for seeded junctions (A1b)

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
 * the binding pair is Tm-targeted by default (bindingLength null + bindingTm 60,
 * A1b) so seeded junctions extend AT-rich ends instead of shipping flat 20 nt.
 */
export function seedJunction(method = DEFAULT_JUNCTION_METHOD) {
  const params = defaultJunctionParams(junctionKindForMethod(method));
  return {
    method,
    overlapTarget: params.overlapTarget,
    overlapLength: params.overlapLength,
    overlapTm: params.overlapTm,
    bindingLength: null,
    bindingTm: DEFAULT_BINDING_TM,
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

/**
 * JUNCTION step-2 FIX — enrich a coloredZones array (one entry per ordered
 * segment, in assembly order) with a `junctionRight` descriptor on each
 * NON-last zone: the internal boundary to the next segment. The descriptor
 * carries the engine method (from zone.junctions[pairKey], default
 * overlap_pcr) plus its junction.kind for the strip-glyph palette. This is
 * what SegmentZonesOverlay reads to draw the clickable junction glyph on the
 * LIVE assembly editor strip. Pure: returns a new array, inputs untouched.
 */
export function enrichZonesWithJunctions(coloredZones, zoneJunctions = {}, assemblyMethod = null) {
  const zones = Array.isArray(coloredZones) ? coloredZones : [];
  return zones.map((z, i) => {
    const next = zones[i + 1];
    if (!next) return { ...z };
    const pairKey = pairKeyFor(z.zoneId, next.zoneId);
    const cfg = zoneJunctions[pairKey];
    const method = (cfg && cfg.method) || DEFAULT_JUNCTION_METHOD;
    const kind = junctionKindForMethod(method);
    // UX slice 3 — this junction overrides the construct-level method.
    const differsFromAssembly = !!assemblyMethod && method !== assemblyMethod;
    // UX trust state (no biology): 'decided' = a human touched this junction
    // (any edit via SET_BOUNDARY_OVERLAP stamps autoMode:'manual'); everything
    // else — a seeded/reset auto-guess — is 'tentative'. The strip glyph draws
    // decided solid and tentative hollow so a biologist sees, at a glance,
    // which joins are confirmed vs still a default guess (before opening any popup).
    const state = (cfg && cfg.autoMode === 'manual') ? 'decided' : 'tentative';
    return {
      ...z,
      junctionRight: {
        pairKey,
        method,
        kind,
        state,
        differsFromAssembly,
        // Palette pre-resolved here (CanvasSkeleton owns junction-styles) so
        // the shared SegmentZonesOverlay needn't import across layers.
        stroke: junctionStroke(kind),
        fill: junctionFill(kind),
        fromPieceId: z.zoneId,
        toPieceId: next.zoneId,
      },
    };
  });
}

/**
 * UX slice 4 — one readiness summary for the whole assembly, derived from the
 * enriched coloredZones' junctionRight trust states (a biologist gets ONE answer
 * to "is this settled?" instead of integrating N junctions). ready = there ARE
 * junctions and none is still a tentative default. Pure.
 */
export function assemblyReadiness(coloredZones) {
  const js = (Array.isArray(coloredZones) ? coloredZones : [])
    .map((z) => z && z.junctionRight)
    .filter(Boolean);
  const tentative = js.filter((j) => j.state === 'tentative').length;
  const differs = js.filter((j) => j.differsFromAssembly).length;
  return {
    total: js.length, tentative, differs, ready: js.length > 0 && tentative === 0,
  };
}

/**
 * JUNCTION step-2 FIX (J9) — per-boundary methods map for realiseAssembly,
 * keyed by boundary INDEX (0..N−2, segment order — the shape realiseAssembly
 * already consumes). The junction config (zone.junctions[pairKey].method) is
 * the source of truth; falls back to the A4 suggestion, then gibson. The
 * RealiseModal builds its `methods` from this instead of the (removed) radio
 * picker — the strip junction owns the method, the modal only reflects it. Pure.
 */
export function methodsFromJunctions(draft, zoneJunctions = {}, suggestions = []) {
  const internal = internalBoundaries(draft);
  const out = {};
  internal.forEach((b, i) => {
    const cfg = zoneJunctions[b.pairKey];
    out[i] = (cfg && cfg.method)
      || (suggestions[i] && suggestions[i].method)
      || 'gibson';
  });
  return out;
}

/**
 * junction-derive — pure helpers for the per-junction config model
 * (canonical contract: docs/specs/ASSEMBLY_WORKBENCH.md).
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
import { junctionInterlock } from './segment-overhangs';
import { defaultJunctionParams, junctionStroke, junctionFill } from '../canvas/junction-styles';

/** Default junction method (engine dict). J3 — default fuse is overlap PCR. */
export const DEFAULT_JUNCTION_METHOD = 'overlap_pcr';
const DEFAULT_BINDING_TM = 60; // annealing Tm target for seeded junctions (A1b)

// Two-level method whitelists (J2, real engine-dict values; §9a).
// Игорь 25.06: «дать возможность миксовать типы методов сборки» — an internal
// fuse between two linear fragments can be made by overlap/Gibson homology, Type
// IIS (Golden Gate), classical RE sticky-end ligation, OR blunt (direct) ligation.
// Each junction picks independently → mixed-method assemblies. (KLD stays OUT — it
// is back-to-back site-directed mutagenesis of ONE plasmid, not a two-fragment
// fuse.) The CLOSURE (ring) is a SEPARATE decision (CircularizeModal / CLOSURE_METHODS).
export const INTERNAL_METHODS = ['overlap_pcr', 'golden_gate', 'restriction', 'direct_ligation'];
// CLOSURE = the ring-closing reactions (CircularizeModal appends blunt direct_ligation
// itself — do NOT add it here or it double-renders). RC-SEP (Игорь 25.06): overlap_pcr
// is OUT — it stitches fragments into a LINEAR product; the ring-forming counterpart of
// overlap homology is Gibson. A closure reaction actually closes the ends into a circle:
// Gibson (homology) / Golden Gate (Type IIS) / KLD (1-fragment PCR self-closure) /
// RE sticky ligation / blunt ligation.
// SLIC (overlap homology, Gibson-family) + MoClo (standardized Type IIS = Golden Gate
// preset, BsaI) are ring-forming chemistries too — selectable as closure/assembly methods
// (CircularizeModal). They reuse the gibson / golden_gate ops + junction kinds (see
// METHOD_TO_OP_KIND / METHOD_TO_JUNCTION), so NO new op kind. They are NOT in INTERNAL_METHODS
// (would just duplicate the overlap / golden_gate kinds in the kind-based junction picker).
export const CLOSURE_METHODS = ['gibson', 'golden_gate', 'kld', 'restriction', 'slic', 'moclo'];

/** Stable junction key from the two flanking segment/piece ids. */
export function pairKeyFor(leftId, rightId) {
  return `${leftId}__${rightId}`;
}

/** Map an engine method → junction.kind (palette / inferEndRequirements). */
export function junctionKindForMethod(method) {
  return METHOD_TO_JUNCTION[method] || 'overlap';
}

/**
 * F — the default enzyme for an enzyme-driven method. Golden Gate needs ONE
 * Type IIS enzyme (BsaI = the MoClo/iGEM standard); RE-лигирование needs a
 * classical restriction enzyme (EcoRI = the canonical default). Non-enzyme
 * methods (overlap/gibson/kld/blunt) → null (no enzyme field on the junction).
 * The UI picker lets the biolog change it; this only keeps a junction
 * realisable out of the box instead of shipping a placeholder recognition.
 */
export function defaultEnzymeForMethod(method) {
  if (method === 'golden_gate' || method === 'moclo') return 'BsaI'; // MoClo = Type IIS preset
  if (method === 'restriction') return 'EcoRI';
  return null; // overlap / gibson / slic / kld / blunt carry no enzyme
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
export function seedJunction(method = DEFAULT_JUNCTION_METHOD, enzyme) {
  const params = defaultJunctionParams(junctionKindForMethod(method));
  const seed = {
    method,
    overlapTarget: params.overlapTarget,
    overlapLength: params.overlapLength,
    overlapTm: params.overlapTm,
    bindingLength: null,
    bindingTm: DEFAULT_BINDING_TM,
  };
  // F — an enzyme-driven method (GG / RE) seeds with a default enzyme (explicit
  // arg wins) so the junction is realisable out of the box; overlap/kld/blunt
  // carry NO enzyme field (shape unchanged for the overlap default).
  const enz = enzyme !== undefined ? enzyme : defaultEnzymeForMethod(method);
  if (enz) seed.enzyme = enz;
  return seed;
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
 *
 * M-CIRCULARIZE C3 — a SINGLE-fragment circular assembly closes its own two
 * ends (self-closure: last === first === the only segment). `selfClosure: true`
 * marks it so realise emits a self-closure op (KLD / blunt) instead of a join
 * between distinct fragments.
 */
export function closureBoundary(draft) {
  if (!draft || !draft.topology || draft.topology.circular !== true) return null;
  let boundaries = [];
  try {
    boundaries = segmentBoundaries(draft).boundaries || [];
  } catch {
    return null;
  }
  if (boundaries.length < 1) return null;
  const last = boundaries[boundaries.length - 1];
  const first = boundaries[0];
  return {
    pairKey: pairKeyFor(last.segmentId, first.segmentId),
    leftId: last.segmentId,
    rightId: first.segmentId,
    role: 'closure',
    offset: last.endOnAssembly,
    selfClosure: boundaries.length === 1,
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
// S1 (V161) — junction kinds that join the two ends AS-IS, so a physical
// sticky/blunt end mismatch (V160 junctionInterlock 'incompatible') makes them
// un-ligatable. overlap/Gibson/Golden-Gate are NOT here: they rework the ends
// (homology arms / Type IIS fusion sites), so an RE-overhang mismatch is
// irrelevant there and must not block the build.
const STICKY_JOIN_KINDS = ['re_ligation', 'ligation', 'kld'];

// V196 (e2e-cloning-hunt) — a non-mating physical interlock (junctionInterlock
// 'incompatible', which only arises between two REAL RE overhangs) BLOCKS the build
// when the join uses the ends as-is. Two cases count:
//   • a direct sticky-join method (STICKY_JOIN_KINDS) — always; OR
//   • an UNDECIDED default junction (state !== 'decided') — the biologist has NOT opted
//     into a homology method, so the seeded overlap_pcr default must not silently green-
//     light a plasmid whose raw ends physically cannot ligate. A DECIDED overlap / gibson
//     / golden_gate junction means the biologist chose to REBUILD the ends (homology arms
//     / Type IIS fusion) → the raw RE mismatch is intentionally irrelevant and does NOT block.
function countsAsIncompatible(interlock, junctionRight) {
  if (!(interlock && interlock.verdict === 'incompatible')) return false;
  if (!junctionRight) return false;
  if (STICKY_JOIN_KINDS.includes(junctionRight.kind)) return true;
  return junctionRight.state !== 'decided';
}

// RC-CLOSE-GATE (Игорь 25.06) — the CLOSURE block uses a NARROWER set than the
// internal gate: a self-/ring-closure counts an incompatible interlock ONLY when
// the chosen reaction ligates the fragment's PRE-EXISTING physical ends — classical
// RE sticky ligation (re_ligation) or blunt direct ligation (ligation). KLD / overlap /
// Gibson / Golden-Gate REBUILD the ends (PCR blunt product / homology arms / Type IIS
// fusion), so the original RE-overhang chemistry is irrelevant and must NOT block — a
// long overlap-/KLD-assembled fragment self-closing (the assembly finale, Игорь
// «сценарий с 1 фрагментом всегда на столе») stays buildable.
const CLOSURE_LIGATES_RAW_ENDS = ['re_ligation', 'ligation'];

// RC-BIO-3 — the CIRCULAR closure seam (last fragment's right end meeting the
// first fragment's left end — or, for a 1-fragment SELF-closure, the fragment's
// own two ends) is a real ligation junction that must also mate. It is not an
// adjacent-zone boundary, so it is passed in explicitly as
// { interlock, kind, pairKey, leftLabel, rightLabel, selfClosure? }.
function closureBlocks(closure) {
  return !!(closure && closure.interlock && closure.interlock.verdict === 'incompatible'
    && CLOSURE_LIGATES_RAW_ENDS.includes(closure.kind));
}

export function assemblyReadiness(coloredZones, closure = null) {
  const zones = Array.isArray(coloredZones) ? coloredZones : [];
  const js = zones.map((z) => z && z.junctionRight).filter(Boolean);
  const tentative = js.filter((j) => j.state === 'tentative').length;
  const differs = js.filter((j) => j.differsFromAssembly).length;
  // CHEMISTRY gate: readiness must reflect whether the construct can actually
  // ligate, not just whether each junction glyph was clicked (clicked ≠ valid).
  // Count an 'incompatible' interlock ONLY at a junction whose method joins the
  // ends directly (STICKY_JOIN_KINDS) — see above.
  const incompatibleInternal = zones.filter((z) => (z && z.junctionRight ? countsAsIncompatible(z.interlock, z.junctionRight) : false)).length;
  const incompatible = incompatibleInternal + (closureBlocks(closure) ? 1 : 0);
  // A circular assembly is buildable only if its closure also mates; a 1-fragment
  // self-closure has no internal junction (js.length 0) yet can still be ready.
  const hasJoin = js.length > 0 || !!(closure && closure.kind);
  return {
    total: js.length,
    tentative,
    differs,
    incompatible,
    ready: hasJoin && tentative === 0 && incompatible === 0,
  };
}

/**
 * RC-D1 (Игорь 24.06) — name WHICH adjacent junctions have non-mating sticky ends,
 * so a 3-/4-fragment build tells the biolog exactly which seam to fix instead of a
 * bare count. Same gate as `assemblyReadiness`.incompatible (STICKY_JOIN_KINDS only),
 * so `assemblyJunctionConflicts(z).length === assemblyReadiness(z).incompatible`. Pure.
 * @returns {Array<{ pairKey:string|null, index:number, leftLabel:string, rightLabel:string, message:string }>}
 */
export function assemblyJunctionConflicts(coloredZones, closure = null) {
  const zones = Array.isArray(coloredZones) ? coloredZones : [];
  const out = [];
  for (let i = 0; i < zones.length; i += 1) {
    const z = zones[i];
    const jr = z && z.junctionRight;
    // V196 — same gate as assemblyReadiness.incompatible (keeps
    // `assemblyJunctionConflicts(z).length === assemblyReadiness(z).incompatible`).
    if (!countsAsIncompatible(z && z.interlock, jr)) continue;
    const next = zones[i + 1];
    // RC-ORIENT (Игорь 25.06 «помочь собрать, не заставлять гадать как подставить»):
    // if the seam is incompatible AS-ORIENTED but FLIPPING the next fragment would mate
    // its ends, name that flip. Flipping next swaps its physical left↔right, so its new
    // left = its current right → check junctionInterlock(this.right, next.right). Only a
    // mating verdict (compatible / blunt) is offered; needs RE overhangs on both zones.
    let flipFix;
    const thisR = z.reOverhangs && z.reOverhangs.right;
    const nextR = next && next.reOverhangs && next.reOverhangs.right;
    if (thisR && nextR) {
      const v = junctionInterlock(thisR, nextR);
      if (v && (v.verdict === 'compatible' || v.verdict === 'blunt')) {
        flipFix = { label: (next && next.label) || `Фрагмент ${i + 2}`, side: 'next' };
      }
    }
    out.push({
      pairKey: jr.pairKey || null,
      index: i,
      leftLabel: z.label || `Фрагмент ${i + 1}`,
      rightLabel: (next && next.label) || `Фрагмент ${i + 2}`,
      message: z.interlock.message || 'Несовместимые липкие концы',
      ...(flipFix ? { flipFix } : {}),
    });
  }
  // RC-BIO-3 — the circular closure seam, named «… (замыкание кольца)»; for a
  // 1-fragment SELF-closure the two ends are the fragment's own → «само-замыкание».
  if (closureBlocks(closure)) {
    const base = closure.interlock.message || 'Несовместимые липкие концы';
    out.push({
      pairKey: closure.pairKey || null,
      index: -1,
      isClosure: true,
      selfClosure: !!closure.selfClosure,
      leftLabel: closure.leftLabel || 'последний',
      rightLabel: closure.rightLabel || 'первый',
      message: closure.selfClosure
        ? `${base} — само-замыкание невозможно`
        : `${base} (замыкание кольца)`,
    });
  }
  return out;
}

/**
 * JUNCTION step-2 FIX (J9) + M-CIRCULARIZE C2 — per-boundary methods map for
 * realiseAssembly, keyed by boundary INDEX. Uses `allBoundaries` so a CIRCULAR
 * assembly also gets the closure junction (last→first) at index N−1 (the N−1
 * internal joins are 0..N−2); a linear assembly stays 0..N−2 (closure absent).
 * The junction config (zone.junctions[pairKey].method) wins; falls back to the
 * A4 suggestion, then gibson. AssemblyShellBody `onRealise` builds `methods`
 * from this. Pure.
 */
export function methodsFromJunctions(draft, zoneJunctions = {}, suggestions = []) {
  const bounds = allBoundaries(draft);
  // AM-5/AM-2 — the default is topology- AND role-aware, and prefers the construct
  // method: a single-fragment SELF-closure defaults to KLD; a multi-fragment
  // CIRCULAR closure to gibson; an internal fuse / any LINEAR join to overlap PCR
  // (never gibson, a ring-forming method). The chosen construct method wins over
  // the bare biological default. Requires draftFromZone to carry assemblyMethod.
  const circular = !!(draft && draft.topology && draft.topology.circular);
  const out = {};
  bounds.forEach((b, i) => {
    const cfg = zoneJunctions[b.pairKey];
    const isClosure = b.role === 'closure';
    const bioDefault = b.selfClosure
      ? 'kld'
      : ((circular && isClosure) ? 'gibson' : DEFAULT_JUNCTION_METHOD);
    out[i] = (cfg && cfg.method)
      // RC-SEP — the CLOSURE boundary takes the dedicated closure reaction
      // (draft.closureMethod) over the internal assemblyMethod default.
      || (isClosure ? (draft && draft.closureMethod) : null)
      || (suggestions[i] && suggestions[i].method)
      || (draft && draft.assemblyMethod)
      || bioDefault;
  });
  return out;
}

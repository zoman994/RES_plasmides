/**
 * primer-derive — M-CANVAS-WORKFLOW-UX K11 (SPEC §3 шаг 3 / §5).
 *
 * deriveAutoPrimers(opGroup, state) → Primer[]
 *
 * Pure. For each amplifiable piece in the group (sourced / synthesis /
 * intermediate) produces one fwd + one rev primer. Snippet and gap
 * pieces are skipped — snippet sequences instead embed into the
 * neighbouring amplifiable piece's fwd-primer tail (SPEC §5.1: «обвес
 * встраивается в праймер»). Mutations on a sourced piece are applied
 * to the local piece sequence before binding extraction — so the
 * derived primer is mutagenic.
 *
 * Biology note: spec §3 buildLeftTail wraps `reverseComplement(prevSeq
 * .slice(-25))` for ovPCR/gibson, but that is a spec bug — the fwd
 * primer extends the 5' on the TOP strand, so its tail in 5'→3' must
 * be the prev piece's last 25 nt VERBATIM (no RC). bio-invariants
 * enforce this. Rev primer tail IS reverse-complemented (it lies on
 * the bottom strand).
 */
import { v7 as uuidv7 } from 'uuid';
import { reverseComplement } from '../../../sequence-utils';
import { calcTm } from '../../../tm-calculator';
import { applyPieceMutations } from './piece-mutations';
import { gcPercent } from './assembly-primer-utils';
import { draftFromZone } from './zone-pieces-to-dag';
import { segmentBoundaries } from './assembly-model';
import { pairKeyFor } from './junction-derive';

const DEFAULT_BINDING_LEN = 20;   // no-Tm fallback length (when bindingTm unset)
const DEFAULT_BINDING_TM = 60;    // annealing Tm target — same goal as findBinding
const DEFAULT_OVERLAP_LEN = 30;   // §9b temp config default (was 25, two-sided)
const GG_RECOGNITION = 'GGTCTC';  // BsaI; per-enzyme override = follow-up
const GG_SPACER = 'A';            // concrete spacer (was literal 'N' in the oligo)
const RE_PROTECTIVE = 'GCGC';     // protective bases OUTSIDE the RE site (V125, NEB ~4 nt)
const TAIL_MIN = 18; const TAIL_MAX = 40; // overlap-tail length bounds (Tm mode, A1)
// Binding length bounds (Tm mode, A1b). Floor aligned to the proven
// local-primer-design findBinding (minLen 18); BIND_MAX 36 keeps more room for
// AT-rich ends than the old path's 30.
const BIND_MIN = 18; const BIND_MAX = 36;
const SKIPPED_KINDS = new Set(['snippet', 'gap']);

// §9b — fallback config when a junction has no zone.junctions entry yet
// (legacy / first-or-last piece). One-sided overlap on the downstream fwd.
// Binding is Tm-targeted by default (≥60 °C) so auto primers don't ship flat
// 20-nt low-Tm bindings; an explicit bindingLength (level 1/2) still wins.
const TEMP_JUNCTION_CFG = {
  overlapTarget: 'right',
  overlapLength: DEFAULT_OVERLAP_LEN,
  overlapTm: null,
  bindingLength: null,
  bindingTm: DEFAULT_BINDING_TM,
};

/**
 * A3 (JUNCTION layer 3) — resolve the per-junction config for the join
 * between `leftId` and `rightId` from `zone.junctions[pairKey]`. Falls back to
 * the temp default + `opGroup.kind` as the method when no stored config (so
 * pre-JUNCTION callers behave exactly as layer 2 did). The method now lives in
 * the junction config, not on the op-group.
 */
function junctionConfig(state, opGroup, leftId, rightId) {
  if (leftId != null && rightId != null) {
    const zone = ((state && state.zones) || []).find((z) => z && z.id === (opGroup && opGroup.zoneId));
    const j = zone && zone.junctions && zone.junctions[pairKeyFor(leftId, rightId)];
    if (j) {
      return {
        method: j.method || (opGroup && opGroup.kind),
        overlapTarget: j.overlapTarget != null ? j.overlapTarget : TEMP_JUNCTION_CFG.overlapTarget,
        overlapLength: j.overlapLength != null ? j.overlapLength : TEMP_JUNCTION_CFG.overlapLength,
        overlapTm: j.overlapTm != null ? j.overlapTm : null,
        bindingLength: j.bindingLength != null ? j.bindingLength : TEMP_JUNCTION_CFG.bindingLength,
        bindingTm: j.bindingTm != null ? j.bindingTm : null,
      };
    }
  }
  return { method: opGroup && opGroup.kind, ...TEMP_JUNCTION_CFG };
}

/** Get the top-strand sequence of a piece, applying any mutations. */
function pieceSequence(piece, state) {
  if (!piece) return '';
  if (piece.kind === 'sourced') {
    const r = piece.ranges && piece.ranges[0];
    if (!r) return '';
    const c = ((state && state.containers) || []).find((x) => x && x.id === r.sourceId);
    if (!c) return '';
    const raw = String(c.sequence || '').slice(r.start, r.end);
    const seq = r.orientation === 'reverse' ? reverseComplement(raw) : raw;
    // K14 mutagenic primer support — overwrite position-by-position
    // (shared helper, S2 §5.3 DRY).
    return applyPieceMutations(seq, piece.mutations);
  }
  return String(piece.sequence || '');
}

/** Length of an overlap tail: explicit `overlapLength`, or extended from the
 *  junction until calcTm(tail) ≥ overlapTm within [TAIL_MIN, TAIL_MAX] (A1). */
function overlapTailLen(neighbourSeq, side, overlapLength, overlapTm) {
  if (overlapTm) {
    for (let n = TAIL_MIN; n <= TAIL_MAX; n += 1) {
      if (n > neighbourSeq.length) return neighbourSeq.length;
      const seg = side === 'fwd' ? neighbourSeq.slice(-n) : neighbourSeq.slice(0, n);
      if (calcTm(seg) >= overlapTm) return n;
    }
    return Math.min(TAIL_MAX, neighbourSeq.length);
  }
  return Math.min(overlapLength || DEFAULT_OVERLAP_LEN, neighbourSeq.length);
}

/** Length of a binding region: explicit `bindingLength`, or extended from the
 *  piece end until calcTm(binding) ≥ bindingTm within [BIND_MIN, BIND_MAX] (A1b).
 *  Tm-binding and Tm-tail are independent (annealing vs homology-arm melting). */
export function bindingLen(fullSeq, side, bindingLength, bindingTm) {
  if (bindingTm) {
    for (let n = BIND_MIN; n <= BIND_MAX; n += 1) {
      if (n > fullSeq.length) return fullSeq.length;
      const seg = side === 'fwd' ? fullSeq.slice(0, n) : fullSeq.slice(-n);
      if (calcTm(seg) >= bindingTm) return n;
    }
    return Math.min(BIND_MAX, fullSeq.length);
  }
  return Math.min(bindingLength || DEFAULT_BINDING_LEN, fullSeq.length);
}

/**
 * buildOverlapTail — canonical primer-tail generator (A1/A1b/A2; spec §9b),
 * surface-agnostic, one path for auto + manual. Returns the 5'→3' tail for
 * `side ∈ {fwd, rev}` by `opts.method` (engine dict):
 *   overlap_pcr / gibson : fwd = neighbour.slice(-len) verbatim; rev =
 *     rc(neighbour.slice(0,len)). Gated by overlapTarget (right→fwd only,
 *     left→rev only, both→both — §1 defect #6, double-sided is redundant).
 *   golden_gate : recognition+spacer+overhang; rev rc's ONLY the overhang,
 *     NOT the recognition (V124 — pydna-proven; the old rc-of-whole left the
 *     downstream end blunt).
 *   restriction : fwd = protective+site+'GG' (protective bases OUTSIDE the
 *     site, V125 — site was flush at the 5' terminus); rev = rc(site+'GG')
 *     (the rc already places the 'GG' spacer outside the 3' site).
 *   kld / direct_ligation / blunt : empty.
 */
export function buildOverlapTail(side, neighbourSeq, opts = {}) {
  const {
    method, overlapTarget = 'both', overlapLength, overlapTm,
    overhang = 'AAAA', reSite = '', protective = RE_PROTECTIVE,
    recognition = GG_RECOGNITION, spacer = GG_SPACER,
  } = opts;
  switch (method) {
    case 'overlap_pcr':
    case 'gibson': {
      const n = String(neighbourSeq || '');
      if (!n) return '';
      if (overlapTarget === 'right' && side === 'rev') return '';
      if (overlapTarget === 'left' && side === 'fwd') return '';
      const len = overlapTailLen(n, side, overlapLength, overlapTm);
      return side === 'fwd' ? n.slice(-len) : reverseComplement(n.slice(0, len));
    }
    case 'golden_gate':
      return side === 'fwd'
        ? `${recognition}${spacer}${overhang}`
        : `${recognition}${spacer}${reverseComplement(overhang)}`;
    case 'restriction':
      return side === 'fwd'
        ? `${protective}${reSite}GG`
        : reverseComplement(`${reSite}GG`);
    default:
      return ''; // kld / direct_ligation / unknown → no tail
  }
}

function buildFwdTail(logicalPrev, leftSnippetSeq, state, cfg) {
  // No logical-prev: only the accumulated snippet content (group starts with a
  // snippet ⇒ first amplifiable piece carries it on its tail).
  if (!logicalPrev) return leftSnippetSeq;
  const tail = buildOverlapTail('fwd', pieceSequence(logicalPrev, state), {
    method: cfg.method, // A3: per-junction method (zone.junctions), not opGroup.kind
    overlapTarget: cfg.overlapTarget,
    overlapLength: cfg.overlapLength,
    overlapTm: cfg.overlapTm,
    overhang: logicalPrev.ggOverhang || 'AAAA',
    reSite: logicalPrev.reSite || '',
  });
  return tail + leftSnippetSeq;
}

function buildRevTail(piece, logicalNext, state, cfg) {
  if (!logicalNext) return '';
  return buildOverlapTail('rev', pieceSequence(logicalNext, state), {
    method: cfg.method, // A3: per-junction method (zone.junctions), not opGroup.kind
    overlapTarget: cfg.overlapTarget,
    overlapLength: cfg.overlapLength,
    overlapTm: cfg.overlapTm,
    overhang: piece.ggOverhang || 'AAAA',
    reSite: piece.reSite || '',
  });
}

// Node A §4/§5.1 — emit the canonical assembly-primer record. Provenance
// lives in `source` (kind 'auto-group'); the old `origin` object + `binding`
// field are gone. `boundaryInfo` (computed in deriveAutoPrimers, §6) carries
// the assembly-coordinate junction this primer realises — the SINGLE key
// boundary-coverage consumers read (`source.boundaryAtOffset`).
function makePrimer({
  opGroupId, draftId, piece, side, tail, binding, mutated, pieceIndex1, pairId, boundaryInfo,
}) {
  const direction = side === 'rev' ? 'reverse' : 'forward';
  const name = `asm-${side}-${pieceIndex1}`;
  const source = {
    kind: 'auto-group', opGroupId, pieceId: piece.id, side,
  };
  if (boundaryInfo) {
    source.boundaryAtOffset = boundaryInfo.boundaryAtOffset;
    source.leftSegmentId = boundaryInfo.leftSegmentId;
    source.rightSegmentId = boundaryInfo.rightSegmentId;
  }
  return {
    id: `asmprm-${uuidv7()}`,
    draftId,
    pairId,
    name,
    label: name,
    direction,
    sequence: `${tail}${binding}`,
    bindingSequence: binding,
    tail,
    // V105 — canonical SantaLucia NN (same model as the K13 editor).
    tm: calcTm(binding),
    gc: gcPercent(binding),
    mutated: !!mutated,
    status: 'auto',
    autoMode: 'auto',
    crossesBoundaries: boundaryInfo
      ? [boundaryInfo.leftSegmentId, boundaryInfo.rightSegmentId]
      : [],
    range: null,
    notes: '',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    source,
  };
}

// Node A §6 — resolve the zone draft's assembly-segment boundaries so each
// auto-primer can record the junction offset it realises. Legacy draft (no
// zone) or any shape mismatch → [] → boundaryAtOffset simply isn't set
// (fallback, never throws).
function resolveOpGroupBoundaries(opGroup, state) {
  const zone = ((state && state.zones) || []).find((z) => z && z.id === opGroup.zoneId);
  if (!zone) return [];
  try {
    return segmentBoundaries(draftFromZone(state, zone)).boundaries || [];
  } catch {
    return [];
  }
}

export function deriveAutoPrimers(opGroup, state) {
  if (!opGroup || !Array.isArray(opGroup.inputPieces) || opGroup.inputPieces.length === 0) {
    return [];
  }
  const all = (state && state.pieces) || [];
  const pieces = opGroup.inputPieces.map((id) => all.find((p) => p && p.id === id));
  // Node A §6 — assembly-segment boundaries of the zone draft; lets each
  // primer record the junction offset it realises (segment index resolved
  // via segmentId === piece.id, NOT the inputPieces position — R1).
  const boundaries = resolveOpGroupBoundaries(opGroup, state);
  const primers = [];

  for (let i = 0; i < pieces.length; i += 1) {
    const piece = pieces[i];
    if (!piece || SKIPPED_KINDS.has(piece.kind)) continue;

    // Walk LEFT through snippets to the first non-snippet (logical-prev),
    // collecting snippet sequences in 5'→3' top-strand order.
    const leftSnippets = [];
    let logicalPrev = null;
    for (let j = i - 1; j >= 0; j -= 1) {
      const p = pieces[j];
      if (!p) continue;
      if (p.kind === 'snippet' && p.embedsInPrimer !== false) {
        leftSnippets.unshift(String(p.sequence || ''));
        continue;
      }
      if (p.kind === 'gap') break; // gap walls the tail walk
      logicalPrev = p;
      break;
    }

    // Walk RIGHT for the logical-next non-snippet piece. The snippet
    // content is NOT duplicated on this piece's rev tail — it lives
    // only on the NEXT piece's fwd tail (SPEC §5.1).
    let logicalNext = null;
    for (let j = i + 1; j < pieces.length; j += 1) {
      const p = pieces[j];
      if (!p) continue;
      if (p.kind === 'snippet' && p.embedsInPrimer !== false) continue;
      if (p.kind === 'gap') break;
      logicalNext = p;
      break;
    }

    // A3 — per-junction config: fwd reads the UPSTREAM junction (prev→piece),
    // rev reads the DOWNSTREAM junction (piece→next), from zone.junctions.
    const fwdCfg = junctionConfig(state, opGroup, logicalPrev ? logicalPrev.id : null, piece.id);
    const revCfg = junctionConfig(state, opGroup, piece.id, logicalNext ? logicalNext.id : null);
    const fullSeq = pieceSequence(piece, state);
    const mutated = Array.isArray(piece.mutations) && piece.mutations.length > 0;
    const fwdBinding = fullSeq.slice(0, bindingLen(fullSeq, 'fwd', fwdCfg.bindingLength, fwdCfg.bindingTm));
    const revBinding = reverseComplement(
      fullSeq.slice(-bindingLen(fullSeq, 'rev', revCfg.bindingLength, revCfg.bindingTm)),
    );

    const fwdTail = buildFwdTail(logicalPrev, leftSnippets.join(''), state, fwdCfg);
    const revTail = buildRevTail(piece, logicalNext, state, revCfg);

    // §6 — junction offsets. fwd realises the join BEFORE this segment
    // (k-1 → k) when a logical-prev exists; rev realises the join AFTER it
    // (k → k+1) when a logical-next exists. k resolved via segmentId. No
    // zone / shape mismatch (k<0 or out-of-range) → boundaryInfo stays null
    // (fallback, R1/R2): the primer is still emitted, just without a
    // recorded junction offset.
    const k = boundaries.findIndex((b) => b && b.segmentId === piece.id);
    let fwdBoundary = null;
    if (logicalPrev && k >= 1) {
      const L = boundaries[k - 1];
      const R = boundaries[k];
      fwdBoundary = { boundaryAtOffset: L.endOnAssembly, leftSegmentId: L.segmentId, rightSegmentId: R.segmentId };
    }
    let revBoundary = null;
    if (logicalNext && k >= 0 && k < boundaries.length - 1) {
      const L = boundaries[k];
      const R = boundaries[k + 1];
      revBoundary = { boundaryAtOffset: L.endOnAssembly, leftSegmentId: L.segmentId, rightSegmentId: R.segmentId };
    }
    // fwd + rev of one piece share a pairId (canon §4).
    const pairId = `pair-${uuidv7()}`;

    const pieceIndex1 = i + 1;
    primers.push(makePrimer({
      opGroupId: opGroup.id, draftId: opGroup.zoneId, piece, side: 'fwd',
      tail: fwdTail, binding: fwdBinding, mutated, pieceIndex1, pairId, boundaryInfo: fwdBoundary,
    }));
    primers.push(makePrimer({
      opGroupId: opGroup.id, draftId: opGroup.zoneId, piece, side: 'rev',
      tail: revTail, binding: revBinding, mutated, pieceIndex1, pairId, boundaryInfo: revBoundary,
    }));
  }
  return primers;
}

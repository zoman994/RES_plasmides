/**
 * selectors-junction — pure reactive selectors over the junction
 * contract + the lazy-migration normalizer.
 *
 * F2 M-CANVAS-JUNCTION (DEC-CANVAS-JUNC-03/08). Pure functions only —
 * Zustand/useStore consumers subscribe via `s => selectX(s, id)` and
 * re-render on shallow change. Spec 3 wires `selectTailsForJunction`
 * into the real primer-design cascade; Spec 2 only tests them.
 *
 * K1 ships `normalizeJunction` (backward-compat). K2 adds the
 * tails / ends / validation selectors below it.
 */
import { defaultJunctionParams, inferEndRequirements } from '../canvas/junction-styles';
import { reverseComplement } from '../../../sequence-utils';
import { calcTm } from '../../../tm-calculator';

/**
 * normalizeJunction — lazy migration to the F2 contract shape.
 * Identity-preserving: a junction that already carries the full
 * contract is returned unchanged (same reference).
 */
export function normalizeJunction(j) {
  if (!j || typeof j !== 'object') return j;
  if (
    typeof j.status === 'string'
    && typeof j.overlapTarget === 'string'
    && 'overlapLength' in j
    && 'overlapTm' in j
    && 'endRequirements' in j
    && 'autoDetectedKind' in j
  ) {
    return j; // already normalized
  }
  const kind = j.kind || 'auto';
  const params = defaultJunctionParams(kind);
  // Legacy preserve: a junction with an explicit non-auto kind was a
  // deliberate choice → treat as 'manual' (matches pre-F2 reconcile
  // behaviour that never dropped non-'auto' junctions).
  const status = j.status || (kind === 'auto' ? 'auto' : 'manual');
  return {
    ...j,
    kind,
    autoDetectedKind: j.autoDetectedKind || kind,
    status,
    overlapTarget: j.overlapTarget || params.overlapTarget,
    overlapLength: ('overlapLength' in j) ? j.overlapLength : params.overlapLength,
    overlapTm: ('overlapTm' in j) ? j.overlapTm : params.overlapTm,
    endRequirements: ('endRequirements' in j)
      ? j.endRequirements
      : inferEndRequirements(kind, j.overlapTarget || params.overlapTarget, params.overlapLength),
  };
}

// R3 mitigation — reverse search: smallest prefix length whose Tm ≥ target.
function lengthForTm(seq, targetTm) {
  const max = Math.min(40, seq.length);
  for (let n = 8; n <= max; n += 1) {
    if (calcTm(seq.slice(0, n)) >= targetTm) return n;
  }
  return max;
}

/**
 * selectTailsForJunction — overlap/Gibson/GG tail pair for primer
 * design. Spec 3 wires this into local-primer-design; Spec 2 only
 * tests it. NULL for preformed or when sequence is unavailable.
 */
export function selectTailsForJunction(state, junctionId) {
  if (!state || !junctionId) return null;
  const raw = (state.junctions || []).find((x) => x.id === junctionId);
  if (!raw) return null;
  const j = normalizeJunction(raw);
  if (j.kind === 'preformed') return null;
  const from = (state.containers || []).find((c) => c.id === j.fromContainerId);
  const to = (state.containers || []).find((c) => c.id === j.toContainerId);
  if (!from?.sequence || !to?.sequence) return null;
  let n = j.overlapLength;
  if (n == null && j.overlapTm != null) n = lengthForTm(from.sequence, j.overlapTm);
  if (n == null) n = 0;
  if (n <= 0) return { forwardTail: '', reverseTail: '', source: j.kind };
  return {
    forwardTail: from.sequence.slice(-n),
    reverseTail: reverseComplement(to.sequence.slice(0, n)),
    source: j.kind,
  };
}

function endsDiffer(a, b) {
  if (!a || !b) return false;
  if (a.type && b.type && a.type !== b.type) return true;
  if ((a.overhang || '') !== (b.overhang || '')) return true;
  return false;
}

/**
 * selectEndsRequirementsForContainer — aggregate required 5′/3′ ends
 * from incident junctions; collect conflicts when several incident
 * junctions disagree on the same side.
 */
export function selectEndsRequirementsForContainer(state, containerId) {
  const result = { required5prime: null, required3prime: null, conflicts: [] };
  if (!state || !containerId) return result;
  const incoming = [];
  const outgoing = [];
  for (const raw of (state.junctions || [])) {
    const j = normalizeJunction(raw);
    if (j.toContainerId === containerId) incoming.push(j);
    if (j.fromContainerId === containerId) outgoing.push(j);
  }
  if (incoming.length > 0) result.required5prime = incoming[0].endRequirements?.toEnd || null;
  if (outgoing.length > 0) result.required3prime = outgoing[0].endRequirements?.fromEnd || null;
  for (let i = 1; i < incoming.length; i += 1) {
    if (endsDiffer(incoming[0].endRequirements?.toEnd, incoming[i].endRequirements?.toEnd)) {
      result.conflicts.push(`Контейнер ${containerId}: несовместимые требования к 5′-концу от нескольких входящих стыков`);
      break;
    }
  }
  for (let i = 1; i < outgoing.length; i += 1) {
    if (endsDiffer(outgoing[0].endRequirements?.fromEnd, outgoing[i].endRequirements?.fromEnd)) {
      result.conflicts.push(`Контейнер ${containerId}: несовместимые требования к 3′-концу от нескольких исходящих стыков`);
      break;
    }
  }
  return result;
}

/**
 * selectJunctionValidation — local checks around the container shared
 * with the immediate downstream junction (DEC-CANVAS-JUNC-04). Both
 * neighbours overlapTarget='both' is a VALID double-sided workflow —
 * intentionally NOT flagged.
 */
export function selectJunctionValidation(state, junctionId) {
  const out = { ok: true, warnings: [] };
  if (!state || !junctionId) return out;
  const raw = (state.junctions || []).find((x) => x.id === junctionId);
  if (!raw) return out;
  const j = normalizeJunction(raw);
  const neighbours = (state.junctions || [])
    .map(normalizeJunction)
    .filter((n) => n.id !== j.id && n.fromContainerId === j.toContainerId);
  for (const n of neighbours) {
    const jTo = j.endRequirements?.toEnd;
    const nFrom = n.endRequirements?.fromEnd;
    if (jTo && nFrom) {
      if (
        jTo.type && nFrom.type
        && jTo.type !== nFrom.type
        && jTo.type !== 'any' && nFrom.type !== 'any'
      ) {
        out.warnings.push(`Несовместимые типы концов у контейнера ${j.toContainerId}: ${jTo.type} ↔ ${nFrom.type}`);
      }
      const a = jTo.overhang || '';
      const b = nFrom.overhang || '';
      if (a && b && a !== b) {
        out.warnings.push(`Несовместимые sticky-overhang: ${a} ↔ ${b} (контейнер ${j.toContainerId})`);
      }
      if (j.kind === 'golden_gate' && n.kind === 'golden_gate' && a && b && a === b) {
        out.warnings.push(`Golden Gate: одинаковые 4-nt overhang'и (${a}) — cross-anneal у контейнера ${j.toContainerId}`);
      }
    }
  }
  out.ok = out.warnings.length === 0;
  return out;
}

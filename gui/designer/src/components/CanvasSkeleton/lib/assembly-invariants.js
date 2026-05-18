/**
 * assembly-invariants — sanity guards + hard caps for AssemblyDraft
 * (A1 in-scope; absent in G1). All validators are pure and return
 * `{ ok: boolean, error?: string, warn?: boolean, orphan?: boolean }`.
 */
import { segmentBoundaries, segmentLength } from './assembly-model';

export const ASM_CAPS = Object.freeze({
  draftsWarn: 20,
  draftsHard: 100,
  segmentsWarn: 50,
  segmentsHard: 200,
  totalLengthWarn: 50_000,
  totalLengthHard: 500_000,
  gapMax: 200,
});

export function validateMonotonicOrder(draft) {
  for (const s of draft?.segments || []) {
    if (segmentLength(s) < 0) {
      return { ok: false, error: `segment ${s.id} has negative length` };
    }
  }
  return { ok: true };
}

export function validateNoOverlap(draft) {
  const { boundaries } = segmentBoundaries(draft);
  for (let i = 1; i < boundaries.length; i += 1) {
    if (boundaries[i].startOnAssembly !== boundaries[i - 1].endOnAssembly) {
      return { ok: false, error: 'derived boundaries are not contiguous' };
    }
  }
  return { ok: true };
}

export function validateSourceConsistency(state, segment) {
  if (!segment || segment.source?.type !== 'container') return { ok: true };
  const cid = segment.source.containerId;
  const container = (state?.containers || []).find((c) => c.id === cid);
  if (!container) return { ok: true, orphan: true };
  if (Number.isFinite(segment.end)
      && segment.end > String(container.sequence || '').length) {
    return { ok: false, error: `segment range exceeds source ${cid} bounds` };
  }
  return { ok: true };
}

export function validateMaxLength(draft) {
  const { totalLength } = segmentBoundaries(draft);
  if (totalLength > ASM_CAPS.totalLengthHard) {
    return { ok: false, error: `assembly length ${totalLength} > hard cap ${ASM_CAPS.totalLengthHard}` };
  }
  if ((draft?.segments || []).length > ASM_CAPS.segmentsHard) {
    return { ok: false, error: `segment count > hard cap ${ASM_CAPS.segmentsHard}` };
  }
  return { ok: true, warn: totalLength > ASM_CAPS.totalLengthWarn };
}

export function validateGapSequence(segment) {
  const seq = segment?.sequence || '';
  if (seq.length === 0) return { ok: true };
  if (!/^[ACGTNacgtn]*$/.test(seq)) {
    return { ok: false, error: 'gap/manual sequence must be ACGTN only' };
  }
  return { ok: true };
}

export function validateDraft(state, draft) {
  const errors = [];
  const warnings = [];
  const checks = [
    validateMonotonicOrder(draft),
    validateNoOverlap(draft),
    validateMaxLength(draft),
  ];
  for (const s of draft?.segments || []) {
    checks.push(validateSourceConsistency(state, s));
    checks.push(validateGapSequence(s));
  }
  for (const r of checks) {
    if (r.ok === false) errors.push(r.error || 'invalid');
    if (r.warn) warnings.push('approaching a soft cap');
    if (r.orphan) warnings.push('segment source unavailable (orphan)');
  }
  return { ok: errors.length === 0, errors, warnings };
}

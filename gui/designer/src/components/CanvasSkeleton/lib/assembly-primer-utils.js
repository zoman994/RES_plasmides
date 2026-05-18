/**
 * assembly-primer-utils — pure helpers for assembly-draft primer
 * writing + drag-insert positioning (A2 / G2 §5).
 *
 *  - findInsertIndexAtPosition: cursor pos on assembly → segments[]
 *    insertion index, snap-to-nearest-boundary (G2 DEC-CANVAS-ASM-17).
 *  - detectCrossBoundary: segment ids a [start,end) range spans
 *    (≥2 ⇒ potential junction primer, G2 DEC-CANVAS-ASM-18).
 *  - deriveAssemblyPrimer: range on assembly + direction → binding
 *    sequence + Tm (reuses the v0.5 SantaLucia model via calcTm).
 */
import { reverseComplement } from '../../../sequence-utils';
import { calcTm } from '../../../tm-calculator';

export function findInsertIndexAtPosition(cursorPosOnAssembly, segmentBoundaries) {
  if (!Array.isArray(segmentBoundaries) || segmentBoundaries.length === 0) return 0;
  if (!Number.isFinite(cursorPosOnAssembly) || cursorPosOnAssembly <= 0) return 0;
  const last = segmentBoundaries[segmentBoundaries.length - 1];
  if (cursorPosOnAssembly >= last.endOnAssembly) return segmentBoundaries.length;
  for (let i = 0; i < segmentBoundaries.length; i += 1) {
    const b = segmentBoundaries[i];
    if (cursorPosOnAssembly >= b.startOnAssembly && cursorPosOnAssembly < b.endOnAssembly) {
      const mid = (b.startOnAssembly + b.endOnAssembly) / 2;
      return cursorPosOnAssembly < mid ? i : i + 1;
    }
  }
  return segmentBoundaries.length;
}

export function detectCrossBoundary(range, segmentBoundaries) {
  const crossed = [];
  if (!range || !Array.isArray(segmentBoundaries)) return crossed;
  const lo = Math.min(range.start, range.end);
  const hi = Math.max(range.start, range.end);
  for (const b of segmentBoundaries) {
    if (b.startOnAssembly < hi && b.endOnAssembly > lo) crossed.push(b.segmentId);
  }
  return crossed;
}

export function deriveAssemblyPrimer(assemblySequence, range, direction) {
  const lo = Math.max(0, Math.min(range.start, range.end));
  const hi = Math.max(range.start, range.end);
  const slice = String(assemblySequence || '').slice(lo, hi);
  const binding = direction === 'reverse' ? reverseComplement(slice) : slice;
  return { sequence: binding, bindingSequence: binding, tm: calcTm(binding) };
}

function gcPercent(seq) {
  const s = String(seq || '').toUpperCase();
  if (!s.length) return 0;
  let gc = 0;
  for (let i = 0; i < s.length; i += 1) if (s[i] === 'G' || s[i] === 'C') gc += 1;
  return Math.round((gc / s.length) * 1000) / 10;
}

/**
 * buildAssemblyPrimer — A3 boundary-aware primer (DEC-CANVAS-ASM-PRIMER-03).
 * Within a single segment → plain binding (no tail). Spanning exactly
 * one boundary (left seg L, right seg R) → a junction primer with a 5′
 * overhang tail:
 *   forward: binding = left part, tail = R's first `tailLen` bp.
 *   reverse: binding = RC(right part), tail = RC(L's last `tailLen` bp).
 *   final ordered sequence = tail + binding.
 * Returns the primer fields A3 adds (source/gc) on top of the A2 shape.
 */
export function buildAssemblyPrimer({
  assemblySequence, boundaries, range, direction, tailLen = 20,
}) {
  const seq = String(assemblySequence || '');
  const lo = Math.max(0, Math.min(range.start, range.end));
  const hi = Math.max(range.start, range.end);
  const rev = direction === 'reverse';
  const crosses = detectCrossBoundary({ start: lo, end: hi }, boundaries || []);

  if (crosses.length === 2) {
    // Exactly one internal boundary spanned — junction primer.
    const li = (boundaries || []).findIndex((b) => b.segmentId === crosses[0]);
    const left = boundaries[li];
    const right = boundaries[li + 1];
    const bOff = left.endOnAssembly;
    let bindingSequence;
    let sequence;
    if (!rev) {
      bindingSequence = seq.slice(lo, bOff);
      const tail = seq.slice(bOff, Math.min(bOff + tailLen, right.endOnAssembly));
      sequence = tail + bindingSequence;
    } else {
      const rightPart = seq.slice(bOff, hi);
      bindingSequence = reverseComplement(rightPart);
      const tailSrc = seq.slice(Math.max(left.startOnAssembly, bOff - tailLen), bOff);
      sequence = reverseComplement(tailSrc) + bindingSequence;
    }
    return {
      sequence,
      bindingSequence,
      tm: calcTm(bindingSequence),
      gc: gcPercent(bindingSequence),
      source: {
        kind: 'boundary',
        boundaryAtOffset: bOff,
        leftSegmentId: left.segmentId,
        rightSegmentId: right.segmentId,
        selectionStart: lo,
        selectionEnd: hi,
      },
      crossesBoundaries: crosses,
    };
  }

  // Single segment (or whole-range fallback for >2 spans).
  const slice = seq.slice(lo, hi);
  const bindingSequence = rev ? reverseComplement(slice) : slice;
  const containing = (boundaries || []).find(
    (b) => lo >= b.startOnAssembly && hi <= b.endOnAssembly,
  ) || (boundaries || [])[0] || null;
  return {
    sequence: bindingSequence,
    bindingSequence,
    tm: calcTm(bindingSequence),
    gc: gcPercent(bindingSequence),
    source: {
      kind: 'segment',
      segmentId: containing ? containing.segmentId : null,
      selectionStart: lo,
      selectionEnd: hi,
    },
    crossesBoundaries: crosses,
  };
}

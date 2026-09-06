/**
 * One selection contract for linear and circular SequenceView coordinates.
 * Circular pointer coordinates stay in the visible, unwrapped domain:
 * leading context < 0, main [0,N], trailing context > N.
 */

const finite = (value) => (typeof value === 'number' && Number.isFinite(value) ? value : null);
const mod = (value, n) => ((value % n) + n) % n;

export function terminalCaretBounds(seqLength, terminalSelect) {
  const r = (terminalSelect && terminalSelect.rightLen) || 0;
  const l = (terminalSelect && terminalSelect.leftLen) || 0;
  return { min: l ? -l : 0, max: seqLength + r };
}

/** Convert only duplicated circular context coordinates back to the molecule. */
export function canonicalSequenceCaret(value, seqLength, circular = false) {
  const caret = finite(value);
  const n = finite(seqLength);
  if (caret == null) return null;
  if (!circular || n == null || n <= 0 || (caret >= 0 && caret <= n)) return caret;
  return mod(caret, n);
}

function displaySegments(lo, hi, n) {
  const out = [];
  const add = (kind, bandLo, bandHi, shift) => {
    const start = Math.max(lo, bandLo);
    const end = Math.min(hi, bandHi);
    if (end > start) out.push({ kind, start: start + shift, end: end + shift });
  };
  add('leading-wrap', -n, 0, n);
  add('main', 0, n, 0);
  add('trailing-wrap', n, 2 * n, -n);
  return out;
}

export function describeSequenceSelection({
  anchor,
  focus,
  seqLength,
  circular = false,
}) {
  const a = finite(anchor);
  const f = finite(focus);
  if (a == null || f == null || a === f) return null;
  const lo = Math.min(a, f);
  const hi = Math.max(a, f);
  const n = finite(seqLength);

  if (!circular || n == null || n <= 0) {
    return {
      start: lo,
      end: hi,
      length: hi - lo,
      wrapsOrigin: false,
      usesWrapContext: false,
      segments: [{ start: lo, end: hi }],
      displaySegments: [{ kind: 'main', start: lo, end: hi }],
    };
  }

  // Pointer logic clamps to one turn. Keep this pure boundary defensive for
  // keyboard/programmatic callers so no base can be selected twice.
  const length = Math.min(n, hi - lo);
  const boundedHi = lo + length;
  const start = mod(lo, n);
  const end = start + length;
  const wrapsOrigin = end > n;
  const segments = wrapsOrigin
    ? [{ start, end: n }, { start: 0, end: end - n }]
    : [{ start, end }];

  return {
    start,
    end,
    length,
    wrapsOrigin,
    usesWrapContext: lo < 0 || hi > n,
    segments,
    displaySegments: displaySegments(lo, boundedHi, n),
  };
}

export function selectionDisplaySegments(anchor, focus, seqLength) {
  return describeSequenceSelection({ anchor, focus, seqLength, circular: true })
    ?.displaySegments || [];
}

export function selectionSlice({
  fullSeq,
  anchor,
  focus,
  seqLength,
  terminalSelect = null,
  circular,
}) {
  const a = finite(anchor);
  const f = finite(focus);
  if (a == null || f == null || a === f) return '';
  const seq = fullSeq || '';
  const n = Number.isFinite(seqLength) ? seqLength : seq.length;
  const lo = Math.min(a, f);
  const hi = Math.max(a, f);

  if (terminalSelect && (lo < 0 || hi > n)) {
    const topLo = Math.max(0, lo);
    const topHi = Math.min(n, hi);
    let out = topHi > topLo ? seq.slice(topLo, topHi) : '';
    const rLen = terminalSelect.rightLen || 0;
    const lLen = terminalSelect.leftLen || 0;
    if (hi > n && terminalSelect.rightBases) {
      out += terminalSelect.rightBases.slice(0, Math.min(rLen, hi - n));
    }
    if (lo < 0 && terminalSelect.leftBases) {
      const take = Math.min(lLen, -lo);
      out = terminalSelect.leftBases.slice(lLen - take) + out;
    }
    return out;
  }

  // Backward compatibility: before callers supplied `circular`, any extended
  // coordinate without terminal overhang was the circular wrap path.
  const isCircular = circular ?? (lo < 0 || hi > n);
  const descriptor = describeSequenceSelection({
    anchor: a, focus: f, seqLength: n, circular: isCircular,
  });
  if (!descriptor) return '';
  return descriptor.segments.map((segment) => seq.slice(segment.start, segment.end)).join('');
}

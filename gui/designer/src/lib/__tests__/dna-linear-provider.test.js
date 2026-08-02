/**
 * U4 item 3 — the linear-kernel sequence provider: the pipeline that puts the experimental kernel
 * on the real search path, behind a benchmark seam.
 *
 *   findOccurrences  ->  RAW GUARD  ->  adapter (merge +/- -> both, strip)  ->  sequence validator
 *
 * The RAW GUARD runs BEFORE the merge, and that ordering is the point (fixed in review). A
 * corrupted minus occurrence whose script does not match its counters could otherwise merge with
 * a clean plus into one `both` row; the merge then discards the script, and the downstream
 * summary validator — which only sees counters and coordinates — can no longer detect the
 * tampering. So the script is checked against M/X/I/D and the alignment length while it still
 * exists, per raw occurrence, per strand.
 *
 * Run: cd gui/designer && npm test -- src/lib/__tests__/dna-linear-provider.test.js
 */
import { describe, it, expect } from 'vitest';
import { assertRawKernelOccurrences, MALFORMED_SEQUENCE_RESULT } from '../dna-linear-provider';

/** A raw kernel occurrence (findOccurrences output shape) with an internally consistent script. */
function raw(over = {}) {
  return {
    strand: '+', start: 4, targetSpan: 6, end: 10,
    M: 5, X: 1, I: 0, D: 0, gapEvents: 0, alignmentLength: 6, identityBps: 8333,
    script: '=====X',
    ...over,
  };
}
const LINEAR = { targetLength: 20, circular: false };
const CIRCULAR = { targetLength: 20, circular: true };

const caught = (fn) => { try { fn(); return null; } catch (e) { return e; } };

describe('U4 — the raw result must be an array', () => {
  it.each([['null', null], ['undefined', undefined], ['an object', {}], ['a string', 'x'], ['a number', 3]])(
    'throws typed on %s (never a silent honest zero)', (_l, value) => {
      const e = caught(() => assertRawKernelOccurrences(value, LINEAR));
      expect(e, 'a non-array raw result must not become []').not.toBeNull();
      expect(e.code).toBe(MALFORMED_SEQUENCE_RESULT);
    },
  );

  it('accepts an empty array (an honest miss the kernel really produced)', () => {
    expect(assertRawKernelOccurrences([], LINEAR)).toEqual([]);
  });
});

describe('U4 — every retained raw occurrence must carry a well-formed script', () => {
  it('accepts a consistent occurrence unchanged', () => {
    const list = [raw()];
    expect(assertRawKernelOccurrences(list, LINEAR)).toBe(list);
  });

  const bad = [
    ['a missing script', { script: null }],
    ['a non-string script', { script: 6 }],
    ['a script of the wrong length', { script: '=====' }],           // len 5, alignmentLength 6
    ['a script with a foreign symbol', { script: '=====Z' }],
    ['a script whose = count != M', { script: '====XX', X: 1 }],     // two X, but X says 1
    ['a script whose X count != X', { script: '======', X: 1 }],     // no X, but X says 1
    ['a script whose I count != I', { script: '=====I', X: 1, I: 0 }],
    ['a script whose D count != D', { script: '=====D', X: 1, D: 0 }],
  ];
  it.each(bad)('throws typed on %s', (_l, over) => {
    const e = caught(() => assertRawKernelOccurrences([raw(over)], LINEAR));
    expect(e).not.toBeNull();
    expect(e.code).toBe(MALFORMED_SEQUENCE_RESULT);
  });

  it('a script matching I and D counts passes', () => {
    // M=4,X=0,I=1,D=1, L=6, span=5: script has 4 '=', 1 'I', 1 'D'.
    const ok = raw({ M: 4, X: 0, I: 1, D: 1, alignmentLength: 6, targetSpan: 5, end: 9, script: '====ID', identityBps: Math.floor(40000 / 6) });
    expect(() => assertRawKernelOccurrences([ok], LINEAR)).not.toThrow();
  });
});

describe('U4 — end must be consistent with start + span and topology', () => {
  it('linear: end must equal start + targetSpan', () => {
    const e = caught(() => assertRawKernelOccurrences([raw({ end: 9 })], LINEAR));  // 4+6=10, not 9
    expect(e.code).toBe(MALFORMED_SEQUENCE_RESULT);
  });

  it('linear: a correct end passes', () => {
    expect(() => assertRawKernelOccurrences([raw({ end: 10 })], LINEAR)).not.toThrow();
  });

  it('circular: end must equal (start + targetSpan) mod n', () => {
    // start 18, span 6, n 20 -> physical end (18+6) mod 20 = 4.
    const ok = raw({ start: 18, targetSpan: 6, end: 4 });
    expect(() => assertRawKernelOccurrences([ok], CIRCULAR)).not.toThrow();
    const bad = raw({ start: 18, targetSpan: 6, end: 24 });      // raw sum, not mod
    expect(caught(() => assertRawKernelOccurrences([bad], CIRCULAR)).code).toBe(MALFORMED_SEQUENCE_RESULT);
  });

  it('a corrupted minus occurrence is caught HERE, before it can merge into a both', () => {
    // The scenario the ordering exists for: a clean plus and a minus whose script lies about its
    // counters. If the guard ran after the merge, the two would fuse and the script would be gone.
    const plus = raw({ strand: '+', script: '=====X' });
    const minus = raw({ strand: '-', script: '======', X: 1 });   // script says 0 X, counter says 1
    const e = caught(() => assertRawKernelOccurrences([plus, minus], LINEAR));
    expect(e, 'the tampered minus must be rejected before the merge').not.toBeNull();
    expect(e.code).toBe(MALFORMED_SEQUENCE_RESULT);
  });
});

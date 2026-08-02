/**
 * U2 substep 1 — the input boundary of the EXPERIMENTAL linear kernel.
 *
 * TWO DEFECTS UNDER TEST, both fail-OPEN today.
 *
 * (1) UNICODE TRUNCATION. `encodeQuery`/`encodeTarget` index the lookup table with
 *     `charCodeAt(i) & 0xff`. `Ł` is U+0141 = 321, and 321 & 0xff = 65 = 'A', so a query
 *     containing `Ł` is silently accepted AS ADENINE. The family is every code point congruent
 *     to 65/67/71/84 mod 256: String.fromCodePoint(0x100 + 65) = 'Ł' -> A, +67 = 'Ń' -> C,
 *     +71 = 'Ň' -> G, +84 = 'Ŕ' -> T.
 *
 *     REMOVING `& 0xff` IS NOT A FIX, and that is why these tests assert values rather than
 *     merely "does not equal A". `CODE` is a Uint8Array(256), so `CODE[321]` reads out of bounds
 *     and yields `undefined`; assigning `undefined` into a Uint8Array coerces it to 0 — which is
 *     the code for A again. The same wrong answer by a different route. The target path therefore
 *     needs an explicit 255 sentinel decided BEFORE the table read, and the query path needs an
 *     immediate typed throw.
 *
 * (2) THRESHOLD COERCION. `opts.thresholdBps | 0` accepts anything ToInt32 can bend into range:
 *     measured — '8000' (string) -> 8000 accepted, 8000.7 -> 8000 accepted, 7999.999 -> 7999
 *     accepted AS A DIFFERENT THRESHOLD than asked for, [8000] -> 8000 accepted. NaN and the
 *     infinities are rejected only accidentally, because ToInt32 maps them to 0 and 0 fails the
 *     range check — not because anything validated them.
 *
 * Contract: query is trim + uppercase and then strictly [ACGT]; anything else is a typed
 * INVALID_DNA before any work. Target keeps its length and coordinates — a foreign symbol is one
 * `X` column, never a deletion and never a match. `thresholdBps` is a finite integer 5000..10000.
 *
 * Run: cd gui/designer && npm test -- src/lib/__tests__/dna-linear-input-boundary.test.js
 */
import { describe, it, expect } from 'vitest';
import { findOccurrences } from '../dna-linear-kernel';

const INVALID_DNA = 'INVALID_DNA';

/** Assert a typed refusal, not merely "it threw something". */
function expectInvalidDna(fn, label) {
  let caught = null;
  try { fn(); } catch (e) { caught = e; }
  expect(caught, `${label}: must refuse`).not.toBeNull();
  expect(caught.code, `${label}: must be typed INVALID_DNA, got ${caught && caught.message}`).toBe(INVALID_DNA);
}

// Every code point that the old `& 0xff` folded onto a real base.
const FOLDING = [
  ['U+0141 Ł -> A', String.fromCodePoint(0x100 + 65)],
  ['U+0143 Ń -> C', String.fromCodePoint(0x100 + 67)],
  ['U+0147 Ň -> G', String.fromCodePoint(0x100 + 71)],
  ['U+0154 Ŕ -> T', String.fromCodePoint(0x100 + 84)],
];

describe('U2 §2.5 — Unicode never becomes a base in the QUERY', () => {
  it.each(FOLDING)('%s is refused, not folded', (_label, ch) => {
    expectInvalidDna(() => findOccurrences(`ACG${ch}ACGT`, 'ACGTACGTACGT'), _label);
  });

  it.each(FOLDING)('%s is refused at the START of the query', (_label, ch) => {
    expectInvalidDna(() => findOccurrences(`${ch}ACGTACGT`, 'ACGTACGTACGT'), _label);
  });

  it.each(FOLDING)('%s is refused at the END of the query', (_label, ch) => {
    expectInvalidDna(() => findOccurrences(`ACGTACGT${ch}`, 'ACGTACGTACGT'), _label);
  });

  it('a folding symbol is never silently CUT: the query is not re-read as its ACGT remainder', () => {
    // If `Ł` were stripped, `ACŁGT` would degrade to the 4-mer ACGT and match the target exactly.
    // A refusal is the only correct outcome; a 100% hit here means the symbol was removed.
    expectInvalidDna(() => findOccurrences('ACŁGT', 'TTTTACGTTTTT'), 'interior cut');
  });

  it.each([['N', 'N'], ['R', 'R'], ['U', 'U'], ['gap', '-']])('%s is invalid too', (_l, ch) => {
    expectInvalidDna(() => findOccurrences(`ACGT${ch}ACGT`, 'ACGTACGTACGT'), _l);
  });

  it('lowercase acgt is accepted and means the same as uppercase', () => {
    const lower = findOccurrences('acgtacgt', 'TTTTACGTACGTTTTT', { thresholdBps: 10000 });
    const upper = findOccurrences('ACGTACGT', 'TTTTACGTACGTTTTT', { thresholdBps: 10000 });
    expect(lower.length).toBeGreaterThan(0);
    expect(JSON.stringify(lower)).toBe(JSON.stringify(upper));
  });

  it.each([['empty', ''], ['spaces', '   '], ['tab+newline', '\t\n']])('%s query is fail-closed', (_l, q) => {
    expectInvalidDna(() => findOccurrences(q, 'ACGTACGT'), _l);
  });

  it('a valid query against an EMPTY target is an honest empty result, not an error', () => {
    expect(findOccurrences('ACGTACGT', '')).toEqual([]);
  });
});

describe('U2 §2.5 — Unicode in the TARGET is one X column, not a shift', () => {
  it('ACGT vs AŁGT at 75% scores M=3 X=1 L=4 identityBps=7500', () => {
    const got = findOccurrences('ACGT', `A${String.fromCodePoint(0x100 + 67)}GT`, { thresholdBps: 7500, bothStrands: false });
    expect(got.length, 'the locus must be found at 75%').toBe(1);
    const o = got[0];
    expect({ M: o.M, X: o.X, I: o.I, D: o.D, L: o.alignmentLength, bps: o.identityBps })
      .toEqual({ M: 3, X: 1, I: 0, D: 0, L: 4, bps: 7500 });
    expect(o.start, 'coordinates must not shift').toBe(0);
    expect(o.targetSpan, 'the foreign base still occupies one column').toBe(4);
  });

  it('the same target does NOT match at 100%', () => {
    const got = findOccurrences('ACGT', `A${String.fromCodePoint(0x100 + 67)}GT`, { thresholdBps: 10000, bothStrands: false });
    expect(got).toEqual([]);
  });

  it('a foreign symbol is never a MATCH: identity stays below 100% for every folding char', () => {
    for (const [label, ch] of FOLDING) {
      const target = `ACG${ch}`;          // would read as ACGA/ACGC/ACGG/ACGT under truncation
      const got = findOccurrences('ACGT', target, { thresholdBps: 5000, bothStrands: false });
      const best = got.length ? Math.max(...got.map((o) => o.identityBps)) : 0;
      expect(best, `${label}: must not reach 100%`).toBeLessThan(10000);
    }
  });
});

describe('U2 §5.1 — thresholdBps is a finite integer in 5000..10000', () => {
  const REJECTED = [
    ['a numeric string', '8000'],
    ['a non-numeric string', 'high'],
    ['NaN', NaN],
    ['Infinity', Infinity],
    ['-Infinity', -Infinity],
    ['a fraction', 8000.7],
    ['a fraction just under a legal value', 7999.999],
    ['an array', [8000]],
    ['an object', {}],
    ['a boolean', true],
    ['below range', 4999],
    ['above range', 10001],
    ['negative', -8000],
  ];

  it.each(REJECTED)('%s is refused fail-closed', (_label, value) => {
    let caught = null;
    try { findOccurrences('ACGTACGT', 'TTTTACGTACGTTTTT', { thresholdBps: value }); } catch (e) { caught = e; }
    expect(caught, `${_label}: must refuse instead of coercing`).not.toBeNull();
  });

  it('a fraction is never silently floored into a DIFFERENT threshold', () => {
    // 7999.999 used to become 7999 — a threshold the caller never asked for.
    expect(() => findOccurrences('ACGTACGT', 'TTTTACGTACGTTTTT', { thresholdBps: 7999.999 })).toThrow();
  });

  it.each([['5000', 5000], ['8000', 8000], ['10000', 10000]])('%s is accepted', (_l, v) => {
    expect(() => findOccurrences('ACGTACGT', 'TTTTACGTACGTTTTT', { thresholdBps: v })).not.toThrow();
  });

  it('undefined keeps the 8000 default', () => {
    const a = findOccurrences('ACGTACGT', 'TTTTACGTACGTTTTT');
    const b = findOccurrences('ACGTACGT', 'TTTTACGTACGTTTTT', { thresholdBps: 8000 });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

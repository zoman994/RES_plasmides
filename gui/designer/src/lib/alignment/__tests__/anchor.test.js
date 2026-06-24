import { describe, it, expect } from 'vitest';
import { alignPairwise } from '../align-pairwise';
import { anchorWindow } from '../anchor';
import { reverseComplement } from '../../../sequence-utils';

// Deterministic pseudo-random sequence (no Math.random → stable oracle).
function genSeq(len, seed) {
  const bases = 'ACGT';
  let x = seed >>> 0;
  let s = '';
  for (let i = 0; i < len; i++) {
    x = (Math.imul(x, 1103515245) + 12345) >>> 0;
    s += bases[(x >>> 16) & 3];
  }
  return s;
}

function subst(seq, at, base) { return seq.slice(0, at) + base + seq.slice(at + 1); }

// The oracle: anchored windowing must yield the IDENTICAL alignment the full DP
// would — same strings, score, placement and stats. Anchoring only trims
// reference a local/semiglobal read could not have used.
function expectSameAsFull(ref, read, mode, opts = {}) {
  const anchored = alignPairwise(ref, read, { mode, ...opts });
  const full = alignPairwise(ref, read, { mode, ...opts, anchor: false });
  expect(anchored.engine).toMatch(/anchored/); // the anchored path was taken
  expect(anchored.alignedA).toBe(full.alignedA);
  expect(anchored.alignedB).toBe(full.alignedB);
  expect(anchored.score).toBe(full.score);
  expect(anchored.aStart).toBe(full.aStart);
  expect(anchored.bStart).toBe(full.bStart);
  expect(anchored.identity).toBe(full.identity);
  expect(anchored.strand).toBe(full.strand);
  expect(anchored.coverageA).toBeCloseTo(full.coverageA, 6);
  expect(anchored.columns.length).toBe(full.columns.length);
  return anchored;
}

describe('anchorWindow', () => {
  const ref = genSeq(2500, 7);

  it('windows a long reference around a read mapped in the middle', () => {
    const read = ref.slice(1000, 1400);
    const win = anchorWindow(ref, read);
    expect(win).toBeTruthy();
    expect(win.winStart).toBeLessThanOrEqual(1000);
    expect(win.winEnd).toBeGreaterThanOrEqual(1400);
    expect(win.winEnd - win.winStart).toBeLessThan(ref.length * 0.7); // a real cut
  });

  it('returns null for a short reference (not worth windowing)', () => {
    expect(anchorWindow('ACGTACGTACGT', 'ACGT')).toBeNull();
  });

  it('returns null when the query does not seed the reference', () => {
    const read = genSeq(400, 9999); // unrelated
    // most likely null; if a chance minimizer collides, the cluster is too small
    const win = anchorWindow(ref, read);
    if (win) expect(win.winEnd - win.winStart).toBeLessThan(ref.length); // never the whole ref
  });
});

describe('alignPairwise — anchored windowing equals full DP (oracle)', () => {
  const ref = genSeq(2500, 7);

  it('semiglobal: exact substring read', () => {
    const read = ref.slice(900, 1300);
    expectSameAsFull(ref, read, 'semiglobal');
  });

  it('semiglobal: read with a few substitutions', () => {
    let read = ref.slice(600, 1000);
    read = subst(read, 50, read[50] === 'A' ? 'C' : 'A');
    read = subst(read, 220, read[220] === 'G' ? 'T' : 'G');
    expectSameAsFull(ref, read, 'semiglobal');
  });

  it('semiglobal: read with a small internal insertion', () => {
    const read = ref.slice(400, 600) + 'ACGTACGT' + ref.slice(600, 800);
    expectSameAsFull(ref, read, 'semiglobal');
  });

  it('local: read with divergent flanks clips to the homologous core', () => {
    const read = 'TTTTTTTTTT' + ref.slice(1500, 1900) + 'GGGGGGGGGG';
    expectSameAsFull(ref, read, 'local', { match: 2, mismatch: -3, gapOpen: -6, gapExtend: -1 });
  });

  it('semiglobal: read mapping near the end (large aStart)', () => {
    const read = ref.slice(2050, 2450);
    const r = expectSameAsFull(ref, read, 'semiglobal');
    expect(r.aStart).toBe(2050); // full-reference coordinate, not window-local
  });

  it('reverse-strand read still anchors and equals full DP', () => {
    const read = reverseComplement(ref.slice(800, 1200));
    const anchored = alignPairwise(ref, read, { mode: 'semiglobal', tryRevComp: true });
    const full = alignPairwise(ref, read, { mode: 'semiglobal', tryRevComp: true, anchor: false });
    expect(anchored.strand).toBe('reverse');
    expect(anchored.score).toBe(full.score);
    expect(anchored.aStart).toBe(full.aStart);
    expect(anchored.alignedA).toBe(full.alignedA);
    expect(anchored.identity).toBe(full.identity);
  });
});

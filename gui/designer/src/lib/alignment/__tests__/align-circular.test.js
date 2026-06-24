/**
 * align-circular.test.js — rotation-invariant circular alignment (§A3).
 * The seam artifact: a query spanning the origin, or a plasmid rotated relative
 * to the reference, breaks a linear aligner. alignCircular must place both
 * correctly and beat the linear alignment on a rotated pair.
 */
import { describe, it, expect } from 'vitest';
import { alignCircular } from '../align-circular';
import { alignPairwise } from '../align-pairwise';

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const randSeq = (rng, len) => {
  let s = '';
  for (let i = 0; i < len; i++) s += 'ACGT'[Math.floor(rng() * 4)];
  return s;
};
const rotate = (s, k) => s.slice(k) + s.slice(0, k);

describe('alignCircular — rotation-invariant placement', () => {
  it('finds a query that spans the origin seam, with wrapped=true and correct offset', () => {
    const rng = mulberry32(0x5E0);
    const ref = randSeq(rng, 60);
    const k = 52; // window starts near the end and wraps past the origin
    const query = rotate(ref, k).slice(0, 16); // 16 bp crossing the seam (8 before, 8 after origin)
    const res = alignCircular(ref, query);
    expect(res.refStart).toBe(k);          // placed at the true rotation offset
    expect(res.wrapped).toBe(true);        // crosses the origin
    expect(res.identity).toBeGreaterThanOrEqual(99);
  });

  it('a non-wrapping internal query is placed without the wrap flag', () => {
    const rng = mulberry32(0x5E1);
    const ref = randSeq(rng, 80);
    const query = ref.slice(20, 40);
    const res = alignCircular(ref, query);
    expect(res.refStart).toBe(20);
    expect(res.wrapped).toBe(false);
    expect(res.identity).toBeGreaterThanOrEqual(99);
  });

  it('two rotations of one plasmid align near-perfectly — far better than linear', () => {
    const rng = mulberry32(0x5E2);
    const plasmid = randSeq(rng, 120);
    const rotated = rotate(plasmid, 45);
    const circ = alignCircular(plasmid, rotated, { mode: 'semiglobal' });
    const lin = alignPairwise(plasmid, rotated, { mode: 'global' });
    expect(circ.identity).toBeGreaterThanOrEqual(99);
    expect(circ.gaps).toBeLessThan(lin.gaps);     // no big origin-shift indel
    expect(circ.identity).toBeGreaterThan(lin.identity);
  });

  it('reverse-strand seam-spanning query is found via tryRevComp', () => {
    const rng = mulberry32(0x5E3);
    const ref = randSeq(rng, 50);
    const window = rotate(ref, 44).slice(0, 14); // spans seam
    const revcomp = window.split('').reverse().map((b) => ({ A: 'T', T: 'A', C: 'G', G: 'C' }[b])).join('');
    const res = alignCircular(ref, revcomp, { tryRevComp: true });
    expect(res.strand).toBe('reverse');
    expect(res.wrapped).toBe(true);
    expect(res.identity).toBeGreaterThanOrEqual(99);
  });

  it('empty inputs degrade gracefully', () => {
    expect(alignCircular('', 'ACGT').wrapped).toBe(false);
    expect(alignCircular('ACGT', '').wrapped).toBe(false);
  });
});

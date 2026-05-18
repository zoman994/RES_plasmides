/**
 * skeleton-gibson-primer-design-r7.test.jsx — Gibson homology-arm primers.
 *
 * R7-1 (14.05.2026). Biologist designs Gibson primers per fragment с
 * 5'-tail = homology arm соседнего fragment'а. Tests:
 *   - circular assembly: каждый primer pair имеет homology обоих
 *     соседей.
 *   - linear assembly: первый/последний fragment без tail с одной стороны.
 *   - Tm-aware anneal selection.
 *   - Single fragment: no neighbors → no tails.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect } from 'vitest';
import {
  designGibsonPrimerPair,
  designGibsonPrimers,
} from '../../../lib/bio/gibson-primer-design';

const COMPLEMENT = { A: 'T', T: 'A', G: 'C', C: 'G' };
const rcomp = (s) => s.toUpperCase().split('').reverse().map((c) => COMPLEMENT[c] || c).join('');

function frag(name, seq) {
  return { id: name, name, sequence: seq };
}

describe('R7-1 — designGibsonPrimerPair', () => {
  it('single pair с двумя соседями строит homology tails из обоих', () => {
    const prev = frag('A', 'AAAAAAAAAAAAAAAAAAAAGGGGGGGGGG'); // 30 bp; 3'-end = 'GGGGGGGGGG...'
    const cur = frag('B', 'ATGCATGCATGCATGCATGCATGCATGCATGC'); // 32 bp
    const next = frag('C', 'CCCCCCCCCCTTTTTTTTTT'); // 20 bp; 5'-end = 'CCCCCCCCCC'
    const result = designGibsonPrimerPair(prev, undefined, undefined); // sanity
    expect(result.fwd).toBeDefined();
    const pair = designGibsonPrimerPair(cur, prev, next);
    // fwd starts with last 20 bp of prev (homology).
    expect(pair.fwd.sequence.startsWith('AAAAAAAAAAGGGGGGGGGG')).toBe(true);
    // rev starts with revcomp of first 20 bp of next.
    const expectedRevHomology = rcomp('CCCCCCCCCCTTTTTTTTTT');
    expect(pair.rev.sequence.startsWith(expectedRevHomology)).toBe(true);
    // Anneal region present.
    expect(pair.fwd.annealLen).toBeGreaterThanOrEqual(18);
    expect(pair.rev.annealLen).toBeGreaterThanOrEqual(18);
    expect(pair.fwd.homologyLen).toBe(20);
    expect(pair.rev.homologyLen).toBe(20);
  });

  it('первый fragment без prev — без 5\'-tail на fwd', () => {
    const cur = frag('first', 'ATGCATGCATGCATGCATGCATGCATGCATGC');
    const next = frag('second', 'CCCCCCCCCCTTTTTTTTTT');
    const pair = designGibsonPrimerPair(cur, null, next);
    expect(pair.fwd.homologyLen).toBe(0);
    // fwd = только anneal (без tail).
    expect(pair.fwd.sequence.length).toBe(pair.fwd.annealLen);
    expect(pair.fwd.sequence).toBe(cur.sequence.slice(0, pair.fwd.annealLen));
  });

  it('последний fragment без next — без 5\'-tail на rev', () => {
    const prev = frag('first', 'AAAAAAAAAAGGGGGGGGGG');
    const cur = frag('last', 'ATGCATGCATGCATGCATGCATGCATGCATGC');
    const pair = designGibsonPrimerPair(cur, prev, null);
    expect(pair.rev.homologyLen).toBe(0);
    expect(pair.rev.sequence.length).toBe(pair.rev.annealLen);
  });

  it('возвращает error для слишком коротких фрагментов', () => {
    const cur = frag('short', 'ATGC');
    const pair = designGibsonPrimerPair(cur, null, null);
    expect(pair.error).toMatch(/too short/);
  });
});

describe('R7-1 — designGibsonPrimers (массив)', () => {
  it('circular 3-fragment assembly: каждый имеет prev/next homology', () => {
    const fragments = [
      frag('F1', 'AAAAAAAAAAAAAAAAAAAAGGGGGGGGGG'),
      frag('F2', 'CCCCCCCCCCCCCCCCCCCCTTTTTTTTTT'),
      frag('F3', 'GAGAGAGAGAGAGAGAGAGAGAGAGAGAGAGA'),
    ];
    const designs = designGibsonPrimers(fragments, true);
    expect(designs).toHaveLength(3);
    // F1: prev=F3, next=F2.
    expect(designs[0].fwd.sequence.startsWith('GAGAGAGAGAGAGAGAGAGA')).toBe(true);
    // F2: prev=F1, next=F3.
    expect(designs[1].fwd.sequence.startsWith('AAAAAAAAAAGGGGGGGGGG')).toBe(true);
    // F3: prev=F2, next=F1.
    expect(designs[2].fwd.sequence.startsWith('CCCCCCCCCCTTTTTTTTTT')).toBe(true);
    // All homologyLen=20.
    for (const d of designs) {
      expect(d.fwd.homologyLen).toBe(20);
      expect(d.rev.homologyLen).toBe(20);
    }
  });

  it('linear 3-fragment assembly: first без fwd tail, last без rev tail', () => {
    const fragments = [
      frag('F1', 'AAAAAAAAAAAAAAAAAAAAGGGGGGGGGG'),
      frag('F2', 'CCCCCCCCCCCCCCCCCCCCTTTTTTTTTT'),
      frag('F3', 'GAGAGAGAGAGAGAGAGAGAGAGAGAGAGAGA'),
    ];
    const designs = designGibsonPrimers(fragments, false);
    expect(designs[0].fwd.homologyLen).toBe(0); // F1 first
    expect(designs[0].rev.homologyLen).toBe(20);
    expect(designs[1].fwd.homologyLen).toBe(20);
    expect(designs[1].rev.homologyLen).toBe(20);
    expect(designs[2].fwd.homologyLen).toBe(20);
    expect(designs[2].rev.homologyLen).toBe(0); // F3 last
  });

  it('homology customizable via opts', () => {
    const fragments = [
      frag('A', 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'),
      frag('B', 'CCCCCCCCCCCCCCCCCCCCCCCCCCCCCC'),
    ];
    const designs = designGibsonPrimers(fragments, true, { homologyLen: 15 });
    expect(designs[0].fwd.homologyLen).toBe(15);
    expect(designs[0].rev.homologyLen).toBe(15);
  });
});

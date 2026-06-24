/**
 * minimizer-index.test.js — (w,k) minimizer sketching + library index (§A6).
 * The index must rank a true homolog (incl. its reverse complement) above
 * unrelated entries, so it works as a fast candidate pre-filter for the exact
 * aligner.
 */
import { describe, it, expect } from 'vitest';
import {
  computeMinimizers, minimizerSketch, buildMinimizerIndex, rankByMinimizers,
} from '../minimizer-index';
import { reverseComplement } from '../../sequence-utils';

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
const OPTS = { k: 6, w: 5 };

describe('minimizer sketching', () => {
  it('is deterministic and empty below k', () => {
    const rng = mulberry32(1);
    const seq = randSeq(rng, 60);
    expect(computeMinimizers(seq, OPTS)).toEqual(computeMinimizers(seq, OPTS));
    expect(computeMinimizers('ACG', OPTS)).toEqual([]);
    expect(minimizerSketch(seq, OPTS).size).toBeGreaterThan(0);
  });

  it('a reverse complement produces the SAME canonical sketch', () => {
    const rng = mulberry32(2);
    const seq = randSeq(rng, 80);
    const a = minimizerSketch(seq, OPTS);
    const b = minimizerSketch(reverseComplement(seq), OPTS);
    // canonical hashing ⇒ identical (or near-identical) minimizer sets
    const inter = [...a].filter((h) => b.has(h)).length;
    expect(inter / a.size).toBeGreaterThan(0.9);
  });
});

describe('library index ranking', () => {
  it('ranks the exact entry, then a near-identical one, above the unrelated', () => {
    const rng = mulberry32(3);
    const target = randSeq(rng, 200);
    const nearly = `${target.slice(0, 100)}A${target.slice(101)}`; // 1 substitution
    const unrelated = randSeq(rng, 200);
    const entries = [
      { id: 'target', sequence: target },
      { id: 'nearly', sequence: nearly },
      { id: 'unrelated', sequence: unrelated },
    ];
    const index = buildMinimizerIndex(entries, OPTS);
    const ranked = rankByMinimizers(index, target, OPTS);
    expect(ranked[0].entryId).toBe('target');
    expect(ranked[0].jaccard).toBeGreaterThan(0.95);
    expect(ranked.find((r) => r.entryId === 'nearly').jaccard)
      .toBeGreaterThan(ranked.find((r) => r.entryId === 'unrelated')?.jaccard ?? 0);
  });

  it('finds a homolog given its reverse complement as the query', () => {
    const rng = mulberry32(4);
    const target = randSeq(rng, 200);
    const index = buildMinimizerIndex([
      { id: 'target', sequence: target },
      { id: 'other', sequence: randSeq(rng, 200) },
    ], OPTS);
    const ranked = rankByMinimizers(index, reverseComplement(target), OPTS);
    expect(ranked[0].entryId).toBe('target');
    expect(ranked[0].jaccard).toBeGreaterThan(0.9);
  });

  it('ranks a SHORT contained fragment high via containment (recall for partial homologs)', () => {
    const rng = mulberry32(7);
    const query = randSeq(rng, 600);
    const fragment = query.slice(200, 350); // 150 bp exact fragment of the query
    const index = buildMinimizerIndex([
      { id: 'fragment', sequence: fragment },
      { id: 'decoyLong', sequence: randSeq(rng, 600) },
    ], OPTS);
    const ranked = rankByMinimizers(index, query, OPTS);
    // Jaccard alone would bury the short fragment (size mismatch); containment saves it.
    expect(ranked[0].entryId).toBe('fragment');
    const frag = ranked.find((r) => r.entryId === 'fragment');
    expect(frag.containment).toBeGreaterThan(0.9);
    expect(frag.jaccard).toBeLessThan(0.5); // proves Jaccard would have ranked it low
  });

  it('excludeId drops the self-hit (for «find similar to me»)', () => {
    const rng = mulberry32(5);
    const target = randSeq(rng, 150);
    const index = buildMinimizerIndex([
      { id: 'self', sequence: target },
      { id: 'copy', sequence: target },
    ], OPTS);
    const ranked = rankByMinimizers(index, target, { ...OPTS, excludeId: 'self' });
    expect(ranked.every((r) => r.entryId !== 'self')).toBe(true);
    expect(ranked[0].entryId).toBe('copy');
  });
});

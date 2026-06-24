import { describe, it, expect } from 'vitest';
import { rankHomologs } from '../homologs';

// A varied 40-nt reference (non-repetitive so seeds are unambiguous).
const REF = 'ATGCCGTTAGGCATCCGATTACGGATCCGTTAACGGCATA';

const entries = [
  { id: 'same', name: 'identical', sequence: REF },
  // first 25 nt identical, then divergent → strong but partial
  { id: 'partial', name: 'partial', sequence: `${REF.slice(0, 25)}TTTTTTTTTTTTTTT` },
  // no shared k-mers → no homology
  { id: 'unrelated', name: 'unrelated', sequence: 'TTTTAAAACCCCGGGGTTTTAAAACCCCGGGGTTTTAAAA' },
];

describe('rankHomologs', () => {
  it('ranks library entries by homology to the reference, best first', () => {
    const ranked = rankHomologs(REF, entries);
    const ids = ranked.map((r) => r.entryId);
    expect(ids[0]).toBe('same'); // identical = strongest
    expect(ids).toContain('partial');
    expect(ids).not.toContain('unrelated'); // no hit → not suggested
    // identities are 0..1, descending
    expect(ranked[0].identity).toBeGreaterThanOrEqual(ranked[1].identity);
    expect(ranked[0].identity).toBeLessThanOrEqual(1);
  });

  it('carries the entry name through', () => {
    const ranked = rankHomologs(REF, entries);
    expect(ranked[0].name).toBe('identical');
  });

  it('excludes the reference entry itself', () => {
    const ranked = rankHomologs(REF, entries, { excludeId: 'same' });
    expect(ranked.map((r) => r.entryId)).not.toContain('same');
  });

  it('respects the limit', () => {
    const ranked = rankHomologs(REF, entries, { limit: 1 });
    expect(ranked.length).toBe(1);
    expect(ranked[0].entryId).toBe('same');
  });

  it('returns [] for a too-short reference or bad input', () => {
    expect(rankHomologs('ACGT', entries)).toEqual([]);
    expect(rankHomologs(REF, null)).toEqual([]);
    expect(rankHomologs('', entries)).toEqual([]);
  });

  it('still finds the true homolog in a LARGE library (minimizer pre-filter, §A6)', () => {
    // 80 unrelated decoys + the real homolog → exceeds the prefilter threshold,
    // so the minimizer sketch must keep the homolog among the search candidates.
    let a = 12345;
    const rnd = () => { a = (Math.imul(a ^ (a >>> 15), 1 | a) >>> 0); return (a % 4); };
    const decoy = (n) => Array.from({ length: n }, () => 'ACGT'[rnd()]).join('');
    const big = [{ id: 'real', name: 'real', sequence: `${REF}${decoy(160)}` }];
    for (let i = 0; i < 80; i++) big.push({ id: `d${i}`, name: `d${i}`, sequence: decoy(200) });
    const ranked = rankHomologs(REF, big, { limit: 5 });
    expect(ranked[0].entryId).toBe('real');
    // and the pre-filter doesn't change the result vs an exhaustive search
    const exhaustive = rankHomologs(REF, big, { limit: 5, prefilter: false });
    expect(exhaustive[0].entryId).toBe('real');
  });
});

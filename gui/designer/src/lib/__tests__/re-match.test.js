import { describe, it, expect } from 'vitest';
import { reMatch, makeReMatch, resolveEnzyme } from '../re-match.js';

const doc = (seq, { topology = 'linear', id = 'e1' } = {}) => ({
  ref: { kind: 'entry', id }, title: id, sequence: { seq, topology },
});

describe('resolveEnzyme', () => {
  it('resolves a classical Type II enzyme (case-insensitive)', () => {
    expect(resolveEnzyme('EcoRI')).toMatchObject({ kind: 'reII', name: 'EcoRI' });
    expect(resolveEnzyme('ecori')?.name).toBe('EcoRI');
  });
  it('resolves a Type IIS (Golden Gate) enzyme', () => {
    expect(resolveEnzyme('BsaI')).toMatchObject({ kind: 'reIIS', name: 'BsaI' });
  });
  it('returns null for an unknown enzyme / empty', () => {
    expect(resolveEnzyme('NotAnEnzyme')).toBeNull();
    expect(resolveEnzyme('')).toBeNull();
  });
});

describe('reMatch — classical Type II cut sites', () => {
  it('finds an EcoRI site and maps it to the recognition span (not the cut)', () => {
    const occ = reMatch('EcoRI', doc('AAAGAATTCTTT')); // GAATTC at 3..8
    expect(occ).toHaveLength(1);
    expect(occ[0].location.segments).toEqual([{ start: 3, end: 9 }]);
    expect(occ[0].location.strand).toBe('+');
    expect(occ[0].metrics.identity).toBe(1);
    expect(occ[0].enzyme).toMatchObject({ name: 'EcoRI', site: 'GAATTC', cutCount: 1, typeIIS: false });
  });

  it('reports cutCount for multiple sites', () => {
    const occ = reMatch('EcoRI', doc('GAATTCAAAGAATTC'));
    expect(occ).toHaveLength(2);
    expect(occ[0].enzyme.cutCount).toBe(2);
  });

  it('an IUPAC (degenerate) recognition site reports identity null (compatibility)', () => {
    // BstEII = GGTNACC; N matched by A → GGTAACC
    const occ = reMatch('BstEII', doc('AAAGGTAACCAAA'));
    expect(occ.length).toBeGreaterThanOrEqual(1);
    expect(occ[0].metrics.identity).toBeNull();
    expect(occ[0].metrics.uncertainMatches).toBe(1);
  });

  it('unknown enzyme / no sequence → empty', () => {
    expect(reMatch('NotAnEnzyme', doc('GAATTC'))).toEqual([]);
    expect(reMatch('EcoRI', doc(''))).toEqual([]);
  });

  it('circular: a recognition site straddling the origin → wrapsOrigin + 2 segments', () => {
    // GAATTC split across the origin: ...GAA | TTC...
    const occ = reMatch('EcoRI', doc('GAATTAAAAAAAG'.slice(1) + '', { topology: 'circular' }));
    // build a clean straddling fixture explicitly:
    const seq = 'TTCAAAAAAAGAA'; // GAATTC = pos10 G,11 A,12 A, 0 T,1 T,2 C
    const wrapOcc = reMatch('EcoRI', doc(seq, { topology: 'circular' }));
    const w = wrapOcc.find((o) => o.location.wrapsOrigin);
    expect(w).toBeDefined();
    expect(w.location.segments).toEqual([{ start: 10, end: 13 }, { start: 0, end: 3 }]);
    void occ;
  });
});

describe('reMatch — Type IIS (Golden Gate)', () => {
  it('finds a BsaI recognition site on the + strand', () => {
    const occ = reMatch('BsaI', doc('AAAGGTCTCAAA')); // GGTCTC at 3..8
    expect(occ).toHaveLength(1);
    expect(occ[0].location.segments).toEqual([{ start: 3, end: 9 }]);
    expect(occ[0].location.strand).toBe('+');
    expect(occ[0].enzyme).toMatchObject({ name: 'BsaI', typeIIS: true });
  });

  it('finds a BsaI site on the − strand (via reverse-complement GAGACC)', () => {
    const occ = reMatch('BsaI', doc('AAAGAGACCAAA')); // revcomp(GGTCTC)=GAGACC
    expect(occ).toHaveLength(1);
    expect(occ[0].location.strand).toBe('-');
  });
});

describe('reMatch — circular pref override (REV-1)', () => {
  it('circular:on finds an origin-straddling site on a linear-topology doc', () => {
    const occ = reMatch('EcoRI', doc('TTCAAAAAAAGAA', { topology: 'linear' }), { circular: 'on' });
    expect(occ.some((o) => o.location.wrapsOrigin)).toBe(true);
  });
  it('circular:off suppresses the wrap even on a circular doc', () => {
    const occ = reMatch('EcoRI', doc('TTCAAAAAAAGAA', { topology: 'circular' }), { circular: 'off' });
    expect(occ.some((o) => o.location.wrapsOrigin)).toBe(false);
  });
});

describe('makeReMatch', () => {
  it('returns a (reQuery, doc) closure', () => {
    const fn = makeReMatch({});
    expect(fn('EcoRI', doc('GAATTC'))).toHaveLength(1);
  });
});

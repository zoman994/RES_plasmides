/**
 * seq-match — the sequence-dimension provider. This is the `ctx.seqMatch` that library-search
 * injects: it adapts the ONE unified DNA engine to the SearchOccurrence contract
 * (`{ location:{segments,strand,wrapsOrigin}, metrics }`).
 *
 * K3 removed the routing (short vs long vs degenerate); K3.0 removed the IUPAC modes. Every DNA
 * query — short or long, linear or circular, one strand or both — takes the same path, and the
 * alphabet is A/C/G/T only (§2.5).
 */
import { describe, it, expect } from 'vitest';
import { seqMatch, toThresholdBps } from '../seq-match';

/**
 * `seqMatch` answers with a LOCUS ENVELOPE (P1-2/P1-3): the retained window plus how many loci exist
 * and which retained one is the §3.2 winner. Both numbers are measured behind the engine's payload
 * cap and cannot be recomputed downstream, which is why they travel with the window rather than
 * being inferred from it.
 *
 * These cases are about the OCCURRENCES, so they unwrap. The envelope's own two facts are pinned
 * separately at the bottom of this file, and in `search-cap-retention.test.js` end to end.
 */
const hits = (...args) => seqMatch(...args).occurrences;

describe('seq-match — short / exact', () => {
  it('returns SearchOccurrences with location + metrics', () => {
    const occ = hits('GAATTG', { seq: 'AAAGAATTGCCC', topology: 'linear' });
    expect(occ.length).toBeGreaterThanOrEqual(1);
    const plus = occ.find((o) => o.location.strand === '+');
    expect(plus.location.segments[0]).toEqual({ start: 3, end: 9 });
    expect(plus.location.wrapsOrigin).toBe(false);
    expect(plus.metrics.identity).toBe(1);
  });
  it('reports every overlapping occurrence (exhaustive path)', () => {
    const occ = hits('AA', { seq: 'AAAA' }, null, { bothStrands: false });
    expect(occ.map((o) => o.location.segments[0].start)).toEqual([0, 1, 2]);
  });
});

describe('seq-match — the ACGT-only boundary (§2.5)', () => {
  it('a degenerate query is REJECTED here, fail-closed — not answered with an empty list', () => {
    // The UI blocks this long before the provider, so reaching seqMatch means a guard was
    // bypassed. Returning [] would report «this motif is not in your molecule», which is a
    // statement about the biology that was never actually checked.
    let thrown = null;
    try { hits('GN', { seq: 'GAGTGC' }, null, { bothStrands: false }); } catch (e) { thrown = e; }
    expect(thrown).toBeTruthy();
    expect(thrown.code).toBe('INVALID_DNA');
  });

  it('a degenerate base in the TARGET is a plain mismatch, and identity stays a number', () => {
    const occ = hits('GAATTC', { seq: 'AAAGAANTCTTT', topology: 'linear' }, null, { bothStrands: false });
    expect(occ).toHaveLength(1);
    expect(occ[0].location.segments[0]).toEqual({ start: 3, end: 9 });
    expect(occ[0].metrics.substitutions).toBe(1);
    expect(occ[0].metrics.identity).toBeCloseTo(5 / 6, 10);
  });
});

describe('seq-match — circular wrap', () => {
  it('a motif spanning the origin is found for a circular sequence', () => {
    const occ = hits('AAGTTC', { seq: 'TTCGGGAAG', topology: 'circular' }, null, { bothStrands: false });
    const exact = occ.find((o) => o.location.segments[0].start === 6);
    expect(exact).toBeTruthy();
    expect(exact.location.wrapsOrigin).toBe(true);
    expect(exact.location.segments).toEqual([{ start: 6, end: 9 }, { start: 0, end: 3 }]);
    expect(exact.metrics.identity).toBe(1);

    // The shifted variant (drop the query's leading A as an insertion → AGTTC matches at
    // 7,8,0,1,2, 5/6 = 83.3%) clears the threshold, but it ends at the SAME unwrapped base as the
    // exact hit and is strictly nested in it — an endpoint shadow (§3.2.1). One locus, reported
    // once.
    expect(occ).toHaveLength(1);
  });
});

describe('seq-match — long fuzzy DNA goes through the SAME unified core', () => {
  it('a long query with one mismatch is found at the implanted locus with identity < 1', () => {
    const ref = 'ATGCGTACGTTAGCCTAGCATCGATCGTAGCTAGCTAGCTA'; // 41 nt
    const target = `TTTT${ref}TTTT`;
    // introduce a single mismatch in the query (pos 20: swap one base)
    const q = `${ref.slice(0, 20)}${ref[20] === 'A' ? 'C' : 'A'}${ref.slice(21)}`;
    const occ = hits(q, { seq: target, topology: 'linear' });
    expect(occ.length).toBeGreaterThanOrEqual(1);

    // §3.2 keeps EVERY distinct start (a neighbouring start can absorb the 1-nt offset as an
    // indel and still clear 80%), and the list is ordered by POSITION, not by quality — so the
    // implanted locus is identified by its coordinates, never by «occ[0]». Collapsing this for
    // the user is the view-model's job (best occurrence + location count).
    const atLocus = occ.find((o) => o.location.segments[0].start === 4);
    expect(atLocus).toBeTruthy();
    expect(atLocus.metrics.substitutions).toBe(1);
    expect(atLocus.metrics.identity).toBeCloseTo(40 / 41, 10);
    expect(atLocus.metrics.identity).toBeGreaterThan(0.9);
    expect(atLocus.metrics.identity).toBeLessThan(1);
    // and it is the strongest alignment in the list
    const strongest = occ.reduce((a, b) => ((b.metrics.identity ?? -1) > (a.metrics.identity ?? -1) ? b : a));
    expect(strongest.location.segments[0].start).toBe(4);
  });
});

describe('seq-match — guards', () => {
  it('no sequence → empty', () => {
    expect(hits('ATGC', null)).toEqual([]);
    expect(hits('ATGC', { seq: '' })).toEqual([]);
    expect(hits('', { seq: 'ATGC' })).toEqual([]);
  });
});

describe('seq-match — prefs overrides (REV-1)', () => {
  it('circular:on finds an origin-straddling motif on a linear-topology doc', () => {
    const occ = hits('GAATTC', { seq: 'TTCAAAAAAAGAA', topology: 'linear' }, null, { circular: 'on' });
    expect(occ.some((o) => o.location.wrapsOrigin)).toBe(true);
  });
  it('circular:off disables wrap even on a circular doc', () => {
    const occ = hits('GAATTC', { seq: 'TTCAAAAAAAGAA', topology: 'circular' }, null, { circular: 'off' });
    expect(occ.some((o) => o.location.wrapsOrigin)).toBe(false);
  });
  it('threshold — not maxMismatches — is what admits or rejects it (1.0 forbids any edit)', () => {
    // CONTRACT CHANGE (K3, SPEC §5.1): `identityThreshold` is the ONLY acceptance control. One
    // substitution gives 5/6 = 83.3%, which clears 80% but not 100%.
    const doc = { seq: 'AAAGAAGTCTTT', topology: 'linear' };
    expect(hits('GAATTC', doc, null, { bothStrands: false })).toHaveLength(1);
    expect(hits('GAATTC', doc, null, { bothStrands: false, identityThreshold: 1 })).toHaveLength(0);
    // a legacy stored maxMismatches must not widen anything any more
    expect(hits('GAATTC', doc, null, { bothStrands: false, identityThreshold: 1, maxMismatches: 5 })).toHaveLength(0);
  });
});

describe('seq-match — toThresholdBps (the ONE identityThreshold → basis-points conversion)', () => {
  it.each([
    [undefined, 8000], [null, 8000], [NaN, 8000], [Infinity, 8000], [-Infinity, 8000], ['0.9', 8000],
    [0.8, 8000], [0.95, 9500], [1, 10000], [0.5, 5000],
    [0.4, 5000], [0, 5000], [-1, 5000], [1.5, 10000], [2, 10000],
  ])('toThresholdBps(%s) === %i', (input, expected) => {
    expect(toThresholdBps(input)).toBe(expected);
  });

  it('rounds exactly once (no double rounding drift at the 80.00% boundary)', () => {
    expect(toThresholdBps(0.7999)).toBe(7999);
    expect(toThresholdBps(0.80004)).toBe(8000);
  });
});

describe('seq-match — canonical occurrence shape (K3)', () => {
  const doc = { seq: 'AAAGAATTGCCC', topology: 'linear' };

  it('editRuns live in metrics, and no engine-internal fields leak onto the occurrence', () => {
    const [occ] = hits('GAATTG', doc, null, { bothStrands: false });
    expect(Array.isArray(occ.metrics.editRuns)).toBe(true);
    expect(occ.metrics.editRuns.length).toBeGreaterThan(0);
    // ProviderOccurrence is {location, metrics} only — never the engine's own scratch fields.
    expect(occ).not.toHaveProperty('editRuns');
    expect(occ).not.toHaveProperty('start');
    expect(occ).not.toHaveProperty('end');
    expect(occ).not.toHaveProperty('script');
    expect(occ).not.toHaveProperty('targetRef'); // owner is assigned only by the orchestrator
    expect(Object.keys(occ).sort()).toEqual(['location', 'metrics']);
  });

  it('carries the full alignment metric set the K3 UI needs', () => {
    const [occ] = hits('GAATTG', doc, null, { bothStrands: false });
    for (const k of ['alignmentLength', 'queryLength', 'targetSpan', 'substitutions', 'insertions',
      'deletions', 'indelBases', 'indelEvents', 'editDistance', 'identity', 'exactMatches',
      'coverage']) {
      expect(occ.metrics, k).toHaveProperty(k);
    }
    expect(occ.metrics.coverage).toBe(1);
    // The compatibility-era surrogates are gone from DNA search (§2.5). They remain in the shared
    // IUPAC layer for primers, enzymes and protein search — just not here.
    for (const k of ['compatibility', 'identityLowerBound', 'uncertainMatches', 'compatibleMatches']) {
      expect(occ.metrics, k).not.toHaveProperty(k);
    }
  });
});

describe('seq-match — resource exhaustion is an honest incomplete, never a miss (§3.3)', () => {
  it('throws a typed RESOURCE_LIMIT instead of returning []', () => {
    const doc = { seq: 'AC'.repeat(400), topology: 'linear' };
    let thrown = null;
    // The query must have NO exact occurrence, or there is no approximate pass to exhaust. It used
    // to be `ACACACACAC`, which IS present exactly — the throw came from the EXACT pass running out
    // of budget, which no longer happens: the exact phase is a literal scan with no state to
    // exhaust, so it simply returns the hits it can see. That is the point of the phase split, and
    // it makes this test's own subject (an unaffordable APPROXIMATE pass) the thing being measured.
    try {
      hits('ACACAGACAC', doc, null, { identityThreshold: 0.7, stateBudget: 2000 });
    } catch (e) { thrown = e; }
    expect(thrown).toBeTruthy();
    expect(thrown.code).toBe('RESOURCE_LIMIT');
  });

  it('an exact hit is returned even under a budget too small for the approximate pass', () => {
    // The same tiny budget, but a query that IS present exactly: exact-first means the cheap, certain
    // answer is given rather than a resource failure raised on work that never needed to happen.
    const doc = { seq: 'AC'.repeat(400), topology: 'linear' };
    const occ = hits('ACACACACAC', doc, null, { identityThreshold: 0.7, stateBudget: 2000 });
    expect(occ.length).toBeGreaterThan(0);
    expect(occ.every((o) => o.metrics.identity === 1)).toBe(true);
  });

  it('a completable search on the same shape still returns hits (the throttle is the cause)', () => {
    const doc = { seq: 'AC'.repeat(400), topology: 'linear' };
    const occ = hits('ACACACACAC', doc, null, { identityThreshold: 0.7, bothStrands: false });
    expect(occ.length).toBeGreaterThan(0);
  });
});

describe('seqMatch — the envelope itself, not just its window', () => {
  it('a hit declares the true locus count and names a retained winner', () => {
    const env = seqMatch('GAATTG', { seq: 'AAAGAATTGCCC', topology: 'linear' }, null, { bothStrands: false });
    expect(env.occurrences.length).toBeGreaterThan(0);
    // Nothing was capped away here, so the count IS the window — but it is a separate fact, and the
    // cap test proves the two diverge on a repeat-rich molecule.
    expect(env.locationCount).toBe(env.occurrences.length);
    expect(env.bestIndex).toBeGreaterThanOrEqual(0);
    expect(env.bestIndex).toBeLessThan(env.occurrences.length);
  });

  it('an honest miss declares NO winner — `-1` is a verdict, not «index 0»', () => {
    const env = seqMatch('GGGGGG', { seq: 'AAAAAAAAAAAA', topology: 'linear' }, null, { identityThreshold: 1 });
    expect(env.occurrences).toEqual([]);
    expect(env.locationCount).toBe(0);
    expect(env.bestIndex).toBe(-1);
  });

  it('an INVALID limit does not switch the payload cap OFF', () => {
    // `0` / `NaN` used to mean two contradictory things at once — `slice(0, NaN)` empties the result
    // while a `length <= limit` guard passes everything through. Both now resolve to the documented
    // default, so the window stays a window either way.
    //
    // The molecule must hold MORE loci than the default cap, or the test proves nothing: on a
    // 20-locus fixture «same as default» and «no cap at all» are the same answer, and only a
    // repeat-rich one can tell them apart.
    const COPIES = 600; // > DEFAULT_LIMIT (500)
    const doc = { seq: 'GAATTC'.repeat(COPIES), topology: 'linear' };
    const opts = { bothStrands: false, identityThreshold: 1 };
    const good = seqMatch('GAATTC', doc, null, opts);
    expect(good.occurrences).toHaveLength(500); //        the cap bites…
    expect(good.locationCount).toBe(COPIES); //           …and the count still tells the truth
    for (const bad of [0, -1, NaN, 1.5, '5']) {
      const env = seqMatch('GAATTC', doc, null, { ...opts, limit: bad });
      expect(env.occurrences, `limit=${String(bad)}`).toHaveLength(500); // not 0, and not all 600
      expect(env.locationCount).toBe(COPIES);
    }
  });
});

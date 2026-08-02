/**
 * K2a — the ACGT-only alphabet, and §3.2.1 endpoint-shadow pruning (SEARCH-GAPPED-DNA §2.5, §3.2.1,
 * §6).
 *
 * Strands, circular topology and resource budgets moved to `dna-gapped-search-k2-strands.test.js`
 * in U7, when this file passed the 25 KiB hard size limit. The split is mechanical and the seam is
 * the file's own section banner; nothing about what is asserted changed.
 *
 * Same discipline as K1: the accepted oracle (glocal-oracle) is the source of truth for the
 * differential.
 *
 * K3.0 SUPERSEDED the IUPAC branch of this file. The interactive engine is ACGT-only (§2.5), so
 * the `auto`/`off` compatibility modes, the `~` column and the `identity: null` case no longer
 * exist as behaviour, and asserting them would pin a contract the product has dropped. What
 * replaces them below is the normative alphabet contract: a degenerate QUERY is rejected outright,
 * a degenerate TARGET base is an ordinary mismatch, and identity is always a real number.
 */
import { describe, it, expect } from 'vitest';
import {
  dnaGappedSearch, pruneEndpointShadows as enginePrune,
} from '../dna-gapped-search';
import { oracleSearchLinear, pruneEndpointShadows } from './helpers/glocal-oracle';

const pick = (hits, start) => hits.find((h) => h.start === start) || null;
const shape = (h) => (h ? {
  start: h.start, end: h.end,
  subs: h.metrics.substitutions, ins: h.metrics.insertions, del: h.metrics.deletions,
  L: h.metrics.alignmentLength, script: h.script,
} : null);
const oShape = (h) => ({
  start: h.targetStart, end: h.targetEnd, subs: h.X, ins: h.I, del: h.D, L: h.L, script: h.script,
});
/** Literal A↔T / C↔G — the engine's own pairing, not the shared degenerate complement table. */
const RC = (q) => [...q].reverse().map((c) => ({ A: 'T', C: 'G', G: 'C', T: 'A' }[c])).join('');

function lcg(seed) { let s = seed >>> 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; }
function randFrom(rnd, alphabet, len) { let o = ''; for (let i = 0; i < len; i++) o += alphabet[Math.floor(rnd() * alphabet.length)]; return o; }

// ────────────────────────── K2a — the ACGT-only alphabet ──────────────────────────

describe('K2a §2.5 — the engine deals in A/C/G/T only', () => {
  it('a degenerate QUERY is rejected outright, never answered with «0 совпадений»', () => {
    // Returning [] here would tell the biologist their motif is absent from the molecule. It is
    // not absent — it was never searched for. The difference matters, so this is a typed throw.
    for (const q of ['GN', 'GR', 'ACGTNACGT', 'ACGUACGU', 'ACGT-ACGT']) {
      let thrown = null;
      try { dnaGappedSearch(q, 'GAACGTACGTAA', { thresholdBps: 5000 }); } catch (e) { thrown = e; }
      expect(thrown, `${q} must not search`).toBeTruthy();
      expect(thrown.code).toBe('INVALID_DNA');
    }
  });

  it('a degenerate TARGET base is an ordinary mismatch — no wildcard credit', () => {
    // `N` in a stored molecule is real (a sequencing gap, a masked base). Treating it as «any
    // base» would report a perfect hit over a stretch nobody has actually read.
    const got = pick(dnaGappedSearch('GA', 'GN', { thresholdBps: 4000 }), 0);
    expect(shape(got)).toMatchObject({ start: 0, end: 2, subs: 1, ins: 0, del: 0, L: 2, script: '=X' });
    expect(got.metrics.identity).toBe(0.5);
  });

  it('`U` in the target is NOT silently equal to `T`', () => {
    expect(dnaGappedSearch('GT', 'GU', { thresholdBps: 10000 })).toHaveLength(0);
    expect(pick(dnaGappedSearch('GT', 'GU', { thresholdBps: 4000 }), 0).script).toBe('=X');
  });

  it('identity is ALWAYS a number, and the compatibility-era fields are gone', () => {
    const rnd = lcg(0x2701);
    for (let n = 0; n < 200; n++) {
      const q = randFrom(rnd, 'ACGT', 1 + Math.floor(rnd() * 4));
      const t = randFrom(rnd, 'ACGTRYN', 1 + Math.floor(rnd() * 8)); // ambiguity on the TARGET side
      for (const h of dnaGappedSearch(q, t, { thresholdBps: 6000 })) {
        const m = h.metrics;
        expect(Number.isFinite(m.identity)).toBe(true);
        expect(m.identity).toBeGreaterThanOrEqual(0);
        expect(m.identity).toBeLessThanOrEqual(1);
        expect(m.identity).toBeCloseTo(m.exactMatches / m.alignmentLength, 12); // exactly M/L
        expect(m).not.toHaveProperty('compatibility');
        expect(m).not.toHaveProperty('identityLowerBound');
        expect(m).not.toHaveProperty('uncertainMatches');
        expect(m).not.toHaveProperty('compatibleMatches');
      }
    }
  });

  it('DIFFERENTIAL: engine ≡ oracle when the TARGET carries unknown glyphs', () => {
    // The remaining place ambiguity can legitimately appear is the molecule. Both independent
    // implementations must score such a column as `X` and agree hit-for-hit.
    for (const [seed, tBps] of [[0xA1, 7000], [0xB2, 8000], [0xC3, 6000]]) {
      const rnd = lcg(seed);
      let nonEmpty = 0;
      for (let n = 0; n < 150; n++) {
        const q = randFrom(rnd, 'ACGT', 1 + Math.floor(rnd() * 5)); // ≤5
        // Weighted like a real molecule — mostly ACGT with the occasional unknown base. A flat
        // 12-glyph alphabet makes almost every column a mismatch, so hits become too rare for the
        // agreement to prove anything.
        const t = randFrom(rnd, 'ACGTACGTACGTNRYU', 1 + Math.floor(rnd() * 10)); // ≤11
        const ref = pruneEndpointShadows(oracleSearchLinear(q, t, { thresholdBps: tBps })).map(oShape);
        const eng = dnaGappedSearch(q, t, { thresholdBps: tBps }).map(shape);
        expect(eng, `q=${q} t=${t} thr=${tBps}`).toEqual(ref);
        if (ref.length) nonEmpty += 1;
      }
      expect(nonEmpty).toBeGreaterThan(20);
    }
  });
});

describe('§3.2.1 — endpoint-shadow pruning: one locus once, real neighbours kept', () => {
  it('Igor\'s minimal case — INNER wins: ACGT on AACGT is one site, not two boundaries', () => {
    // start 0 → `=D===` (4/5 = 80%, [0,5));  start 1 → exact `====` ([1,5)).
    // Same physical endpoint 5, strictly nested, exact strictly wins → the outer shadow goes.
    const hits = dnaGappedSearch('ACGT', 'AACGT', { thresholdBps: 8000, bothStrands: false });
    expect(hits).toHaveLength(1);
    expect(hits[0].start).toBe(1);
    expect(hits[0].metrics.identity).toBe(1);
  });

  it('OUTER wins too — direction is not privileged', () => {
    // On ACGT/ACGT at 70%: start 0 is the exact hit ([0,4)); start 1 is `I===` (3/4 = 75%, [1,4)),
    // i.e. the INNER one. Here the outer candidate is the better one and removes the inner.
    const hits = dnaGappedSearch('ACGT', 'ACGT', { thresholdBps: 7000, bothStrands: false });
    expect(hits).toHaveLength(1);
    expect(hits[0].start).toBe(0);
    expect(hits[0].metrics.identity).toBe(1);
  });

  it('a strict comparator tie drops NOTHING (unit — unreachable through the public API)', () => {
    // Rule 7 compares the edit script, and different spans give different-length scripts, so a
    // true tie cannot arise from the engine itself. Synthetic occurrences exercise the guard.
    const mk = (start, span) => ({
      start,
      script: '====',
      metrics: {
        targetSpan: span, queryLength: 4, alignmentLength: 4, identity: 1,
        exactMatches: 3, editDistance: 1, indelEvents: 1,
      },
    });
    const a = mk(2, 3); const b = mk(0, 5); // same endpoint 5, spans 3 and 5 → nested, all rules tie
    expect(enginePrune([a, b], 10, false)).toEqual([a, b]);
  });

  it('circular geometry (SEAM): a wrapping and a non-wrapping candidate share ONE bucket', () => {
    // Direct seam on the pruning function — the scanner is not asked to conjure this pair by
    // luck. On a ring of 10 both candidates end at physical base 2, but their RAW `start + span`
    // read 12 and 2. Only folding modulo n puts them in one bucket; lifted to a common E = 2 the
    // intervals are [-2,2) and [0,2), so the second is strictly contained in the first.
    // The inner one wins the comparator, so the outer wrapping candidate is the shadow.
    const occ = (start, span, L, M) => ({
      start,
      script: '='.repeat(L),
      metrics: {
        targetSpan: span, queryLength: 2, alignmentLength: L, identity: M / L,
        exactMatches: M, editDistance: L - M, indelEvents: L === M ? 0 : 1,
      },
    });
    const outerWrapping = occ(8, 4, 4, 2); //  raw end 12 → physical 2; identity 0.5
    const innerPlain = occ(0, 2, 2, 2); //     raw end  2 → physical 2; identity 1.0

    const kept = enginePrune([outerWrapping, innerPlain], 10, true);
    expect(kept).toEqual([innerPlain]); // the wrapping shadow is gone

    // …and the same pair on a LINEAR molecule must NOT be bucketed together (ends 12 vs 2 really
    // are different endpoints there), so nothing is pruned — the modulo is circular-only.
    expect(enginePrune([outerWrapping, innerPlain], 10, false)).toEqual([outerWrapping, innerPlain]);
  });

  it('circular: a WRAPPING parent and a NON-wrapping shadow share one physical endpoint', () => {
    // Igor's risk case: on a ring the raw `start + span` is origin-dependent, so a wrapping hit
    // and a non-wrapping one that end at the SAME base read as different numbers (here 12 vs 2)
    // and would never be compared. Folding modulo n puts them in one group.
    const ring = 'ACGTACGTGG'; // n = 10
    const query = `${ring.slice(8)}${ring.slice(0, 2)}`; // 'GGAC' — exact at [8,10)+[0,2)
    const hits = dnaGappedSearch(query, ring, { thresholdBps: 5000, circular: true, bothStrands: false });
    // exact wrap hit: start 8, span 4 → raw end 12, physical endpoint 2
    // shadow:         start 0, span 2 (2 leading I, 2/4 = 50%) → raw end 2, physical endpoint 2
    const atEndpoint2 = hits.filter((h) => (h.start + h.metrics.targetSpan) % ring.length === 2);
    expect(atEndpoint2).toHaveLength(1);
    expect(atEndpoint2[0].start).toBe(8);
    expect(atEndpoint2[0].wrapsOrigin).toBe(true);
    expect(atEndpoint2[0].metrics.identity).toBe(1);
  });

  it('circular pruning is ROTATION INVARIANT (physical endpoint folded modulo n)', () => {
    const rnd = lcg(0xC0FFEE);
    for (let n = 0; n < 30; n++) {
      const ring = randFrom(rnd, 'ACGT', 9 + Math.floor(rnd() * 5));
      const q = randFrom(rnd, 'ACGT', 4 + Math.floor(rnd() * 3));
      const r = 1 + Math.floor(rnd() * (ring.length - 1));
      const rot = ring.slice(r) + ring.slice(0, r);
      const base = dnaGappedSearch(q, ring, { thresholdBps: 8000, circular: true, bothStrands: false })
        .map((h) => h.start).sort((x, y) => x - y);
      const after = dnaGappedSearch(q, rot, { thresholdBps: 8000, circular: true, bothStrands: false })
        .map((h) => (h.start + r) % ring.length).sort((x, y) => x - y);
      expect(after, `ring=${ring} q=${q} r=${r}`).toEqual(base);
    }
  });

  it('both same-endpoint ladders (left AND right) collapse to the one exact locus', () => {
    // A 40-mer at 80% gets an edit budget of 10, so WITHOUT pruning every start shifted RIGHT by
    // d ≤ 8 also clears the threshold by absorbing the offset as d leading insertions — and each
    // of those ends at the SAME physical base as the full hit, so each is its shadow.
    const core = 'ACGTCAGTGACTGCATCTGAACGTCAGTGACTGCATCTGA'; // 40 nt, non-periodic
    const target = `TTTTTTTTTTTTTTTTTTTTTTTTTTTTTT${core}TTTTTTTTTTTTTTTTTTTT`;
    const hits = dnaGappedSearch(core, target, { thresholdBps: 8000, bothStrands: false });

    // Exactly one candidate ends where the true locus ends — the full exact alignment. BOTH
    // ladders that reach endpoint 70 are gone: the right one (starts 31…38, `I^d =^(40−d)`,
    // nested INSIDE the exact hit) and the mirror left one (starts 22…29, which reach the same
    // endpoint by absorbing the flank as leading substitutions + interior deletions, e.g.
    // start 22 = X + 8D + 39 matches = 39/48 = 81.25%, and CONTAIN the exact hit).
    const atEndpoint = hits.filter((h) => h.start + h.metrics.targetSpan === 70);
    expect(atEndpoint.map((h) => h.start)).toEqual([30]);
    expect(atEndpoint[0].metrics.identity).toBe(1);

    // …and no surviving pair anywhere shares an endpoint.
    const ends = hits.map((h) => h.start + h.metrics.targetSpan);
    expect(new Set(ends).size).toBe(hits.length);
  });

  it('a truncated hit with NO full parent survives (nothing shadows it)', () => {
    const core = 'ACGTCAGTGACTGCATCTGA'; // 20
    const query = `GGGGG${core}`; //       25 — the GGGGG prefix is absent from the target
    const hits = dnaGappedSearch(query, core, { thresholdBps: 8000, bothStrands: false });
    const h = hits.find((x) => x.start === 0);
    expect(h).toBeTruthy();
    expect(h.metrics.insertions).toBe(5); // 20/25 = 80%, admissible and unshadowed
  });

  it('AA in AAAA keeps starts 0,1,2 — different ends are never shadows', () => {
    expect(dnaGappedSearch('AA', 'AAAA', { thresholdBps: 10000, bothStrands: false }).map((h) => h.start))
      .toEqual([0, 1, 2]);
  });

  it('tandem exact copies BOTH survive', () => {
    const unit = 'ACGTCAGTGACTGCAT'; // 16
    const hits = dnaGappedSearch(unit, `${unit}${unit}`, { thresholdBps: 8000, bothStrands: false });
    const exact = hits.filter((h) => h.metrics.identity === 1).map((h) => h.start);
    expect(exact).toEqual([0, 16]); // overlap-based clustering would have destroyed one
  });

  it('partially overlapping REAL hits with different ends both survive', () => {
    const core = 'ACGTACGTACGTACGTACGT'; // periodic → exact hits at 0,4,8,…
    const hits = dnaGappedSearch(core, `${core}ACGTACGTAC`, { thresholdBps: 10000, bothStrands: false });
    expect(hits.length).toBeGreaterThan(1);
    // each retained hit owns its own unwrapped end — nothing collapsed merely for overlapping
    const ends = hits.map((h) => h.start + h.metrics.targetSpan);
    expect(new Set(ends).size).toBe(hits.length);
  });

  it('circular: a wrap shadow is pruned in UNWRAPPED coordinates, second lap still forbidden', () => {
    const ring = 'TTCGGGAAG'; // n = 9
    const hits = dnaGappedSearch('AAGTTC', ring, { thresholdBps: 8000, circular: true, bothStrands: false });
    // start 6 (exact, span 6) and start 7 (leading I, span 5) share unwrapped end 12 → shadow.
    expect(hits.map((h) => h.start)).toEqual([6]);
    expect(hits[0].wrapsOrigin).toBe(true);
    expect(hits[0].segments).toEqual([{ start: 6, end: 9 }, { start: 0, end: 3 }]);
    for (const h of hits) expect(h.metrics.targetSpan).toBeLessThanOrEqual(ring.length);
  });

  it('pruning happens per strand — a minus-strand hit is never shadowed by a plus-strand one', () => {
    const core = 'ACGTCAGTGACTGCAT';
    const target = `TTTT${core}TTTT`;
    const both = dnaGappedSearch(RC(core), target, { thresholdBps: 9000, bothStrands: true });
    expect(both.some((h) => h.strand === '-' || h.strand === 'both')).toBe(true);
  });
});

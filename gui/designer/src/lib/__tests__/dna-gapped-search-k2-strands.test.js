/**
 * K2b/K2c/K2d — strands, circular topology and resource budgets (SEARCH-GAPPED-DNA §2.6, §2.7,
 * §3.3, §6).
 *
 * Split out of `dna-gapped-search-k2.test.js` in U7, which had grown past the 25 KiB hard size
 * limit. A MECHANICAL MOVE: every fixture, assertion and comment below is byte-for-byte what that
 * file ran, and the seam is the one the file already used — its own section banners. The sibling
 * keeps K2a (the ACGT-only alphabet) and the §3.2.1 endpoint-shadow block.
 *
 * Same discipline as K1: the accepted oracle is the source of truth for the differential. Reverse
 * complement and circular topology are asserted as PROPERTIES (rc symmetry, rotation invariance)
 * plus hand-checked examples, because the oracle is single-strand / linear by construction.
 *
 * Mutation gates proven RED by mutating the module (see the sprint report): remove the RC pass,
 * allow a circular second lap, and return `[]` (as if complete) on resource exhaustion.
 */
import { describe, it, expect } from 'vitest';
import {
  dnaGappedSearch, dnaGappedSearchSession, RESOURCE_LIMIT, queryRangeForRun,
} from '../dna-gapped-search';

const pick = (hits, start) => hits.find((h) => h.start === start) || null;
/** Literal A↔T / C↔G — the engine's own pairing, not the shared degenerate complement table. */
const RC = (q) => [...q].reverse().map((c) => ({ A: 'T', C: 'G', G: 'C', T: 'A' }[c])).join('');

function lcg(seed) { let s = seed >>> 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; }
function randFrom(rnd, alphabet, len) { let o = ''; for (let i = 0; i < len; i++) o += alphabet[Math.floor(rnd() * alphabet.length)]; return o; }

// ───────────────────────── K2b — both strands / reverse complement ─────────────────────────


describe('K2b §2.6 — reverse complement, strand mapping, palindrome merge', () => {
  const CORE = 'ACGTCAGTGACTGCAT'; // 16 nt, not its own reverse complement

  it('a minus-strand-only hit is found with bothStrands, absent without', () => {
    const target = `TTTT${CORE}TTTT`;
    const query = RC(CORE); // only the reverse complement is present in the target
    const both = dnaGappedSearch(query, target, { thresholdBps: 9000, bothStrands: true });
    const plus = dnaGappedSearch(query, target, { thresholdBps: 9000, bothStrands: false });
    const minus = both.find((h) => h.strand === '-');
    expect(minus).toBeTruthy();
    expect(minus.start).toBe(4);
    expect(minus.end).toBe(4 + CORE.length);
    expect(minus.metrics.identity).toBe(1);
    expect(plus.some((h) => h.strand === '-')).toBe(false);
    expect(plus.find((h) => h.start === 4)).toBeFalsy(); // the forward query is not on the + strand here
  });

  it('engine default is single strand (+ only); both is opt-in', () => {
    const target = `TTTT${CORE}TTTT`;
    const def = dnaGappedSearch(RC(CORE), target, { thresholdBps: 9000 });
    expect(def.some((h) => h.strand === '-')).toBe(false);
  });

  it('queryRangeForRun maps a minus-strand probe run back to original query indices', () => {
    const target = `TTTT${CORE}TTTT`;
    const minus = dnaGappedSearch(RC(CORE), target, { thresholdBps: 9000, bothStrands: true })
      .find((h) => h.strand === '-');
    // exact hit → one '=' run over the whole probe; mapped query range is the whole query, reversed
    const run = minus.editRuns[0];
    const qr = queryRangeForRun(run, minus.strand, minus.metrics.queryLength);
    expect(qr).toEqual({ queryStart: 0, queryEnd: CORE.length });
    // a proper sub-run maps to the mirror window
    const sub = { ...run, probeStart: 0, probeEnd: 3 };
    expect(queryRangeForRun(sub, '-', CORE.length)).toEqual({ queryStart: CORE.length - 3, queryEnd: CORE.length });
  });

  it('property: minus-strand occurrences equal the plus search of the reverse-complemented query', () => {
    const rnd = lcg(0x5151);
    for (let n = 0; n < 60; n++) {
      const q = randFrom(rnd, 'ACGT', 4 + Math.floor(rnd() * 4));
      const t = randFrom(rnd, 'ACGT', 6 + Math.floor(rnd() * 8));
      const minus = dnaGappedSearch(q, t, { thresholdBps: 8000, bothStrands: true })
        .filter((h) => h.strand === '-')
        .map((h) => ({ start: h.start, end: h.end, L: h.metrics.alignmentLength, subs: h.metrics.substitutions }));
      const ref = dnaGappedSearch(RC(q), t, { thresholdBps: 8000, bothStrands: false })
        .map((h) => ({ start: h.start, end: h.end, L: h.metrics.alignmentLength, subs: h.metrics.substitutions }));
      expect(minus, `q=${q} t=${t}`).toEqual(ref);
    }
  });

  it('a palindrome (EcoRI GAATTC) merges + and − into ONE both-strand occurrence', () => {
    const target = 'TTTGAATTCTTT';
    const hits = dnaGappedSearch('GAATTC', target, { thresholdBps: 10000, bothStrands: true });
    const at3 = hits.filter((h) => h.start === 3);
    expect(at3).toHaveLength(1);           // not two occurrences
    expect(at3[0].strand).toBe('both');
    expect(at3[0].metrics.identity).toBe(1);
  });

  it('same location but DIFFERENT scripts stay separate + and − (merge is by canonical script)', () => {
    // Two alignments can share a location and even the same M/U/X/I/D totals while placing the
    // edit differently (e.g. `=I=X` vs `IX==`) — those are genuinely different occurrences and a
    // counts-only equivalence would wrongly fuse them into one `both`. Rather than pin one fragile
    // example (endpoint pruning can legitimately remove a hand-picked one), sweep a small space
    // and assert the invariant on every same-location +/− pair that actually survives.
    const rnd = lcg(0xBEEF);
    let checked = 0;
    for (let n = 0; n < 400; n++) {
      const q = randFrom(rnd, 'ACGT', 3 + Math.floor(rnd() * 3));
      const t = randFrom(rnd, 'ACGT', 6 + Math.floor(rnd() * 5));
      const hits = dnaGappedSearch(q, t, { thresholdBps: 5000, bothStrands: true });
      const plusOnly = dnaGappedSearch(q, t, { thresholdBps: 5000, bothStrands: false });
      const minusOnly = dnaGappedSearch(RC(q), t, { thresholdBps: 5000, bothStrands: false });
      for (const p of plusOnly) {
        const m = minusOnly.find((x) => x.start === p.start && x.end === p.end);
        if (!m || m.script === p.script) continue; // same script → merging is correct
        checked += 1;
        const merged = hits.find((h) => h.start === p.start && h.end === p.end && h.strand === 'both');
        expect(merged, `q=${q} t=${t} +${p.script} −${m.script} must NOT merge`).toBeFalsy();
      }
    }
    expect(checked, 'sweep found no different-script same-location pair — test would be vacuous')
      .toBeGreaterThan(0);
  });
});

// ─────────────────────────────── K2c — circular topology ───────────────────────────────

describe('K2c §2.7 — circular origin wrap, no second lap', () => {
  const RING = 'ACGTCAGTGACTGCAT'; // n = 16

  it('exact hit across the origin → one occurrence, two ordered segments', () => {
    const query = RING.slice(10) + RING.slice(0, 6); // starts at 10, wraps to 6
    const got = pick(dnaGappedSearch(query, RING, { thresholdBps: 9000, circular: true }), 10);
    expect(got).toBeTruthy();
    expect(got.wrapsOrigin).toBe(true);
    expect(got.segments).toEqual([{ start: 10, end: 16 }, { start: 0, end: 6 }]);
    expect(got.metrics.identity).toBe(1);
    expect(got.metrics.targetSpan).toBe(query.length);
  });

  it('the same query on a LINEAR target does NOT get an artificial wrap hit', () => {
    const query = RING.slice(10) + RING.slice(0, 6);
    const linear = dnaGappedSearch(query, RING, { thresholdBps: 9000, circular: false });
    expect(linear.some((h) => h.wrapsOrigin)).toBe(false);
    expect(linear.find((h) => h.start === 10)).toBeFalsy(); // can't fit past the linear end
  });

  it('a gapped hit with the gap right at the origin is one wrap occurrence', () => {
    // query = tail + head with one extra base inserted at the junction → 1 insertion, wraps
    const query = `${RING.slice(12)}A${RING.slice(0, 6)}`; // tail(4) + inserted A + head(6) = 11 nt
    const got = pick(dnaGappedSearch(query, RING, { thresholdBps: 8000, circular: true }), 12);
    expect(got).toBeTruthy();
    expect(got.wrapsOrigin).toBe(true);
    expect(got.metrics.insertions + got.metrics.deletions).toBeGreaterThanOrEqual(1);
    expect(got.metrics.targetSpan).toBeLessThanOrEqual(RING.length);
  });

  it('no second lap: targetSpan never exceeds the circle length', () => {
    const ring = 'ACG'; // n = 3
    const query = 'ACGACGACG'; // 3 laps — must not be represented as a span-9 hit
    const hits = dnaGappedSearch(query, ring, { thresholdBps: 5000, circular: true });
    for (const h of hits) expect(h.metrics.targetSpan).toBeLessThanOrEqual(ring.length);
  });

  it('property: rotating the circle rotates hit starts by the same offset (mod n)', () => {
    const rnd = lcg(0x9001);
    for (let n = 0; n < 40; n++) {
      const ring = randFrom(rnd, 'ACGT', 8 + Math.floor(rnd() * 6));
      const q = randFrom(rnd, 'ACGT', 3 + Math.floor(rnd() * 4));
      const r = 1 + Math.floor(rnd() * (ring.length - 1));
      const rot = ring.slice(r) + ring.slice(0, r);
      const base = dnaGappedSearch(q, ring, { thresholdBps: 8000, circular: true }).map((h) => h.start).sort((a, b) => a - b);
      const rotated = dnaGappedSearch(q, rot, { thresholdBps: 8000, circular: true })
        .map((h) => ((h.start + r) % ring.length)).sort((a, b) => a - b);
      expect(rotated, `ring=${ring} q=${q} r=${r}`).toEqual(base);
    }
  });
});

// ─────────────────────────── K2d — resource budget / incomplete ───────────────────────────

describe('K2d §3.3 — deterministic budget → typed RESOURCE_LIMIT, never a silent zero', () => {
  it('a normal search returns a complete session', () => {
    const s = dnaGappedSearchSession('ACGTACGT', 'TTACGTACGTTT', { thresholdBps: 8000 });
    expect(s.incomplete).toBe(false);
    expect(s.reason).toBeNull();
    expect(s.occurrences.length).toBeGreaterThan(0);
  });

  it('budget exhaustion on low-complexity input → incomplete, no hits, typed reason', () => {
    // low-complexity blows up the candidate/state count; a tiny injected budget forces the branch
    // deterministically on a small input (same pattern the oracle uses for its budget test).
    const target = 'AC'.repeat(400);
    const s1 = dnaGappedSearchSession('ACACACACAC', target, { thresholdBps: 7000, stateBudget: 2000 });
    const s2 = dnaGappedSearchSession('ACACACACAC', target, { thresholdBps: 7000, stateBudget: 2000 });
    expect(s1.incomplete).toBe(true);
    expect(s1.reason).toBe(RESOURCE_LIMIT);
    expect(s1.occurrences).toEqual([]);          // discard partial hits, not a silent zero
    expect(s2).toEqual(s1);                        // deterministic, not machine-timing dependent
  });

  it('the array API stays back-compatible; incomplete is only visible on the session', () => {
    const arr = dnaGappedSearch('ACACACACAC', 'AC'.repeat(400), { thresholdBps: 7000, stateBudget: 2000 });
    expect(Array.isArray(arr)).toBe(true);
    expect(arr).toEqual([]);
  });

  it('RESOURCE_LIMIT is a stable typed constant', () => {
    expect(typeof RESOURCE_LIMIT).toBe('string');
    expect(RESOURCE_LIMIT).toBe('RESOURCE_LIMIT');
  });

  it('the CANDIDATE SCAN itself is metered: a target too large to scan → incomplete, not a false zero', () => {
    // A query with ZERO real hits in the target, so alignment does no work — only the scan runs.
    // If the scan were not metered it would sweep the whole target and return `[]` as COMPLETE
    // ("no hits"), which is a lie: we could not afford to scan it. Metering the scan turns that
    // into an honest incomplete BEFORE the full sweep.
    const target = 'ACGT'.repeat(50_000); // 200 kb, no G-run
    const s = dnaGappedSearchSession('GGGGGGGGGGGGGGGG', target, { thresholdBps: 8000, stateBudget: 8000 });
    expect(s.incomplete).toBe(true);
    expect(s.reason).toBe(RESOURCE_LIMIT);
    expect(s.occurrences).toEqual([]);
  });
});

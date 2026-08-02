/**
 * U6-B — the ACTIVE-BLOCK CUTOFF is a filter, not a decision.
 *
 * The oracle differential proves the shared recurrence against the BigInt sweep, but it drives it the
 * way the PRODUCTION adapter does: `cutoff = false`, every block active at every position. The linear
 * and shared-scanner paths call the same leaf with `cutoff = true`, and that branch is real code —
 * the grow/shrink cursor decides which words are evaluated at all.
 *
 * Getting it wrong is quiet in both directions. A cursor that grows too eagerly emits EXTRA candidate
 * ends, and the verifier downstream discards them, so occurrences stay identical while the engine
 * silently does more work. A cursor that shrinks too eagerly LOSES candidates — the same defect, the
 * same silence, but now a locus the biologist was looking for is simply not reported. Neither is
 * visible from the end of the pipeline, so the comparison here is against the scanner's own output:
 * the candidate-end list, position for position, cutoff against no-cutoff against the BigInt oracle.
 */
import { describe, it, expect } from 'vitest';
import { encodeQuery, encodeTarget, MyersScanner } from '../dna-linear-scan';
import { BlockMyers } from '../dna-myers-block';
import { oracleEndDistances } from './_myers-bigint-oracle';

const rng32 = (seed) => () => {
  seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
function seq(seed, n, alphabet = 'ACGT') {
  const r = rng32(seed);
  let s = '';
  for (let i = 0; i < n; i += 1) s += alphabet[(r() * alphabet.length) | 0];
  return s;
}

/** Candidate ends the scanner reports, with the cutoff on or off. */
function scannerEnds(query, target, k, cutoff) {
  const q = encodeQuery(query);
  const ext = encodeTarget(target);
  const ends = [];
  new MyersScanner(q, k).scanStream(ext, ext.length, cutoff, (e) => ends.push(e), null);
  return ends;
}

/**
 * The same answer derived from the BigInt sweep: an end at `j+1` qualifies when the whole pattern
 * aligns within `k` edits against the best substring ending there. Codes are compared, so a foreign
 * target symbol (255) matches nothing — exactly as the scanner treats it.
 */
function oracleEnds(query, target, k) {
  const q = Array.from(encodeQuery(query));
  const t = Array.from(encodeTarget(target));
  const dist = oracleEndDistances(q, t);
  const ends = [];
  for (let j = 0; j < dist.length; j += 1) if (dist[j] <= k) ends.push(j + 1);
  return ends;
}

/** Word boundaries either side of 32/64/96, plus the live product boundary. */
const LENGTHS = [31, 32, 33, 63, 64, 65, 95, 96, 97, 100];

describe('U6-B · cutoff=true reports exactly the ends cutoff=false does', () => {
  for (const m of LENGTHS) {
    it(`m=${m}: cutoff, no-cutoff and the BigInt oracle agree end for end`, () => {
      const pattern = seq(8000 + m, m);
      // Two planted copies — one verbatim, one perturbed — so the cursor has to grow into the last
      // block and shrink away from it more than once during the sweep.
      const perturbed = `${pattern.slice(0, 5)}T${pattern.slice(6)}`;
      const target = `${seq(8100 + m, 400)}${pattern}${seq(8200 + m, 250)}${perturbed}${seq(8300 + m, 400)}`;
      const k = Math.max(1, Math.floor(m * 0.2));

      const withCutoff = scannerEnds(pattern, target, k, true);
      const withoutCutoff = scannerEnds(pattern, target, k, false);
      const oracle = oracleEnds(pattern, target, k);

      // Self-check: the fixture must actually produce candidates, or all three agreeing is vacuous.
      expect(oracle.length, 'fixture produces candidate ends').toBeGreaterThan(0);
      expect(withCutoff, 'cutoff vs no-cutoff').toEqual(withoutCutoff);
      expect(withCutoff, 'cutoff vs BigInt oracle').toEqual(oracle);
    });
  }

  it('k = 0 — the exact band, where the cursor starts at its smallest', () => {
    const pattern = seq(8400, 64);
    const target = `${seq(8401, 300)}${pattern}${seq(8402, 300)}`;
    expect(scannerEnds(pattern, target, 0, true)).toEqual(scannerEnds(pattern, target, 0, false));
    expect(scannerEnds(pattern, target, 0, true)).toEqual(oracleEnds(pattern, target, 0));
  });

  it('k large enough to keep every block active — the cutoff must then do nothing at all', () => {
    const pattern = seq(8500, 96);
    const target = `${seq(8501, 400)}${pattern}${seq(8502, 400)}`;
    const k = 90;
    expect(scannerEnds(pattern, target, k, true)).toEqual(scannerEnds(pattern, target, k, false));
  });

  it('a low-complexity target — where nearly every position qualifies and the cursor never rests', () => {
    const pattern = 'ACGTACGTACGTACGTACGTACGTACGTACGTACGT'; // 36 nt, spans two words
    const target = `${'ACGT'.repeat(300)}${seq(8600, 200)}${'AT'.repeat(400)}`;
    const k = 7;
    expect(scannerEnds(pattern, target, k, true)).toEqual(scannerEnds(pattern, target, k, false));
    expect(scannerEnds(pattern, target, k, true)).toEqual(oracleEnds(pattern, target, k));
  });

  it('symbols outside ACGT in the target neither match nor derail the cursor', () => {
    const pattern = seq(8700, 40);
    const target = `${seq(8701, 200)}NNNNNNNNNN${pattern}RYKM${seq(8702, 200)}`;
    const k = 8;
    expect(scannerEnds(pattern, target, k, true)).toEqual(scannerEnds(pattern, target, k, false));
    expect(scannerEnds(pattern, target, k, true)).toEqual(oracleEnds(pattern, target, k));
  });
});

describe('U6-B · cutoff — seeded differential fuzz', () => {
  it('250 random (query, target, k) cases: cutoff never adds or loses a candidate end', () => {
    let withCandidates = 0;
    for (let i = 0; i < 250; i += 1) {
      const r = rng32(770000 + i);
      const m = 1 + ((r() * 110) | 0);
      const n = m + ((r() * 500) | 0);
      const q = seq(780000 + i, m);
      // Every third case carries foreign glyphs in the target; every fifth plants the query, so the
      // sample is not dominated by targets where nothing ever qualifies.
      const alphabet = (i % 3 === 0) ? 'ACGTNRY' : 'ACGT';
      let t = seq(790000 + i, n, alphabet);
      if (i % 5 === 0 && n > m + 10) t = t.slice(0, 5) + q + t.slice(5 + m);
      const k = (r() * (m + 1)) | 0;

      const cut = scannerEnds(q, t, k, true);
      const full = scannerEnds(q, t, k, false);
      expect(cut, `case ${i} m=${m} n=${n} k=${k}`).toEqual(full);
      expect(cut, `case ${i} vs oracle`).toEqual(oracleEnds(q, t, k));
      if (cut.length) withCandidates += 1;
    }
    // The fuzz is only worth running if a healthy share of cases actually produced candidates.
    expect(withCandidates, 'cases that produced at least one candidate end').toBeGreaterThan(60);
  });
});

describe('U6-B · the cutoff must actually CUT', () => {
  /**
   * The grow direction cannot be caught by comparing candidate ends, and that is a property of the
   * design rather than a gap in the tests: an end is emitted only when the LAST block is active and
   * within budget, so admitting a block earlier than the bound requires changes no answer — it only
   * spends words. Measured: widening the grow condition by 64 leaves all 15 end-comparisons green.
   *
   * So the grow side is pinned where it is actually observable — in the WORK. Every evaluated word
   * goes through `BlockMyers.step`, so counting those calls measures exactly what the cutoff exists
   * to avoid, and an over-eager cursor shows up as a cost rather than as a wrong answer.
   */
  function stepsUsed(query, target, k, cutoff) {
    const q = encodeQuery(query);
    const ext = encodeTarget(target);
    const original = BlockMyers.prototype.step;
    let calls = 0;
    BlockMyers.prototype.step = function counted(...args) { calls += 1; return original.apply(this, args); };
    try {
      new MyersScanner(q, k).scanStream(ext, ext.length, cutoff, () => {}, null);
    } finally {
      BlockMyers.prototype.step = original;
    }
    return calls;
  }

  it('a long pattern with a small budget evaluates far fewer words with the cutoff on', () => {
    // 100 nt over four words, k = 5: on a random target the last words can almost never be within
    // budget, so a correct cursor should stay near the bottom for most of the sweep.
    const pattern = seq(8800, 100);
    const target = seq(8801, 20000);
    const on = stepsUsed(pattern, target, 5, true);
    const off = stepsUsed(pattern, target, 5, false);
    expect(off, 'no-cutoff evaluates every word at every position').toBe(target.length * 4);
    // Half is a deliberately loose bound: it fails an over-eager cursor without pinning the exact
    // schedule, which is an implementation detail that may legitimately improve.
    expect(on, `cutoff evaluated ${on} words vs ${off} without`).toBeLessThan(off / 2);
  });

  it('…and it still reports the same ends while doing that less work', () => {
    const pattern = seq(8800, 100);
    const target = seq(8801, 20000);
    expect(scannerEnds(pattern, target, 5, true)).toEqual(scannerEnds(pattern, target, 5, false));
  });
});

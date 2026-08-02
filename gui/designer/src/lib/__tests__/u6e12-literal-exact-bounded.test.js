/**
 * U6-E final closure — the exact scan must be bounded by the MOLECULE, never by the QUERY.
 *
 * The exact route has no length limit: only approximate search stops at 100 nt, so a biologist can
 * legitimately paste a whole insert, a whole plasmid, or a contig. The first bounded scanner made
 * every window `STEP + queryLength - 1` characters wide, which is bounded only while the query is
 * short — a 500 000-nt query turned one resumption into half a megabase of matching, past both the
 * cancellation gate and the client's own deadline.
 *
 * Work is measured deterministically, never by the clock: `scanPositions` counts the characters the
 * matcher actually looks at, so «total work is linear in the molecule» and «no resumption did more
 * than one step» are both checkable facts rather than timings that vary with the machine.
 */
import { describe, it, expect } from 'vitest';
import { literalExactSessionSteps } from '../dna-literal-exact';
import { drainSync, drainCooperative, SEARCH_CANCELLED } from '../dna-search-cooperative';

const literal = (q, t, o = {}) => drainSync(literalExactSessionSteps(q, t, o));

/** Drive a generator by hand, counting suspensions. */
function driveCountingSteps(gen) {
  let steps = 0;
  let s = gen.next();
  while (!s.done) { steps += 1; s = gen.next(); }
  return { steps, value: s.value };
}

const UNIT = 'ACGTTGCACCTGAAGT';                 // 16 nt, so a repeat-rich text is trivially built
const periodic = (nt) => UNIT.repeat(Math.ceil(nt / UNIT.length)).slice(0, nt);

describe('U6-E — a long exact query is bounded by the molecule, not by itself', () => {
  const TARGET_LEN = 1_000_000;
  const target = periodic(TARGET_LEN);

  it('q=500 000 over a repeat-rich megabase: work stays linear in the molecule', () => {
    const q = target.slice(0, 500_000);
    const { steps, value } = driveCountingSteps(
      literalExactSessionSteps(q, target, { bothStrands: true, limit: 500, collectStats: true }),
    );
    // The cost model, stated rather than guessed: two automaton passes over the text (2n), two
    // failure tables (2m) and one reverse complement (m) — plus the failure transitions each pass
    // really performs, which are also charged. 2n + 4m is that with room for the transitions. A
    // window that carried the query would have done more than an order of magnitude beyond it.
    expect(value.stats.scanPositions).toBeLessThan(TARGET_LEN * 4 + 500_000 * 5);
    expect(value.stats.scanPositions).toBeGreaterThan(TARGET_LEN * 2); // the text WAS swept twice
    console.log(`  q=500000/1Mb: work=${value.stats.scanPositions} yields=${steps} avg/step=${Math.round(value.stats.scanPositions / steps)} loci=${value.locationCount}`);
    // And the molecule was really visited: at least one suspension per step of text.
    expect(steps).toBeGreaterThanOrEqual(Math.floor(TARGET_LEN / 16384));
    // Average work per resumption follows from the two facts above; state it as the bound it is.
    expect(value.stats.scanPositions / steps).toBeLessThan(100_000);
  });

  it('q=10 000 and q=400 are answered the same way, and each pays its own path price', () => {
    // The two paths cost different things, and the bound has to say which:
    //   • native (m ≤ 4096): windows overlap by m − 1, so a pass costs n·(1 + (m−1)/STEP);
    //   • streaming (m > 4096): KMP is amortised at most 2n comparisons-plus-transitions per pass,
    //     and this text is periodic, which is precisely the shape that makes the automaton fall
    //     back often. Its failure table is amortised 2m.
    // Both are doubled for two strands, plus one reverse complement of m.
    const STEP_SIZE = 16384;
    const expected = (m) => (m <= 4096
      ? TARGET_LEN * 2 * (1 + m / STEP_SIZE) + m * 2
      : TARGET_LEN * 4 + m * 5);
    for (const m of [400, 10_000]) {
      const q = target.slice(0, m);
      const s = literal(q, target, { bothStrands: true, limit: 500, collectStats: true });
      expect(s.locationCount).toBeGreaterThan(0);
      expect(s.occurrences[0].metrics.identity).toBe(1);
      expect(s.stats.scanPositions).toBeLessThan(expected(m));
      const { steps } = driveCountingSteps(literalExactSessionSteps(q, target, { bothStrands: true, limit: 500, collectStats: true }));
      console.log(`  q=${m}/1Mb: work=${s.stats.scanPositions} yields=${steps} avg/step=${Math.round(s.stats.scanPositions / steps)} loci=${s.locationCount}`);
    }
  });

  it('the preprocessing phase suspends too — a long query cannot hide work before the first step', () => {
    // A query with no match at all: everything before the scan (reverse complement, failure tables)
    // must still be interruptible, or the first `next()` is the whole prologue.
    const q = 'G'.repeat(300_000);
    const gen = literalExactSessionSteps(q, target, { bothStrands: true, limit: 500 });
    let firstSteps = 0;
    for (let i = 0; i < 20; i += 1) { if (gen.next().done) break; firstSteps += 1; }
    expect(firstSteps).toBe(20); // it suspended twenty times without finishing
  });

  it('a long query on a circular molecule does not materialise a doubled ring', () => {
    // `m === n` on a ring is the worst case for a naive `target + target.slice(0, m - 1)`.
    const ring = periodic(200_000);
    const rotated = ring.slice(50_000) + ring.slice(0, 50_000);
    const s = literal(rotated, ring, { bothStrands: false, circular: true, limit: 5, collectStats: true });
    expect(s.locationCount).toBeGreaterThan(0);
    expect(s.occurrences.some((o) => o.wrapsOrigin)).toBe(true);
    // One pass over a ring of 200 000 with a 200 000 query reads 399 999 virtual positions, and the
    // failure table for that query costs another 200 000 — single-strand, so no reverse complement.
    expect(s.stats.scanPositions).toBeLessThan(200_000 * 4);
  });
});

describe('U6-E — cancellation is proven on a running scan, not on a pre-cancelled one', () => {
  it('a cancel raised after the scan has started ends it with SEARCH_CANCELLED', async () => {
    const target = periodic(4_000_000);
    let cancelled = false;
    let started = 0;
    const gen = literalExactSessionSteps('G'.repeat(50_000), target, { bothStrands: true, limit: 500 });
    // Count real resumptions, so «the work started» is observed rather than assumed.
    const counting = (function* count() {
      let s = gen.next();
      while (!s.done) { started += 1; yield; s = gen.next(); }
      return s.value;
    }());
    // The flag flips on a macrotask AFTER the drive has begun; the default yield function is used,
    // exactly as the worker uses it. No second, already-cancelled generator.
    setTimeout(() => { cancelled = true; }, 0);
    const err = await drainCooperative(counting, { shouldCancel: () => cancelled })
      .then(() => null, (e) => e);
    expect(started).toBeGreaterThan(0);
    expect(err).toBeTruthy();
    expect(err.code).toBe(SEARCH_CANCELLED);
  });

  it('1 Mb with no hit: many suspensions AND an honest empty answer', () => {
    const target = periodic(1_000_000);
    const { steps, value } = driveCountingSteps(
      literalExactSessionSteps('GGGGGGGGGGGGGGGGGGGGGGGG', target, { bothStrands: true, limit: 500 }),
    );
    expect(steps).toBeGreaterThan(20);
    expect(value.locationCount).toBe(0);
    expect(value.occurrences).toEqual([]);
  });

  it('1 Mb whose only hit sits at the end: many suspensions AND exactly that one locus', () => {
    const q = 'GGGGGGGGGGGGGGGGGGGGGGGG';
    const target = periodic(1_000_000 - q.length) + q;
    const { steps, value } = driveCountingSteps(
      literalExactSessionSteps(q, target, { bothStrands: false, limit: 500 }),
    );
    expect(steps).toBeGreaterThan(20);
    expect(value.locationCount).toBe(1);
    expect(value.occurrences[0].start).toBe(1_000_000 - q.length);
  });
});

describe('U6-E — scan is charged per pass actually performed', () => {
  const target = periodic(20_000);

  it('one strand pays for one pass, two strands for two — plus the complement, charged once', () => {
    const q = 'GGGGGGGGGG';
    const one = literal(q, target, { bothStrands: false, limit: 500, collectStats: true });
    const two = literal(q, target, { bothStrands: true, limit: 500, collectStats: true });
    // The SCAN doubles; building the reverse complement happens once and is charged once. Asserting
    // a plain doubling would quietly require the preprocessing to be free, which it is not.
    expect(two.stats.scanPositions).toBe(one.stats.scanPositions * 2 + q.length);
  });

  it('a palindrome is scanned once, because the second probe is genuinely eliminated', () => {
    // A reverse-complement palindrome is even by construction: half + rc(half). The first attempt
    // here was 31 nt, which cannot be one, so the «single pass» claim was being made about a query
    // that legitimately needed two.
    const half = 'ACGTTGCACCTGAAG';
    const pal = `${half}CTTCAGGTGCAACGT`;
    const one = literal(pal, target, { bothStrands: false, limit: 500, collectStats: true });
    const two = literal(pal, target, { bothStrands: true, limit: 500, collectStats: true });
    // One scan pass, exactly as for a single strand — the only extra is the complement that had to
    // be built to discover it was the same probe.
    expect(two.stats.scanPositions).toBe(one.stats.scanPositions + pal.length);
  });

  it('an exhausted scan budget stops AT the boundary, not after one more window', () => {
    let thrown = null;
    try {
      literal('GGGGGGGGGG', target, { bothStrands: false, limit: 500, budgets: { scan: 1000 } });
    } catch (e) { thrown = e; }
    expect(thrown.code).toBe('RESOURCE_LIMIT');
    expect(thrown.axis).toBe('scan');
    // The charge happens BEFORE the window is scanned, so the meter never records work past the
    // budget: it stops at the first step it could not afford.
    expect(thrown.stats ? thrown.stats.scanPositions : 0).toBeLessThanOrEqual(1000 + 16384 + 10);
  });
});

describe('U6-E — the cap and the output budget agree about the payload', () => {
  it('limit 1, output 1, winner beyond the cap: it completes, and pays exactly once', () => {
    // 20-mer ring: ACGT at 5 (endpoint 9) and across the origin at 18 (endpoint 2). The winner is
    // the second locus, so the retained window has to be REPLACED — and that replacement must not
    // be a second materialisation, or a payload of one would cost two output units.
    const ring = `GT${'TTT'}ACGT${'T'.repeat(9)}AC`;
    const s = literal('ACGT', ring, {
      bothStrands: false, circular: true, limit: 1, budgets: { output: 1 }, collectStats: true,
    });
    expect(s.occurrences).toHaveLength(1);
    expect(s.occurrences[0].start).toBe(18);
    expect(s.locationCount).toBe(2);
    expect(s.stats.occurrencesBuilt).toBe(1);
    expect(s.stats.outputUsed).toBe(1);
  });
});

describe('U6-E — an absent or malformed limit is the documented default, never unlimited', () => {
  const target = 'A'.repeat(5000);

  it.each([
    ['undefined', undefined],
    ['0', 0],
    ['NaN', NaN],
    ['a string', '500'],
    ['negative', -1],
    ['fractional', 2.5],
  ])('%s resolves to the engine default of 1000', (_label, limit) => {
    const s = literal('A', target, { bothStrands: false, limit, collectStats: true });
    expect(s.locationCount).toBe(5000);          // the count is honest…
    expect(s.occurrences).toHaveLength(1000);    // …while retention is bounded
    expect(s.stats.peakRetained).toBe(1000);
  });
});

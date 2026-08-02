/**
 * U6-E1 — exact-first is a CORPUS rule, not a per-molecule one.
 *
 * `search-worker-core.js` documents the contract as «exact over every document, and only if the
 * whole library has no exact hit does the approximate phase run». What it actually does is call
 * `seqMatchSteps` per document, and that function runs exact-then-approximate inside ONE molecule.
 * The difference is invisible on a small library and decisive on a real one:
 *
 *     document A: exact miss → approximate runs immediately → RESOURCE_LIMIT → whole sweep dies
 *     document B: exact hit  → never reached
 *
 * A single awkward molecule can therefore bury an exact hit that sits later in the library. That is
 * the mechanism behind BG-025, measured on the real base: one repeat-rich plasmid out of 2822 makes
 * the entire approximate search return nothing.
 *
 * These tests OBSERVE the approximate phase rather than inferring it from the answer. Getting the
 * right molecules back while still having run approximate work is not a pass — the whole point is
 * that the approximate phase must not start at all while an exact hit exists anywhere.
 */
import {
  describe, it, expect, vi, beforeEach,
} from 'vitest';

/** Every approximate pass the engine performs, and the target it ran on. */
const approxCalls = [];
/** Every exact pass, for the symmetric check that the exact phase DOES sweep the whole corpus. */
const exactCalls = [];
/** Sequences whose APPROXIMATE pass is declared unaffordable, deterministically. */
const poisoned = new Set();

const EXACT_BPS = 10000;

// The spy wraps the real engine instead of replacing it: the biology under test stays real, and the
// only thing added is a count and a deterministic way to make one molecule's approximate pass fail.
// Injecting the failure beats building a genuinely pathological sequence — that would make the test
// depend on budget constants, and it is the ROUTING under test here, not the budget.
vi.mock('../dna-gapped-session-steps', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    dnaGappedSessionSteps: function* spy(query, target, opts = {}) {
      const bps = opts.thresholdBps;
      if (bps != null && bps < EXACT_BPS) {
        approxCalls.push({ target, thresholdBps: bps });
        if (poisoned.has(target)) {
          const err = new Error('SEQUENCE_SEARCH_INCOMPLETE');
          err.code = 'RESOURCE_LIMIT';
          throw err;
        }
      }
      return yield* actual.dnaGappedSessionSteps(query, target, opts);
    },
  };
});

// The exact phase no longer goes through the gapped engine at all — it is a literal scan — so the
// counter for «did the exact phase visit this molecule» has to watch THAT module. Counting engine
// calls with a 10 000 bps threshold would now silently count nothing and pass by accident.
vi.mock('../dna-literal-exact', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    literalExactSessionSteps: function* spy(query, target, opts = {}) {
      exactCalls.push({ target, opts });
      return yield* actual.literalExactSessionSteps(query, target, opts);
    },
  };
});

// The approximate phase runs through whichever kernel the seam selects, and that default moved to
// LINEAR — so a counter watching only the gapped engine would read zero and pass by accident. This
// is the third time in this package that an instrument had to follow a moved call site; the lesson
// is that a spy has to be attached to the CONTRACT, not to yesterday's implementation.
vi.mock('../dna-linear-provider', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    * runLinearSequenceSearchSteps(query, seq, opts) {
      approxCalls.push({ target: seq, thresholdBps: opts.thresholdBps });
      if (poisoned.has(seq)) {
        const err = new Error('SEQUENCE_SEARCH_INCOMPLETE');
        err.code = 'RESOURCE_LIMIT';
        throw err;
      }
      return yield* actual.runLinearSequenceSearchSteps(query, seq, opts);
    },
  };
});

const { searchAllSequences } = await import('../search-worker-core');

const doc = (id, seq, topology = 'linear') => ({ id, seq, topology });
const rc = (s) => s.split('').reverse().map((c) => ({
  A: 'T', C: 'G', G: 'C', T: 'A',
}[c] || c)).join('');

/** 60 nt of fixed, non-repetitive filler — long enough that an approximate pass is a real choice. */
const FILLER = 'GATTACAGGCATCTAGCCTAGGCATTCGAGGATCCTAGCTAGGCTTAACGGTACCTAGCA';
const PROBE = 'ACGTTGCACCTGAAGTCCATGGATCCGTAA';           // 30 nt, ACGT only
/** One substitution away from PROBE: an approximate hit at 80 %, never an exact one. */
const NEAR = `${PROBE.slice(0, 10)}A${PROBE.slice(11)}`;

beforeEach(() => {
  approxCalls.length = 0;
  exactCalls.length = 0;
  poisoned.clear();
});

describe('U6-E1 — corpus-level exact-first', () => {
  it('a late exact hit beats an early document whose approximate pass is unaffordable', () => {
    const early = `${FILLER}${NEAR}${FILLER}`;
    const late = `${FILLER}${PROBE}${FILLER}`;
    poisoned.add(early);

    const byId = searchAllSequences(PROBE, [doc('early', early), doc('late', late)],
      { bothStrands: false, identityThreshold: 0.8 });

    // The exact phase must have visited BOTH molecules...
    expect(exactCalls.length).toBe(2);
    // ...and the approximate phase must not have started at all, because an exact hit exists.
    expect(approxCalls).toEqual([]);
    expect(Object.keys(byId)).toEqual(['late']);
    expect(byId.late.occurrences[0].metrics.identity).toBe(1);
  });

  it('the same, with the documents in the opposite order', () => {
    const early = `${FILLER}${NEAR}${FILLER}`;
    const late = `${FILLER}${PROBE}${FILLER}`;
    poisoned.add(early);

    const byId = searchAllSequences(PROBE, [doc('late', late), doc('early', early)],
      { bothStrands: false, identityThreshold: 0.8 });

    expect(approxCalls).toEqual([]);
    expect(Object.keys(byId)).toEqual(['late']);
  });

  it('an approximate hit in an early document is NOT returned when an exact hit exists anywhere', () => {
    const approxOnly = `${FILLER}${NEAR}${FILLER}`;
    const exactHit = `${FILLER}${PROBE}${FILLER}`;

    const byId = searchAllSequences(PROBE, [doc('approx', approxOnly), doc('exact', exactHit)],
      { bothStrands: false, identityThreshold: 0.8 });

    expect(approxCalls).toEqual([]);
    expect(Object.keys(byId)).toEqual(['exact']);
    // Not merely «the exact one is present»: the approximate one must be ABSENT. A result set that
    // mixes an 80 % neighbour into an exact answer is a different claim about the library.
    expect(byId.approx).toBeUndefined();
  });

  it('exact hits in several documents are all returned', () => {
    const a = `${FILLER}${PROBE}`;
    const b = `${PROBE}${FILLER}`;
    const c = `${FILLER}${NEAR}`;

    const byId = searchAllSequences(PROBE, [doc('a', a), doc('b', b), doc('c', c)],
      { bothStrands: false, identityThreshold: 0.8 });

    expect(Object.keys(byId).sort()).toEqual(['a', 'b']);
    expect(approxCalls).toEqual([]);
    expect(byId.a.occurrences[0].location.segments[0]).toEqual({ start: FILLER.length, end: FILLER.length + PROBE.length });
    expect(byId.b.occurrences[0].location.segments[0]).toEqual({ start: 0, end: PROBE.length });
  });

  it('approximate runs ONLY when the whole corpus holds no exact hit', () => {
    const a = `${FILLER}${NEAR}${FILLER}`;
    const b = `${FILLER}${NEAR}`;

    const byId = searchAllSequences(PROBE, [doc('a', a), doc('b', b)],
      { bothStrands: false, identityThreshold: 0.8 });

    expect(exactCalls.length).toBe(2);          // exact swept the whole corpus first
    expect(approxCalls.length).toBe(2);         // and only then did approximate run, also on all
    expect(Object.keys(byId).sort()).toEqual(['a', 'b']);
    expect(byId.a.occurrences[0].metrics.identity).toBeLessThan(1);
  });

  it('at a 100% threshold the approximate phase never runs', () => {
    const byId = searchAllSequences(PROBE, [doc('a', `${FILLER}${NEAR}`)],
      { bothStrands: false, identityThreshold: 1 });

    expect(approxCalls).toEqual([]);
    expect(byId).toEqual({});
  });
});

describe('U6-E1 — biology pinned on the corpus route', () => {
  it('plus, minus, and a palindrome reported as both', () => {
    const plusOnly = `${FILLER}${PROBE}${FILLER}`;
    const minusOnly = `${FILLER}${rc(PROBE)}${FILLER}`;
    // A true palindrome: one physical site that reads the same on both strands.
    const half = 'ACGTTGCACCTGAAG';
    const pal = half + rc(half);
    const palDoc = `${FILLER}${pal}${FILLER}`;

    const byId = searchAllSequences(PROBE, [doc('p', plusOnly), doc('m', minusOnly)],
      { bothStrands: true, identityThreshold: 1 });
    expect(byId.p.occurrences[0].location.strand).toBe('+');
    expect(byId.m.occurrences[0].location.strand).toBe('-');

    const palById = searchAllSequences(pal, [doc('pal', palDoc)], { bothStrands: true, identityThreshold: 1 });
    expect(palById.pal.occurrences[0].location.strand).toBe('both');
    expect(palById.pal.locationCount).toBe(1);
  });

  it('circular molecule: a hit that crosses the origin', () => {
    const tail = PROBE.slice(0, 12);
    const head = PROBE.slice(12);
    const seq = `${head}${FILLER}${tail}`;                 // PROBE straddles the origin
    const byId = searchAllSequences(PROBE, [doc('c', seq, 'circular')],
      { bothStrands: false, identityThreshold: 1 });

    const occ = byId.c.occurrences[0];
    expect(occ.location.wrapsOrigin).toBe(true);
    expect(occ.location.segments).toHaveLength(2);
    expect(occ.location.segments[0].end).toBe(seq.length);
    expect(occ.location.segments[1].start).toBe(0);
    expect(occ.metrics.identity).toBe(1);
  });

  it('degenerate target: N matches nothing, but 80% survives it', () => {
    // Two unknown bases inside the window: an exact hit is impossible, an 80 % hit is not.
    const withN = `${FILLER}${PROBE.slice(0, 5)}NN${PROBE.slice(7)}${FILLER}`;
    const exactById = searchAllSequences(PROBE, [doc('n', withN)], { bothStrands: false, identityThreshold: 1 });
    expect(exactById).toEqual({});

    const approxById = searchAllSequences(PROBE, [doc('n', withN)], { bothStrands: false, identityThreshold: 0.8 });
    expect(approxById.n.occurrences[0].metrics.identity).toBeLessThan(1);
    expect(approxById.n.occurrences[0].metrics.substitutions).toBeGreaterThanOrEqual(2);
  });

  it('the whole envelope: occurrences, locationCount, bestIndex', () => {
    // Two exact copies in one molecule — the envelope has to describe both and name a winner.
    const seq = `${PROBE}${FILLER}${PROBE}`;
    const byId = searchAllSequences(PROBE, [doc('two', seq)], { bothStrands: false, identityThreshold: 1 });

    const env = byId.two;
    expect(Object.keys(env).sort()).toEqual(['bestIndex', 'locationCount', 'occurrences']);
    expect(env.occurrences).toHaveLength(2);
    expect(env.locationCount).toBe(2);
    expect(env.bestIndex).toBeGreaterThanOrEqual(0);
    expect(env.occurrences[env.bestIndex]).toBeDefined();
    expect(env.occurrences.map((o) => o.location.segments[0].start))
      .toEqual([0, PROBE.length + FILLER.length]);
    for (const o of env.occurrences) {
      expect(o.metrics.identity).toBe(1);
      expect(o.metrics.substitutions).toBe(0);
      expect(o.metrics.insertions).toBe(0);
      expect(o.metrics.deletions).toBe(0);
      expect(o.metrics.alignmentLength).toBe(PROBE.length);
    }
  });
});

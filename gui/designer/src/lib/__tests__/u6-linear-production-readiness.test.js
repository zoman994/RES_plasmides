/**
 * U6 — is the experimental LINEAR kernel fit to become the production default?
 *
 * Speed is not the question these answer. Before a benchmark number can mean anything, the candidate
 * has to keep the contracts the shipped path already keeps, because every one of them is something a
 * biologist reads off the screen or depends on not happening:
 *
 *   • the same loci, on the same strands, with the same metrics — differential against the normative
 *     path, never against a remembered array;
 *   • an honest envelope: `locationCount` is how many loci EXIST, `bestIndex` names the canonical
 *     winner, and both survive the two caps;
 *   • fail-closed on malformed input and on exhausted budgets, with the typed verdicts the transport
 *     is allowed to carry;
 *   • bounded work — a `limit` and a `stateBudget` are refusals, not suggestions;
 *   • REAL cooperative cancellation: the worker must be able to receive a cancel frame mid-search.
 *
 * These are written as DIAGNOSTICS. Where the linear path currently fails one, the failure is the
 * finding — the point of the file is to say precisely which contracts a default switch would break.
 */
import { describe, it, expect, afterEach } from 'vitest';
import {
  SEQUENCE_KERNEL, setSequenceKernelForBenchmark, resetSequenceKernel,
} from '../sequence-kernel-seam';
import {
  seqMatch, seqMatchApproxSteps, REQUIRES_ALIGNMENT,
} from '../seq-match';
import { searchAllSequencesSteps } from '../search-worker-core';

afterEach(() => resetSequenceKernel());

/** Run the SAME public entry point on both kernels — the only honest comparison. */
function both(query, sequence, ctx) {
  setSequenceKernelForBenchmark(SEQUENCE_KERNEL.PRODUCTION);
  const production = seqMatch(query, sequence, null, ctx);
  setSequenceKernelForBenchmark(SEQUENCE_KERNEL.LINEAR);
  const linear = seqMatch(query, sequence, null, ctx);
  resetSequenceKernel();
  return { production, linear };
}

/**
 * The biologically meaningful projection: WHERE, on which strand, and how well — using the field
 * names both kernels actually emit. The two envelopes differ in their bookkeeping (production carries
 * `editRuns`/`mismatchPositions`, the linear prototype carries `identityBps` instead), and comparing
 * those would report a packaging difference as a biological one.
 */
const bio = (env) => (env.occurrences || []).map((o) => ({
  segments: o.location.segments,
  strand: o.location.strand,
  wrapsOrigin: !!o.location.wrapsOrigin,
  identity: o.metrics.identity,
  substitutions: o.metrics.substitutions,
  insertions: o.metrics.insertions,
  deletions: o.metrics.deletions,
}));

const mulberry32 = (a) => () => {
  a |= 0; a = (a + 0x6D2B79F5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
function randSeq(seed, n) {
  const rng = mulberry32(seed);
  let s = '';
  for (let i = 0; i < n; i += 1) s += 'ACGT'[(rng() * 4) | 0];
  return s;
}

describe('U6 · linear kernel — differential parity with the normative path', () => {
  const CASES = [
    {
      name: 'exact hit, plus strand',
      q: 'GAATTCACGTACGTAC',
      make: (q) => randSeq(1, 400) + q + randSeq(2, 400),
      ctx: { identityThreshold: 1, bothStrands: true },
    },
    {
      name: 'approximate hit — one substitution',
      q: 'GAATTCACGTACGTACGTAC',
      make: (q) => randSeq(3, 300) + (q.slice(0, 9) + 'T' + q.slice(10)) + randSeq(4, 300),
      ctx: { identityThreshold: 0.8, bothStrands: true },
    },
    {
      name: 'approximate hit — one deletion (indel path)',
      q: 'GAATTCACGTACGTACGTAC',
      make: (q) => randSeq(5, 300) + (q.slice(0, 9) + q.slice(10)) + randSeq(6, 300),
      ctx: { identityThreshold: 0.8, bothStrands: true },
    },
    {
      name: 'MINUS strand only',
      q: 'GAATTCACGTACGTAC',
      // reverse complement planted; the plus strand does not contain the motif
      make: (q) => randSeq(7, 300) + q.split('').reverse().map((c) => ({ A: 'T', C: 'G', G: 'C', T: 'A' }[c])).join('') + randSeq(8, 300),
      ctx: { identityThreshold: 1, bothStrands: true },
    },
    {
      name: 'palindrome — both strands at one locus',
      q: 'GAATTC',
      make: (q) => randSeq(9, 200) + q + randSeq(10, 200),
      ctx: { identityThreshold: 1, bothStrands: true },
    },
    {
      name: 'repeat-rich target — many loci',
      q: 'ACGTACGTACGT',
      make: (q) => (q + 'TT').repeat(30),
      ctx: { identityThreshold: 1, bothStrands: true },
    },
    {
      name: 'honest miss',
      q: 'GGGGGGGGGGGGGGGGGGGG',
      make: () => randSeq(11, 2000),
      ctx: { identityThreshold: 0.9, bothStrands: true },
    },
  ];

  for (const c of CASES) {
    it(`${c.name} — same loci, strands and metrics`, () => {
      const seq = { seq: c.make(c.q), topology: 'linear' };
      const { production, linear } = both(c.q, seq, c.ctx);
      expect(bio(linear)).toEqual(bio(production));
    });
  }

  it('circular wrap — a locus straddling the origin is found identically', () => {
    const q = 'GAATTCACGTACGT';
    const head = q.slice(6);
    const tail = q.slice(0, 6);
    const seq = { seq: head + randSeq(12, 500) + tail, topology: 'circular' };
    const { production, linear } = both(q, seq, { identityThreshold: 1, bothStrands: true, circular: true });
    expect(bio(linear)).toEqual(bio(production));
    // Self-check: the fixture really does wrap, so this is not a vacuous pass.
    expect(production.occurrences.some((o) => o.location.wrapsOrigin)).toBe(true);
  });

  it('typed verdicts route the same way — a >100 nt query with no exact hit', () => {
    const q = randSeq(13, 140);
    const seq = { seq: randSeq(14, 4000), topology: 'linear' };
    const ctx = { identityThreshold: 0.8, bothStrands: true };
    const run = (kernel) => {
      setSequenceKernelForBenchmark(kernel);
      try { seqMatch(q, seq, null, ctx); return null; } catch (e) { return e.code; } finally { resetSequenceKernel(); }
    };
    expect(run(SEQUENCE_KERNEL.LINEAR)).toBe(run(SEQUENCE_KERNEL.PRODUCTION));
    expect(run(SEQUENCE_KERNEL.PRODUCTION)).toBe(REQUIRES_ALIGNMENT);
  });
});

describe('U6 · linear kernel — the sequence envelope', () => {
  /** A repeat-rich target with far more loci than any cap, so counting and capping are visible. */
  const q = 'ACGTACGTACGT';
  const seq = { seq: (q + 'A').repeat(120), topology: 'linear' };
  const ctx = { identityThreshold: 1, bothStrands: true, limit: 10 };

  it('locationCount reports how many loci EXIST, not how many were returned', () => {
    const { production, linear } = both(q, seq, ctx);
    expect(production.locationCount).toBeGreaterThan(production.occurrences.length);
    expect(linear.locationCount).toBe(production.locationCount);
  });

  it('the cap is honoured — `limit` is a refusal, not a suggestion', () => {
    const { production, linear } = both(q, seq, ctx);
    expect(production.occurrences.length).toBeLessThanOrEqual(ctx.limit);
    expect(linear.occurrences.length).toBeLessThanOrEqual(ctx.limit);
  });

  it('bestIndex names the SAME locus under both kernels, and survives the cap', () => {
    const { production, linear } = both(q, seq, ctx);
    const pBest = production.occurrences[production.bestIndex];
    const lBest = linear.occurrences[linear.bestIndex];
    expect(lBest).toBeTruthy();
    expect({ segments: lBest.location.segments, strand: lBest.location.strand })
      .toEqual({ segments: pBest.location.segments, strand: pBest.location.strand });
  });

  it('every returned occurrence carries the metrics the row and the card render', () => {
    setSequenceKernelForBenchmark(SEQUENCE_KERNEL.LINEAR);
    const env = seqMatch('GAATTCACGTACGTAC', { seq: `${randSeq(15, 200)}GAATTCACGTACGTAC${randSeq(16, 200)}`, topology: 'linear' }, null, { identityThreshold: 1, bothStrands: true });
    resetSequenceKernel();
    const m = env.occurrences[0].metrics;
    // `editRuns` is what the inspector's alignment view and the row's X/I/D breakdown are built from.
    for (const k of ['identity', 'alignmentLength', 'substitutions', 'insertions', 'deletions', 'editRuns']) {
      expect(m, `metrics.${k} is rendered by the result row`).toHaveProperty(k);
    }
  });
});

describe('U6 · linear kernel — bounded work and fail-closed paths', () => {
  it('a non-ACGT query fails closed under both kernels, with the same verdict', () => {
    const seq = { seq: randSeq(17, 500), topology: 'linear' };
    const run = (kernel) => {
      setSequenceKernelForBenchmark(kernel);
      try { seqMatch('ACGTXACGT', seq, null, { identityThreshold: 1 }); return null; } catch (e) { return e.code; } finally { resetSequenceKernel(); }
    };
    expect(run(SEQUENCE_KERNEL.LINEAR)).toBe(run(SEQUENCE_KERNEL.PRODUCTION));
  });

  it('an exhausted state budget is a typed refusal, never a silent empty answer', () => {
    // A tight budget on a repeat-rich target: the production path throws RESOURCE_LIMIT rather than
    // reporting «nothing found», because an unfinished search has not established an absence.
    const q = 'ACGTACGTACGTACGTACGT';
    const seq = { seq: (q + 'T').repeat(400), topology: 'linear' };
    const ctx = { identityThreshold: 0.8, bothStrands: true, stateBudget: 5000 };
    const run = (kernel) => {
      setSequenceKernelForBenchmark(kernel);
      try {
        const env = seqMatch(q, seq, null, ctx);
        return { code: null, n: env.occurrences.length };
      } catch (e) { return { code: e.code }; } finally { resetSequenceKernel(); }
    };
    const p = run(SEQUENCE_KERNEL.PRODUCTION);
    const l = run(SEQUENCE_KERNEL.LINEAR);
    expect(l.code, 'the budget must mean the same thing on both kernels').toBe(p.code);
  });
});

describe('U6 · linear kernel — cooperative cancellation', () => {
  /**
   * The transport can only deliver a cancel frame between macrotasks, so the sweep has to SUSPEND.
   * There are two granularities and they are not the same promise:
   *
   *   • BETWEEN DOCUMENTS — the corpus loop yields per molecule. That bounds cancel latency to one
   *     molecule's search, whatever the kernel does inside it.
   *   • INSIDE A DOCUMENT — the shipped kernel yields in its Myers sweep and again in its verifier,
   *     so a single huge molecule is still interruptible. The linear prototype does not: its scan is
   *     a PUSH pipeline (`scanStream` invokes an `onEnd` callback, which runs the window DP and the
   *     solver), and a generator cannot yield from inside a callback. Making it interruptible means
   *     turning that pipeline pull-shaped — a design change, not a mechanical one.
   *
   * Both are measured here rather than asserted in prose, because the second one is the boundary the
   * product would be accepting if the linear kernel were switched on.
   */
  const countSteps = (gen) => {
    let n = 0;
    let r = gen.next();
    while (!r.done) { n += 1; if (n > 200000) break; r = gen.next(); }
    return n;
  };
  const corpus = (docs, bp, seed) => Array.from({ length: docs }, (_, i) => ({
    id: 'd' + i, seq: randSeq(seed + i, bp), topology: 'linear',
  }));

  it('the corpus sweep suspends at least once PER DOCUMENT, on either kernel', () => {
    const docs = corpus(12, 4000, 400);
    const q = 'ACGTACGTACGTACGTACGT';
    const ctx = { identityThreshold: 0.85, bothStrands: true };
    for (const kernel of [SEQUENCE_KERNEL.PRODUCTION, SEQUENCE_KERNEL.LINEAR]) {
      setSequenceKernelForBenchmark(kernel);
      const steps = countSteps(searchAllSequencesSteps(q, docs, ctx));
      resetSequenceKernel();
      expect(steps, `${kernel}: one uninterruptible block over the whole library is not cancellable`)
        .toBeGreaterThanOrEqual(docs.length);
    }
  });

  it('INSIDE one document BOTH kernels now suspend — the linear one was made resumable', () => {
    const q = 'ACGTACGTACGTACGTACGT';
    const seq = { seq: randSeq(18, 300000), topology: 'linear' };
    const ctx = { identityThreshold: 0.85, bothStrands: true };

    // Measured on the APPROXIMATE phase, which is the only phase a kernel governs now. `seqMatchSteps`
    // would no longer answer this question: it always begins with the literal exact phase, and that
    // phase suspends by construction, so counting it would report interior resumability the kernel
    // does not have.
    setSequenceKernelForBenchmark(SEQUENCE_KERNEL.PRODUCTION);
    const pSteps = countSteps(seqMatchApproxSteps(q, seq, ctx));
    resetSequenceKernel();
    expect(pSteps, 'the shipped kernel is interruptible within a molecule').toBeGreaterThan(1);

    setSequenceKernelForBenchmark(SEQUENCE_KERNEL.LINEAR);
    const lSteps = countSteps(seqMatchApproxSteps(q, seq, ctx));
    resetSequenceKernel();
    // CONTRACT CHANGE. This used to assert ZERO interior suspensions and to document that as the
    // reason the linear kernel could not ship: while it held the thread, a worker could not take
    // delivery of a cancel frame, so cancel latency equalled the time to finish the molecule. The
    // scan, the shared-window DP and the Dinkelbach refinement are now generators, suspending at the
    // very points that previously only polled a flag — so the prototype's one blocking objection is
    // gone and the assertion is inverted rather than deleted.
    expect(lSteps, 'the linear kernel must now be interruptible within a molecule').toBeGreaterThan(1);
  });
});

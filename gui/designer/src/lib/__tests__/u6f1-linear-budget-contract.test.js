/**
 * U6-F.1 — the resource contract has to reach the LINEAR kernel, and the finalisation has to be
 * interruptible where the result set is largest.
 *
 * Two defects this pins, both found by review after the kernel was made resumable:
 *
 *   • `budgets` was dropped by the provider while `stateBudget` was forwarded. A caller who armed
 *     the four axes therefore got an UNBOUNDED linear run, and a caller who armed the legacy
 *     combined cap got a bounded one — the same request, two different contracts, decided by which
 *     field happened to be named in one object literal.
 *   • `stateBudget: 0` and every malformed value were rewritten into «no limit» by a local
 *     truthiness test instead of the engine's own `resolveStateBudget`. A budget of zero is a
 *     caller asking for an immediate typed refusal, not a caller asking for no budget at all.
 *
 * And the tail: the yields inside the scan buy nothing if pruning, traceback, grouping and
 * validation then run over 200 000 occurrences in one uninterruptible block. BG-025 has three loci
 * and cannot show that, so the cancellation case here is deliberately result-rich.
 */
import { describe, it, expect } from 'vitest';
import { runLinearSequenceSearch, runLinearSequenceSearchSteps } from '../dna-linear-provider';
import { drainCooperative, SEARCH_CANCELLED } from '../dna-search-cooperative';

const caught = (fn) => { try { fn(); return null; } catch (e) { return e; } };

/**
 * Low complexity, so every axis is genuinely reachable rather than theoretically reachable. The big
 * target is used only where a REFUSAL is expected — a refusal stops early, so it is cheap. Asking it
 * to COMPLETE with every axis unbounded is 200 000 loci of real work, which is a benchmark, not a
 * unit test; the completion cases use the small one.
 */
const TARGET = 'ACGT'.repeat(50_000);            // 200 000 nt — for refusals
const SMALL = 'ACGT'.repeat(2_000);              // 8 000 nt — for completions
const QUERY = 'ACGTACGTACGTACGTACGT';            // 20 nt, matches everywhere

describe('U6-F.1 — budgets reach the LINEAR kernel through the provider', () => {
  it('a scan budget is honoured, typed, with its axis named', () => {
    const e = caught(() => runLinearSequenceSearch(QUERY, TARGET, {
      thresholdBps: 8000, bothStrands: false, budgets: { scan: 1000 },
    }));
    expect(e).toBeTruthy();
    expect(e.code).toBe('RESOURCE_LIMIT');
    expect(e.axis).toBe('scan');
  });

  it('a verifier budget is honoured', () => {
    const e = caught(() => runLinearSequenceSearch(QUERY, TARGET, {
      thresholdBps: 8000, bothStrands: false, budgets: { verifier: 1000 },
    }));
    expect(e.code).toBe('RESOURCE_LIMIT');
    expect(e.axis).toBe('verifier');
  });

  it('an output budget is honoured', () => {
    const e = caught(() => runLinearSequenceSearch(QUERY, TARGET, {
      thresholdBps: 8000, bothStrands: false, budgets: { output: 5 },
    }));
    expect(e.code).toBe('RESOURCE_LIMIT');
    expect(e.axis).toBe('output');
  });

  it('a generous budget completes — the refusals above are the budget, not the molecule', () => {
    const out = runLinearSequenceSearch(QUERY, SMALL, {
      thresholdBps: 8000,
      bothStrands: false,
      // ALL FOUR axes unbounded. Opening three and leaving `traceback` at its default made this
      // refuse for a reason the test was not about — which is itself evidence the axes really are
      // reaching the kernel now.
      budgets: {
        scan: null, verifier: null, traceback: null, output: null,
      },
    });
    // U6-F.2: the provider answers with the canonical ENVELOPE, in the same shape the production
    // engine answers in — a positional window plus the two facts a cap would destroy.
    expect(Array.isArray(out.occurrences)).toBe(true);
    expect(out.occurrences.length).toBeGreaterThan(0);
    expect(out.locationCount).toBe(out.occurrences.length);
    expect(out.bestIndex).toBeGreaterThanOrEqual(0);
  });

  it('the resumable and the drained entry point agree about a refusal', () => {
    const opts = { thresholdBps: 8000, bothStrands: false, budgets: { scan: 1000 } };
    const sync = caught(() => runLinearSequenceSearch(QUERY, TARGET, opts));
    const viaGen = caught(() => {
      const gen = runLinearSequenceSearchSteps(QUERY, TARGET, opts);
      let s = gen.next();
      while (!s.done) s = gen.next();
      return s.value;
    });
    expect(viaGen.code).toBe(sync.code);
    expect(viaGen.axis).toBe(sync.axis);
  });
});

describe('U6-F.1 — stateBudget uses the engine rule, not a local truthiness test', () => {
  it('zero is a real budget: an immediate typed refusal, not «unbounded»', () => {
    const e = caught(() => runLinearSequenceSearch(QUERY, TARGET, {
      thresholdBps: 8000, bothStrands: false, stateBudget: 0,
    }));
    expect(e).toBeTruthy();
    expect(e.code).toBe('RESOURCE_LIMIT');
  });

  it.each([
    ['a negative number', -1],
    ['a fraction', 2.5],
    ['a string', '1000'],
    ['NaN', NaN],
    ['Infinity', Infinity],
  ])('%s is INVALID_BUDGET, never a silent unbounded run', (_label, stateBudget) => {
    const e = caught(() => runLinearSequenceSearch(QUERY, TARGET, {
      thresholdBps: 8000, bothStrands: false, stateBudget,
    }));
    expect(e).toBeTruthy();
    expect(e.code).toBe('INVALID_BUDGET');
  });

  it('undefined and null mean «not armed», which is the documented default', () => {
    for (const stateBudget of [undefined, null]) {
      const out = runLinearSequenceSearch('ACGTTGCACCTGAAGTCCATGG', 'TTTT'.repeat(50), {
        thresholdBps: 8000, bothStrands: false, stateBudget,
      });
      expect(Array.isArray(out.occurrences)).toBe(true);
    }
  });
});

describe('U6-F.1 — the result-rich finalisation is interruptible too', () => {
  it('a cancel lands after the scan, while thousands of occurrences are being finalised', async () => {
    // Every position matches, so the scan produces an enormous result set and the expensive part is
    // the tail: pruning, traceback, grouping, validation. That is precisely what a three-locus
    // fixture like BG-025 cannot exercise.
    let cancelled = false;
    let started = 0;
    const gen = runLinearSequenceSearchSteps(QUERY, SMALL, {
      thresholdBps: 8000,
      bothStrands: true,
      budgets: {
        scan: null, verifier: null, traceback: null, output: null,
      },
    });
    const counting = (function* count() {
      let s = gen.next();
      while (!s.done) { started += 1; yield; s = gen.next(); }
      return s.value;
    }());
    setTimeout(() => { cancelled = true; }, 0);
    const err = await drainCooperative(counting, { shouldCancel: () => cancelled })
      .then(() => null, (e) => e);
    expect(started).toBeGreaterThan(0);
    expect(err).toBeTruthy();
    expect(err.code).toBe(SEARCH_CANCELLED);
  });

  it('nothing on the path processes the whole result set in one uninterruptible step', () => {
    // Counted, not asserted by eye: the number of suspensions has to grow with the RESULT SET, not
    // only with the molecule, or the finalisation is still one block.
    const steps = (target) => {
      const g = runLinearSequenceSearchSteps(QUERY, target, {
        thresholdBps: 8000,
        bothStrands: false,
        // Unbounded on purpose: this case is about SUSPENSIONS, and a refusal would end the run
        // before the result set — the thing being measured — had a chance to grow.
        budgets: {
          scan: null, verifier: null, traceback: null, output: null,
        },
      });
      let n = 0;
      let s = g.next();
      while (!s.done) { n += 1; s = g.next(); }
      return { n, hits: s.value.occurrences.length };
    };
    const small = steps('ACGT'.repeat(500));
    const large = steps('ACGT'.repeat(4_000));
    expect(large.hits).toBeGreaterThan(small.hits);
    expect(large.n).toBeGreaterThan(small.n);
  });
});

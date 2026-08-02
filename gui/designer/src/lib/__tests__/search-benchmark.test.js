/**
 * search-benchmark — P1.5 worker-decision harness (not a correctness test).
 *
 * Times the real search over a realistic corpus (100 × 10 kb ≈ 1 MB) to decide
 * whether the sequence dimension must move to a worker (>50 ms on the main thread)
 * or can stay main-thread + debounce. Logs numbers; asserts only that it ran.
 *
 * MEASURED DECISION (12.07, 1 MB corpus, the pre-K3 two-engine implementation):
 *   metadata               ≈  2.5 ms   → stays main-thread (instant).
 *   short-seq 22nt (exhaustive) ≈ 385 ms → over the 50 ms gate ×7.7.
 *   long-seq 400nt (seed-extend) ≈ 408 ms → over the gate ×8.2.
 * ⇒ WORKER REQUIRED for the sequence dimension (metadata stays sync). That decision has since
 *   SHIPPED (the sequence dimension runs off-thread), so this file is now a profile, not a gate.
 *
 * K3 replaced both engines with one glocal aligner, and a 400-nt query over this corpus currently
 * ends in `RESOURCE_LIMIT` rather than completing — the open K3.1 performance item. The harness
 * REPORTS that outcome instead of crashing on it: an honest «incomplete» is the measurement. It
 * still asserts nothing about timing (a wall-clock assertion would be flaky under load).
 */
import { describe, it, expect } from 'vitest';
import { runSearch } from '../library-search';
import { classifyQuery } from '../query-classify';
import { seqMatch } from '../seq-match';

const BASES = 'ACGT';
function randSeq(n) {
  let s = '';
  for (let i = 0; i < n; i += 1) s += BASES[(Math.random() * 4) | 0];
  return s;
}

function makeCorpus(count, len) {
  const docs = [];
  for (let i = 0; i < count; i += 1) {
    const seq = randSeq(len);
    docs.push({
      ref: { kind: 'entry', id: `e${i}` },
      title: `plasmid-${i}`,
      textFields: { name: `plasmid-${i}`, tags: ['bacterial', 'ampR'], status: 'release' },
      topology: i % 2 ? 'circular' : 'linear',
      sequence: { seq, topology: i % 2 ? 'circular' : 'linear' },
      features: [{ id: `f${i}`, name: 'AmpR', type: 'CDS', start: 10, end: 200 }],
    });
  }
  return docs;
}

/** Time `fn`, and record WHY it stopped — a run that bailed on the resource budget is a real
 * measurement, not an error to swallow. Returns `{ ms, reason }`; `reason` is null on success. */
function timeMs(fn) {
  const t0 = performance.now();
  let reason = null;
  try { fn(); } catch (e) { reason = e?.code || 'ERROR'; }
  return { ms: performance.now() - t0, reason };
}
const fmt = (r) => `${r.ms.toFixed(1)}ms${r.reason ? ` (${r.reason})` : ''}`;

describe('search benchmark — worker decision (P1.5)', () => {
  it('measures metadata + sequence search over ~1 MB', () => {
    const docs = makeCorpus(100, 10000);
    const bytes = docs.reduce((n, d) => n + d.sequence.seq.length, 0);

    // Pick a real 22-nt motif out of the first doc so it actually hits.
    const motif = docs[0].sequence.seq.slice(500, 522);

    const metadata = timeMs(() => runSearch(classifyQuery('plasmid ampR'), docs, { seqMatch }));
    const shortSeq = timeMs(() => runSearch(classifyQuery(`seq:${motif}`), docs, { seqMatch }));
    const longSeq = timeMs(() => runSearch(classifyQuery(docs[0].sequence.seq.slice(0, 400)), docs, { seqMatch }));

    // eslint-disable-next-line no-console
    console.log(`[BENCH] corpus=${(bytes / 1e6).toFixed(2)}MB  metadata=${fmt(metadata)}  short-seq(22nt)=${fmt(shortSeq)}  long-seq(400nt)=${fmt(longSeq)}  GATE=50ms`);

    expect(bytes).toBeGreaterThan(900000);
    // Metadata is the one dimension that must always complete — it is what keeps the box usable
    // while the sequence dimension is still working off-thread.
    expect(metadata.reason).toBeNull();
    expect(Number.isFinite(metadata.ms)).toBe(true);
    // An explicit budget because this deliberately profiles a 1 MB corpus: on its own it takes
    // ~2-4 s, which races the 5 s default and times out inside a loaded full run. The number is
    // a declaration that the harness is long-running — no assertion above is relaxed by it, and
    // it must never be raised to make a slow ENGINE look acceptable (that gate is K3.1's).
  }, 120_000);
});
